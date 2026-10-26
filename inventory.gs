// ===== 在庫・発注管理（hacchu.html / レジの備品チェック 用） =====
// 使い方:
//   doPost の先頭付近に   var ri = handleInvPost(d); if (ri) return ri;
//   doGet  の先頭に       if (e && e.parameter && /^inv_/.test(String(e.parameter.mode||""))) return handleInvGet(e);
// シート: 購入品目（既存に列を追加）/ 在庫記録 / 発注 / 備品報告（自動作成）
// 認証: STAFFアプリのログイントークン（ORION_STAFF のセッションシート）か、レジの店用キー（注文設定）
var INV_ITEM_SHEET = "購入品目";
var INV_LOG_SHEET = "在庫記録";
var INV_ORDER_SHEET = "発注";
var INV_REPORT_SHEET = "備品報告";
var INV_STAFF_SS = "1L4Y4tIFWfmUTSvngiXNd-Afxq1IqAwmAZNIUM2qyBD8"; // ORION_STAFF
var INV_CHEF_NAMES = ["久田"]; // シェフ扱いの名前（ホームで食材入力を先に出す）
// 購入品目の列（既存10列 + 追加13列）。既存の列名は変えない
var INV_COLS = ["品目","仕入先","区分","規格(入数など)","仕入単価(税込)","1単位あたり","用途(商品)","発注の目安","最終更新日","備考",
  "item_id","購入方法","発注単位","入力単位","担当","管理頻度","最低在庫","発注方式","配送・納期","現在庫","在庫更新日時","状態","表示順"];
var INV_LOG_COLS = ["日時","日付","item_id","品目","種別","数量","状態","担当","記録者","備考"];
var INV_ORDER_COLS = ["order_id","作成日時","仕入先","item_id","品目","数量","単位","状態","発注日","納品予定","納品数","納品日時","記録者","備考"];
var INV_REPORT_COLS = ["report_id","日時","item_id","品目","種別","数量","メモ","記録者","状態","対応日時","対応者"];

function invOut_(o){ return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function invNow_(){ return Utilities.formatDate(new Date(), "Asia/Tokyo", "yyyy/MM/dd HH:mm:ss"); }
function invToday_(){ return Utilities.formatDate(new Date(), "Asia/Tokyo", "yyyy/MM/dd"); }
function invId_(p){ return p + Utilities.getUuid().replace(/-/g,"").slice(0,10); }
function invSheet_(name, cols){
  var ss = SpreadsheetApp.getActiveSpreadsheet(); var sh = ss.getSheetByName(name);
  if (!sh){ sh = ss.insertSheet(name); sh.getRange(1,1,1,cols.length).setValues([cols]).setFontWeight("bold"); sh.setFrozenRows(1); return sh; }
  // 足りない列を右に追加
  var last = Math.max(1, sh.getLastColumn()); var hdr = sh.getRange(1,1,1,last).getValues()[0].map(String);
  var add = cols.filter(function(c){ return hdr.indexOf(c) < 0; });
  if (add.length){ sh.getRange(1, last+1, 1, add.length).setValues([add]).setFontWeight("bold"); }
  return sh;
}
function invRows_(sh){
  var last = sh.getLastRow(); if (last < 2) return [];
  var lc = sh.getLastColumn(); var hdr = sh.getRange(1,1,1,lc).getValues()[0].map(String);
  var v = sh.getRange(2,1,last-1,lc).getValues(); var out = [];
  for (var i=0;i<v.length;i++){ if (String(v[i][0])==="" && String(v[i][1])==="") continue; var o = {_row:i+2}; for (var j=0;j<hdr.length;j++){ var x = v[i][j]; if (x instanceof Date) x = Utilities.formatDate(x, "Asia/Tokyo", "yyyy/MM/dd HH:mm:ss"); o[hdr[j]] = x; } out.push(o); }
  return out;
}
function invSet_(sh, row, col, val){ var lc = sh.getLastColumn(); var hdr = sh.getRange(1,1,1,lc).getValues()[0].map(String); var c = hdr.indexOf(col); if (c < 0) throw new Error("列がありません: "+col); sh.getRange(row, c+1).setValue(val); }
function invAppend_(sh, obj){ var lc = sh.getLastColumn(); var hdr = sh.getRange(1,1,1,lc).getValues()[0].map(String); sh.appendRow(hdr.map(function(h){ return obj[h]!==undefined ? obj[h] : ""; })); }

// ---- 認証 ----
function invStoreKey_(){ try{ var cfg = orderCfg_(); return String(cfg["店用キー"]||""); }catch(e){ return ""; } }
function invAuth_(p){
  // 戻り値: {name, role:"admin"|"staff"|"store", staff_id} / null
  if (p.key && invStoreKey_() && String(p.key) === invStoreKey_()) return { name: String(p.by||"店舗"), role: "store", staff_id: "" };
  var tk = String(p.token||""); if (!tk) return null;
  var cache = CacheService.getScriptCache(); var c = cache.get("inv_tok:"+tk); if (c) return JSON.parse(c);
  try {
    var ss = SpreadsheetApp.openById(INV_STAFF_SS);
    var ses = invRows_(ss.getSheetByName("セッション")).filter(function(r){ return String(r.token)===tk; })[0]; if (!ses) return null;
    if (ses["期限"] && new Date(ses["期限"]) < new Date()) return null;
    var st = invRows_(ss.getSheetByName("スタッフ")).filter(function(r){ return r.staff_id===ses.staff_id; })[0]; if (!st) return null;
    var me = { name: String(st["名前"]), role: String(ses.role||st["役割"]||"staff"), staff_id: ses.staff_id };
    cache.put("inv_tok:"+tk, JSON.stringify(me), 300); return me;
  } catch(e){ return null; }
}

// ---- マスター ----
function invMaster_(){
  var sh = invSheet_(INV_ITEM_SHEET, INV_COLS); var rows = invRows_(sh); var changed = false;
  rows.forEach(function(r){ if (!r.item_id){ var id = invId_("i_"); invSet_(sh, r._row, "item_id", id); r.item_id = id; changed = true; } });
  return rows.filter(function(r){ return String(r["状態"]||"") !== "stop" && String(r["品目"]||"") !== ""; }).map(function(r){
    return { id: r.item_id, name: String(r["品目"]), cat: String(r["区分"]||""), supplier: String(r["仕入先"]||""), method: String(r["購入方法"]||""), spec: String(r["規格(入数など)"]||""),
      price: r["仕入単価(税込)"]===""?null:Number(r["仕入単価(税込)"]), orderUnit: String(r["発注単位"]||""), unit: String(r["入力単位"]||""), owner: String(r["担当"]||""), freq: String(r["管理頻度"]||""),
      min: r["最低在庫"]===""?null:Number(String(r["最低在庫"]).replace(/[^\d.]/g,""))||0, mode: String(r["発注方式"]||""), lead: String(r["配送・納期"]||""), use: String(r["用途(商品)"]||""),
      stock: r["現在庫"]===""?null:Number(r["現在庫"]), stockAt: String(r["在庫更新日時"]||""), order: Number(r["表示順"])||999, note: String(r["備考"]||"") };
  }).sort(function(a,b){ return a.order-b.order || (a.cat<b.cat?-1:1); });
}
function invSuppliers_(){ try{ var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("仕入先"); if (!sh) return []; return invRows_(sh).map(function(r){ var o={}; Object.keys(r).forEach(function(k){ if(k!=="_row") o[k]=String(r[k]); }); return o; }); }catch(e){ return []; } }
function invLastChecks_(){
  // 担当ごとの最終記録（日付・記録者）
  var sh = invSheet_(INV_LOG_SHEET, INV_LOG_COLS); var rows = invRows_(sh); var out = {};
  rows.forEach(function(r){ var k = String(r["担当"]||""); var d = String(r["日時"]||""); if (!out[k] || d > out[k].at) out[k] = { at: d, date: String(r["日付"]||d.slice(0,10)), by: String(r["記録者"]||"") }; });
  return out;
}
function invOpenOrders_(){ var sh = invSheet_(INV_ORDER_SHEET, INV_ORDER_COLS); return invRows_(sh).filter(function(r){ return r["状態"]==="発注済" || r["状態"]==="候補"; }); }

// ---- 発注候補（第1段階：単純式）----
// 必要量 = 最低在庫 − 現在庫 − 入荷予定（発注済で未納品）。発注単位で切り上げ（規格の入数は未登録なら1）
function invSuggest_(){
  var items = invMaster_(); var open = invOpenOrders_(); var out = [];
  items.forEach(function(it){
    if (!it.mode || it.mode === "—" || /台帳|簡易|定期/.test(it.mode)) return;
    if (it.min === null) return;
    var pending = open.filter(function(o){ return o.item_id===it.id && o["状態"]==="発注済"; }).reduce(function(s,o){ return s + (Number(o["数量"])||0); }, 0);
    var stock = it.stock === null ? null : it.stock;
    var reason = "";
    if (stock === null){ return; }
    if (stock + pending < it.min){ reason = "最低在庫 " + it.min + it.unit + " を下回る（現在庫 " + stock + (pending?"＋入荷予定 "+pending:"") + "）"; }
    else return;
    var qty = Math.max(1, Math.ceil((it.min - stock - pending) / 1));
    out.push({ id: it.id, name: it.name, supplier: it.supplier, method: it.method, lead: it.lead, unit: it.unit, orderUnit: it.orderUnit, spec: it.spec, stock: stock, min: it.min, pending: pending, qty: qty, reason: reason });
  });
  return out;
}

// ---- GET ----
function handleInvGet(e){
  var p = e.parameter; var res;
  try {
    var me = invAuth_(p); if (!me) return invOut_({ error: "auth" });
    if (p.mode === "inv_master"){ res = { items: invMaster_(), suppliers: invSuppliers_(), lastChecks: invLastChecks_(), me: me, chefNames: INV_CHEF_NAMES }; }
    else if (p.mode === "inv_home"){
      var items = invMaster_(); var last = invLastChecks_(); var open = invOpenOrders_();
      var rep = invRows_(invSheet_(INV_REPORT_SHEET, INV_REPORT_COLS)).filter(function(r){ return r["状態"]!=="対応済"; });
      var today = invToday_();
      res = { me: me, chefNames: INV_CHEF_NAMES, items: items, lastChecks: last, suggest: invSuggest_(),
        orders: open.map(invOrderOut_), reports: rep.map(invReportOut_), today: today,
        deliveriesToday: open.filter(function(o){ return o["状態"]==="発注済" && String(o["納品予定"]||"").slice(0,10)===today; }).map(invOrderOut_) };
    }
    else if (p.mode === "inv_orders"){ var sh = invSheet_(INV_ORDER_SHEET, INV_ORDER_COLS); var all = invRows_(sh); res = { orders: all.slice(-200).map(invOrderOut_) }; }
    else if (p.mode === "inv_log"){ var lg = invRows_(invSheet_(INV_LOG_SHEET, INV_LOG_COLS)); var id = String(p.item_id||""); res = { log: lg.filter(function(r){ return !id || r.item_id===id; }).slice(-100).map(function(r){ return { at:r["日時"], id:r.item_id, name:r["品目"], kind:r["種別"], qty:r["数量"], state:r["状態"], by:r["記録者"] }; }) }; }
    else if (p.mode === "inv_reports"){ res = { reports: invRows_(invSheet_(INV_REPORT_SHEET, INV_REPORT_COLS)).slice(-100).map(invReportOut_) }; }
    else res = { error: "mode" };
  } catch(err){ res = { error: String(err) }; }
  return invOut_(res);
}
function invOrderOut_(o){ return { id:o.order_id, at:o["作成日時"], supplier:o["仕入先"], item_id:o.item_id, name:o["品目"], qty:Number(o["数量"])||0, unit:o["単位"], status:o["状態"], orderedAt:o["発注日"], eta:String(o["納品予定"]||"").slice(0,10), received:o["納品数"], receivedAt:o["納品日時"], by:o["記録者"], note:o["備考"] }; }
function invReportOut_(r){ return { id:r.report_id, at:r["日時"], item_id:r.item_id, name:r["品目"], kind:r["種別"], qty:r["数量"], memo:r["メモ"], by:r["記録者"], status:r["状態"], doneAt:r["対応日時"], doneBy:r["対応者"] }; }

// ---- POST ----
function handleInvPost(d){
  if (!d || !/^inv_/.test(String(d.type||""))) return null;
  var res;
  try {
    var me = invAuth_(d); if (!me) return invOut_({ error: "auth" });
    var lock = LockService.getScriptLock(); lock.waitLock(10000);
    try {
      if (d.type === "inv_stock") res = invStock_(d, me);
      else if (d.type === "inv_order_create") res = invOrderCreate_(d, me);
      else if (d.type === "inv_order_update") res = invOrderUpdate_(d, me);
      else if (d.type === "inv_report") res = invReport_(d, me);
      else if (d.type === "inv_report_done") res = invReportDone_(d, me);
      else if (d.type === "inv_master_save") res = invMasterSave_(d, me);
      else res = { error: "type" };
    } finally { lock.releaseLock(); }
  } catch(err){ res = { error: String(err) }; }
  return invOut_(res);
}
// 在庫記録：entries = [{item_id, qty}] または [{item_id, state:"十分|少|無"}]
function invStock_(d, me){
  var entries = Array.isArray(d.entries) ? d.entries : []; if (!entries.length) return { error: "entries" };
  var sh = invSheet_(INV_ITEM_SHEET, INV_COLS); var rows = invRows_(sh); var byId = {}; rows.forEach(function(r){ byId[r.item_id] = r; });
  var log = invSheet_(INV_LOG_SHEET, INV_LOG_COLS); var now = invNow_(), today = invToday_(); var n = 0;
  entries.forEach(function(en){
    var r = byId[en.item_id]; if (!r) return;
    var isState = en.state !== undefined && en.state !== null && en.state !== "";
    var qty = isState ? "" : Number(en.qty); if (!isState && isNaN(qty)) return;
    invAppend_(log, { "日時": now, "日付": today, item_id: r.item_id, "品目": r["品目"], "種別": isState?"state":"count", "数量": isState?"":qty, "状態": isState?String(en.state):"", "担当": String(d.owner||r["担当"]||""), "記録者": String(d.by||me.name), "備考": String(en.note||"") });
    if (!isState){ invSet_(sh, r._row, "現在庫", qty); invSet_(sh, r._row, "在庫更新日時", now); }
    else {
      // 3択は「最低在庫」に対する目安として現在庫を置き換える（少=最低在庫の半分、無=0、十分=最低在庫×2 または据え置き）
      var min = Number(String(r["最低在庫"]).replace(/[^\d.]/g,""))||0; var v = en.state==="無" ? 0 : en.state==="少" ? Math.floor(min/2) : Math.max(min*2, Number(r["現在庫"])||0);
      invSet_(sh, r._row, "現在庫", v); invSet_(sh, r._row, "在庫更新日時", now);
    }
    n++;
  });
  return { ok: true, saved: n, suggest: invSuggest_(), lastChecks: invLastChecks_() };
}
// 発注：items = [{item_id, qty, eta?, note?}] → 状態=発注済（候補として置くだけなら status:"候補"）
function invOrderCreate_(d, me){
  if (!(me.role==="admin" || me.role==="staff")) return { error: "forbidden" };
  var items = Array.isArray(d.items) ? d.items : []; if (!items.length) return { error: "items" };
  var master = invMaster_(); var byId = {}; master.forEach(function(it){ byId[it.id]=it; });
  var sh = invSheet_(INV_ORDER_SHEET, INV_ORDER_COLS); var now = invNow_(); var ids = [];
  items.forEach(function(x){ var it = byId[x.item_id]; if (!it) return; var id = invId_("o_"); ids.push(id);
    invAppend_(sh, { order_id:id, "作成日時":now, "仕入先": x.supplier||it.supplier, item_id:it.id, "品目":it.name, "数量":Number(x.qty)||0, "単位": x.unit||it.orderUnit||it.unit, "状態": d.status==="候補"?"候補":"発注済", "発注日": d.status==="候補"?"":now.slice(0,10), "納品予定": String(x.eta||d.eta||""), "納品数":"", "納品日時":"", "記録者": me.name, "備考": String(x.note||"") }); });
  return { ok: true, ids: ids };
}
// 発注の更新：status（発注済/納品済/取消）、received（納品数）、eta
function invOrderUpdate_(d, me){
  var sh = invSheet_(INV_ORDER_SHEET, INV_ORDER_COLS); var o = invRows_(sh).filter(function(r){ return r.order_id===d.order_id; })[0]; if (!o) return { error: "見つかりません" };
  if (d.eta !== undefined) invSet_(sh, o._row, "納品予定", String(d.eta));
  if (d.qty !== undefined) invSet_(sh, o._row, "数量", Number(d.qty)||0);
  if (d.note !== undefined) invSet_(sh, o._row, "備考", String(d.note));
  if (d.status){
    invSet_(sh, o._row, "状態", String(d.status));
    if (d.status === "発注済" && !o["発注日"]) invSet_(sh, o._row, "発注日", invToday_());
    if (d.status === "納品済"){
      var rec = d.received !== undefined ? Number(d.received) : Number(o["数量"])||0;
      invSet_(sh, o._row, "納品数", rec); invSet_(sh, o._row, "納品日時", invNow_());
      // 検品した数量だけ在庫に加算（入力単位＝発注単位の換算は未登録なら1:1）
      var ish = invSheet_(INV_ITEM_SHEET, INV_COLS); var it = invRows_(ish).filter(function(r){ return r.item_id===o.item_id; })[0];
      if (it){ var per = Number(d.perUnit)||1; var cur = Number(it["現在庫"])||0; invSet_(ish, it._row, "現在庫", cur + rec*per); invSet_(ish, it._row, "在庫更新日時", invNow_());
        var log = invSheet_(INV_LOG_SHEET, INV_LOG_COLS); invAppend_(log, { "日時": invNow_(), "日付": invToday_(), item_id: it.item_id, "品目": it["品目"], "種別": "in", "数量": rec*per, "状態": "", "担当": "納品", "記録者": me.name, "備考": "納品 " + o.order_id + (rec !== (Number(o["数量"])||0) ? "（数量違い: 発注"+o["数量"]+"）" : "") }); }
    }
  }
  return { ok: true };
}
function invReport_(d, me){
  var sh = invSheet_(INV_REPORT_SHEET, INV_REPORT_COLS); var id = invId_("r_");
  var name = String(d.name||""); if (d.item_id){ var it = invMaster_().filter(function(x){ return x.id===d.item_id; })[0]; if (it) name = it.name; }
  invAppend_(sh, { report_id:id, "日時": invNow_(), item_id: String(d.item_id||""), "品目": name, "種別": String(d.kind||"不足"), "数量": d.qty!==undefined?Number(d.qty):"", "メモ": String(d.memo||""), "記録者": String(d.by||me.name), "状態": "未対応", "対応日時":"", "対応者":"" });
  return { ok: true, id: id };
}
function invReportDone_(d, me){ var sh = invSheet_(INV_REPORT_SHEET, INV_REPORT_COLS); var r = invRows_(sh).filter(function(x){ return x.report_id===d.report_id; })[0]; if (!r) return { error: "見つかりません" }; invSet_(sh, r._row, "状態", d.undo?"未対応":"対応済"); invSet_(sh, r._row, "対応日時", d.undo?"":invNow_()); invSet_(sh, r._row, "対応者", d.undo?"":me.name); return { ok: true }; }
// マスター編集（管理者）。item_id があれば更新、なければ追加。fields はシートの列名そのまま
function invMasterSave_(d, me){
  if (me.role !== "admin") return { error: "管理者のみ" };
  var sh = invSheet_(INV_ITEM_SHEET, INV_COLS); var f = d.fields || {}; var rows = invRows_(sh);
  var allowed = INV_COLS.filter(function(c){ return c !== "item_id"; });
  if (d.item_id){ var r = rows.filter(function(x){ return x.item_id===d.item_id; })[0]; if (!r) return { error: "見つかりません" };
    Object.keys(f).forEach(function(k){ if (allowed.indexOf(k)>=0) invSet_(sh, r._row, k, f[k]); }); invSet_(sh, r._row, "最終更新日", invToday_()); return { ok: true, item_id: d.item_id }; }
  if (!f["品目"]) return { error: "品目がありません" };
  if (rows.some(function(x){ return String(x["品目"])===String(f["品目"]); })) return { error: "同じ品目があります" };
  var obj = {}; allowed.forEach(function(k){ if (f[k]!==undefined) obj[k]=f[k]; }); obj.item_id = invId_("i_"); obj["最終更新日"] = invToday_(); obj["状態"] = obj["状態"] || "active";
  invAppend_(sh, obj); return { ok: true, item_id: obj.item_id };
}

// ---- 初期データ投入（エディタから1回だけ実行）。既存行は上書きせず、空欄だけ埋める。無い品目は追加 ----
function invSeedMaster(){
  var seed = INV_SEED; var sh = invSheet_(INV_ITEM_SHEET, INV_COLS); var rows = invRows_(sh); var byName = {}; rows.forEach(function(r){ byName[String(r["品目"]).trim()] = r; });
  var alias = { "スパゲッティ(乾麺)": "スパゲッティ(乾麺)", "ケチャップ": "ケチャップ(業務用)", "折箱": "容器(大)", "コカ・コーラ(瓶)": "コカ・コーラ(瓶)" };
  var added = 0, updated = 0, order = 1;
  seed.forEach(function(s){
    var name = s["品目"]; var r = byName[name];
    if (!r){ // 旧名の行を名寄せ
      Object.keys(alias).forEach(function(old){ if (alias[old]===name && byName[old]){ r = byName[old]; invSet_(sh, r._row, "品目", name); } });
    }
    if (r){ Object.keys(s).forEach(function(k){ if (k==="品目") return; if (String(r[k]||"")==="" && s[k]!=="") invSet_(sh, r._row, k, s[k]); }); if (!r["表示順"]) invSet_(sh, r._row, "表示順", order); if (!r["状態"]) invSet_(sh, r._row, "状態", "active"); updated++; }
    else { var obj = {}; Object.keys(s).forEach(function(k){ obj[k]=s[k]; }); obj.item_id = invId_("i_"); obj["状態"]="active"; obj["表示順"]=order; obj["最終更新日"]=invToday_(); invAppend_(sh, obj); added++; }
    order++;
  });
  Logger.log("added "+added+" / updated "+updated); return "added "+added+" / updated "+updated;
}

var INV_SEED = [
{
"品目": "スパゲッティ(乾麺)",
"仕入先": "トーホー",
"区分": "食材",
"規格(入数など)": "要確認(kg/箱)",
"用途(商品)": "オリオン・ナシナシ",
"備考": "既存行",
"購入方法": "システム発注",
"発注単位": "箱",
"入力単位": "kg",
"担当": "シェフ",
"管理頻度": "毎日",
"最低在庫": "5",
"発注方式": "数量提案",
"配送・納期": "月水金配送・前日17時締切(要確認)"
},
{
"品目": "ケチャップ(業務用)",
"仕入先": "トーホー",
"区分": "食材",
"規格(入数など)": "",
"用途(商品)": "ソース(1回仕込み6kg)",
"備考": "既存行",
"購入方法": "システム発注",
"発注単位": "本",
"入力単位": "本",
"担当": "シェフ",
"管理頻度": "毎日",
"最低在庫": "2",
"発注方式": "数量提案",
"配送・納期": "月水金配送"
},
{
"品目": "トマトピューレ",
"仕入先": "トーホー",
"区分": "食材",
"規格(入数など)": "",
"用途(商品)": "ソース(1回仕込み2kg)",
"備考": "",
"購入方法": "システム発注",
"発注単位": "缶",
"入力単位": "缶",
"担当": "シェフ",
"管理頻度": "毎日",
"最低在庫": "1",
"発注方式": "数量提案",
"配送・納期": "月水金配送"
},
{
"品目": "デミグラスソース",
"仕入先": "トーホー",
"区分": "食材",
"規格(入数など)": "",
"用途(商品)": "オリオン(1食30g)",
"備考": "",
"購入方法": "システム発注",
"発注単位": "缶",
"入力単位": "缶",
"担当": "シェフ",
"管理頻度": "毎日",
"最低在庫": "1",
"発注方式": "数量提案",
"配送・納期": "月水金配送"
},
{
"品目": "マッシュルーム",
"仕入先": "トーホー",
"区分": "食材",
"規格(入数など)": "",
"用途(商品)": "1セット4個",
"備考": "購入規格 未確定",
"購入方法": "システム発注",
"発注単位": "缶",
"入力単位": "缶",
"担当": "シェフ",
"管理頻度": "毎日",
"最低在庫": "2",
"発注方式": "数量提案",
"配送・納期": "月水金配送"
},
{
"品目": "卵",
"仕入先": "トーホー",
"区分": "食材",
"規格(入数など)": "90個",
"用途(商品)": "目玉焼き(店内オリオン通常のみ)",
"備考": "既存行は仕入先ハナマサ→トーホーに修正",
"購入方法": "システム発注",
"発注単位": "ケース",
"入力単位": "個",
"担当": "シェフ",
"管理頻度": "毎日",
"最低在庫": "30",
"発注方式": "数量提案",
"配送・納期": "月水金配送"
},
{
"品目": "サラダ油",
"仕入先": "トーホー",
"区分": "食材",
"規格(入数など)": "",
"用途(商品)": "全般",
"備考": "",
"購入方法": "システム発注",
"発注単位": "缶",
"入力単位": "缶",
"担当": "シェフ",
"管理頻度": "週次",
"最低在庫": "1",
"発注方式": "手動",
"配送・納期": "月水金配送"
},
{
"品目": "ハンバーグ",
"仕入先": "肉のハナマサ",
"区分": "食材",
"規格(入数など)": "26個/袋",
"用途(商品)": "オリオン(1食1個)",
"備考": "余剰注意の表示",
"購入方法": "定期配送",
"発注単位": "袋",
"入力単位": "個",
"担当": "シェフ",
"管理頻度": "毎日",
"最低在庫": "26",
"発注方式": "定期(月4袋・木4袋)",
"配送・納期": "月・木 入荷"
},
{
"品目": "ミートコロッケ",
"仕入先": "業務スーパーネット",
"区分": "食材",
"規格(入数など)": "10個/袋(ケース入数未確認)",
"用途(商品)": "オリオン(1食1個)",
"備考": "ケース入数・価格 未登録",
"購入方法": "ネット注文",
"発注単位": "ケース",
"入力単位": "個",
"担当": "シェフ",
"管理頻度": "毎日",
"最低在庫": "30",
"発注方式": "数量提案",
"配送・納期": "注文から最短3日"
},
{
"品目": "玉ねぎ",
"仕入先": "業務スーパーネット",
"区分": "食材",
"規格(入数など)": "500g×24袋/箱",
"用途(商品)": "共通具材",
"備考": "1セットあたりの使用量 未確定",
"購入方法": "ネット注文",
"発注単位": "箱",
"入力単位": "袋",
"担当": "シェフ",
"管理頻度": "毎日",
"最低在庫": "4",
"発注方式": "数量提案",
"配送・納期": "注文から最短3日"
},
{
"品目": "ピーマン",
"仕入先": "業務スーパーネット",
"区分": "食材",
"規格(入数など)": "500g×24袋/箱",
"用途(商品)": "共通具材",
"備考": "1セットあたりの使用量 未確定",
"購入方法": "ネット注文",
"発注単位": "箱",
"入力単位": "袋",
"担当": "シェフ",
"管理頻度": "毎日",
"最低在庫": "4",
"発注方式": "数量提案",
"配送・納期": "注文から最短3日"
},
{
"品目": "お徳用ウィンナー",
"仕入先": "業務スーパー",
"区分": "食材",
"規格(入数など)": "",
"用途(商品)": "1セット6切れ",
"備考": "ネット購入可否 未確認",
"購入方法": "店頭買い出し",
"発注単位": "袋",
"入力単位": "袋",
"担当": "シェフ",
"管理頻度": "毎日",
"最低在庫": "2",
"発注方式": "数量提案",
"配送・納期": "買い出し"
},
{
"品目": "コンデンスミルク",
"仕入先": "業務スーパー",
"区分": "食材",
"規格(入数など)": "",
"用途(商品)": "ソース(1回仕込み400g)",
"備考": "",
"購入方法": "店頭買い出し",
"発注単位": "本",
"入力単位": "本",
"担当": "シェフ",
"管理頻度": "週次",
"最低在庫": "1",
"発注方式": "手動",
"配送・納期": "買い出し"
},
{
"品目": "ダシダ(牛肉だし)",
"仕入先": "業務スーパー",
"区分": "食材",
"規格(入数など)": "",
"用途(商品)": "ソース(1回仕込み40g)",
"備考": "",
"購入方法": "店頭買い出し",
"発注単位": "袋",
"入力単位": "袋",
"担当": "シェフ",
"管理頻度": "週次",
"最低在庫": "1",
"発注方式": "手動",
"配送・納期": "買い出し"
},
{
"品目": "なめらかママソフト",
"仕入先": "業務スーパー",
"区分": "食材",
"規格(入数など)": "",
"用途(商品)": "1セット4g",
"備考": "",
"購入方法": "店頭買い出し",
"発注単位": "個",
"入力単位": "個",
"担当": "シェフ",
"管理頻度": "週次",
"最低在庫": "1",
"発注方式": "手動",
"配送・納期": "買い出し"
},
{
"品目": "茹で麺(仕込済)",
"仕入先": "",
"区分": "仕込",
"規格(入数など)": "",
"用途(商品)": "翌日分の仕込み",
"備考": "レジ在庫チェックから移管(数量管理のみ・発注なし)",
"購入方法": "",
"発注単位": "",
"入力単位": "玉",
"担当": "シェフ",
"管理頻度": "毎日",
"最低在庫": "15",
"発注方式": "",
"配送・納期": ""
},
{
"品目": "ソース(仕込済)",
"仕入先": "",
"区分": "仕込",
"規格(入数など)": "",
"用途(商品)": "翌日分の仕込み",
"備考": "レジ在庫チェックから移管",
"購入方法": "",
"発注単位": "",
"入力単位": "食",
"担当": "シェフ",
"管理頻度": "毎日",
"最低在庫": "15",
"発注方式": "",
"配送・納期": ""
},
{
"品目": "冷凍ストック麺",
"仕入先": "",
"区分": "仕込",
"規格(入数など)": "",
"用途(商品)": "予備",
"備考": "レジ在庫チェックから移管",
"購入方法": "",
"発注単位": "",
"入力単位": "玉",
"担当": "シェフ",
"管理頻度": "週次",
"最低在庫": "0",
"発注方式": "",
"配送・納期": ""
},
{
"品目": "コカ・コーラ(瓶)",
"仕入先": "カクヤス",
"区分": "飲料",
"規格(入数など)": "要確認(本/ケース)",
"用途(商品)": "瓶ドリンク",
"備考": "既存行",
"購入方法": "電話/Web",
"発注単位": "ケース",
"入力単位": "本",
"担当": "ホール",
"管理頻度": "週次",
"最低在庫": "6",
"発注方式": "最低在庫",
"配送・納期": "当日〜翌日配送"
},
{
"品目": "コカ・コーラ ゼロ(瓶)",
"仕入先": "カクヤス",
"区分": "飲料",
"規格(入数など)": "",
"用途(商品)": "瓶ドリンク",
"備考": "",
"購入方法": "電話/Web",
"発注単位": "ケース",
"入力単位": "本",
"担当": "ホール",
"管理頻度": "週次",
"最低在庫": "6",
"発注方式": "最低在庫",
"配送・納期": "当日〜翌日配送"
},
{
"品目": "ジンジャーエール(瓶)",
"仕入先": "カクヤス",
"区分": "飲料",
"規格(入数など)": "",
"用途(商品)": "瓶ドリンク",
"備考": "既存行",
"購入方法": "電話/Web",
"発注単位": "ケース",
"入力単位": "本",
"担当": "ホール",
"管理頻度": "週次",
"最低在庫": "6",
"発注方式": "最低在庫",
"配送・納期": "当日〜翌日配送"
},
{
"品目": "キリンラガー 小瓶",
"仕入先": "カクヤス",
"区分": "飲料",
"規格(入数など)": "",
"用途(商品)": "小瓶ビール",
"備考": "既存行。空瓶返却は今後",
"購入方法": "電話/Web",
"発注単位": "ケース",
"入力単位": "本",
"担当": "ホール",
"管理頻度": "週次",
"最低在庫": "6",
"発注方式": "最低在庫",
"配送・納期": "当日〜翌日配送"
},
{
"品目": "容器(大)",
"仕入先": "シモジマ",
"区分": "資材",
"規格(入数など)": "",
"用途(商品)": "持ち帰り(通常)",
"備考": "既存「折箱」を名寄せ。メニュー対応 未登録",
"購入方法": "",
"発注単位": "袋",
"入力単位": "枚",
"担当": "ホール",
"管理頻度": "週次",
"最低在庫": "10",
"発注方式": "最低在庫",
"配送・納期": ""
},
{
"品目": "容器(小)",
"仕入先": "シモジマ",
"区分": "資材",
"規格(入数など)": "",
"用途(商品)": "持ち帰り(ハーフ)",
"備考": "",
"購入方法": "",
"発注単位": "袋",
"入力単位": "枚",
"担当": "ホール",
"管理頻度": "週次",
"最低在庫": "10",
"発注方式": "最低在庫",
"配送・納期": ""
},
{
"品目": "持ち帰り袋",
"仕入先": "シモジマ",
"区分": "資材",
"規格(入数など)": "",
"用途(商品)": "持ち帰り",
"備考": "既存行",
"購入方法": "",
"発注単位": "袋",
"入力単位": "枚",
"担当": "ホール",
"管理頻度": "週次",
"最低在庫": "20",
"発注方式": "最低在庫",
"配送・納期": ""
},
{
"品目": "割り箸(持ち帰り用)",
"仕入先": "",
"区分": "資材",
"規格(入数など)": "",
"用途(商品)": "持ち帰り",
"備考": "テーブル用の箸と区別(同一商品なら共通在庫)",
"購入方法": "",
"発注単位": "袋",
"入力単位": "膳",
"担当": "ホール",
"管理頻度": "週次",
"最低在庫": "30",
"発注方式": "最低在庫",
"配送・納期": ""
},
{
"品目": "お手拭き",
"仕入先": "",
"区分": "資材",
"規格(入数など)": "",
"用途(商品)": "持ち帰り",
"備考": "",
"購入方法": "",
"発注単位": "袋",
"入力単位": "個",
"担当": "ホール",
"管理頻度": "週次",
"最低在庫": "30",
"発注方式": "最低在庫",
"配送・納期": ""
},
{
"品目": "紙ナプキン",
"仕入先": "シモジマ",
"区分": "消耗品",
"規格(入数など)": "",
"用途(商品)": "店内",
"備考": "既存行",
"購入方法": "",
"発注単位": "袋",
"入力単位": "袋",
"担当": "ホール",
"管理頻度": "週次",
"最低在庫": "1",
"発注方式": "最低在庫",
"配送・納期": ""
},
{
"品目": "注文票",
"仕入先": "印刷",
"区分": "消耗品",
"規格(入数など)": "100枚綴り",
"用途(商品)": "店内",
"備考": "",
"購入方法": "",
"発注単位": "冊",
"入力単位": "冊",
"担当": "ホール",
"管理頻度": "週次",
"最低在庫": "2",
"発注方式": "最低在庫",
"配送・納期": "納期 要確認"
},
{
"品目": "タバスコ(赤)",
"仕入先": "",
"区分": "調味料",
"規格(入数など)": "",
"用途(商品)": "卓上",
"備考": "レジ「タバスコ(卓上予備)」を名寄せ",
"購入方法": "",
"発注単位": "本",
"入力単位": "本",
"担当": "ホール",
"管理頻度": "必要時",
"最低在庫": "1",
"発注方式": "最低在庫",
"配送・納期": ""
},
{
"品目": "タバスコ(緑)",
"仕入先": "",
"区分": "調味料",
"規格(入数など)": "",
"用途(商品)": "卓上",
"備考": "",
"購入方法": "",
"発注単位": "本",
"入力単位": "本",
"担当": "ホール",
"管理頻度": "必要時",
"最低在庫": "1",
"発注方式": "最低在庫",
"配送・納期": ""
},
{
"品目": "粗挽き胡椒",
"仕入先": "",
"区分": "調味料",
"規格(入数など)": "",
"用途(商品)": "卓上",
"備考": "",
"購入方法": "",
"発注単位": "本",
"入力単位": "本",
"担当": "ホール",
"管理頻度": "必要時",
"最低在庫": "1",
"発注方式": "最低在庫",
"配送・納期": ""
},
{
"品目": "パルメザンチーズ",
"仕入先": "",
"区分": "調味料",
"規格(入数など)": "",
"用途(商品)": "卓上",
"備考": "レジ「粉チーズ(卓上予備)」を名寄せ",
"購入方法": "",
"発注単位": "本",
"入力単位": "本",
"担当": "ホール",
"管理頻度": "必要時",
"最低在庫": "1",
"発注方式": "最低在庫",
"配送・納期": ""
},
{
"品目": "ペン",
"仕入先": "Amazon等",
"区分": "備品",
"規格(入数など)": "",
"用途(商品)": "注文票用",
"備考": "",
"購入方法": "Web",
"発注単位": "本",
"入力単位": "本",
"担当": "ホール",
"管理頻度": "必要時",
"最低在庫": "",
"発注方式": "台帳(破損・紛失時のみ)",
"配送・納期": ""
},
{
"品目": "箸(テーブル用)",
"仕入先": "",
"区分": "備品",
"規格(入数など)": "",
"用途(商品)": "店内",
"備考": "",
"購入方法": "",
"発注単位": "膳",
"入力単位": "膳",
"担当": "ホール",
"管理頻度": "必要時",
"最低在庫": "",
"発注方式": "台帳",
"配送・納期": ""
},
{
"品目": "フォーク",
"仕入先": "",
"区分": "備品",
"規格(入数など)": "",
"用途(商品)": "店内",
"備考": "",
"購入方法": "",
"発注単位": "本",
"入力単位": "本",
"担当": "ホール",
"管理頻度": "必要時",
"最低在庫": "",
"発注方式": "台帳",
"配送・納期": ""
},
{
"品目": "スプーン",
"仕入先": "",
"区分": "備品",
"規格(入数など)": "",
"用途(商品)": "店内",
"備考": "",
"購入方法": "",
"発注単位": "本",
"入力単位": "本",
"担当": "ホール",
"管理頻度": "必要時",
"最低在庫": "",
"発注方式": "台帳",
"配送・納期": ""
},
{
"品目": "レシートロール紙 58mm",
"仕入先": "Amazon",
"区分": "消耗品",
"規格(入数など)": "58mm×40mm 20巻",
"用途(商品)": "テイクアウト伝票",
"備考": "",
"購入方法": "Web",
"発注単位": "箱",
"入力単位": "巻",
"担当": "ホール",
"管理頻度": "週次",
"最低在庫": "3",
"発注方式": "最低在庫",
"配送・納期": "1〜3日"
},
{
"品目": "清掃・衛生用品",
"仕入先": "",
"区分": "消耗品",
"規格(入数など)": "",
"用途(商品)": "店内",
"備考": "登録対象 未確定(個別品目は後日)",
"購入方法": "",
"発注単位": "",
"入力単位": "",
"担当": "ホール",
"管理頻度": "必要時",
"最低在庫": "",
"発注方式": "簡易報告",
"配送・納期": ""
}
];

// ===== 要確認の解消（dashboard.html の「要確認」から直す） =====
// 原則：元データは消さない。訂正は「訂正ログ」に 誰が・いつ・何を・なぜ を残し、売上行は取消フラグ／支払方法の書き換えだけ。
// 取り付け: doGet に /^fx_/ → handleFxGet、doPost に handleFxPost。doGet の集計は 区分="取消" の行を読み飛ばす。
var FX_LOG = "訂正ログ"; var FX_LOG_COLS = ["log_id","日時","操作者","種別","日付","対象","変更前","変更後","理由"];
var FX_ACK = "確認済み"; var FX_ACK_COLS = ["key","日時","操作者","件名","理由"];
var FX_SHIME_EXTRA = ["差異理由","確認者","確認日時"]; // レジ締めシートの T〜V 列

function fxLog_(me, kind, date, target, before, after, reason){
  invAppend_(invSheet_(FX_LOG, FX_LOG_COLS), { log_id: invId_("fx_"), "日時": invNow_(), "操作者": me.name, "種別": kind, "日付": date, "対象": String(target), "変更前": typeof before === "string" ? before : JSON.stringify(before), "変更後": typeof after === "string" ? after : JSON.stringify(after), "理由": String(reason||"") });
}
function fxAcks_(){ try { return invRows_(invSheet_(FX_ACK, FX_ACK_COLS)).map(function(r){ return { key:String(r.key), at:String(r["日時"]), by:String(r["操作者"]), title:String(r["件名"]||""), reason:String(r["理由"]||"") }; }); } catch(e){ return []; } }
function fxCanFix_(me){ return me && (me.role === "admin" || me.role === "store"); }

// その日の会計一覧（行番号つき）。支払方法の訂正・取消の対象を選ぶ用
function fxSalesOf_(date){
  var ss = SpreadsheetApp.getActiveSpreadsheet(); var sh = ss.getSheetByName("売上"); var tz; try { tz = ss.getSpreadsheetTimeZone() || "GMT"; } catch(e){ tz = "GMT"; }
  var v = sh.getDataRange().getValues(); var out = [];
  for (var r = 1; r < v.length; r++){ var row = v[r]; if (dateKey_(row[0]) !== date) continue; if (String(row[3]) === "ERROR") continue;
    out.push({ row: r+1, time: (row[1] instanceof Date) ? Utilities.formatDate(row[1], tz, "HH:mm") : String(row[1]||"").slice(0,5), mode: String(row[3]||""), amount: Number(row[4])||0, meals: Number(row[5])||0, items: String(row[7]||""), pay: String(row[25]||"") }); }
  return out;
}

function handleFxGet(e){
  var p = e.parameter; var me = invAuth_(p); if (!me) return invOut_({ error: "auth" });
  var mode = String(p.mode||"");
  if (mode === "fx_me") return invOut_({ me: me });
  if (mode === "fx_sales") return invOut_({ me: me, date: String(p.date||""), list: fxSalesOf_(String(p.date||"")) });
  if (mode === "fx_log") return invOut_({ list: invRows_(invSheet_(FX_LOG, FX_LOG_COLS)).slice(-200).reverse().map(function(r){ return { at:String(r["日時"]), by:String(r["操作者"]), kind:String(r["種別"]), date:String(r["日付"]), target:String(r["対象"]), before:String(r["変更前"]), after:String(r["変更後"]), reason:String(r["理由"]) }; }) });
  return invOut_({ error: "unknown mode" });
}

function handleFxPost(d){
  if (!d || !/^fx_/.test(String(d.type||""))) return null;
  var res;
  try {
    var me = invAuth_(d); if (!me) return invOut_({ error: "auth" });
    if (!fxCanFix_(me)) return invOut_({ error: "管理者のみ" });
    var lock = LockService.getScriptLock(); lock.waitLock(10000);
    try {
      if (d.type === "fx_pay") res = fxPay_(d, me);
      else if (d.type === "fx_cancel") res = fxCancel_(d, me);
      else if (d.type === "fx_restore") res = fxRestore_(d, me);
      else if (d.type === "fx_shime_reason") res = fxShimeReason_(d, me);
      else if (d.type === "fx_ack") res = fxAck_(d, me);
      else if (d.type === "fx_unack") res = fxUnack_(d, me);
      else if (d.type === "fx_fixed") res = fxFixed_(d, me);
      else if (d.type === "fx_item") res = fxItem_(d, me);
      else if (d.type === "fx_add") res = fxAdd_(d, me);
      else res = { error: "unknown type" };
    } finally { lock.releaseLock(); }
  } catch(e){ res = { error: String(e) }; }
  return invOut_(res);
}

// 支払方法の訂正（現金⇄PayPay）
function fxPay_(d, me){
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("売上"); var row = Number(d.row)||0; if (row < 2) return { error: "行が不正" };
  var v = sh.getRange(row, 1, 1, 26).getValues()[0]; var date = dateKey_(v[0]); if (d.date && date !== String(d.date)) return { error: "日付が一致しません（画面を更新してください）" };
  var pay = String(d.pay||""); if (["現金","PayPay"].indexOf(pay) < 0) return { error: "支払方法は 現金 / PayPay" };
  var before = String(v[25]||""); if (before === pay) return { ok: true, same: true };
  sh.getRange(row, 26).setValue(pay);
  fxLog_(me, "支払方法", date, "売上!行" + row + " " + String(v[7]||"") + " " + (Number(v[4])||0) + "円", before, pay, d.reason);
  return { ok: true };
}
// 会計の取消：区分を「取消」にし、金額・食数・個数を空にする（元の値は訂正ログに保存。戻せる）
function fxCancel_(d, me){
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("売上"); var row = Number(d.row)||0; if (row < 2) return { error: "行が不正" };
  var v = sh.getRange(row, 1, 1, 26).getValues()[0]; var date = dateKey_(v[0]); if (d.date && date !== String(d.date)) return { error: "日付が一致しません（画面を更新してください）" };
  if (String(v[3]) === "取消") return { ok: true, same: true };
  var saved = { mode: String(v[3]||""), vals: v.slice(4, 25) }; // E..Y
  var blank = v.slice(4, 25).map(function(x, i){ return i === 3 ? x : ""; }); // H(内訳) は残す
  sh.getRange(row, 4).setValue("取消"); sh.getRange(row, 5, 1, 21).setValues([blank]);
  fxLog_(me, "取消", date, "売上!行" + row + " " + String(v[7]||"") + " " + (Number(v[4])||0) + "円 " + String(v[25]||""), saved, "取消", d.reason);
  return { ok: true };
}
function fxRestore_(d, me){
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("売上"); var row = Number(d.row)||0; if (row < 2) return { error: "行が不正" };
  var v = sh.getRange(row, 1, 1, 26).getValues()[0]; if (String(v[3]) !== "取消") return { error: "取消された行ではありません" };
  var logs = invRows_(invSheet_(FX_LOG, FX_LOG_COLS)).filter(function(r){ return String(r["種別"]) === "取消" && String(r["対象"]).indexOf("売上!行" + row + " ") === 0; });
  if (!logs.length) return { error: "元の値が見つかりません" };
  var saved = JSON.parse(String(logs[logs.length-1]["変更前"]));
  sh.getRange(row, 4).setValue(saved.mode); sh.getRange(row, 5, 1, 21).setValues([saved.vals]);
  fxLog_(me, "取消を戻す", dateKey_(v[0]), "売上!行" + row + " " + String(v[7]||""), "取消", saved.mode, d.reason);
  return { ok: true };
}
// レジ締めの差異に理由を記録
function fxShimeReason_(d, me){
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("レジ締め"); if (!sh) return { error: "レジ締めシートがありません" };
  var hdr = sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), 22)).getValues()[0].map(String);
  if (hdr[19] !== FX_SHIME_EXTRA[0]) sh.getRange(1, 20, 1, 3).setValues([FX_SHIME_EXTRA]);
  var v = sh.getRange(2, 1, Math.max(1, sh.getLastRow()-1), 1).getValues(); var date = String(d.date||""); var at = -1;
  for (var i = v.length-1; i >= 0; i--){ if (dateKey_(v[i][0]) === date){ at = i + 2; break; } }
  if (at < 0) return { error: "その日のレジ締めがありません" };
  var before = String(sh.getRange(at, 20).getValue()||"");
  sh.getRange(at, 20, 1, 3).setValues([[String(d.reason||""), me.name, invNow_()]]);
  fxLog_(me, "締め差異の理由", date, "レジ締め " + date, before, String(d.reason||""), "");
  return { ok: true };
}
// 「これで正しい／確認した」として要確認から外す
function fxAck_(d, me){
  var key = String(d.key||""); if (!key) return { error: "key がありません" };
  var sh = invSheet_(FX_ACK, FX_ACK_COLS); if (invRows_(sh).some(function(r){ return String(r.key) === key; })) return { ok: true, same: true };
  invAppend_(sh, { key: key, "日時": invNow_(), "操作者": me.name, "件名": String(d.title||""), "理由": String(d.reason||"") });
  return { ok: true };
}
function fxUnack_(d, me){
  var key = String(d.key||""); var sh = invSheet_(FX_ACK, FX_ACK_COLS); var r = invRows_(sh).filter(function(x){ return String(x.key) === key; })[0]; if (!r) return { ok: true, same: true };
  sh.deleteRow(r._row); return { ok: true };
}
// 固定費の月額を入力
function fxFixed_(d, me){
  var sh = fixedSheet_(); var name = String(d.name||""); var amount = Number(d.amount); if (!name || isNaN(amount)) return { error: "科目と金額を入れてください" };
  var v = sh.getRange(2, 1, Math.max(1, sh.getLastRow()-1), 2).getValues(); var at = -1;
  for (var i = 0; i < v.length; i++){ if (String(v[i][0]) === name){ at = i + 2; break; } }
  if (at < 0) return { error: "固定費に「" + name + "」がありません" };
  var before = Number(v[at-2][1])||0; sh.getRange(at, 2).setValue(amount);
  fxLog_(me, "固定費", invToday_(), name, before, amount, d.reason);
  return { ok: true };
}

// 商品の差替え（例：オリオン ハーフ → オリオン）。個数列・内訳・合計を直し、食数は変えない
function fxItem_(d, me){
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("売上"); var row = Number(d.row)||0; if (row < 2) return { error: "行が不正" };
  var from = String(d.from||""), to = String(d.to||""); if (ITEM_ORDER.indexOf(from) < 0 || ITEM_ORDER.indexOf(to) < 0) return { error: "商品名が不正" };
  var v = sh.getRange(row, 1, 1, 26).getValues()[0]; var date = dateKey_(v[0]); if (d.date && date !== String(d.date)) return { error: "日付が一致しません" };
  if (String(v[3]) === "取消") return { error: "取消された行です" };
  var cf = 9 + ITEM_ORDER.indexOf(from), ct = 9 + ITEM_ORDER.indexOf(to); // I列=9
  var qf = Number(v[cf-1])||0; if (qf < 1) return { error: "この会計に " + from + " はありません" };
  var qt = Number(v[ct-1])||0; try { orderCfg_(); } catch(e){} var prices = PRICES;
  var before = { items: String(v[7]||""), amount: Number(v[4])||0 };
  var counts = {}; ITEM_ORDER.forEach(function(n, i){ var q = Number(v[8+i])||0; if (q) counts[n] = q; });
  counts[from] = qf - 1; if (!counts[from]) delete counts[from]; counts[to] = (counts[to]||0) + 1;
  var items = ITEM_ORDER.filter(function(n){ return counts[n]; }).map(function(n){ return n + "×" + counts[n]; }).join("　");
  var amount = before.amount - (Number(prices[from])||0) + (Number(prices[to])||0);
  sh.getRange(row, cf).setValue(qf - 1); sh.getRange(row, ct).setValue(qt + 1); sh.getRange(row, 8).setValue(items); sh.getRange(row, 5).setValue(amount);
  if (Number(v[23])) sh.getRange(row, 25).setValue(Math.max(0, Number(v[23]) - amount)); // お釣り
  fxLog_(me, "商品差替え", date, "売上!行" + row + " " + before.items + " " + before.amount + "円", before, { items: items, amount: amount }, d.reason);
  return { ok: true, amount: amount };
}
// 打ち忘れた会計を追加（伝票から）。items: {"オリオン":1,...}
function fxAdd_(d, me){
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("売上");
  var date = String(d.date||""); if (!/^\d{4}\/\d{2}\/\d{2}$/.test(date)) return { error: "日付は yyyy/MM/dd" };
  var time = String(d.time||"12:00"); if (/^\d{1,2}:\d{2}$/.test(time)) time += ":00";
  var mode = String(d.mode||"店内"); var pay = String(d.pay||"現金"); var counts = d.items || {}; try { orderCfg_(); } catch(e){} var prices = PRICES;
  var total = 0, meals = 0, drinks = 0, parts = [];
  ITEM_ORDER.forEach(function(n){ var q = Number(counts[n])||0; if (!q) return; total += q * (Number(prices[n])||0); if (MEAL_ITEMS.indexOf(n) >= 0) meals += q; if (/コーラ|ジンジャー|ラガー/.test(n)) drinks += q; parts.push(n + "×" + q); });
  if (!parts.length) return { error: "商品がありません" };
  var y = date.split("/").map(Number); var youbi = ["日","月","火","水","木","金","土"][new Date(y[0], y[1]-1, y[2]).getDay()];
  var row = [date, time, youbi, mode, total, meals, drinks, parts.join("　")];
  ITEM_ORDER.forEach(function(n){ row.push(Number(counts[n])||0); });
  row.push(total, 0, pay);
  sh.appendRow(row); var at = sh.getLastRow();
  fxLog_(me, "会計追加", date, "売上!行" + at + " " + parts.join("　") + " " + total + "円 " + pay, "", { time: time, mode: mode, items: parts.join("　"), amount: total, pay: pay }, d.reason);
  return { ok: true, row: at, amount: total };
}

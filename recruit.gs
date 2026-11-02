// ===== 採用（求人票・応募者）=====
// 分析シートの「求人票」「応募者」タブ。管理者アプリの「採用」から読み書きする（管理者だけ）
// 応募メール（Indeed など）は orion のメール取り込み（osMailIngest_）から recIngestMessages_ で応募者に入る
var REC_JOB = "求人票", REC_JOB_COLS = ["job_id","媒体","職種名","状態","掲載日","応募数","キャッチコピー","仕事内容","アピールポイント","求める人材","勤務時間","休日","給与","待遇","その他","管理URL","メモ","更新日時","更新者"];
var REC_APP = "応募者", REC_APP_COLS = ["app_id","応募日時","媒体","求人","名前","連絡先","状態","面接日時","メモ","メールID","件名","更新日時","更新者"];
var REC_STATUS = ["新規","連絡済","面接予定","採用","見送り","辞退"];
function recSheet_(n, cols){ return invSheet_(n, cols); }
function recNow_(){ return Utilities.formatDate(new Date(), "Asia/Tokyo", "yyyy/MM/dd HH:mm"); }
function recId_(p){ return p + Utilities.getUuid().replace(/-/g, "").slice(0, 10); }
function recRowsObj_(sh, cols){ return invRows_(sh).map(function(r){ var o = { _row: r._row }; cols.forEach(function(c){ var v = r[c]; o[c] = Object.prototype.toString.call(v) === "[object Date]" ? Utilities.formatDate(v, "Asia/Tokyo", "yyyy/MM/dd HH:mm") : (v == null ? "" : String(v)); }); return o; }); }
function recSet_(sh, cols, row, obj){ var hdr = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String); Object.keys(obj).forEach(function(k){ var c = hdr.indexOf(k); if (c < 0) return; var v = obj[k]; if (/^[=+@]/.test(String(v))) v = "'" + v; sh.getRange(row, c + 1).setValue(v); }); }

// メール → 応募者（Indeed の応募通知など）。同じメールIDは入れない
function recIngestMessages_(msgs){
  var list = (msgs || []).filter(function(m){ var f = String(m.from||"").toLowerCase(), s = String(m.subject||"");
    return (/indeed/.test(f) && /応募/.test(s) && !/求人.*(掲載|公開|審査)|ご請求|レポート|パフォーマンス/.test(s)) || /^(新しい応募|【応募】)/.test(s); });
  if (!list.length) return 0;
  var sh = recSheet_(REC_APP, REC_APP_COLS); var known = {}; recRowsObj_(sh, REC_APP_COLS).forEach(function(r){ if (r["メールID"]) known[r["メールID"]] = 1; });
  var n = 0;
  list.forEach(function(m){ if (known[m.id]) return; var s = String(m.subject||""), b = String(m.body||"").slice(0, 4000);
    var name = (s.match(/([^\s　:：「」]{1,20}?)\s*(?:様|さん)(?:から|が|の)/) || b.match(/([^\s　:：「」]{1,20}?)\s*(?:様|さん)(?:から|が)(?:.{0,10})応募/) || [])[1] || "";
    var job = (s.match(/[「『](.+?)[」』]/) || b.match(/[「『](.+?)[」』]/) || [])[1] || (s.split(/[-－|｜]/).slice(-1)[0] || "").trim();
    invAppend_(sh, { app_id: recId_("ap_"), "応募日時": m.date || recNow_(), "媒体": /indeed/i.test(m.from) ? "Indeed" : "メール", "求人": job.slice(0, 60), "名前": name, "連絡先": "", "状態": "新規",
      "面接日時": "", "メモ": "", "メールID": m.id, "件名": s.slice(0, 120), "更新日時": recNow_(), "更新者": "自動" });
    known[m.id] = 1; n++; });
  return n;
}

function recGet_(p){
  var me = null; try { me = invAuth_(p); } catch(e){}
  if (!me || me.role !== "admin") return invOut_({ error: "auth" });
  if (p.mode === "rec_list"){
    var apps = recRowsObj_(recSheet_(REC_APP, REC_APP_COLS), REC_APP_COLS).sort(function(a, b){ return a["応募日時"] < b["応募日時"] ? 1 : -1; });
    var jobs = recRowsObj_(recSheet_(REC_JOB, REC_JOB_COLS), REC_JOB_COLS);
    return invOut_({ ok: true, apps: apps, jobs: jobs, statuses: REC_STATUS });
  }
  if (p.mode === "rec_outlook") return invOut_(stfOutlook_(Math.min(56, Number(p.days)||28)));   // 人手の見通し
  return invOut_({ error: "mode" });
}
function recPost_(d){
  if (!d || !/^rec_/.test(String(d.type||""))) return null;
  var me = null; try { me = invAuth_(d); } catch(e){}
  if (!me || me.role !== "admin") return invOut_({ error: "auth" });
  var lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    if (d.type === "rec_app_save"){   // 応募者の追加・更新（状態・面接日時・メモなど）
      var sh = recSheet_(REC_APP, REC_APP_COLS), f = d.fields || {}, o = {};
      REC_APP_COLS.forEach(function(c){ if (c in f && !/^(app_id|メールID|更新日時|更新者)$/.test(c)) o[c] = String(f[c]); });
      if (o["状態"] && REC_STATUS.indexOf(o["状態"]) < 0) return invOut_({ error: "状態が正しくありません" });
      o["更新日時"] = recNow_(); o["更新者"] = me.name;
      if (d.id){ var r = recRowsObj_(sh, REC_APP_COLS).filter(function(x){ return x.app_id === d.id; })[0]; if (!r) return invOut_({ error: "見つかりません" }); recSet_(sh, REC_APP_COLS, r._row, o); return invOut_({ ok: true, id: d.id }); }
      if (!o["名前"]) return invOut_({ error: "名前を入れてください" });
      var id = recId_("ap_"); o.app_id = id; o["応募日時"] = o["応募日時"] || recNow_(); o["状態"] = o["状態"] || "新規"; invAppend_(sh, o); return invOut_({ ok: true, id: id });
    }
    if (d.type === "rec_job_save"){   // 求人票の追加・更新
      var js = recSheet_(REC_JOB, REC_JOB_COLS), g = d.fields || {}, q = {};
      REC_JOB_COLS.forEach(function(c){ if (c in g && !/^(job_id|更新日時|更新者)$/.test(c)) q[c] = String(g[c]); });
      q["更新日時"] = recNow_(); q["更新者"] = me.name;
      if (d.id){ var j = recRowsObj_(js, REC_JOB_COLS).filter(function(x){ return x.job_id === d.id; })[0]; if (!j) return invOut_({ error: "見つかりません" }); recSet_(js, REC_JOB_COLS, j._row, q); return invOut_({ ok: true, id: d.id }); }
      var jid = recId_("job_"); q.job_id = jid; invAppend_(js, q); return invOut_({ ok: true, id: jid });
    }
    if (d.type === "rec_need_save"){ try { return invOut_({ ok: true, cfg: stfNeedSave_(d.cfg) }); } catch(err){ return invOut_({ error: String(err.message||err) }); } }   // 必要人数の設定
    if (d.type === "rec_app_delete" || d.type === "rec_job_delete"){   // 間違えて入れた行を消す（行ごと削除）
      var isApp = d.type === "rec_app_delete", ds = isApp ? recSheet_(REC_APP, REC_APP_COLS) : recSheet_(REC_JOB, REC_JOB_COLS), key = isApp ? "app_id" : "job_id";
      var hit = recRowsObj_(ds, isApp ? REC_APP_COLS : REC_JOB_COLS).filter(function(x){ return x[key] === String(d.id||""); })[0];
      if (!hit) return invOut_({ error: "見つかりません" }); ds.deleteRow(hit._row); return invOut_({ ok: true });
    }
    return invOut_({ error: "type" });
  } finally { lock.releaseLock(); }
}
// 今朝の確認・17時のまとめ：未対応（新規）の応募
function opsRecAlerts_(){
  var apps = recRowsObj_(recSheet_(REC_APP, REC_APP_COLS), REC_APP_COLS).filter(function(a){ return a["状態"] === "新規"; });
  return apps.length ? [{ key: "rec", level: "high", title: "新しい応募 " + apps.length + "件（まだ連絡していません）", detail: apps.slice(0, 4).map(function(a){ return (a["名前"] || "名前不明") + "（" + a["媒体"] + "・" + String(a["応募日時"]).slice(5, 16) + "）"; }).join("、") + "。前回は応募の8割以上が掲載から3日以内でした。その日のうちに連絡を", app: "recruit" }] : [];
}
// ===== 採用 END =====
// ===== 人手の見通し（採用の判断用）=====
// 必要人数は STAFF の設定 staffing_need（JSON）。店ごと・曜日ごと・役割（ホール／厨房）ごと。日付ごとの上書きは「必要人数」シート（合計人数・営業）
// 例 {"stores":{"kanda":{"name":"淡路町","hall":1,"kitchen":1,"dow":{"5":{"hall":2}}}},"meals_per_staff":18,"days_per_person":2.5}
var STF_NEED_DEFAULT = { stores: { kanda: { name: "淡路町", hall: 1, kitchen: 1, dow: {} } }, meals_per_staff: 18, days_per_person: 2.5 };
function stfNeedCfg_(set){
  var c = null; try { c = JSON.parse(set.staffing_need || "null"); } catch(e){}
  if (!c || !c.stores){ c = JSON.parse(JSON.stringify(STF_NEED_DEFAULT)); var tot = Number(set.default_need)||0; if (tot > 2) c.stores.kanda.hall = tot - 1; }
  if (!c.meals_per_staff) c.meals_per_staff = STF_NEED_DEFAULT.meals_per_staff;
  if (!c.days_per_person) c.days_per_person = STF_NEED_DEFAULT.days_per_person;
  return c;
}
// その店のその曜日の必要人数 {hall, kitchen}
function stfNeedFor_(cfg, store, dow){
  var s = (cfg.stores || {})[store] || (cfg.stores || {})[Object.keys(cfg.stores || {})[0]] || { hall: 1, kitchen: 1 };
  var o = (s.dow || {})[String(dow)] || {};
  return { hall: Number(o.hall != null ? o.hall : s.hall) || 0, kitchen: Number(o.kitchen != null ? o.kitchen : s.kitchen) || 0 };
}
// 先 n 日の見通し：日ごとの必要・確定・希望、曜日ごとの不足、あと何人いるか
function stfOutlook_(n){
  n = n || 28;
  var st = SpreadsheetApp.openById(INV_STAFF_SS), set = stfSettings_(st), cfg = stfNeedCfg_(set), isOpen = opsOpenFn_(set);
  var kitchen = stfList_(set.kitchen_ids), store = Object.keys(cfg.stores)[0];
  var staff = {}; invRows_(st.getSheetByName("スタッフ")).forEach(function(r){ if (String(r["状態"]) === "stopped") return; staff[r.staff_id] = { name: String(r["名前"]), role: kitchen.indexOf(r.staff_id) >= 0 ? "kitchen" : "hall" }; });
  var over = {}; invRows_(st.getSheetByName("必要人数")).forEach(function(r){ var d = dateKey_(r["日付"]); if (d) over[d] = r; });
  var shifts = {}; invRows_(st.getSheetByName("確定シフト")).forEach(function(r){ var s = String(r["状態"]); if (s !== "confirmed" && s !== "draft") return; var d = dateKey_(r["日付"]); if (d) (shifts[d] = shifts[d] || []).push(r); });
  var wishes = {}; var wsh = st.getSheetByName("希望シフト"); if (wsh) invRows_(wsh).forEach(function(r){ var k = String(r["区分"]); if (k !== "ok" && k !== "time") return; var d = dateKey_(r["日付"]); if (d) (wishes[d] = wishes[d] || []).push(r.staff_id); });
  var caps = {}; try { caps = JSON.parse(set.annual_caps || "{}"); } catch(e){}
  var today = opsDay_(new Date()), days = [], byDow = {};
  for (var i = 0; i < n; i++){
    var d = opsAdd_(today, i), dow = opsDow_(d), open = isOpen(d), ov = over[d];
    if (ov){ var v = ov["営業"]; if (v === false || /^(false|休|×|0|closed)$/i.test(String(v))) open = false; else if (v === true || /^(true|営業|○|1|open)$/i.test(String(v))) open = true; }
    if (!open) continue;
    var need = stfNeedFor_(cfg, store, dow);
    if (ov && Number(ov["必要人数"]) > 0){ var tot = Number(ov["必要人数"]); need = { hall: Math.max(0, tot - need.kitchen), kitchen: need.kitchen }; }
    var sh = shifts[d] || [], has = { hall: 0, kitchen: 0 }, names = [];
    sh.forEach(function(x){ var s = staff[x.staff_id]; var role = s ? s.role : (kitchen.indexOf(x.staff_id) >= 0 ? "kitchen" : "hall"); has[role]++; names.push((s ? s.name : "?") + (String(x["状態"]) === "confirmed" ? "" : "（下書き）")); });
    var inShift = {}; sh.forEach(function(x){ inShift[x.staff_id] = 1; });
    var can = { hall: 0, kitchen: 0 }, canNames = [];
    (wishes[d] || []).forEach(function(id){ if (inShift[id] || !staff[id]) return; can[staff[id].role]++; canNames.push(staff[id].name); });
    var shortH = Math.max(0, need.hall - has.hall), shortK = Math.max(0, need.kitchen - has.kitchen);
    // シフトが未作成の日は「希望で埋まるか」で見る
    var fillH = Math.min(shortH, can.hall), fillK = Math.min(shortK, can.kitchen);
    days.push({ date: d, label: opsLabel_(d), dow: dow, need: need, has: has, names: names, can: can, canNames: canNames, shortHall: shortH, shortKitchen: shortK, gapHall: shortH - fillH, gapKitchen: shortK - fillK, planned: sh.length > 0 });
    var b = byDow[dow] = byDow[dow] || { dow: dow, label: OPS_YO[dow], days: 0, gapHall: 0, gapKitchen: 0, need: need };
    b.days++; b.gapHall += shortH - fillH; b.gapKitchen += shortK - fillK;
  }
  var weeks = Math.max(1, n / 7), gapH = 0, gapK = 0;
  days.forEach(function(x){ gapH += x.gapHall; gapK += x.gapKitchen; });
  var perWeekH = gapH / weeks, perWeekK = gapK / weeks, dpp = Number(cfg.days_per_person) || 2.5;
  var capStaff = Object.keys(caps).filter(function(id){ return staff[id]; }).map(function(id){ return staff[id].name; });
  return { ok: true, today: today, horizon: n, store: store, cfg: cfg, days: days,
    byDow: Object.keys(byDow).map(function(k){ return byDow[k]; }).sort(function(a, b){ return ((a.dow + 6) % 7) - ((b.dow + 6) % 7); }),
    summary: { hallSlotsPerWeek: Math.round(perWeekH * 10) / 10, kitchenSlotsPerWeek: Math.round(perWeekK * 10) / 10,
      hallPeople: perWeekH > 0 ? Math.ceil(perWeekH / dpp) : 0, kitchenPeople: perWeekK > 0 ? Math.ceil(perWeekK / dpp) : 0, daysPerPerson: dpp,
      staffHall: Object.keys(staff).filter(function(id){ return staff[id].role === "hall"; }).length, staffKitchen: Object.keys(staff).filter(function(id){ return staff[id].role === "kitchen"; }).length,
      capStaff: capStaff } };
}
// 必要人数の設定を保存（管理者）。STAFF の設定シートの staffing_need 行
function stfNeedSave_(cfg){
  if (!cfg || !cfg.stores || !Object.keys(cfg.stores).length) throw new Error("店舗の設定がありません");
  Object.keys(cfg.stores).forEach(function(k){ var s = cfg.stores[k]; s.hall = Math.max(0, Math.min(20, Number(s.hall)||0)); s.kitchen = Math.max(0, Math.min(20, Number(s.kitchen)||0));
    var dw = {}; Object.keys(s.dow || {}).forEach(function(d){ var o = s.dow[d] || {}, x = {}; if (o.hall !== "" && o.hall != null) x.hall = Math.max(0, Math.min(20, Number(o.hall)||0)); if (o.kitchen !== "" && o.kitchen != null) x.kitchen = Math.max(0, Math.min(20, Number(o.kitchen)||0)); if (Object.keys(x).length) dw[d] = x; }); s.dow = dw; });
  cfg.meals_per_staff = Math.max(1, Number(cfg.meals_per_staff)||STF_NEED_DEFAULT.meals_per_staff); cfg.days_per_person = Math.max(0.5, Number(cfg.days_per_person)||STF_NEED_DEFAULT.days_per_person);
  var sh = SpreadsheetApp.openById(INV_STAFF_SS).getSheetByName("設定"); var v = JSON.stringify(cfg);
  var keys = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow()-1, 1).getValues().map(function(r){ return String(r[0]); }) : [];
  var i = keys.indexOf("staffing_need");
  if (i >= 0) sh.getRange(i + 2, 2).setValue(v); else sh.appendRow(["staffing_need", v, "必要人数（店・曜日・ホール／厨房）。管理者アプリの採用タブで変更"]);
  return cfg;
}
// ===== 人手の見通し END =====

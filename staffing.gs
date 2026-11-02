// ===== 人手・人件費（STAFF の勤怠・シフト・設定から直接読む）=====
// 人件費(STAFF) タブ（IMPORTRANGE）は STAFF 側が退勤時に書く日次表なので、あとから承認・修正した勤怠が入らない。
// 日別人件費は勤怠シートから毎回計算する。人が足りない日は毎日17時にメールで知らせる（stfSetupTrigger を1回実行）
var STF_NOTIFY_TO = "orion.napolitan@gmail.com";
function stfSettings_(st){ var o = {}; var sh = st.getSheetByName("設定"); if (!sh || sh.getLastRow() < 2) return o;
  sh.getRange(2,1,sh.getLastRow()-1,2).getValues().forEach(function(r){ o[String(r[0])] = String(r[1]); }); return o; }
function stfList_(s){ return String(s||"").split(/[,\s]+/).map(function(x){ return x.trim(); }).filter(String); }
// 人件費(STAFF) タブと同じ形の行（日付, store_id, 勤務人数, 総労働分, 人件費）。読めないときはタブの値
function stfLaborRows_(lsh){ try { var ld = stfLaborDaily_(); return Object.keys(ld).sort().map(function(d){ return [d, "kanda", ld[d].staff, ld[d].minutes, ld[d].cost]; }); } catch(e) { return lsh.getRange(2,1,lsh.getLastRow()-1,5).getValues(); } }
function stfLaborDaily_(){
  var st = SpreadsheetApp.openById(INV_STAFF_SS); var set = stfSettings_(st);
  var defW = Number(set.default_wage)||0, otMin = Number(set.overtime_daily_min)||480, otRate = Number(set.overtime_rate)||1.25;
  // 時給0＝管理者のサポート：人件費・人数・時間に入れない（出勤の時間帯だけ spans に「サポート」として残す）。空欄は既定の時給
  var wage = {}; invRows_(st.getSheetByName("スタッフ")).forEach(function(r){ var w = String(r["時給"] == null ? "" : r["時給"]).trim(); wage[r.staff_id] = w === "" ? defW : (Number(w)||0); });
  var out = {};
  invRows_(st.getSheetByName("勤怠")).forEach(function(r){
    if (String(r["状態"]) !== "done") return; var d = dateKey_(r["日付"]); if (!d) return;
    var min = Number(r["実労働分"])||0, w = (r.staff_id in wage) ? wage[r.staff_id] : defW;
    var o = out[d] = out[d] || {staff:0, minutes:0, cost:0, spans:[]};
    o.spans.push([opsHM_(r["出勤"]), opsHM_(r["退勤"]), w > 0 ? 1 : 0]);   // 時間帯ごとの人数用（出勤・退勤・有給=1／サポート=0）
    if (!(w > 0)) return;
    var pay = Math.min(min, otMin)/60*w + Math.max(0, min-otMin)/60*w*otRate;
    o.staff++; o.minutes += min; o.cost += Math.round(pay) + (Number(r["交通費"])||0);
  });
  return out;
}
// 日本の祝日（振替休日・国民の休日を含む。春分・秋分は計算式）
function stfJpHoliday_(y, mo, d){
  function nthMon(y, mo, n){ var f = new Date(y, mo-1, 1).getDay(); return 1 + ((8 - f) % 7) + (n-1)*7; }
  function base(y, mo, d){
    var fixed = {"1/1":1,"2/11":1,"2/23":1,"4/29":1,"5/3":1,"5/4":1,"5/5":1,"8/11":1,"11/3":1,"11/23":1};
    if (fixed[mo+"/"+d]) return true;
    if ((mo===1 && d===nthMon(y,1,2)) || (mo===7 && d===nthMon(y,7,3)) || (mo===9 && d===nthMon(y,9,3)) || (mo===10 && d===nthMon(y,10,2))) return true;
    var k = y - 1980, sp = Math.floor(20.8431 + 0.242194*k - Math.floor(k/4)), au = Math.floor(23.2488 + 0.242194*k - Math.floor(k/4));
    return (mo===3 && d===sp) || (mo===9 && d===au);
  }
  if (base(y, mo, d)) return true;
  var dt = new Date(y, mo-1, d);
  // 振替休日：前の日曜から続く祝日の翌日
  for (var i = 1; i <= 7; i++){ var p = new Date(y, mo-1, d-i); if (!base(p.getFullYear(), p.getMonth()+1, p.getDate())) break; if (p.getDay() === 0) return true; }
  // 国民の休日：前後が祝日
  var a = new Date(y, mo-1, d-1), b = new Date(y, mo-1, d+1);
  return dt.getDay() !== 0 && base(a.getFullYear(), a.getMonth()+1, a.getDate()) && base(b.getFullYear(), b.getMonth()+1, b.getDate());
}
// 今日から n 日先までで、シフトの人数が必要人数（未設定は2人）に足りない日・厨房かホールがいない日
function stfShortDays_(n){
  var st = SpreadsheetApp.openById(INV_STAFF_SS); var set = stfSettings_(st);
  var closedDow = stfList_(set.closed_dow).map(Number), hol = stfList_(set.holidays), extra = stfList_(set.extra_open), kitchen = stfList_(set.kitchen_ids);
  var need = {}; invRows_(st.getSheetByName("必要人数")).forEach(function(r){ var d = dateKey_(r["日付"]); if (d) need[d] = r; });
  var names = {}; invRows_(st.getSheetByName("スタッフ")).forEach(function(r){ names[r.staff_id] = String(r["名前"]); });
  var byDate = {}; invRows_(st.getSheetByName("確定シフト")).forEach(function(r){ var s = String(r["状態"]); if (s !== "confirmed" && s !== "draft") return; var d = dateKey_(r["日付"]); if (d) (byDate[d] = byDate[d] || []).push(r); });
  var out = [], tz = "Asia/Tokyo", now = new Date(), YO = ["日","月","火","水","木","金","土"];
  for (var i = 0; i <= n; i++){
    var dt = new Date(now.getTime() + i*86400000); var d = Utilities.formatDate(dt, tz, "yyyy/MM/dd"); var dow = Number(Utilities.formatDate(dt, tz, "u")) % 7;
    var open = extra.indexOf(d) >= 0 || (closedDow.indexOf(dow) < 0 && hol.indexOf(d) < 0 && !stfJpHoliday_(Number(d.slice(0,4)), Number(d.slice(5,7)), Number(d.slice(8,10))));
    var nd = need[d]; if (nd){ var ov = nd["営業"]; if (ov === false || /^(false|休|×|0|closed)$/i.test(String(ov))) open = false; else if (ov === true || /^(true|営業|○|1|open)$/i.test(String(ov))) open = true; }
    if (!open) continue;
    var sh = byDate[d] || []; var nn = stfNeedFor_(stfNeedCfg_(set), Object.keys(stfNeedCfg_(set).stores)[0], dow); var req = (nd && Number(nd["必要人数"])) || (nn.hall + nn.kitchen) || 2;   // 店・曜日の必要人数（設定 staffing_need）
    var hasK = !kitchen.length || sh.some(function(x){ return kitchen.indexOf(x.staff_id) >= 0; }), hasH = sh.some(function(x){ return kitchen.indexOf(x.staff_id) < 0; });
    var why = []; if (sh.length < req) why.push(sh.length + "人／必要" + req + "人"); if (sh.length && kitchen.length && !hasK) why.push("厨房がいない"); if (sh.length && !hasH) why.push("ホールがいない");
    if (why.length) out.push({ date:d, label: d.slice(5) + "(" + YO[dow] + ")", names: sh.map(function(x){ return names[x.staff_id] || "?"; }), why: why.join("・"), draft: sh.some(function(x){ return String(x["状態"]) !== "confirmed"; }) });
  }
  return out;
}
function stfSetupTrigger(){
  ScriptApp.getProjectTriggers().forEach(function(t){ if (t.getHandlerFunction() === "stfShortNotify") ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger("stfShortNotify").timeBased().atHour(17).everyDays(1).inTimezone("Asia/Tokyo").create();
}
// ===== 人手・人件費 END =====
// ===== 先出し通知（発注締切・年収の壁・衛生記録・締め未入力・人手不足）=====
// 15:30 opsNotifyOrder：今日が締切の発注で、足りなくなる品目が未発注なら知らせる
// 17:00 stfShortNotify：人手不足（3週間先まで）・年収の壁・今日の衛生記録・今日の締めをまとめて1通
// 分析アプリの「今朝の確認」は doGet mode=ops_alerts（管理者）で同じ内容を読む
var OPS_TZ = "Asia/Tokyo", OPS_YO = ["日","月","火","水","木","金","土"], OPS_MEALS = 55;
function opsDay_(dt){ return Utilities.formatDate(dt, OPS_TZ, "yyyy/MM/dd"); }
function opsDate_(key){ return new Date(key.replace(/\//g, "-") + "T12:00:00+09:00"); }
function opsAdd_(key, n){ return opsDay_(new Date(opsDate_(key).getTime() + n*86400000)); }
function opsDow_(key){ return Number(Utilities.formatDate(opsDate_(key), OPS_TZ, "u")) % 7; }
function opsLabel_(key){ return Number(key.slice(5,7)) + "/" + Number(key.slice(8,10)) + "(" + OPS_YO[opsDow_(key)] + ")"; }
function opsHM_(v){ var m = String(v||"").match(/(\d{1,2}):(\d{2})(?::\d{2})?\s*$/); if (Object.prototype.toString.call(v) === "[object Date]") return Utilities.formatDate(v, OPS_TZ, "H:mm"); return m ? (+m[1]) + ":" + m[2] : ""; }
function opsYen_(n){ return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",") + "円"; }
// 営業日の判定（STAFF の設定：定休曜日・休業日・臨時営業・祝日）
function opsOpenFn_(set){
  var closedDow = stfList_(set.closed_dow).map(Number), hol = stfList_(set.holidays), extra = stfList_(set.extra_open);
  return function(key){ if (extra.indexOf(key) >= 0) return true; if (hol.indexOf(key) >= 0 || closedDow.indexOf(opsDow_(key)) >= 0) return false;
    return !stfJpHoliday_(Number(key.slice(0,4)), Number(key.slice(5,7)), Number(key.slice(8,10))); };
}

// ---- 発注締切：今日が締切の納品で、その次の納品まで足りなくなる品目 ----
function opsOrderAlerts_(tk, hm){
  var st = SpreadsheetApp.openById(INV_STAFF_SS); var isOpen = opsOpenFn_(stfSettings_(st));
  var now = new Date(), today = tk || opsDay_(now), nowHM = hm || Utilities.formatDate(now, OPS_TZ, "HH:mm");   // tk・hm は試験用
  var items = invMaster_(), open = invOpenOrders_(), out = [], bySup = {};
  var sugMin = {}; try { invSuggest_().forEach(function(s){ sugMin[s.id] = s; }); } catch(e){}
  items.forEach(function(it){
    var days = String(it.days||"").split("").map(function(c){ return OPS_YO.indexOf(c); }).filter(function(i){ return i >= 0; });
    var cm = String(it.cutoff||"").match(/前日\s*(\d{1,2}:\d{2})/); if (!days.length || !cm) return;
    var cut = ("0" + cm[1]).slice(-5);
    // 次の納品日 D1（締切がまだ来ていないもの）と、その次 D2
    var D1 = null, D2 = null;
    for (var i = 1; i <= 14 && !D2; i++){ var k = opsAdd_(today, i); if (days.indexOf(opsDow_(k)) < 0) continue; var ck = opsAdd_(k, -1); if (ck < today || (ck === today && cut <= nowHM)) continue; if (!D1) D1 = k; else D2 = k; }
    if (!D1 || !D2 || opsAdd_(D1, -1) !== today) return;   // 今日が締切の納品だけ
    var pending = open.filter(function(o){ return o.item_id === it.id && o["状態"] === "発注済"; }).reduce(function(a, o){ return a + (Number(o["数量"])||0); }, 0);
    var reason = "";
    if (it.usage60 !== null && it.usage60 !== undefined && it.stock !== null && it.stockState !== "未計測"){
      var daily = Number(it.usage60) * OPS_MEALS / 60; if (!(daily > 0)) return;
      // 在庫を数えた日の翌日から今日までの営業日ぶん減らす（今日の昼は済み）
      var base = String(it.stockAt||"").slice(0,10).replace(/-/g, "/"); var cur = Number(it.stock);
      if (/^\d{4}\/\d{2}\/\d{2}$/.test(base)){ for (var d = opsAdd_(base, 1); d <= today; d = opsAdd_(d, 1)) if (isOpen(d)) cur -= daily; }
      // D1 の昼までの消費（D1 の到着は昼の後）→ 到着後に D2 の昼まで必要な量
      var use1 = 0; for (var d1 = opsAdd_(today, 1); d1 <= D1; d1 = opsAdd_(d1, 1)) if (isOpen(d1)) use1 += daily;
      var use2 = 0; for (var d2 = opsAdd_(D1, 1); d2 <= D2; d2 = opsAdd_(d2, 1)) if (isOpen(d2)) use2 += daily;
      var safety = (Number(it.safety)||0) * daily;
      var left = cur - use1 + pending; var need = use2 + safety;
      if (left < need) reason = "今の見込み " + (Math.round(cur*10)/10) + it.unit + "・" + opsLabel_(D2) + "の昼までに約" + (Math.round((need-left)*10)/10) + it.unit + "足りない";
    } else if (sugMin[it.id]){
      reason = sugMin[it.id].reason;
    }
    if (!reason) return;
    var sup = it.supplier || "（仕入先未設定）"; var g = bySup[sup] = bySup[sup] || { sup: sup, D1: D1, cut: cut, items: [] };
    g.items.push(it.name + "（" + reason + "）");
  });
  Object.keys(bySup).forEach(function(k){ var g = bySup[k];
    out.push({ key: "order", level: "high", title: g.sup + "：今日 " + g.cut + " 締切（" + opsLabel_(g.D1) + "納品）の未発注 " + g.items.length + "品目", detail: g.items.join("\n"), app: "hacchu" }); });
  // 締切の日に今日の在庫が数えられていない
  try { var lc = invLastChecks_()["シェフ"]; var lcd = lc ? String(lc.date||lc.at||"").slice(0,10).replace(/-/g,"/") : ""; var counted = !!lcd && lcd > opsAdd_(today, -14);   // 棚卸しは2週に1回（在庫は売上と仕込みから計算）
    if (!counted && isOpen(today))
      out.push({ key: "order", level: "mid", title: "厨房の棚卸し（2週に1回）の時期です", detail: "前回 " + (lcd || "なし") + "。売上から計算している在庫と実際のずれを直すため、全品目を数えてください", app: "hacchu" }); } catch(e){}
  return out;
}

// ---- 年収の壁：設定 annual_caps（{staff_id: 上限円}）に対する今年の見込み ----
function opsCapAlerts_(){
  var st = SpreadsheetApp.openById(INV_STAFF_SS); var set = stfSettings_(st); var caps = {};
  try { caps = JSON.parse(set.annual_caps || "{}"); } catch(e){ return []; }
  var ids = Object.keys(caps); if (!ids.length) return [];
  var now = new Date(), today = opsDay_(now), year = today.slice(0,4), yEnd = year + "/12/31";
  var defW = Number(set.default_wage)||0, otMin = Number(set.overtime_daily_min)||480, otRate = Number(set.overtime_rate)||1.25, tcap = Number(set.transport_cap)||0;
  var staff = {}; invRows_(st.getSheetByName("スタッフ")).forEach(function(r){ staff[r.staff_id] = { name: String(r["名前"]), wage: Number(r["時給"])||defW, tr: Number(r["交通費_日額"])||0 }; });
  var pay = function(min, w){ return Math.min(min, otMin)/60*w + Math.max(0, min-otMin)/60*w*otRate; };
  var att = invRows_(st.getSheetByName("勤怠")), sh = invRows_(st.getSheetByName("確定シフト")), out = [];
  ids.forEach(function(id){
    var s = staff[id]; if (!s) return; var cap = Number(caps[id])||0; if (!cap) return;
    var ytd = 0, last28 = 0, d28 = opsAdd_(today, -28);
    att.forEach(function(r){ if (r.staff_id !== id || String(r["状態"]) !== "done") return; var d = dateKey_(r["日付"]); if (d.slice(0,4) !== year) return;
      var p = pay(Number(r["実労働分"])||0, s.wage) + (Number(r["交通費"])||0); ytd += p; if (d > d28) last28 += p; });
    var sched = 0, lastShift = today;
    sh.forEach(function(r){ if (r.staff_id !== id) return; var stt = String(r["状態"]); if (stt !== "confirmed" && stt !== "draft") return; var d = dateKey_(r["日付"]); if (d < today || d > yEnd) return;
      var a = opsHM_(r["開始"]).split(":"), b = opsHM_(r["終了"]).split(":"); if (a.length < 2 || b.length < 2) return;
      var min = (Number(b[0])*60 + Number(b[1])) - (Number(a[0])*60 + Number(a[1])); if (min <= 0) return;
      sched += pay(min, s.wage) + Math.min(s.tr, tcap || s.tr); if (d > lastShift) lastShift = d; });
    // シフトが決まっていない残りの週は、直近4週のペースで見込む
    var restDays = Math.max(0, (opsDate_(yEnd) - opsDate_(lastShift)) / 86400000); var weekly = last28 / 4; var rest = weekly * restDays / 7;
    var proj = ytd + sched + rest;
    if (proj >= cap * 0.9 || ytd >= cap * 0.8){
      out.push({ key: "cap", level: proj >= cap ? "high" : "mid", title: s.name + "さん 年収の上限 " + opsYen_(cap) + (proj >= cap ? " を超える見込み" : " に近づいています") + "（見込み " + opsYen_(proj) + "）",
        detail: "今年の実績 " + opsYen_(ytd) + "・決まっているシフト " + opsYen_(sched) + "・それ以降は直近ペース 週" + opsYen_(weekly) + "で " + opsYen_(rest) + "。交通費を含む・この店の分だけ", app: "staff" });
    }
  });
  return out;
}

// ---- 今日の衛生記録（出勤した人の「出勤時」、退勤した人の「退勤時」）----
function opsHygAlerts_(day){
  var st = SpreadsheetApp.openById(INV_STAFF_SS); var names = {}; invRows_(st.getSheetByName("スタッフ")).forEach(function(r){ names[r.staff_id] = String(r["名前"]); });
  var hy = {}; invRows_(st.getSheetByName("衛生")).forEach(function(r){ if (dateKey_(r["日付"]) !== day) return; hy[r.staff_id + "|" + String(r["区分"])] = true; });
  var miss = [];
  invRows_(st.getSheetByName("勤怠")).forEach(function(r){ if (dateKey_(r["日付"]) !== day) return; var id = r.staff_id, n = names[id] || "?";
    if (!hy[id + "|出勤"]) miss.push(n + "（出勤時）");
    if (String(r["状態"]) === "done" && !hy[id + "|退勤"]) miss.push(n + "（退勤時）"); });
  return miss.length ? [{ key: "hyg", level: "mid", title: opsLabel_(day) + " 衛生記録の付け忘れ " + miss.length + "件", detail: miss.join("・") + "。勤怠アプリの出勤・退勤で記録します", app: "staff" }] : [];
}

// ---- 今日の締め（売上があるのにレジ締めがない）----
function opsShimeAlerts_(day){
  var ss = SpreadsheetApp.getActiveSpreadsheet(); var tz; try { tz = ss.getSpreadsheetTimeZone() || "GMT"; } catch(e){ tz = "GMT"; }
  var sh = ss.getSheetByName("売上"), last = sh.getLastRow(), cnt = 0, sales = 0;
  if (last > 1){ var st0 = Math.max(2, last - 400 + 1); sh.getRange(st0, 1, last - st0 + 1, 5).getValues().forEach(function(r){ if (dateKey(r[0], tz) !== day || r[3] === "ERROR" || r[3] === "取消") return; cnt++; sales += Number(r[4])||0; }); }
  if (!cnt) return [];
  var ks = ss.getSheetByName("レジ締め"), done = false;
  if (ks && ks.getLastRow() > 1){ var s0 = Math.max(2, ks.getLastRow() - 30 + 1); ks.getRange(s0, 1, ks.getLastRow() - s0 + 1, 1).getValues().forEach(function(r){ if (dateKey_(r[0]) === day) done = true; }); }
  return done ? [] : [{ key: "shime", level: "high", title: opsLabel_(day) + " のレジ締めがまだです", detail: "売上 " + opsYen_(sales) + "（" + cnt + "会計）。勤怠アプリの「店の仕事」→「締め」から入力", app: "shime" }];
}

// ---- 人手不足（3週間先まで）----
function opsShortAlerts_(){ return stfShortDays_(21).map(function(x){ return { key: "short", level: "high", title: "人が足りない " + x.label, detail: (x.names.length ? x.names.join("・") : "シフトなし") + "｜" + x.why + (x.draft ? "（下書きを含む）" : ""), app: "staff" }; }); }

// まとめ（which: "order" | "evening" | "all"）。1つが失敗しても他は出す
function opsAlerts_(which){
  var today = opsDay_(new Date()), out = [], run = function(f){ try { out = out.concat(f()); } catch(e){ out.push({ key: "err", level: "mid", title: "確認の一部が動きませんでした", detail: String(e).slice(0,120), app: "" }); } };
  if (which === "order" || which === "all") run(opsOrderAlerts_);
  if (which === "evening" || which === "all"){
    run(opsShortAlerts_); run(opsCapAlerts_); run(opsRecAlerts_);
    var h = Number(Utilities.formatDate(new Date(), OPS_TZ, "H"));
    // 衛生記録・締めは閉店後（16時以降）に今日の分を見る。それより前は前営業日の分
    var day = h >= 16 ? today : opsAdd_(today, -1);
    run(function(){ return opsHygAlerts_(day); }); run(function(){ return opsShimeAlerts_(day); });
  }
  return out;
}
function opsMail_(list, subjHead){
  if (!list.length) return;
  var subj = "【洋食オリオン】" + subjHead + " " + list.length + "件（" + list.slice(0,3).map(function(x){ return x.title.replace(/（.*$/, "").slice(0,24); }).join("／") + (list.length > 3 ? " ほか" : "") + "）";
  var body = list.map(function(x){ return (x.level === "high" ? "■ " : "□ ") + x.title + "\n　" + String(x.detail||"").replace(/\n/g, "\n　"); }).join("\n\n")
    + "\n\n管理者アプリ：https://matsuoarashi.github.io/orion/kanri.html\n（自動で確認しています。該当がない日は送りません）";
  GmailApp.sendEmail(STF_NOTIFY_TO, subj, body, { name: "洋食オリオン" });
  try { linePush_("【洋食オリオン】" + subjHead + " " + list.length + "件\n\n" + body); } catch(e){}   // LINE にも（設定があるときだけ）
}
function opsNotifyOrder(){ opsMail_(opsAlerts_("order"), "発注の締切"); }
// 17時のまとめ（トリガー名は stfShortNotify のまま）
function stfShortNotify(){ opsMail_(opsAlerts_("evening"), "要確認"); }
function opsSetupTriggers(){
  ScriptApp.getProjectTriggers().forEach(function(t){ if (t.getHandlerFunction() === "opsNotifyOrder") ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger("opsNotifyOrder").timeBased().atHour(15).nearMinute(30).everyDays(1).inTimezone(OPS_TZ).create();
}
function opsAlertsOut_(p){
  var me = null; try { me = invAuth_(p); } catch(e){}
  if (!me || me.role !== "admin") return invOut_({ error: "auth" });
  return invOut_({ ok: true, at: Utilities.formatDate(new Date(), OPS_TZ, "yyyy/MM/dd HH:mm"), alerts: dashCached_("alerts", function(){ return opsAlerts_("all"); }) });   // 10分ごとの作り置き（dashcache.gs）
}
function opsTest(){ Logger.log(JSON.stringify({ all: opsAlerts_("all"), order1103: opsOrderAlerts_("2026/11/03", "15:30") })); }
// ===== 先出し通知 END =====
// ===== LINE 通知（公式アカウント「洋食オリオン」Messaging API）=====
// スクリプト プロパティ：LINE_TOKEN（チャネルアクセストークン。松尾さんが貼る）／LINE_TO（送り先のグループID）
// 送り先は管理者グループ。グループにアカウントを招待すると webhook で候補（LINE_CANDIDATES）に入り、linePickGroup() で決める
function lineProp_(k){ return PropertiesService.getScriptProperties().getProperty(k) || ""; }
function linePush_(text){
  var token = lineProp_("LINE_TOKEN"), to = lineProp_("LINE_TO"); if (!token || !to) return false;
  var res = UrlFetchApp.fetch("https://api.line.me/v2/bot/message/push", { method: "post", contentType: "application/json", muteHttpExceptions: true,
    headers: { Authorization: "Bearer " + token }, payload: JSON.stringify({ to: to, messages: [{ type: "text", text: String(text).slice(0, 4900) }] }) });
  return res.getResponseCode() === 200;
}
// webhook：グループ・トークルームの ID を候補として控えるだけ（ここでは送り先を変えない）
function lineWebhook_(d){
  var props = PropertiesService.getScriptProperties(); var c = {}; try { c = JSON.parse(props.getProperty("LINE_CANDIDATES") || "{}"); } catch(e){}
  (d.events || []).forEach(function(ev){ var s = ev.source || {}; var id = s.groupId || s.roomId; if (!id) return;
    c[id] = { type: s.type, event: ev.type, at: Utilities.formatDate(new Date(), "Asia/Tokyo", "yyyy/MM/dd HH:mm") }; });
  props.setProperty("LINE_CANDIDATES", JSON.stringify(c));
}
// エディタで実行：いちばん新しい候補グループを送り先にして、テストを送る
function linePickGroup(){
  var token = lineProp_("LINE_TOKEN"); if (!token) throw new Error("LINE_TOKEN が未設定です");
  var c = {}; try { c = JSON.parse(lineProp_("LINE_CANDIDATES") || "{}"); } catch(e){}
  var ids = Object.keys(c).sort(function(a, b){ return c[a].at < c[b].at ? 1 : -1; }); if (!ids.length) throw new Error("グループの候補がありません。グループにアカウントを招待し、何か1回発言してください");
  var id = ids[0], name = "";
  if (c[id].type === "group"){ var r = UrlFetchApp.fetch("https://api.line.me/v2/bot/group/" + id + "/summary", { headers: { Authorization: "Bearer " + token }, muteHttpExceptions: true }); try { name = JSON.parse(r.getContentText()).groupName || ""; } catch(e){} }
  PropertiesService.getScriptProperties().setProperty("LINE_TO", id);
  var ok = linePush_("洋食オリオンの通知をこのグループに送ります。\n15:30 発注の締切／17:00 要確認（人手不足・年収の壁・衛生記録・締め）。該当がない日は送りません。");
  Logger.log(JSON.stringify({ to: id, name: name, sent: ok }));
}
function lineTest(){ Logger.log(linePush_("テスト：洋食オリオンの通知です")); }
// ===== LINE 通知 END =====

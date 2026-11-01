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
  var wage = {}; invRows_(st.getSheetByName("スタッフ")).forEach(function(r){ wage[r.staff_id] = Number(r["時給"]) || defW; });
  var out = {};
  invRows_(st.getSheetByName("勤怠")).forEach(function(r){
    if (String(r["状態"]) !== "done") return; var d = dateKey_(r["日付"]); if (!d) return;
    var min = Number(r["実労働分"])||0, w = wage[r.staff_id] || defW;
    var pay = Math.min(min, otMin)/60*w + Math.max(0, min-otMin)/60*w*otRate;
    var o = out[d] = out[d] || {staff:0, minutes:0, cost:0};
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
    var sh = byDate[d] || []; var req = (nd && Number(nd["必要人数"])) || 2;
    var hasK = !kitchen.length || sh.some(function(x){ return kitchen.indexOf(x.staff_id) >= 0; }), hasH = sh.some(function(x){ return kitchen.indexOf(x.staff_id) < 0; });
    var why = []; if (sh.length < req) why.push(sh.length + "人／必要" + req + "人"); if (sh.length && kitchen.length && !hasK) why.push("厨房がいない"); if (sh.length && !hasH) why.push("ホールがいない");
    if (why.length) out.push({ date:d, label: d.slice(5) + "(" + YO[dow] + ")", names: sh.map(function(x){ return names[x.staff_id] || "?"; }), why: why.join("・"), draft: sh.some(function(x){ return String(x["状態"]) !== "confirmed"; }) });
  }
  return out;
}
function stfShortNotify(){
  var list = stfShortDays_(21); if (!list.length) return;
  var subj = "【洋食オリオン】人が足りない日 " + list.length + "件（" + list.map(function(x){ return x.label; }).join("・") + "）";
  var body = "今日から3週間先までのシフトで、人が足りない日があります。\n\n" + list.map(function(x){ return "・" + x.label + "　" + (x.names.length ? x.names.join("・") : "シフトなし") + "　" + x.why + (x.draft ? "（下書きを含む）" : ""); }).join("\n")
    + "\n\nシフトの調整：管理者アプリ → スタッフ → シフト\nhttps://matsuoarashi.github.io/orion/kanri.html#staff\n\n（毎日17時に自動で確認しています。足りない日がなければ送りません）";
  GmailApp.sendEmail(STF_NOTIFY_TO, subj, body, { name: "洋食オリオン" });
}
function stfSetupTrigger(){
  ScriptApp.getProjectTriggers().forEach(function(t){ if (t.getHandlerFunction() === "stfShortNotify") ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger("stfShortNotify").timeBased().atHour(17).everyDays(1).inTimezone("Asia/Tokyo").create();
}
// ===== 人手・人件費 END =====

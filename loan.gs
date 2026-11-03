// ===== LOAN v1（借入と返済予定・2026/11/03）=====
// 公庫などの借入を「借入契約」タブ（1契約1行）と「借入返済」タブ（1回1行）で持つ。
// 金額・返済表は GitHub に書かない。条件は「借入契約」タブにだけ入れ、返済表は loanBuild() でそこから作る。
// 作り方（元金均等）：初回元金・毎回元金を順に返す。利息＝前回残高×年利×日数÷365（円未満切り捨て）。
//   日数＝前回の返済日の翌日から今回の返済日まで（初回だけ融資日当日も数える）。返済日は毎月末（土日祝は翌営業日の引落し）。
// 状態：予定（未確認）／確認済み／不一致。実際の引落しは管理者が入れるまで「予定（未確認）」のまま。
// 取り付け：ORION OS END の下に置く。facts.gs の handleOsGet / handleOsPost に1行ずつ（os_loan_ で始まる mode / type をここへ）。
//   opsAlerts_ の "evening" に run(opsLoanAlerts_) を1行。

var LOAN_C = "借入契約";
var LOAN_C_COLS = ["loan_id","店舗","契約名","借入先","借入額","年利(%)","融資日","手取り額","初回元金","毎回元金","回数","初回返済日","最終返済日","出典","メモ","登録日時"];
var LOAN_R = "借入返済";
var LOAN_R_COLS = ["row_id","loan_id","回","予定日","元金","利息","返済額","返済後残高","日割日数","状態","実際の引落日","実際の額","確認者","確認日時","メモ","作成日時"];

function loanSheet_(name, cols){
  var ss = SpreadsheetApp.getActiveSpreadsheet(); var sh = ss.getSheetByName(name);
  if (!sh){ sh = ss.insertSheet(name); sh.getRange(1,1,1,cols.length).setValues([cols]).setFontWeight("bold"); sh.setFrozenRows(1); }
  return sh;
}
function loanRows_(name, cols){
  var sh = loanSheet_(name, cols); var n = sh.getLastRow(); if (n < 2) return [];
  var lc = sh.getLastColumn(); var hdr = sh.getRange(1,1,1,lc).getValues()[0].map(String);
  return sh.getRange(2,1,n-1,lc).getValues().map(function(v, i){ var o = { _row: i+2 }; hdr.forEach(function(h, j){ o[h] = v[j]; }); return o; });
}
function loanYmd_(v){ if (v instanceof Date) return Utilities.formatDate(v, "Asia/Tokyo", "yyyy/MM/dd"); var s = String(v||"").trim().replace(/-/g,"/"); var m = s.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})/); return m ? m[1]+"/"+("0"+m[2]).slice(-2)+"/"+("0"+m[3]).slice(-2) : ""; }
function loanD_(s){ var a = loanYmd_(s).split("/").map(Number); return new Date(Date.UTC(a[0], a[1]-1, a[2])); }
function loanDays_(a, b){ return Math.round((loanD_(b) - loanD_(a)) / 86400000); }
function loanMonthEnd_(y, m){ var d = new Date(Date.UTC(y, m, 0)); return Utilities.formatDate(d, "UTC", "yyyy/MM/dd"); } // m=1..12

// 契約1行から返済表を作る（シートには書かない）
function loanSchedule_(c){
  var amt = Number(c["借入額"]), rate = Number(c["年利(%)"]), n = Number(c["回数"]);
  var p1 = Number(c["初回元金"]), pm = Number(c["毎回元金"]);
  var start = loanYmd_(c["融資日"]), first = loanYmd_(c["初回返済日"]);
  if (!amt || !n || !pm || !start || !first) throw new Error("借入契約の項目が足りません: " + c["loan_id"]);
  var fy = Number(first.slice(0,4)), fm = Number(first.slice(5,7));
  var out = [], bal = amt, prev = start;
  for (var i = 1; i <= n; i++){
    var mm = fm - 1 + (i - 1); var due = loanMonthEnd_(fy + Math.floor(mm / 12), (mm % 12) + 1);
    var days = loanDays_(prev, due) + (i === 1 ? 1 : 0);
    var interest = Math.floor(bal * rate * days / 36500 + 1e-9);
    var pr = i === 1 ? p1 : (i === n ? bal : pm); pr = Math.min(pr, bal);
    bal -= pr; out.push({ n: i, due: due, principal: pr, interest: interest, payment: pr + interest, balance: bal, days: days }); prev = due;
  }
  return out;
}

// 検算：契約ごとに 回数・元金合計・残高0・最終日 を確かめる（エディタで実行、結果はログ）
function loanVerify(){
  var res = loanRows_(LOAN_C, LOAN_C_COLS).filter(function(c){ return c["loan_id"]; }).map(function(c){
    var s = loanSchedule_(c), sumP = s.reduce(function(a,x){ return a + x.principal; }, 0), sumI = s.reduce(function(a,x){ return a + x.interest; }, 0);
    var ng = [];
    if (s.length !== Number(c["回数"])) ng.push("回数");
    if (sumP !== Number(c["借入額"])) ng.push("元金合計 " + sumP);
    if (s[s.length-1].balance !== 0) ng.push("最終残高 " + s[s.length-1].balance);
    if (c["最終返済日"] && s[s.length-1].due !== loanYmd_(c["最終返済日"])) ng.push("最終日 " + s[s.length-1].due);
    return { id: c["loan_id"], name: String(c["契約名"]), count: s.length, principal: sumP, interest: sumI, last: s[s.length-1].due, ng: ng };
  });
  Logger.log(JSON.stringify(res, null, 1)); return res;
}

// 返済表を「借入返済」に書く。何度実行しても重複しない（loan_id×回 が既にあれば、予定の数字だけ確かめて触らない）
function loanBuild(){
  var sh = loanSheet_(LOAN_R, LOAN_R_COLS); var have = {};
  loanRows_(LOAN_R, LOAN_R_COLS).forEach(function(r){ have[r["loan_id"] + "#" + r["回"]] = r; });
  var add = [], diff = [];
  loanRows_(LOAN_C, LOAN_C_COLS).filter(function(c){ return c["loan_id"]; }).forEach(function(c){
    loanSchedule_(c).forEach(function(x){
      var k = c["loan_id"] + "#" + x.n, h = have[k];
      if (h){ if (Number(h["返済額"]) !== x.payment || Number(h["返済後残高"]) !== x.balance) diff.push(k); return; }
      add.push({ row_id: k, loan_id: c["loan_id"], "回": x.n, "予定日": "'" + x.due, "元金": x.principal, "利息": x.interest, "返済額": x.payment, "返済後残高": x.balance, "日割日数": x.days, "状態": "予定（未確認）", "作成日時": invNow_() });
    });
  });
  add.forEach(function(o){ invAppend_(sh, o); });
  Logger.log("追加 " + add.length + " 行 / 既存と違う " + diff.length + " 行 " + diff.join(","));
  return { added: add.length, diff: diff };
}

// 画面用：契約と返済の一覧、月ごとの合計、今日時点の残高
function loanPayload_(){
  var today = Utilities.formatDate(new Date(), "Asia/Tokyo", "yyyy/MM/dd");
  var cs = loanRows_(LOAN_C, LOAN_C_COLS).filter(function(c){ return c["loan_id"]; });
  var rs = loanRows_(LOAN_R, LOAN_R_COLS).filter(function(r){ return r["loan_id"]; }).map(function(r){
    return { id: String(r["row_id"]), loan: String(r["loan_id"]), n: Number(r["回"]), due: loanYmd_(r["予定日"]), principal: Number(r["元金"])||0, interest: Number(r["利息"])||0, payment: Number(r["返済額"])||0, balance: Number(r["返済後残高"])||0,
      status: String(r["状態"]||"予定（未確認）"), paidOn: loanYmd_(r["実際の引落日"]), paidAmt: r["実際の額"] === "" ? null : Number(r["実際の額"]), by: String(r["確認者"]||"") };
  });
  var contracts = cs.map(function(c){
    var mine = rs.filter(function(r){ return r.loan === String(c["loan_id"]); }).sort(function(a,b){ return a.n - b.n; });
    var done = mine.filter(function(r){ return r.due <= today; }), nxt = mine.filter(function(r){ return r.due > today; })[0] || null;
    var amt = Number(c["借入額"])||0;
    return { id: String(c["loan_id"]), name: String(c["契約名"]), lender: String(c["借入先"]), amount: amt, rate: Number(c["年利(%)"])||0, start: loanYmd_(c["融資日"]), net: Number(c["手取り額"])||amt,
      first: loanYmd_(c["初回返済日"]), last: loanYmd_(c["最終返済日"]), count: Number(c["回数"])||mine.length,
      balanceScheduled: done.length ? done[done.length-1].balance : amt,            // 予定どおりなら今日の残高
      balanceConfirmed: (function(){ var ok = mine.filter(function(r){ return r.status === "確認済み"; }); return ok.length ? ok[ok.length-1].balance : amt; })(),
      next: nxt, unconfirmed: done.filter(function(r){ return r.status !== "確認済み"; }).length };
  });
  var months = {};
  rs.forEach(function(r){ var k = r.due.slice(0,7); var m = months[k] || (months[k] = { principal: 0, interest: 0, payment: 0, unconfirmed: 0 }); m.principal += r.principal; m.interest += r.interest; m.payment += r.payment; if (r.status !== "確認済み") m.unconfirmed++; });
  return { today: today, contracts: contracts, rows: rs, months: months };
}

// 管理者が実際の引落しを入れる（予定と金額が違えば「不一致」）
function loanConfirm_(d, me){
  if (me.role !== "admin") return { error: "管理者のみ" };
  var sh = loanSheet_(LOAN_R, LOAN_R_COLS); var r = loanRows_(LOAN_R, LOAN_R_COLS).filter(function(x){ return String(x["row_id"]) === String(d.id); })[0];
  if (!r) return { error: "見つかりません" };
  var amt = d.amount === "" || d.amount === undefined ? Number(r["返済額"]) : Number(d.amount);
  var on = loanYmd_(d.date); if (!on) return { error: "引落日がありません" };
  var st = amt === Number(r["返済額"]) ? "確認済み" : "不一致";
  var hdr = sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0].map(String);
  var set = function(h, v){ var j = hdr.indexOf(h); if (j >= 0) sh.getRange(r._row, j+1).setValue(v); };
  set("状態", st); set("実際の引落日", "'" + on); set("実際の額", amt); set("確認者", me.name); set("確認日時", invNow_()); if (d.memo) set("メモ", String(d.memo));
  return { ok: true, status: st };
}

// 今朝の確認：予定日を過ぎて未確認・不一致の回（引落しは翌営業日になるので予定日の3日後から出す）
function opsLoanAlerts_(){
  var today = Utilities.formatDate(new Date(), "Asia/Tokyo", "yyyy/MM/dd"); var out = [];
  var lim = Utilities.formatDate(new Date(Date.now() - 3*86400000), "Asia/Tokyo", "yyyy/MM/dd");
  var p = loanPayload_(); var names = {}; p.contracts.forEach(function(c){ names[c.id] = c.name; });
  var late = p.rows.filter(function(r){ return r.due <= lim && r.status !== "確認済み"; });
  if (late.length) out.push({ key: "loan", level: late.some(function(r){ return r.status === "不一致"; }) ? "high" : "mid",
    title: "借入の返済が未確認（" + late.length + "件）", detail: late.slice(0,4).map(function(r){ return (names[r.loan]||r.loan) + " 第" + r.n + "回 " + r.due + " " + r.payment.toLocaleString() + "円（" + r.status + "）"; }).join("\n"), app: "dash" });
  return out;
}

function loanGet_(mode, me, p){
  if (!/^os_loan_/.test(mode)) return null;
  if (me.role !== "admin") return { error: "管理者のみ" };
  if (mode === "os_loan_get") return loanPayload_();
  return { error: "unknown mode" };
}
function loanPost_(d, me){
  if (d.type === "os_loan_confirm") return loanConfirm_(d, me);
  return { error: "unknown type" };
}
// ===== LOAN END =====

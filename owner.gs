// ===== OWNER v1（公式 LINE「洋食オリオン」からオーナーへの配信）=====
// 取り付け：GBP END の下に丸ごと。facts.gs の handleOsGet / handleOsPost に1行ずつ（os_owner_）、staffing.gs の lineWebhook_ に1行（1対1のトークを ownerWebhook_ へ）
// しくみ：管理者アプリで配信先（名前）を作る → 6桁の登録コードが出る → オーナーが公式 LINE を友だち追加して「登録 123456」と送る → 有効
// 配信：日次（営業日の16時：その日の売上・食数・出来事・口コミ・やること）／週次（月曜8時：先週のまとめ）／即時（星2以下の口コミ）
// オーナーが「今日」「今週」と送ると、その場でまとめを返す（返信は無料枠）。「停止」で配信を止める
// 注意：プッシュ送信は LINE の無料枠（月200通）を数える。日次×人数＋週次＋管理者グループの通知の合計で見る
var OWN_SHEET = "LINE配信先";
var OWN_COLS = ["dest_id","名前","店舗","LINE_ID","状態","日次","週次","即時","登録コード","コード期限","登録日時","最終送信","メモ"];
// 状態: 招待中／有効／停止   日次・週次・即時: ○／空

function ownSheet_(){ return osSheet_(OWN_SHEET, OWN_COLS); }
function ownOut_(r){ var lid = String(r["LINE_ID"]||""); return { id:String(r.dest_id), name:String(r["名前"]), store:String(r["店舗"]||"kanda"), linked:!!lid, lineTail: lid ? lid.slice(-4) : "",
  status:String(r["状態"]), daily:String(r["日次"]) === "○", weekly:String(r["週次"]) === "○", instant:String(r["即時"]) === "○",
  code: String(r["状態"]) === "招待中" ? String(r["登録コード"]).replace(/^'/, "") : "", codeUntil:String(r["コード期限"]||"").replace(/^'/, ""), last:String(r["最終送信"]||""), memo:String(r["メモ"]||"") }; }
function ownPush_(to, text){
  var token = lineProp_("LINE_TOKEN"); if (!token || !to) return false;
  var res = UrlFetchApp.fetch("https://api.line.me/v2/bot/message/push", { method:"post", contentType:"application/json", muteHttpExceptions:true,
    headers:{ Authorization:"Bearer " + token }, payload: JSON.stringify({ to:to, messages:[{ type:"text", text:String(text).slice(0, 4900) }] }) });
  return res.getResponseCode() === 200;
}
function ownReply_(replyToken, text){
  var token = lineProp_("LINE_TOKEN"); if (!token || !replyToken) return false;
  UrlFetchApp.fetch("https://api.line.me/v2/bot/message/reply", { method:"post", contentType:"application/json", muteHttpExceptions:true,
    headers:{ Authorization:"Bearer " + token }, payload: JSON.stringify({ replyToken:replyToken, messages:[{ type:"text", text:String(text).slice(0, 4900) }] }) });
  return true;
}
function ownSendTo_(kind, text){ // kind: 日次／週次／即時
  var sh = ownSheet_(), n = 0, now = invNow_();
  invRows_(sh).forEach(function(r){ if (String(r["状態"]) !== "有効" || String(r[kind]) !== "○" || !r["LINE_ID"]) return;
    if (ownPush_(String(r["LINE_ID"]), text)){ n++; invSet_(sh, r._row, "最終送信", now + " " + kind); } });
  return n;
}

// ---------- webhook（1対1のトーク）----------
function ownerWebhook_(ev){
  if (ev.type === "follow"){ ownReply_(ev.replyToken, "洋食オリオンです。オーナー向けの配信を受け取るには、管理者から届いた6桁のコードを「登録 123456」の形で送ってください。"); return; }
  if (ev.type !== "message" || !ev.message || ev.message.type !== "text") return;
  var uid = (ev.source||{}).userId, text = String(ev.message.text||"").trim().replace(/[０-９]/g, function(c){ return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); });
  var sh = ownSheet_(), rows = invRows_(sh), mine = rows.filter(function(r){ return String(r["LINE_ID"]) === uid && String(r["状態"]) !== "停止"; })[0];
  var m = text.match(/^登録\s*(\d{6})$/);
  if (m){
    var hit = rows.filter(function(r){ return String(r["状態"]) === "招待中" && String(r["登録コード"]).replace(/^'/, "") === m[1]; })[0];
    if (!hit){ ownReply_(ev.replyToken, "コードが見つかりません。管理者に新しいコードを出してもらってください。"); return; }
    if (String(hit["コード期限"]).replace(/^'/, "") < invToday_()){ ownReply_(ev.replyToken, "コードの期限が切れています。管理者に新しいコードを出してもらってください。"); return; }
    invSet_(sh, hit._row, "LINE_ID", uid); invSet_(sh, hit._row, "状態", "有効"); invSet_(sh, hit._row, "登録コード", ""); invSet_(sh, hit._row, "登録日時", invNow_());
    ownReply_(ev.replyToken, hit["名前"] + "さん、登録しました。\n" + [String(hit["日次"]) === "○" ? "・営業日の16時：その日のまとめ" : "", String(hit["週次"]) === "○" ? "・月曜8時：先週のまとめ" : "", String(hit["即時"]) === "○" ? "・星2以下の口コミが入ったとき" : ""].filter(String).join("\n") + "\n\n「今日」「今週」と送ると、その場でまとめを返します。「停止」で配信を止めます。");
    return;
  }
  if (!mine){ ownReply_(ev.replyToken, "このアカウントはまだ登録されていません。管理者から届いた6桁のコードを「登録 123456」の形で送ってください。"); return; }
  if (/^(今日|きょう)$/.test(text)){ ownReply_(ev.replyToken, ownerDailyText_(invToday_())); return; }
  if (/^(今週|先週|週)$/.test(text)){ ownReply_(ev.replyToken, ownerWeeklyText_(text === "今週")); return; }
  if (/^停止$/.test(text)){ invSet_(sh, mine._row, "状態", "停止"); ownReply_(ev.replyToken, "配信を止めました。再開は管理者に伝えてください。"); return; }
  ownReply_(ev.replyToken, "「今日」「今週」「先週」と送ると、まとめを返します。");
}

// ---------- まとめの中身 ----------
function ownSales_(from, to){ // 売上シート：日付・状態（取消を除く）・金額・品目（オリオン／ナシナシ×数）・支払
  var ss = SpreadsheetApp.getActiveSpreadsheet(), sv = ss.getSheetByName("売上"), days = {};
  var last = sv.getLastRow(); if (last < 2) return days; var st = Math.max(2, last - 3000);
  sv.getRange(st, 1, last - st + 1, 26).getValues().forEach(function(r){ var d = dateKey_(r[0]); if (!d || d < from || d > to) return; if (String(r[3]) === "取消" || r[3] === "ERROR") return;
    var o = days[d] = days[d] || { sales:0, count:0, meals:0, paypay:0 }; var a = Number(r[4])||0; o.sales += a; o.count++; if (/PayPay/i.test(String(r[25]||""))) o.paypay += a;
    var m = String(r[7]||"").match(/(オリオン|ナシナシ)[^,、]*?[×x](\d+)/g); if (m) m.forEach(function(x){ o.meals += Number((x.match(/(\d+)$/)||[0,0])[1]); }); });
  return days;
}
function ownYen_(n){ return (Math.round(n)||0).toLocaleString() + "円"; }
function ownDiff_(a, b, unit){ if (!b) return ""; var d = a - b; return "（先週の同じ曜日 " + (d >= 0 ? "+" : "") + (unit === "円" ? ownYen_(d) : d + unit) + "）"; }
function ownerDailyText_(day){
  var lw = osAddDays_(day, -7), s = ownSales_(lw, day), t = s[day] || { sales:0, count:0, meals:0, paypay:0 }, p = s[lw] || null;
  var L = ["【洋食オリオン】" + day.slice(5) + " のまとめ"];
  if (!t.count) L.push("売上の記録はまだありません。");
  else L.push("食数 " + t.meals + "食" + (p ? ownDiff_(t.meals, p.meals, "食") : ""), "売上 " + ownYen_(t.sales) + (p ? ownDiff_(t.sales, p.sales, "円") : ""), "会計 " + t.count + "件・1食あたり " + ownYen_(t.sales / Math.max(1, t.meals)) + "・PayPay " + ownYen_(t.paypay));
  try { var ev = invRows_(evSheet_()).filter(function(r){ return todoD_(r["日付"]) === day && String(r["状態"]||"有効") === "有効"; });
    if (ev.length){ L.push("", "今日の出来事"); ev.slice(0, 6).forEach(function(r){ L.push("・" + [String(r["種類"]||""), String(r["本文"]||"")].filter(String).join("：")); }); } } catch(e){}
  try { var rv = invRows_(osSheet_(GBP_REV, GBP_REV_COLS)).map(gbpRevOut_), nw = rv.filter(function(x){ return x.at.slice(0, 10) === day; }), wait = rv.filter(function(x){ return x.status === "新着" || x.status === "下書き済"; });
    if (nw.length || wait.length){ L.push("", "口コミ"); if (nw.length) L.push("・今日の新着 " + nw.length + "件（" + nw.map(function(x){ return "★" + x.star; }).join("・") + "）"); if (wait.length) L.push("・返信待ち " + wait.length + "件"); } } catch(e){}
  try { var td = invRows_(todoSheet_()).map(todoOut_), over = td.filter(function(x){ return x.status === "未" && x.due && x.due < day; }), doneT = td.filter(function(x){ return x.status === "済" && x.doneAt.slice(0, 10) === day; });
    if (over.length || doneT.length){ L.push("", "やること"); if (doneT.length) L.push("・今日済んだもの " + doneT.length + "件"); if (over.length) L.push("・期限を過ぎたもの " + over.length + "件（" + over.slice(0, 3).map(function(x){ return x.text.slice(0, 14); }).join("／") + "）"); } } catch(e){}
  return L.join("\n");
}
function ownerWeeklyText_(thisWeek){
  var today = invToday_(), a = today.split("/").map(Number), dw = new Date(a[0], a[1]-1, a[2]).getDay(), mon = osAddDays_(today, -((dw + 6) % 7) - (thisWeek ? 0 : 7));
  var sun = osAddDays_(mon, 6), pmon = osAddDays_(mon, -7), s = ownSales_(pmon, sun), cur = { sales:0, meals:0, count:0, days:0 }, prev = { sales:0, meals:0, days:0 }, lines = [];
  Object.keys(s).sort().forEach(function(k){ var o = s[k]; if (k >= mon){ cur.sales += o.sales; cur.meals += o.meals; cur.count += o.count; cur.days++; var b = k.split("/").map(Number);
      lines.push("・" + k.slice(5) + "（" + ["日","月","火","水","木","金","土"][new Date(b[0], b[1]-1, b[2]).getDay()] + "）" + o.meals + "食 " + ownYen_(o.sales)); }
    else { prev.sales += o.sales; prev.meals += o.meals; prev.days++; } });
  var L = ["【洋食オリオン】" + (thisWeek ? "今週" : "先週") + "（" + mon.slice(5) + "〜" + sun.slice(5) + "）のまとめ"];
  if (!cur.days) L.push("売上の記録はありません。");
  else { L.push("食数 " + cur.meals + "食（1日平均 " + Math.round(cur.meals / cur.days) + "食）" + (prev.days ? "／前の週 " + prev.meals + "食" : ""), "売上 " + ownYen_(cur.sales) + (prev.days ? "／前の週 " + ownYen_(prev.sales) : ""), "営業 " + cur.days + "日・1食あたり " + ownYen_(cur.sales / Math.max(1, cur.meals)));
    L.push("", "日ごと"); L = L.concat(lines); }
  try { var ev = invRows_(evSheet_()).filter(function(r){ var d = todoD_(r["日付"]); return d >= mon && d <= sun && String(r["状態"]||"有効") === "有効"; }), kc = {};
    ev.forEach(function(r){ String(r["種類"]||"").split("・").filter(String).forEach(function(k){ kc[k] = (kc[k]||0) + 1; }); });
    if (ev.length) L.push("", "出来事 " + ev.length + "件" + (Object.keys(kc).length ? "（" + Object.keys(kc).map(function(k){ return k + " " + kc[k]; }).join("・") + "）" : "")); } catch(e){}
  try { var rv = invRows_(osSheet_(GBP_REV, GBP_REV_COLS)).map(gbpRevOut_).filter(function(x){ var d = x.at.slice(0, 10); return d >= mon && d <= sun; });
    if (rv.length){ var tg = {}; rv.forEach(function(x){ x.tags.forEach(function(g){ tg[g] = (tg[g]||0) + 1; }); });
      L.push("口コミ " + rv.length + "件・平均★" + (Math.round(rv.reduce(function(s2, x){ return s2 + x.star; }, 0) / rv.length * 10) / 10) + (Object.keys(tg).length ? "（指摘：" + Object.keys(tg).map(function(k){ return k + " " + tg[k]; }).join("・") + "）" : "")); } } catch(e){}
  try { var td = invRows_(todoSheet_()).map(todoOut_), dn = td.filter(function(x){ var d = x.doneAt.slice(0, 10); return x.status === "済" && d >= mon && d <= sun; }).length, ov = td.filter(function(x){ return x.status === "未" && x.due && x.due < today; }).length;
    if (dn || ov) L.push("やること 済 " + dn + "件" + (ov ? "・期限切れ " + ov + "件" : "")); } catch(e){}
  return L.join("\n");
}
// 即時：星2以下の新しい口コミ（gbp.gs から呼ぶ）
function ownerReviewNotify_(ids){
  var rv = invRows_(osSheet_(GBP_REV, GBP_REV_COLS)).map(gbpRevOut_).filter(function(x){ return ids.indexOf(x.id) >= 0 && x.star && x.star <= 2; });
  if (!rv.length) return 0;
  return ownSendTo_("即時", "【洋食オリオン】星" + rv.map(function(x){ return x.star; }).join("・") + " の口コミが入りました\n\n" + rv.map(function(x){ return "★" + x.star + " " + (x.name||"") + "\n" + x.text.slice(0, 200); }).join("\n\n") + "\n\n返信は管理者アプリ「口コミ」から（店長名で返します）");
}

// ---------- トリガー ----------
function ownerDailySend(){ var day = invToday_(); try { var isOpen = opsOpenFn_(stfSettings_(SpreadsheetApp.openById(INV_STAFF_SS))); if (!isOpen(day)) return; } catch(e){} ownSendTo_("日次", ownerDailyText_(day)); }
function ownerWeeklySend(){ ownSendTo_("週次", ownerWeeklyText_(false)); }
function ownerSetupTriggers(){
  ScriptApp.getProjectTriggers().forEach(function(t){ if (["ownerDailySend","ownerWeeklySend"].indexOf(t.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger("ownerDailySend").timeBased().atHour(16).nearMinute(0).everyDays(1).inTimezone("Asia/Tokyo").create();
  ScriptApp.newTrigger("ownerWeeklySend").timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(8).inTimezone("Asia/Tokyo").create();
}

// ---------- 管理者アプリから ----------
function ownerGet_(mode, me, p){
  if (me.role !== "admin") return { error: "管理者のみ" };
  if (mode === "os_owner_list"){
    var info = null, tok = lineProp_("LINE_TOKEN");
    if (tok){ try { var c = CacheService.getScriptCache(), h = c.get("line_info"); if (h) info = JSON.parse(h); else { var r = UrlFetchApp.fetch("https://api.line.me/v2/bot/info", { headers:{ Authorization:"Bearer " + tok }, muteHttpExceptions:true }); if (r.getResponseCode() === 200){ info = JSON.parse(r.getContentText()); c.put("line_info", JSON.stringify(info), 3600); } } } catch(e){} }
    return { ok:true, lineReady:!!tok, groupReady:!!lineProp_("LINE_TO"), basicId: info ? info.basicId : "", botName: info ? info.displayName : "", list: invRows_(ownSheet_()).map(ownOut_) };
  }
  if (mode === "os_owner_preview") return { ok:true, text: String(p.kind) === "週次" ? ownerWeeklyText_(false) : ownerDailyText_(String(p.date||invToday_())) };
  return { error: "unknown mode" };
}
function ownerPost_(d, me){
  if (me.role !== "admin") return { error: "管理者のみ" };
  var t = String(d.type), sh = ownSheet_(), now = invNow_();
  var row = function(){ var r = invRows_(sh).filter(function(x){ return String(x.dest_id) === String(d.id); })[0]; if (!r) throw new Error("見つかりません"); return r; };
  var code = function(){ return String(100000 + Math.floor(Math.random() * 900000)); }, until = osAddDays_(invToday_(), 7);
  if (t === "os_owner_add"){ var name = String(d.name||"").trim().slice(0, 30); if (!name) return { error: "名前を入れてください" }; var c1 = code(), id = invId_("ow_");
    invAppend_(sh, { dest_id:id, "名前":name, "店舗":String(d.store||"kanda"), "LINE_ID":"", "状態":"招待中", "日次":"○", "週次":"○", "即時":"○", "登録コード":"'" + c1, "コード期限":"'" + until, "登録日時":"", "最終送信":"", "メモ":String(d.memo||"") });
    return { ok:true, id:id, code:c1, until:until }; }
  if (t === "os_owner_set"){ var r = row(); ["日次","週次","即時"].forEach(function(k){ var key = { "日次":"daily", "週次":"weekly", "即時":"instant" }[k]; if (d[key] !== undefined) invSet_(sh, r._row, k, d[key] ? "○" : ""); });
    if (d.status){ var st = String(d.status); if (["有効","停止"].indexOf(st) < 0) return { error: "状態が不正" }; if (st === "有効" && !r["LINE_ID"]) return { error: "まだ LINE で登録されていません" }; invSet_(sh, r._row, "状態", st); }
    return { ok:true }; }
  if (t === "os_owner_code"){ var r2 = row(), c2 = code(); invSet_(sh, r2._row, "状態", "招待中"); invSet_(sh, r2._row, "LINE_ID", ""); invSet_(sh, r2._row, "登録コード", "'" + c2); invSet_(sh, r2._row, "コード期限", "'" + until); return { ok:true, code:c2, until:until }; }
  if (t === "os_owner_test"){ var r3 = row(); if (!r3["LINE_ID"]) return { error: "まだ LINE で登録されていません" }; var ok = ownPush_(String(r3["LINE_ID"]), "【洋食オリオン】テスト送信です。届いていれば設定は完了です。"); return ok ? { ok:true } : { error: "送れませんでした（LINE_TOKEN を確認）" }; }
  if (t === "os_owner_send"){ var kind = String(d.kind) === "週次" ? "週次" : "日次"; var n = ownSendTo_(kind, kind === "週次" ? ownerWeeklyText_(false) : ownerDailyText_(invToday_())); return { ok:true, sent:n }; }
  return { error: "unknown type" };
}
// ===== OWNER END =====

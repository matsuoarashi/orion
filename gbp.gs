// ===== GBP v1（Google ビジネスプロフィール：口コミ・プロフィール・数字）=====
// 取り付け：TODO END の下に丸ごと。facts.gs の handleOsGet / handleOsPost に1行ずつ（os_gbp_）、staffing.gs の opsAlerts_ に run(gbpAlerts_)
// 前提（B案＝API）：Google の Business Profile API の利用申請が承認されていること。承認前は呼び出しが 429 になるので、
//   口コミは「手入力」（管理者が本文を貼る）で回し、下書き・承認・返信済みの記録は同じ画面で行う
// 認証：この Apps Script の持ち主のアカウントの OAuth（appsscript.json の oauthScopes に business.manage）。持ち主をプロフィールの管理者に追加しておく
// スクリプト プロパティ：GBP_ACCOUNT（accounts/数字）・GBP_LOCATION（locations/数字）。エディタで gbpSetup() を1回実行すると入る
// 原則：AI は下書きと指摘の分類まで。Google への返信・営業時間・説明文の変更は、管理者が画面で「承認して送る」ときだけ
var GBP_REV = "口コミ";
var GBP_REV_COLS = ["rev_id","店舗","出所","google_id","投稿者","星","本文","投稿日時","更新日時","Google返信","Google返信日時","下書き","下書き日時","状態","指摘","承認者","送信日時","送信結果","メモ","取込日時"];
// 出所: API／手入力   状態: 新着／下書き済／返信済／返信しない
var GBP_PERF = "Googleの数字";
var GBP_PERF_COLS = ["日付","店舗","検索(PC)","検索(スマホ)","マップ(PC)","マップ(スマホ)","ルート","電話","ウェブ","出所","取込日時"];
// 日付：API は日ごと（yyyy/MM/dd）、手入力は月ごと（yyyy/MM）
var GBP_METRICS = [["BUSINESS_IMPRESSIONS_DESKTOP_SEARCH","検索(PC)"],["BUSINESS_IMPRESSIONS_MOBILE_SEARCH","検索(スマホ)"],["BUSINESS_IMPRESSIONS_DESKTOP_MAPS","マップ(PC)"],["BUSINESS_IMPRESSIONS_MOBILE_MAPS","マップ(スマホ)"],["BUSINESS_DIRECTION_REQUESTS","ルート"],["CALL_CLICKS","電話"],["WEBSITE_CLICKS","ウェブ"]];
var GBP_TAGS = ["味","量","接客","速さ","清潔","雰囲気","価格","その他"];
var GBP_STAR = { ONE:1, TWO:2, THREE:3, FOUR:4, FIVE:5 };

function gbpProp_(k){ return PropertiesService.getScriptProperties().getProperty(k) || ""; }
function gbpReady_(){ return !!(gbpProp_("GBP_ACCOUNT") && gbpProp_("GBP_LOCATION")); }
function gbpFetch_(method, url, body){
  var opt = { method: method, muteHttpExceptions: true, headers: { Authorization: "Bearer " + ScriptApp.getOAuthToken() } };
  if (body !== undefined){ opt.contentType = "application/json"; opt.payload = JSON.stringify(body); }
  var res = UrlFetchApp.fetch(url, opt), code = res.getResponseCode(), txt = res.getContentText(), j = {};
  try { j = txt ? JSON.parse(txt) : {}; } catch(e){ j = { raw: txt.slice(0, 300) }; }
  if (code >= 300){ var msg = (j.error && j.error.message) || txt.slice(0, 200); throw new Error("Google API " + code + "：" + (code === 429 ? "利用申請が承認されていないか、回数の上限です（" + msg + "）" : code === 403 ? "権限がありません（API の有効化・プロフィールの管理者・承認を確認）：" + msg : msg)); }
  return j;
}
function gbpLocId_(){ return gbpProp_("GBP_LOCATION").replace(/^locations\//, ""); }
function gbpRevBase_(){ return "https://mybusiness.googleapis.com/v4/" + gbpProp_("GBP_ACCOUNT") + "/" + gbpProp_("GBP_LOCATION"); }

// エディタで1回：アカウントと店舗を探してプロパティに入れる（「オリオン」を含む店舗を選ぶ）
function gbpSetup(){
  var acc = gbpFetch_("get", "https://mybusinessaccountmanagement.googleapis.com/v1/accounts").accounts || [];
  var found = [];
  acc.forEach(function(a){ var r = gbpFetch_("get", "https://mybusinessbusinessinformation.googleapis.com/v1/" + a.name + "/locations?readMask=name,title&pageSize=100");
    (r.locations || []).forEach(function(l){ found.push({ account: a.name, accountName: a.accountName, location: l.name, title: l.title }); }); });
  var pick = found.filter(function(f){ return /オリオン|ORION/i.test(f.title); })[0] || (found.length === 1 ? found[0] : null);
  if (pick){ var p = PropertiesService.getScriptProperties(); p.setProperty("GBP_ACCOUNT", pick.account); p.setProperty("GBP_LOCATION", pick.location); }
  Logger.log(JSON.stringify({ picked: pick, all: found })); return { picked: pick, all: found };
}

// ---------- 口コミの取り込み（1時間ごと）----------
function gbpSync(){
  if (!gbpReady_()) return { ok:false, reason:"未設定" };
  var sh = osSheet_(GBP_REV, GBP_REV_COLS), rows = invRows_(sh), byG = {}; rows.forEach(function(r){ if (r.google_id) byG[String(r.google_id)] = r; });
  var url = gbpRevBase_() + "/reviews?pageSize=50&orderBy=updateTime%20desc", got = [], tok = "", n = 0;
  do { var j = gbpFetch_("get", url + (tok ? "&pageToken=" + encodeURIComponent(tok) : "")); got = got.concat(j.reviews || []); tok = j.nextPageToken || ""; n++; } while (tok && n < 4);
  var now = invNow_(), added = [];
  got.forEach(function(v){
    var gid = String(v.reviewId || v.name), star = GBP_STAR[v.starRating] || 0, rep = v.reviewReply || {}, ex = byG[gid];
    var upd = gbpTime_(v.updateTime), created = gbpTime_(v.createTime);
    if (ex){
      if (String(ex["更新日時"]) !== upd){ invSet_(sh, ex._row, "星", star); invSet_(sh, ex._row, "本文", String(v.comment||"")); invSet_(sh, ex._row, "更新日時", "'" + upd); }
      if (rep.comment && String(ex["Google返信"]) !== String(rep.comment)){ invSet_(sh, ex._row, "Google返信", String(rep.comment)); invSet_(sh, ex._row, "Google返信日時", "'" + gbpTime_(rep.updateTime)); invSet_(sh, ex._row, "状態", "返信済"); }
      return;
    }
    var id = invId_("rv_");
    invAppend_(sh, { rev_id:id, "店舗":"kanda", "出所":"API", google_id:gid, "投稿者":String((v.reviewer||{}).displayName||""), "星":star, "本文":String(v.comment||""), "投稿日時":"'" + created, "更新日時":"'" + upd,
      "Google返信":String(rep.comment||""), "Google返信日時": rep.comment ? "'" + gbpTime_(rep.updateTime) : "", "下書き":"", "下書き日時":"", "状態": rep.comment ? "返信済" : "新着", "指摘":"", "承認者":"", "送信日時":"", "送信結果":"", "メモ":"", "取込日時":now });
    if (!rep.comment) added.push(id);
  });
  // 新しく入った未返信の口コミは、下書きと指摘の分類を先に作っておく（最大5件／回）
  added.slice(0, 5).forEach(function(id){ try { gbpDraft_(id, ""); } catch(e){} });
  try { if (added.length && typeof ownerReviewNotify_ === "function") ownerReviewNotify_(added); } catch(e){}
  return { ok:true, fetched: got.length, added: added.length };
}
function gbpTime_(s){ if (!s) return ""; var d = new Date(s); return isNaN(d) ? String(s) : Utilities.formatDate(d, "Asia/Tokyo", "yyyy/MM/dd HH:mm"); }

// ---------- 数字（パフォーマンス）の取り込み（毎日）----------
function gbpPerfSync(){
  if (!gbpReady_()) return { ok:false, reason:"未設定" };
  var end = new Date(Date.now() - 2*86400000), start = new Date(Date.now() - 16*86400000), q = [];
  GBP_METRICS.forEach(function(m){ q.push("dailyMetrics=" + m[0]); });
  [["startDate", start], ["endDate", end]].forEach(function(x){ q.push("dailyRange." + x[0] + ".year=" + x[1].getFullYear(), "dailyRange." + x[0] + ".month=" + (x[1].getMonth()+1), "dailyRange." + x[0] + ".day=" + x[1].getDate()); });
  var j = gbpFetch_("get", "https://businessprofileperformance.googleapis.com/v1/locations/" + gbpLocId_() + ":fetchMultiDailyMetricsTimeSeries?" + q.join("&"));
  var byDay = {};
  ((j.multiDailyMetricTimeSeries || [])[0] || { dailyMetricTimeSeries: [] }).dailyMetricTimeSeries.forEach(function(s){
    var col = (GBP_METRICS.filter(function(m){ return m[0] === s.dailyMetric; })[0] || [])[1]; if (!col) return;
    ((s.timeSeries || {}).datedValues || []).forEach(function(v){ var dt = v.date; var k = dt.year + "/" + ("0"+dt.month).slice(-2) + "/" + ("0"+dt.day).slice(-2); (byDay[k] = byDay[k] || {})[col] = Number(v.value||0); });
  });
  var sh = osSheet_(GBP_PERF, GBP_PERF_COLS), rows = invRows_(sh), now = invNow_(), n = 0;
  Object.keys(byDay).sort().forEach(function(k){
    var ex = rows.filter(function(r){ return todoD_(r["日付"]) === k && String(r["出所"]) === "API"; })[0];
    if (ex){ GBP_METRICS.forEach(function(m){ if (byDay[k][m[1]] !== undefined) invSet_(sh, ex._row, m[1], byDay[k][m[1]]); }); invSet_(sh, ex._row, "取込日時", now); }
    else { var o = { "日付":"'" + k, "店舗":"kanda", "出所":"API", "取込日時":now }; GBP_METRICS.forEach(function(m){ o[m[1]] = byDay[k][m[1]] || 0; }); invAppend_(sh, o); }
    n++;
  });
  return { ok:true, days:n };
}

// ---------- AI の下書き ----------
function gbpAi_(sys, user){
  var props = PropertiesService.getScriptProperties(), key = props.getProperty("ANTHROPIC_API_KEY"); if (!key) throw new Error("AI のキーが未設定です");
  var model = props.getProperty("OS_MODEL") || "claude-haiku-5-5";
  var res = UrlFetchApp.fetch("https://api.anthropic.com/v1/messages", { method:"post", contentType:"application/json", muteHttpExceptions:true, headers:{ "x-api-key":key, "anthropic-version":"2023-06-01" },
    payload: JSON.stringify({ model:model, max_tokens:1024, system:sys, messages:[{ role:"user", content:user }] }) });
  var j = JSON.parse(res.getContentText()); var text = (j.content || []).filter(function(c){ return c.type === "text"; }).map(function(c){ return c.text; }).join("").trim();
  if (!text) throw new Error("AI の応答がありません（HTTP " + res.getResponseCode() + "）");
  return text;
}
var GBP_SYS = "あなたは洋食オリオン（東京・神田淡路町のナポリタン専門店。平日11〜14時のランチ営業）の店長として、Google の口コミへの返信の下書きを書きます。\n"
  + "店の約束：古いけれど、清潔。下町だけれど、丁寧。親しみやすいけれど、雑ではない。愛嬌よく、明るく、前向きな言葉で。\n"
  + "決まり：\n- 2〜4文。最後に改行して「洋食オリオン 店長」と署名する。\n- 投稿者の名前（あれば）に「様」を付けて呼びかけ、来店のお礼から始める。口コミにある料理名や良かった点に具体的に触れる。\n"
  + "- 低い評価や指摘には、まずお詫びし、反論や言い訳をしない。事実の確認が要ることは「確認いたします」までにして、原因を決めつけない。\n"
  + "- 割引・無料・特典・次回の約束を書かない。個人を特定する情報やスタッフの名前を書かない。絵文字は使わない。数字は算用数字。\n"
  + "- メニューの事実（ナポリタン専門。オリオン＝ハンバーグ・コロッケ・目玉焼き付き。ナシナシ＝具のみ。ハーフあり。瓶ドリンク）に反することを書かない。\n"
  + "出力は次の JSON だけ：{\"reply\":\"返信文\",\"tags\":[\"味\",\"量\",\"接客\",\"速さ\",\"清潔\",\"雰囲気\",\"価格\",\"その他\" のうち、口コミが触れている改善の指摘だけ（褒めているだけなら空）]}";
function gbpDraft_(id, hint){
  var sh = osSheet_(GBP_REV, GBP_REV_COLS); var r = invRows_(sh).filter(function(x){ return String(x.rev_id) === String(id); })[0]; if (!r) throw new Error("見つかりません");
  var user = "投稿者：" + (r["投稿者"]||"（不明）") + "\n星：" + r["星"] + "\n本文：" + (String(r["本文"]||"") || "（本文なし・星だけ）") + (hint ? "\n\n書き直しの指示：" + hint : "");
  var t = gbpAi_(GBP_SYS, user), j = null; try { j = JSON.parse(t.replace(/^```(json)?|```$/g, "").trim()); } catch(e){ j = { reply: t, tags: [] }; }
  var tags = (j.tags || []).filter(function(x){ return GBP_TAGS.indexOf(x) >= 0; });
  invSet_(sh, r._row, "下書き", String(j.reply||"")); invSet_(sh, r._row, "下書き日時", invNow_()); invSet_(sh, r._row, "指摘", tags.join("・"));
  if (String(r["状態"]) === "新着") invSet_(sh, r._row, "状態", "下書き済");
  return { ok:true, draft:String(j.reply||""), tags:tags };
}

// ---------- 読み取り ----------
function gbpGet_(mode, me, p){
  if (me.role !== "admin") return { error: "管理者のみ" };
  if (mode === "os_gbp_reviews"){
    var list = invRows_(osSheet_(GBP_REV, GBP_REV_COLS)).map(gbpRevOut_).sort(function(a, b){ return a.at < b.at ? 1 : -1; });
    var stars = list.filter(function(x){ return x.star; }), avg = stars.length ? Math.round(stars.reduce(function(s, x){ return s + x.star; }, 0) / stars.length * 10) / 10 : null;
    return { ok:true, ready:gbpReady_(), avg:avg, count:list.length, tags:GBP_TAGS, list:list.slice(0, 200), lastSync:gbpProp_("GBP_LAST_SYNC") };
  }
  if (mode === "os_gbp_profile"){
    if (!gbpReady_()) return { ok:true, ready:false };
    var c = CacheService.getScriptCache(), hit = c.get("gbp_profile"); if (hit && !p.fresh) return JSON.parse(hit);
    var loc = gbpFetch_("get", "https://mybusinessbusinessinformation.googleapis.com/v1/locations/" + gbpLocId_() + "?readMask=title,phoneNumbers,websiteUri,regularHours,specialHours,profile,storefrontAddress,metadata");
    var out = { ok:true, ready:true, title:loc.title||"", phone:((loc.phoneNumbers||{}).primaryPhone)||"", web:loc.websiteUri||"", desc:((loc.profile||{}).description)||"",
      address:((loc.storefrontAddress||{}).addressLines||[]).join(" "), regular:((loc.regularHours||{}).periods)||[], special:((loc.specialHours||{}).specialHourPeriods)||[], maps:((loc.metadata||{}).mapsUri)||"",
      holidays: gbpHolidayGaps_(loc) };
    c.put("gbp_profile", JSON.stringify(out), 600); return out;
  }
  if (mode === "os_gbp_perf"){
    var rows = invRows_(osSheet_(GBP_PERF, GBP_PERF_COLS)), byM = {};
    rows.forEach(function(r){ var k = todoD_(r["日付"]).slice(0, 7); var m = byM[k] = byM[k] || { ym:k, src:{}, v:{} }; m.src[String(r["出所"])] = 1; GBP_METRICS.forEach(function(x){ m.v[x[1]] = (m.v[x[1]]||0) + (Number(r[x[1]])||0); }); });
    return { ok:true, ready:gbpReady_(), cols:GBP_METRICS.map(function(x){ return x[1]; }), months:Object.keys(byM).sort().reverse().slice(0, 12).map(function(k){ var m = byM[k]; return { ym:k, src:Object.keys(m.src).join("・"), v:m.v }; }) };
  }
  return { error: "unknown mode" };
}
function gbpRevOut_(r){ return { id:String(r.rev_id), src:String(r["出所"]), name:String(r["投稿者"]||""), star:Number(r["星"])||0, text:String(r["本文"]||""), at:String(r["投稿日時"]||r["取込日時"]||""),
  reply:String(r["Google返信"]||""), replyAt:String(r["Google返信日時"]||""), draft:String(r["下書き"]||""), status:String(r["状態"]||""), tags:String(r["指摘"]||"").split("・").filter(String),
  by:String(r["承認者"]||""), sentAt:String(r["送信日時"]||""), result:String(r["送信結果"]||""), memo:String(r["メモ"]||"") }; }
// 平日の祝日（先 45 日）で、Google の特別営業時間に「休業」が入っていない日
function gbpHolidayGaps_(loc){
  var sp = ((loc.specialHours||{}).specialHourPeriods)||[], set = {};
  sp.forEach(function(s){ var d = s.startDate; if (d && s.closed) set[d.year + "/" + ("0"+d.month).slice(-2) + "/" + ("0"+d.day).slice(-2)] = 1; });
  var out = [], t = invToday_();
  for (var i = 0; i <= 45; i++){ var k = osAddDays_(t, i), a = k.split("/").map(Number), dw = new Date(a[0], a[1]-1, a[2]).getDay();
    if (dw === 0 || dw === 6) continue; var hol = false; try { hol = stfJpHoliday_(a[0], a[1], a[2]); } catch(e){}
    if (hol && !set[k]) out.push(k); }
  return out;
}

// ---------- 書き込み ----------
function gbpPost_(d, me){
  if (me.role !== "admin") return { error: "管理者のみ" };
  var t = String(d.type), sh = osSheet_(GBP_REV, GBP_REV_COLS), now = invNow_();
  var row = function(){ var r = invRows_(sh).filter(function(x){ return String(x.rev_id) === String(d.id); })[0]; if (!r) throw new Error("見つかりません"); return r; };
  if (t === "os_gbp_sync"){ var a = gbpSync(); var b = {}; try { b = gbpPerfSync(); } catch(e){ b = { error:String(e) }; } PropertiesService.getScriptProperties().setProperty("GBP_LAST_SYNC", now); return { ok:true, reviews:a, perf:b }; }
  if (t === "os_gbp_manual"){ // 承認前の手入力：Google の画面から投稿者・星・本文を写す
    var star = Number(d.star)||0, text = String(d.text||"").trim(); if (!(star >= 1 && star <= 5)) return { error: "星を選んでください" };
    var id = invId_("rv_");
    invAppend_(sh, { rev_id:id, "店舗":"kanda", "出所":"手入力", google_id:"", "投稿者":String(d.name||"").slice(0, 40), "星":star, "本文":text.slice(0, 2000), "投稿日時":"'" + String(d.date||invToday_()), "更新日時":"",
      "Google返信":"", "Google返信日時":"", "下書き":"", "下書き日時":"", "状態":"新着", "指摘":"", "承認者":"", "送信日時":"", "送信結果":"", "メモ":"", "取込日時":now });
    var dr = {}; try { dr = gbpDraft_(id, ""); } catch(e){ dr = { error:String(e) }; }
    try { if (typeof ownerReviewNotify_ === "function") ownerReviewNotify_([id]); } catch(e){}
    return { ok:true, id:id, draft:dr.draft||"", aiErr:dr.error||"" };
  }
  if (t === "os_gbp_draft"){ row(); return gbpDraft_(d.id, String(d.hint||"")); }
  if (t === "os_gbp_save"){ var r1 = row(); invSet_(sh, r1._row, "下書き", String(d.draft||"").slice(0, 4000)); invSet_(sh, r1._row, "下書き日時", now); if (String(r1["状態"]) === "新着") invSet_(sh, r1._row, "状態", "下書き済"); return { ok:true }; }
  if (t === "os_gbp_send"){ // API の口コミは Google に返信を送る。手入力の口コミは「Google で貼った」を記録するだけ
    var r2 = row(), text2 = String(d.text||"").trim(); if (!text2) return { error: "返信が空です" };
    if (String(r2["出所"]) === "API"){
      if (!gbpReady_()) return { error: "Google の設定がまだです" };
      try { gbpFetch_("put", gbpRevBase_() + "/reviews/" + encodeURIComponent(String(r2.google_id)) + "/reply", { comment: text2 }); }
      catch(e){ invSet_(sh, r2._row, "送信結果", "失敗 " + now + "：" + String(e).slice(0, 150)); return { error: String(e) }; }
      invSet_(sh, r2._row, "送信結果", "送信済 " + now); invSet_(sh, r2._row, "Google返信", text2); invSet_(sh, r2._row, "Google返信日時", now);
    } else { invSet_(sh, r2._row, "送信結果", "手で貼付 " + now); invSet_(sh, r2._row, "Google返信", text2); invSet_(sh, r2._row, "Google返信日時", now); }
    invSet_(sh, r2._row, "下書き", text2); invSet_(sh, r2._row, "状態", "返信済"); invSet_(sh, r2._row, "承認者", me.name); invSet_(sh, r2._row, "送信日時", now);
    return { ok:true };
  }
  if (t === "os_gbp_status"){ var r3 = row(), st = String(d.status||""); if (["返信しない","下書き済","新着"].indexOf(st) < 0) return { error: "状態が不正" };
    invSet_(sh, r3._row, "状態", st); invSet_(sh, r3._row, "メモ", (String(r3["メモ"]||"") + "\n" + now + " " + me.name + "：" + st).trim()); return { ok:true }; }
  if (t === "os_gbp_closed"){ // 特別営業時間に「休業」を足す（既存は残す）
    if (!gbpReady_()) return { error: "Google の設定がまだです" };
    var dates = (d.dates||[]).map(String).filter(function(x){ return /^\d{4}\/\d{2}\/\d{2}$/.test(x); }); if (!dates.length) return { error: "日付がありません" };
    var loc = gbpFetch_("get", "https://mybusinessbusinessinformation.googleapis.com/v1/locations/" + gbpLocId_() + "?readMask=specialHours");
    var sp = ((loc.specialHours||{}).specialHourPeriods)||[], have = {};
    sp.forEach(function(s){ var x = s.startDate; if (x) have[x.year + "/" + ("0"+x.month).slice(-2) + "/" + ("0"+x.day).slice(-2)] = 1; });
    dates.forEach(function(k){ if (have[k]) return; var a = k.split("/").map(Number); sp.push({ startDate:{ year:a[0], month:a[1], day:a[2] }, endDate:{ year:a[0], month:a[1], day:a[2] }, closed:true }); });
    gbpFetch_("patch", "https://mybusinessbusinessinformation.googleapis.com/v1/locations/" + gbpLocId_() + "?updateMask=specialHours", { specialHours:{ specialHourPeriods: sp } });
    CacheService.getScriptCache().remove("gbp_profile"); osGbpLog_(me, "特別営業時間に休業を追加：" + dates.join("・")); return { ok:true };
  }
  if (t === "os_gbp_desc"){ // 店の説明文（750字まで）
    if (!gbpReady_()) return { error: "Google の設定がまだです" };
    var desc = String(d.desc||"").trim(); if (!desc || desc.length > 750) return { error: "説明文は1〜750字です" };
    gbpFetch_("patch", "https://mybusinessbusinessinformation.googleapis.com/v1/locations/" + gbpLocId_() + "?updateMask=profile.description", { profile:{ description: desc } });
    CacheService.getScriptCache().remove("gbp_profile"); osGbpLog_(me, "説明文を変更"); return { ok:true };
  }
  if (t === "os_gbp_perf_save"){ // 承認前の手入力（月ごと。Google の「パフォーマンス」画面の数字を写す）
    var ym = String(d.ym||""); if (!/^\d{4}\/\d{2}$/.test(ym)) return { error: "月の形が違います（2026/11）" };
    var ps = osSheet_(GBP_PERF, GBP_PERF_COLS), ex = invRows_(ps).filter(function(r){ return todoD_(r["日付"]) === ym && String(r["出所"]) === "手入力"; })[0];
    var o = { "日付":"'" + ym, "店舗":"kanda", "出所":"手入力", "取込日時":now }; GBP_METRICS.forEach(function(m){ o[m[1]] = Number((d.v||{})[m[1]])||0; });
    if (ex) GBP_METRICS.forEach(function(m){ invSet_(ps, ex._row, m[1], o[m[1]]); }); else invAppend_(ps, o);
    return { ok:true };
  }
  return { error: "unknown type" };
}
// Google に出したもの（返信以外）は決裁ログにも残す（誰がいつ何を変えたか）
function osGbpLog_(me, what){ try { invAppend_(osSheet_(OS_DEC, OS_DEC_COLS), { dec_id:invId_("dc_"), "日付":"'" + invToday_(), "店舗":"kanda", "領域":"Google プロフィール", "件名":what, "提案者":me.name, "承認者":me.name, "承認日":"'" + invToday_(), "判断":"承認", "実施者":me.name, "実施日":"'" + invToday_(), "状態":"完了", "登録日時":invNow_() }); } catch(e){} }

// ---------- 今朝の確認・17時のまとめ ----------
function gbpAlerts_(){
  var out = [], lim = Utilities.formatDate(new Date(Date.now() - 48*3600000), "Asia/Tokyo", "yyyy/MM/dd HH:mm");
  var wait = invRows_(osSheet_(GBP_REV, GBP_REV_COLS)).map(gbpRevOut_).filter(function(x){ return x.status === "新着" || x.status === "下書き済"; });
  if (wait.length){ var old = wait.filter(function(x){ return x.at && x.at <= lim; });
    out.push({ key:"rev", level: old.length ? "high" : "mid", title: "口コミの返信がまだ " + wait.length + "件" + (old.length ? "（48時間を過ぎたもの " + old.length + "件）" : ""), detail: wait.slice(0, 3).map(function(x){ return "★" + x.star + " " + (x.name||"") + "：" + x.text.slice(0, 30); }).join("\n"), app:"google" }); }
  if (gbpReady_()){ try { var p = gbpGet_("os_gbp_profile", { role:"admin" }, {}); if (p.holidays && p.holidays.length) out.push({ key:"rev", level:"mid", title:"Google に祝日の休業が入っていません：" + p.holidays.join("・"), detail:"管理者アプリ「口コミ」→「プロフィール」から入れられます", app:"google" }); } catch(e){} }
  return out;
}
// トリガー：口コミ 1時間ごと・数字 毎朝7時。エディタで1回実行
function gbpSetupTriggers(){
  ScriptApp.getProjectTriggers().forEach(function(t){ if (["gbpSyncTrigger","gbpPerfSync"].indexOf(t.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger("gbpSyncTrigger").timeBased().everyHours(1).create();
  ScriptApp.newTrigger("gbpPerfSync").timeBased().atHour(7).everyDays(1).inTimezone("Asia/Tokyo").create();
}
function gbpSyncTrigger(){ if (!gbpReady_()) return; try { gbpSync(); PropertiesService.getScriptProperties().setProperty("GBP_LAST_SYNC", invNow_()); } catch(e){ Logger.log(String(e)); } }
// ===== GBP END =====

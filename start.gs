// ===== ORION START v0.1（出店判断と答え合わせ） =====
// 置き場所: 分析 GAS コード.gs の「// ===== ORION OS END」より下に、このファイルを丸ごと貼る（同名関数なし: すべて start 接頭辞）
// 取り付け: facts.gs の handleOsGet / handleOsPost に1行ずつ（os_start_ で始まる mode / type をここへ回す）
// データ: 事務局用の別スプレッドシート「ORION START 事務局台帳」（閲覧は松尾・長下のみ）。ID は Script Properties の START_SS_ID
//         初回はエディタで startSetup() を1回実行（ファイル作成・タブ作成・神田/飯田橋の登録。何度実行しても重複しない）
// 原則:
//  - 予測は凍結（frozen）したら変更できない。直すときは新しい版を作る（前のsim_id で辿れる）
//  - 数値には確度を付ける: fact（確定）/ observed（実測）/ estimated（推定）/ assumption（仮定）/ unknown（不明）
//  - 「33食/時さばいた実績」は上限ではなく実証済みの下限（demonstrated）。理論上限（theoretical）と分けて持つ
//  - GO / NO-GO は人が決める。凍結時は決裁ログに「提案中」の行を作るだけで、承認はしない
//  - 分析シート（売上・来店）は読むだけ。書き込まない

var START_PROP = "START_SS_ID";
var START_SS_NAME = "ORION START 事務局台帳";
var START_VER = "start-v0.1";
var START_CERT = ["fact","observed","estimated","assumption","unknown"];

var START_T = {
  prj:  { name:"案件", cols:["project_id","案件名","役割","運営形態","stage","契約状況","決裁者","store_id","property_id","状態","メモ","作成日時","更新日時","更新者"] },
  prop: { name:"物件", cols:["property_id","名称","住所","最寄駅","徒歩分","階","面積㎡","坪","緯度","経度","飲食可","重飲食","ガス","排気","排水","グリストラップ","設備","設備確認","席数案","状態","メモ","登録日時","更新日時"] },
  lst:  { name:"掲載", cols:["listing_id","property_id","取込状態","source","source_url","初出日","最終確認日","掲載状態","賃料","共益費","保証金","礼金","造作譲渡","前テナント","入居可能日","契約形態","最寄駅","徒歩分","面積㎡","坪","住所","抽出メモ","未確認項目","evidence_link","メールID","登録者","登録日時","更新日時"] },
  sim:  { name:"試算", cols:["sim_id","project_id","property_id","版","状態","前提JSON","結果JSON","必要食数_店舗","必要食数_返済後","必要食数_オーナー","処理上限_日","処理上限_確度","capacity_margin","作成者","作成日時","凍結者","凍結日時","凍結ハッシュ","関連dec_id","前のsim_id","メモ"] },
  ev:   { name:"評価", cols:["eval_id","project_id","property_id","版","足切り","足切りメモ","必要食数","需要見込み_下限","需要見込み_上限","需要_確度","処理上限","処理上限_確度","未確認事項","余裕度","判定","見送り理由","理由メモ","sim_id","評価者","評価日時"] },
  srv:  { name:"現地調査", cols:["survey_id","project_id","property_id","日付","開始","終了","調査者","方法","通行量","入店","退店","入店断念","行列最大","席占有","対象店","メモ","元データリンク","登録者","登録日時"] },
  set:  { name:"店舗設定", cols:["setting_id","store_id","project_id","項目","値","単位","確度","有効開始","根拠","メモ","登録者","登録日時"] },
  cap:  { name:"容量", cols:["cap_id","store_id","版","計算日時","種類","値_食時","値_食日","確度","計算方法","対象期間","前提","メモ"] },
  vq:   { name:"来店品質", cols:["日付","store_id","来店","店内食数","差","差率","grade","平均滞在_面積法","最大同時在店","計算版","計算日時"] },
  log:  { name:"変更履歴", cols:["log_id","日時","操作者","対象","対象id","種別","変更前","変更後"] }
};
// 判定: WATCH / CHECK / VISIT / GO REVIEW / PASS（PASS は見送り理由が必須）
var START_VERDICTS = ["WATCH","CHECK","VISIT","GO REVIEW","PASS"];
var START_PASS_REASONS = ["家賃超過","初期投資超過","重飲食不可","排気・ガス不足","定借が短い","処理能力不足","需要不足","競合過多","立地・視認性","契約条件","他案件を優先","その他"];
var START_STAGES = ["idea","research","property_search","application","screening","contract","opening_preparation","operating","closed"];
// 来店品質の閾値（10/21〜10/27 の実データから提案。差率 = |来店 − 店内食数| ÷ 店内食数）
//  10/21 0% → A ／ 10/22 6% ・10/23 6% → B ／ 10/26 22%・10/27 17% → C
var START_GRADE_A = 0.03, START_GRADE_B = 0.10;

// ---------- 事務局ファイル ----------
function startSS_(){
  var id = PropertiesService.getScriptProperties().getProperty(START_PROP);
  if (!id) throw new Error("START の台帳がまだありません。エディタで startSetup() を実行してください");
  return SpreadsheetApp.openById(id);
}
function startSheet_(key){
  var t = START_T[key]; var ss = startSS_(); var sh = ss.getSheetByName(t.name);
  if (!sh){ sh = ss.insertSheet(t.name); sh.getRange(1,1,1,t.cols.length).setValues([t.cols]).setFontWeight("bold"); sh.setFrozenRows(1); return sh; }
  var last = Math.max(1, sh.getLastColumn()); var hdr = sh.getRange(1,1,1,last).getValues()[0].map(String);
  var add = t.cols.filter(function(c){ return hdr.indexOf(c) < 0; });
  if (add.length) sh.getRange(1, last+1, 1, add.length).setValues([add]).setFontWeight("bold");
  return sh;
}
function startRows_(key){ return invRows_(startSheet_(key)); }
function startFind_(key, idCol, id){ return startRows_(key).filter(function(r){ return String(r[idCol]) === String(id); })[0] || null; }
function startLog_(me, target, id, kind, before, after){
  try { invAppend_(startSheet_("log"), { log_id: invId_("lg_"), "日時": invNow_(), "操作者": me ? me.name : "system", "対象": target, "対象id": id, "種別": kind,
    "変更前": before === undefined ? "" : JSON.stringify(before), "変更後": after === undefined ? "" : JSON.stringify(after) }); } catch(e){}
}
function startTxt_(v){ return (v === undefined || v === null) ? "" : (v instanceof Date ? Utilities.formatDate(v, "Asia/Tokyo", "yyyy/MM/dd HH:mm") : String(v)); }
function startObj_(key, r){ var o = {}; START_T[key].cols.forEach(function(c){ o[c] = startTxt_(r[c]); }); o._row = r._row; return o; }

// 初回セットアップ（エディタから実行）。既にあれば足りない物だけ足す
function startSetup(){
  var props = PropertiesService.getScriptProperties(); var id = props.getProperty(START_PROP); var created = false;
  if (!id){ var ss = SpreadsheetApp.create(START_SS_NAME); id = ss.getId(); props.setProperty(START_PROP, id); created = true;
    var first = ss.getSheets()[0]; }
  Object.keys(START_T).forEach(function(k){ startSheet_(k); });
  if (created){ try { startSS_().deleteSheet(first); } catch(e){} }
  var seeded = startSeed_();
  var msg = { ok:true, spreadsheet: "https://docs.google.com/spreadsheets/d/" + id, created: created, seeded: seeded };
  Logger.log(JSON.stringify(msg)); return msg;
}

// 神田（baseline）と飯田橋（opening_project）を登録。予測値は作らない
function startSeed_(){
  var me = { name: "startSetup" }; var now = invNow_(); var done = [];
  if (!startFind_("prj","project_id","PRJ-0001")){
    invAppend_(startSheet_("prj"), { project_id:"PRJ-0001", "案件名":"神田淡路町店（本店）", "役割":"baseline", "運営形態":"直営", stage:"operating", "契約状況":"契約済", "決裁者":"長下佳奈",
      store_id:"kanda", property_id:"PROP-0001", "状態":"有効", "メモ":"2026/10/13開業。標準店モデルの基準店。開業済みのため出店時予測は作らない（後知恵を混ぜない）", "作成日時":now, "更新日時":now, "更新者":me.name });
    done.push("PRJ-0001"); }
  if (!startFind_("prj","project_id","PRJ-0002")){
    invAppend_(startSheet_("prj"), { project_id:"PRJ-0002", "案件名":"飯田橋（アパホテル〈飯田橋駅南〉1F）", "役割":"opening_project", "運営形態":"直営", stage:"screening", "契約状況":"申込済・選定待ち・未契約", "決裁者":"長下佳奈",
      store_id:"", property_id:"PROP-0002", "状態":"有効", "メモ":"2026/10/30 入居申込書類を提出。契約書を確認するまで確定扱いにしない。GO判断時の試算は必ず凍結する", "作成日時":now, "更新日時":now, "更新者":me.name });
    done.push("PRJ-0002"); }
  if (!startFind_("prop","property_id","PROP-0001")){
    invAppend_(startSheet_("prop"), { property_id:"PROP-0001", "名称":"塚崎ビル1F（神田淡路町）", "住所":"東京都千代田区神田淡路町1-15", "最寄駅":"淡路町・小川町・新御茶ノ水", "徒歩分":2, "階":"1F",
      "面積㎡":30.61, "坪":9.25, "飲食可":"可", "重飲食":"可（前店 居酒屋）", "ガス":"都市ガス13A", "排気":"既存", "排水":"既存", "グリストラップ":"unknown", "設備":"居抜き（3口コンロ・冷凍冷蔵庫・製氷機・フライヤー・グリラー）",
      "設備確認":"確認済", "席数案":12, "状態":"営業中", "メモ":"募集図面（トキワ管理サービス）より", "登録日時":now, "更新日時":now });
    done.push("PROP-0001"); }
  if (!startFind_("prop","property_id","PROP-0002")){
    invAppend_(startSheet_("prop"), { property_id:"PROP-0002", "名称":"アパホテル〈飯田橋駅南〉1F", "住所":"unknown", "最寄駅":"飯田橋", "徒歩分":"unknown", "階":"1F",
      "面積㎡":"unknown", "坪":"unknown", "飲食可":"可", "重飲食":"unknown", "ガス":"unknown", "排気":"unknown", "排水":"unknown", "グリストラップ":"unknown", "設備":"現テナントあり（8席）",
      "設備確認":"未確認", "席数案":8, "状態":"申込中", "メモ":"厨房横の未使用カウンターを持ち帰り受取口に使う案。内見・契約書で設備を確認", "登録日時":now, "更新日時":now });
    done.push("PROP-0002"); }
  // 神田の店舗設定（確度つき）。席数は12を正式値。15席（10/27 個室試行開放）は根拠が揃うまで採用しない
  if (!startRows_("set").some(function(r){ return r.store_id === "kanda"; })){
    var S = [
      ["physical_seats", 12, "席", "observed", "2026/10/13", "ChatGPT側で確認。Facts 未登録", "10/27 に奥の個室を試行開放（+3席）の記録あり。常設化の決定が出たら新しい行で 15 を追加"],
      ["core_start", "11:00", "時刻", "fact", "2026/11/01", "営業時間", ""],
      ["core_end", "14:00", "時刻", "fact", "2026/11/01", "営業時間", ""],
      ["business_days_per_month", 20, "日", "assumption", "2026/11/01", "月〜金営業", "祝日で変動"],
      ["observed_stay_minutes", "", "分", "unknown", "2026/11/01", "未確定。参考値15分前後（10/21〜10/27・既存の先着順推定）", "品質Aの日が10日たまったら面積法で確定"],
      ["planning_stay_minutes", 18, "分", "assumption", "2026/11/01", "出店判断の安全側計画値", ""],
      ["turnover_buffer_minutes", 2, "分", "assumption", "2026/11/01", "片付け〜次の着席", ""],
      ["seat_utilization", 0.85, "比率", "assumption", "2026/11/01", "100%連続稼働は持続不可とみなす", ""],
      ["kitchen_capacity_per_hour", "", "食/時", "unknown", "2026/11/01", "注文受付・提供完了時刻が取れていない", "提供時間の計測で埋める"]
    ];
    var sh = startSheet_("set");
    S.forEach(function(s){ invAppend_(sh, { setting_id: invId_("st_"), store_id:"kanda", project_id:"PRJ-0001", "項目":s[0], "値":s[1], "単位":s[2], "確度":s[3], "有効開始":"'" + s[4], "根拠":s[5], "メモ":s[6], "登録者":me.name, "登録日時":now }); });
    done.push("店舗設定(kanda)"); }
  if (done.length) startLog_(me, "setup", "", "seed", undefined, done);
  return done;
}

// 店舗設定の現在値（有効開始が最新の行が勝つ）
function startSettings_(storeId){
  var out = {}; startRows_("set").filter(function(r){ return r.store_id === storeId; })
    .sort(function(a,b){ return String(a["有効開始"]).localeCompare(String(b["有効開始"])) || String(a["登録日時"]).localeCompare(String(b["登録日時"])); })
    .forEach(function(r){ out[String(r["項目"])] = { value: r["値"], cert: String(r["確度"]), unit: String(r["単位"]), basis: String(r["根拠"]), from: startTxt_(r["有効開始"]) }; });
  return out;
}
function startNum_(s, k, dflt){ var x = s[k]; if (!x || x.value === "" || x.value === null || x.cert === "unknown") return dflt; var n = Number(x.value); return isNaN(n) ? dflt : n; }

// ================= 計算（純粋関数。シートに触らない） =================
// 時刻 "HH:mm" → 分
function startMin_(t){ var m = String(t||"").match(/(\d{1,2}):(\d{2})/); return m ? Number(m[1])*60 + Number(m[2]) : -1; }
function startPct_(arr, p){ if (!arr.length) return null; var a = arr.slice().sort(function(x,y){ return x-y; }); var i = (a.length-1)*p; var lo = Math.floor(i), hi = Math.ceil(i); return a[lo] + (a[hi]-a[lo])*(i-lo); }
// 1日分の会計（{t:分, meals, takeout}）から: 店内・持ち帰り食数、CORE 内食数、最大ローリング15/60分（総数・店内）
function startCalcDay(sales, coreStart, coreEnd){
  var ev = []; var eat = 0, tg = 0, core = 0;
  sales.forEach(function(s){ if (s.t < 0) return; var n = Math.max(0, s.meals||0); if (!n) return;
    if (s.takeout) tg += n; else eat += n; if (s.t >= coreStart && s.t < coreEnd) core += n; ev.push({ t:s.t, n:n, tg:!!s.takeout }); });
  function roll(win, onlyEat){ var best = 0; ev.forEach(function(a){ var sum = 0; ev.forEach(function(b){ if (b.t >= a.t && b.t < a.t + win && (!onlyEat || !b.tg)) sum += b.n; }); if (sum > best) best = sum; }); return best; }
  var total = eat + tg;
  var r60 = roll(60, false);
  return { meals: total, eatin: eat, takeout: tg, core: core, roll15: roll(15, false), roll60: r60, roll60Eatin: roll(60, true), peakShare: core ? r60 / core : null };
}
// 来店品質の判定（差率 = |来店 − 店内食数| ÷ 店内食数）
function startGrade(visits, eatin){
  if (!visits || !eatin) return { grade: "-", diff: (visits||0) - (eatin||0), ratio: null };
  var d = visits - eatin; var r = Math.abs(d) / eatin;
  return { grade: r <= START_GRADE_A ? "A" : (r <= START_GRADE_B ? "B" : "C"), diff: d, ratio: r };
}
// 累積曲線: 入店（分の配列）と店内の退店（会計時刻×食数）から同時在店人数を1分刻みで。
//  scale: 来店の押し漏れを比例で補う倍率（B の日。A は 1）。人と人を1対1で対応させない
function startOccupancy(arrivals, departures, scale, from, to){
  scale = scale || 1; from = from || 600; to = to || 960;
  var a = arrivals.slice().sort(function(x,y){ return x-y; }), d = departures.slice().sort(function(x,y){ return x-y; });
  var ia = 0, id = 0, curve = [], maxOcc = 0, area = 0;
  for (var t = from; t <= to; t++){
    while (ia < a.length && a[ia] <= t) ia++; while (id < d.length && d[id] <= t) id++;
    var occ = Math.max(0, ia*scale - id); curve.push(occ); area += occ; if (occ > maxOcc) maxOcc = occ; }
  return { curve: curve, max: Math.round(maxOcc*10)/10, area: area, meanStay: departures.length ? Math.round(area / departures.length * 10)/10 : null };
}
// 席の理論上限（食/時）= 席数 × 60 ÷ (滞在 + 入替) × 稼働率
function startSeatCap(seats, stay, buffer, util){ if (!seats || !stay) return null; return Math.round(seats * 60 / (stay + (buffer||0)) * (util == null ? 1 : util) * 10) / 10; }
// 1日の持続可能上限 = min(席, 厨房) ÷ ピーク1時間比率 + 持ち帰り上限。厨房 unknown のときは席だけで出し、確度を落とす
function startSustainable(seatCapHour, kitchenCapHour, peakShare, takeoutDay){
  if (!seatCapHour || !peakShare) return { value: null, cert: "unknown", note: "席キャパかピーク比率が不明" };
  var hour = kitchenCapHour ? Math.min(seatCapHour, kitchenCapHour) : seatCapHour;
  var v = Math.floor(hour / peakShare + (takeoutDay||0));
  return kitchenCapHour ? { value: v, cert: "estimated", note: "席・厨房の小さい方" } : { value: v, cert: "assumption", note: "厨房キャパ unknown のため席だけで計算（上振れの可能性）" };
}
// 必要食数3種。p: 客単価, 原価率, 営業日数, 人件費(月), 家賃(月), その他固定費(月), その他収入(月・夜貸し等), 借入返済(月), オーナー報酬(月)
function startRequired(p){
  var price = Number(p.price), cr = Number(p.costRate), days = Number(p.days);
  if (!(price > 0) || !(cr >= 0 && cr < 1) || !(days > 0)) return { error: "客単価・原価率・営業日数が必要" };
  var unit = price * (1 - cr) * days; // 1日1食あたりの月の粗利
  var fixed = (Number(p.labor)||0) + (Number(p.rent)||0) + (Number(p.otherFixed)||0) - (Number(p.otherIncome)||0);
  var debt = Number(p.debt)||0, owner = Number(p.ownerPay)||0;
  return { store: Math.ceil(fixed / unit), afterDebt: Math.ceil((fixed + debt) / unit), owner: Math.ceil((fixed + debt + owner) / unit), perMealMonth: Math.round(unit) };
}
// 物件評価の判定（ルール。AIではない）。余裕度 = min(需要下限, 処理上限) − 必要食数（返済後）
function startVerdict(e){
  if (e.cut === "不可") return { verdict: "PASS", margin: null, why: "足切り" };
  var need = Number(e.need), lo = Number(e.demandLo), cap = Number(e.capacity);
  if (!need || (!lo && !cap)) return { verdict: "WATCH", margin: null, why: "必要食数か見込みが未入力" };
  var room = Math.min(lo || Infinity, cap || Infinity); var margin = Math.round(room - need);
  if (cap && cap < need) return { verdict: "PASS", margin: margin, why: "処理能力不足（店型として成立しない）" };
  if (margin < 0) return { verdict: "PASS", margin: margin, why: "需要不足" };
  if (e.cut === "unknown" || Number(e.unknowns) > 0) return { verdict: "CHECK", margin: margin, why: "未確認事項あり" };
  if (margin < need*0.15) return { verdict: "CHECK", margin: margin, why: "余裕が15%未満" };
  return { verdict: e.surveyed ? "GO REVIEW" : "VISIT", margin: margin, why: e.surveyed ? "実測あり・足切り確認済" : "余裕15%以上。内見と商圏実測へ" };
}

// ================= 神田 baseline の集計（分析シートを読むだけ） =================
function startReadKanda_(fromKey, toKey){
  var ss = SpreadsheetApp.getActiveSpreadsheet(); var tz; try { tz = ss.getSpreadsheetTimeZone() || "Asia/Tokyo"; } catch(e){ tz = "Asia/Tokyo"; }
  var days = {};
  var sv = ss.getSheetByName("売上").getDataRange().getValues();
  for (var r = 1; r < sv.length; r++){ var row = sv[r]; var dk = dateKey_(row[0]); if (!dk || dk < fromKey || dk > toKey) continue;
    var kind = String(row[3]||""); if (kind === "ERROR" || kind === "取消") continue;
    var t = (row[1] instanceof Date) ? Utilities.formatDate(row[1], tz, "HH:mm") : String(row[1]||"");
    (days[dk] = days[dk] || { sales:[], visits:[] }).sales.push({ t: startMin_(t), meals: Number(row[5])||0, takeout: /持/.test(kind) }); }
  var vs = ss.getSheetByName("来店"); if (vs){ var vv = vs.getDataRange().getValues(); var h = vv[0].map(String);
    var ci = h.indexOf("日時"), cs = h.indexOf("状態");
    for (var i = 1; i < vv.length; i++){ var x = vv[i][ci]; if (!x) continue; if (cs >= 0 && /取消/.test(String(vv[i][cs]))) continue;
      var dt = (x instanceof Date) ? x : new Date(String(x).replace(/\//g,"-")); if (isNaN(dt)) continue;
      var dk2 = Utilities.formatDate(dt, tz, "yyyy/MM/dd"); if (dk2 < fromKey || dk2 > toKey) continue;
      (days[dk2] = days[dk2] || { sales:[], visits:[] }).visits.push(dt.getHours()*60 + dt.getMinutes()); } }
  return days;
}
// 神田の容量を計算して返す（save=true なら 容量・来店品質 タブに新しい版として追記）
function startKandaCapacity_(fromKey, toKey, save, me){
  var S = startSettings_("kanda");
  var cs = startMin_(S.core_start ? S.core_start.value : "11:00"), ce = startMin_(S.core_end ? S.core_end.value : "14:00");
  var seats = startNum_(S, "physical_seats", 12), stayPlan = startNum_(S, "planning_stay_minutes", 18), buf = startNum_(S, "turnover_buffer_minutes", 2), util = startNum_(S, "seat_utilization", 0.85);
  var kitchen = startNum_(S, "kitchen_capacity_per_hour", null);
  var raw = startReadKanda_(fromKey, toKey); var rows = [], shares = [], r60 = [], stayA = [];
  Object.keys(raw).sort().forEach(function(dk){ var d = raw[dk]; if (!d.sales.length) return;
    var c = startCalcDay(d.sales, cs, ce); var g = startGrade(d.visits.length, c.eatin);
    var occ = null;
    if (g.grade === "A" || g.grade === "B"){
      var deps = []; d.sales.forEach(function(s){ if (!s.takeout && s.t >= 0) for (var k = 0; k < Math.max(1, s.meals||1); k++) deps.push(s.t); });
      occ = startOccupancy(d.visits, deps, g.grade === "B" ? c.eatin / d.visits.length : 1, cs - 30, ce + 90); }
    if (c.peakShare != null) shares.push(c.peakShare); r60.push(c.roll60);
    if (g.grade === "A" && occ && occ.meanStay != null) stayA.push(occ.meanStay);
    rows.push({ date: dk, meals: c.meals, eatin: c.eatin, takeout: c.takeout, core: c.core, roll15: c.roll15, roll60: c.roll60, roll60Eatin: c.roll60Eatin,
      peakShare: c.peakShare == null ? null : Math.round(c.peakShare*1000)/1000, visits: d.visits.length, grade: g.grade, diff: g.diff, ratio: g.ratio == null ? null : Math.round(g.ratio*1000)/1000,
      meanStayArea: occ ? occ.meanStay : null, maxOcc: occ ? occ.max : null }); });
  var peakP75 = startPct_(shares, 0.75);
  var totalMeals = rows.reduce(function(a,x){ return a + x.meals; }, 0), totalTg = rows.reduce(function(a,x){ return a + x.takeout; }, 0);
  var demo = { maxRoll60: r60.length ? Math.max.apply(null, r60) : null, p90Roll60: startPct_(r60, 0.9), maxRoll60Eatin: rows.length ? Math.max.apply(null, rows.map(function(x){ return x.roll60Eatin; })) : null };
  var sens = [15, 18, 20].map(function(m){ return { stay: m, seatCapHour: startSeatCap(seats, m, buf, util) }; });
  var seatPlan = startSeatCap(seats, stayPlan, buf, util);
  var sus = startSustainable(seatPlan, kitchen, peakP75, 0);
  var out = {
    period: fromKey + "〜" + toKey, days: rows,
    summary: { days: rows.length, meals: totalMeals, avgMeals: rows.length ? Math.round(totalMeals / rows.length * 10)/10 : null, takeoutRate: totalMeals ? Math.round(totalTg / totalMeals * 1000)/1000 : null,
      peakShareP75: peakP75 == null ? null : Math.round(peakP75*1000)/1000, observedStayA: stayA.length ? Math.round(stayA.reduce(function(a,b){ return a+b; },0)/stayA.length*10)/10 : null, gradeADays: stayA.length },
    capacity: [
      { kind: "demonstrated", perHour: demo.maxRoll60, perDay: null, cert: "observed", method: "日次の最大ローリング60分食数の最大（会計時刻ベース）", note: "実証済みの下限。上限ではない。P90=" + (demo.p90Roll60 == null ? "-" : Math.round(demo.p90Roll60*10)/10) + "／店内のみ最大=" + demo.maxRoll60Eatin },
      { kind: "theoretical_seat", perHour: seatPlan, perDay: null, cert: "assumption", method: "席数×60÷(計画滞在+入替)×稼働率", note: "席" + seats + "・滞在" + stayPlan + "分・入替" + buf + "分・稼働率" + util },
      { kind: "kitchen", perHour: kitchen, perDay: null, cert: kitchen ? "observed" : "unknown", method: "提供時間の計測", note: kitchen ? "" : "未計測" },
      { kind: "sustainable", perHour: null, perDay: sus.value, cert: sus.cert, method: "min(席,厨房)÷ピーク比率P75", note: sus.note }
    ],
    sensitivity: sens, settings: S
  };
  if (save){
    var now = invNow_(); var ver = "cap-" + Utilities.formatDate(new Date(), "Asia/Tokyo", "yyyyMMdd-HHmm");
    var csh = startSheet_("cap"); out.capacity.forEach(function(c){ invAppend_(csh, { cap_id: invId_("cp_"), store_id:"kanda", "版": ver, "計算日時": now, "種類": c.kind, "値_食時": c.perHour == null ? "" : c.perHour, "値_食日": c.perDay == null ? "" : c.perDay,
      "確度": c.cert, "計算方法": c.method, "対象期間": out.period, "前提": JSON.stringify({ seats:seats, stayPlan:stayPlan, buffer:buf, util:util, peakShareP75:peakP75 }), "メモ": c.note }); });
    var qsh = startSheet_("vq"); rows.forEach(function(x){ invAppend_(qsh, { "日付": "'" + x.date, store_id:"kanda", "来店": x.visits, "店内食数": x.eatin, "差": x.diff, "差率": x.ratio == null ? "" : x.ratio, grade: x.grade,
      "平均滞在_面積法": x.meanStayArea == null ? "" : x.meanStayArea, "最大同時在店": x.maxOcc == null ? "" : x.maxOcc, "計算版": ver, "計算日時": now }); });
    out.version = ver; startLog_(me, "容量", "kanda", "calc", undefined, { version: ver, period: out.period });
  }
  return out;
}

// ================= 読み取り（handleOsGet から） =================
function startGet_(mode, me, p){
  if (!/^os_start_/.test(mode)) return null;
  if (me.role !== "admin") return { error: "管理者のみ" };
  try {
    if (mode === "os_start_home"){
      var lst = startRows_("lst");
      return { projects: startRows_("prj").map(function(r){ return startObj_("prj", r); }), inboxCount: lst.filter(function(r){ return r["取込状態"] === "未確認"; }).length,
        stages: START_STAGES, verdicts: START_VERDICTS, passReasons: START_PASS_REASONS, certs: START_CERT };
    }
    if (mode === "os_start_project"){
      var pid = String(p.id||""); var pr = startFind_("prj","project_id",pid); if (!pr) return { error: "案件が見つかりません" };
      var by = function(k){ return startRows_(k).filter(function(r){ return String(r.project_id) === pid; }).map(function(r){ return startObj_(k, r); }); };
      var props = startRows_("prop").filter(function(r){ return String(r.property_id) === String(pr.property_id); }).map(function(r){ return startObj_("prop", r); });
      var lst2 = startRows_("lst").filter(function(r){ return String(r.property_id) === String(pr.property_id) && pr.property_id; }).map(function(r){ return startObj_("lst", r); });
      return { project: startObj_("prj", pr), properties: props, listings: lst2, sims: by("sim").reverse(), evals: by("ev").reverse(), surveys: by("srv").reverse(),
        settings: pr.store_id ? startSettings_(String(pr.store_id)) : {} };
    }
    if (mode === "os_start_inbox"){
      var props2 = startRows_("prop").map(function(r){ return startObj_("prop", r); });
      var all = startRows_("lst").map(function(r){ return startObj_("lst", r); });
      var inbox = all.filter(function(r){ return r["取込状態"] === "未確認"; }).reverse().map(function(l){ l.dups = startDupCands_(l, props2, all); return l; });
      return { inbox: inbox, properties: props2, recent: all.filter(function(r){ return r["取込状態"] !== "未確認"; }).slice(-30).reverse() };
    }
    if (mode === "os_start_capacity"){
      var from = String(p.from || "2026/10/13"), to = String(p.to || invToday_());
      return startKandaCapacity_(from, to, String(p.save||"") === "1", me);
    }
    if (mode === "os_start_capacity_hist"){ return { list: startRows_("cap").slice(-60).reverse().map(function(r){ return startObj_("cap", r); }) }; }
  } catch(e){ return { error: String(e && e.message || e) }; }
  return { error: "unknown mode" };
}
// 重複候補: 同じURL／住所が一致／駅が同じで坪±0.5かつ賃料±5%
function startDupCands_(l, props, all){
  var out = []; var seen = {};
  function add(pid, why){ if (!pid || seen[pid]) return; seen[pid] = 1; out.push({ property_id: pid, why: why }); }
  all.forEach(function(o){ if (o.listing_id !== l.listing_id && o.property_id && l.source_url && o.source_url === l.source_url) add(o.property_id, "同じURL"); });
  props.forEach(function(p){
    if (l["住所"] && p["住所"] && l["住所"] !== "unknown" && p["住所"].replace(/\s/g,"") === l["住所"].replace(/\s/g,"")) add(p.property_id, "住所が一致");
    var lt = Number(l["坪"]), pt = Number(p["坪"]);
    if (l["最寄駅"] && p["最寄駅"] && p["最寄駅"].indexOf(String(l["最寄駅"]).replace(/駅$/,"")) >= 0 && lt && pt && Math.abs(lt-pt) <= 0.5){
      var rentSame = all.some(function(o){ return o.property_id === p.property_id && Number(o["賃料"]) && Number(l["賃料"]) && Math.abs(Number(o["賃料"]) - Number(l["賃料"])) <= Number(l["賃料"])*0.05; });
      add(p.property_id, rentSame ? "駅・坪・賃料が近い" : "駅・坪が近い"); } });
  return out;
}

// ================= 書き込み（handleOsPost から。ロックは handleOsPost 側） =================
function startPost_(d, me){
  var type = String(d.type||""); if (!/^os_start_/.test(type)) return null;
  if (me.role !== "admin") return { error: "管理者のみ" };
  if (type === "os_start_project_save") return startProjectSave_(d, me);
  if (type === "os_start_listing_add") return startListingAdd_(d, me);
  if (type === "os_start_listing_set") return startListingSet_(d, me);
  if (type === "os_start_sim_save") return startSimSave_(d, me);
  if (type === "os_start_sim_freeze") return startSimFreeze_(d, me);
  if (type === "os_start_eval_save") return startEvalSave_(d, me);
  if (type === "os_start_survey_save") return startSurveySave_(d, me);
  if (type === "os_start_setting_add") return startSettingAdd_(d, me);
  return { error: "unknown type" };
}
// 案件: 新規 or 更新（stage・契約状況・メモ・store_id 等）。変更は履歴に残す
function startProjectSave_(d, me){
  var sh = startSheet_("prj"); var now = invNow_(); var editable = ["案件名","運営形態","stage","契約状況","決裁者","store_id","property_id","状態","メモ"];
  if (d.stage && START_STAGES.indexOf(String(d.stage)) < 0) return { error: "stage が不正" };
  if (d.id){ var r = startFind_("prj","project_id",d.id); if (!r) return { error: "見つかりません" };
    var before = {}, after = {};
    editable.forEach(function(c){ if (d[c] !== undefined && String(d[c]) !== String(r[c])){ before[c] = startTxt_(r[c]); after[c] = d[c]; invSet_(sh, r._row, c, d[c]); } });
    if (!Object.keys(after).length) return { ok:true, id:d.id, changed:0 };
    invSet_(sh, r._row, "更新日時", now); invSet_(sh, r._row, "更新者", me.name); startLog_(me, "案件", d.id, "update", before, after);
    return { ok:true, id:d.id, changed: Object.keys(after).length }; }
  var n = startRows_("prj").length + 1; var id = "PRJ-" + ("000" + n).slice(-4); while (startFind_("prj","project_id",id)){ n++; id = "PRJ-" + ("000" + n).slice(-4); }
  var o = { project_id:id, "役割":"opening_project", "運営形態": d["運営形態"]||"直営", stage: d.stage||"idea", "契約状況": d["契約状況"]||"未申込", "決裁者": d["決裁者"]||"長下佳奈", "状態":"有効", "作成日時":now, "更新日時":now, "更新者":me.name };
  editable.forEach(function(c){ if (d[c] !== undefined && o[c] === undefined) o[c] = d[c]; }); o["案件名"] = d["案件名"] || "（無題）";
  invAppend_(sh, o); startLog_(me, "案件", id, "create", undefined, o); return { ok:true, id:id };
}
// 掲載の手動登録（URL＋分かる項目だけ）。分からない項目は unknown。ページの自動取得はしない（規約の確認が済むまで）
var START_LST_FIELDS = ["source","source_url","掲載状態","賃料","共益費","保証金","礼金","造作譲渡","前テナント","入居可能日","契約形態","最寄駅","徒歩分","面積㎡","坪","住所","抽出メモ","evidence_link"];
var START_LST_KEYS = ["賃料","面積㎡","坪","最寄駅","徒歩分","住所","造作譲渡","契約形態","入居可能日"];
function startListingAdd_(d, me){
  var now = invNow_(); var id = invId_("ls_"); var o = { listing_id:id, property_id:"", "取込状態":"未確認", "初出日": "'" + invToday_(), "最終確認日": "'" + invToday_(), "登録者": me.name, "登録日時": now, "更新日時": now };
  START_LST_FIELDS.forEach(function(c){ var v = d[c]; o[c] = (v === undefined || v === null || String(v).trim() === "") ? "" : v; });
  o.source = o.source || "手動"; o["掲載状態"] = o["掲載状態"] || "掲載中";
  o["未確認項目"] = START_LST_KEYS.filter(function(k){ return o[k] === "" || o[k] === "unknown"; }).join("・");
  if (o.source_url){ var dup = startRows_("lst").filter(function(r){ return String(r.source_url) === String(o.source_url); })[0];
    if (dup){ invSet_(startSheet_("lst"), dup._row, "最終確認日", "'" + invToday_()); return { ok:true, id: dup.listing_id, existed: true }; } }
  invAppend_(startSheet_("lst"), o); startLog_(me, "掲載", id, "create", undefined, { source:o.source, url:o.source_url }); return { ok:true, id:id };
}
// Inbox の処理: 既存物件に紐付け／新しい物件として登録／対象外。物件は消さない
function startListingSet_(d, me){
  var sh = startSheet_("lst"); var r = startFind_("lst","listing_id",d.id); if (!r) return { error: "見つかりません" }; var now = invNow_();
  var act = String(d.action||"");
  if (act === "link"){ if (!startFind_("prop","property_id",d.property_id)) return { error: "物件が見つかりません" };
    invSet_(sh, r._row, "property_id", d.property_id); invSet_(sh, r._row, "取込状態", "紐付け済"); }
  else if (act === "new_property"){
    var ps = startSheet_("prop"); var n = startRows_("prop").length + 1; var pid = "PROP-" + ("000" + n).slice(-4); while (startFind_("prop","property_id",pid)){ n++; pid = "PROP-" + ("000" + n).slice(-4); }
    invAppend_(ps, { property_id: pid, "名称": d["名称"] || (String(r["最寄駅"]||"") + " " + String(r["坪"]||"") + "坪"), "住所": r["住所"]||"unknown", "最寄駅": r["最寄駅"]||"", "徒歩分": r["徒歩分"]||"unknown",
      "面積㎡": r["面積㎡"]||"unknown", "坪": r["坪"]||"unknown", "飲食可":"unknown", "重飲食":"unknown", "ガス":"unknown", "排気":"unknown", "排水":"unknown", "グリストラップ":"unknown",
      "設備確認":"未確認", "状態":"検討中", "登録日時": now, "更新日時": now });
    invSet_(sh, r._row, "property_id", pid); invSet_(sh, r._row, "取込状態", "紐付け済"); d.property_id = pid; }
  else if (act === "ignore"){ invSet_(sh, r._row, "取込状態", "対象外"); invSet_(sh, r._row, "抽出メモ", String(r["抽出メモ"]||"") + (d.reason ? "／対象外: " + d.reason : "")); }
  else if (act === "ended"){ invSet_(sh, r._row, "掲載状態", "掲載終了"); invSet_(sh, r._row, "最終確認日", "'" + invToday_()); }
  else return { error: "action が不正" };
  invSet_(sh, r._row, "更新日時", now); startLog_(me, "掲載", d.id, act, undefined, { property_id: d.property_id||"", reason: d.reason||"" });
  return { ok:true, id:d.id, property_id: d.property_id||"" };
}
// 試算: 新しい版を作る。凍結済みは変更不可（同じ sim_id で来たら拒否）
var START_SIM_KEYS = ["price","costRate","days","labor","rent","otherFixed","otherIncome","debt","ownerPay","initialInvestment","demandLo","demandHi","seats","stay","buffer","util","kitchenCapHour","peakShare","takeoutDay"];
function startSimSave_(d, me){
  if (!startFind_("prj","project_id",d.project_id)) return { error: "案件が見つかりません" };
  if (d.id){ var old = startFind_("sim","sim_id",d.id); if (old && String(old["状態"]) === "frozen") return { error: "凍結済みの試算は変更できません。新しい版として保存してください" }; }
  var inp = d.inputs || {}; var certs = d.certs || {}; var a = {};
  START_SIM_KEYS.forEach(function(k){ if (inp[k] !== undefined && inp[k] !== "") a[k] = { value: Number(inp[k]), cert: START_CERT.indexOf(String(certs[k])) >= 0 ? String(certs[k]) : "assumption", note: String((d.notes||{})[k]||"") }; });
  var v = function(k){ return a[k] ? a[k].value : undefined; };
  var req = startRequired({ price:v("price"), costRate:v("costRate"), days:v("days"), labor:v("labor"), rent:v("rent"), otherFixed:v("otherFixed"), otherIncome:v("otherIncome"), debt:v("debt"), ownerPay:v("ownerPay") });
  if (req.error) return { error: req.error };
  var seatCap = startSeatCap(v("seats"), v("stay"), v("buffer"), v("util") == null ? 0.85 : v("util"));
  var sus = startSustainable(seatCap, v("kitchenCapHour"), v("peakShare"), v("takeoutDay"));
  var margin = sus.value == null ? "" : sus.value - req.afterDebt;
  var vers = startRows_("sim").filter(function(r){ return String(r.project_id) === String(d.project_id); }).length + 1;
  var id = invId_("sm_"); var now = invNow_();
  var res = { required: req, seatCapHour: seatCap, sustainable: sus, capacityMargin: margin, demandLo: v("demandLo"), demandHi: v("demandHi"), calc: START_VER };
  invAppend_(startSheet_("sim"), { sim_id:id, project_id:d.project_id, property_id: d.property_id||"", "版": vers, "状態":"draft", "前提JSON": JSON.stringify(a), "結果JSON": JSON.stringify(res),
    "必要食数_店舗": req.store, "必要食数_返済後": req.afterDebt, "必要食数_オーナー": req.owner, "処理上限_日": sus.value == null ? "" : sus.value, "処理上限_確度": sus.cert, capacity_margin: margin,
    "作成者": me.name, "作成日時": now, "前のsim_id": d.prev||"", "メモ": d.memo||"" });
  startLog_(me, "試算", id, "create", undefined, { project_id: d.project_id, 版: vers }); return { ok:true, id:id, result: res };
}
// 凍結: 前提と結果を固定し、ハッシュを残す。決裁ログに「提案中」の行を作る（承認はしない）
function startSimFreeze_(d, me){
  var sh = startSheet_("sim"); var r = startFind_("sim","sim_id",d.id); if (!r) return { error: "見つかりません" };
  if (String(r["状態"]) === "frozen") return { error: "すでに凍結済みです" };
  var snap = JSON.stringify({ sim_id:r.sim_id, project_id:r.project_id, property_id:r.property_id, 版:r["版"], 前提:String(r["前提JSON"]), 結果:String(r["結果JSON"]) });
  var hash = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, snap, Utilities.Charset.UTF_8).map(function(b){ var h = (b < 0 ? b + 256 : b).toString(16); return h.length === 1 ? "0" + h : h; }).join("");
  var now = invNow_(); var decId = "";
  try { var pr = startFind_("prj","project_id",r.project_id);
    var dr = osDecSave_({ "店舗": String(pr && pr.store_id || r.project_id), "領域": "出店", "件名": "出店判断（" + String(pr ? pr["案件名"] : r.project_id) + "）試算 版" + r["版"] + " 凍結",
      "提案者": me.name, "提案内容": d.reason || "GO判断のための試算を凍結", "分析・根拠": "必要食数(返済後) " + r["必要食数_返済後"] + "／処理上限 " + r["処理上限_日"] + "（" + r["処理上限_確度"] + "）／余裕 " + r.capacity_margin,
      "根拠リンク": "START 試算 " + r.sim_id + " sha256:" + hash.slice(0,12), "状態": "提案中" }, me);
    decId = dr && dr.id || ""; } catch(e){ decId = ""; }
  invSet_(sh, r._row, "状態", "frozen"); invSet_(sh, r._row, "凍結者", me.name); invSet_(sh, r._row, "凍結日時", now); invSet_(sh, r._row, "凍結ハッシュ", hash); invSet_(sh, r._row, "関連dec_id", decId);
  try { sh.getRange(r._row, 1, 1, sh.getLastColumn()).setBackground("#eef3ea"); } catch(e){}
  startLog_(me, "試算", r.sim_id, "freeze", undefined, { hash: hash, dec_id: decId }); return { ok:true, id: r.sim_id, hash: hash, dec_id: decId };
}
// 凍結済み試算の改ざん確認（エディタやバッチから）
function startVerifyFrozen(){
  var bad = []; startRows_("sim").filter(function(r){ return String(r["状態"]) === "frozen"; }).forEach(function(r){
    var snap = JSON.stringify({ sim_id:r.sim_id, project_id:r.project_id, property_id:r.property_id, 版:r["版"], 前提:String(r["前提JSON"]), 結果:String(r["結果JSON"]) });
    var h = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, snap, Utilities.Charset.UTF_8).map(function(b){ var x = (b < 0 ? b + 256 : b).toString(16); return x.length === 1 ? "0" + x : x; }).join("");
    if (h !== String(r["凍結ハッシュ"])) bad.push(r.sim_id); });
  Logger.log(JSON.stringify({ changed: bad })); return { changed: bad };
}
// 評価: 判定はルールで計算（人が上書きしたときは理由メモに残る）。PASS は見送り理由が必須
function startEvalSave_(d, me){
  if (!startFind_("prj","project_id",d.project_id)) return { error: "案件が見つかりません" };
  var calc = startVerdict({ cut: d.cut, need: d.need, demandLo: d.demandLo, capacity: d.capacity, unknowns: String(d.unknownItems||"").split(/[・,、\n]/).filter(String).length, surveyed: !!d.surveyed });
  var verdict = d.verdict && START_VERDICTS.indexOf(String(d.verdict)) >= 0 ? String(d.verdict) : calc.verdict;
  if (verdict === "PASS" && !d.passReason && calc.verdict !== "PASS") return { error: "見送り（PASS）には見送り理由が必要です" };
  var reason = d.passReason || (verdict === "PASS" ? (/処理能力/.test(calc.why) ? "処理能力不足" : (/需要/.test(calc.why) ? "需要不足" : (calc.why === "足切り" ? "その他" : ""))) : "");
  var vers = startRows_("ev").filter(function(r){ return String(r.project_id) === String(d.project_id) && String(r.property_id) === String(d.property_id||""); }).length + 1;
  var id = invId_("ev_");
  invAppend_(startSheet_("ev"), { eval_id:id, project_id:d.project_id, property_id:d.property_id||"", "版":vers, "足切り": d.cut||"unknown", "足切りメモ": d.cutMemo||"", "必要食数": d.need||"",
    "需要見込み_下限": d.demandLo||"", "需要見込み_上限": d.demandHi||"", "需要_確度": d.demandCert||"estimated", "処理上限": d.capacity||"", "処理上限_確度": d.capacityCert||"assumption",
    "未確認事項": d.unknownItems||"", "余裕度": calc.margin == null ? "" : calc.margin, "判定": verdict, "見送り理由": reason,
    "理由メモ": (verdict !== calc.verdict ? "ルール判定は " + calc.verdict + "（" + calc.why + "）→ 人が " + verdict + " に変更。" : calc.why + "。") + (d.memo||""),
    sim_id: d.sim_id||"", "評価者": me.name, "評価日時": invNow_() });
  startLog_(me, "評価", id, "create", undefined, { verdict: verdict, rule: calc.verdict }); return { ok:true, id:id, verdict: verdict, rule: calc };
}
function startSurveySave_(d, me){
  if (!startFind_("prj","project_id",d.project_id)) return { error: "案件が見つかりません" };
  var id = invId_("sv_"); var o = { survey_id:id, project_id:d.project_id, property_id:d.property_id||"", "登録者":me.name, "登録日時":invNow_() };
  ["日付","開始","終了","調査者","方法","通行量","入店","退店","入店断念","行列最大","席占有","対象店","メモ","元データリンク"].forEach(function(c){ if (d[c] !== undefined) o[c] = (c === "日付" && d[c]) ? "'" + d[c] : d[c]; });
  invAppend_(startSheet_("srv"), o); startLog_(me, "現地調査", id, "create", undefined, { project_id: d.project_id, 日付: d["日付"]||"" }); return { ok:true, id:id };
}
// 店舗設定は上書きしない。新しい値は有効開始つきの新しい行（最新の有効開始が勝つ）
function startSettingAdd_(d, me){
  if (!d.store_id || !d["項目"]) return { error: "store_id と項目が必要" };
  if (START_CERT.indexOf(String(d["確度"])) < 0) return { error: "確度は fact / observed / estimated / assumption / unknown のどれか" };
  if (!d["根拠"]) return { error: "根拠が必要です" };
  var id = invId_("st_");
  invAppend_(startSheet_("set"), { setting_id:id, store_id:d.store_id, project_id:d.project_id||"", "項目":d["項目"], "値":d["値"], "単位":d["単位"]||"", "確度":d["確度"], "有効開始": "'" + (d["有効開始"]||invToday_()), "根拠":d["根拠"], "メモ":d["メモ"]||"", "登録者":me.name, "登録日時":invNow_() });
  startLog_(me, "店舗設定", id, "create", undefined, { store_id: d.store_id, 項目: d["項目"], 値: d["値"], 確度: d["確度"] }); return { ok:true, id:id };
}

// ================= Property Inbox: Gmail 取り込み =================
// Gmail で物件の新着通知に「ORION/物件」ラベルを付ける（フィルタで自動化可）。startMailScan が拾って「掲載」に未確認で入れる
// 本文から読めた値だけ入れる。読めない値は空欄＝未確認項目。推測で埋めない。元メールへのリンクを evidence として残す
var START_MAIL_LABEL = "ORION/物件", START_MAIL_DONE = "ORION/物件取込済";
function startMailScan(){
  var lab = GmailApp.getUserLabelByName(START_MAIL_LABEL); if (!lab) { lab = GmailApp.createLabel(START_MAIL_LABEL); return { ok:true, added:0, note:"ラベルを作成しました" }; }
  var done = GmailApp.getUserLabelByName(START_MAIL_DONE) || GmailApp.createLabel(START_MAIL_DONE);
  var known = {}; startRows_("lst").forEach(function(r){ if (r["メールID"]) known[String(r["メールID"])] = 1; });
  var threads = GmailApp.search('label:"' + START_MAIL_LABEL + '" -label:"' + START_MAIL_DONE + '"', 0, 30); var added = 0; var sh = startSheet_("lst");
  threads.forEach(function(th){ th.getMessages().forEach(function(m){ if (known[m.getId()]) return;
    var x = startExtract(m.getPlainBody() || "", m.getSubject() || ""); var now = invNow_();
    var o = { listing_id: invId_("ls_"), property_id:"", "取込状態":"未確認", source: startSource_(m.getFrom()), source_url: x.url || "", "初出日": "'" + Utilities.formatDate(m.getDate(), "Asia/Tokyo", "yyyy/MM/dd"),
      "最終確認日": "'" + invToday_(), "掲載状態":"掲載中", "賃料": x.rent, "坪": x.tsubo, "面積㎡": x.sqm, "最寄駅": x.station, "徒歩分": x.walk, "住所": x.address, "造作譲渡": x.transfer,
      "抽出メモ": "件名: " + m.getSubject(), "未確認項目": x.missing.join("・"), evidence_link: "https://mail.google.com/mail/u/0/#all/" + m.getId(), "メールID": m.getId(), "登録者":"メール取込", "登録日時":now, "更新日時":now };
    invAppend_(sh, o); added++; }); th.addLabel(done); });
  startLog_(null, "掲載", "", "mail_scan", undefined, { added: added }); return { ok:true, added: added };
}
function startSource_(from){ var m = String(from||"").match(/@([\w.-]+)/); return m ? m[1] : "メール"; }
// 本文から読み取る（見つからない項目は missing に入れる）。純粋関数
function startExtract(body, subject){
  var t = String(subject||"") + "\n" + String(body||""); var out = { url:"", rent:"", tsubo:"", sqm:"", station:"", walk:"", address:"", transfer:"", missing:[] };
  var u = t.match(/https?:\/\/[^\s<>"）)]+/); if (u) out.url = u[0];
  var r = t.match(/賃料[^\d\n]{0,6}([\d,.]+)\s*(万)?\s*円?/); if (r){ var n = Number(r[1].replace(/,/g,"")); out.rent = r[2] ? Math.round(n*10000) : n; }
  var ts = t.match(/([\d.]+)\s*坪/); if (ts) out.tsubo = Number(ts[1]);
  var sq = t.match(/([\d.]+)\s*(㎡|m²|m2|平米)/); if (sq) out.sqm = Number(sq[1]);
  var st = t.match(/([^\s「」【】()（）、,。・\n]{1,12}?)駅[^\d\n]{0,4}徒歩\s*(\d+)\s*分/); if (st){ out.station = st[1]; out.walk = Number(st[2]); }
  var ad = t.match(/(東京都[^\s、,。\n]{2,40}?\d+(?:[-－丁目]\d+)*)/); if (ad) out.address = ad[1];
  var tr = t.match(/造作(?:譲渡)?(?:料)?[^\d\n無なし]{0,6}([\d,.]+)\s*(万)?\s*円?/); if (tr){ var tn = Number(tr[1].replace(/,/g,"")); out.transfer = tr[2] ? Math.round(tn*10000) : tn; }
  [["url","URL"],["rent","賃料"],["tsubo","坪"],["station","最寄駅"],["walk","徒歩分"],["address","住所"]].forEach(function(k){ if (out[k[0]] === "") out.missing.push(k[1]); });
  return out;
}
// orion.napolitan@gmail.com の収集スクリプト（collector.gs）経由の取り込み。mail.gs の osMailIngest_ から呼ぶ
//  orion 側の Gmail フィルタ: 下の差出人ドメイン → ラベル「ORION/物件」・迷惑メールにしない・カテゴリ「メイン」（収集はプロモーションを除外するため）
var START_MAIL_DOMAINS = ["inshokuten.com","synchro-food.co.jp","i-tenpo.com","abc-tenpo.com","bukenavi.jp","homes.co.jp","lifull.com","lifull.jp","athome.co.jp","athome.jp"];
function startIsPropertyMail_(from){ var f = String(from||"").toLowerCase(); return START_MAIL_DOMAINS.some(function(d){ return f.indexOf("@" + d) >= 0 || f.indexOf("." + d) >= 0; }); }
function startIngestMessages_(msgs, mailbox){
  if (!PropertiesService.getScriptProperties().getProperty(START_PROP)) return 0; // START 未設定なら何もしない
  // 会員登録・認証・パスワード等のお知らせは物件ではないので入れない
  var props = (msgs||[]).filter(function(m){ return startIsPropertyMail_(m.from) && !/会員登録|仮登録|本登録|登録完了|認証|パスワード|ログイン|退会|メールアドレスの(確認|登録)|求人|人材|スカウト|月間レポート/.test(String(m.subject||"")); }); if (!props.length) return 0;
  var known = {}; startRows_("lst").forEach(function(r){ if (r["メールID"]) known[String(r["メールID"])] = 1; });
  var sh = startSheet_("lst"); var n = 0;
  props.forEach(function(m){ if (known[m.id]) return; known[m.id] = 1;
    var x = startExtract(m.body || "", m.subject || ""); var now = invNow_();
    var link = mailbox ? "https://mail.google.com/mail/?authuser=" + encodeURIComponent(mailbox) + "#all/" + m.id : "https://mail.google.com/mail/u/0/#all/" + m.id;
    invAppend_(sh, { listing_id: invId_("ls_"), property_id:"", "取込状態":"未確認", source: startSource_(m.from), source_url: x.url || "", "初出日": "'" + String(m.date||invToday_()).slice(0,10),
      "最終確認日": "'" + invToday_(), "掲載状態":"掲載中", "賃料": x.rent, "坪": x.tsubo, "面積㎡": x.sqm, "最寄駅": x.station, "徒歩分": x.walk, "住所": x.address, "造作譲渡": x.transfer,
      "抽出メモ": "件名: " + String(m.subject||""), "未確認項目": x.missing.join("・"), evidence_link: link, "メールID": m.id, "登録者":"メール取込(orion)", "登録日時":now, "更新日時":now });
    n++; });
  if (n) startLog_(null, "掲載", "", "mail_ingest", undefined, { added: n, mailbox: mailbox||"" });
  return n;
}
// 1時間ごとの取り込みを設定（エディタから1回だけ）
function startMailTriggerInstall(){
  ScriptApp.getProjectTriggers().forEach(function(tr){ if (tr.getHandlerFunction() === "startMailScan") ScriptApp.deleteTrigger(tr); });
  ScriptApp.newTrigger("startMailScan").timeBased().everyHours(1).create(); return { ok:true };
}
// ===== ORION START END =====

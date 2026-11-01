// ===== ORION OS 台帳（Facts / Knowledge / 決裁権限 / 関連当事者取引 / 未回答質問） =====
// 考え方：
//  - Facts     … 判断を変える値（価格・営業時間・仕入条件・FC条件・店舗ステータス・基本シフト）。状態と履歴を持つ
//  - Knowledge … 現場の決まりごと（レシピ分量・手順・対応）。承認者1人、Factより軽い
//  - 決裁権限   … 誰が何を決められるか（Fact の承認者を決める表）
//  - 関連当事者取引 … アウタ⇄オリオンの立替・精算の台帳（税務・融資・DD 用）
//  - 未回答質問 … 「聞く」で答えられなかった質問。回答されたら Knowledge へ昇格
//  基本原則：DD・融資・税務に耐える Evidence 設計。重要データは「出所・担当・承認者・有効日・状態・証憑・更新日時」を持ち、上書きせず履歴を残す。提案者と最終決裁者は別の列
// 取り付け: handleFxGet/handleFxPost と同様に doGet /^os_/ → handleOsGet、doPost handleOsPost
var OS_FACTS = "Facts"; var OS_FACTS_COLS = ["fact_id","分類","店舗","項目","値","状態","有効開始","有効終了","根拠","承認者","承認日時","前のfact_id","メモ","登録者","登録日時"];
var OS_KNOW = "Knowledge"; var OS_KNOW_COLS = ["k_id","店舗","対象","分類","質問","回答","状態","承認者","更新日時","出典","タグ","前のk_id","変更理由"];
var OS_AUTH = "決裁権限"; var OS_AUTH_COLS = ["領域","内容の例","提案","承認","実施","記録先","メモ"];
var OS_RPT = "関連当事者取引"; var OS_RPT_COLS = ["rpt_id","日付","店舗","支払者","本来負担者","相手先","内容","金額(税込)","税抜","消費税","勘定科目","支払方法","オリオン帰属","帰属の根拠","帰属の確度","精算区分","精算状態","精算日","精算額","承認者","承認日","会計計上","アウタ仕訳ID","オリオン仕訳ID","契約書","証憑","メモ","登録日時"];
var OS_UNANS = "未回答質問"; var OS_UNANS_COLS = ["q_id","日時","質問者","役割","質問","状態","回答","回答者","回答日時","k_id"];
var OS_AILOG = "AIログ"; var OS_AILOG_COLS = ["log_id","日時","利用者","役割","モデル","質問","回答","根拠k_id","入力tokens","出力tokens","所要ms","評価","保存区分"];
// 保存区分: 通常（90日で削除）／Knowledge（Knowledge昇格につながった質問・永続）／決裁（経営判断に使った分析・永続）

function osSheet_(name, cols){ return invSheet_(name, cols); }
function osRows_(name, cols){ return invRows_(osSheet_(name, cols)); }

// ---------- 読み取り ----------
function handleOsGet(e){
  var p = e.parameter; var me = invAuth_(p); if (!me) return invOut_({ error: "auth" });
  var mode = String(p.mode||"");
  if (mode === "os_home"){
    var facts = osRows_(OS_FACTS, OS_FACTS_COLS).filter(function(r){ return r["状態"] !== "superseded" && r["状態"] !== "rejected"; });
    var know = osRows_(OS_KNOW, OS_KNOW_COLS).filter(function(r){ return r["状態"] === "approved" && osCanSee_(me, String(r["対象"])); });
    var un = osRows_(OS_UNANS, OS_UNANS_COLS).filter(function(r){ return r["状態"] !== "回答済"; });
    return invOut_({ me: me, facts: facts.map(osFact_), knowledge: know.map(osKnow_), unanswered: me.role === "admin" ? un.map(osUnans_) : un.filter(function(r){ return r["質問者"] === me.name; }).map(osUnans_), contractAlerts: me.role === "admin" ? (function(){ try { return osContractAlerts_(90); } catch(e){ return []; } })() : [], auth: me.role === "admin" ? osRows_(OS_AUTH, OS_AUTH_COLS).map(function(r){ var o = {}; OS_AUTH_COLS.forEach(function(c){ o[c] = String(r[c]||""); }); return o; }) : [] });
  }
  if (mode === "os_rpt"){ if (me.role !== "admin") return invOut_({ error: "管理者のみ" }); return invOut_({ list: osRows_(OS_RPT, OS_RPT_COLS).map(osRpt_) }); }
  if (mode === "os_seed"){ if (me.role !== "admin") return invOut_({ error: "管理者のみ" }); return invOut_(osSeed20261101()); }
  if (mode === "os_myq"){ // 自分の質問（最新20件）。回答がついたものは回答も返す
    var mine = osRows_(OS_UNANS, OS_UNANS_COLS).filter(function(r){ return String(r["質問者"]) === me.name; }).slice(-20).reverse();
    return invOut_({ list: mine.map(function(r){ return { id:r.q_id, at:String(r["日時"]), q:String(r["質問"]), status:String(r["状態"]), a:String(r["回答"]||""), answeredAt:String(r["回答日時"]||"") }; }) });
  }
  if (mode === "os_mail"){ if (me.role !== "admin") return invOut_({ error: "管理者のみ" }); return invOut_({ list: osRows_(OS_MAILCAND, OS_MAILCAND_COLS).filter(function(r){ return String(r["状態"]) === "未確認"; }).slice(-100).reverse().map(function(r){ var o = {}; OS_MAILCAND_COLS.forEach(function(c){ o[c] = String(r[c]===undefined?"":r[c]); }); return o; }) }); }
  var lg = osLedgerGet_(mode, me); if (lg) return invOut_(lg);
  if (mode === "os_snapshot_run"){ if (me.role !== "admin") return invOut_({ error: "管理者のみ" }); return invOut_(osSnapshot(String(p.ym||""), me)); }
  if (mode === "os_ai_diag"){ if (me.role !== "admin") return invOut_({ error: "管理者のみ" }); return invOut_(osAiDiag_(me)); }
  if (mode === "os_seed_mail"){ if (me.role !== "admin") return invOut_({ error: "管理者のみ" }); return invOut_({ result: osMailSeedRules(), rules: osMailRules_().length }); }
  if (mode === "os_seed_ledgers"){ if (me.role !== "admin") return invOut_({ error: "管理者のみ" }); return invOut_(osSeedLedgers20261101()); }
  if (mode === "os_ailog"){ if (me.role !== "admin") return invOut_({ error: "管理者のみ" }); return invOut_({ list: osRows_(OS_AILOG, OS_AILOG_COLS).slice(-200).reverse() }); }
  return invOut_({ error: "unknown mode" });
}
function osCanSee_(me, target){ // 対象: 全員 / 現場 / 店長 / 事務局
  if (me.role === "admin") return true;
  return target === "" || target === "全員" || target === "現場";
}
function osFact_(r){ return { id:r.fact_id, cat:String(r["分類"]), store:String(r["店舗"]), item:String(r["項目"]), value:String(r["値"]), status:String(r["状態"]), from:dateKey_(r["有効開始"]), to:dateKey_(r["有効終了"]), evidence:String(r["根拠"]), by:String(r["承認者"]), at:String(r["承認日時"]), prev:String(r["前のfact_id"]), memo:String(r["メモ"]) }; }
function osKnow_(r){ return { id:r.k_id, store:String(r["店舗"]||"kanda"), target:String(r["対象"]), cat:String(r["分類"]), q:String(r["質問"]), a:String(r["回答"]), status:String(r["状態"]), by:String(r["承認者"]), at:String(r["更新日時"]), src:String(r["出典"]), tags:String(r["タグ"]), prev:String(r["前のk_id"]||""), reason:String(r["変更理由"]||"") }; }
function osUnans_(r){ return { id:r.q_id, at:String(r["日時"]), who:String(r["質問者"]), role:String(r["役割"]), q:String(r["質問"]), status:String(r["状態"]), a:String(r["回答"]), by:String(r["回答者"]) }; }
function osRpt_(r){ var o = {}; OS_RPT_COLS.forEach(function(c){ o[c] = (c === "日付" || c === "精算日" || c === "承認日") ? dateKey_(r[c]) : (r[c] instanceof Date ? String(r[c]) : (r[c] === undefined ? "" : r[c])); }); return o; }

// ---------- 書き込み ----------
function handleOsPost(d){
  if (!d || !/^os_/.test(String(d.type||""))) return null;
  if (d.type === "os_mail_ingest"){ try { return invOut_(osMailIngest_(d)); } catch(e){ return invOut_({ error:String(e) }); } } // 合い言葉認証（スタッフのログイン不要）
  var res;
  try {
    var me = invAuth_(d); if (!me) return invOut_({ error: "auth" });
    var lock = LockService.getScriptLock(); lock.waitLock(10000);
    try {
      if (d.type === "os_fact_save") res = osFactSave_(d, me);
      else if (d.type === "os_fact_status") res = osFactStatus_(d, me);
      else if (d.type === "os_know_save") res = osKnowSave_(d, me);
      else if (d.type === "os_ask") res = osAsk_(d, me);
      else if (d.type === "os_answer") res = osAnswer_(d, me);
      else if (d.type === "os_rate") res = osRate_(d, me);
      else if (d.type === "os_mail_set") res = osMailCandSet_(d, me);
      else if (d.type === "os_dec_save") res = osDecSave_(d, me);
      else if (d.type === "os_contract_save") res = osContractSave_(d, me);
      else if (d.type === "os_rpt_save") res = osRptSave_(d, me);
      else res = { error: "unknown type" };
    } finally { lock.releaseLock(); }
  } catch(e){ res = { error: String(e) }; }
  return invOut_(res);
}
// Fact を提案（proposed）または承認付きで登録。既存の approved を置き換える場合は prev に旧IDを入れ、旧を superseded にする
function osFactSave_(d, me){
  if (me.role !== "admin") return { error: "管理者のみ" };
  var sh = osSheet_(OS_FACTS, OS_FACTS_COLS); var now = invNow_(); var status = d.approve ? "approved" : "proposed";
  var id = invId_("f_");
  if (d.prev){ var rows = invRows_(sh); var old = rows.filter(function(r){ return r.fact_id === d.prev; })[0]; if (old){ invSet_(sh, old._row, "状態", "superseded"); invSet_(sh, old._row, "有効終了", String(d.from||invToday_())); } }
  invAppend_(sh, { fact_id:id, "分類":String(d.cat||""), "店舗":String(d.store||"kanda"), "項目":String(d.item||""), "値":String(d.value||""), "状態":status, "有効開始":"'" + String(d.from||invToday_()), "有効終了":"", "根拠":String(d.evidence||""), "承認者": d.approve ? me.name : "", "承認日時": d.approve ? now : "", "前のfact_id":String(d.prev||""), "メモ":String(d.memo||""), "登録者":me.name, "登録日時":now });
  return { ok:true, id:id };
}
function osFactStatus_(d, me){
  if (me.role !== "admin") return { error: "管理者のみ" };
  var sh = osSheet_(OS_FACTS, OS_FACTS_COLS); var r = invRows_(sh).filter(function(x){ return x.fact_id === d.id; })[0]; if (!r) return { error: "見つかりません" };
  var st = String(d.status||""); if (["approved","proposed","superseded","rejected"].indexOf(st) < 0) return { error: "状態が不正" };
  invSet_(sh, r._row, "状態", st); if (st === "approved"){ invSet_(sh, r._row, "承認者", me.name); invSet_(sh, r._row, "承認日時", invNow_()); }
  return { ok:true };
}
function osKnowSave_(d, me){
  if (me.role !== "admin") return { error: "管理者のみ" };
  var sh = osSheet_(OS_KNOW, OS_KNOW_COLS); var now = invNow_(); var id = invId_("k_");
  var base = {}; var prev = "";
  if (d.id){ // 修正は上書きせず、旧行を archived にして新行を作る（履歴を残す）
    var r = invRows_(sh).filter(function(x){ return x.k_id === d.id; })[0]; if (!r) return { error: "見つかりません" };
    OS_KNOW_COLS.forEach(function(c){ base[c] = r[c]; }); prev = d.id;
    invSet_(sh, r._row, "状態", "archived"); invSet_(sh, r._row, "更新日時", now);
  }
  var val = function(key, col, dflt){ return d[key] !== undefined ? String(d[key]) : (base[col] !== undefined && base[col] !== "" ? String(base[col]) : dflt); };
  invAppend_(sh, { k_id:id, "店舗":val("store","店舗","kanda"), "対象":val("target","対象","現場"), "分類":val("cat","分類",""), "質問":val("q","質問",""), "回答":val("a","回答",""), "状態":val("status","状態","approved"), "承認者":me.name, "更新日時":now, "出典":val("src","出典",""), "タグ":val("tags","タグ",""), "前のk_id":prev, "変更理由":String(d.reason||(prev?"修正":"新規")) });
  return { ok:true, id:id, prev:prev };
}
// 質問：Knowledge から探して答える。見つからなければ未回答質問に記録
function osAsk_(d, me){
  var q = String(d.q||"").trim(); if (!q) return { error: "質問を入れてください" };
  var t0 = Date.now();
  var know = osRows_(OS_KNOW, OS_KNOW_COLS).filter(function(r){ return r["状態"] === "approved" && osCanSee_(me, String(r["対象"])); }).map(osKnow_);
  var hasAi = !!PropertiesService.getScriptProperties().getProperty("ANTHROPIC_API_KEY");
  // AI があるときは候補を広め（12%・8件）に取り、関係の判断は AI に任せる。AI が無ければ従来どおり 25%
  var hits = hasAi ? osSearch_(q, know, 0.12).slice(0, 8) : osSearch_(q, know);
  var ans = null, model = "search";
  if (hits.length){
    osAiErr_ = "";
    var ai = hasAi ? osGateway_(me, q, hits) : null;
    if (ai && ai.text){
      if (/決まりがありません/.test(ai.text)) { ans = null; model = ai.model; hits = []; } // 根拠なし → 未回答へ
      else { ans = ai.text; model = ai.model; }
    }
    else if (osSearch_(q, hits).length) { ans = osSearch_(q, hits)[0].a; } // AI 失敗時は 25% 以上の一致だけ採用
  }
  var status = ans ? "回答" : "未回答";
  var qid = "";
  if (!ans){ var sh = osSheet_(OS_UNANS, OS_UNANS_COLS); qid = invId_("q_"); invAppend_(sh, { q_id:qid, "日時":invNow_(), "質問者":me.name, "役割":me.role, "質問":q, "状態":"未回答", "回答":"", "回答者":"", "回答日時":"", "k_id":"" }); }
  var logId = invId_("lg_");
  try { invAppend_(osSheet_(OS_AILOG, OS_AILOG_COLS), { log_id:logId, "日時":invNow_(), "利用者":me.name, "役割":me.role, "モデル":model, "質問":q, "回答":ans||"（未回答）", "根拠k_id":hits.slice(0,5).map(function(h){ return h.id; }).join(","), "入力tokens":"", "出力tokens":"", "所要ms":Date.now()-t0, "評価":"", "保存区分": ans ? "通常" : "Knowledge" }); } catch(e){}
  return { ok:true, status:status, answer:ans, sources:hits.slice(0,3).map(function(h){ return { id:h.id, q:h.q, a:h.a }; }), q_id:qid, log_id:logId, aiErr: me.role === "admin" ? osAiErr_ : undefined };
}
// 簡易検索：質問と Knowledge の質問・回答・タグの語の一致数で順位付け（日本語は2文字の組で比較）
function osSearch_(q, list, min){
  var grams = function(s){ s = String(s||"").toLowerCase().replace(/[\s、。・「」（）()\/／？?！!]/g,""); var g = {}; for (var i = 0; i < s.length-1; i++) g[s.substr(i,2)] = 1; return g; };
  var qg = grams(q); var qn = Object.keys(qg).length; if (!qn) return [];
  var th = (min === undefined) ? 0.25 : min;
  return list.map(function(k){ var kg = grams(k.q + " " + k.tags + " " + k.a.slice(0,120)); var hit = 0; Object.keys(qg).forEach(function(g){ if (kg[g]) hit++; }); var score = hit / qn; return { k:k, score:score }; })
    .filter(function(x){ return x.score >= th; }).sort(function(a,b){ return b.score - a.score; }).map(function(x){ return x.k; });
}
// AI Gateway：全ての AI 呼び出しはここを通る。モデルは設定で差し替え。キー未設定なら null（検索結果だけで答える）
function osGateway_(me, q, hits){
  var props = PropertiesService.getScriptProperties(); var key = props.getProperty("ANTHROPIC_API_KEY"); if (!key) return null;
  var model = props.getProperty("OS_MODEL") || "claude-haiku-5-5";
  var ctx = hits.map(function(h, i){ return (i+1) + ". Q: " + h.q + "\n   A: " + h.a; }).join("\n");
  var sys = "あなたは洋食オリオン（神田淡路町のナポリタン専門店）のスタッフ向け案内役です。以下の『決まりごと』（検索で拾った候補で、関係ないものも混じっています）のうち質問に関係するものだけを根拠に、日本語で3行以内で簡潔に答えてください。決まりごとに書かれていないことは推測せず『決まりがありません。店長に確認してください』と答えてください。数字は算用数字で。";
  var body = { model: model, max_tokens: 1024, system: sys, messages: [{ role: "user", content: "決まりごと:\n" + ctx + "\n\n質問: " + q }] };
  try {
    var res = UrlFetchApp.fetch("https://api.anthropic.com/v1/messages", { method: "post", contentType: "application/json", headers: { "x-api-key": key, "anthropic-version": "2023-06-01" }, payload: JSON.stringify(body), muteHttpExceptions: true });
    var j = JSON.parse(res.getContentText()); var text = (j.content || []).filter(function(c){ return c.type === "text"; }).map(function(c){ return c.text; }).join("").trim(); // 思考ブロックが先に来ることがあるので text ブロックだけ読む
    if (!text) osAiErr_ = "HTTP " + res.getResponseCode() + " " + String(res.getContentText()).slice(0, 300);
    return text ? { text: text, model: model, usage: j.usage || {} } : null;
  } catch(e){ osAiErr_ = String(e); return null; }
}
var osAiErr_ = "";
// エディタから AI 接続を確認する用／足りない権限（外部接続・Gmail）を承認し直す用
function osAiDiagRun(){ var r = osAiDiag_({ role:"admin", name:"editor" }); Logger.log(JSON.stringify(r)); return r; }
function osAuthAll(){ ScriptApp.requireAllScopes(ScriptApp.AuthMode.FULL); return "ok"; }
// 診断：キーの有無（値は出さない）と API 応答。管理者のみ
function osAiDiag_(me){
  var props = PropertiesService.getScriptProperties(); var key = props.getProperty("ANTHROPIC_API_KEY") || "";
  var out = { hasKey: !!key, keyLen: key.length, keyPrefix: key.slice(0, 7), model: props.getProperty("OS_MODEL") || "claude-haiku-5-5", props: Object.keys(props.getProperties()) };
  if (!key) return out;
  osAiErr_ = ""; var r = osGateway_(me, "営業時間は？", [{ q: "営業日と営業時間は？", a: "月〜金 11:00〜14:00。土日祝休。" }]);
  out.ok = !!(r && r.text); out.text = r ? r.text : ""; out.error = osAiErr_; return out;
}
// AIログの整理：保存区分「通常」は90日で削除（Knowledge／決裁は永続）。日次トリガーで実行
function osPurgeAiLog(){
  var sh = osSheet_(OS_AILOG, OS_AILOG_COLS); var rows = invRows_(sh); var cut = new Date(Date.now() - 90*86400000); var del = 0;
  for (var i = rows.length-1; i >= 0; i--){ var r = rows[i]; if (String(r["保存区分"]) !== "通常") continue; var d = new Date(String(r["日時"]).replace(/\//g,"-")); if (isNaN(d) || d > cut) continue; sh.deleteRow(r._row); del++; }
  return del;
}
// 回答の評価（役に立った／違う）。「違う」は Knowledge の見直し材料なので保存区分を Knowledge に上げる
function osRate_(d, me){
  var sh = osSheet_(OS_AILOG, OS_AILOG_COLS); var r = invRows_(sh).filter(function(x){ return x.log_id === d.log_id; })[0]; if (!r) return { error: "見つかりません" };
  var v = String(d.v||""); invSet_(sh, r._row, "評価", v); if (v === "違う") invSet_(sh, r._row, "保存区分", "Knowledge");
  return { ok:true };
}
// 未回答に回答 → Knowledge に追加（承認済み）
function osAnswer_(d, me){
  if (me.role !== "admin") return { error: "管理者のみ" };
  var sh = osSheet_(OS_UNANS, OS_UNANS_COLS); var r = invRows_(sh).filter(function(x){ return x.q_id === d.id; })[0]; if (!r) return { error: "見つかりません" };
  var a = String(d.a||"").trim(); if (!a) return { error: "回答を入れてください" };
  var k = osKnowSave_({ target: String(d.target||"現場"), cat: String(d.cat||"現場"), q: String(d.q||r["質問"]), a: a, status: "approved", src: "未回答質問 " + d.id, tags: String(d.tags||"") }, me);
  invSet_(sh, r._row, "状態", "回答済"); invSet_(sh, r._row, "回答", a); invSet_(sh, r._row, "回答者", me.name); invSet_(sh, r._row, "回答日時", invNow_()); invSet_(sh, r._row, "k_id", k.id||"");
  return { ok:true, k_id:k.id };
}
function osRptSave_(d, me){
  if (me.role !== "admin") return { error: "管理者のみ" };
  var sh = osSheet_(OS_RPT, OS_RPT_COLS); var now = invNow_();
  if (d.id){ var r = invRows_(sh).filter(function(x){ return x.rpt_id === d.id; })[0]; if (!r) return { error: "見つかりません" };
    OS_RPT_COLS.forEach(function(c){ if (d[c] !== undefined && c !== "rpt_id" && c !== "登録日時") invSet_(sh, r._row, c, (c === "精算日" || c === "承認日" || c === "日付") ? "'" + String(d[c]) : d[c]); });
    return { ok:true }; }
  var id = invId_("rp_"); var amt = Number(d["金額(税込)"]||d.amount)||0; var tax = Math.round(amt - amt/1.1);
  var obj = { rpt_id:id, "日付":"'" + String(d["日付"]||d.date||invToday_()), "店舗":String(d["店舗"]||"kanda"), "支払者":String(d["支払者"]||d.payer||"アウタ"), "本来負担者":String(d["本来負担者"]||"オリオン"), "相手先":String(d["相手先"]||d.vendor||""), "内容":String(d["内容"]||d.item||""), "金額(税込)":amt, "税抜":d["税抜"]!==undefined?Number(d["税抜"]):amt-tax, "消費税":d["消費税"]!==undefined?Number(d["消費税"]):tax, "勘定科目":String(d["勘定科目"]||""), "支払方法":String(d["支払方法"]||""), "オリオン帰属":String(d["オリオン帰属"]||"全額"), "帰属の根拠":String(d["帰属の根拠"]||""), "帰属の確度":String(d["帰属の確度"]||"確定"), "精算区分":String(d["精算区分"]||"立替"), "精算状態":String(d["精算状態"]||"未精算"), "精算日":"", "精算額":"", "承認者":String(d["承認者"]||""), "承認日":"", "会計計上":String(d["会計計上"]||"未"), "アウタ仕訳ID":"", "オリオン仕訳ID":"", "契約書":String(d["契約書"]||""), "証憑":String(d["証憑"]||d.evidence||""), "メモ":String(d["メモ"]||d.memo||""), "登録日時":now };
  invAppend_(sh, obj); return { ok:true, id:id };
}

// ---------- 初期データ（1回だけ実行。再実行しても同じ行は増えない） ----------
function osSeed20261101(){
  var n = { auth:0, facts:0, know:0, rpt:0 };
  // 決裁権限。最終承認は長下（事業主）。松尾・アウタは提案・見積・比較・分析・実施代行まで（オリオンの支出を承認した証拠を作らない）
  // 5万円は「金額による追加承認ライン」。新規契約・継続課金・価格変更・人事・借入・出店・FC・商標・関連当事者取引は金額に関係なく長下承認。同一目的・30日以内の支出は合算して判定
  var ash = osSheet_(OS_AUTH, OS_AUTH_COLS); if (ash.getLastRow() <= 1){
    [["価格・メニュー","商品価格、メニュー追加・廃止、副菜・ドリンク","店長／アウタ（分析・提案）","長下（事業主）","店長","Facts","金額に関係なく長下承認。価格は Facts に有効開始日つきで記録。レジ・予約サイトは注文設定シートから自動反映"],
     ["仕入先・仕入条件","取引先の新規・変更、単価・納品条件、OEM","アウタ（見積取得・比較）","長下","店長","Facts／仕入価格","新規取引契約は金額に関係なく長下承認。既存仕入先への通常発注は現場実施可。見積・納品書を Drive に保存"],
     ["現場ルール","レシピ分量、手順、清掃、衛生、クレーム一次対応","現場スタッフ／店長","長下（店長）","現場","Knowledge","店長だけで決めてよい。Fact にはしない。修正は旧行を archived にして新行を作る"],
     ["営業時間・休業","営業時間、臨時休業、基本シフト時間","店長","長下","店長","Facts／注文設定／勤怠設定","臨時休業1日は店長判断で可（事後報告）。恒常的な変更は長下承認。お知らせ（勤怠アプリ）で周知"],
     ["人事","採用、時給・雇用条件の変更、退職処理、月次シフト","店長","長下","店長","勤怠アプリ","雇用条件の変更・採用は金額に関係なく長下承認。月次シフトは店長で確定可。給与締め作業はアウタが代行"],
     ["経費（通常）","消耗品補充、既存仕入先の通常発注、修繕 5万円未満","店長","店長（事後報告：経費アプリ）","店長","経費アプリ","承認済みの通常業務の範囲なら5万円未満は担当者実行可。同一目的・30日以内は合算（49,000円×2回は5万円超として扱う）"],
     ["経費（追加承認）","5万円以上、設備購入、新しい月額サービス・継続課金、新規契約","店長／アウタ（見積・比較）","長下","店長／アウタ（代行）","経費アプリ／関連当事者取引","継続課金・新規契約は金額に関係なく長下承認。見積を証憑に。アウタが立替えた場合は関連当事者取引台帳に記録"],
     ["資金・店舗・FC・商標","借入、出店、FC条件、ブランド・商標、関連当事者取引","アウタ（提案・分析）","長下（事業主）","アウタ（代行）","Facts／Drive 契約／関連当事者取引","金額に関係なく長下承認。契約書が Evidence。契約前は『申込済』止まり"],
     ["データ訂正","売上・勤怠・経費の訂正","店長／スタッフ（申請）","管理者（松尾・長下）","管理者","訂正ログ","分析ページの締めタブから。シート直接編集は禁止。訂正は事実の修正であり支出承認ではない"]
    ].forEach(function(r){ ash.appendRow(r); n.auth++; });
  }
  // Facts（現在 approved と分かっているもの）。スタッフ構成は Master（勤怠アプリのスタッフ）に任せ Facts には入れない
  var F = [
    ["価格","オリオン（店内）","1,100円","2026/10/13","レジ注文設定／メニュー","開業時価格"],
    ["価格","オリオン ハーフ（店内）","900円","2026/10/13","レジ注文設定／メニュー",""],
    ["価格","ナシナシ（店内）","800円","2026/10/13","レジ注文設定／メニュー",""],
    ["価格","ナシナシ ハーフ（店内・持ち帰り）","700円","2026/11/02","注文設定シート「ナシナシハーフ価格」・勤怠アプリお知らせ n_91ae3d2b3859","600円→700円。ハーフ＋副菜2つで800円になりオリオンハーフとの差が小さすぎるため"],
    ["価格","副菜追加","100円","2026/10/13","レジ注文設定",""],
    ["価格","瓶ドリンク（コカ・コーラ／ゼロ／ジンジャーエール）","300円","2026/10/13","レジ注文設定","原価は瓶コーラ162円（カクヤス10/12納品書）"],
    ["価格","キリンラガー 小瓶","500円","2026/10/13","レジ注文設定",""],
    ["価格","持ち帰り（TG）","店内と同価格","2026/10/13","レジ注文設定","折箱0円"],
    ["営業","営業日・営業時間","月〜金 11:00〜14:00（土日祝休）","2026/10/13","予約サイト／GAS 受付ロジック（土日休）",""],
    ["営業","基本勤務時間","10:30〜15:00","2026/11/02","勤怠設定 default_start/default_end・お知らせ n_908623400c53","10:15〜15:15 から変更。11月シフト39件を更新済み"],
    ["営業","席数","9席＋個室3席","2026/10/13","店舗","個室は混雑時に開放"],
    ["営業","釣銭準備金","40,000円","2026/10/13","レジ締め設定",""],
    ["店舗","神田淡路町店 ステータス","operating（営業中）","2026/10/13","営業許可書・賃貸借契約","開業日 2026/10/13"],
    ["店舗","飯田橋 ステータス","application submitted（申込済・選定待ち・未契約）","2026/10/31","アパホテル〈飯田橋駅南〉への入居申込書類","契約書が確認されるまで contracted にしない"],
    ["仕入","スパゲッティ乾麺","トーホー 3kg袋 1,226円（20袋/箱）","2026/10/13","トーホー納品書 10/13","Order Pro で発注"],
    ["仕入","トマトケチャップ","トーホー 3kg 916円","2026/10/09","トーホー納品書 10/09",""],
    ["仕入","瓶コーラ ゼロ","カクヤス 18本 2,916円（162円/本）","2026/10/12","カクヤス納品書 10/12",""],
    ["仕入","卵","通販（太陽卵）Mサイズ","2026/10/13","通販調査","久田が買い出しすることもある（10/27）"],
    ["収支","夜間貸出","月10万円（2026/11〜）","2026/11/01","固定費シート「夜間貸出（収入）」","損益の固定費から除外し収入として計上"],
    ["収支","固定費 家賃","176,000円/月","2026/10/13","賃貸借契約",""],
    ["FC","FC条件","（未確定：Facts に正式案を登録して approved にする）","2026/11/01","","proposed のまま。昔の案（加盟金150万＋ロイヤリティ5%）と現在案（加盟金50万＋0%）は superseded/proposed で管理"]
  ];
  var fsh = osSheet_(OS_FACTS, OS_FACTS_COLS); var fex = invRows_(fsh);
  F.forEach(function(f){ if (fex.some(function(r){ return String(r["項目"]) === f[1] && String(r["値"]) === f[2]; })) return;
    var isFc = f[0] === "FC";
    invAppend_(fsh, { fact_id:invId_("f_"), "分類":f[0], "店舗":"kanda", "項目":f[1], "値":f[2], "状態": isFc ? "proposed" : "approved", "有効開始":"'" + f[3], "有効終了":"", "根拠":f[4], "承認者": isFc ? "" : "長下（seed・要確認）", "承認日時": isFc ? "" : invNow_(), "前のfact_id":"", "メモ":f[5], "登録者":"seed", "登録日時":invNow_() }); n.facts++; });
  // Knowledge 30問（たたき台。レシピ分量など不明なものは『確認中』で入れて長下・久田が埋める）
  var K = [
    ["現場","商品","メニューと価格は？","オリオン 1,100円／オリオンハーフ 900円／ナシナシ 800円／ナシナシハーフ 700円（11/2〜）。副菜追加 +100円。瓶コーラ・ゼロ・ジンジャーエール 300円、キリンラガー小瓶 500円。持ち帰りは店内と同じ価格。","メニュー,価格,値段"],
    ["現場","商品","オリオンとナシナシの違いは？","オリオンは具材（ハンバーグ・ウインナー・マッシュルームなど）をしっかりのせたナポリタン。ナシナシは具なしの昔ながらのナポリタン。","オリオン,ナシナシ,違い"],
    ["現場","商品","11月からナシナシハーフはいくら？","700円です（10月までは600円）。レジは自動で700円になります。古い注文票（600円表記）は使わないでください。","ナシナシハーフ,700,値上げ"],
    ["現場","商品","副菜追加とは？","100円でトッピングを1品追加。レジでは「副菜追加」を人数分押す。外す場合は「副菜値引き」（−100円）。","副菜,トッピング,追加"],
    ["現場","商品","持ち帰りの会計は？","レジで「持ち帰り」に切り替えてから商品を押す（TG〇〇）。価格は店内と同じ。折箱は0円。","持ち帰り,テイクアウト,TG"],
    ["現場","商品","コーラとゼロの見分け方は？","確認中（長下さんが記入）。ラベルの色で見分ける・冷蔵庫の置き場所を分ける、などのルールを決めて記入。","コーラ,ゼロ,見分け"],
    ["現場","会計","PayPayの会計手順は？","レジで商品を入れて支払方法「PayPay」を選ぶ → お客様がPayPay画面で金額を入力 → 受取完了の画面と音を必ず確認してから会計完了。確認前に完了しないこと（未受取の原因になる）。","PayPay,会計,支払"],
    ["現場","会計","現金の会計手順は？","レジで商品を入れて「現金」→ お預りを入力 → お釣りを渡す。会計は注文票1枚につき1回。同じ会計を2回打たない。","現金,会計,お釣り"],
    ["現場","会計","会計を間違えて打ったら？","その場で取り消さず、注文票に「打ち間違い」と書いて残す。翌朝、管理者が分析ページで訂正する。スプレッドシートは触らない。","間違い,訂正,打ち直し"],
    ["現場","会計","レジ締めのやり方は？","閉店後、レジアプリ「締め」→ 金種を数える → 業者払いがあれば入力 → PayPay画面の本日取引額を入力 → 伝票の品数（店内・持ち帰り・副菜・ドリンク）を数えて入力 → 記録。差異が出ても記録してよい（管理者が翌朝確認）。","締め,レジ締め,閉店"],
    ["現場","会計","レジに残す現金はいくら？","釣銭準備金 40,000円。それ以上は回収。","釣銭,準備金,回収"],
    ["現場","注文","注文票の書き方は？","1組1枚。店内／持ち帰りを明記、商品名と数、副菜の数、ドリンクを書く。時刻は書けるときだけで可。会計後は保管（翌朝の照合に使う）。","注文票,伝票,書き方"],
    ["現場","注文","テイクアウト予約が入ったら？","レジのテイクアウト画面に通知音と赤い表示が出る。受取時刻を確認し、プリンターが繋がっていれば自動印刷。印刷されないときは画面の予約一覧を見て準備する。","予約,テイクアウト,通知"],
    ["現場","注文","プリンターが印刷しないときは？","テイクアウト画面の「プリンター」をタップして接続 → テスト印刷。未接続の理由が画面に出る（電源・距離・別の端末が接続中）。それでもダメなら予約一覧を見て手書きで対応。","プリンター,印刷,接続"],
    ["現場","注文","予約の受付を止めたいときは？","レジのテイクアウト画面「お客様の予約 受付中」をタップ → 停止。予約サイトが「受付終了」になる。再開も同じボタン。","受付停止,予約停止"],
    ["現場","営業","営業日と営業時間は？","月〜金 11:00〜14:00。土日祝休。","営業時間,定休日"],
    ["現場","営業","出勤・退勤の時間は？","11/2から基本 10:30〜15:00（10月までは10:15〜15:15）。早出・残りは事前に松尾まで。","出勤,退勤,勤務時間,シフト"],
    ["現場","営業","出退勤の打刻は？","勤怠アプリでログイン → 出勤／退勤をタップ。打刻を忘れたら「修正申請」から申請（管理者が承認）。","打刻,勤怠,修正申請"],
    ["現場","営業","混んで席が足りないときは？","奥の個室（3席）を開放する。待ちが出そうなら先に持ち帰りを案内。","混雑,満席,個室,待ち"],
    ["現場","営業","個室はいつ開ける？","混雑時に開放（10/27から試験的に運用中）。使ったら清掃して閉める。","個室,開放"],
    ["現場","調理","オリオン1食の麺の量は？","確認中（久田さんが記入）。基準：乾麺225g／食（レギュラー）。ハーフは半量。","麺,量,グラム,レギュラー"],
    ["現場","調理","ソースは1食何g使う？","確認中（久田さんが記入）。基準：ケチャップ約140g／食、練乳約10g／食。","ソース,ケチャップ,量"],
    ["現場","調理","ハンバーグとウインナーの扱いは？","確認中（久田さんが記入）。ハンバーグは肉のハナマサ直火焼き60g（1個）、ウインナーは業務スーパー徳用（1本約26g）。","ハンバーグ,ウインナー,具材"],
    ["現場","調理","欠品したときは？","確認中。基本：代替できない具材は「本日なし」と伝えて副菜値引きで対応。麺・ケチャップの欠品は即松尾へ連絡。","欠品,品切れ"],
    ["現場","調理","仕込み・在庫の記録は？","発注アプリで在庫を入力。下限を切ると管理者に通知される。備品の不足は「報告」から。","在庫,仕込み,発注,備品"],
    ["現場","衛生","冷蔵・冷凍庫の温度チェックは？","毎日出勤時に勤怠アプリの出勤チェックで記録。冷蔵10℃以下、冷凍−15℃以下。基準外なら対処内容を書く。","温度,冷蔵庫,衛生,HACCP"],
    ["現場","衛生","清掃のルールは？","確認中（長下さんが記入）。閉店後：客席・テーブル・床・トイレ・厨房。個室を使った日は個室も。","清掃,掃除,閉店作業"],
    ["現場","接客","クレームがあったら？","まず謝って話を聞く。その場で値引きや返金の判断はしない。内容・時刻・お客様の特徴をメモして長下さんか松尾に連絡。","クレーム,苦情,対応"],
    ["現場","接客","お客様に「量は？」と聞かれたら？","レギュラーは乾麺225g（茹で上がりで約2倍）、ハーフはその半分、と案内。","量,聞かれた,案内"],
    ["現場","営業","開店時に最初に何をする？","出勤打刻 → 出勤チェック（冷蔵・冷凍の温度）→ レジアプリを開き釣銭4万円を確認 → テイクアウト画面で予約の有無とプリンター接続を確認 → 仕込み。11:00 に看板を出す。","開店,朝,最初,準備"],
    ["現場","営業","閉店時に何を確認する？","14:00 看板を下げる → 最後のお客様の会計 → レジ締め（金種・PayPay画面・伝票の品数）→ 火元・ガス・冷蔵庫の扉・水道・エアコン・電気を確認 → 清掃 → 退勤打刻 → 施錠。","閉店,最後,確認,施錠"],
    ["現場","営業","遅刻しそうなときは誰に連絡する？","分かった時点ですぐ長下さんに LINE（電話でも可）。到着見込み時刻を伝える。勤怠アプリの打刻は実際の到着時刻で。","遅刻,連絡"],
    ["現場","営業","急に休む場合はどうする？","できるだけ早く長下さんに電話。当日はホールが空く場合タイミーで補う判断を長下さんがする。シフト変更は勤怠アプリで管理者が直す。","欠勤,休む,急,体調"],
    ["現場","営業","打刻を忘れたら？","勤怠アプリの「修正申請」から実際の時刻を申請（理由を書く）。管理者が承認すると反映される。自分でシートを直さない。","打刻忘れ,修正申請"],
    ["現場","注文","注文を間違えて作ったら？","正しいものを作り直す。間違えた分は廃棄か賄い扱いにし、注文票に「作り間違い」と書く。レジは正しい注文だけ打つ。","作り間違い,ミス,廃棄"],
    ["現場","注文","お客様が注文を変更したい場合は？","調理前なら変更可。調理に入っていたらその旨を伝えて追加注文として扱う。注文票を書き直し、レジは最終的な内容で打つ。","注文変更,変更,キャンセル"],
    ["現場","会計","PayPay決済を間違えたら（金額違い・二重）？","その場でお客様の画面を見せてもらい、スクリーンショットを撮る。レジ側は正しい金額で記録し、注文票に「PayPay金額違い」と書く。返金は PayPay 管理画面からで、管理者（松尾・長下）が行う。現金で返さない。","PayPay,間違い,二重,返金"],
    ["現場","会計","PayPayが使えない（通信・アプリ不調）場合は？","現金をお願いする。現金がない場合は後日支払いの約束はせず、近くのATMを案内。復旧したら管理者に報告。","PayPay,使えない,障害"],
    ["現場","会計","現金が合わない場合は？","数え直して、それでも合わなければそのまま差異ありで締めを記録（理由欄に気づいたことを書く）。自分の財布で埋めない。管理者が翌朝、伝票と照合する。","現金,合わない,差異,不足"],
    ["現場","会計","お釣りが足りなくなったら？","両替は近くの銀行・郵便局で店の現金から行い、レシートがなくても「両替」とメモ。開店前に小銭（100円・10円）が少ないと気づいたら長下さんに連絡。","お釣り,両替,小銭"],
    ["現場","注文","注文票を紛失したら？","レジの会計記録（当日の一覧）で内容を確認し、新しい注文票に「再発行」と書いて作る。締めの品数は再発行分も数える。","注文票,紛失,なくした"],
    ["現場","営業","満席のときの案内は？","個室（3席）を開放。それでも待ちが出るときは「10〜15分ほどお待ちいただきます」と伝え、持ち帰りも案内する。店外に並ぶ場合は通行の邪魔にならない位置に。","満席,待ち,行列"],
    ["現場","営業","料理の提供が遅れているときは？","お客様に一声かける（「あと5分ほどです」）。キッチンに注文の順番を確認。遅れが15分を超えたらドリンクなどの値引きはせず、謝罪のみ。値引き判断は長下さんに。","提供遅れ,遅い,待たせる"],
    ["現場","注文","テイクアウトの受取に来ない場合は？","受取時刻から15分過ぎたら予約の電話番号に連絡。連絡がつかなければ閉店まで保管し、来店がなければ廃棄。未払いなら売上に立てない（レジで打たない）。","受取,来ない,テイクアウト,予約"],
    ["現場","調理","商品が売り切れたら？","レジで該当商品を使わず、注文時に「本日売り切れ」と案内。予約サイトからの注文が止められないときは受付停止ボタンを押す。長下さんに報告（仕込み量の調整用）。","売り切れ,品切れ,完売"],
    ["現場","調理","食材の品質がおかしい（臭い・変色）場合は？","使わない。写真を撮って長下さんに連絡し、廃棄。納品日と仕入先を発注アプリの「報告」に書く。","品質,異臭,変色,廃棄"],
    ["現場","仕入","納品数量が注文と違うときは？","納品書と現物を照合して差を写真に撮る。受領サインはせず（または「数量相違」と書いて）長下さんに連絡。業者への連絡は管理者が行う。","納品,数量違い,相違"],
    ["現場","設備","冷蔵庫・厨房機器が故障したら？","冷蔵庫：扉を開けず温度を記録して長下さんに即連絡。食材は必要なら近くの保冷手段に移す。コンロ・換気扇：使わずに長下さんへ。修理業者への連絡は管理者が行う。","故障,冷蔵庫,機器,修理"],
    ["現場","設備","停電・ガス停止のときは？","安全確保が最優先。ガスは元栓を閉める。調理できない場合は営業を一時停止し、お客様に説明して会計はしない。長下さんに即連絡。復旧後、冷蔵庫の温度を確認して記録。","停電,ガス,停止,非常"],
    ["現場","安全","お客様が体調不良になったら？","まず声をかけ、意識がない・呼吸がおかしい場合は119番。席で休める場所を確保し、水を出す。店の責任の有無を自分で判断・発言しない。長下さんに連絡し、時刻と状況をメモ。","体調不良,救急,119,急病"],
    ["現場","安全","店内で怪我（スタッフ・お客様）が起きたら？","応急処置（救急箱は厨房）。出血が止まらない・骨折の疑いなら119番。写真と時刻・状況を記録し長下さんに即連絡。スタッフの怪我は労災の対象になるので必ず報告。","怪我,事故,労災,救急"],
    ["現場","安全","異物混入の申し出があったら？","謝罪し、その料理は下げて必ず保管する（捨てない・洗わない）。写真を撮る。代替の提供や返金はその場で判断せず、長下さんに即連絡。お客様の連絡先を伺う。言い訳や原因の推測は言わない。","異物混入,髪の毛,虫,クレーム"],
    ["現場","安全","アレルギーについて聞かれたら？","「使用食材は確認できますが、同じ厨房で調理するため混入の可能性はゼロではありません」と伝える。主な原材料：小麦（麺）、卵、乳（練乳・バター）、豚肉・鶏肉（ハンバーグ・ウインナー）、大豆。「大丈夫です」と断言しない。詳細は確認中（久田さんが原材料表を記入）。","アレルギー,食材,原材料"],
    ["現場","接客","返金を求められたら？","その場で現金を返さない。内容を聞いてメモし、長下さんに連絡して判断を仰ぐ。明らかな作り間違いで食べていない場合のみ、作り直しを提案してよい。","返金,払い戻し"],
    ["現場","接客","忘れ物を見つけたら？","日時・席・内容をメモしてレジ下の忘れ物箱へ。財布・携帯など貴重品は長下さんに報告。1か月保管して引き取りがなければ管理者が処分（貴重品は警察へ）。","忘れ物,落とし物"],
    ["現場","営業","業者（配達・営業・点検）が来店したら？","納品：納品書と数量を確認して受領。点検（ガス・消防・保健所）：身分証を確認して対応し、長下さんに報告。飛び込み営業：「担当者にお伝えします」と名刺だけ預かり、その場で契約・申込はしない。","業者,配達,点検,営業"],
    ["現場","接客","取材・広告・SNS掲載の問い合わせが来たら？","その場で可否を答えない。連絡先と内容を聞いて長下さん・松尾に伝える。撮影は許可が出るまで断る。","取材,広告,SNS,問い合わせ"],
    ["現場","ルール","店長判断で答えてはいけないものは？","価格変更・新しい契約や課金・返金額の確定・雇用条件・取材可否・FC や出店の話・店の責任の有無（事故・異物）。これらは長下さん（事業主）の判断。スタッフは「確認してご連絡します」と答える。","判断,権限,答えてはいけない"],
    ["現場","ルール","AIが「分かりません」と答えたら？","質問はそのまま「未回答」として管理者に届く。急ぎなら長下さんに直接連絡。回答がつくと次から AI が答えられるようになる。AI の回答が実際と違うと感じたら、その旨を管理者に伝える。","AI,分からない,未回答,聞く"],
    ["現場","経費","レシートはどうする？","買い出しの領収書は経費アプリで撮影して登録（店名・金額・科目・支払元）。立替は「現金（立替）」を選ぶ。原本は保管。","レシート,領収書,経費,立替"]
  ];
  var ksh = osSheet_(OS_KNOW, OS_KNOW_COLS); var kex = invRows_(ksh);
  K.forEach(function(k){ if (kex.some(function(r){ return String(r["質問"]) === k[2]; })) return;
    var pending = /確認中/.test(k[3]);
    invAppend_(ksh, { k_id:invId_("k_"), "店舗":"kanda", "対象":k[0], "分類":k[1], "質問":k[2], "回答":k[3], "状態": pending ? "proposed" : "approved", "承認者": pending ? "" : "長下（seed・要確認）", "更新日時":invNow_(), "出典":"seed 2026/11/01", "タグ":k[4], "前のk_id":"", "変更理由":"新規" }); n.know++; });
  // 関連当事者取引（アウタ立替）既知分。精算区分は「立替」か「業務委託費」かを明示（同じ費用の二重精算を防ぐ）
  var R = [
    ["2026/09/15","アウタ","オリオン","Indeed","求人広告費（開業スタッフ募集）",0,"広告宣伝費","クレジット（アウタ）","全額","オリオンの採用のみに使用","確定","立替","Indeed 請求書（金額要確認）","金額を請求書で確認して入力"],
    ["2026/10/01","アウタ","オリオン","キンコーズ","オリオン注文票 印刷",0,"消耗品費","クレジット（アウタ）","全額","オリオン専用の印刷物","確定","立替","キンコーズ 領収書（金額要確認）",""],
    ["2026/10/01","アウタ","オリオン","キンコーズ","オリオンチラシ 印刷",0,"広告宣伝費","クレジット（アウタ）","全額","オリオン専用の印刷物","確定","立替","キンコーズ 領収書（金額要確認）","開業費の広告宣伝に相当"],
    ["2026/10/30","オリオン（レジ現金）","アウタ","格安（酒販）","業者払い 23,775円のうちオリオン外の酒類 約2万円",0,"立替金","現金（オリオンレジ）","一部","オリオンでは酒類を扱わない","要判別","立替（逆方向）","10/30 レジ締め 業者払い・レシート","オリオンの現金でアウタ側の仕入を払った可能性。レシート読込で確定"]
  ];
  var rsh = osSheet_(OS_RPT, OS_RPT_COLS); var rex = invRows_(rsh);
  R.forEach(function(r){ if (rex.some(function(x){ return String(x["相手先"]) === r[3] && String(x["内容"]) === r[4]; })) return;
    var amt = Number(r[5])||0, tax = Math.round(amt - amt/1.1);
    invAppend_(rsh, { rpt_id:invId_("rp_"), "日付":"'" + r[0], "店舗":"kanda", "支払者":r[1], "本来負担者":r[2], "相手先":r[3], "内容":r[4], "金額(税込)":amt, "税抜":amt-tax, "消費税":tax, "勘定科目":r[6], "支払方法":r[7], "オリオン帰属":r[8], "帰属の根拠":r[9], "帰属の確度":r[10], "精算区分":r[11], "精算状態":"未精算", "精算日":"", "精算額":"", "承認者":"", "承認日":"", "会計計上":"未", "アウタ仕訳ID":"", "オリオン仕訳ID":"", "契約書":"", "証憑":r[12], "メモ":r[13], "登録日時":invNow_() }); n.rpt++; });
  osSheet_(OS_UNANS, OS_UNANS_COLS); osSheet_(OS_AILOG, OS_AILOG_COLS);
  Logger.log(JSON.stringify(n)); return n;
}

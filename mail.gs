// ===== ORION OS メール取り込み（Gmail → 候補台帳） =====
// 前提：この GAS が orion.napolitan@gmail.com（店のアカウント）で動いていること。osMailWho() で確認できる
// 考え方：
//  - 判定は「差出人ドメイン ＋ 件名 ＋ 本文の既知取引先 ＋ スレッド履歴」。宛先は見ない（独自ドメインへ移行しても動く。転送メールも拾える）
//  - 定型メール（PayPay 入金通知・トーホー Order Pro の注文/納品）は正規表現で抜く。AI は使わない
//  - 非定型（取引先からの自由文：条件交渉・案内など）は「候補」に要約なしで入れ、管理者が見る。必要なら後で osGateway_ で要約
//  - 取り込んだメールにはラベル「ORION/取込済」を付けて二重処理を防ぐ。本文は保存しない（件名・差出人・抽出値・リンクだけ）
//  - 候補はそのままでは Facts/Events にならない。管理者が「メール候補」シートで確認して反映する（AI も自動反映しない）
var OS_MAILRULE = "メール取引先"; var OS_MAILRULE_COLS = ["名前","差出人ドメイン","件名キーワード","本文キーワード","種別","扱い","有効","メモ"];
// 種別: PayPay入金 / TOHO注文 / TOHO納品 / 請求書 / 取引先連絡 / その他   扱い: 定型 / 要確認 / 無視
var OS_MAILCAND = "メール候補"; var OS_MAILCAND_COLS = ["cand_id","受信日時","差出人","件名","取引先","種別","扱い","抽出","金額","日付","状態","確認者","確認日時","反映先","メールID","リンク","登録日時"];
var OS_MAIL_LABEL = "ORION/取込済";
// PayPay の取引ごとの通知メール → 決済イベント台帳（候補ではなく自動記録。取引番号で重複なし）
var OS_PPTX = "PayPay取引"; var OS_PPTX_COLS = ["取引番号","決済日時","日付","時刻","金額","端末ID","店舗","種類","メールID","登録日時"];

function osMailWho(){ return Session.getEffectiveUser().getEmail(); }

// 初期ルール（1回だけ。ドメイン・キーワードは実物のメールを見て直す）
function osMailSeedRules(){
  var sh = osSheet_(OS_MAILRULE, OS_MAILRULE_COLS); if (sh.getLastRow() > 1) return "exists";
  [["PayPay（入金・売上通知）","paypay.ne.jp, paypay-corp.co.jp","PayPay","","PayPay入金","定型","1","売上・入金の定型通知。正規表現で金額・日付を抜く"],
   ["トーホー Order Pro（注文受付）","toho.co.jp, orderpro.jp","ご注文","","TOHO注文","定型","1","発注の控え。注文日・納品予定日・金額"],
   ["トーホー Order Pro（納品・請求）","toho.co.jp, orderpro.jp","納品, 請求","","TOHO納品","定型","1",""],
   ["カクヤス","kakuyasu.co.jp","","","請求書","要確認","1","納品書は紙が主。メールは請求・案内"],
   ["アパ株式会社（飯田橋）","apahotel.com, apa.co.jp","","アパ, 飯田橋","取引先連絡","要確認","1","転送メールも本文キーワードで拾う。契約関連は Facts（店舗ステータス）の根拠になる"],
   ["キンコーズ","kinkos.co.jp","","","請求書","要確認","1","アウタ払い → 関連当事者取引"],
   ["Google（ビジネスプロフィール等）","google.com","","","その他","無視","1","通知は取り込まない"]
  ].forEach(function(r){ sh.appendRow(r); });
  return "seeded";
}

function osMailRules_(){ return osRows_(OS_MAILRULE, OS_MAILRULE_COLS).filter(function(r){ return String(r["有効"]) !== "0" && String(r["有効"]) !== "false"; }); }
function osMailLabel_(){ return GmailApp.getUserLabelByName(OS_MAIL_LABEL) || GmailApp.createLabel(OS_MAIL_LABEL); }

// 1時間ごとのトリガーで実行。直近3日・未処理のスレッドを見る
function osMailScan(){
  var rules = osMailRules_(); if (!rules.length) return "no rules";
  var label = osMailLabel_(); var sh = osSheet_(OS_MAILCAND, OS_MAILCAND_COLS);
  var known = {}; invRows_(sh).forEach(function(r){ known[String(r["メールID"])] = 1; });
  var threads = GmailApp.search('newer_than:3d -label:"' + OS_MAIL_LABEL + '"', 0, 50); var n = 0;
  threads.forEach(function(th){
    var hit = false;
    th.getMessages().forEach(function(gm){
      var m = { id:gm.getId(), date:Utilities.formatDate(gm.getDate(), "Asia/Tokyo", "yyyy/MM/dd HH:mm"), from:gm.getFrom(), subject:gm.getSubject(), body:String(gm.getPlainBody()||"").slice(0, 20000) };
      if (osMailTake_(m, rules, sh, known, "")) { hit = true; n++; }
    });
    if (hit) th.addLabel(label);
  });
  return n;
}

// 1通を判定して候補に入れる。mailbox は収集元（空なら本体アカウント）
function osMailTake_(m, rules, sh, known, mailbox){
  if (known[m.id]) return false;
  var r = osMailMatch_(m, rules); if (!r) return false;
  if (r["扱い"] === "無視") return true;
  var ex = osMailExtract_(m, String(r["種別"]));
  if (ex.kind === "PayPay入金" && ex.txNo){ // 取引通知 → PayPay取引 に記録して終わり（候補には入れない）
    var psh = osSheet_(OS_PPTX, OS_PPTX_COLS); var dup = invRows_(psh).some(function(x){ return String(x["取引番号"]) === ex.txNo; });
    if (!dup) invAppend_(psh, { "取引番号":"'" + ex.txNo, "決済日時":ex.datetime, "日付":"'" + ex.date, "時刻":ex.time, "金額":ex.amount, "端末ID":ex.terminal||"", "店舗":"kanda", "種類":ex.refund ? "返金" : "決済", "メールID":m.id, "登録日時":invNow_() });
    known[m.id] = 1; return true;
  }
  var link = mailbox ? "https://mail.google.com/mail/?authuser=" + encodeURIComponent(mailbox) + "#all/" + m.id : "https://mail.google.com/mail/u/0/#all/" + m.id;
  invAppend_(sh, { cand_id:invId_("mc_"), "受信日時":m.date, "差出人":m.from, "件名":m.subject, "取引先":String(r["名前"]), "種別":String(r["種別"]), "扱い":String(r["扱い"]), "抽出":JSON.stringify(ex), "金額":ex.amount||"", "日付":ex.date||"", "状態":"未確認", "確認者":"", "確認日時":"", "反映先":"", "メールID":m.id, "リンク":link, "登録日時":invNow_() });
  known[m.id] = 1; return true;
}
// 収集スクリプト（orion.napolitan 側）からの受け口。合い言葉は スクリプト プロパティ OS_INGEST_KEY
function osMailIngest_(d){
  var key = PropertiesService.getScriptProperties().getProperty("OS_INGEST_KEY");
  if (!key || String(d.key||"") !== key) return { error: "key" };
  var rules = osMailRules_(); var sh = osSheet_(OS_MAILCAND, OS_MAILCAND_COLS);
  var known = {}; invRows_(sh).forEach(function(r){ if (String(r["状態"]) !== "再取込") known[String(r["メールID"])] = 1; }); // 状態「再取込」の候補は取り直す
  var lock = LockService.getScriptLock(); lock.waitLock(10000); var n = 0;
  try { (d.messages||[]).forEach(function(m){ if (osMailTake_(m, rules, sh, known, String(d.mailbox||""))) n++; }); } finally { lock.releaseLock(); }
  return { ok:true, taken:n, received:(d.messages||[]).length };
}
// ルール判定：差出人ドメイン → 件名キーワード → 本文キーワード（転送メールは本文に元の差出人が残るのでここで拾える）
function osMailMatch_(m, rules){
  var from = String(m.from||"").toLowerCase(); var subj = String(m.subject||""); var body = null;
  var list = function(s){ return String(s||"").split(/[,、]/).map(function(x){ return x.trim(); }).filter(String); };
  for (var i = 0; i < rules.length; i++){
    var r = rules[i];
    var doms = list(r["差出人ドメイン"]).map(function(d){ return d.toLowerCase(); }); var sk = list(r["件名キーワード"]); var bk = list(r["本文キーワード"]);
    var okDom = !doms.length || doms.some(function(d){ return from.indexOf("@" + d) >= 0 || from.indexOf("." + d) >= 0; });
    var okSub = !sk.length || sk.some(function(k){ return subj.indexOf(k) >= 0; });
    var okBody = true;
    if (bk.length){ if (body === null) body = String(m.body||"").slice(0, 20000); okBody = bk.some(function(k){ return body.indexOf(k) >= 0 || subj.indexOf(k) >= 0; }); }
    // ドメイン一致＋件名一致、または（ドメイン不一致でも）本文キーワード一致（転送対策）
    if ((okDom && okSub && (bk.length ? okBody : true)) || (bk.length && okBody && !doms.length)) return r;
    if (bk.length && okBody && !okDom && body.indexOf("Forwarded") + body.indexOf("転送") > -2) return r;
  }
  return null;
}

// 定型メールの抽出。正規表現は実物のメールで調整する（※ここは叩き台）
function osMailExtract_(m, kind){
  var body = String(m.body||"").replace(/\r/g, ""); var out = { kind:kind };
  var yen = function(re){ var x = body.match(re); return x ? Number(String(x[1]).replace(/[,，]/g, "")) : ""; };
  var dt = function(re){ var x = body.match(re); return x ? x[1].replace(/年|月/g, "/").replace(/日/g, "") : ""; };
  if (kind === "PayPay入金"){
    // 取引通知：「決済が完了しました / 1100円 / 取引番号 0510… / 決済日時 2026年10月30日13時03分」
    out.txNo = (body.match(/取引番号[\s\S]{0,20}?(\d{12,24})/) || [])[1] || (String(m.subject||"").match(/取引番号[：:]\s*(\d{12,24})/) || [])[1] || "";
    out.amount = yen(/(?:金額[^\d]{0,10})?([\d,，]+)\s*円/);
    out.terminal = (body.match(/端末ID\s*([\w-]+)/) || [])[1] || "";
    var dm = body.match(/(\d{4})年(\d{1,2})月(\d{1,2})日\s*(\d{1,2})時(\d{1,2})分/);
    if (dm){ out.date = dm[1] + "/" + ("0"+dm[2]).slice(-2) + "/" + ("0"+dm[3]).slice(-2); out.time = ("0"+dm[4]).slice(-2) + ":" + ("0"+dm[5]).slice(-2); out.datetime = out.date + " " + out.time; }
    else out.date = dt(/(\d{4}[\/年]\d{1,2}[\/月]\d{1,2})/);
    out.refund = /返金|取消|キャンセル/.test(String(m.subject||"") + body.slice(0, 300));
    if (!out.txNo) out.report = /週間レポート|月間レポート|レポート/.test(String(m.subject||"")) ? "レポート" : "";
  } else if (kind === "TOHO注文" || kind === "TOHO納品"){
    out.orderNo = (body.match(/(?:注文番号|受注番号|伝票番号)[^\w]{0,5}([\w-]+)/) || [])[1] || "";
    out.amount = yen(/(?:合計|総額|ご請求額)[^\d]{0,10}([\d,，]+)\s*円/);
    out.date = dt(/(?:納品(?:予定)?日|お届け日)[^\d]{0,5}(\d{4}[\/年]\d{1,2}[\/月]\d{1,2})/) || dt(/(\d{4}[\/年]\d{1,2}[\/月]\d{1,2})/);
    out.items = (body.match(/^.{2,40}\s+\d+\s*(?:個|本|袋|箱|ケース|kg|g)\b.*$/gm) || []).slice(0, 30);
  } else if (kind === "請求書"){
    out.amount = yen(/(?:合計|ご請求(?:金)?額|請求額)[^\d]{0,10}([\d,，]+)\s*円/);
    out.date = dt(/(?:支払期限|お支払い期限|振込期限)[^\d]{0,5}(\d{4}[\/年]\d{1,2}[\/月]\d{1,2})/);
  } else {
    out.snippet = body.replace(/\s+/g, " ").slice(0, 200); // 非定型は冒頭だけ（管理者が見る用）
  }
  return out;
}

// 管理者が候補を確認：状態を 反映済／不要 にする。反映先は手で（Facts/関連当事者/経費 など）
function osMailCandSet_(d, me){
  if (me.role !== "admin") return { error: "管理者のみ" };
  var sh = osSheet_(OS_MAILCAND, OS_MAILCAND_COLS); var r = invRows_(sh).filter(function(x){ return x.cand_id === d.id; })[0]; if (!r) return { error: "見つかりません" };
  invSet_(sh, r._row, "状態", String(d.status||"反映済")); invSet_(sh, r._row, "確認者", me.name); invSet_(sh, r._row, "確認日時", invNow_()); if (d.to) invSet_(sh, r._row, "反映先", String(d.to));
  return { ok:true };
}
// 取り付け：handleOsGet に mode "os_mail" → 未確認の候補一覧、handleOsPost に type "os_mail_set" → osMailCandSet_。トリガー：osMailScan を1時間ごと

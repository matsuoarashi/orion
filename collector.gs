// ===== ORION メール収集スクリプト（orion.napolitan@gmail.com 側に置く） =====
// 役目：この Gmail を1時間ごとに見て、取引先らしいメールの「件名・差出人・本文テキスト」を本体（レジ・分析の GAS）へ送る。
//       判定・抽出・保存は本体側（mail.gs）が行う。ここでは何も判断しない。
// 置き方：orion.napolitan でログイン → script.google.com → 新しいプロジェクト → このコードを貼る → setup() を1回実行（権限を承認）
// 本体の URL と合い言葉は スクリプト プロパティ に入れる（コードに書かない）：OS_API_URL, OS_INGEST_KEY
var COLLECT_LABEL = "ORION/送信済";
var COLLECT_QUERY = 'newer_than:3d -label:"ORION/送信済" -category:promotions -category:social';

function setup(){ // 初回：権限承認 ＋ 1時間ごとのトリガー
  GmailApp.getUserLabelByName(COLLECT_LABEL) || GmailApp.createLabel(COLLECT_LABEL);
  ScriptApp.getProjectTriggers().forEach(function(t){ if (t.getHandlerFunction() === "collect") ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger("collect").timeBased().everyHours(1).create();
  return Session.getEffectiveUser().getEmail();
}

// 直近分をラベルに関係なく送り直す（本体側のルールを変えた後に使う。本体はメールID・取引番号で重複を防ぐ）
function resendRecent(){ return collect('newer_than:3d -category:promotions -category:social', true); }

function collect(query, noLabel){
  var props = PropertiesService.getScriptProperties(); var url = props.getProperty("OS_API_URL"); var key = props.getProperty("OS_INGEST_KEY");
  if (!url || !key) throw new Error("OS_API_URL / OS_INGEST_KEY をスクリプト プロパティに設定してください");
  var label = GmailApp.getUserLabelByName(COLLECT_LABEL) || GmailApp.createLabel(COLLECT_LABEL);
  var threads = GmailApp.search(query || COLLECT_QUERY, 0, 30); var sent = 0;
  threads.forEach(function(th){
    var msgs = th.getMessages().map(function(m){ return { id:m.getId(), threadId:th.getId(), date:Utilities.formatDate(m.getDate(), "Asia/Tokyo", "yyyy/MM/dd HH:mm"), from:m.getFrom(), to:m.getTo(), subject:m.getSubject(), body:String(m.getPlainBody()||"").slice(0, 20000), attachments:m.getAttachments().map(function(a){ return a.getName(); }) }; });
    var res = UrlFetchApp.fetch(url, { method:"post", contentType:"text/plain", payload: JSON.stringify({ type:"os_mail_ingest", key:key, mailbox:Session.getEffectiveUser().getEmail(), messages:msgs }), muteHttpExceptions:true, followRedirects:true });
    var j = {}; try { j = JSON.parse(res.getContentText()); } catch(e){}
    if (j.ok){ if (!noLabel) th.addLabel(label); sent += msgs.length; } else { Logger.log("送信失敗: " + res.getContentText().slice(0,200)); }
  });
  return sent;
}

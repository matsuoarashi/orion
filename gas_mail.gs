// 洋食オリオン  メール通知用 Google Apps Script
// 既存のGASプロジェクトの doPost に追加するか、新しいプロジェクトとして「ウェブアプリ」でデプロイ
// （実行ユーザー: 自分 / アクセス: 全員）。発行されたURLを app.html の CONFIG.MAIL_URL に貼る。

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents || "{}");
    if (body.type === "alert") {
      var to = body.to || "orion.napolitan@gmail.com";
      MailApp.sendEmail({
        to: to,
        subject: body.subject || "【オリオン】通知",
        body: (body.body || "") + "\n\n---\n洋食オリオン 運営アプリ " + Utilities.formatDate(new Date(), "Asia/Tokyo", "yyyy/MM/dd HH:mm")
      });
      return ContentService.createTextOutput(JSON.stringify({ ok: true })).setMimeType(ContentService.MimeType.JSON);
    }
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: "unknown type" })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: String(err) })).setMimeType(ContentService.MimeType.JSON);
  }
}

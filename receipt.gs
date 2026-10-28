// ===== 経費（レシート登録）: keihi.html 用 =====
// 使い方（レジ側GASに追記済み・「サービス」でDrive API v3 を追加しておく）:
//   doPost の先頭付近に   var rr = handleRcPost(d); if (rr) return rr;
//   doGet  の先頭に       if (e && e.parameter && /^rc_/.test(String(e.parameter.mode||""))) return handleRcGet(e);
// 認証: 在庫・発注と同じ（ORION STAFF のログイントークン）。登録は全員、修正・削除は本人か管理者。
// 保存先: 「レシート」シート（全履歴）＋「経費」シート（運用費用）／「開業費」シート（初期費用）にIDで連動
// 画像: マイドライブ「オリオン_レシート/YYYY-MM」に保存
var RC_SHEET = "レシート";
var RC_COLS = ["receipt_id","登録日時","登録者","日付","店名","金額","科目","支払元","区分","摘要","画像URL","file_id","OCR","状態","確認者","確認日時","更新日時"];
var RC_ACCOUNTS = ["仕入高","消耗品費","修繕費","広告宣伝費","支払手数料","通信費","水道光熱費","交通費","雑費"];

function rcOut_(o){ return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function rcSheet_(){ return invSheet_(RC_SHEET, RC_COLS); }
function rcItem_(r){
  return { id:r.receipt_id, at:String(r["登録日時"]), by:r["登録者"], date:dateKey_(r["日付"]), vendor:r["店名"], amount:Number(r["金額"])||0,
    account:r["科目"], pay:r["支払元"], kind:r["区分"]||"運用", memo:r["摘要"], url:r["画像URL"], status:r["状態"]||"未確認", checkedBy:r["確認者"] };
}
function rcFolder_(ym){
  var props = PropertiesService.getScriptProperties(); var rid = props.getProperty("rc_folder_id"); var root = null;
  if (rid){ try { root = DriveApp.getFolderById(rid); if (root.isTrashed()) root = null; } catch(e){ root = null; } }
  if (!root){ root = DriveApp.createFolder("オリオン_レシート"); props.setProperty("rc_folder_id", root.getId()); }
  var it = root.getFoldersByName(ym); return it.hasNext() ? it.next() : root.createFolder(ym);
}

// 画像（base64 JPEG）を受け取り、Googleドキュメント変換のOCRで文字を読む
function rcOcr_(b64){
  // Drive拡張サービス（v3）でGoogleドキュメントに変換すると、画像の文字をOCRしてくれる
  var blob = Utilities.newBlob(Utilities.base64Decode(b64), "image/jpeg", "ocr_tmp_" + Date.now() + ".jpg");
  var f = Drive.Files.create({ name: "ocr_tmp_" + Date.now(), mimeType: "application/vnd.google-apps.document" }, blob, { ocrLanguage: "ja", fields: "id" });
  var text = "";
  try { text = DocumentApp.openById(f.id).getBody().getText(); }
  finally { try { Drive.Files.remove(f.id); } catch(e1){ try { DriveApp.getFileById(f.id).setTrashed(true); } catch(e2){} } }
  return String(text || "").replace(/\uFEFF/g, "");
}

function handleRcGet(e){
  var p = e.parameter; var res;
  try {
    var me = invAuth_(p); if (!me || me.role === "store") return rcOut_({ error: "auth" });
    if (p.mode === "rc_home"){
      var ym = String(p.ym || Utilities.formatDate(new Date(), "Asia/Tokyo", "yyyy/MM"));
      var all = invRows_(rcSheet_()).filter(function(r){ return r["状態"] !== "削除"; }).map(rcItem_);
      var list = all.filter(function(x){ return x.date.slice(0,7) === ym; });
      if (me.role !== "admin") list = list.filter(function(x){ return x.by === me.name; });
      list.sort(function(a,b){ return a.date < b.date ? 1 : a.date > b.date ? -1 : (a.at < b.at ? 1 : -1); });
      res = { me: me, ym: ym, list: list, accounts: RC_ACCOUNTS, unchecked: me.role === "admin" ? all.filter(function(x){ return x.status === "未確認"; }).length : 0 };
    } else res = { error: "mode" };
  } catch(err){ res = { error: String(err) }; }
  return rcOut_(res);
}

function handleRcPost(d){
  if (!d || !/^rc_/.test(String(d.type || ""))) return null;
  var res;
  try {
    var me = invAuth_(d); if (!me || me.role === "store") return rcOut_({ error: "auth" });
    if (d.type === "rc_ocr"){ return rcOut_({ ok: true, text: rcOcr_(String(d.image || "")) }); } // ロック不要
    var lock = LockService.getScriptLock(); lock.waitLock(15000);
    try {
      if (d.type === "rc_save") res = rcSave_(d, me);
      else if (d.type === "rc_delete") res = rcDelete_(d, me);
      else if (d.type === "rc_check") res = rcCheck_(d, me);
      else res = { error: "type" };
    } finally { lock.releaseLock(); }
  } catch(err){ res = { error: String(err) }; }
  return rcOut_(res);
}

// 経費シート／開業費シートの該当IDの行を探す
function rcFindExp_(id){ var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("経費"); var n = sh.getLastRow(); if (n < 2) return { sh: sh, row: -1 };
  var v = sh.getRange(2, 7, n - 1, 1).getValues(); for (var i = 0; i < v.length; i++) if (String(v[i][0]) === id) return { sh: sh, row: i + 2 }; return { sh: sh, row: -1 }; }
function rcFindIni_(id){ var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("開業費"); var n = sh.getLastRow(); var v = sh.getRange(2, 8, n - 1, 1).getValues();
  for (var i = 0; i < v.length; i++) if (String(v[i][0]).indexOf("id:" + id) >= 0) return { sh: sh, row: i + 2 }; return { sh: sh, row: -1 }; }
function rcIniInsertRow_(sh){ var n = sh.getLastRow(); var v = sh.getRange(2, 2, n - 1, 1).getValues(); var at = 2; for (var k = 0; k < v.length; k++){ if (v[k][0] !== "" && v[k][0] !== null) at = k + 3; else break; } sh.insertRowBefore(at); return at; }

// 同じ日付・同じ金額の経費がすでにあるか（カード明細の取り込み分などとの二重計上防止）
function rcDupes_(date, amount, selfId){
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("経費"); var n = sh.getLastRow(); if (n < 2) return [];
  var v = sh.getRange(2, 1, n - 1, 7).getValues(); var out = [];
  v.forEach(function(r){ if (dateKey_(r[0]) === date && Number(r[2]) === amount && String(r[6]) !== selfId) out.push({ vendor: String(r[4]), pay: String(r[3]), id: String(r[6]) }); });
  return out;
}

function rcSave_(d, me){
  var date = String(d.date || "").replace(/-/g, "/"); var amount = Math.round(Number(d.amount) || 0);
  if (!/^\d{4}\/\d{2}\/\d{2}$/.test(date)) return { error: "日付を入れてください" };
  if (!amount) return { error: "金額を入れてください" };
  var vendor = String(d.vendor || "").trim(); if (!vendor) return { error: "店名を入れてください" };
  var account = String(d.account || "雑費"); var pay = String(d.pay || ""); var kind = d.kind === "初期" ? "初期" : "運用"; var memo = String(d.memo || "").trim();
  var sh = rcSheet_(); var rows = invRows_(sh); var id = String(d.id || ""); var cur = id ? rows.filter(function(r){ return r.receipt_id === id; })[0] : null;
  if (id && !cur) return { error: "見つかりません" };
  if (cur && me.role !== "admin" && cur["登録者"] !== me.name) return { error: "自分の登録だけ直せます" };
  if (!d.force){ var dup = rcDupes_(date, amount, id || "-"); if (dup.length) return { dupes: dup }; }
  // 画像の保存（新規 or 差し替え）
  var url = cur ? String(cur["画像URL"] || "") : "", fid = cur ? String(cur.file_id || "") : "";
  if (d.image){
    var blob = Utilities.newBlob(Utilities.base64Decode(String(d.image)), "image/jpeg", date.replace(/\//g, "") + "_" + vendor.replace(/[\\\/:*?"<>|]/g, "") + "_" + amount + ".jpg");
    var f = rcFolder_(date.slice(0, 7).replace("/", "-")).createFile(blob); url = f.getUrl(); fid = f.getId();
  }
  if (!id) id = "RCPT-" + date.replace(/\//g, "") + "-" + Utilities.getUuid().replace(/-/g, "").slice(0, 6);
  var obj = { receipt_id: id, "登録日時": cur ? cur["登録日時"] : invNow_(), "登録者": cur ? cur["登録者"] : me.name, "日付": "'" + date, "店名": vendor, "金額": amount, "科目": account, "支払元": pay,
    "区分": kind, "摘要": memo, "画像URL": url, file_id: fid, "OCR": cur ? cur["OCR"] : String(d.ocr || "").slice(0, 3000),
    "状態": me.role === "admin" ? "確認済" : "未確認", "確認者": me.role === "admin" ? me.name : "", "確認日時": me.role === "admin" ? invNow_() : "", "更新日時": invNow_() };
  if (cur){ var lc = sh.getLastColumn(); var hdr = sh.getRange(1, 1, 1, lc).getValues()[0].map(String); sh.getRange(cur._row, 1, 1, lc).setValues([hdr.map(function(h){ return obj[h] !== undefined ? obj[h] : ""; })]); }
  else invAppend_(sh, obj);
  // 経費／開業費へ連動（区分が変わったら反対側の行を消す）
  var desc = vendor + (memo ? " " + memo : ""); var src = "レシート登録（" + (cur ? cur["登録者"] : me.name) + "）" + (url ? " " + url : "");
  var ex = rcFindExp_(id), ini = rcFindIni_(id);
  if (kind === "運用"){
    if (ini.row > 0) ini.sh.deleteRow(ini.row);
    var row = [date, account, amount, pay, desc, src, id];
    if (ex.row > 0) ex.sh.getRange(ex.row, 1, 1, 7).setValues([row]); else ex.sh.appendRow(row);
  } else {
    if (ex.row > 0) ex.sh.deleteRow(ex.row);
    var irow = [date, desc, account, amount, "", "確定", src, "id:" + id + "（支払元: " + pay + "）"];
    if (ini.row > 0) ini.sh.getRange(ini.row, 1, 1, 8).setValues([irow]); else { var at = rcIniInsertRow_(ini.sh); ini.sh.getRange(at, 1, 1, 8).setValues([irow]); }
  }
  return { ok: true, id: id };
}

function rcDelete_(d, me){
  var sh = rcSheet_(); var r = invRows_(sh).filter(function(x){ return x.receipt_id === d.id; })[0]; if (!r) return { error: "見つかりません" };
  if (me.role !== "admin" && r["登録者"] !== me.name) return { error: "自分の登録だけ消せます" };
  invSet_(sh, r._row, "状態", "削除"); invSet_(sh, r._row, "更新日時", invNow_());
  var ex = rcFindExp_(d.id); if (ex.row > 0) ex.sh.deleteRow(ex.row);
  var ini = rcFindIni_(d.id); if (ini.row > 0) ini.sh.deleteRow(ini.row);
  return { ok: true };
}

function rcCheck_(d, me){
  if (me.role !== "admin") return { error: "管理者のみ" };
  var sh = rcSheet_(); var r = invRows_(sh).filter(function(x){ return x.receipt_id === d.id; })[0]; if (!r) return { error: "見つかりません" };
  invSet_(sh, r._row, "状態", "確認済"); invSet_(sh, r._row, "確認者", me.name); invSet_(sh, r._row, "確認日時", invNow_());
  return { ok: true };
}

// 初回だけエディタから実行して、ドライブとURL取得の権限を承認する
function rcAuthorize(){ DriveApp.getRootFolder(); var d = DocumentApp.create("ocr_check_" + Date.now()); Drive.Files.remove(d.getId()); Logger.log("ok"); }

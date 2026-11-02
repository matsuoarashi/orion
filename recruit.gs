// ===== 採用（求人票・応募者）=====
// 分析シートの「求人票」「応募者」タブ。管理者アプリの「採用」から読み書きする（管理者だけ）
// 応募メール（Indeed など）は orion のメール取り込み（osMailIngest_）から recIngestMessages_ で応募者に入る
var REC_JOB = "求人票", REC_JOB_COLS = ["job_id","媒体","職種名","状態","掲載日","応募数","キャッチコピー","仕事内容","アピールポイント","求める人材","勤務時間","休日","給与","待遇","その他","管理URL","メモ","更新日時","更新者"];
var REC_APP = "応募者", REC_APP_COLS = ["app_id","応募日時","媒体","求人","名前","連絡先","状態","面接日時","メモ","メールID","件名","更新日時","更新者"];
var REC_STATUS = ["新規","連絡済","面接予定","採用","見送り","辞退"];
function recSheet_(n, cols){ return invSheet_(n, cols); }
function recNow_(){ return Utilities.formatDate(new Date(), "Asia/Tokyo", "yyyy/MM/dd HH:mm"); }
function recId_(p){ return p + Utilities.getUuid().replace(/-/g, "").slice(0, 10); }
function recRowsObj_(sh, cols){ return invRows_(sh).map(function(r){ var o = { _row: r._row }; cols.forEach(function(c){ var v = r[c]; o[c] = Object.prototype.toString.call(v) === "[object Date]" ? Utilities.formatDate(v, "Asia/Tokyo", "yyyy/MM/dd HH:mm") : (v == null ? "" : String(v)); }); return o; }); }
function recSet_(sh, cols, row, obj){ var hdr = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String); Object.keys(obj).forEach(function(k){ var c = hdr.indexOf(k); if (c < 0) return; var v = obj[k]; if (/^[=+@]/.test(String(v))) v = "'" + v; sh.getRange(row, c + 1).setValue(v); }); }

// メール → 応募者（Indeed の応募通知など）。同じメールIDは入れない
function recIngestMessages_(msgs){
  var list = (msgs || []).filter(function(m){ var f = String(m.from||"").toLowerCase(), s = String(m.subject||"");
    return (/indeed/.test(f) && /応募/.test(s) && !/求人.*(掲載|公開|審査)|ご請求|レポート|パフォーマンス/.test(s)) || /^(新しい応募|【応募】)/.test(s); });
  if (!list.length) return 0;
  var sh = recSheet_(REC_APP, REC_APP_COLS); var known = {}; recRowsObj_(sh, REC_APP_COLS).forEach(function(r){ if (r["メールID"]) known[r["メールID"]] = 1; });
  var n = 0;
  list.forEach(function(m){ if (known[m.id]) return; var s = String(m.subject||""), b = String(m.body||"").slice(0, 4000);
    var name = (s.match(/([^\s　:：「」]{1,20}?)\s*(?:様|さん)(?:から|が|の)/) || b.match(/([^\s　:：「」]{1,20}?)\s*(?:様|さん)(?:から|が)(?:.{0,10})応募/) || [])[1] || "";
    var job = (s.match(/[「『](.+?)[」』]/) || b.match(/[「『](.+?)[」』]/) || [])[1] || (s.split(/[-－|｜]/).slice(-1)[0] || "").trim();
    invAppend_(sh, { app_id: recId_("ap_"), "応募日時": m.date || recNow_(), "媒体": /indeed/i.test(m.from) ? "Indeed" : "メール", "求人": job.slice(0, 60), "名前": name, "連絡先": "", "状態": "新規",
      "面接日時": "", "メモ": "", "メールID": m.id, "件名": s.slice(0, 120), "更新日時": recNow_(), "更新者": "自動" });
    known[m.id] = 1; n++; });
  return n;
}

function recGet_(p){
  var me = null; try { me = invAuth_(p); } catch(e){}
  if (!me || me.role !== "admin") return invOut_({ error: "auth" });
  if (p.mode === "rec_list"){
    var apps = recRowsObj_(recSheet_(REC_APP, REC_APP_COLS), REC_APP_COLS).sort(function(a, b){ return a["応募日時"] < b["応募日時"] ? 1 : -1; });
    var jobs = recRowsObj_(recSheet_(REC_JOB, REC_JOB_COLS), REC_JOB_COLS);
    return invOut_({ ok: true, apps: apps, jobs: jobs, statuses: REC_STATUS });
  }
  return invOut_({ error: "mode" });
}
function recPost_(d){
  if (!d || !/^rec_/.test(String(d.type||""))) return null;
  var me = null; try { me = invAuth_(d); } catch(e){}
  if (!me || me.role !== "admin") return invOut_({ error: "auth" });
  var lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    if (d.type === "rec_app_save"){   // 応募者の追加・更新（状態・面接日時・メモなど）
      var sh = recSheet_(REC_APP, REC_APP_COLS), f = d.fields || {}, o = {};
      REC_APP_COLS.forEach(function(c){ if (c in f && !/^(app_id|メールID|更新日時|更新者)$/.test(c)) o[c] = String(f[c]); });
      if (o["状態"] && REC_STATUS.indexOf(o["状態"]) < 0) return invOut_({ error: "状態が正しくありません" });
      o["更新日時"] = recNow_(); o["更新者"] = me.name;
      if (d.id){ var r = recRowsObj_(sh, REC_APP_COLS).filter(function(x){ return x.app_id === d.id; })[0]; if (!r) return invOut_({ error: "見つかりません" }); recSet_(sh, REC_APP_COLS, r._row, o); return invOut_({ ok: true, id: d.id }); }
      if (!o["名前"]) return invOut_({ error: "名前を入れてください" });
      var id = recId_("ap_"); o.app_id = id; o["応募日時"] = o["応募日時"] || recNow_(); o["状態"] = o["状態"] || "新規"; invAppend_(sh, o); return invOut_({ ok: true, id: id });
    }
    if (d.type === "rec_job_save"){   // 求人票の追加・更新
      var js = recSheet_(REC_JOB, REC_JOB_COLS), g = d.fields || {}, q = {};
      REC_JOB_COLS.forEach(function(c){ if (c in g && !/^(job_id|更新日時|更新者)$/.test(c)) q[c] = String(g[c]); });
      q["更新日時"] = recNow_(); q["更新者"] = me.name;
      if (d.id){ var j = recRowsObj_(js, REC_JOB_COLS).filter(function(x){ return x.job_id === d.id; })[0]; if (!j) return invOut_({ error: "見つかりません" }); recSet_(js, REC_JOB_COLS, j._row, q); return invOut_({ ok: true, id: d.id }); }
      var jid = recId_("job_"); q.job_id = jid; invAppend_(js, q); return invOut_({ ok: true, id: jid });
    }
    if (d.type === "rec_app_delete" || d.type === "rec_job_delete"){   // 間違えて入れた行を消す（行ごと削除）
      var isApp = d.type === "rec_app_delete", ds = isApp ? recSheet_(REC_APP, REC_APP_COLS) : recSheet_(REC_JOB, REC_JOB_COLS), key = isApp ? "app_id" : "job_id";
      var hit = recRowsObj_(ds, isApp ? REC_APP_COLS : REC_JOB_COLS).filter(function(x){ return x[key] === String(d.id||""); })[0];
      if (!hit) return invOut_({ error: "見つかりません" }); ds.deleteRow(hit._row); return invOut_({ ok: true });
    }
    return invOut_({ error: "type" });
  } finally { lock.releaseLock(); }
}
// 今朝の確認・17時のまとめ：未対応（新規）の応募
function opsRecAlerts_(){
  var apps = recRowsObj_(recSheet_(REC_APP, REC_APP_COLS), REC_APP_COLS).filter(function(a){ return a["状態"] === "新規"; });
  return apps.length ? [{ key: "rec", level: "high", title: "新しい応募 " + apps.length + "件（まだ連絡していません）", detail: apps.slice(0, 4).map(function(a){ return (a["名前"] || "名前不明") + "（" + a["媒体"] + "・" + String(a["応募日時"]).slice(5, 16) + "）"; }).join("、") + "。前回は応募の8割以上が掲載から3日以内でした。その日のうちに連絡を", app: "recruit" }] : [];
}
// ===== 採用 END =====

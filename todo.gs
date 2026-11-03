// ===== TODO v1（やること＋今日の出来事）=====
// 取り付け：ORION OS END より下（LOAN END の下）に丸ごと置く。facts.gs の handleOsGet / handleOsPost に1行ずつ（os_todo_・os_ev_）
// 原則：やることは期限と担当で追いかける。済にしたあとの第三者の確認は必須にしない（写真は任意の証跡）
//       出来事は数字の「なぜ」を残す。書き足すだけで、直すときは新しい行（訂正元に旧ID）を足し、旧行は「訂正済」
var TODO_SHEET = "やること";
var TODO_COLS = ["todo_id","店舗","内容","担当id","担当","期限","種類","繰り返し","元","元id","作成者","作成日時","状態","済者","済日時","写真","メモ","変更履歴","更新日時"];
// 種類: 直す／頼む／定期   繰り返し: ""／"毎週:1"（0=日〜6=土）／"毎月:25"   状態: 未／済／見送り   元: 手で作成／出来事／口コミ／質問／臨店
var EV_SHEET = "出来事";
var EV_COLS = ["ev_id","店舗","日付","時刻","書いた人","書いた人id","種類","本文","元","訂正元","状態","登録日時"];
var EV_KINDS = ["近くでイベント","団体・まとまった来店","品切れ","機械・設備","お客様の声（良い）","お客様の声（悪い）","人の手配","天気","その他"];

function todoSheet_(){ return osSheet_(TODO_SHEET, TODO_COLS); }
function evSheet_(){ return osSheet_(EV_SHEET, EV_COLS); }
function todoD_(v){ return v instanceof Date ? Utilities.formatDate(v, "Asia/Tokyo", "yyyy/MM/dd") : String(v||"").replace(/^'/, ""); }
function todoIds_(s){ return String(s||"").split(",").map(function(x){ return x.trim(); }).filter(String); }
function todoOut_(r){
  return { id:String(r.todo_id), store:String(r["店舗"]||"kanda"), text:String(r["内容"]), whoIds:todoIds_(r["担当id"]), who:String(r["担当"]||""), due:todoD_(r["期限"]),
    kind:String(r["種類"]||""), repeat:String(r["繰り返し"]||""), src:String(r["元"]||""), srcId:String(r["元id"]||""), by:String(r["作成者"]||""), at:String(r["作成日時"]||""),
    status:String(r["状態"]||"未"), doneBy:String(r["済者"]||""), doneAt:String(r["済日時"]||""), photo:String(r["写真"]||""), memo:String(r["メモ"]||"") };
}
function todoMine_(t, me){ return t.whoIds.indexOf(String(me.staff_id)) >= 0; }

// ---------- 読み取り ----------
function todoGet_(mode, me, p){
  if (me.role === "store") return { error: "ログインしてください" };
  var today = invToday_();
  if (mode === "os_todo_list"){
    var cut = osAddDays_(today, me.role === "admin" ? -30 : -7);
    var list = invRows_(todoSheet_()).map(todoOut_).filter(function(t){
      if (me.role !== "admin" && !todoMine_(t, me)) return false;
      return t.status === "未" || String(t.doneAt||t.at).slice(0,10) >= cut;
    }).sort(function(a, b){ var sa = a.status === "未" ? 0 : 1, sb = b.status === "未" ? 0 : 1; return (sa - sb) || ((a.due||"9999") < (b.due||"9999") ? -1 : (a.due||"9999") > (b.due||"9999") ? 1 : 0); });
    return { ok:true, today:today, list:list };
  }
  if (mode === "os_ev_list"){ // from〜to（既定は直近14日）。スタッフは自分が書いたものだけ
    var to = String(p.to||today), from = String(p.from||osAddDays_(to, -13));
    var rows = invRows_(evSheet_()).filter(function(r){ var d = todoD_(r["日付"]); return d >= from && d <= to && String(r["状態"]||"有効") === "有効"; });
    if (me.role !== "admin") rows = rows.filter(function(r){ return String(r["書いた人id"]) === String(me.staff_id); });
    return { ok:true, kinds:EV_KINDS, list:rows.map(function(r){ return { id:String(r.ev_id), date:todoD_(r["日付"]), time:String(r["時刻"]||""), by:String(r["書いた人"]||""), kinds:String(r["種類"]||"").split("・").filter(String), text:String(r["本文"]||""), src:String(r["元"]||"") }; }) };
  }
  return { error: "unknown mode" };
}
function osAddDays_(key, n){ var a = key.split("/").map(Number); var d = new Date(a[0], a[1]-1, a[2] + n); return Utilities.formatDate(d, "Asia/Tokyo", "yyyy/MM/dd"); }

// ---------- 書き込み ----------
function todoPost_(d, me){
  if (me.role === "store") return { error: "ログインしてください" };
  var t = String(d.type);
  if (t === "os_todo_save") return todoSave_(d, me);
  if (t === "os_todo_done") return todoDone_(d, me);
  if (t === "os_todo_status") return todoStatus_(d, me);
  if (t === "os_ev_save") return evSave_(d, me);
  if (t === "os_ev_del") return evDel_(d, me);
  return { error: "unknown type" };
}
// 作成・変更（管理者）。変更は同じ行を直し、変更履歴に前後を残す
function todoSave_(d, me){
  if (me.role !== "admin") return { error: "管理者のみ" };
  var text = String(d.text||"").trim().slice(0, 200); if (!text) return { error: "内容を入れてください" };
  var due = String(d.due||"").replace(/-/g, "/"); if (due && !/^\d{4}\/\d{2}\/\d{2}$/.test(due)) return { error: "期限の形が違います" };
  var rep = String(d.repeat||""); if (rep && !/^毎週:[0-6]$|^毎月:([1-9]|[12]\d|3[01])$/.test(rep)) return { error: "繰り返しの形が違います" };
  var ids = (d.whoIds||[]).map(String).join(","), names = (d.whoNames||[]).map(String).join("・");
  var sh = todoSheet_(), now = invNow_();
  if (d.id){
    var r = invRows_(sh).filter(function(x){ return String(x.todo_id) === String(d.id); })[0]; if (!r) return { error: "見つかりません" };
    var ch = [];
    [["内容",text],["担当",names],["期限",due],["繰り返し",rep],["メモ",String(d.memo||"")]].forEach(function(kv){ var old = kv[0] === "期限" ? todoD_(r[kv[0]]) : String(r[kv[0]]||""); if (old !== kv[1]) ch.push(kv[0] + " " + (old||"なし") + "→" + (kv[1]||"なし")); });
    if (!ch.length) return { ok:true, id:d.id };
    invSet_(sh, r._row, "内容", text); invSet_(sh, r._row, "担当id", ids); invSet_(sh, r._row, "担当", names); invSet_(sh, r._row, "期限", due ? "'" + due : "");
    invSet_(sh, r._row, "繰り返し", rep); invSet_(sh, r._row, "種類", rep ? "定期" : String(d.kind||r["種類"]||"直す")); invSet_(sh, r._row, "メモ", String(d.memo||""));
    invSet_(sh, r._row, "変更履歴", (String(r["変更履歴"]||"") + "\n" + now + " " + me.name + "：" + ch.join("、")).trim()); invSet_(sh, r._row, "更新日時", now);
    return { ok:true, id:d.id };
  }
  var id = invId_("td_");
  invAppend_(sh, { todo_id:id, "店舗":String(d.store||"kanda"), "内容":text, "担当id":ids, "担当":names, "期限": due ? "'" + due : "", "種類": rep ? "定期" : String(d.kind||"直す"), "繰り返し":rep,
    "元":String(d.src||"手で作成"), "元id":String(d.srcId||""), "作成者":me.name, "作成日時":now, "状態":"未", "済者":"", "済日時":"", "写真":"", "メモ":String(d.memo||""), "変更履歴":"", "更新日時":now });
  return { ok:true, id:id };
}
// 済にする（担当者か管理者）。写真は任意。繰り返しなら次の回を作る。undo で未に戻す
function todoDone_(d, me){
  var sh = todoSheet_(); var r = invRows_(sh).filter(function(x){ return String(x.todo_id) === String(d.id); })[0]; if (!r) return { error: "見つかりません" };
  var t = todoOut_(r); if (me.role !== "admin" && !todoMine_(t, me)) return { error: "担当ではありません" };
  var now = invNow_();
  if (d.undo){ if (t.status !== "済") return { ok:true }; invSet_(sh, r._row, "状態", "未"); invSet_(sh, r._row, "済者", ""); invSet_(sh, r._row, "済日時", "");
    invSet_(sh, r._row, "変更履歴", (String(r["変更履歴"]||"") + "\n" + now + " " + me.name + "：未に戻す").trim()); invSet_(sh, r._row, "更新日時", now); return { ok:true }; }
  if (t.status === "済") return { ok:true, already:true };
  var photo = "";
  if (d.photo){ try { var blob = Utilities.newBlob(Utilities.base64Decode(String(d.photo)), "image/jpeg", invToday_().replace(/\//g, "") + "_" + t.id + ".jpg"); photo = todoFolder_().createFile(blob).getId(); } catch(e){ return { error: "写真を保存できませんでした：" + String(e).slice(0, 80) }; } }
  invSet_(sh, r._row, "状態", "済"); invSet_(sh, r._row, "済者", me.name); invSet_(sh, r._row, "済日時", now); if (photo) invSet_(sh, r._row, "写真", photo);
  if (d.memo) invSet_(sh, r._row, "メモ", (String(r["メモ"]||"") + "\n" + me.name + "：" + String(d.memo).slice(0, 200)).trim());
  invSet_(sh, r._row, "更新日時", now);
  var next = "";
  if (t.repeat){ var nd = todoNextDue_(t.repeat, t.due || invToday_()); next = invId_("td_");
    invAppend_(sh, { todo_id:next, "店舗":t.store, "内容":t.text, "担当id":t.whoIds.join(","), "担当":t.who, "期限":"'" + nd, "種類":"定期", "繰り返し":t.repeat, "元":t.src, "元id":t.id, "作成者":"繰り返し", "作成日時":now, "状態":"未", "メモ":"", "更新日時":now }); }
  return { ok:true, next:next };
}
function todoNextDue_(rep, from){
  var m = rep.split(":"), n = Number(m[1]), today = invToday_(), base = from > today ? from : today;
  if (m[0] === "毎週"){ var k = osAddDays_(base, 1); for (var i = 0; i < 7; i++){ var a = k.split("/").map(Number); if (new Date(a[0], a[1]-1, a[2]).getDay() === n) return k; k = osAddDays_(k, 1); } return k; }
  var b = base.split("/").map(Number), y = b[0], mo = b[1] + 1; if (mo > 12){ mo = 1; y++; }
  var last = new Date(y, mo, 0).getDate(); return y + "/" + ("0" + mo).slice(-2) + "/" + ("0" + Math.min(n, last)).slice(-2);
}
function todoStatus_(d, me){
  if (me.role !== "admin") return { error: "管理者のみ" };
  var st = String(d.status||""); if (["未","見送り"].indexOf(st) < 0) return { error: "状態が不正" };
  var sh = todoSheet_(); var r = invRows_(sh).filter(function(x){ return String(x.todo_id) === String(d.id); })[0]; if (!r) return { error: "見つかりません" };
  var now = invNow_(); invSet_(sh, r._row, "状態", st); invSet_(sh, r._row, "変更履歴", (String(r["変更履歴"]||"") + "\n" + now + " " + me.name + "：" + st).trim()); invSet_(sh, r._row, "更新日時", now);
  return { ok:true };
}
function todoFolder_(){
  var props = PropertiesService.getScriptProperties(), id = props.getProperty("todo_folder_id"), f = null;
  if (id){ try { f = DriveApp.getFolderById(id); if (f.isTrashed()) f = null; } catch(e){ f = null; } }
  if (!f){ f = DriveApp.createFolder("オリオン_やること写真"); props.setProperty("todo_folder_id", f.getId()); }
  return f;
}
// 出来事を書く（全員）。id があれば訂正（本人か管理者）
function evSave_(d, me){
  var kinds = (d.kinds||[]).map(String).filter(function(k){ return EV_KINDS.indexOf(k) >= 0; });
  var text = String(d.text||"").trim().slice(0, 100); if (!kinds.length && !text) return { error: "種類かひとことを入れてください" };
  var date = String(d.date||invToday_()).replace(/-/g, "/"); if (!/^\d{4}\/\d{2}\/\d{2}$/.test(date)) return { error: "日付の形が違います" };
  var sh = evSheet_(), now = invNow_(), prev = "";
  if (d.id){ var r = invRows_(sh).filter(function(x){ return String(x.ev_id) === String(d.id); })[0]; if (!r) return { error: "見つかりません" };
    if (me.role !== "admin" && String(r["書いた人id"]) !== String(me.staff_id)) return { error: "書いた人か管理者だけが直せます" };
    invSet_(sh, r._row, "状態", "訂正済"); prev = String(d.id); }
  var id = invId_("ev_");
  invAppend_(sh, { ev_id:id, "店舗":String(d.store||"kanda"), "日付":"'" + date, "時刻":Utilities.formatDate(new Date(), "Asia/Tokyo", "HH:mm"), "書いた人":me.name, "書いた人id":String(me.staff_id||""),
    "種類":kinds.join("・"), "本文":text, "元":String(d.src||(me.role === "admin" ? "管理者" : "スタッフ")), "訂正元":prev, "状態":"有効", "登録日時":now });
  return { ok:true, id:id };
}
function evDel_(d, me){
  var sh = evSheet_(); var r = invRows_(sh).filter(function(x){ return String(x.ev_id) === String(d.id); })[0]; if (!r) return { error: "見つかりません" };
  if (me.role !== "admin" && String(r["書いた人id"]) !== String(me.staff_id)) return { error: "書いた人か管理者だけが消せます" };
  invSet_(sh, r._row, "状態", "取消"); return { ok:true };
}

// ---------- 今朝の確認・17時のまとめ（staffing.gs opsAlerts_ から run）----------
function todoAlerts_(){
  var today = invToday_(), out = [];
  invRows_(todoSheet_()).map(todoOut_).filter(function(t){ return t.status === "未" && t.due && t.due <= today; }).forEach(function(t){
    out.push({ key:"todo", level: t.due < today ? "high" : "mid", title: (t.due < today ? "期限を過ぎたやること：" : "今日が期限のやること：") + t.text.slice(0, 30), detail: "担当 " + (t.who||"なし") + "｜期限 " + t.due + (t.memo ? "｜" + t.memo.slice(0, 60) : ""), app:"todo" });
  });
  return out;
}
// ===== TODO END =====

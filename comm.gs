// ───────────────────────── 連絡（運営からのお知らせ・引き継ぎノート） v1 ─────────────────────────
SHEETS.notice = ["お知らせ", ["notice_id","日時","タイトル","本文","投稿者","重要","状態","既読","更新日時"]];
SHEETS.note = ["引き継ぎ", ["note_id","日時","本文","記録者","状態","対応者","対応日時"]];
READ_ACTIONS.comm = 1; READ_ACTIONS["admin.notices"] = 1;

var NOTICE_SEED = [
  {notice_id:"n_seed_counter", title:"来店カウンターの正しい押し方", important:"1", body:
"レジの上にある「男性」「女性」ボタンは、店内で食事されるお客様の人数を数えるためのものです。分析の元データになるので、次のルールでお願いします。\n\n" +
"■ 押すタイミング\n・お客様が入って来て「いらっしゃいませ」と言った、その場で押す\n・2人組なら2回（男性1・女性1 など）、1人ずつ数える\n\n" +
"■ 押さないもの\n・持ち帰り（テイクアウト）のお客様は押さない（店内で食事する方だけ）\n・待ちきれずに帰られた方も押さない\n\n" +
"■ やらないこと\n・あとから思い出してまとめて押さない（時間がずれて使えないデータになります）\n・会計の時に押さない（来店時に押す）\n\n" +
"■ 間違えたら\n・「取消」で1件戻せます。押しすぎた分はその場で取消してください\n\n" +
"ホールが忙しい時はキッチンから見える方が押してもOKです。「来た時に・その場で・1人1回」でお願いします。"},
  {notice_id:"n_seed_guide6", title:"接客ガイドを更新しました（6｜スタッフ同士の会話）", important:"0", body:
"接客・身だしなみガイドの「6｜スタッフ同士の会話」を書き足しました。ホームの「ガイドを読む」から、6章だけでいいので一度目を通してください。\n\n" +
"オリオンは9席のオープンキッチンなので、厨房とホールのやりとりはお客様に全部聞こえています。お客様への丁寧さと、スタッフへの丁寧さは同じもの、というのが店の考え方です。\n\n" +
"・指示や依頼は「○○お願いします」の形で\n・気づいたことは責めずに短く。注意が必要なことは営業後に\n・「ありがとうございます」「助かります」は何度言ってもOK\n・冗談やいじりは、言われた側が笑えているかで判断する\n\n" +
"全員が気持ちよく働ける店が、お客様にも感じのいい店になります。よろしくお願いします。"},
  {notice_id:"n_seed_printer", title:"持ち帰り用レシートプリンターの設定方法", important:"0", body:
"テイクアウトの予約が入ると、店のスマホ（レジ）からBluetoothプリンターに伝票を自動で印刷します。プリンターが「未接続」だと印刷されないので、開店前に必ず確認してください。\n\n" +
"■ 開店前の確認（毎日）\n1. プリンターの電源を入れる（電源ランプが点くまで待つ）\n2. レジアプリを開く。画面右下の「🖨」が「接続」なら準備OK\n3. 「🖨 未接続」のままなら、下の手順でつなぐ\n\n" +
"■ つなぎ方\n1. レジ画面の下にあるタブ「閉店後」→「テイクアウト」を開く\n2. 「プリンター 未接続（タップで接続）」をタップ\n3. 出てきた一覧からプリンター名（Printer / BlueTooth Printer など）を選んで「ペア設定」\n4. 「プリンター 接続中」になったら「テスト印刷」を押して1枚出るか確認\n\n" +
"■ 一度つないだら\n・次からは、レジを開いた時に自動でつながります（つながらない時は上の手順をもう一度）\n・未印刷の予約があれば、つながった時にまとめて印刷されます\n\n" +
"■ うまくいかない時\n・スマホのBluetoothがONになっているか確認\n・プリンターの電源を入れ直す→レジ画面を一度閉じて開き直す\n・レシートの紙切れ（赤い線が出たら交換。紙は58mm幅、ロールはフタを開けて紙の先が手前・下から出るように入れる）\n・それでもダメな時は、予約一覧の「印刷」ボタンで手動で出すか、運営に連絡してください\n\n" +
"※ レジのスマホは営業中はスリープさせず、充電しながら置いておいてください（スリープ中は予約の受信・印刷ができません）。"}
];
function noticeSeed_(){
  var all = rows("notice"); var have = {}; all.forEach(function(r){ have[r.notice_id] = 1; });
  var added = 0;
  NOTICE_SEED.forEach(function(n){ if (have[n.notice_id]) return;
    writeRow("notice", {notice_id:n.notice_id, "日時":nowStr(), "タイトル":n.title, "本文":n.body, "投稿者":"運営", "重要":n.important, "状態":"active", "既読":"", "更新日時":nowStr()}); added++; });
  return added;
}
function noticeNorm_(r, meId){
  var read = String(r["既読"]||"").split(",").filter(Boolean);
  return {notice_id:r.notice_id, at:String(r["日時"]||"").slice(0,16), title:r["タイトル"], body:r["本文"], by:r["投稿者"], important:String(r["重要"])==="1", status:r["状態"], read: meId ? read.indexOf(meId)>=0 : false, readIds:read};
}
function noteNorm_(r){
  return {note_id:r.note_id, at:String(r["日時"]||"").slice(0,16), body:r["本文"], by:r["記録者"], status:r["状態"], doneBy:r["対応者"]||"", doneAt:String(r["対応日時"]||"").slice(0,16)};
}
// スタッフ: お知らせ＋引き継ぎをまとめて取得
STAFF.comm = function(p, me){
  noticeSeed_();
  var id = me.staff.staff_id;
  var notices = rows("notice").filter(function(r){ return r["状態"]==="active"; }).map(function(r){ return noticeNorm_(r, id); }).sort(function(a,b){ return a.at<b.at?1:-1; });
  var notes = rows("note").map(noteNorm_).sort(function(a,b){ return a.at<b.at?1:-1; });
  var open = notes.filter(function(n){ return n.status==="open"; });
  var done = notes.filter(function(n){ return n.status!=="open"; }).slice(0,20);
  return ok({notices:notices, unread: notices.filter(function(n){ return !n.read; }).length, notes: open.concat(done), openCount: open.length, moodToday: moodToday_(id)});
};
STAFF.notice_read = function(p, me){
  var id = me.staff.staff_id; var all = rows("notice");
  for (var i=0;i<all.length;i++){ var r = all[i]; if (r.notice_id===p.notice_id){
    var read = String(r["既読"]||"").split(",").filter(Boolean); if (read.indexOf(id)<0){ read.push(id); setCell("notice", r._row, "既読", read.join(",")); }
    audit(id, "notice_read", p.notice_id, ""); return ok();
  }}
  return err("お知らせが見つかりません");
};
STAFF.note_add = function(p, me){
  var body = String(p.body||"").trim(); if (!body) return err("内容を入力してください"); if (body.length > 400) return err("400文字以内でお願いします");
  var id = uid("nt_");
  writeRow("note", {note_id:id, "日時":nowStr(), "本文":body, "記録者":me.staff["名前"], "状態":"open", "対応者":"", "対応日時":""});
  audit(me.staff.staff_id, "note_add", id, body.slice(0,60));
  return ok({note_id:id});
};
STAFF.note_done = function(p, me){
  var all = rows("note");
  for (var i=0;i<all.length;i++){ var r = all[i]; if (r.note_id===p.note_id){
    var undo = !!p.undo;
    setCell("note", r._row, "状態", undo ? "open" : "done"); setCell("note", r._row, "対応者", undo ? "" : me.staff["名前"]); setCell("note", r._row, "対応日時", undo ? "" : nowStr());
    audit(me.staff.staff_id, undo ? "note_reopen" : "note_done", p.note_id, ""); return ok();
  }}
  return err("ノートが見つかりません");
};
// 管理: お知らせの作成・編集・取り下げ、既読状況
ADMIN.notices = function(p, me){
  noticeSeed_();
  var names = {}; rows("staff").forEach(function(s){ names[s.staff_id] = s["名前"]; });
  var active = rows("staff").filter(function(s){ return s["状態"]==="active"; }).map(function(s){ return {staff_id:s.staff_id, name:s["名前"]}; });
  var list = rows("notice").map(function(r){ var n = noticeNorm_(r, null); n.readNames = n.readIds.map(function(x){ return names[x]||x; }); n.unreadNames = active.filter(function(s){ return n.readIds.indexOf(s.staff_id)<0; }).map(function(s){ return s.name; }); return n; }).sort(function(a,b){ return a.at<b.at?1:-1; });
  return ok({notices:list, staff:active});
};
ADMIN.notice_save = function(p, me){
  var title = String(p.title||"").trim(), body = String(p.body||"").trim(); if (!title) return err("タイトルを入力してください"); if (!body) return err("本文を入力してください");
  var imp = p.important ? "1" : "0";
  if (p.notice_id){
    var all = rows("notice");
    for (var i=0;i<all.length;i++){ var r = all[i]; if (r.notice_id===p.notice_id){
      var o = {notice_id:r.notice_id, "日時":r["日時"], "タイトル":title, "本文":body, "投稿者":r["投稿者"]||me.staff["名前"], "重要":imp, "状態":"active", "既読": p.resetRead ? "" : r["既読"], "更新日時":nowStr()};
      writeRow("notice", o, r._row); audit(me.staff.staff_id, "notice_edit", r.notice_id, title); return ok({notice_id:r.notice_id});
    }}
    return err("お知らせが見つかりません");
  }
  var id = uid("n_");
  writeRow("notice", {notice_id:id, "日時":nowStr(), "タイトル":title, "本文":body, "投稿者":me.staff["名前"], "重要":imp, "状態":"active", "既読":"", "更新日時":nowStr()});
  audit(me.staff.staff_id, "notice_add", id, title);
  return ok({notice_id:id});
};
ADMIN.notice_archive = function(p, me){
  var all = rows("notice");
  for (var i=0;i<all.length;i++){ var r = all[i]; if (r.notice_id===p.notice_id){
    setCell("notice", r._row, "状態", p.restore ? "active" : "archived"); setCell("notice", r._row, "更新日時", nowStr());
    audit(me.staff.staff_id, p.restore ? "notice_restore" : "notice_archive", p.notice_id, ""); return ok();
  }}
  return err("お知らせが見つかりません");
};

// ───────────────────────── 今日の空気レポート（退勤時・3項目） ─────────────────────────
SHEETS.mood = ["空気", ["mood_id","日付","staff_id","名前","お客様","スタッフ","自分","ひとこと","記録日時"]];
READ_ACTIONS["admin.mood_month"] = 1;
function moodToday_(id){ var t = today(); return rows("mood").some(function(r){ return r.staff_id===id && fmtDate(r["日付"])===t; }); }
STAFF.mood_save = function(p, me){
  var vals = [p.customer, p.staff, p.self].map(Number);
  if (vals.some(function(v){ return !(v>=1 && v<=3); })) return err("3つとも選んでください");
  var t = today(), id = me.staff.staff_id; var note = String(p.note||"").slice(0,80);
  var all = rows("mood"); var cur = all.filter(function(r){ return r.staff_id===id && fmtDate(r["日付"])===t; })[0];
  var o = {mood_id: cur ? cur.mood_id : uid("md_"), "日付":t, staff_id:id, "名前":me.staff["名前"], "お客様":vals[0], "スタッフ":vals[1], "自分":vals[2], "ひとこと":note, "記録日時":nowStr()};
  writeRow("mood", o, cur ? cur._row : null);
  audit(id, "mood_save", o.mood_id, vals.join("/"));
  return ok();
};
ADMIN.mood_month = function(p, me){
  var ym = p.ym || Utilities.formatDate(new Date(), TZ, "yyyy/MM");
  var list = rows("mood").filter(function(r){ return fmtDate(r["日付"]).slice(0,7)===ym; }).map(function(r){
    return {date:fmtDate(r["日付"]), staff_id:r.staff_id, name:r["名前"], customer:Number(r["お客様"]), staff:Number(r["スタッフ"]), self:Number(r["自分"]), note:r["ひとこと"]||"", at:String(r["記録日時"]||"").slice(0,16)};
  }).sort(function(a,b){ return a.date<b.date?1:(a.date>b.date?-1:(a.name<b.name?-1:1)); });
  // 退勤したのに未回答の人（当月）
  var answered = {}; list.forEach(function(r){ answered[r.date+"|"+r.staff_id] = 1; });
  var names = {}; rows("staff").forEach(function(s){ names[s.staff_id] = s["名前"]; });
  var missing = rows("att").filter(function(a){ var d = fmtDate(a["日付"]); return d.slice(0,7)===ym && fmtHM(a["退勤"]) && !answered[d+"|"+a.staff_id]; }).map(function(a){ return {date:fmtDate(a["日付"]), name:names[a.staff_id]||a.staff_id}; });
  return ok({ym:ym, list:list, missing:missing});
};

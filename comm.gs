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
  return ok({notices:notices, unread: notices.filter(function(n){ return !n.read; }).length, notes: open.concat(done), openCount: open.length, moodToday: moodToday_(id), coworkers: coworkersToday_(id), thanks: thanksToMe_(id), kitchen: kitchenIds_().indexOf(id)>=0, pilot: pilotIds_().indexOf(id)>=0});
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
SHEETS.mood = ["空気", ["mood_id","日付","staff_id","名前","お客様","スタッフ","自分","ひとこと","記録日時","ふりかえり問","ありがとう先"]];
READ_ACTIONS["admin.mood_month"] = 1;
function moodToday_(id){ var t = today(); return rows("mood").some(function(r){ return r.staff_id===id && fmtDate(r["日付"])===t; }); }
STAFF.mood_save = function(p, me){
  ensureHeader_("mood");
  var vals = [p.customer, p.staff, p.self].map(Number);
  if (vals.some(function(v){ return !(v>=1 && v<=3); })) return err("3つとも選んでください");
  var t = today(), id = me.staff.staff_id; var note = String(p.note||"").slice(0,80);
  var all = rows("mood"); var cur = all.filter(function(r){ return r.staff_id===id && fmtDate(r["日付"])===t; })[0];
  var o = {mood_id: cur ? cur.mood_id : uid("md_"), "日付":t, staff_id:id, "名前":me.staff["名前"], "お客様":vals[0], "スタッフ":vals[1], "自分":vals[2], "ひとこと":note, "記録日時":nowStr(), "ふりかえり問":String(p.q||"").slice(0,60), "ありがとう先":String(p.thanks||"").slice(0,40)};
  writeRow("mood", o, cur ? cur._row : null);
  audit(id, "mood_save", o.mood_id, vals.join("/"));
  return ok();
};
ADMIN.mood_month = function(p, me){
  var ym = p.ym || Utilities.formatDate(new Date(), TZ, "yyyy/MM");
  var list = rows("mood").filter(function(r){ return fmtDate(r["日付"]).slice(0,7)===ym; }).map(function(r){
    return {date:fmtDate(r["日付"]), staff_id:r.staff_id, name:r["名前"], customer:Number(r["お客様"]), staff:Number(r["スタッフ"]), self:Number(r["自分"]), note:r["ひとこと"]||"", at:String(r["記録日時"]||"").slice(0,16), q:r["ふりかえり問"]||"", thanks:r["ありがとう先"]||"", thanksName:""};
  }).sort(function(a,b){ return a.date<b.date?1:(a.date>b.date?-1:(a.name<b.name?-1:1)); });
  // 退勤したのに未回答の人（当月）
  var answered = {}; list.forEach(function(r){ answered[r.date+"|"+r.staff_id] = 1; });
  var names = {}; rows("staff").forEach(function(s){ names[s.staff_id] = s["名前"]; });
  var since = rows("mood").map(function(r){ return fmtDate(r["日付"]); }).sort()[0] || "9999/99/99"; var pil = pilotIds_();
  var missing = rows("att").filter(function(a){ var d = fmtDate(a["日付"]); return d.slice(0,7)===ym && d>=since && pil.indexOf(a.staff_id)>=0 && fmtHM(a["退勤"]) && !answered[d+"|"+a.staff_id]; }).map(function(a){ return {date:fmtDate(a["日付"]), name:names[a.staff_id]||a.staff_id}; });
  list.forEach(function(r){ if (r.thanks) r.thanksName = names[r.thanks]||""; });
  return ok({ym:ym, list:list, missing:missing});
};
// 今日一緒に働いた人（出勤記録のある人。自分以外）と、自分に届いた「ありがとう」（直近3日）
function coworkersToday_(id){
  var t = today(), names = {}; rows("staff").forEach(function(s){ names[s.staff_id] = s["名前"]; });
  var seen = {}; return rows("att").filter(function(a){ return fmtDate(a["日付"])===t && a.staff_id!==id && fmtHM(a["出勤"]); }).map(function(a){ return {id:a.staff_id, name:names[a.staff_id]||""}; }).filter(function(x){ if (seen[x.id]||!x.name) return false; seen[x.id]=1; return true; });
}
function thanksToMe_(id){
  var lim = Utilities.formatDate(new Date(Date.now()-3*86400000), TZ, "yyyy/MM/dd");
  return rows("mood").filter(function(r){ return r["ありがとう先"]===id && fmtDate(r["日付"])>=lim; }).map(function(r){ return {date:fmtDate(r["日付"]), from:r["名前"]}; }).sort(function(a,b){ return a.date<b.date?1:-1; });
}

// ───────────────────────── 衛生記録（HACCP: 健康チェック・庫内温度・担当別チェック） ─────────────────────────
SHEETS.hyg = ["衛生", ["hyg_id","日付","staff_id","名前","区分","担当","項目","温度","記録日時","対応"]];
SHEETS.hygrev = ["衛生振り返り", ["年月","結果","内容","確認者","日時"]];
READ_ACTIONS["admin.hyg_month"] = 1; READ_ACTIONS["admin.hyg_folder"] = 1;
// 衛生チェック項目（アプリ・記録表・計画書で共通。短縮名は記録表の列見出し）
var HYG_ITEMS = {
  health: [["体調に異常なし（発熱・下痢・嘔吐なし）","体調"],["手指に傷・化膿なし","手指"]],
  kitchen: [["仕込んだソース・茹で麺を速やかに冷まして冷蔵した","冷却"],["提供時に十分に再加熱した（ソースは沸騰・麺は中まで）","再加熱"],["加熱して提供した（目玉焼き・ハンバーグ・コロッケは中まで）","加熱"],["調理器具・まな板の洗浄と殺菌","器具"],["冷蔵庫内の整理（生の食材と調理済みを分ける・期限・ラップ・床置きなし）","庫内"],["厨房の清掃・ゴミ出し","清掃"],["手洗い（作業前・トイレ後・生ものの後）","手洗"]],
  hall: [["トイレ清掃・消毒・ペーパー補充","トイレ"],["テーブル・卓上調味料の拭き上げ","卓上"],["客席・床の清掃","床"],["手洗い場の石けん・ペーパー補充","手洗場"],["食器の洗浄・乾燥・収納","食器"]]
};
function ensureHeader_(key){
  var s = sh(key), hdr = SHEETS[key][1];
  var cur = s.getRange(1,1,1,hdr.length).getValues()[0];
  if (cur.join("|") !== hdr.join("|")) s.getRange(1,1,1,hdr.length).setValues([hdr]).setFontWeight("bold");
}
function ensureSetting_(k, desc, dflt){ var v = settings()[k]; if (v === undefined){ writeRow("settings", {key:k, value:dflt||"", "説明":desc}); return dflt||""; } return v; }
function pilotIds_(){
  var v = settings().pilot_ids;
  if (v === undefined){ writeRow("settings", {key:"pilot_ids", value:"s_48230c3becee", "説明":"衛生記録・空気レポートを先行して出す staff_id（カンマ区切り）。all で全員"}); v = "s_48230c3becee"; }
  if (String(v).trim()==="all") return rows("staff").map(function(s){ return s.staff_id; });
  return String(v||"").split(",").map(function(x){ return x.trim(); }).filter(Boolean);
}
function kitchenIds_(){
  var v = settings().kitchen_ids;
  if (v === undefined){ writeRow("settings", {key:"kitchen_ids", value:"s_c88a307b2495", "説明":"厨房担当の staff_id（カンマ区切り）。出退勤時の衛生チェックが厨房用になる"}); v = "s_c88a307b2495"; }
  return String(v||"").split(",").map(function(x){ return x.trim(); }).filter(Boolean);
}
STAFF.hyg_save = function(p, me){
  ensureHeader_("hyg");
  var kind = p.kind==="in" ? "出勤" : "退勤"; var area = p.area==="kitchen" ? "厨房" : "客席";
  var items = Array.isArray(p.items) ? p.items.map(String).slice(0,16) : [];
  var temps = (p.temps && typeof p.temps==="object") ? p.temps : {};
  var action = String(p.fix||"").slice(0,200);
  var t = today(), id = me.staff.staff_id;
  var cur = rows("hyg").filter(function(r){ return r.staff_id===id && fmtDate(r["日付"])===t && r["区分"]===kind; })[0];
  var o = {hyg_id: cur ? cur.hyg_id : uid("hy_"), "日付":t, staff_id:id, "名前":me.staff["名前"], "区分":kind, "担当":area, "項目":items.join("、"), "温度":JSON.stringify(temps), "記録日時":nowStr(), "対応":action};
  writeRow("hyg", o, cur ? cur._row : null);
  audit(id, "hyg_save", o.hyg_id, kind+"/"+area+"/"+items.length+(action?"/対応あり":""));
  return ok();
};
function shortOf_(list, full){ for (var i=0;i<list.length;i++) if (list[i][0]===full) return list[i][1]; return null; }
ADMIN.hyg_month = function(p, me){
  var ym = p.ym || Utilities.formatDate(new Date(), TZ, "yyyy/MM");
  var byDay = {};
  rows("hyg").forEach(function(r){
    var d = fmtDate(r["日付"]); if (d.slice(0,7)!==ym) return;
    var o = byDay[d] = byDay[d] || {date:d, health:[], temps:null, tempsBy:"", kitchen:null, hall:null, kitchenBy:"", hallBy:"", kitchenItems:[], hallItems:[], actions:[]};
    var items = String(r["項目"]||"").split("、").filter(Boolean);
    if (r["対応"]) o.actions.push(r["名前"]+": "+r["対応"]);
    if (r["区分"]==="出勤"){
      o.health.push({name:r["名前"], ok: items.some(function(x){ return x.indexOf("体調")===0; }) && items.some(function(x){ return x.indexOf("手指")===0; }), groom: items.filter(function(x){ return ["服","髪","髭","爪","靴","エプロン"].indexOf(x)>=0; }).length});
      var tp = {}; try { tp = JSON.parse(r["温度"]||"{}"); } catch(e){}
      if (Object.keys(tp).length){ o.temps = tp; o.tempsBy = r["名前"]; }
    } else {
      var list = r["担当"]==="厨房" ? HYG_ITEMS.kitchen : HYG_ITEMS.hall;
      var shorts = items.map(function(x){ return shortOf_(list, x); }).filter(Boolean);
      if (r["担当"]==="厨房"){ o.kitchen = shorts.length; o.kitchenBy = r["名前"]; o.kitchenItems = shorts; } else { o.hall = shorts.length; o.hallBy = r["名前"]; o.hallItems = shorts; }
    }
  });
  var days = Object.keys(byDay).sort().reverse().map(function(k){ return byDay[k]; });
  var rev = rows("hygrev").filter(function(r){ return revYm_(r["年月"])===ym; }).map(function(r){ return {result:r["結果"], note:r["内容"], by:r["確認者"], at:String(r["日時"]||"").slice(0,16)}; })[0] || null;
  var st = settings();
  return ok({ym:ym, days:days, kitchen_ids: kitchenIds_(), items: HYG_ITEMS, review: rev,
    store: {name: st.store_name||"", address: ensureSetting_("store_address","店舗所在地（衛生管理計画に記載）","東京都千代田区神田淡路町一丁目15番地 塚崎ビル1階"), manager: ensureSetting_("food_hygiene_manager","食品衛生責任者の氏名（衛生管理計画に記載）","長下 佳奈"), permit: ensureSetting_("permit_no","飲食店営業許可番号（衛生管理計画に記載）","3千千保生食許第1458号"), operator: ensureSetting_("operator_name","営業者（許可書の名義）","長下 佳奈"), permit_until: ensureSetting_("permit_until","営業許可の有効期限","令和9年12月31日"), office: ensureSetting_("health_office","所轄保健所・担当","千代田保健所 生活衛生課 食品監視指導係（神田） 03-5211-8168")},
    closed_dow: String(st.closed_dow||"0,6"), holidays: String(st.holidays||"")});
};
function revYm_(v){ return (v instanceof Date) ? Utilities.formatDate(v, TZ, "yyyy/MM") : String(v||"").slice(0,7); }
ADMIN.hyg_review_save = function(p, me){
  var ym = String(p.ym||""); if (!/^\d{4}\/\d{2}$/.test(ym)) return err("年月が不正です");
  var result = p.result==="問題あり" ? "問題あり" : "問題なし"; var note = String(p.note||"").slice(0,400);
  var cur = rows("hygrev").filter(function(r){ return revYm_(r["年月"])===ym; })[0];
  writeRow("hygrev", {"年月":"'"+ym, "結果":result, "内容":note, "確認者":me.staff["名前"], "日時":nowStr()}, cur ? cur._row : null);
  audit(me.staff.staff_id, "hyg_review", ym, result);
  try { hygArchive_(ym, me); } catch(e){}
  return ok();
};

// 管理: 指定スタッフ・指定日のテスト記録を削除（勤怠・衛生・空気）。必ず件数を返し、監査ログに残す
ADMIN.purge_day = function(p, me){
  var sid = String(p.staff_id||""), d = fmtDate(p.date||""); if (!sid || !/^\d{4}\/\d{2}\/\d{2}$/.test(d)) return err("staff_id と日付が必要です");
  var keys = Array.isArray(p.sheets) ? p.sheets : ["att","hyg","mood"]; var res = {};
  keys.forEach(function(k){
    if (["att","hyg","mood"].indexOf(k)<0) return;
    var hit = rows(k).filter(function(r){ return r.staff_id===sid && fmtDate(r["日付"])===d; }).map(function(r){ return r._row; }).sort(function(a,b){ return b-a; });
    if (!p.dry) hit.forEach(function(rw){ sh(k).deleteRow(rw); });
    uncache(k); res[k] = hit.length;
  });
  if (!p.dry){ audit(me.staff["名前"], "purge_day", sid+" "+d, JSON.stringify(res)); try { if (ADMIN.labor_rebuild) ADMIN.labor_rebuild({}, me); } catch(e){} }
  return ok({deleted: res, dry: !!p.dry});
};

// ───────────────────────── 衛生記録の保存（Googleドライブ） ─────────────────────────
// フォルダ構成: 洋食オリオン_衛生管理（HACCP）/ 01_衛生管理計画 / 02_月次記録/YYYY / 03_納品書（受入確認） / 04_営業許可・届出
var HYG_DIRS = ["01_衛生管理計画","02_月次記録","03_納品書（受入確認）","04_営業許可・届出"];
function hygRoot_(){
  var id = settings().hyg_folder_id, f = null;
  if (id){ try { f = DriveApp.getFolderById(id); if (f.isTrashed()) f = null; } catch(e){ f = null; } }
  if (!f){
    f = DriveApp.createFolder("洋食オリオン_衛生管理（HACCP）");
    f.setDescription("HACCPの考え方を取り入れた衛生管理の計画書・月次記録・納品書・許可書の保管場所。記録は1年以上保存する。ORION STAFFが自動で作成・更新します。");
    var cur = rows("settings").filter(function(r){ return r.key==="hyg_folder_id"; })[0];
    if (cur) setCell("settings", cur._row, "value", f.getId()); else writeRow("settings", {key:"hyg_folder_id", value:f.getId(), "説明":"衛生管理（HACCP）の保管フォルダID（自動作成）"});
  }
  HYG_DIRS.forEach(function(n){ if (!f.getFoldersByName(n).hasNext()) f.createFolder(n); });
  return f;
}
function hygSub_(root, name){ var it = root.getFoldersByName(name); return it.hasNext() ? it.next() : root.createFolder(name); }
function hygReplaceFile_(folder, name, blob){
  var it = folder.getFilesByName(name); while (it.hasNext()) it.next().setTrashed(true);
  return folder.createFile(blob.setName(name));
}
function hgE_(s){ return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }
var HG_CSS = "body{font-family:sans-serif;color:#111;font-size:10px} h1{font-size:16px;margin:0 0 2px} h2{font-size:12px;margin:10px 0 4px;border-left:4px solid #2c4f39;padding-left:6px} .sub{font-size:9px;color:#555;margin-bottom:6px} table{width:100%;border-collapse:collapse} th,td{border:1px solid #444;padding:3px;vertical-align:top;font-size:9px} th{background:#eef2ee} .rec th,.rec td{text-align:center;padding:1px;font-size:7.5px} .rec td.n{text-align:left} .off td{background:#f2f2f2;color:#888} .ng{color:#b00;font-weight:bold}";
function hygPlanHtml_(h){
  var s = h.store, Y = h.ym.slice(0,4), M = Number(h.ym.slice(5,7));
  var rowsA = [
    ["①原材料の受入の確認","納品時","外観・におい・包装の状態、表示（期限・保存方法）、冷蔵・冷凍品の温度を確認する","返品・交換する。使用しない","納品書に確認者が署名し、03_納品書に保管"],
    ["②冷蔵・冷凍庫の温度の確認","毎日（出勤時）","庫内温度計で確認する。冷蔵10℃以下、冷凍−15℃以下（冷蔵庫1台・冷凍庫1台・冷蔵冷凍庫1台）","原因（扉・詰め過ぎ・故障）を確認して対処し、再確認する。食材の状態を確認し、必要なら廃棄。対応を記録する","勤怠アプリ（出勤チェック）"],
    ["③交差汚染・二次汚染の防止","毎日","冷蔵庫内で生の肉・卵と調理済み品（ソース・茹で麺）を分け、容器・ラップで保管する。床に直接置かない","汚染の恐れのある食品は廃棄する。保管場所を見直す","勤怠アプリ（退勤・厨房）"],
    ["④器具等の洗浄・消毒・殺菌","毎日（使用後）","まな板・包丁・ボウル・トング等を洗剤で洗い、アルコール・熱湯等で消毒する。食器は洗浄・乾燥して収納する","汚れが残っていれば再度洗浄・消毒する","勤怠アプリ（退勤）"],
    ["⑤トイレの洗浄・消毒","毎日（営業後）","便座・ドアノブ・水洗レバー・手すりを洗剤で清掃し、消毒する","再度清掃・消毒する","勤怠アプリ（退勤・客席）"],
    ["⑥従業員の健康管理等","毎日（出勤時）","下痢・嘔吐・発熱等の症状、手指の傷の有無を確認する。服・髪・髭・爪・靴・エプロンの身だしなみを確認する","症状がある者は調理作業に従事させない。手指に傷がある場合は手袋を着用する","勤怠アプリ（出勤チェック）"],
    ["⑦手洗いの実施","作業前・トイレの後・生の食材を扱った後・盛付けの前","石けんで洗浄し、ペーパーで拭いて消毒する。手洗い場の石けん・ペーパーを切らさない","気づいた時点で直ちに洗い直す","勤怠アプリ（退勤）"]];
  var rowsB = [
    ["第1グループ（非加熱のもの）","瓶ドリンク・瓶ビール（開栓して提供）","冷蔵庫で保管し、提供直前に開栓する","破損・異物があれば提供しない"],
    ["第2グループ（加熱してすぐ提供）","目玉焼き、ハンバーグ、ミートコロッケ、ウィンナー","中心まで十分に加熱する（焼き色、肉汁が透明、卵白が固まっていることを目で確認）","加熱を延長する"],
    ["第3グループ（加熱後冷却し再加熱）","ナポリタンソース（仕込み）、茹で麺（仕込み）、オリオン／ナシナシ","仕込み後は小分け・浅い容器で速やかに冷まし、冷蔵保存する。提供時はソースを沸騰するまで、麺を中まで温まるまで再加熱する","冷却が遅れたもの・保存期間を過ぎたものは廃棄する。再加熱が不十分なら加熱を延長する"]];
  var meta = [["店舗名",s.name],["所在地",s.address],["営業者",s.operator],["営業許可番号（有効期限）",s.permit+(s.permit_until?"（"+s.permit_until+"まで）":"")],["食品衛生責任者",s.manager],["所轄保健所",s.office],["作成日",Y+"年"+M+"月"]];
  var html = "<html><head><meta charset='utf-8'><style>"+HG_CSS+"</style></head><body>";
  html += "<h1>衛生管理計画（HACCPの考え方を取り入れた衛生管理）</h1><div class='sub'>小規模な一般飲食店事業者向けの手引書の様式を参考に作成</div>";
  html += "<table>"+meta.map(function(m){ return "<tr><th style='width:24%;text-align:left'>"+m[0]+"</th><td>"+hgE_(m[1])+"</td></tr>"; }).join("")+"</table>";
  html += "<h2>1. 一般衛生管理のポイント</h2><table><tr><th>項目</th><th>いつ</th><th>どのように</th><th>問題があったとき</th><th>記録</th></tr>"+rowsA.map(function(r){ return "<tr>"+r.map(function(c){ return "<td>"+c+"</td>"; }).join("")+"</tr>"; }).join("")+"</table>";
  html += "<h2>2. 重要管理のポイント</h2><table><tr><th>分類</th><th>メニュー</th><th>チェック方法</th><th>問題があったとき</th></tr>"+rowsB.map(function(r){ return "<tr>"+r.map(function(c){ return "<td>"+c+"</td>"; }).join("")+"</tr>"; }).join("")+"</table>";
  html += "<h2>3. 記録と保存</h2><table><tr><td>・上記の確認は、出勤時・退勤時に勤怠アプリで毎日記録する（記録者・日時は自動で残る）。<br>・月に1回、記録表を確認し、問題の有無と改善点を記録する。<br>・計画書・月次記録表・納品書・許可書は Googleドライブ「洋食オリオン_衛生管理（HACCP）」に保管し、1年以上保存する。月次記録表は毎月1日に前月分が自動で保存される。<br>・メニューや設備を変えた時は本計画を見直す。</td></tr></table>";
  return html + "</body></html>";
}
function hygRecordHtml_(h){
  var Y = Number(h.ym.slice(0,4)), M = Number(h.ym.slice(5,7)), last = new Date(Y, M, 0).getDate();
  var closed = String(h.closed_dow||"").split(",").map(Number), hol = String(h.holidays||"").split(",").map(function(x){ return x.trim(); });
  var by = {}; h.days.forEach(function(d){ by[d.date] = d; });
  var K = h.items.kitchen, HL = h.items.hall, YO = ["日","月","火","水","木","金","土"];
  var TLm = {fridge:10, freezer:-15, combo_r:10, combo_f:-15};
  var body = "";
  for (var d=1; d<=last; d++){
    var ds = Y+"/"+("0"+M).slice(-2)+"/"+("0"+d).slice(-2), dw = new Date(Y, M-1, d).getDay(), r = by[ds];
    if ((closed.indexOf(dw)>=0 || hol.indexOf(ds)>=0) && !r){ body += "<tr class='off'><td>"+d+"</td><td>"+YO[dw]+"</td><td colspan='"+(6+K.length+HL.length)+"'>定休日</td><td></td></tr>"; continue; }
    var t = (r && r.temps) || {};
    var tc = function(k){ var v = t[k]; if (v===undefined) return "<td></td>"; return "<td class='"+(v>TLm[k]?"ng":"")+"'>"+v+"</td>"; };
    var hl = r && r.health.length ? (r.health.filter(function(x){ return x.ok; }).length+"/"+r.health.length) : "";
    var mk = function(arr, list, has){ return list.map(function(x){ return "<td>"+(has==null?"":(arr.indexOf(x[1])>=0?"○":"<span class='ng'>×</span>"))+"</td>"; }).join(""); };
    var names = []; if (r){ r.health.forEach(function(x){ if (names.indexOf(x.name)<0) names.push(x.name); }); [r.kitchenBy, r.hallBy].forEach(function(n){ if (n && names.indexOf(n)<0) names.push(n); }); }
    body += "<tr><td>"+d+"</td><td>"+YO[dw]+"</td><td>"+hl+"</td>"+tc("fridge")+tc("freezer")+tc("combo_r")+tc("combo_f")+mk(r?r.kitchenItems:[],K,r?r.kitchen:null)+mk(r?r.hallItems:[],HL,r?r.hall:null)+"<td class='n'>"+(r?hgE_(r.actions.join(" / ")):"")+"</td><td class='n'>"+hgE_(names.join("・"))+"</td></tr>";
  }
  var rv = h.review;
  var html = "<html><head><meta charset='utf-8'><style>"+HG_CSS+"</style></head><body>";
  html += "<h1>衛生管理記録表　"+Y+"年"+M+"月</h1><div class='sub'>"+hgE_(h.store.name)+"　／　○＝実施　×＝未実施　空欄＝記録なし　／　温度の赤字＝基準外（冷蔵10℃超・冷凍−15℃超）</div>";
  html += "<table class='rec'><tr><th rowspan='2'>日</th><th rowspan='2'>曜</th><th rowspan='2'>健康<br>OK/人</th><th colspan='4'>庫内温度（℃）</th><th colspan='"+K.length+"'>厨房</th><th colspan='"+HL.length+"'>客席</th><th rowspan='2'>特記事項（基準外の対応）</th><th rowspan='2'>記録者</th></tr>";
  html += "<tr><th>冷蔵</th><th>冷凍</th><th>冷冷蔵</th><th>冷冷凍</th>"+K.map(function(x){ return "<th>"+x[1]+"</th>"; }).join("")+HL.map(function(x){ return "<th>"+x[1]+"</th>"; }).join("")+"</tr>"+body+"</table>";
  html += "<table style='margin-top:6px'><tr><th style='width:14%'>月の振り返り</th><td style='width:12%'>"+(rv?hgE_(rv.result):"未記録")+"</td><th style='width:8%'>内容</th><td>"+(rv?hgE_(rv.note):"")+"</td><th style='width:8%'>確認者</th><td style='width:16%'>"+(rv?hgE_(rv.by)+" "+String(rv.at).slice(0,10):"")+"</td></tr></table>";
  html += "<div class='sub' style='margin-top:4px'>項目：" + K.map(function(x){ return x[1]+"＝"+x[0]; }).join("、")+"／"+HL.map(function(x){ return x[1]+"＝"+x[0]; }).join("、") + "</div>";
  return html + "</body></html>";
}
function hygArchive_(ym, me){
  var h = ADMIN.hyg_month({ym: ym}, me); if (!h.ok) return h;
  var root = hygRoot_(), Y = ym.slice(0,4), tag = ym.replace("/","-");
  var recDir = hygSub_(hygSub_(root, "02_月次記録"), Y), planDir = hygSub_(root, "01_衛生管理計画");
  var recPdf = Utilities.newBlob(hygRecordHtml_(h), "text/html", "r.html").getAs("application/pdf");
  var planPdf = Utilities.newBlob(hygPlanHtml_(h), "text/html", "p.html").getAs("application/pdf");
  var f1 = hygReplaceFile_(recDir, "衛生管理記録表_"+tag+".pdf", recPdf);
  hygReplaceFile_(planDir, "衛生管理計画_最新.pdf", planPdf.copyBlob());
  hygReplaceFile_(planDir, "衛生管理計画_"+tag+".pdf", planPdf);
  // 元データ（CSV）も一緒に残す
  var K = h.items.kitchen, HL = h.items.hall;
  var lines = [["日付","健康チェック","冷蔵庫℃","冷凍庫℃","冷蔵冷凍庫(冷蔵)℃","冷蔵冷凍庫(冷凍)℃"].concat(K.map(function(x){ return "厨房:"+x[1]; }), HL.map(function(x){ return "客席:"+x[1]; }), ["基準外の対応","記録者"]).join(",")];
  h.days.slice().reverse().forEach(function(d){ var t = d.temps||{}; lines.push([d.date, d.health.map(function(x){ return x.name+(x.ok?"OK":"要確認"); }).join(" "), t.fridge==null?"":t.fridge, t.freezer==null?"":t.freezer, t.combo_r==null?"":t.combo_r, t.combo_f==null?"":t.combo_f].concat(K.map(function(x){ return d.kitchen==null?"":(d.kitchenItems.indexOf(x[1])>=0?"○":"×"); }), HL.map(function(x){ return d.hall==null?"":(d.hallItems.indexOf(x[1])>=0?"○":"×"); }), ['"'+d.actions.join(" / ").replace(/"/g,'""')+'"', [d.kitchenBy, d.hallBy].filter(Boolean).join("・")]).join(",")); });
  hygReplaceFile_(recDir, "衛生管理記録_"+tag+"_データ.csv", Utilities.newBlob("﻿"+lines.join("\n"), "text/csv"));
  var cur = rows("settings").filter(function(r){ return r.key==="hyg_archived"; })[0], val = ym+" "+nowStr();
  if (cur) setCell("settings", cur._row, "value", val); else writeRow("settings", {key:"hyg_archived", value:val, "説明":"衛生記録を最後にドライブへ保存した月と日時（自動）"});
  return ok({folder: root.getUrl(), record: f1.getUrl(), ym: ym});
}
ADMIN.hyg_archive = function(p, me){
  var ym = String(p.ym||""); if (!/^\d{4}\/\d{2}$/.test(ym)) return err("年月が不正です");
  var r = hygArchive_(ym, me); if (r.ok) audit(me.staff["名前"], "hyg_archive", ym, ""); return r;
};
ADMIN.hyg_folder = function(p, me){
  var root = hygRoot_(); hygHygTrigger_();
  return ok({folder: root.getUrl(), subs: HYG_DIRS.map(function(n){ return {name:n, url: hygSub_(root, n).getUrl()}; }), archived: settings().hyg_archived||""});
};
// 毎月1日 6時に前月分を自動保存（トリガーは hyg_folder を開いた時に1つだけ作る）
function hygHygTrigger_(){
  var has = ScriptApp.getProjectTriggers().some(function(t){ return t.getHandlerFunction()==="hygMonthlyJob"; });
  if (!has) ScriptApp.newTrigger("hygMonthlyJob").timeBased().onMonthDay(1).atHour(6).inTimezone(TZ).create();
}
function hygMonthlyJob(){
  var d = new Date(); d.setDate(0); var ym = Utilities.formatDate(d, TZ, "yyyy/MM");
  var me = {staff: {staff_id:"system", "名前":"自動保存"}};
  hygArchive_(ym, me); audit("自動保存", "hyg_archive", ym, "monthly");
}

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
  return ok({notices:notices, unread: notices.filter(function(n){ return !n.read; }).length, notes: open.concat(done), openCount: open.length, moodToday: moodToday_(id), kitchen: kitchenIds_().indexOf(id)>=0, pilot: pilotIds_().indexOf(id)>=0});
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
  var since = rows("mood").map(function(r){ return fmtDate(r["日付"]); }).sort()[0] || "9999/99/99"; var pil = pilotIds_();
  var missing = rows("att").filter(function(a){ var d = fmtDate(a["日付"]); return d.slice(0,7)===ym && d>=since && pil.indexOf(a.staff_id)>=0 && fmtHM(a["退勤"]) && !answered[d+"|"+a.staff_id]; }).map(function(a){ return {date:fmtDate(a["日付"]), name:names[a.staff_id]||a.staff_id}; });
  return ok({ym:ym, list:list, missing:missing});
};

// ───────────────────────── 衛生記録（HACCP: 健康チェック・庫内温度・担当別チェック） ─────────────────────────
SHEETS.hyg = ["衛生", ["hyg_id","日付","staff_id","名前","区分","担当","項目","温度","記録日時","対応"]];
SHEETS.hygrev = ["衛生振り返り", ["年月","結果","内容","確認者","日時"]];
READ_ACTIONS["admin.hyg_month"] = 1;
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

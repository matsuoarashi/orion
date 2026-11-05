// ===== スプシの説明タブとタブの並び（11/5）。コード.gs の updateNotes をこれに置き換え済み。tidyBooks1105 はエディタから1回実行済み（分析シート・ORION_STAFF のタブを分類順に並べて色分け、説明タブを書く）
function updateNotes(){
  // 11/5 作り直し：分析シートの全タブの一覧（何が入っているか・誰が書くか・使っている画面）。rebuildAll から呼ばれても同じ内容を書き直す
  var ss = SpreadsheetApp.getActiveSpreadsheet(); var sh = ss.getSheetByName("説明") || ss.insertSheet("説明", 0);
  var G = BOOK_GROUPS_();
  var rows = [["洋食オリオン 分析シート（オリオン本店）", "", "", ""],
    ["2026/11/05 に今の使い方に合わせて書き直し。タブは下の分類の順に並べ、色で分けています。", "", "", ""],
    ["書き方：アプリ＝アプリや自動処理が書く（手で直さない）／手入力OK＝黄色のセルや表を手で直してよい／自動計算＝毎回作り直される", "", "", ""],
    ["", "", "", ""],
    ["タブ", "何が入っているか", "誰が書くか", "使っている画面"]];
  G.forEach(function(g){ rows.push(["■ " + g.name, "", "", ""]); g.tabs.forEach(function(t){ rows.push([t[0], t[1], t[2], t[3]]); }); rows.push(["", "", "", ""]); });
  rows.push(["■ 守ること", "", "", ""]);
  rows.push(["売上", "列の並びを変えない（レジアプリと連携）。商品を増やすときは Apps Script の ITEM_ORDER を直して rebuildAll", "", ""]);
  rows.push(["見出しの行", "どのタブも1行目の見出しの名前を変えない・列を消さない（アプリが見出しの名前で読み書きしている）", "", ""]);
  rows.push(["タブの名前", "変えない（アプリがタブの名前で探している）。並び順と色は変えてよい", "", ""]);
  rows.push(["勤怠・シフト・スタッフ", "別のスプレッドシート「ORION_STAFF」にある（その「説明」タブを参照）", "", ""]);
  sh.clear(); sh.getRange(1, 1, rows.length, 4).setValues(rows);
  sh.getRange(1, 1).setFontSize(14).setFontWeight("bold");
  sh.getRange(5, 1, 1, 4).setFontWeight("bold").setBackground("#2c4f39").setFontColor("#ffffff");
  for (var i = 0; i < rows.length; i++){ if (String(rows[i][0]).indexOf("■ ") === 0) sh.getRange(i+1, 1, 1, 4).setFontWeight("bold").setBackground("#e4eee7"); }
  sh.setColumnWidth(1, 150); sh.setColumnWidth(2, 460); sh.setColumnWidth(3, 110); sh.setColumnWidth(4, 230);
  sh.getRange(1, 1, rows.length, 4).setWrap(true).setVerticalAlignment("top");
}
// 分析シートのタブの分類（並び順・色・説明）。11/5
function BOOK_GROUPS_(){
  var A = "アプリ", H = "手入力OK", C = "自動計算";
  return [
    { name:"売上・来店（毎日の数字）", color:"#2c4f39", tabs:[
      ["売上", "レジアプリの会計1件ごとの記録", A, "分析・LINE配信・発注の計算"],
      ["日次集計", "日ごとの売上・食数。「天気」「備考」列だけ手で書いてよい", C + "（天気・備考は手入力OK）", "分析"],
      ["曜日別分析", "曜日ごとの平均", C, "分析"],
      ["時間帯別", "時間帯ごとの売上・食数", C, "分析"],
      ["商品別集計", "商品ごとの数。「単価」列は値上げのとき手で直す", C + "（単価は手入力OK）", "分析"],
      ["ダッシュボード", "累計の数字。「目標」欄は手で直す", C + "（目標は手入力OK）", "シートで見る用"],
      ["来店", "来店カウンター（男性・女性ボタン）の1回ごとの記録", A, "分析"],
      ["来店日次", "来店カウンターの日ごとの合計", C, "分析"],
      ["月次損益", "月ごとの売上・原価・経費・利益の概算", C, "分析（月）"],
      ["月次スナップショット", "締めた月の数字の控え（あとで数字が変わっても残る）", A, "分析（月）"]]},
    { name:"お金（締め・経費・契約）", color:"#b7791f", tabs:[
      ["レジ締め", "毎日の締め（現金・PayPay・差異）", A, "締めアプリ・分析"],
      ["PayPay取引", "PayPayの入金メールから取った取引", A, "締め・突き合わせ"],
      ["PayPay突合ログ", "PayPay取引と売上の突き合わせの結果", A, "分析"],
      ["経費", "経費の記録", A, "経費アプリ・分析"],
      ["レシート", "経費アプリで撮ったレシートの記録", A, "経費アプリ"],
      ["固定費", "家賃などの月額", H, "分析（月）"],
      ["開業費", "開業時にかかった費用", H, "分析"],
      ["人件費(STAFF)", "勤怠のスプレッドシートの日ごとの人件費の取り込み", C, "分析"],
      ["関連当事者取引", "会社と個人の立て替え・負担の記録", A, "経費・決算用"],
      ["借入契約", "借入の契約（公庫など）", H, "管理者アプリ"],
      ["借入返済", "借入の返済予定と実績", A, "管理者アプリ"],
      ["契約台帳", "賃貸・リースなどの契約と期限", A, "管理者アプリ・今朝の確認"],
      ["メール取引先", "メールから取り込む取引先の決まり（差出人・件名）", H, "メールの取り込み"],
      ["メール候補", "メールから見つけた請求・領収の候補", A, "管理者アプリ"],
      ["訂正ログ", "売上や記録を直したときの記録", A, "あとで確かめる用"],
      ["確認済み", "今朝の確認などで「確認した」とした項目", A, "今朝の確認"]]},
    { name:"発注・在庫・仕込み", color:"#3b6e8f", tabs:[
      ["購入品目", "品目の一覧（仕入先・単位・使用量・現在庫・発注の決まり）", A + "（管理者アプリで編集）", "発注・棚卸し"],
      ["在庫記録", "棚卸し・納品・買ってきた物の記録", A, "発注・棚卸し"],
      ["発注", "頼んだ物と納品の記録", A, "発注"],
      ["備品報告", "不足・破損の報告", A, "発注・現場から"],
      ["仕込み", "仕込んだときの「今ある数」（麺・ソース）", A, "発注・仕込み"],
      ["仕入先", "発注先の一覧（注文方法・連絡先）", H, "発注先一覧"],
      ["仕入価格", "仕入先ごとの価格", A + "（管理者アプリで編集）", "品目と価格・原価"]]},
    { name:"現場・人", color:"#7a5c99", tabs:[
      ["やること", "期限付きのやること（担当・期限・済み）", A, "分析・勤怠アプリ"],
      ["出来事", "今日の出来事と、退勤時の「今日の報告」（元＝退勤の報告）", A, "分析・スタッフ管理の連絡"],
      ["習熟", "スタッフごとの覚えたこと", A, "覚えること"],
      ["応募者", "採用の応募者", A, "採用"],
      ["求人票", "求人の文面と媒体", A, "採用"]]},
    { name:"オリオンに聞く・決まりごと", color:"#a33c2e", tabs:[
      ["Knowledge", "現場の決まりごと（質問と答え。承認したものだけ使う）", A + "（覚えることで編集）", "オリオンに聞く"],
      ["Facts", "店の基本情報（営業時間・席数など）", A, "オリオンに聞く"],
      ["未回答質問", "答えられなかった質問", A, "覚えること"],
      ["AIログ", "オリオンに聞くの質問と答えの記録", A, "あとで確かめる用"],
      ["決裁権限", "誰が何を決めるか", H, "オリオンに聞く"],
      ["決裁ログ", "決めたことの記録", A, "管理者アプリ"]]},
    { name:"お客様・集客", color:"#4f7a4f", tabs:[
      ["口コミ", "Googleの口コミと返信（Google連携後に入る）", A, "口コミ"],
      ["Googleの数字", "Googleマップの表示・電話・ルートの数（Google連携後に入る）", A, "口コミ"],
      ["LINE配信先", "公式LINEで数字を受け取る人", A + "（設定で編集）", "設定"],
      ["注文設定", "持ち帰り注文サイトの受付のON/OFF", H, "注文サイト"],
      ["注文", "持ち帰り注文サイトからの注文", A, "注文サイト"]]}
  ];
}
// 11/5：タブを分類の順に並べ、色を付ける。勤怠のスプレッドシート（ORION_STAFF）も同じように整え、「シート1」（空）を「説明」にする。エディタから1回実行
function tidyBooks1105(){
  var ss = SpreadsheetApp.getActiveSpreadsheet(); updateNotes();
  var order = ["説明"]; var color = {"説明":"#1f3a2a"};
  BOOK_GROUPS_().forEach(function(g){ g.tabs.forEach(function(t){ order.push(t[0]); color[t[0]] = g.color; }); });
  var pos = 1; order.forEach(function(n){ var sh = ss.getSheetByName(n); if (!sh) return; ss.setActiveSheet(sh); ss.moveActiveSheet(pos++); sh.setTabColor(color[n]); });
  // 一覧にないタブ（あれば）は最後に灰色で
  ss.getSheets().forEach(function(sh){ if (order.indexOf(sh.getName()) < 0){ sh.setTabColor("#9e9e9e"); } });
  ss.setActiveSheet(ss.getSheetByName("説明")); ss.moveActiveSheet(1);
  // ORION_STAFF
  var st = SpreadsheetApp.openById("1L4Y4tIFWfmUTSvngiXNd-Afxq1IqAwmAZNIUM2qyBD8");
  var s1 = st.getSheetByName("シート1"); if (s1 && s1.getLastRow() === 0 && !st.getSheetByName("説明")) s1.setName("説明");
  var ex = st.getSheetByName("説明") || st.insertSheet("説明", 0);
  var SG = [
    { name:"人・設定", color:"#2c4f39", tabs:[["スタッフ","スタッフの一覧（名前・役割・時給など）","管理者アプリ"],["機密","給与振込口座（管理者だけ）","管理者アプリ"],["設定","アプリの設定（厨房の人 kitchen_ids・必要人数の決まり など）","管理者アプリの設定"],["セッション","ログインの記録（触らない）","アプリ"]]},
    { name:"シフト", color:"#3b6e8f", tabs:[["希望シフト","スタッフが出した希望","勤怠アプリ"],["確定シフト","決まったシフト（Googleカレンダーと同期）","管理者アプリ"],["必要人数","日ごとの必要人数・休み（未設定は2人）","管理者アプリ"]]},
    { name:"勤怠・給与", color:"#b7791f", tabs:[["勤怠","出勤・退勤の記録","勤怠アプリ"],["修正申請","打刻の直しの申請と承認","勤怠アプリ・管理者アプリ"],["月次締め","月ごとの給与の締め","管理者アプリ"],["人件費日次","日ごとの人件費（退勤時に書く）","アプリ"]]},
    { name:"衛生（HACCP）", color:"#4f7a4f", tabs:[["衛生","出勤時の健康・温度、退勤時のチェック","勤怠アプリ"],["衛生振り返り","月ごとの振り返り（保健所の確認項目）","管理者アプリの勤怠タブ"]]},
    { name:"連絡", color:"#7a5c99", tabs:[["お知らせ","運営からのお知らせと既読","管理者アプリの連絡"],["引き継ぎ","引き継ぎノート","勤怠アプリ・管理者アプリの連絡"],["空気","退勤時のふりかえり（11/5で終了。今は分析シートの「出来事」に「退勤の報告」として入る）","使っていない（記録として残す）"]]},
    { name:"記録", color:"#9e9e9e", tabs:[["監査ログ","アプリでの操作の記録（触らない）","アプリ"]]}
  ];
  var rows = [["洋食オリオン 勤怠・スタッフ（ORION_STAFF）",""," "],["2026/11/05 に整理。アプリ（勤怠アプリ・管理者アプリ）が書くタブばかりなので、タブ名と1行目の見出しは変えないこと。毎日2:05にドライブ「ORION_STAFF_backup」へ自動バックアップ","",""],["","",""],["タブ","何が入っているか","使っている画面"]];
  SG.forEach(function(g){ rows.push(["■ " + g.name,"",""]); g.tabs.forEach(function(t){ rows.push(t); }); rows.push(["","",""]); });
  ex.clear(); ex.getRange(1,1,rows.length,3).setValues(rows); ex.getRange(1,1).setFontSize(14).setFontWeight("bold");
  ex.getRange(4,1,1,3).setFontWeight("bold").setBackground("#2c4f39").setFontColor("#ffffff");
  for (var i = 0; i < rows.length; i++){ if (String(rows[i][0]).indexOf("■ ") === 0) ex.getRange(i+1,1,1,3).setFontWeight("bold").setBackground("#e4eee7"); }
  ex.setColumnWidth(1,130); ex.setColumnWidth(2,460); ex.setColumnWidth(3,220); ex.getRange(1,1,rows.length,3).setWrap(true).setVerticalAlignment("top");
  var so = ["説明"], sc = {"説明":"#1f3a2a"}; SG.forEach(function(g){ g.tabs.forEach(function(t){ so.push(t[0]); sc[t[0]] = g.color; }); });
  var p = 1; so.forEach(function(n){ var sh = st.getSheetByName(n); if (!sh) return; st.setActiveSheet(sh); st.moveActiveSheet(p++); sh.setTabColor(sc[n]); });
  st.getSheets().forEach(function(sh){ if (so.indexOf(sh.getName()) < 0) sh.setTabColor("#9e9e9e"); });
  return "ok";
}

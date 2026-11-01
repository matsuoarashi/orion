// ===== ORION OS 台帳 第2弾：決裁ログ／契約・許認可・IP 台帳／月次スナップショット =====
// 基本原則（DD・融資・税務に耐える Evidence 設計）：
//  重要データは「出所・担当・承認者・有効日・状態・証憑リンク・更新日時」を持つ。上書きせず履歴を残す。
//  日々の運営の記録がそのまま DD 資料になる状態を目指す（後から資料を作らない）。
//  提案者（アウタ・松尾）と最終決裁者（長下）は常に別の列に分けて残す。

// 決裁ログ：提案 → 分析 → 承認 → 実施 → 結果 を1件として残す
var OS_DEC = "決裁ログ"; var OS_DEC_COLS = ["dec_id","日付","店舗","領域","件名","提案者","提案内容","分析・根拠","根拠リンク","金額","継続","承認者","承認日","判断","判断理由","実施者","実施日","結果","関連fact_id","関連rpt_id","関連契約id","状態","更新者","更新日時","登録日時"];
// 判断: 承認／却下／保留／取下げ   状態: 提案中／承認済／実施中／完了／却下   継続: 単発／月額／年額
// 契約・許認可・IP 台帳：本体は Drive。ここは索引と期限
var OS_CT = "契約台帳"; var OS_CT_COLS = ["ct_id","種別","名称","相手先","店舗","契約主体","契約日","開始日","終了日","更新期限","自動更新","金額","支払周期","保管先リンク","担当","承認者","状態","出所","メモ","更新者","更新日時","登録日時"];
// 種別: 賃貸借／仕入／FC／商標／ドメイン／レシピ・マニュアル／営業許可／雇用／保険／借入／業務委託／サービス契約   状態: 有効／申込中／終了／更新待ち
// 月次スナップショット：月末に「会社の状態」を固める。1行＝1か月、再実行で上書きせず新行（版）を追加
var OS_SNAP = "月次スナップショット"; var OS_SNAP_COLS = ["snap_id","対象月","版","作成日時","作成者","売上","食数","PayPay売上","現金売上","営業日数","固定費合計","関連当事者 未精算額","関連当事者 未精算件数","決裁件数","決裁 保留件数","Facts 変更件数","Knowledge 変更件数","未回答質問","契約 期限90日以内","未解決リスク","所感","現預金","借入残高"];
// 現預金・借入残高は自動で取れないので管理者が後から入力（空欄のまま出す）

// ---------- 読み取り（handleOsGet から呼ぶ） ----------
function osLedgerGet_(mode, me){
  if (me.role !== "admin") return { error: "管理者のみ" };
  var dump = function(name, cols){ return osRows_(name, cols).map(function(r){ var o = {}; cols.forEach(function(c){ o[c] = (r[c] instanceof Date) ? dateKey_(r[c]) : (r[c] === undefined ? "" : r[c]); }); return o; }); };
  if (mode === "os_dec") return { list: dump(OS_DEC, OS_DEC_COLS).reverse() };
  if (mode === "os_contracts") return { list: dump(OS_CT, OS_CT_COLS), alerts: osContractAlerts_(90) };
  if (mode === "os_snapshots") return { list: dump(OS_SNAP, OS_SNAP_COLS).reverse() };
  return null;
}
// 期限が近い契約（終了日／更新期限が days 日以内、または過ぎている）
function osContractAlerts_(days){
  var today = new Date(); var lim = new Date(Date.now() + days*86400000); var out = [];
  osRows_(OS_CT, OS_CT_COLS).forEach(function(r){ if (String(r["状態"]) === "終了") return;
    ["更新期限","終了日"].forEach(function(c){ var v = r[c]; if (!v) return; var d = (v instanceof Date) ? v : new Date(String(v).replace(/\//g, "-")); if (isNaN(d)) return;
      if (d <= lim) out.push({ id:r.ct_id, name:String(r["名称"]), kind:String(r["種別"]), col:c, date:dateKey_(d), overdue: d < today, auto:String(r["自動更新"]||"") }); }); });
  return out;
}

// ---------- 書き込み（handleOsPost から呼ぶ） ----------
function osDecSave_(d, me){
  if (me.role !== "admin") return { error: "管理者のみ" };
  var sh = osSheet_(OS_DEC, OS_DEC_COLS); var now = invNow_();
  if (d.id){ var r = invRows_(sh).filter(function(x){ return x.dec_id === d.id; })[0]; if (!r) return { error: "見つかりません" };
    OS_DEC_COLS.forEach(function(c){ if (d[c] !== undefined && c !== "dec_id" && c !== "登録日時") invSet_(sh, r._row, c, /日$/.test(c) || c === "日付" ? "'" + String(d[c]) : d[c]); });
    invSet_(sh, r._row, "更新者", me.name); invSet_(sh, r._row, "更新日時", now); return { ok:true, id:d.id }; }
  var id = invId_("dc_"); var o = { dec_id:id };
  OS_DEC_COLS.forEach(function(c){ if (c === "dec_id") return; var v = d[c] !== undefined ? d[c] : ""; if ((c === "日付") && !v) v = invToday_(); o[c] = (/日$/.test(c) || c === "日付") && v ? "'" + String(v) : v; });
  o["状態"] = o["状態"] || "提案中"; o["更新者"] = me.name; o["更新日時"] = now; o["登録日時"] = now;
  invAppend_(sh, o); return { ok:true, id:id };
}
function osContractSave_(d, me){
  if (me.role !== "admin") return { error: "管理者のみ" };
  var sh = osSheet_(OS_CT, OS_CT_COLS); var now = invNow_();
  if (d.id){ var r = invRows_(sh).filter(function(x){ return x.ct_id === d.id; })[0]; if (!r) return { error: "見つかりません" };
    OS_CT_COLS.forEach(function(c){ if (d[c] !== undefined && c !== "ct_id" && c !== "登録日時") invSet_(sh, r._row, c, /日$|期限$/.test(c) ? "'" + String(d[c]) : d[c]); });
    invSet_(sh, r._row, "更新者", me.name); invSet_(sh, r._row, "更新日時", now); return { ok:true, id:d.id }; }
  var id = invId_("ct_"); var o = { ct_id:id };
  OS_CT_COLS.forEach(function(c){ if (c === "ct_id") return; var v = d[c] !== undefined ? d[c] : ""; o[c] = (/日$|期限$/.test(c)) && v ? "'" + String(v) : v; });
  o["店舗"] = o["店舗"] || "kanda"; o["状態"] = o["状態"] || "有効"; o["更新者"] = me.name; o["更新日時"] = now; o["登録日時"] = now;
  invAppend_(sh, o); return { ok:true, id:id };
}

// ---------- 月次スナップショット ----------
// ym = "2026/10"。再実行すると版を上げて新しい行を足す（前の版は消さない）
function osSnapshot(ym, me){
  var ss = SpreadsheetApp.getActiveSpreadsheet(); var tz = "Asia/Tokyo";
  if (!ym) ym = Utilities.formatDate(new Date(), tz, "yyyy/MM");
  var s = { sales:0, meals:0, paypay:0, days:{} };
  try { var sv = ss.getSheetByName("売上"); var v = sv.getRange(2,1,Math.max(1,sv.getLastRow()-1),26).getValues();
    v.forEach(function(r){ var d = dateKey_(r[0]); if (!d || d.slice(0,7) !== ym) return; if (String(r[3]) === "取消") return; var a = Number(r[4])||0; s.sales += a; s.days[d] = 1; var pay = String(r[25]||""); if (/PayPay/i.test(pay)) s.paypay += a;
      var items = String(r[7]||""); var m = items.match(/(オリオン|ナシナシ)[^,、]*?[×x](\d+)/g); if (m) m.forEach(function(x){ s.meals += Number((x.match(/(\d+)$/)||[0,0])[1]); }); }); } catch(e){ s.err = String(e); }
  var fixed = 0; try { var fs = fixedSheet_(); fs.getRange(2,1,Math.max(1,fs.getLastRow()-1),3).getValues().forEach(function(r){ if (!r[0] || String(r[0]).indexOf("収入") >= 0) return; fixed += Number(r[1])||0; }); } catch(e){}
  var rptAmt = 0, rptN = 0; try { osRows_(OS_RPT, OS_RPT_COLS).forEach(function(r){ if (String(r["精算状態"]) === "未精算"){ rptN++; rptAmt += Number(r["金額(税込)"])||0; } }); } catch(e){}
  var decN = 0, decHold = 0; try { osRows_(OS_DEC, OS_DEC_COLS).forEach(function(r){ if (dateKey_(r["日付"]).slice(0,7) !== ym) return; decN++; if (String(r["判断"]) === "保留" || String(r["状態"]) === "提案中") decHold++; }); } catch(e){}
  var factN = 0; try { osRows_(OS_FACTS, OS_FACTS_COLS).forEach(function(r){ if (String(r["登録日時"]).slice(0,7) === ym) factN++; }); } catch(e){}
  var knowN = 0; try { osRows_(OS_KNOW, OS_KNOW_COLS).forEach(function(r){ if (String(r["更新日時"]).slice(0,7) === ym) knowN++; }); } catch(e){}
  var unN = 0; try { osRows_(OS_UNANS, OS_UNANS_COLS).forEach(function(r){ if (String(r["状態"]) !== "回答済") unN++; }); } catch(e){}
  var ctN = 0; try { ctN = osContractAlerts_(90).length; } catch(e){}
  var sh = osSheet_(OS_SNAP, OS_SNAP_COLS); var ver = 1; invRows_(sh).forEach(function(r){ if (String(r["対象月"]) === ym) ver = Math.max(ver, (Number(r["版"])||0) + 1); });
  var id = invId_("sn_");
  invAppend_(sh, { snap_id:id, "対象月":"'" + ym, "版":ver, "作成日時":invNow_(), "作成者": me ? me.name : "trigger", "売上":s.sales, "食数":s.meals, "PayPay売上":s.paypay, "現金売上":s.sales - s.paypay, "営業日数":Object.keys(s.days).length, "固定費合計":fixed, "関連当事者 未精算額":rptAmt, "関連当事者 未精算件数":rptN, "決裁件数":decN, "決裁 保留件数":decHold, "Facts 変更件数":factN, "Knowledge 変更件数":knowN, "未回答質問":unN, "契約 期限90日以内":ctN, "未解決リスク":"", "所感":"", "現預金":"", "借入残高":"" });
  return { ok:true, id:id, ym:ym, ver:ver, sales:s.sales, meals:s.meals, paypay:s.paypay, err:s.err||"" };
}
// 月初1日 6:00 のトリガー用（前月分）
function osSnapshotPrevMonth(){ var d = new Date(); d.setDate(0); return osSnapshot(Utilities.formatDate(d, "Asia/Tokyo", "yyyy/MM"), null); }

// ---------- 初期データ（1回だけ） ----------
function osSeedLedgers20261101(){
  var n = { ct:0, dec:0 };
  var csh = osSheet_(OS_CT, OS_CT_COLS); var cex = invRows_(csh);
  [ // 種別, 名称, 相手先, 店舗, 契約主体, 契約日, 開始日, 終了日, 更新期限, 自動更新, 金額, 支払周期, 保管先リンク, 担当, 承認者, 状態, 出所, メモ
    ["賃貸借","神田淡路町店 店舗賃貸借契約","（貸主：要記入）","kanda","長下（個人事業）","","2026/10/01","","","","176000","月額","Drive（契約書 PDF を置いたら URL を記入）","松尾","長下","有効","賃貸借契約書","家賃 176,000円/月。引渡し 10/1。更新期限は契約書で確認して記入"],
    ["営業許可","飲食店営業許可（神田淡路町店）","千代田保健所","kanda","長下","","2026/10/13","","","","0","","Drive（営業許可書 PDF。公開リポジトリには置かない）","長下","長下","有効","営業許可書","有効期限は許可書で確認して「終了日」に記入"],
    ["借入","日本政策金融公庫 開業資金","日本政策金融公庫","kanda","長下","","","","","","","月額","Drive","松尾","長下","有効","借入契約","返済額・残高は未確認（公庫の返済予定表を Drive に）"],
    ["保険","店舗保険（一括払い）","（保険会社：要記入）","kanda","長下","","","","","","","一括","Drive","松尾","長下","有効","保険証券","月額ではなく一括払い（10/31 確認）。満期日を「終了日」に"],
    ["仕入","トーホー（Order Pro）取引","株式会社トーホー","kanda","長下","","2026/10/01","","","","","都度","","長下","長下","有効","納品書・Order Pro","掛け条件・締め日は要確認"],
    ["仕入","カクヤス 取引","株式会社カクヤス","kanda","長下","","2026/10/01","","","","","都度","","長下","長下","有効","納品書","瓶ドリンク"],
    ["業務委託","アウタ → オリオン 運営支援","株式会社アウタ","kanda","長下","","2026/10/01","","","","","","Drive（契約書：要作成）","松尾","長下","申込中","口頭合意","書面がまだない。業務委託費の範囲と、立替精算との線引きを契約書に明記する（DD 対策）"],
    ["賃貸借","飯田橋 入居申込（アパホテル〈飯田橋駅南〉）","アパ株式会社","iidabashi","長下（予定）","","","","","","","","Drive（申込書類）","松尾","長下","申込中","入居申込書類","選定待ち。契約書が確認されるまで「申込中」"],
    ["ドメイン","店の独自ドメイン（予定）","","kanda","","","","","","","","年額","","松尾","長下","申込中","","orion.napolitan@gmail.com から独自ドメインへ移行の可能性あり。取得したら更新期限を記入"],
    ["商標","洋食オリオン（商標：未出願）","","kanda","","","","","","","","","","松尾","長下","申込中","","FC 展開前に出願要否を判断（決裁ログに）"]
  ].forEach(function(r){ if (cex.some(function(x){ return String(x["名称"]) === r[1]; })) return;
    var o = { ct_id:invId_("ct_") }; var cols = ["種別","名称","相手先","店舗","契約主体","契約日","開始日","終了日","更新期限","自動更新","金額","支払周期","保管先リンク","担当","承認者","状態","出所","メモ"];
    cols.forEach(function(c, i){ o[c] = (/日$|期限$/.test(c)) && r[i] ? "'" + r[i] : r[i]; }); o["更新者"] = "seed"; o["更新日時"] = invNow_(); o["登録日時"] = invNow_(); invAppend_(csh, o); n.ct++; });
  var dsh = osSheet_(OS_DEC, OS_DEC_COLS); var dex = invRows_(dsh);
  [ // 日付, 領域, 件名, 提案者, 提案内容, 分析・根拠, 金額, 継続, 承認者, 承認日, 判断, 判断理由, 実施者, 実施日, 結果, 状態
    ["2026/10/31","価格・メニュー","ナシナシハーフを 600円→700円（11/2〜）","松尾（アウタ）","ハーフ＋副菜2つで 800円となりオリオンハーフ 900円との差が小さすぎるため 700円に","10月の商品別集計・客単価","100","単発","長下","2026/10/31","承認","","松尾","2026/10/31","注文設定・レジ・予約サイト・お知らせに反映済み","完了"],
    ["2026/11/01","人事","基本勤務時間を 10:15〜15:15 → 10:30〜15:00（11月〜）","長下","営業 11〜14時に対し前後の余裕を見直す","10月の勤怠実績","","月額","長下","2026/11/01","承認","","松尾","2026/11/01","勤怠設定・11月シフト39件・お知らせに反映済み","完了"],
    ["2026/11/01","営業時間・休業","夜間貸出（月10万円、11月〜）","松尾（アウタ）","営業時間外の店舗を貸し出し収入にする","固定費シート「夜間貸出（収入）」","100000","月額","長下","","承認","","松尾","","収支に収入として計上。契約書は契約台帳へ","実施中"],
    ["2026/10/31","資金・店舗・FC・商標","飯田橋（アパホテル〈飯田橋駅南〉）への入居申込","松尾（アウタ）","2店舗目。申込書類を提出し選定待ち","申込書類・収支試算（Drive）","","","長下","","保留","選定結果待ち。契約書確認まで Facts は『申込済』","松尾","","","提案中"]
  ].forEach(function(r){ if (dex.some(function(x){ return String(x["件名"]) === r[2]; })) return;
    var cols = ["日付","領域","件名","提案者","提案内容","分析・根拠","金額","継続","承認者","承認日","判断","判断理由","実施者","実施日","結果","状態"]; var o = { dec_id:invId_("dc_") };
    cols.forEach(function(c, i){ o[c] = (/日$/.test(c) || c === "日付") && r[i] ? "'" + r[i] : r[i]; }); o["店舗"] = /飯田橋/.test(r[2]) ? "iidabashi" : "kanda"; o["根拠リンク"] = ""; o["関連fact_id"] = ""; o["関連rpt_id"] = ""; o["関連契約id"] = ""; o["更新者"] = "seed"; o["更新日時"] = invNow_(); o["登録日時"] = invNow_(); invAppend_(dsh, o); n.dec++; });
  osSheet_(OS_SNAP, OS_SNAP_COLS);
  return n;
}
// 取り付け：handleOsGet → var lg = osLedgerGet_(mode, me); if (lg) return invOut_(lg);  mode os_snapshot_run?ym= → osSnapshot
//          handleOsPost → os_dec_save / os_contract_save / os_snapshot（管理者）

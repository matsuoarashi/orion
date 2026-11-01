// ===== 在庫マスター拡張＋11/1棚卸の基準値（2026/11/01） =====
// このファイルは分析GASの末尾に追加する。同名の関数（invMaster_ / invSuggest_ / prSheet_ / prItem_）は
// 後に書いたものが有効になるため、既存コードは書き換えずにここで上書きしている。
// 発注推奨（使用量×納品日×発注倍数）は hacchu.html 側で計算する。サーバーは材料となる項目を返す。

var INV_COLS2 = INV_COLS.concat(["基準単位","入数(基準単位)","1日使用量(60食)","納品曜日","納品時刻","発注締切","発注倍数",
  "安全在庫(日)","補充周期(日)","代替仕入先","発注ルール","定期配送","在庫状態","最終棚卸日","単価状態"]);
var PR_COLS2 = PR_COLS.concat(["単価状態","税抜価格"]);

function invNum_(v){ if (v === "" || v === null || v === undefined) return null; var n = Number(String(v).replace(/[^\d.\-]/g,"")); return isNaN(n) ? null : n; }

// ---- マスター（項目を追加して返す）----
function invMaster_(){
  var sh = invSheet_(INV_ITEM_SHEET, INV_COLS2); var rows = invRows_(sh);
  rows.forEach(function(r){ if (!r.item_id){ var id = invId_("i_"); invSet_(sh, r._row, "item_id", id); r.item_id = id; } });
  return rows.filter(function(r){ return String(r["状態"]||"") !== "stop" && String(r["品目"]||"") !== ""; }).map(function(r){
    return { id: r.item_id, name: String(r["品目"]), cat: String(r["区分"]||""), supplier: String(r["仕入先"]||""), method: String(r["購入方法"]||""), spec: String(r["規格(入数など)"]||""),
      price: invNum_(r["仕入単価(税込)"]), priceState: String(r["単価状態"]||"未確認"), orderUnit: String(r["発注単位"]||""), unit: String(r["入力単位"]||""), owner: String(r["担当"]||""), freq: String(r["管理頻度"]||""),
      min: invNum_(r["最低在庫"]), mode: String(r["発注方式"]||""), lead: String(r["配送・納期"]||""), use: String(r["用途(商品)"]||""),
      stock: invNum_(r["現在庫"]), stockAt: String(r["在庫更新日時"]||""), order: Number(r["表示順"])||999, note: String(r["備考"]||""),
      baseUnit: String(r["基準単位"]||""), perPack: invNum_(r["入数(基準単位)"]), usage60: invNum_(r["1日使用量(60食)"]),
      days: String(r["納品曜日"]||""), time: String(r["納品時刻"]||""), cutoff: String(r["発注締切"]||""), mult: invNum_(r["発注倍数"]) || 1,
      safety: invNum_(r["安全在庫(日)"]), cycle: invNum_(r["補充周期(日)"]), alt: String(r["代替仕入先"]||""), rule: String(r["発注ルール"]||""),
      regular: String(r["定期配送"]||""), stockState: String(r["在庫状態"]||""), lastCount: String(r["最終棚卸日"]||"") };
  }).sort(function(a,b){ return a.order-b.order || (a.cat<b.cat?-1:1); });
}

// ---- 旧来の発注候補（最低在庫方式）。使用量・ルールを持つ品目は hacchu.html 側で計算するので除外 ----
function invSuggest_(){
  var items = invMaster_(); var open = invOpenOrders_(); var out = [];
  items.forEach(function(it){
    if (it.usage60 !== null || it.rule) return;
    if (!it.mode || it.mode === "—" || /台帳|簡易|定期/.test(it.mode)) return;
    if (it.min === null || it.stock === null) return;
    var pending = open.filter(function(o){ return o.item_id===it.id && o["状態"]==="発注済"; }).reduce(function(s,o){ return s + (Number(o["数量"])||0); }, 0);
    if (it.stock + pending >= it.min) return;
    out.push({ id: it.id, name: it.name, supplier: it.supplier, method: it.method, lead: it.lead, unit: it.unit, orderUnit: it.orderUnit, spec: it.spec, stock: it.stock, min: it.min, pending: pending,
      qty: Math.max(1, Math.ceil(it.min - it.stock - pending)), reason: "最低在庫 " + it.min + it.unit + " を下回る（現在庫 " + it.stock + (pending?"＋入荷予定 "+pending:"") + "）" });
  });
  return out;
}

// ---- 仕入価格に「単価状態（確定／旧価格／未確認）」と税抜価格を持たせる ----
function prSheet_(){ return invSheet_(PR_SHEET, PR_COLS2); }
function prItem_(r){ return { id:r.price_id, item:String(r["品目"]), supplier:String(r["仕入先"]), spec:String(r["商品名・規格"]), qty:r["内容量"]===""?null:Number(r["内容量"]), unit:String(r["単位"]), price:Number(r["税込価格"])||0,
  base:String(r["基準"]), per:r["基準単価"]===""?null:Number(r["基準単価"]), date:dateKey_(r["調査日"]), src:String(r["出典"]), memo:String(r["メモ"]),
  status:String(r["単価状態"]||"旧価格"), exTax: r["税抜価格"]===""||r["税抜価格"]===undefined ? null : Number(r["税抜価格"]) }; }

// ---- 11/1 棚卸の投入（エディタから1回実行。再実行しても同じ結果になる）----
// 品目, 仕入先, 区分, 担当, 入力単位, 発注単位, 規格, 基準単位, 入数, 1日使用量(60食), 納品曜日, 納品時刻, 発注締切, 発注倍数, 安全在庫(日), 補充周期(日), 代替仕入先, 発注ルール, 定期配送, 現在庫, 在庫状態, 備考, 旧名
var INV_TAKE_20261101 = [
  ["スパゲッティ(乾麺)","トーホー","食材","シェフ","袋","ケース","EB スパゲッティ イタリア産 1.7mm 3kg（5袋/ケース）","g",3000,2.19,"月水金","14:00","前日17:00",5,0.5,"","","使用量","",18,"計測済","1日の使用量は販売実績・通常/ハーフ比率から別途算出（仕込み単位「70袋・2回茹で」とは別物）",""],
  ["ケチャップ(業務用)","トーホー","食材","シェフ","袋","袋","トマトケチャップ 3kg（4袋/ケース）","g",3000,2,"月水金","14:00","前日17:00",4,0.5,"","","使用量","",12,"計測済","ケース入数は要確認（過去の納品は12本・16本）",""],
  ["トマトピューレ","トーホー","食材","シェフ","袋","ケース","カゴメ トマトピューレー 3kg（4袋/ケース）","g",3000,1,"月水金","14:00","前日17:00",4,0.5,"","","使用量","",4,"計測済","",""],
  ["マッシュルーム","トーホー","食材","シェフ","缶","ケース","マッシュルーム P&S 2号缶 454g（12缶/ケース）","g",454,2,"月水金","14:00","前日17:00",12,0.5,"","","使用量","",20,"計測済","",""],
  ["卵","トーホー","食材","シェフ","個","90個","クリーンパック M 90個入","個",1,35,"月水金","14:00","前日17:00",90,0.5,"","","使用量","",36,"計測済","90個単位で発注",""],
  ["パルメザンチーズ","トーホー","調味料","シェフ","g","袋","業務用パルメザン 1kg（卓上ボトルへ詰替）","g",1000,"","月水金","14:00","前日17:00",1,"","","","手動","",1200,"計測済","在庫は80g×15本（消化用）。今後は1kgを詰め替え。詰替量の記録は今後",""],
  ["ハンバーグ","肉のハナマサ","食材","シェフ","個","袋","直火焼きハンバーグ 60g×26個","個",1,50,"月木","14:00","電話",26,0.5,"","","定期","月:104,木:104",100,"計測済","定期配送（電話で設定済み）。実績を見て4袋＋4袋から調整",""],
  ["タバスコ(赤)","肉のハナマサ","調味料","ホール","本","本","タバスコ（卓上用）","本",1,"","","","電話",1,"","","","予備本数:6","",2,"計測済","予備の本数（卓上に出ている分は含まない）",""],
  ["タバスコ(緑)","肉のハナマサ","調味料","ホール","本","本","タバスコ 緑（卓上用）","本",1,"","","","電話",1,"","","","予備本数:6","",1,"計測済","予備の本数（卓上に出ている分は含まない）",""],
  ["玉ねぎ","業務スーパー店頭","食材","シェフ","袋","袋","スライス玉ねぎ 500g","g",500,4,"","","店頭",1,0.5,3,"業務スーパーONLINE","使用量","",24,"計測済","",""],
  ["ピーマン","業務スーパー店頭","食材","シェフ","袋","袋","千切りピーマン 500g","g",500,2,"","","店頭",1,0.5,3,"業務スーパーONLINE","使用量","",10,"計測済","",""],
  ["ミートコロッケ","業務スーパー店頭","食材","シェフ","個","袋","ミートコロッケ 60g×10個","個",1,50,"","","店頭",10,0.5,3,"業務スーパーONLINE","使用量","",150,"計測済","",""],
  ["お徳用ウィンナー","業務スーパー店頭","食材","シェフ","袋","袋","徳用ウインナー 800g","g",800,2,"","","店頭",1,0.5,3,"業務スーパーONLINE","使用量","",7,"計測済","",""],
  ["デミグラスソース","業務スーパー店頭","食材","シェフ","袋","袋","デミグラスソース 1kg","g",1000,1,"","","店頭",1,0.5,3,"業務スーパーONLINE","使用量","",10,"計測済","継ぎ足し運用（1日1袋）",""],
  ["コンデンスクリーム","業務スーパー店頭","食材","シェフ","個","個","コンデンスクリーム 1,284g","g",1284,"","","","店頭",1,"","","業務スーパーONLINE","","",4,"計測済","1日の使用量は未設定","コンデンスミルク"],
  ["ダシダ(牛肉だし)","業務スーパー店頭","食材","シェフ","袋","袋","牛肉ダシダ 1kg","g",1000,"","","","店頭",1,"","","業務スーパーONLINE","","","","未計測","開封済み1袋（残量未計測）",""],
  ["なめらかママソフト","業務スーパー店頭","食材","シェフ","個","個","ママソフト 360g","g",360,1,"","","店頭",1,0.5,3,"業務スーパーONLINE","使用量","",1,"一部未計測","未開封1個＋開封済み1個（開封分の残量は未計測。在庫は未開封分のみで計算）",""],
  ["粗挽き胡椒","業務スーパー店頭","調味料","ホール","本","本","粗挽き胡椒 200g","g",200,"","","","店頭",1,"","","業務スーパーONLINE","","","","未計測","未棚卸",""]
];

// 価格：品目, 仕入先, 商品名・規格, 内容量, 単位, 税込価格, 税抜価格, 調査日, 出典, メモ, 単価状態
var PR_TAKE_20261101 = [
  // 価格データは非公開（11/5 公開リポジトリから削除。Drive「オリオン 原価・仕入価格（非公開）」）。invApply20261101 は実行済み
];

function invApply20261101(){
  var at = "2026/11/01 12:00:00", day = "2026/11/01"; var res = { upd:0, add:0, log:0, prNew:0, prUpd:0 };
  var sh = invSheet_(INV_ITEM_SHEET, INV_COLS2); var rows = invRows_(sh); var byName = {}; rows.forEach(function(r){ byName[String(r["品目"]).trim()] = r; });
  var log = invSheet_(INV_LOG_SHEET, INV_LOG_COLS); var logged = {};
  invRows_(log).forEach(function(r){ if (String(r["種別"]) === "棚卸" && String(r["日付"]).indexOf(day) === 0) logged[String(r.item_id)] = true; });
  var keys = ["仕入先","区分","担当","入力単位","発注単位","規格(入数など)","基準単位","入数(基準単位)","1日使用量(60食)","納品曜日","納品時刻","発注締切","発注倍数","安全在庫(日)","補充周期(日)","代替仕入先","発注ルール","定期配送","現在庫","在庫状態","備考"];
  INV_TAKE_20261101.forEach(function(t, i){
    var name = t[0]; var r = byName[name] || (t[22] ? byName[t[22]] : null); var vals = {}; keys.forEach(function(k, j){ vals[k] = t[j+1]; });
    vals["在庫更新日時"] = at; vals["最終棚卸日"] = day; vals["状態"] = "active"; vals["最終更新日"] = day; vals["購入方法"] = t[12] === "店頭" ? "店頭購入" : (t[12] === "電話" ? "電話" : "TOHOオーダーシステム");
    vals["配送・納期"] = t[10] ? (t[10] + " " + t[11] + "納品・締切 " + t[12]) : "店頭（即日）";
    vals["発注方式"] = t[18] === "定期" ? "定期(月4袋・木4袋)" : (t[18] || "手動");
    var id;
    if (r){ if (String(r["品目"]) !== name) invSet_(sh, r._row, "品目", name); Object.keys(vals).forEach(function(k){ invSet_(sh, r._row, k, vals[k]); }); id = r.item_id; res.upd++; }
    else { var obj = { "品目": name, item_id: invId_("i_"), "表示順": 900 + i }; Object.keys(vals).forEach(function(k){ obj[k] = vals[k]; }); invAppend_(sh, obj); id = obj.item_id; res.add++; }
    if (!logged[id]){ invAppend_(log, { "日時": at, "日付": day, item_id: id, "品目": name, "種別": "棚卸", "数量": t[19] === "" ? "" : t[19], "状態": t[20], "担当": t[3], "記録者": "松尾（11/1棚卸）", "備考": t[21] }); res.log++; }
  });
  // 価格：既存行は「旧価格」に。確定分は一致する行を更新、無ければ追加
  var ps = prSheet_(); var prs = invRows_(ps);
  prs.forEach(function(r){ if (!r["単価状態"]) invSet_(ps, r._row, "単価状態", "旧価格"); });
  PR_TAKE_20261101.forEach(function(p){
    var hit = prs.filter(function(r){ return String(r["品目"]) === p[0] && String(r["仕入先"]) === p[1] && (String(r["商品名・規格"]) === p[2] || (p[0] === "スパゲッティ(乾麺)" && /3kg/.test(r["商品名・規格"])) || (p[0] === "ケチャップ(業務用)" && /3kg/.test(r["商品名・規格"])) || (p[0] === "ハンバーグ" && /8袋|26個/.test(r["商品名・規格"])) || (p[0] === "デミグラスソース" && /6個/.test(r["商品名・規格"])) || (p[0] === "コカ・コーラ ゼロ(瓶)" && /瓶/.test(r["商品名・規格"])) || (p[0] === "パルメザンチーズ" && p[2] === "パルメザンパウダー 1kg" && /1kg/.test(r["商品名・規格"]))); });
    var c = prCalc_(p[3], p[4], p[5]);
    var obj = { "品目": p[0], "仕入先": p[1], "商品名・規格": p[2], "内容量": p[3], "単位": p[4], "税込価格": p[5], "税抜価格": p[6], "基準": c.base, "基準単価": c.per, "調査日": "'" + p[7], "出典": p[8], "メモ": p[9], "単価状態": p[10], "状態": "active", "更新日時": invNow_() };
    if (hit.length){ hit.forEach(function(r, k){ if (k === 0){ Object.keys(obj).forEach(function(kk){ invSet_(ps, r._row, kk, obj[kk]); }); res.prUpd++; } else invSet_(ps, r._row, "単価状態", "旧価格"); }); }
    else { obj.price_id = invId_("pr_"); invAppend_(ps, obj); res.prNew++; }
  });
  // マスターの仕入単価は「確定」だけ入れる（旧価格は自動で現在単価にしない）
  var rows2 = invRows_(sh); var pr2 = invRows_(ps).filter(function(r){ return r["状態"] !== "削除"; });
  rows2.forEach(function(r){
    var mine = pr2.filter(function(p){ return String(p["品目"]) === String(r["品目"]) && String(r["仕入先"]).indexOf(String(p["仕入先"]).replace("店頭","")) === 0; });
    var conf = mine.filter(function(p){ return p["単価状態"] === "確定"; }).sort(function(a,b){ return String(dateKey_(b["調査日"])) > String(dateKey_(a["調査日"])) ? 1 : -1; })[0];
    if (r["品目"] === "パルメザンチーズ") conf = mine.filter(function(p){ return /1kg/.test(p["商品名・規格"]) && p["単価状態"] === "確定"; })[0] || conf;
    if (conf){ invSet_(sh, r._row, "仕入単価(税込)", Number(conf["税込価格"])); invSet_(sh, r._row, "1単位あたり", conf["基準単価"] !== "" ? conf["基準単価"] + "円/" + conf["基準"] : ""); invSet_(sh, r._row, "単価状態", "確定"); }
    else { invSet_(sh, r._row, "仕入単価(税込)", ""); invSet_(sh, r._row, "単価状態", mine.length ? "旧価格" : "未確認"); }
  });
  // 仕入先シートに納品・締切ルール
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet(); var sp = ss.getSheetByName("仕入先");
    if (sp){
      var hdr = sp.getRange(1,1,1,sp.getLastColumn()).getValues()[0].map(String);
      var sup = invSheet_("仕入先", hdr.concat(["納品曜日","納品時刻","発注締切","代替仕入先"])); var srs = invRows_(sup);
      var S = [["トーホー","TOHOオーダーシステム","月水金","14:00","納品日前日17:00",""],["肉のハナマサ","店舗へ電話（ハンバーグは月・木の定期配送）","月木","14:00","電話",""],["業務スーパー","店頭購入","","","店頭","業務スーパーONLINE"],["カクヤス","","","","",""]];
      S.forEach(function(s){ var r = srs.filter(function(x){ return String(x[hdr[0]]) === s[0]; })[0]; if (!r) return;
        if (s[1] && hdr.indexOf("発注方法") >= 0) invSet_(sup, r._row, "発注方法", s[1]); invSet_(sup, r._row, "納品曜日", s[2]); invSet_(sup, r._row, "納品時刻", s[3]); invSet_(sup, r._row, "発注締切", s[4]); invSet_(sup, r._row, "代替仕入先", s[5]); });
    }
  } catch(e){ res.supErr = String(e); }
  Logger.log(JSON.stringify(res)); return JSON.stringify(res);
}

// ---- 品目の編集（管理者）：追加した項目も保存できるようにする ----
function invMasterSave_(d, me){
  if (me.role !== "admin") return { error: "管理者のみ" };
  var sh = invSheet_(INV_ITEM_SHEET, INV_COLS2); var f = d.fields || {}; var rows = invRows_(sh);
  var allowed = INV_COLS2.filter(function(c){ return c !== "item_id"; });
  if (d.item_id){ var r = rows.filter(function(x){ return x.item_id===d.item_id; })[0]; if (!r) return { error: "見つかりません" };
    Object.keys(f).forEach(function(k){ if (allowed.indexOf(k)>=0) invSet_(sh, r._row, k, f[k]); }); invSet_(sh, r._row, "最終更新日", invToday_()); return { ok: true, item_id: d.item_id }; }
  if (!f["品目"]) return { error: "品目がありません" };
  if (rows.some(function(x){ return String(x["品目"])===String(f["品目"]); })) return { error: "同じ品目があります" };
  var obj = {}; allowed.forEach(function(k){ if (f[k]!==undefined) obj[k]=f[k]; }); obj.item_id = invId_("i_"); obj["最終更新日"] = invToday_(); obj["状態"] = obj["状態"] || "active";
  invAppend_(sh, obj); return { ok: true, item_id: obj.item_id };
}

// ---- 11/1 追加修正：ケチャップ4袋/ケース、乾麺の1日使用量（ハーフ1個＝乾麺約94g、60食で小分け70個） ----
function invFix20261101b(){
  var sh = invSheet_(INV_ITEM_SHEET, INV_COLS2); var rows = invRows_(sh); var n = 0;
  rows.forEach(function(r){
    if (r["品目"] === "ケチャップ(業務用)"){ invSet_(sh, r._row, "発注倍数", 4); invSet_(sh, r._row, "発注単位", "ケース"); invSet_(sh, r._row, "規格(入数など)", "トマトケチャップ 3kg（4袋/ケース）"); invSet_(sh, r._row, "備考", "4袋/ケース（松尾確認 11/1）"); n++; }
    if (r["品目"] === "スパゲッティ(乾麺)"){ invSet_(sh, r._row, "1日使用量(60食)", 2.19); invSet_(sh, r._row, "備考", "3kgでハーフ32個（ハーフ1個＝乾麺約94g・茹で上がり240g、フル＝ハーフ2個分）。60食の日は小分け70個＝乾麺約6.6kg（久田さん確認 11/1）"); n++; }
  });
  Logger.log("fixed " + n); return n;
}

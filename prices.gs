// ===== 仕入価格（発注アプリ hacchu.html の「マスター」用） =====
// 1品目に複数の価格行（仕入先・規格ごと）を持ち、100gあたり／1個あたりで比べられるようにする
// 取り付け: handleInvGet に inv_prices、handleInvPost に inv_price_save / inv_price_delete を追加済み
var PR_SHEET = "仕入価格";
var PR_COLS = ["price_id","品目","仕入先","商品名・規格","内容量","単位","税込価格","基準","基準単価","調査日","出典","メモ","状態","更新日時"];

function prSheet_(){ return invSheet_(PR_SHEET, PR_COLS); }
function prCalc_(qty, unit, price){
  qty = Number(qty) || 0; price = Number(price) || 0; unit = String(unit || "");
  if (!qty || !price) return { base: "", per: "" };
  if (unit === "g" || unit === "ml") return { base: "100" + unit, per: Math.round(price / qty * 100 * 10) / 10 };
  if (unit === "kg" || unit === "L") return { base: "100" + (unit === "kg" ? "g" : "ml"), per: Math.round(price / (qty * 1000) * 100 * 10) / 10 };
  return { base: "1" + unit, per: Math.round(price / qty * 10) / 10 };
}
function prItem_(r){ return { id:r.price_id, item:String(r["品目"]), supplier:String(r["仕入先"]), spec:String(r["商品名・規格"]), qty:r["内容量"]===""?null:Number(r["内容量"]), unit:String(r["単位"]), price:Number(r["税込価格"])||0, base:String(r["基準"]), per:r["基準単価"]===""?null:Number(r["基準単価"]), date:dateKey_(r["調査日"]), src:String(r["出典"]), memo:String(r["メモ"]) }; }
function prList_(){ return invRows_(prSheet_()).filter(function(r){ return r["状態"] !== "削除"; }).map(prItem_); }

function invPriceSave_(d, me){
  if (me.role !== "admin") return { error: "管理者のみ" };
  var sh = prSheet_(); var item = String(d.item || "").trim(); if (!item) return { error: "品目を入れてください" };
  var price = Number(d.price) || 0; if (!price) return { error: "価格を入れてください" };
  var c = prCalc_(d.qty, d.unit, price); var now = invNow_();
  var obj = { "品目": item, "仕入先": String(d.supplier || ""), "商品名・規格": String(d.spec || ""), "内容量": d.qty === "" || d.qty === undefined ? "" : Number(d.qty), "単位": String(d.unit || ""), "税込価格": price,
    "基準": c.base, "基準単価": c.per, "調査日": "'" + (String(d.date || invToday_()).replace(/-/g, "/")), "出典": String(d.src || me.name), "メモ": String(d.memo || ""), "状態": "active", "更新日時": now,
    "単価状態": String(d.status || "確定"), "税抜価格": (d.exTax === undefined || d.exTax === "" || d.exTax === null) ? "" : Number(d.exTax) }; // 11/1: レシート等で確かめた価格は「確定」
  if (d.id){ var r = invRows_(sh).filter(function(x){ return x.price_id === d.id; })[0]; if (!r) return { error: "見つかりません" }; obj.price_id = d.id;
    if (d.exTax === undefined && r["税抜価格"] !== undefined) obj["税抜価格"] = r["税抜価格"];
    var lc = sh.getLastColumn(); var hdr = sh.getRange(1,1,1,lc).getValues()[0].map(String); sh.getRange(r._row, 1, 1, lc).setValues([hdr.map(function(h){ return obj[h] !== undefined ? obj[h] : ""; })]); return { ok: true, id: d.id }; }
  obj.price_id = invId_("pr_"); invAppend_(sh, obj); return { ok: true, id: obj.price_id };
}
function invPriceDelete_(d, me){ if (me.role !== "admin") return { error: "管理者のみ" }; var sh = prSheet_(); var r = invRows_(sh).filter(function(x){ return x.price_id === d.id; })[0]; if (!r) return { error: "見つかりません" }; invSet_(sh, r._row, "状態", "削除"); invSet_(sh, r._row, "更新日時", invNow_()); return { ok: true }; }

// 9月の実地調査・10月の納品書から分かっている価格を入れる（エディタから1回実行。再実行しても同じ行は増えない）
function invSeedPrices20261029(){
  var S = [
    // 価格データは非公開（11/5 公開リポジトリから削除。Drive「オリオン 原価・仕入価格（非公開）」）。この関数は実行済み
  ];
  var sh = prSheet_(); var ex = invRows_(sh); var n = 0;
  S.forEach(function(s){
    if (ex.some(function(r){ return String(r["品目"])===s[0] && String(r["仕入先"])===s[1] && String(r["商品名・規格"])===s[2]; })) return;
    var c = prCalc_(s[3], s[4], s[5]);
    invAppend_(sh, { price_id: invId_("pr_"), "品目": s[0], "仕入先": s[1], "商品名・規格": s[2], "内容量": s[3]===null?"":s[3], "単位": s[4], "税込価格": s[5], "基準": c.base, "基準単価": c.per, "調査日": "'" + s[6], "出典": s[7], "メモ": s[8], "状態": "active", "更新日時": invNow_() }); n++;
  });
  Logger.log("added " + n); return n;
}

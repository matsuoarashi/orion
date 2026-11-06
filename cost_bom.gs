// ===== 原価BOM（2026/11/06〜）=====
// 写し：本体は分析 GAS コード.gs の COSTS の直後。金額（単価・控えの COSTS の値）は公開リポジトリに書かない
// 分析シート「原価BOM」タブ：商品・材料・量・単位・単価(円/単位)・根拠・確度・メモ
//  - 材料の名前が別の「商品」なら、その原価×量（部品として使う）。例：
//    ソース1回＝ケチャップ・ピューレ・コンデンスクリーム・ダシダ／ナポリタン ハーフ＝乾麺100g＋ソース1回×1/40＋具（ハーフ1食分）
//    ナシナシ ハーフ＝ナポリタン ハーフ×1＋卓上（1食）×1／ナシナシ＝ナポリタン ハーフ×2＋卓上（1食）×1
//    オリオン ハーフ＝ナシナシ ハーフ＋ハンバーグ1＋コロッケ1＋デミ30g（目玉焼きなし）／オリオン＝ナシナシ＋ハンバーグ1＋コロッケ1＋卵1＋デミ30g
//    TG○○＝店内の○○＋容器（レギュラー BFD-20／ハーフ BFD-22）＋袋・割り箸など
//  - ハーフを「レギュラー÷2」では出さない
// COSTS の料理の値は、BOM から計算した値で上書きする（読めないときは控えの値のまま）。結果は6時間キャッシュ
// タブを直したら、エディタで bomRefresh() を実行（月次損益も作り直すなら rebuildPnl()）
var BOM_SHEET = "原価BOM", BOM_COLS = ["商品","材料","量","単位","単価(円/単位)","根拠","確度","メモ"], BOM_KEY = "bom_costs_v1";
function bomCalc_(){
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(BOM_SHEET); if (!sh || sh.getLastRow() < 2) return null;
  var v = sh.getRange(1, 1, sh.getLastRow(), BOM_COLS.length).getValues(), h = v[0].map(String), ix = {}; BOM_COLS.forEach(function(c){ ix[c] = h.indexOf(c); });
  var by = {}; v.slice(1).forEach(function(r){ var p = String(r[ix["商品"]]||"").trim(), m = String(r[ix["材料"]]||"").trim(); if (!p || !m) return;
    (by[p] = by[p] || []).push({ m: m, q: Number(r[ix["量"]])||0, u: Number(r[ix["単価(円/単位)"]])||0 }); });
  var memo = {}, stack = {};
  function cost(p){ if (memo[p] !== undefined) return memo[p]; if (stack[p]) throw new Error("原価BOM が循環しています: " + p); stack[p] = true;
    var s = by[p].reduce(function(a, x){ return a + x.q * (by[x.m] ? cost(x.m) : x.u); }, 0); stack[p] = false; return memo[p] = s; }
  var out = {}; Object.keys(by).forEach(function(p){ out[p] = Math.round(cost(p) * 10) / 10; }); return out;
}
function bomCosts_(){ var c = null; try { c = CacheService.getScriptCache(); var hit = c.get(BOM_KEY); if (hit) return JSON.parse(hit); } catch(e){}
  var o = null; try { o = bomCalc_(); } catch(e){ o = null; } if (o && c) try { c.put(BOM_KEY, JSON.stringify(o), 21600); } catch(e){} return o; }
function bomRefresh(){ try { CacheService.getScriptCache().remove(BOM_KEY); } catch(e){} var o = bomCalc_(); Logger.log(JSON.stringify(o)); try { dashCacheClear_(); } catch(e){} return o; }
// COSTS の直後：(function(){ var b = bomCosts_(); if (b) Object.keys(COSTS).forEach(function(n){ if (typeof b[n] === "number" && b[n] > 0) COSTS[n] = b[n]; }); })();
// 初回の行は bomSetup1106()（分析 GAS だけにある。単価を含むのでここには写さない）。乾麺の購入品目（1日使用量 2.33袋/60食・備考）も同時に直した
// ===== 原価BOM END =====

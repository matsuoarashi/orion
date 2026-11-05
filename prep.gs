// ===== 仕込み（毎日の仕込み数。在庫は売上から計算し、棚卸しは2週に1回）=====
// 分析シートの「仕込み」タブ：日付・品目キー（noodle＝麺の小分け〔ハーフ単位〕／sauce＝ナポリタンソース〔人前〕）・数・入力者
// 11/5〜：「数」は仕込んだ分ではなく「冷蔵庫に今ある数（前の残り＋仕込んだ分）」。残り＝最後に入れた数 − その後に売れた分（計算は hacchu.html）。更新日時（at）で14時前後を見分ける
var PREP_SHEET = "仕込み", PREP_COLS = ["日付","品目","数","入力者","更新日時"], PREP_KEYS = ["noodle","sauce"];
function prepGet_(p){
  var me = null; try { me = invAuth_(p); } catch(e){} if (!me) return invOut_({ error: "auth" });
  var since = Utilities.formatDate(new Date(Date.now() - 60*86400000), "Asia/Tokyo", "yyyy/MM/dd");
  var rows = recRowsObj_(recSheet_(PREP_SHEET, PREP_COLS), PREP_COLS).map(function(r){ var at = r["更新日時"]; at = (at instanceof Date) ? Utilities.formatDate(at, "Asia/Tokyo", "yyyy/MM/dd HH:mm") : String(at||""); return { date: String(r["日付"]).slice(0,10), key: r["品目"], qty: Number(r["数"])||0, by: r["入力者"], at: at }; })
    .filter(function(r){ return r.date >= since; });
  return invOut_({ ok: true, preps: rows });
}
function prepPost_(d){
  if (!d || d.type !== "prep_save") return null;
  var me = null; try { me = invAuth_(d); } catch(e){} if (!me) return invOut_({ error: "auth" });
  var date = String(d.date||""); if (!/^\d{4}\/\d{2}\/\d{2}$/.test(date)) return invOut_({ error: "日付が正しくありません" });
  var items = d.items || {}, lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    var sh = recSheet_(PREP_SHEET, PREP_COLS), rows = recRowsObj_(sh, PREP_COLS), del = [];
    PREP_KEYS.forEach(function(k){ if (!(k in items)) return; var q = items[k];
      var hit = rows.filter(function(r){ return String(r["日付"]).slice(0,10) === date && r["品目"] === k; })[0];
      if (q === "" || q === null){ if (hit) del.push(hit._row); return; }
      q = Math.max(0, Math.min(999, Number(q)||0));
      if (hit) recSet_(sh, PREP_COLS, hit._row, { "数": q, "入力者": me.name, "更新日時": recNow_() });
      else invAppend_(sh, { "日付": "'" + date, "品目": k, "数": q, "入力者": me.name, "更新日時": recNow_() });
    });
    del.sort(function(a, b){ return b - a; }).forEach(function(r){ sh.deleteRow(r); });   // 下の行から消す
    return invOut_({ ok: true });
  } finally { lock.releaseLock(); }
}
// ===== 仕込み END =====

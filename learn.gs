// ===== 覚えること（スタッフの自己チェック）=====
// 分析シートの「習熟」タブ。項目の中身は learn.html に書いてある。ここは「誰が・どの項目を・どのくらい」だけ
// 状態は本人がつける：まだ／自信ない／できる（第三者の確認はしない）
var LRN_SHEET = "習熟", LRN_COLS = ["staff_id","名前","item_id","状態","更新日時"], LRN_STATES = ["まだ","自信ない","できる"];
function lrnMe_(p){ var me = null; try { me = invAuth_(p); } catch(e){} return (me && me.role !== "store" && me.staff_id) ? me : null; }
function learnGet_(p){
  var me = lrnMe_(p); if (!me) return invOut_({ error: "auth" });
  var rows = recRowsObj_(recSheet_(LRN_SHEET, LRN_COLS), LRN_COLS), mine = {};
  rows.forEach(function(r){ if (r.staff_id === me.staff_id) mine[r.item_id] = { state: r["状態"], at: r["更新日時"] }; });
  var out = { ok: true, me: { name: me.name, role: me.role, staff_id: me.staff_id }, mine: mine, states: LRN_STATES };
  if (me.role === "admin") out.all = rows.map(function(r){ return { staff_id: r.staff_id, name: r["名前"], item: r.item_id, state: r["状態"], at: r["更新日時"] }; });
  return invOut_(out);
}
function learnPost_(d){
  if (!d || d.type !== "learn_save") return null;
  var me = lrnMe_(d); if (!me) return invOut_({ error: "auth" });
  var item = String(d.item || "").slice(0, 40), st = String(d.state || "");
  if (!/^[a-z0-9_]+$/.test(item)) return invOut_({ error: "項目が正しくありません" });
  if (st && LRN_STATES.indexOf(st) < 0) return invOut_({ error: "状態が正しくありません" });
  var lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    var sh = recSheet_(LRN_SHEET, LRN_COLS), hit = recRowsObj_(sh, LRN_COLS).filter(function(r){ return r.staff_id === me.staff_id && r.item_id === item; })[0];
    if (hit){ if (!st) sh.deleteRow(hit._row); else recSet_(sh, LRN_COLS, hit._row, { "状態": st, "名前": me.name, "更新日時": recNow_() }); }
    else if (st) invAppend_(sh, { staff_id: me.staff_id, "名前": me.name, item_id: item, "状態": st, "更新日時": recNow_() });
    return invOut_({ ok: true });
  } finally { lock.releaseLock(); }
}
// ===== 覚えること END =====

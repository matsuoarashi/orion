// ===== 分析の作り置き（速く開くため）=====
// 収支（pnl）・ops・今朝の確認（alerts）は計算に数秒〜10秒かかるので、10分ごとに作り置きして画面はそれを読む（売上の日別は毎回その場で計算）
// 書き込み（締め・在庫・発注・経費など。レジの売上とカメラは除く）があったら作り置きを捨てる。dashSetupTrigger を1回実行
// doGet（mode なし）の buildPnlPayload_() / buildOpsPayload_() は dashCached_("pnl"/"ops", …) 経由。doPost は JSON.parse の直後に dashCacheClear_()
var DASH_KEYS = ["c_pnl","c_ops","c_alerts"];
function dashCached_(name, fn, ttl){ var c = CacheService.getScriptCache(), k = "c_" + name;
  try { var hit = c.get(k); if (hit) return JSON.parse(hit); } catch(e){}
  var v = fn(); try { var s = JSON.stringify(v); if (s.length < 95000) c.put(k, s, ttl || 900); } catch(e){} return v; }
function dashCacheClear_(){ try { CacheService.getScriptCache().removeAll(DASH_KEYS); } catch(e){} }
function dashWarm(){ var h = Number(Utilities.formatDate(new Date(), "Asia/Tokyo", "H")); if (h < 7 || h > 21) return;
  dashCacheClear_(); dashCached_("pnl", buildPnlPayload_); dashCached_("ops", buildOpsPayload_); dashCached_("alerts", function(){ return opsAlerts_("all"); }); }
function dashSetupTrigger(){ ScriptApp.getProjectTriggers().forEach(function(t){ if (t.getHandlerFunction() === "dashWarm") ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger("dashWarm").timeBased().everyMinutes(10).create(); dashWarm(); }
// ===== 分析の作り置き END =====

// ===== 分析の作り置き（速く開くため）=====
// 収支（pnl）・ops・今朝の確認（alerts）は計算に数秒〜10秒かかるので、10分ごとに作り置きして画面はそれを読む（売上の日別は毎回その場で計算）
// 11/4：作り置きを捨てるのは数字が変わる書き込みのときだけ（dashCacheClearFor_）。来店ボタン・注文・質問・出来事・口コミ・LINE では捨てない。
//       やること・借入・採用・仕込みは「今朝の確認」だけ捨てる。作り直しは計算し終えてから入れ替える（捨ててから作ると、その間に開いた人が待つ）
//       作り置きがないときに同時に開かれても、重い計算は1本だけにする（計算中の印 b_名前 があれば、2本目以降は出来上がりを待って読む）
// doGet（mode なし）の buildPnlPayload_() / buildOpsPayload_() は dashCached_("pnl"/"ops", …) 経由。doPost は JSON.parse の直後に dashCacheClearFor_(d.type)
var DASH_KEYS = ["c_pnl","c_ops","c_alerts"];
function dashPut_(name, v, ttl){ try { var s = JSON.stringify(v); if (s.length < 95000) CacheService.getScriptCache().put("c_" + name, s, ttl || 900); } catch(e){} return v; }
function dashCached_(name, fn, ttl){ var c = CacheService.getScriptCache(), k = "c_" + name, bk = "b_" + name;
  try { var hit = c.get(k); if (hit) return JSON.parse(hit); } catch(e){}
  try { if (c.get(bk)){ for (var i = 0; i < 40; i++){ Utilities.sleep(500); var h = c.get(k); if (h) return JSON.parse(h); if (!c.get(bk)) break; } } } catch(e){}   // 別の人が計算中なら出来上がりを待つ（最大20秒）
  try { c.put(bk, "1", 30); } catch(e){}
  try { return dashPut_(name, fn(), ttl); } finally { try { c.remove(bk); } catch(e){} }
}
function dashCacheClear_(){ try { CacheService.getScriptCache().removeAll(DASH_KEYS); } catch(e){} }
var DASH_KEEP = /^(camera|visit|visit_cancel|order_new|order_update|order_toggle|os_ask|os_rate|os_answer|os_q_close|os_know_save|os_fact_|os_mail_set|os_ev_|os_gbp_|os_owner_|os_start_|os_dec_save|os_contract_save|learn)/;
var DASH_ALERTS_ONLY = /^(os_todo_|os_loan_|rec_|prep_)/;
function dashCacheClearFor_(type){ type = String(type||""); if (!type || DASH_KEEP.test(type)) return;
  if (DASH_ALERTS_ONLY.test(type)){ try { CacheService.getScriptCache().remove("c_alerts"); } catch(e){} return; }
  dashCacheClear_(); }
function dashWarm(){ var h = Number(Utilities.formatDate(new Date(), "Asia/Tokyo", "H")); if (h < 7 || h > 21) return;
  dashPut_("pnl", buildPnlPayload_()); dashPut_("ops", buildOpsPayload_()); dashPut_("alerts", opsAlerts_("all")); }
function dashSetupTrigger(){ ScriptApp.getProjectTriggers().forEach(function(t){ if (t.getHandlerFunction() === "dashWarm") ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger("dashWarm").timeBased().everyMinutes(10).create(); dashWarm(); }
// ===== 分析の作り置き END =====

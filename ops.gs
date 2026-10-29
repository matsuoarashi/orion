// ===== 分析ページ「要確認」用の運営データ（dashboard.html） =====
// doGet の out.ops に入れる。レジ締め・二重入力の疑い・未退勤・在庫不足・備品報告・経費の未確認/未払い・その他収入（夜間貸出など）
function buildOpsPayload_(){
  var ss = SpreadsheetApp.getActiveSpreadsheet(); var tz = "Asia/Tokyo"; var today = Utilities.formatDate(new Date(), tz, "yyyy/MM/dd"); var nowH = Number(Utilities.formatDate(new Date(), tz, "H"));
  var out = { shime: [], dup: [], unclosed: [], reports: [], receipts: { unchecked: 0, unpaid: 0, unpaidList: [] }, income: [], stockLow: [], today: today };
  // レジ締め（日付・本日売上・差異・PayPay入力・伝票一致）
  try { var sh = ss.getSheetByName("レジ締め"); if (sh && sh.getLastRow() > 1){ var v = sh.getRange(2,1,sh.getLastRow()-1,19).getValues();
    v.forEach(function(r){ var d = dateKey_(r[0]); if (!d) return; out.shime.push({ date:d, time: (r[1] instanceof Date) ? Utilities.formatDate(r[1], tz, "HH:mm") : String(r[1]||""), prep:Number(r[2])||0, sales:Number(r[3])||0, expected:Number(r[4])||0, actual:Number(r[5])||0, diff:Number(r[6])||0, paypay:Number(r[7])||0, collect:Number(r[8])||0, vendorPay:Number(r[9])||0, slipMatch:String(r[18]||"") }); }); } } catch(e){ out.shimeError = String(e); }
  // 二重入力の疑い：同じ日・同じ内訳・同じ金額で、時刻が2分以内に並んでいる会計（直近400件）
  try { var ssh = ss.getSheetByName("売上"); var n = ssh.getLastRow(); if (n > 1){ var from = Math.max(2, n - 400); var sv = ssh.getRange(from,1,n-from+1,26).getValues(); var tzs; try { tzs = ss.getSpreadsheetTimeZone() || "GMT"; } catch(e3){ tzs = "GMT"; }
    var rows = sv.map(function(r){ var d = dateKey_(r[0]); var t = (r[1] instanceof Date) ? Utilities.formatDate(r[1], tzs, "HH:mm") : String(r[1]||"").slice(0,5); return { date:d, time:t, mode:String(r[3]||""), amount:Number(r[4])||0, items:String(r[7]||""), pay:String(r[25]||"") }; }).filter(function(x){ return x.date && x.amount; });
    var mins = function(t){ var m = String(t).match(/(\d{1,2}):(\d{2})/); return m ? Number(m[1])*60+Number(m[2]) : -999; };
    for (var i = 0; i < rows.length; i++) for (var j = i+1; j < rows.length; j++){ var a = rows[i], b = rows[j]; if (a.date !== b.date) continue; if (a.amount === b.amount && a.items === b.items && Math.abs(mins(a.time)-mins(b.time)) <= 2) out.dup.push({ date:a.date, time1:a.time, time2:b.time, items:a.items, amount:a.amount, pay1:a.pay, pay2:b.pay }); }
    out.dup = out.dup.slice(-30);
  } } catch(e){ out.dupError = String(e); }
  // 未退勤・備品報告・在庫不足・経費
  try { var st = SpreadsheetApp.openById(INV_STAFF_SS); var names = {}; invRows_(st.getSheetByName("スタッフ")).forEach(function(r){ names[r.staff_id] = String(r["名前"]); });
    invRows_(st.getSheetByName("勤怠")).forEach(function(r){ if (String(r["状態"]) !== "working") return; var d = dateKey_(r["日付"]); if (d < today || (d === today && nowH >= 16)) out.unclosed.push({ name: names[r.staff_id] || r.staff_id, date: d, in: (r["出勤"] instanceof Date) ? Utilities.formatDate(r["出勤"], tz, "HH:mm") : String(r["出勤"]||"") }); });
  } catch(e){ out.unclosedError = String(e); }
  try { invRows_(invSheet_(INV_REPORT_SHEET, INV_REPORT_COLS)).forEach(function(r){ if (r["状態"] === "対応済") return; out.reports.push({ name:String(r["品目"]), kind:String(r["種別"]), qty:String(r["数量"]||""), memo:String(r["メモ"]||""), by:String(r["記録者"]||""), at:String(r["日時"]||"").slice(0,16) }); }); } catch(e){ out.reportsError = String(e); }
  try { invMaster_().forEach(function(it){ if (it.stock === null || it.min === null) return; if (it.stock <= it.min) out.stockLow.push({ name:it.name, stock:it.stock, min:it.min, unit:it.unit, supplier:it.supplier, owner:it.owner }); }); } catch(e){ out.stockError = String(e); }
  try { invRows_(rcSheet_()).forEach(function(r){ if (r["状態"] === "削除") return; if (r["状態"] === "未確認") out.receipts.unchecked++; if (/未払い/.test(String(r["支払元"]||""))){ var amt = Number(r["金額"])||0; out.receipts.unpaid += amt; out.receipts.unpaidList.push({ date:dateKey_(r["日付"]), vendor:String(r["店名"]), amount:amt }); } }); } catch(e){ out.receiptsError = String(e); }
  // その他収入：固定費シートで科目に「収入」を含む行。メモの yyyy/MM 以降の月に適用
  try { var fsh = fixedSheet_(); if (fsh.getLastRow() > 1){ fsh.getRange(2,1,fsh.getLastRow()-1,3).getValues().forEach(function(r){ if (!r[0] || String(r[0]).indexOf("収入") < 0) return; var m = String(r[2]||"").match(/(\d{4})\/(\d{1,2})/); out.income.push({ name:String(r[0]), amount:Number(r[1])||0, from: m ? m[1] + "/" + ("0"+m[2]).slice(-2) : "" }); }); } } catch(e){ out.incomeError = String(e); }
  return out;
}

// 夜間貸出の収入行を固定費シートに入れる（1回だけ実行）。金額は11月から算入。損益の固定費合計からは除外される
function opsSeedIncome20261029(){
  var sh = fixedSheet_(); var v = sh.getRange(2,1,Math.max(1,sh.getLastRow()-1),3).getValues();
  if (v.some(function(r){ return String(r[0]).indexOf("夜間貸出") >= 0; })) return "exists";
  var at = 2; for (var k = 0; k < v.length; k++){ if (v[k][0] !== "" && v[k][0] !== null) at = k + 3; else break; }
  sh.insertRowBefore(at); sh.getRange(at,1,1,3).setValues([["夜間貸出（収入）", 100000, "2026/11〜 月10万円で貸出。科目に「収入」を含む行は固定費に足さず、収入として扱う"]]);
  return "added";
}

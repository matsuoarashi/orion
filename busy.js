// 共通ローディング：通信中は二重タップ・誤タップを防ぐ
// ・書き込み（POST）中：画面全体に半透明のふた＋「処理中…」。タップを受け付けない
// ・読み込み（GET）中：0.4 秒を超えたら上に細いバー（操作はできる）
// ・どの画面も <script src="busy.js"></script> を最初に読むだけ。個別の画面の作りは変えない
// ・ふたを出したくない通信は fetch の第 2 引数に { busy:false }
(function(){
  if (window.__busyInstalled) return; window.__busyInstalled = true;
  var css = ".bz-bar{position:fixed;top:0;left:0;right:0;height:3px;z-index:99998;background:linear-gradient(90deg,transparent,#e8c26a,transparent);background-size:200% 100%;animation:bzmove 1s linear infinite;opacity:0;transition:opacity .15s;pointer-events:none}" +
    ".bz-bar.on{opacity:1}@keyframes bzmove{from{background-position:200% 0}to{background-position:-200% 0}}" +
    ".bz-lock{position:fixed;inset:0;z-index:99999;background:rgba(250,246,238,.55);display:none;align-items:center;justify-content:center;touch-action:none}" +
    ".bz-lock.on{display:flex}.bz-box{background:#1f3a2a;color:#fff;border-radius:14px;padding:14px 20px;font:bold 15px -apple-system,'Hiragino Sans',sans-serif;display:flex;align-items:center;gap:10px;box-shadow:0 6px 20px rgba(0,0,0,.18)}" +
    ".bz-sp{width:18px;height:18px;border:3px solid rgba(255,255,255,.35);border-top-color:#fff;border-radius:50%;animation:bzspin .8s linear infinite}@keyframes bzspin{to{transform:rotate(360deg)}}";
  function mount(){
    if (document.getElementById("bzBar")) return;
    var st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);
    var bar = document.createElement("div"); bar.id = "bzBar"; bar.className = "bz-bar"; document.body.appendChild(bar);
    var lk = document.createElement("div"); lk.id = "bzLock"; lk.className = "bz-lock"; lk.innerHTML = '<div class="bz-box" style="flex-wrap:wrap;max-width:300px"><span class="bz-sp"></span><span id="bzText">処理中…</span><button id="bzClose" style="display:none;margin-top:10px;width:100%;border:0;border-radius:10px;padding:10px;font:bold 14px sans-serif;background:#e8c26a;color:#1f3a2a">待たずに閉じる（記録されたか画面で確認）</button></div>'; document.body.appendChild(lk);
    ["click","touchstart","pointerdown","keydown"].forEach(function(ev){ lk.addEventListener(ev, function(e){ if (e.target && e.target.id === "bzClose"){ if (ev === "click"){ writes = 0; upd(); } return; } e.preventDefault(); e.stopPropagation(); }, true); });
  }
  if (document.body) mount(); else document.addEventListener("DOMContentLoaded", mount);
  var reads = 0, writes = 0, readT = null, writeT = null;
  function upd(){
    var bar = document.getElementById("bzBar"), lk = document.getElementById("bzLock"); if (!bar || !lk) return;
    if (reads > 0 && !readT && !bar.classList.contains("on")) readT = setTimeout(function(){ readT = null; if (reads > 0) bar.classList.add("on"); }, 400);
    if (reads <= 0){ clearTimeout(readT); readT = null; bar.classList.remove("on"); }
    if (writes > 0){ if (lk.classList.contains("on")) return; lk.classList.add("on"); clearTimeout(writeT); writeT = setTimeout(function(){ var t = document.getElementById("bzText"); if (t) t.textContent = "処理中…（通信に時間がかかっています）"; writeT = setTimeout(function(){ var c = document.getElementById("bzClose"); if (c) c.style.display = "inline-block"; }, 14000); }, 6000); }
    else { lk.classList.remove("on"); clearTimeout(writeT); var t = document.getElementById("bzText"); if (t) t.textContent = "処理中…"; var c = document.getElementById("bzClose"); if (c) c.style.display = "none"; }
  }
  window.busyText = function(s){ var t = document.getElementById("bzText"); if (t) t.textContent = s || "処理中…"; };
  var orig = window.fetch.bind(window);
  // シートの「時刻だけ」のセルは Google から「1899/12/30 15:00:00」の形で届く。どの画面でも「15:00」と出るように通信の段階で直す
  function fixT(url, r){
    if (!/script\.google(usercontent)?\.com/.test(url) || !r || !r.ok) return r;
    return r.text().then(function(t){
      var f = t.replace(/1899\/12\/30 (\d{1,2}):(\d{2})(?::\d{2})?/g, function(_, h, m){ return (h.length < 2 ? "0" + h : h) + ":" + m; });
      return new Response(f, {status: r.status, statusText: r.statusText, headers: r.headers});
    });
  }
  window.fetch = function(input, init){
    init = init || {};
    var skip = init.busy === false; if ("busy" in init){ init = Object.assign({}, init); delete init.busy; }
    var method = String(init.method || (input && input.method) || "GET").toUpperCase();
    var url = String(typeof input === "string" ? input : (input && input.url) || "");
    var isWrite = method !== "GET" && method !== "HEAD";
    // 勤怠 API は読み取りも POST なので、action 名で読み取りを見分ける
    if (isWrite && typeof init.body === "string"){ var m = init.body.match(/"action"\s*:\s*"([^"]+)"/); if (m && /(^home$|list|_get$|^get|month|history|^comm$|^shifts$|today|summary|^diag$|log$)/.test(m[1])) isWrite = false; }
    if (/[?&]action=staff_list\b/.test(url)) skip = true; // ログイン画面の名前一覧は待たせない
    if (skip) return orig(input, init).then(function(r){ return fixT(url, r); });
    if (isWrite) writes++; else reads++; upd();
    var done = function(){ if (isWrite) writes = Math.max(0, writes-1); else reads = Math.max(0, reads-1); upd(); };
    return orig(input, init).then(function(r){ done(); return fixT(url, r); }, function(e){ done(); throw e; });
  };
})();

// 旧アイコン（分析・発注・経費・管理）をホーム画面から開いたときだけ、まとめ先を案内する（埋め込み・スタッフ経由・普通のブラウザでは出さない）
(function(){
  try{
    var p = location.pathname, q = location.search;
    if (/embed=1|from=staff/.test(q)) return;
    if (window.self !== window.top) return;
    var standalone = (window.matchMedia && matchMedia("(display-mode: standalone)").matches) || navigator.standalone === true;
    if (!standalone) return;
    var m = p.match(/\/(dashboard|hacchu|keihi|admin)\.html$/); if (!m) return;
    var sec = {dashboard:"shime", hacchu:"hacchu", keihi:"keihi", admin:"staff"}[m[1]];
    var base = /\/staff\/admin\.html$/.test(p) ? "../" : "";
    var show = function(){
      if (document.getElementById("bzMove")) return;
      var d = document.createElement("div"); d.id = "bzMove";
      d.style.cssText = "position:fixed;left:8px;right:8px;bottom:calc(8px + env(safe-area-inset-bottom));z-index:99997;background:#1f3a2a;color:#fff;border-radius:14px;padding:12px 14px;font:14px -apple-system,'Hiragino Sans',sans-serif;box-shadow:0 6px 20px rgba(0,0,0,.2);line-height:1.5";
      var staffBtn = sec === "hacchu" ? '<a href="' + base + 'staff/" style="flex:1;text-align:center;background:rgba(255,255,255,.15);color:#fff;border-radius:10px;padding:9px;text-decoration:none">スタッフは勤怠アプリへ</a>' : "";
      d.innerHTML = '<b>アプリを1つにまとめました</b><br>この画面は「管理者」アプリの中に入りました。このアイコンは削除して、管理者アプリをホーム画面に追加してください。' +
        '<div style="display:flex;gap:8px;margin-top:10px"><a href="' + base + 'kanri.html#' + sec + '" style="flex:1;text-align:center;background:#e8c26a;color:#1f3a2a;font-weight:bold;border-radius:10px;padding:9px;text-decoration:none">管理者アプリを開く</a>' + staffBtn +
        '<button onclick="this.closest(\'#bzMove\').remove()" style="border:0;background:none;color:#fff;opacity:.7;padding:0 6px">閉じる</button></div>';
      document.body.appendChild(d);
    };
    if (document.body) show(); else document.addEventListener("DOMContentLoaded", show);
  }catch(e){}
})();

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
    var lk = document.createElement("div"); lk.id = "bzLock"; lk.className = "bz-lock"; lk.innerHTML = '<div class="bz-box"><span class="bz-sp"></span><span id="bzText">処理中…</span></div>'; document.body.appendChild(lk);
    ["click","touchstart","pointerdown","keydown"].forEach(function(ev){ lk.addEventListener(ev, function(e){ e.preventDefault(); e.stopPropagation(); }, true); });
  }
  if (document.body) mount(); else document.addEventListener("DOMContentLoaded", mount);
  var reads = 0, writes = 0, readT = null, writeT = null;
  function upd(){
    var bar = document.getElementById("bzBar"), lk = document.getElementById("bzLock"); if (!bar || !lk) return;
    if (reads > 0 && !readT && !bar.classList.contains("on")) readT = setTimeout(function(){ readT = null; if (reads > 0) bar.classList.add("on"); }, 400);
    if (reads <= 0){ clearTimeout(readT); readT = null; bar.classList.remove("on"); }
    if (writes > 0){ lk.classList.add("on"); clearTimeout(writeT); writeT = setTimeout(function(){ var t = document.getElementById("bzText"); if (t) t.textContent = "処理中…（通信に時間がかかっています）"; }, 6000); }
    else { lk.classList.remove("on"); clearTimeout(writeT); var t = document.getElementById("bzText"); if (t) t.textContent = "処理中…"; }
  }
  window.busyText = function(s){ var t = document.getElementById("bzText"); if (t) t.textContent = s || "処理中…"; };
  var orig = window.fetch.bind(window);
  window.fetch = function(input, init){
    init = init || {};
    var skip = init.busy === false; if ("busy" in init){ init = Object.assign({}, init); delete init.busy; }
    var method = String(init.method || (input && input.method) || "GET").toUpperCase();
    var url = String(typeof input === "string" ? input : (input && input.url) || "");
    var isWrite = method !== "GET" && method !== "HEAD";
    // 勤怠 API は読み取りも POST なので、action 名で読み取りを見分ける
    if (isWrite && typeof init.body === "string"){ var m = init.body.match(/"action"\s*:\s*"([^"]+)"/); if (m && /(^home$|list|_get$|^get|month|history|^comm$|^shifts$|today|summary|^diag$|log$)/.test(m[1])) isWrite = false; }
    if (/[?&]action=staff_list\b/.test(url)) skip = true; // ログイン画面の名前一覧は待たせない
    if (skip) return orig(input, init);
    if (isWrite) writes++; else reads++; upd();
    var done = function(){ if (isWrite) writes = Math.max(0, writes-1); else reads = Math.max(0, reads-1); upd(); };
    return orig(input, init).then(function(r){ done(); return r; }, function(e){ done(); throw e; });
  };
})();

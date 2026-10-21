// 洋食オリオン 運営アプリ  Service Worker
// アプリ本体とライブラリを端末に保存し、電波がなくても開けるようにする
const CACHE = "orion-app-v3";
const SHELL = [
  "./app.html",
  "./dashboard.html",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js"
];
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.allSettled(SHELL.map(u => c.add(u)))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  // データ通信（Supabase）はキャッシュしない
  if (url.hostname.endsWith("supabase.co") || e.request.method !== "GET") return;
  // アプリ本体: ネット優先・失敗したらキャッシュ（更新をすぐ反映しつつオフラインでも開ける）
  if (url.pathname.endsWith(".html") || url.pathname.endsWith("/manifest.json") || url.pathname === "/") {
    e.respondWith(fetch(e.request).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r; }).catch(() => caches.match(e.request)));
    return;
  }
  // それ以外（ライブラリ・アイコン）: キャッシュ優先
  e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r; })));
});

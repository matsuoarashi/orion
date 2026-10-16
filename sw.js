// 洋食オリオン Service Worker v2
// 方針: ページとデータ通信は常にネット優先（更新をすぐ反映）。キャッシュするのはアイコン等の静的ファイルのみ。
const CACHE = "orion-app-v2";
const STATIC = ["./manifest.json", "./icon-192.png", "./icon-512.png"];
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.allSettled(STATIC.map(u => c.add(u)))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;
  // 他ドメイン（Apps Script / Supabase / CDN）はService Workerが触らない
  if (url.origin !== self.location.origin) return;
  // HTML・JS: ネット優先。オフライン時だけ直近のコピーを返す
  if (url.pathname.endsWith(".html") || url.pathname.endsWith(".js") || url.pathname === "/") {
    e.respondWith(fetch(e.request, {cache: "no-store"}).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r; }).catch(() => caches.match(e.request)));
    return;
  }
  // アイコン・manifest: キャッシュ優先
  e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r; })));
});

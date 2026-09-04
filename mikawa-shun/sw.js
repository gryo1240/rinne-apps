// 三河の旬カレンダー（非公式） Service Worker（キャッシュ優先・オフライン動作）
const CACHE = "mikawa-shun-v6";
const ASSETS = ["./", "./index.html", "./data.js", "./logic.js", "./manifest.json",
  "./icon-192.png", "./icon-512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  // caches.keys() はオリジン単位で返る。同一オリジンに他アプリが同居しているため、
  // 自分の接頭辞のものだけを消す（絞らないと他アプリのキャッシュを全消しする）
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k.startsWith("mikawa-shun-") && k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request)));
});

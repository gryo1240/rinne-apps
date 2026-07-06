// 月夜の集中タイマー Service Worker (キャッシュ優先・オフライン動作)
const CACHE = "tsukiyo-timer-v4";
const ASSETS = ["./", "./index.html", "./manifest.json", "./icon-192.png", "./icon-512.png",
  "./koyomi-work-mini.jpg", "./koyomi-rest-mini.jpg"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  e.respondWith(
    caches.match(e.request).then((hit) => hit || fetch(e.request))
  );
});

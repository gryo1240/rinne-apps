// リスク許容度チェック Service Worker（キャッシュ優先・オフライン動作）
const CACHE = "risk-check-v2";
const ASSETS = [
  "./", "./index.html", "./logic.js", "./data.js",
  "./manifest.webmanifest", "./icon-192.png", "./icon-512.png", "./apple-touch-icon.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  // 同一オリジン(GitHub Pages)に他アプリのキャッシュが同居するため、自分の旧バージョンだけ削除
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k.startsWith("risk-check-") && k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request)));
});

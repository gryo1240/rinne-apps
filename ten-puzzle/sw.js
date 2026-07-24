// 今日の10パズル Service Worker（キャッシュ優先・オフライン動作）
// 【重要・仕様書§6.2】puzzles.js（今日の1問プール）を更新したら必ず CACHE のバージョンを
// bump すること。プールが端末ごとに新旧混在すると「今日の1問が全員共通」が崩れるため。
const CACHE = "ten-puzzle-v2";
const ASSETS = [
  "./", "./index.html", "./engine.js", "./puzzles.js",
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
      Promise.all(keys.filter((k) => k.startsWith("ten-puzzle-") && k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request)));
});

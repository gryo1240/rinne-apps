// 激辛レビュー生成器 Service Worker (キャッシュ優先・オフライン動作)
// vendor/(TensorFlow.js+MobileNetモデル、計約18MB)はインストール時に強制ダウンロードさせず、
// 画像モードを実際に使った時にブラウザの通常キャッシュへ乗る形にする(初回訪問を軽くするため)。
const CACHE = "gekikara-review-v4";
const ASSETS = [
  "./", "./index.html", "./manifest.json", "./icon-192.png", "./icon-512.png",
  "./app.js", "./generator.js", "./labels-ja.js", "./imagenet-classes.js",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  // 同一オリジン(GitHub Pages)に他アプリのキャッシュが同居するため、自分の旧バージョンだけ削除する
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k.startsWith("gekikara-review-") && k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  e.respondWith(
    caches.match(e.request).then((hit) => hit || fetch(e.request))
  );
});

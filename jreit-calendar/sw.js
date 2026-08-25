// 毎月分配カレンダー Service Worker
// 決算日データ(data.js)は年単位で見直すため、nenshu-kabe と同じく network-first にする。
// （キャッシュ優先だと、決算日を直しても CACHE 名を上げるまで既存ユーザーに届かない）
const CACHE = "jreit-calendar-v1";
const ASSETS = ["./", "./index.html", "./data.js", "./logic.js", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png", "./apple-touch-icon.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  // 同一オリジン(GitHub Pages)に他アプリのキャッシュが同居するため、自分の旧バージョンだけ削除する
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k.startsWith("jreit-calendar-") && k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  // network-first: つながれば最新を返しつつキャッシュを更新。オフライン時だけキャッシュを使う
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(e.request).then((hit) => hit || Promise.reject(new Error("offline"))))
  );
});

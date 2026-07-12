// 宵乃こよみの事件簿 Service Worker (network-first・オフライン時のみキャッシュ)
const CACHE = "koyomi-jikenbo-v1";
const ASSETS = ["./", "./index.html", "./scenario.js", "./sprites.js", "./logic.js", "./engine.js", "./manifest.json", "./icon-192.png", "./icon-512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  // 同一オリジン(GitHub Pages)に他アプリのキャッシュが同居するため、自分の旧バージョンだけ削除する
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k.startsWith("koyomi-jikenbo-") && k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// network-first: シナリオの誤字修正など公開後の更新を即反映する
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});

// エアコン電気代シミュレーター Service Worker (network-first・オフライン時のみキャッシュ)
const CACHE = "aircon-cost-v2";
const ASSETS = ["./", "./index.html", "./calc.js", "./manifest.json", "./icon-192.png", "./icon-512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  // 同一オリジン(GitHub Pages)に他アプリのキャッシュが同居するため、自分の旧バージョンだけ削除する
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k.startsWith("aircon-cost-") && k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// network-first: 単価・定格テーブルは毎年更新されるため、オンライン時は常に最新を取得する
self.addEventListener("fetch", (e) => {
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});

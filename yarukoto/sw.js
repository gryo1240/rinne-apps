const CACHE = "yarukoto-v1";
const ASSETS = ["./", "./index.html", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png", "./apple-touch-icon.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith("yarukoto-") && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  // Firebaseの通信はキャッシュしない
  if (url.hostname.endsWith("firebasedatabase.app") || url.hostname.endsWith("firebaseio.com")) return;
  // ページ本体はネット優先(更新を受け取る)、失敗したらキャッシュ(オフライン)
  if (e.request.mode === "navigate") {
    e.respondWith(
      fetch(e.request).then(res => {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put("./index.html", clone));
        return res;
      }).catch(() => caches.match("./index.html"))
    );
    return;
  }
  // Firebase SDK(gstatic)などはキャッシュ優先+初回取得時に保存 → オフラインでも起動可
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request).then(res => {
      if (res && (res.ok || res.type === "opaque")) {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
      }
      return res;
    }))
  );
});

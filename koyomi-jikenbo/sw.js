// 宵乃こよみの事件簿 Service Worker (network-first・オフライン時のみキャッシュ)
const CACHE = "koyomi-jikenbo-v9"; // 2026-10-12 第二夜 e2_act1_07 の本文を誠の立ち絵（首の後ろに手）に合わせる（v8 立ち絵・文字・選択肢をドラッグしても選択表示や画像の影が出ないように・v7 立ち絵の白い縁を除去・誠と湊の大きさをこよみに合わせる・v6 第一夜の月の一文・v5 第二夜の公開・v4 第一夜の改善）。画像は事前キャッシュに入れない（通常の取得時に自動で貯まる）
const ASSETS = ["./", "./index.html", "./scenario.js", "./scenario-2.js", "./episodes.js", "./sprites.js", "./logic.js", "./audio.js", "./engine.js", "./manifest.json", "./icon-192.png", "./icon-512.png", "./jp-phrase-4.js", "./fonts/shippori-b1-800.woff"];

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

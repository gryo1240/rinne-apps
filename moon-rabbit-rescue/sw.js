// 月うさぎ大捕物 Service Worker
// ページ本体はネットワーク優先（更新をすぐ届ける）、Three.js・フォント・アイコンはキャッシュ優先。
// 更新でファイルを差し替えたら CACHE の vN を必ず1つ上げる。
const CACHE = "moon-rabbit-rescue-v1";
const ASSETS = ["./", "./index.html", "./manifest.json", "./icon-192.png", "./icon-512.png",
  "./vendor/three/build/three.module.js",
  "./vendor/three/examples/jsm/postprocessing/EffectComposer.js",
  "./vendor/three/examples/jsm/postprocessing/RenderPass.js",
  "./vendor/three/examples/jsm/postprocessing/UnrealBloomPass.js",
  "./vendor/three/examples/jsm/postprocessing/OutputPass.js",
  "./vendor/three/examples/jsm/postprocessing/Pass.js",
  "./vendor/three/examples/jsm/postprocessing/ShaderPass.js",
  "./vendor/three/examples/jsm/postprocessing/MaskPass.js",
  "./vendor/three/examples/jsm/shaders/CopyShader.js",
  "./vendor/three/examples/jsm/shaders/LuminosityHighPassShader.js",
  "./vendor/three/examples/jsm/shaders/OutputShader.js",
  "./fonts/dela-gothic-one.woff", "./fonts/mplus-rounded-400.woff", "./fonts/mplus-rounded-700.woff",
  "./fonts/mplus-rounded-800.woff", "./fonts/chakra-petch-500.woff", "./fonts/chakra-petch-700.woff"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  // caches.keys() はオリジン単位で返る。自分の接頭辞のものだけ消す（他アプリを巻き込まない）
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k.startsWith("moon-rabbit-rescue-") && k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  if (e.request.mode === "navigate") {   // the page itself: network first, cache as offline fallback
    e.respondWith(
      fetch(e.request).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put("./index.html", copy)); }
        return res;
      }).catch(() => caches.match("./index.html"))
    );
    return;
  }
  e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request)));
});

/**
 * ルナチェイン｜Service Worker
 *
 * ★消すキャッシュは自分の接頭辞だけに絞る★
 *   caches.keys() は**オリジン単位**で返るので、絞らないと同じGitHub Pages上の
 *   他アプリのキャッシュまで全部消してしまう。
 *
 * ★音源は別のキャッシュに分ける★
 *   コード側の版を上げるたびに数MBの音源まで道連れで消えて再ダウンロードになるため。
 *   （音源は中身が変わらないので、コードの版とは別に管理する）
 */
const CACHE = 'lunachain-v2';
const AUDIO_CACHE = 'lunachain-audio-v1';
const ASSETS = [
  './', './index.html', './manifest.json',
  './style/base.css',
  './src/ui/app.js', './src/ui/render.js', './src/ui/audio.js',
  './src/game.js',
  './src/core/rng.js', './src/core/board.js', './src/core/rules.js',
  './src/ai/ai.js',
  './src/meta/code.js', './src/meta/daily.js', './src/meta/progress.js',
  './data/cards.js', './data/unlock.js',
  './icon-192.png', './icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((k) => k.startsWith('lunachain-') && k !== CACHE && k !== AUDIO_CACHE)
          .map((k) => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  /* ★入口のHTMLだけは「まずネットワーク」★
     index.html をキャッシュ優先にすると、中の importmap（版つきのモジュールURL）が
     古いまま返り続け、**再デプロイしても既存ユーザーに更新が永久に届かない**。
     HTMLは小さいので、取れたら最新を使い、オフラインのときだけキャッシュに落とす。 */
  const isEntry = req.mode === 'navigate'
    || url.pathname.endsWith('/') || url.pathname.endsWith('/index.html');
  if (isEntry) {
    e.respondWith(
      fetch(req).then((res) => {
        if (res.ok) caches.open(CACHE).then((c) => c.put(req, res.clone()));
        return res;
      }).catch(() => caches.match(req).then((hit) => hit || caches.match('./index.html')))
    );
    return;
  }

  // 音源はキャッシュ優先（中身が変わらないので再検証する意味がない）
  if (/\.(mp3|ogg|m4a|wav)$/i.test(url.pathname)) {
    e.respondWith(caches.open(AUDIO_CACHE).then(async (c) => {
      const hit = await c.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok && res.status === 200) c.put(req, res.clone());   // 206は入れない
      return res;
    }));
    return;
  }

  e.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok && res.status === 200 && res.type === 'basic') {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
      }
      return res;
    }).catch(() => caches.match('./index.html')))
  );
});

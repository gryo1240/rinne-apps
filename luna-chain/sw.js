/**
 * ルナチェイン｜Service Worker
 *
 * ★消すキャッシュは自分の接頭辞だけに絞る★
 *   caches.keys() は**オリジン単位**で返るので、絞らないと同じGitHub Pages上の
 *   他アプリのキャッシュまで全部消してしまう。
 *
 * ★音源(mp3)はここで一切さわらない★
 *   Rangeリクエストと Cache API の相性が悪く、溜まらないか、溜まっても再生を壊す。
 *   詳しくは下の fetch ハンドラの説明を読むこと（2026-09-08 レビューで方針変更）。
 */
const CACHE = 'lunachain-v4';
/* ★音源用のキャッシュは 2026-09-08 に廃止した★（下の fetch の説明を読むこと）
   名前だけ残して activate の掃除対象から外し、古い端末に残った空の棚を消す。 */
/* ★先読みするのは「版が付かないURL」だけ★
   JSは importmap で `?v=中身のハッシュ` 付きのURLとして読まれるので、
   版なしのURLを先読みしても実際には使われない（容量を食うだけ）。
   JS・CSSは下の fetch ハンドラが、実際に読まれたURLのまま溜めていく。 */
const ASSETS = [
  './', './index.html', './manifest.json',
  './icon-192.png', './icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((k) => k.startsWith('lunachain-') && k !== CACHE)
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

  /* ★音源はService Workerで一切さわらない★（2026-09-08 レビューで方針変更）
     もとは「キャッシュ優先」で溜めようとしていたが、これは成立しない:
       - `<audio>` からの取得にはブラウザが `Range: bytes=0-` を付ける。
         GitHub Pages はこれに **206** で答えるので `cache.put` は入れられない
         （Cache API は 206 を受け付けない）。つまり**永久に溜まらない**
       - まぐれで200が溜まった場合は、今度は Range 付きの要求に
         **フル(200)のレスポンスを返す**ことになり、Safari のメディア要素で再生に失敗しうる
     素通ししてブラウザ本来のHTTPキャッシュに任せる。オフラインでBGMは鳴らなくなるが、
     **オンラインで確実に鳴るほうが大事**（曲が無くても遊べる作りにしてある）。 */
  if (/\.(mp3|ogg|m4a|wav)$/i.test(url.pathname)) return;

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

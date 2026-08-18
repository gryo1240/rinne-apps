/**
 * Service Worker（オフライン対応）
 *
 * 【方針】ネットワーク優先・キャッシュは保険。
 * セーブは localStorage なのでSWとは無関係だが、
 * **古いJSと新しいJSが混ざるとセーブ形式の食い違いで壊れうる**ため、
 * バージョンを上げたら古いキャッシュを必ず捨てる。
 */

// ★セーブ形式を変えたら必ず上げる。v2 = シナリオ実装（SAVE_VERSION 3・2026-08-03）
// v3 = 絵と音が全部入った（エフェクト11種・表情差分4人・BGM5曲・2026-08-08）
//
// ★2026-08-09以降、**デプロイのたびに必ず上げること**（理由が1つ増えた）。
//   JSのURLに `?v=<中身のハッシュ>` が付くようになったので、
//   更新するたびに**古い版のエントリがこのキャッシュに残り続けて増えていく**
//   （48モジュール × 更新回数）。番号を上げれば下の activate が古い箱ごと捨てる。
// v4 = 効果音を差し替え・追加（win/clash）＋つまみを曲と効果音に分けた（2026-08-12）
// v5 = 朔の窖・望の櫓の敵8体の紋と、背景4枚を入れ替え／追加（2026-08-14）
// v6 = 月喰みの獣（額縁を落とした）と望鐘（紙の地色を落とした）の紋を差し替え（2026-08-14）
// v7 = 起動時の絵の先読みとローディング画面を追加（2026-08-16）
const CACHE = 'rinne-tou-v7';

/**
 * 音源だけ別のキャッシュに分ける（2026-08-05）。
 *
 * 理由: 下の activate は「CACHE 以外を全部捨てる」ので、**コードを直して
 * CACHE を v3 に上げるたびに、数十MBの音源まで道連れで消えて再ダウンロードになる**。
 * 音源は中身が変わらないので、コードのバージョンとは別に管理する。
 * 曲を差し替えたときだけ、この番号を手で上げること。
 */
/**
 * ★v2 に上げた（2026-08-12）。
 *   2026-08-11 に `make_game_se.py` で**既存11本を含む全部を再変換**しているため、
 *   ブラウザが持っている音は、いまリポジトリにあるものと中身が違う可能性がある。
 *   効果音のURLには `?v=` が付かない（＝中身が変わってもURLが変わらない）ので、
 *   ここを上げないと**古い音が鳴り続ける**。
 *   オーナーから「戦闘終了後の音が出ていない」という指摘があり、
 *   実機では鳴っていることを確認できたので、残る筋としてここを更新した。
 */
const AUDIO_CACHE = 'rinne-tou-audio-v2';
/**
 * 絵も別の箱にする（2026-08-16 オーナー指摘
 * 「毎回ゲームをスタートしたとき、画像の読み込みが遅れる場合がある」）。
 *
 * 【原因】絵のURLには `?v=` が付かないので、下の**通信優先**の枝に落ちていた。
 *   つまり起動のたびに約8MBぶんの絵を取りに行っていた（だから「毎回」だった）。
 * 【直し方】音源とまったく同じ扱いにする。ヒットしたら即返し、
 *   コードの CACHE を上げても道連れで消さない（消すと毎デプロイで8MB再取得になる）。
 * ⚠ **絵を差し替えたら、この番号を手で上げること。**
 *   URLが同じままなので、上げないと古い絵が出続ける（音源と同じ約束）。
 */
const IMG_CACHE = 'rinne-tou-img-v1';
const KEEP = [CACHE, AUDIO_CACHE, IMG_CACHE];

/**
 * 後片付けしてよいキャッシュの見分け方（2026-08-09 修正）。
 *
 * ★`caches.keys()` は**オリジン単位**で、SWのスコープは一切関係ない。
 *   公開先の gryo1240.github.io は全アプリで同じオリジンなので、
 *   接頭辞で絞らずに「KEEP以外を全部消す」と、
 *   **輪廻の塔を開いた瞬間に moon-dodge・koyomi-jikenbo・tsuki-usagi など
 *   他アプリのオフラインキャッシュまで道連れで消える**。
 *   他アプリの sw.js は最初から接頭辞で絞ってあり、ここだけが抜けていた。
 */
const MINE = (k) => k.startsWith('rinne-tou-');
const isAudio = (url) => /\.(mp3|ogg|m4a|wav)$/i.test(url.pathname);
const isImage = (url) => /\.(png|jpe?g|webp|gif|svg)$/i.test(url.pathname);

/**
 * 導入時に先に取っておくもの。
 *
 * ★JSとCSSはここに書かない（2026-08-09）。`tools/gen_importmap.py` で
 *   `?v=中身のハッシュ` が付くようになったため、版なしのURLで先取りしても
 *   `caches.match` は既定で ?以降も見るので**一生ヒットしない**（無駄な先取りになる）。
 *   実際に読まれたURLは下の fetch ハンドラがそのまま控えるので、
 *   一度オンラインで開けばオフラインでも動く。
 */
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(ASSETS))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())   // 1つ落ちても導入自体は止めない
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => MINE(k) && !KEEP.includes(k)).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;   // 外部への通信は素通し

  // ★音源だけは**キャッシュ優先**。
  //   他と同じ「通信優先」にしていると、曲を入れた瞬間から
  //   **毎セッション約5MBを取りに行く**ことになる（2026-08-08にBGM5曲を入れて顕在化）。
  //   曲は中身が変わらない前提で AUDIO_CACHE の番号を手で上げる運用なので、
  //   ここはヒットしたら即返してよい。差し替えたら AUDIO_CACHE を上げること
  if (isAudio(url)) {
    e.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok && res.status !== 206) {
          const copy = res.clone();
          caches.open(AUDIO_CACHE).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      }).catch(() => Response.error()))
    );
    return;
  }

  // ★絵も**キャッシュ優先**（2026-08-16）。理由と約束は IMG_CACHE の注記を参照
  if (isImage(url)) {
    e.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok && res.status !== 206) {
          const copy = res.clone();
          caches.open(IMG_CACHE).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      }).catch(() => Response.error()))
    );
    return;
  }

  // ★`?v=<中身のハッシュ>` が付いたURLは**キャッシュ優先**（2026-08-09）。
  //   tools/gen_importmap.py が付けるこの版は中身から計算しているので、
  //   **同じURLなら中身は絶対に同じ**（中身が変われば必ず別のURLになる）。
  //   つまり再検証する意味がまったく無い。音源と同じ理屈でヒットしたら即返してよく、
  //   毎起動で48本の条件付きGETが飛ぶのも防げる。
  if (url.search.startsWith('?v=')) {
    e.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok && res.status !== 206) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      }).catch(() => Response.error()))
    );
    return;
  }

  e.respondWith(
    fetch(req)
      .then((res) => {
        // 取れたものは控えておく（次回オフラインで使う）。
        // ★206（部分取得）を put すると Cache API が必ず例外を投げる。
        //   catch で握り潰されるので「なぜか一生キャッシュされない」形で表に出る。
        //   音源を <audio> で鳴らすと 206 になるため、先に弾いておく
        if (res.ok && res.status !== 206) {
          const copy = res.clone();
          const box = isAudio(url) ? AUDIO_CACHE : (isImage(url) ? IMG_CACHE : CACHE);
          caches.open(box).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(req).then((hit) => {
        if (hit) return hit;
        // ★index.html を返すのは画面遷移のときだけ。
        //   JSの要求にHTMLを返すとMIMEエラーになり、原因が分からなくなる
        if (req.mode === 'navigate') return caches.match('./index.html');
        return Response.error();
      }))
  );
});

/**
 * 【承知のうえで残している弱点】オフライン起動は「最後に丸ごと読み切れた版」に依存する
 *   （2026-08-09 レビュー指摘・公開前なので対処せず記録に留める）
 *
 * 新しい index.html だけ取れた直後に回線が切れると、そこが参照する `?v=…` のJSは
 * まだキャッシュに無いので、オフラインの間ずっと救済画面になる。
 * **わざと直していない**。ここで「版を無視して古いJSに当てる」フォールバックを足すと、
 * まさに今回の事故（新旧の混在）をオフラインで再現させることになるため。
 *
 * 本筋の直し方は「版付きURLの一覧を install 時に addAll して**版一式を原子的に先取り**する」。
 * 更新が増えて実害が出たらそちらへ移すこと（`tools/gen_importmap.py` に一覧を吐かせる）。
 */

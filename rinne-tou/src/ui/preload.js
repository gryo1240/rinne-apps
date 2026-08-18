/**
 * 起動時の絵の先読み（2026-08-16 新設・オーナー指摘
 * 「毎回ゲームをスタートしたとき、画像の読み込みが遅れる場合がある。
 *   毎回起動時は最初にローディングの時間を設けた方がいいのでは？」）
 *
 * 【なぜ「毎回」だったのか】
 * 絵のURLには `?v=` が付かないので、Service Worker の**通信優先**の枝に落ちていた。
 * つまり起動のたびに画像を取りに行っており、回線が細いと
 * 「先に画面が出て、あとから背景と紋が差し込まれる」形になっていた。
 * → SW側を**キャッシュ優先**に変え（sw.js の isImage）、そのうえでここが先読みする。
 *
 * 【どこまで待たせるか】
 * ★待たせるのは**軽くて必ず出るもの**だけ（背景9枚・紋・エフェクト＝約3MB）。
 *   立ち絵（約5MB）は会話に入るまで要らないので、始まってから裏で読む。
 * ★**必ず先へ進む**こと。読めない絵が1枚あっても、回線が死んでいても、
 *   上限の秒数で打ち切って始める。ローディングは待たせる装置であって、
 *   閉じ込める装置ではない（絵は無くても紋で遊べる作りにしてある）。
 */

import { ART_MON, ART_FX, ART_BG, ART_CHARA, ART_FACE } from '../../assets/art-manifest.js';

/** これ以上は待たせない（ミリ秒）。超えたら残りは裏で読み続ける */
export const BOOT_TIMEOUT_MS = 8000;

/** 起動前に読んでおくもの（軽い・最初の画面から使う） */
export function bootUrls() {
  return [
    /**
     * ★タイトルのキービジュアルは `ART_BG` に無い（`screen_title.js` が
     *   拡張子を順に試して自前で読む作り）ので、ここに名指しで足す。
     *   **プレイヤーが最初に見る1枚**なので、これを外すと先読みの意味が半分になる。
     */
    'assets/bg/title.jpg',
    ...[...ART_BG].map((id) => `assets/bg/${id}.jpg`),
    ...[...ART_MON].map((id) => `assets/mon/${id}.png`),
    ...[...ART_FX].map((id) => `assets/fx/${id}.png`),
  ];
}

/** 始まってから裏で読むもの（重い・会話に入るまで要らない） */
export function laterUrls() {
  return [
    ...[...ART_CHARA].map((id) => `assets/chara/${id}.png`),
    ...[...ART_FACE].map((key) => `assets/chara/${key}.png`),
  ];
}

/** 1枚読む。**失敗しても reject しない**（1枚の欠けで起動を止めない） */
function one(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = url;
  });
}

/**
 * まとめて読む。
 * @param {string[]} urls
 * @param {(done:number, total:number)=>void} [onProgress]
 * @param {number} [timeoutMs] 0以下なら待ち切る（裏読み用）
 */
export function preload(urls, onProgress, timeoutMs = 0) {
  const total = urls.length;
  let done = 0;
  const tick = () => { done++; if (onProgress) onProgress(done, total); };
  const all = Promise.all(urls.map((u) => one(u).then(tick)));
  if (timeoutMs <= 0) return all;
  // ★先に終わったほうを採る。打ち切っても読み込み自体は裏で続く
  return Promise.race([all, new Promise((r) => setTimeout(r, timeoutMs))]);
}

/**
 * ローディングの幕。**呼び出し側が閉じるまで出しっぱなし**にする。
 * ★`#app` の中に作らない。`render()` は `#app` を空にするので、
 *   中に置くと最初の描画で黙って消える。
 */
export function showBootScreen() {
  const el = document.createElement('div');
  el.id = 'boot';
  el.className = 'boot';
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  el.innerHTML = '<div class="boot__inner">'
    + '<div class="boot__title">輪廻の塔</div>'
    + '<div class="boot__bar"><div class="boot__fill" id="bootFill"></div></div>'
    + '<div class="boot__note" id="bootNote">絵を読み込んでいます…</div>'
    + '</div>';
  document.body.appendChild(el);
  const fill = el.querySelector('#bootFill');
  const note = el.querySelector('#bootNote');
  return {
    progress(done, total) {
      const pct = total > 0 ? Math.round((done / total) * 100) : 100;
      if (fill) fill.style.width = `${pct}%`;
      if (note) note.textContent = `絵を読み込んでいます… ${pct}%`;
    },
    close() { el.remove(); },
  };
}

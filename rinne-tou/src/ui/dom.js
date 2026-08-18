/**
 * DOM の薄いヘルパ（UI層でだけ使う）
 *
 * 【方針】innerHTML を使わない。
 *   セーブ名・ランキング名はプレイヤーが自由に入力できるので、
 *   文字列を組み立ててHTMLとして流し込むと、そのまま脆弱性になる。
 *   h() は必ず textContent で入れるので、既定で安全。
 */

import { hasMon } from '../../assets/art-manifest.js';

/**
 * 要素を作る。
 *   h('div', 'panel', '本文')
 *   h('button', { class:'btn', onclick:fn, disabled:true }, '押す')
 *   h('div', null, [child1, child2])
 * @param {string} tag
 * @param {string|object|null} attrs クラス名の文字列 or 属性オブジェクト
 * @param {string|number|Node|Array|null} kids
 */
export function h(tag, attrs = null, kids = null) {
  const el = document.createElement(tag);
  if (typeof attrs === 'string') {
    el.className = attrs;
  } else if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style') el.style.cssText = v;
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, String(v));
    }
  }
  append(el, kids);
  return el;
}

export function append(el, kids) {
  if (kids == null) return el;
  if (Array.isArray(kids)) {
    for (const k of kids) append(el, k);
  } else if (kids instanceof Node) {
    el.appendChild(kids);
  } else {
    el.appendChild(document.createTextNode(String(kids)));
  }
  return el;
}

export function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }

/**
 * 枠の中身を**一度に**入れ替える（2026-08-10）。
 *
 * ★`clear(el)` してから足し直してはいけない。空になった一瞬だけページの高さが縮み、
 *   ブラウザがスクロール位置を先頭へ詰めてしまう。
 *   一覧のページ送りで実際に起きた（1302px 見ていたのに 0 へ飛んだ）。
 *   中身が同じ高さでも、**空を経由するだけ**で飛ぶ。
 * ★`build(枠)` は使い捨ての枠に描く。差し替えは `replaceChildren` の1回で済ませる。
 *
 * @param {Element} el   入れ替える先
 * @param {(box:Element)=>void} build  中身を描く関数
 */
export function swapInto(el, build) {
  const tmp = document.createElement('div');
  build(tmp);
  el.replaceChildren(...tmp.childNodes);
  return el;
}

export function $(sel, root = document) { return root.querySelector(sel); }

/** SVG 要素（階層マップ用。createElement では作れない） */
export function svg(tag, attrs = null, kids = null) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, String(v));
  }
  if (kids != null) {
    for (const k of [].concat(kids)) {
      if (k instanceof Node) el.appendChild(k);
      else el.appendChild(document.createTextNode(String(k)));
    }
  }
  return el;
}

// ── 紋（絵の差し替え機構・tech-design §6） ───────────────────

/**
 * 敵・キャラの見た目。画像があれば <img>、無ければ漢字1字。
 * **どちらでも枠サイズが同じ**なので、絵を入れてもレイアウトが動かない。
 * @param {{id:string,name:string,mon:string,color:string,alive?:boolean}} e
 * @param {string} size '' | 'sm' | 'lg'
 */
export function mon(e, size = '') {
  const cls = ['mon', size ? `mon--${size}` : '', e.alive === false ? 'mon--down' : ''].filter(Boolean).join(' ');
  // ★`art` を先に見る。敵の id は `onibi_0` のように個体ごとの連番なので、
  //   id だけで引くと種族の絵に当たらない（ボスはキャラと id が衝突する）
  const artId = (e.art && hasMon(e.art)) ? e.art : (hasMon(e.id) ? e.id : null);
  if (artId) {
    return h('img', { class: cls, src: `assets/mon/${artId}.png`, alt: e.name, loading: 'lazy' });
  }
  return h('span', { class: `${cls} mon--glyph`, style: `--c:${e.color || '#c9a227'}`, 'aria-label': e.name }, e.mon || '？');
}

// ── ゲージ ────────────────────────────────────────────────

/**
 * @param {number} cur
 * @param {number} max
 * @param {string} kind 'hp' | 'ki' | 'akari' | 'enemy'
 */
export function bar(cur, max, kind = 'hp', small = false) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (cur / max) * 100)) : 0;
  const low = kind === 'hp' && pct <= 30;
  const wrap = h('div', `bar bar--${kind}${low ? ' bar--low' : ''}${small ? ' bar--sm' : ''}`);
  wrap.setAttribute('role', 'progressbar');
  wrap.setAttribute('aria-valuenow', String(Math.round(cur)));
  wrap.setAttribute('aria-valuemax', String(Math.round(max)));
  wrap.appendChild(h('div', { class: 'bar__fill', style: `width:${pct}%` }));
  return wrap;
}

// ── 構え・系統のタグ ──────────────────────────────────────

export const STANCE_LABEL = { gou: '剛', shitsu: '疾', ju: '呪' };
export const LINE_LABEL = { ha: '破', ryu: '流', fu: '封', none: '—', all: '—' };

/** 敵の次の構え（予告）。本作のUIの核なので専用クラスで目立たせる */
export function telegraph(stance) {
  if (!stance) return h('span', 'tag tag--none', '【？】');
  return h('span', `telegraph tag--${stance}`, `【${STANCE_LABEL[stance] || '？'}】`);
}

export function lineTag(line) {
  const key = LINE_LABEL[line] ? line : 'none';
  return h('span', `tag tag--${key}`, `【${LINE_LABEL[line] || '—'}】`);
}

// ── 共通ダイアログ ────────────────────────────────────────

let toastTimer = 0;

/**
 * モーダルは同時に1つだけ。
 * 排他にしないと、確認ダイアログの表示中に自動セーブの失敗通知が割り込んで
 * ボタンを上書きし、**元の Promise が永久に未解決**になる（2026-08-02 レビュー指摘）。
 */
let modalOpen = false;
const modalQueue = [];

function openModal(build) {
  if (modalOpen) { modalQueue.push(build); return; }
  modalOpen = true;
  build();
}

function closeModal() {
  document.getElementById('modal').hidden = true;
  modalOpen = false;
  const next = modalQueue.shift();
  if (next) { modalOpen = true; next(); }
}

export function toast(text, ms = 2200) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = text;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, ms);
}

/**
 * 確認ダイアログ。window.confirm は端末によって出ないことがあるので自前で持つ。
 * @returns {Promise<boolean>}
 */
export function confirmBox(text, okLabel = 'はい', ngLabel = 'やめる') {
  return new Promise((resolve) => {
    openModal(() => {
      const box = document.getElementById('modal');
      const txt = document.getElementById('modalText');
      const btns = document.getElementById('modalBtns');
      txt.textContent = text;
      clear(btns);
      const done = (v) => { closeModal(); resolve(v); };
      btns.appendChild(h('button', { class: 'btn', onclick: () => done(false) }, ngLabel));
      const ok = h('button', { class: 'btn btn--primary', onclick: () => done(true) }, okLabel);
      btns.appendChild(ok);
      box.hidden = false;
      ok.focus();
    });
  });
}

/** 通知（OKだけ） */
/**
 * 「？」ボタン（2026-08-10 オーナー要望「編成・装備・鍛冶にヘルプを追加」）。
 *
 * ★中身は**その画面の見出しの横**に置く小さなボタン1つにする。
 *   画面の中に説明文を常設すると、狭い画面（390px）で本題が押し出される。
 * ★`alertBox` はプレーンテキスト。Markdown の記法を書いても、そのまま表示される。
 *
 * @param {string} title 見出し（「編成・作戦」など）
 * @param {string} text  本文
 */
export function helpBtn(title, text) {
  return h('button', {
    class: 'btn btn--sm btn--help', type: 'button',
    'aria-label': `${title}のヘルプ`,
    title: `${title}のヘルプ`,
    onclick: () => alertBox(`${title}\n\n${text}`, 'とじる'),
  }, '？');
}

export function alertBox(text, okLabel = 'とじる') {
  return new Promise((resolve) => {
    openModal(() => {
      const box = document.getElementById('modal');
      const txt = document.getElementById('modalText');
      const btns = document.getElementById('modalBtns');
      txt.textContent = text;
      clear(btns);
      const ok = h('button', {
        class: 'btn btn--primary',
        onclick: () => { closeModal(); resolve(true); },
      }, okLabel);
      btns.appendChild(ok);
      box.hidden = false;
      ok.focus();
    });
  });
}

/**
 * 自前で中身を組むモーダル（塔の選択・セーブの持ち出しなど）。
 * closeModal() を必ず呼んでもらうため、閉じる関数を渡す。
 */
export function customModal(build) {
  openModal(() => build({ close: closeModal }));
}

/** 数値の見やすい整形 */
export function n(v) { return Math.floor(v).toLocaleString('ja-JP'); }

/**
 * 銭の単位（2026-08-14 オーナー指示
 * 「店の銭だけど単位が欲しいね。数値だけじゃわからない」→ 単位は「文」を選択）。
 *
 * ★数だけを出している場所は**すべてこれを通す**。片方だけ単位が付いていると、
 *   同じ銭なのに別のものに見える（例: 店では「120文」、結果画面では「120」）。
 * ★「銭」は通貨そのものの呼び名として残す（「銭が足りません」はそのまま）。
 *   単位を付けるのは**額を示す数**だけ。
 */
export const ZENI_UNIT = '文';
export function zeni(v) { return `${n(v)}${ZENI_UNIT}`; }

/** 秒 → 「3時間24分」 */
export function hhmm(sec) {
  const h2 = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
  return h2 > 0 ? `${h2}時間${m}分` : `${m}分`;
}

/** 演出用の待ち。速度倍率で割る */
export function wait(ms, speed = 1) {
  return new Promise((r) => setTimeout(r, Math.max(0, ms / Math.max(0.25, speed))));
}

/**
 * 演出（点滅・揺れ・エフェクト画像）を止めるべきか（2026-08-08）。
 *
 * ★判定はここ1か所だけ。`save.settings.fx` を各画面で直接見ると、
 *   **端末側の設定と食い違って「CSSは止まっているのに絵だけ出る」**という
 *   ちぐはぐな状態になる。`data-fx` は app.js が両方を突き合わせて確定させた結果。
 * ★OSの「アニメーションを減らす」はここでは見ない。見ていた頃は、
 *   Windowsでアニメーションを切っている人に演出が丸ごと出なかった（オーナー環境で発覚）。
 *   OS設定は初回起動時の初期値としてだけ使う（app.js の defaultFx）。
 */
export function fxOff() {
  return document.documentElement.dataset.fx === 'off';
}

/**
 * **画面全体を揺らす**演出を止めるべきか（2026-08-08）。
 *
 * ★`fxOff()` と分けてあるのは意味が違うから。
 *   ビューポートが動く演出は乗り物酔いに近い症状を起こしうるので、
 *   ここだけは OS の「アニメーションを減らす」も尊重する。
 *   小さな絵の点滅やダメージ数字は画面を動かさないので `fxOff()` だけで判断する。
 */
export function shakeOff() {
  if (fxOff()) return true;
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
  catch (e) { return false; }
}

/**
 * 画面を揺らす（大ダメージの手応え・2026-08-08 オーナー要望）。
 *
 * @param {'small'|'big'} level 削られた割合が25%以上なら small、50%以上なら big
 *
 * ★揺らすのは `.battle-stage`（数字とエフェクトの層を**含む**要素）。
 *   外側の別の祖先に掛けると、`getBoundingClientRect()` で測った座標と
 *   実際の描画位置がズレて、数字とエフェクトが敵から離れて飛ぶ。
 * ★連続で当たっても二重に掛からないよう、クラスを外してから付け直す。
 */
export function shakeScreen(level = 'small') {
  if (shakeOff()) return;
  const el = document.querySelector('.battle-stage');
  if (!el) return;
  el.classList.remove('shake--small', 'shake--big');
  void el.offsetWidth;                    // 付け直しを効かせるための再計算
  const cls = level === 'big' ? 'shake--big' : 'shake--small';
  el.classList.add(cls);
  // ★片付けはタイマーで。animationend は演出OFFのとき永久に来ない
  setTimeout(() => el.classList.remove(cls), level === 'big' ? 420 : 260);
}

/**
 * 「開いて読む」項目（2026-08-12 オーナー指摘
 *  「持ち物や戦歴は縦に長すぎる。敵や道具、装備をボタン選択して読むようにして縦を短くして」）。
 *
 * ★`<details>` を使う。自前でボタンと状態を持つと、
 *   ①開閉のたびに画面を作り直してスクロールが飛ぶ ②キーボードで開けない
 *   ③読み上げソフトに「折りたたみ」だと伝わらない、の3つを全部作り込むことになる。
 *   ブラウザの標準要素なら、そのどれもタダで付いてくる。
 * ★閉じている間、中身は**DOMには在るが描画されない**。
 *   図鑑は65項目あるので、開いている1つぶんしか高さを取らないのが要点。
 *
 * @param {object} o
 * @param {string|Node} o.title 見出し（畳んでいるときに見える1行）
 * @param {string|Node} [o.right] 右端の数など
 * @param {boolean} [o.open]  最初から開いておくか
 * @param {boolean} [o.dim]   未取得などで沈めるか
 * @param {string|Node|Array} body 開いたときに出る中身
 */
export function fold(o, body) {
  const sum = h('summary', 'fold__sum', [
    h('div', 'fold__main', o.title),
    o.right != null ? h('div', 'fold__right', o.right) : null,
  ]);
  return h('details', {
    class: `fold${o.dim ? ' fold--off' : ''}`,
    open: o.open ? true : null,
  }, [sum, h('div', 'fold__body', body)]);
}

/**
 * 章ごとのまとまり（図鑑の「敵」「装備」など）。既定で**閉じておく**。
 * 開いていると、それだけで画面が数千pxになる。
 */
export function foldSection(title, count, body, open = false) {
  return h('details', { class: 'foldsec', open: open ? true : null }, [
    h('summary', 'foldsec__sum', [
      h('span', 'foldsec__title', title),
      count != null ? h('span', 'foldsec__count', count) : null,
    ]),
    h('div', 'foldsec__body', body),
  ]);
}

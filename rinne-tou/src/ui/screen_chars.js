/**
 * 人物帳（2026-08-14 新設・オーナー指示
 * 「各キャラのステータスが分かるページが欲しい。あと、各キャラのプロフィールも
 *   画像とともに読めるページが欲しい。プロフィールの情報はストーリーが進むたびに
 *   読めるページが増えるように」）
 *
 * 【この画面の役割】読むだけ。**ここでは何も変えない**（編成・装備・鍛冶は編成画面の仕事）。
 *
 * ★プロフィールは**開いた項目だけ**を出す。まだの項目は数だけ見せる
 *   （数も隠すと、増えていることに気づけない）。
 * ★ステータスは**編成画面の「ステータス」タブへ移した**（2026-08-14 オーナー指示
 *   「ステータスページを現状の人物帳から移動しましょう」）。
 *   あちらはレベル・装備・わざと同じ場所で見るもの。ここは**読み物**に徹する。
 */

import { h, fold, swapInto, customModal } from './dom.js';
import { charaSrc, faceListOf } from '../../assets/art-manifest.js';
import { SPEAKER_BY_ID } from '../../data/chars.js';
import * as P from '../meta/profile.js';

export function render(ctx) {
  const save = ctx.save;
  const root = h('div');
  root.appendChild(h('h1', 'screen-title', '人物帳'));

  if (!save) {
    root.appendChild(h('div', 'panel', '記録が読み込まれていません。'));
    root.appendChild(h('button', {
      class: 'btn btn--primary', style: 'margin-top:14px', onclick: () => ctx.go('title'),
    }, 'タイトルへ戻る'));
    return root;
  }

  const body = h('div');
  root.appendChild(body);
  drawProfiles(ctx, body);

  root.appendChild(h('button', {
    class: 'btn', style: 'margin-top:14px', onclick: () => ctx.go('home'),
  }, '祠へ戻る'));
  return root;
}

// ── プロフィール ──────────────────────────────────────────

function drawProfiles(ctx, box) {
  const save = ctx.save;
  const roster = P.roster(save);

  if (roster.length === 0) {
    box.appendChild(h('div', 'panel dim', 'まだ誰のことも分かっていません。'));
    return;
  }

  // ★文面はオーナー指定のまま（2026-08-14「『話が進むと項目が増えます。（現在〇%開放）』としましょう」）
  box.appendChild(h('p', 'small dim',
    `話が進むと項目が増えます。（現在${P.totalPercent(save)}%開放）`));

  const who = roster.some((p) => p.id === ctx.state.params?.who)
    ? ctx.state.params.who : roster[0].id;

  // 人を選ぶ帯
  const pick = h('div', { class: 'btn-row btn-row--wrap', style: 'margin-top:8px' },
    roster.map((p) => h('button', {
      class: who === p.id ? 'btn btn--primary btn--sm' : 'btn btn--sm',
      onclick: () => ctx.go('chars', { who: p.id }),
    }, (SPEAKER_BY_ID[p.id] || {}).name || p.id)));
  box.appendChild(pick);

  const pane = h('div', { style: 'margin-top:10px' });
  box.appendChild(pane);
  // ★swapInto は「枠を受け取って描く関数」を渡す（中身そのものを渡すのではない）
  swapInto(pane, (tmp) => tmp.appendChild(buildProfile(save, who)));
}

function buildProfile(save, id) {
  const p = P.PROFILE_BY_ID[id];
  const def = SPEAKER_BY_ID[id] || {};
  const src = charaSrc(id, null);
  const prog = P.progressOf(save, id);
  const out = h('div');

  out.appendChild(h('div', 'chars-head', [
    /**
     * ★押すと大きく見られる（2026-08-15 オーナー指示
     *   「各キャラの画像をタップorクリックすると拡大図を表示するように」）。
     *   人物帳の枠は96pxしかなく、せっかくの立ち絵が顔しか見えない。
     * ★立ち絵が無い人でも成立させる（紋の1字に落とす。会話画面と同じ作法）。
     *   その場合は拡大しても意味が無いので、押せなくしておく。
     */
    src
      ? h('button', {
        class: 'chars-face-btn', type: 'button',
        'aria-label': `${def.name || id}の立ち絵を大きく見る`,
        onclick: () => showFace(id, def, src),
      }, h('img', { class: 'chars-face', src, alt: `${def.name || id}の立ち絵`, loading: 'lazy' }))
      : h('div', { class: 'chars-face chars-face--mon', style: `color:${def.color || '#fff'}` }, def.mon || '？'),
    h('div', 'chars-head__text', [
      h('div', 'chars-name', [
        h('span', { style: `color:${def.color || 'inherit'}` }, def.name || id),
        // ★読みが名前と同じ人（ともし）には添えない。「ともし　ともし」になる
        p.yomi && p.yomi !== def.name ? h('span', 'dim small', `　${p.yomi}`) : null,
      ]),
      h('div', 'small', p.title),
      h('div', 'small dim', `読めた項目 ${prog.open}／${prog.total}`),
    ]),
  ]));

  const list = h('div', { class: 'list', style: 'margin-top:10px' });
  let locked = 0;
  for (const e of p.entries) {
    if (!P.isOpen(save, e)) { locked++; continue; }
    list.appendChild(fold({ title: e.label, open: false }, h('div', null, e.text)));
  }
  out.appendChild(list);

  if (locked > 0) {
    out.appendChild(h('p', 'small dim',
      `まだ読めない項目が ${locked} つあります。話が進むと開きます。`));
  }
  return out;
}

/**
 * 立ち絵を大きく見る（2026-08-15 新設／2026-08-16 に表情の切り替えを足した）。
 *
 * ★画面いっぱいまで伸ばさない。`max-height` を画面の高さに合わせて、
 *   縦長のスマホでも**全身が1枚に収まる**ようにする（切れると拡大の意味が無い）。
 * ★とじる導線は2つ（背景を押す／ボタン）。会話画面と違い、ここは寄り道なので
 *   誤って押しても戻れることを優先する。
 * ★表情差分（2026-08-16 オーナー指示「他の表情差分も見えるようにしましょうか」）。
 *   会話の中では一瞬しか出ないので、ここで並べて見られるようにする。
 *   **絵を作り直さない**。差分が1枚も無い人（ともし）は切り替えの帯ごと出さない。
 * ★切り替えは `img.src` の差し替えだけ。モーダルを開き直すと、そのたびに
 *   画面が先頭へ戻って見比べにならない。
 */
function showFace(id, def, src) {
  const faces = faceListOf(id);
  customModal(({ close }) => {
    const txt = document.getElementById('modalText');
    const btns = document.getElementById('modalBtns');
    txt.textContent = '';

    const img = h('img', { class: 'chars-zoom__img', src, alt: `${def.name || id}の立ち絵` });
    const caption = h('div', { class: 'small dim center', style: 'margin-top:6px' }, def.name || id);

    const row = faces.length > 1
      ? h('div', { class: 'btn-row btn-row--wrap', style: 'margin-top:8px;justify-content:center' },
        faces.map((f, i) => {
          const btn = h('button', {
            class: `btn btn--sm${i === 0 ? ' btn--primary' : ''}`, type: 'button',
            onclick: () => {
              img.src = f.src;
              img.alt = `${def.name || id}の立ち絵（${f.label}）`;
              caption.textContent = `${def.name || id}　${f.label}`;
              for (const b of row.children) b.className = 'btn btn--sm';
              btn.className = 'btn btn--sm btn--primary';
            },
          }, f.label);
          return btn;
        }))
      : null;

    txt.appendChild(h('div', 'chars-zoom', [img, caption, row]));
    btns.replaceChildren(h('button', { class: 'btn btn--primary', onclick: close }, 'とじる'));
    document.getElementById('modal').hidden = false;
  });
}

/**
 * 持ち物の画面（2026-08-12 新設・オーナー指示
 * 「今の持ち物が全然わからないので『持ち物』を見える場所を作ってほしい。
 *   各道具の説明をも追加しておいて」）
 *
 * 【この画面の役割】**いま何を持っていて、それが何に使えるか**を1画面で答えること。
 * それまで、素材は鍛冶と錬気の画面に数字だけ出ており、
 * 月齢素材にいたっては**どこにも出ていなかった**（貯まっていることすら分からない）。
 *
 * ★ここは読むだけの画面。使う操作は置かない。
 *   道具を使う場所は塔の中（探索画面の「道具」）で、そこと二重に持たない。
 *
 * ★説明は**畳んでおく**（2026-08-12 オーナー指摘「縦に長すぎる」）。
 *   1項目あたり4行の説明を全部開いておくと、12項目で画面が5画面ぶんになり、
 *   「いま何をいくつ持っているか」という一番の用が果たせない。
 *   畳めば「名前と数」の一覧になり、知りたい1つだけ開けばよくなる。
 */

import { h, n, fold, zeni } from './dom.js';
import { ITEMS, MAT_INFO } from '../../data/items.js';
import { MAT_NAME, STONE, RENKI_MAT } from '../meta/growth.js';
import { PHASE_EFFECT } from '../core/time.js';
import { BASES } from '../../data/equips.js';

/** 月齢素材のid（月の並び順）。`core/time.js` が唯一の出どころ */
const MOON_MATS = Object.values(PHASE_EFFECT).map((p) => p.material);

export function render(ctx) {
  const save = ctx.save;
  const root = h('div');
  root.appendChild(h('h1', 'screen-title', '持ち物'));

  if (!save) {
    root.appendChild(h('div', 'panel', '記録が読み込まれていません。'));
    root.appendChild(h('button', {
      class: 'btn btn--primary', style: 'margin-top:14px', onclick: () => ctx.go('title'),
    }, 'タイトルへ戻る'));
    return root;
  }

  // ── 銭 ──
  root.appendChild(h('div', 'panel', [
    h('div', 'kv', [h('span', 'kv__k', '銭'), h('span', 'kv__v gold', zeni(save.inv.zeni || 0))]),
    // ★塔の商人で何が買えるかは商人の画面に出ている。ここは**持ち帰るまで自分の物ではない**
    //   という、この画面でしか言えないことだけを残す（2026-08-16）
    h('p', 'small dim', '銭は持ち帰ってはじめて自分のものになります'),
  ]));

  root.appendChild(h('p', 'small dim', '名前を押すと説明が開きます。'));

  // ── 道具 ──
  root.appendChild(h('h2', 'sec-title', '道具'));
  for (const it of ITEMS) {
    const have = save.inv.items?.[it.id] || 0;
    root.appendChild(fold({
      title: h('span', have > 0 ? '' : 'dim', it.name),
      right: h('span', have > 0 ? 'gold' : 'dim', `${have}`),
      dim: have <= 0,
    }, [
      h('div', null, it.desc),
      h('div', 'list__sub dim', `入手: ${it.from}`),
      it.note ? h('div', 'list__sub dim', it.note) : null,
    ]));
  }

  // ── 素材 ──
  root.appendChild(h('h2', 'sec-title', '素材'));
  for (const el of matRows(save, [STONE, RENKI_MAT])) root.appendChild(el);

  // ── 月齢素材 ──
  root.appendChild(h('h2', 'sec-title', '月の素材'));
  root.appendChild(h('p', 'small dim',
    '装備を鍛えるときに、装備ごとに決まった素材が要ります。'));
  for (const el of matRows(save, MOON_MATS, true)) root.appendChild(el);

  // ── 装備の数 ──
  const equips = (save.inv.equips || []).length;
  root.appendChild(h('div', { class: 'panel', style: 'margin-top:14px' }, [
    h('div', 'kv', [h('span', 'kv__k', '持っている装備'), h('span', 'kv__v', `${n(equips)}点`)]),
    // ★売り場は「露店」だけになった（2026-08-16 に装備画面から「売る」を外した）。
    //   ここに「売却は編成・装備から」と書いたままだと、無いボタンを探させることになる
    h('p', 'small dim', '着せ替えは「装備」、売るのは「露店」から'),
  ]));

  root.appendChild(h('button', {
    class: 'btn', style: 'margin-top:14px', onclick: () => ctx.go('home'),
  }, '祠へ戻る'));
  return root;
}

/**
 * 素材の行（畳んである）。
 * @param {boolean} withUse 月齢素材のとき、**どの装備に使うか**まで出す
 */
function matRows(save, ids, withUse = false) {
  const out = [];
  for (const id of ids) {
    const info = MAT_INFO[id] || {};
    const have = save.inv.mats?.[id] || 0;
    // ★「何を鍛えるのに要るのか」を素材の側からも引けるようにする。
    //   装備の側にしか書いていないと、素材を見ても使い道が分からないままになる
    const uses = withUse ? BASES.filter((b) => b.mat === id).map((b) => b.name) : [];
    out.push(fold({
      title: h('span', have > 0 ? '' : 'dim', MAT_NAME[id] || id),
      right: h('span', have > 0 ? 'gold' : 'dim', `${n(have)}`),
      dim: have <= 0,
    }, [
      h('div', null, info.desc || ''),
      info.from ? h('div', 'list__sub dim', `入手: ${info.from}`) : null,
      uses.length > 0 ? h('div', 'list__sub dim', `鍛冶で使う装備: ${uses.join('・')}`) : null,
      info.note ? h('div', 'list__sub dim', info.note) : null,
    ]));
  }
  return out;
}

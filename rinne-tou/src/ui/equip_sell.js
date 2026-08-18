/**
 * 装備を選んで売る仕掛け（2026-08-15 新設・オーナー指示
 * 「露店や装備の売るときには、チェックボックスを表示して、チェックをつけた装備を
 *   売れるようにしましょう。露店でも装備も10点だけでなく、ページ送りを付けて」）
 *
 * 【この部品の役割】**選んだ状態の持ち回りと、売る操作**だけ。
 * 一覧の見た目は画面ごとに違う（装備画面は「つける」や差分を出す）ので、
 * 行の中身は各画面が作り、ここは「チェック箱」と「まとめの行」を配る。
 *
 * ★選んだ状態は `ctx.state.params.sel` に置く（既存流儀）。画面を離れると消えてよい。
 * ★装備中のものは**チェックできない**。押せるのに売れない箱は、押した人を裏切る。
 * ★売る前に必ず件数と額を出して確かめる（取り返しがつかない操作のため）。
 */

import { h, confirmBox, toast, zeni } from './dom.js';
import * as G from '../meta/growth.js';

/** いま装備している uid の集合（この判定は1か所に置く） */
export function equippedSet(save) {
  const out = new Set();
  for (const c of Object.values(save.chars || {})) {
    for (const uid of c.equip || []) if (uid) out.add(uid);
  }
  return out;
}

/** 選んだ uid の集合を取り出す（無ければ空） */
export function selectionOf(ctx) {
  const cur = ctx.state.params || {};
  if (!Array.isArray(cur.sel)) cur.sel = [];
  return new Set(cur.sel);
}

function saveSelection(ctx, set) {
  const cur = ctx.state.params || {};
  cur.sel = [...set];
}

/** 1行ぶんのチェック箱。装備中なら押せない印を返す */
export function checkbox(ctx, e, equipped, redraw) {
  if (equipped.has(e.uid)) {
    return h('span', { class: 'dim small equipsel__lock', title: '装備中は売れません' }, '装備中');
  }
  const sel = selectionOf(ctx);
  const box = h('input', {
    type: 'checkbox', class: 'equipsel__box',
    'aria-label': `${G.equipName(e)} を売るものに入れる`,
  });
  box.checked = sel.has(e.uid);
  box.addEventListener('change', () => {
    const s = selectionOf(ctx);
    if (box.checked) s.add(e.uid); else s.delete(e.uid);
    saveSelection(ctx, s);
    redraw();
  });
  return box;
}

/**
 * まとめの行（選んだ数・額・売るボタン・全部選ぶ／解除）。
 * @param {object[]} listed いま画面に出ている（絞り込み後の）装備
 */
export function sellBar(ctx, listed, redraw) {
  const save = ctx.save;
  const sel = selectionOf(ctx);
  const equipped = equippedSet(save);
  const prev = G.sellPreview(save, (e) => sel.has(e.uid));
  /**
   * 絞り込みの中で、まだ選べるもの（装備中を除く）。
   *
   * ★変数名に日本語を使わないこと。`const 選べる = …` と書くと、
   *   `const` の直後の文字が識別子として連結され **`const選べる` という1つの名前**に
   *   読まれて、参照側が ReferenceError になる（2026-08-15 実機で踏んだ）。
   */
  const sellable = listed.filter((e) => !equipped.has(e.uid));
  const allOn = sellable.length > 0 && sellable.every((e) => sel.has(e.uid));

  const toggleAll = () => {
    const s = selectionOf(ctx);
    for (const e of sellable) { if (allOn) s.delete(e.uid); else s.add(e.uid); }
    saveSelection(ctx, s);
    redraw();
  };

  return h('div', 'equipsel', [
    h('div', { class: 'small', style: 'flex:1 1 auto' }, prev.count > 0
      ? [h('span', 'gold', `${prev.count}点`), `を選んでいます（${zeni(prev.gained)}）`]
      : [h('span', 'dim', 'まだ何も選んでいません')]),
    h('button', {
      class: 'btn btn--sm', type: 'button', disabled: sellable.length === 0,
      onclick: toggleAll,
    }, allOn ? 'ぜんぶ外す' : 'この絞り込みを選ぶ'),
    h('button', {
      class: 'btn btn--sm btn--danger', type: 'button', disabled: prev.count <= 0,
      onclick: async () => {
        const ok = await confirmBox(
          `選んだ装備 ${prev.count}点を売ります。\n`
          + `${zeni(prev.gained)}になります。売ったものは元に戻せません。`,
          '売る', 'やめる');
        if (!ok) return;
        const s = selectionOf(ctx);
        const r = G.sellEquipsWhere(save, (e) => s.has(e.uid));
        saveSelection(ctx, new Set());       // 売ったら選択は空に戻す
        toast(`${r.sold}点を売って ${zeni(r.gained)}になった`);
        ctx.saveNow(true);
        redraw();
      },
    }, '選んだものを売る'),
  ]);
}

/**
 * ページ送り（2026-08-15 オーナー指示「10点だけでなく、ページ送りを付けて」）。
 * @returns {{shown:object[], nav:Node|null, page:number, pages:number}}
 */
export function paginate(listed, cur, per, redraw, key = 'page') {
  const pages = Math.max(1, Math.ceil(listed.length / per));
  const page = Math.min(Math.max(0, Number(cur[key]) || 0), pages - 1);
  cur[key] = page;                       // 売って減ったとき、はみ出したページ番号を戻す
  const shown = listed.slice(page * per, page * per + per);
  if (pages <= 1) return { shown, nav: null, page, pages };

  const btn = (label, to, on) => h('button', {
    class: 'btn btn--sm', type: 'button', disabled: !on,
    onclick: () => { cur[key] = to; redraw(); },
  }, label);
  const nav = h('div', { class: 'btn-row', style: 'margin-top:8px;align-items:center' }, [
    btn('前へ', page - 1, page > 0),
    h('div', { class: 'small dim center', style: 'flex:1 1 auto' }, `${page + 1} / ${pages}`),
    btn('次へ', page + 1, page < pages - 1),
  ]);
  return { shown, nav, page, pages };
}

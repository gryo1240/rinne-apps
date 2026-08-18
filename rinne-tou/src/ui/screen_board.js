/**
 * 因果盤の画面（spec §6-5）
 *
 * 【この画面の役割】「因果を貯める理由」を一目で分からせること。
 * 49マスの盤面を出し、**いま開けるマスだけを光らせる**。
 * どのマスを先に取っても総額は同じ（コストは開放数だけで決まる）ので、
 * 順番の最適化に悩ませず、「次はどの力が欲しいか」だけを考えさせる。
 */

import { h, swapInto, alertBox, confirmBox, helpBtn, toast, n } from './dom.js';
import * as B from '../meta/board.js';
import * as D from '../meta/dispatch.js';   // 影送りの枠は上限で頭打ちになるので実効値を出す
import { CELL_INFO } from '../../data/board.js';

export function render(ctx) {
  const save = ctx.save;
  const root = h('div');
  root.appendChild(h('h1', 'screen-title', '因果盤'));

  // どの分岐にも戻る手段を置く（README 実バグ #9 の再発防止）
  if (!save) {
    root.appendChild(h('div', 'panel', '記録が読み込まれていません。'));
    root.appendChild(back(ctx, 'title', 'タイトルへ戻る'));
    return root;
  }

  if (!B.isUnlocked(save)) {
    root.appendChild(h('div', 'panel', [
      h('p', null, '盤はまだ暗いままだ。'),
      h('p', 'small dim', `塔の${B.UNLOCK_FLOOR - 1}階を越えると、因果を盤に置けるようになります。`),
    ]));
    root.appendChild(back(ctx, 'home', '祠へ戻る'));
    return root;
  }

  const panel = h('div');
  root.appendChild(panel);
  drawInto(ctx, panel);
  root.appendChild(back(ctx, 'home', '祠へ戻る'));
  return root;
}

function back(ctx, to, label) {
  return h('button', {
    class: 'btn btn--sm btn--inline', style: 'margin-top:14px', onclick: () => ctx.go(to),
  }, label);
}

/**
 * 盤の中身。**マスを開いたらここだけ描き直す**。
 * `ctx.render()` を呼ぶと画面が先頭へ飛び、盤の下の方を触っていた人が毎回迷子になる
 * （影送りで同じ問題を踏んだ・2026-08-03）。
 */
function drawInto(ctx, host) {
  // ★描き直しの宛先は**常に画面に付いている枠（host）**。
  //   `swapInto` に渡される使い捨ての枠を閉じ込めると、2回目以降の操作が画面に出ない。
  // ★`clear` してから足し直さない。空を経由した一瞬だけページの高さが縮み、
  //   ブラウザがスクロール位置を先頭へ詰める（一覧のページ送りで実際に起きた・2026-08-10）
  const redraw = () => drawInto(ctx, host);
  swapInto(host, (root) => buildBoard(ctx, root, redraw));
}

function buildBoard(ctx, root, redraw) {
  const save = ctx.save;

  const p = B.progressText(save);
  const cells = B.view(save);

  root.appendChild(h('div', 'statusbar', [
    h('span', 'statusbar__floor', `${p.opened}／${p.total}`),
    h('span', 'statusbar__akari', [h('span', 'dim', '因果 '), h('span', 'gold', n(save.karma.have || 0))]),
    h('span', 'statusbar__moon', p.done ? 'すべて開放' : `次のマス ${n(p.cost)}`),
  ]));
  root.appendChild(h('p', 'small dim',
    '開いているマスの隣にだけ広げられます。どのマスを先に取っても、かかる因果の合計は変わりません。'));

  // ── 盤面 ──
  const grid = h('div', {
    class: 'board',
    role: 'group',
    'aria-label': `因果盤 ${p.opened}／${p.total} マス開放`,
  });
  const canAfford = (save.karma.have || 0) >= p.cost;
  for (const c of cells) {
    const cls = ['board__cell'];
    if (c.open) cls.push('board__cell--on');
    else if (c.openable) cls.push(canAfford ? 'board__cell--next' : 'board__cell--near');
    else cls.push('board__cell--far');
    grid.appendChild(h('button', {
      class: cls.join(' '),
      style: `--c:${c.info.color}`,
      // ★開放済みも押せるようにする（内容の確認とキーボード操作のため）。
      //   disabled にするとタブ順から外れ、キーボードだけでは中身に到達できない
      'data-id': String(c.id),
      'aria-label': `${c.info.name}（${c.info.desc}）${c.open ? '開放済み' : c.openable ? '開けます' : 'まだ届きません'}`,
      onclick: () => (c.openable ? doOpen(ctx, c, p.cost, redraw) : tellCell(c)),
    }, c.info.short));
  }
  root.appendChild(grid);
  // ★盤の先を最初から見せる（未到達マスも薄く出す）。
  //   隠すと「影の因がどこにあるか」を知る手段が無く、
  //   この画面の唯一の意思決定（どの方向へ伸ばすか）が成立しない（2026-08-03 レビュー指摘）
  // ★凡例は「？」に畳む（2026-08-16 オーナー指示「マスの意味はヘルプマークで」）。
  //   7種類ぶんの色見本を常設すると、それだけで画面の3分の1を使っていた。
  //   置き場所は**盤のすぐ下**にする。説明したい相手（盤）から離すと見つけられない。
  root.appendChild(h('div', 'btn-row', [
    h('span', { class: 'small dim', style: 'flex:1 1 auto' }, '暗いマスもいずれ開けます'),
    helpBtn('マスの意味', legendText()),
  ]));

  // ── いま効いている力 ──
  //
  // ★ここは「盤が持っている値」ではなく「**実際に効いている値**」を出す。
  //   影送りの枠は SLOT_MAX=4 で頭打ちなので、3枚買っても+2しか増えないことがある。
  //   盤の主張をそのまま出すと「買っても何も起きないのに +3 と表示」になる
  //   （2026-08-03 レビュー指摘）
  const b = B.bonusOf(save);
  const lines = [];
  if (b.stat > 0) lines.push(`全員の全ステータス +${b.stat}`);
  if (b.hpMul > 1) lines.push(`最大HP +${Math.round((b.hpMul - 1) * 100)}%`);
  if (b.akari > 0) lines.push(`潜行の最大「灯」 +${b.akari}`);
  const slotGain = D.boardSlotGain(save);
  if (b.dispatchSlots > 0) {
    lines.push(slotGain >= b.dispatchSlots
      ? `影送りの枠 +${slotGain}`
      : `影送りの枠 +${slotGain}（枠は${D.SLOT_MAX}が上限なので、これ以上は増えません）`);
  }
  if (b.dropMul > 1) lines.push(`装備の拾いやすさ +${Math.round((b.dropMul - 1) * 100)}%`);
  if (b.karmaMul > 1) lines.push(`得られる因果 +${Math.round((b.karmaMul - 1) * 100)}%`);
  if (b.renkiMax > 0) lines.push(`錬気の上限 +${b.renkiMax}`);

  root.appendChild(h('h2', 'sec-title', 'いま効いている力'));
  root.appendChild(h('div', 'panel', lines.length
    ? lines.map((t) => h('div', null, t))
    : h('p', 'small dim', 'まだ何も置いていません。')));

}

/**
 * 「？」に入れる凡例。
 * ★色ではなく**盤に出ている文字（short）を先頭に置く**（spec §13-4 色だけに頼らない）。
 *   ヘルプは文字だけなので、色見本を出せないぶん、盤との対応は文字が唯一の手がかりになる。
 */
function legendText() {
  return Object.entries(CELL_INFO)
    .filter(([kind]) => kind !== 'center')
    .map(([, info]) => `${info.short}　${info.name}：${info.desc}`)
    .join('\n');
}

/** まだ開けないマスを押したとき。内容だけ伝える（押しても何も起きない、にしない） */
function tellCell(cell) {
  toast(`${cell.info.name}：${cell.info.desc}`, 2600);
}

async function doOpen(ctx, cell, cost, redraw) {
  const save = ctx.save;
  const chk = B.canOpen(save, cell.id, cost);
  if (!chk.ok) { await alertBox(chk.message || 'そのマスは開けません。'); redraw(); return; }

  const ok = await confirmBox(
    `「${cell.info.name}」を開きます。\n${cell.info.desc}\n\n因果 ${n(cost)} を使います（残り ${n((save.karma.have || 0) - cost)}）。\n` +
    '一度開いたマスは閉じられません。', '開く', 'やめる');
  if (!ok) return;

  const r = B.open(save, cell.id);
  if (!r.ok) { await alertBox(r.message || '開けませんでした。'); redraw(); return; }
  ctx.saveNow(true);
  toast(`${cell.info.name}が灯った`);
  redraw();
  // 盤ごと作り直すのでフォーカスが body へ飛ぶ。開いたマスへ戻す
  // （キーボード・読み上げの利用者が、押すたびに現在地を見失わないように）
  const again = document.querySelector(`.board__cell[data-id="${cell.id}"]`);
  if (again) again.focus({ preventScroll: true });
}

/**
 * ルナチェイン｜解放の表（★このファイルが唯一の正本★）
 *
 * ══════════════════════════════════════════════════════════════════
 *  解放ポイント「つきのかけら」は、**遊んだ量に対して払われる予算**であって、
 *  勝利の報酬ではない。負けても必ず貯まる。勝利は加速するだけ。
 *
 *  ★レビューで「勝利報酬にしないと達成感が出ない」と言われても戻さないこと。★
 *    上手い子は1時間で全部開けて終わり、勝てない子は1枚も開けられずに終わる——
 *    そして公開後、どちらが起きたかを我々は永久に知ることができない（テレメトリが無い）。
 * ══════════════════════════════════════════════════════════════════
 *
 * ★解放条件をUI側に書き写さないこと★（演出側と定義側の二重管理は必ずズレる）
 */

/** 1戦で得られるかけら。負けても必ず正の値になる */
export function shardsForMatch({ placed = 0, captured = 0, won = false }) {
  return Math.max(1, placed + captured * 2 + (won ? 20 : 0));
}

/**
 * 解放の表。at = 累計かけら。
 *   kind: 'slot'（カード枠）/ 'card'（わざカード）/ 'skin'（盤の見た目）
 */
export const UNLOCKS = [
  { at: 30,   kind: 'slot', value: 1,         label: 'カードを1まい もちこめる' },
  { at: 30,   kind: 'card', value: 'nagare',  label: 'ながれ星' },
  { at: 80,   kind: 'card', value: 'maki',    label: 'まきもどし' },
  { at: 150,  kind: 'card', value: 'tame',    label: 'ためうち' },
  { at: 300,  kind: 'slot', value: 2,         label: 'カードを2まい もちこめる' },
  { at: 300,  kind: 'card', value: 'kage',    label: 'かげぬり' },
  { at: 500,  kind: 'card', value: 'yose',    label: 'ひかりよせ' },
  { at: 750,  kind: 'card', value: 'kata',    label: 'つきかため' },
  { at: 1000, kind: 'card', value: 'kumo',    label: 'くもよび' },
  { at: 1400, kind: 'slot', value: 3,         label: 'カードを3まい もちこめる' },
  { at: 1400, kind: 'card', value: 'hoshi',   label: 'ほしよび' },
  { at: 1900, kind: 'card', value: 'shizume', label: 'しずめ' },
  { at: 2600, kind: 'card', value: 'haya',    label: 'はやおくり' },
  // ★盤面スキンとトロフィーは v1 では表に載せない★
  //   表に書いても読む側が無いと、貯めても無音・無表示で何も起きないのに
  //   「あと◯」とだけ言い続ける画面になる（教訓 dead-flag-promised-in-text）。
  //   実装した日に、同じコミットでこの表へ足すこと。
];

/** 累計かけらから、いま開いているものを求める */
export function unlockedAt(total) {
  let slots = 0;
  const cards = [], skins = [];
  for (const u of UNLOCKS) {
    if (total < u.at) continue;
    if (u.kind === 'slot') slots = Math.max(slots, u.value);
    else if (u.kind === 'card') cards.push(u.value);
    else skins.push(u.value);
  }
  return { slots, cards, skins };
}

/** 次に開くもの（画面に「あと◯」を出すため。★開いていない枠は見せない★） */
export function nextUnlock(total) {
  for (const u of UNLOCKS) if (total < u.at) return { ...u, remain: u.at - total };
  return null;
}

/** 全部開くまでに必要なかけら */
export const TOTAL_SHARDS = UNLOCKS[UNLOCKS.length - 1].at;

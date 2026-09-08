/**
 * ルナチェイン｜わざカード（全10種）
 *
 * ★設計のきまり★
 *   - 効果はすべて「1つの対象に対する1回の変化」に統一する。複合効果を作らない
 *     （説明なしで理解できる範囲に留めるため。読ませ始めた瞬間に入口が壊れる）
 *   - **必ず自分で対象を選ぶ**。ランダム効果を作らない（運で負けた感を残さない）
 *   - 1戦につき各1回
 *
 * ★カードの並び順＝解放の順序ではない★ 解放条件は data/unlock.js の1か所だけが持つ。
 *
 * 2026-09-08: 「かがみおき」は廃止。鏡はマスの能力ではなく盤単位の属性になったため、
 *             同じ枠を「ほしよび」（空マスを光の通り道に変える）に差し替えた。
 */
import { T_CRATER, T_STARDUST } from '../src/core/board.js';
import { rebuildGeometry, capAt, canPlace, isWallAt, isCloudy } from '../src/core/rules.js';

/**
 * pick の種類
 *   'own'   … 自分のマス
 *   'enemy' … 相手のマス
 *   'empty' … 空きマス（星屑・雲を除く）
 *   'place' … 置けるマス（空き or 自分）
 *   'none'  … 対象を選ばない
 */
export const CARDS = [
  {
    id: 'nagare', name: 'ながれ星', icon: '☄',
    text: 'すきな3つのマスに ひかりを1つずつ',
    pick: 'place', picks: 3,
    apply: (s, p, cells) => cells.map((i) => ({ t: 'add', i, n: 1 })),
  },
  {
    id: 'maki', name: 'まきもどし', icon: '↩',
    text: 'じぶんの さっきの1手を なかったことに',
    pick: 'none', picks: 0, special: 'undo',   // 盤の操作ではないので game 側で処理する
    apply: () => [],
  },
  {
    id: 'tame', name: 'ためうち', icon: '✦',
    text: 'じぶんのマス1つに ひかりを2つ',
    pick: 'own', picks: 1,
    apply: (s, p, cells) => [{ t: 'add', i: cells[0], n: 2 }],
  },
  {
    id: 'kage', name: 'かげぬり', icon: '◍',
    text: 'あいてのマス1つを からっぽに',
    pick: 'enemy', picks: 1,
    apply: (s, p, cells) => [{ t: 'clear', i: cells[0] }],
  },
  {
    id: 'yose', name: 'ひかりよせ', icon: '⇄',
    text: 'じぶんのひかりを 1つ となりへ移す',
    pick: 'own', picks: 2,                      // 1つ目=移す元、2つ目=移す先
    apply: (s, p, cells) => [{ t: 'sub', i: cells[0], n: 1 }, { t: 'add', i: cells[1], n: 1 }],
  },
  {
    id: 'kata', name: 'つきかため', icon: '◈',
    text: 'じぶんのマス1つが はじけにくくなる',
    pick: 'own', picks: 1,
    apply: (s, p, cells) => [{ t: 'terrain', i: cells[0], to: T_CRATER }],
  },
  {
    id: 'kumo', name: 'くもよび', icon: '☁',
    text: 'すきな空きマス1つを しばらく雲に',
    pick: 'empty', picks: 1,
    apply: (s, p, cells) => [{ t: 'cloud', i: cells[0], n: 2 }],
  },
  {
    id: 'hoshi', name: 'ほしよび', icon: '✧',
    text: 'すきな空きマス1つが ひかりの通り道に',
    pick: 'empty', picks: 1,
    apply: (s, p, cells) => [{ t: 'terrain', i: cells[0], to: T_STARDUST }],
  },
  {
    id: 'shizume', name: 'しずめ', icon: '▼',
    text: 'あいてで いちばん多いマスの ひかりを1つ減らす',
    pick: 'none', picks: 0,
    apply: (s, p) => {
      let best = -1, bv = -1;
      for (let i = 0; i < s.owner.length; i++) {
        if (s.owner[i] === 3 - p && s.count[i] > bv) { bv = s.count[i]; best = i; }
      }
      return best >= 0 ? [{ t: 'sub', i: best, n: 1 }] : [];
    },
  },
  {
    id: 'haya', name: 'はやおくり', icon: '»',
    text: 'もう1回 おける',
    pick: 'none', picks: 0, special: 'extra',
    apply: () => [],
  },
];

export const CARD_BY_ID = Object.fromEntries(CARDS.map((c) => [c.id, c]));
export const cardIndex = (id) => CARDS.findIndex((c) => c.id === id);

/** そのカードの対象として選べるマスか */
export function isValidTarget(s, card, i, player) {
  if (i < 0 || i >= s.owner.length) return false;
  switch (card.pick) {
    case 'own':   return s.owner[i] === player && !isCloudy(s, i);
    case 'enemy': return s.owner[i] === 3 - player;
    case 'empty': return s.owner[i] === 0 && !isWallAt(s, i) && !isCloudy(s, i);
    case 'place': return canPlace(s, i, player);
    default:      return false;
  }
}

/**
 * カードの効果を盤に反映する（連鎖は呼び出し側で解決する）。
 * 返り値は「連鎖のきっかけになりうるマス」の一覧。
 */
export function applyCardEffect(s, card, player, cells) {
  const ops = card.apply(s, player, cells) || [];
  const triggers = [];
  let terrainChanged = false;

  for (const op of ops) {
    switch (op.t) {
      case 'add':
        s.count[op.i] += op.n;
        s.owner[op.i] = player;
        triggers.push(op.i);
        break;
      case 'sub':
        s.count[op.i] = Math.max(0, s.count[op.i] - op.n);
        if (s.count[op.i] === 0) s.owner[op.i] = 0;
        break;
      case 'clear':
        s.count[op.i] = 0;
        s.owner[op.i] = 0;
        break;
      case 'cloud':
        s.cloud[op.i] = op.n;
        s.count[op.i] = 0;
        s.owner[op.i] = 0;
        break;
      case 'terrain':
        s.terrain[op.i] = op.to;
        if (op.to === T_STARDUST) { s.count[op.i] = 0; s.owner[op.i] = 0; }
        terrainChanged = true;
        break;
    }
  }
  // ★地形を変えたら幾何を作り直す★（忘れると容量と飛び先が食い違い、連鎖が壊れる）
  if (terrainChanged) rebuildGeometry(s);
  return triggers;
}

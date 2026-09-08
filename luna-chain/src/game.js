/**
 * ルナチェイン｜1戦の進行役
 *   ルール(core) ＋ わざカード ＋ 月ゲージ ＋ CPU を1つにまとめる。
 *   画面(ui)はこの層だけを触る。★画面側でルールを再計算しないこと★
 */
import { N } from './core/board.js';
import {
  newGame, applyMove, cloneState, legalMoves, countCells, capAt, canPlace, checkEnd,
} from './core/rules.js';
import { chooseMove, tierOf } from './ai/ai.js';
import { CARDS, CARD_BY_ID, applyCardEffect, isValidTarget } from '../data/cards.js';

/** 月ゲージ: 3連鎖以上でたまり、満月でカードが1枚撃てる */
export const GAUGE_FULL = 10;
const gaugeGain = (chain) => (chain >= 3 ? Math.min(chain, 8) : 0);

export function createMatch(opts = {}) {
  const {
    terrain, wrapX, komi = 1, tier = 3,
    myDeck = [], oppDeck = [], oppName = '', mySeat = 1,
  } = opts;

  const state = newGame({ terrain, wrapX, komi });
  // ★デッキは「席」に配る★
  //   席をあとからランダムに書き換えると、自分のカードがCPUの手に渡る（2026-09-08のレビューで発覚）。
  //   席の決定はこの関数の中だけで完結させ、外から match.mySeat を書き換えないこと。
  return {
    state,
    tier,
    mySeat,
    decks: { [mySeat]: myDeck.slice(0, 3), [3 - mySeat]: oppDeck.slice(0, 3) },
    oppName,
    gauge: { 1: 0, 2: 0 },
    usedCards: { 1: new Set(), 2: new Set() },
    stats: { placed: { 1: 0, 2: 0 }, captured: { 1: 0, 2: 0 }, maxChain: { 1: 0, 2: 0 } },
    undoSnapshot: null,     // まきもどし用（自分の直前の1手の前）
    lastMove: -1,
    history: [],            // 手の記録（デイリーの手数・きろくコード用）
  };
}

/** 1手置く。返り値の events を画面が順に演出する */
export function play(m, i) {
  const player = m.state.player;
  if (!canPlace(m.state, i, player)) return { ok: false };

  const before = Int8Array.from(m.state.owner);
  const snapshot = cloneState(m.state);

  const r = applyMove(m.state, i);
  if (!r.ok) return r;

  // 奪ったマス数を数える（かけらの計算に使う。イベントからでなく前後の差で数える）
  let captured = 0;
  for (let k = 0; k < N; k++) {
    if (m.state.owner[k] === player && before[k] === 3 - player) captured++;
  }
  m.stats.placed[player]++;
  m.stats.captured[player] += captured;
  if (r.chain > m.stats.maxChain[player]) m.stats.maxChain[player] = r.chain;
  m.gauge[player] = Math.min(GAUGE_FULL, m.gauge[player] + gaugeGain(r.chain));

  // ★人間の席の手だけを覚える★（席1固定にすると、自分が後手のときCPUの手の前に巻き戻り、
  //   手番が相手のまま誰も動かなくなって盤が固まる）
  if (player === m.mySeat) m.undoSnapshot = { state: snapshot, gauge: { ...m.gauge }, move: i };
  m.lastMove = i;
  m.history.push(i);

  return { ...r, captured, player, gaugeFull: m.gauge[player] >= GAUGE_FULL };
}

/** そのカードがいま使えるか（満月＋この戦でまだ使っていない＋持ち込んでいる） */
export function canUseCard(m, cardId, player = m.state.player) {
  if (!m.decks[player].includes(cardId)) return false;
  if (m.usedCards[player].has(cardId)) return false;
  return m.gauge[player] >= GAUGE_FULL;
}

/** カードの対象として選べるマスの一覧（画面のハイライト用） */
export function cardTargets(m, cardId, player = m.state.player, picked = []) {
  const card = CARD_BY_ID[cardId];
  if (!card) return [];
  const out = [];
  for (let i = 0; i < N; i++) if (isValidTarget(m.state, card, i, player, picked)) out.push(i);
  return out;
}

/**
 * カードを使う。cells は画面で選んだマス（枚数は card.picks）。
 * 返り値の events を画面が演出する。
 */
export function useCard(m, cardId, cells = []) {
  const player = m.state.player;
  const card = CARD_BY_ID[cardId];
  if (!card || !canUseCard(m, cardId, player)) return { ok: false, reason: 'unavailable' };
  if (cells.length !== card.picks) return { ok: false, reason: 'picks' };
  for (let k = 0; k < cells.length; k++) {
    if (!isValidTarget(m.state, card, cells[k], player, cells.slice(0, k))) {
      return { ok: false, reason: 'target' };
    }
  }

  m.usedCards[player].add(cardId);
  m.gauge[player] = 0;

  // 盤を触らない特別なカード
  if (card.special === 'undo') {
    if (!m.undoSnapshot) return { ok: true, events: [{ t: 'card', cardId, player }], undone: false };
    m.state = m.undoSnapshot.state;
    m.gauge = { ...m.undoSnapshot.gauge, [player]: 0 };
    m.undoSnapshot = null;
    return { ok: true, events: [{ t: 'card', cardId, player }, { t: 'undo' }], undone: true };
  }
  if (card.special === 'extra') {
    m.state.left += 1;
    return { ok: true, events: [{ t: 'card', cardId, player }, { t: 'extra' }] };
  }

  const before = Int8Array.from(m.state.owner);
  const triggers = applyCardEffect(m.state, card, player, cells);
  const events = [{ t: 'card', cardId, player, cells }];

  // カードで臨界を超えたマスがあれば、そこから連鎖を解決する
  let chain = 0;
  for (const i of triggers) {
    if (m.state.count[i] < capAt(m.state, i)) continue;
    const r = resolveFrom(m, player, i, events);
    chain += r;
  }
  let captured = 0;
  for (let k = 0; k < N; k++) if (m.state.owner[k] === player && before[k] === 3 - player) captured++;
  m.stats.captured[player] += captured;

  // ★カードで相手のマスを消した場合は applyMove を通らないので、ここで必ず決着を見る★
  //   （「かげぬり」「しずめ」で相手を0マスにしても勝ちにならない不具合があった）
  checkEnd(m.state, player);

  return { ok: true, events, chain, captured, winner: m.state.winner };
}

/**
 * カードで作った臨界から連鎖を走らせる。
 * ルール本体の resolveChain は applyMove の内側にあるので、
 * ここでは「置かずに1つ足して解決する」形を作るために同じ関数を通す
 * ——★別実装で連鎖を書かないこと★（2か所に書くと必ずズレる）
 */
function resolveFrom(m, player, i, events) {
  // 1つ減らしてから applyMove で置き直すと、ルール本体の連鎖処理をそのまま使える
  m.state.count[i]--;
  const saveLeft = m.state.left;
  const savePlayer = m.state.player;
  m.state.player = player;
  m.state.left = 99;                       // 手番を終わらせない（カードは手数を消費しない）
  const r = applyMove(m.state, i);
  m.state.left = saveLeft;
  m.state.player = savePlayer;
  if (!r.ok) { m.state.count[i]++; return 0; }   // ★減らした光を必ず戻す（決着済みで弾かれた場合）
  for (const e of r.events) if (e.t === 'boom') events.push(e);
  return r.chain;
}

/** CPUの手を決める */
export function cpuMove(m, rng) {
  const cfg = tierOf(m.tier);
  return chooseMove(m.state, { ...cfg, rng, budgetMs: 250 });   // ★1手300ms以内を狙う
}

/** CPUがカードを使うか判断する（満月なら、対象が要らないカードを優先して素直に撃つ） */
export function cpuCard(m) {
  const player = m.state.player;
  if (m.gauge[player] < GAUGE_FULL) return null;
  for (const id of m.decks[player]) {
    if (!canUseCard(m, id, player)) continue;
    const card = CARD_BY_ID[id];
    if (card.picks === 0) return { cardId: id, cells: [] };
    const ts = cardTargets(m, id, player);
    if (ts.length >= card.picks) return { cardId: id, cells: ts.slice(0, card.picks) };
  }
  return null;
}

export { CARDS, CARD_BY_ID };

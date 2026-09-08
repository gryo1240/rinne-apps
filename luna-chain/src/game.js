/**
 * ルナチェイン｜1戦の進行役
 *   ルール(core) と CPU を1つにまとめるだけの薄い層。
 *   画面(ui)はこの層だけを触る。★画面側でルールを再計算しないこと★
 *
 * ★2026-09-08 大幅に縮小★
 *   オーナー指示「変なカードとかポイントとかもいらんかな／シンプルだけど演出は派手に」により、
 *   わざカード10種・月ゲージ・まきもどし・合言葉コードを**全部撤去**した。
 *   ★「達成感が足りない」と言われてもカードや解放ポイントを戻さないこと。★
 *     オーナーが実際に遊んだうえで「いらない」と言った唯一の実測である。
 *     戻すなら、その前にオーナーに聞くこと。
 */
import { N } from './core/board.js';
import { newGame, applyMove, legalMoves, countCells, canPlace } from './core/rules.js';
import { chooseMove, tierOf } from './ai/ai.js';

export function createMatch(opts = {}) {
  const { terrain, wrapX, tier = 3, oppName = '', mySeat = 1 } = opts;
  return {
    state: newGame({ terrain, wrapX }),
    tier,
    mySeat,
    oppName,
    stats: { placed: { 1: 0, 2: 0 }, captured: { 1: 0, 2: 0 }, maxChain: { 1: 0, 2: 0 } },
    lastMove: -1,
    history: [],            // 手の記録（デイリーの手数）
  };
}

/** 1手置く。返り値の events を画面が順に演出する */
export function play(m, i) {
  const player = m.state.player;
  if (!canPlace(m.state, i, player)) return { ok: false };

  const before = Int8Array.from(m.state.owner);
  const r = applyMove(m.state, i);
  if (!r.ok) return r;

  // 奪ったマス数を数える（イベントからでなく前後の差で数える）
  let captured = 0;
  for (let k = 0; k < N; k++) {
    if (m.state.owner[k] === player && before[k] === 3 - player) captured++;
  }
  m.stats.placed[player]++;
  m.stats.captured[player] += captured;
  if (r.chain > m.stats.maxChain[player]) m.stats.maxChain[player] = r.chain;
  m.lastMove = i;
  m.history.push(i);

  return { ...r, captured, player };
}

/** CPUの手を決める */
export function cpuMove(m, rng) {
  const cfg = tierOf(m.tier);
  return chooseMove(m.state, { ...cfg, rng, budgetMs: 250 });   // ★1手300ms以内を狙う
}

export { legalMoves, countCells };

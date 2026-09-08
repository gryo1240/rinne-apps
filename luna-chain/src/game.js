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

/**
 * 1戦を作る。
 *
 * ★席（1・2）と「誰が操作するか」を必ず分けて持つ★（2026-09-08 二人対戦の追加で作った）
 *   もとは `mySeat` 1つが **操作権・自分の色・勝敗の記録** の3つを兼ねていた。
 *   二人対戦（1台を交代して2人で遊ぶ）では「自分」が手番ごとに入れ替わるので、
 *   この兼ね役のままだと必ずどこかがズレる（過去にも「後手だと自分が青になる」事故が起きている）。
 *
 *   → `control` に **席 → 誰が押すか** を持たせる。
 *      画面側は「いま手番の席を人間が操作してよいか」だけを見ればよくなる。
 *
 *   vs=true … 両方の席を人間が押す（二人対戦）
 *   vs=false… mySeat を人間、もう一方をCPUが押す
 */
export function createMatch(opts = {}) {
  const { terrain, wrapX, tier = 3, oppName = '', mySeat = 1, vs = false } = opts;
  const me = mySeat === 2 ? 2 : 1;
  return {
    state: newGame({ terrain, wrapX }),
    tier,
    mySeat: me,
    vs: !!vs,
    control: vs
      ? { 1: 'human', 2: 'human' }
      : { [me]: 'human', [3 - me]: 'cpu' },
    oppName,
    stats: { placed: { 1: 0, 2: 0 }, captured: { 1: 0, 2: 0 }, maxChain: { 1: 0, 2: 0 } },
    lastMove: -1,
    history: [],            // 手の記録
  };
}

/** いま手番の席を、人間が押してよいか（★画面はこれだけを見る★） */
export function humanTurn(m) {
  return !!m && !m.state.winner && m.control[m.state.player] === 'human';
}

/** CPUが押す席（いなければ0） */
export function cpuSeat(m) {
  if (!m) return 0;
  return m.control[1] === 'cpu' ? 1 : (m.control[2] === 'cpu' ? 2 : 0);
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

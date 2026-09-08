/**
 * ルナチェイン｜CPUの思考
 *
 * ★弱さの作り方（2026-09-08 advisor指摘で方針変更）★
 *   当初は「わざと悪手を選ぶ確率」で弱くする設計だったが、これは子ども向けとして最悪。
 *   **強いのに時々自殺手を指すAI**になり、「弱い」ではなく「バグっている・ずるい」と受け取られる。
 *
 *   代わりに次の2つで弱さを作る:
 *     1. **見ているものを減らす**（評価の項目を減らす）… 人間の上達順と同じなので、
 *        段が上がると「次は何を見るのか」が伝わる＝上達の道しるべになる
 *     2. **候補手を見落とす**（合法手の一部しか調べない）… 「悪手を選ぶ」ではなく「気づかない」
 *
 *   そのうえで **どの段でも「即負けの手」だけは指さない**。
 *   弱いAIが自滅で勝ちを譲るのは、子どもにとって最もつまらない勝ち方なので。
 *
 * ★段位の定義はこのファイルの TIERS 1か所だけ★（UI側に強さの表を書き写さない）
 */
import { N } from '../core/board.js';
import {
  cloneState, applyMove, legalMoves, capAt, orthOf, countCells, totalLight, findWinningMove,
} from '../core/rules.js';

const WIN = 100000;

/**
 * 局面の評価。level が上がるほど「見ているもの」が増える。
 *   1: 自分の光の多さだけ
 *   2: ＋ 隣の敵マスがいっぱい寸前かどうか（奪われる危険）
 *   3: ＋ 角と縁の価値、マス数
 */
export function evaluate(s, me, level = 3) {
  if (s.winner) return s.winner === me ? WIN : -WIN;
  const opp = 3 - me;

  let score = totalLight(s, me) - totalLight(s, opp);
  if (level <= 1) return score;

  for (let i = 0; i < N; i++) {
    const own = s.owner[i];
    if (own === 0) continue;
    const sign = own === me ? 1 : -1;
    const cap = capAt(s, i);
    let v = 0;

    // 隣に「あと1つでいっぱいになる敵マス」があると、まとめて奪われる
    let danger = false;
    for (const j of orthOf(i)) {
      if (s.owner[j] === 3 - own && s.count[j] >= capAt(s, j) - 1) { danger = true; break; }
    }
    if (danger) v -= 2.5;
    else if (s.count[i] === cap - 1) v += 1.5;   // 安全な臨界＝いつでも撃てる大砲

    if (level >= 3) v += (5 - cap) * 0.7;        // 容量の小さいマス（角・縁）は強い
    score += sign * v;
  }

  if (level >= 3) score += 0.4 * (countCells(s, me) - countCells(s, opp));
  return score;
}

/** 指した直後に相手が「1手で勝てる」形になる手か */
function losesImmediately(s, i, me) {
  const t = cloneState(s);
  const r = applyMove(t, i);
  if (!r.ok) return true;
  if (t.winner === me) return false;          // 自分が勝つ手は当然よい
  if (t.winner) return true;                  // 自滅
  return findWinningMove(t, 3 - me) >= 0;
}

/** 候補手を作る（見落としモデル: sample 手だけを見る） */
function candidates(s, me, sample, rng) {
  let ms = legalMoves(s, s.player);
  if (rng && sample < ms.length) {
    ms = ms.slice();
    for (let k = ms.length - 1; k > 0; k--) {      // Fisher-Yates で shuffle してから頭を取る
      const j = rng.int(k + 1);
      [ms[k], ms[j]] = [ms[j], ms[k]];
    }
    ms = ms.slice(0, sample);
  }
  return ms;
}

function search(s, me, depth, alpha, beta, level, topK) {
  if (s.winner || depth === 0) return evaluate(s, me, level);
  const ms = legalMoves(s, s.player);
  if (!ms.length) return evaluate(s, me, level);

  // 枝刈りを効かせるため、浅い評価で並べてから上位だけ見る
  const scored = ms.map((i) => {
    const t = cloneState(s); applyMove(t, i);
    return { i, v: evaluate(t, me, level), t };
  });
  scored.sort((a, b) => (s.player === me ? b.v - a.v : a.v - b.v));

  const maximizing = s.player === me;
  let best = maximizing ? -Infinity : Infinity;
  for (const { t } of scored.slice(0, topK)) {
    const v = search(t, me, depth - 1, alpha, beta, level, topK);
    if (maximizing) { if (v > best) best = v; if (best > alpha) alpha = best; }
    else            { if (v < best) best = v; if (best < beta)  beta  = best; }
    if (beta <= alpha) break;
  }
  return best;
}

/**
 * 1手選ぶ。
 * opts: { level, sample, depth, topK, rng, budgetMs }
 *   budgetMs を渡すと、時間が来た時点で読みを打ち切る（端末の速さに自動で合わせる）
 */
export function chooseMove(s, opts = {}) {
  const { level = 3, sample = 99, depth = 2, topK = 12, rng, budgetMs = 0 } = opts;
  const me = s.player;
  const all = legalMoves(s, me);
  if (!all.length) return -1;
  if (all.length === 1) return all[0];

  const t0 = Date.now();
  let ms = candidates(s, me, sample, rng);

  // ★どの段でも「即負けの手」は指さない。全部が即負けなら、そのときだけ諦めて元の候補に戻す
  const safe = ms.filter((i) => !losesImmediately(s, i, me));
  if (safe.length) ms = safe;

  let bestI = ms[0], bestV = -Infinity, alpha = -Infinity;
  for (const i of ms) {
    const t = cloneState(s);
    applyMove(t, i);
    const d = (budgetMs && Date.now() - t0 > budgetMs) ? 0 : depth - 1;  // 時間切れなら読みを浅くする
    const v = search(t, me, d, alpha, Infinity, level, topK);
    if (v > bestV) { bestV = v; bestI = i; }
    if (v > alpha) alpha = v;
  }
  return bestI;
}

/**
 * 段位（6段）。画面には☆の数しか出さない。実際の強さは直近成績で連続的に動かす（§3-2）。
 * ★12段から6段に減らした（2026-09-08 advisor指摘）★
 *   公開後にプレイヤーの挙動を観測できない以上、12段の差を作り分けられたことを検証する手段が無い。
 */
export const TIERS = [
  { level: 1, sample: 6,  depth: 1, topK: 6  },  // 1 最弱（下げ止まり）: 光の数しか見ない・6手しか見ない
  { level: 1, sample: 10, depth: 1, topK: 8  },  // 2
  { level: 2, sample: 14, depth: 1, topK: 10 },  // 3: 「奪われる危険」を見はじめる
  { level: 2, sample: 99, depth: 2, topK: 10 },  // 4: 相手の返し手まで読む
  { level: 3, sample: 99, depth: 2, topK: 14 },  // 5: 角と縁の価値を知る
  { level: 3, sample: 99, depth: 2, topK: 20 },  // 6 最強（上がり止まり）
];

export const tierOf = (n) => TIERS[Math.max(0, Math.min(TIERS.length - 1, n - 1))];
export const TIER_MAX = TIERS.length;

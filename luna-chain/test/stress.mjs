/**
 * ルナチェイン｜連鎖の停止性ストレステスト
 *   node apps/luna-chain/test/stress.mjs
 *
 * ★なぜ要るか（2026-09-08 advisor指摘 → 実測で的中）★
 *   「光が保存されるから連鎖は止まる」は**誤り**。保存は必要条件でしかない。
 *   当初の星屑案（はじけた光が2マス先へ貫通する）は光の流れが一方通行になり、
 *   このテストで 7,200回中333回、連鎖が止まらなかった。
 *   そこで星屑を「光を通すマス」（行き帰りが対称）に作り直した。
 *
 *   ★地形を足す・変えるときは必ずこのテストを通すこと。★
 *   普通のAI対局を何千回やっても、この壊れ方は見つからない
 *   （非停止は「盤の大半が臨界寸前」という、対局ではまず通らない領域で起きるため）。
 */
import { N, W, H, T_NORMAL, T_CRATER, T_STARDUST, T_CLOUD, generateBoard } from '../src/core/board.js';
import { newGame, applyMove, legalMoves, capAt, isWallAt, isCloudy, MAX_EXPLOSIONS } from '../src/core/rules.js';
import { makeRng } from '../src/core/rng.js';

const EDGES = W * (H - 1) + H * (W - 1);   // 71

/** 指定の地形で、光の総数が total になるまで「容量未満」で敷き詰めた盤を作る */
function buildLoaded(rng, terrainFn, wrapX, total) {
  const terrain = new Int8Array(N);
  for (let i = 0; i < N; i++) terrain[i] = terrainFn(i, rng);
  const s = newGame({ terrain, wrapX, maxTurns: 9999 });
  s.moves = [1, 1];
  s.player = 1;
  let placed = 0, guard = 0;
  while (placed < total && guard++ < 40000) {
    const i = rng.int(N);
    if (isWallAt(s, i) || isCloudy(s, i)) continue;
    if (s.count[i] >= capAt(s, i) - 1) continue;
    s.count[i]++;
    s.owner[i] = 1 + rng.int(2);
    placed++;
  }
  return s;
}

const SETS = [
  ['ふつうのみ',        () => T_NORMAL,                                   false],
  ['全部クレーター',    () => T_CRATER,                                   false],
  ['星屑30%',          (i, r) => (r.int(10) < 3 ? T_STARDUST : T_NORMAL), false],
  ['星屑50%',          (i, r) => (r.int(10) < 5 ? T_STARDUST : T_NORMAL), false],
  ['左右つながり盤',    () => T_NORMAL,                                   true],
  ['つながり+星屑30%',  (i, r) => (r.int(10) < 3 ? T_STARDUST : T_NORMAL), true],
  ['雲だらけ',          (i, r) => (r.int(10) < 3 ? T_CLOUD : T_NORMAL),   false],
  ['実際の生成に近い',  (i, r) => { const v = r.int(10); return v === 0 ? T_CRATER : v === 1 ? T_STARDUST : v === 2 ? T_CLOUD : T_NORMAL; }, false],
];

let worst = 0, overflowTotal = 0, trials = 0;
const booms = [];

console.log(`盤の辺の数 = ${EDGES}。1手で増える光は必ず1個なので、実際の対局（上限60手）で盤に乗る光は最大でも約61個`);
console.log(`それでも「起きやすい条件」を直接作って叩く（対局では通らない領域だから）\n`);

for (const [name, fn, wrapX] of SETS) {
  for (const mul of [0.5, 1.0, 1.5]) {
    const total = Math.round(EDGES * mul);
    let localWorst = 0, localOver = 0, done = 0;
    for (let seed = 1; seed <= 400; seed++) {
      const rng = makeRng(seed * 7919 + total + (wrapX ? 13 : 0));
      const s = buildLoaded(rng, fn, wrapX, total);
      const ms = legalMoves(s);
      if (!ms.length) continue;
      const r = applyMove(s, ms[rng.int(ms.length)]);
      const b = r.events.filter(e => e.t === 'boom').length;
      booms.push(b);
      if (b > localWorst) localWorst = b;
      if (s.overflow) localOver++;
      done++; trials++;
    }
    if (localWorst > worst) worst = localWorst;
    overflowTotal += localOver;
    console.log(`${localOver ? '❌止まらなかった' : '✅全部止まった'}  ${name.padEnd(9, '　')} 光=${String(total).padStart(3)}(辺の${mul}倍) ${done}回 最大はじけ=${String(localWorst).padStart(4)}回 打ち切り=${localOver}`);
  }
}

booms.sort((a, b) => a - b);
const pct = (p) => booms[Math.min(booms.length - 1, Math.floor(booms.length * p))];
console.log(`\n── はじけ回数の分布（演出の時間予算を決めるための実測）`);
console.log(`  中央値 ${pct(0.5)} / p90 ${pct(0.9)} / p99 ${pct(0.99)} / p99.9 ${pct(0.999)} / 最大 ${worst}`);

console.log(`\n試行 ${trials} 回 / 安全弁(${MAX_EXPLOSIONS}回)の発火 ${overflowTotal} 回`);
if (overflowTotal > 0) {
  console.log('❌ 連鎖が止まらない配置が実在する。地形の設計を見直すこと');
  process.exit(1);
}
console.log('✅ 全条件で停止した');

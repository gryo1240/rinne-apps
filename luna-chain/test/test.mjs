/**
 * ルナチェイン｜コアルールの単体テスト
 *   node apps/luna-chain/test/test.mjs
 *
 * ★このテストの主役は「光の流れが行き帰りで対称であること」★
 *   対称性が崩れると、光が増えていなくても連鎖が止まらなくなる（2026-09-08に実測で判明）。
 *   地形を追加・変更したら、このテストと test/stress.mjs の両方を必ず通すこと。
 */
import {
  N, W, H, T_NORMAL, T_CRATER, T_STARDUST, T_CLOUD,
  buildGeometry, generateBoard, findAsymmetry, idx, orthOf,
} from '../src/core/board.js';
import {
  newGame, applyMove, legalMoves, canPlace, countCells, totalLight, capAt, targetsAt,
  cloneState, boardSignature, findWinningMove, MAX_EXPLOSIONS, effTerrain, isWallAt,
} from '../src/core/rules.js';
import { makeRng, seedFromString, seedFromDate, ymd } from '../src/core/rng.js';

let pass = 0, fail = 0;
const t = (name, fn) => {
  try { fn(); pass++; }
  catch (e) { fail++; console.error(`  ✗ ${name}\n    ${e.message}`); }
};
const eq = (a, b, msg = '') => { if (a !== b) throw new Error(`${msg} 期待=${b} 実際=${a}`); };
const ok = (v, msg = '') => { if (!v) throw new Error(msg || '偽になった'); };

console.log('■ 盤面の幾何と地形');

t('盤は6×7＝42マス', () => { eq(W, 6); eq(H, 7); eq(N, 42); });

t('★不変条件1: 容量＝飛び先の数（クレーターのみ+1）', () => {
  const rng = makeRng(4242);
  for (let s = 0; s < 100; s++) {
    const { terrain, wrapX } = generateBoard(rng);
    const geo = buildGeometry(terrain, wrapX);
    for (let i = 0; i < N; i++) {
      if (terrain[i] === T_STARDUST) continue;         // 星屑は光を持たない
      const want = geo.targets[i].length + (terrain[i] === T_CRATER ? 1 : 0);
      eq(geo.cap[i], want, `盤${s} マス${i}`);
    }
  }
});

t('★不変条件2: 光の流れは行き帰りで対称（AからBへ飛ぶならBからAへも飛ぶ）', () => {
  const rng = makeRng(777);
  for (let s = 0; s < 300; s++) {
    // 生成器の盤に加えて、星屑を多めに散らした厳しい盤でも確かめる
    const terrain = new Int8Array(N);
    for (let i = 0; i < N; i++) {
      const v = rng.int(10);
      terrain[i] = v < 3 ? T_STARDUST : v === 3 ? T_CRATER : v === 4 ? T_CLOUD : T_NORMAL;
    }
    const wrapX = s % 3 === 0;
    const bad = findAsymmetry(buildGeometry(terrain, wrapX), terrain);
    ok(bad === null,
      `盤${s}: ${bad && bad[0]}→${bad && bad[1]} は飛ぶのに逆が無い（一方通行＝連鎖が止まらなくなる）`);
  }
});

t('★対称性の検査そのものが機能する（わざと壊した幾何を渡すと検出できる）', () => {
  const terrain = new Int8Array(N);
  const geo = buildGeometry(terrain, false);
  // 「(0,0)→(2,2)へ飛ぶが、(2,2)からは戻らない」という一方通行を人工的に作る
  const broken = { cap: geo.cap, targets: geo.targets.map((a) => a.slice()) };
  broken.targets[idx(0, 0)].push(idx(2, 2));
  const found = findAsymmetry(broken, terrain);
  ok(found !== null, '一方通行を作ったのに検出できなかった＝この検査は最初から無意味');
  eq(found[0], idx(0, 0));
  eq(found[1], idx(2, 2));
});

t('星屑は「光を通すマス」＝置けない・光を持たない', () => {
  const terrain = new Int8Array(N);
  terrain[idx(2, 3)] = T_STARDUST;
  const s = newGame({ terrain });
  ok(isWallAt(s, idx(2, 3)), '星屑が壁として扱われていない');
  ok(!canPlace(s, idx(2, 3), 1), '星屑に置けてしまう');
  eq(targetsAt(s, idx(2, 3)).length, 0, '星屑が光を飛ばしている');
});

t('光は星屑を通り抜けて、その先のマスに届く', () => {
  const terrain = new Int8Array(N);
  terrain[idx(1, 3)] = T_STARDUST;               // (0,3) の右隣を星屑にする
  const geo = buildGeometry(terrain, false);
  const tg = geo.targets[idx(0, 3)];
  ok(tg.includes(idx(2, 3)), '星屑を通り抜けて2マス先へ届いていない');
  ok(!tg.includes(idx(1, 3)), '星屑そのものに光が止まっている');
});

t('左右つながり盤では、端が反対の端につながる', () => {
  const terrain = new Int8Array(N);
  const geo = buildGeometry(terrain, true);
  ok(geo.targets[idx(0, 3)].includes(idx(W - 1, 3)), '左端から右端へつながっていない');
  eq(geo.cap[idx(0, 0)], 3, 'つながり盤の角の容量（上下左右のうち3方向）');
  const flat = buildGeometry(terrain, false);
  eq(flat.cap[idx(0, 0)], 2, 'ふつうの盤の角の容量は2');
});

t('角の容量は2・辺は3・内側は4（角が強いという骨格を守る）', () => {
  const geo = buildGeometry(new Int8Array(N), false);
  eq(geo.cap[idx(0, 0)], 2);
  eq(geo.cap[idx(2, 0)], 3);
  eq(geo.cap[idx(2, 3)], 4);
  const cr = new Int8Array(N); cr[idx(2, 3)] = T_CRATER;
  eq(buildGeometry(cr, false).cap[idx(2, 3)], 5, 'クレーターは容量+1');
});

t('地形は左右対称に置かれる（先手有利を増やさないため）', () => {
  for (let s = 0; s < 200; s++) {
    const { terrain } = generateBoard(makeRng(s + 1));
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      eq(terrain[idx(x, y)], terrain[idx(W - 1 - x, y)], `シード${s} (${x},${y})`);
    }
  }
});

console.log('■ 1手のルール');

t('自分のマスと空きマスにだけ置ける', () => {
  const s = newGame();
  applyMove(s, 0);
  ok(canPlace(s, 0, 1), '自分のマスに置けない');
  ok(!canPlace(s, 0, 2), '相手のマスに置けてしまう');
  ok(canPlace(s, 5, 2), '空きマスに置けない');
});

t('雲には置けず、飛んできた光は消える', () => {
  const terrain = new Int8Array(N);
  terrain[idx(1, 0)] = T_CLOUD;
  const s = newGame({ terrain });
  ok(!canPlace(s, idx(1, 0), 1), '雲に置けてしまう');
  applyMove(s, idx(0, 0));  // p1
  applyMove(s, idx(5, 6));  // p2（komiで2回）
  applyMove(s, idx(4, 6));
  const before = totalLight(s, 1) + totalLight(s, 2);
  const r = applyMove(s, idx(0, 0));   // 角がはじける
  ok(r.chain >= 1, 'はじけていない');
  const lost = r.events.filter(e => e.t === 'boom').reduce((n, e) => n + e.to.filter(x => x === -1).length, 0);
  eq(lost, 1, '雲に吸われた光の数');
  eq(totalLight(s, 1) + totalLight(s, 2), before + 1 - lost, '光の総数');
});

t('★光は増えない（1手＝+1、消えたぶんだけ減る）', () => {
  for (let seed = 1; seed <= 300; seed++) {
    const rng = makeRng(seed);
    const { terrain, wrapX } = generateBoard(rng);
    const s = newGame({ terrain, wrapX });
    while (!s.winner && s.turn < 60) {
      const ms = legalMoves(s);
      if (!ms.length) break;
      const before = totalLight(s, 1) + totalLight(s, 2);
      const r = applyMove(s, ms[rng.int(ms.length)]);
      if (!r.ok) break;
      const lost = r.events.filter(e => e.t === 'boom')
        .reduce((n, e) => n + e.to.filter(x => x === -1).length, 0);
      eq(totalLight(s, 1) + totalLight(s, 2), before + 1 - lost, `シード${seed} 手${s.turn}`);
    }
    ok(!s.overflow, `シード${seed}: 安全弁(${MAX_EXPLOSIONS}回)が発火した`);
  }
});

t('★連鎖は必ず止まる（盤をほぼ埋めた危険な形でも）', () => {
  for (let seed = 1; seed <= 100; seed++) {
    const rng = makeRng(seed);
    const s = newGame();
    for (let i = 0; i < N; i++) { s.owner[i] = 1; s.count[i] = Math.max(1, capAt(s, i) - 1); }
    s.owner[idx(0, 0)] = 2; s.count[idx(0, 0)] = 1;
    s.moves = [1, 1]; s.player = 1; s.left = 1;
    const ms = legalMoves(s);
    applyMove(s, ms[rng.int(ms.length)]);
    ok(!s.overflow, `シード${seed}: 連鎖が止まらなかった`);
  }
});

t('開幕では敗北判定をしない（先手が1手打った瞬間に勝ちにならない）', () => {
  const s = newGame();
  applyMove(s, idx(0, 0));
  eq(s.winner, 0, '開幕で勝ちになってしまった');
});

t('相手のマスを全部奪ったら勝ち', () => {
  const s = newGame();
  s.owner[idx(0, 0)] = 1; s.count[idx(0, 0)] = 1;
  s.owner[idx(1, 0)] = 2; s.count[idx(1, 0)] = 1;
  s.moves = [1, 1]; s.player = 1; s.left = 1;
  applyMove(s, idx(0, 0));       // 角がはじけて(1,0)を奪う
  eq(s.winner, 1);
  eq(s.endReason, 'wipe');
});

t('打った側が0マスになったら相手の勝ち（自滅の定義）', () => {
  // 自分の唯一のマスが角。両隣を雲にしておくと、はじけた光が全部消えて自分が0マスになる
  const terrain = new Int8Array(N);
  terrain[idx(1, 0)] = T_CLOUD;
  terrain[idx(0, 1)] = T_CLOUD;
  const s = newGame({ terrain });
  s.owner[idx(0, 0)] = 1; s.count[idx(0, 0)] = 1;
  s.owner[idx(5, 6)] = 2; s.count[idx(5, 6)] = 1;
  s.moves = [1, 1]; s.player = 1; s.left = 1;
  applyMove(s, idx(0, 0));
  eq(countCells(s, 1), 0, '自分のマスが残っている（前提が崩れた）');
  eq(s.winner, 2, '自滅したのに相手の勝ちになっていない');
  eq(s.endReason, 'self');
});

t('後手はkomiのぶんだけ初手に多く置ける', () => {
  const s = newGame({ komi: 1 });
  applyMove(s, idx(0, 0));
  eq(s.player, 2);
  eq(s.left, 2, '後手の初手が2回になっていない');
  applyMove(s, idx(5, 6));
  eq(s.player, 2, 'まだ後手の手番のはず');
  applyMove(s, idx(4, 6));
  eq(s.player, 1);
  eq(s.left, 1);
});

t('komi=0なら後手も1回だけ', () => {
  const s = newGame({ komi: 0 });
  applyMove(s, idx(0, 0));
  eq(s.left, 1);
  applyMove(s, idx(5, 6));
  eq(s.player, 1);
});

t('手数上限で決着する（同数なら後手の勝ち）', () => {
  const s = newGame({ maxTurns: 4 });
  applyMove(s, idx(0, 0));
  applyMove(s, idx(5, 6)); applyMove(s, idx(4, 6));
  applyMove(s, idx(1, 0));
  applyMove(s, idx(5, 5));
  ok(s.winner !== 0, '上限で決着していない');
  eq(s.endReason, 'limit');
});

console.log('■ 決定論');

t('同じ種・同じ手順なら盤面は完全に一致する', () => {
  const run = () => {
    const rng = makeRng(12345);
    const { terrain, wrapX } = generateBoard(makeRng(999));
    const s = newGame({ terrain, wrapX });
    while (!s.winner && s.turn < 40) {
      const ms = legalMoves(s);
      if (!ms.length) break;
      applyMove(s, ms[rng.int(ms.length)]);
    }
    return boardSignature(s);
  };
  eq(run(), run(), '同じ手順で違う盤面になった');
});

t('cloneStateは元の盤に影響しない', () => {
  const s = newGame();
  applyMove(s, idx(0, 0));
  const c = cloneState(s);
  applyMove(c, idx(1, 1));
  eq(s.count[idx(1, 1)], 0, 'コピーの操作が元に漏れている');
});

t('同じ日付からは同じ種が出る／別の日付では違う種', () => {
  eq(seedFromDate('2026-09-08'), seedFromDate('2026-09-08'));
  ok(seedFromDate('2026-09-08') !== seedFromDate('2026-09-09'));
  eq(ymd(new Date(2026, 8, 8)), '2026-09-08');
  ok(seedFromString('あいことば') > 0);
});

console.log('■ 「あと1手で逆転できた」の判定');

t('勝てる手があるときだけ手を返す', () => {
  const s = newGame();
  s.owner[idx(0, 0)] = 1; s.count[idx(0, 0)] = 1;
  s.owner[idx(1, 0)] = 2; s.count[idx(1, 0)] = 1;
  s.moves = [1, 1]; s.player = 1; s.left = 1;
  eq(findWinningMove(s, 1), idx(0, 0), '角に置けば勝てるのを見つけられていない');

  const s2 = newGame();
  s2.owner[idx(0, 0)] = 1; s2.count[idx(0, 0)] = 1;
  s2.owner[idx(5, 6)] = 2; s2.count[idx(5, 6)] = 1;
  s2.moves = [1, 1]; s2.player = 1; s2.left = 1;
  eq(findWinningMove(s2, 1), -1, '勝てないのに手を返した');
});

t('findWinningMoveは盤面を壊さない', () => {
  const s = newGame();
  s.owner[idx(0, 0)] = 1; s.count[idx(0, 0)] = 1;
  s.owner[idx(1, 0)] = 2; s.count[idx(1, 0)] = 1;
  s.moves = [1, 1]; s.player = 1; s.left = 1;
  const before = boardSignature(s);
  findWinningMove(s, 1);
  eq(boardSignature(s), before, '調べただけで盤面が変わった');
});

console.log('■ 雲の時間経過');

t('雲は手番が進むと晴れる', () => {
  const terrain = new Int8Array(N);
  terrain[idx(2, 3)] = T_CLOUD;
  const s = newGame({ terrain });
  eq(effTerrain(s, idx(2, 3)), T_CLOUD);
  applyMove(s, idx(0, 0));
  applyMove(s, idx(5, 6)); applyMove(s, idx(4, 6));
  applyMove(s, idx(1, 0));
  eq(effTerrain(s, idx(2, 3)), T_NORMAL, '3手番たっても晴れていない');
  ok(canPlace(s, idx(2, 3), 2), '晴れたのに置けない');
});

console.log(`\n${fail === 0 ? '✅' : '❌'} 合計 ${pass + fail} 項目 / 合格 ${pass} / 失敗 ${fail}`);
process.exit(fail === 0 ? 0 : 1);

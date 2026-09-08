/**
 * ルナチェイン｜バランス測定シミュレーター
 *   node apps/luna-chain/test/sim.mjs --games 200
 *   node apps/luna-chain/test/sim.mjs --games 1000 --komi 0,1,2
 *
 * ★UIより先にこれを書く★（仕様書§6-1）。UIから作ると「作ってから壊れているとわかる」順序になる。
 *
 * ★advisorの指摘を反映（2026-09-08）★
 *   - 先後を入れ替えた2局を1セットで数える（AIの乱数の偏りが先手勝率に混ざるのを防ぐ）
 *   - 単一強度で決めない（弱・中・強の3組で測り、3組とも同じ向きに寄るkomiを選ぶ）
 *   - 平均だけでなく層別で見る（つながり盤・地形の量で分ける）
 *   - 判定基準は測る前に書く（下の JUDGE）
 */
import { generateBoard, N, T_NORMAL } from '../src/core/board.js';
import { newGame, applyMove, legalMoves, totalLight, countCells } from '../src/core/rules.js';
import { chooseMove, tierOf } from '../src/ai/ai.js';
import { makeRng } from '../src/core/rng.js';

// ── 判定基準（★測る前に書く★） ─────────────────────────────
const JUDGE = {
  先手勝率: '50%±3%。複数のkomiが範囲内なら50%に最も近いもの、同点ならkomiの小さいほう（ルールが単純）',
  どれも範囲外のとき: 'komiでは直せないと結論し、合言葉での友達比較を「先後を入れ替えた2局の合計」に格上げする',
  平均決着ラウンド: '24〜40ラウンド（1ラウンド＝両者が1手ずつ。実測で決着まで平均75〜90手番かかるので上限は120手番に置く）',
  上限決着率: '3%未満',
  逆転率: '15%以上（一度10ポイント以上劣勢になってから勝った割合）',
  安全弁の発火: '0件（1件でも出たら地形の設計に戻る）',
};

const args = process.argv.slice(2);
const argOf = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const GAMES = parseInt(argOf('--games', '200'), 10);
const KOMIS = argOf('--komi', '0,1,2').split(',').map(Number);
const MAXTURNS = parseInt(argOf('--maxturns', '120'), 10);
const PAIRS = [[1, '弱'], [4, '中'], [6, '強']];

function playOne(boardSeed, komi, tier, rngA, rngB) {
  const { terrain, wrapX } = generateBoard(makeRng(boardSeed));
  const s = newGame({ terrain, wrapX, komi, maxTurns: MAXTURNS });
  const cfg = tierOf(tier);
  const hist = [];
  let maxChain = 0;
  let plies = 0;

  while (!s.winner && plies < 400) {
    const rng = s.player === 1 ? rngA : rngB;
    const i = chooseMove(s, { ...cfg, rng });
    if (i < 0) break;
    const r = applyMove(s, i);
    if (!r.ok) break;
    if (r.chain > maxChain) maxChain = r.chain;
    const a = totalLight(s, 1), b = totalLight(s, 2);
    hist.push(a + b > 0 ? a / (a + b) : 0.5);
    plies++;
  }

  // 逆転: 勝った側が、途中で10ポイント以上劣勢になっていたか
  let comeback = false;
  if (s.winner) {
    for (let k = 6; k < hist.length; k++) {
      const share = s.winner === 1 ? hist[k] : 1 - hist[k];
      if (share <= 0.40) { comeback = true; break; }
    }
  }
  const terrCount = terrain.reduce((n, v) => n + (v !== T_NORMAL ? 1 : 0), 0);
  return { winner: s.winner, turns: s.turn, reason: s.endReason, overflow: s.overflow, comeback, maxChain, wrapX, terrCount };
}

console.log('══ 判定基準（測る前に書いたもの）');
for (const [k, v] of Object.entries(JUDGE)) console.log(`   ${k}: ${v}`);
console.log(`\n1セット = 同じ盤で乱数の席を入れ替えた2局。セット数 ${GAMES} ＝ 1条件あたり ${GAMES * 2} 局`);
console.log(`1局の重み = ${(100 / (GAMES * 2)).toFixed(2)}ポイント（これより小さい差は読まない）\n`);

const rows = [];
for (const komi of KOMIS) {
  for (const [tier, label] of PAIRS) {
    const st = {
      games: 0, firstWins: 0, turns: 0, limit: 0, comeback: 0, overflow: 0, maxChain: 0,
      byWrap: { true: [0, 0], false: [0, 0] }, byTerr: {},
    };
    const t0 = Date.now();
    for (let seed = 1; seed <= GAMES; seed++) {
      // 同じ盤で、AIの乱数の席を入れ替えた2局を1セットにする
      for (const swap of [false, true]) {
        const rngA = makeRng(seed * 31 + (swap ? 1 : 0));
        const rngB = makeRng(seed * 97 + (swap ? 0 : 1));
        const g = playOne(seed, komi, tier, swap ? rngB : rngA, swap ? rngA : rngB);
        st.games++;
        if (g.winner === 1) st.firstWins++;
        st.turns += g.turns;
        if (g.reason === 'limit') st.limit++;
        if (g.comeback) st.comeback++;
        if (g.overflow) st.overflow++;
        if (g.maxChain > st.maxChain) st.maxChain = g.maxChain;
        const w = st.byWrap[String(g.wrapX)];
        w[0]++; if (g.winner === 1) w[1]++;
        const key = g.terrCount;
        st.byTerr[key] = st.byTerr[key] || [0, 0];
        st.byTerr[key][0]++; if (g.winner === 1) st.byTerr[key][1]++;
      }
    }
    const rate = st.firstWins / st.games * 100;
    const sec = (Date.now() - t0) / 1000;
    rows.push({ komi, tier, label, rate, st, sec });
    const wrapTxt = Object.entries(st.byWrap)
      .filter(([, v]) => v[0] > 0)
      .map(([k, v]) => `${k === 'true' ? 'つながり盤' : 'ふつう盤'} ${(v[1] / v[0] * 100).toFixed(1)}%(${v[0]}局)`)
      .join(' / ');
    console.log(
      `komi=${komi} ${label}×${label}  先手勝率 ${rate.toFixed(1)}%  ` +
      `平均${(st.turns / st.games / 2).toFixed(1)}ラウンド  上限決着${(st.limit / st.games * 100).toFixed(1)}%  ` +
      `逆転${(st.comeback / st.games * 100).toFixed(1)}%  最大連鎖${st.maxChain}  ` +
      `打ち切り${st.overflow}  [${sec.toFixed(0)}秒]`
    );
    console.log(`         層別: ${wrapTxt}`);
  }
}

console.log('\n══ komiごとの判定');
for (const komi of KOMIS) {
  const rs = rows.filter(r => r.komi === komi);
  const worst = Math.max(...rs.map(r => Math.abs(r.rate - 50)));
  const allIn = rs.every(r => Math.abs(r.rate - 50) <= 3);
  console.log(`komi=${komi}: ${rs.map(r => `${r.label}${r.rate.toFixed(1)}%`).join(' ')} → 50%からの最大ずれ ${worst.toFixed(1)}pt ${allIn ? '✅3組とも範囲内' : '❌範囲外の組あり'}`);
}
const best = KOMIS
  .map(k => ({ k, worst: Math.max(...rows.filter(r => r.komi === k).map(r => Math.abs(r.rate - 50))) }))
  .sort((a, b) => a.worst - b.worst || a.k - b.k)[0];
console.log(`\n→ 採用すべき komi = ${best.k}（3組の中で最大ずれが最小 ${best.worst.toFixed(1)}pt）`);
if (best.worst > 3) console.log('   ※ ただし基準の±3ptに収まっていない。komiでは直せないと判断し、友達比較は先後2局セットに格上げすること');
const totalOverflow = rows.reduce((n, r) => n + r.st.overflow, 0);
console.log(`安全弁の発火: 全条件で ${totalOverflow} 件 ${totalOverflow === 0 ? '✅' : '❌'}`);

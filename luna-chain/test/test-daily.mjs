/**
 * ルナチェイン｜日替わり（今日の月・今日の詰めルナ）のテスト
 *   node apps/luna-chain/test/test-daily.mjs
 *
 * ★365日ぶんを先に生成して全問検査する★（仕様書§6-2の14）
 *   公開後に「今日の問題が壊れている」と気づいても直せる人がいない（テスターがいない）ので、
 *   1年ぶんを事前に全部確かめておく。
 */
import { dailyBoard, makeTsume, winningMoves, recentDates } from '../src/meta/daily.js';
import { boardSignature } from '../src/core/rules.js';

let pass = 0, fail = 0;
const t = (n, f) => { try { f(); pass++; } catch (e) { fail++; console.error(`  ✗ ${n}\n    ${e.message}`); } };
const eq = (a, b, m = '') => { if (a !== b) throw new Error(`${m} 期待=${b} 実際=${a}`); };
const ok = (v, m = '') => { if (!v) throw new Error(m || '偽になった'); };

console.log('■ 今日の月（日替わり盤）');

t('同じ日付からは必ず同じ盤が出る', () => {
  const a = dailyBoard('2026-09-08'), b = dailyBoard('2026-09-08');
  eq(a.terrain.join(','), b.terrain.join(','));
  eq(a.wrapX, b.wrapX); eq(a.tier, b.tier);
});

t('日付が違えば盤も変わる（30日ぶんで重複が多すぎない）', () => {
  const seen = new Set();
  for (let d = 1; d <= 30; d++) {
    const b = dailyBoard(`2026-09-${String(d).padStart(2, '0')}`);
    seen.add(b.terrain.join(',') + '|' + b.wrapX);
  }
  ok(seen.size >= 20, `30日で${seen.size}種類しか出ていない`);
});

t('過去7日ぶんの日付が作れる（1日遊べなくても取り返しがつく）', () => {
  const ds = recentDates(7, new Date(2026, 8, 8));
  eq(ds.length, 7); eq(ds[0], '2026-09-08'); eq(ds[6], '2026-09-02');
});

console.log('■ 今日の詰めルナ（365日ぶんの全問検査）');

const YEAR = [];
for (let m = 1; m <= 12; m++) {
  const days = new Date(2026, m, 0).getDate();
  for (let d = 1; d <= days; d++) YEAR.push(`2026-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
}

const puzzles = YEAR.map((d) => ({ d, p: makeTsume(d) }));
const made = puzzles.filter((x) => x.p);

t('365日ぶんのうち、十分な日数で問題が作れる', () => {
  const rate = made.length / YEAR.length * 100;
  console.log(`   生成できた日: ${made.length}/${YEAR.length} (${rate.toFixed(1)}%)`);
  ok(rate >= 95, `生成率が低すぎる: ${rate.toFixed(1)}%（低いと「今日は詰めルナが無い日」が増える）`);
});

t('★作った問題は全部「勝てる手がちょうど1つ」', () => {
  for (const { d, p } of made) {
    const ws = winningMoves(p.state, 1);
    eq(ws.length, 1, `${d}: 勝てる手が${ws.length}通りある`);
    eq(ws[0], p.solution, `${d}: 答えが食い違っている`);
  }
});

t('問題は手番が先手・未決着の状態で渡される', () => {
  for (const { d, p } of made) {
    eq(p.state.player, 1, `${d}: 手番が先手でない`);
    eq(p.state.winner, 0, `${d}: すでに決着している`);
    eq(p.state.left, 1, `${d}: 置ける回数が1でない`);
  }
});

t('同じ日付からは必ず同じ問題が出る', () => {
  for (const d of ['2026-01-01', '2026-06-15', '2026-12-31']) {
    const a = makeTsume(d), b = makeTsume(d);
    ok(!!a === !!b, `${d}: 生成の可否がぶれた`);
    if (a) { eq(a.signature, b.signature, `${d}: 盤が違う`); eq(a.solution, b.solution, `${d}: 答えが違う`); }
  }
});

const attempts = made.map((x) => x.p.attempts).sort((a, b) => a - b);
console.log(`   探索回数: 中央値${attempts[attempts.length >> 1]} / 最大${attempts[attempts.length - 1]}（ブラウザで作るので少ないほどよい）`);

console.log(`\n${fail === 0 ? '✅' : '❌'} 合計 ${pass + fail} 項目 / 合格 ${pass} / 失敗 ${fail}`);
process.exit(fail === 0 ? 0 : 1);

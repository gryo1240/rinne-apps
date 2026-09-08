/**
 * ルナチェイン｜合言葉コード・解放テーブル・カードのテスト
 *   node apps/luna-chain/test/test-meta.mjs
 */
import {
  encodeDeck, encodeSave, encodeRecord, decode, normalize, pretty, NICK_CHARS, dayNumber,
} from '../src/meta/code.js';
import { shardsForMatch, unlockedAt, nextUnlock, UNLOCKS, TOTAL_SHARDS } from '../data/unlock.js';
import { CARDS, isValidTarget, applyCardEffect } from '../data/cards.js';
import { N, T_STARDUST, T_CRATER, idx } from '../src/core/board.js';
import { newGame, applyMove, capAt, canPlace, isWallAt } from '../src/core/rules.js';
import { makeRng } from '../src/core/rng.js';

let pass = 0, fail = 0;
const t = (name, fn) => { try { fn(); pass++; } catch (e) { fail++; console.error(`  ✗ ${name}\n    ${e.message}`); } };
const eq = (a, b, m = '') => { if (a !== b) throw new Error(`${m} 期待=${b} 実際=${a}`); };
const ok = (v, m = '') => { if (!v) throw new Error(m || '偽になった'); };

console.log('■ 合言葉コード');

t('編成コードは往復できる', () => {
  const code = encodeDeck(['nagare', 'kage', 'haya'], 'ルナ');
  const d = decode(code);
  ok(d.ok, `読めなかった: ${JSON.stringify(d)}`);
  eq(d.type, 'D');
  eq(d.cards.join(','), 'nagare,kage,haya');
  eq(d.nickname, 'ルナ');
});

t('空きスロットと空のニックネームも往復できる', () => {
  const d = decode(encodeDeck([], ''));
  ok(d.ok);
  eq(d.cards.filter(Boolean).length, 0);
  eq(d.nickname, '');
});

t('ニックネームは6文字まで・使える文字だけ残る', () => {
  const d = decode(encodeDeck(['nagare'], 'アイウエオカキク'));
  eq(d.nickname.length, 6, '6文字に切られていない');
  eq(d.nickname, 'アイウエオカ');
});

t('セーブコードは往復できる', () => {
  const d = decode(encodeSave({ shards: 12345, trophies: 0xABCDEF12, tier: 5 }));
  ok(d.ok);
  eq(d.type, 'S'); eq(d.shards, 12345); eq(d.trophies >>> 0, 0xABCDEF12); eq(d.tier, 5);
});

t('きろくコードは往復できる', () => {
  const d = decode(encodeRecord({ date: '2026-09-08', moves: 7 }));
  ok(d.ok);
  eq(d.type, 'R'); eq(d.day, dayNumber('2026-09-08')); eq(d.moves, 7);
});

t('小文字・全角・区切りの抜けを吸収する', () => {
  const code = encodeDeck(['tame', 'kumo'], 'ホシ');
  const messy = code.toLowerCase().replace(/-/g, ' ');
  const d = decode(messy);
  ok(d.ok, '崩した書き方で読めなかった');
  eq(d.nickname, 'ホシ');
});

t('まぎらわしい文字（I/L/O/U）を書き写しても読める', () => {
  const code = encodeDeck(['nagare', 'yose', 'shizume'], 'ツキ');
  const body = code.slice(4);                            // 接頭辞 LC1- を外した部分
  const messy = 'LC1-' + body.replace(/1/g, 'I').replace(/0/g, 'O');
  const d = decode(messy);
  ok(d.ok, 'I/O に書き間違えたコードが読めない');
  eq(d.cards.join(','), 'nagare,yose,shizume');
});

t('★接頭辞のLが壊れない（normalizeの落とし穴）', () => {
  eq(normalize('lc1-abc-de'), 'LC1ABCDE');
  ok(decode(encodeDeck(['maki'], 'ア')).ok);
});

t('打ち間違いは「もういちど」として返す（例外は投げない）', () => {
  const code = encodeDeck(['nagare'], 'ア');
  const broken = code.slice(0, -1) + (code.slice(-1) === 'Z' ? 'Y' : 'Z');
  const d = decode(broken);
  eq(d.ok, false);
  eq(d.reason, 'typo');
});

t('★でたらめな入力でも絶対に例外を投げない（1000通りのランダム文字列）', () => {
  const rng = makeRng(20260908);
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-あ漢字 ';
  for (let k = 0; k < 1000; k++) {
    let s = '';
    const len = rng.int(30);
    for (let j = 0; j < len; j++) s += chars[rng.int(chars.length)];
    const d = decode(s);                                  // 投げたらここで落ちる
    ok(typeof d === 'object' && 'ok' in d, '返り値の形が違う');
  }
  eq(decode(null).ok, false);
  eq(decode(undefined).reason, 'empty');
});

t('範囲外の値は弾かずに丸める（段位）', () => {
  const d = decode(encodeSave({ shards: 99999999, trophies: 0, tier: 99 }));
  ok(d.ok);
  ok(d.tier >= 1 && d.tier <= 6, `段位が丸められていない: ${d.tier}`);
  ok(d.shards <= 0xFFFFF, 'かけらが丸められていない');
});

t('未解放のカードが入った編成コードも受け入れる（友達の影として成立させる）', () => {
  const d = decode(encodeDeck(['haya', 'hoshi', 'shizume'], 'トモ'));
  ok(d.ok);
  eq(d.cards.join(','), 'haya,hoshi,shizume');
});

t('画面表示用の整形は読み取りと往復する', () => {
  const code = encodeDeck(['nagare', 'tame'], 'ルナ');
  ok(decode(pretty(code)).ok, '整形した文字列が読めない');
});

console.log('■ 解放の表');

t('負けても必ずかけらが貯まる', () => {
  ok(shardsForMatch({ placed: 0, captured: 0, won: false }) > 0, '0になっている');
  const lose = shardsForMatch({ placed: 20, captured: 6, won: false });
  const win = shardsForMatch({ placed: 20, captured: 6, won: true });
  ok(lose > 0 && win > lose, '勝利が加速になっていない');
  eq(win - lose, 20, '勝利ボーナスの値');
});

t('解放は累計に対して単調（減らない）', () => {
  let prevCards = 0, prevSlots = 0;
  for (let n = 0; n <= TOTAL_SHARDS; n += 25) {
    const u = unlockedAt(n);
    ok(u.cards.length >= prevCards, `かけら${n}でカードが減った`);
    ok(u.slots >= prevSlots, `かけら${n}で枠が減った`);
    prevCards = u.cards.length; prevSlots = u.slots;
  }
});

t('最初は枠ゼロ・カードゼロ（使えない枠を見せないため）', () => {
  const u = unlockedAt(0);
  eq(u.slots, 0); eq(u.cards.length, 0);
});

t('全部貯めると10種そろい、枠は3つ', () => {
  const u = unlockedAt(TOTAL_SHARDS);
  eq(u.cards.length, CARDS.length, 'カードの数が表と食い違っている');
  eq(u.slots, 3);
});

t('解放の表に載っているカードIDは実在する', () => {
  for (const u of UNLOCKS) {
    if (u.kind !== 'card') continue;
    ok(CARDS.some((c) => c.id === u.value), `表にあるのに実在しないカード: ${u.value}`);
  }
});

t('次に開くものが分かる', () => {
  const n = nextUnlock(0);
  ok(n && n.remain === 30, `最初の目標が違う: ${JSON.stringify(n)}`);
  eq(nextUnlock(TOTAL_SHARDS), null, '全部開いたのに次がある');
});

console.log('■ わざカード');

t('カードは10種、IDが重複していない', () => {
  eq(CARDS.length, 10);
  eq(new Set(CARDS.map((c) => c.id)).size, 10);
});

t('説明はすべて1行（長い説明を持たせない）', () => {
  for (const c of CARDS) {
    ok(c.text.length <= 24, `${c.id} の説明が長い（${c.text.length}字）: ${c.text}`);
    ok(!c.text.includes('\n'), `${c.id} の説明が複数行`);
  }
});

t('ためうちは自分のマスにだけ使える', () => {
  const s = newGame();
  applyMove(s, idx(0, 0));                    // p1のマスができる
  const card = CARDS.find((c) => c.id === 'tame');
  ok(isValidTarget(s, card, idx(0, 0), 1), '自分のマスを選べない');
  ok(!isValidTarget(s, card, idx(3, 3), 1), '空きマスを選べてしまう');
});

t('ほしよびは空きマスを「光の通り道」に変え、幾何を作り直す', () => {
  const s = newGame();
  const target = idx(2, 3);
  const capLeftBefore = capAt(s, idx(1, 3));
  applyCardEffect(s, CARDS.find((c) => c.id === 'hoshi'), 1, [target]);
  eq(s.terrain[target], T_STARDUST);
  ok(isWallAt(s, target), '星屑になっていない');
  ok(!canPlace(s, target, 1), '星屑に置けてしまう');
  // 左隣の飛び先が「星屑を通り抜けた先」に変わっている＝幾何が作り直されている
  ok(s.geo.targets[idx(1, 3)].includes(idx(3, 3)), '幾何が作り直されていない');
  eq(capAt(s, idx(1, 3)), capLeftBefore, '通り道になっても容量は変わらないはず');
});

t('つきかためは容量を1増やす', () => {
  const s = newGame();
  applyMove(s, idx(2, 3));
  const before = capAt(s, idx(2, 3));
  applyCardEffect(s, CARDS.find((c) => c.id === 'kata'), 1, [idx(2, 3)]);
  eq(capAt(s, idx(2, 3)), before + 1);
  eq(s.terrain[idx(2, 3)], T_CRATER);
});

t('かげぬりは相手のマスを空にする', () => {
  const s = newGame();
  s.owner[idx(4, 4)] = 2; s.count[idx(4, 4)] = 3;
  applyCardEffect(s, CARDS.find((c) => c.id === 'kage'), 1, [idx(4, 4)]);
  eq(s.owner[idx(4, 4)], 0); eq(s.count[idx(4, 4)], 0);
});

t('しずめは相手の一番多いマスを1つ減らす（対象は自動）', () => {
  const s = newGame();
  s.owner[idx(1, 1)] = 2; s.count[idx(1, 1)] = 2;
  s.owner[idx(4, 4)] = 2; s.count[idx(4, 4)] = 3;
  applyCardEffect(s, CARDS.find((c) => c.id === 'shizume'), 1, []);
  eq(s.count[idx(4, 4)], 2, '一番多いマスが減っていない');
  eq(s.count[idx(1, 1)], 2, '別のマスまで減っている');
});

console.log(`\n${fail === 0 ? '✅' : '❌'} 合計 ${pass + fail} 項目 / 合格 ${pass} / 失敗 ${fail}`);
process.exit(fail === 0 ? 0 : 1);

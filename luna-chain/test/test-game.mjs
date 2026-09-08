/**
 * ルナチェイン｜1戦の進行役（カード・月ゲージ・まきもどし）のテスト
 *   node apps/luna-chain/test/test-game.mjs
 */
import { createMatch, play, useCard, canUseCard, cardTargets, cpuCard, cpuMove, GAUGE_FULL } from '../src/game.js';
import { idx, N, T_STARDUST } from '../src/core/board.js';
import { capAt, countCells, boardSignature, legalMoves } from '../src/core/rules.js';
import { makeRng } from '../src/core/rng.js';
import {
  defaultSave, loadSave, writeSave, recordMatch, adjustTier, sanitizeDeck, loadDevice, writeDevice, recordDaily,
} from '../src/meta/progress.js';

let pass = 0, fail = 0;
const t = (n, f) => { try { f(); pass++; } catch (e) { fail++; console.error(`  ✗ ${n}\n    ${e.message}`); } };
const eq = (a, b, m = '') => { if (a !== b) throw new Error(`${m} 期待=${b} 実際=${a}`); };
const ok = (v, m = '') => { if (!v) throw new Error(m || '偽になった'); };

/** テスト用の簡易localStorage */
const fakeStorage = () => {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    _map: map,
  };
};

console.log('■ 月ゲージとカード');

t('満月でないとカードは使えない', () => {
  const m = createMatch({ myDeck: ['tame'] });
  eq(canUseCard(m, 'tame', 1), false, 'ゲージが空なのに使える');
  m.gauge[1] = GAUGE_FULL;
  eq(canUseCard(m, 'tame', 1), true, '満月でも使えない');
});

t('持ち込んでいないカードは使えない', () => {
  const m = createMatch({ myDeck: ['tame'] });
  m.gauge[1] = GAUGE_FULL;
  eq(canUseCard(m, 'kage', 1), false);
});

t('カードは1戦につき1回だけ', () => {
  const m = createMatch({ myDeck: ['tame'] });
  play(m, idx(0, 0));                       // 自分のマスを作る
  m.state.player = 1; m.state.left = 1;
  m.gauge[1] = GAUGE_FULL;
  const r1 = useCard(m, 'tame', [idx(0, 0)]);
  ok(r1.ok, '1回目が使えない');
  m.gauge[1] = GAUGE_FULL;
  eq(useCard(m, 'tame', [idx(0, 0)]).ok, false, '2回目が使えてしまう');
});

t('カードを使うとゲージが空になる', () => {
  const m = createMatch({ myDeck: ['shizume'] });
  m.state.owner[idx(3, 3)] = 2; m.state.count[idx(3, 3)] = 2;
  m.gauge[1] = GAUGE_FULL;
  useCard(m, 'shizume', []);
  eq(m.gauge[1], 0);
});

t('ながれ星は3マス選ぶ（数が合わないと使えない）', () => {
  const m = createMatch({ myDeck: ['nagare'] });
  m.gauge[1] = GAUGE_FULL;
  eq(useCard(m, 'nagare', [idx(0, 0)]).reason, 'picks', '1マスでも通ってしまう');
  m.gauge[1] = GAUGE_FULL;
  const r = useCard(m, 'nagare', [idx(0, 0), idx(1, 1), idx(2, 2)]);
  ok(r.ok, '3マスで使えない');
  eq(m.state.count[idx(1, 1)], 1);
  eq(m.state.owner[idx(2, 2)], 1);
});

t('★カードで臨界を超えたら、ちゃんと連鎖が走る', () => {
  const m = createMatch({ myDeck: ['tame'] });
  // 角(0,0)は容量2。光1つの状態で「ためうち(+2)」を撃つと3になり、はじける
  m.state.owner[idx(0, 0)] = 1; m.state.count[idx(0, 0)] = 1;
  m.state.owner[idx(5, 6)] = 2; m.state.count[idx(5, 6)] = 1;
  m.state.moves = [1, 1]; m.state.player = 1; m.state.left = 1;
  m.gauge[1] = GAUGE_FULL;
  const r = useCard(m, 'tame', [idx(0, 0)]);
  ok(r.ok, 'カードが使えない');
  ok(r.chain >= 1, `連鎖が走っていない (chain=${r.chain})`);
  ok(r.events.some((e) => e.t === 'boom'), '演出用のはじけイベントが無い');
  eq(m.state.owner[idx(1, 0)], 1, '右隣に光が飛んでいない');
});

t('カードは手番を消費しない', () => {
  const m = createMatch({ myDeck: ['tame'] });
  m.state.owner[idx(0, 0)] = 1; m.state.count[idx(0, 0)] = 1;
  m.state.moves = [1, 1]; m.state.player = 1; m.state.left = 1;
  m.gauge[1] = GAUGE_FULL;
  useCard(m, 'tame', [idx(0, 0)]);
  eq(m.state.player, 1, '手番が相手に移ってしまった');
  eq(m.state.left, 1, '置ける回数が減っている');
});

t('まきもどしは自分の直前の1手を取り消す', () => {
  const m = createMatch({ myDeck: ['maki'] });
  play(m, idx(2, 3));                        // p1
  const after = boardSignature(m.state);
  play(m, idx(5, 6)); play(m, idx(4, 6));    // p2（komiで2回）
  const before2 = boardSignature(m.state);
  play(m, idx(2, 3));                        // p1 の2手目
  ok(boardSignature(m.state) !== before2, '2手目が反映されていない');
  m.state.player = 1; m.state.left = 1;
  m.gauge[1] = GAUGE_FULL;
  const r = useCard(m, 'maki', []);
  ok(r.ok && r.undone, 'まきもどしが効いていない');
  eq(boardSignature(m.state), before2, '直前の1手の前に戻っていない');
  ok(after !== undefined);
});

t('はやおくりはもう1回置けるようにする', () => {
  const m = createMatch({ myDeck: ['haya'] });
  m.state.moves = [1, 1]; m.state.player = 1; m.state.left = 1;
  m.gauge[1] = GAUGE_FULL;
  useCard(m, 'haya', []);
  eq(m.state.left, 2, '置ける回数が増えていない');
});

t('カードの対象マスの一覧が正しい（ほしよびは空きマスだけ）', () => {
  const m = createMatch({ myDeck: ['hoshi'] });
  play(m, idx(0, 0));
  const ts = cardTargets(m, 'hoshi', 1);
  ok(!ts.includes(idx(0, 0)), '自分のマスが対象に入っている');
  ok(ts.includes(idx(3, 3)), '空きマスが対象に入っていない');
});

t('CPUは満月なら素直にカードを撃つ', () => {
  const m = createMatch({ oppDeck: ['shizume', 'nagare'] });
  m.state.player = 2;
  m.gauge[2] = GAUGE_FULL;
  m.state.owner[idx(1, 1)] = 1; m.state.count[idx(1, 1)] = 2;
  const c = cpuCard(m);
  ok(c && c.cardId, 'カードを選ばなかった');
});

t('CPUは合法手を返す', () => {
  const m = createMatch({ tier: 4 });
  const i = cpuMove(m, makeRng(1));
  ok(legalMoves(m.state).includes(i), `非合法手を返した: ${i}`);
});

t('奪ったマス数を数えている（かけらの計算に使う）', () => {
  const m = createMatch();
  m.state.owner[idx(0, 0)] = 1; m.state.count[idx(0, 0)] = 1;
  m.state.owner[idx(1, 0)] = 2; m.state.count[idx(1, 0)] = 1;
  m.state.owner[idx(0, 1)] = 2; m.state.count[idx(0, 1)] = 1;
  m.state.moves = [1, 1]; m.state.player = 1; m.state.left = 1;
  const r = play(m, idx(0, 0));
  eq(r.captured, 2, '奪った2マスを数えられていない');
  eq(m.stats.captured[1], 2);
});

console.log('■ 進み具合の保存');

t('壊れた保存でも起動できる（初期値で続行）', () => {
  const st = fakeStorage();
  st.setItem('lunachain-v1-save', '{壊れたJSON');
  const s = loadSave(st);
  eq(s.shards, 0); eq(s.tier, 2);
  st.setItem('lunachain-v1-save', 'null');
  eq(loadSave(st).shards, 0);
  st.setItem('lunachain-v1-save', '{"shards":"あ","tier":99,"recent":"x"}');
  const s2 = loadSave(st);
  eq(s2.shards, 0, '数でない値が丸められていない');
  ok(s2.tier >= 1 && s2.tier <= 6, '段位が丸められていない');
  ok(Array.isArray(s2.recent), '配列でない値が直っていない');
});

t('保存と読み込みが往復する', () => {
  const st = fakeStorage();
  const s = { ...defaultSave(), shards: 1234, tier: 4, nickname: 'ルナ' };
  ok(writeSave(s, st));
  const got = loadSave(st);
  eq(got.shards, 1234); eq(got.tier, 4); eq(got.nickname, 'ルナ');
});

t('★端末の設定（音）はセーブと別に持つ', () => {
  const st = fakeStorage();
  writeDevice({ sound: false, effects: 'light' }, st);
  writeSave({ ...defaultSave(), shards: 500 }, st);
  eq(loadDevice(st).sound, false, 'セーブを書いたら音の設定が戻った');
  eq(loadDevice(st).effects, 'light');
  eq(loadSave(st).shards, 500);
});

t('負けてもかけらが増える', () => {
  const s0 = defaultSave();
  const { save, gained } = recordMatch(s0, { won: false, placed: 18, captured: 5, deck: ['nagare'] });
  ok(gained > 0, 'かけらが増えていない');
  eq(save.shards, gained);
  eq(save.played, 1); eq(save.wins, 0);
});

t('CPUの強さは5戦たまるまで動かない／勝ちすぎたら上がる', () => {
  eq(adjustTier(3, [true, true, true]), 3, '3戦で動いてしまった');
  eq(adjustTier(3, [true, true, true, true, true]), 4, '勝ちすぎでも上がらない');
  eq(adjustTier(3, [false, false, false, false, false]), 2, '負けすぎでも下がらない');
  eq(adjustTier(1, [false, false, false, false, false]), 1, '最弱より下がった');
  eq(adjustTier(6, [true, true, true, true, true]), 6, '最強より上がった');
  eq(adjustTier(3, [true, true, false, false, false]), 3, '五分なのに動いた');
});

t('じぶんのかげ（直近の編成）が残る', () => {
  let s = defaultSave();
  for (const d of [['nagare'], ['tame'], ['kage']]) {
    s = recordMatch(s, { won: true, placed: 10, captured: 2, deck: d }).save;
  }
  eq(s.ghosts.length, 3);
  eq(s.ghosts[2].join(','), 'kage', '最新の編成が最後に来ていない');
});

t('未解放のカードは持ち込みから外れる（弾かずに丸める）', () => {
  const s = { ...defaultSave(), shards: 0 };
  eq(sanitizeDeck(s, ['nagare', 'haya']).length, 0, 'かけら0なのに持ち込めている');
  const s2 = { ...defaultSave(), shards: 300 };
  const d = sanitizeDeck(s2, ['nagare', 'haya', 'maki']);
  ok(d.includes('nagare') && d.includes('maki'), '解放済みが外れている');
  ok(!d.includes('haya'), '未解放が残っている');
  ok(d.length <= 2, `枠より多い: ${d.length}`);
});

t('デイリーの記録は少ない手数だけ更新される', () => {
  let s = defaultSave();
  s = recordDaily(s, '2026-09-08', 20);
  eq(s.daily['2026-09-08'].best, 20);
  s = recordDaily(s, '2026-09-08', 25);
  eq(s.daily['2026-09-08'].best, 20, '悪い記録で上書きされた');
  s = recordDaily(s, '2026-09-08', 14);
  eq(s.daily['2026-09-08'].best, 14, '良い記録で更新されない');
  s = recordDaily(s, '2026-09-08', 0, 'tsume');
  eq(s.daily['2026-09-08'].tsume, true);
  eq(s.daily['2026-09-08'].best, 14, '詰めルナの記録でベストが消えた');
});

console.log(`\n${fail === 0 ? '✅' : '❌'} 合計 ${pass + fail} 項目 / 合格 ${pass} / 失敗 ${fail}`);
process.exit(fail === 0 ? 0 : 1);

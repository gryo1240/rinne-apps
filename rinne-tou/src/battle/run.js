/**
 * 戦闘を1戦まわす司令塔
 *
 * UIからも、自動プレイシミュレーターからも、影闘（非同期対戦）からも
 * **同じこの関数**を使う。これによりシミュレーターの測定値が実プレイと一致する。
 */

import * as E from './engine.js';
import { chooseAction } from './ai.js';
import { SPECIES, SPECIES_BY_ID, AFFIXES } from '../../data/enemies.js';
import { statsAt, skillsAt, CHAR_BY_ID } from '../../data/chars.js';
import * as G from '../meta/growth.js';
import { BOSSES, SIDE_BOSSES } from '../../data/bosses.js';
import { TOWERS } from '../dungeon/towers.js';
import * as R from '../core/rules.js';
import { makeRng } from '../core/rng.js';

export const MAX_TURNS = 60;   // 無限ループ防止。到達したら引き分け（逃走扱い）

/** 構え → stance 配列の添字 */
const STANCE_IDX = { gou: 0, shitsu: 1, ju: 2 };

/**
 * 味方1人ぶんの行動データ（UI ⇔ エンジンの受け渡し形式）
 *
 * ★ここを `{skillId, targetIndex}` のまま固定しないこと。
 *   仕様にはまだ実装していない入力が3つあり（道具・合わせ技・逃走）、
 *   型を決め打ちにするとUIごと作り直しになる。
 *
 * @typedef {object} BattleAction
 * @property {'skill'|'item'|'combo'|'escape'} kind
 * @property {string}   [skillId]      kind='skill'
 * @property {number}   [targetIndex]  kind='skill'|'item'
 * @property {string}   [itemId]       kind='item'   （2026-08-13 実装。engine.useItem）
 * @property {string[]} [unitIds]      kind='combo'  （未実装・2人選択が要る・spec §3-2）
 */

/** kind の無い旧形式（AIの戻り値）も受け付けて正規化する */
export function normalizeAction(a) {
  if (!a) return null;
  if (a.kind) return a;
  if (a.skillId) return { ...a, kind: 'skill' };
  return null;
}

/**
 * 階層に応じた敵グループを作る
 * @param {object} o
 * @param {number|string} o.seed
 * @param {number} o.floor
 * @param {string} o.tower  'main' | 'kikoku' | 'shippu' | 'jyuso' | 'tsukiwatari'
 * @param {string} o.stanceBias 月齢による構えの偏り（'gou'|'shitsu'|'ju'|null）
 * @param {number} o.rebirth 輪廻回数
 * @param {string} o.difficulty
 * @param {number} o.allies 出撃している味方の人数（敵の数の上限になる）
 */
export function makeEnemyGroup({ seed, floor, tower = 'main', stanceBias = null, rebirth = 0, difficulty = 'normal', count = null, allies = 4 }) {
  const rng = makeRng(seed);
  const diff = R.DIFFICULTY[difficulty] || R.DIFFICULTY.normal;
  const pool = SPECIES.filter((s) => {
    if (s.towers && !s.towers.includes(tower)) return false;
    if (!s.towers && tower !== 'main') return false;   // 支塔には専用種だけを出す
    return floor >= s.f[0] && floor <= s.f[1];
  });
  /**
   * 月渡りは「その日の月齢が示す構え」の種だけを出す（spec §4-7-4）。
   * stanceBias が null（下弦・二十六夜）のときは絞らない＝3種が混ざる＝最も難しい。
   * ★構えの重みを2倍する既存の処理（下）だけでは 50→62% にしかならず、
   *   「その構えばかりが出る塔」にならない。プールごと絞るのが正しい
   */
  let usable = pool;
  if (TOWERS[tower]?.moonDriven && stanceBias) {
    const only = pool.filter((s) => s.stance[STANCE_IDX[stanceBias]] >= 100);
    if (only.length > 0) usable = only;
  }
  /**
   * フォールバック。★階層フィルタを必ず掛けること（2026-08-03 修正）。
   * 掛けずに `SPECIES.filter((s) => !s.towers)` としていたため、
   * 専用種を1つも持たない塔（月渡り）の1階に 44階の骸骨（HP190）が出ていた。
   * 同じ階の石猿(HP52)の3.6倍。本編ではプールが空にならないので表面化しなかった
   */
  if (usable.length === 0) usable = SPECIES.filter((s) => !s.towers && floor >= s.f[0] && floor <= s.f[1]);
  if (usable.length === 0) usable = SPECIES.filter((s) => !s.towers);

  /**
   * 敵の数は**味方の人数を超えない**（2026-08-03）。
   *
   * シナリオを入れて仲間が章ごとに加わるようになるまで、ここは常に「2〜4体」だった。
   * それは**最初から4人**という仮置きの上で調整した数字で、
   * 主人公ひとりの序章では 1人 対 2体 になり、計測で199/200が全滅した。
   * 数値（HP・攻撃力）ではなく**頭数**で釣り合いを取る:
   *   1人 → 1体（序章＝チュートリアル）
   *   2人 → 2〜3体 ／ 3人 → 2〜4体 ／ 4人 → 2〜4体（従来どおり）
   *
   * ★「味方の数ちょうど」まで減らすと易しくしすぎた（全滅が9.7回→3.6回）。
   *   多勢に無勢の緊張は残したいので、**上限は味方+1**にしてある。
   *   ただし主人公ひとりのときだけは例外で1体（ここは2体で199/200が全滅した）。
   */
  const cap = allies <= 1 ? 1 : Math.max(1, Math.min(4, allies + 1));
  const hi = Math.min(floor < 5 ? 2 : 4, cap);
  const lo = Math.min(2, hi);
  const n = count ?? rng.int(lo, hi);
  // ステータス種別ごとに傾きが違う（rules.ENEMY_SCALE のコメント参照）
  const common = R.deepScale(floor) * R.rebirthScale(rebirth) * diff.enemyMul;

  const out = [];
  for (let i = 0; i < n; i++) {
    const sp = rng.pick(usable);
    const affix = rng.weighted(AFFIXES);
    const stats = {};
    for (const k of ['hp', 'atk', 'def', 'spd', 'mag', 'luk']) {
      const m = affix.mul[k] || 1;
      stats[k] = Math.max(1, Math.floor(sp.base[k] * R.enemyScaleFor(k, floor) * common * m));
    }
    // 月齢による構えの偏り（有利不利ではなく「内容の変化」・spec §5）
    let sw = sp.stance.slice();
    if (stanceBias) {
      const idx = STANCE_IDX[stanceBias];
      if (idx != null && sw[idx] > 0) sw[idx] = sw[idx] * 2;
    }
    out.push(E.makeEnemy({
      id: `${sp.id}_${i}`,
      name: (affix.name || '') + sp.name,
      mon: sp.mon, color: sp.color, art: sp.id,   // 絵は種族単位（idは個体ごとに連番）
      stats, acts: sp.acts, stanceWeights: sw,
    }));
  }
  return out;
}

/**
 * 層ボスのグループを作る（本体＋守護者）
 * ボスは生成式ではなく data/bosses.js の手書きデータを使う（spec §8-1）
 *
 * @param {string} o.tower      塔ID。支塔は SIDE_BOSSES から引く（2026-08-03 追加）
 * @param {number} o.floor      その塔での階数（支塔は1〜10）
 * @param {number} o.powerFloor 強さの計算に使う階数。省略時は floor（＝本編は従来どおり）
 *
 * ★`tower` を渡さずに呼ぶと本編のボスが出る。以前はこれしか無かったため、
 *   疾風廊（疾の塔）の10階に本編10階の「朽ちた門番」（剛）が出ていた
 */
export function makeBossGroup({ tower = 'main', floor, powerFloor = null, rebirth = 0, difficulty = 'normal', allies = 4, dup = false }) {
  const raw = tower === 'main' ? BOSSES[floor] : SIDE_BOSSES[tower]?.[floor];
  if (!raw) return null;
  const def = dup ? duplicateOf(raw) : raw;
  const pf = powerFloor ?? floor;
  const diff = R.DIFFICULTY[difficulty] || R.DIFFICULTY.normal;
  const common = R.deepScale(pf) * R.rebirthScale(rebirth) * diff.enemyMul * R.bossPartyScale(allies);

  const scale = (k, v) => Math.max(1, Math.floor(v * R.enemyScaleFor(k, pf) * common));
  const stats = {
    hp: scale('hp', def.base.hp), atk: scale('atk', def.base.atk), def: scale('def', def.base.def),
    spd: scale('spd', def.base.spd), mag: scale('mag', def.base.mag), luk: scale('luk', def.base.luk),
  };

  const boss = E.makeEnemy({
    id: def.id, name: def.name, mon: def.mon, color: def.color,
    // ★絵は**本物のid**で引く（写し身は id を変えてあるため。`dupOf` がその控え）
    art: `boss_${def.dupOf || def.id}`,   // キャラの「無銘」と id が衝突するので前置する
    stats, acts: def.acts, stanceWeights: def.stance,
    phases: def.phases || null, isBoss: true,
  });
  boss.protectDR = def.protectDR || 0;
  boss.hint = def.hint;

  const group = [boss];
  for (const [i, p] of (def.protectors || []).entries()) {
    group.push(E.makeEnemy({
      id: `${def.id}_p${i}`, name: p.name, mon: p.mon, color: p.color,
      art: `boss_${def.dupOf || def.id}_p`,     // 守護者の絵（無ければ漢字の紋に落ちる）
      stats: {
        hp: Math.max(1, Math.floor(stats.hp * p.hpRate)),
        atk: Math.floor(stats.atk * p.statRate), def: Math.floor(stats.def * p.statRate),
        spd: Math.floor(stats.spd * p.statRate), mag: Math.floor(stats.mag * p.statRate),
        luk: Math.floor(stats.luk * p.statRate),
      },
      acts: p.acts, stanceWeights: p.stance, protects: def.id,
    }));
  }
  return group;
}

/**
 * 二度目からのボス＝**写し身**（2026-08-12 オーナー要望
 * 「一度倒したボスは、ボスの複製体みたいな形で出現するようにしよう。同じボスだと感動が薄れる」）。
 *
 * 【何を変えるか】強さではなく**読みやすさ**を変える。
 *   ・形態変化（phases）を消し、全形態の行動を最初から混ぜる
 *   ・構えの重みを三等分にする
 *   → 「半分を切ったら呪が来る」という**憶えた段取りが通じない**相手になる。
 *      本物は段取りを読ませる設計なので、写しはその逆を張るのが一番効く。
 *
 * 【なぜ数値をいじらないか】層ボスの基礎値は `tools/tune_boss.mjs` で
 *   初見突破率を見ながら詰めた数字なので、倍率を掛けると調整がまるごと無効になる。
 *   HPだけ0.9倍にしてあるのは、行動が散らばって決着が延びるぶんの埋め合わせ。
 *
 * ★守護者（protectors）はそのまま。写しにも供がいる（減らすと難易度が別物になる）。
 */
export function duplicateOf(def) {
  const acts = [...new Set([...(def.acts || []), ...(def.phases || []).flatMap((p) => p.acts || [])])];
  return {
    ...def,
    id: `${def.id}_utsushi`,
    name: `${def.name}の写し身`,
    base: { ...def.base, hp: Math.max(1, Math.floor(def.base.hp * 0.9)) },
    acts,
    stance: [34, 33, 33],
    phases: null,
    dupOf: def.id,               // 絵は本物を使う（art は呼び出し側で def.id ではなくこれを見る）
    hint: '一度倒した主の写し。段取りが無く、三つの構えを気まぐれに使う',
    desc: `${def.desc}——ただし輪郭が薄く、二重に見える`,
  };
}

/**
 * セーブデータのキャラ情報 → 戦闘用の味方ユニット
 * @param {object} saveOrChars セーブ全体（装備を反映する）または chars だけ（テスト用の簡易形）
 */
export function makeParty(saveOrChars, activeIds, tacticOverrides = {}) {
  const isFullSave = !!(saveOrChars && saveOrChars.chars && saveOrChars.inv);
  const chars = isFullSave ? saveOrChars.chars : saveOrChars;

  return activeIds.map((id) => {
    const c = CHAR_BY_ID[id];
    const sc = chars[id] || { lv: 1, renki: {}, skills: {} };
    // 装備込みの最終ステータス。セーブ全体が渡されたときだけ装備を反映する
    const stats = isFullSave ? G.finalStats(saveOrChars, id) : statsAt(id, sc.lv, sc.renki);
    /**
     * 使う技。**レベルで増える**（2026-08-12）。
     * ★`sc.equipped`（手で選んだ技）は v1.0 では画面から設定できないので、
     *   実質いつも `skillsAt()` 側を通る。将来スキル書で選べるようにするときは、
     *   「覚えていない技が equipped に残る」場合を必ず弾くこと
     */
    const usable = skillsAt(id, sc.lv || 1);
    const equipped = sc.equipped && sc.equipped.length
      ? sc.equipped.filter((sid) => usable.includes(sid))
      : usable;
    return E.makeAlly({
      id, name: sc.name || c.name, mon: c.mon, color: c.color,
      stats, skills: equipped,
      meguri: isFullSave ? (stats.meguri || 0) : (c.meguri || 0),
      crushBonus: isFullSave ? (stats.crushBonus || 0) : 0,
      resist: isFullSave ? (stats.resist || 0) : 0,
      tactic: tacticOverrides[id] || 'follow',
    });
  });
}

/**
 * 戦闘の本体。**1ステップずつ止まるジェネレータ**。
 *
 * 【なぜジェネレータか】
 * UIは (a) 敵の構え予告を見せ (b) 1行動ずつ演出し (c) 手動モードでは入力を待つ、
 * が必要だが、シミュレーターは一気に最後まで回したい。
 * **実装をここ1つに統一する**ことで、
 * 「シミュレーターの測定値がそのまま実プレイの数値である」という前提を守る。
 * runBattle() はこれを最後まで回すだけの薄いラッパー。
 *
 * 【厳守】yield はゲーム状態を変えない（乱数を消費しない）。
 *        yield を挟んだだけで結果が変わるなら、それはバグ。
 *        test/golden.mjs が乱数の呼び出し回数まで見て検出する。
 *
 * 手動入力: manualFor(unit) が true を返した味方について
 *   `{type:'needInput', unit}` を yield し、`it.next(action)` で受け取る。
 *   **action を渡さなければ AI が決める**ので、オート経路と手動経路の
 *   コードパスは完全に同一になる（＝両者が一致することをテストできる）。
 *
 * @yields {{type:'turnStart'|'stances'|'order'|'needInput'|'acted'|'turnEnd', ...}}
 * @returns {{result:'win'|'lose'|'escape'|'draw', turns:number, log:Array, battle:object}}
 */
export function* battleSteps({ seed, allies, enemies, partyTactic = 'omakase', tokoyami = false, difficulty = 'normal', bossFight = false, maxTurns = MAX_TURNS, autoEscapeAt = 0, escapeAtOf = null, manualFor = null, pouch = null, dex = null }) {
  const b = E.createBattle({ seed, allies, enemies, tokoyami, difficulty, bossFight, pouch, dex });
  // 作戦は**状態として持つ**（戦闘中に変更できるようにするため・spec §3-8-2）
  b.partyTactic = partyTactic;
  // 確定した行動を記録しておく。影闘のリプレイ（v1.2・spec §11-3）がこれを使う
  b.inputs = [];

  // 直前の yield 以降に増えたログ行だけを取り出す。
  // ★添字ではなく seq を見る（engine.js の push は200行でshiftするため）
  let seen = 0;
  const since = () => { const out = b.log.filter((l) => l.seq > seen); seen = b.logSeq || 0; return out; };

  while (!b.over && b.turn < maxTurns) {
    b.turn++;
    yield { type: 'turnStart', battle: b, turn: b.turn };

    // 全滅の一歩手前でオートが逃げる（spec §4-5-b「理不尽に死なない」の実装）
    // ボス戦・常闇では逃走不可。閾値は作戦によって変わる（いのちだいじに/無傷でいけ が高い）
    // ★この位置（declareStances より前）を動かすと、以降の乱数が全部ずれる
    // 閾値は**その時点の作戦**で引き直す。戦闘中に「いのちだいじに」へ変えたのに
    // 引き際が開始時の作戦のままだと、spec §3-8-2「戦闘中いつでも変更可」の意図とずれる
    const escAt = escapeAtOf ? (escapeAtOf(b.partyTactic) ?? autoEscapeAt) : autoEscapeAt;
    if (escAt > 0 && !bossFight && !tokoyami && b.turn > 1) {
      const living = E.livingOf(b.allies);
      const ratio = living.reduce((a, u) => a + u.hp, 0) / Math.max(1, allies.reduce((a, u) => a + u.max.hp, 0));
      if (ratio <= escAt && E.tryEscape(b)) {
        yield { type: 'acted', battle: b, unit: null, lines: since() };
        break;
      }
    }

    E.declareStances(b);                       // ①予告フェーズ（構えが見える）
    yield { type: 'stances', battle: b, lines: since() };

    // ②行動順の確定（★入力より前）
    //
    // 2026-08-02 変更: もとは入力の後に決めていた。前に移した理由は3つ。
    //  1. spec §2-1 のタイムライン表示は「確定した順」でないと作れない。
    //     予測を確定のように見せて実際にずれるのが、いちばん悪い
    //  2. 「鈴の回復がボスの一撃より先か後か」は回復対象の選択そのものを変える判断。
    //     見えないと「運で殺された」になり、spec §4-5-b の意図と衝突する
    //  3. AIに行動順を渡せるようになる（オートが本線なので体験の中核に効く）
    // ※これで乱数の消費順が変わるため、バランスを再計測している
    const order = E.buildOrder(b);
    b.order = order;
    yield { type: 'order', battle: b, order };

    // ③入力フェーズ（オート or 手動）
    const decided = new Map();
    let wantEscape = false;
    for (const u of E.livingOf(b.allies)) {
      let action = null;
      if (manualFor && manualFor(u)) action = yield { type: 'needInput', battle: b, unit: u };
      action = normalizeAction(action);
      if (action && action.kind === 'escape') { wantEscape = true; action = null; }
      // 合わせ技はまだ型だけ（2人選択が要る・spec §3-2）。
      // 黙って通常攻撃にすり替えず、AIの判断に戻す（誤作動を隠さない）。
      // ★道具は 2026-08-13 に実装済みなので、そのまま通す
      else if (action && action.kind !== 'skill' && action.kind !== 'item') action = null;
      if (!action) action = chooseAction(b, u, b.partyTactic);
      decided.set(u, action);
      b.inputs.push({ turn: b.turn, id: u.id, action });
    }

    // 手動で「逃げる」を選んだ場合。成功したらそのターンの行動は起きない
    if (wantEscape) {
      const ok = E.tryEscape(b);
      yield { type: 'acted', battle: b, unit: null, lines: since() };
      if (ok) break;
    }

    // ④解決フェーズ（確定した順に処理）
    for (const u of order) {
      if (b.over) break;
      if (!u.alive) continue;
      if (u.side === 'ally') E.actAlly(b, u, decided.get(u) || { skillId: 'atk_normal', targetIndex: 0 });
      else E.actEnemy(b, u);
      // 決着したターンは endTurn を通らない＝バフ・状態異常のターン経過が進まない。
      // これは意図的（決着後の後片付けに意味がないため）。触ると数値が動く。
      if (E.livingOf(b.enemies).length === 0) { b.over = true; b.result = 'win'; }
      else if (E.livingOf(b.allies).length === 0) { b.over = true; b.result = 'lose'; }
      yield { type: 'acted', battle: b, unit: u, lines: since() };
      if (b.over) break;
    }

    // ⑤終了フェーズ
    if (!b.over) {
      E.endTurn(b);
      yield { type: 'turnEnd', battle: b, lines: since() };
    }
  }

  if (!b.over) { b.over = true; b.result = 'draw'; }
  return { result: b.result, turns: b.turn, log: b.log, battle: b };
}

/**
 * 戦闘を最後までまわす（オート）。シミュレーター・バランス計測・影闘はこれを使う。
 * **同期関数のまま**にしてあるのは、Node側のテストを await 汚染しないため。
 */
export function runBattle(opts) {
  const it = battleSteps(opts);
  let r = it.next();
  while (!r.done) r = it.next();     // 引数なし＝手動入力なし＝AIが決める
  return r.value;
}

/** 勝利時の獲得経験値・銭（深度ボーナスは呼び出し側で掛ける） */
export function battleReward(enemies, floor, rebirth = 0, difficulty = 'normal') {
  const diff = R.DIFFICULTY[difficulty] || R.DIFFICULTY.normal;
  let exp = 0, zeni = 0;
  for (const e of enemies) {
    exp += Math.floor((e.max.hp * 0.35 + e.atk * 2 + e.mag * 2) * 0.9);
    zeni += Math.floor(e.max.hp * 0.12 + e.atk * 1.2);
  }
  const m = R.rebirthReward(rebirth) * diff.rewardMul;
  return { exp: Math.floor(exp * m * R.EXP_RATE), zeni: Math.floor(zeni * m * R.ZENI_RATE) };
}

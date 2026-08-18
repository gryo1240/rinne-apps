/**
 * 戦闘エンジン（DOM非依存・完全に決定論）
 *
 * 【厳守】
 *  - Math.random() / Date.now() をこのファイルで使わない。乱数はシードから作る
 *  - 同じ (seed, party, enemies, 作戦) なら必ず同じ結果になること
 *    → 影闘（非同期対戦）のリプレイと、自動プレイシミュレーターがこれに依存する
 *
 * 仕様: rinne-tou-spec.md §3（構え読み） / §3-8（オート戦闘と作戦）
 */

import { makeRng } from '../core/rng.js';
import * as R from '../core/rules.js';
import { SKILLS, AILMENTS, ENEMY_ACTS } from '../../data/skills.js';
import { BOSS_ACTS } from '../../data/bosses.js';
import { ITEM_BY_ID } from '../../data/items.js';

/** 通常敵とボスの行動を1つの表として引く */
const ALL_ACTS = { ...ENEMY_ACTS, ...BOSS_ACTS };

/**
 * 1人が戦闘に持ち込める技の数。
 *
 * ★2026-08-13 に 6 → 9 へ広げた（オーナー要望「レベルを上げたらさらに強力な技を覚える」）。
 *   高位の技を3段（Lv50/60/80）足したので、6のままだと
 *   **覚えたはずの技が黙って捨てられる**（`slice` は後ろから落とすので、
 *   落ちるのは新しく覚えた強い技のほう）。
 * ★`data/chars.js` の「基本＋習得 ≤ この数」を `test.mjs` で機械的に見ている。
 *   ここを増やしたら、手動戦闘のコマンド一覧もそのぶん縦に伸びる（縦並びなので破綻はしない）。
 */
export const MAX_SKILLS = 9;

// ── 戦闘ユニットの生成 ────────────────────────────────────

/** 味方ユニット */
export function makeAlly({ id, name, mon, color, stats, skills, tactic = 'omakase', meguri = 0, crushBonus = 0, resist = 0 }) {
  return {
    side: 'ally', id, name, mon, color,
    max: { hp: stats.hp, ki: stats.ki },
    hp: stats.hp, ki: stats.ki,
    atk: stats.atk, def: stats.def, spd: stats.spd, mag: stats.mag, luk: stats.luk,
    meguri, crushBonus, resist, skills: skills.slice(0, MAX_SKILLS), tactic,
    ailments: {}, buffs: [], taunt: 0, alive: true,
  };
}

/** 敵ユニット */
/**
 * @param {string} [o.art] 絵のID（assets/mon/<art>.png）。
 *   `id` は個体ごとに `onibi_0` のように連番が付くので、絵は種族/ボスのIDで別に持つ。
 *   ★キャラの「無銘」とボスの「無銘の影」は id が同じ `mumei` なので、
 *     ボス側は `boss_` を前置して衝突を避けている
 */
export function makeEnemy({ id, name, mon, color, stats, acts, stanceWeights, phases = null, isBoss = false, protects = null, resist = 0, art = null }) {
  return {
    side: 'enemy', id, name, mon, color, art,
    max: { hp: stats.hp, ki: 0 },
    hp: stats.hp, ki: 0,
    atk: stats.atk, def: stats.def, spd: stats.spd, mag: stats.mag, luk: stats.luk,
    acts, stanceWeights, phases, isBoss, protects, resist,
    nextAct: null,          // 予告される次の行動（構え読みの核）
    ailments: {}, buffs: [], taunt: 0, alive: true,
  };
}

// ── 補助 ──────────────────────────────────────────────────

function hasAilment(u, id) { return (u.ailments[id] || 0) > 0; }

function buffMul(u, key) {
  let m = 1;
  for (const b of u.buffs) if (b.key === key) m += b.value;
  return m;
}

/** 状態異常込みの実効ステータス */
export function effStat(u, key) {
  let v = u[key] * buffMul(u, key);
  if (key === 'spd') {
    if (hasAilment(u, 'mahi')) v *= AILMENTS.mahi.spdMul;
    if (hasAilment(u, 'don')) v *= AILMENTS.don.spdMul;
  }
  return v;
}

/** 被ダメージ倍率（脆など） */
function takenMul(u) {
  return hasAilment(u, 'moro') ? AILMENTS.moro.takenMul : 1;
}

function livingOf(units) { return units.filter((u) => u.alive); }

/** 気の消費量（枯なら1.5倍） */
export function kiCostOf(u, skill) {
  const base = skill.ki || 0;
  return hasAilment(u, 'kare') ? Math.ceil(base * AILMENTS.kare.kiCostMul) : base;
}

/** そのスキルが今使えるか */
export function canUse(u, skill) {
  if (skill.id === 'atk_normal') return true;
  if (hasAilment(u, 'fu')) return false;      // 封＝スキル使用不可
  return u.ki >= kiCostOf(u, skill);
}

// ── 戦闘状態の作成 ────────────────────────────────────────

export function createBattle({ seed, allies, enemies, tokoyami = false, difficulty = 'normal', bossFight = false, pouch = null, dex = null }) {
  const rng = makeRng(seed);
  const diff = R.DIFFICULTY[difficulty] || R.DIFFICULTY.normal;
  if (tokoyami) {
    for (const e of enemies) {
      // ★攻撃（atk・mag）だけ倍率が違う（2026-08-12 オーナー指示「敵の攻撃を100%アップ」）。
      //   守り・速さ・HPまで2.0にすると倒しきれず、引き返す判断ごと成立しなくなる
      for (const k of ['atk', 'mag']) e[k] = Math.floor(e[k] * R.TOKOYAMI_ENEMY_ATK_MUL);
      for (const k of ['def', 'spd']) e[k] = Math.floor(e[k] * R.TOKOYAMI_ENEMY_MUL);
      e.hp = Math.floor(e.hp * R.TOKOYAMI_ENEMY_MUL);
      e.max.hp = e.hp;
    }
  }
  return {
    rng,
    /**
     * ★AI専用の乱数ストリーム（rng とは独立）
     *
     * UIが「いま何をするのが良さそうか」を表示するために chooseAction() を呼ぶと、
     * それだけで b.rng が進んで**戦闘結果そのものが変わってしまう**。
     * AIの判断は本流と別のストリームから引くことで、
     * 「表示のために計算しただけで結果が変わる」事故を構造的に潰す。
     */
    aiRng: makeRng(`${seed}:ai`),
    allies, enemies, turn: 0, crushGauge: 0,
    /**
     * ★プレイヤーが「こいつを狙え」と指した敵の**種族ではなく個体のid**（2026-08-10）。
     *
     * これは**行動の上書きではなく、AIの評価への加点**（`ai.js` の FOCUS_BONUS）。
     * 上書きにすると、瀕死の味方がいても回復せず殴りに行く作戦AIになってしまう。
     * ★null のときは候補も同点処理も**1ビットも変わらない**。
     *   だから `runBattle`（＝ゴールデン26シナリオ）は緑のままでなければならない。
     *   赤くなったら、指定していない経路に漏れた証拠。
     */
    focus: null,
    /**
     * この戦闘に持ち込んだ道具（2026-08-13）。`{itemId: 残り数}`。
     *
     * ★**既定は空**。空なら道具の候補は1つも作られないので、
     *   `runBattle`（ゴールデン26シナリオ・シミュレーター・影闘）は1ビットも変わらない。
     *   道具を渡すのは実プレイの経路（`explore.js` → `screen_battle.js`）だけ。
     * ★使った数は `itemsUsed` に積む。潜行の持ち物へ引くのは呼び出し側の仕事
     *   （エンジンはセーブを知らない）。
     */
    pouch: pouch ? { ...pouch } : {},
    itemsUsed: {},
    /**
     * 図鑑に載せた敵（2026-08-16）。`{種族id: 1}`。
     *
     * ★上級作戦「読み切れ」だけがこれを見る（`ai.js` の `knownEnemy`）。
     *   **既定は null＝「何も知らない」**。渡さなければ読み切れは臨機応変と同じ動きになるので、
     *   ゴールデン26シナリオ・シミュレーター・影闘は1ビットも変わらない。
     */
    dex: dex ? { ...dex } : null,
    order: [],                 // そのターンの行動順（入力より前に確定・spec §2-1のタイムライン）
    tokoyami, bossFight, diff,
    log: [], over: false, result: null,
  };
}

/**
 * @param {object} [meta] 数字をキャラの上に飛ばすための材料（2026-08-05）。
 *   `{ target: ユニット, amount: 数値 }`。**text を組み立て直さないこと**。
 *   ゴールデンログは turn/kind/text の3つだけを見ているので、
 *   ここに項目を足すぶんには基準は動かないが、text を1文字でも変えると全シナリオが落ちる。
 *   ★UIは `b` をそのまま持っているので、target はオブジェクトの同一性で引き当てられる。
 *     文面から正規表現で数字を拾う実装にはしない（会心・崩し・スリップで文型が増えるたびに壊れる）
 *
 *   ⚠ **meta のキーに `seq` `turn` `kind` `text` を使わないこと。**
 *     下の Object.assign で上書きされ、ゴールデンログが静かに壊れる。
 *
 *   ★エフェクトの絵を出すための `skillId` / `actId` / `ail` もここに載せている（2026-08-06）。
 *     「表示のための情報」だが、この層はもともと text という完成文を吐いているので
 *     IDを渡すほうが presentational 度は低い。UI側で引き直す道は無い
 *     （battleSteps の acted は skill を持たず、状態異常は文面以外に手がかりが無い）
 */
function push(b, text, kind = 'info', meta = null) {
  // seq は**単調増加**（shift しても戻らない）。
  // UIが「この行動で増えた行」を取り出すのに使う。
  // 配列の添字で切り出すと、下の shift が起きる201行目以降で必ず壊れる。
  b.logSeq = (b.logSeq || 0) + 1;
  const row = { seq: b.logSeq, turn: b.turn, kind, text };
  if (meta) Object.assign(row, meta);
  b.log.push(row);
  if (b.log.length > 200) b.log.shift();   // ログは200行で打ち切り（tech-design §8）
}

// ── フェーズ1: 敵の構えを予告する ──────────────────────────

export function declareStances(b) {
  for (const e of livingOf(b.enemies)) {
    // 形態変化（ボス）: HP割合で構えの傾向と行動が入れ替わる（data/bosses.js の phases）
    let actIds = e.acts, weights = e.stanceWeights;
    if (e.phases && e.phases.length) {
      const ratio = e.hp / e.max.hp;
      const ph = e.phases.find((p) => ratio > p.hpAbove) || e.phases[e.phases.length - 1];
      if (ph) {
        if (e.phaseId !== ph.acts.join()) {
          e.phaseId = ph.acts.join();
          if (e.isBoss) push(b, `${e.name} の様子が変わった`, 'phase');
        }
        actIds = ph.acts; weights = ph.stance;
      }
    }
    const acts = actIds.map((id) => ALL_ACTS[id]).filter(Boolean);
    // 構えの重み [剛,疾,呪] に従って構えを選び、その構えの行動から1つ選ぶ
    const [wg, ws, wj] = weights;
    const pickStance = b.rng.weighted([
      { w: wg, v: 'gou' }, { w: ws, v: 'shitsu' }, { w: wj, v: 'ju' },
    ]).v;
    let pool = acts.filter((a) => a.stance === pickStance);
    if (pool.length === 0) pool = acts;
    e.nextAct = b.rng.pick(pool);
  }
}

// ── フェーズ2: 行動順の決定 ───────────────────────────────

export function buildOrder(b) {
  const units = [...livingOf(b.allies), ...livingOf(b.enemies)];
  const scored = units.map((u) => ({ u, v: effStat(u, 'spd') * b.rng.float(0.9, 1.1) }));
  scored.sort((a, z) => z.v - a.v);
  return scored.map((s) => s.u);
}

// ── ダメージ適用 ──────────────────────────────────────────

function applyDamage(b, attacker, target, opts) {
  const isMagic = !!opts.magic;
  const atk = isMagic ? effStat(attacker, 'mag') : effStat(attacker, 'atk');
  const def = effStat(target, 'def');
  const critHit = b.rng.next() * 100 < (R.critRate(effStat(attacker, 'luk')) + (opts.critBonus || 0));
  let stateMul = takenMul(target);
  if (target.side === 'ally') stateMul *= b.diff.takenMul;
  // 守護者（分身）が生きている間は本体へのダメージが激減する（spec §8-1 40Fボス）
  if (target.protectDR && b.enemies.some((e) => e.alive && e.protects === target.id)) {
    stateMul *= (1 - target.protectDR);
  }
  // ★引数を先に1つ作る。`opts.fullPower` の計算で**乱数をもう一度引いてはいけない**。
  //   `b.rng` の消費回数が変わると、以降の抽選が全部ずれてゴールデン26シナリオが落ちる
  //   （＝挙動を変えたことになる）。`R.damage` は乱数を持たない純粋な計算なので、
  //   同じ `rand` を渡して威力だけ変えれば「崩していなかったら何点だったか」が出る
  const args = {
    atk, def, isMagic,
    affMul: opts.affMul ?? 1,
    critMul: critHit ? R.CRIT_MUL : 1,
    stateMul,
    rand: b.rng.float(R.DMG_RAND_MIN, R.DMG_RAND_MAX),
  };
  const dmg = R.damage({ ...args, power: opts.power });
  // 崩しで威力が半減しているときだけ、本来の値を添える（それ以外は 0＝出さない）
  const fullDmg = (opts.fullPower != null && opts.fullPower !== opts.power)
    ? R.damage({ ...args, power: opts.fullPower })
    : 0;
  target.hp = Math.max(0, target.hp - dmg);
  if (hasAilment(target, 'kon') && AILMENTS.kon.wakeOnHit) target.ailments.kon = 0;
  if (target.hp === 0) { target.alive = false; push(b, `${target.name} は力尽きた`, 'down'); }
  return { dmg, critHit, fullDmg };
}

function tryAilment(b, target, ail) {
  if (!ail) return false;
  const resist = target.resist || 0;                 // 装備の状態異常耐性（spec §6-2）
  if (b.rng.next() * 100 >= ail.rate * (1 - resist / 100)) return false;
  const def = AILMENTS[ail.id];
  if (!def) return false;
  target.ailments[ail.id] = def.turns;
  push(b, `${target.name} は「${def.name}」になった`, 'ailment', { target, ail: def.id });
  return true;
}

// ── フェーズ3: 味方の行動 ─────────────────────────────────

/**
 * @param action {skillId, targetIndex} targetIndex は敵配列 or 味方配列のindex
 */
export function actAlly(b, unit, action) {
  if (!unit.alive) return;
  if (hasAilment(unit, 'kon')) { push(b, `${unit.name} は昏倒している`); return; }
  if (hasAilment(unit, 'mahi') && b.rng.next() < AILMENTS.mahi.actFailRate) {
    push(b, `${unit.name} は麻痺で動けない`); return;
  }

  // 道具を使う（2026-08-13）。★わざの選択より前に見る（action.skillId を持たないため）
  if (action && action.kind === 'item') { useItem(b, unit, action); return; }

  const skill = SKILLS[action.skillId] || SKILLS.atk_normal;
  if (!canUse(unit, skill)) { push(b, `${unit.name} は${skill.name}を使えない`); return; }

  // 気の増減
  if (skill.id === 'atk_normal') {
    if (!hasAilment(unit, 'kare')) unit.ki = Math.min(unit.max.ki, unit.ki + R.KI_REGEN_ATTACK + unit.meguri);
  } else {
    unit.ki -= kiCostOf(unit, skill);
  }

  // 自己バフ・挑発
  if (skill.selfBuff) {
    for (const [k, v] of Object.entries(skill.selfBuff)) {
      if (k === 'turns') continue;
      unit.buffs.push({ key: k, value: v, turns: skill.selfBuff.turns });
    }
  }
  if (skill.taunt) { unit.taunt = skill.taunt.turns; push(b, `${unit.name} は前へ出た`); }

  // 回復
  if (skill.heal) {
    const targets = skill.target === 'allyAll' ? livingOf(b.allies) : [b.allies[action.targetIndex] || livingOf(b.allies)[0]];
    for (const t of targets) {
      if (!t || !t.alive) continue;
      const amount = Math.floor(skill.heal * (1 + effStat(unit, 'mag') / 200));
      t.hp = Math.min(t.max.hp, t.hp + amount);
      push(b, `${unit.name} の${skill.name}。${t.name} のHPが ${amount} 回復`, 'heal', { target: t, amount, skillId: skill.id });
    }
    return;
  }

  if (skill.power <= 0) { push(b, `${unit.name} は${skill.name}を使った`); return; }

  /**
   * 常闇では手元が見えない（2026-08-12 オーナー指示「味方の攻撃を50%の確率で外す」）。
   *
   * ★**攻撃だけ**に効かせる。回復・支援まで外れると、
   *   立て直す手段そのものが運になって「何をしても死ぬ」になる。
   * ★気はすでに引かれている（上で消費済み）。外しても戻さないのが対価。
   * ★1対象ずつではなく**その行動につき1回**判定する。全体攻撃で
   *   1体ずつ判定すると、当たる数が平均化されて「半分外す」感が消える。
   */
  if (b.tokoyami && b.rng.next() < R.TOKOYAMI_MISS) {
    push(b, `${unit.name} の${skill.name}は、常闇に呑まれて空を切った`, 'miss', { target: unit });
    return;
  }

  // 攻撃対象
  const enemies = livingOf(b.enemies);
  if (enemies.length === 0) return;
  const targets = skill.target === 'all' ? enemies : [b.enemies[action.targetIndex]?.alive ? b.enemies[action.targetIndex] : enemies[0]];

  for (const t of targets) {
    if (!t || !t.alive) continue;
    // ★構え読み（本作の核）: 味方スキルの系統 × 敵の予告構え
    const aff = R.affinityOf(skill.line, t.nextAct ? t.nextAct.stance : null);
    // 装備の「崩し時ダメージ+X%」は崩しが成立したときだけ乗る
    const crushExtra = aff === R.AFFINITY.CRUSH ? 1 + (unit.crushBonus || 0) / 100 : 1;
    const { dmg, critHit } = applyDamage(b, unit, t, {
      power: skill.power, magic: skill.magic,
      affMul: R.affinityMul(aff) * crushExtra, critBonus: skill.critBonus,
    });

    let tag = '';
    let kind = 'damage';
    if (aff === R.AFFINITY.CRUSH) {
      t.crushed = true;                 // この敵の予告行動は威力半減＋追加効果不発になる
      b.crushGauge = Math.min(R.CRUSH_GAUGE_MAX, b.crushGauge + 1);
      tag = ' ＜崩し！＞';
      kind = 'crush';                   // UIはこの種別で演出を出す（文言との一致で判定しない）
    } else if (aff === R.AFFINITY.ADVERSE) {
      t.adverse = true;                 // 逆風＝敵の行動が強化される
      tag = ' ＜逆風＞';
      kind = 'adverse';
    }
    push(b, `${unit.name} の${skill.name}${critHit ? '（会心）' : ''} → ${t.name} に ${dmg} ダメージ${tag}`, kind, { target: t, amount: dmg, crit: critHit, skillId: skill.id });
    if (t.alive) tryAilment(b, t, skill.ailment);
  }
}

// ── 道具（2026-08-13） ────────────────────────────────────

/** その道具が戦闘中に使えるか（`data/items.js` の use） */
export function battleUsable(it) { return !!it && (it.use === 'both' || it.use === 'battle'); }

/** 残り数 */
export function pouchCount(b, id) { return (b.pouch && b.pouch[id]) || 0; }

/**
 * 道具を1つ使う。**1人ぶんの行動を丸ごと使う**（わざと同じ扱い）。
 *
 * ★乱数を1回も引かない。効果は全部固定値（`data/items.js`）。
 *   引くと、道具を持っているかどうかで以降の戦闘の乱数列がずれ、
 *   同じシードでも結果が変わってしまう。
 * ★対象は味方のみ。敵に投げる道具は作っていない（作るならここに枝を足す）。
 */
export function useItem(b, unit, action) {
  const it = ITEM_BY_ID[action.itemId];
  if (!battleUsable(it)) { push(b, `${unit.name} は道具を使えなかった`); return; }
  if (pouchCount(b, it.id) <= 0) { push(b, `${it.name} はもう無い`); return; }

  /**
   * ★蘇生の薬は**倒れている仲間がいなければ減らさない**（2026-08-16）。
   *   ほかの薬と違い、対象が生きていたら効果が丸ごと空振りする。
   *   ここで先に見ておかないと、押した瞬間に高い薬だけが消える。
   */
  if (it.revive && !b.allies.some((a) => !a.alive)) {
    push(b, `${unit.name} は${it.name}を構えたが、倒れている仲間はいない`);
    return;
  }

  b.pouch[it.id] = pouchCount(b, it.id) - 1;
  b.itemsUsed[it.id] = (b.itemsUsed[it.id] || 0) + 1;

  // 対象（既定は使った本人）。倒れている相手には使えない
  let t = b.allies[action.targetIndex];
  if (it.revive) {
    // ★蘇生だけは**逆**。倒れている人が対象で、生きている人には使えない
    if (!t || t.alive) t = b.allies.find((a) => !a.alive);
    t.alive = true;
    t.hp = Math.max(1, Math.floor(t.max.hp * it.revive.hp));
    t.ki = Math.max(t.ki, 0);
    t.ailments = {};
    t.buffs = [];
    push(b, `${unit.name} は${it.name}を使った。${t.name} が起き上がった（HP ${t.hp}）`, 'heal',
      { target: t, amount: t.hp, itemId: it.id });
    return;
  }
  if (!t || !t.alive) t = unit;

  if (it.heal && it.heal.hp) {
    const amount = Math.min(it.heal.hp, t.max.hp - t.hp);
    t.hp += amount;
    push(b, `${unit.name} は${it.name}を使った。${t.name} のHPが ${amount} 回復`, 'heal',
      { target: t, amount, itemId: it.id });
    return;
  }
  if (it.heal && it.heal.ki) {
    const amount = Math.min(it.heal.ki, t.max.ki - t.ki);
    t.ki += amount;
    push(b, `${unit.name} は${it.name}を使った。${t.name} の気が ${amount} 戻った`, 'heal',
      { target: t, amount, itemId: it.id });
    return;
  }
  if (it.cure) {
    // ★残ターンを0にするのではなく**キーごと捨てる**。0で残すと
    //   `endTurn` が -1 へ進めるだけで、`hasAilment` の判定には影響しないが、
    //   保存へ書き戻すときの掃除に頼ることになる（掃除漏れを作らない）
    const had = Object.entries(t.ailments || {}).filter(([, v]) => v > 0).length;
    t.ailments = {};
    push(b, had > 0
      ? `${unit.name} は${it.name}を使った。${t.name} の${had}つの異常が消えた`
      : `${unit.name} は${it.name}を使った。${t.name} は何ともなかった`, 'heal',
    { target: t, itemId: it.id });
    return;
  }
  if (it.buff) {
    t.buffs.push({ key: it.buff.key, value: it.buff.value, turns: it.buff.turns });
    push(b, `${unit.name} は${it.name}を使った。${t.name} の${STAT_NAME[it.buff.key] || it.buff.key}が上がった`,
      'info', { target: t, itemId: it.id });
    return;
  }
  push(b, `${unit.name} は${it.name}を使った`);
}

/** ログに出すステータス名（丸薬の効き目を日本語で見せるため） */
const STAT_NAME = { atk: '力', def: '守り', mag: '念', spd: '疾さ', luk: '運' };

// ── フェーズ4: 敵の行動（予告どおりに動く） ───────────────

export function actEnemy(b, unit) {
  if (!unit.alive || !unit.nextAct) return;
  if (hasAilment(unit, 'kon')) { push(b, `${unit.name} は昏倒している`); return; }
  if (hasAilment(unit, 'mahi') && b.rng.next() < AILMENTS.mahi.actFailRate) {
    push(b, `${unit.name} は麻痺で動けない`); return;
  }

  const act = unit.nextAct;
  // 崩された＝威力半減＋追加効果不発（2026-08-02 改訂・キャンセルは廃止）
  const mul = unit.crushed ? R.CRUSH_ENEMY_MUL : (unit.adverse ? R.ADVERSE_ENEMY_MUL : 1);
  const suppressed = !!unit.crushed;

  if (act.selfBuff) {
    for (const [k, v] of Object.entries(act.selfBuff)) {
      if (k === 'turns') continue;
      unit.buffs.push({ key: k, value: v * mul, turns: act.selfBuff.turns });
    }
  }

  const allies = livingOf(b.allies);
  if (allies.length === 0) return;
  // 挑発中の味方がいればそちらへ集まる
  const taunters = allies.filter((a) => a.taunt > 0);
  const pickTarget = () => (taunters.length > 0 ? b.rng.pick(taunters) : b.rng.pick(allies));

  const targets = act.target === 'all' ? allies : [pickTarget()];
  const hits = act.hits || 1;

  for (const t of targets) {
    for (let i = 0; i < hits; i++) {
      if (!t.alive) break;
      // ★`fullPower` は**画面に見せるためだけ**の情報。ここでの計算・抽選は何も変わらない
      const { dmg, fullDmg } = applyDamage(b, unit, t, {
        power: act.power * mul, magic: act.magic,
        fullPower: suppressed ? act.power : null,
      });
      // ★`text` と `kind` は変えない（ゴールデンログは `${turn}:${kind}:${text}` を突き合わせる）。
      //   メタ情報を足すぶんには落ちない
      push(b, `${unit.name} の${act.name}${suppressed ? '（崩されて威力半減）' : ''} → ${t.name} に ${dmg} ダメージ`, 'damage', { target: t, amount: dmg, actId: act.id, suppressed, fullAmount: fullDmg || null });
    }
    if (t.alive && !suppressed) tryAilment(b, t, act.ailment);
  }
}

// ── フェーズ5: ターン終了処理 ─────────────────────────────

export function endTurn(b) {
  // ★狙っていた敵が倒れたら指定を落とす（2026-08-10）。
  //   残しても `chooseAction` は生存者しか見ないので効きはしないが、
  //   画面の赤▼が墓標のように残り、次の敵を指し直したのか分からなくなる。
  //   `b.focus` が null（＝runBattle・ゴールデン）のときは何も起きない
  if (b.focus && !b.enemies.some((e) => e.alive && e.id === b.focus)) b.focus = null;

  const all = [...b.allies, ...b.enemies];
  for (const u of all) {
    if (!u.alive) continue;

    // 状態異常のスリップダメージ
    for (const [id, turns] of Object.entries(u.ailments)) {
      if (turns <= 0) continue;
      const def = AILMENTS[id];
      if (def && def.slipPct) {
        const d = Math.max(1, Math.floor(u.max.hp * def.slipPct));
        u.hp = Math.max(0, u.hp - d);
        push(b, `${u.name} は「${def.name}」で ${d} のダメージ`, 'slip', { target: u, amount: d });
        if (u.hp === 0) { u.alive = false; push(b, `${u.name} は力尽きた`, 'down'); }
      }
      u.ailments[id] = turns - 1;
    }

    // 常闇のスリップ（味方のみ）
    if (b.tokoyami && u.side === 'ally' && u.alive) {
      const d = Math.max(1, Math.floor(u.max.hp * R.TOKOYAMI_SLIP));
      u.hp = Math.max(0, u.hp - d);
      push(b, `常闇に蝕まれ ${u.name} は ${d} のダメージ`, 'slip', { target: u, amount: d });
      if (u.hp === 0) { u.alive = false; push(b, `${u.name} は力尽きた`, 'down'); }
    }

    // 気の自然回復（枯なら回復しない）
    if (u.side === 'ally' && u.alive && !hasAilment(u, 'kare')) {
      u.ki = Math.min(u.max.ki, u.ki + R.KI_REGEN_TURN + u.meguri);
    }

    // バフ・挑発の残りターン
    u.buffs = u.buffs.filter((bf) => --bf.turns > 0);
    if (u.taunt > 0) u.taunt--;
    u.crushed = false;
    u.adverse = false;
  }

  // 勝敗判定
  if (livingOf(b.enemies).length === 0) { b.over = true; b.result = 'win'; }
  else if (livingOf(b.allies).length === 0) { b.over = true; b.result = 'lose'; }
}

// ── 逃走 ──────────────────────────────────────────────────

export function tryEscape(b) {
  if (b.tokoyami) return false;   // 常闇では逃走不可
  if (b.bossFight) return false;
  const avg = (arr, k) => arr.reduce((s, u) => s + effStat(u, k), 0) / Math.max(1, arr.length);
  const rate = R.escapeRate(avg(livingOf(b.allies), 'spd'), avg(livingOf(b.enemies), 'spd'));
  const ok = b.rng.next() * 100 < rate;
  push(b, ok ? '逃げ切った' : '逃げられなかった');
  if (ok) { b.over = true; b.result = 'escape'; }
  return ok;
}

export { push as pushLog, livingOf, hasAilment };

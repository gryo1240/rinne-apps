/**
 * オート戦闘AI（本作の体験の中核・spec §3-8）
 *
 * オートが本線なので、このAIの賢さ＝ゲームの手触りそのもの。
 * if文の羅列にせず、**評価関数方式**にしてある（作戦＝重みのプリセット）。
 *
 * 【厳守】Math.random() を使わない。乱数は battle の rng から受け取る。
 *        影闘（非同期対戦）の相手AIも、まったく同じこの関数を使う。
 */

import * as R from '../core/rules.js';
import { SKILLS } from '../../data/skills.js';
import { TACTICS, ROLE_TACTICS } from './tactics.js';
import { effStat, canUse, kiCostOf, livingOf, hasAilment, battleUsable } from './engine.js';
import { ITEM_BY_ID } from '../../data/items.js';

/** 味方1人ぶんの実効的な作戦（全体作戦＋個別の上書き） */
export function resolveTactic(unit, partyTacticId) {
  // ★`unit.tactic` に入るのは **ROLE_TACTICS のid**（`kabae` `kaifuku` `karame` `manual` `follow`）。
  //   編成画面の選択肢が ROLE_TACTICS から作られているため（screen_party.js）。
  //   以前はこれを TACTICS から引こうとしていたので必ず undefined になり、
  //   **個別の役割を設定した仲間だけ全体作戦を無視して「臨機応変」で戦っていた**。
  //   さらに `ROLE_TACTICS[unit.role]` を見ていたが `unit.role` はどこでも設定されず、
  //   役割の上書きは一度も発火していなかった（2026-08-08 レビュー指摘）。
  const base = TACTICS[partyTacticId] || TACTICS.omakase;
  const role = ROLE_TACTICS[unit.tactic];
  if (role && role.override) return { ...base, ...role.override };
  return base;
}

/** 期待ダメージ（乱数・会心を平均化した見積り。AIの判断用なので厳密でなくてよい） */
function expectedDamage(attacker, target, skill, affMul) {
  const isMagic = !!skill.magic;
  const atk = isMagic ? effStat(attacker, 'mag') : effStat(attacker, 'atk');
  const def = effStat(target, 'def');
  const critR = Math.min(R.CRIT_CAP, R.critRate(effStat(attacker, 'luk')) + (skill.critBonus || 0)) / 100;
  const critAvg = 1 + critR * (R.CRIT_MUL - 1);
  return R.damage({ atk, def, power: skill.power, isMagic, affMul, critMul: critAvg, rand: 1 });
}

/**
 * その敵を図鑑に載せているか（2026-08-16 オーナー指示
 * 「上級作戦の読み切れは、すでに判明している敵に対しては有効なものにしよう。
 *   知らない敵に対してはデフォルト設定でいきましょう。敵の数は今後も増える可能性があり、
 *   敵図鑑100%前提だと、どこかでバグが発生する恐れがあるため」）。
 *
 * ★`b.dex` は `{種族id: 1}`。**渡されていなければ「知らない」**。
 *   シミュレーターとゴールデン26シナリオは渡していないので、そちらは何も変わらない。
 * ★`e.art` が種族id（`e.id` は個体ごとの連番なので使わない）。
 */
export function knownEnemy(b, e) {
  return !!(b && b.dex && e && e.art && b.dex[e.art]);
}

/**
 * その敵を相手にするときの作戦。
 *
 * 「読み切れ」だけは**敵ごとに効き目が変わる**。図鑑に載せていない敵には
 * 臨機応変（＝既定）と同じ重みで当たる。こうしておくと、
 * 敵の種類が増えて図鑑の達成率が下がっても、作戦が壊れない。
 */
function tacticFor(b, T, e) {
  if (!T.foresight) return T;
  return knownEnemy(b, e) ? T : TACTICS.omakase;
}

/**
 * 「読み切れ」の上乗せ: その種族の**構えの癖**を読む。
 *
 * 予告（`nextAct`）は誰にでも見えているので、それだけでは上級作戦にならない。
 * 図鑑に載せた敵に限り、`stanceWeights`（その種族が取りやすい構えの分布）まで見て、
 * 長い目で見て崩しやすい系統の手を選ぶ。
 * ★乱数を引かない。分布は敵ユニットが最初から持っている値。
 */
function habitScore(e, skill) {
  const w = e.stanceWeights || [1, 1, 1];
  const tot = (w[0] + w[1] + w[2]) || 1;
  const stances = ['gou', 'shitsu', 'ju'];
  let s = 0;
  for (let i = 0; i < 3; i++) {
    const p = w[i] / tot;
    const aff = R.affinityOf(skill.line, stances[i]);
    if (aff === R.AFFINITY.CRUSH) s += p;
    else if (aff === R.AFFINITY.ADVERSE) s -= p;
  }
  return s;
}

/** 敵の脅威度（火力 × 残HP比）。「手ごわいのから」で使う */
function threatOf(e) {
  return (effStat(e, 'atk') + effStat(e, 'mag')) * (0.4 + 0.6 * (e.hp / e.max.hp));
}

/**
 * 1人ぶんの行動を決める。
 * @returns {{skillId:string, targetIndex:number, score:number}}
 */
export function chooseAction(b, unit, partyTacticId = 'omakase') {
  const T = resolveTactic(unit, partyTacticId);
  const enemies = livingOf(b.enemies);
  const allies = livingOf(b.allies);
  if (enemies.length === 0) return { kind: 'skill', skillId: 'atk_normal', targetIndex: 0, score: 0 };

  const candidates = [];
  const skillIds = T.noSkill ? ['atk_normal'] : unit.skills;

  // 一番HP割合の低い味方（回復の対象判断に使う）
  let weakest = allies[0];
  for (const a of allies) if (a.hp / a.max.hp < weakest.hp / weakest.max.hp) weakest = a;
  const weakestRatio = weakest ? weakest.hp / weakest.max.hp : 1;

  // ── 道具（作戦が「使う」ときだけ・2026-08-13） ──
  //
  // ★`b.pouch` が空なら候補は1つも増えない＝**持っていなければ何も変わらない**。
  //   ゴールデン26シナリオとシミュレーターは道具を渡していないので、緑のまま。
  // ★乱数を引かない。ここで引くと「持っているだけで結果が変わる」ようになる。
  if (T.useItem && b.pouch) itemCandidates(b, unit, T, allies, weakest, weakestRatio, candidates);

  for (const sid of skillIds) {
    const skill = SKILLS[sid];
    if (!skill || !canUse(unit, skill)) continue;

    const kiPenalty = kiCostOf(unit, skill) * T.w_cost * 3;

    // ── 回復スキル ──
    if (skill.heal) {
      if (!weakest || weakestRatio >= 0.999) continue;   // 全快なら回復しない
      const missing = weakest.max.hp - weakest.hp;
      const healAmt = Math.min(missing, skill.heal * (1 + effStat(unit, 'mag') / 200));
      // 閾値を下回っているほど強く優先する
      const urgency = weakestRatio <= T.healAt ? (1 + (T.healAt - weakestRatio) * 4) : 0.15;
      const score = healAmt * T.w_heal * urgency + (1 - weakestRatio) * 60 * T.w_risk - kiPenalty;
      candidates.push({ skillId: sid, targetIndex: b.allies.indexOf(weakest), score });
      continue;
    }

    // ── 挑発（かばう） ──
    if (skill.taunt) {
      const risk = allies.filter((a) => a.hp / a.max.hp < 0.5).length;
      const score = (T.preferTaunt ? 120 : 40) * T.w_risk * (1 + risk) - kiPenalty - (unit.taunt > 0 ? 500 : 0);
      candidates.push({ skillId: sid, targetIndex: 0, score });
      continue;
    }

    // ── 攻撃スキル ──
    for (const e of enemies) {
      // ★敵ごとの作戦。「読み切れ」だけ、図鑑に無い敵には既定の重みで当たる
      const TE = tacticFor(b, T, e);
      const aff = R.affinityOf(skill.line, e.nextAct ? e.nextAct.stance : null);
      const affMul = R.affinityMul(aff);
      const isAll = skill.target === 'all';
      const targets = isAll ? enemies : [e];

      let dmgScore = 0;
      for (const t of targets) {
        const affT = isAll ? R.affinityOf(skill.line, t.nextAct ? t.nextAct.stance : null) : aff;
        dmgScore += Math.min(t.hp, expectedDamage(unit, t, skill, R.affinityMul(affT)));
      }

      let score = dmgScore * TE.w_atk;

      // 崩し（敵の行動の威力を半分にできる＝防御的な価値がある）
      if (aff === R.AFFINITY.CRUSH) {
        const preventable = e.nextAct ? e.nextAct.power * (e.nextAct.hits || 1) * 0.5 : 60;
        score += preventable * TE.w_crush;
        score += 30 * TE.w_combo * (b.crushGauge < R.CRUSH_GAUGE_MAX ? 1 : 0);
      } else if (aff === R.AFFINITY.ADVERSE) {
        // 逆風＝敵の行動が20%強化される。避けたい
        const worsen = e.nextAct ? e.nextAct.power * (e.nextAct.hits || 1) * 0.2 : 20;
        score -= worsen * TE.w_crush;
      }

      // 読み切れ（図鑑に載せた敵だけ）: その種族の構えの癖まで見る
      if (TE.foresight) score += habitScore(e, skill) * 40 * TE.w_crush;

      // 状態異常
      if (skill.ailment) score += skill.ailment.rate * TE.w_debuff * 1.2;

      // とどめを刺せるなら大きく加点（オーバーキルを避ける）
      if (!isAll && dmgScore >= e.hp) score += 80;

      // 狙う相手の指定（作戦）
      if (TE.focus === 'weakest') score += (1 - e.hp / e.max.hp) * 60;
      if (TE.focus === 'threat') score += threatOf(e) * 0.8;

      score -= kiPenalty;
      // `enemyId` は「これは敵を殴る手だ」という目印。
      // 回復（targetIndex は味方の添字）・挑発（0固定）と区別するために要る
      candidates.push({ skillId: sid, targetIndex: b.enemies.indexOf(e), score, enemyId: e.id });
    }
  }

  if (candidates.length === 0) return { kind: 'skill', skillId: 'atk_normal', targetIndex: b.enemies.indexOf(enemies[0]), score: 0 };

  // 最高スコアを選ぶ。同点はシード乱数で決める（決定論を保ちつつ偏りをなくす）
  // ★b.rng ではなく b.aiRng を使う（engine.js createBattle のコメント参照）。
  //   UIが助言表示のためにこの関数を呼んでも、戦闘結果が変わらないようにするため。
  const rng = b.aiRng || b.rng;
  let best = candidates[0];
  for (const c of candidates) {
    if (c.score > best.score + 1e-9) best = c;
    else if (Math.abs(c.score - best.score) <= 1e-9 && rng.next() < 0.5) best = c;
  }

  /**
   * ★プレイヤーが指した敵（2026-08-10 オーナー要望「敵アイコンを押してターゲティング」）。
   *
   * **「攻撃するか回復するか」の判断は変えず、殴る相手だけ差し替える。**
   *   最初は評価への加点（+120）で作ったが、それだと
   *     ・敵どうしの評価差が加点を超えると効かない（2体中1体で効かなかった）
   *     ・効かせようと加点を上げると、切迫した回復より優先されて味方が死ぬ
   *   のどちらかにしかならない。狙いは**対象の指定**であって戦い方の指定ではないので、
   *   選び終えた手が「敵を殴る手」だったときにだけ、相手を指した敵へ移す。
   * ★回復・挑発を選んでいたら（`enemyId` が無い）何もしない。
   * ★同点はここでは乱数を引かない。引くと、指した瞬間に本流でない乱数の
   *   消費回数が変わる理由が増えて、追いにくくなる
   */
  if (b.focus && best.enemyId && best.enemyId !== b.focus) {
    let alt = null;
    for (const c of candidates) {
      if (c.enemyId !== b.focus) continue;
      if (!alt || c.score > alt.score + 1e-9) alt = c;
    }
    if (alt) best = alt;
  }

  // ★道具の候補は kind を自分で持っている。ここで 'skill' に塗り潰さないこと
  return { ...best, kind: best.kind || 'skill' };
}

/**
 * 道具の候補を積む（`chooseAction` から呼ぶ）。
 *
 * 【方針】道具は**わざで足りないときの穴埋め**。わざと同じ土俵の点数を付けて、
 * わざのほうが良ければ道具は選ばれない。そうしないと、
 * 回復のわざを持っている仲間まで毎ターン薬を飲み、店で買った薬が一瞬で消える。
 *
 * ★丸薬（バフ）は**戦闘の頭でだけ**使う（`b.turn <= 2`）。
 *   終盤に掛け直しても6ターンぶんの元が取れず、その1手ぶん手数を損する。
 * ★同じキーのバフが既に乗っているなら積まない（重ね掛けの無駄を防ぐ）。
 */
function itemCandidates(b, unit, T, allies, weakest, weakestRatio, out) {
  const selfIdx = b.allies.indexOf(unit);
  for (const [id, cnt] of Object.entries(b.pouch)) {
    if (!(cnt > 0)) continue;
    const it = ITEM_BY_ID[id];
    if (!battleUsable(it)) continue;

    /**
     * 蘇生（2026-08-16）。倒れている仲間がいるときだけ候補になる。
     * ★点数は「戻るHP＋200」。回復のわざと同じ土俵（HPの量）に乗せたうえで、
     *   **1人ぶんの手数が戻る**ぶんを上乗せしている。呼び薬（2割）でも
     *   だいたいの回復わざより上に来るが、練り薬級の大回復とは競える。
     */
    if (it.revive) {
      const dead = b.allies.find((a) => !a.alive);
      if (!dead) continue;
      out.push({
        kind: 'item', itemId: id, targetIndex: b.allies.indexOf(dead),
        score: (dead.max.hp * it.revive.hp + 200) * T.w_heal,
      });
      continue;
    }
    if (it.heal && it.heal.hp) {
      if (!weakest || weakestRatio >= 0.999) continue;
      const healAmt = Math.min(weakest.max.hp - weakest.hp, it.heal.hp);
      // わざの回復と同じ式。ただし**わざを持っている人には劣後させる**ため 0.8 倍にする
      const urgency = weakestRatio <= T.healAt ? (1 + (T.healAt - weakestRatio) * 4) : 0.15;
      out.push({
        kind: 'item', itemId: id, targetIndex: b.allies.indexOf(weakest),
        score: healAmt * T.w_heal * urgency * 0.8,
      });
      continue;
    }
    if (it.heal && it.heal.ki) {
      // 気が尽きて通常攻撃しか撃てない人がいるときだけ意味がある
      const lack = unit.max.ki - unit.ki;
      if (lack < it.heal.ki * 0.8) continue;
      const canAny = unit.skills.some((sid) => SKILLS[sid] && canUse(unit, SKILLS[sid]) && sid !== 'atk_normal');
      if (canAny) continue;
      out.push({ kind: 'item', itemId: id, targetIndex: selfIdx, score: 70 * T.w_heal });
      continue;
    }
    if (it.cure) {
      // 効いている状態異常の数で価値が決まる。1つも無ければ使わない
      let worst = null, worstN = 0;
      for (const a of allies) {
        const nAil = Object.values(a.ailments || {}).filter((v) => v > 0).length;
        if (nAil > worstN) { worstN = nAil; worst = a; }
      }
      if (!worst) continue;
      out.push({ kind: 'item', itemId: id, targetIndex: b.allies.indexOf(worst), score: 55 * worstN * T.w_debuff });
      continue;
    }
    if (it.buff) {
      if (b.turn > 2) continue;
      if (unit.buffs.some((bf) => bf.key === it.buff.key)) continue;
      // 長丁場（ボス戦）でだけ元が取れる。雑魚戦は6ターンも続かない
      out.push({ kind: 'item', itemId: id, targetIndex: selfIdx, score: (b.bossFight ? 95 : 25) * T.w_atk });
    }
  }
}

/** パーティ全員ぶんの行動をまとめて決める */
export function choosePartyActions(b, partyTacticId = 'omakase') {
  return livingOf(b.allies).map((u) => ({ unit: u, action: chooseAction(b, u, partyTacticId) }));
}

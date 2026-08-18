/**
 * 怪異（選択肢イベント）の解決（spec §4-4）
 *
 * DOM非依存。UIも自動プレイシミュレーターも同じここを通る。
 * データは data/events.js（純データ）。
 *
 * 【決定論】乱数は潜行のシードから作った専用ストリームだけを使う。
 * 選択肢の提示と結果の抽選を分けてあるので、
 * 「同じ選択をすれば必ず同じ結果」ではなく「同じ選択・同じシードなら同じ結果」になる。
 */

import { makeRng } from '../core/rng.js';
import { eventsFor, EVENT_BY_ID } from '../../data/events.js';
import { AILMENTS } from '../../data/skills.js';

/** この階・このノードで出る怪異を1つ選ぶ（同じ場所なら必ず同じ怪異） */
export function pickEvent(run, nodeId) {
  const pool = eventsFor(run.floor);
  if (pool.length === 0) return null;
  const rng = makeRng(`${run.seed}:kaii:${run.floor}:${nodeId}`);
  return rng.pick(pool);
}

/** その選択肢が選べるか（cost を払えるか） */
export function canChoose(run, choice) {
  const c = choice.cost;
  if (!c) return true;
  if (c.zeni != null && (run.gained.zeni + run.bonus.zeni) < c.zeni) return false;
  if (c.akari != null && run.akari < c.akari) return false;
  if (c.fuda != null && run.fuda < c.fuda) return false;
  // hp は「割合を払う」形。全員が払える体力を持っているときだけ選べる
  if (c.hp != null && run.party.some((u) => u.alive && u.hp <= u.max.hp * c.hp)) return false;
  return true;
}

/**
 * 選択肢を実行する。
 * @returns {{outcome:object, applied:string[]}} 起きたことの説明（UIが読ませる）
 */
export function choose(run, event, choiceIndex, nodeId) {
  const choice = event.choices[choiceIndex];
  if (!choice) return null;
  if (!canChoose(run, choice)) return { outcome: null, applied: [], refused: true };

  payCost(run, choice.cost);

  const rng = makeRng(`${run.seed}:kaiires:${run.floor}:${nodeId}:${choiceIndex}`);
  const outcome = rng.weighted(choice.outcomes);
  const applied = [];
  for (const eff of outcome.effects || []) applied.push(...applyEffect(run, eff, rng));

  // 図鑑（見た怪異と選んだ選択肢を記録する。やりこみの可視化・spec §4-4）
  run.seenEvents = run.seenEvents || {};
  const seen = (run.seenEvents[event.id] = run.seenEvents[event.id] || {});
  seen[choiceIndex] = 1;

  return { outcome, applied, refused: false };
}

/**
 * 潜行中の支払い。**上乗せ分（全滅で失う分）から先に払う**。
 * 怪異イベントと塔の商人が共有する（explore.js から呼ぶ）。
 */
export function payCost(run, cost) {
  if (!cost) return;
  if (cost.zeni) {
    // 上乗せ分から先に払う（帰還すればどのみち手に入るので、体感の損が小さい）
    const fromBonus = Math.min(run.bonus.zeni, cost.zeni);
    run.bonus.zeni -= fromBonus;
    run.gained.zeni = Math.max(0, run.gained.zeni - (cost.zeni - fromBonus));
  }
  if (cost.akari) run.akari = Math.max(0, run.akari - cost.akari);
  if (cost.fuda) run.fuda = Math.max(0, run.fuda - cost.fuda);
  if (cost.hp) {
    for (const u of run.party) {
      if (!u.alive) continue;
      u.hp = Math.max(1, Math.floor(u.hp - u.max.hp * cost.hp));
    }
  }
}

/** @returns {string[]} プレイヤーに見せる短い説明 */
function applyEffect(run, eff, rng) {
  const out = [];
  switch (eff.type) {
    case 'stat': {
      // その潜行のあいだだけ。戦闘ユニットは潜行中ずっと使い回されるので直接足せば持続する
      const label = { hp: '体', ki: '気', atk: '力', def: '守', spd: '速', mag: '術', luk: '運' }[eff.key] || eff.key;
      for (const u of run.party) u[eff.key] = Math.max(1, u[eff.key] + eff.value);
      out.push(`全員の${label}が ${eff.value > 0 ? '+' : ''}${eff.value}（この潜行のあいだ）`);
      break;
    }
    case 'hp': {
      for (const u of run.party) {
        if (!u.alive) continue;
        const d = Math.floor(u.max.hp * eff.pct);
        u.hp = Math.max(1, Math.min(u.max.hp, u.hp + d));
      }
      out.push(eff.pct > 0 ? `HPが ${Math.round(eff.pct * 100)}% 回復` : `HPが ${Math.round(-eff.pct * 100)}% 減った`);
      break;
    }
    case 'ki':
      for (const u of run.party) if (u.alive) u.ki = Math.max(0, Math.min(u.max.ki, u.ki + eff.value));
      out.push(`気が ${eff.value > 0 ? '+' : ''}${eff.value}`);
      break;
    case 'akari':
      run.akari = Math.max(0, Math.min(run.maxAkari, run.akari + eff.value));
      out.push(`灯が ${eff.value > 0 ? '+' : ''}${eff.value}`);
      break;
    case 'zeni':
      if (eff.value >= 0) run.gained.zeni += eff.value;
      else payCost(run, { zeni: -eff.value });
      out.push(`銭が ${eff.value > 0 ? '+' : ''}${eff.value}`);
      break;
    case 'karma':
      run.gained.karma = (run.gained.karma || 0) + eff.value;
      out.push(`因果が ${eff.value > 0 ? '+' : ''}${eff.value}`);
      break;
    case 'mat':
      run.gained.mats[eff.id] = (run.gained.mats[eff.id] || 0) + eff.value;
      out.push(`素材を ${eff.value} 手に入れた`);
      break;
    case 'equip':
      run.pendingEquipDrops = (run.pendingEquipDrops || 0) + (eff.count || 1);
      out.push(`装備を ${eff.count || 1} 点 見つけた`);
      break;
    case 'fuda':
      run.fuda = Math.max(0, run.fuda + eff.value);
      out.push(`還り札が ${eff.value > 0 ? '+' : ''}${eff.value}`);
      break;
    case 'ailment': {
      const alive = run.party.filter((u) => u.alive);
      if (alive.length === 0) break;
      const t = rng.pick(alive);
      const def = AILMENTS[eff.id];
      if (def) { t.ailments[eff.id] = def.turns; out.push(`${t.name} が「${def.name}」になった`); }
      break;
    }
    case 'cure':
      for (const u of run.party) u.ailments = {};
      out.push('状態異常がすべて治った');
      break;
    case 'reveal':
      for (const nd of run.map.nodes) nd.revealed = true;
      out.push('この階の道が見えるようになった');
      break;
    default:
      break;
  }
  return out;
}

/**
 * 自動プレイ用の選び方。
 * 「払えるなら最初の選択肢、払えないなら払わずに済む選択肢」という素朴な政策。
 * ★人間より賢くしないこと（シミュレーターの数値が実プレイと乖離する）。
 */
export function autoChoose(run, event) {
  for (let i = 0; i < event.choices.length; i++) {
    if (canChoose(run, event.choices[i])) return i;
  }
  return event.choices.length - 1;
}

export { EVENT_BY_ID };

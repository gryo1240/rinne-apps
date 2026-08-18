/**
 * 拠点（祠）と「庵で休む」まわり（spec §2-0）
 *
 * 【なぜ必要か】
 * spec §2-0 で「拠点に戻ったら自動で全快」を廃止し、「庵で休む＝全快」に一本化した。
 * つまり **HPと気は潜行をまたいで持ち越される** 必要がある。
 * 一方 battle/run.js の makeParty() は常に全快のユニットを作る（シミュレーターが
 * 「その戦闘だけ」を測るためにそうなっている）。
 *
 * そこで **セーブ側に持ち越し状態を持ち、潜行の前後で載せ替える** 形にした。
 * こうすると battle/ 側の決定論とシミュレーターの測定値に一切影響しない。
 *
 * DOM非依存。
 */

import { PHASE_NAMES, PHASE_EFFECT, moonAge, moonPhase } from '../core/time.js';

/** セーブに持ち越し状態が無い（＝全快）ことを表す値 */
const FULL = null;

/**
 * 潜行開始時: セーブの持ち越しHP・気・状態異常を、戦闘ユニットへ反映する。
 * 値が無ければ全快のまま（＝初回や庵で休んだ直後）。
 */
export function applyPersistedState(save, party) {
  for (const u of party) {
    const c = save.chars?.[u.id];
    if (!c) continue;
    if (Number.isFinite(c.hp)) u.hp = Math.max(1, Math.min(u.max.hp, c.hp));
    if (Number.isFinite(c.ki)) u.ki = Math.max(0, Math.min(u.max.ki, c.ki));
    if (c.ailments) u.ailments = { ...c.ailments };
  }
  return party;
}

/**
 * 潜行終了時: 戦闘ユニットの状態をセーブへ書き戻す。
 * **力尽きた仲間はHP1で戻す**（拠点で全滅状態のまま放置させない）。
 */
export function storePartyState(save, party) {
  for (const u of party) {
    const c = save.chars?.[u.id];
    if (!c) continue;
    c.hp = u.alive ? Math.max(1, Math.round(u.hp)) : 1;
    c.ki = Math.max(0, Math.round(u.ki));
    // 残ターンが0以下の状態異常は捨てる（拠点で延々と残らないように）
    const ail = {};
    for (const [k, v] of Object.entries(u.ailments || {})) if (v > 0) ail[k] = v;
    c.ailments = ail;
  }
  return save;
}

/**
 * 庵で休む。**無料・回数無制限**（spec §2-0。回復を課金要素にすると詰まった人ほど苦しくなる）
 * @returns {{healed:string[], phaseChanged:null|{phase:string,name:string,desc:string}}}
 */
export function restAtIori(save, nowMs = Date.now()) {
  const healed = [];
  for (const [id, c] of Object.entries(save.chars || {})) {
    const wasHurt = Number.isFinite(c.hp) || Object.keys(c.ailments || {}).length > 0;
    c.hp = FULL;
    c.ki = FULL;
    c.ailments = {};
    if (wasHurt) healed.push(id);
  }

  // 月齢が変わっていたら知らせる（spec §2-0「一晩が明けた」の演出で拾う）
  const phase = moonPhase(moonAge(nowMs));
  let phaseChanged = null;
  if (save.lastPhase && save.lastPhase !== phase) {
    phaseChanged = { phase, name: PHASE_NAMES[phase], desc: PHASE_EFFECT[phase].desc };
  }
  save.lastPhase = phase;
  save.lastSeenAt = nowMs;
  return { healed, phaseChanged };
}

/** 拠点の一覧表示用。持ち越しHPを「最大値に対する現在値」に直して返す */
export function partyStatus(save, finalStatsOf) {
  return (save.party?.active || []).map((id) => {
    const c = save.chars?.[id] || {};
    const st = finalStatsOf(save, id);
    return {
      id,
      lv: c.lv || 1,
      hp: Number.isFinite(c.hp) ? Math.min(c.hp, st.hp) : st.hp,
      maxHp: st.hp,
      ki: Number.isFinite(c.ki) ? Math.min(c.ki, st.ki) : st.ki,
      maxKi: st.ki,
      ailments: c.ailments || {},
      full: !Number.isFinite(c.hp) && Object.keys(c.ailments || {}).length === 0,
    };
  });
}

/** 誰か一人でも傷ついているか（庵ボタンの表示切替に使う） */
export function needsRest(save) {
  for (const c of Object.values(save.chars || {})) {
    if (Number.isFinite(c.hp)) return true;
    if (Object.keys(c.ailments || {}).length > 0) return true;
  }
  return false;
}

/**
 * 塔に入れる階の一覧（還り札の登録点）。
 * spec §4-3: 5階ごとの「印」に直接降りられる。1階は常に選べる。
 */
export function entryFloors(maxFloor, markEvery = 5) {
  const out = [1];
  for (let f = markEvery; f <= Math.max(1, maxFloor); f += markEvery) out.push(f);
  return out;
}

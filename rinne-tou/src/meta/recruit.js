/**
 * 仲間の加入（spec §9-2）
 *
 * **いつ加わるかを決めるのは、このファイルではなくシナリオ**（data/scenario.js の join:）。
 * ここは「加える手続き」だけを持つ。
 *
 * 加入の場面（2026-08-03・シナリオ実装で仕様どおりに戻した）:
 *   鈴   一章の入口（6F）
 *   黒羽 二章の入口（16F）
 *   石動 三章の入口（26F）
 *   狐火 四章の入口（36F）
 *   縒   五章の入口（46F）
 *   無銘 五章末（50F の層ボス撃破後）
 *
 * ⚠ 以前ここに置いていた到達階テーブル（JOIN_AT）は廃止した。
 *   加入の条件が2か所にあると、片方だけ直したときに
 *   「会話は起きたのに仲間が入らない」「入ったのに会話が出ない」が起きる。
 */

import { CHARS, CHAR_BY_ID } from '../../data/chars.js';

/**
 * 開始時のパーティ。
 *
 * 序章（1〜5F）は主人公ひとり。spec §13-1「1F〜3Fが実質チュートリアル」に合わせ、
 * 敵は2体固定・弱個体のみ（data/enemies.js の f 範囲と battle/run.js の敵数）。
 * ここを4人で始めると、序章の会話（仲間はまだ誰もいない）と噛み合わない。
 */
export const START_PARTY = ['hero'];

/**
 * 仲間を加える。**レベルは主人公に合わせる**（後から入った仲間が育っておらず
 * 使い物にならない、という理不尽を作らない）。
 * @returns {boolean} 実際に加わったか（すでに居れば false）
 */
export function join(save, charId) {
  if (!CHAR_BY_ID[charId]) return false;
  if (save.chars[charId]) return false;
  const heroLv = save.chars.hero?.lv || 1;
  save.chars[charId] = {
    lv: Math.max(1, heroLv), exp: 0, renki: {}, skills: {},
    equip: [0, 0, 0], equipped: null,
  };
  // 空きがあれば自動で出撃メンバーに入れる（編成画面を知らないうちは自動で足す）
  if ((save.party.active || []).length < 4) save.party.active.push(charId);
  return true;
}

/** 加入済みの仲間一覧 */
export function roster(save) {
  return CHARS.filter((c) => !!save.chars[c.id]);
}

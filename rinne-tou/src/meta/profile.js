/**
 * 人物帳（2026-08-14 オーナー指示
 * 「各キャラのステータスが分かるページが欲しい。あと、各キャラのプロフィールも
 *   画像とともに読めるページが欲しい。プロフィールの情報はストーリーが進むたびに
 *   読めるページが増えるように」）
 *
 * 【この層の役割】「いま誰の、どの項目が読めるか」を決めるだけ。DOMに触らない。
 *
 * ★解禁の鍵は**場面の既読**（`save.story.seen`）。到達階やレベルではない。
 *   理由: プロフィールに書いてあるのは場面の中で明かされた事実なので、
 *   階で開くと**読む前にネタバレが出る**（絆イベントを28階で拾えなかった
 *   2026-08-08 の事故と同じ形）。
 * ★仲間になっていない人物は一覧にも出さない（紬だけは例外＝下の `visible`）。
 */

import { PROFILES, PROFILE_BY_ID } from '../../data/profiles.js';
import { CHAR_BY_ID } from '../../data/chars.js';
import { isSeen } from './story.js';

export { PROFILES, PROFILE_BY_ID };

/**
 * その人物を人物帳に並べてよいか。
 *
 * 仲間: `save.chars` に居ること（＝加入済み）。
 * 紬  : 仲間ではないので、**1項目でも開いていれば**並べる
 *       （出会う前から名前が一覧に出ていると、それ自体が先の話になる）。
 */
export function visible(save, id) {
  if (CHAR_BY_ID[id]) return !!save?.chars?.[id];
  return openEntries(save, id).length > 0;
}

/** 人物帳に並ぶ人物（PROFILES の順） */
export function roster(save) {
  return PROFILES.filter((p) => visible(save, p.id));
}

/** その項目がいま読めるか */
export function isOpen(save, entry) {
  if (!entry) return false;
  return entry.need == null ? true : isSeen(save, entry.need);
}

/** 読める項目だけ（並び順はデータのまま） */
export function openEntries(save, id) {
  const p = PROFILE_BY_ID[id];
  if (!p) return [];
  return p.entries.filter((e) => isOpen(save, e));
}

/** 「3／6」を出すための数 */
export function progressOf(save, id) {
  const p = PROFILE_BY_ID[id];
  if (!p) return { open: 0, total: 0 };
  return { open: openEntries(save, id).length, total: p.entries.length };
}

/** 人物帳ぜんたいの埋まり具合（%） */
export function totalPercent(save) {
  let open = 0; let total = 0;
  for (const p of PROFILES) {
    const r = progressOf(save, p.id);
    open += r.open; total += r.total;
  }
  return total > 0 ? Math.round((open / total) * 100) : 0;
}

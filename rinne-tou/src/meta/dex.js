/**
 * 図鑑の「見つけた」記録のうち、**道具（薬）と素材**の分（2026-08-13 新設・オーナー指示
 * 「図鑑に、見つけた道具（薬）や素材を含めるようにしてください。
 *   道具（薬）と素材は別物なので、区別しておいて」）
 *
 * 【なぜ持ち数と別に記録するのか】
 * `inv.items` / `inv.mats` は**使えば0に戻る**。持ち数だけを見て図鑑を作ると、
 * 鍛冶で素材を使い切った瞬間に「見つけたことが無かったこと」になる。
 * 図鑑は埋める遊びなので、一度でも手にしたら消えてはいけない。
 *
 * ★保存先は `save.dex.items` / `save.dex.mats`（`{id: 1}`）。
 *   `save.dex.bosses` と同じく**輪廻しても残す**（`meta/rebirth.js` は dex を引き継ぐ）。
 * ★器が無い古い記録でも落ちないように、書くときに作る（`ensure`）。
 *   セーブのバージョンは上げていない（欠けていても読める形なので、上げる必要がない）。
 */

import { ITEM_BY_ID } from '../../data/items.js';

function ensure(save) {
  save.dex = save.dex || {};
  save.dex.items = save.dex.items || {};
  save.dex.mats = save.dex.mats || {};
  return save.dex;
}

/** 道具（薬を含む）を1つ見つけた */
export function markItem(save, id) {
  if (!save || !id || !ITEM_BY_ID[id]) return;
  ensure(save).items[id] = 1;
}

/** 素材を1つ見つけた */
export function markMat(save, id) {
  if (!save || !id) return;
  ensure(save).mats[id] = 1;
}

/**
 * いま持っているものを図鑑へ取り込む（過去の記録の救済）。
 *
 * 図鑑の記録は2026-08-13 からしか付いていないので、それ以前から遊んでいる人は
 * 「油壺を20個持っているのに図鑑が0件」になる。**持っていれば見つけたはず**なので、
 * 図鑑を開いたときに1度だけ拾い上げる。
 * ★使い切ったものまでは救えない（記録が残っていない）。それは次に拾えば載る。
 */
export function backfill(save) {
  if (!save) return save;
  const d = ensure(save);
  for (const [id, cnt] of Object.entries(save.inv?.items || {})) if (cnt > 0) d.items[id] = 1;
  for (const [id, cnt] of Object.entries(save.inv?.mats || {})) if (cnt > 0) d.mats[id] = 1;
  return save;
}

export function foundItem(save, id) { return !!save?.dex?.items?.[id]; }
export function foundMat(save, id) { return !!save?.dex?.mats?.[id]; }
export function foundItemCount(save) { return Object.keys(save?.dex?.items || {}).length; }
export function foundMatCount(save) { return Object.keys(save?.dex?.mats || {}).length; }

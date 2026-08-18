/**
 * 露店（2026-08-13 新設・オーナー指示
 * 「祠では道具を売買できるようにしておこう。塔内で使うと各ステータス上昇できる
 *   各種の薬とか、回復薬とかを売っておこう」）
 *
 * 【この層の役割】銭と持ち物の増減だけ。DOMに触らない・乱数を引かない。
 * UI（screen_shop.js）は、ここが返した結果を並べるだけにする。
 *
 * ★店に並ぶのは**薬だけ**（理由は data/items.js のコメント）。
 * ★売値は買値の4割（`SELL_RATE`）。等価にすると「買って売る」で銭が減らない
 *   往復ができてしまい、鍛冶に銭を使わせる意味が薄れる。
 */

import { ITEMS, ITEM_BY_ID, MEDICINES, MAT_PRICE } from '../../data/items.js';
import { MAT_NAME } from './growth.js';
import { markItem, markMat } from './dex.js';

/** 売値の割合（買値に対して） */
export const SELL_RATE = 0.4;

/**
 * 1種類あたりの持てる上限。無限だと「銭が余ったら薬を全部買う」だけの画面になる。
 *
 * ★**買うときだけでなく、拾ったときも守る**（2026-08-14 オーナー指示
 *   「99個を超える分は持てないから捨てた扱いにし、100個以上は持てないようにすること」）。
 *   店だけで見張っていたので、塔で拾えば100個以上になれた。増やす場所は
 *   `addItem()` に一本化して、そこを通らない足し算を作らないこと。
 */
export const ITEM_MAX = 99;

/**
 * 道具を増やす（上限で頭打ち）。**道具が増える場所は必ずここを通す**。
 * @returns {{have:number, added:number, discarded:number}} discarded＝上限で捨てた数
 */
export function addItem(save, id, num) {
  const add = Math.max(0, Math.floor(num || 0));
  save.inv = save.inv || {};
  save.inv.items = save.inv.items || {};
  const have = save.inv.items[id] || 0;
  const next = Math.min(ITEM_MAX, have + add);
  save.inv.items[id] = next;
  return { have: next, added: next - have, discarded: have + add - next };
}

/** 上限で頭打ちにする（外から数を代入する場所のため。例: 還り札の枚数） */
export function capItem(v) { return Math.max(0, Math.min(ITEM_MAX, Math.floor(v || 0))); }

/** 店の品ぞろえ（`price` を持つものだけ並ぶ） */
export const STOCK = MEDICINES.filter((i) => i.price > 0);

export function priceOf(id) {
  const it = ITEM_BY_ID[id];
  return it && it.price > 0 ? it.price : 0;
}

/** 売値。買えないもの（還り札・油壺）は売れもしない＝0 */
export function sellPriceOf(id) {
  const p = priceOf(id);
  return p > 0 ? Math.max(1, Math.floor(p * SELL_RATE)) : 0;
}

/** いま持っている数 */
export function countOf(save, id) {
  return (save.inv?.items?.[id] || 0);
}

/**
 * 買う。
 * @returns {{ok:boolean, reason?:'noitem'|'zeni'|'full', spent?:number, have?:number}}
 */
export function buyItem(save, id, num = 1) {
  const it = ITEM_BY_ID[id];
  const price = priceOf(id);
  if (!it || price <= 0) return { ok: false, reason: 'noitem' };
  const n = Math.max(1, Math.floor(num));
  const have = countOf(save, id);
  if (have + n > ITEM_MAX) return { ok: false, reason: 'full', have };
  const cost = price * n;
  if ((save.inv.zeni || 0) < cost) return { ok: false, reason: 'zeni', spent: cost };
  save.inv.zeni -= cost;
  addItem(save, id, n);
  // ★買った時点で図鑑に載せる（見つけた＝現物を手にした、で統一する）
  markItem(save, id);
  return { ok: true, spent: cost, have: save.inv.items[id] };
}

/**
 * 売る。
 * @returns {{ok:boolean, reason?:'noitem'|'lack', gained?:number, have?:number}}
 */
export function sellItem(save, id, num = 1) {
  const price = sellPriceOf(id);
  if (price <= 0) return { ok: false, reason: 'noitem' };
  const n = Math.max(1, Math.floor(num));
  const have = countOf(save, id);
  if (have < n) return { ok: false, reason: 'lack', have };
  save.inv.items[id] = have - n;
  save.inv.zeni = (save.inv.zeni || 0) + price * n;
  return { ok: true, gained: price * n, have: save.inv.items[id] };
}

// ── 鍛冶の素材の売り買い（2026-08-14 オーナー指示「鍛冶の素材も売れるように」） ──

/**
 * 売れる素材の一覧（`data/items.js` の `MAT_PRICE` に値の付いているものだけ）。
 *
 * ★**買えない**。素材は塔でしか採れないものなので、銭で買えると潜る意味が薄れる。
 * ★錬気の素材も入れている。オーナーの言葉は「鍛冶の素材」だったが、
 *   持ち物の素材のうち1つだけ売れないのは説明がつかないため（外すなら一行消せばよい）。
 */
export const MAT_STOCK = Object.keys(MAT_PRICE)
  .filter((id) => MAT_NAME[id])
  .map((id) => ({ id, name: MAT_NAME[id], price: MAT_PRICE[id] }));

export function matSellPriceOf(id) { return MAT_PRICE[id] > 0 ? MAT_PRICE[id] : 0; }

export function matCountOf(save, id) { return (save.inv?.mats?.[id] || 0); }

/**
 * 素材を売る。
 * @returns {{ok:boolean, reason?:'noitem'|'lack', gained?:number, have?:number}}
 */
export function sellMat(save, id, num = 1) {
  const price = matSellPriceOf(id);
  if (price <= 0) return { ok: false, reason: 'noitem' };
  const n = Math.max(1, Math.floor(num));
  const have = matCountOf(save, id);
  if (have < n) return { ok: false, reason: 'lack', have };
  save.inv.mats[id] = have - n;
  save.inv.zeni = (save.inv.zeni || 0) + price * n;
  // 売っても「見つけた」記録は消さない（図鑑は持ち数と別勘定・meta/dex.js）
  markMat(save, id);
  return { ok: true, gained: price * n, have: save.inv.mats[id] };
}

/**
 * 塔へ持ち込む薬を `{id: 数}` で取り出す。
 *
 * ★**薬だけ**。油壺は `run.oilHave/oilUsed` という別の数え方を先に持っているので、
 *   ここにも入れると同じ壺を二重に数えて、帰ったときに余分に減る。
 * ★還り札も別（`run.fuda`）。
 */
export function medicinePouch(save) {
  const out = {};
  for (const it of MEDICINES) {
    const c = countOf(save, it.id);
    if (c > 0) out[it.id] = c;
  }
  return out;
}

/** その場所で使える道具だけを絞る（UIの一覧用） */
export function usableItems(where) {
  return ITEMS.filter((it) => usableIn(it, where));
}

/** その場所で使える道具か。'battle' | 'explore' */
export function usableIn(it, where) {
  if (!it || !it.use) return false;
  return it.use === 'both' || it.use === where;
}

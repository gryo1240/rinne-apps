/**
 * 因果盤（spec §6-5）
 *
 * 中央から隣接するマスだけを、因果を払って開放していく永続強化。
 * **輪廻してもリセットされない**ので、周回の積み上げ先になる。
 *
 * DOM非依存。`Math.random()` を使わない（開放に運の要素は無い）。
 *
 * ── 設計上の要点 ────────────────────────────────────────
 *
 * 1. **効果は `bonusOf(save)` で毎回その場で数える。キャッシュしない。**
 *    セーブに `boardBonus` のような合算値を持たせると、盤を開いた直後に
 *    更新し忘れた経路（インポート・migrate・輪廻）で、
 *    **画面には出ているのに効いていない**という最悪の食い違いが起きる。
 *    49要素の走査は一瞬なので、常に盤そのものを正とする。
 *
 * 2. **コストは「開放済みマス数」だけで決まる**（spec §14 `boardCost`）。
 *    どのマスを先に取っても総額は同じ。順番の最適化を強いない。
 *
 * 3. **開放は取り消せない。** 確認はUI側の責任。ここは実行するだけ。
 */

import * as R from '../core/rules.js';
import { everMax } from '../core/save.js';
import { BOARD, BOARD_SIZE, BOARD_CENTER, CELL, CELL_INFO, CELL_VALUE, LAYOUT_VERSION, neighborsOf } from '../../data/board.js';

/** 解放条件: 一章を抜けたあたり（10Fのボスを越えると到達階が11になる） */
export const UNLOCK_FLOOR = 11;

export function isUnlocked(save) {
  // ★輪廻しても閉じない（因果盤は引き継ぐ・spec §8-3）。everMax を見る
  return everMax(save) >= UNLOCK_FLOOR;
}

/**
 * 盤の状態を安全な配列にして返す。
 * ★セーブコードは手で書き換えられるので、長さも中身も信用しない。
 *   中央だけは常に開いている（ここが閉じていると1マスも開けなくなって詰む）。
 */
export function stateOf(save) {
  const b = save?.board;
  // 配列でなくても、添字で引ける形（JSONの往復で {"0":1,"24":1} になった等）なら読む。
  // 「壊れたセーブを自動で捨てない」（save.js の方針）に合わせ、読めるものは読む
  const raw = Array.isArray(b) ? b : (b && typeof b === 'object' ? b : {});
  const out = new Array(BOARD_SIZE).fill(0);
  for (let i = 0; i < BOARD_SIZE; i++) out[i] = raw[i] ? 1 : 0;
  out[BOARD_CENTER] = 1;
  return out;
}

/** セーブ側の board を正規化して書き戻す（読み込み時に一度だけ呼べばよい） */
export function normalize(save) {
  save.board = stateOf(save);
  // どの配置で買ったかを刻む。将来 LAYOUT を変えるとき、
  // 「この盤はどの配置で買われたか」が分からないと読み替えができない
  if (save.boardV == null) save.boardV = LAYOUT_VERSION;
  return save.board;
}

export function isOpen(save, id) {
  return stateOf(save)[id] === 1;
}

/** 開放済みマス数（中央を含む） */
export function openedCount(save) {
  return stateOf(save).reduce((a, v) => a + v, 0);
}

/**
 * 次の1マスの費用（spec §14）。
 * 中央は最初から開いているので、費用の計算に使う「開放済み数」からは除く
 * （そうしないと最初の1マスが 50 でなく 57 になり、仕様の数字と合わない）。
 */
export function nextCost(save) {
  return R.boardCost(Math.max(0, openedCount(save) - 1));
}

/** いま開けられるマス（開放済みに隣接していて、まだ閉じているもの） */
export function openableIds(save) {
  const st = stateOf(save);
  const out = [];
  for (let i = 0; i < BOARD_SIZE; i++) {
    if (st[i]) continue;
    if (neighborsOf(i).some((n) => st[n])) out.push(i);
  }
  return out;
}

/** @returns {{ok:true} | {ok:false, reason:string, message:string}} */
export function canOpen(save, id, cost = nextCost(save)) {
  if (!isUnlocked(save)) return no('locked', '因果盤はまだ使えません。');
  if (!Number.isInteger(id) || id < 0 || id >= BOARD_SIZE) return no('range', 'そのマスはありません。');
  const st = stateOf(save);
  if (st[id]) return no('already', 'そのマスはもう開いています。');
  if (!neighborsOf(id).some((n) => st[n])) return no('far', '開いているマスの隣からしか広げられません。');
  if ((save.karma?.have || 0) < cost) return no('karma', `因果が足りません（あと${cost - (save.karma?.have || 0)}）。`);
  return { ok: true, cost };
}

function no(reason, message) { return { ok: false, reason, message }; }

/**
 * マスを開く。**取り消せない**。
 * @returns {{ok:true, cost:number, cell:object} | {ok:false, reason:string, message:string}}
 */
export function open(save, id) {
  const cost = nextCost(save);
  const chk = canOpen(save, id, cost);
  if (!chk.ok) return chk;

  const board = normalize(save);
  board[id] = 1;
  save.karma.have = (save.karma.have || 0) - cost;
  save.karma.spent = (save.karma.spent || 0) + cost;
  return { ok: true, cost, cell: BOARD[id] };
}

// ── 効果の合算 ────────────────────────────────────────────

/**
 * いま効いている強化をまとめて返す。**毎回その場で数える**（要点1）。
 * @returns {{stat:number, hpMul:number, akari:number, dispatchSlots:number,
 *            dropMul:number, karmaMul:number, renkiMax:number, counts:object}}
 */
export function bonusOf(save) {
  const st = stateOf(save);
  const counts = {};
  for (let i = 0; i < BOARD_SIZE; i++) {
    if (!st[i]) continue;
    const k = BOARD[i].kind;
    if (k === CELL.CENTER) continue;
    counts[k] = (counts[k] || 0) + 1;
  }
  // ★効果量は必ず data/board.js の CELL_VALUE から取る。
  //   ここに数字を直書きすると、凡例の表示とかかる効果が静かにズレる
  const n = (k) => (counts[k] || 0) * (CELL_VALUE[k] || 0);
  return {
    stat: n(CELL.STAT),                         // 全ステータスへの加算
    hpMul: 1 + n(CELL.HP),                      // 最大HPの倍率
    akari: n(CELL.AKARI),                       // 最大灯への加算
    dispatchSlots: n(CELL.DISPATCH),            // 影送りの枠
    dropMul: 1 + n(CELL.DROP),                  // 装備ドロップ率の倍率
    karmaMul: 1 + n(CELL.KARMA),                // 得られる因果の倍率
    renkiMax: n(CELL.RENKI),                    // 錬気の上限への加算
    counts,
  };
}

/** 効果が0のときに、上の合算と同じ形を返す（盤を持たない場面用） */
export const NO_BONUS = Object.freeze({
  stat: 0, hpMul: 1, akari: 0, dispatchSlots: 0,
  dropMul: 1, karmaMul: 1, renkiMax: 0, counts: {},
});

// ── 表示用 ────────────────────────────────────────────────

/** 画面がそのまま並べられる形の49マス */
export function view(save) {
  const st = stateOf(save);
  const openable = new Set(openableIds(save));
  return BOARD.map((c) => ({
    ...c,
    info: CELL_INFO[c.kind],
    open: st[c.id] === 1,
    openable: openable.has(c.id),
  }));
}

/** 「あと何マスで次の枠が増えるか」のような、目標の案内に使う */
export function progressText(save) {
  const opened = openedCount(save) - 1;                   // 中央を除く
  const done = openableIds(save).length === 0;
  return { opened, total: BOARD_SIZE - 1, cost: nextCost(save), done };
}

/**
 * 潜行の締めくくり（画面をまたぐ共通処理）
 *
 * 探索画面と戦闘画面の両方から呼ぶ。
 * **画面モジュールどうしが直接 import し合わないようにするため**にここへ出した
 * （app.js の方針: 画面どうしは直接呼び合わず、必ず ctx.go() を通す）。
 * 置いたままだと、探索画面が戦闘画面を import した瞬間に循環する。
 */

import * as X from '../dungeon/explore.js';

/**
 * 潜行を精算してセーブへ反映し、結果画面へ渡す。
 * 帰還・全滅のどちらもここを通る。
 */
export function endRun(ctx, run) {
  const result = X.settle(run, run.outcome === 'wipe');
  const applied = X.applyToSave(ctx.save, result, run);
  ctx.state.run = null;
  ctx.state.pending = { result, overflow: applied.overflow, floor: run.floor, tower: run.tower };
  ctx.saveNow(true);
  ctx.go('result');
}

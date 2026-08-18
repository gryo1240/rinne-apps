/**
 * シナリオへの寄り道（画面をまたぐ共通処理）
 *
 * run_flow.js と同じ理由でここに置く。
 * 画面モジュールどうしを直接 import させないための中継点（app.js の方針）。
 *
 * ★「拠点に着いたら取りこぼしを拾う」をここに一本化してある。
 *   拠点へ入る道が複数ある（タイトルから／潜行の結果画面から／会話の後から）ので、
 *   個別の画面に書くと必ずどれかが抜ける。
 */

import * as St from '../meta/story.js';

/** 拠点へ。未読の場面があれば先に読ませる（多すぎるときは分割して次回へ回す） */
export function toHome(ctx, params = {}) {
  const ids = St.catchUp(ctx.save);
  if (ids.length > 0) { ctx.go('talk', { ids, back: 'home', backParams: params }); return; }
  ctx.go('home', params);
}

/** 塔へ入る。入る階の場面が未読なら先に読ませる */
export function toExplore(ctx, params = {}) {
  const ids = St.pending(ctx.save, {
    at: 'floor', floor: params.floor || 1, tower: params.tower || 'main',
  });
  if (ids.length > 0) { ctx.go('talk', { ids, back: 'explore', backParams: params }); return; }
  ctx.go('explore', params);
}

/**
 * 潜行中に階へ着いたとき。
 * @returns {boolean} 会話へ寄り道したか（true なら呼び出し側は描画しなくてよい）
 */
export function afterFloor(ctx, run) {
  return hop(ctx, St.pending(ctx.save, { at: 'floor', floor: run.floor, tower: run.tower }));
}

/** 層ボスを倒した直後 */
export function afterBoss(ctx, run) {
  return hop(ctx, St.pending(ctx.save, { at: 'boss', floor: run.floor, tower: run.tower }));
}

function hop(ctx, ids) {
  if (ids.length === 0) return false;
  // ★曲はここでは指定しない。**場面データ（data/scenario.js の bgm）が持つ**（2026-08-12 に一本化）。
  //   以前はエンディングだけここで 'ending' を渡していたが、
  //   呼び出し側に持たせると**入口ごとに指定が食い違う**（読み返しだけ別の曲になる）。
  //   場面から読む形に統一したので、60階の曲を替えるときも scenario.js の1行で済む。
  // 潜行の途中なので、戻り先は必ず探索画面（ctx.state.run はそのまま残る）
  ctx.go('talk', { ids, back: 'explore' });
  return true;
}

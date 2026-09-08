/**
 * ルナチェイン｜日替わりの中身
 *   1. 「今日の月」… その日の盤（地形・つながり・CPUの強さ）
 *   2. 「今日の詰めルナ」… 勝てる手がちょうど1つだけある盤（§3-7・大人の再訪動機）
 *
 * ★データ更新をオーナーに要求しない★——日付から毎回その場で作る。
 * ★端末の時計を正とする★——サーバ時刻と比べない。ずれても「別の日の盤が出る」だけで実害が無い。
 * ★過去7日ぶんも作れる★——1日遊べなくても取り返しがつくようにするため。
 */
import { generateBoard } from '../core/board.js';
import { newGame, applyMove, legalMoves, cloneState, boardSignature } from '../core/rules.js';
import { makeRng, seedFromString, ymd } from '../core/rng.js';

/** その日の対戦盤 */
export function dailyBoard(date = ymd()) {
  const rng = makeRng(seedFromString('luna-day-' + date));
  const { terrain, wrapX } = generateBoard(rng);
  return { terrain, wrapX, tier: 3 + rng.int(3), date };   // デイリーのCPUは固定強度（自動調整の対象外）
}

/** 直近n日ぶんの日付（今日を含む） */
export function recentDates(n = 7, today = new Date()) {
  const out = [];
  for (let k = 0; k < n; k++) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - k);
    out.push(ymd(d));
  }
  return out;
}

/**
 * 「今日の詰めルナ」を作る。
 *   条件: 手番のプレイヤーが **1手で勝てる手をちょうど1つだけ**持っている局面
 *   作り方: ランダムに打ち進めた局面を候補にし、全42マスを総当たりして条件に合うものを探す
 *
 *  ★シミュレーターと同じルール実装を使うこと★（別実装にすると必ずズレる）
 */
export function makeTsume(date = ymd(), maxAttempts = 80) {
  const rng = makeRng(seedFromString('luna-tsume-' + date));

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const { terrain, wrapX } = generateBoard(rng);
    const s = newGame({ terrain, wrapX, komi: 0, maxTurns: 400 });

    // ★決着（全滅）は実測で75手番あたりから起きる。そこまで打ち進めながら、
    //   「先手が1手で勝てる手をちょうど1つだけ持っている」瞬間を探す。
    //   序盤を調べても勝ち手は存在しないので、CHECK_FROM 手番までは検査を省く（速さのため）。
    const CHECK_FROM = 40;
    for (let ply = 0; ply < 400 && !s.winner; ply++) {
      if (s.player === 1 && s.left === 1 && ply >= CHECK_FROM) {
        const wins = winningMoves(s, 1);
        if (wins.length === 1) {
          return { state: s, solution: wins[0], date, signature: boardSignature(s), attempts: attempt + 1 };
        }
      }
      const ms = legalMoves(s);
      if (!ms.length) break;
      applyMove(s, ms[rng.int(ms.length)]);
    }
  }
  return null;   // 見つからなかった日は、呼び出し側が「今日は対戦だけ」に倒す
}

/** その局面で「1手で勝てる手」を全部返す（詰めルナの検算にも使う） */
export function winningMoves(s, player) {
  const out = [];
  for (const i of legalMoves(s, player)) {
    const t = cloneState(s);
    t.player = player;
    t.left = 1;
    const r = applyMove(t, i);
    if (r.ok && t.winner === player) out.push(i);
  }
  return out;
}

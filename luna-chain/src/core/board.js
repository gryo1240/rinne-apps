/**
 * ルナチェイン｜盤面のかたち（幾何）と地形
 *
 * ★★このファイルで守る唯一の約束: 光の流れが「行きと帰りで対称」であること★★
 *
 *   AからBへ光が飛ぶなら、BからAへも飛ぶ。この対称性が崩れると、
 *   **光の総数が増えていなくても、光が一方通行の輪をぐるぐる回り続けて連鎖が止まらない**。
 *
 *   2026-09-08、当初の星屑案（はじけた光が2マス先へ「貫通」する）を実測したところ、
 *   test/stress.mjs で 7,200回中333回、連鎖が止まらなかった。
 *   「光が増えないこと」は停止の必要条件でしかなく、保証にはならない（advisor指摘・実測で確認）。
 *
 *   そこで星屑を「**光を通すマス**」に変えた。A—星屑—C は行きも帰りも通れるので対称。
 *   鏡は「マスの能力」をやめ、「**盤の左右がつながっている**」という盤単位の属性にした
 *   （マスの能力にすると角の容量が変わり、「角は取りやすく守りやすい」という戦略の骨格が壊れるため）。
 *
 *   ★地形を足すときは、必ず test/stress.mjs を通すこと。★
 */

/* ★盤の大きさは変えられる★（2026-09-09 オーナー指示「設定で盤面数を増やせるように」）
 *
 *   ★ここは「モジュール全体で1つだけ」の状態★
 *     つまり **同時に2つの違う大きさの盤を持てない**。いまは持つ必要がない
 *     （あそびかたの図はDOM、連鎖の予告は同じ盤のクローン）が、将来
 *     「盤のプレビューと本番の盤を並べる」ような画面を作った瞬間に壊れる。
 *
 *   ★setSize は対戦が動いているあいだ呼んではいけない★
 *     N が変わっても、進行中の state が持つ Int8Array は古い長さのまま。
 *     範囲外に触れても JS は例外を出さないので、**静かに盤がおかしくなる**。
 *     呼び出し口は app.js の対戦開始（beginMatch / startTutorial）だけにする。
 *
 *   ★N や W から「読み込み時に」値を作らないこと★
 *     const で受けた瞬間に、そのときの大きさで固定される。
 *     実際 data/tutorial.js の hand が `idx(2,3)` を読み込み時に評価していて、
 *     指マークの位置だけ古い幅に取り残される形になっていた（2026-09-09 に修正）。
 *     このファイルの中でも、大きさに依存する表は必ず setSize で作り直す（下の ORTH）。
 */
export const DEF_W = 6, DEF_H = 7;      // ふつうの盤（記録に残るのはこの大きさだけ）
/* 下限の根拠: generateBoard が `rng.int(W >> 1)` と `1 + rng.int(H - 2)` を使うので
   W<2 / H<3 で退化する。加えて地形を左右対称に2〜3組置く余地が要る。
   上限の根拠: 画面幅320pxでも1マス36px以上を保てること（(320-12)/36 ≒ 8.5）。
   マスが小さくなると、いちばん効いている「連鎖の予告の数字」が読めなくなる。 */
export const MIN_W = 4, MAX_W = 8;
export const MIN_H = 5, MAX_H = 10;

export let W = DEF_W;
export let H = DEF_H;
export let N = W * H;

const clampSize = (v, lo, hi) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : lo;
};

/**
 * 盤の大きさを変える。★対戦中に呼ばないこと★（上の注意を読むこと）
 * 返り値は「実際に変わったか」。範囲外の値は黙って丸める。
 */
export function setSize(w, h) {
  const nw = clampSize(w, MIN_W, MAX_W);
  const nh = clampSize(h, MIN_H, MAX_H);
  if (nw === W && nh === H) return false;
  W = nw; H = nh; N = W * H;
  ORTH = buildOrth();                    // ★大きさに依存する表は必ず作り直す★
  return true;
}

/** いま「ふつうの盤」か（記録に残してよいか の判定に使う） */
export const isDefaultSize = () => W === DEF_W && H === DEF_H;

// 地形
export const T_NORMAL   = 0;
export const T_CRATER   = 1; // 容量+1。はじけにくい＝守りが固い
export const T_STARDUST = 2; // 光を通すマス。置けない・光を持たない・入った光は同じ向きに抜ける
export const T_CLOUD    = 3; // 置けない・飛んできた光は消える。ターン経過で晴れる

export const TERRAIN_NAMES = ['ふつう', 'クレーター', '星屑', '雲'];

export const xOf = (i) => i % W;
export const yOf = (i) => (i / W) | 0;
export const idx = (x, y) => y * W + x;
export const inBoard = (x, y) => x >= 0 && x < W && y >= 0 && y < H;

/** 上下左右。この順序が連鎖の処理順を決める＝決定論の一部なので変えないこと */
const DIRS = [[0, -1], [0, 1], [-1, 0], [1, 0]];

/** 上下左右の隣接（AIの評価用。地形と無関係）。★setSize のたびに作り直す★ */
function buildOrth() {
  const t = [];
  for (let i = 0; i < N; i++) {
    const x = xOf(i), y = yOf(i), a = [];
    for (const [dx, dy] of DIRS) if (inBoard(x + dx, y + dy)) a.push(idx(x + dx, y + dy));
    t.push(a);
  }
  return t;
}
let ORTH = buildOrth();
export function orthOf(i) { return ORTH[i]; }

/**
 * その向きに光を出したとき、どこに届くか。
 * 星屑は通り抜ける。盤の外へ抜けたら -1（光は消える＝減る方向なので停止性は壊れない）。
 */
function travel(x, y, dx, dy, terrain, wrapX) {
  let cx = x, cy = y;
  for (let step = 0; step < W + H + 2; step++) {
    cx += dx; cy += dy;
    if (wrapX) cx = ((cx % W) + W) % W;
    if (!inBoard(cx, cy)) return -1;
    const j = idx(cx, cy);
    if (terrain[j] !== T_STARDUST) return j;   // 星屑でなければそこで止まる
  }
  return -1;
}

/** その向きに1マス目が存在するか（＝その向きへ光を出す資格があるか） */
function hasFirstStep(x, y, dx, dy, wrapX) {
  let nx = x + dx, ny = y + dy;
  if (wrapX) nx = ((nx % W) + W) % W;
  return inBoard(nx, ny);
}

/**
 * 盤の幾何を作る。地形が変わったら作り直す（カードで星屑や雲を足せるため）。
 * 返り値 targets[i] は -1 を含みうる（盤の外へ抜けて消える光）。
 *   ★不変条件: cap[i] === targets[i].length （クレーターだけ +1）
 */
export function buildGeometry(terrain, wrapX = false) {
  const targets = new Array(N);
  const cap = new Int16Array(N);
  for (let i = 0; i < N; i++) {
    if (terrain[i] === T_STARDUST) {
      targets[i] = [];
      cap[i] = 9999;              // 光を持たないので、はじけることは無い
      continue;
    }
    const x = xOf(i), y = yOf(i), a = [];
    for (const [dx, dy] of DIRS) {
      if (!hasFirstStep(x, y, dx, dy, wrapX)) continue;
      a.push(travel(x, y, dx, dy, terrain, wrapX));
    }
    targets[i] = a;
    cap[i] = a.length + (terrain[i] === T_CRATER ? 1 : 0);
  }
  return { targets, cap };
}

/** 置けるマスか（星屑と雲は置けない。雲の判定は時間で変わるので rules 側で見る） */
export const isWall = (terrain) => terrain === T_STARDUST;

/**
 * 光の流れが「行き帰りで対称」かを調べる。対称でなければ最初に見つけた [i, j] を返す。
 * ★連鎖が止まることの根拠はこの対称性★——だから検査そのものを関数にして、
 *   テスト側で「わざと壊した幾何を渡すと本当に検出できる」ことまで確かめる。
 */
export function findAsymmetry(geo, terrain) {
  for (let i = 0; i < N; i++) {
    if (terrain[i] === T_STARDUST) continue;
    for (const j of geo.targets[i]) {
      if (j < 0) continue;                       // 盤の外へ抜けた光は消えるので対象外
      if (!geo.targets[j].includes(i)) return [i, j];
    }
  }
  return null;
}

/**
 * 盤を生成する。
 * ★地形は左右対称に置く★——非対称な盤は先手有利をそのまま増やすため（§2-6）。
 * ★「左右がつながった盤」は全体の約2割だけ★——毎回出ると角の戦略が消え、
 *   たまに出るからこそ「今日の盤は違う」になる。
 */
/**
 * ★「左右がつながった盤」は v1 では出さない（2026-09-08 実測で決定）★
 *   test/sim.mjs で 5,400局を測ったところ、つながり盤だけ先手勝率が
 *   komi=2で 0.0%、komi=1で 84.5%、komi=0で 69.0%（各116局・1局の重み0.86pt）と極端に振れ、
 *   **komiでは均せない**ことが分かった。全体平均が50%でも、この盤に当たった友達どうしの
 *   比較はその場で壊れる。engine側の対応（buildGeometryのwrapX）は対称で停止性も確認済みなので
 *   残してあるが、盤の生成では使わない。将来ちゃんと均せたときだけ 0 を戻す。
 */
const WRAP_BOARD_RATE = 0;   // 10段階中いくつを「つながり盤」にするか（v1は0）

export function generateBoard(rng) {
  const terrain = new Int8Array(N);
  const wrapX = rng.int(10) < WRAP_BOARD_RATE;
  const kinds = [T_CRATER, T_STARDUST, T_CLOUD];
  const pairs = 2 + rng.int(2);        // 2〜3組 ＝ 4〜6マス
  const usedRows = new Set();
  let placed = 0, guard = 0;
  while (placed < pairs && guard++ < 300) {
    const x = rng.int(W >> 1);         // 左半分で決めて右へ鏡像コピー
    const y = 1 + rng.int(H - 2);      // 最上段・最下段は避ける
    const i = idx(x, y), j = idx(W - 1 - x, y);
    if (i === j || terrain[i] !== T_NORMAL || terrain[j] !== T_NORMAL) continue;
    if (usedRows.has(y)) continue;     // 同じ行に固めない
    const k = kinds[rng.int(kinds.length)];
    terrain[i] = k; terrain[j] = k;
    usedRows.add(y);
    placed++;
  }
  return { terrain, wrapX };
}

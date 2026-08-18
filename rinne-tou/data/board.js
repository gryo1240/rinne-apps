/**
 * 因果盤（いんがばん）― 49マスの永続強化ボード（spec §6-5）
 *
 * 7×7。中央から**隣接するマスだけ**開放できる。通貨は因果。
 * 輪廻してもリセットされない（＝周回の積み上げ先）。
 *
 * ── 仕様との差分（意図的・2026-08-03） ────────────────────
 * spec §6-5 の効果表には、**まだ受け取り手のいない効果**が3種ある:
 *   「スキル枠 +1」(2)  … v1.0 はスキルが固定でスキル書が未実装
 *   「輪廻時の引き継ぎ強化」(3) … 輪廻（`src/meta/rebirth.js`）が未実装
 *   「還り札の所持上限 +1」(3) … 所持上限そのものが未実装（購入手段も無い）
 * 押しても何も起きないマスは「あるふりをしない」という本作の方針に反するので、
 * この8マスは**動く効果へ振り替えてある**。
 * → スキル書・輪廻・還り札の店を実装したら、ここを spec の配分へ戻すこと。
 *
 * 配置の方針: 中央に近いほど地味で確実な効果（全ステ+2）、外周ほど珍しい効果。
 * コストが `50 × 1.15^開放数` で指数的に上がるので、**外周＝終盤の目標**になる。
 */

export const BOARD_W = 7;
export const BOARD_H = 7;
export const BOARD_SIZE = BOARD_W * BOARD_H;      // 49
export const BOARD_CENTER = 24;                    // (3,3)。最初から開いている

/** 効果の種類 */
export const CELL = {
  CENTER: 'center',
  STAT: 'stat',        // 全ステータス +2
  HP: 'hp',            // 最大HP +5%
  AKARI: 'akari',      // 最大灯 +5
  DISPATCH: 'dispatch',// 影送りの枠 +1
  DROP: 'drop',        // 装備ドロップ率 +3%
  KARMA: 'karma',      // 因果獲得 +5%
  RENKI: 'renki',      // 錬気の上限 +5
};

/**
 * 効果ひとつぶんの大きさ（`src/meta/board.js` が合算する）
 *
 * 【2026-08-03 調整】spec §6-5 は「全ステータス +2」と書いているが、これは
 * **効果の例**として挙げられた数字。実装して sim.mjs で測ったところ、
 * 本編クリアまでに開く15マスの大半が「地の因」に寄り、
 * Lv35（素のステータス100〜150）に対して +24 前後という重い補正になって、
 * 通しプレイが 9.0h → 6.7h、全滅が 7.3回 → 4.0回（合格ライン5〜25を割る）に落ちた。
 *
 * ★盤の効果量を触るときは、必ず `node test/sim.mjs` と `node test/boss.mjs` を回すこと。
 */
export const CELL_VALUE = {
  stat: 1,        // 各ステータスへの加算（spec の例は+2。上記の理由で半分にした）
  hp: 0.03,       // 最大HPの倍率に加算（spec の例は+5%）
  akari: 5,
  dispatch: 1,
  drop: 0.03,
  karma: 0.05,
  renki: 5,
};

/**
 * マスの見た目と説明。
 *
 * ★説明文の数字は **必ず CELL_VALUE から組み立てる**。
 *   文字列に直書きすると、効果量を調整したときに凡例だけが古い数字のまま残る
 *   （2026-08-03 実機で発覚: 効果は+1なのに凡例は「+2」と表示していた）。
 */
const pct = (v) => `${Math.round(v * 100)}%`;

export const CELL_INFO = {
  center:   { name: '始まりの因', short: '因', desc: 'ここから盤が広がる', color: '#c9a227' },
  stat:     { name: '地の因', short: '地', color: '#8fa1b3', desc: `全員の全ステータス +${CELL_VALUE.stat}` },
  hp:       { name: '命の因', short: '命', color: '#c56b6b', desc: `全員の最大HP +${pct(CELL_VALUE.hp)}` },
  akari:    { name: '灯の因', short: '灯', color: '#d9b45b', desc: `潜行の最大「灯」 +${CELL_VALUE.akari}` },
  dispatch: { name: '影の因', short: '影', color: '#7d6fb0', desc: `影送りの枠 +${CELL_VALUE.dispatch}` },
  drop:     { name: '拾の因', short: '拾', color: '#6fa08b', desc: `装備の拾いやすさ +${pct(CELL_VALUE.drop)}` },
  karma:    { name: '巡の因', short: '巡', color: '#b08a5b', desc: `得られる因果 +${pct(CELL_VALUE.karma)}` },
  renki:    { name: '錬の因', short: '錬', color: '#9b7fa8', desc: `錬気の上限 +${CELL_VALUE.renki}` },
};

/**
 * 盤の配置（7行×7列）。1文字＝1マス。
 *   C=中央 / S=地 / H=命 / A=灯 / D=影 / R=拾 / K=巡 / N=錬
 *
 * 内訳: 地14・命7・灯6・拾7・巡6・錬5・影3・中央1 ＝ 49
 *
 * ★配置の方針（コードで守れているか `test.mjs` §17 が検査する）:
 *   - 中央の周り（環1〜2）は「地」「命」＝地味で確実な効果
 *   - **珍しい効果（影・巡・錬）はすべて外周（環3）**
 *     最初の配置では「影の因」が中央から2マス＝107因果で買えてしまい、
 *     spec §7-1 が枠を長期目標として置いている位置づけと矛盾していた
 *     （2026-08-03 レビュー指摘）。いまは最短でも6マス＝436因果かかる
 *
 * ⚠ **この配置を変えるときは `LAYOUT_VERSION` を必ず上げること。**
 *   `save.board` は「どの効果を買ったか」ではなく **「どの位置を買ったか」** しか
 *   持っていない。1文字でも動かすと、既存プレイヤーの購入済みマスの効果が
 *   黙って別物に入れ替わる。上げたうえで `src/core/save.js` の migrate に
 *   読み替え（または因果の全額返却＋盤のリセット）を書く。
 */
export const LAYOUT_VERSION = 1;

const LAYOUT = [
  'DKNRANK',
  'SSHARSS',
  'HSSSHHA',
  'RRSCSAR',
  'KHHSSSK',
  'NSRAHSD',
  'KNRANKD',
];

const CODE = {
  C: CELL.CENTER, S: CELL.STAT, H: CELL.HP, A: CELL.AKARI,
  D: CELL.DISPATCH, R: CELL.DROP, K: CELL.KARMA, N: CELL.RENKI,
};

/** 49マスの定義。id は 0〜48（行優先） */
export const BOARD = (() => {
  const out = [];
  for (let r = 0; r < BOARD_H; r++) {
    for (let c = 0; c < BOARD_W; c++) {
      const kind = CODE[LAYOUT[r][c]];
      out.push({
        id: r * BOARD_W + c, row: r, col: c, kind,
        ring: Math.max(Math.abs(r - 3), Math.abs(c - 3)),
        value: CELL_VALUE[kind] || 0,
      });
    }
  }
  return out;
})();

/** 上下左右に隣接するマスのid */
export function neighborsOf(id) {
  const r = Math.floor(id / BOARD_W), c = id % BOARD_W;
  const out = [];
  if (r > 0) out.push(id - BOARD_W);
  if (r < BOARD_H - 1) out.push(id + BOARD_W);
  if (c > 0) out.push(id - 1);
  if (c < BOARD_W - 1) out.push(id + 1);
  return out;
}

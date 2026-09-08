/**
 * ルナチェイン｜合言葉コード
 *
 *   書式:  LC1-<種別1文字><中身(Base32)>-<チェック2文字>
 *   種別:  D=編成（友達に渡す）/ S=セーブ（機種変更・データ消失からの復帰）
 *          R=きろく（今日の詰めルナの結果）/ B=盤（将来のステージ配布用に番号だけ予約）
 *
 * ★v1から汎用の体系で作る★——あとから種別を足せる形にしておくと、
 *   「ステージを自分で作って friends に渡す」拡張がそのまま乗る。
 *
 * ★壊れたコードでプレイヤーを詰まらせない★（教訓 anti-cheat-must-not-brick-players）
 *   - 打ち間違い（チェックが合わない）→「もういちど」と伝えるだけ。例外は投げない
 *   - 形は合っているが値が変（未解放のカードが入っている等）→ **弾かずに合法な範囲へ丸める**
 *     未解放カードの編成も「そのカードを使う影」として成立させる
 *     ＝友達に強いカードを見せてもらえることが、遊ぶ動機になる
 */
import { CARDS } from '../../data/cards.js';

const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';           // Crockford（I/L/O/U を除く）
const B32_MAP = Object.fromEntries([...B32].map((c, i) => [c, i]));

/** ニックネームに使える文字（1文字6bit）。カタカナ46＋長音＋数字10＝57文字 */
export const NICK_CHARS = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワンー0123456789';
const NICK_MAP = Object.fromEntries([...NICK_CHARS].map((c, i) => [c, i]));
export const NICK_MAX = 6;

// ── ビット列の読み書き ────────────────────────────────
class BitWriter {
  constructor() { this.bits = []; }
  put(value, width) {
    const v = Math.max(0, Math.floor(value));
    for (let k = width - 1; k >= 0; k--) this.bits.push((v >> k) & 1);
    return this;
  }
  toBase32() {
    const bits = this.bits.slice();
    while (bits.length % 5) bits.push(0);
    let out = '';
    for (let i = 0; i < bits.length; i += 5) {
      let v = 0;
      for (let k = 0; k < 5; k++) v = (v << 1) | bits[i + k];
      out += B32[v];
    }
    return out;
  }
}
class BitReader {
  constructor(str) {
    this.bits = [];
    for (const ch of str) {
      const v = B32_MAP[ch];
      if (v === undefined) continue;
      for (let k = 4; k >= 0; k--) this.bits.push((v >> k) & 1);
    }
    this.pos = 0;
  }
  get(width) {
    let v = 0;
    for (let k = 0; k < width; k++) v = (v << 1) | (this.bits[this.pos++] | 0);
    return v;
  }
}

/** 2文字のチェック。打ち間違いに気づくためのもので、改ざん対策ではない */
function checksum(body) {
  let h = 0x811c9dc5;
  for (let i = 0; i < body.length; i++) { h ^= body.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return B32[(h >>> 5) & 31] + B32[h & 31];
}

const wrap = (type, payload) => {
  const body = type + payload;
  return `LC1-${body}-${checksum(body)}`;
};

/** 表記ゆれを吸収する（小文字・全角・まぎらわしい文字・区切りの抜け） */
export function normalize(input) {
  return String(input || '')
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '');
}

/**
 * 中身の「まぎらわしい文字」を吸収する。Base32(Crockford)は I/L/O/U を使わないので、
 * 手で書き写したときの I→1・L→1・O→0・U→V を安全に読み替えられる。
 * ★接頭辞 LC1 には絶対に掛けないこと★（Lが1になって別物になる）
 */
const fixAmbiguous = (s) => s.replace(/[IL]/g, '1').replace(/O/g, '0').replace(/U/g, 'V');

// ── 編成コード（D） ───────────────────────────────
export function encodeDeck(cardIds = [], nickname = '') {
  const w = new BitWriter();
  for (let k = 0; k < 3; k++) {
    const idx = CARDS.findIndex((c) => c.id === cardIds[k]);
    w.put(idx < 0 ? 15 : idx, 4);            // 15 = そのスロットは空
  }
  const nick = [...String(nickname)].slice(0, NICK_MAX);
  for (let k = 0; k < NICK_MAX; k++) {
    const v = NICK_MAP[nick[k]];
    w.put(v === undefined ? 63 : v, 6);      // 63 = 文字なし
  }
  return wrap('D', w.toBase32());
}

// ── セーブコード（S） ──────────────────────────────
export function encodeSave({ shards = 0, trophies = 0, tier = 1 }) {
  const w = new BitWriter();
  w.put(Math.min(shards, 0xFFFFF), 20);
  w.put(trophies >>> 0, 32);
  w.put(Math.min(Math.max(tier, 1), 6), 3);
  return wrap('S', w.toBase32());
}

// ── きろくコード（R） ──────────────────────────────
const EPOCH = Date.UTC(2026, 0, 1);
export const dayNumber = (ymdStr) => {
  const [y, m, d] = String(ymdStr).split('-').map(Number);
  return Math.max(0, Math.round((Date.UTC(y, (m || 1) - 1, d || 1) - EPOCH) / 86400000));
};
export function encodeRecord({ date, moves = 0 }) {
  const w = new BitWriter();
  w.put(Math.min(dayNumber(date), 0x3FFF), 14);
  w.put(Math.min(moves, 1023), 10);
  return wrap('R', w.toBase32());
}

/**
 * 読み取り。返り値は必ずオブジェクト（例外を投げない）。
 *   { ok:false, reason:'empty'|'format'|'typo'|'unknown' }
 *   { ok:true, type:'D', cards:[...], nickname:'...' } など
 */
export function decode(input) {
  const raw = normalize(input);
  if (!raw) return { ok: false, reason: 'empty' };
  // 接頭辞は LC1。手書きを写したときの 1C1 も受け入れる
  if (!/^(LC1|1C1)/.test(raw)) return { ok: false, reason: 'format' };

  const rest = fixAmbiguous(raw.slice(3));
  if (rest.length < 3) return { ok: false, reason: 'format' };
  const body = rest.slice(0, -2);
  const cc = rest.slice(-2);
  if (checksum(body) !== cc) return { ok: false, reason: 'typo' };   // ★打ち間違い。責めない

  const type = body[0];
  const r = new BitReader(body.slice(1));

  if (type === 'D') {
    const cards = [];
    for (let k = 0; k < 3; k++) {
      const idx = r.get(4);
      // ★未解放のカードでも弾かない（そのカードを使う「影」として成立させる）
      cards.push(idx < CARDS.length ? CARDS[idx].id : null);
    }
    let nickname = '';
    for (let k = 0; k < NICK_MAX; k++) {
      const v = r.get(6);
      if (v < NICK_CHARS.length) nickname += NICK_CHARS[v];
    }
    return { ok: true, type: 'D', cards, nickname };
  }
  if (type === 'S') {
    const shards = r.get(20);
    const trophies = r.get(32);
    const tier = Math.min(Math.max(r.get(3), 1), 6);       // ★範囲外は丸める
    return { ok: true, type: 'S', shards, trophies, tier };
  }
  if (type === 'R') {
    return { ok: true, type: 'R', day: r.get(14), moves: r.get(10) };
  }
  // B（盤）は番号だけ予約。v1では読めなくてよいが、種別として認識だけする
  if (type === 'B') return { ok: false, reason: 'unknown', type: 'B' };
  return { ok: false, reason: 'unknown' };
}

/** 画面に出すときの読みやすい形（4文字ずつ区切る） */
export function pretty(code) {
  const raw = normalize(code);
  if (!/^(LC1|1C1)/.test(raw)) return raw;
  const body = raw.slice(3);
  return 'LC1-' + (body.match(/.{1,4}/g) || []).join('-');
}

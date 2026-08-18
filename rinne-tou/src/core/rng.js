/**
 * 決定論的な乱数（mulberry32）
 *
 * 【厳守】src/ 配下で Math.random() を使ってはいけない（test.mjs が検出する）。
 * 影闘（非同期対戦）のリプレイ、週間試練の共通ダンジョン、自動プレイシミュレーターは
 * すべて「同じシードなら同じ結果」であることを前提にしている。
 * 仕様: rinne-tou-tech-design.md §3
 */

/** 文字列 → 32bit整数シード（FNV-1a）。月みくじ等の既存アプリと同じ方式 */
export function hashSeed(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** シード付き乱数生成器を作る。戻り値は 0以上1未満を返す関数 */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 乱数の呼び出し回数（テスト専用の計測点）
 *
 * リファクタで**乱数の消費順序がずれていないか**を検出するために置いている。
 * 平均値の一致（勝率・所要時間）では順序の入れ替わりが相殺されて見逃されるが、
 * 呼び出し回数はずれた瞬間に必ず変わる。test/golden.mjs がこれを見る。
 */
export const RNG_STATS = { calls: 0 };
export function resetRngStats() { RNG_STATS.calls = 0; }

/** rngを包んで、よく使う操作をまとめたもの */
export function makeRng(seed) {
  const raw = typeof seed === 'function' ? seed : mulberry32(typeof seed === 'string' ? hashSeed(seed) : seed);
  const next = () => { RNG_STATS.calls++; return raw(); };
  return {
    next,
    /** min以上max未満の実数 */
    float(min, max) { return min + next() * (max - min); },
    /** min以上max以下の整数 */
    int(min, max) { return min + Math.floor(next() * (max - min + 1)); },
    /** 確率p(0〜1)で true */
    chance(p) { return next() < p; },
    /** 配列から1つ選ぶ */
    pick(arr) { return arr[Math.floor(next() * arr.length)]; },
    /** 重み付き抽選。items=[{w:重み, ...}] */
    weighted(items) {
      let total = 0;
      for (const it of items) total += it.w;
      let r = next() * total;
      for (const it of items) { r -= it.w; if (r < 0) return it; }
      return items[items.length - 1];
    },
    /** 配列をシャッフルした新しい配列を返す（Fisher-Yates） */
    shuffle(arr) {
      const a = arr.slice();
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    },
  };
}

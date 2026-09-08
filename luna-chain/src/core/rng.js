/**
 * ルナチェイン｜シード付き乱数（xorshift32）
 *
 * ★このゲームの進行そのものは決定論。乱数を使うのは次の2か所だけ:
 *   1. 盤面（地形）の生成 … 日付や合言葉から作る
 *   2. CPUが「わざと悪手を選ぶ」とき … 難易度の弱さの表現
 * 演出やUIでは使わない。ここを守らないと golden test（棋譜のハッシュ照合）が書けなくなる。
 */

/** 32bit xorshift。同じ種からは必ず同じ列が出る */
export function makeRng(seed) {
  let s = (seed >>> 0) || 0x9e3779b9;
  const next = () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;  s >>>= 0;
    return s;
  };
  // 最初の数個は種の偏りが出るので捨てる
  next(); next(); next();
  return {
    /** 0以上1未満 */
    float: () => next() / 4294967296,
    /** 0以上n未満の整数 */
    int: (n) => Math.floor((next() / 4294967296) * n),
    /** 配列から1つ選ぶ */
    pick: (arr) => arr[Math.floor((next() / 4294967296) * arr.length)],
    /** 生の32bit値 */
    raw: next,
  };
}

/** 文字列（合言葉・日付）から種を作る。FNV-1a */
export function seedFromString(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** 日付（Dateまたは'YYYY-MM-DD'）から、その日の種を作る */
export function seedFromDate(d) {
  const s = typeof d === 'string' ? d : ymd(d);
  return seedFromString('luna-' + s);
}

/** ローカル日付を YYYY-MM-DD で返す（端末の時計を正とする。サーバ時刻と比較しない） */
export function ymd(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/* 三河弁ジェネレーター 変換ロジック（純関数のみ）
 *
 * テスト: node apps/mikawaben/test.js
 *
 * 【壊してはいけない性質】
 * 1. **べき等**: convert(convert(x)) === convert(x)。ルールが互いの出力を食い合うと
 *    結果が入力の「回数」に依存してしまい、同じ文を入れても違う結果が出る
 * 2. **足さない**: 入力に無い言葉を出力に加えない。特にきつい言葉（たわけ等）は
 *    入力側に対応する語があるときだけ出す
 * 3. **決定的**: 乱数を使わない。同じ入力からは必ず同じ出力を返す（共有した結果が再現しないと困る）
 */

/* 正規表現の lastIndex を持ち回さないよう、毎回作り直す（/g 付き正規表現の使い回しは事故のもと） */
function freshRegExp(re) {
  return new RegExp(re.source, re.flags);
}

/**
 * 文章を三河弁に変換する。
 * @param {string} text 入力
 * @param {Array} rules 変換ルール
 * @param {number} level 1〜3。この値以下の level のルールだけ適用する
 * @returns {{ text: string, applied: Array }} applied は実際に置換が起きたルール
 */
function convert(text, rules, level) {
  var src = (text === null || text === undefined) ? "" : String(text);
  var lv = (typeof level === "number" && level >= 1) ? level : 1;
  var applied = [];
  var out = src;

  (rules || []).forEach(function (r) {
    if (r.level > lv) return;
    var re = freshRegExp(r.from);
    if (!re.test(out)) return;
    out = out.replace(freshRegExp(r.from), r.to);
    applied.push(r);
  });

  return { text: out, applied: applied };
}

/** 適用したルール数に応じた一言を返す（乱数を使わない＝結果が再現する） */
function pickComment(appliedCount, comments) {
  var n = appliedCount || 0;
  var best = null;
  (comments || []).forEach(function (c) {
    if (n >= c.min && (best === null || c.min > best.min)) best = c;
  });
  return best ? best.text : "";
}

/** そのレベルで使えるルールの数 */
function countRules(rules, level) {
  return (rules || []).filter(function (r) { return r.level <= level; }).length;
}

/** シェア用の文章を組み立てる */
function buildShareText(original, converted, opts) {
  var o = opts || {};
  var head = "標準語を三河弁にしてみました。";
  return head + "\n\n" + String(converted || "").trim() + "\n\n" + (o.url || "");
}

var API = {
  convert: convert,
  pickComment: pickComment,
  countRules: countRules,
  buildShareText: buildShareText
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = API;
} else {
  window.MikawaBen = API;
}

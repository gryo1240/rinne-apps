/* 配当金なに買える？ 換算ロジック（純関数のみ）
 *
 * テスト: node apps/haitou-nanikaeru/test.js
 *
 * 【設計の前提】
 * - DOM操作・通信・localStorage はここに書かない（test.js が node で動かなくなるため）
 * - **将来の予測を一切しない。** 入力は「実際に受け取った金額」で、出力はその言い換えにすぎない。
 *   利回りから配当額を計算するのは既存の配当金シミュレーターの仕事で、このアプリは踏み込まない
 * - 価格はユーザーが書き換えられる前提なので、ここでは items をそのまま受け取り、
 *   data.js の初期値に依存しない
 */

/** 入力値を安全な非負整数の円に丸める。空欄・文字・マイナス・NaN はすべて0にする */
function normalizeAmount(value) {
  var n = typeof value === "number" ? value : parseFloat(String(value).replace(/[,\s円]/g, ""));
  if (!isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

/**
 * 入力額を「ひと月あたり」に直す。
 * period: "month" ならそのまま、"year" なら12で割る（切り捨て）
 */
function toMonthly(amount, period) {
  var a = normalizeAmount(amount);
  return period === "year" ? Math.floor(a / 12) : a;
}

/** 価格を安全な正の整数に丸める。0以下・不正値は null（＝換算不能）を返す */
function normalizePrice(value) {
  var n = typeof value === "number" ? value : parseFloat(String(value).replace(/[,\s円]/g, ""));
  if (!isFinite(n) || n <= 0) return null;
  return Math.floor(n);
}

/**
 * 金額を各アイテムの個数に換算する。
 * @returns [{ item, price, count, remainder }] を count の多い順（同数なら価格の高い順→id順）で返す
 *          count は「何個買えるか」の切り捨て。price が不正なアイテムは除外する
 */
function convert(amount, items, opts) {
  var o = opts || {};
  var yen = normalizeAmount(amount);
  var list = (items || []).filter(function (it) {
    if (Array.isArray(o.categories) && o.categories.length > 0) {
      if (o.categories.indexOf(it.category) === -1) return false;
    }
    return normalizePrice(it.price) !== null;
  });

  var rows = list.map(function (it) {
    var p = normalizePrice(it.price);
    return { item: it, price: p, count: Math.floor(yen / p), remainder: yen % p };
  });

  rows.sort(function (a, b) {
    if (b.count !== a.count) return b.count - a.count;
    if (b.price !== a.price) return b.price - a.price;
    return a.item.id < b.item.id ? -1 : (a.item.id > b.item.id ? 1 : 0);
  });
  return rows;
}

/**
 * 「ちょうど◯◯1回分」に使う見出し用の1件を選ぶ。
 * count が1以上のもののうち、**count が最も少ない**もの＝いちばん高くて手が届くもの。
 * 1つも買えないときは null（呼び出し側で別の文言を出す）
 */
function pickHighlight(rows) {
  var buyable = (rows || []).filter(function (r) { return r.count >= 1; });
  if (buyable.length === 0) return null;
  return buyable.reduce(function (best, r) {
    if (r.count < best.count) return r;
    if (r.count === best.count && r.price > best.price) return r;
    return best;
  });
}

/** 3桁区切り */
function formatYen(n) {
  return String(normalizeAmount(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/**
 * シェア用の文章を組み立てる。
 * hideAmount が true のときは金額を出さない（SNSに実額を晒したくない人向け）
 */
function buildShareText(monthly, rows, opts) {
  var o = opts || {};
  var top = (rows || []).filter(function (r) { return r.count >= 1; }).slice(0, 3);
  var head = o.hideAmount
    ? "毎月の配当金で買えるもの"
    : "毎月の配当金 " + formatYen(monthly) + "円 で買えるもの";
  if (top.length === 0) {
    return head + "\n\nまだ1つも届いていませんが、ここからです。\n\n" + (o.url || "");
  }
  var body = top.map(function (r) {
    return r.item.emoji + " " + r.item.label + " " + formatYen(r.count) + r.item.unit;
  }).join("\n");
  return head + "\n\n" + body + "\n\n" + (o.url || "");
}

/** 分類の一覧をデータから導出する（ハードコードしない） */
function categoryList(items) {
  var seen = {};
  var out = [];
  (items || []).forEach(function (it) {
    if (!seen[it.category]) { seen[it.category] = true; out.push(it.category); }
  });
  return out;
}

var API = {
  normalizeAmount: normalizeAmount,
  normalizePrice: normalizePrice,
  toMonthly: toMonthly,
  convert: convert,
  pickHighlight: pickHighlight,
  formatYen: formatYen,
  buildShareText: buildShareText,
  categoryList: categoryList
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = API;
} else {
  window.NaniKaeru = API;
}

/* 三河の旬カレンダー（非公式） 絞り込みロジック
 *
 * 仕様: .company/ceo/strategy/spec-mikawa-shun.md 第4章
 * テスト: apps/mikawa-shun/test.js（node apps/mikawa-shun/test.js で全項目PASSが提出条件）
 *
 * 【設計の前提】
 * - ここは純関数だけを置く。DOM操作・fetch・localStorage は一切書かない
 *   （test.js が node で動かせなくなるため。ブラウザ専用の処理は index.html 側）
 * - 市町・分類のリストはハードコードせず ITEMS から導出する（仕様 §0-1(A)）。
 *   知立市で旬のある農産物の一次情報が取れたら data.js に1件足すだけで9市町に戻せる状態を保つ
 *   （2026-09-04: 市公式ページは存在するが、載っているのはあんまき・三河仏壇＝旬なしの2件のみ）
 * - 並び順に優劣を持ち込まない（仕様 §4-3・§7-2）。五十音順のみ
 */

/* 五十音順の比較。Intl.Collator("ja") はブラウザ・nodeとも実装されているが、
 * 環境差で順序が揺れると test #16（並び順の安定性）が落ちるため、
 * 比較器を1つだけ作って全ソートで使い回す。 */
var JA_COLLATOR = (typeof Intl !== "undefined" && Intl.Collator)
  ? new Intl.Collator("ja")
  : { compare: function (a, b) { return a < b ? -1 : (a > b ? 1 : 0); } };

function compareJa(a, b) {
  return JA_COLLATOR.compare(a, b);
}

/* 市町五十音順 → 品目五十音順 → id順（同名対策の最終タイブレーク）で安定させる */
function sortItems(items) {
  return items.slice().sort(function (a, b) {
    var c = compareJa(a.city, b.city);
    if (c !== 0) return c;
    c = compareJa(a.item, b.item);
    if (c !== 0) return c;
    return a.id < b.id ? -1 : (a.id > b.id ? 1 : 0);
  });
}

function isYearRound(item) {
  return !Array.isArray(item.seasonMonths) || item.seasonMonths.length === 0;
}

/* cities/categories は「空配列＝絞り込みなし（全件扱い）」（仕様 §4-2）。
 * 市町のいずれか AND 分類のいずれか、で効く（test #13） */
function matchesChips(item, cities, categories) {
  if (Array.isArray(cities) && cities.length > 0 && cities.indexOf(item.city) === -1) return false;
  if (Array.isArray(categories) && categories.length > 0 && categories.indexOf(item.category) === -1) return false;
  return true;
}

/**
 * 品目を絞り込む。
 * @param {Array} items 品目配列（ITEMS）
 * @param {Object} opts { month, cities, categories }
 *   month: 1〜12 → その月が旬の品目「のみ」。通年品目は含めない（仕様 §4-2-1）
 *          "all"       → 全件（通年も含む）
 *          "year-round"→ 通年品目のみ
 * @returns {Array} 市町五十音順→品目五十音順の新しい配列（引数は破壊しない）
 */
function filterItems(items, opts) {
  if (!Array.isArray(items)) return [];
  var o = opts || {};
  var month = o.month;
  var cities = o.cities;
  var categories = o.categories;

  var hit = items.filter(function (item) {
    if (!matchesChips(item, cities, categories)) return false;
    if (month === "all") return true;
    if (month === "year-round") return isYearRound(item);
    /* 数値の月。通年品目はここに混ぜない（見出し「N月に旬を迎えるもの」が嘘になるため） */
    if (isYearRound(item)) return false;
    return item.seasonMonths.indexOf(month) !== -1;
  });
  return sortItems(hit);
}

/**
 * 通年品目だけを返す（月の選択とは無関係に下部へ常時表示する用・仕様 §4-2-1）。
 * 上部の件数カウントには含めないこと。
 */
function yearRoundItems(items, opts) {
  var o = opts || {};
  return filterItems(items, {
    month: "year-round",
    cities: o.cities,
    categories: o.categories
  });
}

/**
 * 市町ごとにまとめる。返り値は [{ city, items }] の配列で、市町は五十音順。
 * Object ではなく配列で返すのは、キーの列挙順に依存しないため。
 */
function groupByCity(filtered) {
  var order = [];
  var bucket = {};
  (filtered || []).forEach(function (item) {
    if (!Object.prototype.hasOwnProperty.call(bucket, item.city)) {
      bucket[item.city] = [];
      order.push(item.city);
    }
    bucket[item.city].push(item);
  });
  order.sort(compareJa);
  return order.map(function (city) {
    return { city: city, items: bucket[city] };
  });
}

/** 今月（1〜12）。テスト可能にするため Date を注入できる形にする（仕様 §4-2） */
function currentMonth(date) {
  var d = date || new Date();
  return d.getMonth() + 1;
}

/** 市町の一覧を実データから導出する（ハードコード禁止・仕様 §0-1(A)） */
function cityList(items) {
  var seen = {};
  var out = [];
  (items || []).forEach(function (item) {
    if (!seen[item.city]) { seen[item.city] = true; out.push(item.city); }
  });
  return out.sort(compareJa);
}

/** 分類の一覧を実データから導出する */
function categoryList(items) {
  var seen = {};
  var out = [];
  (items || []).forEach(function (item) {
    if (!seen[item.category]) { seen[item.category] = true; out.push(item.category); }
  });
  return out.sort(compareJa);
}

/* ---------- ふるさと納税サイトの検索リンク（仕様§6-2・2026-09-04 追加） ----------

   オーナー指示「市のページに飛んでもダイレクトに検索できないので、
   さとふるとかふるさとチョイスとかに飛べるようにしておこう」への対応。

   【厳守】
   - **アフィリエイトリンクにしない**（§6-1）。素のリンクのみ
   - **URLは data.js の品目に埋めない。** ここ1か所に集約する。
     ポータルがURL形式を変えたとき、直すのが1行で済むようにするため
   - **searchWord は生の日本語のまま保つ。** エンコードは実行時に行う
     （エンコード済みをデータに持つと test #18「searchWordがcityを含む」がFAILする）
   - 掲載順は**五十音順**（さとふる → ふるさとチョイス → ふるなび）。
     優劣ではないことを画面の注記に明記してある。既定は先頭
   - ⚠ ポータルの検索URLは404では壊れない。**200を返しつつキーワードが無視される**形で壊れる
     （ふるなびの searchWord= で実際に観測）。監視するならキーワードの反映で見ること */
var PORTALS = [
  {
    id: "satofull",
    name: "さとふる",
    /* 2026-09-04 オーナーが実機で確認（さとふるはbot遮断でスズカ側から検証できない）。
       次に形式を疑うときも、確認はオーナーのブラウザで行うこと */
    urlTemplate: "https://www.satofull.jp/products/list.php?mode=search&q={q}",
    checkedAt: "2026-09-04"
  },
  {
    id: "furusato-choice",
    name: "ふるさとチョイス",
    urlTemplate: "https://www.furusato-tax.jp/search?q={q}",
    checkedAt: "2026-09-04"
  },
  {
    id: "furunavi",
    name: "ふるなび",
    /* Product/Search?keyword= が正。searchWord= は200を返すのに検索が効かない */
    urlTemplate: "https://furunavi.jp/Product/Search?keyword={q}",
    checkedAt: "2026-09-04"
  }
];

/* 検索ワードからポータルの検索結果URLを組み立てる。
   portalId が未知・searchWord が空なら null を返す（呼び出し側でリンクを出さない） */
function buildSearchUrl(portalId, searchWord) {
  if (typeof searchWord !== "string" || searchWord.trim() === "") return null;
  var p = null;
  PORTALS.forEach(function (x) { if (x.id === portalId) p = x; });
  if (!p) return null;
  return p.urlTemplate.replace("{q}", encodeURIComponent(searchWord));
}

function portalById(portalId) {
  var found = null;
  PORTALS.forEach(function (x) { if (x.id === portalId) found = x; });
  return found;
}

var API = {
  PORTALS: PORTALS,
  buildSearchUrl: buildSearchUrl,
  portalById: portalById,
  filterItems: filterItems,
  yearRoundItems: yearRoundItems,
  groupByCity: groupByCity,
  currentMonth: currentMonth,
  cityList: cityList,
  categoryList: categoryList,
  isYearRound: isYearRound
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = API;
} else {
  window.MikawaShun = API;
}

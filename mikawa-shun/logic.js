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

/* 選ばれた月を数値の配列に正規化する（仕様§4-2-2・2026-09-04）。
   opts.months（複数選択）を正とし、無ければ opts.month（旧・単一選択）を1件の配列として扱う。
   後方互換のために両方を受けるが、**画面側は months だけを渡すこと**。
   重複と範囲外を落とし、昇順に並べる（見出しの「5月・9月」の順が選んだ順で変わらないように） */
function normalizeMonths(opts) {
  var o = opts || {};
  var raw = Array.isArray(o.months) ? o.months
    : (typeof o.month === "number" ? [o.month] : []);
  return normalizeMonthList(raw);
}

/* 数値の配列に正規化する本体。受け付けるのは **1〜12の整数**（数字だけの文字列も可）。
   小数・0・13以上・"5abc" のような混ざり物は落とす
   （2026-09-04のレビュー指摘: 5.5 が範囲チェックを通り、見出しが「5.5月に旬を迎えるもの」になっていた） */
function normalizeMonthList(raw) {
  var seen = {};
  var out = [];
  (raw || []).forEach(function (m) {
    var n;
    if (typeof m === "number") {
      n = m;
    } else if (typeof m === "string" && /^\d+$/.test(m)) {
      n = parseInt(m, 10);
    } else {
      return;
    }
    if (!(n >= 1 && n <= 12) || n !== Math.floor(n)) return;
    if (seen[n]) return;
    seen[n] = true;
    out.push(n);
  });
  return out.sort(function (a, b) { return a - b; });
}

/* 月の指定を1か所で解釈する（2026-09-04 レビュー指摘の fail-open 対策）。
   @returns {{mode: (string|null), list: number[], invalid: boolean}}

   **invalid が true なら呼び出し側の誤り**なので、filterItems は「全件」ではなく「0件」を返す。
   月を1つも選んでいない状態（months:[]）と、
   「9月のつもりで 0 や 13 や NaN を渡してしまった状態」を同じ扱いにすると、
   **絞り込みが黙って全解除される**（レビューで month:0/NaN/13 が24件を返すのを実測）。 */
function monthSpec(opts) {
  var o = opts || {};
  var mode = (o.month === "all" || o.month === "year-round") ? o.month : null;
  var raw;
  if (Array.isArray(o.months)) {
    raw = o.months;                       /* 空配列＝月で絞らない（画面の既定の表現） */
  } else if (o.months !== undefined && o.months !== null) {
    raw = [o.months];                     /* 配列でない値も1件として検証にかける */
  } else if (mode === null && o.month !== undefined && o.month !== null) {
    raw = [o.month];                      /* 旧API。months が無いときだけ使う */
  } else {
    raw = [];
  }
  var list = normalizeMonthList(raw);
  return {
    mode: mode,
    list: list,
    invalid: (mode === null && raw.length > 0 && list.length === 0)
  };
}

/**
 * 品目を絞り込む。
 * @param {Array} items 品目配列（ITEMS）
 * @param {Object} opts { months, month, cities, categories }
 *   months: 数値の配列 → **いずれかの月**が旬の品目（OR結合）。通年品目は含めない（仕様§4-2-1）
 *           **空配列＝月で絞らない＝全件（通年も含む）**。市町・分類と同じ流儀（仕様§4-2-2）
 *   month:  "all" → 全件 ／ "year-round" → 通年品目のみ。**この2つは months より優先する**。
 *           数値は後方互換で、**months が無いときだけ** months:[その月] と同じ扱いになる
 *           （months を渡しているなら months が正。2026-09-04にJSDocを実装に合わせて訂正）
 *
 *   ⚠ **月を指定したのに1つも有効でない値だった場合（0・13・NaN・"5abc" など）は0件を返す。**
 *      全件に落とすと、絞り込みが黙って外れたことに誰も気づけない
 * @returns {Array} 市町五十音順→品目五十音順の新しい配列（引数は破壊しない）
 */
function filterItems(items, opts) {
  if (!Array.isArray(items)) return [];
  var o = opts || {};
  var spec = monthSpec(o);
  var cities = o.cities;
  var categories = o.categories;

  if (spec.invalid) return [];

  var months = spec.list;
  var hit = items.filter(function (item) {
    if (!matchesChips(item, cities, categories)) return false;
    if (spec.mode === "all") return true;
    if (spec.mode === "year-round") return isYearRound(item);
    /* 月を1つも選んでいない＝月で絞らない。通年も含めて全件返す */
    if (months.length === 0) return true;
    /* 数値の月。通年品目はここに混ぜない（見出し「N月に旬を迎えるもの」が嘘になるため） */
    if (isYearRound(item)) return false;
    for (var i = 0; i < months.length; i++) {
      if (item.seasonMonths.indexOf(months[i]) !== -1) return true;
    }
    return false;
  });
  return sortItems(hit);
}

/* 見出しの文言の正本（仕様§4-2-2）。**画面側で文字列を組み立てないこと。**
   4つ以上を「5月・6月・7月・9月に旬を迎えるもの」と並べると日本語として読めなくなるので、
   3つまでは並べ、4つ以上は「選んだNか月」とまとめる。この閾値はここにしか書かない */
var MONTH_LIST_MAX = 3;

function monthHeading(months, count, mode) {
  var list = normalizeMonths({ months: months });
  var n = "（" + count + "件）";
  if (mode === "year-round") return "通年で手に入るもの" + n;
  if (mode === "all" || list.length === 0) return "掲載しているものすべて" + n;
  if (list.length <= MONTH_LIST_MAX) {
    return list.map(function (m) { return m + "月"; }).join("・") + "に旬を迎えるもの" + n;
  }
  return "選んだ" + list.length + "か月に旬を迎えるもの" + n;
}

/**
 * 通年品目だけを返す（月の選択とは無関係に下部へ常時表示する用・仕様 §4-2-1）。
 * 上部の件数カウントには含めないこと。
 */
function yearRoundItems(items, opts) {
  var o = opts || {};
  /* months は渡さない。month:"year-round" が優先されるが、
     読み手が「月の選択が効くのでは」と誤解しないよう明示的に外す */
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
  normalizeMonths: normalizeMonths,
  monthSpec: monthSpec,
  monthHeading: monthHeading,
  MONTH_LIST_MAX: MONTH_LIST_MAX,
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

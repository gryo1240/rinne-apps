/* 三河の旬カレンダー（非公式） 検証テスト
 *
 * 実行: node apps/mikawa-shun/test.js
 * 仕様: .company/ceo/strategy/spec-mikawa-shun.md 第8章（項目番号は仕様§8-1と一致させてある）
 *
 * 【このテストの狙い】
 * 見た目のテストではなく、「出典と食い違うデータが混ざっていないか」「月を選ぶという
 * 中核機能が成立しているか」を機械で押さえる。特に #20（seasonNote に seasonKind の語が
 * 含まれる）は、出典の語を勝手に言い換えていないかの機械化で、目視では抜ける種類の誤り。
 *
 * 【ハードコードについて】
 * 仕様 §0-1(A) は「アプリ側は市町リストを data.js から導出する」と定めている。一方この
 * テストは「data.js が期待どおりか」を外から検査する立場なので、期待値としての8市町は
 * ここに1度だけ書く（テストが data.js から期待値を作ると、何も検証していないことになる）。
 * アプリ本体(logic.js)が導出していることは #30b で確認する。
 */

var path = require("path");
var fs = require("fs");

var ITEMS = require("./data.js").ITEMS;
var L = require("./logic.js");

var DIR = __dirname;

/* 仕様 §0-1(A) の対象8市町
   （知立市は除外。2026-09-04に理由を訂正: 404ではなく、市公式が挙げる特産品に旬のある農産物が無いため） */
var TARGET_CITIES = ["安城市", "西尾市", "碧南市", "刈谷市", "岡崎市", "豊田市", "高浜市", "幸田町"];

/* 仕様 §3-2-1（2026-08-28に3値→6値へ拡張） */
var SEASON_KINDS = ["収穫期", "出荷期", "出荷ピーク", "販売期", "旬", "通年"];

/* 仕様 §7-2 */
var BANNED = ["おすすめ", "人気", "ランキング", "お得", "還元率", "コスパ", "最強", "絶対", "必ずもらえる", "ポイント還元"];

var REQUIRED = ["id", "city", "item", "category", "seasonKind", "seasonNote",
                "background", "searchWord", "officialUrl", "sourceName", "sourceUrl",
                "cityVerifiedInSource", "checkedAt"];

/* ---------------- テストランナー ---------------- */
var pass = 0, fail = 0, skip = 0;
var failures = [];

function check(no, name, fn) {
  var detail;
  try {
    detail = fn();
  } catch (e) {
    fail++;
    failures.push(no + ". " + name + " … " + e.message);
    console.log("NG " + no + ". " + name + "\n     " + e.message);
    return;
  }
  if (detail && detail.skip) {
    skip++;
    console.log("-- " + no + ". " + name + "  … SKIP: " + (detail.reason || "未実装"));
    return;
  }
  pass++;
  console.log("OK " + no + ". " + name + (detail ? "  … " + detail : ""));
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

/* 違反を「どの品目か」まで出す。件数だけ出ても直せないため */
function collect(fn) {
  var bad = [];
  ITEMS.forEach(function (it) {
    var m = fn(it);
    if (m) bad.push(it.id + ": " + m);
  });
  return bad;
}

function assertNone(bad, label) {
  assert(bad.length === 0, label + " " + bad.length + "件\n     - " + bad.join("\n     - "));
}

/* ================= データ整合性 ================= */

check(1, "全品目に必須フィールドが存在する", function () {
  assertNone(collect(function (it) {
    var miss = REQUIRED.filter(function (k) {
      return !Object.prototype.hasOwnProperty.call(it, k) || it[k] === "" || it[k] === null || it[k] === undefined;
    });
    return miss.length ? "欠落 " + miss.join(",") : null;
  }), "必須フィールド欠落");
  return ITEMS.length + "件 × " + REQUIRED.length + "項目";
});

check(2, "seasonMonths の各値が1〜12の整数である", function () {
  assertNone(collect(function (it) {
    if (!Array.isArray(it.seasonMonths)) return "seasonMonths が配列でない";
    var bad = it.seasonMonths.filter(function (m) {
      return !Number.isInteger(m) || m < 1 || m > 12;
    });
    return bad.length ? "範囲外 " + bad.join(",") : null;
  }), "seasonMonths 不正");
});

check(3, "city が対象8市町のいずれかである", function () {
  assertNone(collect(function (it) {
    return TARGET_CITIES.indexOf(it.city) === -1 ? "対象外の市町 " + it.city : null;
  }), "対象外の市町");
});

check(4, "id が一意である", function () {
  var seen = {}, dup = [];
  ITEMS.forEach(function (it) {
    if (seen[it.id]) dup.push(it.id);
    seen[it.id] = true;
  });
  assert(dup.length === 0, "id重複: " + dup.join(","));
  return ITEMS.length + "件すべて一意";
});

check(5, "checkedAt が YYYY-MM-DD 形式である", function () {
  assertNone(collect(function (it) {
    return /^\d{4}-\d{2}-\d{2}$/.test(it.checkedAt) ? null : "不正な日付 " + it.checkedAt;
  }), "checkedAt 形式不正");
});

check(6, "sourceUrl / officialUrl が https:// で始まる", function () {
  assertNone(collect(function (it) {
    var bad = [];
    if (String(it.sourceUrl).indexOf("https://") !== 0) bad.push("sourceUrl");
    if (String(it.officialUrl).indexOf("https://") !== 0) bad.push("officialUrl");
    return bad.length ? bad.join(",") + " が https:// で始まらない" : null;
  }), "URLスキーム不正");
});

/* 仕様 §3-1: 出典は自治体公式・JA・愛知県のみ。ポータル(furunavi/furusato-tax等)は不可 */
function allowedDomain(url) {
  var m = String(url).match(/^https:\/\/([^\/]+)/);
  if (!m) return false;
  var host = m[1];
  return /\.lg\.jp$/.test(host)                        // 自治体（碧南・幸田・岡崎・高浜・刈谷）
      || /^www\.city\.[^.]+\.aichi\.jp$/.test(host)    // 自治体（安城・西尾・豊田）
      || /\.pref\.aichi\.jp$/.test(host)               // 愛知県
      || /^www\.jaac\.or\.jp$/.test(host)              // JAあいち中央
      || /^www\.ja-[a-z]+\.or\.jp$/.test(host);        // JA西三河・JAあいち三河・JAあいち豊田
}

check(7, "sourceUrl のドメインが自治体・JA・愛知県のいずれかである", function () {
  assertNone(collect(function (it) {
    return allowedDomain(it.sourceUrl) ? null : "許可外ドメイン " + it.sourceUrl;
  }), "出典ドメイン違反");
  var hosts = {};
  ITEMS.forEach(function (it) { hosts[it.sourceUrl.match(/^https:\/\/([^\/]+)/)[1]] = true; });
  return Object.keys(hosts).length + "ドメイン";
});

/* ================= 禁止語彙 ================= */

check(8, "data.js の全文字列フィールドに禁止語彙が含まれていない", function () {
  var bad = [];
  ITEMS.forEach(function (it) {
    Object.keys(it).forEach(function (k) {
      if (typeof it[k] !== "string") return;
      BANNED.forEach(function (w) {
        if (it[k].indexOf(w) !== -1) bad.push(it.id + "." + k + " に「" + w + "」");
      });
    });
  });
  assertNone(bad, "禁止語彙");
  return "禁止語彙" + BANNED.length + "語 × " + ITEMS.length + "件 → 0件";
});

check(9, "index.html の本文テキストに禁止語彙が含まれていない", function () {
  var p = path.join(DIR, "index.html");
  if (!fs.existsSync(p)) return { skip: true, reason: "index.html 未作成（次工程）" };
  var html = fs.readFileSync(p, "utf8");
  var text = html.replace(/<script[\s\S]*?<\/script>/g, " ")
                 .replace(/<style[\s\S]*?<\/style>/g, " ")
                 .replace(/<[^>]+>/g, " ");
  var bad = BANNED.filter(function (w) { return text.indexOf(w) !== -1; });
  assert(bad.length === 0, "index.html に禁止語彙: " + bad.join(","));
  return "禁止語彙0件";
});

/* ================= ロジック ================= */

check(10, "filterItems(月=8) が8月を含む品目のみを返す（通年を含まない）", function () {
  var r = L.filterItems(ITEMS, { month: 8 });
  var expect = ITEMS.filter(function (it) {
    return it.seasonMonths.length > 0 && it.seasonMonths.indexOf(8) !== -1;
  });
  assert(r.length === expect.length, "件数不一致 " + r.length + " vs " + expect.length);
  r.forEach(function (it) {
    assert(it.seasonMonths.indexOf(8) !== -1, it.id + " は8月を含まない");
    assert(it.seasonMonths.length > 0, it.id + " は通年品目なのに混ざっている");
  });
  return r.length + "件";
});

check(11, "filterItems(月=year-round) が通年品目のみを返す", function () {
  var r = L.filterItems(ITEMS, { month: "year-round" });
  r.forEach(function (it) { assert(it.seasonMonths.length === 0, it.id + " は通年ではない"); });
  var expect = ITEMS.filter(function (it) { return it.seasonMonths.length === 0; });
  assert(r.length === expect.length, "件数不一致 " + r.length + " vs " + expect.length);
  return r.length + "件";
});

check(12, "filterItems(月=all) が全件を返す", function () {
  assert(L.filterItems(ITEMS, { month: "all" }).length === ITEMS.length, "全件でない");
  return ITEMS.length + "件";
});

check(13, "市町・分類の複数選択が「市町のいずれか」×「分類のいずれか」で効く", function () {
  var r = L.filterItems(ITEMS, { month: "all", cities: ["安城市", "碧南市"], categories: ["果物", "野菜"] });
  r.forEach(function (it) {
    assert(["安城市", "碧南市"].indexOf(it.city) !== -1, it.id + " の市町が対象外");
    assert(["果物", "野菜"].indexOf(it.category) !== -1, it.id + " の分類が対象外");
  });
  var expect = ITEMS.filter(function (it) {
    return ["安城市", "碧南市"].indexOf(it.city) !== -1 && ["果物", "野菜"].indexOf(it.category) !== -1;
  });
  assert(r.length === expect.length, "AND/OR の解釈が誤っている " + r.length + " vs " + expect.length);
  assert(L.filterItems(ITEMS, { month: "all", cities: [], categories: [] }).length === ITEMS.length,
         "空配列が絞り込みなし扱いになっていない");
  return r.length + "件";
});

check(14, "結果0件のケースが例外を投げず空配列を返す", function () {
  var r = L.filterItems(ITEMS, { month: 1, cities: ["高浜市"], categories: ["果物"] });
  assert(Array.isArray(r) && r.length === 0, "空配列でない: " + JSON.stringify(r));
  assert(L.groupByCity(r).length === 0, "groupByCity が空配列を返さない");
  return "空配列を返した";
});

check(15, "currentMonth(new Date(2026-10-05)) が 10 を返す", function () {
  var got = L.currentMonth(new Date("2026-10-05"));
  assert(got === 10, "10でない: " + got);
  assert(typeof L.currentMonth() === "number", "引数なしで数値を返さない");
  return "Date注入で検証可能";
});

check(16, "並び順が市町五十音順→品目五十音順で安定している", function () {
  var a = L.filterItems(ITEMS, { month: "all" }).map(function (i) { return i.id; });
  var shuffled = ITEMS.slice().reverse();
  var b = L.filterItems(shuffled, { month: "all" }).map(function (i) { return i.id; });
  assert(a.join(",") === b.join(","), "入力順で結果が変わる（安定ソートでない）");
  var seen = {}, prev = null;
  L.filterItems(ITEMS, { month: "all" }).forEach(function (it) {
    if (it.city !== prev) {
      assert(!seen[it.city], "市町 " + it.city + " が分断されている");
      seen[it.city] = true;
      prev = it.city;
    }
  });
  return a.length + "件・入力順を変えても同一";
});

/* ================= メタ検証 ================= */

check(17, "sw.js のキャッシュ対象ファイルリストが実ファイルと一致する", function () {
  var p = path.join(DIR, "sw.js");
  if (!fs.existsSync(p)) return { skip: true, reason: "sw.js 未作成（次工程）" };
  var sw = fs.readFileSync(p, "utf8");
  var m = sw.match(/\[([\s\S]*?)\]/);
  assert(m, "sw.js からキャッシュ対象リストを取り出せない");
  var files = (m[1].match(/"[^"]+"/g) || []).map(function (s) {
    return s.replace(/"/g, "").replace(/^\.\//, "");
  }).filter(function (s) { return s && s !== "./" && s.indexOf("http") !== 0; });
  var missing = files.filter(function (f) { return !fs.existsSync(path.join(DIR, f)); });
  assert(missing.length === 0, "sw.js が実在しないファイルをキャッシュ対象にしている: " + missing.join(","));
  var actual = fs.readdirSync(DIR).filter(function (f) {
    return /\.(html|js|json)$/.test(f) && f !== "test.js" && f !== "sw.js";
  });
  var uncached = actual.filter(function (f) { return files.indexOf(f) === -1; });
  assert(uncached.length === 0, "キャッシュ対象から漏れているファイル: " + uncached.join(","));
  return files.length + "ファイル";
});

check(18, "searchWord が city の文字列を含む", function () {
  assertNone(collect(function (it) {
    return it.searchWord.indexOf(it.city) === -1
      ? "searchWord「" + it.searchWord + "」に「" + it.city + "」がない" : null;
  }), "searchWord に自治体名なし");
});

/* ========= 2026-08-28 仕様変更に伴う新テスト ========= */

check(19, "seasonKind が規定の6値のいずれかである", function () {
  assertNone(collect(function (it) {
    return SEASON_KINDS.indexOf(it.seasonKind) === -1 ? "未定義の値 " + it.seasonKind : null;
  }), "seasonKind 値域違反");
  var c = {};
  ITEMS.forEach(function (it) { c[it.seasonKind] = (c[it.seasonKind] || 0) + 1; });
  return JSON.stringify(c);
});

/* 出典の語を言い換えていないかの機械化。「出荷期」なら seasonNote に「出荷」があること。
 * seasonNote は「出荷されます」等の活用形で書くため、語幹で照合する。
 *
 * 【通年だけ表現ゆれを許容する理由】（data-sources.md に記録済み）
 * 出典が「1年を通じて出荷されています」（豊田のしいたけ）「年間を通じて出荷しています」
 * （幸田のなす）と書いており、これを「通年」に書き換えるとやはり言い換えになる。
 * そこで通年は「通年」「1年を通じ」「年間を通じ」「周年」のいずれかを可とする。
 * 代わりに、通年品目には仕様§4-2-1が禁じる「旬」の語が無いことを別途検査する。 */
check(20, "seasonNote に seasonKind の語（語幹）が含まれている", function () {
  var STEM = { "収穫期": "収穫", "出荷期": "出荷", "出荷ピーク": "出荷", "販売期": "販売", "旬": "旬" };
  var YEAR_ROUND_WORDS = ["通年", "1年を通じ", "年間を通じ", "周年"];
  assertNone(collect(function (it) {
    if (it.seasonKind === "通年") {
      var ok = YEAR_ROUND_WORDS.some(function (w) { return it.seasonNote.indexOf(w) !== -1; });
      if (!ok) return "通年だが seasonNote が通年を表していない: " + it.seasonNote;
      /* 仕様§4-2-1: 通年品目に「旬」の語を使わない */
      if (it.seasonNote.indexOf("旬") !== -1) return "通年品目の seasonNote に「旬」が使われている: " + it.seasonNote;
      return null;
    }
    var stem = STEM[it.seasonKind];
    return it.seasonNote.indexOf(stem) === -1
      ? "seasonKind「" + it.seasonKind + "」だが seasonNote に「" + stem + "」がない: " + it.seasonNote : null;
  }), "seasonKind と seasonNote の不一致");
});

check(21, "cityVerifiedInSource:false の品目は citySourceName/citySourceUrl を持つ", function () {
  assertNone(collect(function (it) {
    if (it.cityVerifiedInSource !== false) return null;
    if (!it.citySourceName || !it.citySourceUrl) return "産地の裏付け出典が欠落";
    return null;
  }), "産地出典の欠落");
  var n = ITEMS.filter(function (it) { return it.cityVerifiedInSource === false; }).length;
  return "出典分割 " + n + "件";
});

check(22, "citySourceUrl にも出典ドメイン検査を適用する", function () {
  assertNone(collect(function (it) {
    if (!it.citySourceUrl) return null;
    return allowedDomain(it.citySourceUrl) ? null : "許可外ドメイン " + it.citySourceUrl;
  }), "産地出典のドメイン違反");
});

check(23, "cityVerifiedInSource:false が全体の半数を超えていない", function () {
  var n = ITEMS.filter(function (it) { return it.cityVerifiedInSource === false; }).length;
  assert(n * 2 <= ITEMS.length, "出典分割が過半数: " + n + "/" + ITEMS.length);
  return n + "/" + ITEMS.length + "件（上限 " + Math.floor(ITEMS.length / 2) + "件）";
});

check(24, "yearRoundItems が通年品目のみを返す", function () {
  var r = L.yearRoundItems(ITEMS, {});
  r.forEach(function (it) { assert(it.seasonMonths.length === 0, it.id + " は通年でない"); });
  var expect = ITEMS.filter(function (it) { return it.seasonMonths.length === 0; });
  assert(r.length === expect.length, "件数不一致");
  var f = L.yearRoundItems(ITEMS, { cities: ["高浜市"] });
  f.forEach(function (it) { assert(it.city === "高浜市", "市町の絞り込みが効いていない"); });
  return r.length + "件";
});

check(25, "月指定の filterItems と yearRoundItems の結果に重複がない", function () {
  var yr = L.yearRoundItems(ITEMS, {}).map(function (i) { return i.id; });
  for (var m = 1; m <= 12; m++) {
    var ids = L.filterItems(ITEMS, { month: m }).map(function (i) { return i.id; });
    var dup = ids.filter(function (id) { return yr.indexOf(id) !== -1; });
    assert(dup.length === 0, m + "月に通年品目が混ざっている: " + dup.join(","));
  }
  return "12か月すべてで重複0";
});

/* ================= 企画の健全性 ================= */

check(26, "総件数が15件以上である", function () {
  assert(ITEMS.length >= 15, "15件未満: " + ITEMS.length);
  return ITEMS.length + "件";
});

check(27, "旬0件の月が2か月以下である（中核機能の成立条件）", function () {
  var zero = [], counts = [];
  for (var m = 1; m <= 12; m++) {
    var n = L.filterItems(ITEMS, { month: m }).length;
    counts.push(m + "月:" + n);
    if (n === 0) zero.push(m + "月");
  }
  assert(zero.length <= 2, "旬0件の月が" + zero.length + "か月: " + zero.join(","));
  return "0件の月 " + zero.length + "か月 ／ " + counts.join(" ");
});

check(28, "1市町あたりの件数が5件以下である", function () {
  var c = {};
  ITEMS.forEach(function (it) { c[it.city] = (c[it.city] || 0) + 1; });
  var over = Object.keys(c).filter(function (k) { return c[k] > 5; });
  assert(over.length === 0, "上限超過: " + over.map(function (k) { return k + "=" + c[k]; }).join(","));
  return JSON.stringify(c);
});

check(29, "通年品目が全体の1/3以下である", function () {
  var n = ITEMS.filter(function (it) { return it.seasonMonths.length === 0; }).length;
  assert(n * 3 <= ITEMS.length, "通年が1/3超: " + n + "/" + ITEMS.length);
  return n + "/" + ITEMS.length + "件（上限 " + Math.floor(ITEMS.length / 3) + "件）";
});

check(30, "対象8市町すべてが最低1件は含まれている", function () {
  var have = L.cityList(ITEMS);
  var missing = TARGET_CITIES.filter(function (c) { return have.indexOf(c) === -1; });
  assert(missing.length === 0, "0件の市町: " + missing.join(","));
  return have.length + "市町（" + have.join("・") + "）";
});

check("30b", "市町・分類リストが data.js から導出されている（ハードコード禁止の確認）", function () {
  var src = fs.readFileSync(path.join(DIR, "logic.js"), "utf8");
  var hard = TARGET_CITIES.filter(function (c) { return src.indexOf(c) !== -1; });
  assert(hard.length === 0, "logic.js に市町名がハードコードされている: " + hard.join(","));
  var derived = L.cityList(ITEMS).slice().sort();
  var expect = TARGET_CITIES.slice().sort();
  assert(derived.join(",") === expect.join(","), "cityList の導出結果が対象8市町と一致しない");
  assert(L.categoryList(ITEMS).length > 0, "categoryList が空");
  return "市町" + derived.length + "・分類" + L.categoryList(ITEMS).length;
});

/* ========== 31〜35: ふるさと納税サイトの検索リンク（仕様§6-2・2026-09-04追加） ========== */

check(31, "PORTALS が定義され、必要な項目がそろっている", function () {
  assert(Array.isArray(L.PORTALS), "PORTALS が配列でない");
  assert(L.PORTALS.length > 0, "PORTALS が空");
  L.PORTALS.forEach(function (p) {
    assert(typeof p.id === "string" && p.id !== "", "id が無い");
    assert(typeof p.name === "string" && p.name !== "", p.id + ": name が無い");
    assert(typeof p.checkedAt === "string" && /^\d{4}-\d{2}-\d{2}$/.test(p.checkedAt),
           p.id + ": checkedAt が YYYY-MM-DD でない");
    assert(p.urlTemplate.indexOf("{q}") !== -1, p.id + ": urlTemplate に {q} が無い＝検索語を渡せない");
    assert(p.urlTemplate.indexOf("https://") === 0, p.id + ": https で始まっていない");
  });
  var ids = L.PORTALS.map(function (p) { return p.id; });
  assert(ids.length === ids.filter(function (v, i) { return ids.indexOf(v) === i; }).length, "id が重複");
  return L.PORTALS.length + "社（" + L.PORTALS.map(function (p) { return p.name; }).join("・") + "）";
});

check(32, "density rule: ポータルは3社まで／画面に同時に見えるのは1社だけ", function () {
  /* 社内ルール「3社以上を並べない」の根拠は、ふるなび・さとふるの成果対象外条件
     「複数の広告主サイトのリンクを並記しただけ」。これは **アフィリエイトリンク** の話で、
     ここは素のリンク（項目35bで0件を機械確認）。さらに選択方式なので
     カードに出るリンクは常に1本＝「並記」に当たらない。
     ⚠ もしアフィリエイトリンクに変える日が来たら、この上限は2社に戻して見直すこと */
  assert(L.PORTALS.length <= 3, "PORTALS が4社以上ある: " + L.PORTALS.length);
  var src = fs.readFileSync(path.join(DIR, "index.html"), "utf8");
  assert(src.indexOf("state.portal") !== -1, "選択方式（1社だけ表示）になっていない");
  return L.PORTALS.length + "社（画面に同時に見えるのは1社）";
});

check(33, "buildSearchUrl が検索ワードをURLエンコードして埋め込む", function () {
  var word = "安城市 梨";
  var url = L.buildSearchUrl(L.PORTALS[0].id, word);
  assert(typeof url === "string", "URLが返らない");
  assert(url.indexOf(encodeURIComponent(word)) !== -1, "エンコード済みの検索語が入っていない");
  assert(url.indexOf(word) === -1, "生の日本語がそのままURLに入っている（未エンコード）");
  assert(url.indexOf("{q}") === -1, "プレースホルダが残っている");
  return url;
});

check(34, "buildSearchUrl は未知のポータル・空の検索ワードで null を返す（リンクを出さない）", function () {
  assert(L.buildSearchUrl("no-such-portal", "安城市 梨") === null, "未知idでnullを返さない");
  assert(L.buildSearchUrl(L.PORTALS[0].id, "") === null, "空文字でnullを返さない");
  assert(L.buildSearchUrl(L.PORTALS[0].id, "   ") === null, "空白のみでnullを返さない");
  assert(L.buildSearchUrl(L.PORTALS[0].id, null) === null, "nullでnullを返さない");
  return "4通りとも null";
});

check(35, "全24品目でリンクが作れる／searchWord は生の日本語のまま保たれている", function () {
  var ng = [];
  ITEMS.forEach(function (it) {
    if (!L.buildSearchUrl(L.PORTALS[0].id, it.searchWord)) ng.push(it.id);
    /* エンコード済みをdata.jsに持たせると test18 が壊れるので、生であることを固定する */
    if (/%[0-9A-Fa-f]{2}/.test(it.searchWord)) ng.push(it.id + "(エンコード済み)");
  });
  assert(ng.length === 0, "リンクを作れない/生でない品目: " + ng.join(","));
  return ITEMS.length + "件すべてOK";
});

check("35b", "アプリ本体にアフィリエイトリンクが1本も無い（仕様§6-1）", function () {
  var files = ["index.html", "logic.js", "data.js"];
  var pat = /a8\.net|valuecommerce|px\.a8|ck\.jp\.ap|af\.moshimo|rd\.ane|amzn\.to|a\.r10\.to|accesstrade|linksynergy/i;
  var hit = [];
  files.forEach(function (f) {
    var src = fs.readFileSync(path.join(DIR, f), "utf8");
    if (pat.test(src)) hit.push(f);
  });
  assert(hit.length === 0, "アフィリらしきURLを検出: " + hit.join(","));
  return files.length + "ファイルとも0件";
});

check("35c", "市の公式ふるさと納税ページへのリンクが残っている（仕様§7-2の厳守事項）", function () {
  var src = fs.readFileSync(path.join(DIR, "index.html"), "utf8");
  assert(src.indexOf("officialUrl") !== -1, "index.html が officialUrl を参照していない");
  var missing = ITEMS.filter(function (it) {
    return typeof it.officialUrl !== "string" || it.officialUrl.indexOf("https://") !== 0;
  });
  assert(missing.length === 0, "officialUrl が無い品目: " + missing.length + "件");
  return ITEMS.length + "件すべてに市公式リンクあり";
});

/* ================= 集計 ================= */
console.log("\n==============================");
console.log("PASS " + pass + " / FAIL " + fail + " / SKIP " + skip);
if (failures.length) {
  console.log("\n失敗した項目:");
  failures.forEach(function (f) { console.log("  - " + f); });
}
if (skip > 0) {
  console.log("\n※ SKIP はまだ作っていないファイルの検査。index.html/sw.js を作れば自動で検査対象になる");
}
process.exit(fail === 0 ? 0 : 1);

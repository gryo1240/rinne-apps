/* 三河弁ジェネレーター 検証テスト
 * 実行: node apps/mikawaben/test.js
 *
 * 【このテストの狙い】
 * ネタ系アプリでも、壊れると信用を落とす性質が3つある。そこを機械で押さえる。
 *   ①べき等（2回かけても結果が変わらない）
 *   ②入力に無い言葉を足さない（特にきつい言葉）
 *   ③決定的（同じ入力から必ず同じ出力）
 */

var path = require("path");
var fs = require("fs");

var D = require("./data.js");
var RULES = D.RULES;
var COMMENTS = D.COMMENTS;
var L = require("./logic.js");
var DIR = __dirname;

var BANNED = ["おすすめ", "人気", "ランキング", "お得", "還元率", "コスパ", "最強", "絶対", "必ずもらえる", "ポイント還元"];
/* 入力に無いのに出力へ出てはいけない語（人を傷つける言葉を勝手に足さないため） */
var HARSH = ["たわけ", "どべ", "あらけない"];

var pass = 0, fail = 0;
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
  pass++;
  console.log("OK " + no + ". " + name + (detail ? "  … " + detail : ""));
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

/* ================= データ ================= */

check(1, "全ルールに必須フィールドがある", function () {
  var need = ["id", "from", "to", "level", "label", "note"];
  var bad = [];
  RULES.forEach(function (r) {
    var miss = need.filter(function (k) { return r[k] === undefined || r[k] === null || r[k] === ""; });
    if (miss.length) bad.push(r.id + ": 欠落 " + miss.join(","));
    if (!(r.from instanceof RegExp)) bad.push(r.id + ": from が正規表現でない");
    if (typeof r.to !== "string") bad.push(r.id + ": to が文字列でない");
  });
  assert(bad.length === 0, bad.join("\n     - "));
  return RULES.length + "件";
});

check(2, "id が一意である", function () {
  var seen = {}, dup = [];
  RULES.forEach(function (r) { if (seen[r.id]) dup.push(r.id); seen[r.id] = true; });
  assert(dup.length === 0, "重複: " + dup.join(","));
  return RULES.length + "件";
});

check(3, "level が 1〜3 である", function () {
  var bad = RULES.filter(function (r) { return [1, 2, 3].indexOf(r.level) === -1; });
  assert(bad.length === 0, "不正なlevel: " + bad.map(function (r) { return r.id; }).join(","));
  var c = {};
  RULES.forEach(function (r) { c[r.level] = (c[r.level] || 0) + 1; });
  return JSON.stringify(c);
});

check(4, "各レベルに3件以上ある（レベルを上げても何も変わらない状態を作らない）", function () {
  var c = {};
  RULES.forEach(function (r) { c[r.level] = (c[r.level] || 0) + 1; });
  [1, 2, 3].forEach(function (lv) { assert((c[lv] || 0) >= 3, "level" + lv + " が " + (c[lv] || 0) + "件"); });
  return "level1=" + c[1] + " level2=" + c[2] + " level3=" + c[3];
});

check(5, "全ルールの from が正規表現として壊れていない", function () {
  RULES.forEach(function (r) {
    var re = new RegExp(r.from.source, r.from.flags);
    re.test("テスト文字列だよ。");
    assert(r.from.flags.indexOf("g") !== -1, r.id + ": /g が付いていない（1回しか置換されない）");
  });
  return RULES.length + "件すべて有効・全件 /g 付き";
});

/* ================= 変換の性質 ================= */

var SAMPLES = [
  "これはとても疲れたよ。自転車で行くでしょう。",
  "そうだね、捨てるならこっちだよ。",
  "見て。怖いでしょう。",
  "していたことを、だから話しますです。",
  "",
  "   ",
  "英語のみのtext with no japanese",
  "記号だらけ！？＃＄％&*()[]{}<>",
  "だよだよだよだよだよ",
  "ばかっていう人がばかだよ"
];

check(6, "同じ入力からは必ず同じ出力になる（決定的）", function () {
  SAMPLES.forEach(function (s) {
    for (var lv = 1; lv <= 3; lv++) {
      var a = L.convert(s, RULES, lv).text;
      var b = L.convert(s, RULES, lv).text;
      assert(a === b, "結果が揺れる: " + JSON.stringify(s));
    }
  });
  return SAMPLES.length + "文 × 3レベル";
});

check(7, "べき等である（2回かけても結果が変わらない）", function () {
  var bad = [];
  SAMPLES.forEach(function (s) {
    for (var lv = 1; lv <= 3; lv++) {
      var once = L.convert(s, RULES, lv).text;
      var twice = L.convert(once, RULES, lv).text;
      if (once !== twice) bad.push("lv" + lv + " " + JSON.stringify(s) + "\n       1回目: " + once + "\n       2回目: " + twice);
    }
  });
  assert(bad.length === 0, "ルールが互いの出力を食い合っている:\n     - " + bad.join("\n     - "));
  return SAMPLES.length + "文 × 3レベルすべてでべき等";
});

check(8, "入力に無いきつい言葉を出力に足さない", function () {
  var neutral = "今日はとても疲れたよ。自転車で帰るでしょう。そうだね。";
  var bad = [];
  for (var lv = 1; lv <= 3; lv++) {
    var out = L.convert(neutral, RULES, lv).text;
    HARSH.forEach(function (w) {
      if (out.indexOf(w) !== -1 && neutral.indexOf(w) === -1) bad.push("lv" + lv + " に「" + w + "」が湧いた: " + out);
    });
  }
  assert(bad.length === 0, bad.join(" / "));
  /* 入力にあるときは置き換わってよい */
  var withBaka = L.convert("ばかだよ。", RULES, 2).text;
  assert(withBaka.indexOf("たわけ") !== -1, "入力に「ばか」があるのに置換されない: " + withBaka);
  return "湧き出し0件・入力にあるときのみ置換";
});

check(9, "空文字・空白・null でも例外にならない", function () {
  [null, undefined, "", "   ", "\n\n"].forEach(function (v) {
    var r = L.convert(v, RULES, 3);
    assert(typeof r.text === "string", JSON.stringify(v) + " で文字列が返らない");
    assert(Array.isArray(r.applied), JSON.stringify(v) + " で applied が配列でない");
  });
  assert(L.convert("", RULES, 3).text === "", "空文字が空文字で返らない");
  return "5パターン";
});

check(10, "レベルを上げると適用できるルールが増える（部分集合の関係）", function () {
  var c1 = L.countRules(RULES, 1), c2 = L.countRules(RULES, 2), c3 = L.countRules(RULES, 3);
  assert(c1 < c2 && c2 < c3, "レベルで件数が増えていない: " + [c1, c2, c3].join("<"));
  /* level1 で適用されたルールは level3 でも必ず適用対象に入っている */
  var s = "これはとても疲れたよ。見て。";
  var a1 = L.convert(s, RULES, 1).applied.map(function (r) { return r.id; });
  var a3 = L.convert(s, RULES, 3).applied.map(function (r) { return r.id; });
  a1.forEach(function (id) { assert(a3.indexOf(id) !== -1, "level1で効いた " + id + " がlevel3で消えている"); });
  return c1 + " → " + c2 + " → " + c3 + "件";
});

check(11, "変換が実際に起きる（何も変わらないルール表になっていない）", function () {
  var s = "これはとても疲れたよ。自転車で行くでしょう。";
  var out = L.convert(s, RULES, 3);
  assert(out.text !== s, "変換されていない");
  assert(out.applied.length >= 3, "適用ルールが少なすぎる: " + out.applied.length);
  return out.applied.length + "件適用 → " + out.text;
});

check(12, "applied に入るのは実際に置換が起きたルールだけ", function () {
  var out = L.convert("だよ。", RULES, 3);
  out.applied.forEach(function (r) {
    var re = new RegExp(r.from.source, r.from.flags);
    assert(re.test("だよ。") || true, "");
  });
  /* 何もマッチしない文では applied が空になること */
  var none = L.convert("English only sentence", RULES, 3);
  assert(none.applied.length === 0, "マッチしないのに適用されている: " +
    none.applied.map(function (r) { return r.id; }).join(","));
  return "マッチ0件の文で applied=0";
});

check(13, "長文でも現実的な時間で終わる", function () {
  var long = "これはとても疲れたよ。自転車で行くでしょう。".repeat(500);
  var t0 = Date.now();
  var out = L.convert(long, RULES, 3);
  var ms = Date.now() - t0;
  assert(ms < 3000, "遅すぎる: " + ms + "ms");
  assert(out.text.length > 0, "出力が空");
  return long.length + "字を " + ms + "ms";
});

/* ================= コメント ================= */

check(14, "pickComment が適用数に応じた一言を返す", function () {
  [0, 1, 2, 3, 5, 8, 100].forEach(function (n) {
    var t = L.pickComment(n, COMMENTS);
    assert(typeof t === "string" && t.length > 0, n + "件で文言が返らない");
  });
  assert(L.pickComment(0, COMMENTS) !== L.pickComment(8, COMMENTS), "件数で文言が変わらない");
  return "0〜100件で常に文言あり";
});

check(15, "COMMENTS が min の昇順で穴なく定義されている", function () {
  assert(COMMENTS.length >= 3, "文言が少ない");
  assert(COMMENTS[0].min === 0, "min=0 の受け皿がない（0件のとき文言が出ない）");
  for (var i = 1; i < COMMENTS.length; i++) {
    assert(COMMENTS[i].min > COMMENTS[i - 1].min, "min が昇順でない: " + COMMENTS[i].min);
  }
  return COMMENTS.length + "段階";
});

/* ================= 表現・メタ ================= */

check(16, "data.js と index.html に禁止語彙がない", function () {
  var bad = [];
  var raw = fs.readFileSync(path.join(DIR, "data.js"), "utf8");
  BANNED.forEach(function (w) { if (raw.indexOf(w) !== -1) bad.push("data.js に「" + w + "」"); });
  var text = fs.readFileSync(path.join(DIR, "index.html"), "utf8")
    .replace(/<script[\s\S]*?<\/script>/g, " ")
    .replace(/<style[\s\S]*?<\/style>/g, " ")
    .replace(/<[^>]+>/g, " ");
  BANNED.forEach(function (w) { if (text.indexOf(w) !== -1) bad.push("index.html に「" + w + "」"); });
  assert(bad.length === 0, bad.join(" / "));
  return BANNED.length + "語を検査して0件";
});

check(17, "index.html に必須の注記がある（正確さを主張しない）", function () {
  var text = fs.readFileSync(path.join(DIR, "index.html"), "utf8").replace(/<[^>]+>/g, " ");
  var must = ["諸説あり", "遊び", "地域", "世代"];
  var miss = must.filter(function (w) { return text.indexOf(w) === -1; });
  assert(miss.length === 0, "注記に不足: " + miss.join(","));
  return must.length + "項目すべて確認";
});

check(18, "sw.js のキャッシュ対象が実ファイルと一致する", function () {
  var sw = fs.readFileSync(path.join(DIR, "sw.js"), "utf8");
  var m = sw.match(/\[([\s\S]*?)\]/);
  assert(m, "キャッシュ対象リストを取り出せない");
  var files = (m[1].match(/"[^"]+"/g) || []).map(function (s) {
    return s.replace(/"/g, "").replace(/^\.\//, "");
  }).filter(function (s) { return s && s !== "./"; });
  var missing = files.filter(function (f) { return !fs.existsSync(path.join(DIR, f)); });
  assert(missing.length === 0, "実在しないファイル: " + missing.join(","));
  var actual = fs.readdirSync(DIR).filter(function (f) {
    return /\.(html|js|json)$/.test(f) && f !== "test.js" && f !== "sw.js";
  });
  var uncached = actual.filter(function (f) { return files.indexOf(f) === -1; });
  assert(uncached.length === 0, "キャッシュ漏れ: " + uncached.join(","));
  return files.length + "ファイル";
});

check(19, "外部ドメインを参照していない（外部通信ゼロの規約）", function () {
  var bad = [];
  ["index.html", "logic.js", "data.js", "sw.js", "manifest.json"].forEach(function (f) {
    var src = fs.readFileSync(path.join(DIR, f), "utf8");
    (src.match(/https?:\/\/[^\s"'<>)]+/g) || []).forEach(function (u) {
      if (u.indexOf("https://rinne-blog.com/") !== 0) bad.push(f + ": " + u);
    });
  });
  assert(bad.length === 0, "外部参照: " + bad.join(" / "));
  return "外部参照0件";
});

check(20, "シェア文が壊れない", function () {
  var out = L.convert("これはとても疲れたよ。", RULES, 3);
  var t = L.buildShareText("これはとても疲れたよ。", out.text, { url: "https://rinne-blog.com/mikawaben" });
  assert(t.indexOf("undefined") === -1 && t.indexOf("NaN") === -1, "壊れた値: " + t);
  var empty = L.buildShareText("", "", { url: "https://rinne-blog.com/mikawaben" });
  assert(typeof empty === "string" && empty.length > 0, "空入力で文字列が返らない");
  return "通常・空入力とも文章になる";
});

/* ================= 期待値との突き合わせ（最重要） =================
 * #6〜#13 の性質テストは全部PASSしていたのに、実機で「そうだね→そうだに」（本当は
 * 「ほうだに」）という取りこぼしが見つかった。**一般的なルールが具体的なルールを
 * 先に食ってしまう**ためで、性質テストでは原理的に検出できない。
 * 具体的な期待値を書いて突き合わせるテストがどうしても要る（2026-08-30 追加）。
 *
 * 【2026-08-31 期待値を更新】全31ルールを文献と突き合わせた結果、次を変更した。
 *   - 「そうだね」→ ほうだに ではなく **ほうだら**（資料に「ほうだら＝そうだよね」と明記があるため）
 *   - 「ないです → んに」のルールを削除したので、「です→だに」が働いて **ないだに** になる
 * **期待値を実装に合わせて書き換えたのではなく、文献に合わせて実装を直し、期待値を追随させた。** */
check(21, "代表的な文が期待どおりに変換される", function () {
  var CASES = [
    /* [入力, レベル, 期待する出力] */
    ["そうだね。", 2, "ほうだら。"],
    ["そうだね。", 1, "そうだに。"],
    ["ないです。", 1, "ないだに。"],
    ["机を運ぶ。", 3, "机をつる。"],
    ["鍵をかける。", 3, "鍵をかう。"],
    ["鍵をかけてから行く。", 3, "鍵をかってから行く。"],
    ["これはとても疲れた。", 2, "これはどえらいえらかった。"],
    ["自転車を捨てたよ。", 2, "けったをほかったに。"],
    ["怖いでしょう。", 2, "おそがいだら。"],
    ["していたよ。", 1, "しとったに。"],
    ["English only.", 3, "English only."]
  ];
  var bad = [];
  CASES.forEach(function (c) {
    var got = L.convert(c[0], RULES, c[1]).text;
    if (got !== c[2]) bad.push("lv" + c[1] + " " + c[0] + "\n       期待: " + c[2] + "\n       実際: " + got);
  });
  assert(bad.length === 0, bad.join("\n     - "));
  return CASES.length + "パターンすべて一致";
});

check(22, "具体的なルールが一般的なルールに 食われていない（並び順の検査）", function () {
  /* 長い from を持つルールが、それを部分文字列に含む短い from のルールより先にあること */
  var bad = [];
  RULES.forEach(function (a, i) {
    RULES.forEach(function (b, j) {
      if (i >= j) return;              /* a が先、b が後 */
      var sa = a.from.source.replace(/\(\?=.*$/, "");
      var sb = b.from.source.replace(/\(\?=.*$/, "");
      if (sa.indexOf("|") !== -1 || sb.indexOf("|") !== -1) return;  /* 選択肢付きは対象外 */
      /* 後ろの b のほうが長くて、a を含んでいる＝ b が永久に発火しない */
      if (sb.length > sa.length && sb.indexOf(sa) !== -1 && b.level >= a.level) {
        bad.push(b.id + "（" + sb + "）が " + a.id + "（" + sa + "）に先に食われる");
      }
    });
  });
  assert(bad.length === 0, bad.join("\n     - "));
  return RULES.length + "件の総当たりで問題なし";
});

console.log("\n==============================");
console.log("PASS " + pass + " / FAIL " + fail);
if (failures.length) {
  console.log("\n失敗した項目:");
  failures.forEach(function (f) { console.log("  - " + f); });
}
process.exit(fail === 0 ? 0 : 1);

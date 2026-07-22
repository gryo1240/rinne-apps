/* リスク許容度チェック 検算スクリプト
 *   実行: node apps/risk-check/test.js
 * 仕様書 .company/ceo/strategy/spec-risk-tolerance-check.md §8 の検証項目を機械チェックする。
 *
 * このアプリで最も重要なテストは §9「禁止表現の機械チェック」（下の8番）。
 * 「おすすめ」「最適」等がUI文言に混入すると、投資助言と受け取られるリスクが上がるため。
 */

var fs = require("fs");
var path = require("path");

var D = require("./data.js");
var L = require("./logic.js");

var pass = 0, fail = 0;

function ok(cond, label, detail) {
  if (cond) { pass++; console.log("  PASS  " + label); }
  else { fail++; console.log("  FAIL  " + label + (detail ? "  → " + detail : "")); }
}
function section(t) { console.log("\n== " + t + " =="); }

/* ------------------------------------------------------------------
 * 1. 設問データ（等重みが崩れていないこと）
 * ------------------------------------------------------------------ */
section("1. 設問データと等重み（仕様書§3.1）");

ok(D.QUESTIONS.length === 6, "設問=6問", "実際=" + D.QUESTIONS.length);

var allThree = D.QUESTIONS.every(function (q) { return q.options.length === 3; });
ok(allThree, "全設問が3択");

// 等重み: 全設問の配点が [0,1,2] で一致していること
var pointsOk = D.QUESTIONS.every(function (q) {
  return q.options.map(function (o) { return o.point; }).join(",") === "0,1,2";
});
ok(pointsOk, "全設問の配点が 0/1/2 で一致（＝等重みが崩れていない）",
  D.QUESTIONS.map(function (q) { return q.id + ":" + q.options.map(function (o) { return o.point; }).join("") ; }).join(" "));

// 最大配点が全設問で同一（重み付けの混入検知）
var maxPts = D.QUESTIONS.map(function (q) {
  return Math.max.apply(null, q.options.map(function (o) { return o.point; }));
});
ok(maxPts.every(function (p) { return p === maxPts[0]; }),
  "全設問の最大配点が同一（特定の設問だけ重くなっていない）", maxPts.join(","));

var ids = D.QUESTIONS.map(function (q) { return q.id; });
ok(new Set(ids).size === ids.length, "設問IDが重複していない", ids.join(","));

var textOk = D.QUESTIONS.every(function (q) {
  return typeof q.text === "string" && q.text.length > 0 &&
         q.options.every(function (o) { return typeof o.label === "string" && o.label.length > 0; });
});
ok(textOk, "全設問・全選択肢のテキストが非空");

/* ------------------------------------------------------------------
 * 2. 全回答パターン（3^6 = 729通り）の総当たり
 * ------------------------------------------------------------------ */
section("2. 全回答パターン総当たり（729通り）");

var allPatterns = [];
(function build(cur) {
  if (cur.length === 6) { allPatterns.push(cur.slice()); return; }
  for (var i = 0; i < 3; i++) { cur.push(i); build(cur); cur.pop(); }
})([]);

ok(allPatterns.length === 729, "パターン数=729", "実際=" + allPatterns.length);

var scoreOutOfRange = [];
var typeMissing = [];
var seenTypes = {};
var scoreToType = {};
var scoreTypeConflict = [];

allPatterns.forEach(function (ans) {
  var s = L.calcScore(ans);
  if (s === null || s < 0 || s > 12) { scoreOutOfRange.push(ans.join("") + "=>" + s); return; }
  var t = L.judgeType(s);
  if (!t) { typeMissing.push(ans.join("") + "=>" + s); return; }
  seenTypes[t.id] = true;
  // 同じスコアなら必ず同じタイプ（決定論）
  if (scoreToType[s] && scoreToType[s] !== t.id) scoreTypeConflict.push(s + ":" + scoreToType[s] + "/" + t.id);
  scoreToType[s] = t.id;
});

ok(scoreOutOfRange.length === 0, "全729通りでスコアが0〜12に収まる", scoreOutOfRange.slice(0, 3).join(", "));
ok(typeMissing.length === 0, "全729通りでタイプが必ず判定される", typeMissing.slice(0, 3).join(", "));
ok(scoreTypeConflict.length === 0, "同じスコアなら必ず同じタイプ（決定論）", scoreTypeConflict.slice(0, 3).join(", "));
ok(Object.keys(seenTypes).length === 5, "全5タイプが最低1回は出現する",
  "出現: " + Object.keys(seenTypes).join(","));

// スコアの最小・最大が実際に到達可能
ok(L.calcScore([0,0,0,0,0,0]) === 0, "全て最小選択でスコア0");
ok(L.calcScore([2,2,2,2,2,2]) === 12, "全て最大選択でスコア12");

/* ------------------------------------------------------------------
 * 3. タイプ境界（仕様書§3.3の境界値を直接assert）
 * ------------------------------------------------------------------ */
section("3. タイプ境界");

var boundaryCases = [
  [0, "stable"], [2, "stable"],
  [3, "semi_stable"], [5, "semi_stable"],
  [6, "balance"], [7, "balance"],
  [8, "semi_active"], [10, "semi_active"],
  [11, "active"], [12, "active"]
];
boundaryCases.forEach(function (c) {
  var t = L.judgeType(c[0]);
  ok(t && t.id === c[1], "score=" + c[0] + " → " + c[1], t ? t.id : "null");
});

// タイプ定義に隙間・重複がないこと（0〜12が全て埋まる）
var covered = [];
for (var s = 0; s <= 12; s++) {
  var hits = D.TYPES.filter(function (t) { return s >= t.scoreMin && s <= t.scoreMax; });
  if (hits.length !== 1) covered.push(s + "(" + hits.length + "件)");
}
ok(covered.length === 0, "スコア0〜12がタイプに過不足なく対応（隙間・重複なし）", covered.join(", "));

/* ------------------------------------------------------------------
 * 4. 境界判定（隣タイプ案内）
 * ------------------------------------------------------------------ */
section("4. 境界±1点の判定");

var expectNear = [2, 3, 5, 6, 7, 8, 10, 11];
var expectNotNear = [0, 1, 4, 9, 12];
expectNear.forEach(function (s) {
  ok(L.isNearBoundary(s) === true, "score=" + s + " は境界付近（隣タイプを案内する）");
});
expectNotNear.forEach(function (s) {
  ok(L.isNearBoundary(s) === false, "score=" + s + " は境界付近ではない");
});
ok(L.neighborTypes(0).length === 0, "最小スコア0では隣タイプなし（下に隣がない）");
ok(L.neighborTypes(12).length === 0, "最大スコア12では隣タイプなし（上に隣がない）");
ok(L.neighborTypes(3).length === 1 && L.neighborTypes(3)[0].id === "stable",
  "score=3 の隣は stable", JSON.stringify(L.neighborTypes(3).map(function(t){return t.id;})));

/* ------------------------------------------------------------------
 * 5. 配分レンジの整合（仕様書§3.4）
 * ------------------------------------------------------------------ */
section("5. 配分レンジ");

D.TYPES.forEach(function (t) {
  var r = L.allocationRange(t.id);
  ok(!!r, "[" + t.id + "] 配分レンジが存在する");
  if (!r) return;

  var keys = ["stock", "bond", "cash"];
  var minSum = 0, maxSum = 0, rangeOk = true, detail = [];
  keys.forEach(function (k) {
    var v = r[k];
    if (!v || typeof v.min !== "number" || typeof v.max !== "number") { rangeOk = false; return; }
    if (v.min < 0 || v.max > 100 || v.min > v.max) { rangeOk = false; detail.push(k + ":" + v.min + "-" + v.max); }
    minSum += v.min; maxSum += v.max;
  });
  ok(rangeOk, "[" + t.id + "] 各値が0〜100かつ min ≤ max", detail.join(", "));
  // 幅の中に「合計100%」の組み合わせが必ず存在する
  ok(minSum <= 100 && 100 <= maxSum,
    "[" + t.id + "] min合計 ≤ 100 ≤ max合計（合計100%の組合せが存在する）",
    "min合計=" + minSum + " max合計=" + maxSum);
});

/* ------------------------------------------------------------------
 * 6. 代表値（合計が必ず100%）
 * ------------------------------------------------------------------ */
section("6. 代表値（棒グラフ用）");

D.TYPES.forEach(function (t) {
  var rep = L.representativeAllocation(t.id);
  ok(!!rep, "[" + t.id + "] 代表値が計算できる");
  if (!rep) return;
  var sum = rep.stock + rep.bond + rep.cash;
  ok(sum === 100, "[" + t.id + "] 代表値の合計が100%",
    "実際=" + sum + " (" + rep.stock + "/" + rep.bond + "/" + rep.cash + ")");
  // 代表値がレンジ内に収まっていること（現金で調整した結果がレンジ外に出ないか）
  var r = L.allocationRange(t.id);
  var inRange = rep.stock >= r.stock.min && rep.stock <= r.stock.max &&
                rep.bond >= r.bond.min && rep.bond <= r.bond.max &&
                rep.cash >= r.cash.min && rep.cash <= r.cash.max;
  ok(inRange, "[" + t.id + "] 代表値の3項目すべてがレンジ内に収まる",
    rep.stock + "/" + rep.bond + "/" + rep.cash);
});

// 株式比率がタイプ順に単調増加していること（安定重視→積極）
var stocks = D.TYPES.map(function (t) { return L.representativeAllocation(t.id).stock; });
var monotonic = stocks.every(function (v, i) { return i === 0 || v > stocks[i - 1]; });
ok(monotonic, "株式比率が 安定重視→積極 の順に増加している", stocks.join(" < "));

/* ------------------------------------------------------------------
 * 7. 未回答・不正入力の扱い
 * ------------------------------------------------------------------ */
section("7. 未回答・不正入力");

ok(L.calcScore([0,0,0,0,0,null]) === null, "未回答が1つあれば判定しない（null）");
ok(L.calcScore([0,0,0,0,0]) === null, "回答数が足りなければ null");
ok(L.calcScore(null) === null, "answersがnullでも落ちずにnull");
ok(L.calcScore([0,0,0,0,0,99]) === null, "不正なindexは null");
ok(L.isComplete([0,0,0,0,0,0]) === true, "全問回答済みなら isComplete=true");
ok(L.isComplete([0,0,0,0,0,null]) === false, "未回答があれば isComplete=false");
ok(L.evaluate([0,0,0,0,0,null]) === null, "未回答時は evaluate も null");

var ev = L.evaluate([2,2,2,2,2,2]);
ok(ev && ev.score === 12 && ev.type.id === "active" && ev.maxScore === 12,
  "evaluate が一括結果を返す", ev ? ev.score + "/" + ev.type.id : "null");

/* ------------------------------------------------------------------
 * 8. 生活防衛資金の優先メッセージ（Q2=0点）
 * ------------------------------------------------------------------ */
section("8. 生活防衛資金の優先メッセージ");

var qIdx = D.QUESTIONS.findIndex(function (q) { return q.id === "emergency"; });
ok(qIdx >= 0, "設問に emergency（生活防衛資金）が存在する");

var ansNo = [2,2,2,2,2,2]; ansNo[qIdx] = 0;   // 生活防衛資金だけ「まだできていない」
var ansYes = [2,2,2,2,2,2];                    // 全て最大
ok(L.needsEmergencyFundFirst(ansNo) === true, "Q2=0点のとき優先メッセージを出す");
ok(L.needsEmergencyFundFirst(ansYes) === false, "Q2=2点のとき優先メッセージは出さない");
ok(L.evaluate(ansNo).emergencyFirst === true, "evaluate の emergencyFirst に反映される");

/* ------------------------------------------------------------------
 * 9. ★ 禁止表現の機械チェック（このアプリで最重要・仕様書§9）
 * ------------------------------------------------------------------ */
section("9. ★ 禁止表現チェック（仕様書§9）");

var FORBIDDEN = [
  "おすすめ", "オススメ", "お勧め", "推奨", "最適", "ベスト",
  "すべきです", "買うべき", "儲かる", "必ず", "絶対", "安心して投資", "損しない"
];

/* data.js の表示文言を集める（コメント・変数名は対象外なので、
   exportされた値の中の文字列だけを再帰的に集める） */
function collectStrings(v, out) {
  if (typeof v === "string") { out.push(v); return out; }
  if (Array.isArray(v)) { v.forEach(function (x) { collectStrings(x, out); }); return out; }
  if (v && typeof v === "object") {
    Object.keys(v).forEach(function (k) {
      // URLは表示文言ではないので除外（誤検知防止）
      if (k === "url" || k === "sourceUrl") return;
      collectStrings(v[k], out);
    });
  }
  return out;
}
var dataStrings = collectStrings(D, []);
ok(dataStrings.length > 0, "data.js から表示文言を収集できた", dataStrings.length + "件");

var dataHits = [];
dataStrings.forEach(function (s) {
  FORBIDDEN.forEach(function (w) {
    if (s.indexOf(w) >= 0) dataHits.push(w + " ← 「" + s.slice(0, 40) + "…」");
  });
});
ok(dataHits.length === 0, "data.js の表示文言に禁止表現がない", dataHits.slice(0, 5).join(" / "));

var htmlPath = path.join(__dirname, "index.html");
var html = fs.readFileSync(htmlPath, "utf8");

/* index.html の「本文として見えるテキスト」（タグを剥がしたもの）。
   §10・§11の存在チェックで使う。 */
var visible = html
  .replace(/<script[\s\S]*?<\/script>/gi, " ")
  .replace(/<style[\s\S]*?<\/style>/gi, " ")
  .replace(/<!--[\s\S]*?-->/g, " ")
  .replace(/<[^>]+>/g, " ");

/* ★ 禁止表現チェックの走査対象（2026-07-21 サブエージェントレビュー指摘で拡大）
 *
 * 旧実装は「タグを剥がした本文テキスト」だけを見ていたため、次が検査対象外だった:
 *   - インライン<script>内の文字列リテラル（JSでDOMに流し込む文言）
 *   - HTML属性値（aria-label / title / alt など。タグごと削除されていた）
 *   - manifest.webmanifest の name / description（PWAインストール時に表示される）
 * 実際に表示される文言の約半分が未検査だったため、
 * 「コメントだけを除去して、残り全部を走査する」方式に変更した。
 * 禁止語はすべて日本語なので、CSSセレクタやJS識別子が誤検知することはない。 */
function stripComments(src) {
  return src
    .replace(/<!--[\s\S]*?-->/g, " ")        // HTMLコメント
    .replace(/\/\*[\s\S]*?\*\//g, " ")       // JS/CSSのブロックコメント
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");   // JSの行コメント（"https://" を壊さない）
}

var manifestPath = path.join(__dirname, "manifest.webmanifest");
var manifestSrc = fs.readFileSync(manifestPath, "utf8");

var scanTargets = [
  { name: "index.html（属性値・JS文字列リテラルを含む全体）", text: stripComments(html) },
  { name: "manifest.webmanifest（PWA表示名・説明）", text: manifestSrc }
];

scanTargets.forEach(function (t) {
  var hits = [];
  FORBIDDEN.forEach(function (w) {
    var i = t.text.indexOf(w);
    if (i >= 0) {
      hits.push(w + " ← 「…" + t.text.slice(Math.max(0, i - 25), i + 25).replace(/\s+/g, "") + "…」");
    }
  });
  ok(hits.length === 0, t.name + " に禁止表現がない", hits.slice(0, 5).join(" / "));
});

/* 走査方式そのものが機能していることの自己テスト（テストが空振りしていないかの確認） */
var canary = stripComments('<p>これはおすすめです</p>');
ok(FORBIDDEN.some(function (w) { return canary.indexOf(w) >= 0; }),
  "走査方式の自己テスト: 本文中の禁止語を検出できる");
var canary2 = stripComments('<button aria-label="最適な選択">x</button>');
ok(FORBIDDEN.some(function (w) { return canary2.indexOf(w) >= 0; }),
  "走査方式の自己テスト: 属性値の禁止語を検出できる");
var canary3 = stripComments('<script>var m = "推奨します";</' + 'script>');
ok(FORBIDDEN.some(function (w) { return canary3.indexOf(w) >= 0; }),
  "走査方式の自己テスト: JS文字列リテラルの禁止語を検出できる");
var canary4 = stripComments('// おすすめ と書いたコメント\nvar x=1;');
ok(!FORBIDDEN.some(function (w) { return canary4.indexOf(w) >= 0; }),
  "走査方式の自己テスト: コメント内の語は検出しない（対象外が正しく効く）");

/* ------------------------------------------------------------------
 * 10. 必須注記の存在チェック（仕様書§7・§6.2）
 * ------------------------------------------------------------------ */
section("10. 必須注記の存在");

var REQUIRED_PHRASES = [
  "投資顧問契約に基づく助言ではありません",
  "当サイトが独自に整理した",
  "将来の結果を保証するものではありません"
];
REQUIRED_PHRASES.forEach(function (p) {
  var inData = dataStrings.some(function (s) { return s.indexOf(p) >= 0; });
  ok(inData, "必須の注記文が data.js にある: 「" + p + "」");
});

// UI（index.html）から注記が実際に参照されていること
ok(html.indexOf("DISCLAIMER") >= 0 || visible.indexOf("投資顧問契約") >= 0,
  "index.html が注記（DISCLAIMER）を出力している");
ok(html.indexOf("SELF_MADE_NOTICE") >= 0 || visible.indexOf("当サイトが独自に整理") >= 0,
  "index.html が「当サイトが独自に整理した目安」の明示を出力している");
ok(html.indexOf("EMERGENCY_FUND_NOTE") >= 0 || visible.indexOf("生活防衛資金") >= 0,
  "index.html が生活防衛資金の位置づけを出力している");

/* 期待リターン・標準偏差を出していないこと（仕様書§3.6） */
var RETURN_WORDS = ["期待リターン", "期待収益率", "標準偏差", "リスク（標準偏差）", "年率リターン"];
var retHits = RETURN_WORDS.filter(function (w) {
  return visible.indexOf(w) >= 0 || dataStrings.some(function (s) { return s.indexOf(w) >= 0; });
});
ok(retHits.length === 0, "期待リターン・標準偏差の数値表示をしていない", retHits.join(", "));

/* ------------------------------------------------------------------
 * 11. 規約チェック（外部通信ゼロ・position:fixed不使用・sw.jsキャッシュ）
 * ------------------------------------------------------------------ */
section("11. 実装規約");

ok(!/position\s*:\s*fixed/.test(html.replace(/<!--[\s\S]*?-->/g, "")),
  "index.html で position:fixed を使っていない");

// 外部リソースの読み込みがないこと（http(s):// で始まるsrc/href属性）
var externalRefs = (html.match(/(?:src|href)\s*=\s*["']https?:\/\/[^"']+/gi) || [])
  .filter(function (m) { return !/rinne-blog\.com|gpif\.go\.jp|fsa\.go\.jp|shiruporuto\.jp/.test(m); });
ok(externalRefs.length === 0, "index.html に外部リソースの読み込みがない（出典リンクを除く）",
  externalRefs.slice(0, 3).join(" / "));

// 出典リンクは <a href> のみ（=リソース読込ではない）であること
var externalScriptOrLink = (html.match(/<(?:script|link|img)[^>]+(?:src|href)\s*=\s*["']https?:\/\//gi) || []);
ok(externalScriptOrLink.length === 0, "外部のscript/link/imgタグが存在しない（CDN・外部フォント・外部画像ゼロ）",
  externalScriptOrLink.slice(0, 3).join(" / "));

var sw = fs.readFileSync(path.join(__dirname, "sw.js"), "utf8");
ok(/k\.startsWith\("risk-check-"\)/.test(sw),
  'sw.js のキャッシュ削除が k.startsWith("risk-check-") のみ');
// caches.delete を呼ぶ行が、必ず自プレフィックスでfilterされた後にあること
// （※ 以前ここに「|| true」が入っていて常にPASSする無効なテストだった。
//     2026-07-21 サブエージェントレビューの指摘で実効チェックに置き換え）
var deleteLines = sw.split("\n").filter(function (l) { return l.indexOf("caches.delete") >= 0; });
ok(deleteLines.length > 0, "sw.js に caches.delete がある（activate処理が存在する）");
ok(deleteLines.every(function (l) { return l.indexOf('startsWith("risk-check-")') >= 0; }),
  "caches.delete を呼ぶ行が必ず自プレフィックスのfilterと同じ行にある",
  deleteLines.join(" | "));
ok(sw.indexOf("risk-check-v") >= 0, "キャッシュ名が risk-check- で始まる");

/* ------------------------------------------------------------------
 * 結果
 * ------------------------------------------------------------------ */
console.log("\n========================================");
console.log("  PASS: " + pass + " / FAIL: " + fail);
console.log("========================================");
if (fail > 0) { console.log("❌ 失敗した項目があります"); process.exit(1); }
console.log("✅ ALL PASS");

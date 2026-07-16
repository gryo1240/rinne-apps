"use strict";
// 新NISA取り崩しシミュレーター 検算テスト: node apps/torikuzushi/test.js
var C = require("./calc.js");

var failed = 0;
function ok(name, cond) { if (!cond) { failed++; console.log("NG " + name); } else console.log("ok " + name); }
function near(a, b, tol) { return Math.abs(a - b) <= tol; }

// ===== 1) 代表値: 2,000万円・月10万円・3% → 278ヶ月(23年2ヶ月)で残高ゼロ =====
// 閉形式: B[n] = (B0 - W/i)(1+i)^n + W/i, W/i=4,000万 → 1.0025^n=2 → n=ln2/ln1.0025≈277.6 → 278ヶ月目
(function () {
  var r = C.simulateFixed(20000000, 100000, 3, 0);
  ok("代表値: 278ヶ月で終了 (実際=" + r.months + ")", r.months === 278);
  ok("代表値: depleted=true", r.depleted === true);
  ok("代表値: 受け取り総額 = 277×10万 + 最終端数 (実際=" + Math.round(r.totalWithdrawn) + ")",
     r.totalWithdrawn > 27700000 && r.totalWithdrawn < 27800000);
  ok("代表値: 運用益 = 受取総額 - 元本 > 0", r.totalGain > 0 && near(r.totalGain, r.totalWithdrawn - 20000000, 1));
})();

// ===== 2) 発散ガード: 運用益 >= 取り崩し額なら600ヶ月で打ち切り =====
(function () {
  var r = C.simulateFixed(100000000, 10000, 5, 0); // 1億・月1万・5% → 減らない
  ok("発散: 600ヶ月キャップ", r.months === C.MAX_MONTHS);
  ok("発散: depleted=false", r.depleted === false);
  ok("発散: 残高は増えている", r.series[r.series.length - 1].balance > 100000000);
})();

// ===== 3) 利回り0%: 1,200万・月10万 → ちょうど120ヶ月 =====
(function () {
  var r = C.simulateFixed(12000000, 100000, 0, 0);
  ok("0%利回り: 120ヶ月ちょうど", r.months === 120);
  ok("0%利回り: 運用益ゼロ", near(r.totalGain, 0, 1));
  ok("0%利回り: 受取総額=元本", near(r.totalWithdrawn, 12000000, 1));
})();

// ===== 4) 物価対応(毎年増額): 増やすほど期間は短くなる =====
(function () {
  var base = C.simulateFixed(20000000, 100000, 3, 0);
  var inf = C.simulateFixed(20000000, 100000, 3, 2);
  ok("増額2%: 増額なしより早く終わる (" + inf.months + " < " + base.months + ")", inf.months < base.months);
  // 2年目の取り崩し月額が2%増えていること（年間受取で確認: 2年目 ≈ 10.2万×12）
  var y2 = inf.yearly[1];
  ok("増額2%: 2年目の年間受取 ≈ 122.4万 (実際=" + Math.round(y2.withdrawn) + ")", near(y2.withdrawn, 1224000, 1000));
})();

// ===== 5) 定率4%・利回り3%: 残高ゼロにはならないが逓減、初年度月受取 =====
(function () {
  var r = C.simulateRate(20000000, 4, 3, 50);
  ok("定率: 初年度の月あたり受取 = 2,000万×4%÷12 ≈ 66,667円", near(r.yearly[0].monthlyReceipt, 66667, 1));
  ok("定率: 50年分の年次データ", r.yearly.length === 50);
  var last = r.series[r.series.length - 1].balance;
  ok("定率(率>利回り): 残高は減るがゼロにならない (50年後=" + Math.round(last) + ")", last > 0 && last < 20000000);
  ok("定率: 受取額も逓減する", r.yearly[49].monthlyReceipt < r.yearly[0].monthlyReceipt);
})();

// ===== 6) 定率(率<利回り): 残高も受取額も増える =====
(function () {
  var r = C.simulateRate(20000000, 2, 4, 30);
  ok("定率(率<利回り): 残高が増える", r.series[r.series.length - 1].balance > 20000000);
  ok("定率(率<利回り): 受取額が増える", r.yearly[29].monthlyReceipt > r.yearly[0].monthlyReceipt);
})();

// ===== 7) 逆算の閉形式と往復整合: 月10万×30年@3% =====
(function () {
  var p = C.requiredPrincipal(100000, 360, 3);
  ok("逆算: 月10万×30年@3% ≈ 2,372万円 (実際=" + Math.round(p) + ")", near(p, 23720000, 20000));
  var r = C.simulateFixed(p, 100000, 3, 0);
  ok("往復: 逆算元本を順算すると360±1ヶ月 (実際=" + r.months + ")", Math.abs(r.months - 360) <= 1);
})();

// ===== 8) 逆算・利回り0%: 単純掛け算 =====
(function () {
  var p = C.requiredPrincipal(100000, 120, 0);
  ok("逆算0%: 10万×120ヶ月=1,200万", near(p, 12000000, 1));
})();

// ===== 9) 提案額の往復: 2,000万を360ヶ月もたせる月額 → 順算で360±1ヶ月 =====
(function () {
  var w = C.sustainableMonthly(20000000, 360, 3);
  ok("提案: 2,000万×30年@3%の持続月額 ≈ 8.4万円 (実際=" + Math.round(w) + ")", w > 80000 && w < 90000);
  var r = C.simulateFixed(20000000, w, 3, 0);
  ok("往復: 提案月額で360±1ヶ月 (実際=" + r.months + ")", Math.abs(r.months - 360) <= 1);
})();

// ===== 10) エッジ: 元本ゼロ・受取ゼロ =====
(function () {
  var r0 = C.simulateFixed(0, 100000, 3, 0);
  ok("元本0: 即終了", r0.months === 0 && r0.depleted === true);
  var rw = C.simulateFixed(1000000, 0, 3, 0);
  ok("受取0: 600ヶ月キャップ・残高は複利成長", rw.months === C.MAX_MONTHS && rw.depleted === false);
  ok("受取0: 年次テーブルも50年分そろう (実際=" + rw.yearly.length + ")", rw.yearly.length === 50);
})();

// ===== 10.5) 50年キャップだが減り続けるケース（UI文言分岐の根拠）: 2,000万・月3.5万・2% =====
(function () {
  var r = C.simulateFixed(20000000, 35000, 2, 0);
  ok("減るが50年もつ: depleted=false", r.depleted === false);
  var last = r.series[r.series.length - 1].balance;
  ok("減るが50年もつ: 最終残高は元本より少ない (実際=" + Math.round(last / 10000) + "万)", last > 0 && last < 20000000);
})();

// ===== 11) 年次テーブルの整合: 各年 startBalance - withdrawn + 運用益 = endBalance =====
(function () {
  var r = C.simulateFixed(20000000, 100000, 3, 0);
  var okAll = true;
  for (var k = 0; k < r.yearly.length; k++) {
    var y = r.yearly[k];
    // 運用益込みなので endBalance は (start - withdrawn) より大きいはず（利回り正のとき）
    if (y.endBalance < y.startBalance - y.withdrawn - 1) { okAll = false; break; }
  }
  ok("年次テーブル: 残高整合", okAll);
  ok("年次テーブル: 年数 = ceil(months/12) (" + r.yearly.length + ")", r.yearly.length === Math.ceil(r.months / 12));
})();

console.log(failed === 0 ? "\nALL PASS" : "\n" + failed + " FAILED");
process.exit(failed === 0 ? 0 : 1);

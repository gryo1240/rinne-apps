"use strict";
// FIREシミュレーター 検算テスト: node apps/fire-calc/test.js
var F = require("./logic.js");

var failed = 0;
function ok(name, cond) { if (!cond) { failed++; console.log("NG " + name); } else console.log("ok " + name); }
function near(a, b, tol) { return Math.abs(a - b) <= tol; }

// ===== 1) 目標資産 =====
(function () {
  ok("fireTarget(360万,4%)=9000万 (実際=" + F.fireTarget(3600000, 4) + ")", F.fireTarget(3600000, 4) === 90000000);
  ok("fireTarget(300万,3%)=1億 (実際=" + F.fireTarget(3000000, 3) + ")", F.fireTarget(3000000, 3) === 100000000);
})();

// ===== 2) 将来資産（利回り0%） =====
(function () {
  var v = F.futureValue(1000000, 10000, 0, 12);
  ok("futureValue(利回り0%)=112万 (実際=" + v + ")", v === 1120000);
})();

// ===== 3) 将来資産（複利・つみたて実績と整合） =====
(function () {
  var v = F.futureValue(0, 30000, 5 / 100 / 12, 240);
  ok("futureValue(月3万×5%×20年)≈1,233万 (実際=" + Math.round(v) + ")", near(v, 12330000, 10000));
})();

// ===== 4) 順算の境界 =====
(function () {
  var P = 3000000, PMT = 50000, annualUsed = 4;
  var target = F.fireTarget(3600000, 4);
  var monthlyRate = annualUsed / 100 / 12;
  var n = F.monthsToFire(P, PMT, annualUsed, target);
  ok("順算境界: monthsToFire!==null (実際=" + n + ")", n !== null);
  var atN = F.futureValue(P, PMT, monthlyRate, n);
  var atNm1 = F.futureValue(P, PMT, monthlyRate, n - 1);
  ok("順算境界: futureValue(n)>=target (実際=" + Math.round(atN) + " / target=" + target + ")", atN >= target);
  ok("順算境界: futureValue(n-1)<target (実際=" + Math.round(atNm1) + ")", atNm1 < target);
})();

// ===== 5) 順算 既到達 =====
(function () {
  var n = F.monthsToFire(100000000, 50000, 4, 90000000);
  ok("既到達: months===0 (実際=" + n + ")", n === 0);
})();

// ===== 6) 順算 到達不能（CAP） =====
(function () {
  var n = F.monthsToFire(0, 0, 0, 90000000);
  ok("到達不能: null (実際=" + n + ")", n === null);
})();

// ===== 6.5) CAP境界の固定（1200ヶ月ちょうどは到達扱い・1201ヶ月目からnull） =====
(function () {
  var PMT = 10000;
  var justAtCap = F.monthsToFire(0, PMT, 0, PMT * 1200);
  var overCap = F.monthsToFire(0, PMT, 0, PMT * 1200 + 1);
  ok("CAP境界: ちょうど1200ヶ月は到達扱い (実際=" + justAtCap + ")", justAtCap === 1200);
  ok("CAP境界: 1200ヶ月では届かないとnull (実際=" + overCap + ")", overCap === null);
})();

// ===== 7) 逆算の往復整合 =====
// 順算が返す月数nは「target を初めて超える整数月」なので、その時点の評価額はtargetを
// 必ず行き過ぎている。そのnを逆算に入れ直すと requiredPMT は元PMTより必ず小さく出る
// （実測: 条件次第で最大1,198円）。「元PMTと数円で一致」という単純な許容誤差は成立しないため、
// 数学的に成立する不変条件（advisor 2026-08-25相談で特定）で検証する:
//   1. requiredPMT(n) <= 元PMT （行き過ぎた分だけ必要額は少なくて済む）
//   2. requiredPMT(n) で n ヶ月後に到達すると target にほぼ一致する（丸め誤差内）
//   3. requiredPMT(n) を使って順算し直しても同じ n が返る（往復で月数がぶれない）
(function () {
  var target = F.fireTarget(3600000, 4);
  var cases = [
    { P: 3000000, PMT: 50000, annualUsed: 4 },
    { P: 3000000, PMT: 300000, annualUsed: 4 },
    { P: 50000000, PMT: 10000, annualUsed: 4 },
    { P: 80000000, PMT: 5000, annualUsed: 5 }
  ];
  cases.forEach(function (c) {
    var months = F.monthsToFire(c.P, c.PMT, c.annualUsed, target);
    var monthlyRate = c.annualUsed / 100 / 12;
    var pmt2 = F.requiredPMT(c.P, c.annualUsed, target, months);
    var fv2 = F.futureValue(c.P, pmt2, monthlyRate, months);
    var months2 = F.monthsToFire(c.P, pmt2, c.annualUsed, target);
    var label = "P=" + c.P + " PMT=" + c.PMT;
    ok("往復[" + label + "]: requiredPMT<=元PMT (実際=" + Math.round(pmt2) + ")", pmt2 <= c.PMT);
    ok("往復[" + label + "]: requiredPMTでnヶ月後targetに一致 (差=" + Math.round(fv2 - target) + ")", near(fv2, target, 5));
    ok("往復[" + label + "]: requiredPMTで順算し直すと同じn (実際=" + months2 + " / n=" + months + ")", months2 === months);
  });
})();

// ===== 8) 逆算 積立不要 =====
(function () {
  var pmt = F.requiredPMT(90000000, 4, 90000000, 12);
  ok("積立不要: requiredPMT===0 (実際=" + pmt + ")", pmt === 0);
})();

// ===== 9) 実質利回りトグル =====
(function () {
  var base = F.effectiveAnnual(6, 2, false);
  var real = F.effectiveAnnual(6, 2, true);
  ok("実質利回り: トグルOFFはannualのまま (実際=" + base + ")", base === 6);
  ok("実質利回り: トグルONはannual-inflation (実際=" + real + ")", real === 4);

  var P = 3000000, PMT = 50000, target = F.fireTarget(3600000, 4);
  var monthsBase = F.monthsToFire(P, PMT, base, target);
  var monthsReal = F.monthsToFire(P, PMT, real, target);
  ok("実質利回り: インフレ考慮で到達が遅くなる (base=" + monthsBase + " < real=" + monthsReal + ")", monthsBase < monthsReal);

  var real2 = F.effectiveAnnual(1, 3, true);
  ok("実質利回り: 下限0にクランプ (実際=" + real2 + ")", real2 === 0);
})();

// ===== 10) クランプ =====
(function () {
  ok("クランプ: 年利-5→0 (実際=" + F.clamp(-5, F.RANGES.annual.min, F.RANGES.annual.max) + ")",
     F.clamp(-5, F.RANGES.annual.min, F.RANGES.annual.max) === 0);
  ok("クランプ: 年利20→15 (実際=" + F.clamp(20, F.RANGES.annual.min, F.RANGES.annual.max) + ")",
     F.clamp(20, F.RANGES.annual.min, F.RANGES.annual.max) === 15);
})();

// ===== 11) NaN/0除算ガード（取り崩し率） =====
(function () {
  var w = F.clamp(0, F.RANGES.wRate.min, F.RANGES.wRate.max);
  ok("wRateクランプ: 0→1 (実際=" + w + ")", w === 1);
  var t = F.fireTarget(3600000, w);
  ok("wRate=1でも目標資産が有限 (実際=" + t + ")", isFinite(t) && !isNaN(t));
})();

console.log(failed === 0 ? "\nALL PASS" : "\n" + failed + " FAILED");
process.exit(failed === 0 ? 0 : 1);

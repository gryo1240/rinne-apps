"use strict";
/*
 * FIREシミュレーター 計算ロジック（純関数・Node検算可能）
 *
 * ==== 計算モデルの宣言（test.jsの期待値とセットで変更すること） ====
 * - 月利 = 年率(%) / 100 / 12（単純12分割）。兄弟アプリ(tsumitate/torikuzushi)と同方式
 * - 月次複利: 毎月末に積立PMTが加わる（年金終価方式）
 * - 目標資産 = 年間生活費 ÷ 取り崩し率（4%ルール）
 * - 順算: 現在資産+毎月積立が目標に届くまでの月数。発散ガード CAP=1200ヶ月(100年)
 * - 逆算: 目標年齢までの月数で目標資産に届くために必要な毎月積立額（年金終価の閉形式の逆）
 * - 実質利回り: インフレ調整トグルON時は annualUsed = max(0, annual - inflation)
 */

var CAP_MONTHS = 1200; // 100年

/** 目標資産（4%ルール） */
function fireTarget(expense, wRate) {
  return expense / (wRate / 100);
}

/** 将来資産（現在資産Pに毎月PMTを積み立てた場合のmonths ヶ月後の評価額） */
function futureValue(P, PMT, monthlyRate, months) {
  if (monthlyRate === 0) return P + PMT * months;
  var g = Math.pow(1 + monthlyRate, months);
  return P * g + PMT * (g - 1) / monthlyRate;
}

/** 実質利回り（インフレ調整トグル用） */
function effectiveAnnual(annual, inflation, useReal) {
  return useReal ? Math.max(0, annual - inflation) : annual;
}

/**
 * 順算: 目標到達までの月数
 * @returns {number|null} 到達不能（CAP超過）なら null
 */
function monthsToFire(P, PMT, annualUsed, target) {
  if (P >= target) return 0;

  var monthlyRate = annualUsed / 100 / 12;

  if (monthlyRate === 0) {
    if (PMT <= 0) return null;
    var months0 = Math.ceil((target - P) / PMT);
    return months0 > CAP_MONTHS ? null : months0;
  }

  if (futureValue(P, PMT, monthlyRate, CAP_MONTHS) < target) return null;

  // 単調増加なので二分探索で境界(futureValue(n)>=target かつ futureValue(n-1)<target)を求める
  var lo = 0, hi = CAP_MONTHS;
  while (lo < hi) {
    var mid = Math.floor((lo + hi) / 2);
    if (futureValue(P, PMT, monthlyRate, mid) >= target) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

/**
 * 逆算: 目標年齢(months ヶ月後)までに目標資産へ届くための毎月積立額
 * @returns {number} 積立ゼロで届く場合は 0
 */
function requiredPMT(P, annualUsed, target, months) {
  var monthlyRate = annualUsed / 100 / 12;
  var g = Math.pow(1 + monthlyRate, months);
  var funded = P * g;
  if (funded >= target) return 0;
  if (monthlyRate === 0) return (target - P) / months;
  return (target - funded) / ((g - 1) / monthlyRate);
}

/** グラフ用系列（0〜monthsCountヶ月・最大120点にダウンサンプル） */
function series(P, PMT, annualUsed, monthsCount) {
  var monthlyRate = annualUsed / 100 / 12;
  var maxPoints = 120;
  var step = monthsCount <= maxPoints ? 1 : Math.ceil(monthsCount / maxPoints);
  var points = [];
  for (var m = 0; m <= monthsCount; m += step) {
    points.push({
      month: m,
      principal: P + PMT * m,
      value: futureValue(P, PMT, monthlyRate, m)
    });
  }
  var last = points[points.length - 1];
  if (last.month !== monthsCount) {
    points.push({
      month: monthsCount,
      principal: P + PMT * monthsCount,
      value: futureValue(P, PMT, monthlyRate, monthsCount)
    });
  }
  return points;
}

function clamp(v, min, max) {
  if (isNaN(v)) v = min;
  return Math.min(Math.max(v, min), max);
}

// §3.1の既定値・クランプ範囲
var RANGES = {
  P: { def: 3000000, min: 0, max: 1000000000 },
  PMT: { def: 50000, min: 0, max: 10000000 },
  annual: { def: 4, min: 0, max: 15 },
  expense: { def: 3600000, min: 600000, max: 100000000 },
  wRate: { def: 4, min: 1, max: 10 },
  curAge: { def: 30, min: 0, max: 99 },
  inflation: { def: 0, min: 0, max: 10 },
  targetAge: { def: 55, min: 1, max: 100 } // 実際の下限はcurAge+1（UI側で動的に適用）
};

var FIRE = {
  CAP_MONTHS: CAP_MONTHS,
  fireTarget: fireTarget,
  futureValue: futureValue,
  effectiveAnnual: effectiveAnnual,
  monthsToFire: monthsToFire,
  requiredPMT: requiredPMT,
  series: series,
  clamp: clamp,
  RANGES: RANGES
};
if (typeof module !== "undefined") module.exports = FIRE;
if (typeof window !== "undefined") window.FIRE = FIRE;

"use strict";
/*
 * 新NISA取り崩しシミュレーター 計算ロジック（純関数・Node検算可能）
 *
 * ==== 計算モデルの宣言（test.jsの期待値とセットで変更すること） ====
 * - 月利 = 年率(%) / 100 / 12（単純12分割）。兄弟アプリ(tsumitate/dividend)と同方式
 * - 毎月の順序: 「月初残高 × (1+月利) で運用 → 月末に取り崩し」
 *   B[n+1] = B[n] * (1 + i) - W
 * - 決定論モデル（毎年一定利回り）。順序リスク(取り崩し初期の下落)は表現できない＝UI注記で明示
 * - 税: 新NISA(売却益非課税)専用。課税口座の売却益按分は行わない（v2候補・app-portfolio.md参照）
 * - 無限ループガード: 運用益 >= 取り崩し額だと残高が減らないため、シミュレーションは
 *   MAX_MONTHS(600ヶ月=50年)で必ず打ち切る。UIは「50年以上」とキャップ表示する
 * - 定率方式: 「毎年の年初残高 × 率」を年間受取額とし、その1/12を毎月受け取る。
 *   残高は数学的にゼロにならないため「何年もつか」は答えず「受取額の推移」を答える
 */

var MAX_MONTHS = 600; // 50年

function monthlyRate(annualPct) {
  return annualPct / 100 / 12;
}

/**
 * 定額取り崩し（毎月一定額、オプションで毎年増額）
 * @param {number} principal 初期資産（円）
 * @param {number} monthlyAmount 毎月の取り崩し額（円・初年度）
 * @param {number} annualReturnPct 想定利回り（年率%）
 * @param {number} annualIncreasePct 取り崩し額を毎年増やす率（%・物価対応。0で従来型）
 * @returns {{months:number, depleted:boolean, totalWithdrawn:number, totalGain:number,
 *            series:Array<{month:number, balance:number}>,
 *            yearly:Array<{year:number, startBalance:number, withdrawn:number, endBalance:number}>}}
 */
function simulateFixed(principal, monthlyAmount, annualReturnPct, annualIncreasePct) {
  var i = monthlyRate(annualReturnPct);
  var g = (annualIncreasePct || 0) / 100;
  var balance = principal;
  var w = monthlyAmount;
  var totalWithdrawn = 0;
  var series = [{ month: 0, balance: balance }];
  var yearly = [];
  var yearStart = balance, yearWithdrawn = 0;
  var months = 0;
  var depleted = false;

  if (principal <= 0) {
    return { months: 0, depleted: true, totalWithdrawn: 0, totalGain: 0, series: series, yearly: [] };
  }

  for (var m = 1; m <= MAX_MONTHS; m++) {
    if (m > 1 && (m - 1) % 12 === 0) {
      // 年替わり: 年次記録と取り崩し額の増額
      yearly.push({ year: (m - 1) / 12, startBalance: yearStart, withdrawn: yearWithdrawn, endBalance: balance });
      yearStart = balance; yearWithdrawn = 0;
      w = w * (1 + g);
    }
    balance = balance * (1 + i);
    var actual = Math.min(w, balance); // 最終月は残っている分だけ受け取る
    balance -= actual;
    totalWithdrawn += actual;
    yearWithdrawn += actual;
    months = m;
    series.push({ month: m, balance: balance });
    if (balance <= 0.5) { // 浮動小数の残り香を吸収
      depleted = true;
      balance = 0;
      break;
    }
  }
  // 端数年の記録（受取0円でも年としては経過しているので months が12の倍数+途中で終わった場合以外は必ず積む）
  if (months % 12 !== 0 || yearWithdrawn > 0 || yearly.length === 0) {
    yearly.push({ year: Math.ceil(months / 12), startBalance: yearStart, withdrawn: yearWithdrawn, endBalance: balance });
  } else if (yearly.length < months / 12) {
    yearly.push({ year: months / 12, startBalance: yearStart, withdrawn: yearWithdrawn, endBalance: balance });
  }
  var totalGain = totalWithdrawn + balance - principal;
  return { months: months, depleted: depleted, totalWithdrawn: totalWithdrawn, totalGain: totalGain, series: series, yearly: yearly };
}

/**
 * 定率取り崩し（毎年の年初残高×率を12分割して毎月受け取る）
 * @returns {{series:Array<{month:number, balance:number}>,
 *            yearly:Array<{year:number, startBalance:number, withdrawn:number, endBalance:number, monthlyReceipt:number}>}}
 */
function simulateRate(principal, annualRatePct, annualReturnPct, maxYears) {
  var i = monthlyRate(annualReturnPct);
  var rate = annualRatePct / 100;
  var years = Math.min(maxYears || 50, MAX_MONTHS / 12);
  var balance = principal;
  var series = [{ month: 0, balance: balance }];
  var yearly = [];
  for (var y = 1; y <= years; y++) {
    var yearStart = balance;
    var annualW = balance * rate;
    var mw = annualW / 12;
    var withdrawn = 0;
    for (var m = 1; m <= 12; m++) {
      balance = balance * (1 + i);
      var actual = Math.min(mw, balance);
      balance -= actual;
      withdrawn += actual;
      series.push({ month: (y - 1) * 12 + m, balance: balance });
    }
    yearly.push({ year: y, startBalance: yearStart, withdrawn: withdrawn, endBalance: balance, monthlyReceipt: mw });
  }
  return { series: series, yearly: yearly };
}

/**
 * 逆算: 毎月 monthlyAmount を months ヶ月受け取るのに必要な元本（年金現価・閉形式）
 * 定額・増額なし（g=0）モデル。B[n+1]=B[n](1+i)-W が n=months でちょうど0になる B[0]
 */
function requiredPrincipal(monthlyAmount, months, annualReturnPct) {
  var i = monthlyRate(annualReturnPct);
  if (i === 0) return monthlyAmount * months;
  return monthlyAmount * (1 - Math.pow(1 + i, -months)) / i;
}

/**
 * 提案: principal を months ヶ月ちょうどもたせられる毎月の取り崩し額（閉形式の逆）
 */
function sustainableMonthly(principal, months, annualReturnPct) {
  var i = monthlyRate(annualReturnPct);
  if (i === 0) return principal / months;
  return principal * i / (1 - Math.pow(1 + i, -months));
}

var CALC = {
  MAX_MONTHS: MAX_MONTHS,
  monthlyRate: monthlyRate,
  simulateFixed: simulateFixed,
  simulateRate: simulateRate,
  requiredPrincipal: requiredPrincipal,
  sustainableMonthly: sustainableMonthly
};
if (typeof module !== "undefined") module.exports = CALC;

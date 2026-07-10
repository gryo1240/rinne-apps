"use strict";
/*
 * エアコン電気代シミュレーター 計算ロジック（純関数・Node検算可能）
 *
 * ==== 年次更新チェックリスト（毎年5〜6月に確認） ====
 * 1. 電力量の目安単価: 全国家庭電気製品公正取引協議会（現行 31円/kWh・2022年改定）
 *    https://www.eftc.or.jp/qa/qa_one.php?id=290
 * 2. 畳数別の定格消費電力の代表値: 主要メーカー現行カタログ（パナソニック エオリア等）と
 *    エネチェンジ等の比較記事で水準を確認（2026-07-11時点の突合メモは下のRATED_Wコメント）
 * 3. 設定温度緩和の節約目安: 環境省・資源エネルギー庁の省エネポータル
 *    （「冷房28℃を目安に」系の公式数値。約10%はメーカーコラム由来の慣用値）
 */

var CONFIG = {
  updated: "2026-07-11",

  // 電力量の目安単価（円/kWh・税込）。全国家庭電気製品公正取引協議会の公表値。
  // 従量電灯の第2・第3段階(36〜40円台)に乗る家庭ではこれより高くなる（画面注記済み）
  defaultUnitPrice: 31,

  // 畳数別の定格消費電力の目安（W・標準的な普及価格帯モデル）
  // 突合メモ(2026-07-11): 2.2kW級の冷房定格は省エネ上位機で約440W・普及機で550〜650W
  // （パナソニック エオリア2025年モデル、エネチェンジ/Looopでんき記事の水準）。
  // 本ツールは「標準的な機種の目安」として中間値を採用。暖房は同クラスで冷房の2〜3割増。
  RATED_W: {
    cool: { 6: 550, 8: 650, 10: 750, 12: 950, 14: 1200, 18: 1800 },
    heat: { 6: 700, 8: 850, 10: 950, 12: 1200, 14: 1500, 18: 2200 }
  },

  // 負荷係数（インバーターの出力変動を3段階で近似。実測では平均消費は定格の4〜6割程度とされる）
  LOAD_FACTOR: { low: 0.45, mid: 0.65, high: 0.95 },

  // 設定温度を1℃ゆるめた場合の削減率の目安（冷房+1℃/暖房-1℃で約10%・慣用値）
  tempSavingRate: 0.10,

  // 扇風機の消費電力の目安（W）
  fanW: 25,

  // 入力の上限（極端値ガード）
  maxW: 5000,
  maxUnitPrice: 100
};

/**
 * 1時間あたりの電気代（円）
 * @param {number} ratedW 定格消費電力(W)
 * @param {number} loadFactor 負荷係数(0〜1)
 * @param {number} unitPrice 電力単価(円/kWh)
 */
function hourlyCost(ratedW, loadFactor, unitPrice) {
  var w = Math.min(Math.max(ratedW, 0), CONFIG.maxW);
  var p = Math.min(Math.max(unitPrice, 0), CONFIG.maxUnitPrice);
  return w * loadFactor / 1000 * p;
}

/**
 * メイン計算。
 * @param {Object} q
 * @param {string} q.mode "cool" | "heat"
 * @param {number} q.tatami 6|8|10|12|14|18（q.customW指定時は無視）
 * @param {number|null} q.customW 消費電力の直接入力(W)。nullなら畳数テーブルを使う
 * @param {string} q.load "low" | "mid" | "high"
 * @param {number} q.hoursPerDay 1日の使用時間(0〜24)
 * @param {number} q.daysPerMonth 月の使用日数(1〜31)
 * @param {number} q.unitPrice 電力単価(円/kWh)
 * @returns {Object} 電気代の内訳（円）
 */
function calcCost(q) {
  var ratedW = (q.customW != null && isFinite(q.customW) && q.customW > 0)
    ? q.customW
    : CONFIG.RATED_W[q.mode][q.tatami];
  var lf = CONFIG.LOAD_FACTOR[q.load];
  var hours = Math.min(Math.max(q.hoursPerDay, 0), 24);
  var days = Math.min(Math.max(q.daysPerMonth, 1), 31);

  var perHour = hourlyCost(ratedW, lf, q.unitPrice);
  var perDay = perHour * hours;
  var perMonth = perDay * days;
  var fullDayMonth = perHour * 24 * days; // 24時間つけっぱなしの月額（単純積算）

  return {
    ratedW: ratedW,
    loadFactor: lf,
    perHour: perHour,
    perDay: perDay,
    perMonth: perMonth,
    fullDayMonth: fullDayMonth,
    fullDayDiff: fullDayMonth - perMonth,          // つけっぱなしとの差額
    tempSaving: perMonth * CONFIG.tempSavingRate,  // 設定温度1℃緩和の月間節約目安
    fanPerHour: hourlyCost(CONFIG.fanW, 1, q.unitPrice) // 扇風機1時間の目安
  };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { CONFIG: CONFIG, hourlyCost: hourlyCost, calcCost: calcCost };
}

"use strict";
/*
 * 毎月分配カレンダー — 計算ロジック（純関数・DOM非依存・Nodeで検算できる）
 *
 * 用語:
 *   basis "settlement" … 権利確定月（＝決算月）で見る
 *   basis "payout"     … 入金月のめやすで見る（決算月 + lagMonths）
 *
 * 注意: 銘柄ごとの「決算日→支払開始日」の一覧は、どの運用会社も公表していない。
 *       一般則として「ETFの分配金は決算日から40日程度で支払われる」ことは運用会社の解説に明記されており
 *       （出典は data.js のヘッダーコメント参照）、収録7銘柄の決算日はすべて月の前半なので
 *       入金は必ず翌月になる。そのため lagMonths は銘柄ごとに持たず、
 *       呼び出し側が渡す共通の「めやす」（アプリ本体では常に1＝翌月）として扱う。
 */

(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.JreitLogic = api;
})(typeof self !== "undefined" ? self : this, function () {

  var MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

  /** 決算月 m を basis と lag に応じて「受け取る月」に写す（1〜12で回り込む） */
  function targetMonth(m, basis, lagMonths) {
    if (basis === "settlement") return m;
    var lag = lagMonths || 0;
    return ((m - 1 + lag) % 12) + 1;
  }

  /** その銘柄の「受け取る月」の一覧（昇順・重複なし） */
  function receiveMonths(fund, basis, lagMonths) {
    var seen = {};
    var out = [];
    fund.settlementMonths.forEach(function (m) {
      var t = targetMonth(m, basis, lagMonths);
      if (!seen[t]) { seen[t] = true; out.push(t); }
    });
    out.sort(function (a, b) { return a - b; });
    return out;
  }

  /** 年間の想定分配金（税引前・円） */
  function annualDist(amount, yieldPct) {
    var a = Number(amount) || 0;
    var y = Number(yieldPct) || 0;
    if (!isFinite(a) || !isFinite(y) || a <= 0 || y <= 0) return 0;
    return a * y / 100;
  }

  /**
   * ポートフォリオ全体の計算。
   * @param {Object} opt
   *   funds       … 銘柄マスタ配列
   *   selection   … { code: { amount:number, yieldPct:number } } 選択中の銘柄だけを入れる
   *   basis       … "payout" | "settlement"
   *   lagMonths   … 入金までのめやす（月）
   *   afterTax    … true なら税引後
   *   taxRate     … 税率（既定 0.20315）
   */
  function calcPortfolio(opt) {
    var funds = opt.funds || [];
    var selection = opt.selection || {};
    var basis = opt.basis === "settlement" ? "settlement" : "payout";
    var lagMonths = typeof opt.lagMonths === "number" ? opt.lagMonths : 1;
    var taxRate = typeof opt.taxRate === "number" ? opt.taxRate : 0.20315;
    var factor = opt.afterTax ? (1 - taxRate) : 1;

    var byMonth = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    var contributors = [[], [], [], [], [], [], [], [], [], [], [], []];
    var rows = [];
    var totalAmount = 0;

    funds.forEach(function (f) {
      var sel = selection[f.code];
      if (!sel) return;
      var amount = Number(sel.amount) || 0;
      var yieldPct = Number(sel.yieldPct) || 0;
      var annual = annualDist(amount, yieldPct) * factor;
      var per = f.settlementMonths.length > 0 ? annual / f.settlementMonths.length : 0;
      var months = receiveMonths(f, basis, lagMonths);
      var flags = [];
      for (var i = 0; i < 12; i++) flags.push(false);

      f.settlementMonths.forEach(function (m) {
        var t = targetMonth(m, basis, lagMonths);
        byMonth[t - 1] += per;
        flags[t - 1] = true;
      });
      months.forEach(function (t) {
        if (contributors[t - 1].indexOf(f.code) < 0) contributors[t - 1].push(f.code);
      });

      totalAmount += amount;
      rows.push({
        code: f.code,
        name: f.name,
        amount: amount,
        yieldPct: yieldPct,
        annual: annual,
        perPayout: per,
        months: months,
        flags: flags
      });
    });

    var received = [];
    var gaps = [];
    var yearTotal = 0;
    for (var m = 1; m <= 12; m++) {
      yearTotal += byMonth[m - 1];
      // 「受け取りがある月」は金額ではなく、受け取りの予定があるかで判定する。
      // （投資金額を0円のまま銘柄だけ選んだ場合でも、月のパターンは正しく出す）
      if (contributors[m - 1].length > 0) received.push(m); else gaps.push(m);
    }

    var maxMonth = 1, minMonth = 1;
    for (var k = 2; k <= 12; k++) {
      if (byMonth[k - 1] > byMonth[maxMonth - 1]) maxMonth = k;
      if (byMonth[k - 1] < byMonth[minMonth - 1]) minMonth = k;
    }

    return {
      basis: basis,
      lagMonths: lagMonths,
      rows: rows,
      byMonth: byMonth,
      contributors: contributors,
      receivedMonths: received,
      gapMonths: gaps,
      paidMonthCount: received.length,
      isMonthly: received.length === 12,
      yearTotal: yearTotal,
      monthAvg: yearTotal / 12,
      totalAmount: totalAmount,
      maxMonth: maxMonth,
      minMonth: minMonth,
      afterTax: !!opt.afterTax
    };
  }

  /**
   * 空白月に受け取りがある銘柄を機械的に抽出する。
   * これは推奨ではなく、「その月に受け取りがある銘柄はどれか」という事実の列挙。
   * 並び順は covered の多い順 → 銘柄コード昇順（同点の順序を固定して恣意性を排除する）。
   */
  function fillCandidates(funds, selectedCodes, gapMonths, basis, lagMonths) {
    var selected = {};
    (selectedCodes || []).forEach(function (c) { selected[c] = true; });
    var gapSet = {};
    (gapMonths || []).forEach(function (m) { gapSet[m] = true; });

    var out = [];
    funds.forEach(function (f) {
      if (selected[f.code]) return;
      var covered = receiveMonths(f, basis, lagMonths).filter(function (m) { return !!gapSet[m]; });
      if (covered.length > 0) out.push({ code: f.code, name: f.name, covered: covered });
    });

    out.sort(function (a, b) {
      if (b.covered.length !== a.covered.length) return b.covered.length - a.covered.length;
      return a.code < b.code ? -1 : (a.code > b.code ? 1 : 0);
    });
    return out;
  }

  /**
   * 12ヶ月すべてに受け取りがある組み合わせを、全部分集合の総当たりで列挙する。
   * 推奨ではなく「条件を満たす解の列挙」。金額には一切依存しない。
   * 並び順は本数の少ない順 → 銘柄コードの辞書順。
   */
  function monthlyCombos(funds, basis, lagMonths, maxResults) {
    var n = funds.length;
    var limit = typeof maxResults === "number" ? maxResults : 5;
    var results = [];
    if (n === 0 || n > 20) return results; // 2^20 を超える規模は総当たりしない

    // 各銘柄の受け取り月をビットマスクにしておく
    var masks = funds.map(function (f) {
      var mask = 0;
      receiveMonths(f, basis, lagMonths).forEach(function (m) { mask |= (1 << (m - 1)); });
      return mask;
    });
    var FULL = (1 << 12) - 1;

    for (var s = 1; s < (1 << n); s++) {
      var cover = 0;
      var codes = [];
      for (var i = 0; i < n; i++) {
        if (s & (1 << i)) { cover |= masks[i]; codes.push(funds[i].code); }
      }
      if (cover === FULL) {
        codes.sort();
        results.push({ codes: codes, size: codes.length });
      }
    }

    results.sort(function (a, b) {
      if (a.size !== b.size) return a.size - b.size;
      var x = a.codes.join(","), y = b.codes.join(",");
      return x < y ? -1 : (x > y ? 1 : 0);
    });
    return results.slice(0, limit);
  }

  return {
    MONTHS: MONTHS,
    targetMonth: targetMonth,
    receiveMonths: receiveMonths,
    annualDist: annualDist,
    calcPortfolio: calcPortfolio,
    fillCandidates: fillCandidates,
    monthlyCombos: monthlyCombos
  };
});

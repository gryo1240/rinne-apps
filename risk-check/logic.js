/* リスク許容度チェック — 純ロジック（DOM非依存）
 *
 * 仕様書: .company/ceo/strategy/spec-risk-tolerance-check.md §3
 *
 * ============================================================
 * ★ 等重みスコアリングの設計理由（変更禁止・仕様書§3.1）
 * ============================================================
 * 全6問・各0〜2点の等重みで合計する。設問ごとに重みを掛けたり配点を変えたりしない。
 *
 * 理由: 重み付けをした瞬間に「その重みの根拠は？」を問われるが、
 *       それに答えられる公的資料は存在しない。
 *       等重みであれば「各項目を同じ重さで数えているだけで、
 *       独自の重み付けはしていません」と正直に説明できる。
 *       これは手抜きではなく、根拠のない精緻化を避けるための設計判断である。
 *
 * ★ 期待リターン・標準偏差は計算しない（仕様書§3.6）。
 *   任意の配分に対するリスクを出すには資産クラス間の相関行列が必要で、
 *   それを自前で置くのは典型的な「もっともらしい式」にあたるため。
 */

var _D = (typeof module !== "undefined" && module.exports)
  ? require("./data.js")
  : (typeof window !== "undefined" ? window.RiskData : null);

/**
 * 回答からスコアを合計する（等重み）。
 * @param {Array} answers 各設問で選んだ選択肢のindex。未回答は null / undefined
 * @param {Array} [questions] 設問配列（省略時はdata.jsのQUESTIONS）
 * @returns {number|null} 合計点。未回答が1つでもあれば null
 */
function calcScore(answers, questions) {
  var qs = questions || _D.QUESTIONS;
  if (!answers || answers.length !== qs.length) return null;
  var total = 0;
  for (var i = 0; i < qs.length; i++) {
    var idx = answers[i];
    if (idx === null || idx === undefined) return null;      // 未回答
    var opt = qs[i].options[idx];
    if (!opt) return null;                                    // 不正なindex
    total += opt.point;                                       // ← 等重み（係数を掛けない）
  }
  return total;
}

/**
 * 全問回答済みかどうか
 */
function isComplete(answers, questions) {
  return calcScore(answers, questions) !== null;
}

/**
 * スコアからタイプを判定する
 * @param {number} score
 * @param {Array} [types]
 * @returns {Object|null}
 */
function judgeType(score, types) {
  var ts = types || _D.TYPES;
  if (typeof score !== "number" || isNaN(score)) return null;
  for (var i = 0; i < ts.length; i++) {
    if (score >= ts[i].scoreMin && score <= ts[i].scoreMax) return ts[i];
  }
  return null;
}

/**
 * 境界±1点か（＝隣のタイプの説明も読んでもらうべきか）
 * タイプの下限値・上限値ちょうどのときを「境界付近」とみなす。
 * ただし全体の最小値(0)・最大値(12)側の端は隣がないので対象外。
 *
 * 【意図的な仕様】バランスタイプ（6〜7点）は幅が2点しかないため、
 * 該当者は必ず隣タイプの案内が出る。これは不具合ではない。
 * 中央のタイプほど「どちらとも言える」状態なので、
 * 隣の説明も読んでもらうほうが結果を絶対視させずに済むと判断した。
 */
function isNearBoundary(score, types) {
  return neighborTypes(score, types).length > 0;
}

/**
 * 境界付近のときの「隣のタイプ」を返す（0〜2件）
 * @returns {Array} タイプ定義の配列
 */
function neighborTypes(score, types) {
  var ts = types || _D.TYPES;
  var t = judgeType(score, ts);
  if (!t) return [];
  var i = ts.indexOf(t);
  var out = [];
  if (score === t.scoreMin && i > 0) out.push(ts[i - 1]);              // 下の隣
  if (score === t.scoreMax && i < ts.length - 1) out.push(ts[i + 1]);  // 上の隣
  return out;
}

/**
 * タイプIDから配分レンジ（幅）を取得する。
 * ★ 断定形の単一値は返さない。UIも必ず幅で表示すること。
 */
function allocationRange(typeId, allocations) {
  var a = allocations || _D.ALLOCATIONS;
  return a[typeId] || null;
}

/**
 * 表示用の代表値（レンジの中央値。合計が必ず100%になるよう現金で調整）。
 * 棒グラフの描画にのみ使う。数値の断定表示には使わない。
 * @returns {{stock:number, bond:number, cash:number}|null}
 */
function representativeAllocation(typeId, allocations) {
  var r = allocationRange(typeId, allocations);
  if (!r) return null;
  var stock = Math.round((r.stock.min + r.stock.max) / 2);
  var bond = Math.round((r.bond.min + r.bond.max) / 2);
  var cash = 100 - stock - bond;   // 合計が必ず100になるよう現金で調整

  // 防御: 将来レンジを変更したときに現金が負値になると棒グラフの幅が壊れるため、
  // 0未満になる組み合わせは「代表値を出せない」として null を返す
  // （現行5タイプはtest.js §6で全てレンジ内に収まることを機械検証済み）。
  if (cash < 0 || stock < 0 || bond < 0) return null;

  return { stock: stock, bond: bond, cash: cash };
}

/**
 * 「生活防衛資金がまだできていない」（Q2で0点）を選んだかどうか。
 * true のとき、結果の最上部に優先度メッセージを出す（仕様書§3.5）。
 */
function needsEmergencyFundFirst(answers, questions) {
  var qs = questions || _D.QUESTIONS;
  for (var i = 0; i < qs.length; i++) {
    if (qs[i].id === "emergency") {
      var idx = answers ? answers[i] : null;
      if (idx === null || idx === undefined) return false;
      var opt = qs[i].options[idx];
      return !!opt && opt.point === 0;
    }
  }
  return false;
}

/**
 * 判定の一括実行
 * @returns {Object|null} { score, type, neighbors, isNearBoundary, range, representative, emergencyFirst }
 */
function evaluate(answers, questions, types, allocations) {
  var score = calcScore(answers, questions);
  if (score === null) return null;
  var type = judgeType(score, types);
  if (!type) return null;
  var neighbors = neighborTypes(score, types);
  return {
    score: score,
    maxScore: (questions || _D.QUESTIONS).length * 2,
    type: type,
    neighbors: neighbors,
    isNearBoundary: neighbors.length > 0,
    range: allocationRange(type.id, allocations),
    representative: representativeAllocation(type.id, allocations),
    emergencyFirst: needsEmergencyFundFirst(answers, questions)
  };
}

var __EXPORTS = {
  calcScore: calcScore,
  isComplete: isComplete,
  judgeType: judgeType,
  isNearBoundary: isNearBoundary,
  neighborTypes: neighborTypes,
  allocationRange: allocationRange,
  representativeAllocation: representativeAllocation,
  needsEmergencyFundFirst: needsEmergencyFundFirst,
  evaluate: evaluate
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = __EXPORTS;
} else if (typeof window !== "undefined") {
  window.RiskLogic = __EXPORTS;
}

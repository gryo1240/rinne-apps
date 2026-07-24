"use strict";
/*
 * 今日の10パズル（make10 / テンパズル）純ロジック
 * DOM非依存。node（test.js・gen_pool.js）とブラウザ（window.TenPuzzle）の両対応。
 *
 * ==== 設計の要（仕様書 game/planning/ten-puzzle-spec.md）====
 * - すべての数値は有理数 {n:分子, d:分母}（d常に正・約分済み・符号はnが持つ）で厳密計算。
 *   浮動小数点を判定に使わない（テンパズルは分数中間値を経由する解を許すため）。
 * - 4枚の数字カードから「2枚選び四則演算で1枚に合成」を3回繰り返し、最後の1枚が目標(既定10)ならクリア。
 *   括弧UIは不要（2枚合成の繰り返しは4葉の全二分木×全順列を余さず生成でき、括弧必須の解も表現可能）。
 * - 難易度は排他・優先順（hard→normal→easy）。hard=整数のみでは解けず分数中間値が必須。
 */

// ---------- 有理数 ----------
function gcd(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) { var t = b; b = a % b; a = t; } return a || 1; }

/** 有理数を生成（符号をnへ集約・約分・ゼロは{n:0,d:1}に正規化） */
function R(n, d) {
  if (d === undefined) d = 1;
  if (d === 0) throw new Error("denominator 0");
  if (d < 0) { n = -n; d = -d; }
  if (n === 0) return { n: 0, d: 1 };
  var g = gcd(n, d);
  return { n: n / g, d: d / g };
}
function add(x, y) { return R(x.n * y.d + y.n * x.d, x.d * y.d); }
function sub(x, y) { return R(x.n * y.d - y.n * x.d, x.d * y.d); }
function mul(x, y) { return R(x.n * y.n, x.d * y.d); }
/** 除算。ゼロ除算はnullを返す（不能） */
function div(x, y) { if (y.n === 0) return null; return R(x.n * y.d, x.d * y.n); }
function eq(x, y) { return x.n === y.n && x.d === y.d; }
function isInt(x) { return x.d === 1; }
function ratToString(x) { return x.d === 1 ? String(x.n) : (x.n + "/" + x.d); }

var OPS = ["+", "-", "*", "/"];
function applyOp(a, b, op) {
  if (op === "+") return add(a, b);
  if (op === "-") return sub(a, b);
  if (op === "*") return mul(a, b);
  if (op === "/") return div(a, b);
  return null;
}

// ---------- 盤面操作 ----------
/**
 * 盤面（Rational配列）の i,j 番目に op を適用した新盤面を返す。
 * 先に選んだ i が左オペランド（減算・除算の向き）。ゼロ除算等で不能ならnull。
 */
function applyMove(board, i, j, op) {
  if (i === j || i < 0 || j < 0 || i >= board.length || j >= board.length) return null;
  var r = applyOp(board[i], board[j], op);
  if (r === null) return null;
  var rest = [];
  for (var k = 0; k < board.length; k++) if (k !== i && k !== j) rest.push(board[k]);
  rest.push(r);
  return rest;
}

// ---------- ソルバー ----------
/** 数値配列(整数 or Rational)をRational配列へ */
function toBoard(nums) {
  return nums.map(function (v) { return (typeof v === "number") ? R(v, 1) : v; });
}

/**
 * target を作れるか全探索し、作れれば手順の一例を返す（作れなければnull）。
 * 手順: [{a, b, op, result}] （a,bは合成した2値の文字列、resultは結果文字列）
 */
function solve(nums, target) {
  target = target || R(10, 1);
  var board = toBoard(nums);
  var found = null;
  function rec(bd, steps) {
    if (found) return;
    if (bd.length === 1) { if (eq(bd[0], target)) found = steps.slice(); return; }
    for (var i = 0; i < bd.length; i++) {
      for (var j = 0; j < bd.length; j++) {
        if (i === j) continue;
        for (var o = 0; o < OPS.length; o++) {
          var nb = applyMove(bd, i, j, OPS[o]);
          if (nb === null) continue;
          steps.push({ a: ratToString(bd[i]), b: ratToString(bd[j]), op: OPS[o], result: ratToString(nb[nb.length - 1]) });
          rec(nb, steps);
          steps.pop();
          if (found) return;
        }
      }
    }
  }
  rec(board, []);
  return found;
}

/**
 * 解に到達する「相異なる部分盤面状態」の数を近似カウント（順序・交換の水増しを排除するためメモ化）。
 * 難易度の相対指標に使う。絶対数には意味を持たせない。cap で打ち切り。
 */
function countUniquePaths(nums, target, cap) {
  target = target || R(10, 1);
  cap = cap || 200;
  var board = toBoard(nums);
  var seen = {};
  var paths = 0;
  function keyOf(bd) {
    return bd.map(ratToString).sort().join(",");
  }
  function rec(bd) {
    if (paths >= cap) return;
    if (bd.length === 1) { if (eq(bd[0], target)) paths++; return; }
    for (var i = 0; i < bd.length; i++) {
      for (var j = 0; j < bd.length; j++) {
        if (i === j) continue;
        for (var o = 0; o < OPS.length; o++) {
          var nb = applyMove(bd, i, j, OPS[o]);
          if (nb === null) continue;
          var k = keyOf(nb) + "#" + nb.length;
          if (seen[k] && bd.length > 2) continue; // 中間状態の重複探索を抑制
          seen[k] = true;
          rec(nb);
        }
      }
    }
  }
  rec(board);
  return paths;
}

/** 整数のみの中間値で target を作れるか（分数を一切経由しないで解けるか） */
function solvableIntOnly(nums, target) {
  target = target || R(10, 1);
  var board = toBoard(nums);
  var ok = false;
  function rec(bd) {
    if (ok) return;
    if (bd.length === 1) { if (eq(bd[0], target)) ok = true; return; }
    for (var i = 0; i < bd.length; i++) {
      for (var j = 0; j < bd.length; j++) {
        if (i === j) continue;
        for (var o = 0; o < OPS.length; o++) {
          var nb = applyMove(bd, i, j, OPS[o]);
          if (nb === null) continue;
          if (!isInt(nb[nb.length - 1])) continue; // 整数のみ経路
          rec(nb);
          if (ok) return;
        }
      }
    }
  }
  rec(board);
  return ok;
}

/** 同一数字の最大重複数（品質フィルタ用） */
function maxDup(nums) {
  var m = {}, mx = 0;
  for (var i = 0; i < nums.length; i++) { m[nums[i]] = (m[nums[i]] || 0) + 1; if (m[nums[i]] > mx) mx = m[nums[i]]; }
  return mx;
}

/**
 * 難易度分類（排他・優先順 hard→normal→easy）。
 * hard: 整数のみでは解けない（分数中間値が必須）
 * normal: 整数のみで解けるが到達経路が少ない（<=NORMAL_MAX）
 * easy: それ以外
 */
var NORMAL_PATHS_MAX = 6;
function classifyDifficulty(nums, target) {
  target = target || R(10, 1);
  if (!solvableIntOnly(nums, target)) return "hard";
  var p = countUniquePaths(nums, target, 200);
  if (p <= NORMAL_PATHS_MAX) return "normal";
  return "easy";
}

// ---------- 乱数（練習モードのみ）----------
function mulberry32(seed) {
  var a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 練習モードの1問を生成。品質フィルタ（同一数字2枚まで）＋可解を満たすまで振り直す。
 * advanced=trueなら分数必須(hard)の問題のみを返す（上級トグル用）。
 * rngは0〜1を返す関数（省略時Math.random）。
 */
function genPractice(advanced, rng) {
  rng = rng || Math.random;
  var target = R(10, 1);
  for (var tries = 0; tries < 5000; tries++) {
    var nums = [];
    for (var k = 0; k < 4; k++) nums.push(1 + Math.floor(rng() * 13)); // 1〜13
    if (maxDup(nums) >= 3) continue;
    if (!solve(nums, target)) continue;
    var diff = classifyDifficulty(nums, target);
    if (advanced) { if (diff !== "hard") continue; }
    return { nums: nums.slice().sort(function (a, b) { return a - b; }), diff: diff };
  }
  return null; // 実質到達しない
}

// ---------- 日付シード（今日の1問・JST基準）----------
/** DateからJSTのYYYYMMDD文字列を得る（UTC+9） */
function jstDateStr(dateObj) {
  var d = dateObj || new Date();
  var jst = new Date(d.getTime() + 9 * 3600 * 1000);
  var y = jst.getUTCFullYear();
  var m = jst.getUTCMonth() + 1;
  var day = jst.getUTCDate();
  return "" + y + (m < 10 ? "0" + m : m) + (day < 10 ? "0" + day : day);
}
/** YYYYMMDD文字列→32bit整数シード（決定論） */
function seedFromDate(dateStr) {
  var h = 2166136261 >>> 0; // FNV-1a
  for (var i = 0; i < dateStr.length; i++) { h ^= dateStr.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
/** poolSize(固定定数POOL_SIZE)と日付から今日のindexを決定論的に選ぶ */
function dailyIndex(dateStr, poolSize) {
  return seedFromDate(dateStr) % poolSize;
}

// ---------- ストリーク（連続クリア日数）----------
/** YYYYMMDD文字列の差が「前日」か。うるう・月跨ぎ対応（UTC正午で日数比較） */
function isPrevDay(prevStr, curStr) {
  return dayDiff(prevStr, curStr) === 1;
}
function toUTCNoon(s) {
  var y = parseInt(s.slice(0, 4), 10), m = parseInt(s.slice(4, 6), 10), d = parseInt(s.slice(6, 8), 10);
  return Date.UTC(y, m - 1, d, 12, 0, 0);
}
function dayDiff(aStr, bStr) {
  return Math.round((toUTCNoon(bStr) - toUTCNoon(aStr)) / 86400000);
}
/**
 * ストリーク更新（純関数）。今日クリアした時に呼ぶ。
 * prev: {current, best, lastClearedDate} / today: YYYYMMDD
 * 同日再クリアは据え置き、前日クリア継続で+1、2日以上空きで1にリセット。
 */
function updateStreak(prev, todayStr) {
  prev = prev || { current: 0, best: 0, lastClearedDate: null };
  var last = prev.lastClearedDate;
  var cur;
  if (last === todayStr) { cur = prev.current; }             // 同日据え置き
  else if (last && isPrevDay(last, todayStr)) { cur = prev.current + 1; } // 前日から継続
  else { cur = 1; }                                          // 初回 or 途切れ
  var best = Math.max(prev.best || 0, cur);
  return { current: cur, best: best, lastClearedDate: todayStr };
}

var API = {
  R: R, add: add, sub: sub, mul: mul, div: div, eq: eq, isInt: isInt, ratToString: ratToString,
  OPS: OPS, applyOp: applyOp, applyMove: applyMove, toBoard: toBoard,
  solve: solve, countUniquePaths: countUniquePaths, solvableIntOnly: solvableIntOnly,
  maxDup: maxDup, classifyDifficulty: classifyDifficulty, NORMAL_PATHS_MAX: NORMAL_PATHS_MAX,
  mulberry32: mulberry32, genPractice: genPractice,
  jstDateStr: jstDateStr, seedFromDate: seedFromDate, dailyIndex: dailyIndex,
  isPrevDay: isPrevDay, dayDiff: dayDiff, updateStreak: updateStreak,
  TARGET10: R(10, 1)
};

if (typeof module !== "undefined" && module.exports) module.exports = API;
if (typeof window !== "undefined") window.TenPuzzle = API;

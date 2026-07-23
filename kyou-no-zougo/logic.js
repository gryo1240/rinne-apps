"use strict";
/*
 * 今日の造語ジェネレーター 純ロジック
 * 仕様: .company/game/planning/kyou-no-zougo-spec.md §3
 *  - DOM非依存。node(test.js)とブラウザの両対応（module.exports / window.ZOUGO_LOGIC）
 *  - 読みは単純連結のみ（連濁などの音変化処理は実装しない）
 */

// data.js を両対応で読み込む
var _DATA;
if (typeof module !== "undefined" && module.exports) {
  _DATA = require("./data.js");
} else {
  _DATA = window.ZOUGO_DATA;
}
var PARTS_A = _DATA.PARTS_A;
var PARTS_B = _DATA.PARTS_B;
var NOTES = _DATA.NOTES;

// ---- FNV-1a 32bit（標準: offset 2166136261 / prime 16777619） ----
function fnv(str) {
  var h = 2166136261;
  for (var i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    // h *= 16777619 を32bitで行う（Math.imulで桁溢れを正しく畳む）
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// ---- mulberry32（おかわり用の擬似乱数。seedは任意の32bit整数） ----
function mulberry32(seed) {
  var a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- ローカル日付を "YYYY-MM-DD" に整形（UTCではない） ----
function localDateStr(d) {
  d = d || new Date();
  var y = d.getFullYear();
  var m = d.getMonth() + 1;
  var day = d.getDate();
  function z(n) { return (n < 10 ? "0" : "") + n; }
  return y + "-" + z(m) + "-" + z(day);
}

// ---- テンプレ展開して1語分の造語オブジェクトを組み立てる ----
function compose(aIdx, bIdx, noteIdx) {
  var A = PARTS_A[aIdx];
  var B = PARTS_B[bIdx];
  var surface = A.s + B.s;          // 表記の単純連結
  var yomi = A.y + B.y;             // 読みの単純連結（音変化なし）
  var def = B.def.split("{A}").join(A.s);
  var ex = B.ex.split("{W}").join(surface);
  var note = NOTES[noteIdx];
  return {
    surface: surface,
    yomi: yomi,
    pos: "名詞",
    def: def,
    ex: ex,
    note: note,
    aIdx: aIdx,
    bIdx: bIdx,
    noteIdx: noteIdx
  };
}

// ---- 日替わり（決定論）: ローカル日付シード ----
// dateStr を渡せば固定日付でテスト可能。省略時は今日のローカル日付。
// ★注意: 日替わり語は fnv(...) % 配列長 で決まるため、data.js の PARTS_A / PARTS_B / NOTES に
//   要素を追加・削除・並び替えすると、その日以降の「今日の造語」が全て変わる（過去日も再計算で変化）。
//   語彙を増やす場合は下の salt "zougo-v1-a/b/n" を "zougo-v2-..." に変え、切替日を決めて運用すること
//   （診断アプリ等と同じテーブル凍結問題。仕様書 kyou-no-zougo-spec.md §11 参照）。
function dailyWord(dateStr) {
  if (!dateStr) dateStr = localDateStr();
  var aIdx = fnv(dateStr + "|zougo-v1-a") % PARTS_A.length;
  var bIdx = fnv(dateStr + "|zougo-v1-b") % PARTS_B.length;
  var noteIdx = fnv(dateStr + "|zougo-v1-n") % NOTES.length;
  var w = compose(aIdx, bIdx, noteIdx);
  w.dateStr = dateStr;
  return w;
}

// ---- おかわり（ランダム）: rand=()=>[0,1) を注入可（テスト用） ----
// prev は直前の造語オブジェクト（省略可）。直前と同じ(aIdx,bIdx)なら1回だけ引き直す。
function randomWord(rand, prev) {
  if (typeof rand !== "function") {
    rand = mulberry32((Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0);
  }
  function pick(n) { return Math.floor(rand() * n) % n; }
  var aIdx = pick(PARTS_A.length);
  var bIdx = pick(PARTS_B.length);
  // 直前と同一の (aIdx,bIdx) なら1回だけ引き直す（1回で足りなければそのまま採用）
  if (prev && prev.aIdx === aIdx && prev.bIdx === bIdx) {
    aIdx = pick(PARTS_A.length);
    bIdx = pick(PARTS_B.length);
  }
  var noteIdx = pick(NOTES.length);
  return compose(aIdx, bIdx, noteIdx);
}

var API = {
  fnv: fnv,
  mulberry32: mulberry32,
  localDateStr: localDateStr,
  compose: compose,
  dailyWord: dailyWord,
  randomWord: randomWord
};

if (typeof module !== "undefined" && module.exports) module.exports = API;
if (typeof window !== "undefined") window.ZOUGO_LOGIC = API;

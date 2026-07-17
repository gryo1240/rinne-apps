"use strict";
/*
 * フリック早撃ち エンジン（純ロジック・Node検算可能・DOM非依存）
 * 仕様: .company/game/planning/flick-hayauchi-spec.md §4・§5
 *
 * 提供するもの:
 *  - FLICK_MAP / resolveFlick(key, dir)   … §4.3 キー×方向→かな
 *  - cycle(char) / baseForm(char)          … §4.4 修飾サイクルと基本形の逆引き
 *  - createGame({words, seed})             … §4.5 判定 + §5 スコアの状態機械
 *  - mulberry32 / shuffle                  … シード可能な乱数（テスト再現用）
 *  - titleFor(score)                       … §5 称号
 */

/* ============ 乱数（シード注入可） ============ */
function mulberry32(seed) {
  var a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(arr, rnd) {
  var a = arr.slice();
  for (var i = a.length - 1; i > 0; i--) {
    var j = Math.floor(rnd() * (i + 1));
    var tmp = a[i]; a[i] = a[j]; a[j] = tmp;
  }
  return a;
}

/* ============ §4.3 フリックマップ ============ */
// dir: "tap" | "left" | "up" | "right" | "down"。無効方向はキー自体を持たない。
var FLICK_MAP = {
  "あ": { tap: "あ", left: "い", up: "う", right: "え", down: "お" },
  "か": { tap: "か", left: "き", up: "く", right: "け", down: "こ" },
  "さ": { tap: "さ", left: "し", up: "す", right: "せ", down: "そ" },
  "た": { tap: "た", left: "ち", up: "つ", right: "て", down: "と" },
  "な": { tap: "な", left: "に", up: "ぬ", right: "ね", down: "の" },
  "は": { tap: "は", left: "ひ", up: "ふ", right: "へ", down: "ほ" },
  "ま": { tap: "ま", left: "み", up: "む", right: "め", down: "も" },
  "や": { tap: "や", up: "ゆ", down: "よ" },
  "ら": { tap: "ら", left: "り", up: "る", right: "れ", down: "ろ" },
  "わ": { tap: "わ", left: "を", up: "ん", right: "ー" }
};

// キーの並び順（UI描画用・§4.1）。"mod"=修飾キー, "dummy"=無反応ダミー
var KEY_LAYOUT = [
  "あ", "か", "さ",
  "た", "な", "は",
  "ま", "や", "ら",
  "mod", "わ", "dummy"
];

function resolveFlick(key, dir) {
  var k = FLICK_MAP[key];
  if (!k) return null;
  return k[dir] || null; // 無効方向は null
}

/* ============ §4.4 修飾サイクルと基本形 ============ */
// 各配列の先頭が「フリックで直接出せる基本形」。以降が修飾で循環する派生。
var CYCLE_GROUPS = [
  ["か", "が"], ["き", "ぎ"], ["く", "ぐ"], ["け", "げ"], ["こ", "ご"],
  ["さ", "ざ"], ["し", "じ"], ["す", "ず"], ["せ", "ぜ"], ["そ", "ぞ"],
  ["た", "だ"], ["ち", "ぢ"], ["つ", "っ", "づ"], ["て", "で"], ["と", "ど"],
  ["は", "ば", "ぱ"], ["ひ", "び", "ぴ"], ["ふ", "ぶ", "ぷ"], ["へ", "べ", "ぺ"], ["ほ", "ぼ", "ぽ"],
  ["あ", "ぁ"], ["い", "ぃ"], ["う", "ぅ", "ゔ"], ["え", "ぇ"], ["お", "ぉ"],
  ["や", "ゃ"], ["ゆ", "ゅ"], ["よ", "ょ"]
];

var _cycleNext = {}; // char -> 次のchar（循環）
var _baseForm = {};  // char -> グループ先頭（基本形）
(function buildCycleTables() {
  for (var g = 0; g < CYCLE_GROUPS.length; g++) {
    var grp = CYCLE_GROUPS[g];
    for (var i = 0; i < grp.length; i++) {
      _cycleNext[grp[i]] = grp[(i + 1) % grp.length];
      _baseForm[grp[i]] = grp[0];
    }
  }
})();

function cycle(char) {
  return Object.prototype.hasOwnProperty.call(_cycleNext, char) ? _cycleNext[char] : char;
}

function baseForm(char) {
  return Object.prototype.hasOwnProperty.call(_baseForm, char) ? _baseForm[char] : char;
}

/* ============ §5 称号 ============ */
var TITLES = [
  { min: 1600, name: "フリックの神" },
  { min: 1300, name: "音速の親指" },
  { min: 1000, name: "教室の伝説" },
  { min: 800, name: "親指ソムリエ" },
  { min: 600, name: "既読1秒" },
  { min: 400, name: "通学電車の達人" },
  { min: 200, name: "見習いフリッカー" },
  { min: 0, name: "ガラケー出身" }
];

function titleFor(score) {
  for (var i = 0; i < TITLES.length; i++) {
    if (score >= TITLES[i].min) return TITLES[i].name;
  }
  return TITLES[TITLES.length - 1].name;
}

/* ============ §4.5 判定 + §5 スコアの状態機械 ============ */
/**
 * createGame({ words, seed })
 *  words: [{k, l}, ...]（words.jsのコースのwords配列）
 *  seed : 乱数シード（省略時 Date.now()）
 *
 * 主メソッド:
 *  inputChar(c)     基本文字（タップ/フリックで確定したかな）を入力 → result
 *  applyModifier()  修飾キー押下 → result
 *  snapshot()       現在の表示用スナップショット
 *
 * result.type: "commit" | "pending" | "miss" | "modify" | "noop"
 *  さらに result.wordClear=true が付くと語がクリアされ次の語に進んだことを表す。
 *  result.finished 概念はUI側のタイマーが持つ（エンジンは時間を持たない）。
 */
function createGame(opts) {
  opts = opts || {};
  var rnd = mulberry32((opts.seed == null ? Date.now() : opts.seed) >>> 0);
  var source = opts.words || [];
  var queue = [];

  var st = {
    word: null,        // {k, l}
    chars: [],         // 現在の語のかな配列
    index: 0,          // 次に入力すべき文字の位置
    pending: null,     // 変化待ち仮入力文字 or null
    wordHadMistake: false,
    score: 0,
    combo: 0,
    maxCombo: 0,
    miss: 0,
    kanaCount: 0,      // コミット済みかな数
    wordsCleared: 0
  };

  function refill() {
    queue = shuffle(source, rnd);
  }

  function nextWord() {
    if (queue.length === 0) refill();
    st.word = queue.shift() || { k: "", l: "" };
    st.chars = st.word.k.split("");
    st.index = 0;
    st.pending = null;
    st.wordHadMistake = false;
  }

  function expected() {
    return st.index < st.chars.length ? st.chars[st.index] : null;
  }

  // 1文字コミット（正解確定時の共通処理）。§5スコア。
  function commitChar() {
    st.score += 10 + Math.floor(Math.min(st.combo, 100) / 10);
    st.combo += 1;
    if (st.combo > st.maxCombo) st.maxCombo = st.combo;
    st.kanaCount += 1;
    st.index += 1;
    st.pending = null;
    // 語クリア判定
    if (st.index >= st.chars.length) {
      var len = st.chars.length;
      st.score += len * 5;
      if (!st.wordHadMistake) st.score += 20;
      st.wordsCleared += 1;
      var clearedWord = st.word;
      nextWord();
      return { wordClear: true, clearedWord: clearedWord };
    }
    return { wordClear: false };
  }

  function inputChar(c) {
    var exp = expected();
    if (exp == null) return { type: "noop" };

    if (c === exp) {
      var r = commitChar();
      return { type: "commit", char: c, wordClear: r.wordClear, clearedWord: r.clearedWord };
    }
    // 基本形が一致（例: expected=っ, c=つ）→ pendingに置く（ミスにしない）
    if (baseForm(exp) === c) {
      st.pending = c;
      return { type: "pending", char: c };
    }
    // それ以外 → ミス
    st.miss += 1;
    st.combo = 0;
    st.pending = null;
    st.wordHadMistake = true;
    return { type: "miss", char: c };
  }

  function applyModifier() {
    if (st.pending == null) return { type: "noop" };
    st.pending = cycle(st.pending);
    var exp = expected();
    if (st.pending === exp) {
      var r = commitChar();
      return { type: "commit", byModifier: true, wordClear: r.wordClear, clearedWord: r.clearedWord };
    }
    return { type: "modify", pending: st.pending };
  }

  function snapshot() {
    return {
      word: st.word,
      chars: st.chars.slice(),
      index: st.index,
      pending: st.pending,
      score: st.score,
      combo: st.combo,
      maxCombo: st.maxCombo,
      miss: st.miss,
      kanaCount: st.kanaCount,
      wordsCleared: st.wordsCleared
    };
  }

  // KPM = 入力かな数 ÷ 経過分。60秒固定なら durationMin=1。
  function result(durationMin) {
    var dm = durationMin || 1;
    return {
      score: st.score,
      kpm: Math.round(st.kanaCount / dm),
      maxCombo: st.maxCombo,
      miss: st.miss,
      kanaCount: st.kanaCount,
      wordsCleared: st.wordsCleared,
      title: titleFor(st.score)
    };
  }

  nextWord();

  return {
    inputChar: inputChar,
    applyModifier: applyModifier,
    snapshot: snapshot,
    result: result,
    _state: st // テスト・デバッグ用
  };
}

var FlickEngine = {
  FLICK_MAP: FLICK_MAP,
  KEY_LAYOUT: KEY_LAYOUT,
  CYCLE_GROUPS: CYCLE_GROUPS,
  TITLES: TITLES,
  resolveFlick: resolveFlick,
  cycle: cycle,
  baseForm: baseForm,
  titleFor: titleFor,
  createGame: createGame,
  mulberry32: mulberry32,
  shuffle: shuffle
};

if (typeof module !== "undefined" && module.exports) module.exports = FlickEngine;
if (typeof window !== "undefined") window.FlickEngine = FlickEngine;

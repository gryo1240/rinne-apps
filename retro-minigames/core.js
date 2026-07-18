"use strict";
/*
 * りんねの8bitミニゲーム集 共通部品
 * - PALETTE / PIXEL_FONT は純データ（Node検算可能）
 * - Sfx / Store はブラウザ専用（typeof window ガード）
 */

/* ============ 16色パレット（全ゲーム共有・仕様書§4） ============ */
var PALETTE = {
  night:   "#0b0e1d", // 夜空(背景)
  night2:  "#1a2140", // 夜空(明)
  navy:    "#2c3a6e",
  blue:    "#4a5aa8",
  skyblue: "#7b8fd9",
  gold:    "#d9b96a",
  cream:   "#f2e3b3",
  white:   "#e8e6dd",
  red:     "#c9314b",
  orange:  "#e08a3c",
  green:   "#5aa04a",
  lime:    "#8fd97b",
  purple:  "#7a4fc9",
  pink:    "#d97bb0",
  teal:    "#3aa0a0",
  black:   "#000000",
};

/* ============ 5×7ビットマップフォント（英数字+記号のみ・和文はDOM側） ============ */
var PIXEL_FONT = {
  "0": ["01110","10001","10011","10101","11001","10001","01110"],
  "1": ["00100","01100","00100","00100","00100","00100","01110"],
  "2": ["01110","10001","00001","00010","00100","01000","11111"],
  "3": ["11111","00010","00100","00010","00001","10001","01110"],
  "4": ["00010","00110","01010","10010","11111","00010","00010"],
  "5": ["11111","10000","11110","00001","00001","10001","01110"],
  "6": ["00110","01000","10000","11110","10001","10001","01110"],
  "7": ["11111","00001","00010","00100","01000","01000","01000"],
  "8": ["01110","10001","10001","01110","10001","10001","01110"],
  "9": ["01110","10001","10001","01111","00001","00010","01100"],
  "A": ["01110","10001","10001","11111","10001","10001","10001"],
  "B": ["11110","10001","10001","11110","10001","10001","11110"],
  "C": ["01110","10001","10000","10000","10000","10001","01110"],
  "D": ["11100","10010","10001","10001","10001","10010","11100"],
  "E": ["11111","10000","10000","11110","10000","10000","11111"],
  "F": ["11111","10000","10000","11110","10000","10000","10000"],
  "G": ["01110","10001","10000","10111","10001","10001","01111"],
  "H": ["10001","10001","10001","11111","10001","10001","10001"],
  "I": ["01110","00100","00100","00100","00100","00100","01110"],
  "J": ["00111","00010","00010","00010","00010","10010","01100"],
  "K": ["10001","10010","10100","11000","10100","10010","10001"],
  "L": ["10000","10000","10000","10000","10000","10000","11111"],
  "M": ["10001","11011","10101","10101","10001","10001","10001"],
  "N": ["10001","11001","10101","10011","10001","10001","10001"],
  "O": ["01110","10001","10001","10001","10001","10001","01110"],
  "P": ["11110","10001","10001","11110","10000","10000","10000"],
  "Q": ["01110","10001","10001","10001","10101","10010","01101"],
  "R": ["11110","10001","10001","11110","10100","10010","10001"],
  "S": ["01111","10000","10000","01110","00001","00001","11110"],
  "T": ["11111","00100","00100","00100","00100","00100","00100"],
  "U": ["10001","10001","10001","10001","10001","10001","01110"],
  "V": ["10001","10001","10001","10001","10001","01010","00100"],
  "W": ["10001","10001","10001","10101","10101","10101","01010"],
  "X": ["10001","10001","01010","00100","01010","10001","10001"],
  "Y": ["10001","10001","01010","00100","00100","00100","00100"],
  "Z": ["11111","00001","00010","00100","01000","10000","11111"],
  " ": ["00000","00000","00000","00000","00000","00000","00000"],
  "!": ["00100","00100","00100","00100","00100","00000","00100"],
  "?": ["01110","10001","00001","00010","00100","00000","00100"],
  ".": ["00000","00000","00000","00000","00000","00100","00100"],
  ":": ["00000","00100","00100","00000","00100","00100","00000"],
  "-": ["00000","00000","00000","11111","00000","00000","00000"],
  "+": ["00000","00100","00100","11111","00100","00100","00000"],
  "♥": ["01010","11111","11111","11111","01110","00100","00000"], // ♥（残機表示）
  ">": ["10000","01000","00100","00010","00100","01000","10000"],
};

var FONT_W = 5, FONT_H = 7;

/* ctxの(x,y)を左上として文字列を描く（未定義文字は空白扱い） */
function drawPixelText(ctx, text, x, y, color, scale) {
  scale = scale || 1;
  ctx.fillStyle = color;
  var cx = x;
  for (var i = 0; i < text.length; i++) {
    var glyph = PIXEL_FONT[text[i]] || PIXEL_FONT[" "];
    for (var r = 0; r < FONT_H; r++) {
      var row = glyph[r];
      for (var c = 0; c < FONT_W; c++) {
        if (row[c] === "1") ctx.fillRect(cx + c * scale, y + r * scale, scale, scale);
      }
    }
    cx += (FONT_W + 1) * scale;
  }
}

/* 文字列の描画幅(px) */
function pixelTextWidth(text, scale) {
  scale = scale || 1;
  if (text.length === 0) return 0;
  return (text.length * (FONT_W + 1) - 1) * scale;
}

/* ============ 効果音（WebAudio自前合成・ブラウザのみ） ============ */
function createSfx() {
  var ctx = null;
  var muted = false;

  function ensure() {
    try {
      if (!ctx) {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        ctx = new AC();
      }
      if (ctx.state === "suspended") { var p = ctx.resume(); if (p && p.catch) p.catch(function () {}); }
      return ctx;
    } catch (e) { return null; }
  }

  function tone(freq, dur, type, vol, delay) {
    if (muted) return;
    var ac = ensure();
    if (!ac) return;
    var t0 = ac.currentTime + (delay || 0);
    var osc = ac.createOscillator();
    var gain = ac.createGain();
    osc.type = type || "square";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol || 0.08, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain).connect(ac.destination);
    osc.start(t0);
    osc.stop(t0 + dur);
  }

  function noise(dur, vol) {
    if (muted) return;
    var ac = ensure();
    if (!ac) return;
    var n = Math.floor(ac.sampleRate * dur);
    var buf = ac.createBuffer(1, n, ac.sampleRate);
    var data = buf.getChannelData(0);
    for (var i = 0; i < n; i++) data[i] = Math.random() * 2 - 1;
    var src = ac.createBufferSource();
    src.buffer = buf;
    var gain = ac.createGain();
    var t0 = ac.currentTime;
    gain.gain.setValueAtTime(vol || 0.06, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(gain).connect(ac.destination);
    src.start(t0);
  }

  return {
    resume: function () { ensure(); },
    setMuted: function (m) { muted = m; },
    isMuted: function () { return muted; },
    tap: function () { tone(880, 0.05, "square", 0.05); },
    ok: function () { tone(660, 0.07, "square", 0.07); tone(990, 0.09, "square", 0.06, 0.06); },
    perfect: function () { tone(660, 0.06, "square", 0.07); tone(880, 0.06, "square", 0.07, 0.05); tone(1320, 0.12, "square", 0.07, 0.10); },
    miss: function () { tone(180, 0.18, "triangle", 0.09); noise(0.12, 0.04); },
    over: function () { tone(392, 0.12, "triangle", 0.08); tone(311, 0.12, "triangle", 0.08, 0.12); tone(233, 0.3, "triangle", 0.08, 0.24); },
    catchFly: function () { tone(1046, 0.06, "square", 0.06); tone(1568, 0.08, "square", 0.05, 0.05); },
    lantern: function (i) { tone([523, 659, 784, 988][i] || 523, 0.16, "triangle", 0.09); },
  };
}

/* ============ スコア保存（localStorage・消えても遊べる） ============ */
var Store = {
  key: function (gameId) { return "retro:" + gameId + ":best"; },
  getBest: function (gameId) {
    try {
      var v = parseInt(localStorage.getItem(Store.key(gameId)), 10);
      return isNaN(v) || v < 0 ? 0 : v;
    } catch (e) { return 0; }
  },
  setBest: function (gameId, score) {
    try {
      if (score > Store.getBest(gameId)) {
        localStorage.setItem(Store.key(gameId), String(score));
        return true;
      }
    } catch (e) { /* プライベートブラウズ等では保存できなくてもよい */ }
    return false;
  },
};

/* ============ export（Node検算用） ============ */
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    PALETTE: PALETTE,
    PIXEL_FONT: PIXEL_FONT,
    FONT_W: FONT_W,
    FONT_H: FONT_H,
    pixelTextWidth: pixelTextWidth,
  };
}

"use strict";
/*
 * りんねの8bitミニゲーム集 純ロジック（DOM/Canvas非依存・Node検算可能）
 * 仕様: .company/game/planning/8bit-minigames-spec.md §2・§3
 *
 * 3ゲームとも「同シード+同入力列→同結果」の決定論を保証する。
 * 時事データ・年次更新項目は一切持たない（作り切り型）。
 */

/* ============ 共通 ============ */
function mulberry32(seed) {
  var a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

/* ============ ① ぴったり満月（タイミング一致） ============ */
var Mangetsu = {
  PERIOD_START: 2600,  // 満ち欠け1周期(ms)
  PERIOD_MIN: 1000,
  PERIOD_DECAY: 0.95,
  TOL_START: 0.10,     // 成功判定の位相許容幅（片側）
  TOL_MIN: 0.035,
  TOL_DECAY: 0.93,
  PERFECT_RATIO: 0.4,  // PERFECT = tol×この係数以内
  LIVES: 3,

  create: function () {
    return {
      phase: 0,               // 0..1（0.5が満月）
      period: Mangetsu.PERIOD_START,
      tol: Mangetsu.TOL_START,
      lives: Mangetsu.LIVES,
      score: 0,
      combo: 0,
      level: 1,
      over: false,
    };
  },

  // dtミリ秒ぶん月を満ち欠けさせる
  advance: function (s, dt) {
    if (s.over) return;
    s.phase = (s.phase + dt / s.period) % 1;
  },

  // タップ判定。戻り値: "perfect" | "ok" | "miss"
  tap: function (s) {
    if (s.over) return "miss";
    var dist = Math.abs(s.phase - 0.5);
    var kind;
    if (dist <= s.tol * Mangetsu.PERFECT_RATIO) kind = "perfect";
    else if (dist <= s.tol) kind = "ok";
    else kind = "miss";

    if (kind === "miss") {
      s.lives -= 1;
      s.combo = 0;
      if (s.lives <= 0) { s.lives = 0; s.over = true; }
      return kind;
    }
    s.combo += 1;
    var base = kind === "perfect" ? 200 : 100;
    s.score += base + 10 * (s.combo - 1);
    s.level += 1;
    s.period = Math.max(Mangetsu.PERIOD_MIN, s.period * Mangetsu.PERIOD_DECAY);
    s.tol = Math.max(Mangetsu.TOL_MIN, s.tol * Mangetsu.TOL_DECAY);
    // 成功後は新月から仕切り直し（連打で二重成功しないように）
    s.phase = 0;
    return kind;
  },
};

/* ============ ② ほたる集め（反射タップ） ============ */
var Hotaru = {
  SPAWN_START: 1400,   // 出現間隔(ms)
  SPAWN_MIN: 550,
  LIFE_START: 2200,    // 光っている時間(ms)
  LIFE_MIN: 900,
  DECAY: 0.97,         // 1匹捕まえるごとの短縮率
  MAX_ON: 3,           // 同時最大匹数
  HIT_R: 18,           // タップ判定半径（基準解像度px）
  LIVES: 3,
  // 出現範囲（基準解像度192×256。HUDと下端を避ける）
  X_MIN: 20, X_MAX: 172, Y_MIN: 60, Y_MAX: 226,

  create: function (opts) {
    opts = opts || {};
    return {
      rnd: mulberry32(opts.seed != null ? opts.seed : 1),
      t: 0,
      nextSpawnAt: 600,   // 開始600ms後に1匹目
      fireflies: [],      // {x, y, age, life}
      caught: 0,
      lives: Hotaru.LIVES,
      score: 0,
      combo: 0,
      over: false,
    };
  },

  spawnIntervalFor: function (caught) {
    return Math.max(Hotaru.SPAWN_MIN, Hotaru.SPAWN_START * Math.pow(Hotaru.DECAY, caught));
  },

  lifespanFor: function (caught) {
    return Math.max(Hotaru.LIFE_MIN, Hotaru.LIFE_START * Math.pow(Hotaru.DECAY, caught));
  },

  // dtミリ秒進める。期限切れで消えた数だけ残機が減る
  advance: function (s, dt) {
    if (s.over) return;
    s.t += dt;

    // 加齢と期限切れ（先に既存個体を進めてから出現させる。同ティック出現の個体が加齢しないように）
    for (var i = s.fireflies.length - 1; i >= 0; i--) {
      var f = s.fireflies[i];
      f.age += dt;
      if (f.age >= f.life) {
        s.fireflies.splice(i, 1);
        s.lives -= 1;
        s.combo = 0;
        if (s.lives <= 0) { s.lives = 0; s.over = true; return; }
      }
    }

    // 出現
    if (s.t >= s.nextSpawnAt) {
      if (s.fireflies.length < Hotaru.MAX_ON) {
        var x = Hotaru.X_MIN + s.rnd() * (Hotaru.X_MAX - Hotaru.X_MIN);
        var y = Hotaru.Y_MIN + s.rnd() * (Hotaru.Y_MAX - Hotaru.Y_MIN);
        s.fireflies.push({ x: x, y: y, age: 0, life: Hotaru.lifespanFor(s.caught) });
      }
      // 満員でも次回時刻は更新する（詰まり防止）
      s.nextSpawnAt = s.t + Hotaru.spawnIntervalFor(s.caught);
    }
  },

  // タップ判定。捕まえたら true
  tap: function (s, x, y) {
    if (s.over) return false;
    var bestIdx = -1, bestD = Infinity;
    for (var i = 0; i < s.fireflies.length; i++) {
      var f = s.fireflies[i];
      var d = Math.hypot(f.x - x, f.y - y);
      if (d <= Hotaru.HIT_R && d < bestD) { bestD = d; bestIdx = i; }
    }
    if (bestIdx < 0) return false; // 空振りはペナルティなし（指の誤差を許容）
    s.fireflies.splice(bestIdx, 1);
    s.caught += 1;
    s.combo += 1;
    s.score += 100 + 10 * (s.combo - 1);
    return true;
  },
};

/* ============ ③ ちょうちん暗記（サイモン型） ============ */
var Chochin = {
  N_LANTERNS: 4,
  SHOW_START: 520,   // 1灯の点灯時間(ms)
  SHOW_MIN: 220,
  GAP_START: 160,    // 点灯の間隔(ms)
  GAP_MIN: 80,
  DECAY: 0.93,

  create: function (opts) {
    opts = opts || {};
    return {
      rnd: mulberry32(opts.seed != null ? opts.seed : 1),
      seq: [],
      round: 0,        // 現在のラウンド（=seqの長さ）
      inputIdx: 0,
      score: 0,
      over: false,
    };
  },

  showDuration: function (round) {
    return Math.max(Chochin.SHOW_MIN, Chochin.SHOW_START * Math.pow(Chochin.DECAY, round - 1));
  },

  gapDuration: function (round) {
    return Math.max(Chochin.GAP_MIN, Chochin.GAP_START * Math.pow(Chochin.DECAY, round - 1));
  },

  // 新しいラウンドを開始（手順を1つ追加）。UI側はこのあと再生演出を行う
  startRound: function (s) {
    if (s.over) return null;
    s.seq.push(Math.floor(s.rnd() * Chochin.N_LANTERNS));
    s.round = s.seq.length;
    s.inputIdx = 0;
    return s.seq.slice();
  },

  // 提灯 i (0..3) を押した。戻り値: "ok" | "complete" | "wrong"
  press: function (s, i) {
    if (s.over) return "wrong";
    if (i !== s.seq[s.inputIdx]) {
      s.over = true;
      return "wrong";
    }
    s.inputIdx += 1;
    if (s.inputIdx >= s.seq.length) {
      s.score = s.round * 100;
      return "complete";
    }
    return "ok";
  },
};

/* ============ シェア文 ============ */
function shareText(gameTitle, score, url) {
  return "りんねの8bitミニゲーム集「" + gameTitle + "」で " + score + "点をとりました🌙\n" + url;
}

/* ============ export（Node検算用） ============ */
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    mulberry32: mulberry32,
    clamp: clamp,
    Mangetsu: Mangetsu,
    Hotaru: Hotaru,
    Chochin: Chochin,
    shareText: shareText,
  };
}

"use strict";
/*
 * りんねの8bitミニゲーム集 UI層（シェル + 3ゲームの描画・入力）
 * 純ロジックは logic.js（Mangetsu/Hotaru/Chochin）。ここはCanvas描画とDOM遷移のみ。
 * 基準解像度 192×256 のオフスクリーンに等倍描画し、表示Canvasへ整数倍拡大する（仕様書§4）。
 */
(function () {
  var BASE_W = 192, BASE_H = 256;
  var P = PALETTE;
  var SHARE_URL = "https://rinne-blog.com/retro-minigames"; // 2026-07-19 公開確定(想定どおりのスラッグ)

  /* ============ 効果音・保存 ============ */
  var sfx = createSfx();
  try { sfx.setMuted(localStorage.getItem("retro:muted") === "1"); } catch (e) {}

  /* ============ DOM ============ */
  var $ = function (id) { return document.getElementById(id); };
  var scrMenu = $("scrMenu"), scrGame = $("scrGame"), scrResult = $("scrResult");
  var howto = $("howto"), howtoTitle = $("howtoTitle"), howtoBody = $("howtoBody");
  var cv = $("cv"), ctx = cv.getContext("2d");
  var off = document.createElement("canvas");
  off.width = BASE_W; off.height = BASE_H;
  var octx = off.getContext("2d");

  /* ============ 表示スケール（デバイスピクセル整数倍・にじみ防止） ============ */
  var dispScale = 1;
  function fitCanvas() {
    var boxW = $("canvasBox").clientWidth || BASE_W;
    var dpr = window.devicePixelRatio || 1;
    var target = Math.min(boxW, 400);
    dispScale = Math.max(1, Math.floor((target * dpr) / BASE_W));
    cv.width = BASE_W * dispScale;
    cv.height = BASE_H * dispScale;
    cv.style.width = (BASE_W * dispScale / dpr) + "px";
    cv.style.height = (BASE_H * dispScale / dpr) + "px";
    ctx.imageSmoothingEnabled = false;
  }
  window.addEventListener("resize", function () { if (!scrGame.hidden) fitCanvas(); });

  function blit() {
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.drawImage(off, 0, 0, cv.width, cv.height);
  }

  /* ============ 共通描画部品 ============ */
  function makeStars(seed, n, yMax) {
    var rnd = mulberry32(seed);
    var stars = [];
    for (var i = 0; i < n; i++) {
      stars.push({ x: Math.floor(rnd() * BASE_W), y: Math.floor(rnd() * (yMax || BASE_H)), big: rnd() < 0.2 });
    }
    return stars;
  }
  function drawStars(g, stars, t) {
    for (var i = 0; i < stars.length; i++) {
      var s = stars[i];
      // ゆっくり明滅（インデックスで位相をずらす）
      var tw = Math.sin(t / 900 + i * 1.7) > -0.3;
      g.fillStyle = tw ? P.white : P.blue;
      g.fillRect(s.x, s.y, 1, 1);
      if (s.big) { g.fillRect(s.x - 1, s.y, 1, 1); g.fillRect(s.x + 1, s.y, 1, 1); g.fillRect(s.x, s.y - 1, 1, 1); g.fillRect(s.x, s.y + 1, 1, 1); }
    }
  }
  function drawHUD(g, score, lives) {
    drawPixelText(g, "SC " + score, 4, 4, P.cream, 1);
    var hearts = "";
    for (var i = 0; i < lives; i++) hearts += "♥";
    if (hearts) drawPixelText(g, hearts, BASE_W - 4 - pixelTextWidth(hearts, 1), 4, P.red, 1);
  }
  function centerText(g, text, y, color, scale) {
    drawPixelText(g, text, Math.floor((BASE_W - pixelTextWidth(text, scale)) / 2), y, color, scale);
  }
  // 浮かぶ「+100」等のポップアップ
  function makePopups() {
    var list = [];
    return {
      add: function (text, x, y, color) { list.push({ t: text, x: x, y: y, c: color || P.cream, ttl: 700 }); },
      update: function (dt) { for (var i = list.length - 1; i >= 0; i--) { list[i].ttl -= dt; list[i].y -= dt * 0.012; if (list[i].ttl <= 0) list.splice(i, 1); } },
      render: function (g) {
        for (var i = 0; i < list.length; i++) {
          var p = list[i];
          var x = clamp(Math.floor(p.x - pixelTextWidth(p.t, 1) / 2), 2, BASE_W - 2 - pixelTextWidth(p.t, 1));
          drawPixelText(g, p.t, x, Math.max(2, Math.floor(p.y)), p.c, 1);
        }
      },
    };
  }

  /* ============ ① ぴったり満月 ============ */
  function createMangetsuUI(api) {
    var M = Mangetsu;
    var s, stars, popups, msg, msgTtl, msgColor, t, overAt, cool;
    var CX = 96, CY = 114, R = 34;

    function start() {
      s = M.create();
      stars = makeStars(11, 40, BASE_H - 40);
      popups = makePopups();
      msg = ""; msgTtl = 0; t = 0; overAt = 0; cool = 0;
    }
    function update(dt) {
      t += dt;
      if (cool > 0) cool -= dt;
      if (s.over) {
        if (!overAt) { overAt = t; sfx.over(); }
        if (t - overAt > 1200) api.finish(s.score);
        return;
      }
      M.advance(s, dt);
      popups.update(dt);
      if (msgTtl > 0) msgTtl -= dt;
    }
    function pointer() {
      if (s.over) return;
      if (cool > 0) return; // 成功直後の連打・2本指タップを誤MISSにしない
      var kind = M.tap(s);
      if (kind !== "miss") cool = 200;
      if (kind === "perfect") { msg = "PERFECT!"; msgColor = P.gold; sfx.perfect(); popups.add("+" + (200 + 10 * (s.combo - 1)), CX, CY - R - 12, P.gold); }
      else if (kind === "ok") { msg = "OK!"; msgColor = P.lime; sfx.ok(); popups.add("+" + (100 + 10 * (s.combo - 1)), CX, CY - R - 12, P.lime); }
      else { msg = "MISS"; msgColor = P.red; sfx.miss(); }
      msgTtl = 650;
    }
    function drawMoon(g) {
      var ratio = 1 - Math.abs(s.phase - 0.5) * 2; // 0=新月 1=満月
      var waxing = s.phase < 0.5;
      var inWindow = Math.abs(s.phase - 0.5) <= s.tol;
      for (var dy = -R; dy <= R; dy++) {
        var w = Math.floor(Math.sqrt(R * R - dy * dy));
        for (var dx = -w; dx <= w; dx++) {
          var edge = (dx * dx + dy * dy) >= (R - 2) * (R - 2);
          var lit = waxing ? (dx >= w * (1 - 2 * ratio)) : (dx <= -w * (1 - 2 * ratio));
          if (edge) g.fillStyle = inWindow ? P.gold : P.blue;
          else if (lit) g.fillStyle = P.cream;
          else g.fillStyle = P.navy;
          g.fillRect(CX + dx, CY + dy, 1, 1);
        }
      }
      // 満月圏内はきらめき
      if (inWindow) {
        g.fillStyle = P.gold;
        g.fillRect(CX - R - 5, CY, 2, 2); g.fillRect(CX + R + 3, CY, 2, 2);
        g.fillRect(CX, CY - R - 5, 2, 2); g.fillRect(CX, CY + R + 3, 2, 2);
      }
    }
    function render(g) {
      g.fillStyle = P.night; g.fillRect(0, 0, BASE_W, BASE_H);
      drawStars(g, stars, t);
      drawMoon(g);
      drawHUD(g, s.score, s.lives);
      if (s.combo >= 2) drawPixelText(g, "COMBO X" + s.combo, 4, 14, P.skyblue, 1);
      drawPixelText(g, "LV " + s.level, BASE_W - 4 - pixelTextWidth("LV " + s.level, 1), 14, P.skyblue, 1);
      if (msgTtl > 0) centerText(g, msg, 176, msgColor, 2);
      if (!s.over) {
        if (Math.floor(t / 500) % 2 === 0) centerText(g, "TAP!", 216, P.cream, 2);
      } else {
        centerText(g, "GAME OVER", 210, P.red, 2);
      }
      popups.render(g);
    }
    return { start: start, update: update, render: render, pointer: pointer };
  }

  /* ============ ② ほたる集め ============ */
  function createHotaruUI(api) {
    var H = Hotaru;
    var s, stars, popups, t, overAt, seed;

    function start() {
      seed = (Date.now() % 2147483647) >>> 0;
      s = H.create({ seed: seed });
      stars = makeStars(23, 26, 60);
      popups = makePopups();
      t = 0; overAt = 0;
    }
    function update(dt) {
      t += dt;
      if (s.over) {
        if (!overAt) { overAt = t; sfx.over(); }
        if (t - overAt > 1200) api.finish(s.score);
        return;
      }
      var before = s.lives;
      H.advance(s, dt);
      if (s.lives < before) { sfx.miss(); }
      popups.update(dt);
    }
    function pointer(x, y) {
      if (s.over) return;
      var comboBefore = s.combo;
      if (H.tap(s, x, y)) {
        sfx.catchFly();
        popups.add("+" + (100 + 10 * comboBefore), x, y - 10, P.lime);
      }
    }
    function drawGround(g) {
      g.fillStyle = P.night2; g.fillRect(0, 236, BASE_W, 20);
      g.fillStyle = P.green;
      for (var x = 2; x < BASE_W; x += 10) {
        g.fillRect(x, 232, 1, 4); g.fillRect(x + 4, 234, 1, 2); g.fillRect(x + 7, 230, 1, 6);
      }
    }
    function drawFirefly(g, f) {
      var frac = f.age / f.life; // 0→1で消える
      // 終盤は点滅
      if (frac > 0.75 && Math.floor(f.age / 130) % 2 === 0) return;
      var cx = Math.floor(f.x), cy = Math.floor(f.y);
      // 光暈（新鮮なほど大きい）
      if (frac < 0.5) {
        g.fillStyle = P.gold;
        g.fillRect(cx - 3, cy - 1, 1, 3); g.fillRect(cx + 3, cy - 1, 1, 3);
        g.fillRect(cx - 1, cy - 3, 3, 1); g.fillRect(cx - 1, cy + 3, 3, 1);
      }
      g.fillStyle = frac < 0.5 ? P.lime : P.gold;
      g.fillRect(cx - 1, cy - 1, 3, 3);
      g.fillStyle = P.cream;
      g.fillRect(cx, cy, 1, 1);
    }
    function render(g) {
      g.fillStyle = P.night; g.fillRect(0, 0, BASE_W, BASE_H);
      drawStars(g, stars, t);
      drawGround(g);
      for (var i = 0; i < s.fireflies.length; i++) drawFirefly(g, s.fireflies[i]);
      drawHUD(g, s.score, s.lives);
      if (s.combo >= 2) drawPixelText(g, "COMBO X" + s.combo, 4, 14, P.skyblue, 1);
      if (s.over) centerText(g, "GAME OVER", 120, P.red, 2);
      else if (t < 2000) centerText(g, "CATCH!", 32, P.cream, 2); // 出現領域(Y60〜)を隠さない位置
      popups.render(g);
    }
    return { start: start, update: update, render: render, pointer: pointer };
  }

  /* ============ ③ ちょうちん暗記 ============ */
  function createChochinUI(api) {
    var Ch = Chochin;
    // 提灯の配置（2×2）とパレット上の色
    var SPOTS = [
      { x: 34, y: 78 }, { x: 118, y: 78 },
      { x: 34, y: 162 }, { x: 118, y: 162 },
    ];
    var LW = 40, LH = 56;
    var COLORS = [
      { base: P.red, lit: P.pink },
      { base: P.gold, lit: P.cream },
      { base: P.green, lit: P.lime },
      { base: P.blue, lit: P.skyblue },
    ];
    var s, stars, t, overAt, seed;
    var mode, modeT, playIdx, litNow, litTtl, wrongIdx, banner, bannerTtl;

    function start() {
      seed = (Date.now() % 2147483647) >>> 0;
      s = Ch.create({ seed: seed });
      stars = makeStars(37, 30, 60);
      t = 0; overAt = 0;
      litNow = -1; litTtl = 0; wrongIdx = -1;
      nextRound();
    }
    function nextRound() {
      Ch.startRound(s);
      banner = "ROUND " + s.round; bannerTtl = 900;
      mode = "banner"; modeT = 0; playIdx = 0;
    }
    function update(dt) {
      t += dt; modeT += dt;
      if (litTtl > 0) { litTtl -= dt; if (litTtl <= 0) litNow = -1; }
      if (bannerTtl > 0) bannerTtl -= dt;

      if (s.over) {
        if (!overAt) { overAt = t; sfx.over(); }
        if (t - overAt > 1400) api.finish(s.score);
        return;
      }
      if (mode === "banner") {
        if (modeT >= 950) { mode = "show"; modeT = 0; playIdx = 0; }
      } else if (mode === "show") {
        // 手順をひとつずつ光らせる
        var showD = Ch.showDuration(s.round), gapD = Ch.gapDuration(s.round);
        var step = showD + gapD;
        var idx = Math.floor(modeT / step);
        var inShow = (modeT % step) < showD;
        if (idx < s.seq.length) {
          if (inShow && litNow !== s.seq[idx]) { litNow = s.seq[idx]; litTtl = showD; sfx.lantern(s.seq[idx]); }
        } else {
          mode = "input"; modeT = 0; litNow = -1;
        }
      } else if (mode === "complete") {
        if (modeT >= 750) nextRound();
      }
      // mode === "input" はpointer待ち
    }
    function lanternAt(x, y) {
      for (var i = 0; i < SPOTS.length; i++) {
        var sp = SPOTS[i];
        if (x >= sp.x - 2 && x <= sp.x + LW + 2 && y >= sp.y - 2 && y <= sp.y + LH + 2) return i;
      }
      return -1;
    }
    function pointer(x, y) {
      if (s.over || mode !== "input") return;
      var i = lanternAt(x, y);
      if (i < 0) return;
      litNow = i; litTtl = 220;
      var r = Ch.press(s, i);
      if (r === "wrong") {
        wrongIdx = i;
        sfx.miss();
      } else {
        sfx.lantern(i);
        if (r === "complete") { mode = "complete"; modeT = 0; }
      }
    }
    function drawLantern(g, i) {
      var sp = SPOTS[i], c = COLORS[i];
      var isLit = litNow === i;
      var x = sp.x, y = sp.y;
      // 吊り紐
      g.fillStyle = P.navy; g.fillRect(x + LW / 2 - 1, y - 8, 2, 8);
      // 上下のふた
      g.fillStyle = P.gold;
      g.fillRect(x + 8, y, LW - 16, 5);
      g.fillRect(x + 8, y + LH - 5, LW - 16, 5);
      // 胴体
      g.fillStyle = isLit ? c.lit : P.night2;
      g.fillRect(x + 2, y + 7, LW - 4, LH - 14);
      // 胴体のふち
      g.fillStyle = c.base;
      g.fillRect(x + 2, y + 5, LW - 4, 2); g.fillRect(x + 2, y + LH - 7, LW - 4, 2);
      g.fillRect(x, y + 7, 2, LH - 14); g.fillRect(x + LW - 2, y + 7, 2, LH - 14);
      // 骨(横線)
      g.fillStyle = isLit ? c.base : P.navy;
      for (var ly = y + 13; ly < y + LH - 9; ly += 8) g.fillRect(x + 3, ly, LW - 6, 1);
      // 光
      if (isLit) {
        g.fillStyle = c.lit;
        g.fillRect(x - 4, y + LH / 2 - 2, 3, 4); g.fillRect(x + LW + 1, y + LH / 2 - 2, 3, 4);
        g.fillRect(x + LW / 2 - 2, y - 12, 4, 3);
      }
      // 間違えた提灯に×
      if (wrongIdx === i) {
        drawPixelText(g, "X", x + LW / 2 - 5, y + LH / 2 - 7, P.red, 2);
      }
    }
    function render(g) {
      g.fillStyle = P.night; g.fillRect(0, 0, BASE_W, BASE_H);
      drawStars(g, stars, t);
      for (var i = 0; i < 4; i++) drawLantern(g, i);
      drawPixelText(g, "SC " + s.score, 4, 4, P.cream, 1);
      drawPixelText(g, "R " + s.round, BASE_W - 4 - pixelTextWidth("R " + s.round, 1), 4, P.skyblue, 1);
      if (bannerTtl > 0 && !s.over) centerText(g, banner, 34, P.cream, 2);
      else if (mode === "show" && !s.over) centerText(g, "LOOK...", 34, P.skyblue, 1);
      else if (mode === "input" && !s.over) centerText(g, "YOUR TURN!", 34, P.gold, 1);
      else if (mode === "complete" && !s.over) centerText(g, "OK!", 34, P.lime, 2);
      if (s.over) centerText(g, "GAME OVER", 236, P.red, 1);
      else centerText(g, "ROUND " + s.round, 244, P.navy, 1);
    }
    return { start: start, update: update, render: render, pointer: pointer };
  }

  /* ============ レジストリ ============ */
  var REGISTRY = [
    {
      id: "mangetsu",
      title: "ぴったり満月",
      desc: "満ち欠けする月が「満月」になった瞬間にタップ！だんだん速くなるタイミングゲーム",
      color: "#d9b96a",
      howto: "月が 新月→満月→新月 と満ち欠けをくり返します。<br><b>まんまるの満月になった瞬間</b>に画面をタップ！<br><br>・ど真ん中なら PERFECT(200点)、おしければ OK(100点)<br>・外すと残機が1つ減ります(残機3)<br>・成功するたび、月はどんどん速くなります",
      create: createMangetsuUI,
    },
    {
      id: "hotaru",
      title: "ほたる集め",
      desc: "光っては消えるほたるを、消える前にタップで捕まえる反射神経ゲーム",
      color: "#8fd97b",
      howto: "夜の野原に、ほたるが1匹ずつ光って現れます。<br><b>暗くなって消えてしまう前にタップ</b>で捕まえよう！<br><br>・捕まえると100点+コンボボーナス<br>・逃がすと残機が1つ減ります(残機3)<br>・捕まえるほど、ほたるはせっかちになります",
      create: createHotaruUI,
    },
    {
      id: "chochin",
      title: "ちょうちん暗記",
      desc: "光った順番を覚えて同じ順にタップ。1つずつ増えていく記憶力ゲーム",
      color: "#c9314b",
      howto: "4つの提灯(ちょうちん)が順番に光ります。<br>光った順番を覚えて、<b>同じ順にタップ</b>！<br><br>・ラウンドごとに手順が1つずつ増えます<br>・間違えた時点でゲームオーバー<br>・音が出なくても色と光で遊べます",
      create: createChochinUI,
    },
  ];

  /* ============ シェル（画面遷移・ゲームループ） ============ */
  var current = null;      // {def, inst}
  var rafId = 0, lastTs = 0, running = false, startedAt = 0;

  function show(el) { el.hidden = false; }
  function hide(el) { el.hidden = true; }

  function buildMenu() {
    var box = $("menuCards");
    box.innerHTML = "";
    REGISTRY.forEach(function (def) {
      var b = document.createElement("button");
      b.className = "gcard";
      b.style.borderLeftColor = def.color;
      b.setAttribute("data-game", def.id);
      var best = Store.getBest(def.id);
      b.innerHTML = '<span class="gt">' + def.title + '</span><span class="gd">' + def.desc + '</span>' +
        '<span class="gb">ベスト: ' + best + '点</span>';
      b.addEventListener("click", function () { sfx.resume(); openGame(def); });
      box.appendChild(b);
    });
  }

  function openGame(def) {
    current = { def: def, inst: def.create(shellApi) };
    hide(scrMenu); hide(scrResult); show(scrGame);
    $("gameName").textContent = def.title;
    howtoTitle.textContent = def.title;
    howtoBody.innerHTML = def.howto;
    fitCanvas();
    // 遊び方の背後に初期画面を1フレーム描いておく
    octx.fillStyle = P.night; octx.fillRect(0, 0, BASE_W, BASE_H);
    blit();
    show(howto);
  }

  function startPlay() {
    if (running) return; // 二重起動でrAFループが2本走るのを防ぐ
    hide(howto);
    current.inst.start();
    running = true;
    lastTs = 0;
    startedAt = performance.now();
    rafId = requestAnimationFrame(loop);
  }

  function stopPlay() {
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
  }

  function loop(ts) {
    if (!running) return;
    if (!lastTs) lastTs = ts;
    var dt = clamp(ts - lastTs, 0, 50); // dtクランプ（仕様書§3）
    lastTs = ts;
    current.inst.update(dt);
    if (running) {
      current.inst.render(octx);
      blit();
      rafId = requestAnimationFrame(loop);
    }
  }

  var shellApi = {
    finish: function (score) {
      stopPlay();
      var def = current.def;
      var isNew = Store.setBest(def.id, score);
      hide(scrGame);
      $("resTitle").textContent = def.title;
      $("resScore").textContent = String(score);
      $("resBest").textContent = String(Store.getBest(def.id));
      $("resNew").hidden = !isNew;
      $("shareDone").textContent = "";
      hide($("shareFallback"));
      scrResult.dataset.score = String(score);
      show(scrResult);
    },
  };

  /* ============ 入力 ============ */
  cv.addEventListener("pointerdown", function (e) {
    e.preventDefault();
    if (!current || !running) return;
    if (performance.now() - startedAt < 200) return; // スタートボタン二度タップの流れ込み防止
    var rect = cv.getBoundingClientRect();
    var x = (e.clientX - rect.left) * BASE_W / rect.width;
    var y = (e.clientY - rect.top) * BASE_H / rect.height;
    current.inst.pointer(x, y);
  });

  $("btnStart").addEventListener("click", function () { sfx.resume(); startPlay(); });
  $("btnQuit").addEventListener("click", function () {
    stopPlay();
    hide(scrGame); hide(howto); show(scrMenu);
    buildMenu();
    current = null;
  });
  $("btnRetry").addEventListener("click", function () {
    hide(scrResult); show(scrGame);
    fitCanvas();
    startPlay();
  });
  $("btnMenu").addEventListener("click", function () {
    hide(scrResult); show(scrMenu);
    buildMenu();
    current = null;
  });
  $("btnShare").addEventListener("click", function () {
    var score = parseInt(scrResult.dataset.score || "0", 10);
    var text = shareText(current.def.title, score, SHARE_URL);
    function fallback() {
      var ta = $("shareFallback");
      ta.value = text;
      show(ta);
      ta.select();
      $("shareDone").textContent = "コピーできない場合は、上の文章を長押しでコピーしてください";
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        $("shareDone").textContent = "コピーしました！SNSに貼り付けてシェアできます";
      }, fallback);
    } else { fallback(); }
  });

  var btnMute = $("btnMute");
  function renderMute() { btnMute.textContent = sfx.isMuted() ? "🔇" : "🔊"; }
  btnMute.addEventListener("click", function () {
    sfx.setMuted(!sfx.isMuted());
    try { localStorage.setItem("retro:muted", sfx.isMuted() ? "1" : "0"); } catch (e) {}
    renderMute();
  });

  /* ============ 起動 ============ */
  renderMute();
  buildMenu();
})();

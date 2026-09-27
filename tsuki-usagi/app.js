"use strict";
/*
 * 月うさぎのすみか - UI層
 * ロジックは logic.js(純関数)に集約。ここはDOM操作・演出のみ。
 * 検証用: URLに ?t=2026-07-12T20:00 を付けるとその時刻として起動する(オフセット固定)
 */
(function () {
  var KEY = "tsukiusagi:state";
  var PAGE_URL = "https://rinne-blog.com/tsuki-usagi";

  // ===== 時刻(?t= 検証用オーバーライド) =====
  var timeOffset = 0;
  (function () {
    var m = /[?&]t=([^&]+)/.exec(location.search);
    if (m) {
      var forced = new Date(decodeURIComponent(m[1])).getTime();
      if (!isNaN(forced)) timeOffset = forced - Date.now();
    }
  })();
  function now() { return Date.now() + timeOffset; }
  function tz() { return new Date().getTimezoneOffset(); }

  // ===== 状態の保存/読込(localStorage不可時はメモリで継続) =====
  var memoryStore = null;
  function rawLoad() {
    try { return localStorage.getItem(KEY); } catch (e) { return memoryStore; }
  }
  function rawSave(json) {
    memoryStore = json;
    try { localStorage.setItem(KEY, json); } catch (e) { /* プライベートモード等 */ }
  }
  var state = null;
  function load() {
    var json = rawLoad();
    state = null;
    if (json) {
      try { state = TSUKI.migrate(JSON.parse(json), now(), tz()); } catch (e) { state = null; }
    }
    if (!state) state = TSUKI.newState(now(), tz());
    try {
      TSUKI.simulate(state, now(), tz());
    } catch (e) {
      // 破損状態で起動不能になるくらいなら新規で迎え直す
      state = TSUKI.newState(now(), tz());
    }
    save();
  }
  // HTMLエスケープ(ユーザー由来文字列をinnerHTMLに混ぜる時は必ず通す)
  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function save() { rawSave(JSON.stringify(state)); }

  // ===== DOM =====
  function $(id) { return document.getElementById(id); }
  var scene = $("scene"), rabbitWrap = $("rabbitWrap"), bubbleEl = $("bubble");

  // ===== 月SVG(8区分の固定パス。座標系72x72・半径33) =====
  var MOON_LIT = "#fbf0d2", MOON_DARK = "rgba(58,68,108,0.55)"; // 2026-09-27 切り絵の紙の色に
  var MOON_PATHS = {
    new: null,
    crescent: "M36,3 A33,33 0 0 1 36,69 A24,33 0 0 0 36,3 Z",
    firstQuarter: "M36,3 A33,33 0 0 1 36,69 L36,3 Z",
    gibbous: "M36,3 A33,33 0 0 1 36,69 A24,33 0 0 1 36,3 Z",
    full: "M36,3 A33,33 0 0 1 36,69 A33,33 0 0 1 36,3 Z",
    waningGibbous: "M36,3 A33,33 0 0 0 36,69 A24,33 0 0 0 36,3 Z",
    lastQuarter: "M36,3 A33,33 0 0 0 36,69 L36,3 Z",
    waningCrescent: "M36,3 A33,33 0 0 0 36,69 A24,33 0 0 1 36,3 Z"
  };
  function renderMoon(phase) {
    var svg = '<svg width="72" height="72" viewBox="0 0 72 72">';
    svg += '<circle cx="36" cy="36" r="33" fill="' + MOON_DARK + '"/>';
    if (MOON_PATHS[phase]) svg += '<path d="' + MOON_PATHS[phase] + '" fill="' + MOON_LIT + '"/>';
    else svg += '<circle cx="36" cy="36" r="33" fill="none" stroke="rgba(245,230,184,0.35)" stroke-width="1.5"/>';
    svg += "</svg>";
    $("moonBox").innerHTML = svg;
  }

  // ===== 星(決定論配置・新月は増量) =====
  function renderStars(band, phase) {
    var el = $("stars");
    var show = band === "night" || band === "latenight" || band === "evening";
    if (!show) { el.innerHTML = ""; return; }
    var count = phase === "new" ? 60 : 34;
    var html = "";
    for (var i = 0; i < count; i++) {
      // 擬似乱数(固定シード): 毎回同じ星空
      var x = (i * 73 + 17) % 100;
      var y = ((i * 41 + 7) % 55);
      var d = (i % 5) * 0.6;
      html += '<span style="left:' + x + "%;top:" + y + "%;animation-delay:" + d + 's"></span>';
    }
    el.innerHTML = html;
  }

  // ===== 表情 =====
  function setFace(mode) {
    $("faceOpen").style.display = mode === "open" ? "" : "none";
    $("faceClosed").style.display = mode === "closed" ? "" : "none";
    $("faceHappy").style.display = mode === "happy" ? "" : "none";
  }
  var faceTimer = null;
  function flashFace(mode, ms) {
    setFace(mode);
    clearTimeout(faceTimer);
    faceTimer = setTimeout(function () { renderFaceByContext(); }, ms || 1800);
  }
  function isSleepBand(band) { return band === "noon" || band === "latenight"; }
  function renderFaceByContext() {
    var band = TSUKI.timeBand(new Date(now()).getHours());
    if (tutorialActive) { setFace("open"); return; }
    setFace(isSleepBand(band) ? "closed" : "open");
  }

  // ===== 吹き出し =====
  var bubbleTimer = null;
  function bubble(text, ms) {
    bubbleEl.textContent = text;
    bubbleEl.classList.add("show");
    clearTimeout(bubbleTimer);
    bubbleTimer = setTimeout(function () { bubbleEl.classList.remove("show"); }, ms || 3200);
  }

  // ===== メイン描画 =====
  function render() {
    var t = now();
    var d = new Date(t);
    var band = tutorialActive ? "night" : TSUKI.timeBand(d.getHours());
    var age = TSUKI.moonAge(t);
    var phase = TSUKI.moonPhase(age);

    scene.className = band;
    if (phase === "full" && (band === "night" || band === "latenight" || band === "evening")) {
      scene.classList.add("full-moon-glow");
    }
    var moonVisible = band === "night" || band === "latenight" || band === "evening" || phase === "waningCrescent" || phase === "lastQuarter";
    $("moonBox").style.display = moonVisible ? "" : "none";
    renderMoon(phase);
    renderStars(band, phase);

    // うさぎの姿
    var sleeping = !tutorialActive && isSleepBand(band);
    rabbitWrap.classList.toggle("sleeping", sleeping);
    rabbitWrap.classList.toggle("sulky", !sleeping && state.sulking);
    rabbitWrap.classList.toggle("adult", TSUKI.growthStage(state, t) === "adult");
    renderFaceByContext();

    // ステータス
    $("nameText").textContent = state.name;
    var lv = TSUKI.affectionLevel(state.affection);
    var hearts = "";
    for (var i = 0; i < 4; i++) hearts += i < lv.hearts ? "♥" : "♡";
    $("hearts").textContent = hearts;
    $("affLabel").textContent = lv.label;
    $("streak").textContent = state.streak.count;

    // アポイントメント
    var aps = TSUKI.appointments(state, t, tz());
    var extra = state.sulking ? "<b>…" + esc(state.name) + "はちょっと拗ねている。なでて仲直りしよう</b><br>" : "";
    $("appointments").innerHTML = extra + '<i class="ic ic-dango"></i><b>' + aps[0] + '</b><br><i class="ic ic-moon"></i>' + aps[1];

    // アクションボタン
    var canF = TSUKI.canFeed(state, t, tz());
    $("btnFeed").disabled = tutorialActive ? false : !canF.ok;
    $("btnNap").style.display = band === "noon" ? "" : "none";
    $("btnNap").disabled = state.napPeek.done && state.napPeek.day === TSUKI.localDayNum(t, tz());
    $("btnBlanket").style.display = band === "latenight" ? "" : "none";
    $("btnBlanket").disabled = state.blanket.done && state.blanket.day === TSUKI.localDayNum(t, tz());
    var greetBtn = $("btnGreet");
    var greetsToday = state.greets.day === TSUKI.localDayNum(t, tz()); // 日付跨ぎ直後の誤無効を防ぐ
    if (band === "morning") {
      greetBtn.style.display = "";
      greetBtn.innerHTML = '<i class="ic ic-sun"></i>おはよう';
      greetBtn.disabled = greetsToday && state.greets.morning;
    } else if (band === "night") {
      greetBtn.style.display = "";
      greetBtn.innerHTML = '<i class="ic ic-crescent"></i>おやすみ';
      greetBtn.disabled = greetsToday && state.greets.night;
    } else {
      greetBtn.style.display = "none";
    }

    // 今夜の月パネル
    $("phaseName").textContent = TSUKI.PHASE_NAMES[phase];
    var dtf = TSUKI.daysToFullMoon(age);
    $("phaseInfo").textContent = "月齢 " + age.toFixed(1) + (dtf === 0 ? "・今夜は満月" : "・満月まであと" + dtf + "日") + "\n" + TSUKI.moonRiseSetText(age);
    $("phaseInfo").style.whiteSpace = "pre-line";
    $("phaseFlavor").textContent = TSUKI_DATA.dialogues.phaseFlavor[phase];
  }

  // ===== アクション =====
  function actionFeed() {
    if (tutorialActive) return; // チュートリアル中は専用フロー
    var t = now();
    var c = TSUKI.canFeed(state, t, tz());
    if (!c.ok) {
      bubble(c.reason === "done" ? pickFrom(TSUKI_DATA.dialogues.feedDone) : TSUKI_DATA.dialogues.feedBand[0]);
      return;
    }
    TSUKI.doFeed(state, t, tz());
    save();
    flyDango();
    flashFace("happy", 2200);
    hop();
    bubble(pickFrom(TSUKI_DATA.dialogues.feed));
    render();
  }

  var petTimes = [];
  function actionPet() {
    var t = now();
    var band = TSUKI.timeBand(new Date(t).getHours());
    var r = TSUKI.doPet(state, t, tz());
    save();
    if (r.reconciled) {
      flashFace("happy", 2600);
      hop();
      bubble(pickFrom(TSUKI_DATA.dialogues.reconcile), 3600);
      render();
      return;
    }
    if (state.sulking) {
      bubble("……（" + (TSUKI.RECONCILE_PETS - state.petsSinceSulk) + "回なでたら、ゆるしてくれそう）");
      return;
    }
    if (isSleepBand(band) && !tutorialActive) {
      bubble("（そっとなでた。しあわせそうにもぞもぞした）");
      return;
    }
    // 連打でくすぐったい
    petTimes.push(t);
    petTimes = petTimes.filter(function (x) { return t - x < 4000; });
    if (petTimes.length >= 5) {
      petTimes = [];
      flashFace("happy", 2000);
      bubble(TSUKI_DATA.dialogues.petTickled, 3200);
      return;
    }
    flashFace("happy", 1400);
    bubble(pickFrom(TSUKI_DATA.dialogues.pet), 2200);
  }

  function actionTalk() {
    var line = TSUKI.pickTalk(TSUKI_DATA.dialogues, state, now(), tz());
    save();
    bubble(line, 3600);
  }

  function actionNap() {
    var t = now();
    var day = TSUKI.localDayNum(t, tz());
    if (state.napPeek.day !== day) state.napPeek = { day: day, done: false };
    if (state.napPeek.done) return;
    state.napPeek.done = true;
    var idx = day % TSUKI_DATA.dialogues.napPeek.length;
    if (state.records.napFaces.indexOf(idx) < 0) state.records.napFaces.push(idx);
    TSUKI.addAffection(state, 2, t, tz());
    save();
    bubble(TSUKI_DATA.dialogues.napPeek[idx], 3600);
    render();
  }

  function actionBlanket() {
    var t = now();
    var day = TSUKI.localDayNum(t, tz());
    if (state.blanket.day !== day) state.blanket = { day: day, done: false };
    if (state.blanket.done) return;
    state.blanket.done = true;
    var idx = day % TSUKI_DATA.dialogues.blanket.length;
    if (state.records.sleepTalks.indexOf(idx) < 0) state.records.sleepTalks.push(idx);
    TSUKI.addAffection(state, 2, t, tz());
    save();
    bubble(TSUKI_DATA.dialogues.blanket[idx], 3600);
    render();
  }

  function actionGreet() {
    var t = now();
    var band = TSUKI.timeBand(new Date(t).getHours());
    var day = TSUKI.localDayNum(t, tz());
    if (state.greets.day !== day) state.greets = { day: day, morning: false, night: false };
    if (band === "morning" && !state.greets.morning) {
      state.greets.morning = true;
      TSUKI.addAffection(state, 1, t, tz());
      save();
      hop();
      bubble(TSUKI_DATA.dialogues.greetMorning, 3200);
    } else if (band === "night" && !state.greets.night) {
      state.greets.night = true;
      TSUKI.addAffection(state, 1, t, tz());
      save();
      hop();
      bubble(TSUKI_DATA.dialogues.greetNight, 3200);
    }
    render();
  }

  function pickFrom(arr) {
    // 演出用の軽いランダム(ゲーム進行には影響しないためMath.random可)
    return arr[Math.floor(Math.random() * arr.length)];
  }
  function flyDango() {
    var el = $("flyDango");
    el.style.left = "calc(50% - 13px)";
    el.style.top = "120px";
    el.classList.remove("fly");
    void el.offsetWidth;
    el.classList.add("fly");
  }
  function hop() {
    rabbitWrap.classList.remove("hop");
    void rabbitWrap.offsetWidth;
    rabbitWrap.classList.add("hop");
  }

  // ===== 名前変更 =====
  function validName(s) {
    s = (s || "").trim();
    return s.length >= 1 && s.length <= 8 ? s : null;
  }
  $("nameBtn").addEventListener("click", function () {
    $("renameInput").value = state.name;
    $("renameModal").classList.add("show");
  });
  $("renameCancel").addEventListener("click", function () { $("renameModal").classList.remove("show"); });
  $("renameOk").addEventListener("click", function () {
    var v = validName($("renameInput").value);
    if (!v) return;
    state.name = v;
    save();
    $("renameModal").classList.remove("show");
    bubble(v + "！わたしの名前！えへへ", 3000);
    render();
  });

  // ===== ひっこしコード =====
  $("btnBackup").addEventListener("click", function () {
    $("backupOut").value = TSUKI.encodeState(state);
    $("backupIn").value = "";
    $("backupModal").classList.add("show");
  });
  $("backupClose").addEventListener("click", function () { $("backupModal").classList.remove("show"); });
  function copyFeedback() {
    var btn = $("backupCopy");
    btn.textContent = "コピーしました！";
    setTimeout(function () { btn.textContent = "コードをコピー"; }, 2000);
  }
  $("backupCopy").addEventListener("click", function () {
    var ta = $("backupOut");
    ta.focus();
    ta.select();
    // クロスオリジンiframeではclipboard APIが使えない場合があるため選択+execCommandフォールバック
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(ta.value).then(copyFeedback)
        .catch(function () { try { document.execCommand("copy"); copyFeedback(); } catch (e) {} });
    } else {
      try { document.execCommand("copy"); copyFeedback(); } catch (e) {}
    }
  });
  $("backupLoad").addEventListener("click", function () {
    var decoded = TSUKI.decodeState($("backupIn").value);
    if (decoded) {
      try { TSUKI.simulate(decoded, now(), tz()); } catch (e) { decoded = null; }
    }
    if (!decoded) {
      $("backupIn").value = "";
      $("backupIn").placeholder = "コードが正しくないみたい。もう一度確認してね";
      return;
    }
    state = decoded;
    save();
    $("backupModal").classList.remove("show");
    bubble("……あれ？ここ、あたらしいおうち？よろしくね！", 3600);
    render();
  });

  // ===== シェアカード =====
  // 時間帯ごとの色紙の色（index.html の #scene の変数と同じ値）
  var SHARE_PAL = {
    morning: { sky1: "#f5c39c", sky2: "#fbe0bf", far: "#d9ab93", near: "#86a872", house: "#f6eddc", roof: "#c46e56", win: "#7d6b5d" },
    noon: { sky1: "#9dcdec", sky2: "#cde7f4", far: "#a9ccb6", near: "#7ea56b", house: "#f8f2e4", roof: "#c2654f", win: "#6d7c8c" },
    evening: { sky1: "#3d386a", sky2: "#d47d6c", far: "#875876", near: "#3f395e", house: "#eadac5", roof: "#8c4848", win: "#ffcf73" },
    night: { sky1: "#0f1530", sky2: "#1b254c", far: "#34427a", near: "#141a36", house: "#cfc6b4", roof: "#5a4a66", win: "#ffd27a" },
    latenight: { sky1: "#070a18", sky2: "#10172f", far: "#222c54", near: "#0b1124", house: "#a8a190", roof: "#3f3650", win: "#d9a25a" }
  };
  // 満月の夕方・夜は丘を金色に（index.html の #scene.full-moon-glow と同じ値。2026-09-27 オーナー指示）
  var SHARE_FULL = {
    evening: { far: "#d6a862", near: "#957040" },
    night: { far: "#d9b262", near: "#9c7a3e" },
    latenight: { far: "#bf9a4f", near: "#856636" }
  };
  function star4(ctx, x, y, r) {
    ctx.beginPath();
    ctx.moveTo(x, y - r); ctx.lineTo(x + r * 0.22, y - r * 0.22); ctx.lineTo(x + r, y); ctx.lineTo(x + r * 0.22, y + r * 0.22);
    ctx.lineTo(x, y + r); ctx.lineTo(x - r * 0.22, y + r * 0.22); ctx.lineTo(x - r, y); ctx.lineTo(x - r * 0.22, y - r * 0.22);
    ctx.closePath(); ctx.fill();
  }
  // 色紙1枚を塗る(縁の影は上向き＝奥の紙に落ちる影)
  // build は丘の上の曲線だけを描く。塗りは下端まで閉じ、rim があれば稜線だけに明るいふちを引く
  function paperFill(ctx, color, shadowY, build, rim) {
    var W = ctx.canvas.width, H = ctx.canvas.height;
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.3)"; ctx.shadowBlur = 16; ctx.shadowOffsetY = shadowY;
    ctx.fillStyle = color;
    ctx.beginPath(); build(ctx); ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath(); ctx.fill();
    if (rim) {
      ctx.shadowColor = "transparent";
      ctx.strokeStyle = rim; ctx.lineWidth = 5; ctx.lineJoin = "round";
      ctx.beginPath(); build(ctx); ctx.stroke();
    }
    ctx.restore();
  }
  function drawShareCard() {
    var t = now();
    var band = TSUKI.timeBand(new Date(t).getHours());
    var age = TSUKI.moonAge(t);
    var phase = TSUKI.moonPhase(age);
    var cv = $("shareCanvas");
    var ctx = cv.getContext("2d");
    var W = cv.width, H = cv.height;

    var pal = SHARE_PAL[band];
    var fullGlow = phase === "full" && SHARE_FULL[band];   // 画面の full-moon-glow と同じ条件（満月かつ夕方・夜・深夜）
    var gold = fullGlow ? SHARE_FULL[band] : null;
    // 空(2枚の色紙)
    ctx.fillStyle = pal.sky1; ctx.fillRect(0, 0, W, H * 0.46);
    ctx.fillStyle = pal.sky2; ctx.fillRect(0, H * 0.46, W, H);
    var seam = ctx.createLinearGradient(0, H * 0.46, 0, H * 0.46 + 14);
    seam.addColorStop(0, "rgba(0,0,0,0.16)"); seam.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = seam; ctx.fillRect(0, H * 0.46, W, 14);

    // 星(切り抜いた四つ星)
    if (band !== "morning" && band !== "noon") {
      ctx.fillStyle = "#fff1c8";
      for (var i = 0; i < 46; i++) {
        // 規則的な式だと星が斜めの列に並ぶので、固定の擬似乱数で散らす(毎回同じ配置)
        var x = (Math.sin(i * 12.9898 + 1.7) * 43758.5453 % 1 + 1) % 1 * W;
        var y = (Math.sin(i * 78.233 + 4.1) * 24634.6345 % 1 + 1) % 1 * H * 0.44;
        star4(ctx, x, y, i % 7 === 0 ? 10 : i % 3 === 0 ? 4 : 6);
      }
    }

    // 月(紙の円盤・影つき。SVGパスを流用)
    ctx.save();
    ctx.translate(W - 260, 60);
    ctx.scale(2.4, 2.4);
    ctx.shadowColor = "rgba(0,0,0,0.35)"; ctx.shadowBlur = 8; ctx.shadowOffsetY = 2;
    ctx.fillStyle = MOON_DARK;
    ctx.beginPath();
    ctx.arc(36, 36, 33, 0, Math.PI * 2);
    ctx.fill();
    if (MOON_PATHS[phase]) {
      ctx.fillStyle = MOON_LIT;
      if (gold) {
        // 満月: 輪郭から金色の光がにじむ（外側の広い光 → 輪郭の近くの明るい光の順に重ねる）
        ctx.shadowOffsetY = 0;
        ctx.shadowColor = "rgba(255,200,100,0.55)"; ctx.shadowBlur = 70; ctx.fill(new Path2D(MOON_PATHS[phase]));
        ctx.shadowColor = "rgba(255,212,120,0.9)"; ctx.shadowBlur = 30; ctx.fill(new Path2D(MOON_PATHS[phase]));
        ctx.shadowColor = "#fff0c0"; ctx.shadowBlur = 8;
      }
      ctx.fill(new Path2D(MOON_PATHS[phase]));
    }
    ctx.restore();

    // 遠くの丘
    paperFill(ctx, gold ? gold.far : pal.far, -6, function (c) {
      c.moveTo(0, H - 205);
      c.bezierCurveTo(W * 0.14, H - 290, W * 0.3, H - 282, W * 0.42, H - 232);
      c.bezierCurveTo(W * 0.54, H - 186, W * 0.66, H - 318, W * 0.8, H - 300);
      c.bezierCurveTo(W * 0.9, H - 288, W * 0.96, H - 262, W, H - 250);
    }, gold ? "#ffe8a8" : null);
    // 家(窓は夜だけ灯る色)
    ctx.save();
    ctx.translate(W * 0.045, H - 330);
    ctx.scale(2.2, 2.2);
    ctx.shadowColor = "rgba(0,0,0,0.28)"; ctx.shadowBlur = 6; ctx.shadowOffsetY = 3;
    ctx.fillStyle = pal.roof; ctx.fillRect(40, 6, 7, 16);
    ctx.beginPath(); ctx.moveTo(4, 28); ctx.lineTo(30, 6); ctx.lineTo(56, 28); ctx.closePath(); ctx.fill();
    ctx.fillStyle = pal.house; ctx.fillRect(10, 27, 40, 30);
    ctx.shadowColor = "transparent";
    ctx.fillStyle = pal.win; ctx.fillRect(16, 34, 11, 10);
    ctx.fillStyle = pal.roof; ctx.fillRect(33, 38, 10, 19);
    ctx.restore();
    // 手前の丘
    paperFill(ctx, gold ? gold.near : pal.near, -8, function (c) {
      c.moveTo(0, H - 128);
      c.bezierCurveTo(W * 0.18, H - 176, W * 0.38, H - 190, W * 0.54, H - 178);
      c.bezierCurveTo(W * 0.72, H - 166, W * 0.86, H - 142, W, H - 152);
    }, gold ? "#f7d98c" : null);

    // うさぎ(簡略シルエット)
    ctx.save();
    ctx.translate(230, H - 200);
    ctx.fillStyle = "#fdfbf4";
    ctx.beginPath(); ctx.ellipse(66, 96, 15, 13, 0, 0, Math.PI * 2); ctx.fill(); // しっぽ
    ctx.beginPath(); ctx.ellipse(0, 90, 56, 40, 0, 0, Math.PI * 2); ctx.fill(); // 体
    ctx.beginPath(); ctx.ellipse(-20, -8, 13, 40, -0.12, 0, Math.PI * 2); ctx.fill(); // 耳L
    ctx.beginPath(); ctx.ellipse(20, -8, 13, 40, 0.12, 0, Math.PI * 2); ctx.fill(); // 耳R
    ctx.fillStyle = "#f3cdd4";
    ctx.beginPath(); ctx.ellipse(-20, -4, 6, 27, -0.12, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(20, -4, 6, 27, 0.12, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#fdfbf4";
    ctx.beginPath(); ctx.arc(0, 46, 42, 0, Math.PI * 2); ctx.fill(); // 頭
    ctx.fillStyle = "#3a3428";
    ctx.beginPath(); ctx.arc(-15, 44, 5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(15, 44, 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#f6c8cf";
    ctx.beginPath(); ctx.ellipse(-27, 56, 7, 4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(27, 56, 7, 4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    // テキスト(時間帯で言い回しを変える: 朝昼の生成で「〜の夜」にならないように)
    var bandWord = band === "morning" ? "の朝" : band === "noon" ? "のひるさがり" : "の夜";
    var textColor = band === "morning" || band === "noon" ? "#3a3a3a" : "#f5efdc";
    ctx.fillStyle = textColor;
    ctx.textAlign = "left";
    ctx.font = "bold 52px 'Hiragino Maru Gothic ProN', 'Yu Gothic UI', Meiryo, sans-serif";
    ctx.fillText(state.name + "と、" + TSUKI.PHASE_NAMES[phase] + bandWord, 400, 300);
    ctx.font = "34px 'Hiragino Maru Gothic ProN', 'Yu Gothic UI', Meiryo, sans-serif";
    var dd = new Date(t);
    ctx.fillText(dd.getFullYear() + "年" + (dd.getMonth() + 1) + "月" + dd.getDate() + "日・月齢" + age.toFixed(1), 400, 366);
    ctx.fillText("おつきまいり " + state.streak.count + "日目", 400, 424);
    ctx.font = "bold 30px 'Hiragino Maru Gothic ProN', 'Yu Gothic UI', Meiryo, sans-serif";
    ctx.fillStyle = band === "morning" || band === "noon" ? "#5a5030" : "#e8c872";
    if (gold) {
      // 金色の原っぱの上では金の文字が沈むので、明るいクリーム色＋薄い影にする
      ctx.fillStyle = "#fff6dc";
      ctx.shadowColor = "rgba(60,40,10,0.55)"; ctx.shadowBlur = 6; ctx.shadowOffsetY = 2;
    }
    ctx.fillText("月うさぎのすみか｜rinne-blog.com/tsuki-usagi", 400, 600);
    ctx.shadowColor = "transparent";
  }
  $("btnShare").addEventListener("click", function () {
    drawShareCard();
    $("shareModal").classList.add("show");
  });
  $("shareClose").addEventListener("click", function () { $("shareModal").classList.remove("show"); });
  $("shareSave").addEventListener("click", function () {
    var a = document.createElement("a");
    a.download = "tsuki-usagi.png";
    a.href = $("shareCanvas").toDataURL("image/png");
    a.click();
  });
  $("shareX").addEventListener("click", function () {
    var t = now();
    var band = TSUKI.timeBand(new Date(t).getHours());
    var bandWord = band === "morning" ? "の朝" : band === "noon" ? "のひるさがり" : "の夜";
    var phase = TSUKI.moonPhase(TSUKI.moonAge(t));
    var text = "月うさぎの" + state.name + "と、" + TSUKI.PHASE_NAMES[phase] + bandWord + "🌙 おつきまいり" + state.streak.count + "日目 #月うさぎのすみか " + PAGE_URL;
    window.open("https://twitter.com/intent/tweet?text=" + encodeURIComponent(text), "_blank", "noopener,noreferrer");
  });

  // ===== チュートリアル =====
  var tutorialActive = false;
  var tutIdx = 0;
  function tutStep() {
    var steps = TSUKI_DATA.tutorial;
    if (tutIdx >= steps.length) {
      state.tutorialDone = true;
      save();
      tutorialActive = false;
      $("tutorial").classList.remove("show");
      bubble("これからよろしくね、ぴょん！", 3600);
      render();
      return;
    }
    var st = steps[tutIdx];
    var textEl = $("tutText"), nameEl = $("tutName"), nextBtn = $("tutNext");
    nameEl.style.display = "none";
    if (st.speaker === "name") {
      textEl.innerHTML = '<div class="speaker">うさぎの名前</div><div>この子の名前を決めてあげてください。</div>';
      nameEl.style.display = "";
      nameEl.value = state.name;
      nextBtn.textContent = "この名前にする";
    } else if (st.speaker === "feed") {
      textEl.innerHTML = '<div class="speaker">はじめてのお世話</div><div><i class="ic ic-dango"></i>月見だんごをあげてみましょう。</div>';
      nextBtn.innerHTML = '<i class="ic ic-dango"></i>あげる';
    } else {
      var who = st.speaker === "koyomi" ? "宵乃こよみ" : esc(state.name);
      var cls = st.speaker === "koyomi" ? "koyomi" : "usagi";
      textEl.innerHTML = '<div class="' + cls + '"><div class="speaker">' + who + "</div><div>" + esc(st.text.replace(/\{name\}/g, state.name)) + "</div></div>";
      nextBtn.textContent = "つぎへ";
    }
  }
  $("tutNext").addEventListener("click", function () {
    var st = TSUKI_DATA.tutorial[tutIdx];
    if (st && st.speaker === "name") {
      var v = validName($("tutName").value);
      if (!v) return;
      state.name = v;
      save();
    }
    if (st && st.speaker === "feed") {
      // チュートリアルの特別だんご(帯カウント外)
      TSUKI.addAffection(state, 5, now(), tz());
      save();
      flyDango();
      flashFace("happy", 2000);
      hop();
    }
    tutIdx += 1;
    tutStep();
    render();
  });

  // ===== タブ復帰時の再読込(複数タブ・複数ウィンドウの後勝ち上書き対策) =====
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden) { load(); render(); }
  });
  window.addEventListener("focus", function () { load(); render(); });

  // ===== うさぎタップ=なでる =====
  rabbitWrap.addEventListener("click", actionPet);
  $("btnFeed").addEventListener("click", actionFeed);
  $("btnPet").addEventListener("click", actionPet);
  $("btnTalk").addEventListener("click", actionTalk);
  $("btnNap").addEventListener("click", actionNap);
  $("btnBlanket").addEventListener("click", actionBlanket);
  $("btnGreet").addEventListener("click", actionGreet);

  // ===== 起動 =====
  load();
  // 検証用: ?skiptut=1 でチュートリアルを飛ばす(スクリーンショット検証のため)
  if (/[?&]skiptut=1/.test(location.search)) state.tutorialDone = true;
  if (!state.tutorialDone) {
    tutorialActive = true;
    $("tutorial").classList.add("show");
    tutStep();
  }
  render();
  // 時間帯・月齢の変化を追従(30秒ごと)。他タブの更新を上書きしないよう読み直してから書く
  setInterval(function () {
    load();
    render();
  }, 30000);
})();

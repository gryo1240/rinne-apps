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
  var MOON_LIT = "#f5e6b8", MOON_DARK = "rgba(70,80,120,0.55)";
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
    $("appointments").innerHTML = extra + "🍡 <b>" + aps[0] + "</b><br>🌕 " + aps[1];

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
      greetBtn.textContent = "🌅 おはよう";
      greetBtn.disabled = greetsToday && state.greets.morning;
    } else if (band === "night") {
      greetBtn.style.display = "";
      greetBtn.textContent = "🌙 おやすみ";
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
  var SKY_GRADS = {
    morning: ["#f6b98a", "#f9dcae"],
    noon: ["#8ec8ec", "#cfe6f5"],
    evening: ["#3b3564", "#f0a35e"],
    night: ["#0c0f1d", "#232c4e"],
    latenight: ["#070910", "#141b33"]
  };
  function drawShareCard() {
    var t = now();
    var band = TSUKI.timeBand(new Date(t).getHours());
    var age = TSUKI.moonAge(t);
    var phase = TSUKI.moonPhase(age);
    var cv = $("shareCanvas");
    var ctx = cv.getContext("2d");
    var W = cv.width, H = cv.height;

    // 空
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, SKY_GRADS[band][0]);
    g.addColorStop(1, SKY_GRADS[band][1]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // 星
    if (band !== "morning" && band !== "noon") {
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      for (var i = 0; i < 60; i++) {
        var x = (i * 173 + 31) % W;
        var y = (i * 97 + 13) % (H * 0.55);
        ctx.fillRect(x, y, 2.4, 2.4);
      }
    }

    // 月(SVGパスを流用)
    ctx.save();
    ctx.translate(W - 260, 60);
    ctx.scale(2.4, 2.4);
    ctx.fillStyle = "rgba(70,80,120,0.55)";
    ctx.beginPath();
    ctx.arc(36, 36, 33, 0, Math.PI * 2);
    ctx.fill();
    if (MOON_PATHS[phase]) {
      ctx.fillStyle = MOON_LIT;
      ctx.shadowColor = "rgba(232,200,114,0.7)";
      ctx.shadowBlur = 24;
      ctx.fill(new Path2D(MOON_PATHS[phase]));
    }
    ctx.restore();

    // 丘
    ctx.fillStyle = band === "morning" || band === "noon" ? "#86ac74" : "#223055";
    ctx.beginPath();
    ctx.ellipse(W * 0.5, H + 60, W * 0.75, 200, 0, 0, Math.PI * 2);
    ctx.fill();

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
    ctx.fillText("月うさぎのすみか｜rinne-blog.com/tsuki-usagi", 400, 600);
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
      textEl.innerHTML = '<div class="speaker">はじめてのお世話</div><div>🍡 月見だんごをあげてみましょう。</div>';
      nextBtn.textContent = "🍡 あげる";
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

"use strict";

(() => {
  const canvas = document.getElementById("game-canvas");
  const g = canvas.getContext("2d");

  const screens = {
    title: document.getElementById("title-screen"),
    songs: document.getElementById("song-screen"),
    diff: document.getElementById("diff-screen"),
    pause: document.getElementById("pause-screen"),
    result: document.getElementById("result-screen"),
  };
  const pauseBtn = document.getElementById("pause-btn");

  const KEY_SETS = {
    4: ["KeyD", "KeyF", "KeyJ", "KeyK"],
    6: ["KeyS", "KeyD", "KeyF", "KeyJ", "KeyK", "KeyL"],
  };
  const KEY_LABELS = {
    4: ["D", "F", "J", "K"],
    6: ["S", "D", "F", "J", "K", "L"],
  };
  const COLOR_SETS = {
    4: ["#ff5c8a", "#ffb84d", "#4dd2ff", "#9d7bff"],
    6: ["#ff5c8a", "#ffb84d", "#ffe14d", "#4dff9d", "#4dd2ff", "#9d7bff"],
  };
  const DIFF_DEFS = [
    { id: "easy", name: "Easy", css: "d-easy" },
    { id: "normal", name: "Normal", css: "d-normal" },
    { id: "hard", name: "Hard", css: "d-hard" },
    { id: "fever", name: "Fever", css: "d-fever" },
  ];
  const DIFF_NAMES = { easy: "Easy", normal: "Normal", hard: "Hard", fever: "Fever" };

  // 背景テーマ(analyze.py の pick_theme と対応)
  const THEMES = {
    night: {
      top: "#05060f", mid: "#0d0f26", bot: "#191233",
      orb: { rgb: "235,233,255", eclipse: false },
      bands: ["157,123,255", "77,210,255"],
      particles: { mode: "fall", rgb: "240,240,255" },
    },
    eclipse: {
      top: "#0a0407", mid: "#1c0a10", bot: "#301016",
      orb: { rgb: "255,96,96", eclipse: true },
      bands: ["255,92,138", "255,140,60"],
      particles: { mode: "rise", rgb: "255,140,110" },
    },
    neon: {
      top: "#050510", mid: "#12082a", bot: "#1f0f38",
      orb: null, grid: true,
      bands: ["255,60,220", "60,220,255"],
      particles: { mode: "drift", rgb: "120,255,240" },
    },
    ocean: {
      top: "#03101c", mid: "#062338", bot: "#0a3350",
      orb: { rgb: "180,230,255", eclipse: false },
      bands: ["60,220,255", "80,255,200"],
      particles: { mode: "rise", rgb: "170,225,255" },
    },
    dawn: {
      top: "#1a0f2e", mid: "#3d1d3a", bot: "#7a3a2e",
      orb: { rgb: "255,220,170", eclipse: false },
      bands: ["255,180,80", "255,120,150"],
      particles: { mode: "drift", rgb: "255,230,190" },
    },
  };

  const APPROACH = 1.6;
  const PERFECT = 0.06;
  const GOOD = 0.14;
  const HOLD_TICK = 0.25;

  // 体力(HP)
  const HP_MAX = 100;
  const HP_MISS = -8;
  const HP_EMPTY = -2; // 空打ち(ズル対策)
  const HP_PERFECT = 2;
  const HP_GOOD = 1;
  const HP_HOLD_TICK = 0.5;

  const isTouchDev = window.matchMedia("(pointer: coarse)").matches;

  let state = "title";
  let selSong = 0;
  let songCursor = 0;
  let selDiff = "normal";
  let player = null;
  let notes = [];
  let lanes = 4;
  let endTime = 0;
  let score = 0, combo = 0, maxCombo = 0, hp = HP_MAX;
  let counts = { perfect: 0, good: 0, miss: 0 };
  let judgeFx = null;
  let laneFlash = [];
  let keyHeld = [];
  let touchHeld = [];
  let mouseLane = -1;
  const touchLaneMap = new Map();
  let rafId = 0;
  let preview = null;
  let previewSongId = null;

  // ---- レイアウト ----
  let W = 0, H = 0;
  let fieldX = 0, fieldW = 0, laneW = 0, hitY = 0, padTop = 0;

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    W = canvas.clientWidth;
    H = canvas.clientHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    fieldW = Math.min(W - 8, lanes === 6 ? 760 : 560);
    fieldX = (W - fieldW) / 2;
    laneW = fieldW / lanes;
    const padH = Math.min(110, H * 0.16);
    padTop = H - padH;
    hitY = padTop - 26;
    initSky();
  }
  window.addEventListener("resize", () => {
    resize();
    if (state !== "playing") drawIdleBackground(); // リサイズでキャンバスが消えるため再描画
  });

  // ---- 背景演出 ----
  let stars = [];
  let skyW = 0;

  function initSky() {
    if (skyW === W && stars.length) return;
    skyW = W;
    stars = [];
    const n = Math.min(110, Math.floor((W * H) / 9000));
    for (let i = 0; i < n; i++) {
      stars.push({
        x: Math.random(),
        y: Math.random(),
        size: 0.6 + Math.random() * 1.9,
        phase: Math.random() * Math.PI * 2,
        tw: 0.5 + Math.random() * 2.2,
        sp: 0.003 + Math.random() * 0.01,
      });
    }
  }

  function currentTheme() {
    return THEMES[currentSong().theme] || THEMES.night;
  }

  function drawSky(now, bpm, T) {
    const pnow = performance.now() / 1000;

    const grad = g.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, T.top);
    grad.addColorStop(0.5, T.mid);
    grad.addColorStop(1, T.bot);
    g.fillStyle = grad;
    g.fillRect(0, 0, W, H);

    let pulse = 0;
    if (bpm > 0 && now > 0) {
      const beatDur = 60 / bpm;
      pulse = Math.max(0, 1 - ((now % beatDur) / beatDur) * 3);
    }

    // 天体(月/太陽/紅い月)
    if (T.orb) {
      const mx = W * 0.8, my = H * 0.14, mr = Math.min(W, H) * 0.11;
      const glow = g.createRadialGradient(mx, my, mr * 0.2, mx, my, mr * 2.6);
      glow.addColorStop(0, `rgba(${T.orb.rgb}, ${0.45 + pulse * 0.15})`);
      glow.addColorStop(0.25, `rgba(${T.orb.rgb}, 0.13)`);
      glow.addColorStop(1, `rgba(${T.orb.rgb}, 0)`);
      g.fillStyle = glow;
      g.fillRect(mx - mr * 2.6, my - mr * 2.6, mr * 5.2, mr * 5.2);
      g.fillStyle = `rgba(${T.orb.rgb}, 0.85)`;
      g.beginPath();
      g.arc(mx, my, mr * 0.55, 0, Math.PI * 2);
      g.fill();
      if (T.orb.eclipse) {
        g.fillStyle = T.top;
        g.beginPath();
        g.arc(mx - mr * 0.16, my - mr * 0.08, mr * 0.5, 0, Math.PI * 2);
        g.fill();
      }
    }

    // ネオングリッド(neonテーマ)
    if (T.grid) {
      const horizon = H * 0.55;
      g.strokeStyle = `rgba(${T.bands[0]}, ${0.12 + pulse * 0.1})`;
      g.lineWidth = 1;
      for (let i = 0; i < 9; i++) {
        const y = horizon + Math.pow(i / 8, 1.8) * (H - horizon);
        g.beginPath();
        g.moveTo(0, y);
        g.lineTo(W, y);
        g.stroke();
      }
      g.strokeStyle = `rgba(${T.bands[1]}, 0.10)`;
      for (let i = -6; i <= 6; i++) {
        g.beginPath();
        g.moveTo(W / 2 + i * W * 0.09, horizon);
        g.lineTo(W / 2 + i * W * 0.4, H);
        g.stroke();
      }
    }

    // 光の帯(オーロラ)
    for (let k = 0; k < 2; k++) {
      const baseY = H * (0.32 + k * 0.13);
      const amp = 26 + k * 14;
      const speed = 0.25 + k * 0.12;
      g.beginPath();
      g.moveTo(0, baseY);
      for (let x = 0; x <= W; x += 24) {
        g.lineTo(x, baseY + Math.sin(x * 0.004 + pnow * speed + k * 2.1) * amp);
      }
      g.lineTo(W, baseY + 130);
      g.lineTo(0, baseY + 130);
      g.closePath();
      const ag = g.createLinearGradient(0, baseY - amp, 0, baseY + 130);
      ag.addColorStop(0, `rgba(${T.bands[k]}, ${0.10 + pulse * 0.05})`);
      ag.addColorStop(1, `rgba(${T.bands[k]}, 0)`);
      g.fillStyle = ag;
      g.fill();
    }

    // 粒子(星/火の粉/泡)
    const mode = T.particles.mode;
    for (const s of stars) {
      const a = 0.22 + 0.55 * (0.5 + 0.5 * Math.sin(pnow * s.tw + s.phase));
      let x = s.x, y = s.y;
      if (mode === "fall") y = (s.y + pnow * s.sp) % 1;
      else if (mode === "rise") {
        y = 1 - ((s.y + pnow * s.sp) % 1);
        x = s.x + Math.sin(pnow * 0.7 + s.phase) * 0.012;
      } else {
        x = (s.x + pnow * s.sp * 0.35) % 1;
      }
      g.fillStyle = `rgba(${T.particles.rgb}, ${a})`;
      g.fillRect(x * W, y * H, s.size, s.size);
    }
  }

  // ---- 画面遷移・選択UI ----
  // 各画面の「フォーカスできる要素」を navList に登録し、↑↓で移動・Enterで決定する。
  // マウスなしで全画面を操作するための仕組み(ホバーでもフォーカスが追従する)。
  let navList = [];
  let navIndex = 0;
  const hoverBound = new WeakSet();

  function setNav(els, defIndex) {
    navList = els.filter(Boolean);
    navIndex = Math.max(0, Math.min(defIndex || 0, navList.length - 1));
    for (const el of navList) {
      if (hoverBound.has(el)) continue;
      hoverBound.add(el);
      el.addEventListener("mouseenter", () => {
        const i = navList.indexOf(el);
        if (i >= 0) { navIndex = i; applyNav(); }
      });
    }
    applyNav();
  }

  function applyNav() {
    navList.forEach((el, i) => el.classList.toggle("selected", i === navIndex));
  }

  function moveNav(d) {
    if (!navList.length) return;
    navIndex = (navIndex + d + navList.length) % navList.length;
    applyNav();
  }

  function activateNav() {
    if (navList[navIndex]) navList[navIndex].click();
  }

  function showScreen(name) {
    for (const key of Object.keys(screens)) {
      screens[key].classList.toggle("hidden", key !== name);
    }
    if (name) state = name === "pause" ? "paused" : name;
    if (name !== "diff" && name !== "songs") stopPreview();
    if (name === "title") {
      setNav([document.getElementById("start-btn"), document.querySelector(".volume-row")], 0);
    }
    if (name !== null) {
      pauseBtn.classList.add("hidden");
      drawIdleBackground();
    }
  }

  function drawIdleBackground() {
    drawSky(-1, 0, THEMES[SONG_LIBRARY[selSong] ? currentSong().theme : "night"] || THEMES.night);
  }

  function currentSong() {
    return SONG_LIBRARY[selSong];
  }

  function fmtTime(sec) {
    const m = Math.floor(sec / 60);
    const s = Math.round(sec % 60);
    return m + ":" + String(s).padStart(2, "0");
  }

  function stopPreview() {
    if (preview) {
      preview.stop();
      preview = null;
    }
    previewSongId = null;
  }

  function startPreview() {
    stopPreview();
    const song = currentSong();
    if (song && song.source === "file") {
      preview = GameAudio.createPreview(song);
      previewSongId = song.id;
    }
  }

  // 同じ曲の試聴が既に流れていればそのまま継続、違う曲なら開始し直す
  function startPreviewIfNeeded() {
    const song = currentSong();
    if (preview && song && previewSongId === song.id) return;
    startPreview();
  }

  // ---- クリア記録(localStorage) ----
  const CLEAR_KEY = "starbeats_clears_v1";
  function loadClears() {
    try { return JSON.parse(localStorage.getItem(CLEAR_KEY)) || {}; } catch (e) { return {}; }
  }
  function recordClear(songId, diffId, perfect) {
    const d = loadClears();
    if (!d[songId]) d[songId] = {};
    if (perfect || d[songId][diffId] === "perfect") d[songId][diffId] = "perfect";
    else d[songId][diffId] = "clear";
    try { localStorage.setItem(CLEAR_KEY, JSON.stringify(d)); } catch (e) {}
  }
  function diffClearMark(song, diffId) {
    const d = loadClears()[song.id];
    return d ? d[diffId] || null : null;
  }
  function songClearMark(song) {
    const d = loadClears()[song.id];
    if (!d) return null;
    const diffs = ["easy", "normal", "hard", "fever"];
    if (!diffs.every((x) => d[x])) return null; // 全難易度クリアで初めて表示
    return diffs.every((x) => d[x] === "perfect") ? "perfect" : "clear";
  }

  // 曲選択・難易度表示用のレベル(1が最易・数字が大きいほど難しい)。
  // ノーツ密度(個/秒) + BPM + レーン数から算出する。
  function chartLevel(song, diffId) {
    const d = song.difficulties && song.difficulties[diffId];
    if (!d) return 1;
    const density = d.notes.length / (song.duration || 1);
    const laneBonus = d.lanes === 6 ? 1.5 : 0;
    const raw = density * 2.5 + song.bpm / 70 + laneBonus - 3.6;
    return Math.max(1, Math.min(20, Math.round(raw)));
  }

  // 曲選択: 太鼓の達人風の横ローテーション(◀▶で回して中央の曲を決定)
  function buildSongList() {
    const list = document.getElementById("song-list");
    songCursor = Math.min(Math.max(0, selSong), SONG_LIBRARY.length - 1);
    list.innerHTML = "";

    const row = document.createElement("div");
    row.className = "carousel-row";

    const prev = document.createElement("button");
    prev.className = "carousel-arrow";
    prev.setAttribute("aria-label", "前の曲");
    prev.innerHTML = "&#10094;";
    prev.addEventListener("click", () => rotateSong(-1));

    const stage = document.createElement("div");
    stage.className = "carousel-stage";
    stage.id = "carousel-stage";

    const next = document.createElement("button");
    next.className = "carousel-arrow";
    next.setAttribute("aria-label", "次の曲");
    next.innerHTML = "&#10095;";
    next.addEventListener("click", () => rotateSong(1));

    row.appendChild(prev);
    row.appendChild(stage);
    row.appendChild(next);
    list.appendChild(row);

    const idx = document.createElement("div");
    idx.className = "carousel-index";
    idx.id = "carousel-index";
    list.appendChild(idx);

    // スマホはスワイプでも曲を回せる
    let sx = 0;
    stage.addEventListener("touchstart", (e) => { sx = e.changedTouches[0].clientX; }, { passive: true });
    stage.addEventListener("touchend", (e) => {
      const dx = e.changedTouches[0].clientX - sx;
      if (Math.abs(dx) > 40) rotateSong(dx < 0 ? 1 : -1);
    });

    renderCarousel();
  }

  function renderCarousel() {
    const stage = document.getElementById("carousel-stage");
    if (!stage) return;
    const n = SONG_LIBRARY.length;
    stage.innerHTML = "";
    for (const off of [-1, 0, 1]) {
      const i = (songCursor + off + n) % n;
      const song = SONG_LIBRARY[i];
      const card = document.createElement("div");
      card.className = "song-card " + (off === 0 ? "center" : "side " + (off < 0 ? "left" : "right"));
      const title = document.createElement("span");
      title.className = "s-title";
      title.textContent = song.title;
      card.appendChild(title);
      if (off === 0) {
        const meta = document.createElement("span");
        meta.className = "s-meta";
        meta.textContent = fmtTime(song.duration) + " / BPM " + Math.round(song.bpm);
        card.appendChild(meta);
        const lv = document.createElement("span");
        lv.className = "s-level";
        lv.textContent = "レベル " + chartLevel(song, "easy") + " 〜 " + chartLevel(song, "fever");
        card.appendChild(lv);
        const go = document.createElement("span");
        go.className = "s-go";
        go.textContent = "▶ この曲であそぶ";
        card.appendChild(go);
        const smark = songClearMark(song);
        if (smark) {
          const sc = document.createElement("span");
          sc.className = "card-clear " + smark;
          sc.textContent = smark === "perfect" ? "PERFECT" : "CLEAR";
          card.appendChild(sc);
        }
        card.addEventListener("click", () => { selSong = songCursor; openDiffScreen(); });
      } else {
        card.addEventListener("click", () => rotateSong(off));
      }
      stage.appendChild(card);
    }
    const idx = document.getElementById("carousel-index");
    if (idx) idx.textContent = (songCursor + 1) + " / " + n;

    // ↑↓のフォーカス対象: 中央カード(この曲であそぶ) → タイトルへ
    const backBtn = document.getElementById("song-back-btn");
    const keep = navList.length === 2 && navList[1] === backBtn ? navIndex : 0;
    setNav([stage.querySelector(".song-card.center"), backBtn], keep);
  }

  function rotateSong(dir) {
    const n = SONG_LIBRARY.length;
    songCursor = (songCursor + dir + n) % n;
    selSong = songCursor;
    renderCarousel();
    navIndex = 0; // 曲を回したらフォーカスは中央カードへ戻す
    applyNav();
    drawIdleBackground();
    startPreview();
  }

  function openDiffScreen() {
    buildDiffList();
    showScreen("diff");
    startPreviewIfNeeded(); // 曲選択からの試聴をそのまま継続(同じ曲なら止めない)
    drawIdleBackground();
  }

  function buildDiffList() {
    const song = currentSong();
    document.getElementById("diff-song-title").textContent = song.title;
    const list = document.getElementById("diff-list");
    list.innerHTML = "";
    const btns = [];
    DIFF_DEFS.forEach((d, i) => {
      const btn = document.createElement("button");
      btn.className = "diff-btn " + d.css;
      const name = document.createElement("span");
      name.className = "d-name";
      name.textContent = d.name;
      const meta = document.createElement("span");
      meta.className = "d-meta";
      let nCount, nLanes;
      if (song.source === "synth") {
        nCount = GameAudio.synthNoteCount(d.id);
        nLanes = d.id === "hard" || d.id === "fever" ? 6 : 4;
      } else {
        nCount = song.difficulties[d.id].notes.length;
        nLanes = song.difficulties[d.id].lanes;
      }
      const lv = song.source === "file" ? chartLevel(song, d.id) : (i + 1) * 2 - 1;
      meta.textContent = "レベル " + lv + ", " + nLanes + "レーン, " + nCount + "ノーツ";
      btn.appendChild(name);
      const dmark = diffClearMark(song, d.id);
      if (dmark) {
        const cm = document.createElement("span");
        cm.className = "d-clear " + dmark;
        cm.textContent = dmark === "perfect" ? "PERFECT" : "CLEAR";
        btn.appendChild(cm); // 名前とメタの「間」に入れて既存文字と重ならないようにする
      }
      btn.appendChild(meta);
      btn.addEventListener("click", () => {
        selDiff = d.id;
        startGame();
      });
      list.appendChild(btn);
      btns.push(btn);
    });
    // ↑↓のフォーカス対象: 各難易度 → 曲選択へ戻る
    btns.push(document.getElementById("diff-back-btn"));
    setNav(btns, Math.max(0, DIFF_DEFS.findIndex((d) => d.id === selDiff)));
  }

  // ---- ゲーム進行 ----
  function startGame() {
    stopPreview();
    const song = currentSong();
    if (player) player.stop();
    if (song.source === "synth") {
      player = GameAudio.createSynthPlayer(selDiff);
      lanes = selDiff === "hard" || selDiff === "fever" ? 6 : 4;
    } else {
      player = GameAudio.createFilePlayer(song, selDiff);
      lanes = song.difficulties[selDiff].lanes;
    }
    laneFlash = new Array(lanes).fill(0);
    keyHeld = new Array(lanes).fill(false);
    touchHeld = new Array(lanes).fill(0);
    touchLaneMap.clear();
    mouseLane = -1;
    resize();
    notes = player.notes.map((n) => ({
      time: n[0], lane: n[1], dur: n[2] || 0,
      judged: false, result: "", holding: false, nextTick: 0,
    }));
    let lastT = 0;
    for (const n of notes) lastT = Math.max(lastT, n.time + n.dur);
    endTime = notes.length ? Math.min(player.duration, lastT + 2.5) : player.duration;
    score = 0; combo = 0; maxCombo = 0; hp = HP_MAX;
    counts = { perfect: 0, good: 0, miss: 0 };
    judgeFx = null;
    state = "playing";
    showScreen(null);
    pauseBtn.classList.remove("hidden");
    player.start().catch(() => {
      alert("曲の再生に失敗しました。曲ファイルが charts フォルダにあるか確認してください。");
      backToSongs();
    });
    cancelAnimationFrame(rafId);
    loop();
  }

  function pauseGame() {
    if (state !== "playing") return;
    state = "paused";
    player.pause();
    cancelAnimationFrame(rafId);
    document.getElementById("pause-song").textContent =
      currentSong().title + " ／ " + DIFF_NAMES[selDiff];
    screens.pause.classList.remove("hidden");
    pauseBtn.classList.add("hidden");
    setNav([
      document.getElementById("resume-btn"),
      document.getElementById("restart-btn"),
      document.getElementById("quit-btn"),
    ], 0);
  }

  function resumeGame() {
    if (state !== "paused") return;
    state = "playing";
    screens.pause.classList.add("hidden");
    pauseBtn.classList.remove("hidden");
    player.resume();
    cancelAnimationFrame(rafId);
    loop();
  }

  function backToSongs() {
    if (player) player.stop();
    cancelAnimationFrame(rafId);
    buildSongList();
    showScreen("songs");
    startPreview();
  }

  function endGame(failed) {
    state = "result";
    player.stop();
    cancelAnimationFrame(rafId);
    const total = notes.length;
    const acc = total > 0 ? (counts.perfect * 100 + counts.good * 50) / (total * 100) : 0;
    if (!failed && total > 0) {
      const perfect = counts.miss === 0 && counts.good === 0 && counts.perfect === total;
      recordClear(currentSong().id, selDiff, perfect);
    }
    let rank = "C";
    if (failed) rank = "F";
    else if (acc >= 0.95) rank = "S";
    else if (acc >= 0.85) rank = "A";
    else if (acc >= 0.7) rank = "B";
    const status = document.getElementById("r-status");
    status.textContent = failed ? "FAILED..." : "RESULT";
    status.classList.toggle("failed", !!failed);
    const rankEl = document.getElementById("r-rank");
    rankEl.textContent = rank;
    rankEl.classList.toggle("failed", !!failed);
    document.getElementById("r-song").textContent =
      currentSong().title + " ／ " + DIFF_NAMES[selDiff];
    document.getElementById("r-score").textContent = Math.round(score).toLocaleString();
    document.getElementById("r-acc").textContent = (acc * 100).toFixed(1) + "%";
    document.getElementById("r-combo").textContent = maxCombo;
    document.getElementById("r-perfect").textContent = counts.perfect;
    document.getElementById("r-good").textContent = counts.good;
    document.getElementById("r-miss").textContent = counts.miss;
    showScreen("result");
    setNav([
      document.getElementById("retry-btn"),
      document.getElementById("share-x"),
      document.getElementById("share-threads"),
      document.getElementById("share-line"),
      document.getElementById("share-ig"),
      document.getElementById("result-songs-btn"),
    ], 0);
  }

  function setJudge(text, color) {
    judgeFx = { text, color, until: performance.now() + 500 };
  }

  function addHp(v) {
    hp = Math.max(0, Math.min(HP_MAX, hp + v));
  }

  function isHeld(lane) {
    return keyHeld[lane] || touchHeld[lane] > 0 || mouseLane === lane;
  }

  function hitLane(lane) {
    if (state !== "playing") return;
    laneFlash[lane] = performance.now() + 130;
    GameAudio.playTap();
    const now = player.now();
    let best = null;
    let bestDiff = GOOD;
    for (const n of notes) {
      if (n.judged || n.lane !== lane) continue;
      if (n.time - now > GOOD) break;
      const d = Math.abs(n.time - now);
      if (d <= bestDiff) { best = n; bestDiff = d; }
    }
    if (!best) {
      // 空打ちペナルティ(全ボタン連打のズル対策): コンボが切れて体力が減る
      // ただし曲が始まる前(最初のノーツより手前)はペナルティなし
      if (notes.length && now < notes[0].time - APPROACH) return;
      combo = 0;
      addHp(HP_EMPTY);
      setJudge("×", "#777a99");
      return;
    }
    best.judged = true;
    if (bestDiff <= PERFECT) {
      best.result = "perfect";
      counts.perfect++;
      combo++;
      score += 100;
      addHp(HP_PERFECT);
      setJudge("PERFECT", "#ffd75e");
    } else {
      best.result = "good";
      counts.good++;
      combo++;
      score += 50;
      addHp(HP_GOOD);
      setJudge("GOOD", "#6fe3ff");
    }
    if (combo > maxCombo) maxCombo = combo;
    if (best.dur > 0) {
      best.holding = true;
      best.nextTick = now + HOLD_TICK;
    }
  }

  function updateMisses(now) {
    for (const n of notes) {
      if (n.judged) continue;
      if (n.time < now - GOOD) {
        n.judged = true;
        n.result = "miss";
        counts.miss++;
        combo = 0;
        addHp(HP_MISS);
        setJudge("MISS", "#777a99");
      } else {
        break;
      }
    }
  }

  function updateHolds(now) {
    for (const n of notes) {
      if (!n.holding) continue;
      const end = n.time + n.dur;
      if (!isHeld(n.lane)) {
        n.holding = false;
        continue;
      }
      while (n.nextTick <= Math.min(now, end)) {
        score += 10;
        addHp(HP_HOLD_TICK);
        n.nextTick += HOLD_TICK;
      }
      if (now >= end) {
        n.holding = false;
        laneFlash[n.lane] = performance.now() + 130;
      }
    }
  }

  // ---- 描画 ----
  function noteY(t, now) {
    return hitY - ((t - now) / APPROACH) * hitY;
  }

  function render(now) {
    const pnow = performance.now();
    const colors = COLOR_SETS[lanes];
    const keys = KEY_LABELS[lanes];
    const T = currentTheme();
    const bpm = currentSong().bpm;

    drawSky(now, bpm, T);

    // レーンフィールド
    g.fillStyle = "rgba(14, 15, 30, 0.74)";
    g.fillRect(fieldX, 0, fieldW, padTop);
    g.strokeStyle = "rgba(80, 84, 140, 0.5)";
    g.lineWidth = 1;
    for (let i = 0; i <= lanes; i++) {
      const x = fieldX + i * laneW;
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x, padTop);
      g.stroke();
    }

    // レーン発光
    for (let i = 0; i < lanes; i++) {
      if (pnow < laneFlash[i]) {
        const grad = g.createLinearGradient(0, hitY - 180, 0, hitY);
        grad.addColorStop(0, "rgba(255,255,255,0)");
        grad.addColorStop(1, hexToRgba(colors[i], 0.28));
        g.fillStyle = grad;
        g.fillRect(fieldX + i * laneW, hitY - 180, laneW, 180);
      }
    }

    // 判定ライン(ビートで光る)
    let beatGlow = 0;
    if (bpm > 0 && now > 0) {
      const ph = (now % (60 / bpm)) / (60 / bpm);
      beatGlow = Math.max(0, 1 - ph * 3);
    }
    g.save();
    g.shadowColor = "#9d7bff";
    g.shadowBlur = 8 + beatGlow * 16;
    g.fillStyle = "#f0f0f8";
    g.fillRect(fieldX, hitY - 2, fieldW, 4);
    g.restore();
    g.fillStyle = "rgba(240,240,248,0.25)";
    g.fillRect(fieldX, hitY + 3, fieldW, 8);

    // ノーツ
    const noteH = Math.max(15, laneW * 0.2);
    for (const n of notes) {
      const isActiveHold = n.dur > 0 && n.holding;
      if (n.judged && !isActiveHold && n.result !== "miss") continue;
      const dt = n.time - now;
      if (dt > APPROACH) break;
      const x = fieldX + n.lane * laneW + laneW * 0.08;
      const w = laneW * 0.84;
      const headY = n.judged && isActiveHold ? hitY : noteY(n.time, now);
      if (!isActiveHold && (headY < -noteH * 2 || headY > padTop + noteH)) {
        if (n.dur === 0) continue;
      }

      // ホールドの帯
      if (n.dur > 0) {
        const tailY = Math.max(noteY(n.time + n.dur, now), -noteH);
        const topY = Math.min(headY, hitY);
        g.save();
        if (n.result === "miss") g.globalAlpha = 0.2;
        const bw = w * 0.52;
        const bx = x + (w - bw) / 2;
        g.fillStyle = hexToRgba(colors[n.lane], isActiveHold ? 0.55 : 0.3);
        roundRect(bx, tailY, bw, Math.max(4, topY - tailY), 7);
        g.fill();
        g.strokeStyle = hexToRgba(colors[n.lane], 0.8);
        g.lineWidth = 1.5;
        roundRect(bx, tailY, bw, Math.max(4, topY - tailY), 7);
        g.stroke();
        g.restore();
      }

      // ヘッドノーツ(ミスしたノーツは薄く落ちていく)
      if (!n.judged || isActiveHold || n.result === "miss") {
        g.save();
        if (n.result === "miss") g.globalAlpha = 0.25;
        g.shadowColor = colors[n.lane];
        g.shadowBlur = isActiveHold ? 20 : 12;
        g.fillStyle = colors[n.lane];
        roundRect(x, (isActiveHold ? hitY : headY) - noteH / 2, w, noteH, 6);
        g.fill();
        g.restore();
      }
    }

    // タッチパッド
    for (let i = 0; i < lanes; i++) {
      const x = fieldX + i * laneW;
      const lit = pnow < laneFlash[i] || isHeld(i);
      g.fillStyle = lit ? hexToRgba(colors[i], 0.55) : "rgba(27, 29, 54, 0.9)";
      roundRect(x + 4, padTop + 6, laneW - 8, H - padTop - 12, 10);
      g.fill();
      g.strokeStyle = colors[i];
      g.lineWidth = 2;
      roundRect(x + 4, padTop + 6, laneW - 8, H - padTop - 12, 10);
      g.stroke();
      if (!isTouchDev) {
        g.fillStyle = "#f0f0f8";
        g.font = "bold " + Math.min(24, laneW * 0.3) + "px sans-serif";
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillText(keys[i], x + laneW / 2, (padTop + H) / 2);
      }
    }

    // HUD: 進行バー
    g.fillStyle = "rgba(42, 44, 72, 0.9)";
    g.fillRect(0, 0, W, 5);
    g.fillStyle = "#9d7bff";
    g.fillRect(0, 0, W * Math.min(1, Math.max(0, now / endTime)), 5);

    // HUD: 体力バー(中央上)
    const hpW = Math.min(320, W * 0.5);
    const hpX = (W - hpW) / 2;
    g.fillStyle = "rgba(10, 11, 22, 0.75)";
    roundRect(hpX - 2, 10, hpW + 4, 14, 7);
    g.fill();
    const pct = hp / HP_MAX;
    g.fillStyle = pct > 0.5 ? "#4dff9d" : pct > 0.25 ? "#ffd75e" : "#ff5c5c";
    if (pct > 0) {
      roundRect(hpX, 12, Math.max(6, hpW * pct), 10, 5);
      g.fill();
    }

    // HUD: 曲名+難易度(中央)、スコア(右)
    g.textBaseline = "top";
    g.fillStyle = "rgba(240, 240, 248, 0.75)";
    g.font = "13px sans-serif";
    g.textAlign = "center";
    let label = currentSong().title + " [" + DIFF_NAMES[selDiff] + "]";
    if (g.measureText(label).width > W - 200) {
      label = currentSong().title.slice(0, 10) + "… [" + DIFF_NAMES[selDiff] + "]";
    }
    g.fillText(label, W / 2, 30);

    g.fillStyle = "#f0f0f8";
    g.font = "bold 20px sans-serif";
    g.textAlign = "right";
    g.fillText(Math.round(score).toLocaleString(), W - 14, 12);

    // コンボ
    if (combo >= 2) {
      g.textAlign = "center";
      g.fillStyle = "rgba(240,240,248,0.9)";
      g.font = "bold " + Math.min(44, W * 0.09) + "px sans-serif";
      g.fillText(combo + " COMBO", W / 2, H * 0.28);
    }

    // 判定表示
    if (judgeFx && pnow < judgeFx.until) {
      const a = (judgeFx.until - pnow) / 500;
      g.textAlign = "center";
      g.fillStyle = hexToRgba(judgeFx.color, Math.min(1, a * 2));
      g.font = "bold " + Math.min(36, W * 0.08) + "px sans-serif";
      g.fillText(judgeFx.text, W / 2, hitY - 110);
    }

    // READY表示
    if (notes.length > 0 && now < notes[0].time - APPROACH) {
      g.textAlign = "center";
      g.fillStyle = "rgba(240,240,248,0.85)";
      g.font = "bold " + Math.min(34, W * 0.07) + "px sans-serif";
      g.fillText("READY...", W / 2, H * 0.42);
    }
  }

  function roundRect(x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  function hexToRgba(hex, a) {
    const v = parseInt(hex.slice(1), 16);
    return `rgba(${(v >> 16) & 255},${(v >> 8) & 255},${v & 255},${a})`;
  }

  function loop() {
    if (state !== "playing") return;
    const now = player.now();
    updateMisses(now);
    updateHolds(now);
    render(now);
    if (hp <= 0) {
      endGame(true);
      return;
    }
    if (now > endTime || player.ended()) {
      endGame(false);
      return;
    }
    rafId = requestAnimationFrame(loop);
  }

  // ---- 入力 ----
  window.addEventListener("keydown", (e) => {
    if (e.repeat) return;
    if (state === "playing") {
      if (e.code === "Escape") {
        e.preventDefault();
        pauseGame();
        return;
      }
      const lane = KEY_SETS[lanes].indexOf(e.code);
      if (lane >= 0) {
        e.preventDefault();
        keyHeld[lane] = true;
        hitLane(lane);
      }
    } else if (state === "paused") {
      // 一時停止: ↑↓で再開/最初から/曲選択を選び、Enterで決定。Escで再開
      if (e.code === "Escape") {
        e.preventDefault();
        resumeGame();
      } else if (e.code === "ArrowUp" || e.code === "ArrowDown") {
        e.preventDefault();
        moveNav(e.code === "ArrowDown" ? 1 : -1);
      } else if (e.code === "Enter" || e.code === "Space") {
        e.preventDefault();
        activateNav();
      }
    } else if (state === "songs") {
      // 曲選択: ←→で曲を回す・↑↓で「この曲であそぶ/タイトルへ」を選ぶ・Enterで決定
      if (e.code === "ArrowLeft" || e.code === "ArrowRight") {
        e.preventDefault();
        rotateSong(e.code === "ArrowRight" ? 1 : -1);
      } else if (e.code === "ArrowUp" || e.code === "ArrowDown") {
        e.preventDefault();
        moveNav(e.code === "ArrowDown" ? 1 : -1);
      } else if (e.code === "Enter" || e.code === "Space") {
        e.preventDefault();
        activateNav();
      }
    } else if (state === "diff") {
      // 難易度選択: ↑↓(←→でも可)で各難易度と「曲選択へ戻る」を選び、Enterで決定
      if (e.code === "ArrowUp" || e.code === "ArrowLeft") {
        e.preventDefault();
        moveNav(-1);
      } else if (e.code === "ArrowDown" || e.code === "ArrowRight") {
        e.preventDefault();
        moveNav(1);
      } else if (e.code === "Enter" || e.code === "Space") {
        e.preventDefault();
        activateNav();
      }
    } else if (state === "result") {
      // リザルト: ↑↓で「もう一度/各シェア/曲選択へ」を選び、Enterで決定
      if (e.code === "ArrowUp" || e.code === "ArrowDown") {
        e.preventDefault();
        moveNav(e.code === "ArrowDown" ? 1 : -1);
      } else if (e.code === "Enter" || e.code === "Space") {
        e.preventDefault();
        activateNav();
      }
    } else if (state === "title") {
      // タイトル: ↑↓で「スタート/音量」を選ぶ。音量は←→で調整、スタートはEnterで決定
      if (e.code === "ArrowUp" || e.code === "ArrowDown") {
        e.preventDefault();
        moveNav(e.code === "ArrowDown" ? 1 : -1);
      } else if (e.code === "ArrowLeft" || e.code === "ArrowRight") {
        if (navList[navIndex] && navList[navIndex].classList.contains("volume-row")) {
          e.preventDefault();
          nudgeVolume(e.code === "ArrowRight" ? 5 : -5);
        }
      } else if (e.code === "Enter" || e.code === "Space") {
        e.preventDefault();
        if (navList[navIndex] && navList[navIndex].id === "start-btn") activateNav();
      }
    }
  });

  window.addEventListener("keyup", (e) => {
    const lane = KEY_SETS[lanes].indexOf(e.code);
    if (lane >= 0) keyHeld[lane] = false;
  });

  window.addEventListener("blur", () => {
    keyHeld.fill(false);
    touchHeld.fill(0);
    touchLaneMap.clear();
    mouseLane = -1;
    if (state === "playing") pauseGame(); // タブ切替中に曲だけ進んでミスが積み上がるのを防ぐ
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && state === "playing") pauseGame();
  });

  function pointToLane(clientX) {
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const lane = Math.floor((x - fieldX) / laneW);
    return Math.max(0, Math.min(lanes - 1, lane));
  }

  canvas.addEventListener(
    "touchstart",
    (e) => {
      if (state !== "playing") return;
      e.preventDefault();
      for (const t of e.changedTouches) {
        const lane = pointToLane(t.clientX);
        touchLaneMap.set(t.identifier, lane);
        touchHeld[lane]++;
        hitLane(lane);
      }
    },
    { passive: false }
  );

  function releaseTouches(e) {
    for (const t of e.changedTouches) {
      const lane = touchLaneMap.get(t.identifier);
      if (lane !== undefined) {
        touchHeld[lane] = Math.max(0, touchHeld[lane] - 1);
        touchLaneMap.delete(t.identifier);
      }
    }
  }
  canvas.addEventListener("touchend", releaseTouches);
  canvas.addEventListener("touchcancel", releaseTouches);

  canvas.addEventListener("mousedown", (e) => {
    if (state !== "playing") return;
    const lane = pointToLane(e.clientX);
    mouseLane = lane;
    hitLane(lane);
  });
  window.addEventListener("mouseup", () => { mouseLane = -1; });

  // ボタン類
  document.getElementById("start-btn").addEventListener("click", () => {
    GameAudio.ensureCtx();
    buildSongList();
    showScreen("songs");
    startPreview();
  });
  document.getElementById("song-back-btn").addEventListener("click", () => showScreen("title"));
  document.getElementById("diff-back-btn").addEventListener("click", () => {
    buildSongList();
    showScreen("songs");
    startPreviewIfNeeded(); // 曲選択へ戻る(試聴は継続)
  });
  pauseBtn.addEventListener("click", pauseGame);
  document.getElementById("resume-btn").addEventListener("click", resumeGame);
  document.getElementById("restart-btn").addEventListener("click", () => {
    screens.pause.classList.add("hidden");
    startGame();
  });
  document.getElementById("quit-btn").addEventListener("click", backToSongs);
  document.getElementById("retry-btn").addEventListener("click", startGame);
  document.getElementById("result-songs-btn").addEventListener("click", backToSongs);

  // 音量スライダー(タイトル画面)
  const volSlider = document.getElementById("vol-slider");
  const volVal = document.getElementById("vol-val");
  if (volSlider) {
    const v0 = Math.round(GameAudio.getVolume() * 100);
    volSlider.value = v0;
    if (volVal) volVal.textContent = v0;
    volSlider.addEventListener("input", () => {
      const v = parseInt(volSlider.value, 10) || 0;
      GameAudio.setVolume(v / 100);
      if (volVal) volVal.textContent = v;
    });
  }

  // ←→キーでの音量調整(タイトル画面で音量にフォーカス中)
  function nudgeVolume(d) {
    if (!volSlider) return;
    const v = Math.max(0, Math.min(100, (parseInt(volSlider.value, 10) || 0) + d));
    volSlider.value = v;
    GameAudio.setVolume(v / 100);
    if (volVal) volVal.textContent = v;
  }

  // ---- リザルトのSNSシェア(X / Threads / LINE / Instagram) ----
  const SHARE_URL = "https://gryo1240.github.io/rinne-apps/star-beats/";

  function shareText() {
    const rank = document.getElementById("r-rank").textContent;
    const sc = document.getElementById("r-score").textContent;
    const ac = document.getElementById("r-acc").textContent;
    const cb = document.getElementById("r-combo").textContent;
    return "STAR BEATSで「" + currentSong().title + "」[" + DIFF_NAMES[selDiff] +
      "] をプレイ！\nランク" + rank + " / スコア" + sc + " / 精度" + ac +
      " / 最大" + cb + "コンボ\n#STARBEATS #音ゲー";
  }

  function openShare(url) {
    window.open(url, "_blank", "noopener");
  }

  function showToast(msg) {
    const t = document.getElementById("share-toast");
    if (!t) return;
    t.textContent = msg;
    t.classList.remove("hidden");
    clearTimeout(showToast._tm);
    showToast._tm = setTimeout(() => t.classList.add("hidden"), 2600);
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise((resolve, reject) => {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try {
        if (document.execCommand("copy")) resolve();
        else reject(new Error("copy失敗"));
      } catch (err) {
        reject(err);
      } finally {
        ta.remove();
      }
    });
  }

  document.getElementById("share-x").addEventListener("click", () => {
    openShare("https://twitter.com/intent/tweet?text=" + encodeURIComponent(shareText()) +
      "&url=" + encodeURIComponent(SHARE_URL));
  });
  document.getElementById("share-threads").addEventListener("click", () => {
    openShare("https://www.threads.net/intent/post?text=" +
      encodeURIComponent(shareText() + "\n" + SHARE_URL));
  });
  document.getElementById("share-line").addEventListener("click", () => {
    openShare("https://social-plugins.line.me/lineit/share?url=" + encodeURIComponent(SHARE_URL) +
      "&text=" + encodeURIComponent(shareText()));
  });
  document.getElementById("share-ig").addEventListener("click", () => {
    // Instagramは投稿用のWebリンクがないため、スマホはOSの共有シート、PCは本文コピー→IGを開く
    if (navigator.share) {
      navigator.share({ title: "STAR BEATS", text: shareText(), url: SHARE_URL }).catch(() => {});
    } else {
      copyText(shareText() + "\n" + SHARE_URL)
        .then(() => showToast("結果をコピーしました！Instagramに貼り付けて投稿してね"))
        .catch(() => showToast("コピーできませんでした"));
      openShare("https://www.instagram.com/");
    }
  });

  // クリックしたボタンにブラウザ標準フォーカスが残ると、Enter/Spaceがボタンと
  // ゲーム操作の両方に効いて二重発火するため、クリック後は外す
  document.querySelectorAll(".overlay").forEach((ov) => {
    ov.addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (b) b.blur();
    });
  });

  // ---- デモモード(?demo=1でボットが自動プレイ。宣伝動画の自動録画用途。通常プレイには影響しない) ----
  // ?song=<SONG_LIBRARYのid> ?diff=easy|normal|hard|fever で曲・難易度を指定可(既定は0曲目・normal)
  const isDemo = new URLSearchParams(location.search).get("demo") === "1";
  if (isDemo) {
    const params = new URLSearchParams(location.search);
    const songId = params.get("song");
    const foundIdx = songId ? SONG_LIBRARY.findIndex((s) => s.id === songId) : -1;
    const demoSongIdx = foundIdx >= 0 ? foundIdx : 0;
    const demoDiff = params.get("diff") || "normal";

    const _origLoop = loop;
    loop = function () {
      if (state === "playing" && player) {
        const now = player.now();
        for (const n of notes) {
          if (n.judged) continue;
          if (n.__jitter === undefined) n.__jitter = Math.random() * 0.06 - 0.03; // ±30ms(見た目の自然さ用)
          if (now + n.__jitter < n.time) break; // notesは時刻順のため、まだ先のノーツで打ち切り
          if (n.dur > 0) {
            keyHeld[n.lane] = true;
            setTimeout(() => { keyHeld[n.lane] = false; }, n.dur * 1000);
          }
          hitLane(n.lane);
        }
      }
      _origLoop();
    };

    GameAudio.ensureCtx();
    selSong = demoSongIdx;
    selDiff = demoDiff;
    setTimeout(() => {
      startGame();
      if (player && player.connectRecording) player.connectRecording();
    }, 500);
  }

  // ---- デモ動画の録画(?demo=1限定・宣伝動画作成ツール(tools/record_demo.py)から呼び出す) ----
  window.__startDemoRecording = function (durationMs) {
    return new Promise((resolve, reject) => {
      try {
        const videoStream = canvas.captureStream(60);
        const audioStream = GameAudio.getRecordingDestination().stream;
        const combined = new MediaStream([...videoStream.getVideoTracks(), ...audioStream.getAudioTracks()]);
        const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
          ? "video/webm;codecs=vp9,opus" : "video/webm";
        const rec = new MediaRecorder(combined, { mimeType, videoBitsPerSecond: 6000000 });
        const chunks = [];
        rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
        rec.onstop = () => {
          const blob = new Blob(chunks, { type: mimeType });
          const a = document.createElement("a");
          a.href = URL.createObjectURL(blob);
          a.download = "star-beats-demo.webm";
          document.body.appendChild(a);
          a.click();
          a.remove();
          resolve({ size: blob.size });
        };
        rec.start();
        setTimeout(() => rec.stop(), durationMs);
      } catch (err) { reject(err); }
    });
  };

  // 初期化
  resize();
  showScreen("title");
})();

"use strict";

// ============================================================
// 音声まわり一式
//   GameAudio.ensureCtx()             共有AudioContext
//   GameAudio.playTap()               タップ効果音
//   GameAudio.createSynthPlayer(diff) 仮音源(シンセ)プレイヤー
//   GameAudio.createFilePlayer(song, diff) 楽曲(mp3)のハイライト区間プレイヤー
//   GameAudio.createPreview(song)     サビ試聴(難易度選択画面用)
//   GameAudio.synthNoteCount(diff)    デモ曲のノーツ数(表示用)
//
// プレイヤー共通インターフェース:
//   { notes, duration, start(), stop(), pause(), resume(), now(), ended() }
//   notes は [[時刻(秒), レーン, ホールド秒(0=単ノーツ)], ...] 形式
// ============================================================

const GameAudio = (() => {
  let ctx = null;
  function ensureCtx() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  // マスター音量(0〜1)。タイトル画面のスライダーで変更し localStorage に保存する。
  let master = 0.7;
  try {
    const saved = parseFloat(localStorage.getItem("starbeats_vol"));
    if (!isNaN(saved)) master = Math.max(0, Math.min(1, saved));
  } catch (e) {}
  function setVolume(v) {
    master = Math.max(0, Math.min(1, v));
    try { localStorage.setItem("starbeats_vol", String(master)); } catch (e) {}
  }
  function getVolume() { return master; }

  let noiseBuf = null;
  function getNoise() {
    const c = ensureCtx();
    if (!noiseBuf) {
      noiseBuf = c.createBuffer(1, Math.floor(c.sampleRate * 0.3), c.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    return noiseBuf;
  }

  function envGain(c, t, peak, decay, dest) {
    const g = c.createGain();
    g.gain.setValueAtTime(peak, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + decay);
    g.connect(dest);
    return g;
  }

  function playTap() {
    const c = ensureCtx();
    if (c.state !== "running" || master <= 0) return;
    const t = c.currentTime;
    const src = c.createBufferSource();
    src.buffer = getNoise();
    const f = c.createBiquadFilter();
    f.type = "highpass";
    f.frequency.value = 3200;
    src.connect(f);
    f.connect(envGain(c, t, 0.09 * master, 0.05, c.destination));
    src.start(t);
    src.stop(t + 0.07);
  }

  // ---------------------------------------------------------
  // 仮音源シンセ(デモ曲)
  // ---------------------------------------------------------
  const BPM = 128;
  const BEAT = 60 / BPM;
  const MEASURES = 32;
  const LEAD_IN = 3.0;
  const DURATION = LEAD_IN + MEASURES * 4 * BEAT + 1.5;

  const SYNTH_DIFF = {
    easy:   { lanes: 4, mult: 1.0 },
    normal: { lanes: 4, mult: 1.4 },
    hard:   { lanes: 6, mult: 1.7 },
    fever:  { lanes: 6, mult: 2.0 },
  };

  const LANE_FREQS = [329.63, 392.0, 440.0, 493.88, 587.33, 659.25];
  const BASS_FREQS = [82.41, 65.41, 98.0, 73.42];

  function mulberry32(seed) {
    return function () {
      seed |= 0;
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function buildSynthChart(lanes, mult) {
    const rng = mulberry32(20260704);
    const notes = [];
    let prevLane = -1;
    for (let m = 0; m < MEASURES; m++) {
      let density;
      if (m < 4) density = 0.28;
      else if (m < 12) density = 0.42;
      else if (m < 24) density = 0.55;
      else density = 0.68;
      density = Math.min(0.85, density * mult);
      for (let e = 0; e < 8; e++) {
        const isDownBeat = e % 2 === 0;
        const prob = isDownBeat ? density : density * 0.45;
        if (rng() < prob) {
          let lane = Math.floor(rng() * lanes);
          if (lane === prevLane && rng() < 0.6) {
            lane = (lane + 1 + Math.floor(rng() * (lanes - 1))) % lanes;
          }
          const time = LEAD_IN + (m * 8 + e) * (BEAT / 2);
          notes.push([Math.round(time * 1000) / 1000, lane, 0]);
          prevLane = lane;
          if (m >= 24 && isDownBeat && rng() < 0.1) {
            const lane2 = (lane + Math.floor(lanes / 2)) % lanes;
            notes.push([Math.round(time * 1000) / 1000, lane2, 0]);
          }
        }
      }
    }
    notes.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    return notes;
  }

  function synthNoteCount(diff) {
    const d = SYNTH_DIFF[diff];
    return buildSynthChart(d.lanes, d.mult).length;
  }

  function createSynthPlayer(diff) {
    const c = ensureCtx();
    const cfg = SYNTH_DIFF[diff];
    const notes = buildSynthChart(cfg.lanes, cfg.mult);

    const master = c.createGain();
    master.gain.value = 0.8;
    master.connect(c.destination);

    function kick(t) {
      const o = c.createOscillator();
      o.type = "sine";
      o.frequency.setValueAtTime(150, t);
      o.frequency.exponentialRampToValueAtTime(42, t + 0.09);
      o.connect(envGain(c, t, 0.9, 0.22, master));
      o.start(t);
      o.stop(t + 0.25);
    }
    function noiseHit(t, peak, decay, freq) {
      const src = c.createBufferSource();
      src.buffer = getNoise();
      const f = c.createBiquadFilter();
      f.type = "highpass";
      f.frequency.value = freq;
      src.connect(f);
      f.connect(envGain(c, t, peak, decay, master));
      src.start(t);
      src.stop(t + decay + 0.05);
    }
    function snare(t) {
      noiseHit(t, 0.4, 0.14, 1600);
      const o = c.createOscillator();
      o.type = "triangle";
      o.frequency.setValueAtTime(190, t);
      o.connect(envGain(c, t, 0.25, 0.1, master));
      o.start(t);
      o.stop(t + 0.12);
    }
    function bass(t, measure) {
      const o = c.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = BASS_FREQS[measure % BASS_FREQS.length];
      const f = c.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = 420;
      o.connect(f);
      f.connect(envGain(c, t, 0.35, 0.4, master));
      o.start(t);
      o.stop(t + 0.45);
    }
    function pluck(t, lane) {
      const o = c.createOscillator();
      o.type = "triangle";
      o.frequency.value = LANE_FREQS[lane % LANE_FREQS.length];
      o.connect(envGain(c, t, 0.38, 0.3, master));
      o.start(t);
      o.stop(t + 0.32);
    }
    function countClick(t, last) {
      const o = c.createOscillator();
      o.type = "square";
      o.frequency.value = last ? 1318.5 : 880;
      o.connect(envGain(c, t, 0.2, 0.08, master));
      o.start(t);
      o.stop(t + 0.1);
    }

    let startAt = 0;
    let schedTimer = null;
    let nextHalfBeat = 0;
    let nextNote = 0;
    const totalHalfBeats = MEASURES * 8;

    function scheduleWindow() {
      const until = c.currentTime + 0.35;
      while (nextHalfBeat < totalHalfBeats) {
        const t = startAt + LEAD_IN + nextHalfBeat * (BEAT / 2);
        if (t > until) break;
        if (t >= c.currentTime - 0.01) {
          const beat = Math.floor(nextHalfBeat / 2);
          const bim = beat % 4;
          noiseHit(t, nextHalfBeat % 2 === 0 ? 0.28 : 0.16, 0.05, 7500);
          if (nextHalfBeat % 2 === 0) {
            kick(t);
            if (bim === 1 || bim === 3) snare(t);
            if (bim === 0 || bim === 2) bass(t, Math.floor(beat / 4));
          }
        }
        nextHalfBeat++;
      }
      while (nextNote < notes.length) {
        const n = notes[nextNote];
        const t = startAt + n[0];
        if (t > until) break;
        if (t >= c.currentTime - 0.01) pluck(t, n[1]);
        nextNote++;
      }
    }

    return {
      notes,
      duration: DURATION,
      start() {
        ensureCtx();
        startAt = c.currentTime + 0.12;
        nextHalfBeat = 0;
        nextNote = 0;
        for (let i = 4; i >= 1; i--) countClick(startAt + LEAD_IN - i * BEAT, i === 1);
        scheduleWindow();
        schedTimer = setInterval(scheduleWindow, 100);
        return Promise.resolve();
      },
      stop() {
        if (schedTimer) clearInterval(schedTimer);
        schedTimer = null;
        master.gain.setTargetAtTime(0, c.currentTime, 0.05);
        setTimeout(() => master.disconnect(), 400);
        if (c.state === "suspended") c.resume();
      },
      pause() {
        return c.suspend();
      },
      resume() {
        return c.resume();
      },
      now() {
        return c.currentTime - startAt;
      },
      ended() {
        return this.now() > DURATION;
      },
    };
  }

  // ---------------------------------------------------------
  // 楽曲ファイル(mp3)のハイライト区間プレイヤー
  // 音声ファイルは加工せず、seg.start〜seg.end だけを再生する。
  // 頭はフェードイン、終わりはフェードアウト。
  // ---------------------------------------------------------
  function createFilePlayer(song, diff) {
    const audio = new Audio(song.audio);
    audio.preload = "auto";
    const segStart = song.seg ? song.seg.start : 0;
    const dur = song.duration;
    const notes = song.difficulties[diff].notes;
    let fadeTimer = null;

    function startFade() {
      if (fadeTimer) clearInterval(fadeTimer);
      fadeTimer = setInterval(() => {
        const t = audio.currentTime - segStart;
        audio.volume = master * Math.max(0, Math.min(1, 0.25 + t * 1.5, (dur - t) / 1.8));
      }, 80);
    }

    function seekPlay() {
      audio.currentTime = segStart;
      audio.volume = 0.25 * master;
      startFade();
      const p = audio.play();
      return p && p.catch ? p : Promise.resolve();
    }

    return {
      notes,
      duration: dur,
      start() {
        ensureCtx(); // タップ効果音用
        if (audio.readyState >= 1) return seekPlay();
        return new Promise((resolve, reject) => {
          audio.addEventListener("loadedmetadata", () => seekPlay().then(resolve, reject), { once: true });
          audio.addEventListener("error", reject, { once: true });
        });
      },
      stop() {
        if (fadeTimer) clearInterval(fadeTimer);
        fadeTimer = null;
        audio.pause();
      },
      pause() {
        audio.pause();
      },
      resume() {
        const p = audio.play();
        return p && p.catch ? p : Promise.resolve();
      },
      now() {
        return audio.currentTime - segStart;
      },
      ended() {
        return audio.ended || this.now() >= dur;
      },
    };
  }

  // ---------------------------------------------------------
  // サビ試聴(難易度選択画面用)。12秒ループ+フェード
  // ---------------------------------------------------------
  function createPreview(song) {
    if (song.source !== "file") return null;
    const audio = new Audio(song.audio);
    audio.preload = "auto";
    const at = typeof song.preview === "number" ? song.preview : (song.seg ? song.seg.start : 0);
    let timer = null;
    let stopped = false;

    function begin() {
      if (stopped) return;
      audio.currentTime = at;
      audio.volume = 0;
      const p = audio.play();
      if (p && p.catch) p.catch(() => {});
      timer = setInterval(() => {
        if (stopped) return;
        const t = audio.currentTime - at;
        audio.volume = master * Math.max(0, Math.min(0.55, t * 1.2, (12 - t) * 0.5));
        if (t >= 12) audio.currentTime = at;
      }, 80);
    }

    if (audio.readyState >= 1) begin();
    else audio.addEventListener("loadedmetadata", begin, { once: true });

    return {
      stop() {
        stopped = true;
        if (timer) clearInterval(timer);
        audio.pause();
      },
    };
  }

  return { ensureCtx, playTap, createSynthPlayer, createFilePlayer, createPreview, synthNoteCount, setVolume, getVolume };
})();

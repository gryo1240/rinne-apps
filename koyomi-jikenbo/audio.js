"use strict";
/*
 * 宵乃こよみの事件簿 - BGM再生（Web Audio API）
 * 方針(advisor): <audio loop>ではなくAudioBufferSourceNodeでのループを使う。
 * 理由: <audio>のRangeリクエスト(206)をsw.jsのcache.put()に渡すと例外になるため
 * (Cache APIは206を保存できない)。fetch()での全量取得(200)ならこの問題を回避できる。
 *
 * ループ素材(assets/bgm_amaoto.mp3)は、元素材(ゲーム音楽/雨音の子守唄.mp3)の
 * イントロ2秒手前にあった音量の急な立ち上がりと、末尾の自然なフェードアウトの
 * 音量差でループ地点にポップ音が出た問題を、ffmpegで始点1.8秒フェードイン+
 * 終端0.35秒フェードアウトを焼き込むことで解消した別ファイル(自動生成・要ffmpeg)。
 * 両端が無音に収束するため、単純な loopStart=0/loopEnd=duration で十分シームレス。
 *
 * 2026-07-16: ミュートON/OFFのトグルボタンから、0〜100のスライダーによる音量調整に変更。
 */
var AUDIO = (function () {
  var KEY_SETTINGS = "koyomi-jikenbo:settings"; // KEY_METAとは別キー(mergeMetaのunionマージ対象にしない)
  var BGM_URL = "assets/bgm_amaoto.mp3";
  var DEFAULT_VOLUME = 0.6;

  var ctx = null, gainNode = null, buffer = null, source = null;
  var volume = loadVolume();
  var fetchPromise = null, started = false;

  function loadVolume() {
    try {
      var v = JSON.parse(localStorage.getItem(KEY_SETTINGS) || "{}").volume;
      return typeof v === "number" && v >= 0 && v <= 1 ? v : DEFAULT_VOLUME;
    } catch (e) { return DEFAULT_VOLUME; }
  }
  function saveVolume(v) {
    try { localStorage.setItem(KEY_SETTINGS, JSON.stringify({ volume: v })); } catch (e) {}
  }

  // ページ読込直後からフェッチ&デコードだけ先行させる(ユーザー操作を待たない)。
  // AudioContextの生成/再生開始はジェスチャ内でのみ行う。
  function prepare() {
    if (fetchPromise) return fetchPromise;
    fetchPromise = fetch(BGM_URL)
      .then(function (res) { return res.arrayBuffer(); })
      .then(function (ab) {
        var C = window.AudioContext || window.webkitAudioContext;
        if (!C) return null;
        if (!ctx) ctx = new C();
        return ctx.decodeAudioData(ab);
      })
      .then(function (buf) { buffer = buf; return buf; })
      .catch(function () { return null; }); // BGMが無くてもゲーム進行に影響させない
    return fetchPromise;
  }

  function playLoop() {
    if (!ctx || !buffer || source) return;
    source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    gainNode = ctx.createGain();
    gainNode.gain.value = volume;
    source.connect(gainNode).connect(ctx.destination);
    source.start(0);
  }

  // タイトル画面の最初のクリック(はじめから/つづきから等)から呼ぶ。何度呼んでも安全。
  function startOnGesture() {
    if (started) { if (ctx && ctx.state === "suspended") ctx.resume(); return; }
    started = true;
    prepare().then(function () {
      if (!ctx || !buffer) return;
      if (ctx.state === "suspended") ctx.resume();
      playLoop();
    });
  }

  function setVolume(v) {
    volume = Math.max(0, Math.min(1, v));
    saveVolume(volume);
    if (gainNode) gainNode.gain.value = volume; // スライダー操作への追従優先(即時反映)
  }
  function getVolume() { return volume; }

  function suspend() { if (ctx && ctx.state === "running") ctx.suspend(); }
  function resume() { if (ctx && ctx.state === "suspended" && started) ctx.resume(); }

  return { prepare: prepare, startOnGesture: startOnGesture, setVolume: setVolume, getVolume: getVolume, suspend: suspend, resume: resume };
})();
if (typeof module !== "undefined") module.exports = AUDIO;

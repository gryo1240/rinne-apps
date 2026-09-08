/**
 * ルナチェイン｜音（BGMと効果音）
 *
 * ★2026-09-08 3回目の作り直し（オーナー指示）★
 *   > SEや画面は、もっと派手な演出を出したいね。SEも特に単調すぎる。
 *   > 設定ボタンを押して、BGMやSEの調整（ができるように）
 *   > 盛り上げるためにテンションが高いBGMの方がいい。自作のBGMから選べないかな
 *
 *   → BGMを4曲入れて選べるようにし、効果音は「単発トーン1つ」から
 *     **ノイズの破裂＋音程のある胴体＋低音の芯** の3層に作り直した。
 *
 * ★BGMは自作曲（Suno生成）★
 *   同じ曲を音ゲー(star-beats)でも公開している。**魔王魂やSpringinの素材は使っていないので、
 *   それらのクレジットを出さないこと**（使っていないものを名乗るのは虚偽表記になる）。
 *
 * ★曲は必ずこのフォルダに置く（audio/*.mp3）★
 *   `../star-beats/charts/*.mp3` を相対参照してはいけない。
 *   tools/serve_game.py は**アプリのフォルダをドキュメントルートにして配信する**ので、
 *   親をまたぐURLはローカルでは必ず404になり、**本番でしか動かない経路**ができてしまう。
 *
 * ★iPhoneの消音スイッチ対策★（教訓 audio-ios-silent-switch）
 *   `navigator.audioSession.type = 'playback'` を **AudioContextを作る前に** 宣言する。
 *   これをしないと、iPhoneだけ音が鳴らない（エラーも例外も出ないので気づけない）。
 * ★解禁は once を付けず、複数の操作で拾う★
 *
 * ★音は絶対に例外を外へ出さない★——音が鳴らなくても遊べるが、例外が出ると遊べなくなる。
 */

/**
 * ★いちばん先に宣言する（読み込んだ瞬間・何かを作る前）★
 *   教訓 audio-ios-silent-switch は「AudioContextを作る前に宣言する」だが、
 *   **`new Audio()`（BGM用の要素）より前でもある必要がある**。
 *   もとは `unlock()`（最初のタップ）の中で宣言していて、その前に `boot()` が
 *   BGMの `<audio>` を作っていたため、**iPhoneでSEは鳴るのにBGMだけ鳴らない**（消音スイッチON時）
 *   状態になりうる形だった（2026-09-08のレビューで発覚）。
 *   ここはモジュールを読み込んだ時点で走るので、確実にいちばん先になる。
 */
try {
  if (globalThis.navigator && 'audioSession' in navigator) navigator.audioSession.type = 'playback';
} catch { /* 未対応のブラウザでは何もしない */ }

/** 音量の段階。★0/1/2 の3段だけ★（子どもの指ではスライダーは扱いにくい） */
export const VOL_STEPS = ['なし', 'ちいさい', 'おおきい'];
const SE_GAIN  = [0, 0.30, 0.60];
const BGM_GAIN = [0, 0.16, 0.34];

/**
 * 選べるBGM。★テンションが高い順に並べる★（既定は先頭）
 *   trim は曲ごとの音量差をならすための係数（原曲の音圧がばらばらなため）。
 */
export const BGM_LIST = [
  { id: 'throne',        name: '王座を奪う者',   file: 'audio/throne.mp3',        trim: 1.00 },
  { id: 'gaika',         name: '覇王の凱歌',     file: 'audio/gaika.mp3',         trim: 0.95 },
  { id: 'cherry-byte',   name: 'Cherry Byte',   file: 'audio/cherry-byte.mp3',   trim: 0.90 },
  { id: 'neon-velocity', name: 'Neon Velocity', file: 'audio/neon-velocity.mp3', trim: 0.90 },
];
export const DEFAULT_BGM = BGM_LIST[0].id;
export const bgmById = (id) => BGM_LIST.find((b) => b.id === id) || BGM_LIST[0];

// ── WebAudio（効果音） ─────────────────────────
let ctx = null;
let master = null;
let noiseBuf = null;
let seLevel = 2;

/**
 * ★同時に鳴らす音の上限★
 *   1手で300連鎖することがあり、以前は **1手ぶんの音を全部 delay 0 で同時に生成**していた。
 *   （演出は2.2秒に分散されているのに、音だけ分散されていなかった）
 *   いまは呼び出し側が delay を渡すが、それでも山は来るので上限で守る。
 */
const MAX_VOICES = 28;
let voices = [];               // 予約済みの音の終了時刻（昇順）

/**
 * ★数えるのは「同時に鳴る数」であって「予約した総数」ではない★
 *
 *   1手ぶんの音は、演出に合わせて**未来の時刻へまとめて予約する**（20連鎖なら70個ほど）。
 *   そのとき「いまの時刻より後に終わる音」を全部数えてしまうと、
 *   予約した瞬間はどれもまだ終わっていないので、**先頭の8回ぶんで上限に達して残りが全部消える**。
 *   ＝大きい連鎖ほど途中から無音になるという、狙いと正反対の壊れ方をする。
 *
 *   正しくは **その音が鳴り始める時刻(startAt)に、まだ鳴っている音** だけを数える。
 *   予約は時刻の早い順に来るので、先頭から「startAt までに終わる音」を捨てれば足りる。
 */
function budgetOk(startAt, endAt) {
  while (voices.length && voices[0] <= startAt) voices.shift();
  if (voices.length >= MAX_VOICES) return false;
  voices.push(endAt);
  voices.sort((a, b) => a - b);
  return true;
}

const clampLevel = (v) => (v === 0 || v === 1 || v === 2 ? v : 2);

export function setSeVol(level) {
  seLevel = clampLevel(level);
  if (master) master.gain.value = SE_GAIN[seLevel];
}

/** 音のオン・オフ1つだけだった頃との互換（新しい呼び出しでは使わない） */
export function setEnabled(v) { setSeVol(v ? 2 : 0); }

/** 最初の操作で呼ぶ。何度呼んでも安全 */
export function unlock() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  try {
    // ★AudioContextを作る前に宣言する
    if (globalThis.navigator && 'audioSession' in navigator) {
      try { navigator.audioSession.type = 'playback'; } catch { /* 未対応でも進む */ }
    }
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = SE_GAIN[seLevel];
    master.connect(ctx.destination);
    if (ctx.state === 'suspended') ctx.resume();
  } catch { ctx = null; }
}

/** ざらざらの音の素。★1回だけ作って使い回す★（毎回作ると連鎖のたびに一瞬止まる） */
function getNoise() {
  if (noiseBuf) return noiseBuf;
  const len = Math.floor(ctx.sampleRate * 0.4);
  noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let k = 0; k < len; k++) d[k] = Math.random() * 2 - 1;
  return noiseBuf;
}

/** 音程のある音 */
function tone({ freq = 440, dur = 0.12, type = 'sine', gain = 0.25, slide = 0, delay = 0, detune = 0 }) {
  if (!ctx || seLevel === 0) return;
  try {
    const t0 = ctx.currentTime + delay;
    if (!budgetOk(t0, t0 + dur)) return;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.detune.value = detune;
    osc.frequency.setValueAtTime(freq, t0);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq * slide), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g); g.connect(master);
    osc.start(t0); osc.stop(t0 + dur + 0.02);
  } catch { /* 音が鳴らなくても遊べる */ }
}

/** ざらざらの破裂音（「シャッ」）。★これが無いと、はじけても音が丸くて手ごたえが出ない★ */
function burst({ freq = 1400, dur = 0.13, gain = 0.2, delay = 0, q = 1.1, slide = 0.35 }) {
  if (!ctx || seLevel === 0) return;
  try {
    const t0 = ctx.currentTime + delay;
    if (!budgetOk(t0, t0 + dur)) return;
    const src = ctx.createBufferSource();
    src.buffer = getNoise();
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = q;
    bp.frequency.setValueAtTime(freq, t0);
    bp.frequency.exponentialRampToValueAtTime(Math.max(120, freq * slide), t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(bp); bp.connect(g); g.connect(master);
    src.start(t0); src.stop(t0 + dur + 0.02);
  } catch { /* 同上 */ }
}

const semitone = (n) => Math.pow(2, n / 12);
/** メジャーペンタトニック。★どの音を重ねても濁らない＝連鎖が伸びるほど気持ちよくなる★ */
const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28, 31, 33, 36];
const pentaOf = (n) => PENTA[Math.min(PENTA.length - 1, Math.max(0, n))];

export const SE = {
  tap: () => tone({ freq: 700, dur: 0.05, type: 'sine', gain: 0.10 }),

  place: () => {
    tone({ freq: 520, dur: 0.07, type: 'triangle', gain: 0.14 });
    burst({ freq: 2600, dur: 0.05, gain: 0.05, q: 2.2 });
  },

  /**
   * はじけた音。★連鎖が進むほど「高く・厚く・歪む」★
   *   delay（秒）は呼び出し側が渡す。**渡さないと1手ぶんの音が全部同時に鳴る**
   *   （2026-09-08 のアドバイザー指摘。演出は2.2秒に分散されているのに音だけ束になっていた）
   */
  boom: (chain = 1, delay = 0) => {
    const n = Math.max(0, chain - 1);
    const step = pentaOf(n);
    const hot = Math.min(1, n / 9);          // 0→1。連鎖が伸びるほど1に近づく
    // 1) ざらざらの破裂（音程が上がるほど明るい）
    burst({ freq: 1300 + hot * 2600, dur: 0.10 + hot * 0.05, gain: 0.11 + hot * 0.07, q: 1.0 + hot * 1.6, delay });
    // 2) 音程のある胴体。連鎖が浅いうちは三角波でやわらかく、伸びると矩形波で歪ませる
    tone({
      freq: 330 * semitone(step), dur: 0.13, gain: 0.10 + hot * 0.05,
      type: hot > 0.45 ? 'square' : 'triangle', slide: 1.5, delay,
    });
    // 3) 低音の芯（体で感じる部分）
    tone({ freq: 110 * semitone(step % 12), dur: 0.17, type: 'sine', gain: 0.10, delay });
    // 4) 大連鎖では少しずらした音を重ねて厚くする（うなりで「やばい感じ」が出る）
    if (hot > 0.45) {
      tone({ freq: 330 * semitone(step), dur: 0.15, type: 'sawtooth', gain: 0.05, detune: 14, delay: delay + 0.012 });
    }
  },

  /** マスを奪った数だけキラキラを散らす（多いほど気持ちよい） */
  capture: (n = 1, delay = 0) => {
    const k = Math.min(6, n | 0);
    for (let j = 0; j < k; j++) {
      tone({
        freq: 880 * semitone(pentaOf(j + 3)), dur: 0.10, type: 'sine',
        gain: 0.055, delay: delay + j * 0.035,
      });
    }
  },

  /**
   * 大連鎖のごほうび（きらめき）。
   * ★delay を渡すこと★ 5連鎖目が画面に出る時刻に合わせないと、ごほうびが先に鳴る
   */
  moon: (delay = 0) => {
    [0, 4, 7, 12, 16, 19].forEach((n, k) => tone({
      freq: 523 * semitone(n), dur: 0.34, type: 'sine', gain: 0.10, delay: delay + k * 0.05,
    }));
    burst({ freq: 5200, dur: 0.5, gain: 0.05, q: 0.7, slide: 0.25, delay });
  },

  /** 手番が変わった合図（★どちらの番かを音でも知らせる★） */
  turn: (mine = true) => {
    const base = mine ? 660 : 440;
    tone({ freq: base, dur: 0.09, type: 'triangle', gain: 0.09 });
    tone({ freq: base * semitone(mine ? 7 : -5), dur: 0.11, type: 'triangle', gain: 0.08, delay: 0.07 });
  },

  win: () => {
    [0, 4, 7, 12, 16, 19, 24].forEach((n, k) => tone({
      freq: 523 * semitone(n), dur: 0.36, type: 'triangle', gain: 0.13, delay: k * 0.08,
    }));
    burst({ freq: 4200, dur: 0.7, gain: 0.07, q: 0.6, slide: 0.2, delay: 0.05 });
    tone({ freq: 131, dur: 0.9, type: 'sine', gain: 0.10 });
  },

  lose: () => {
    [0, -3, -7, -12].forEach((n, k) => tone({
      freq: 392 * semitone(n), dur: 0.42, type: 'sine', gain: 0.12, delay: k * 0.11,
    }));
    burst({ freq: 700, dur: 0.6, gain: 0.05, q: 0.8, slide: 0.3, delay: 0.1 });
  },
};

// ── BGM（自作曲・HTMLAudioで鳴らす）────────────────
/*  ★decodeAudioData を使わない★
    2〜4MBのmp3をまるごとデコードすると、スマホでメモリと待ち時間が両方きつい。
    <audio> なら流しながら鳴らせるので、押した直後から鳴り始められる。 */
let bgmEl = null;
let bgmId = DEFAULT_BGM;
let bgmLevel = 1;
let bgmWant = false;           // 「いま鳴らしていたい」か（読み込み待ちの間もこれが正）

function ensureBgmEl() {
  if (bgmEl) return bgmEl;
  try {
    bgmEl = new Audio();
    bgmEl.loop = true;
    bgmEl.preload = 'none';    // ★選ばれるまで読みに行かない★（起動を重くしない）
    bgmEl.volume = 0;
    // 読めなくても黙って無音にする（曲が無いだけで遊べなくしない）
    bgmEl.addEventListener('error', () => { bgmWant = false; });
  } catch { bgmEl = null; }
  return bgmEl;
}

const bgmVolume = () => BGM_GAIN[bgmLevel] * bgmById(bgmId).trim;

export function setBgmVol(level) {
  bgmLevel = clampLevel(level);
  if (bgmEl) bgmEl.volume = bgmVolume();
  if (bgmLevel === 0) bgmStop();
}

export function setBgmSong(id) {
  const next = bgmById(id).id;
  if (next === bgmId && bgmEl && bgmEl.src) return;
  bgmId = next;
  const a = ensureBgmEl();
  if (!a) return;
  const wasPlaying = bgmWant;
  try {
    a.pause();
    a.src = bgmById(bgmId).file;
    a.currentTime = 0;
    a.volume = bgmVolume();
  } catch { /* 差し替えに失敗しても遊べる */ }
  if (wasPlaying) bgmPlay();
}

/** ★必ず「押した」流れの中から呼ぶ★（iPhoneは操作なしでは鳴らせない） */
export function bgmPlay() {
  if (bgmLevel === 0) return;
  const a = ensureBgmEl();
  if (!a) return;
  bgmWant = true;
  try {
    if (!a.src) { a.src = bgmById(bgmId).file; a.currentTime = 0; }
    a.volume = bgmVolume();
    const p = a.play();
    if (p && p.catch) p.catch(() => { /* 自動再生を止められた。無音で続ける */ });
  } catch { /* 同上 */ }
}

export function bgmStop() {
  bgmWant = false;
  if (!bgmEl) return;
  try { bgmEl.pause(); bgmEl.currentTime = 0; } catch { /* 同上 */ }
}

/** いま鳴らしている曲のid（設定画面の表示用） */
export const currentBgm = () => bgmId;
export const bgmPlaying = () => bgmWant;

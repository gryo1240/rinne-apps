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

/**
 * 音量は **0〜100**（2026-09-08 オーナー指示でスライドバーにした）。
 * ここは「0〜100 を実際の音の大きさに直す係数」だけを持つ。
 * ★BGMは効果音より控えめに天井を置く★ 同じ100でも、BGMが連鎖の音を埋めてしまわないように。
 */
/*  ★100 のときの大きさは、3段だった頃の「おおきい」と同じにする★
    ここを超えると、**全員が誰も試していない音量域に入る**（子どもがイヤホンで遊ぶ）。 */
const SE_MAX  = 0.60;
const BGM_MAX = 0.34;
const pct = (v, dflt = 0) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return dflt;
  return Math.min(100, Math.max(0, n));
};
/*  ★つまみの位置と、聞こえる大きさを合わせる★
    音の大きさは耳には対数で効くので、% をそのまま倍率にすると
    「少し動かしただけで大きくなり、後半は変わらない」つまみになる。2乗にして素直に近づける。 */
const gainOf = (v, max) => Math.pow(pct(v) / 100, 2) * max;

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
let seLevel = 100;               // 0〜100

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

export function setSeVol(level) {
  seLevel = pct(level, 100);
  if (master) master.gain.value = gainOf(seLevel, SE_MAX);
}

/** 音のオン・オフ1つだけだった頃との互換（新しい呼び出しでは使わない） */
export function setEnabled(v) { setSeVol(v ? 100 : 0); }

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
    master.gain.value = gainOf(seLevel, SE_MAX);
    master.connect(ctx.destination);
    if (ctx.state === 'suspended') ctx.resume();
    loadClips();          // ★最初の操作のときに取りにいく★（対戦中だと最初の1回が鳴らない）
  } catch { ctx = null; }
}

/* ══════════════════════════════════════════════════════════
   録音した効果音（2026-09-09 オーナー指示で追加）
     歓声・拍手・ボタン音。**このアプリで初めて「人の声」を鳴らす**。
     素材: 効果音ラボ https://soundeffect-lab.info/
       商用利用無料・クレジット表記不要（任意）・アプリへの組み込みは再配布に当たらない。
       禁止: 素材の再配布／効果音ファイルへの直リンク／AI学習データとしての利用。
     ★<audio> 要素は使わない★
       HTMLAudio にすると
         ・master(GainNode) を通らないので **こうかおんの おおきさスライダーが効かない**
           （とくに iOS は HTMLMediaElement.volume を無視するので露骨に効かない）
         ・MAX_VOICES の予算の外に出る
       WebAudio なら、合成音とまったく同じ経路・同じ音量つまみに乗る。
     ★取りにいくのは最初の操作のとき（unlock）★
       対戦中に初めて fetch すると、最初の1回だけ鳴らない。
       取れなくても黙って諦める（音が鳴らなくても遊べる、という既存の方針どおり）。
   ══════════════════════════════════════════════════════════ */
const CLIP_DIR = './audio/se/';
/** id → ファイル名。★ここに無いidは鳴らない★ */
const CLIPS = {
  tap: 'tap.mp3',              // ボタンを押した音（決定ボタンを押す2）
  cheermid: 'cheermid.mp3',    // 歓声と拍手2（中盛り上がり）… 10〜29連鎖
  cheerbig: 'cheerbig.mp3',    // 歓声と拍手1（大盛り上がり）… 30連鎖以上
  cheerfoe: 'cheerfoe.mp3',    // スタジアムの歓声2 … 相手が30連鎖以上
  applause: 'applause.mp3',    // スタジアムの拍手 … 決着後
};
const clipBuf = new Map();     // id → AudioBuffer（1回デコードして使い回す）

/* ★歓声の鳴らし分け★（2026-09-09 オーナー指示。この数字が正本）
     > 30連鎖以上の場合は「歓声と拍手1 大盛り上がり」を使用。
     > 10連鎖以上で30連鎖未満の場合は「歓声と拍手2 中盛り上がり」を使用
     > 相手が30連鎖以上してきたときは、「スタジアムの歓声２」
   ★関数に切り出してある★ 音を鳴らさずに数字だけ検査できるようにするため
   （AudioContext が無いNodeのテストでも、しきい値の間違いを捕まえられる）。 */
export const CHEER_MINE_BIG = 30;   // 自分が この連鎖以上で「大盛り上がり」
export const CHEER_MINE_MID = 10;   // 自分が この連鎖以上で「中盛り上がり」
export const CHEER_FOE_BIG = 30;    // 相手が この連鎖以上で「スタジアムの歓声2」
export function cheerIdFor(chain, mine = true) {
  const n = Number(chain) || 0;
  if (mine) {
    if (n >= CHEER_MINE_BIG) return 'cheerbig';
    if (n >= CHEER_MINE_MID) return 'cheermid';
    return null;
  }
  return n >= CHEER_FOE_BIG ? 'cheerfoe' : null;
}
let clipsAsked = false;

/** 効果音の実体を読み込む。★何度呼んでも1回しか取らない★ */
function loadClips() {
  if (clipsAsked || !ctx) return;
  clipsAsked = true;
  for (const [id, file] of Object.entries(CLIPS)) {
    fetch(CLIP_DIR + file)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
      .then((b) => ctx.decodeAudioData(b))
      .then((buf) => clipBuf.set(id, buf))
      .catch(() => { /* 取れなくても遊べる。合成音は鳴り続ける */ });
  }
}

/* ★歓声の歯止め★ 連続で鳴ると耳障りなので、最低間隔をあける。
     揺れ・カットインと同じ考え方（あちらは600ms、こちらは音なので長め）。 */
const CHEER_MIN_MS = 2000;
let lastCheerAt = -99999;

/**
 * 録音した効果音を鳴らす。
 *   gain … 0〜1（合成音と同じく master を通るので、音量スライダーが効く）
 *   throttleMs … これ未満の間隔では鳴らさない（歓声用）
 */
function clip(id, { gain = 0.9, throttleMs = 0 } = {}) {
  if (!ctx || seLevel <= 0) return false;
  const buf = clipBuf.get(id);
  if (!buf) return false;                       // まだ読めていない／取れなかった
  const now = ctx.currentTime * 1000;
  if (throttleMs && now - lastCheerAt < throttleMs) return false;
  if (!budgetOk(ctx.currentTime, ctx.currentTime + buf.duration)) return false;
  try {
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(g); g.connect(master);
    src.start();
    if (throttleMs) lastCheerAt = now;
    return true;
  } catch { return false; }
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
  if (!ctx || seLevel <= 0) return;
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
  if (!ctx || seLevel <= 0) return;
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
  /* ボタンの音。★録音音源があればそれを使い、無ければ今までの合成音★
       読み込みは非同期なので、起動直後の1〜2タップは合成音になることがある。
       そこで固まるより、鳴るものが鳴るほうがよい。 */
  tap: () => {
    if (clip('tap', { gain: 0.75 })) return;
    tone({ freq: 700, dur: 0.05, type: 'sine', gain: 0.10 });
  },

  /**
   * 歓声（★このアプリで唯一の「人の声」★）。連鎖数と、誰の連鎖かで鳴らし分ける。
   *   2026-09-09 オーナー指示:
   *     30連鎖以上 … 歓声と拍手1（大盛り上がり）
   *     10〜29連鎖 … 歓声と拍手2（中盛り上がり）
   *     相手が30連鎖以上 … スタジアムの歓声2
   *   ★最低2秒あける★ 大連鎖は1手のなかで何度も伸びるので、歯止めが無いと重なって濁る。
   */
  cheer: (chain, mine = true) => {
    const id = cheerIdFor(chain, mine);
    if (!id) return false;
    return clip(id, { gain: 0.85, throttleMs: CHEER_MIN_MS });
  },

  /** 決着したあとの拍手（スタジアムの拍手） */
  applause: () => clip('applause', { gain: 0.8 }),

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
let bgmLevel = 70;             // 0〜100
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

const bgmVolume = () => gainOf(bgmLevel, BGM_MAX) * bgmById(bgmId).trim;

/**
 * ★BGMの音量つまみを iPhone でも効かせる★（2026-09-08 アドバイザー指摘）
 *   iOS Safari は `HTMLMediaElement.volume` への代入を**黙って無視する**（音量は本体側の役目）。
 *   3段ボタンの頃は気づきにくかったが、スライドバーにすると
 *   「動かしても何も変わらない」が露骨に見える。
 *   → `<audio>` を WebAudio のグラフに通し、GainNode で音量を決める。ここは全機種で効く。
 *
 * ★AudioContext が動いていないときは通さない★
 *   止まっている（suspended）グラフに通すと、いままで鳴っていたBGMが**まるごと無音**になる。
 *   通せなかったときは、これまでどおり要素の volume を使う（＝いまと同じ挙動に戻るだけ）。
 */
let bgmSrc = null;
let bgmGain = null;

function routeBgmThroughGraph() {
  if (bgmSrc || !ctx || !bgmEl) return;
  if (ctx.state !== 'running') return;
  try {
    bgmSrc = ctx.createMediaElementSource(bgmEl);
    bgmGain = ctx.createGain();
    bgmGain.gain.value = bgmVolume();
    bgmSrc.connect(bgmGain);
    bgmGain.connect(ctx.destination);
    bgmEl.volume = 1;            // 実際の大きさは GainNode 側で決める
  } catch { bgmSrc = null; bgmGain = null; }
}

function applyBgmVolume() {
  const v = bgmVolume();
  if (bgmGain) { bgmGain.gain.value = v; return; }
  try { if (bgmEl) bgmEl.volume = v; } catch { /* 効かない機種でも例外を出さない */ }
}

export function setBgmVol(level) {
  bgmLevel = pct(level, 70);
  applyBgmVolume();
  if (bgmLevel <= 0) bgmStop();
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
    applyBgmVolume();
  } catch { /* 差し替えに失敗しても遊べる */ }
  if (wasPlaying) bgmPlay();
}

/** ★必ず「押した」流れの中から呼ぶ★（iPhoneは操作なしでは鳴らせない） */
export function bgmPlay() {
  if (bgmLevel <= 0) return;
  const a = ensureBgmEl();
  if (!a) return;
  bgmWant = true;
  try {
    if (!a.src) { a.src = bgmById(bgmId).file; a.currentTime = 0; }
    routeBgmThroughGraph();   // ★押した流れの中なので AudioContext は動いている★
    applyBgmVolume();
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

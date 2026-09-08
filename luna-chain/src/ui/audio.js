/**
 * ルナチェイン｜音
 *
 * ★iPhoneの消音スイッチ対策★（教訓 audio-ios-silent-switch）
 *   `navigator.audioSession.type = 'playback'` を **AudioContextを作る前に** 宣言する。
 *   これをしないと、iPhoneだけ音が鳴らない（エラーも例外も出ないので気づけない）。
 * ★解禁は once を付けず、複数の操作で拾う★
 *
 * ★連鎖のたびに音程を半音ずつ上げる★——気持ちよさの中核。追加素材ゼロで作れる。
 *
 * 素材について:
 *   いまは外部ファイルなしの合成音で鳴らしている（オフラインでも必ず鳴る）。
 *   実素材（BGM=魔王魂 / 効果音=Springin' Sound Stock）を入れたら FILES に並べる。
 *   ★実素材を入れたら、タイトル画面のクレジット表記を必ず出すこと★
 *     魔王魂は著作表記が**規約上必須**（表記例「音楽：魔王魂」＋リンクまたはURL）。
 */

/** 実素材を入れたらここに並べる。空のあいだは合成音で鳴らし、クレジットも出さない */
export const FILES = { bgm: {}, se: {} };
export const hasRealAssets = () => Object.keys(FILES.bgm).length + Object.keys(FILES.se).length > 0;

let ctx = null;
let master = null;
let enabled = true;

export function setEnabled(v) {
  enabled = !!v;
  if (master) master.gain.value = enabled ? 0.5 : 0;
}

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
    master.gain.value = enabled ? 0.5 : 0;
    master.connect(ctx.destination);
    if (ctx.state === 'suspended') ctx.resume();
  } catch { ctx = null; }
}

function tone({ freq = 440, dur = 0.12, type = 'sine', gain = 0.25, slide = 0, delay = 0 }) {
  if (!ctx || !enabled) return;
  try {
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq * slide), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g); g.connect(master);
    osc.start(t0); osc.stop(t0 + dur + 0.02);
  } catch { /* 音が鳴らなくても遊べる。絶対に例外を外へ出さない */ }
}

const semitone = (n) => Math.pow(2, n / 12);

export const SE = {
  place: () => tone({ freq: 520, dur: 0.07, type: 'triangle', gain: 0.16 }),
  /** ★連鎖ごとに半音ずつ上がる（8連鎖で頭打ち）★ */
  boom: (chain = 1) => {
    const n = Math.min(8, Math.max(0, chain - 1));
    tone({ freq: 330 * semitone(n), dur: 0.13, type: 'square', gain: 0.13, slide: 1.6 });
    tone({ freq: 165 * semitone(n), dur: 0.16, type: 'sine', gain: 0.12 });
  },
  moon: () => { [0, 4, 7, 12].forEach((n, k) => tone({ freq: 440 * semitone(n), dur: 0.3, type: 'sine', gain: 0.14, delay: k * 0.06 })); },
  card: () => { tone({ freq: 880, dur: 0.1, type: 'triangle', gain: 0.16 }); tone({ freq: 1320, dur: 0.14, type: 'sine', gain: 0.1, delay: 0.05 }); },
  win: () => { [0, 4, 7, 12, 16].forEach((n, k) => tone({ freq: 523 * semitone(n), dur: 0.34, type: 'triangle', gain: 0.16, delay: k * 0.09 })); },
  lose: () => { [0, -3, -7].forEach((n, k) => tone({ freq: 392 * semitone(n), dur: 0.4, type: 'sine', gain: 0.14, delay: k * 0.12 })); },
  tap: () => tone({ freq: 700, dur: 0.05, type: 'sine', gain: 0.1 }),
  unlockFx: () => { [0, 7, 12].forEach((n, k) => tone({ freq: 660 * semitone(n), dur: 0.26, type: 'triangle', gain: 0.15, delay: k * 0.08 })); },
};

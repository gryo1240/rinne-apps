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
function budgetOk(startAt, endAt, force = false) {
  while (voices.length && voices[0] <= startAt) voices.shift();
  const over = voices.length >= MAX_VOICES;
  if (over && !force) return false;
  /* ★強行したぶんも数に入れる★（2026-09-09 レビュー指摘）
       入れないと、その音が鳴っているあいだ「1枠空いている」と誤認し続ける。 */
  voices.push(endAt);
  voices.sort((a, b) => a - b);
  return !over;
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

/**
 * 効果音の実体を読み込む。
 * ★失敗したら取り直す★（2026-09-09 オーナー報告を受けて変更）
 *   もとは1回でも走ったら二度と取りにいかなかったので、
 *   **最初のタップの瞬間に電波が悪かっただけで、その回は歓声も拍手も一生鳴らない**。
 *   しかも失敗は握りつぶしているので、遊んでいる側からは「音が無いゲーム」に見えるだけ。
 *   sw.js は mp3 を素通しするため、この取得は毎回ネットワークに出る（＝失敗しうる）。
 */
const CLIP_TRIES = 3;
/* ★回数だけで守らない★（2026-09-09 レビュー指摘）
     電波が無いと fetch は数msで失敗するので、**1手の演出のなかで3回とも使い切る**。
     それでは「最初のタップのときだけ電波が悪かった」という、いちばん直したい状況で効かない。
     取り直しのあいだを空ける。 */
const CLIP_RETRY_MS = 10000;
/* ★返ってこない相手を待ち続けない★
     公衆無線の入口ページなどに捕まると fetch は解決も拒否もしない。
     そのままだと clipsAsked が立ちっぱなしで、取り直しの枠すら使われない。 */
const CLIP_TIMEOUT_MS = 8000;
let clipTry = 0;
let clipTryAt = -Infinity;
function loadClips() {
  if (!ctx || clipsAsked) return;
  if (clipBuf.size >= Object.keys(CLIPS).length) return;   // 全部そろっている
  if (clipTry >= CLIP_TRIES) return;
  const t = ctx.currentTime * 1000;
  if (clipTry > 0 && t - clipTryAt < CLIP_RETRY_MS) return;
  clipTryAt = t;
  clipsAsked = true;
  clipTry += 1;
  let left = 0;
  for (const [id, file] of Object.entries(CLIPS)) {
    if (clipBuf.has(id)) continue;
    left += 1;
    let ac = null;
    let tid = 0;
    try {
      if (typeof AbortController !== 'undefined') {
        ac = new AbortController();
        tid = setTimeout(() => { try { ac.abort(); } catch { /* 中断できなくても進む */ } },
                         CLIP_TIMEOUT_MS);
      }
    } catch { ac = null; }
    fetch(CLIP_DIR + file, ac ? { signal: ac.signal } : undefined)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
      .then((b) => ctx.decodeAudioData(b))
      /* ★中身を確かめてから入れる★（2026-09-09 レビュー指摘）
           古い形の端末では decodeAudioData がコールバック版しか無く、undefined が返る。
           それをそのまま入れると
             ・clip() は毎回「まだ読めていない」で捨てる
             ・SE.cheer は clipBuf.has() が true なので**予備も出さない**（＝無音に逆戻り）
             ・せってい画面が「よういできた（5／5）」と嘘をつく
           の3つが同時に起きる。 */
      .then((buf) => {
        if (!buf || !buf.length) throw new Error('decode');
        clipBuf.set(id, buf);
      })
      .catch(() => { drop(id, 'loadfail'); })
      .finally(() => {
        if (tid) clearTimeout(tid);
        left -= 1;
        // 全部の返事が返ってから、まだ足りなければ次の機会に取り直せるようにする
        if (left <= 0) clipsAsked = false;
      });
  }
  if (left === 0) clipsAsked = false;
}

/** 録音音源がそろっているか（設定画面の診断行が読む） */
export function clipsReady() {
  return { got: clipBuf.size, want: Object.keys(CLIPS).length };
}

/* ★歓声の歯止め★ 連続で鳴ると耳障りなので、最低間隔をあける。
     揺れ・カットインと同じ考え方（あちらは600ms、こちらは音なので長め）。 */
const CHEER_MIN_MS = 2000;
let lastCheerAt = -99999;

/* ★歓声・拍手の大きさ★（2026-09-09 オーナー報告を受けて調整）
     素材は -16 LUFS にそろえてあるので、合成音（はじけ音など）より**平均は小さい**。
     とくに拍手は決着ファンファーレ(SE.win)と同時に鳴るため、同じ倍率だと埋もれる。
   ★1.0 を超えても割れない範囲か、実測で決める★
     master は SE_MAX=0.60 なので、倍率1.6でも 0.96。素材のピークが1.0近くでも収まる。
     数字の根拠は tools/smoke_luna_chain.py が debugMeter() で毎回測っている。 */
const APPLAUSE_GAIN = 1.6;
const CHEER_GAIN = 1.3;

/**
 * 録音した効果音を鳴らす。
 *   gain … 0〜1（合成音と同じく master を通るので、音量スライダーが効く）
 *   throttleMs … これ未満の間隔では鳴らさない（歓声用）
 */
/* ══════════════════════════════════════════════════════════
   ★音は耳でしか確かめられない、を無くすための窓口★（2026-09-09）
     オーナーから「決着後の拍手がぜんぜん聞こえなかった」「音量バーが反映されていない」
     という報告を受けたが、**鳴ったか／どれだけの大きさだったかを測る方法が無かった**ため
     切り分けに時間がかかった。以後は数字で見る。
     教訓: app-turn-already-flipped-in-callback（分けた結果を検査から読めるようにする）
   ══════════════════════════════════════════════════════════ */
const drops = Object.create(null);   // 捨てた理由ごとの回数
let played = [];                     // 実際に鳴らした録音音源（直近40件）
const meter = {};                    // se / bgm それぞれの計測ノード

function drop(id, why) {
  const k = id + ':' + why;
  drops[k] = (drops[k] || 0) + 1;
  return false;
}

/** ★倍率を変えて鳴らし比べるための入口★（調査専用。通常の再生には使わない） */
export function debugPlayClip(id, gain) {
  // ★上限を切る★ 子どもがイヤホンで遊ぶ前提なので、調査用でも割れる音は作らない
  const g = Math.min(2, Math.max(0, Number(gain) || 0.9));
  return clip(id, { gain: g, must: true });
}

/** いまの状態（検証・不具合調査から読む） */
export function debugState() {
  return {
    ready: !!ctx,
    state: ctx ? ctx.state : 'none',
    seLevel,
    masterGain: master ? master.gain.value : null,
    voices: voices.length,
    clips: [...clipBuf.keys()],
    played: played.slice(-8),
    drops: { ...drops },
  };
}

/**
 * ★実際に出ている音の大きさ★ 0〜1。呼ぶたびに、その瞬間の値を返す。
 *   which … 'se'（既定・効果音）／'bgm'（BGM）。
 *   ★2つを別々に測れること★ 「拍手が聞こえない」の原因が
 *     「鳴っていない」のか「BGMに埋もれている」のかは、片方だけ見ても分からない。
 */
export function debugMeter(which = 'se') {
  const node = which === 'bgm' ? bgmGain : master;
  if (!ctx || !node) return null;
  const key = which === 'bgm' ? 'bgm' : 'se';
  // ★付け先が変わっていたら作り直す★ BGMの経路は作り直されることがあり、
  //   古いノードに付いたままだと**計測だけがずっと無音**になる（道具が嘘をつく）
  if (!meter[key] || meter[key].from !== node) {
    const a = ctx.createAnalyser();
    a.fftSize = 2048;
    node.connect(a);                // ★葉として付けるだけ★ 出力には足さない
    meter[key] = { node: a, from: node };
  }
  const an = meter[key].node;
  const buf = new Float32Array(an.fftSize);
  an.getFloatTimeDomainData(buf);
  let peak = 0;
  let sum = 0;
  for (let i = 0; i < buf.length; i++) {
    const a = Math.abs(buf[i]);
    if (a > peak) peak = a;
    sum += buf[i] * buf[i];
  }
  return { peak, rms: Math.sqrt(sum / buf.length) };
}

function clip(id, { gain = 0.9, throttleMs = 0, must = false } = {}) {
  if (!ctx || seLevel <= 0) return drop(id, 'noctx');
  const buf = clipBuf.get(id);
  if (!buf) return drop(id, 'notloaded');       // まだ読めていない／取れなかった
  const now = ctx.currentTime * 1000;
  if (throttleMs && now - lastCheerAt < throttleMs) return drop(id, 'throttled');
  /* ★must の音は同時発音の上限で捨てない★（2026-09-09 オーナー報告「拍手が聞こえない」）
       決着の直前は大きな連鎖が起きやすく、そのはじけ音が予算(MAX_VOICES)を埋めている。
       拍手や歓声は「1手に1回だけ」の音なので、ここで捨てると**まるごと聞こえない**。
       はじけ音は1個消えても気づかないが、拍手は消えたら存在しないのと同じ。 */
  if (!budgetOk(ctx.currentTime, ctx.currentTime + buf.duration, must)) {
    if (!must) return drop(id, 'budget');
    drop(id, 'budget-forced');   // ★捨てずに鳴らすが、起きたことは記録に残す★
  }
  try {
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(g); g.connect(master);
    src.start();
    if (throttleMs) lastCheerAt = now;
    played.push({ id, at: Math.round(now), gain });
    if (played.length > 40) played.shift();
    return true;
  } catch { return drop(id, 'error'); }
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

/* ══════════════════════════════════════════════════════════
   ★録音音源が鳴らせなかったときの予備★（2026-09-09 オーナー報告を受けて追加）
     ボタン音(tap)にはもともと合成音の予備があったが、**拍手と歓声には無かった**。
     そのため、読み込みに失敗した端末では **決着したのに一切音が鳴らない**。
     「鳴らないだけ」ではなく「勝負がついたことが音で伝わらない」ので、必ず何か鳴らす。
   ★本物の代わりにはならない★ あくまで無音を避けるためのもの。
   ══════════════════════════════════════════════════════════ */

/** 合成の拍手。短い破裂を散らして「パチパチ」を作る */
function applauseSynth() {
  if (!ctx || seLevel <= 0) return false;
  /* ★大きさは実測で合わせる★ 本物の拍手が RMS 0.158 なので、そこへ寄せる。
       小さいと「予備すら聞こえない」で、直したことにならない。 */
  for (let k = 0; k < 20; k++) {
    burst({
      freq: 1800 + Math.random() * 2200,
      dur: 0.05 + Math.random() * 0.04,
      gain: 0.60 + Math.random() * 0.35,
      q: 0.8,
      slide: 0.5,
      delay: k * 0.042 + Math.random() * 0.03,
    });
  }
  return true;
}

/** 合成の歓声。ざらざらの音をゆっくり持ち上げて「わーっ」に近づける */
function cheerSynth(big) {
  if (!ctx || seLevel <= 0) return false;
  const n = big ? 10 : 6;
  for (let k = 0; k < n; k++) {
    burst({
      freq: 500 + k * 90,
      dur: big ? 0.9 : 0.6,
      gain: (big ? 0.62 : 0.46) - k * 0.028,
      q: 0.5,
      slide: 1.6,
      delay: k * 0.03,
    });
  }
  return true;
}

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
    if (clip(id, { gain: CHEER_GAIN, throttleMs: CHEER_MIN_MS, must: true })) return true;
    /* ★鳴らなかった理由で分ける★
         歯止め（2秒以内の連発）で鳴らさなかったときは、予備も鳴らさない——
         鳴らすと歯止めの意味が無くなる。読み込めていないときだけ予備を出す。 */
    if (clipBuf.has(id)) return false;
    /* ★予備にも同じ歯止めをかける★（2026-09-09 レビュー指摘）
         clip() は「まだ読めていない」を歯止めより**前**で返すので、
         録音音源が届かない端末では lastCheerAt が一度も更新されない。
         ここで見ないと、**連鎖1段ごとに予備が鳴る**（20連鎖で54個・レビューの実測）。
         しかも予備の音は0.6〜0.9秒と長いので、進行中のはじけ音まで押し出す。 */
    if (!ctx) return false;
    const now = ctx.currentTime * 1000;
    if (now - lastCheerAt < CHEER_MIN_MS) return drop(id, 'throttled-synth');
    lastCheerAt = now;
    loadClips();                       // 次の機会のために取り直しておく
    return cheerSynth(id === 'cheerbig' || id === 'cheerfoe');
  },

  /* 決着したあとの拍手（スタジアムの拍手）
     ★must を付ける★（2026-09-09 オーナー報告「拍手がぜんぜん聞こえなかった」）
       決着の直前は大きな連鎖が起きやすく、そのはじけ音が同時発音の予算を埋めている。
       はじけ音は1個消えても気づかないが、**拍手は消えたら存在しないのと同じ**。 */
  applause: () => {
    if (clip('applause', { gain: APPLAUSE_GAIN, must: true })) return true;
    loadClips();                       // 次の対戦では本物が鳴るように
    return applauseSynth();
  },

  /**
   * ★音量バーを動かしている最中の試聴音★（2026-09-09 オーナー報告を受けて新設）
   *   もとは place()（マスに置く音）を流用していたが、実測 RMS 0.015 ——
   *   ボタン音(0.192)の**13分の1**しかなく、**動かしても大きさが分からなかった**。
   *   ここは「いまの音量がどのくらいか」を判断するための音なので、
   *   **実際に遊んでいるときによく鳴る音と同じくらいの大きさ**にする。
   *   ★短いこと★ 90msに1回鳴るので、長いと次の刻みに重なって濁る。
   */
  volTick: () => {
    tone({ freq: 880, dur: 0.055, type: 'triangle', gain: 0.92 });
    burst({ freq: 3200, dur: 0.045, gain: 0.43, q: 1.6, slide: 0.4 });
  },

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

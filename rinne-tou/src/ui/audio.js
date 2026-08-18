/**
 * BGMの再生（Web Audio API・2026-08-05）
 *
 * ── なぜ `<audio loop>` を使わないか ──────────────────────
 * `<audio>` は範囲取得（206）でリクエストするが、**Cache API は 206 を保存できない**ため
 * sw.js の `cache.put()` が例外を投げ、catch に飲まれて「なぜか一生キャッシュされない」形で出る。
 * `fetch()` の全量取得（200）なら起きない。宵乃こよみの事件簿で一度踏んだ道なので踏襲する
 * （`apps/koyomi-jikenbo/audio.js` に同じ判断の記録がある）。
 *
 * ── 設計の芯 ──────────────────────────────────────────────
 * 1. **「鳴らしたい曲」と「実際に鳴っている曲」を分ける**。
 *    ブラウザは最初のユーザー操作まで音を鳴らさない。画面側は常に「鳴らしたい曲」を
 *    言うだけにして、解禁の面倒はここで引き受ける。こうしておくと、入口が
 *    （はじめから／つづきから／設定／リロード）と増えても画面側の配線は0のままでいい。
 *
 * 2. **世代番号で古い再生を捨てる**。
 *    曲の取得と復号は非同期なので、読んでいる最中に画面が変わると
 *    **古い曲があとから鳴りだす**。await のあとで世代が変わっていたら黙って捨てる。
 *
 * 3. **音が無くても、音で失敗してもゲームは止めない**。
 *    取得に失敗した曲は覚えておき、二度と取りに行かない（無音になるだけ）。
 *
 * 4. 曲の切り替えは 0.2 秒のフェード。単純な stop→start は波形の途中で切れて
 *    「ブツッ」というクリックノイズが必ず出る。
 */

import { KEEP, bgmForScene, bgmUrl, hasSe, seUrl } from '../../assets/audio-manifest.js';

const FADE = 0.2;             // 秒。切り替えのフェード
const DEFAULT_VOLUME = 60;    // 0〜100

let actx = null;              // AudioContext
let master = null;            // 全体の出口（常に1.0。曲と効果音は下の2本で調整する）
/**
 * 曲と効果音を**別々のつまみ**にする（2026-08-12 オーナー要望
 * 「設定での音量調整はBGMとSEでそれぞれスライド式で調整できるように」）。
 *
 * ★ぶら下げ先を分けるだけにしてある（bgmBus / seBus → master → 出力）。
 *   鳴らす側は「どちらの母線につなぐか」しか意識しない。
 * ★以前は1本の master に両方つないでいたので、
 *   「曲がうるさいから下げる」＝「効果音も聞こえなくなる」だった。
 */
let bgmBus = null;
let seBus = null;
let cur = null;               // 鳴っているもの { id, src, gain }
let desired = null;           // 鳴らしたい曲ID（解禁前でもここには入る）
let unlocked = false;         // ユーザー操作を受けたか
let gen = 0;                  // 世代番号（古い非同期処理の打ち切り用）
let volume = DEFAULT_VOLUME;      // 曲（BGM）
let seVolume = DEFAULT_VOLUME;    // 効果音（SE）

// ★AudioBuffer ではなく **Promise** を入れる。復号が終わってから登録すると、
//   読んでいる最中に同じ曲へ戻ってきたときに、もう一度まるごと取得してしまう
//   （場面を往復するだけで同じ1.5MBを何度も落とすことになる）
const buffers = new Map();    // id → Promise<AudioBuffer|null>
const failed = new Set();     // 取得に失敗したID（無限に取りに行かせない）

// ── 外から使うもの ────────────────────────────────────────

/**
 * いまの画面に合う曲へ切り替える。app.js の render() から毎回呼んでよい
 * （同じ曲なら何もしないので、連打しても切れない）。
 */
export function applyBgm(state) {
  let want;
  try { want = bgmForScene(state); } catch (_) { return; }
  if (want === KEEP) return;
  if (want === desired) return;
  desired = want;
  if (unlocked) run(sync());
}

/** 浮いた Promise を握る。音の失敗でコンソールを汚さない・画面を壊さない */
function run(p) { if (p && p.catch) p.catch(() => {}); }

/** つまみを段差なく動かす（急に変えるとブツッと鳴る） */
function ramp(node, to) {
  if (!node || !actx) return;
  const t = actx.currentTime;
  node.gain.cancelScheduledValues(t);
  node.gain.setValueAtTime(node.gain.value, t);
  node.gain.linearRampToValueAtTime(to, t + 0.05);
}

/** 曲の音量（0〜100）。スライダーから即時に呼ばれる */
export function setVolume(v) {
  const next = Math.max(0, Math.min(100, Number(v) || 0));
  const wasSilent = volume <= 0;
  volume = next;
  ramp(bgmBus, volume / 100);
  // 0のときは曲を読みにいかない設計なので、0から上げたときは読み直す
  if (wasSilent && volume > 0 && unlocked) run(sync());
  // ★0にしたら、読み込み中のものも捨てる。gen を進めないと
  //   「消音にしたのに、読み終わった曲が裏で鳴り続ける」状態になる
  if (volume <= 0) { gen++; stopCur(); }
}

/** 効果音の音量（0〜100）。曲とは独立（2026-08-12） */
export function setSeVolume(v) {
  seVolume = Math.max(0, Math.min(100, Number(v) || 0));
  ramp(seBus, seVolume / 100);
}

export function getVolume() { return volume; }
export function getSeVolume() { return seVolume; }

/** 既存セーブには volume が無い（v4以前）。読むときに既定を当てる */
export function volumeOf(settings) {
  const v = settings?.volume;
  return typeof v === 'number' && v >= 0 && v <= 100 ? v : DEFAULT_VOLUME;
}

/**
 * 効果音の音量。
 *
 * ★`seVolume` が無い記録（2026-08-12 より前の全員）は**曲の音量を引き継ぐ**。
 *   既定値（60）を当ててしまうと、音量を0にしていた人の耳元で
 *   いきなり効果音だけが鳴りはじめる。
 */
export function seVolumeOf(settings) {
  const v = settings?.seVolume;
  return typeof v === 'number' && v >= 0 && v <= 100 ? v : volumeOf(settings);
}

// ── 中身 ──────────────────────────────────────────────────

/**
 * iPhoneの「消音スイッチ」を越えて鳴らす（2026-08-16 オーナー指摘
 * 「iphoneだと、SafariやBrave上で、設定上はオンにしているBGMやSEが鳴らない。
 *   AndroidのBraveではBGM/SEともにOK」）。
 *
 * 【何が起きていたか】
 * iOSでは Web Audio の音は既定で「ambient」という区分に入る。この区分は
 * **本体側面の消音スイッチとサイレントモードで消される**。
 * `<video>` と違って、Web Audio は「鳴っているのに聞こえない」状態になり、
 * エラーも出ないので、コード側からは正常に見える。
 * SafariもBraveもiOSでは同じWebKitなので、両方で同時に鳴らなくなる。
 * Androidにはこの区分が無いので、そちらだけ鳴っていた。
 *
 * 【直し方】iOS 16.4 以降は `navigator.audioSession.type = 'playback'` で
 * 「これは聞かせるための音だ」と宣言でき、消音スイッチの影響を受けなくなる。
 * ★ゲーム側に音量つまみ（BGM/SE）があるので、消したい人はそちらで消せる。
 * ★対応していない環境では**何もしない**（例外を出さない）。
 */
function claimPlayback() {
  try {
    const s = typeof navigator !== 'undefined' ? navigator.audioSession : null;
    if (s && s.type !== 'playback') s.type = 'playback';
  } catch (_) { /* 未対応 or 変更不可。無視してよい */ }
}

function ensureCtx() {
  if (actx) return actx;
  // ★`window` の有無から見る。テスト（Node）や古い環境で**例外を投げない**のがこの層の約束
  const W = typeof window !== 'undefined' ? window : null;
  const C = W && (W.AudioContext || W.webkitAudioContext);
  if (!C) return null;                       // 未対応環境。以後ずっと無音（例外は出さない）
  // ★AudioContext を作る**前**に宣言する。作ってから変えても区分が移らない環境がある
  claimPlayback();
  actx = new C();
  master = actx.createGain();
  master.gain.value = 1;
  master.connect(actx.destination);
  bgmBus = actx.createGain();
  bgmBus.gain.value = volume / 100;
  bgmBus.connect(master);
  seBus = actx.createGain();
  seBus.gain.value = seVolume / 100;
  seBus.connect(master);
  return actx;
}

async function sync() {
  const want = desired;
  if (cur && cur.id === want) return;        // もう鳴っている
  const my = ++gen;

  if (!want || volume <= 0) { stopCur(); return; }
  if (!ensureCtx()) { stopCur(); return; }

  // ★**読み終わってから前の曲を止める**。先に止めると、1曲1MB前後あるので
  //   回線が細い端末では場面が変わるたびに数秒の無音が空く（2026-08-08）。
  //   前の曲を鳴らしたまま待てば、切り替わりは一瞬で済む
  const buf = await load(want);
  // ★ここが肝。読んでいる間に場面が変わっていたら、鳴らさずに捨てる
  //   （そのときは新しい sync がもう走っているので、止めるのもそちらに任せる）
  if (my !== gen || desired !== want) return;
  stopCur();
  if (!buf) return;
  start(want, buf);
}

function load(id) {
  if (buffers.has(id)) return buffers.get(id);
  if (failed.has(id)) return Promise.resolve(null);
  const p = (async () => {
    try {
      const res = await fetch(bgmUrl(id));
      if (!res.ok) throw new Error(String(res.status));
      const ab = await res.arrayBuffer();
      return await actx.decodeAudioData(ab);
    } catch (_) {
      failed.add(id);                        // 曲が無い・壊れている → 無音で続行
      buffers.delete(id);                    // 失敗は覚え直さない（failed 側で止める）
      return null;
    }
  })();
  buffers.set(id, p);
  return p;
}

function start(id, buf) {
  const gain = actx.createGain();
  const src = actx.createBufferSource();
  src.buffer = buf;
  src.loop = true;                           // 継ぎ目は素材側で無音に収束させておくこと
  src.connect(gain).connect(bgmBus);
  const t = actx.currentTime;
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(1, t + FADE);
  src.onended = () => { try { gain.disconnect(); } catch (_) { /* もう外れている */ } };
  src.start(0);
  cur = { id, src, gain };
}

function stopCur() {
  if (!cur || !actx) { cur = null; return; }
  const { src, gain } = cur;
  cur = null;
  try {
    const t = actx.currentTime;
    gain.gain.cancelScheduledValues(t);
    gain.gain.setValueAtTime(gain.gain.value, t);
    gain.gain.linearRampToValueAtTime(0, t + FADE);
    src.stop(t + FADE + 0.02);
  } catch (_) { /* 既に止まっていた */ }
}

// ── 効果音（2026-08-09 オーナー要望）────────────────────────
//
// BGMと同じ AudioContext・同じ音量つまみ（master）にぶら下げる。
// 曲と違うのは3点だけ:
//   1. **重ねて鳴る**（曲は常に1つ、効果音は同時に何本でも）
//   2. ループしない。鳴り終わったら勝手に消える
//   3. **鳴らないことを許す**。読み込みが間に合わなければ黙って諦める
//      （効果音のために操作を待たせない。音は演出であって機能ではない）
//
// ★2026-08-12 に**つまみを2本に分けた**（オーナー要望）。
//   ここでいう SE_MIX は「効果音のつまみを同じ値にしたとき、曲より少し前に出す」ための
//   固定の相対値。素材側を -16 LUFS にそろえてあるので、曲(-18)との差はこの1つで足りる。

const SE_MIX = 0.85;          // 曲に対する効果音の相対音量
const SE_MIN_GAP_MS = 45;     // 同じ音の重なりすぎを防ぐ最短間隔
const SE_MAX_AT_ONCE = 6;     // 同時に鳴らす上限（一斉攻撃で音が潰れないように）

/**
 * 音ごとの相対音量（2026-08-11 オーナー指摘「崩しの演出が弱くて普段の攻撃と分かりづらい」）。
 *
 * ★素材はすべて -16 LUFS にそろえてあるので、既定は 1.0 のままでよい。
 *   ここに書くのは「役割として前に出したい音」だけ。
 * ★上げる前に、その素材の**トゥルーピーク**を必ず見ること（変換ツールが表示する）。
 *   crush は TP -3.69 dBTP なので 1.35倍（+2.6dB）でも歪まない。
 *   win は TP -0.87 しかないので上げられない（1.15倍で 0dB を超えて割れる）。
 */
const SE_GAIN = { crush: 1.35 };

/**
 * 節目の音（2026-08-12）。
 *
 * ★**同時発音の上限と最短間隔を無視して必ず鳴らす**。
 *   勝利・全滅・レベルアップは「1回の戦いに1度」の合図なので、
 *   直前の斬撃が何本か残っているという理由で落ちてはいけない。
 *   通常の攻撃音は落ちても「音が薄くなる」だけだが、これが落ちると
 *   **その出来事が起きたことが伝わらない**。
 * ★オーナーから「戦闘終了後の音が出ていない」という指摘を受けて入れた。
 *   実機計測（2戦・発音間隔920ms）では落ちていなかったので、
 *   これは**再発の可能性を構造的に潰すための保険**であって、原因の特定ではない。
 */
const SE_ALWAYS = new Set(['win', 'lose', 'levelup']);

const seBuffers = new Map();  // id → Promise<AudioBuffer|null>
const seFailed = new Set();
const seLastAt = new Map();   // id → 最後に鳴らした時刻（ms）

/**
 * いま鳴っている音の「鳴り終わる予定時刻(ms)」。本数の管理はこれだけで行う。
 *
 * ★`onended` で数を減らす作りにしてはいけない（2026-08-09 に踏んだ）。
 *   AudioContext が止まっている間（タブを離れている・音声装置が無い）は
 *   `onended` が届かず、**カウンタが上限で固まって以後ぜんぶ無音になる**。
 *   実際、通し検証で「最初の6音だけ鳴って、戦闘の音が一度も鳴らない」状態になった。
 *   時刻で数えれば、通知が来なくても必ず自然に空く。
 */
const seEndsAt = [];

function seLiveCount() {
  const now = Date.now();
  for (let i = seEndsAt.length - 1; i >= 0; i--) {
    if (seEndsAt[i] <= now) seEndsAt.splice(i, 1);
  }
  return seEndsAt.length;
}

/**
 * 効果音を鳴らす。**返り値は無い・待たない・失敗しても投げない**。
 * 画面側は「鳴らしたい」とだけ言えばよく、解禁前・音量0・素材無しは全部ここで吸収する。
 *
 * @param {string} id assets/audio-manifest.js の SE に列挙したID
 */
export function playSe(id) {
  if (!id || !hasSe(id)) return;            // 列挙されていない音は無視（無音・エラーなし）
  // ★見るのは**効果音のつまみ**。曲を0にしただけで効果音まで消えてはいけない
  //   （2026-08-12 につまみを分けた。ここを volume のままにすると分けた意味が無い）
  if (!unlocked || seVolume <= 0) return;   // まだ操作前／消音中

  // ★タブを離れている間は**積まない**（2026-08-09 レビュー指摘・実測で確認）。
  //   戦闘の進行は setTimeout なので裏でも進む。AudioContext を止めている間に
  //   start() したぶんは破棄されずに溜まり、**戻った瞬間に全部同時に鳴る**
  //   （実測: 20本が0.4ms以内に一斉発音。2分放置すれば100本超）。
  //   `actx.state !== 'running'` で見てはいけない。resume() の完了は非同期なので、
  //   解禁直後の最初のタップ音を落としてしまう。
  if (typeof document !== 'undefined' && document.hidden) return;
  if (seFailed.has(id)) return;
  const always = SE_ALWAYS.has(id);
  if (!always && seLiveCount() >= SE_MAX_AT_ONCE) return;

  // ★同じ音が同じ瞬間に何本も重なると、音量だけ上がって不快になる
  //   （一斉攻撃で「打撃」が4本同時、など）
  const now = Date.now();
  const last = seLastAt.get(id) || 0;
  if (!always && now - last < SE_MIN_GAP_MS) return;
  seLastAt.set(id, now);

  run(fireSe(id));
}

async function fireSe(id) {
  if (!ensureCtx()) return;
  const buf = await loadSe(id);
  // ★読んでいる間に消音されたら鳴らさない。
  //   曲と違って世代管理はしない（短いので、鳴り始めたら鳴り切ってよい）
  // ★読み込みの間にタブを離れた場合もここで捨てる（上と同じ理由）
  if (!buf || seVolume <= 0) return;
  if (!SE_ALWAYS.has(id) && seLiveCount() >= SE_MAX_AT_ONCE) return;
  if (typeof document !== 'undefined' && document.hidden) return;

  const gain = actx.createGain();
  gain.gain.value = SE_MIX * (SE_GAIN[id] || 1);
  const src = actx.createBufferSource();
  src.buffer = buf;
  src.connect(gain).connect(seBus);
  // 鳴り終わる予定を積む。少し余裕を持たせる（読み込みの誤差ぶん）
  seEndsAt.push(Date.now() + Math.ceil((buf.duration || 1) * 1000) + 120);
  // ★onended は**後片付けだけ**に使う。本数の管理には使わない（上の seEndsAt 参照）
  src.onended = () => { try { gain.disconnect(); } catch (_) { /* もう外れている */ } };
  src.start(0);
}

function loadSe(id) {
  if (seBuffers.has(id)) return seBuffers.get(id);
  const p = (async () => {
    try {
      const res = await fetch(seUrl(id));
      if (!res.ok) throw new Error(String(res.status));
      return await actx.decodeAudioData(await res.arrayBuffer());
    } catch (_) {
      seFailed.add(id);      // 素材が無い・壊れている → 以後この音は諦める
      seBuffers.delete(id);
      return null;
    }
  })();
  seBuffers.set(id, p);
  return p;
}

// ── 自動再生の解禁 ────────────────────────────────────────

/**
 * ブラウザは最初のユーザー操作まで音を鳴らさない。
 * **画面ごとにボタンへ配線しない**。ここで一度だけ拾えば、入口がいくつ増えても効く。
 * capture で拾うので、押されたボタン側の処理は一切邪魔しない。
 */
/**
 * ★**1回で諦めない**（2026-08-16 に作り直した）。
 *
 * 以前は `{ once: true }` で最初の1回だけ拾い、その場で `unlocked = true` にしていた。
 * その1回で `resume()` が通らなかった端末（iOSで消音区分に入っていた・
 * 別のアプリが音を握っていた等）では、**二度と鳴らす機会が来なかった**。
 * 解禁済みなら中身はほぼ素通りするので、毎回呼んでも安い。
 */
function unlock() {
  claimPlayback();
  const ctx = ensureCtx();
  if (!ctx) return;
  // ★resume() はユーザー操作の中で**同期的に**呼ぶ必要がある（iOS）
  if (ctx.state !== 'running') run(ctx.resume());
  if (!unlocked) { unlocked = true; run(sync()); return; }
  // 一度は解禁したのに曲が止まっている（＝最初の resume が通らなかった）なら鳴らし直す
  if (ctx.state === 'running' && !cur && desired && volume > 0) run(sync());
}

/**
 * 音の状態（設定画面の「音が出ないとき」で見せる）。
 * ★実機でしか起きない不具合を、**オーナーが自分で切り分けられる**ようにするためのもの。
 *   スズカの手元（Windows）ではiOSの症状を再現できない。
 */
export function audioState() {
  return {
    解禁: unlocked ? '済み' : 'まだ（画面をどこか押すと解禁）',
    出力: actx ? actx.state : 'AudioContextなし',
    区分: (typeof navigator !== 'undefined' && navigator.audioSession)
      ? navigator.audioSession.type : 'この端末は区分の指定に未対応',
    BGMの音量: volume,
    SEの音量: seVolume,
    鳴らしたい曲: desired || 'なし',
    鳴っている曲: cur ? cur.id : 'なし',
    読めなかった曲: [...failed].join('・') || 'なし',
    読めなかった効果音: [...seFailed].join('・') || 'なし',
    読んだ効果音の数: seBuffers.size,
  };
}

/**
 * テストの音（440Hzを0.5秒）。**音源ファイルもつまみも通さない**。
 *
 * ★あえて `master` に直結する。つまみを通すと「スライダーが0だった」と
 *   「そもそも音が出ない」が区別できず、切り分けの役に立たない。
 * @returns {Promise<string>} 鳴らそうとしたあとの出力の状態
 */
export async function testTone() {
  claimPlayback();
  const ctx = ensureCtx();
  if (!ctx) return 'AudioContextを作れませんでした';
  if (ctx.state !== 'running') { try { await ctx.resume(); } catch (_) { /* 続行 */ } }
  try {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 440;
    const t = ctx.currentTime;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.25, t + 0.03);
    g.gain.linearRampToValueAtTime(0, t + 0.5);
    osc.connect(g).connect(master);
    osc.start(t);
    osc.stop(t + 0.55);
    osc.onended = () => { try { g.disconnect(); } catch (_) { /* もう外れている */ } };
  } catch (_) {
    return '鳴らせませんでした';
  }
  return ctx.state;
}

/**
 * ボタンを押した音（2026-08-09 オーナー要望「SEを全体的にもっと使って」）。
 *
 * ★**画面ごとにボタンへ配線しない**。曲の解禁と同じで、ここで一度だけ拾う。
 *   画面が増えても配線は0のままで、付け忘れも起きない。
 * ★capture で拾って何も止めないので、ボタン側の処理には一切影響しない。
 * ★音を出したくないボタンは `data-se="off"` を付ける（マークアップ側で決められる）。
 */
function clickSe(e) {
  const el = e.target?.closest?.('button, [role="button"]');
  if (!el || el.disabled || el.getAttribute('aria-disabled') === 'true') return;
  if (el.dataset.se === 'off') return;
  // 「進む・決める」ボタンだけ重い音にして、ただの選択と区別する
  const heavy = el.classList.contains('btn--primary') || el.classList.contains('btn--danger');
  playSe(heavy ? 'decide' : 'tap');
}

if (typeof window !== 'undefined') {
  /**
   * ★拾う操作を増やした（2026-08-16）。`once` も外した（上の unlock 参照）。
   *   iOSでは `pointerdown` だけでは解禁の合図として扱われない場面があるので、
   *   `touchend` と `click` も見る。どれで来ても中身は同じ。
   */
  for (const ev of ['pointerdown', 'touchend', 'click', 'keydown']) {
    window.addEventListener(ev, unlock, { capture: true, passive: true });
  }
  window.addEventListener('click', clickSe, { capture: true });

  // タブを離れている間は鳴らさない（復帰時に戻す）。
  // ★state を見て呼ぶかどうかを決めない。resume() の完了は非同期なので、
  //   復帰直後にまた離れると「running になる前」で素通りし、隠れたまま鳴り続ける
  document.addEventListener('visibilitychange', () => {
    if (!actx || actx.state === 'closed') return;
    if (document.hidden) run(actx.suspend());
    else if (unlocked) run(actx.resume());
  });
}

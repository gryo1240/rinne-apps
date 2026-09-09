/**
 * ルナチェイン｜画面の配線
 *
 * ★2026-09-08（3回目）オーナー実測での指示★
 *   > SEや画面は、もっと派手な演出を出したいね。SEも特に単調すぎる。
 *   > 『きょうの月』は消そうか。代わりに二人対戦とかあった方が、一画面で二人で遊べる
 *   > 対戦中の上の方にある内容はいらないかも。戦況が動きまくるので、有利不利が意味ない。
 *   > むしろ設定ボタンを押して、BGMやSEの調整、予告の有無、さいしょから、タイトルに戻る…
 *   > あと、どちらの手番かを示してほしいかな。
 *
 *   → きょうの月・詰めルナを撤去し、**二人対戦（1台を交代して2人で遊ぶ）**を追加。
 *     対戦中のヘッダは「マス数・ゲージ・相手の段位」をやめ、**手番表示と設定ボタンだけ**にした。
 *
 * ★席と操作権を混ぜない★
 *   「誰が押してよいか」は game.js の control（席→human/cpu）だけが答えを持つ。
 *   ここで `match.mySeat` を操作権の判定に使わないこと——二人対戦では必ず壊れる。
 *
 * ★画面はルールを判断しない★ game.js / core を呼ぶだけ。
 */
import {
  N, xOf, yOf, generateBoard, T_CRATER, T_STARDUST, T_CLOUD,
  setSize, isDefaultSize, DEF_W, DEF_H, MIN_W, MAX_W, MIN_H, MAX_H, W, H,
} from '../core/board.js';
import { VERSION_LABEL, NEWS } from '../version.js';
import { findWinningMove, cloneState, capAt, previewChain, chainMap, effTerrain } from '../core/rules.js';
import { createMatch, play, cpuMove, humanTurn, cpuSeat } from '../game.js';
import { TIER_MAX, TIER_NAMES } from '../ai/ai.js';
import { loadSave, writeSave, loadDevice, writeDevice, recordMatch } from '../meta/progress.js';
import { makeRng } from '../core/rng.js';
import { TUTORIALS, handIdx } from '../../data/tutorial.js';
import { Coach } from './coach.js';
import { BoardView, DOTS, stepFor, POP_TEXT_CHAIN, shakeAmp, shakeMs, SHAKE,
         resolveMotion, deviceWantsStill } from './render.js';
import * as Audio from './audio.js';

const $ = (id) => document.getElementById(id);
const el = {
  hud: $('hud'), board: $('board'), stage: $('stage'),
  fx: $('fx'),                 // 音符と星を描く、画面いっぱいのキャンバス
  turnDot: $('turnDot'), turnText: $('turnText'),
  handSign: $('handSign'), coach: $('coach'),
  chainPop: $('chainPop'), chainPopNum: $('chainPopNum'),
};

let save = loadSave();
let device = loadDevice();
let view = null;
let match = null;
let mode = 'normal';          // normal（CPU戦）| vs（二人対戦）| tutorial（れんしゅう）
let busy = false;
let paused = false;           // 対戦中に設定パネルを開いている
let tutorialStep = 0;
let matchId = 0;              // 対戦の世代。遅れて届くコールバックを捨てるために使う
let held = -1;                // いま指が乗っているマス（-1＝盤の外）
let pressId = null;           // ★押している指の識別子★
                              //   1本目の指だけを追う。持たないと2本目の指で held が壊れ、
                              //   置けなくなる／別の指の場所に置かれる（2026-09-08のレビューで発覚）
let finished = false;
let lastTurnSeat = 0;         // 直前の手番の席（手番が変わった瞬間だけ音を鳴らすため）
let pendingCpu = false;       // ★せってい中に来たCPUの手番★（閉じたときに指してもらう）
const rng = makeRng((Date.now() ^ 0x9e37) >>> 0);
const coach = new Coach();

// ── 画面の切り替え ───────────────────────────────
const SCREENS = {
  title: 'scTitle', result: 'scResult',
  records: 'scRecords', settings: 'scSettings', howto: 'scHowto', news: 'scNews',
};
let curScreen = null;          // いま出ている画面（null＝盤）

function show(name) {
  curScreen = name;
  paused = false;              // ★どの画面へ移っても一時停止は解除する★
  for (const [k, id] of Object.entries(SCREENS)) $(id).classList.toggle('show', k === name);
  el.hud.hidden = !!name;
  // ★盤から離れたら、置きかけの指と、進行中の対戦を捨てる★
  //   世代番号を進めておかないと、演出の途中でやめたときに残りのコールバックが走り切り、
  //   やめたはずの対戦の勝敗が記録される（2026-09-08のレビューで発覚）
  if (name) {
    held = -1; pressId = null; busy = false; pendingCpu = false;
    if (view) { view.cancelAnimation(); view.setHints(null); }
    if (match && !match.state.winner) match.id = ++matchId;
    hideChainPop();
    hideHand();
    sayNothing();
  }
  if (name === 'records') renderRecords();
  if (name === 'settings') renderSettings(false);
  if (name === 'howto') renderHowto();
  if (name === 'news') renderNews();
  if (name === 'title') { Audio.bgmStop(); renderTitle(); }
}

// ── 起動 ────────────────────────────────────
function boot() {
  /* ★#fx（画面いっぱいのキャンバス）を渡す★
       音符と星だけはここに描く。渡さないと盤の中にしか描けず、
       「画面いっぱいにド派手に」（オーナー）が盤の周りの小さな散らばりに戻る。 */
  applyMotionClass();
  view = new BoardView(el.board,
                       { fx: device.effects, fxCanvas: el.fx || null, motion: device.motion });
  Audio.setSeVol(device.seVol);
  Audio.setBgmVol(device.bgmVol);
  Audio.setBgmSong(device.bgm || Audio.DEFAULT_BGM);
  const unlockAudio = () => Audio.unlock();
  for (const evName of ['pointerdown', 'touchstart', 'keydown', 'click']) {
    document.addEventListener(evName, unlockAudio);   // ★once を付けない
  }
  // ★入力は「指を置く → 予告が出る → 離して確定」★（2026-09-08）
  //   move/up/cancel は window で受ける。盤の外へ指がはみ出しても取りこぼさないため
  el.board.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onCancel);

  window.addEventListener('resize', () => view.resize());
  document.querySelectorAll('[data-go]').forEach((b) => {
    b.addEventListener('click', () => { Audio.SE.tap(); show(b.dataset.go); });
  });
  $('btnPlay').addEventListener('click', () => startNormal());
  $('btnVs').addEventListener('click', () => startVs());

  // ★対戦中の設定（ポーズ）★ show() を通さない——通すと開いただけで対戦が捨てられる
  $('btnPause').addEventListener('click', () => openPause());
  $('btnResume').addEventListener('click', () => { Audio.SE.tap(); closePause(); });
  $('btnRestart').addEventListener('click', () => { Audio.SE.tap(); restartMatch(); });
  $('btnQuit').addEventListener('click', () => {
    Audio.SE.tap();
    if (!confirmQuit()) return;
    show(mode === 'tutorial' ? 'howto' : 'title');
  });

  // ★「もういちど」は、いま遊んでいた種類に戻す★
  $('btnAgain').addEventListener('click', () => {
    if (mode === 'vs') return startVs();
    if (mode === 'tutorial') {
      return tutorialStep + 1 < TUTORIALS.length ? startTutorial(tutorialStep + 1) : skipToReal();
    }
    return startNormal();
  });
  $('btnToTitle').addEventListener('click', () => show(mode === 'tutorial' ? 'howto' : 'title'));
  $('btnHowtoPlay').addEventListener('click', () => skipToReal());
  $('btnCoachAgain').addEventListener('click', () => {
    coach.reset();
    device = { ...device, coachSeen: [] };
    writeDevice(device);
    $('btnCoachAgain').textContent = 'つぎの対戦から また 出ます';
  });
  // ★音量はスライドバー★（2026-09-08 オーナー指示）
  //   input（動かしている最中）… 音量にすぐ反映する。**保存はしない**（1目盛りごとに書くのは無駄）
  //   change（指を離した）    … 保存して、試聴の音を鳴らす
  //
  // ★2026-09-09 オーナー指示で変更★
  //   > SEの音量バーを調整するときも逐次音を鳴らしてほしいかも
  //   もとは「指を離したときだけ」鳴らしていた（動かしている最中に鳴らすと連射で潰れる、
  //   というのが v1.0 の判断）。合わせながら聞けないほうが不便、というオーナーの判断を採る。
  //   ★そのうえで間隔だけ守る★ 1目盛りごとに全部鳴らすと音が重なって、
  //     かえって「いまどのくらいの大きさか」が分からなくなる。
  //     短い「置く音」を SE_PREVIEW_MS に1回までにする（0のときは鳴らさない）。
  $('volSe').addEventListener('input', (e) => {
    device.seVol = Number(e.target.value);
    Audio.setSeVol(device.seVol);
    paintVol(e.target, $('volSeVal'), device.seVol);
    sePreview();
  });
  $('volSe').addEventListener('change', () => {
    saveVolumes();
    if (device.seVol > 0) Audio.SE.boom(3);      // いま決めた大きさで、実際のはじけ音を聞かせる
  });
  $('volBgm').addEventListener('input', (e) => {
    device.bgmVol = Number(e.target.value);
    Audio.setBgmVol(device.bgmVol);
    paintVol(e.target, $('volBgmVal'), device.bgmVol);
  });
  $('volBgm').addEventListener('change', () => {
    saveVolumes();
    if (device.bgmVol > 0) Audio.bgmPlay();
  });
  initSizeSliders();
  // ★大きな連鎖を画面いっぱいに出す★（見せ方は画面側の仕事。render.js は数を知らせるだけ）
  view.onChainPop = (n, restart, soft) => showChainPop(n, restart, soft);
  $('optPreview').addEventListener('change', (e) => {
    device.preview = e.target.checked; writeDevice(device); refreshHints();
  });
  $('optCoach').addEventListener('change', (e) => {
    device.coach = e.target.checked; writeDevice(device); if (!device.coach) sayNothing();
  });
  $('optLight').addEventListener('change', (e) => {
    device.effects = e.target.checked ? 'light' : 'normal';
    writeDevice(device); view.setEffects(device.effects);
  });
  // ★がめんを ゆらす★（端末の「うごきを へらす」をアプリ側から上書きする）
  $('optShake').addEventListener('change', (e) => setShake(e.target.checked));
  // 前回までに出した案内は覚えておく（毎回おなじ説明が出るとうるさい）
  if (Array.isArray(device.coachSeen)) for (const id of device.coachSeen) coach.seen.add(id);
  show('title');
  view.resize();
  // ★起動しきったことを知らせる旗★（救済画面はこの旗だけを見る）
  globalThis.__lunaReady = true;
}

// ★練習では聞かない★（失う記録が無いのに引き止めると、入口が重くなるだけ）
const confirmQuit = () => (match && !match.state.winner && mode !== 'tutorial')
  ? confirm('とちゅうでやめますか？') : true;

/** 練習を飛ばして本番へ */
function skipToReal() {
  if (!save.tutorialDone) { save = { ...save, tutorialDone: true }; writeSave(save); }
  startNormal();
}

// ── 対戦の開始 ──────────────────────────────
/** 1戦ごとにちがう地形を作る。★日替わり盤は撤去したので、その場で作る★ */
const randomBoard = () => generateBoard(makeRng(((Math.random() * 0xffffffff) | 0) >>> 0));

function startNormal() {
  if (!save.tutorialDone) return startTutorial(0);
  applyBoardSize();
  const b = randomBoard();
  mode = 'normal';
  beginMatch({ terrain: b.terrain, wrapX: b.wrapX, tier: cpuTier(), oppName: 'ルナ' });
}

/**
 * こんどの対戦で使うCPUの強さ。
 * ★「じどう」と「手で決めた強さ」を同じ数字に持たせない★
 *   save.tier（直近10戦で動く）と device.cpuTier（人が決めた）は別物。
 *   1つにまとめると、手動で遊んだあと自動に戻したときに段位が意味を失う。
 */
const cpuTier = () => (device.cpuAuto ? save.tier : device.cpuTier);

/**
 * この対戦を「きろく」に残してよいか。★判定はここ1か所★
 *   2か所に分けると、片方だけ直して静かにズレる。
 *   ふつうの盤(6×7) かつ 強さがじどう のときだけ残す。
 */
const countsForRecord = () => isDefaultSize() && device.cpuAuto;

/**
 * せっていで選んだ盤の大きさを実際に効かせる。
 *
 * ★呼んでよいのは「対戦を作る直前」だけ★
 *   盤の大きさを変えると N が変わるが、進行中の対戦が持つ配列は古い長さのまま。
 *   範囲外に触っても JS は例外を出さないので、**静かに盤が壊れる**（いちばん見つけにくい）。
 *   だからスライドバーは device に保存するだけにして、効くのは次の対戦から。
 */
function applyBoardSize(w = device.boardW, h = device.boardH) {
  setSize(w, h);
}

/**
 * 二人対戦（1台を交代して2人で遊ぶ）。★盤は回さない★
 *   回すと hit() の座標変換と、マスの数字の向きが両方おかしくなる。
 *   横に並んで遊ぶ前提にして、代わりに **手番をはっきり出す** ことで迷わせない。
 */
function startVs() {
  applyBoardSize();
  const b = randomBoard();
  mode = 'vs';
  beginMatch({ terrain: b.terrain, wrapX: b.wrapX, tier: 1, oppName: 'ふたり', vs: true });
}

/**
 * れんしゅう（あそびかた）。★盤の中身は data/tutorial.js が持つ★
 *   ★盤が「必ず勝てる」ことは test/test-tutorial.mjs が実際に叩いて確かめている★
 */
function startTutorial(step = 0) {
  tutorialStep = Math.max(0, Math.min(TUTORIALS.length - 1, step | 0));
  const st = TUTORIALS[tutorialStep];
  mode = 'tutorial';
  /* ★れんしゅうは いつでも ふつうの盤（6×7）★
     教えるのは「かど2・へり3・まんなか4」なので、盤を変える理由がない。
     大きさが変わると setup の座標と taps の回数が合わなくなり、練習が終わらなくなる。 */
  applyBoardSize(DEF_W, DEF_H);
  beginMatch({ terrain: new Int8Array(N), wrapX: false, tier: 1, oppName: st.name, mySeat: 1 });
  const s = match.state;
  st.setup(s);
  s.moves = [1, 1];            // 開幕判定を抜ける（相手は動かないため）
  s.player = 1;
  view.sync(s);
  aimHand(handIdx(st));
  lastTurnSeat = 1;
  updateHud();
  refreshHints();
}

function beginMatch({ terrain, wrapX, tier, oppName, mySeat = null, vs = false }) {
  // ★先手・後手は1戦ごとにランダム★（komi は廃止したので、残る先手有利はここで均す）
  const seat = vs ? 1 : (mySeat || (Math.random() < 0.5 ? 1 : 2));
  // ★古い演出を必ず捨てる★
  //   捨てないと、対戦中の「さいしょから」で前の対戦のイベントが新しい盤に適用され、
  //   玉の数と持ち主が静かに壊れる（例外が出ないので気づけない）
  if (view) view.cancelAnimation();
  match = createMatch({ terrain, wrapX, tier, oppName, mySeat: seat, vs });
  match.id = ++matchId;        // 遅れて届くコールバックを捨てるための世代番号
  finished = false;
  held = -1;
  pressId = null;
  // ★金色にする席★ CPU戦は「自分がいつも金」、二人対戦は「先手が金・後手が青」で固定
  view.setSeat(vs ? 1 : seat);
  show(null);
  view.sync(match.state);
  view.legal = null;
  view.lastMove = -1;
  view.resize();
  hideChainPop();
  lastTurnSeat = match.state.player;   // 開始時は鳴らさない
  updateHud();
  hideHand();
  sayNothing();
  busy = false;
  refreshHints();
  Audio.bgmPlay();             // ★「押した」流れの中なので iPhone でも鳴らせる★
  // ★自分の手番のときだけ「押してみて」と言う★
  if (coachOn() && humanTurn(match)) say(coach.feed({ phase: 'start' }));
  const cs = cpuSeat(match);
  if (cs && match.state.player === cs) setTimeout(cpuTurn, 350);
}

/** 対戦中の設定から「さいしょから」 */
function restartMatch() {
  closePause();
  if (mode === 'tutorial') return startTutorial(tutorialStep);
  if (mode === 'vs') return startVs();
  return startNormal();
}

// ── 入力（指を置く → 予告 → 離して確定）────────────────
/** ★操作してよいか★ 席ではなく control（誰が押すか）だけを見る */
const myTurn = () => !!match && !busy && !paused && !shaking()
  && curScreen === null && humanTurn(match);

function onDown(e) {
  if (pressId !== null) return;               // すでに別の指が乗っている（2本目は無視する）
  if (e.button !== undefined && e.button !== 0) return;   // 右クリック・中クリックでは置かない
  if (!myTurn()) return;
  const i = view.hit(e.clientX, e.clientY);
  if (i < 0) return;
  e.preventDefault();
  pressId = e.pointerId ?? 0;
  held = i;
  sayTerrain(i);
  showPreview(i);
}

function onMove(e) {
  if (pressId === null || (e.pointerId ?? 0) !== pressId) return;
  const i = view.hit(e.clientX, e.clientY);
  if (i === held) return;
  // ★盤の外へ出ても「押している」状態は続ける★
  //   held だけを -1 にして予告を消し、戻ってきたらまた出す。
  //   押している状態まで捨てると、いったん外へ出した指が戻っても二度と反応しなくなる
  held = i;
  sayTerrain(i);
  showPreview(i);
}

/**
 * さわったマスが ふつうでない地形なら、それが何なのかを1行で出す。
 *
 * ★2026-09-09 オーナー指摘★
 *   > 添付にある置けないマスが何を意味しているかが説明もなくて分からないのだけど。
 *   説明は「あそびかた」の折りたたみの中にしか無く、開かなければ一生読まれなかった。
 *   **押せなかった瞬間が、説明がいちばん届く1回**なので、そこで出す。
 *
 * ★ふたりで あそぶ でも出す★（coachOn() を使わない理由）
 *   §0-10 で「ふたり対戦では画面が口出ししない」と決めたが、地形だけは例外。
 *   そばに人がいても、地形の意味は誰も教えられない。
 */
function sayTerrain(i) {
  if (i < 0 || !match || !device.coach || curScreen !== null) return;
  const t = effTerrain(match.state, i);       // ★雲は晴れる★ ので、いま効いている地形を見る
  const id = t === T_STARDUST ? 'stardust'
    : t === T_CLOUD ? 'cloud'
      : t === T_CRATER ? 'crater' : '';
  if (!id) return;
  say(coach.take(id));                        // 一度出した行は二度と出ない（take が面倒を見る）
}

function onUp(e) {
  if (pressId === null || (e.pointerId ?? 0) !== pressId) return;
  const target = held;
  pressId = null;
  held = -1;
  view.setPreview(null);
  // ★盤の外で はなしたら 置かない★（やめられる＝安心して予告を見られる）
  if (target < 0 || !myTurn()) return;
  commitMove(target);
}

function onCancel(e) {
  if (pressId !== null && (e?.pointerId ?? pressId) !== pressId) return;
  pressId = null;
  held = -1;
  view.setPreview(null);
}

/**
 * ★盤ぜんぶに「押したら何連鎖するか」を出す★（2026-09-08）
 *
 *   もとは「指を置いたマスだけ」を予告していた。だが実測では
 *   **はじける手は序盤で5.7%・全体でも21%しかなく**、4回に3回は押しても何も光らない。
 *   探すには42マスを1つずつ長押しするしかなく、遊ぶ側からは
 *   「予告が機能していない＝運ゲー」としか見えなかった（オーナー実測）。
 *   → 手番の人のあいだ、はじける手ぜんぶに連鎖数を出しっぱなしにする。
 *   計算は1手番あたり最大0.41ms なので、毎手番作り直してよい。
 *
 * ★主体は「いま手番の席」★（mySeat ではない）
 *   二人対戦では手番ごとに押す人が変わる。mySeat で数えると、
 *   後手番のあいだ先手用の数字が出て「押せないマスが光る」ことになる。
 */
function refreshHints() {
  if (!match || !view) return;
  const on = device.preview && !busy && !paused && humanTurn(match);
  view.setHints(on ? chainMap(match.state, match.state.player) : null);
}

/** 指を置いているあいだ、その手で「実際にはじけるマス」を光らせる（数字の裏取り） */
function showPreview(i) {
  if (i < 0 || !device.preview || !myTurn()) { view.setPreview(null); return; }
  const r = previewChain(match.state, i, match.state.player);
  view.setPreview(r.ok ? r.cells : null);
}

function commitMove(i) {
  const r = play(match, i);
  if (!r.ok) return;
  hideHand();
  view.legal = null;           // 練習の「ここを押して」の枠を消す
  Audio.SE.place();
  afterMove(r, () => {
    if (mode === 'tutorial' && !match.state.winner) {
      // 練習では相手が動かないので、手番を自分に戻してやらないと2回目が押せなくなる
      match.state.player = 1;
      updateHud();
      aimHand(handIdx(TUTORIALS[tutorialStep]));
      refreshHints();
      return;
    }
    if (coachOn()) say(coach.feed({ phase: 'myMove', chain: r.chain, hasReady: hasReady() }));
    const cs = cpuSeat(match);
    if (!match.state.winner && cs && match.state.player === cs) setTimeout(cpuTurn, 260);
  });
}

/** 1手ぶんの演出を流し、終わったら次へ */
function afterMove(r, next) {
  busy = true;
  const gen = match.id;
  /* ★いま演出している手を、誰が打ったか★（2026-09-09 レビュー指摘で追加）
       `state.player` は play() の中の endTurn() で**もう相手に移っている**（rules.js）。
       演出のコールバックはそのあとに走るので、そこで `state.player` を見ると
       **必ず相手の席**が返る。歓声の鳴らし分けがまるごと逆になっていた。
     ★r.player を使う★ すぐ上の「奪えたときのキラキラ」が既にこの形（match.control[r.player]）。 */
  popSeat = r.player;
  view.setPreview(null);
  view.setHints(null);         // 演出中に古い数字を残さない
  view.lastMove = r.events.find((e) => e.t === 'place')?.i ?? view.lastMove;

  // ★音を演出と同じ速さで散らす★（2026-09-08 アドバイザー指摘）
  //   以前は1手ぶんの boom を全部 delay 0 で鳴らしていた。演出は最大2.2秒に分散されているのに
  //   音だけ束になっていて、300連鎖では600個の音が同時に生成されていた（＝音割れと一瞬の停止）。
  //   イベントの並び順は演出の再生順そのものなので、添字×1コマの長さが、そのまま鳴らす時刻になる。
  const booms = r.events.filter((e) => e.t === 'boom').length;
  const stepSec = stepFor(booms) / 1000;
  r.events.forEach((ev, j) => {
    if (ev.t === 'boom') Audio.SE.boom(ev.chain, Math.min(2.4, j * stepSec));
  });
  // 奪えたときだけキラキラを足す（相手に奪われたときに鳴らすと、負けが気持ちよくなってしまう）
  if (r.captured > 0 && match.control[r.player] === 'human') {
    Audio.SE.capture(r.captured, Math.min(2.4, booms * stepSec));
  }
  // ★大きい連鎖はド派手に★（月ゲージは廃止したので、連鎖そのものを見せ場にする）
  //   ★5連鎖目が画面に出る時刻に合わせる★
  //     ここで即時に鳴らすと、ごほうびの音が**数百ms先に**来てしまい、
  //     何に対するごほうびなのか分からなくなる（2026-09-08のレビューで発覚）
  //   ★全画面フラッシュ（bigFlash）はここでは出さない★
  //     画面いっぱいのカットインと同時に光ると、**輝度の変化が2段ぶん重なる**（仕様書§5-4）。
  //     全画面の光は決着のときだけにする。見せ場はカットインと画面のゆれが担う。
  const bigIdx = r.events.findIndex((e) => e.t === 'boom' && e.chain >= 5);
  if (bigIdx >= 0) Audio.SE.moon(Math.min(2.4, bigIdx * stepSec));

  view.animate(r.events, () => {
    if (!match || match.id !== gen) return;   // 別の対戦が始まっていたら何もしない
    view.sync(match.state);
    updateHud();
    busy = false;
    if (match.state.winner) return finish();
    refreshHints();
    if (next) next();
  });
}

function cpuTurn() {
  if (!match || match.state.winner) return;
  if (mode === 'tutorial') return;            // 練習では相手は動かない
  const seat = cpuSeat(match);
  if (!seat || match.state.player !== seat) return;
  // ★せっていを開いているあいだは、CPUに指させない★（2026-09-08のレビューで発覚）
  //   止めないと「音量を直しに開いただけなのに、その間に負けていた」が起きる。
  //   しかも手番の合図の音が、開いているパネルの裏で鳴る。
  if (paused) { pendingCpu = true; return; }
  busy = true;
  view.setHints(null);          // 相手の手番のあいだは出さない（押す人の手の予告なので）
  const gen = match.id;
  const before = Int8Array.from(match.state.owner);
  setTimeout(() => {
    if (!match || match.id !== gen) return;
    if (paused) { busy = false; pendingCpu = true; return; }   // 待っているあいだに開かれた
    const i = cpuMove(match, rng);
    busy = false;
    if (i < 0) return finish();
    const r = play(match, i);
    if (!r.ok) return finish();
    Audio.SE.place();
    afterMove(r, () => {
      // 相手に何マス取られたかを数えて、案内の内容を変える
      let lost = 0;
      for (let k = 0; k < N; k++) {
        if (before[k] === match.mySeat && match.state.owner[k] === seat) lost++;
      }
      if (coachOn()) say(coach.feed({ phase: 'oppMove', lost }));
      if (!match.state.winner && humanTurn(match) && coachOn()) {
        setTimeout(() => {
          if (match && match.id === gen) say(coach.feed({ phase: 'myTurn', hasReady: hasReady() }));
        }, 700);
      }
      if (!match.state.winner && match.state.player === seat) setTimeout(cpuTurn, 220);
    });
  }, 120);
}

// ── 対戦中の案内 ───────────────────────────
// ★二人対戦では出さない★（そばに教える人がいる状況なので、画面の口出しは邪魔になる）
const coachOn = () => device.coach && mode === 'normal' && !coach.done;

let sayTimer = null;
const SAY_MS = 4200;           // ★出しっぱなしにしない★（読み終わったら盤に戻す）

function say(text) {
  if (!text) return;
  el.coach.textContent = text;
  el.coach.hidden = false;
  if (sayTimer) clearTimeout(sayTimer);
  sayTimer = setTimeout(() => { el.coach.hidden = true; sayTimer = null; }, SAY_MS);
  // 出した行を覚えて、次に来たときに繰り返さない（★端末に保存する★）
  device = { ...device, coachSeen: [...coach.seen] };
  writeDevice(device);
}
function sayNothing() {
  if (sayTimer) { clearTimeout(sayTimer); sayTimer = null; }
  el.coach.hidden = true;
  el.coach.textContent = '';
}

/** 「あと1つではじける自分のマス」があるか（案内の出し分けに使う。CPU戦だけ） */
function hasReady() {
  if (!match) return false;
  const me = match.mySeat;
  for (let i = 0; i < N; i++) {
    if (match.state.owner[i] === me && match.state.count[i] === capAt(match.state, i) - 1) return true;
  }
  return false;
}

// ── 対戦中のヘッダ（手番表示と設定ボタンだけ）──────────
/**
 * ★マス数・じんちのわりあい・相手の段位は 2026-09-08 に撤去した★
 *   > 対戦中の上の方にある内容はいらないかも。戦況が動きまくるので、有利不利が意味ない。（オーナー）
 *   ★「情報が足りない」と思っても、勝手に戻さないこと。★
 *     実際に遊んだうえでの指示である。戻すならオーナーに聞く。
 */
function updateHud() {
  if (!match) return;
  const p = match.state.player;
  const col = view.colorOf(p);
  el.turnDot.style.background = col;
  el.turnDot.style.boxShadow = `0 0 10px ${col}`;

  let label;
  if (match.state.winner) label = 'おわり';
  else if (match.vs) label = p === 1 ? 'きんいろの ばん' : 'あおの ばん';
  else label = humanTurn(match) ? 'きみの ばん' : 'あいての ばん';
  el.turnText.textContent = label;
  el.turnText.style.color = col;
  el.hud.classList.toggle('mine', !match.state.winner && humanTurn(match));

  // ★手番が変わった瞬間だけ知らせる★（毎手番の相づちにすると、ただの雑音になる）
  if (!match.state.winner && p !== lastTurnSeat) {
    const prev = lastTurnSeat;
    lastTurnSeat = p;
    if (prev !== 0 && mode !== 'tutorial') {
      // 二人対戦は交代の合図が要る（端末を渡す相手に伝わるように、席で音を変える）
      if (match.vs) Audio.SE.turn(p === 1);
      else if (humanTurn(match)) Audio.SE.turn(true);
    }
  }
}

// ── 大きな連鎖のカットイン（画面いっぱいの「〇れんさ！」）──────────
/*  > 見た目でも派手にしてほしいな。画面全面に『〇連鎖！』みたいな大きな文字をドーン！と
    > 表示する感じでどうでしょう。画面も揺れてもいいね。（オーナー 2026-09-08）

    ★出し直してよい間隔は render.js の POP_MIN_MS が決める★（仕様書§5-4 光過敏性発作への配慮）
      連鎖が伸びている最中は restart=false で呼ばれる。そのときは
      **数字だけ差し替えて、透明度は上げ直さない**（上げ直すと1秒に何回も明滅する）。
    ★背景を塗らないこと★ 文字と光だけなら、明滅する面積が画面全体にならない。
      暗幕やグラデを敷いた瞬間に「広い面積の明滅」になる。 */
const POP_MS = 640;            // 出しておく時間。★POP_MIN_MS より長くすること★
let popTimer = null;
let shakeTimer = null;
/* ★ふちの光は、揺れとは別のタイマーで持つ★
   動きを止めている端末では揺れのタイマーが動かないので、
   同じタイマーに相乗りさせると、その端末でふちが消えなくなる（光りっぱなし＝§5-4 違反）。 */
let rimTimer = null;
const RIM_MS = 340;            // ふちが光っている時間。揺れの長さ(msBig)と揃える

/**
 * はじけたことを画面で知らせる。★出し分けはここ1か所★
 *   1連鎖      … 盤を小さく揺らすだけ（「はじけた」の合図。文字は出さない）
 *   2連鎖以上  … 画面いっぱいの「〇れんさ！」＋大きい揺れ
 * soft（ひかえめ設定・reduced-motion）のときは **文字だけ出して揺らさない**。
 *   ★消さない★ 仕様書§5-4が求めているのは「弱める」であって「消す」ではない。
 */
/**
 * 「この端末の状態」を1行で出す。★見えないものは確認できない★
 *   端末の「アニメーションを減らす」が入っていると画面は揺れない仕様なので、
 *   それを表に出しておかないと「アプリが壊れている」と「端末の設定」を区別できない。
 *   ★やさしい日本語で・24字以内★（画面のほかの案内と同じ制約）
 */
function paintDeviceLine() {
  /* ★matchMedia を自分で読まない★ 判定の正本は render.js の resolveMotion 1か所。
       ここで読むと「ゆれません と出ているのに揺れる」食い違いが起きうる。 */
  const still = resolveMotion(device.motion);
  const osStill = deviceWantsStill();

  const box = $('optShake');
  if (box) box.checked = !still;

  // スイッチのすぐ下に「なぜ今こうなっているか」を出す（操作と説明を同じ箱に置く）
  const note = $('shakeNote');
  if (note) {
    /* ★既定はオン★（2026-09-09 オーナー指示）
         端末が「うごきを へらす」でも揺らす。つらい人が自分で切れるように、
         そのことを **チェックを外す前から** 書いておく。 */
    note.textContent = osStill
      ? (still
        ? 'この たんまつは 「うごきを へらす」せってい なので ゆれません'
        : 'この たんまつは 「うごきを へらす」せってい ですが、ゆらして います。'
          + 'くるしい ときは チェックを はずして ください')
      : (still ? 'いまは ゆれません' : 'はじけると 画面が ゆれます');
    note.classList.toggle('warn', osStill && !still);
  }

  // 版番号の下の行は「端末が何と言っているか」だけを出す（切り分け用に残す）
  const p = $('devSettings');
  if (!p) return;
  p.textContent = osStill
    ? 'たんまつの せってい: うごきを へらす'
    : 'たんまつの せってい: ふつう';
  p.classList.toggle('warn', osStill && still);
}

/**
 * 「がめんを ゆらす」を切り替える。
 * ★保存は3値★ 触った瞬間に 'full' / 'still' へ確定させる（'auto' には戻さない）。
 *   一度も触っていない人だけが 'auto' のままで、あとから端末側の設定を変えても追従する。
 */
function setShake(on) {
  device.motion = on ? 'full' : 'still';
  writeDevice(device);
  if (view) view.setMotion(device.motion);
  applyMotionClass();
  paintDeviceLine();
}

/**
 * <html> に force-motion を付け外しする。
 * ★CSS の @media (prefers-reduced-motion) の例外は、このクラスだけで作ってある★
 *   付け忘れると「JSは揺らそうとしているのにCSSが止める」という、いちばん分かりにくい形で壊れる。
 */
function applyMotionClass() {
  document.documentElement.classList.toggle('force-motion', !resolveMotion(device.motion));
}

/* ★音量バーの試聴音の間隔★（2026-09-09）
     90ms＝1秒に11回まで。スライドバーは step=5 なので、
     端から端まで一気に動かしても20回ぶんしか刻みが無く、これで十分ついてくる。 */
const SE_PREVIEW_MS = 90;
let sePreviewAt = -99999;
let sePreviewCount = 0;                        // ★通し検証から読む★ 鳴らそうとした回数
const nowMs = () => (globalThis.performance && performance.now ? performance.now() : Date.now());
function sePreview() {
  if (!(device.seVol > 0)) return false;       // 0のときに鳴らすと「消えていない」と誤解される
  const t = nowMs();
  if (t - sePreviewAt < SE_PREVIEW_MS) return false;
  sePreviewAt = t;
  sePreviewCount += 1;
  Audio.SE.place();                            // ★短い音を使う★ boom は長すぎて次の刻みに重なる
  return true;
}

/* ★数字の大きさは連鎖数で伸ばす★（2026-09-09 オーナー指示）
     > 「〇連鎖」の文字は、今のサイズから数字だけサイズを大きくしていこうよ。
     >  「れんさ」部分は変えなくていい
   ★上限を必ず置く★ 画面の横幅を超えると数字が切れて、何連鎖か読めなくなる
     （CSS側も clamp の中に vw を残してあり、二重に守っている）。
   2連鎖=1.00 から 30連鎖=1.90 まで伸び、そこで頭打ち。 */
const POP_SCALE = { from: POP_TEXT_CHAIN, per: 0.032, max: 1.9 };
const popScale = (n) =>
  Math.min(POP_SCALE.max, 1 + Math.max(0, n - POP_SCALE.from) * POP_SCALE.per);

/* ★演出中の手の持ち主★ afterMove が入れる。0 は「まだ誰も打っていない」 */
let popSeat = 0;

function showChainPop(n, restart, soft) {
  if (!view) return;
  const withText = n >= POP_TEXT_CHAIN;
  if (withText) {
    el.chainPopNum.textContent = String(n);
    el.chainPop.classList.toggle('hot', n >= 8);
    // ★伸びている最中も育てる★ 出し直しは600msに1回だが、連鎖はその間も伸びる
    el.chainPop.style.setProperty('--pop', popScale(n).toFixed(3));
  }
  /* ★揺れの強さは、伸びている最中でも上げていく★（2026-09-09 実測で判明）
       カットインを「出し直す」のは600msに1回だが、連鎖はその間に2→3→…と伸びる。
       出し直すときにしか --sk を入れ直さないと、**20連鎖でも2連鎖ぶんの揺れ**にしかならない
       （実測: 3連鎖の場面で --sk が 10px＝2連鎖ぶんのまま止まっていた）。
       走っているアニメは --sk を読み続けるので、ここで入れ直せば揺れが育つ。 */
  /* ★「ひかえめ」は 0 にしない（＝消さない）★ 倍率をかけて弱く揺らす。
       消してよいのは prefers-reduced-motion（soft）のときだけ——あれは
       「動くこと自体がつらい」という申告なので、揺れは止めるのが正しい。 */
  const scale = view.weakened ? SHAKE.lightScale : 1;
  if (!soft) {
    el.stage.style.setProperty('--sk', `${Math.max(1, Math.round(shakeAmp(n, view.cell) * scale))}px`);
  }

  /* ★歓声★（2026-09-09 オーナー指示）
       30連鎖以上 … 歓声と拍手1（大盛り上がり）／10〜29連鎖 … 歓声と拍手2（中盛り上がり）
       相手が30連鎖以上 … スタジアムの歓声2
     ★誰の連鎖かを見る★ 自分と相手で鳴らす音を変えるので、席の判定を間違えると逆になる。
       二人対戦では「いま指している人」が常に自分側なので、mine は true。
     鳴らしすぎの歯止め（最低2秒）は audio.js が持つ。 */
  if (n >= 10) {
    /* ★mySeat ではなく control を見る★（app.js 冒頭の注意書きと、既存の capture の判定に合わせる）
         ふたりで あそぶ は両席 human なので、どちらの連鎖でも「自分側」の歓声になる。
       ★state.player は使わない★ この時点で相手に移っている（上の popSeat の説明を参照）。 */
    const mine = !match || !popSeat || match.control[popSeat] === 'human';
    Audio.SE.cheer(n, mine);
  }

  /* ★盤のふちを光らせるのは、どの設定でも出す★（2026-09-09 追加）
       これは「移動」ではなく「明るさの変化」なので prefers-reduced-motion の対象外。
       v1.6 は動きを止める端末に**何も**出していなかった（§5-4 は「弱める」）。
       同時に、揺れが見えない本当の原因（盤と背景が同じ暗さで基準線が無い）への対策でもある。 */
  if (restart) {
    el.stage.classList.remove('rim');
    void el.stage.offsetWidth;
    el.stage.classList.add('rim');
    if (rimTimer) clearTimeout(rimTimer);
    rimTimer = setTimeout(() => { el.stage.classList.remove('rim'); rimTimer = null; }, RIM_MS);
  }

  if (!restart) return;                       // 伸びている最中は数字だけ差し替える

  if (withText) {
    el.chainPop.hidden = false;
    el.chainPop.classList.toggle('soft', !!soft);   // 拡大・回転をやめ、出るだけにする
    el.chainPop.classList.remove('play');
    void el.chainPop.offsetWidth;             // アニメを最初から流し直すために1回読む
    el.chainPop.classList.add('play');
    if (popTimer) clearTimeout(popTimer);
    popTimer = setTimeout(hideChainPop, POP_MS);
  }

  if (soft) return;                           // ここから先は「動き」なので出さない

  // ★揺らすのは盤の入れ物(#stage)だけ★
  //   #app を揺らすと、ヘッダの⚙も、開いている設定画面も、起動失敗の救済画面も一緒に揺れる。
  //   とくに「止めたい人が⚙を押せない」のは避けたい。
  /* ★px と ms の正本は render.js の SHAKE★（ここに数字を書かない）
       前の版は「0.42秒かけて3px」で、本番の実測でも最大2.91pxしか動いていなかった。
       0.42秒かけて3px動くのは「ゆっくり傾いた」であって、揺れとして知覚できない。
     ★盤の1マスの大きさに紐づける★ 8×10 の盤では1マスが24〜30pxまで小さくなるので、
       px固定だと盤1マスぶん動くことになり、どこを押したのか分からなくなる。 */
  const ms = shakeMs(n);
  el.stage.classList.remove('shake', 'small');
  void el.stage.offsetWidth;
  el.stage.style.setProperty('--skms', `${ms}ms`);
  /* ★短い揺れは、往復の回数も減らす★
       同じ10往復の型を200msでかけると約22Hzになり、揺れではなく「ブレ」に見える
       （60コマ表示では1往復が3コマを切る）。1連鎖用は往復の少ない型を使う。 */
  el.stage.classList.add('shake');
  if (!withText) el.stage.classList.add('small');
  if (shakeTimer) clearTimeout(shakeTimer);
  /* ★揺れ終わるまでは、盤のタップを受け付けない★
       #stage が動いているあいだ、canvas の位置は最大 amp px ずれている。
       hit() は getBoundingClientRect から逆算するので、読み取りと表示の1コマぶんの差が
       そのまま「押したマスと違うマスに置かれる」になる。振幅を3px→最大24pxに上げた以上、
       ここを塞がないと実害が出る（cell 36px なら3割ずれる）。 */
  shakeTimer = setTimeout(() => { el.stage.classList.remove('shake', 'small'); shakeTimer = null; }, ms);
}

/** 揺れている最中か（★このあいだは盤を押させない★ 上の説明を読むこと） */
const shaking = () => shakeTimer !== null;

/** ★消す責任者はここ1か所★（対戦を離れても「5れんさ！」が居座らないように） */
function hideChainPop() {
  if (popTimer) { clearTimeout(popTimer); popTimer = null; }
  if (shakeTimer) { clearTimeout(shakeTimer); shakeTimer = null; }
  if (rimTimer) { clearTimeout(rimTimer); rimTimer = null; }
  el.stage.classList.remove('rim');
  el.chainPop.hidden = true;
  el.chainPop.classList.remove('play', 'hot', 'soft');
  el.chainPopNum.textContent = '';   // 古い数字を残さない（残ると調べたときに誤診する）
  el.stage.classList.remove('shake');
}

function showHand(i) {
  const r = el.board.getBoundingClientRect();
  const box = el.stage.getBoundingClientRect();
  el.handSign.hidden = false;
  el.handSign.style.left = (r.left - box.left + view.pad + (xOf(i) + 0.5) * view.cell) + 'px';
  el.handSign.style.top = (r.top - box.top + view.pad + (yOf(i) + 0.9) * view.cell) + 'px';
}
const hideHand = () => { el.handSign.hidden = true; };

/** 押してほしいマスを示す。★指マークだけに頼らない★（演出ひかえめだとアニメが止まるため） */
function aimHand(i) {
  showHand(i);
  view.legal = [i];
  view.draw();
}

// ── 決着 ────────────────────────────────────
function finish() {
  if (finished) return;        // ★二重に走らせない★
  finished = true;
  held = -1;
  pressId = null;
  view.setPreview(null);
  view.setHints(null);
  const w = match.state.winner;
  const me = match.mySeat;
  const won = w === me;
  view.bigFlash();
  updateHud();

  /* ★決着したら拍手★（2026-09-09 オーナー指示「決着後は『スタジアムの拍手』」）
       ★勝敗にかかわらず鳴らす★ 負けたほうにも「1局おつかれさま」を返したい相手（4〜8歳）なので、
       勝ったときだけ拍手すると、負けた側の画面だけ急に静かになる。
       勝ち負けの区別は、このあとの win()/lose() の音と文字が担う。 */
  Audio.SE.applause();

  if (!w) {
    // ★勝敗がついていないのに終わった（相手に置ける手が1つも無くなった等）★
    //   `checkEnd` は「相手のマスが0」「ターン上限」しか見ないので、この形は勝敗に翻訳されない。
    //   ★ここで勝敗を作らないこと★（画面はルールを判断しない）。**記録もしない**。
    //   もとは won=false と評価され、1敗と段位低下が記録されていた（2026-09-08のレビューで発覚）
    Audio.SE.tap();
    $('resultTitle').textContent = 'ひきわけ';
    $('resultTitle').style.color = 'var(--text)';
    $('resultSub').textContent = 'おける ところが なくなった';
    $('chainBox').textContent = '';
    $('btnAgain').textContent = 'もういちど';
    $('btnToTitle').textContent = 'やめる';
  } else if (match.vs) {
    // ★二人対戦は「かち・まけ」ではなく、どちらの色が勝ったかで出す★
    Audio.SE.win();
    $('resultTitle').textContent = w === 1 ? 'きんいろの かち！' : 'あおの かち！';
    $('resultTitle').style.color = w === 1 ? 'var(--p1)' : 'var(--p2)';
    $('resultSub').textContent = '';
    const c = Math.max(match.stats.maxChain[1], match.stats.maxChain[2]);
    $('chainBox').textContent = c > 0 ? `いちばん長い れんさ ${c}` : '';
    $('btnAgain').textContent = 'もういちど';
    $('btnToTitle').textContent = 'やめる';
    // ★記録には残さない★
    //   勝率もCPUの段位も「1人で腕試しした結果」なので、2人で遊んだ分を混ぜると意味が壊れる。
  } else if (mode === 'tutorial') {
    // ★練習は「勝ち負け」ではなく「できた」で終わる★
    Audio.SE.win();
    const st = TUTORIALS[tutorialStep];
    const more = tutorialStep + 1 < TUTORIALS.length;
    $('resultTitle').textContent = 'できた！';
    $('resultTitle').style.color = 'var(--p1)';
    $('resultSub').textContent = st.tip;
    $('chainBox').textContent = '';
    $('btnAgain').textContent = more ? 'つぎの れんしゅう ▶' : 'ほんばんを あそぶ';
    $('btnToTitle').textContent = 'あそびかたへ';
    // ★れんしゅうを「1戦あそんだ」ことにしない★
    //   もとは played を1に押し上げていたが、本番を1度も遊んでいない人の「きろく」が
    //   **あそんだ1／かった0／しょうりつ0%** になっていた（2026-09-08のレビューで発覚）。
    //   古い保存の救済（played>0 なら練習済みとみなす）は tutorialDone を明示保存するようになった
    //   時点で不要になっている（progress.js の loadSave を参照）
    save = { ...save, tutorialDone: true };
    writeSave(save);
  } else {
    won ? Audio.SE.win() : Audio.SE.lose();
    $('resultTitle').textContent = won ? 'かち！' : 'まけ';
    $('resultTitle').style.color = won ? 'var(--p1)' : 'var(--p2)';
    let sub = '';
    if (!won) {
      // ★「あと1手で逆転できた」は実際に計算する（煽りの演出にしない）
      const probe = cloneState(match.state);
      probe.winner = 0; probe.endReason = ''; probe.player = me;
      if (findWinningMove(probe, me) >= 0) sub = 'あと1手で ぎゃくてんできた…！';
    }
    $('resultSub').textContent = sub;
    $('btnAgain').textContent = 'もういちど';
    $('btnToTitle').textContent = 'やめる';
    const chain = match.stats.maxChain[me];
    const before = save.bestChain;
    /* ★ふつうの盤(6×7)のときだけ記録する★（2026-09-09 オーナー了承）
         盤を大きくすれば連鎖は当然のびる。混ぜると「じこベスト連鎖」の数字が1戦で壊れ、
         そのあと ふつうの盤では二度と更新できなくなる。
         勝率とCPUの段位も、AIの評価が6×7前提なので混ぜると意味を失う。
       ふたりで あそぶ を記録に残さないのと同じ扱い（§0-10）。 */
    const counts = countsForRecord();
    if (counts) {
      save = recordMatch(save, { won, maxChain: chain, countForTier: true });
      writeSave(save);
    }
    $('chainBox').textContent = chain > 0
      ? `いちばん長い れんさ ${chain}${counts && chain > before ? '（じこベスト！）' : ''}`
      : '';
    if (!counts) $('resultSub').textContent = 'せっていを かえたので きろくに のこりません';
    if (counts && chain > before && chain > 0) Audio.SE.moon();
  }

  // ★決着から結果表示までの0.7秒に画面を移っていたら、結果を割り込ませない★
  //   ★ここで paused を条件に入れないこと★
  //     入れると「演出中にせっていを開いていたら、結果が握りつぶされて二度と出ない」。
  //     show('result') は paused を false に戻し、せっていの板も外すので、そのまま呼んでよい
  //     （2026-09-08のレビューで発覚。通し検証は必ず演出後に開いていたので通っていた）
  const gen = match.id;
  setTimeout(() => {
    if (curScreen === null && match && match.id === gen) show('result');
  }, 700);
}

// ── タイトル ────────────────────────────────
function renderTitle() {
  // ★使っていない素材の名前を出さない★
  //   BGMは自作曲（Suno生成）。魔王魂・Springin' は未導入なので、その表記は出さない
  /* ★使っている素材だけを名乗る★（2026-09-09 歓声・拍手・ボタン音を追加）
       効果音ラボはクレジット表記が任意（不要）だが、
       **どこから来た音かを画面から辿れる状態にしておく**ほうが、
       あとで規約を確認し直すときにも、素材を差し替えるときにも困らない。 */
  $('credits').textContent = '音楽：オリジナル楽曲（Suno生成）／効果音：効果音ラボ';
  $('btnVersion').textContent = VERSION_LABEL;
}

// ── こうしんじょうほう ───────────────────────
/** ★innerHTML を使わない★ 文字列の連結でDOMを作らない（自己XSSの経路を残さない） */
function renderNews() {
  $('newsNow').textContent = `いま つかっているのは ${VERSION_LABEL}`;
  const box = $('newsList');
  box.textContent = '';
  for (const n of NEWS) {
    const sec = document.createElement('div');
    sec.className = 'newsItem';
    const h = document.createElement('h3');
    h.textContent = `${n.v}（${n.d}）`;
    sec.appendChild(h);
    const ul = document.createElement('ul');
    for (const line of n.items) {
      const li = document.createElement('li');
      li.textContent = line;
      ul.appendChild(li);
    }
    sec.appendChild(ul);
    box.appendChild(sec);
  }
}

// ── あそびかた ─────────────────────────────
/**
 * ★ここだけは文章を置いてよい★
 *   「あそぶ」から入った人は一度も読まずに最後まで遊べる。説明は任意の入口の内側にだけ置く。
 * ★図はキャンバスではなく DOM で組む★（BoardView を2つ動かすとタイマーが残る）
 * ★玉の位置は render.js の DOTS をそのまま読む★（盤と図がずれたら説明にならない）
 */
const HOWTO_FIGS = [
  { cells: [{ c: 1, cap: 3, o: 1 }, { arrow: true }, { c: 2, cap: 3, o: 1 }],
    text: 'マスを おすと、ひかりが 1つ ふえる' },
  { cells: [{ c: 3, cap: 3, o: 1, boom: true }],
    text: 'わくが うまると はじけて、となりのマスを じぶんの色に かえる' },
  { cells: [{ c: 0, cap: 2, o: 0, label: 'かど' }, { c: 0, cap: 3, o: 0, label: 'へり' }, { c: 0, cap: 4, o: 0, label: 'まんなか' }],
    text: 'わくの数は ばしょで ちがう。かどは 2つで はじける' },
  { cells: [{ c: 1, cap: 3, o: 2 }, { arrow: true }, { c: 0, cap: 3, o: 0 }],
    text: 'あいての色が ぜんぶ なくなったら かち' },
  // ★数字の説明★ これが分からないと、盤の数字がただの飾りに見える
  { cells: [{ c: 2, cap: 3, o: 1, hint: 4 }],
    text: 'マスの数字は「ここを おしたら はじける回数」' },
  /* ★地形の説明★（2026-09-09 オーナー指摘「置けないマスが何を意味しているか分からない」）
     もとは「もっと くわしく」の折りたたみの中にしか無く、開かなければ読まれなかった。
     ★見た目は盤（Canvas）と合わせる★ ずれると説明にならない。
       盤の描画は render.js drawCell、図のCSSは base.css の .hcell.t-* が担当。
       片方がCanvas・片方がDOMなので、**一致しているかは機械で検査できない**（手で見る）。 */
  { cells: [{ terr: 'star' }],
    text: '十字の マスは ひかりの とおりみち。おけないが ひかりは 通りぬける' },
  { cells: [{ terr: 'crater', c: 2, cap: 5 }],
    text: '大きな丸の マスは わくが 1つ おおい ＝ はじけにくい' },
  { cells: [{ terr: 'cloud' }],
    text: 'もやの かかったマスは しばらく おけない（そのうち 晴れる）' },
];

function figCell({ c = 0, cap = 3, o = 0, boom = false, label = '', hint = 0, terr = '' }) {
  const wrap = document.createElement('div');
  wrap.className = 'hcellWrap';
  const d = document.createElement('div');
  d.className = 'hcell' + (o === 1 ? ' p1' : o === 2 ? ' p2' : '') + (boom ? ' boom' : '')
    + (terr ? ` t-${terr}` : '');
  // 星屑と雲は「光を持たないマス」なので、空きわくの点を描かない
  const slots = (terr === 'star' || terr === 'cloud') ? [] : (DOTS[cap] || DOTS[4]);
  slots.forEach((pos, k) => {
    const dot = document.createElement('i');
    if (k < c) dot.className = 'on';
    dot.style.left = `${50 + pos[0] * 100}%`;
    dot.style.top = `${50 + pos[1] * 100}%`;
    d.appendChild(dot);
  });
  if (hint > 0) {
    const n = document.createElement('span');
    n.className = 'hhint';
    n.textContent = String(hint);
    d.appendChild(n);
  }
  wrap.appendChild(d);
  if (label) {
    const t = document.createElement('span');
    t.className = 'hlabel';
    t.textContent = label;
    wrap.appendChild(t);
  }
  return wrap;
}

function renderHowto() {
  const box = $('howtoFig');
  box.innerHTML = '';
  for (const f of HOWTO_FIGS) {
    const row = document.createElement('div');
    row.className = 'hrow';
    const cells = document.createElement('div');
    cells.className = 'hcells';
    for (const c of f.cells) {
      if (c.arrow) {
        const a = document.createElement('span');
        a.className = 'harrow';
        a.textContent = '→';
        cells.appendChild(a);
      } else cells.appendChild(figCell(c));
    }
    const tx = document.createElement('p');
    tx.className = 'htext';
    tx.textContent = f.text;
    row.appendChild(cells);
    row.appendChild(tx);
    box.appendChild(row);
  }

  const btns = $('howtoBtns');
  btns.innerHTML = '';
  TUTORIALS.forEach((st, k) => {
    const b = document.createElement('button');
    b.className = 'big alt step';
    const num = document.createElement('b');
    num.textContent = String(k + 1);
    b.appendChild(num);
    b.appendChild(document.createTextNode(st.name));
    b.addEventListener('click', () => { Audio.SE.tap(); startTutorial(k); });
    btns.appendChild(b);
  });
  $('btnCoachAgain').textContent = '対戦中の あんないを もういちど 出す';
}

// ── きろく ─────────────────────────────────
function renderRecords() {
  const box = $('statBox');
  box.innerHTML = '';
  const rate = save.played ? Math.round((save.wins / save.played) * 100) : 0;
  const items = [
    ['あそんだ', save.played],
    ['かった', save.wins],
    ['しょうりつ', `${rate}%`],
    ['さいちょう れんさ', save.bestChain],
    ['あいての つよさ', '★'.repeat(save.tier)],
  ];
  for (const [k, v] of items) {
    const d = document.createElement('div');
    const b = document.createElement('b');
    b.textContent = String(v);
    d.appendChild(b);
    d.appendChild(document.createTextNode(k));
    box.appendChild(d);
  }
}

// ── せってい ────────────────────────────────
/**
 * ★同じ設定画面を2通りの開き方で使う★
 *   タイトルから … show('settings')（ふつうの画面遷移）
 *   対戦中から  … openPause()（★show() を通さない★）
 *
 *   show() は「盤から離れたら進行中の対戦を捨てる」ので、そのまま使うと
 *   **設定を開いただけで対戦が消える**。だから対戦中は独立した開閉を使う。
 *
 * ★新しい重ね板を position:fixed で作らない★
 *   .screen は display:none で消えるので、閉じている板は当たり判定を持たない。
 *   独自の重ね板を足すと、透明な板が盤の上に残って操作不能になる（過去に実際にやった）。
 */
function openPause() {
  if (!match || curScreen !== null || paused) return;
  Audio.SE.tap();
  paused = true;
  pressId = null;
  held = -1;
  if (view) { view.setPreview(null); view.setHints(null); }
  renderSettings(true);
  $('scSettings').classList.add('show');
}

function closePause() {
  if (!paused) return;
  paused = false;
  $('scSettings').classList.remove('show');
  // ★演出の途中なら盤を触らない★（sync すると再生中のコマを飛ばしてしまう）
  if (view && match && !view.playing) view.sync(match.state);
  // ★開いているあいだに決着していたら、閉じた時点で結果を出す★
  //   出さないと、決着済みの盤に取り残されて（押しても反応しない）出口が無くなる
  if (match && match.state.winner && finished) { show('result'); return; }
  refreshHints();
  // 待たせていたCPUの手番を再開する
  if (pendingCpu) { pendingCpu = false; setTimeout(cpuTurn, 220); }
}

function renderSettings(inMatch = false) {
  $('optPreview').checked = device.preview;
  $('optCoach').checked = device.coach;
  $('optLight').checked = device.effects === 'light';
  // ★optShake は paintDeviceLine が塗る★（スイッチと説明文の正本を1か所にまとめてある）
  paintVol($('volSe'), $('volSeVal'), device.seVol);
  paintVol($('volBgm'), $('volBgmVal'), device.bgmVol);
  paintBoardSize();
  paintCpuTier();
  renderBgmList();
  $('pauseBtns').hidden = !inMatch;
  $('btnSettingsClose').hidden = inMatch;
  $('btnQuit').textContent = mode === 'tutorial' ? 'あそびかたへ' : 'タイトルへ';
  $('verSettings').textContent = VERSION_LABEL;
  paintDeviceLine();
}

/**
 * スライドバーの見た目を、いまの値に合わせる。
 *   `--fill` は「たまっている側」の塗り分け位置（CSSが読む）。
 *   0 のときは数字でなく「なし」と出す（0という数字より、切れていることが伝わる）
 */
/**
 * 盤の大きさのスライドバー。
 * ★範囲(min/max)はここで入れる★ HTMLに数字を書き写すと、board.js の上限を変えたときに
 *   片方だけ古くなり、「動かせるのに作れない大きさ」が生まれる。
 * ★変えても、いまの対戦には効かせない★ 理由は applyBoardSize() の説明を読むこと。
 */
function initSizeSliders() {
  const w = $('boardW'), h = $('boardH');
  w.min = String(MIN_W); w.max = String(MAX_W);
  h.min = String(MIN_H); h.max = String(MAX_H);
  const tv = $('cpuTier');
  tv.min = '1'; tv.max = String(TIER_MAX);
  $('cpuAuto').addEventListener('change', (e) => {
    device.cpuAuto = e.target.checked;
    if (device.cpuAuto) device.cpuTier = save.tier;   // 自動の値をそのまま引き継ぐ
    writeDevice(device);
    paintCpuTier();
  });
  tv.addEventListener('input', () => {
    device.cpuTier = Number(tv.value);
    writeDevice(device);
    paintCpuTier();
  });
  const onInput = (key, input) => {
    device[key] = Number(input.value);
    writeDevice(device);
    paintBoardSize();
  };
  w.addEventListener('input', () => onInput('boardW', w));
  h.addEventListener('input', () => onInput('boardH', h));
}

/** いまの大きさを、数字と「点の格子」の両方で見せる（数字だけでは形が想像できない） */
function paintBoardSize() {
  const bw = device.boardW, bh = device.boardH;
  $('boardW').value = String(bw);
  $('boardH').value = String(bh);
  $('boardW').style.setProperty('--fill', `${(bw - MIN_W) / (MAX_W - MIN_W) * 100}%`);
  $('boardH').style.setProperty('--fill', `${(bh - MIN_H) / (MAX_H - MIN_H) * 100}%`);
  $('boardVal').textContent = `よこ${bw} × たて${bh}`
    + (bw === DEF_W && bh === DEF_H ? '（ふつう）' : '');
  const box = $('boardPreview');
  box.textContent = '';
  box.style.gridTemplateColumns = `repeat(${bw}, 7px)`;
  for (let k = 0; k < bw * bh; k++) box.appendChild(document.createElement('i'));
}

/**
 * あいての つよさ。★「じどう」のあいだはスライドバーを触れなくする★
 *   触れてしまうと「動かしたのに次の対戦で戻っている」という嘘になる。
 */
function paintCpuTier() {
  const auto = device.cpuAuto;
  const t = auto ? save.tier : device.cpuTier;
  $('cpuAuto').checked = auto;
  const sl = $('cpuTier');
  sl.value = String(t);
  sl.disabled = auto;
  sl.style.setProperty('--fill', `${(t - 1) / (TIER_MAX - 1) * 100}%`);
  $('cpuTierVal').textContent = `★${t} ${TIER_NAMES[t - 1] || ''}` + (auto ? '（じどう）' : '');
}

function paintVol(input, label, v) {
  input.value = String(v);
  input.style.setProperty('--fill', `${v}%`);
  label.textContent = v <= 0 ? 'なし' : String(v);
}

function saveVolumes() {
  device.sound = device.seVol > 0 || device.bgmVol > 0;
  writeDevice(device);
}

/** BGMの選択。★曲の一覧は audio.js が正本★（ここに曲名を書き写さない） */
function renderBgmList() {
  const box = $('bgmList');
  box.innerHTML = '';
  for (const s of Audio.BGM_LIST) {
    const b = document.createElement('button');
    b.className = 'seg' + (s.id === Audio.currentBgm() ? ' on' : '');
    b.textContent = s.name;
    b.addEventListener('click', () => {
      device.bgm = s.id;
      writeDevice(device);
      Audio.setBgmSong(s.id);
      if (device.bgmVol > 0) Audio.bgmPlay();   // 選んだらすぐ聞こえる（試聴）
      renderBgmList();
    });
    box.appendChild(b);
  }
}

boot();

/* 検証用の覗き窓（★読み取り専用★・遊びの挙動は一切変えない）
   tools/smoke_luna_chain.py がここを見て「本物の手順で最後まで遊べるか」を確かめる。
   書き込み用のフックは置かない。 */
globalThis.__luna = {
  get save() { return save; },
  get device() { return device; },
  get match() { return match; },
  get view() { return view; },
  get mode() { return mode; },
  get busy() { return busy; },
  get paused() { return paused; },
  get coachSeen() { return [...coach.seen]; },
  // ★盤の大きさは通し検証から読めるようにする★（canvasの見た目から逆算すると誤診する）
  get board() { return { w: W, h: H, n: N }; },
  get version() { return VERSION_LABEL; },
  // ★音量バーを動かしたときに、何回鳴らそうとしたか★（2026-09-09）
  //   「鳴らす処理を書いた」ではなく回数で検査するため。
  //   ★AudioContext が未解錠のときは数だけ増える★ ので「鳴った」ではなく「鳴らそうとした」
  get sePreviews() { return sePreviewCount; },
  // ★いま演出している手の持ち主★ 歓声の鳴らし分けが逆になっていないかを検査するため
  get popSeat() { return popSeat; },
  // ★連鎖数から倍率を出す正本★ 検査が同じ式を書き写すと、実装を変えても落ちなくなる
  popScale: (n) => popScale(n),
};

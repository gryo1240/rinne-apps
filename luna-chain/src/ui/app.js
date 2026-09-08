/**
 * ルナチェイン｜画面の配線
 *
 * ★2026-09-08 大幅に作り直した（オーナー実測2回目）★
 *   > 遊び方は実際のプレイ画面で説明しながら進めるようにしてほしいな。
 *   > 何が起こっているか分からないから、後半は連打ゲーになっちゃう。
 *   > あと、変なカードとかポイントとかもいらんかな
 *   > シンプルだけど、演出は派手な感じの方がいい
 *
 *   → わざカード・つきのかけら（解放）・月ゲージ・合言葉コード・引き継ぎコードを全部撤去。
 *     komi（後手だけ2回置ける）も廃止（「バグ？」と言われた）。
 *     代わりに **対戦中の案内（coach.js）** と **押す前の連鎖予告（previewChain）** を入れた。
 *
 * ★画面はルールを判断しない★ game.js / core を呼ぶだけ。
 */
import { N, xOf, yOf } from '../core/board.js';
import { countCells, findWinningMove, cloneState, capAt, previewChain } from '../core/rules.js';
import { createMatch, play, cpuMove } from '../game.js';
import {
  loadSave, writeSave, loadDevice, writeDevice, recordMatch, recordDaily,
} from '../meta/progress.js';
import { dailyBoard, makeTsume, recentDates } from '../meta/daily.js';
import { makeRng, ymd } from '../core/rng.js';
import { TUTORIALS } from '../../data/tutorial.js';
import { Coach } from './coach.js';
import { BoardView, DOTS } from './render.js';
import * as Audio from './audio.js';

const $ = (id) => document.getElementById(id);
const el = {
  hud: $('hud'), board: $('board'), stage: $('stage'),
  myCells: $('myCells'), oppCells: $('oppCells'), gaugeFill: $('gaugeFill'),
  oppName: $('oppName'), oppStars: $('oppStars'), handSign: $('handSign'), coach: $('coach'),
};

let save = loadSave();
let device = loadDevice();
let view = null;
let match = null;
let mode = 'normal';          // normal | tutorial | daily | tsume
let busy = false;
let tsumeData = null;
let tutorialStep = 0;
let matchId = 0;              // 対戦の世代。遅れて届くコールバックを捨てるために使う
let held = -1;                // いま指が乗っているマス（-1＝盤の外）
let pressId = null;           // ★押している指の識別子★
                              //   1本目の指だけを追う。持たないと2本目の指で held が壊れ、
                              //   置けなくなる／別の指の場所に置かれる（2026-09-08のレビューで発覚）
let finished = false;
const rng = makeRng((Date.now() ^ 0x9e37) >>> 0);
const coach = new Coach();

// ── 画面の切り替え ───────────────────────────────
const SCREENS = {
  title: 'scTitle', result: 'scResult', daily: 'scDaily',
  records: 'scRecords', settings: 'scSettings', howto: 'scHowto',
};
let curScreen = null;          // いま出ている画面（null＝盤）
function show(name) {
  curScreen = name;
  for (const [k, id] of Object.entries(SCREENS)) $(id).classList.toggle('show', k === name);
  el.hud.hidden = !!name;
  // ★盤から離れたら、置きかけの指と、進行中の対戦を捨てる★
  //   世代番号を進めておかないと、演出の途中でやめたときに残りのコールバックが走り切り、
  //   やめたはずの対戦の勝敗が記録される（2026-09-08のレビューで発覚）
  if (name) {
    held = -1; pressId = null;
    if (view) view.setPreview(null);
    if (match && !match.state.winner) match.id = ++matchId;
    hideHand();
    sayNothing();
  }
  if (name === 'daily') renderDaily();
  if (name === 'records') renderRecords();
  if (name === 'settings') renderSettings();
  if (name === 'howto') renderHowto();
  if (name === 'title') renderTitle();
}

// ── 起動 ────────────────────────────────────
function boot() {
  view = new BoardView(el.board, { fx: device.effects });
  Audio.setEnabled(device.sound);
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
  $('btnBack').addEventListener('click', () => {
    if (confirmQuit()) show(mode === 'tutorial' ? 'howto' : 'title');
  });
  // ★「もういちど」は、いま遊んでいた種類に戻す★
  $('btnAgain').addEventListener('click', () => {
    if (mode === 'tsume') return startTsume();
    if (mode === 'daily') return startDaily(match?.date || ymd());
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
  $('btnDailyBattle').addEventListener('click', () => startDaily(ymd()));
  $('btnTsume').addEventListener('click', () => startTsume());
  $('optSound').addEventListener('change', (e) => {
    device.sound = e.target.checked; writeDevice(device); Audio.setEnabled(device.sound);
  });
  $('optPreview').addEventListener('change', (e) => {
    device.preview = e.target.checked; writeDevice(device);
  });
  $('optCoach').addEventListener('change', (e) => {
    device.coach = e.target.checked; writeDevice(device); if (!device.coach) sayNothing();
  });
  $('optLight').addEventListener('change', (e) => {
    device.effects = e.target.checked ? 'light' : 'normal';
    writeDevice(device); view.setEffects(device.effects);
  });
  // 前回までに出した案内は覚えておく（毎回おなじ説明が出るとうるさい）
  if (Array.isArray(device.coachSeen)) for (const id of device.coachSeen) coach.seen.add(id);
  show('title');
  view.resize();
  // ★起動しきったことを知らせる旗★（救済画面はこの旗だけを見る）
  globalThis.__lunaReady = true;
}

// ★練習と詰めルナでは聞かない★（失う記録が無いのに引き止めると、入口が重くなるだけ）
const confirmQuit = () => (match && !match.state.winner && mode !== 'tutorial' && mode !== 'tsume')
  ? confirm('とちゅうでやめますか？') : true;

/** 練習を飛ばして本番へ */
function skipToReal() {
  if (!save.tutorialDone) { save = { ...save, tutorialDone: true }; writeSave(save); }
  startNormal();
}

// ── 対戦の開始 ──────────────────────────────
function startNormal() {
  if (!save.tutorialDone) return startTutorial(0);
  const board = dailyBoard('rnd-' + ((Math.random() * 1e9) | 0));
  mode = 'normal';
  beginMatch({ terrain: board.terrain, wrapX: board.wrapX, tier: save.tier, oppName: 'ルナ' });
}

function startDaily(date) {
  const b = dailyBoard(date);
  mode = 'daily';
  beginMatch({ terrain: b.terrain, wrapX: b.wrapX, tier: b.tier, oppName: 'きょうの月', date });
}

/**
 * れんしゅう（あそびかた）。★盤の中身は data/tutorial.js が持つ★
 *   ★盤が「必ず勝てる」ことは test/test-tutorial.mjs が実際に叩いて確かめている★
 */
function startTutorial(step = 0) {
  tutorialStep = Math.max(0, Math.min(TUTORIALS.length - 1, step | 0));
  const st = TUTORIALS[tutorialStep];
  mode = 'tutorial';
  beginMatch({ terrain: new Int8Array(N), wrapX: false, tier: 1, oppName: st.name, mySeat: 1 });
  const s = match.state;
  st.setup(s);
  s.moves = [1, 1];            // 開幕判定を抜ける（相手は動かないため）
  s.player = 1;
  view.sync(s);
  aimHand(st.hand);
  updateHud();
}

function startTsume() {
  const date = ymd();
  const p = makeTsume(date);
  if (!p) { alert('きょうの詰めルナは おやすみです'); return; }
  tsumeData = p;
  mode = 'tsume';
  beginMatch({ terrain: p.state.terrain, wrapX: p.state.wrapX, tier: 1, oppName: '詰めルナ', mySeat: 1, date });
  match.state = cloneState(p.state);
  view.sync(match.state);
  updateHud();
}

function beginMatch({ terrain, wrapX, tier, oppName, date = null, mySeat = null }) {
  // ★先手・後手は1戦ごとにランダム★
  //   komi（後手だけ2回置ける補正）は廃止したので、残る先手有利はここで均す。
  //   ★席は createMatch に渡す★（あとから match.mySeat を書き換えない）
  const seat = mySeat || (Math.random() < 0.5 ? 1 : 2);
  match = createMatch({ terrain, wrapX, tier, oppName, mySeat: seat });
  match.date = date;
  match.id = ++matchId;        // 遅れて届くコールバックを捨てるための世代番号
  finished = false;
  held = -1;
  // ★自分の色は席によらず金色★（呼び忘れると、後手の対戦だけ自分が青になり読めなくなる）
  view.setSeat(seat);
  show(null);
  view.sync(match.state);
  view.legal = null;
  view.setPreview(null);
  view.lastMove = -1;
  view.resize();
  updateHud();
  hideHand();
  sayNothing();
  busy = false;
  // ★自分の手番のときだけ「押してみて」と言う★
  //   相手が先手の対戦で出すと、押せないのに押せと言われ、しかも出したことになって二度と出ない
  if (coachOn() && match.state.player === match.mySeat) say(coach.feed({ phase: 'start' }));
  if (match.state.player !== match.mySeat) setTimeout(cpuTurn, 350);
}

// ── 入力（指を置く → 予告 → 離して確定）────────────────
const myTurn = () => !!match && !busy && !match.state.winner && match.state.player === match.mySeat;

function onDown(e) {
  if (pressId !== null) return;               // すでに別の指が乗っている（2本目は無視する）
  if (e.button !== undefined && e.button !== 0) return;   // 右クリック・中クリックでは置かない
  if (!myTurn()) return;
  const i = view.hit(e.clientX, e.clientY);
  if (i < 0) return;
  e.preventDefault();
  pressId = e.pointerId ?? 0;
  held = i;
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
  showPreview(i);
}

function onUp(e) {
  if (pressId === null || (e.pointerId ?? 0) !== pressId) return;
  const target = held;
  pressId = null;
  held = -1;
  view.setPreview(null);
  // ★盤の外で はなしたら 置かない★（やめられる＝安心して予告を見られる）
  if (target < 0 || curScreen !== null || !myTurn()) return;
  commitMove(target);
}

function onCancel(e) {
  if (pressId !== null && (e?.pointerId ?? pressId) !== pressId) return;
  pressId = null;
  held = -1;
  view.setPreview(null);
}

/** 押す前に「どこがはじけるか」を光らせる。★連鎖の計算は rules.js が持つ★ */
function showPreview(i) {
  if (i < 0 || !device.preview || !myTurn()) { view.setPreview(null); return; }
  const r = previewChain(match.state, i, match.mySeat);
  view.setPreview(r.ok ? r.cells : null);
}

function commitMove(i) {
  const r = play(match, i);
  if (!r.ok) return;
  hideHand();
  view.legal = null;           // 練習の「ここを押して」の枠を消す
  Audio.SE.place();
  afterMove(r, () => {
    // ★詰めルナで外しても罰を与えない★ 元の局面に戻して何度でも挑戦できるようにする
    if (mode === 'tsume' && !match.state.winner) {
      match.state = cloneState(tsumeData.state);
      view.sync(match.state);
      view.lastMove = -1;
      updateHud();
      return;
    }
    if (mode === 'tutorial' && !match.state.winner) {
      // 練習では相手が動かないので、手番を自分に戻してやらないと2回目が押せなくなる
      match.state.player = 1;
      updateHud();
      aimHand(TUTORIALS[tutorialStep].hand);
      return;
    }
    if (coachOn()) say(coach.feed({ phase: 'myMove', chain: r.chain, hasReady: hasReady() }));
    if (!match.state.winner && match.state.player !== match.mySeat) setTimeout(cpuTurn, 260);
  });
}

/** 1手ぶんの演出を流し、終わったら次へ */
function afterMove(r, next) {
  busy = true;
  const gen = match.id;
  view.setPreview(null);
  view.lastMove = r.events.find((e) => e.t === 'place')?.i ?? view.lastMove;
  for (const ev of r.events) if (ev.t === 'boom') Audio.SE.boom(ev.chain);
  // ★大きい連鎖はド派手に★（月ゲージは廃止したので、連鎖そのものを見せ場にする）
  if (r.chain >= 5) { view.bigFlash(); Audio.SE.moon(); }
  view.animate(r.events, () => {
    if (!match || match.id !== gen) return;   // 別の対戦が始まっていたら何もしない
    view.sync(match.state);
    updateHud();
    busy = false;
    if (match.state.winner) return finish();
    if (next) next();
  });
}

function cpuTurn() {
  if (!match || match.state.winner) return;
  if (mode === 'tutorial' || mode === 'tsume') return;   // 練習・詰めルナでは相手は動かない
  const seat = 3 - match.mySeat;
  if (match.state.player !== seat) return;
  busy = true;
  const gen = match.id;
  const before = Int8Array.from(match.state.owner);
  setTimeout(() => {
    if (!match || match.id !== gen) return;
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
      if (!match.state.winner && match.state.player === match.mySeat && coachOn()) {
        setTimeout(() => {
          if (match && match.id === gen) say(coach.feed({ phase: 'myTurn', hasReady: hasReady() }));
        }, 700);
      }
      if (!match.state.winner && match.state.player !== match.mySeat) setTimeout(cpuTurn, 220);
    });
  }, 120);
}

// ── 対戦中の案内 ───────────────────────────
const coachOn = () => device.coach && (mode === 'normal' || mode === 'daily') && !coach.done;

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

/** 「あと1つではじける自分のマス」があるか（案内の出し分けに使う） */
function hasReady() {
  if (!match) return false;
  const me = match.mySeat;
  for (let i = 0; i < N; i++) {
    if (match.state.owner[i] === me && match.state.count[i] === capAt(match.state, i) - 1) return true;
  }
  return false;
}

// ── 画面表示 ────────────────────────────────
function updateHud() {
  if (!match) return;
  const me = match.mySeat, opp = 3 - me;
  const a = countCells(match.state, me), b = countCells(match.state, opp);
  el.myCells.textContent = a;
  el.oppCells.textContent = b;
  // ★月ゲージのあとがま: いま盤のどれだけを取っているか★（カード用のゲージは廃止した）
  el.gaugeFill.style.width = (a + b > 0 ? Math.round((a / (a + b)) * 100) : 50) + '%';
  el.oppName.textContent = match.oppName;
  el.oppStars.textContent = '★'.repeat(match.tier) + '☆'.repeat(Math.max(0, 6 - match.tier));
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
  view.setPreview(null);
  const won = match.state.winner === match.mySeat;
  const me = match.mySeat;
  view.bigFlash();
  won ? Audio.SE.win() : Audio.SE.lose();

  $('resultTitle').textContent = won ? 'かち！' : 'まけ';
  $('resultTitle').style.color = won ? 'var(--p1)' : 'var(--p2)';

  let sub = '';
  if (mode === 'tsume') sub = won ? 'せいかい！' : '';
  else if (!won) {
    // ★「あと1手で逆転できた」は実際に計算する（煽りの演出にしない）
    const probe = cloneState(match.state);
    probe.winner = 0; probe.endReason = ''; probe.player = me;
    if (findWinningMove(probe, me) >= 0) sub = 'あと1手で ぎゃくてんできた…！';
  }
  $('resultSub').textContent = sub;

  if (mode === 'tutorial') {
    // ★練習は「勝ち負け」ではなく「できた」で終わる★
    const st = TUTORIALS[tutorialStep];
    const more = tutorialStep + 1 < TUTORIALS.length;
    $('resultTitle').textContent = 'できた！';
    $('resultTitle').style.color = 'var(--p1)';
    $('resultSub').textContent = st.tip;
    $('chainBox').textContent = '';
    $('btnAgain').textContent = more ? 'つぎの れんしゅう ▶' : 'ほんばんを あそぶ';
    $('btnToTitle').textContent = 'あそびかたへ';
    save = { ...save, tutorialDone: true, played: Math.max(1, save.played) };
    writeSave(save);
  } else {
    $('btnAgain').textContent = 'もういちど';
    $('btnToTitle').textContent = 'やめる';
    const chain = match.stats.maxChain[me];
    const before = save.bestChain;
    // ★詰めルナは「対戦」ではないので戦績に数えない★（自滅すると1敗が付いていた）
    if (mode !== 'tsume') {
      save = recordMatch(save, { won, maxChain: chain, countForTier: mode === 'normal' });
    }
    // ★勝ったときだけ記録する★（負けた手数が自己ベストとして残ると記録が意味を失う）
    if (mode === 'daily' && won && match.date) save = recordDaily(save, match.date, match.stats.placed[me]);
    if (mode === 'tsume' && won && match.date) save = recordDaily(save, match.date, match.stats.placed[me], 'tsume');
    writeSave(save);
    $('chainBox').textContent = chain > 0
      ? `いちばん長い れんさ ${chain}${chain > before ? '（じこベスト！）' : ''}`
      : '';
    if (chain > before && chain > 0) Audio.SE.moon();
  }

  // ★決着から結果表示までの0.7秒に画面を移っていたら、結果を割り込ませない★
  const gen = match.id;
  setTimeout(() => {
    if (curScreen === null && match && match.id === gen) show('result');
  }, 700);
}

// ── タイトル ────────────────────────────────
function renderTitle() {
  // ★実素材を入れるまでクレジットは出さない（無いものを名乗らない）
  $('credits').innerHTML = Audio.hasRealAssets()
    ? '音楽：<a href="https://maou.audio/" target="_blank" rel="noopener noreferrer">魔王魂</a>'
      + '／効果音：<a href="https://www.springin.org/sound-stock/" target="_blank" rel="noopener noreferrer">Springin Sound Stock</a>'
    : '';
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
];

function figCell({ c = 0, cap = 3, o = 0, boom = false, label = '' }) {
  const wrap = document.createElement('div');
  wrap.className = 'hcellWrap';
  const d = document.createElement('div');
  d.className = 'hcell' + (o === 1 ? ' p1' : o === 2 ? ' p2' : '') + (boom ? ' boom' : '');
  const slots = DOTS[cap] || DOTS[4];
  slots.forEach((pos, k) => {
    const dot = document.createElement('i');
    if (k < c) dot.className = 'on';
    dot.style.left = `${50 + pos[0] * 100}%`;
    dot.style.top = `${50 + pos[1] * 100}%`;
    d.appendChild(dot);
  });
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

// ── デイリー ───────────────────────────────
function renderDaily() {
  $('dailyDate').textContent = ymd();
  const list = $('dailyList');
  list.innerHTML = '';
  for (const d of recentDates(7)) {
    const rec = save.daily[d] || {};
    const b = document.createElement('button');
    b.className = rec.best !== undefined || rec.tsume ? 'done' : '';
    // ★保存の中身を innerHTML に流し込まない★
    //   rinne-apps は1オリジンに全アプリが同居していて localStorage を共有するので、
    //   壊れた保存が自分自身への攻撃経路になりうる（2026-09-08のレビューで発覚）
    b.appendChild(document.createTextNode(d.slice(5)));
    if (rec.best !== undefined) {
      b.appendChild(document.createElement('br'));
      b.appendChild(document.createTextNode(`${rec.best}手`));
    }
    if (rec.tsume) b.appendChild(document.createTextNode(' ✓'));
    b.addEventListener('click', () => startDaily(d));
    list.appendChild(b);
  }
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
function renderSettings() {
  $('optSound').checked = device.sound;
  $('optPreview').checked = device.preview;
  $('optCoach').checked = device.coach;
  $('optLight').checked = device.effects === 'light';
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
  get tsumeSolution() { return tsumeData ? tsumeData.solution : -1; },
  get busy() { return busy; },
  get coachSeen() { return [...coach.seen]; },
};

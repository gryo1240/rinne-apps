/**
 * ルナチェイン｜画面の配線
 *
 * ★画面はルールを判断しない★ game.js / core を呼ぶだけ。
 * ★文章を読ませない★ 最初の1戦は「3回タップすれば必ず勝てる」固定盤で、説明文は置かない。
 * ★解放されていない枠は見せない★（揃っていない不快感だけが残るため）
 */
import { N, W, H, idx, xOf, yOf } from '../core/board.js';
import { countCells, legalMoves, findWinningMove, cloneState } from '../core/rules.js';
import { createMatch, play, useCard, canUseCard, cardTargets, cpuMove, cpuCard, GAUGE_FULL } from '../game.js';
import { CARDS, CARD_BY_ID } from '../../data/cards.js';
import { unlockedAt, nextUnlock } from '../../data/unlock.js';
import {
  loadSave, writeSave, loadDevice, writeDevice, recordMatch, currentUnlocks,
  sanitizeDeck, recordDaily, defaultSave,
} from '../meta/progress.js';
import { dailyBoard, makeTsume, recentDates } from '../meta/daily.js';
import { encodeDeck, encodeSave, decode, pretty, NICK_CHARS } from '../meta/code.js';
import { makeRng, seedFromString, ymd } from '../core/rng.js';
import { TUTORIALS } from '../../data/tutorial.js';
import { BoardView, DOTS } from './render.js';
import * as Audio from './audio.js';

const $ = (id) => document.getElementById(id);
const el = {
  hud: $('hud'), cardbar: $('cardbar'), board: $('board'), stage: $('stage'), boardBox: $('boardBox'),
  myCells: $('myCells'), oppCells: $('oppCells'), gaugeFill: $('gaugeFill'), gaugeMoon: $('gaugeMoon'),
  oppName: $('oppName'), oppStars: $('oppStars'), handSign: $('handSign'),
  pickBar: $('pickBar'), pickText: $('pickText'),
};

let save = loadSave();
let device = loadDevice();
let view = null;
let match = null;
let mode = 'normal';          // normal | tutorial | daily | tsume | ghost
let busy = false;
let pick = null;              // { cardId, need, cells:[] }
let tsumeData = null;
let tutorialStep = 0;         // れんしゅうの何段目か
let matchId = 0;              // 対戦の世代。遅れて届くコールバックを捨てるために使う
let rng = makeRng((Date.now() ^ 0x9e37) >>> 0);

// ── 画面の切り替え ───────────────────────────────
const SCREENS = {
  title: 'scTitle', result: 'scResult', deck: 'scDeck', daily: 'scDaily',
  records: 'scRecords', settings: 'scSettings', howto: 'scHowto',
};
let curScreen = null;          // いま出ている画面（null＝盤）
function show(name) {
  curScreen = name;
  for (const [k, id] of Object.entries(SCREENS)) $(id).classList.toggle('show', k === name);
  const inGame = !name;
  el.hud.hidden = !inGame;
  el.cardbar.hidden = !inGame;
  if (name === 'deck') renderDeck();
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
  el.board.addEventListener('click', onBoardClick);
  window.addEventListener('resize', () => view.resize());
  document.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => { Audio.SE.tap(); show(b.dataset.go); }));
  $('btnPlay').addEventListener('click', () => startNormal());
  $('btnBack').addEventListener('click', () => {
    if (confirmQuit()) show(mode === 'tutorial' ? 'howto' : 'title');
  });
  // ★「もういちど」は、いま遊んでいた種類に戻す★
  //   以前はどの種類でも本番対戦が始まっていた（練習のあとに押すといきなり本番、
  //   デイリーのあとに押すと別の盤）。
  $('btnAgain').addEventListener('click', () => {
    if (mode === 'tsume') return startTsume();
    if (mode === 'daily') return startDaily(match?.date || ymd());
    if (mode === 'ghost' && lastGhost) return startGhost(lastGhost.cards, lastGhost.name);
    if (mode === 'tutorial') {
      return tutorialStep + 1 < TUTORIALS.length ? startTutorial(tutorialStep + 1) : skipToReal();
    }
    return startNormal();
  });
  $('btnToTitle').addEventListener('click', () => show(mode === 'tutorial' ? 'howto' : 'title'));
  // ★ラベルどおりに動かす★
  //   ただ startNormal を呼ぶと、はじめての人は練習1段目に入ってしまい
  //   「そのまま あそぶ」というラベルと挙動が食い違う
  $('btnHowtoPlay').addEventListener('click', () => skipToReal());
  $('btnDailyBattle').addEventListener('click', () => startDaily(ymd()));
  $('btnTsume').addEventListener('click', () => startTsume());
  $('btnPickCancel').addEventListener('click', cancelPick);
  $('btnCopy').addEventListener('click', () => copy($('myCode').textContent, $('codeMsg')));
  $('btnCopySave').addEventListener('click', () => copy($('saveCode').textContent, $('saveMsg')));
  $('btnCodeGo').addEventListener('click', onFriendCode);
  $('btnSaveGo').addEventListener('click', onRestoreCode);
  $('nickInput').addEventListener('input', onNickname);
  $('optSound').addEventListener('change', (e) => { device.sound = e.target.checked; writeDevice(device); Audio.setEnabled(device.sound); });
  $('optLight').addEventListener('change', (e) => {
    device.effects = e.target.checked ? 'light' : 'normal';
    writeDevice(device); view.setEffects(device.effects);
  });
  show('title');
  view.resize();
  // ★起動しきったことを知らせる旗★
  //   救済画面はこの旗だけを見る。「タイトルが表示されているか」で判定すると、
  //   3秒以内に「あそぶ」を押した人に救済画面が誤爆して操作不能になる（2026-09-08に実際に起きた）
  globalThis.__lunaReady = true;
}

// ★練習と詰めルナでは聞かない★（失う記録が無いのに引き止めると、入口が重くなるだけ）
/** 練習を飛ばして本番へ（あそびかたを見た人・練習を終えた人が使う） */
function skipToReal() {
  if (!save.tutorialDone) { save = { ...save, tutorialDone: true }; writeSave(save); }
  startNormal();
}

const confirmQuit = () => (match && !match.state.winner && mode !== 'tutorial' && mode !== 'tsume')
  ? confirm('とちゅうでやめますか？') : true;

// ── 対戦の開始 ──────────────────────────────
function startNormal() {
  // ★played ではなく専用の旗で判定する★
  //   played で判定すると、引き継ぎコードで復帰した人（played=0のまま）が練習に飛ばされる。
  //   旗は onRestoreCode でも立てること（旗だけ足して復元側を直さないと、この穴は残る）
  if (!save.tutorialDone) return startTutorial(0);
  const b = { terrain: undefined, wrapX: false };
  const seed = (Math.random() * 1e9) | 0;
  const board = dailyBoard('rnd-' + seed);
  mode = 'normal';
  beginMatch({ terrain: board.terrain, wrapX: board.wrapX, tier: save.tier, oppName: 'ルナ' });
}

function startDaily(date) {
  const b = dailyBoard(date);
  mode = 'daily';
  beginMatch({ terrain: b.terrain, wrapX: b.wrapX, tier: b.tier, oppName: 'きょうの月', date });
}

let lastGhost = null;          // 「もういちど」で同じ相手に戻れるように覚えておく
function startGhost(cards, name) {
  lastGhost = { cards: cards.slice(), name };
  const board = dailyBoard('ghost-' + Math.random());
  mode = 'ghost';
  beginMatch({ terrain: board.terrain, wrapX: board.wrapX, tier: save.tier, oppName: name || 'かげ', oppDeck: cards.filter(Boolean) });
}

/**
 * れんしゅう（あそびかた）。★盤の中身は data/tutorial.js が持つ★
 *   説明文は出さず、指マークの場所を叩かせて体で覚えてもらう。
 *   段ごとに教えるのは1つだけ（かどの容量／まんなかの容量／れんさ）。
 *   ★盤が「必ず勝てる」ことは test/test-tutorial.mjs が実際に叩いて確かめている★
 */
function startTutorial(step = 0) {
  tutorialStep = Math.max(0, Math.min(TUTORIALS.length - 1, step | 0));
  const st = TUTORIALS[tutorialStep];
  mode = 'tutorial';
  // ★チュートリアルは必ず自分が先手席★（席がランダムだと自分のマスを押せない練習になる）
  beginMatch({ terrain: new Int8Array(N), wrapX: false, tier: 1, oppName: st.name, mySeat: 1 });
  const s = match.state;
  st.setup(s);
  s.moves = [1, 1];            // 開幕判定を抜ける（相手は動かないため）
  s.player = 1; s.left = 1;
  view.sync(s);
  aimHand(st.hand);
  updateHud();
  // ★練習ではカードは絶対に使えない★（月ゲージが満ちないので canUseCard が必ず偽）
  //   押しても反応しないものを出しておくと「壊れている」と読まれる
  el.cardbar.hidden = true;
}

/**
 * 押してほしいマスを示す。★指マークだけに頼らない★
 *   指マークのアニメは prefers-reduced-motion で止まるので、
 *   その設定の人には何も伝わらない。金色の輪（view.legal）も一緒に出す。
 *   view.legal は描画にしか使われず、入力の分岐は pick の有無で決まるので副作用は無い。
 */
function aimHand(i) {
  showHand(i);
  view.legal = [i];
  view.draw();
}

function beginMatch({ terrain, wrapX, tier, oppName, oppDeck = [], date = null, mySeat = null }) {
  const deck = sanitizeDeck(save, save.deck);
  // ★先手・後手はランダム★
  //   実測では komi=1 でも先手勝率が中位AIで44.7%（5.3pt残る）。komiでは均しきれないと分かったので、
  //   1戦ごとの席をランダムにして、残った差を運に均す（友達との比較は先後を入れ替えた2局で行う）。
  //   ★席は createMatch に渡す★——あとから match.mySeat を書き換えると、
  //     デッキが席に配られたあとなので自分のカードがCPUの手に渡る（2026-09-08のレビューで発覚）
  const seat = mySeat || (Math.random() < 0.5 ? 1 : 2);
  match = createMatch({ terrain, wrapX, komi: 1, tier, myDeck: deck, oppDeck, oppName, mySeat: seat });
  match.date = date;
  // ★対戦ごとに世代番号を振る★
  //   前の対戦のために予約された setTimeout や演出の完了コールバックが
  //   あとから届いても、世代が違えば降りる。画面を増やすほどここが効く
  match.id = ++matchId;
  finished = false;
  show(null);
  view.sync(match.state);
  view.legal = null;
  view.lastMove = -1;
  view.resize();
  updateHud();
  renderCardBar();
  hideHand();
  busy = false;
  if (match.state.player !== match.mySeat) setTimeout(cpuTurn, 350);
}

// ── 入力 ────────────────────────────────────
function onBoardClick(e) {
  if (!match || busy || match.state.winner) return;
  const i = view.hit(e.clientX, e.clientY);
  if (i < 0) return;

  if (pick) return onPickCell(i);
  if (match.state.player !== match.mySeat) return;

  const r = play(match, i);
  if (!r.ok) return;
  hideHand();
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
      match.state.left = 1;
      updateHud();
      aimHand(TUTORIALS[tutorialStep].hand);
      return;
    }
    if (!match.state.winner && match.state.player !== match.mySeat) setTimeout(cpuTurn, 260);
  });
}

/** 1手ぶんの演出を流し、終わったら次へ */
function afterMove(r, next) {
  busy = true;
  const gen = match.id;
  view.lastMove = r.events.find((e) => e.t === 'place')?.i ?? view.lastMove;
  for (const ev of r.events) if (ev.t === 'boom') Audio.SE.boom(ev.chain);
  if (r.gaugeFull) { view.bigFlash(); Audio.SE.moon(); }
  view.animate(r.events, () => {
    // ★別の対戦が始まっていたら何もしない★（演出の途中で画面を移った場合）
    if (!match || match.id !== gen) return;
    view.sync(match.state);
    updateHud();
    renderCardBar();
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
  setTimeout(() => {
    // ★遅れて届いたものは「何もしない」★
    //   ここで busy を落とすと、すでに始まっている新しい対戦の入力ロックまで外れる
    //   （演出の途中で盤が押せてしまい、手番が止まる）。afterMove 側と同じく触らない
    if (!match || match.id !== gen) return;
    const c = cpuCard(match);
    if (c) {
      const rc = useCard(match, c.cardId, c.cells);
      if (rc.ok) {
        Audio.SE.card();
        for (const ev of rc.events) if (ev.t === 'boom') Audio.SE.boom(ev.chain);
        // ★カードは盤を直接いじるので、イベントの再生ではなく現状の取り込みで見せる★
        //   （applyEvent はカードの盤面変更を知らないので、再生すると表示が一時的に狂う）
        view.sync(match.state);
        updateHud();
        busy = false;
        if (match.state.winner) return finish();
        return setTimeout(cpuTurn, 220);
      }
    }
    const i = cpuMove(match, rng);
    busy = false;
    if (i < 0) return finish();
    const r = play(match, i);
    if (!r.ok) return finish();
    Audio.SE.place();
    afterMove(r, () => {
      if (!match.state.winner && match.state.player !== match.mySeat) setTimeout(cpuTurn, 220);
    });
  }, 120);
}

// ── カード ──────────────────────────────────
function renderCardBar() {
  if (!match) return;
  const deck = match.decks[match.mySeat] || [];
  el.cardbar.innerHTML = '';
  // ★解放されていない枠は出さない★
  if (!deck.length) { el.cardbar.hidden = true; return; }
  el.cardbar.hidden = false;
  for (const id of deck) {
    const card = CARD_BY_ID[id];
    if (!card) continue;
    const b = document.createElement('button');
    b.className = 'card' + (canUseCard(match, id, match.mySeat) ? ' ready' : '') + (pick?.cardId === id ? ' on' : '');
    b.disabled = !canUseCard(match, id, match.mySeat);
    b.innerHTML = `<span class="ic">${card.icon}</span><span class="nm">${card.name}</span>`;
    b.addEventListener('click', () => beginPick(id));
    el.cardbar.appendChild(b);
  }
}

function beginPick(cardId) {
  if (busy || !canUseCard(match, cardId, match.mySeat)) return;
  const card = CARD_BY_ID[cardId];
  Audio.SE.tap();
  if (card.picks === 0) return firePick(cardId, []);
  pick = { cardId, need: card.picks, cells: [] };
  view.legal = cardTargets(match, cardId, match.mySeat, []);
  el.pickBar.hidden = false;
  el.pickText.textContent = `${card.name}：${card.picks}つ えらぶ`;
  view.draw();
  renderCardBar();
}

function onPickCell(i) {
  if (!view.legal.includes(i)) return;
  pick.cells.push(i);
  Audio.SE.tap();
  if (pick.cells.length >= pick.need) return firePick(pick.cardId, pick.cells);
  // 「となりへ移す」のように、次に選べる場所が前の選択で変わるカードがある
  view.legal = cardTargets(match, pick.cardId, match.mySeat, pick.cells);
  el.pickText.textContent = `${CARD_BY_ID[pick.cardId].name}：あと ${pick.need - pick.cells.length}つ`;
  view.draw();
}

function firePick(cardId, cells) {
  const r = useCard(match, cardId, cells);
  cancelPick();
  if (!r.ok) return;
  Audio.SE.card();
  for (const ev of r.events) if (ev.t === 'boom') Audio.SE.boom(ev.chain);
  // カードは盤を直接いじるので、演出の再生ではなく現状の取り込みで見せる
  view.sync(match.state);
  updateHud();
  renderCardBar();
  busy = false;
  if (match.state.winner) return finish();
  // ★まきもどしで手番が相手に戻ることがある★——ここでCPUを動かさないと盤が固まる
  if (match.state.player !== match.mySeat) setTimeout(cpuTurn, 240);
}

function cancelPick() {
  pick = null;
  view.legal = null;
  el.pickBar.hidden = true;
  view.draw();
  renderCardBar();
}

// ── 画面表示 ────────────────────────────────
function updateHud() {
  if (!match) return;
  const me = match.mySeat, opp = 3 - me;
  el.myCells.textContent = countCells(match.state, me);
  el.oppCells.textContent = countCells(match.state, opp);
  const g = match.gauge[me] / GAUGE_FULL;
  el.gaugeFill.style.width = Math.round(g * 100) + '%';
  el.gaugeMoon.textContent = g >= 1 ? '🌕' : g >= 0.6 ? '🌗' : g > 0 ? '🌘' : '🌑';
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

// ── 決着 ────────────────────────────────────
let finished = false;

function finish() {
  // ★二重に走らせない★
  //   カードで決着したとき、firePick からの直接呼び出しと演出の完了コールバックの
  //   両方から呼ばれ、かけらと戦績が2回加算されていた（2026-09-08のレビューで発覚）
  if (finished) return;
  finished = true;
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
    probe.winner = 0; probe.endReason = ''; probe.player = me; probe.left = 1;
    const m = findWinningMove(probe, me);
    if (m >= 0) sub = 'あと1手で ぎゃくてんできた…！';
  }
  $('resultSub').textContent = sub;

  if (mode === 'tutorial') {
    // ★練習は「勝ち負け」ではなく「できた」で終わる★（点数も、かけらも出さない）
    const st = TUTORIALS[tutorialStep];
    const more = tutorialStep + 1 < TUTORIALS.length;
    $('resultTitle').textContent = 'できた！';
    $('resultTitle').style.color = 'var(--p1)';
    // ★たね明かしは、遊び終えたこの一瞬だけ出す★（先に読ませると入口が重くなる）
    $('resultSub').textContent = st.tip;
    $('shardBox').textContent = '';
    $('unlockBox').hidden = true;
    $('btnAgain').textContent = more ? 'つぎの れんしゅう ▶' : 'ほんばんを あそぶ';
    $('btnToTitle').textContent = 'あそびかたへ';
    save = { ...save, tutorialDone: true, played: Math.max(1, save.played) };
    writeSave(save);
  } else {
    $('btnAgain').textContent = 'もういちど';
    $('btnToTitle').textContent = 'やめる';
    const before = save.shards;
    // ★段位の自動調整に使うのは「ふつうの対戦」だけ★
    //   デイリーは固定強度、詰めルナは1手詰め、かげ戦は相手の編成が違う。
    //   これらの勝敗を混ぜると、CPUの強さ合わせ（テスターがいない本作の生命線）が狂う
    const res = recordMatch(save, {
      won, placed: match.stats.placed[me], captured: match.stats.captured[me], deck: match.decks[me],
      countForTier: mode === 'normal',
    });
    save = res.save;
    // ★勝ったときだけ記録する★（負けた手数が自己ベストとして残ると記録が意味を失う）
    if (mode === 'daily' && won && match.date) save = recordDaily(save, match.date, match.stats.placed[me]);
    if (mode === 'tsume' && won && match.date) save = recordDaily(save, match.date, match.stats.placed[me], 'tsume');
    writeSave(save);
    $('shardBox').textContent = `つきのかけら +${res.gained}（ぜんぶで ${save.shards}）`;
    const gained = unlockedAt(save.shards), had = unlockedAt(before);
    const fresh = gained.cards.filter((c) => !had.cards.includes(c));
    const slotUp = gained.slots > had.slots;
    if (fresh.length || slotUp) {
      const names = fresh.map((c) => CARD_BY_ID[c]?.name).filter(Boolean);
      $('unlockBox').hidden = false;
      $('unlockBox').innerHTML = `✨ あたらしく ひらいた<br><b>${[slotUp ? `カードが ${gained.slots}まい もちこめる` : '', ...names].filter(Boolean).join('・')}</b>`;
      Audio.SE.unlockFx();
      if (!save.deck.length && fresh.length) { save = { ...save, deck: [fresh[0]] }; writeSave(save); }
    } else $('unlockBox').hidden = true;
  }
  // ★決着から結果表示までの0.7秒に画面を移っていたら、結果を割り込ませない★
  const gen = match.id;
  setTimeout(() => {
    if (curScreen === null && match && match.id === gen) show('result');
  }, 700);
}

// ── タイトル ────────────────────────────────
function renderTitle() {
  const c = $('credits');
  // ★実素材を入れるまでクレジットは出さない（無いものを名乗らない）
  c.innerHTML = Audio.hasRealAssets()
    ? '音楽：<a href="https://maou.audio/" target="_blank" rel="noopener noreferrer">魔王魂</a>／効果音：<a href="https://www.springin.org/sound-stock/" target="_blank" rel="noopener noreferrer">Springin\' Sound Stock</a>'
    : '';
}

// ── あそびかた ─────────────────────────────
/**
 * ★ここだけは文章を置いてよい★
 *   守っている原則は「読まないと始められない状態を作らない」こと。
 *   「あそぶ」から入った人は一度も読まずに最後まで遊べる。説明はこの任意の入口の内側にだけ置く。
 *   （2026-09-08、オーナー実測で「ルールが分からない」と判明。§0-7）
 *
 * ★図はキャンバスではなく DOM で組む★
 *   BoardView をもう1つ動かすと、画面を離れたあともアニメのタイマーが回り続ける、
 *   親の高さが0でセルが潰れる、resize が片方にしか届かない——の3つを必ず踏む。
 * ★玉の位置は render.js の DOTS をそのまま読む★（盤と図がずれたら説明にならない）
 */
const HOWTO_FIGS = [
  { cells: [{ c: 1, cap: 3, o: 1 }, { arrow: true }, { c: 2, cap: 3, o: 1 }],
    text: 'マスを おすと、ひかりが 1つ ふえる' },
  { cells: [{ c: 3, cap: 3, o: 1, boom: true }],
    text: 'わくが うまると はじけて、となりのマスを じぶんの色に かえる' },
  { cells: [{ c: 0, cap: 2, o: 0, label: 'かど' }, { c: 0, cap: 3, o: 0, label: 'へり' }, { c: 0, cap: 4, o: 0, label: 'まんなか' }],
    text: 'わくの数は ばしょで ちがう。かどは 2つで はじける' },
  // ★相手の色を実際に出す★（金だけの図で「あいての色」と書いても伝わらない）
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
}

// ── カード画面 ─────────────────────────────
function renderDeck() {
  const { slots, cards } = currentUnlocks(save);
  const hint = $('deckHint');
  if (slots === 0) {
    const nx = nextUnlock(save.shards);
    hint.textContent = nx ? `あそぶと カードが つかえるようになります（あと ${nx.remain}）` : '';
    $('deckList').innerHTML = '';
    return;
  }
  save.deck = sanitizeDeck(save, save.deck);
  hint.textContent = `もちこめるのは ${slots}まい（いま ${save.deck.length}まい）`;
  const list = $('deckList');
  list.innerHTML = '';
  for (const id of cards) {           // ★まだ開いていないカードは並べない
    const card = CARD_BY_ID[id];
    const on = save.deck.includes(id);
    const b = document.createElement('button');
    b.className = 'card' + (on ? ' on' : '');
    b.innerHTML = `<span class="ic">${card.icon}</span><span class="nm">${card.name}</span><span class="tx">${card.text}</span>`;
    b.addEventListener('click', () => {
      Audio.SE.tap();
      const cur = new Set(save.deck);
      if (cur.has(id)) cur.delete(id);
      else if (cur.size < slots) cur.add(id);
      else return;
      save = { ...save, deck: [...cur] };
      writeSave(save);
      renderDeck();
    });
    list.appendChild(b);
  }
}

// ── デイリー ───────────────────────────────
function renderDaily() {
  const today = ymd();
  $('dailyDate').textContent = today;
  const list = $('dailyList');
  list.innerHTML = '';
  for (const d of recentDates(7)) {
    const rec = save.daily[d] || {};
    const b = document.createElement('button');
    b.className = rec.best !== undefined || rec.tsume ? 'done' : '';
    b.innerHTML = `${d.slice(5)}${rec.best !== undefined ? `<br>${rec.best}手` : ''}${rec.tsume ? ' ✓' : ''}`;
    b.addEventListener('click', () => startDaily(d));
    list.appendChild(b);
  }
}

function startTsume() {
  const date = ymd();
  const p = makeTsume(date);
  if (!p) { alert('きょうの詰めルナは おやすみです'); return; }
  tsumeData = p;
  mode = 'tsume';
  match = createMatch({ terrain: p.state.terrain, wrapX: p.state.wrapX, komi: 0, tier: 1, myDeck: [], oppName: '詰めルナ', mySeat: 1 });
  match.state = cloneState(p.state);
  match.date = date;
  // ★対戦ごとに世代番号を振る★
  //   前の対戦のために予約された setTimeout や演出の完了コールバックが
  //   あとから届いても、世代が違えば降りる。画面を増やすほどここが効く
  match.id = ++matchId;
  finished = false;
  show(null);
  view.sync(match.state);
  view.legal = null;
  view.lastMove = -1;
  view.resize();
  updateHud();
  hideHand();               // ★前の練習の指マークを消す★（残ると無関係のマスを指す）
  el.cardbar.hidden = true;
  busy = false;
}

// ── 記録・合言葉 ───────────────────────────
function renderRecords() {
  const u = currentUnlocks(save);
  const nx = nextUnlock(save.shards);
  $('statBox').innerHTML = `
    <div>たたかった<b>${save.played}</b></div>
    <div>かった<b>${save.wins}</b></div>
    <div>つきのかけら<b>${save.shards}</b></div>
    <div>もっているカード<b>${u.cards.length}/${CARDS.length}</b></div>
    <div>つよさ<b>★${save.tier}</b></div>
    <div>つぎの解放<b>${nx ? `あと${nx.remain}` : 'ぜんぶ'}</b></div>`;
  $('myCode').textContent = pretty(encodeDeck(sanitizeDeck(save, save.deck), save.nickname));
  $('nickInput').value = save.nickname || '';
  const gl = $('ghostList');
  gl.innerHTML = '';
  for (const g of save.ghosts.slice().reverse()) {
    const b = document.createElement('button');
    b.className = 'card';
    b.innerHTML = `<span class="nm">じぶんのかげ</span><span class="tx">${g.map((id) => CARD_BY_ID[id]?.name || '—').join('・') || 'カードなし'}</span>`;
    b.addEventListener('click', () => startGhost(g, 'じぶんのかげ'));
    gl.appendChild(b);
  }
}

/** ニックネーム。★使える文字だけに丸めて受け入れる（弾かない）★ 表示前に文字種を制限する */
function onNickname(e) {
  const cleaned = [...String(e.target.value)]
    .filter((c) => NICK_CHARS.includes(c))
    .slice(0, 6)
    .join('');
  if (e.target.value !== cleaned) e.target.value = cleaned;
  save = { ...save, nickname: cleaned };
  writeSave(save);
  $('myCode').textContent = pretty(encodeDeck(sanitizeDeck(save, save.deck), save.nickname));
}

function onFriendCode() {
  const d = decode($('codeInput').value);
  const msg = $('codeMsg');
  if (!d.ok) {
    msg.textContent = d.reason === 'typo' ? 'うまく よみとれません。もういちど入れてみてください'
      : d.reason === 'empty' ? 'コードを入れてください' : 'このコードは よめませんでした';
    return;
  }
  if (d.type !== 'D') { msg.textContent = 'これは 編成のコードでは ないみたいです'; return; }
  msg.textContent = `${d.nickname || 'ともだち'} の かげと たたかいます`;
  setTimeout(() => startGhost(d.cards, (d.nickname || 'ともだち') + 'のかげ'), 500);
}

// ── 設定 ───────────────────────────────────
function renderSettings() {
  $('optSound').checked = device.sound;
  $('optLight').checked = device.effects === 'light';
  $('saveCode').textContent = pretty(encodeSave({ shards: save.shards, trophies: save.trophies, tier: save.tier }));
}

function onRestoreCode() {
  const d = decode($('saveInput').value);
  const msg = $('saveMsg');
  if (!d.ok || d.type !== 'S') {
    msg.textContent = d.reason === 'typo' ? 'うまく よみとれません。もういちど入れてみてください' : 'ひきつぎコードでは ないみたいです';
    return;
  }
  if (d.shards < save.shards && !confirm('いまの記録より すくない内容です。もどしますか？')) return;
  // ★引き継いだ人は別の端末で遊び終えている★
  //   ここで旗を立てないと、次に「あそぶ」を押したとき練習1段目に飛ばされる
  save = { ...save, shards: d.shards, trophies: d.trophies, tier: d.tier, tutorialDone: true };
  save.deck = sanitizeDeck(save, save.deck);
  writeSave(save);
  msg.textContent = 'もどしました';
  renderSettings();
}

// ── その他 ─────────────────────────────────
function copy(text, msgEl) {
  // ★writeText は Promise を返す★——拒否を try/catch では捕まえられず、
  //   unhandledrejection に上がって「うまく はじめられませんでした」が全画面に出る
  const ng = () => { if (msgEl) msgEl.textContent = '長おしで コピーしてください'; };
  try {
    const p = navigator.clipboard && navigator.clipboard.writeText(text);
    if (p && typeof p.then === 'function') {
      p.then(() => { if (msgEl) msgEl.textContent = 'コピーしました'; }).catch(ng);
    } else ng();
  } catch { ng(); }
}

boot();

/* 検証用の覗き窓（★読み取り専用★・遊びの挙動は一切変えない）
   tools/smoke_luna_chain.py がここを見て「本物の手順で最後まで遊べるか」を確かめる。
   書き込み用のフックは置かない（テストのために本体の状態を作れるようにすると、
   実装が用意する初期状態を迂回したテストになってしまう）。 */
globalThis.__luna = {
  get save() { return save; },
  get match() { return match; },
  get view() { return view; },
  get mode() { return mode; },
  get tsumeSolution() { return tsumeData ? tsumeData.solution : -1; },
  get busy() { return busy; },        // 演出の再生中かどうか（テストは固定待ちでなくこれを見る）
  get picking() { return !!pick; },
};

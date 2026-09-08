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
import { BoardView } from './render.js';
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
let rng = makeRng((Date.now() ^ 0x9e37) >>> 0);

// ── 画面の切り替え ───────────────────────────────
const SCREENS = { title: 'scTitle', result: 'scResult', deck: 'scDeck', daily: 'scDaily', records: 'scRecords', settings: 'scSettings' };
function show(name) {
  for (const [k, id] of Object.entries(SCREENS)) $(id).classList.toggle('show', k === name);
  const inGame = !name;
  el.hud.hidden = !inGame;
  el.cardbar.hidden = !inGame;
  if (name === 'deck') renderDeck();
  if (name === 'daily') renderDaily();
  if (name === 'records') renderRecords();
  if (name === 'settings') renderSettings();
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
  $('btnBack').addEventListener('click', () => { if (confirmQuit()) show('title'); });
  $('btnAgain').addEventListener('click', () => (mode === 'tsume' ? startTsume() : startNormal()));
  $('btnToTitle').addEventListener('click', () => show('title'));
  $('btnDailyBattle').addEventListener('click', () => startDaily(ymd()));
  $('btnTsume').addEventListener('click', () => startTsume());
  $('btnPickCancel').addEventListener('click', cancelPick);
  $('btnCopy').addEventListener('click', () => copy($('myCode').textContent, $('codeMsg')));
  $('btnCopySave').addEventListener('click', () => copy($('saveCode').textContent, $('saveMsg')));
  $('btnCodeGo').addEventListener('click', onFriendCode);
  $('btnSaveGo').addEventListener('click', onRestoreCode);
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

const confirmQuit = () => (match && !match.state.winner) ? confirm('とちゅうでやめますか？') : true;

// ── 対戦の開始 ──────────────────────────────
function startNormal() {
  if (save.played === 0) return startTutorial();
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

function startGhost(cards, name) {
  const board = dailyBoard('ghost-' + Math.random());
  mode = 'ghost';
  beginMatch({ terrain: board.terrain, wrapX: board.wrapX, tier: save.tier, oppName: name || 'かげ', oppDeck: cards.filter(Boolean) });
}

/**
 * 最初の1戦（説明文ゼロのチュートリアル）。
 * まん中を3回タップするだけで必ず勝てる固定盤。指マークだけで導く。
 */
function startTutorial() {
  mode = 'tutorial';
  beginMatch({ terrain: new Int8Array(N), wrapX: false, tier: 1, oppName: 'れんしゅう' });
  // ★チュートリアルは必ず自分が先手席★
  //   通常戦は席をランダムにしているが、その処理がここにも効くと
  //   「自分のマスを押せない練習」になって最初の1戦が成立しない（2026-09-08に実際に起きた）
  match.mySeat = 1;
  const s = match.state;
  const c = idx(2, 3);
  s.owner[c] = 1; s.count[c] = 1;
  for (const j of [idx(2, 2), idx(2, 4), idx(1, 3), idx(3, 3)]) { s.owner[j] = 2; s.count[j] = 1; }
  s.moves = [1, 1];            // 開幕判定を抜ける（相手は動かないため）
  s.player = 1; s.left = 1;
  view.sync(s);
  showHand(c);
  updateHud();
}

function beginMatch({ terrain, wrapX, tier, oppName, oppDeck = [], date = null }) {
  const deck = sanitizeDeck(save, save.deck);
  match = createMatch({ terrain, wrapX, komi: 1, tier, myDeck: deck, oppDeck, oppName });
  match.date = date;
  // ★先手・後手はランダム★
  //   実測では komi=1 でも先手勝率が中位AIで44.7%（5.3pt残る）。komiでは均しきれないと分かったので、
  //   1戦ごとの席をランダムにして、残った差を運に均す（友達との比較は先後を入れ替えた2局で行う）。
  match.mySeat = Math.random() < 0.5 ? 1 : 2;
  show(null);
  view.sync(match.state);
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
    if (mode === 'tutorial' && !match.state.winner) {
      // 練習では相手が動かないので、手番を自分に戻してやらないと2回目が押せなくなる
      match.state.player = 1;
      match.state.left = 1;
      updateHud();
      showHand(idx(2, 3));
      return;
    }
    if (!match.state.winner && match.state.player !== match.mySeat) setTimeout(cpuTurn, 260);
  });
}

/** 1手ぶんの演出を流し、終わったら次へ */
function afterMove(r, next) {
  busy = true;
  view.lastMove = r.events.find((e) => e.t === 'place')?.i ?? view.lastMove;
  for (const ev of r.events) if (ev.t === 'boom') Audio.SE.boom(ev.chain);
  if (r.gaugeFull) { view.bigFlash(); Audio.SE.moon(); }
  view.animate(r.events, () => {
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
  if (mode === 'tutorial') return;      // 練習では相手は動かない
  const seat = 3 - match.mySeat;
  if (match.state.player !== seat) return;
  busy = true;
  setTimeout(() => {
    const c = cpuCard(match);
    if (c) {
      const rc = useCard(match, c.cardId, c.cells);
      if (rc.ok) {
        Audio.SE.card();
        busy = false;
        return afterMove({ ...rc, events: rc.events }, () => setTimeout(cpuTurn, 200));
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
  view.legal = cardTargets(match, cardId, match.mySeat);
  el.pickBar.hidden = false;
  el.pickText.textContent = `${card.name}：${card.picks}つ えらぶ`;
  view.draw();
  renderCardBar();
}

function onPickCell(i) {
  if (!view.legal.includes(i) || pick.cells.includes(i)) return;
  pick.cells.push(i);
  Audio.SE.tap();
  el.pickText.textContent = `${CARD_BY_ID[pick.cardId].name}：あと ${pick.need - pick.cells.length}つ`;
  if (pick.cells.length >= pick.need) firePick(pick.cardId, pick.cells);
}

function firePick(cardId, cells) {
  const r = useCard(match, cardId, cells);
  cancelPick();
  if (!r.ok) return;
  Audio.SE.card();
  for (const ev of r.events) if (ev.t === 'boom') Audio.SE.boom(ev.chain);
  view.sync(match.state);           // カードは盤を直接いじるので、まず現状を取り込む
  afterMove({ ...r, events: [] }, null);
  view.sync(match.state);
  updateHud();
  renderCardBar();
  busy = false;
  if (match.state.winner) finish();
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
function finish() {
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
    $('shardBox').textContent = '';
    $('unlockBox').hidden = true;
    save = { ...save, played: Math.max(1, save.played) };
    writeSave(save);
  } else {
    const before = save.shards;
    const res = recordMatch(save, {
      won, placed: match.stats.placed[me], captured: match.stats.captured[me], deck: match.decks[me],
    });
    save = res.save;
    if (mode === 'daily' && match.date) save = recordDaily(save, match.date, match.stats.placed[me]);
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
  setTimeout(() => show('result'), 700);
}

// ── タイトル ────────────────────────────────
function renderTitle() {
  const c = $('credits');
  // ★実素材を入れるまでクレジットは出さない（無いものを名乗らない）
  c.innerHTML = Audio.hasRealAssets()
    ? '音楽：<a href="https://maou.audio/" target="_blank" rel="noopener">魔王魂</a>／効果音：<a href="https://www.springin.org/sound-stock/" target="_blank" rel="noopener">Springin\' Sound Stock</a>'
    : '';
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
  match = createMatch({ terrain: p.state.terrain, wrapX: p.state.wrapX, komi: 0, tier: 1, myDeck: [], oppName: '詰めルナ' });
  match.state = cloneState(p.state);
  match.mySeat = 1;
  match.date = date;
  show(null);
  view.sync(match.state);
  view.lastMove = -1;
  view.resize();
  updateHud();
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
  save = { ...save, shards: d.shards, trophies: d.trophies, tier: d.tier };
  save.deck = sanitizeDeck(save, save.deck);
  writeSave(save);
  msg.textContent = 'もどしました';
  renderSettings();
}

// ── その他 ─────────────────────────────────
function copy(text, msgEl) {
  try {
    navigator.clipboard.writeText(text);
    if (msgEl) msgEl.textContent = 'コピーしました';
  } catch { if (msgEl) msgEl.textContent = '長おしで コピーしてください'; }
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

/**
 * UIの入口（画面ルーター・セーブ管理・再生時間の計測）
 *
 * 【設計】画面モジュールは `render(ctx)` で DOM を返すだけの関数にする。
 * 画面どうしは直接呼び合わず、必ず ctx.go() を通す（循環importを作らないため）。
 *
 * ここより下（core/battle/dungeon/meta）は DOM を一切知らない。
 * この境界が、Nodeでの自動プレイシミュレーターを成立させている（tech-design §2）。
 */

import { $, clear, toast, alertBox } from './dom.js';
import { preload, bootUrls, laterUrls, showBootScreen, BOOT_TIMEOUT_MS } from './preload.js';
import * as S from '../core/save.js';
import { bgForFloor, bgForScreen } from '../../assets/art-manifest.js';
import { applyBgm, setVolume, volumeOf, setSeVolume, seVolumeOf } from './audio.js';

import * as Title from './screen_title.js';
import * as Home from './screen_home.js';
import * as Party from './screen_party.js';
import * as Explore from './screen_explore.js';
import * as Battle from './screen_battle.js';
import * as Result from './screen_result.js';
import * as Records from './screen_records.js';
import * as Settings from './screen_settings.js';
import * as Dispatch from './screen_dispatch.js';
import * as Board from './screen_board.js';
import * as Talk from './screen_talk.js';
import * as Story from './screen_story.js';
import * as Items from './screen_items.js';
import * as Shop from './screen_shop.js';
import * as Chars from './screen_chars.js';

const SCREENS = {
  title: Title, home: Home, party: Party, explore: Explore,
  battle: Battle, result: Result, records: Records, settings: Settings,
  dispatch: Dispatch, board: Board, talk: Talk, story: Story, items: Items,
  shop: Shop, chars: Chars,
};

/** アプリ全体の可変状態。セーブに入るのは state.save だけ */
const state = {
  screen: 'title',
  params: {},
  slot: 1,
  save: null,
  run: null,        // 潜行中の状態（explore.js の run オブジェクト）
  pending: null,    // 戦闘結果など、画面をまたいで渡すもの
  // 画面が明示した背景ID（会話画面が場面ごとに入れる）。null なら画面から自動で決める
  bgOverride: null,
};

let busy = false;   // 描画中の多重遷移を防ぐ

// ── 画面遷移 ──────────────────────────────────────────────

function go(name, params = {}) {
  if (!SCREENS[name]) { console.error('不明な画面:', name); return; }
  state.screen = name;
  state.params = params;
  // ★背景の指定は画面をまたいで持ち越さない。会話画面が敷いた塔の絵が、
  //   戻った先の拠点にまで残ってしまう
  state.bgOverride = null;
  render();
}

/**
 * 塔の背景を敷く（`assets/bg/tower-N.jpg`）。
 *
 * 絵が無い環境でも成立させるのが本作の前提（tech-design §6）なので、
 * **画像が読めなければ層ごと消す**。
 * 塔の中（探索・戦闘）は階に応じた絵、拠点まわりは庵の絵。
 * タイトル・設定は敷かない（キービジュアルとぶつかるため）。
 *
 * ★会話画面は**場面ごとに**背景を差し替える（2026-08-09 オーナー要望
 *   「ストーリー中に背景が真っ暗なのが気になる」）。
 *   当初は「立ち絵とぶつかる」として敷かない判断だったが、実際に遊ぶと
 *   真っ暗のほうが気になる、というのがオーナーの試遊結果。
 *   立ち絵の可読性は `.bglayer` の暗幕（下ほど濃い）と本文の帯で確保している。
 *
 * ★**画面単位では決められない**のがここの肝。取りこぼした場面をまとめて読むとき、
 *   「15階の場面 → 祠の絆イベント」のように**1回の会話の中で場所が変わる**。
 *   だから `screen_talk.js` が場面を送るたびに `ctx.setBg()` で上書きする。
 *
 * ★指定は `state.bgOverride` に**持たせる**（引数で受け取るだけにしない）。
 *   `render()` は「画面を描く → 背景を決める」の順なので、画面の描画中に
 *   `ctx.setBg()` を呼んでも、直後の `applyBackdrop()` に消されてしまう。
 *   状態にしておけば、その後の再描画でも指定が生き続ける。
 *   画面を移るときは `go()` が捨てるので、後片付けは要らない。
 */
function applyBackdrop() {
  let el = document.getElementById('bglayer');
  const inTower = (state.screen === 'explore' || state.screen === 'battle') && state.run;
  const id = state.bgOverride !== null && state.bgOverride !== undefined ? state.bgOverride
    // ★塔IDも渡すこと（2026-08-14）。渡さないと、朔の窖・望の櫓に専用の絵があっても
    //   階数だけで本編の帯（1〜10階＝tower-1）に落ちて、一生出ない
    : inTower ? bgForFloor(state.run.floor, state.run.tower) : bgForScreen(state.screen);
  if (!id) { if (el) el.remove(); return; }
  if (!el) {
    el = document.createElement('div');
    el.id = 'bglayer';
    el.className = 'bglayer';
    el.setAttribute('aria-hidden', 'true');
    document.body.insertBefore(el, document.body.firstChild);
  }
  const url = `assets/bg/${id}.jpg`;
  if (el.dataset.bg === id) return;
  // 読めたときだけ貼る（404のときは層を残さない）
  const probe = new Image();
  probe.onload = () => { el.style.backgroundImage = `url(${url})`; el.dataset.bg = id; };
  probe.onerror = () => { el.remove(); };
  probe.src = url;
}

function render() {
  if (busy) return;
  busy = true;
  try {
    const root = $('#app');
    clear(root);
    // ★いまの画面をCSSから見えるようにする。会話画面だけ背景の暗幕を薄くするため
    //   （JSで個別に触らず、CSS側で完結させる）
    document.documentElement.dataset.screen = state.screen;
    root.appendChild(SCREENS[state.screen].render(ctx));
    applyBackdrop();
    // 曲も背景と同じ場所で決める。**画面単位ではなく場面単位**なので、
    // 拠点の中を歩き回っても曲は切れない（判断は assets/audio-manifest.js）
    applyBgm(state);
    window.scrollTo(0, 0);
    // 画面が変わったことを読み上げソフトへ伝える。
    // #app に aria-live を付けると毎回全部を読み直してしまうので、見出しへ移動させる方式にする
    const head = root.querySelector('h1, h2');
    if (head) { head.setAttribute('tabindex', '-1'); head.focus({ preventScroll: true }); }
  } catch (e) {
    // ★どの画面が落ちても袋小路にしない。
    //   ここに戻る手段が無いと、リロード以外に復帰できなくなる（2026-08-02 レビュー指摘）
    console.error(e);
    const root = $('#app');
    clear(root);
    const back = document.createElement('button');
    back.className = 'btn btn--primary';
    back.textContent = 'タイトルへ戻る';
    back.addEventListener('click', () => { state.run = null; state.pending = null; go('title'); });
    const p = document.createElement('p');
    p.className = 'panel';
    p.textContent = '画面の表示に失敗しました。記録は保存されています。';
    root.appendChild(p);
    root.appendChild(back);
  } finally {
    busy = false;
  }
}

// ── セーブ ────────────────────────────────────────────────

/**
 * 保存する。**失敗を黙って飲み込まない**（spec §12-2）。
 * 容量不足はプレイヤーが対処できる（装備を売る）ので、必ず本人に伝える。
 */
function saveNow(silent = false) {
  if (!state.save) return { ok: false, reason: 'nosave' };
  state.save.savedAt = Date.now();
  state.save.lastSeenAt = Date.now();
  const r = S.save(state.slot, state.save);
  if (!r.ok) {
    alertBox(r.message || 'セーブに失敗しました。');
  } else if (!silent) {
    toast('記録した');
  }
  return r;
}

/**
 * 演出の初期値（まだ一度も設定していないとき）＝**常にオン**。
 *
 * ★OSの「アニメーションを減らす」をここで見てはいけない。
 *   以前は CSS と JS で常時この設定を見ており、さらに初期値もここから決めていたため、
 *   **Windowsでアニメーションを切っている人には演出が丸ごと出なかった**
 *   （2026-08-08にオーナー環境で発覚。エフェクトを実装しても一度も見えていなかった）。
 *   Windowsのアニメーション設定は「酔うから」ではなく「動作を軽くしたいから」
 *   切っている人が多く、ゲームの演出の可否とは意味が違う。
 * ★酔いの原因になるのは**画面全体を揺らす**演出のほうなので、
 *   OS設定はそこだけに効かせている（dom.js の `shakeOff`）。
 *   小さな絵の点滅やダメージ数字はビューポートを動かさないので対象外。
 */
function defaultFx() {
  return true;
}

/** 設定はセーブスロットと別に持つ（スロットを消しても設定は残る） */
function applySettings(st) {
  const s = st || state.save?.settings;
  if (!s) return;
  document.documentElement.dataset.textsize = s.textSize || 'm';
  // ★演出も音量と同じく**端末の設定**を先に見る。
  //   セーブ側を優先すると「タイトルで演出を切る→つづきから→また出る」になる
  //   （newSave の settings に fx キーが無いため必ず既定へ戻る・2026-08-08）
  const dev = S.loadSettings();
  const fx = typeof dev?.fx === 'boolean' ? dev.fx
    : (typeof s.fx === 'boolean' ? s.fx : defaultFx());
  document.documentElement.dataset.fx = fx === false ? 'off' : 'on';
  // ★音量だけは**端末の設定**として扱い、記録（セーブ）側の値を先に見ない。
  //   セーブ側を優先すると「タイトルで音量を0にする→つづきから→60で鳴りだす」になる。
  //   既存セーブには volume が無い（migrate の既定値埋めは v<1 の経路しか通らない）ので、
  //   セーブ側を見にいくと必ず既定値に戻ってしまう
  const cfg = S.loadSettings();
  setVolume(volumeOf(typeof cfg?.volume === 'number' ? cfg : s));
  // ★効果音のつまみも同じ扱い（2026-08-12）。無い記録は曲の音量を引き継ぐので、
  //   音量を0にしていた人の耳元でいきなり効果音だけが鳴る、ということは起きない
  setSeVolume(seVolumeOf(typeof cfg?.seVolume === 'number' ? cfg
    : (typeof cfg?.volume === 'number' ? cfg : s)));
}

// ── 再生時間 ──────────────────────────────────────────────

let lastTick = Date.now();
setInterval(() => {
  const now = Date.now();
  const dt = now - lastTick;
  lastTick = now;
  // タブを離れていた分は数えない（10秒以上跳んだら無視）
  if (state.save && dt > 0 && dt < 10000 && !document.hidden) {
    state.save.playSec = (state.save.playSec || 0) + dt / 1000;
  }
}, 1000);

// 60秒ごとの自動セーブ。ダンジョン内は潜行状態を保存できないので拠点にいるときだけ
setInterval(() => {
  if (state.save && state.save.settings?.autoSave !== false && !state.run) {
    saveNow(true);
  }
}, 60000);

// タブを閉じる直前にも保存を試みる（拠点にいるときだけ）
window.addEventListener('pagehide', () => {
  if (state.save && !state.run) { try { saveNow(true); } catch (_) { /* 失敗しても閉じる */ } }
});

// ── 画面に渡すコンテキスト ────────────────────────────────

const ctx = {
  state,
  go,
  render,
  saveNow,
  applySettings,
  get save() { return state.save; },
  setSave(save, slot) {
    state.save = save;
    if (slot != null) state.slot = slot;
    applySettings();
  },
  /** 取り消せない操作の直前に、いまのセーブを退避する（輪廻） */
  backupSave() {
    return state.save ? S.backupSlot(state.slot, state.save) : false;
  },
  /**
   * セーブを丸ごと別のものに差し替える（輪廻）。
   * ★**書き込みが成功してから** state.save を差し替える。
   *   先に差し替えると、書けなかったときに「画面上は新しい周・記録は古い周」という
   *   食い違いが残り、次のオートセーブでどちらかが静かに消える
   */
  replaceSave(next) {
    const r = S.save(state.slot, next);
    if (r.ok) { state.save = next; applySettings(); return r; }
    // ★失敗したら控えも消す。容量不足のとき、控えが居座って
    //   以後の通常オートセーブまで失敗し続ける（2026-08-03 レビュー指摘）
    S.clearBackup(state.slot);
    return r;
  },
  /**
   * 背景を明示的に差し替える（会話画面が場面ごとに呼ぶ）。
   * ★画面を離れるときの後片付けは不要。次の `render()` が
   *   `applyBackdrop()` を引数なしで呼び直すので、自動で元の決め方に戻る
   */
  setBg(id) { state.bgOverride = id || null; applyBackdrop(); },
  /** 今のミリ秒。月齢と影送りで使う。**ロジック側には必ず引数で渡す**（決定論を守るため） */
  now() { return Date.now(); },
};

// ── 起動 ──────────────────────────────────────────────────

const cfg = S.loadSettings();
if (cfg) applySettings(cfg);

/**
 * ★絵を読んでからタイトルを出す（2026-08-16 オーナー指摘
 *   「毎回ゲームをスタートしたとき、画像の読み込みが遅れる場合がある」）。
 *
 * ★**必ず先へ進む**こと。読めない絵があっても、回線が死んでいても、
 *   `BOOT_TIMEOUT_MS` で打ち切ってタイトルを出す（絵が無くても紋で遊べる）。
 * ★重い立ち絵は待たせない。始まってから裏で読む。
 */
(async () => {
  const boot = showBootScreen();
  try {
    await preload(bootUrls(), boot.progress, BOOT_TIMEOUT_MS);
  } catch (_) { /* 先読みの失敗で起動を止めない */ }
  boot.close();
  go('title');
  // 会話に入るまでに間に合わせる。ここは待たない（失敗も気にしない）
  preload(laterUrls()).catch(() => {});
})();

// オフラインでも遊べるようにする。失敗しても本体の動作には影響させない
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => { /* 未対応環境では黙って諦める */ });
  });
}

/**
 * セーブ／ロード
 *
 * 【最重要】RPGはセーブが消えたら終わり。10時間分の進行が飛ぶのは致命的。
 * spec §12-2 の4点を必ず守る:
 *   1. 2段書き込み（tmpに書く→読み直して検証→本キーへ）
 *   2. バージョンフィールド + migrate（将来の仕様追加で既存セーブを壊さない）
 *   3. QuotaExceededError を必ず catch して UI に伝える（黙って失わない）
 *   4. 壊れたセーブは自動削除せず退避する
 *
 * storage を差し替えられるようにしてあるのは、Nodeでテストするため。
 */

import { CHAR_BY_ID } from '../../data/chars.js';
import { BOARD_SIZE, BOARD_CENTER, LAYOUT_VERSION } from '../../data/board.js';

export const SAVE_VERSION = 4;
const PREFIX = 'rinnetou:v1:';

/** インポートで受け付けるセーブコードの上限（貼り間違いでブラウザが固まらないように） */
const MAX_IMPORT_CHARS = 2_000_000;

/** localStorage が無い環境（Node）でも動くメモリ実装 */
export function memoryStorage(initial = {}) {
  const m = new Map(Object.entries(initial));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
    keys: () => [...m.keys()],
  };
}

/** 容量制限を模した storage（テスト用） */
export function quotaStorage(limitBytes) {
  const inner = memoryStorage();
  return {
    getItem: inner.getItem,
    removeItem: inner.removeItem,
    keys: inner.keys,
    setItem(k, v) {
      let total = String(v).length;
      for (const key of inner.keys()) if (key !== k) total += (inner.getItem(key) || '').length;
      if (total > limitBytes) {
        const e = new Error('quota'); e.name = 'QuotaExceededError'; throw e;
      }
      inner.setItem(k, v);
    },
  };
}

function browserStorage() {
  return {
    getItem: (k) => window.localStorage.getItem(k),
    setItem: (k, v) => window.localStorage.setItem(k, v),
    removeItem: (k) => window.localStorage.removeItem(k),
    keys: () => Object.keys(window.localStorage),
  };
}

let STORE = typeof window !== 'undefined' && window.localStorage ? browserStorage() : memoryStorage();
export function setStorage(s) { STORE = s; }
export function getStorage() { return STORE; }

// ── 新規セーブ ────────────────────────────────────────────

export function newSave(name = 'ともし') {
  return {
    v: SAVE_VERSION,
    id: null,                      // 初回保存時に採番（呼び出し側がシードから作る）
    name,
    createdAt: 0, playSec: 0, lastSeenAt: 0,
    difficulty: 'normal',
    minDifficulty: 'rinne',        // その周で使った「最も低い」難易度（ランキング判定用・spec §13-5）
    progress: { chapter: 0, maxFloor: 1, everMax: 1, deepMax: 0, cleared: false, rebirth: 0, towerMax: {} },
    party: { active: ['hero'], tacticParty: 'omakase', tacticChars: {} },
    chars: { hero: { lv: 1, exp: 0, renki: {}, skills: {}, equipped: null } },
    inv: { equips: [], mats: {}, items: { oil: 2, fuda: 1 }, zeni: 0 },
    karma: { have: 0, spent: 0 },
    board: (() => { const b = new Array(BOARD_SIZE).fill(0); b[BOARD_CENTER] = 1; return b; })(),
    boardV: LAYOUT_VERSION,        // どの配置で買ったか（LAYOUT を変えるとき読み替えに要る）
    dispatch: [],
    story: { seen: {} },           // 読んだ場面のID（data/scenario.js）
    // bosses: 一度でも倒した層ボス（`"tower:floor"` → 1）。**輪廻しても消えない**。
    //   二度目からは「写し身」として出す（2026-08-12 オーナー要望）。
    //   `progress.bossBeaten` は今の周だけの記録なので、そちらでは代用できない
    // items / mats: 見つけた道具（薬）と素材（2026-08-13・`meta/dex.js`）。
    //   持ち数（inv）は使えば0に戻るので、手にした事実は別に残す。
    //   ★器が無い古い記録でも `meta/dex.js` が作るので、セーブのバージョンは上げていない
    dex: { enemies: {}, equips: {}, events: {}, pairs: {}, bosses: {}, items: {}, mats: {} },
    stats: { battles: 0, deaths: 0, crushes: 0, floorsCleared: 0, noDeathRun: true },
    ranking: { optIn: true, uid: null, name },
    // ★sound は未使用（廃止予定）。真偽値なので音量に作り替えると、既存セーブの
    //   false が「音量0」に化けて**全員が無音で起動する**。触らずに volume を別に足してある
    // ★seVolume は 2026-08-12 追加（曲と効果音を別のつまみにした）。
    //   無い記録では `seVolumeOf()` が**曲の音量を引き継ぐ**ので、既定値を足しても足さなくても
    //   既存の人の耳は変わらない。新規はここの値から始まる
    settings: { sound: false, volume: 60, seVolume: 60, speed: 1, textSize: 'm', autoSave: true, bossManual: false, battleMode: 'auto' },
  };
}

// ── マイグレーション ──────────────────────────────────────

/**
 * 古いセーブを現行バージョンへ変換する。
 * バージョンを1つ上げるたびに、ここに1段追加していく（既存セーブを絶対に壊さないため）。
 */
export function migrate(data) {
  if (!data || typeof data !== 'object') return null;
  let d = data;
  if (typeof d.v !== 'number') d = { ...d, v: 0 };

  // v0 → v1: 初期リリース前の試作セーブ。欠けているフィールドを既定値で補う
  if (d.v < 1) {
    const base = newSave(d.name || 'ともし');
    d = deepFill({ ...d, v: 1 }, base);
  }

  // v1 → v2: 因果盤（2026-08-03）。board を持たない v1 セーブに器を補う。
  // ★盤の中身（どの位置を買ったか）は data/board.js の LAYOUT に依存する。
  //   LAYOUT を変えるときは LAYOUT_VERSION を上げ、ここに読み替えを1段足すこと
  //   （でないと、既存プレイヤーの購入済みマスの効果が黙って別物に入れ替わる）
  if (d.v < 2) {
    if (!Array.isArray(d.board) || d.board.length !== BOARD_SIZE) {
      const old = d.board;
      d.board = new Array(BOARD_SIZE).fill(0);
      // 読める形（配列でも添字つきオブジェクトでも）なら中身を拾う。捨てない
      if (old && typeof old === 'object') {
        for (let i = 0; i < BOARD_SIZE; i++) if (old[i]) d.board[i] = 1;
      }
    }
    d.board[BOARD_CENTER] = 1;              // 中央が閉じていると1マスも開けなくなる
    if (d.boardV == null) d.boardV = LAYOUT_VERSION;
    d.v = 2;
  }

  // v2 → v3: シナリオ（2026-08-03）。読んだ場面の記録を足す。
  // ★中身は空でよい。未読の場面は src/meta/story.js の「取りこぼし拾い」が
  //   拠点に戻ったときに拾うので、ここで既読フラグを捏造しない
  //   （捏造すると、更新前から遊んでいた人だけシナリオを一生読めなくなる）。
  if (d.v < 3) {
    if (!d.story || typeof d.story !== 'object' || Array.isArray(d.story)) d.story = {};
    if (!d.story.seen || typeof d.story.seen !== 'object' || Array.isArray(d.story.seen)) d.story.seen = {};
    d.v = 3;
  }

  // v3 → v4: 輪廻（2026-08-03）。
  // 「今の周でどこまで登ったか」(maxFloor) と「全周を通じた最高到達」(everMax) を分ける。
  // ★輪廻すると maxFloor は1に戻るが、因果盤(11F)・影送り(21F)・支塔・
  //   還り札の登録点の**解放判定は everMax を見る**。
  //   ここを maxFloor のままにすると、「因果盤は引き継ぐ」という仕様に反して
  //   輪廻した瞬間に盤も影送りも画面ごと閉じる。
  if (d.v < 4) {
    if (!d.progress || typeof d.progress !== 'object') d.progress = {};
    const cur = Number(d.progress.maxFloor) || 1;
    d.progress.everMax = Math.max(1, Number(d.progress.everMax) || 0, cur);
    d.v = 4;
  }

  // 将来: if (d.v < 5) { ... d.v = 5; }

  return sanitize(d);
}

/**
 * 読み込んだデータを安全な形に整える。
 *
 * ★セーブコードは手で書き換えられるし、将来キャラIDを変えたら古いセーブに
 *   知らないIDが残る。そのまま使うと `statsAt` が例外を投げ、
 *   **拠点画面が開けなくなって詰む**（2026-08-02 レビュー指摘）。
 *   「壊れたデータでも起動はする」ことを優先し、知らないものは静かに落とす。
 */
function sanitize(d) {
  d.chars = d.chars && typeof d.chars === 'object' ? d.chars : {};
  for (const id of Object.keys(d.chars)) {
    if (!CHAR_BY_ID[id]) delete d.chars[id];
  }
  if (!d.chars.hero) d.chars.hero = { lv: 1, exp: 0, renki: {}, skills: {}, equip: [0, 0, 0] };

  d.party = d.party && typeof d.party === 'object' ? d.party : {};
  const active = Array.isArray(d.party.active) ? d.party.active : [];
  d.party.active = active.filter((id) => CHAR_BY_ID[id] && d.chars[id]).slice(0, 4);
  if (d.party.active.length === 0) d.party.active = ['hero'];

  d.inv = d.inv && typeof d.inv === 'object' ? d.inv : {};
  if (!Array.isArray(d.inv.equips)) d.inv.equips = [];
  return d;
}

/** base に有って d に無いキーを埋める（既存の値は上書きしない） */
function deepFill(d, base) {
  const out = Array.isArray(base) ? (Array.isArray(d) ? d : base.slice()) : { ...base, ...d };
  if (Array.isArray(base)) return out;
  for (const k of Object.keys(base)) {
    if (base[k] && typeof base[k] === 'object' && !Array.isArray(base[k])) {
      out[k] = deepFill(d[k] && typeof d[k] === 'object' ? d[k] : {}, base[k]);
    }
  }
  return out;
}

// ── 保存 ──────────────────────────────────────────────────

/**
 * @returns {{ok:true} | {ok:false, reason:string}}
 * 失敗しても**前のセーブは無傷**であることを保証する（2段書き込み）
 */
export function save(slot, data) {
  const key = PREFIX + slot;
  const tmp = key + ':tmp';
  let json;
  try {
    json = JSON.stringify(data);
  } catch (e) {
    return { ok: false, reason: 'serialize', message: 'セーブデータの変換に失敗しました' };
  }
  try {
    STORE.setItem(tmp, json);
    const back = STORE.getItem(tmp);
    if (back !== json) throw new Error('verify');   // 書けたものが読めるか検証
    JSON.parse(back);
    STORE.setItem(key, json);
    STORE.removeItem(tmp);
    return { ok: true, bytes: json.length };
  } catch (e) {
    try { STORE.removeItem(tmp); } catch (_) { /* 掃除に失敗しても続行 */ }
    const quota = e && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED');
    return {
      ok: false,
      reason: quota ? 'quota' : 'unknown',
      message: quota
        ? '端末の保存容量がいっぱいで、セーブできませんでした。不要な装備を売却するか、他のスロットを整理してください。'
        : 'セーブに失敗しました。前回のセーブは残っています。',
    };
  }
}

// ── 読み込み ──────────────────────────────────────────────

/**
 * @returns {{ok:true, data:object} | {ok:false, reason:'empty'|'broken'}}
 * 壊れていても**自動削除しない**。退避してから空を返す。
 */
export function load(slot) {
  const key = PREFIX + slot;
  const raw = STORE.getItem(key);
  if (raw == null) return { ok: false, reason: 'empty' };
  try {
    const parsed = JSON.parse(raw);
    const migrated = migrate(parsed);
    if (!migrated) throw new Error('migrate');
    return { ok: true, data: migrated };
  } catch (e) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    try { STORE.setItem(`${key}:broken:${stamp}`, raw); STORE.removeItem(key); } catch (_) { /* 退避に失敗しても続行 */ }
    return { ok: false, reason: 'broken', message: 'セーブデータが読めませんでした。壊れたデータはバックアップとして残してあります。' };
  }
}

export function slotInfo(slot) {
  const r = load(slot);
  if (!r.ok) return { slot, empty: true, broken: r.reason === 'broken' };
  const d = r.data;
  const lv = d.chars?.hero?.lv ?? 1;
  return {
    slot, empty: false, name: d.name, lv,
    maxFloor: d.progress?.maxFloor ?? 1,
    rebirth: d.progress?.rebirth ?? 0,
    cleared: !!d.progress?.cleared,
    playSec: d.playSec ?? 0,
    savedAt: d.savedAt ?? 0,
  };
}

export function removeSlot(slot) { STORE.removeItem(PREFIX + slot); }

/**
 * 全周を通じた最高到達階（spec §8-3）。
 *
 * **「機能が開いているか」「どの階から入れるか」の判定はこれを使う**。
 * `progress.maxFloor` は「今の周でどこまで登ったか」で、輪廻すると1に戻る。
 * 物語の進行判定（`meta/story.js`）だけは maxFloor 側を見る（今の周の話なので）。
 */
export function everMax(save) {
  const p = save?.progress || {};
  return Math.max(1, Number(p.everMax) || 0, Number(p.maxFloor) || 0);
}

/**
 * 取り消せない操作（輪廻）の直前に、そのスロットの中身を退避する。
 *
 * 本体のスロットとは別のキーに置く。**セーブコードと同じ文字列**にしてあるので、
 * 設定画面の「読み込む」にそのまま貼れば戻せる。
 * @returns {boolean} 退避できたか（容量不足などで失敗しても本処理は止めない）
 */
export function backupSlot(slot, data) {
  try {
    STORE.setItem(`${PREFIX}${slot}:backup`, exportSave(data));
    return true;
  } catch (_) {
    return false;   // バックアップが取れないことを理由に、本人の操作を止めはしない
  }
}

/** 退避したセーブコード（無ければ null） */
export function loadBackup(slot) {
  return STORE.getItem(`${PREFIX}${slot}:backup`) || null;
}

/** 退避を捨てる（本体の書き込みに失敗して、輪廻を取りやめたとき） */
export function clearBackup(slot) {
  try { STORE.removeItem(`${PREFIX}${slot}:backup`); } catch (_) { /* 掃除の失敗は無視 */ }
}

// ── エクスポート／インポート（機種変更・バックアップ用） ──

/** Base64テキストにする。日本語を含むのでUTF-8を経由する */
export function exportSave(data) {
  const json = JSON.stringify(data);
  const bytes = new TextEncoder().encode(json);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  const b64 = typeof btoa === 'function' ? btoa(bin) : Buffer.from(bytes).toString('base64');
  return 'RT1:' + b64;
}

/** @returns {{ok:true,data:object} | {ok:false,reason:string,message:string}} */
export function importSave(text) {
  const s = String(text || '').trim();
  if (!s.startsWith('RT1:')) return { ok: false, reason: 'format', message: 'この文字列は輪廻の塔のセーブコードではありません。' };
  if (s.length > MAX_IMPORT_CHARS) {
    return { ok: false, reason: 'toolong', message: 'セーブコードが長すぎます。貼り付ける範囲を確認してください。' };
  }
  try {
    const b64 = s.slice(4);
    let bytes;
    if (typeof atob === 'function') {
      const bin = atob(b64);
      bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    } else {
      bytes = Buffer.from(b64, 'base64');
    }
    const json = new TextDecoder().decode(bytes);
    const migrated = migrate(JSON.parse(json));
    if (!migrated) throw new Error('migrate');
    return { ok: true, data: migrated };
  } catch (e) {
    return { ok: false, reason: 'broken', message: 'セーブコードが壊れています。コピー漏れがないか確認してください。' };
  }
}

// ── 設定（セーブとは別に持つ。スロットを消しても設定は残す） ──

export function saveSettings(settings) {
  try { STORE.setItem(PREFIX + 'config', JSON.stringify(settings)); return { ok: true }; }
  catch (e) { return { ok: false, reason: 'quota' }; }
}

export function loadSettings() {
  try { return JSON.parse(STORE.getItem(PREFIX + 'config') || 'null'); }
  catch (e) { return null; }
}

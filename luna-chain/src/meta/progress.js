/**
 * ルナチェイン｜進み具合の保存と、CPUの強さの自動調整
 *
 * ★保存が消えても復帰できること★（§4-4）
 *   localStorage は消えることがある（プライベートウィンドウ、サイトデータの削除、iOSの掃除）。
 *   消えたら終わり、を作らない。合言葉のセーブコード（S）で書き出し・読み込みができる。
 *
 * ★端末の設定（音）はセーブから復元しない★（教訓 app-device-setting-vs-save-setting）
 *   「記録を読み込んだ瞬間に音量が既定へ戻る」上書き事故になるため、別のキーに分けて端末側を正とする。
 *
 * ★壊れた保存で起動不能にしない★
 *   読めなければ初期値で続行する。エラー画面を出さない。
 */
import { shardsForMatch, unlockedAt } from '../../data/unlock.js';
import { TIER_MAX } from '../ai/ai.js';

const SAVE_KEY   = 'lunachain-v1-save';
const DEVICE_KEY = 'lunachain-v1-device';   // 端末単位の設定（音など）。セーブとは混ぜない
const GHOST_MAX  = 5;

export function defaultSave() {
  return {
    v: 1,
    shards: 0,          // 累計のつきのかけら（＝遊んだ量の予算）
    tier: 2,            // CPUの段位（1〜6）
    recent: [],         // 直近の勝敗（true=勝ち）。自動調整に使う
    deck: [],           // いま持ち込んでいるカードのid
    nickname: '',
    trophies: 0,        // ビットで持つ
    ghosts: [],         // 直近の自分の編成（じぶんのかげ）
    daily: {},          // { 'YYYY-MM-DD': {best: 手数, tsume: true} }
    played: 0,          // 総対戦数
    wins: 0,
  };
}

const safeParse = (raw, fallback) => {
  try { const v = JSON.parse(raw); return (v && typeof v === 'object') ? v : fallback; }
  catch { return fallback; }
};

export function loadSave(storage = globalThis.localStorage) {
  const base = defaultSave();
  try {
    const raw = storage && storage.getItem(SAVE_KEY);
    if (!raw) return base;
    const got = safeParse(raw, {});
    // ★欠けているキーは既定で埋める（古い保存・壊れた保存でも起動できるように）
    return {
      ...base, ...got,
      shards: clampInt(got.shards, 0, 999999, 0),
      tier: clampInt(got.tier, 1, TIER_MAX, base.tier),
      recent: Array.isArray(got.recent) ? got.recent.slice(-10).map(Boolean) : [],
      deck: Array.isArray(got.deck) ? got.deck.filter((x) => typeof x === 'string').slice(0, 3) : [],
      // ★要素の中身まで確かめる★（配列かどうかだけ見ていたため、壊れた保存で
      //   g.join / g.map が例外を投げ、全画面の救済画面が出て遊べなくなっていた）
      ghosts: Array.isArray(got.ghosts)
        ? got.ghosts.filter(Array.isArray)
            .map((a) => a.filter((x) => typeof x === 'string').slice(0, 3))
            .slice(-GHOST_MAX)
        : [],
      daily: (got.daily && typeof got.daily === 'object') ? got.daily : {},
      trophies: clampInt(got.trophies, 0, 0xFFFFFFFF, 0),
      played: clampInt(got.played, 0, 9999999, 0),
      wins: clampInt(got.wins, 0, 9999999, 0),
    };
  } catch { return base; }
}

export function writeSave(save, storage = globalThis.localStorage) {
  try { storage && storage.setItem(SAVE_KEY, JSON.stringify(save)); return true; }
  catch { return false; }   // 容量超過やプライベートモード。遊べなくはしない
}

function clampInt(v, lo, hi, dflt) {
  const n = Number(v);
  if (!Number.isFinite(n)) return dflt;
  return Math.min(hi, Math.max(lo, Math.floor(n)));
}

// ── 端末側の設定（音など）─────────────────────────
export function loadDevice(storage = globalThis.localStorage) {
  const base = { sound: true, effects: 'normal' };   // effects: 'normal' | 'light'（演出ひかえめ）
  try {
    const got = safeParse(storage && storage.getItem(DEVICE_KEY), {});
    return { sound: got.sound !== false, effects: got.effects === 'light' ? 'light' : 'normal' };
  } catch { return base; }
}
export function writeDevice(dev, storage = globalThis.localStorage) {
  try { storage && storage.setItem(DEVICE_KEY, JSON.stringify(dev)); return true; } catch { return false; }
}

/**
 * CPUの強さの自動調整（§3-2）。
 * ★静的な難易度表にしない★——プレイヤーの様子を観測できない以上、固定値は「誰にも当たらない賭け」になる。
 *   直近5戦の勝率が70%超で1段上げ、30%未満で1段下げる。最弱・最強で止まる。
 */
export function adjustTier(tier, recent) {
  const last = recent.slice(-5);
  if (last.length < 5) return tier;                  // 5戦たまるまで動かさない
  const rate = last.filter(Boolean).length / last.length;
  if (rate > 0.7) return Math.min(TIER_MAX, tier + 1);
  if (rate < 0.3) return Math.max(1, tier - 1);
  return tier;
}

/** 1戦終わったときの更新。★負けても必ずかけらが増える★ */
export function recordMatch(save, { won, placed, captured, deck, countForTier = true }) {
  const gained = shardsForMatch({ placed, captured, won });
  // ★段位の自動調整に混ぜるのは「ふつうの対戦」だけ★
  //   デイリー（固定強度）・詰めルナ（1手詰め）・かげ戦（相手の編成が違う）を混ぜると、
  //   CPUの強さ合わせが狂う。かけら・戦績はどの遊び方でも貯まる
  const recent = countForTier ? [...save.recent, !!won].slice(-10) : save.recent;
  const next = {
    ...save,
    shards: save.shards + gained,
    played: save.played + 1,
    wins: save.wins + (won ? 1 : 0),
    recent,
    tier: countForTier ? adjustTier(save.tier, recent) : save.tier,
  };
  // じぶんのかげ（直近の自分の編成）。友達がいなくてもコードが意味を持つようにするための土台
  if (Array.isArray(deck) && deck.length) {
    const sig = deck.join(',');
    const ghosts = save.ghosts.filter((g) => g.join(',') !== sig);
    ghosts.push(deck.slice());
    next.ghosts = ghosts.slice(-GHOST_MAX);
  }
  return { save: next, gained };
}

/** いま使えるカードと枠（★解放条件は data/unlock.js だけが持つ★） */
export function currentUnlocks(save) {
  return unlockedAt(save.shards);
}

/** 持ち込みデッキを、いま解放されている範囲へ丸める（弾かない） */
export function sanitizeDeck(save, deck) {
  const { slots, cards } = currentUnlocks(save);
  return (deck || []).filter((id) => cards.includes(id)).slice(0, slots);
}

/** デイリーの記録（少ない手数ほどよい） */
export function recordDaily(save, date, moves, kind = 'best') {
  const daily = { ...save.daily };
  const cur = daily[date] || {};
  if (kind === 'tsume') daily[date] = { ...cur, tsume: true };
  else if (cur.best === undefined || moves < cur.best) daily[date] = { ...cur, best: moves };
  else return save;
  return { ...save, daily };
}

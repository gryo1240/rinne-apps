/**
 * ルナチェイン｜進み具合の保存と、CPUの強さの自動調整
 *
 * ★2026-09-08 大幅に縮小★
 *   オーナー指示でカード・つきのかけら（解放ポイント）・合言葉コードを撤去した。
 *   残すのは「何回あそんだ／何回かった／いちばん長いれんさ／日替わりの記録」と、
 *   CPUの強さ合わせに使う直近の勝敗だけ。**解放も報酬も無い。**
 *
 * ★引き継ぎコードも撤去した★
 *   運べる中身が「遊んだ回数」しか無くなったため。したがって
 *   **保存が消えたら記録は戻らない**。遊ぶこと自体は何も損なわれない（解放が無いので）。
 *
 * ★端末の設定（音・演出・予告）はセーブとは別のキーに置く★（教訓 app-device-setting-vs-save-setting）
 * ★壊れた保存で起動不能にしない★ 読めなければ初期値で続行する。エラー画面を出さない。
 */
import { TIER_MAX } from '../ai/ai.js';

const SAVE_KEY   = 'lunachain-v1-save';
const DEVICE_KEY = 'lunachain-v1-device';   // 端末単位の設定。セーブとは混ぜない

export function defaultSave() {
  return {
    v: 2,
    tier: 2,            // CPUの段位（1〜6）
    recent: [],         // 直近の勝敗（true=勝ち）。自動調整に使う
    daily: {},          // { 'YYYY-MM-DD': {best: 手数, tsume: true} }
    played: 0,          // 総対戦数
    wins: 0,
    bestChain: 0,       // いちばん長かったれんさ（★増えるだけの数字。報酬はつけない★）
    tutorialDone: false,
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
    const played = clampInt(got.played, 0, 9999999, 0);
    // ★欠けているキーは既定で埋める（古い保存・壊れた保存でも起動できるように）
    //   v1（カード時代）の保存が残っていても、余分なキーは無視して読み進む
    return {
      ...base,
      tier: clampInt(got.tier, 1, TIER_MAX, base.tier),
      recent: Array.isArray(got.recent) ? got.recent.slice(-10).map(Boolean) : [],
      daily: cleanDaily(got.daily),
      played,
      wins: clampInt(got.wins, 0, 9999999, 0),
      bestChain: clampInt(got.bestChain, 0, 9999, 0),
      // ★すでに遊んでいる人を練習に戻さない★
      tutorialDone: got.tutorialDone === undefined ? played > 0 : !!got.tutorialDone,
    };
  } catch { return base; }
}

export function writeSave(save, storage = globalThis.localStorage) {
  try { storage && storage.setItem(SAVE_KEY, JSON.stringify(save)); return true; }
  catch { return false; }   // 容量超過やプライベートモード。遊べなくはしない
}

/**
 * 日替わりの記録を、中身まで検証して作り直す。
 * ★「object かどうか」だけ見ていた★ ため、中の値が文字列のまま画面へ渡っていた。
 *   画面側は手数を innerHTML に入れるので、壊れた保存が入ると自分自身への攻撃経路になる
 *   （rinne-apps は1オリジンに全アプリが同居していて localStorage を共有している）。
 */
function cleanDaily(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
  const out = {};
  for (const [k, rec] of Object.entries(v)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(k)) continue;      // 日付の形をしていない鍵は捨てる
    if (!rec || typeof rec !== 'object') continue;
    const e = {};
    const best = Number(rec.best);
    if (Number.isFinite(best) && best > 0) e.best = Math.min(9999, Math.floor(best));
    if (rec.tsume) e.tsume = true;
    if (e.best !== undefined || e.tsume) out[k] = e;
  }
  return out;
}

function clampInt(v, lo, hi, dflt) {
  const n = Number(v);
  if (!Number.isFinite(n)) return dflt;
  return Math.min(hi, Math.max(lo, Math.floor(n)));
}

// ── 端末側の設定 ─────────────────────────────
export function loadDevice(storage = globalThis.localStorage) {
  const base = { sound: true, effects: 'normal', preview: true, coach: true, coachSeen: [] };
  try {
    const got = safeParse(storage && storage.getItem(DEVICE_KEY), {});
    return {
      sound: got.sound !== false,
      effects: got.effects === 'light' ? 'light' : 'normal',
      preview: got.preview !== false,   // れんさの よこく（既定オン）
      coach: got.coach !== false,       // 対戦中の あんない（既定オン）
      // ★書いたものを読み返すこと★
      //   ここで組み立て直しているので、返り値に足し忘れると
      //   「保存はされているのに毎回また最初から案内が出る」状態になる（2026-09-08のレビューで発覚）
      coachSeen: Array.isArray(got.coachSeen)
        ? got.coachSeen.filter((x) => typeof x === 'string').slice(0, 40)
        : [],
    };
  } catch { return base; }
}
export function writeDevice(dev, storage = globalThis.localStorage) {
  try { storage && storage.setItem(DEVICE_KEY, JSON.stringify(dev)); return true; } catch { return false; }
}

/**
 * CPUの強さの自動調整。
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

/** 1戦終わったときの更新 */
export function recordMatch(save, { won, maxChain = 0, countForTier = true }) {
  // ★段位の自動調整に混ぜるのは「ふつうの対戦」だけ★
  //   デイリー（固定強度）・詰めルナ（1手詰め）を混ぜるとCPUの強さ合わせが狂う
  const recent = countForTier ? [...save.recent, !!won].slice(-10) : save.recent;
  return {
    ...save,
    played: save.played + 1,
    wins: save.wins + (won ? 1 : 0),
    bestChain: Math.max(save.bestChain, maxChain | 0),
    recent,
    tier: countForTier ? adjustTier(save.tier, recent) : save.tier,
  };
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

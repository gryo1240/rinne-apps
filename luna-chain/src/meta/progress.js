/**
 * ルナチェイン｜進み具合の保存と、CPUの強さの自動調整
 *
 * ★2026-09-08 大幅に縮小★
 *   オーナー指示でカード・つきのかけら（解放ポイント）・合言葉コードを撤去した。
 *   残すのは「何回あそんだ／何回かった／いちばん長いれんさ」と、
 *   CPUの強さ合わせに使う直近の勝敗だけ。**解放も報酬も無い。**
 *   2026-09-08（3回目）に「きょうの月・詰めルナ」も撤去したので、日替わりの記録も無くなった。
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

/* ★日替わりの記録（daily）は 2026-09-08 に撤去した★
   オーナー指示「『きょうの月』は消そうか。代わりに二人対戦とかあった方が」により、
   きょうの月・詰めルナごと無くなったため。
   ★古い保存に daily が残っていても、明示的に消す処理は要らない★
     loadSave は「必要なキーだけを名指しで組み立てる」形（ホワイトリスト）なので、
     defaultSave から消した時点で、古い daily は自動的に落ちる。 */

function clampInt(v, lo, hi, dflt) {
  const n = Number(v);
  if (!Number.isFinite(n)) return dflt;
  return Math.min(hi, Math.max(lo, Math.floor(n)));
}

// ── 端末側の設定 ─────────────────────────────
/**
 * ★音量は 0=なし / 1=ちいさい / 2=おおきい の3段★
 *   スライダーにしない（子どもの指で input[type=range] は当てにくい）。
 *
 * ★古いキー sound（オン・オフのbool）との互換★
 *   2026-09-08 に BGM と効果音を別々に調整できるようにしたとき、
 *   すでに「音を切っていた人」が更新した瞬間に音が鳴り出さないよう、
 *   **sound:false の保存は seVol=0 / bgmVol=0 として読む**。
 *   返り値の sound は「どちらかが鳴っているか」の要約で、書き戻しにも使う（旧版へ戻しても静かなまま）。
 */
const clampVol = (v, dflt) => (v === 0 || v === 1 || v === 2 ? v : dflt);

export function loadDevice(storage = globalThis.localStorage) {
  const base = {
    sound: true, effects: 'normal', preview: true, coach: true, coachSeen: [],
    seVol: 2, bgmVol: 1, bgm: '',
  };
  try {
    const got = safeParse(storage && storage.getItem(DEVICE_KEY), {});
    const legacyOff = got.sound === false;
    const seVol = clampVol(got.seVol, legacyOff ? 0 : 2);
    const bgmVol = clampVol(got.bgmVol, legacyOff ? 0 : 1);
    return {
      seVol,
      bgmVol,
      // 曲のidは文字列としてだけ検証する。★どの曲があるかは audio.js が持つ★
      //   （保存の層が曲名表を持つと、曲を足すたびに2か所直すことになる）
      bgm: typeof got.bgm === 'string' ? got.bgm.slice(0, 40) : '',
      sound: seVol > 0 || bgmVol > 0,
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
  // ★段位の自動調整に混ぜるのは「CPUとのふつうの対戦」だけ★
  //   CPU以外の対戦（＝二人対戦）を混ぜるとCPUの強さ合わせが狂う。
  //   なお二人対戦は recordMatch 自体を呼ばない（勝率も汚さない）。ここはその保険
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

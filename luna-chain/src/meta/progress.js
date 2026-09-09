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
 * ★音量は 0〜100★（2026-09-08 オーナー指示でスライドバーにした）
 *   もとは 0=なし / 1=ちいさい / 2=おおきい の3段だった。
 *
 * ★古い保存を読み替える（2世代ぶんある）★
 *   1. いちばん古い … `sound` が true/false だけ。false なら両方0にする
 *   2. 3段だった頃 … `seVol`/`bgmVol` が 0/1/2。**そのまま読むと「2%」＝ほぼ無音になる**ので、
 *      版（`dv`）が無い保存は 0/1/2 を % に読み替える
 *   `dv` を見るのは「1と2が、3段の値なのか本当に1%・2%なのか区別できない」ため。
 *   ★音量の意味を変えるときは DEVICE_V を上げ、ここに読み替えを足すこと★
 */
import { DEF_W, DEF_H, MIN_W, MAX_W, MIN_H, MAX_H } from '../core/board.js';

/** 手動で強さを決めるときの初期値（まんなか） */
export const DEF_TIER = 3;

export const DEF_SE = 100;
export const DEF_BGM = 70;
const LEGACY_STEP = [0, 70, 100];    // 0=なし / 1=ちいさい / 2=おおきい を % に直した値

const clampPct = (v, dflt) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return dflt;
  return Math.min(100, Math.max(0, Math.round(n)));
};

/**
 * ★細かい値は「別のキー」に入れる（版番号で見分けない）★
 *
 *   3段の頃の `seVol` は 0/1/2、いまの値は 0〜100。**値域が重なる**ので、
 *   同じキーに入れると「2」が『おおきい』なのか『2%』なのか区別できない。
 *
 *   さらに Service Worker があるため、**同じ端末で新旧のコードが混ざりうる**。
 *   新しいコードが `seVol: 85` と書いた端末で古いコードが動くと、
 *   古い側は 0/1/2 しか受け付けないので既定の「2＝おおきい」に落ちる
 *   ＝ **音を絞っていた人がいきなり最大音量になる**。
 *
 *   → 細かい値は `seVolPct`/`bgmVolPct` に入れ、`seVol`/`bgmVol` には
 *     **丸めた 0/1/2 を書き続ける**。古いコードが読んでも安全な値しか目に入らない。
 */
function readVol(got, pctKey, stepKey, dflt) {
  const p = Number(got[pctKey]);
  if (Number.isFinite(p)) return clampPct(p, dflt);
  const step = got[stepKey];
  if (step === 0 || step === 1 || step === 2) return LEGACY_STEP[step];   // 3段だった頃
  if (got.sound === false) return 0;                                     // もっと古い保存
  return dflt;
}

/** 0〜100 を、古いコード向けの3段（0/1/2）に丸める */
const stepOf = (v) => (v <= 0 ? 0 : (v < 85 ? 1 : 2));

export function loadDevice(storage = globalThis.localStorage) {
  const base = {
    sound: true, effects: 'normal', preview: true, coach: true, coachSeen: [],
    seVol: DEF_SE, bgmVol: DEF_BGM, bgm: '',
    boardW: DEF_W, boardH: DEF_H,
    cpuAuto: true, cpuTier: DEF_TIER,
  };
  try {
    const got = safeParse(storage && storage.getItem(DEVICE_KEY), {});
    const seVol = readVol(got, 'seVolPct', 'seVol', DEF_SE);
    const bgmVol = readVol(got, 'bgmVolPct', 'bgmVol', DEF_BGM);
    return {
      seVol,
      bgmVol,
      // 曲のidは文字列としてだけ検証する。★どの曲があるかは audio.js が持つ★
      //   （保存の層が曲名表を持つと、曲を足すたびに2か所直すことになる）
      bgm: typeof got.bgm === 'string' ? got.bgm.slice(0, 40) : '',
      sound: seVol > 0 || bgmVol > 0,
      effects: got.effects === 'light' ? 'light' : 'normal',
      /* ★動きの扱い★（2026-09-09 オーナー指示「画面を揺らすはデフォルトでオンにしておいて」）
           'full'  … 揺らす（★既定★。端末が「動きを減らす」でも揺らす）
           'still' … 揺らさない
         ★既定オンはオーナーの判断★
           prefers-reduced-motion は本来「乗り物酔い・めまいがつらい人」のための設定で、
           既定で無視すると、その人に意図しない動きが出る。
           そのため **切るスイッチは必ず残す**（せってい >そのほか >「がめんを ゆらす」）。
           せってい画面には端末の状態も出しているので、気づいた人はすぐ切れる。
         ★'auto'（端末に従う）は 2026-09-09 に廃止★
           v1.8 で既定に使っていたが、オーナーの指示で既定オンにしたため、
           保存済みの 'auto' は 'full' として読む（古い保存で揺れないままにしない）。 */
      motion: got.motion === 'still' ? 'still' : 'full',
      preview: got.preview !== false,   // れんさの よこく（既定オン）
      coach: got.coach !== false,       // 対戦中の あんない（既定オン）
      // ★書いたものを読み返すこと★
      //   ここで組み立て直しているので、返り値に足し忘れると
      //   「保存はされているのに毎回また最初から案内が出る」状態になる（2026-09-08のレビューで発覚）
      coachSeen: Array.isArray(got.coachSeen)
        ? got.coachSeen.filter((x) => typeof x === 'string').slice(0, 40)
        : [],
      /* ★盤の大きさ★（2026-09-09）
         範囲外・数字でない値は必ず丸める。壊れた保存や、上限を下げたあとの古い保存で
         盤が作れなくなると、**遊べないまま何も表示されない**ことになる。
         丸める範囲の正本は board.js（ここに数字を書き写さない）。 */
      boardW: clampInt(got.boardW, MIN_W, MAX_W, DEF_W),
      boardH: clampInt(got.boardH, MIN_H, MAX_H, DEF_H),
      /* ★CPUの強さ★（2026-09-09）
         cpuAuto=true のあいだは save.tier（直近10戦から自動で動く段位）を使う。
         false にすると cpuTier で固定する。★自動と手動を同じ数字に持たせない★——
         1つの変数に2つの意味を持たせると、自動に戻したときに段位が壊れる。 */
      cpuAuto: got.cpuAuto !== false,
      cpuTier: clampInt(got.cpuTier, 1, TIER_MAX, DEF_TIER),
    };
  } catch { return base; }
}
/**
 * 端末の設定を書く。
 * ★音量は「細かい値(Pct)」と「古いコード向けの3段」の両方を書く★（readVol の説明を読むこと）
 */
export function writeDevice(dev, storage = globalThis.localStorage) {
  try {
    // 音量を渡さずに sound:false だけ渡された古い呼び方も、静かなままにする
    const off = dev.sound === false;
    const se = clampPct(dev.seVol, off ? 0 : DEF_SE);
    const bgm = clampPct(dev.bgmVol, off ? 0 : DEF_BGM);
    const out = {
      ...dev,
      seVolPct: se,
      bgmVolPct: bgm,
      seVol: stepOf(se),      // ★ここは 0/1/2 のまま★（古いコードが読んでも事故らない値）
      bgmVol: stepOf(bgm),
      sound: se > 0 || bgm > 0,
    };
    storage && storage.setItem(DEVICE_KEY, JSON.stringify(out));
    return true;
  } catch { return false; }   // 容量超過やプライベートモード。遊べなくはしない
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

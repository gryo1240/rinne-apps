/**
 * 時刻と月齢
 *
 * 【厳守】月齢の式は apps/tsuki-usagi/logic.js・apps/tsukimikuji と**完全に同じ**にする。
 * 同じ日付で違うフェーズを表示すると、りんねブログのアプリ群として信用を失う。
 * （test.mjs で既存実装と一致することを検証している）
 *
 * 仕様: rinne-tou-spec.md §5
 */

const SYNODIC = 29.530589;                                   // 平均朔望月(日)
const NEW_MOON_EPOCH_UTC = Date.UTC(2000, 0, 6, 18, 14, 0);  // 基準新月 2000-01-06 18:14 UTC
const DAY_MS = 86400000;

/** 月齢 0〜29.53（既存アプリと同一実装） */
export function moonAge(nowMs) {
  let days = (nowMs - NEW_MOON_EPOCH_UTC) / DAY_MS;
  let age = days % SYNODIC;
  if (age < 0) age += SYNODIC;
  return age;
}

/** 8区分（既存アプリと同一の境界値） */
export function moonPhase(age) {
  if (age < 1.0 || age >= 28.5) return 'new';
  if (age < 6.0) return 'crescent';
  if (age < 9.0) return 'firstQuarter';
  if (age < 13.8) return 'gibbous';
  if (age < 15.8) return 'full';
  if (age < 21.0) return 'waningGibbous';
  if (age < 24.0) return 'lastQuarter';
  return 'waningCrescent';
}

export const PHASE_NAMES = {
  new: '新月', crescent: '三日月', firstQuarter: '上弦', gibbous: '十三夜',
  full: '満月', waningGibbous: '十六夜', lastQuarter: '下弦', waningCrescent: '二十六夜',
};

export const PHASE_EMOJI = {
  new: '🌑', crescent: '🌒', firstQuarter: '🌓', gibbous: '🌔',
  full: '🌕', waningGibbous: '🌖', lastQuarter: '🌗', waningCrescent: '🌘',
};

/**
 * 月齢フェーズごとの塔の変化（spec §5・2026-08-02改訂）
 *
 * 【重要】有利不利になる数値補正は置かない（最大±5%まで）。
 * 「内容が変わる」変化（構えの偏り・ノード出現率・限定素材）だけで表現する。
 * 周期が29.53日と長いため、有利不利があると不公平感が出るというオーナー判断による。
 */
export const PHASE_EFFECT = {
  new:            { desc: '常闇の階が出やすい',     stanceBias: null,     node: { tokoyami: 1.5 },  material: 'yamigoke',   materialName: '闇苔' },
  crescent:       { desc: '怪異が少し増える',       stanceBias: null,     node: { kaii: 1.2 },      material: 'shogen',     materialName: '初弦の砂' },
  firstQuarter:   { desc: '【疾】の敵が増える',     stanceBias: 'shitsu', node: {},                 material: 'shippu',     materialName: '疾風の羽' },
  gibbous:        { desc: '宝が増え商人が減る',     stanceBias: null,     node: { takara: 1.3, akindo: 0.7 }, material: 'yoimachi', materialName: '宵待ちの実' },
  full:           { desc: '【剛】の敵が増える',     stanceBias: 'gou',    node: {},                 material: 'michi',      materialName: '満ちの雫' },
  waningGibbous:  { desc: '祠が少し増える',         stanceBias: null,     node: { hokora: 1.3 },    material: 'izayoi',     materialName: '十六夜の灰' },
  lastQuarter:    { desc: '【呪】の敵が増える',     stanceBias: 'ju',     node: {},                 material: 'kake',       materialName: '欠けの欠片' },
  waningCrescent: { desc: '影送りに「夜道」が出る', stanceBias: null,     node: {},                 material: 'ariake',     materialName: '有明の露' },
};

/** 次のフェーズに変わるまでの日数（表示用・切り上げ） */
export function daysToNextPhase(age) {
  const bounds = [1.0, 6.0, 9.0, 13.8, 15.8, 21.0, 24.0, 28.5, SYNODIC];
  for (const b of bounds) if (age < b) return Math.max(1, Math.ceil(b - age));
  return 1;
}

// ── 経過時間の検証（影送り・spec §7-3） ────────────────────
// ★選べる最長の影送りと同じ長さにそろえる（2026-08-13 に 12h → 20h）。
//   `rules.js` の DISPATCH_CAP_HOURS と同じ値。import しないのは、
//   core どうしの依存を増やさないため（片方を変えたら両方直すこと）
export const DISPATCH_CAP_MS = 20 * 3600 * 1000;

/**
 * 前回確認時刻からの経過ミリ秒を、安全側に丸めて返す。
 * - 時計を巻き戻した場合は 0（不正を無効化。時差移動の誤検知も「0」で済むので実害が小さい）
 * - 1回の受け取り上限は20時間（＝選べる最長の影送り）
 */
export function elapsedSince(lastSeenAt, now) {
  if (!Number.isFinite(lastSeenAt) || !Number.isFinite(now)) return 0;
  const diff = now - lastSeenAt;
  if (diff <= 0) return 0;
  return Math.min(diff, DISPATCH_CAP_MS);
}

/** ISO週番号（週間ランキングのキー "2026-W32" 用） */
export function isoWeekKey(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

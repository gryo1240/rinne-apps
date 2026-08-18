/**
 * 仲間キャラクターの基礎値と成長テーブル（spec §6-1 / §9-2）
 * ここは純データ。ロジックを書かない。
 */

export const CHARS = [
  {
    id: 'hero', name: 'ともし', mon: '灯', color: '#e8c46a',
    role: '万能（破・流・封のどれも扱える）', line: 'all', joins: 0,
    base: { hp: 120, ki: 24, atk: 14, def: 12, spd: 13, mag: 12, luk: 12 },
    grow: { hp: 14, ki: 3, atk: 3, def: 3, spd: 3, mag: 3, luk: 3 },
    meguri: 1,
    skills: ['s_kiru', 'atk_normal'],
    // 万能＝三系統を一通り。破しか無かったので、流・封・全体をここで足す
    // ★50/60/80 は高位の技（2026-08-13。やりこみ用。data/skills.js の末尾）
    learn: [{ lv: 6, id: 's_tomoshikaeshi' }, { lv: 14, id: 's_tomoshitsugi' },
      { lv: 24, id: 's_tomoshidachi' }, { lv: 34, id: 's_tomoshibi' },
      { lv: 50, id: 's_hitsuranuki' }, { lv: 60, id: 's_higoromo' }, { lv: 80, id: 's_mandou' }],
  },
  {
    id: 'suzu', name: '鈴', mon: '鈴', color: '#7fb0d8',
    role: '回復・支援【封】', line: 'fu', joins: 1,
    base: { hp: 92, ki: 34, atk: 8, def: 11, spd: 14, mag: 20, luk: 14 },
    grow: { hp: 10, ki: 5, atk: 1, def: 2, spd: 3, mag: 5, luk: 4 },
    meguri: 2,
    skills: ['s_himoro', 's_shizume', 'atk_normal'],
    learn: [{ lv: 12, id: 's_haraibell' }, { lv: 26, id: 's_kotohogi' },
      { lv: 50, id: 's_suzuhibiki' }, { lv: 60, id: 's_kotoshizume' }, { lv: 80, id: 's_kagurasuzu' }],
  },
  {
    id: 'kuroha', name: '黒羽', mon: '羽', color: '#8f7fd8',
    role: '速攻・会心【破】', line: 'ha', joins: 2,
    base: { hp: 104, ki: 22, atk: 16, def: 10, spd: 22, mag: 9, luk: 18 },
    grow: { hp: 11, ki: 3, atk: 4, def: 2, spd: 6, mag: 2, luk: 4 },
    meguri: 0,
    skills: ['s_kazakiri', 'atk_normal'],
    learn: [{ lv: 10, id: 's_tsubame' }, { lv: 20, id: 's_hagarami' }, { lv: 30, id: 's_karasumure' },
      { lv: 50, id: 's_hayabusaotoshi' }, { lv: 60, id: 's_kurohagaeshi' }, { lv: 80, id: 's_gunwa' }],
  },
  {
    id: 'isurugi', name: '石動', mon: '岩', color: '#9a9a8a',
    role: '盾・挑発【流】', line: 'ryu', joins: 3,
    base: { hp: 178, ki: 16, atk: 15, def: 24, spd: 7, mag: 5, luk: 7 },
    grow: { hp: 20, ki: 2, atk: 4, def: 6, spd: 1, mag: 1, luk: 1 },
    meguri: -1,
    skills: ['s_iwato', 's_kabau', 'atk_normal'],
    learn: [{ lv: 14, id: 's_iwaoshi' }, { lv: 28, id: 's_jibiki' },
      { lv: 50, id: 's_iwaotoshi' }, { lv: 60, id: 's_fudou' }, { lv: 80, id: 's_jiware' }],
  },
  {
    id: 'kitsunebi', name: '狐火', mon: '狐', color: '#e07a5f',
    role: '全体術・デバフ【破(術)】', line: 'ha', joins: 4,
    base: { hp: 88, ki: 30, atk: 7, def: 10, spd: 15, mag: 23, luk: 13 },
    grow: { hp: 9, ki: 4, atk: 1, def: 2, spd: 3, mag: 6, luk: 3 },
    meguri: 1,
    skills: ['s_kitsunebi', 'atk_normal'],
    learn: [{ lv: 10, id: 's_hinotama' }, { lv: 22, id: 's_kagerou' }, { lv: 32, id: 's_ookitsunebi' },
      { lv: 50, id: 's_byakko' }, { lv: 60, id: 's_kitsunebijin' }, { lv: 80, id: 's_kyubi' }],
  },
  {
    id: 'yori', name: '縒', mon: '糸', color: '#c9a227',
    role: '拘束・バフ・連携【封】', line: 'fu', joins: 5,
    base: { hp: 110, ki: 28, atk: 11, def: 13, spd: 17, mag: 15, luk: 20 },
    grow: { hp: 12, ki: 4, atk: 2, def: 3, spd: 4, mag: 3, luk: 5 },
    meguri: 1,
    skills: ['s_itogarami', 'atk_normal'],
    learn: [{ lv: 12, id: 's_itoyose' }, { lv: 22, id: 's_nawame' }, { lv: 32, id: 's_yorinaoshi' },
      { lv: 50, id: 's_chijinoito' }, { lv: 60, id: 's_musubinaoshi' }, { lv: 80, id: 's_yorinoo' }],
  },
  {
    id: 'mumei', name: '無銘', mon: '銘', color: '#b8b8c8',
    // ★「（終盤加入）」は書かない（2026-08-12 オーナー指示）。
    //   出会う前から「この人は終盤に入る」と画面に出ているのは、物語の外側の情報。
    role: '全系統・器用貧乏', line: 'all', joins: 6,
    base: { hp: 126, ki: 26, atk: 16, def: 14, spd: 16, mag: 16, luk: 9 },
    grow: { hp: 13, ki: 3, atk: 4, def: 3, spd: 4, mag: 4, luk: 2 },
    meguri: 0,
    skills: ['s_kiru', 's_nagashi', 'atk_normal'],
    // 万能。縒の言う「他の六本を束ねる芯」なので、どの穴にも入れる形にする
    learn: [{ lv: 5, id: 's_nawofusu' }, { lv: 15, id: 's_sayabashiri' }, { lv: 25, id: 's_mumeigiri' },
      { lv: 50, id: 's_mumeigaeshi' }, { lv: 60, id: 's_meinashidachi' }, { lv: 80, id: 's_kuunohitofuri' }],
  },
];

export const CHAR_BY_ID = Object.fromEntries(CHARS.map((c) => [c.id, c]));

/**
 * **仲間ではないが会話に出る人**（2026-08-12 オーナー指示で紬の立ち絵を入れたため）。
 *
 * ★`CHARS` に足してはいけない。あちらは編成・レベル・装備・影送り・図鑑が
 *   すべて参照する「操作できる仲間」の一覧なので、紬を混ぜると
 *   **編成画面に出てきて塔へ連れて行けてしまう**（ステータスも成長表も無いのに）。
 * ★ここにあるのは会話に必要な4つだけ（id・名前・紋・色）。
 *   立ち絵は `assets/chara/<id>.png`＋`art-manifest.js` の登録で出る。
 */
export const EXTRA_CAST = [
  { id: 'tsumugi', name: '紬', mon: '紬', color: '#b8a07a' },
];

/** 会話の話し手として引ける全員（仲間＋それ以外）。screen_talk はこれを使う */
export const SPEAKER_BY_ID = Object.fromEntries(
  [...CHARS, ...EXTRA_CAST].map((c) => [c.id, c]));

/** レベルに応じたステータス（成長テーブルの線形。乱数は使わない＝決定論） */
export function statsAt(charId, lv, renki = {}) {
  const c = CHAR_BY_ID[charId];
  if (!c) throw new Error(`不明なキャラ: ${charId}`);
  const n = Math.max(0, lv - 1);
  const s = {};
  for (const k of ['hp', 'ki', 'atk', 'def', 'spd', 'mag', 'luk']) {
    s[k] = c.base[k] + c.grow[k] * n + (renki[k] || 0);
  }
  return s;
}

/**
 * そのレベルで使える技（2026-08-12 オーナー要望
 * 「各キャラはレベルに応じて技を増やすようにしましょう」）。
 *
 * ★**基本の技のあとに、覚えた順で足す**（並べ替えない）。
 *   `battle/ai.js` は同点のとき先に出てきた技を採るので、並びを変えると
 *   既存の戦闘の再現性（ゴールデンログ）が理由もなく動く。
 * ★戦闘に持ち込めるのは **`engine.js` の MAX_SKILLS（いま9）まで**（makeAlly が slice する）。
 *   `learn` を足すときは **基本＋習得 ≤ MAX_SKILLS** を守ること。
 *   はみ出した分は黙って捨てられ、しかも落ちるのは**後ろ＝新しく覚えた強い技**のほう。
 *   `test.mjs` §27 が全員ぶんを機械的に見ている。
 */
export function skillsAt(charId, lv) {
  const c = CHAR_BY_ID[charId];
  if (!c) return ['atk_normal'];
  const got = (c.learn || []).filter((x) => (lv || 1) >= x.lv).map((x) => x.id);
  return [...c.skills, ...got];
}

/** そのレベルちょうどで覚える技。レベルアップの報告に使う */
export function learnedAt(charId, lv) {
  return (CHAR_BY_ID[charId]?.learn || []).filter((x) => x.lv === lv).map((x) => x.id);
}

/** from+1 〜 to のあいだに覚えた技（潜行の精算でまとめて上がるため範囲で聞く） */
export function learnedBetween(charId, from, to) {
  return (CHAR_BY_ID[charId]?.learn || [])
    .filter((x) => x.lv > from && x.lv <= to).map((x) => x.id);
}

/** 次に覚える技（編成画面の「あと何レベル」表示用）。無ければ null */
export function nextLearn(charId, lv) {
  const list = (CHAR_BY_ID[charId]?.learn || []).filter((x) => x.lv > (lv || 1));
  if (list.length === 0) return null;
  return list.reduce((a, b) => (a.lv <= b.lv ? a : b));
}

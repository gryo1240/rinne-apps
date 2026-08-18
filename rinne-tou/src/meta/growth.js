/**
 * 成長まわり（装備・銘強化・錬気）
 *
 * spec §6-2（装備）／§6-2-b（深層専用装備）／§6-3（錬気）
 * DOM非依存。セーブに入る装備は数値タプルで持つ（サイズ削減・spec §12-3）。
 *
 *   装備タプル: [uid, baseId索引, prefix索引, suffix索引, plus, seed]
 */

import * as R from '../core/rules.js';
import { makeRng } from '../core/rng.js';
import { PHASE_EFFECT } from '../core/time.js';
import { SPECIES } from '../../data/enemies.js';
import { BASES, PREFIXES, SUFFIXES, RARITY } from '../../data/equips.js';
import { statsAt, CHAR_BY_ID } from '../../data/chars.js';
import { bonusOf as boardBonus } from './board.js';

export const INV_MAX = 500;   // インベントリ上限（無限に増やさない・spec §12-3）

/** 素材の表示名。結果画面と影送りの「祠の文」が同じ名前を出すために共有する */
export const MAT_NAME = {
  enhance_stone: '鍛冶石',
  // ★「錬気の素材」からの改名（2026-08-16 オーナー指示「〜の素材というのが気に入らない」）。
  //   もう一方の素材が「鍛冶石」なので、同じ短い複合語にそろえた。
  renki_mat: '錬気玉',
  ...Object.fromEntries(Object.values(PHASE_EFFECT).map((p) => [p.material, p.materialName])),
};

export const LV_MAX = R.LV_HARD_MAX;   // 到達しうる最大（輪廻を重ねた先）

/**
 * 敵図鑑の達成率（%）。上級作戦「読み切れ」の解放条件（50%）に使う。
 *
 * ★**1か所に置くこと**（2026-08-12）。以前は screen_party.js が
 *   `found / 24` で計算し（種族は33種あるので分母が違う）、
 *   探索画面と戦闘画面は `dexPct: 0` を渡していた。
 *   その結果、編成では選べるのに潜行中の作戦欄には出ない、という食い違いが起きていた。
 */
export function dexPercent(save) {
  const found = Object.keys(save?.dex?.enemies || {}).length;
  return Math.min(100, Math.round((found / Math.max(1, SPECIES.length)) * 100));
}

/**
 * そのセーブでいま上げられるレベルの上限（spec §6-1）。
 *
 * ★`Math.max(cap, 現在Lv)` にしてあるのは、上限を**あとから**入れたため。
 *   これまで一律120だったので、既に60を超えているセーブがありうる。
 *   上限を理由に**いま持っているレベルを下げることは絶対にしない**。
 */
export function levelCapOf(save, charId) {
  const cap = R.levelCap(save?.progress?.rebirth || 0);
  return Math.max(cap, save?.chars?.[charId]?.lv || 1);
}

/**
 * 経験値を渡してレベルアップまで処理する。
 *
 * 潜行の精算（dungeon/explore.js）と影送りの収穫（meta/dispatch.js）が
 * **同じ処理を通る**ようにするために切り出してある。
 * ここを二重に書くと、片方だけ上限やレートが変わって静かにズレる。
 *
 * @returns {{from:number, to:number, gained:number, capped:boolean}}
 *   capped: 上限に達していて、これ以上レベルが上がらない状態
 */
export function gainExp(save, charId, amount) {
  const c = save.chars[charId] || (save.chars[charId] = { lv: 1, exp: 0, renki: {}, skills: {}, equip: [0, 0, 0] });
  const from = c.lv;
  const cap = levelCapOf(save, charId);
  c.exp = (c.exp || 0) + Math.max(0, Math.floor(amount));
  while (c.exp >= R.needExp(c.lv) && c.lv < cap) { c.exp -= R.needExp(c.lv); c.lv++; }
  return { from, to: c.lv, gained: Math.max(0, Math.floor(amount)), capped: c.lv >= cap };
}

/** 装備を1つ生成する */
export function rollEquip({ seed, floor, slot = null, luckBonus = 0 }) {
  const rng = makeRng(seed);
  const pool = BASES.filter((b) => (!slot || b.slot === slot) && floor >= b.f[0] && floor <= b.f[1]);
  const base = rng.pick(pool.length ? pool : BASES);

  // 深い階ほど良い接辞が出やすい
  const bias = 1 + floor / 60 + luckBonus / 100;
  const weight = (a) => a.w * Math.pow(bias, a.rarity);
  const prefix = rng.weighted(PREFIXES.map((p) => ({ w: weight(p), v: p }))).v;
  const suffix = rng.weighted(SUFFIXES.map((s) => ({ w: weight(s), v: s }))).v;

  return {
    uid: 0,
    baseId: base.id, prefixId: prefix.id, suffixId: suffix.id,
    plus: 0,
    lv: Math.max(1, floor),      // 発見階層。ステータスのスケールに使う
  };
}

/** タプル ⇄ オブジェクト（セーブサイズ削減） */
export function packEquip(e) {
  return [e.uid, BASES.findIndex((b) => b.id === e.baseId), PREFIXES.findIndex((p) => p.id === e.prefixId),
    SUFFIXES.findIndex((s) => s.id === e.suffixId), e.plus, e.lv];
}
export function unpackEquip(t) {
  return { uid: t[0], baseId: BASES[t[1]]?.id, prefixId: PREFIXES[t[2]]?.id, suffixId: SUFFIXES[t[3]]?.id, plus: t[4], lv: t[5] };
}

export function equipName(e) {
  const b = BASES.find((x) => x.id === e.baseId);
  const p = PREFIXES.find((x) => x.id === e.prefixId);
  const s = SUFFIXES.find((x) => x.id === e.suffixId);
  if (!b) return '?';
  return `${p?.name || ''}${b.name}${s?.name || ''}${e.plus > 0 ? ` +${e.plus}` : ''}`;
}

export function equipRarity(e) {
  const p = PREFIXES.find((x) => x.id === e.prefixId);
  const s = SUFFIXES.find((x) => x.id === e.suffixId);
  return Math.max(p?.rarity || 0, s?.rarity || 0);
}

/**
 * 装備1つの効果を数値にまとめる。
 * 発見階層と銘強化の+値でスケールする。
 */
export function equipEffect(e) {
  const b = BASES.find((x) => x.id === e.baseId);
  const p = PREFIXES.find((x) => x.id === e.prefixId);
  const s = SUFFIXES.find((x) => x.id === e.suffixId);
  const out = { hp: 0, ki: 0, atk: 0, def: 0, spd: 0, mag: 0, luk: 0, meguri: 0, crushBonus: 0, akariCut: 0, dispatch: 0, resist: 0 };
  if (!b) return out;

  const floorScale = 1 + (e.lv || 1) * R.EQUIP_FLOOR_SCALE;   // 深い階の装備ほど強い
  const plusMul = R.enhanceMul(e.plus || 0);

  for (const src of [b.s, p?.s, s?.s]) {
    if (!src) continue;
    for (const [k, v] of Object.entries(src)) {
      if (out[k] == null) continue;
      out[k] += Math.round(v * floorScale * plusMul);
    }
  }
  for (const src of [p, s]) {
    if (!src) continue;
    out.meguri += src.meguri || 0;
    out.crushBonus += src.crushBonus || 0;
    out.akariCut += src.akariCut || 0;
    out.dispatch += src.dispatch || 0;
    out.resist += src.resist || 0;
  }
  return out;
}

/** キャラ1人の装備を合算する */
export function equipTotals(save, charId) {
  const c = save.chars[charId];
  const total = { hp: 0, ki: 0, atk: 0, def: 0, spd: 0, mag: 0, luk: 0, meguri: 0, crushBonus: 0, akariCut: 0, dispatch: 0, resist: 0 };
  if (!c || !c.equip) return total;
  for (const uid of c.equip) {
    if (!uid) continue;
    const t = (save.inv.equips || []).find((x) => x[0] === uid);
    if (!t) continue;
    const eff = equipEffect(unpackEquip(t));
    for (const k of Object.keys(total)) total[k] += eff[k] || 0;
  }
  // 「気の巡り」は**装備由来ぶんだけ**を +3 で頭打ちにする（spec §3-5）。
  // キャラ固有の素の値（鈴+2 など）は個性なので別枠。装備で無制限に積めると
  // 「気が足りない→通常攻撃で溜めるか？」という戦闘中の判断が消えてしまう。
  total.meguri = Math.min(R.KI_MEGURI_CAP, total.meguri);
  return total;
}

/** 装備・錬気・因果盤を含んだ最終ステータス */
export function finalStats(save, charId) {
  const c = save.chars[charId] || { lv: 1, renki: {} };
  const base = statsAt(charId, c.lv, c.renki || {});
  const eq = equipTotals(save, charId);
  const bd = boardBonus(save);                       // 因果盤（spec §6-5）
  const out = {};
  for (const k of ['hp', 'ki', 'atk', 'def', 'spd', 'mag', 'luk']) {
    out[k] = Math.max(1, base[k] + (eq[k] || 0) + bd.stat);
  }
  out.hp = Math.max(1, Math.round(out.hp * bd.hpMul));   // 「命の因」は最大HPの倍率
  out.meguri = (CHAR_BY_ID[charId]?.meguri || 0) + eq.meguri;
  out.crushBonus = eq.crushBonus;
  out.akariCut = eq.akariCut;
  out.dispatch = eq.dispatch;
  out.resist = Math.min(80, eq.resist);       // 状態異常耐性は80%が上限
  return out;
}

/** インベントリに追加。上限を超えたら追加しない（呼び出し側が売却を促す） */
export function addEquip(save, equip) {
  save.inv.equips = save.inv.equips || [];
  if (save.inv.equips.length >= INV_MAX) return { ok: false, reason: 'full' };
  const uid = (save.inv.nextUid = (save.inv.nextUid || 1) + 1);
  const e = { ...equip, uid };
  save.inv.equips.push(packEquip(e));
  return { ok: true, uid, equip: e };
}

/** 装備する（同じ枠に既に付いていれば外す） */
export function equipTo(save, charId, uid) {
  const c = save.chars[charId];
  if (!c) return { ok: false, reason: 'nochar' };
  const t = (save.inv.equips || []).find((x) => x[0] === uid);
  if (!t) return { ok: false, reason: 'noitem' };
  const e = unpackEquip(t);
  const base = BASES.find((b) => b.id === e.baseId);
  if (!base) return { ok: false, reason: 'nobase' };
  const idx = { weapon: 0, armor: 1, charm: 2 }[base.slot];
  c.equip = c.equip || [0, 0, 0];
  // 他のキャラが装備していたら外す（1つの装備を2人が持てない）
  for (const other of Object.values(save.chars)) {
    if (!other.equip) continue;
    const i = other.equip.indexOf(uid);
    if (i >= 0) other.equip[i] = 0;
  }
  const prev = c.equip[idx];
  c.equip[idx] = uid;
  return { ok: true, unequipped: prev || null };
}

export function unequip(save, charId, slotIndex) {
  const c = save.chars[charId];
  if (!c || !c.equip) return { ok: false };
  const prev = c.equip[slotIndex];
  c.equip[slotIndex] = 0;
  return { ok: true, unequipped: prev || null };
}

/** 売却（銭になる。装備している物は売れない） */
export function sellEquip(save, uid) {
  for (const c of Object.values(save.chars)) {
    if (c.equip && c.equip.includes(uid)) return { ok: false, reason: 'equipped' };
  }
  const i = (save.inv.equips || []).findIndex((x) => x[0] === uid);
  if (i < 0) return { ok: false, reason: 'noitem' };
  const e = unpackEquip(save.inv.equips[i]);
  const price = Math.floor((10 + e.lv * 4) * (1 + equipRarity(e)) * (1 + e.plus * 0.3));
  save.inv.equips.splice(i, 1);
  save.inv.zeni = (save.inv.zeni || 0) + price;
  return { ok: true, price };
}

/**
 * 装備を**まとめて**売る（2026-08-14 オーナー指示
 * 「装備が増えてきて、売るのが大変。フィルター機能や一括ボタンをつけてくれない？
 *   稀とか珍とか、常の道具を一括で売れるようにしてほしい」）。
 *
 * ★装備中のものは**必ず残す**。`sellEquip` が弾くので、ここでは数えるだけにする。
 *   自前で判定を書き直すと、片方だけ直したときに「装備が消える」事故になる。
 * ★どれを売るかは呼び元が決める（稀少度でも枠でも同じ関数で通せるように）。
 * @param {(e:object)=>boolean} pred 売る対象なら true
 * @returns {{sold:number, gained:number, kept:number}} kept＝対象だが装備中で残した数
 */
export function sellEquipsWhere(save, pred) {
  let sold = 0; let gained = 0; let kept = 0;
  // ★先に uid を集めてから売る。売ると `save.inv.equips` が縮むので、
  //   走査しながら消すと1つ飛ばしになる
  const uids = (save.inv.equips || []).map(unpackEquip).filter(pred).map((e) => e.uid);
  for (const uid of uids) {
    const r = sellEquip(save, uid);
    if (r.ok) { sold++; gained += r.price; } else kept++;
  }
  return { sold, gained, kept };
}

/** まとめ売りの下見（売る前に「何点で何文になるか」を出す） */
export function sellPreview(save, pred) {
  const equipped = new Set();
  for (const c of Object.values(save.chars)) for (const uid of c.equip || []) if (uid) equipped.add(uid);
  let count = 0; let gained = 0; let kept = 0;
  for (const t of save.inv.equips || []) {
    const e = unpackEquip(t);
    if (!pred(e)) continue;
    if (equipped.has(e.uid)) { kept++; continue; }
    count++;
    gained += Math.floor((10 + e.lv * 4) * (1 + equipRarity(e)) * (1 + e.plus * 0.3));
  }
  return { count, gained, kept };
}

// ── 銘強化（鍛冶） ────────────────────────────────────────

export const ENHANCE_MAX = 10;
export const STONE = 'enhance_stone';

/** @returns {{ok:boolean, cost?:number, reason?:string}} */
/**
 * その装備を鍛えるのに要る**月齢素材のid**（`data/equips.js` の `mat`）。
 * ★ベースが持つ。「装備品によって使う素材を分ける」（2026-08-12 オーナー指示）の実体はここ。
 */
export function enhanceMatOf(e) {
  const base = BASES.find((b) => b.id === (e && e.baseId));
  return base ? base.mat : null;
}

export function enhance(save, uid) {
  const t = (save.inv.equips || []).find((x) => x[0] === uid);
  if (!t) return { ok: false, reason: 'noitem' };
  const e = unpackEquip(t);
  if (e.plus >= ENHANCE_MAX) return { ok: false, reason: 'max' };
  const cost = R.enhanceCost(e.plus);
  const have = save.inv.mats?.[STONE] || 0;
  if (have < cost) return { ok: false, reason: 'material', need: cost, have };
  // ★月齢素材（2026-08-12）。**石を引く前に両方そろっているか見る**。
  //   先に石を引いてから月齢素材で弾くと、失敗したのに石だけ減る
  const matId = enhanceMatOf(e);
  const moonNeed = R.enhanceMoonCost(e.plus);
  const moonHave = save.inv.mats?.[matId] || 0;
  if (matId && moonHave < moonNeed) {
    return { ok: false, reason: 'moon', matId, need: moonNeed, have: moonHave };
  }
  /**
   * ★銭（2026-08-13 オーナー指示「鍛冶だけど、銭も使うようにしよう。銭が余り過ぎる」）。
   *   **引く前に3つとも足りているか見る**。片方を引いてから別の理由で弾くと、
   *   失敗したのに石だけ減る（月齢素材を足したときに一度踏みかけた形）。
   */
  const zeniNeed = R.enhanceZeni(e.plus, e.lv || 1);
  const zeniHave = save.inv.zeni || 0;
  if (zeniHave < zeniNeed) return { ok: false, reason: 'zeni', need: zeniNeed, have: zeniHave };

  save.inv.mats[STONE] = have - cost;
  if (matId) save.inv.mats[matId] = moonHave - moonNeed;
  save.inv.zeni = zeniHave - zeniNeed;
  e.plus += 1;                       // 失敗なし（理不尽なストレスを作らない・spec §6-2）
  const packed = packEquip(e);
  for (let i = 0; i < t.length; i++) t[i] = packed[i];
  return { ok: true, cost, moonCost: moonNeed, matId, zeniCost: zeniNeed, plus: e.plus };
}

/**
 * 銘強化をまとめて進める（2026-08-11・スライダー化にともなって追加）。
 *
 * ★中身は1回ぶんの `enhance()` を回すだけにする。石の判定や+10の頭打ちをここに
 *   書き写すと、片方だけ直したときに静かにズレる（錬気の `renkiMany` と同じ方針）。
 * ★途中で石が足りなくなっても**そこまでは成立させる**（巻き戻さない）。
 */
export function enhanceMany(save, uid, times) {
  const want = Math.max(0, Math.floor(times) || 0);
  let done = 0;
  let spent = 0;
  let moonSpent = 0;
  let zeniSpent = 0;
  let stopped = null;
  for (let i = 0; i < want; i++) {
    const r = enhance(save, uid);
    if (!r.ok) { stopped = r; break; }
    done++;
    spent += r.cost;
    moonSpent += r.moonCost || 0;
    zeniSpent += r.zeniCost || 0;
  }
  if (done === 0) return stopped || { ok: false, reason: 'none' };
  const t = (save.inv.equips || []).find((x) => x[0] === uid);
  return { ok: true, done, spent, moonSpent, zeniSpent, plus: t ? unpackEquip(t).plus : null, stopped };
}

// ── 錬気（ステータス個別強化） ────────────────────────────

export const RENKI_KEYS = ['hp', 'ki', 'atk', 'def', 'spd', 'mag', 'luk'];
export const RENKI_MAT = 'renki_mat';

/** 錬気で1ポイント上げる。上限は輪廻回数で伸びる */
export function renki(save, charId, key) {
  if (!RENKI_KEYS.includes(key)) return { ok: false, reason: 'key' };
  const c = save.chars[charId];
  if (!c) return { ok: false, reason: 'nochar' };
  c.renki = c.renki || {};
  const cur = c.renki[key] || 0;
  const max = renkiMaxOf(save);
  if (cur >= max) return { ok: false, reason: 'max', max };
  const cost = R.renkiCost(cur);
  const have = save.inv.mats?.[RENKI_MAT] || 0;
  if (have < cost) return { ok: false, reason: 'material', need: cost, have };
  save.inv.mats[RENKI_MAT] = have - cost;
  // HPと気は1ポイントあたりの伸びを大きくする（1では体感できないため）
  c.renki[key] = cur + 1;
  return { ok: true, cost, value: c.renki[key], max };
}

/**
 * 錬気の上限（輪廻回数 ＋ 因果盤の加算）。
 *
 * ★**画面はここを呼ぶこと**。`R.renkiMax()` だけを見ると因果盤の「錬気の上限 +N」が
 *   反映されず、盤で開けたぶんが一生使えない（2026-08-10 に実際そうなっていた）。
 *   上限の計算を2か所に書かないための1つの入口。
 */
export function renkiMaxOf(save) {
  return R.renkiMax(save?.progress?.rebirth || 0) + boardBonus(save).renkiMax;
}

/**
 * 錬気をまとめて上げる（2026-08-10・スライダー化にともなって追加）。
 *
 * ★中身は1回ぶんの `renki()` を回すだけにする。上限・素材の判定をここに書き写すと、
 *   片方だけ直したときに静かにズレる。
 * ★途中で足りなくなっても**そこまでは成立させる**（巻き戻さない）。
 *   `done` を見て画面が「何ポイント上がったか」を出す。
 */
export function renkiMany(save, charId, key, times) {
  const want = Math.max(0, Math.floor(times) || 0);
  let done = 0;
  let spent = 0;
  let stopped = null;
  for (let i = 0; i < want; i++) {
    const r = renki(save, charId, key);
    if (!r.ok) { stopped = r; break; }
    done++;
    spent += r.cost;
  }
  if (done === 0) return stopped || { ok: false, reason: 'none' };
  return { ok: true, done, spent, value: save.chars[charId].renki[key], stopped };
}

/** 錬気の合計（影送りの探査力に使う） */
export function renkiTotal(save, charId) {
  const r = save.chars[charId]?.renki || {};
  return Object.values(r).reduce((a, v) => a + v, 0);
}

/**
 * 装備の「合計効果値」（spec §7-2 の探査力に使う1つの数値）
 *
 * HPは他のステータスより1桁大きいので、そのまま足すとHPだけで決まってしまう。
 * 実質的に「攻守速術運＋気」で見て、HPは1/10、気は1/2 に均してから足す。
 */
export function equipValue(save, charId) {
  const t = equipTotals(save, charId);
  const main = (t.atk || 0) + (t.def || 0) + (t.spd || 0) + (t.mag || 0) + (t.luk || 0);
  return Math.max(0, main + Math.floor((t.hp || 0) / 10) + Math.floor((t.ki || 0) / 2));
}

// ── おすすめ装備（UIと自動プレイシミュレーターが共有する） ──────
//
// 【なぜ共有するか】
// 「UIとシミュレーターが同じ関数を使うから測定値が信頼できる」というのが
// 本作のバランス設計の根拠（tech-design §7-2）。装備の付け替えだけ
// シミュレーター側に独自の賢い政策を書くと、その根拠が崩れる。
// UIの「おすすめ」ボタンと sim の装備更新は、必ずここを通す。

/** そのキャラにとって各ステータスがどれだけ価値があるか */
function weightsFor(c) {
  const phys = (c.grow?.atk ?? 0) >= (c.grow?.mag ?? 0);   // 力型か術型か
  return {
    hp: 0.22, ki: 0.5,
    atk: phys ? 2.4 : 0.6,
    def: 1.8,
    spd: 1.2,
    mag: phys ? 0.6 : 2.4,
    luk: 0.9,
  };
}

/** 装備1つの「そのキャラにとっての強さ」。比較にだけ使う相対値 */
export function equipScore(charId, equip) {
  const c = CHAR_BY_ID[charId];
  if (!c || !equip) return 0;
  const eff = equipEffect(equip);
  const w = weightsFor(c);
  let s = 0;
  for (const k of ['hp', 'ki', 'atk', 'def', 'spd', 'mag', 'luk']) s += (eff[k] || 0) * w[k];
  s += (eff.meguri || 0) * 30;        // 気の巡りは上限3で貴重
  s += (eff.crushBonus || 0) * 1.5;   // 崩し前提のゲームなので高め
  s += (eff.resist || 0) * 0.8;
  return s;
}

/**
 * 持ち物の中から、そのキャラの各枠に最良のものを選ぶ。
 * **他のキャラが装備中のものは候補にしない**（奪い合いを起こさない）。
 * @returns {Array<{slot:number, uid:number, gain:number}>} 変えたほうが良い枠だけ
 */
export function suggestEquip(save, charId) {
  const c = save.chars[charId];
  if (!c) return [];
  c.equip = c.equip || [0, 0, 0];

  const taken = new Set();
  for (const [id, ch] of Object.entries(save.chars)) {
    if (id === charId) continue;
    for (const uid of ch.equip || []) if (uid) taken.add(uid);
  }

  const out = [];
  for (let slot = 0; slot < 3; slot++) {
    const slotName = ['weapon', 'armor', 'charm'][slot];
    const curUid = c.equip[slot];
    const curT = curUid ? (save.inv.equips || []).find((x) => x[0] === curUid) : null;
    const curScore = curT ? equipScore(charId, unpackEquip(curT)) : 0;

    let best = null, bestScore = curScore;
    for (const t of save.inv.equips || []) {
      if (t[0] === curUid || taken.has(t[0])) continue;
      const e = unpackEquip(t);
      const base = BASES.find((b) => b.id === e.baseId);
      if (!base || base.slot !== slotName) continue;
      const s = equipScore(charId, e);
      if (s > bestScore) { bestScore = s; best = e; }
    }
    if (best) out.push({ slot, uid: best.uid, gain: bestScore - curScore });
  }
  return out;
}

/** おすすめをそのまま着せる。@returns 変更した枠の数 */
export function autoEquip(save, charId) {
  let n = 0;
  for (const s of suggestEquip(save, charId)) {
    if (equipTo(save, charId, s.uid).ok) n++;
  }
  return n;
}

/** 出撃メンバー全員に順に適用する（先頭のキャラが優先して良い物を取る） */
export function autoEquipParty(save) {
  let n = 0;
  for (const id of save.party?.active || []) n += autoEquip(save, id);
  return n;
}

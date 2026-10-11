/**
 * 影闘（かげとう）― 他プレイヤーの「影」との手合わせ（2026-10-11 オーナー指示）
 *
 * > 「他人とのバトルを追加する感じにしましょう。実際に戦うのは、他人の最新セーブデータから、
 * >   戦闘できるメンバーで最大4vs4の形式としてください。細かい仕様は任せる」
 *
 * 【仕組み】
 *  1. 各プレイヤーの**最新の編成**から「影」を作る（`snapshotOf`）。
 *     中身は**計算済みの戦闘データだけ**（名前・到達階・戦力・最大4人のステータスと技）。
 *     セーブ全体は絶対に送らない。
 *  2. 相手の影は**予告して動く敵**に変換して戦う（`ghostToEnemies`）。
 *     エンジンの「味方＝わざ選択／敵＝構えを予告」の非対称を崩さないため
 *     （両陣営を味方AIで回す対称戦にすると battleSteps が分岐し、README 不変条件6を破る）。
 *  3. 影の構えは**使う技の系統**で決まる: 破→剛、流→疾、封→呪。
 *     → 三すくみ（rules.AFFINITY_TABLE）に通すと「相手の破には流、流には封、封には破」が
 *       そのまま成立する。自分の仲間どうしの相性と同じ言葉で説明できる。
 *
 *  4. 【2026-10-11 オーナー追加指示】エンディング後のコンテンツ。装備込み。
 *     「調整戦」（出撃する仲間の最高Lvが±5の相手だけ）と「無差別戦」の2つ。
 *     褒美は銭ではなく **影鋼（二つ銘の素材）・段位と称号・写し装備**。
 *
 * 【このファイルの約束】DOMに触らない・Math.random を使わない・今の時刻は引数で受け取る。
 *   通信は `src/net/api.js`、画面は `src/ui/screen_arena.js`。
 */

import { CHAR_BY_ID, CHARS, statsAt, skillsAt } from '../../data/chars.js';
import { SKILLS } from '../../data/skills.js';
import * as E from '../battle/engine.js';
import { makeParty } from '../battle/run.js';
import { makeRng } from '../core/rng.js';
import { everMax } from '../core/save.js';
import { isAway } from './dispatch.js';
import { BASES, PREFIXES, SUFFIXES } from '../../data/equips.js';
import { addEquip, equipName, ENHANCE_MAX, KAGE_MAT, FUTATSU_SUFFIXES } from './growth.js';

/** 影闘が開くと伝える文（エンディング後のコンテンツ・2026-10-11 オーナー指示） */
export const UNLOCK_TEXT = 'エンディングを見ると開きます';
/**
 * 影のデータ形式の版。**自分より新しい版の影は読まない**（知らない項目を誤読しないため）。
 * 2 = 最高Lv(l)・段位(rk)・装備(q)・装備表の版(ev) を足した形（2026-10-11）
 */
export const GHOST_SV = 2;
/**
 * 装備表（data/equips.js の BASES・PREFIXES・SUFFIXES の**並び**）の版。
 * ★影の装備は添字で送る。表の並びを変えたらここを上げること。
 *   上げ忘れると、写し装備が**別の装備にすり替わる**（advisor 指摘 2026-10-11）
 */
export const EQUIP_TABLE_V = 1;
/**
 * 褒美が出る回数（**直近24時間で**この回数まで）。それ以降も戦えるが褒美は無い（手合わせ）。
 * ★暦日ではなく、褒美つきで戦いを始めた時刻から24時間たつと1回ずつ戻る（オーナー指示 2026-10-11）
 */
export const DAILY_REWARDS = 5;
/** 褒美の回数・写しを数える窓（24時間） */
export const REWARD_WINDOW_MS = 24 * 60 * 60 * 1000;
/** 調整戦の幅（出撃する仲間の最高Lvの差・オーナー指示「±5まで」） */
export const FAIR_RANGE = 5;
/** 影鋼の褒美（勝ったときだけ・相手の強さで変える） */
export const KAGE_REWARD = { up: 3, even: 2, down: 1, npc: 1 };
/** 写し装備が手に入る確率（実在の影の格上・互角に勝ったときだけ） */
export const COPY_RATE = 0.25;
/** 同じ影（uid＋更新時刻）から写せるのは1回まで。覚えておく数の上限 */
const COPIED_MAX = 300;

/**
 * 段位（**調整戦の**勝ちの数で上がる・負けても下がらない）。称号として影にも載り、相手の画面に出る。
 * ★数えるのは調整戦の勝ち（`fairWin`）だけ（オーナー指示 2026-10-11）。無差別戦で格下を倒しても上がらない。
 *   調整戦の塔の写し（自分の最高Lvちょうど）への勝ちも、調整戦の勝ちとして数える
 * ★勝ちは「褒美の出ない6回目以降」も数える（褒美は回数制、段位は腕前の記録）
 */
export const RANKS = [
  { win: 0, name: '見習い' }, { win: 3, name: '初段' }, { win: 10, name: '二段' }, { win: 20, name: '三段' },
  { win: 35, name: '四段' }, { win: 55, name: '五段' }, { win: 80, name: '六段' }, { win: 110, name: '七段' },
  { win: 150, name: '八段' }, { win: 200, name: '九段' }, { win: 300, name: '影の名人' },
];
export function rankOf(wins) {
  let r = 0;
  for (let i = 0; i < RANKS.length; i++) if ((wins || 0) >= RANKS[i].win) r = i;
  return r;
}
export function rankName(rk) { return RANKS[Math.max(0, Math.min(RANKS.length - 1, rk | 0))].name; }
/** 次の段位まで（最高位なら null） */
export function nextRank(wins) {
  const r = rankOf(wins);
  return r + 1 < RANKS.length ? { name: RANKS[r + 1].name, left: RANKS[r + 1].win - (wins || 0) } : null;
}
/** 影闘の手数の上限。届いたら残りHPの割合で勝ち負けを決める */
export const ARENA_MAX_TURNS = 20;
/** 古い影は相手に出さない（端末を変えた・やめた人の影が残り続けるため） */
export const STALE_MS = 30 * 24 * 3600 * 1000;

/**
 * 影の技の威力の倍率（影の平均Lvで変える）。
 *
 * ★構えを**読める側**（挑んだ自分）が有利なのは本作の核なので消さないが、そのままだと
 *   鏡像対戦（自分の編成 vs 自分の影）で自分側が9割以上勝つ。その差を威力で埋める。
 * ★Lvで変えるのは、Lv50 から全体技が揃い「同じ構えの影をまとめて崩す」効果が跳ね上がるため
 *   （一律の倍率だと低Lvは影が強すぎ、高Lvは弱すぎた）。
 * ★値は `test/arena.mjs` の鏡像対戦（6編成×Lv10〜90）で自分側の勝率がおよそ 55〜65% に
 *   なる点を拾ったもの（2026-10-11 実測・decisions に表を残した）。
 */
export const GHOST_POWER_TABLE = [[0, 1.3], [30, 1.3], [45, 1.38], [55, 1.8], [99, 1.8]];
export function ghostPowerMul(lv) {
  const t = GHOST_POWER_TABLE;
  if (lv <= t[0][0]) return t[0][1];
  for (let i = 1; i < t.length; i++) {
    if (lv <= t[i][0]) {
      const [x0, y0] = t[i - 1], [x1, y1] = t[i];
      return y0 + (y1 - y0) * (lv - x0) / (x1 - x0);
    }
  }
  return t[t.length - 1][1];
}
export const GHOST_HP_MUL = 1.0;
/**
 * 影闘では**双方の体力を同じ倍率で増やす**。
 * ★塔の戦闘の数値のままだと 3〜6手で決着し、構えの読み合いが始まる前に終わる
 *   （鏡像対戦の実測）。両陣営に同じ倍率を掛けるので、どちらかが得をすることはない
 */
export const ARENA_HP_MUL = 2;
/**
 * 影の手の選び方の「迷い」。価値の高い手ほど選ばれやすいが、いつも最善手ではない
 * （価値を SHARPEN 乗した重みで抽選する。大きいほど最善手に寄る）
 */
export const SHARPEN = 2;

/** 技の系統 → 影の構え */
export const STANCE_OF_LINE = { ha: 'gou', ryu: 'shitsu', fu: 'ju' };
/** 名前に使えない文字（制御文字・書式文字） */
const BAD_CHARS = new RegExp('[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]', 'g');
/**
 * 公開名の簡易NGワード（spec §10 「機械的に弾く」）。
 * ★完全には防げない。ひっかかったら「名無しの灯守」に置き換えるだけで、拒否はしない
 */
const NG_WORDS = ['死ね', 'しね', '殺す', 'ころす', 'ちんこ', 'まんこ', 'セックス', 'fuck', 'shit', 'http', 'www.'];
export const DEFAULT_PUBLIC_NAME = '名無しの灯守';

/**
 * 上限（受け取った影をここで切る。**ルール v3 の値域と必ず揃える**）。
 * ★実際の最大は Lv120（rules.LV_HARD_MAX）で素のHP 2,558・能力 738。錬気・装備・因果盤の上乗せを
 *   見込んで約2〜3倍にしてある。上限を緩くしすぎると、上限いっぱいに改ざんした影に誰も勝てなくなる
 *   （レビュー指摘 2026-10-11）。`test/arena.mjs` が Lv120 の正規の影が上限内に収まることを見ている
 */
export const CAP = { l: 120, h: 6000, k: 2000, a: 2500, d: 2500, s: 2500, m: 2500, u: 2500 };

// ── 公開名 ────────────────────────────────────────────────

/** 公開名を整える（12文字・制御文字なし・NGワードは差し替え） */
export function cleanName(raw) {
  let s = String(raw ?? '').replace(BAD_CHARS, '').replace(/\s+/g, ' ').trim();
  // ★ルール（v3）の `.length` は UTF-16 の数え方（絵文字は2）。文字の途中で切らずに12以内へ
  const cps = [...s];
  while (cps.join('').length > 12) cps.pop();
  s = cps.join('');
  if (!s) return DEFAULT_PUBLIC_NAME;
  const low = s.toLowerCase();
  if (NG_WORDS.some((w) => low.includes(w))) return DEFAULT_PUBLIC_NAME;
  return s;
}

// ── 自分の側 ──────────────────────────────────────────────

/**
 * 「戦闘できるメンバー」＝今の編成のうち、影送りで塔に出ていない仲間（最大4人）。
 * ★負傷の休み（影送りのクールダウン）は「次に送れない」だけで、塔へは連れて行ける。
 *   影闘も同じ扱いにする（screen_party の判定と揃える）
 */
export function fightersOf(save) {
  const active = Array.isArray(save?.party?.active) ? save.party.active : [];
  return active.filter((id) => CHAR_BY_ID[id] && save.chars?.[id] && !isAway(save, id)).slice(0, 4);
}

/**
 * エンディングを見たか（2026-10-11 オーナー指示「エンディング達成後のコンテンツとしましょう」）。
 * ★`progress.cleared` は輪廻しても消えない（rebirth.js が残す）ので、一度見た人はずっと遊べる
 */
export function isUnlocked(save) {
  return !!save?.progress?.cleared;
}

/** 出撃する仲間の最高Lv（調整戦の物差し・オーナー回答「出撃する仲間の最高Lv」） */
export function maxLvOf(party) {
  return (party || []).reduce((x, m) => Math.max(x, m.l || 1), 1);
}

/** 自分の側の戦闘ユニット（HP・気は全快。装備・因果盤は反映） */
export function myParty(save) {
  return makeParty(save, fightersOf(save), save.party?.tacticChars || {});
}

/**
 * 戦力（相手選びと表示の目安）。
 * ★勝ち負けの予想ではなく「同じくらいの相手を出す」ための物差し。HPは桁が大きいので薄める
 */
export function powerOfMembers(members) {
  let p = 0;
  for (const m of members || []) {
    p += (m.h || 0) * 0.25 + (m.k || 0) * 0.5 + (m.a || 0) + (m.d || 0) + (m.s || 0) + (m.m || 0) + (m.u || 0) * 0.5;
  }
  return Math.round(p);
}

/**
 * 自分の影（サーバーに置く形）。**計算済みの戦闘データだけ**。
 * キーを1文字にしているのは、ルールで値域を縛る項目名を短く保つため（tech-design §5-3）。
 *   c:キャラ l:Lv h:HP k:気 a:力 d:守 s:疾 m:念 u:運 g:気の巡り b:崩し+% r:耐性% w:技（カンマ区切り）
 * @returns {object|null} 戦える仲間が0人なら null
 */
export function snapshotOf(save, publicName, record = null) {
  const units = myParty(save);
  if (units.length === 0) return null;
  // ★送る値もルールの値域の中に収める（万一上限を超える育ち方をしても、送信ごと拒否されないように）
  const cap = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(Number(v) || 0)));
  const party = units.map((u) => ({
    c: u.id,
    l: cap(save.chars[u.id]?.lv || 1, 1, CAP.l),
    h: cap(u.max.hp, 1, CAP.h), k: cap(u.max.ki, 0, CAP.k), a: cap(u.atk, 0, CAP.a), d: cap(u.def, 0, CAP.d),
    s: cap(u.spd, 0, CAP.s), m: cap(u.mag, 0, CAP.m), u: cap(u.luk, 0, CAP.u),
    g: cap(u.meguri, -9, 99), b: cap(u.crushBonus, 0, 999), r: cap(u.resist, 0, 100),
    w: u.skills.join(','),
    q: equipStringOf(save, u.id),
  }));
  const rec = record || save.arena || {};
  return {
    sv: GHOST_SV,
    ev: EQUIP_TABLE_V,
    n: cleanName(publicName),
    f: Math.min(9999, everMax(save)),
    l: maxLvOf(party),
    p: powerOfMembers(party),
    // ★wn は調整戦の勝ち数（段位の元）。全体の戦績ではない
    wn: Math.max(0, Math.min(999999, rec.fairWin || 0)),
    rk: rankOf(rec.fairWin || 0),
    party,
  };
}

/**
 * 仲間が身につけている装備を文字列にする（写し装備のため・2026-10-11）。
 * 1つ = 「本体.接頭.接尾.+値.発見階.二つ銘」（すべて表の添字）、最大3つを「|」でつなぐ。
 * ★ステータスはすでに装備込み（finalStats）。受け取った側は**これで能力を足し直さない**（二重になる）
 */
export function equipStringOf(save, charId) {
  const uids = save.chars?.[charId]?.equip || [];
  const out = [];
  for (const uid of uids) {
    if (!uid) continue;
    const t = (save.inv?.equips || []).find((x) => x[0] === uid);
    // ★表に無い添字（-1）を含む装備は送らない。ルールの正規表現に弾かれて影ごと送れなくなる
    if (!t || !(t[1] >= 0 && t[2] >= 0 && t[3] >= 0)) continue;
    out.push([t[1], t[2], t[3], t[4] || 0, Math.min(999, t[5] || 1), t[6] > 0 ? t[6] : 0].join('.'));
  }
  return out.slice(0, 3).join('|');
}

/** 受け取った装備の文字列を検査して読む（使えないものは捨てる） */
export function parseEquipString(q) {
  const out = [];
  const slots = new Set();
  for (const part of String(q || '').split('|').slice(0, 3)) {
    const v = part.split('.').map((x) => Number(x));
    if (v.length !== 6 || v.some((x) => !Number.isInteger(x))) continue;
    const [b, p, s, plus, lv, s2] = v;
    const base = BASES[b], pre = PREFIXES[p], suf = SUFFIXES[s];
    if (!base || !pre || !suf || slots.has(base.slot)) continue;
    if (plus < 0 || plus > ENHANCE_MAX || lv < 1 || lv > 999) continue;
    const suf2 = s2 > 0 ? SUFFIXES[s2] : null;
    if (s2 > 0 && (!suf2 || !FUTATSU_SUFFIXES.includes(suf2.id))) continue;
    slots.add(base.slot);
    out.push({ baseId: base.id, prefixId: pre.id, suffixId: suf.id, plus, lv, suffix2Id: suf2 ? suf2.id : null });
  }
  return out;
}

// ── 相手の側（受け取ったデータは信用しない） ────────────────

function num(v, lo, hi) {
  const x = Number(v);
  if (!Number.isFinite(x)) return null;
  return Math.max(lo, Math.min(hi, Math.round(x)));
}

/**
 * 受け取った影を検査して整える。使えなければ null。
 * ★他人の影は**改ざんされている前提**で読む（ルールでも縛るが、二重に守る）:
 *   未知のキャラ・技は捨てる／数値は上限で切る／NaN は捨てる／名前は整える／4人を超えたぶんは捨てる
 */
export function sanitizeGhost(raw, uid = '') {
  if (!raw || typeof raw !== 'object') return null;
  const sv = num(raw.sv, 0, 999);
  if (sv == null || sv > GHOST_SV) return null;      // 新しい版の影は読まない
  const list = Array.isArray(raw.party) ? raw.party
    : (raw.party && typeof raw.party === 'object' ? Object.values(raw.party) : []);
  const party = [];
  const seen = new Set();
  for (const m of list) {
    if (party.length >= 4) break;
    if (!m || typeof m !== 'object') continue;
    const c = String(m.c || '');
    if (!Object.hasOwn(CHAR_BY_ID, c) || seen.has(c)) continue;      // ★'constructor' 等を通さない
    const st = {};
    let bad = false;
    for (const k of ['l', 'h', 'k', 'a', 'd', 's', 'm', 'u']) {
      st[k] = num(m[k], k === 'k' ? 0 : 1, CAP[k]);
      if (st[k] == null) bad = true;
    }
    if (bad) continue;
    const skills = String(m.w || '').split(',').filter((id) => Object.hasOwn(SKILLS, id)).slice(0, E.MAX_SKILLS);
    if (!skills.includes('atk_normal')) skills.push('atk_normal');
    seen.add(c);
    party.push({
      c, ...st,
      g: num(m.g, -9, 9) ?? 0, b: num(m.b, 0, 300) ?? 0, r: num(m.r, 0, 80) ?? 0,
      w: [...new Set(skills)].join(','),
      // ★装備表の版が違う影の装備は読まない（添字の意味が変わっているかもしれない）
      eq: Number(raw.ev) === EQUIP_TABLE_V ? parseEquipString(m.q) : [],
    });
  }
  if (party.length === 0) return null;
  return {
    uid: String(uid).slice(0, 64),
    sv,
    n: cleanName(raw.n),
    f: num(raw.f, 1, 9999) ?? 1,
    l: maxLvOf(party),                 // ★申告値（raw.l）は検索にだけ使い、ここでは数え直す
    p: powerOfMembers(party),          // ★申告値は使わず、こちらで数え直す
    wn: num(raw.wn, 0, 999999) ?? 0,
    // ★段位は申告値を信じず、勝ちの数から数え直す（「0勝で影の名人」を表示させない）
    rk: rankOf(num(raw.wn, 0, 999999) ?? 0),
    t: num(raw.t, 0, 9e15) ?? 0,
    party,
    npc: false,
  };
}

/** キャラの「ふつうの攻撃」の構え。万能（ともし・無銘）は剛 */
function normalStanceOf(charId) {
  return STANCE_OF_LINE[CHAR_BY_ID[charId]?.line] || 'gou';
}

/**
 * 技 → 影の行動（engine の敵行動と同じ形）。使えない技（かばう等の威力0）は null。
 * ★`skill: true` は「封」で使えなくなる目印（engine.actEnemy）。
 */
export function actOfSkill(sk, charId, idx, mul = 1) {
  if (!sk) return null;
  const stance = sk.id === 'atk_normal' ? normalStanceOf(charId) : (STANCE_OF_LINE[sk.line] || normalStanceOf(charId));
  const base = { id: `g_${sk.id}_${idx}`, name: sk.name, stance, magic: !!sk.magic, skill: sk.id !== 'atk_normal' };
  if (sk.heal) {
    return { ...base, power: 0, heal: Math.round(sk.heal * mul), target: sk.target === 'allyAll' ? 'allyAll' : 'ally' };
  }
  if (sk.taunt) return { ...base, power: 0, taunt: { ...sk.taunt } };
  if (!(sk.power > 0)) return null;
  const act = { ...base, power: Math.round(sk.power * mul) };
  if (sk.target === 'all') act.target = 'all';
  if (sk.ailment) act.ailment = { ...sk.ailment };
  if (sk.selfBuff) act.selfBuff = { ...sk.selfBuff };
  return act;
}

/**
 * 影の次の一手を選ぶ（engine.declareStances から呼ばれる）。
 *
 * ★影も**気をやり繰りする**。他プレイヤーの仲間なので、プレイヤーと同じ制約で動かす
 *   （技は気を使い、ふつうの攻撃で気が戻り、ターンごとに少し戻る）。
 *   気は `e.gki` に持つ（敵ユニットの ki は 0 のまま。画面の表示を変えないため）。
 * ★価値の見積もり（ざっくりでよい。最善を読み切る必要はない）:
 *   攻撃 = 威力 × 力(術なら念) × 当たる人数（＋状態異常・自己強化に少し上乗せ）
 *   回復 = 回復量 × 傷ついた仲間の数（HP6割未満の仲間がいなければ使わない）
 * ★乱数は `b.rng` から1回だけ引く（同じシードなら同じ戦い＝決定論）。
 */
export function ghostPick(b, e) {
  const R_TURN = 2, R_ATK = 5;        // rules.KI_REGEN_TURN / KI_REGEN_ATTACK と同じ値
  if (e.gTurn !== b.turn) {
    if (e.gTurn != null && !(e.ailments.kare > 0)) e.gki = Math.min(e.gkiMax, e.gki + R_TURN + (e.meguri || 0));
    e.gTurn = b.turn;
  }
  const foes = E.livingOf(b.allies);
  const mates = E.livingOf(b.enemies);
  const hurt = mates.filter((m) => m.hp / m.max.hp < 0.6).length;
  const sealed = (e.ailments.fu || 0) > 0;
  const costMul = (e.ailments.kare || 0) > 0 ? 1.5 : 1;
  const opts = [];
  for (const a of e.uniqueActs) {
    const cost = Math.ceil((a.ki || 0) * costMul);
    if (a.skill && (sealed || cost > e.gki)) continue;
    let v;
    if (a.taunt) {
      // かばう: 自分が元気で、まだ前に出ていないときだけ。価値は「仲間が受けずに済む攻撃」の目安
      if (e.taunt > 0 || e.hp / e.max.hp < 0.5 || mates.length < 2) continue;
      v = Math.max(...foes.map((f) => Math.max(f.atk, f.mag))) * (mates.length - 1) * 0.8;
    } else if (a.heal) {
      if (hurt === 0) continue;
      v = a.heal * (1 + (e.mag || 0) / 200) * (a.target === 'allyAll' ? hurt : 1);
    } else {
      const st = a.magic ? e.mag : e.atk;
      v = (a.power / 100) * st * (a.target === 'all' ? foes.length : 1) * (a.ailment ? 1.15 : 1) * (a.selfBuff ? 1.1 : 1);
    }
    if (v > 0) opts.push({ w: Math.pow(v, SHARPEN), v: a, cost });
  }
  const pick = opts.length ? b.rng.weighted(opts) : { v: e.ghostNormal, cost: 0 };
  const act = pick.v;
  if (act.skill) e.gki -= pick.cost;
  else e.gki = Math.min(e.gkiMax, e.gki + R_ATK + (e.meguri || 0));
  return act;
}

/**
 * 影 → 敵ユニットの配列（最大4体）。
 * `acts`・`stanceWeights` は engine の形に合わせて持たせるが、実際の手は `pickAct`（ghostPick）が選ぶ。
 */
export function ghostToEnemies(ghost, { powerMul = null, hpMul = GHOST_HP_MUL } = {}) {
  const avgLv = ghost.party.reduce((x, m) => x + m.l, 0) / Math.max(1, ghost.party.length);
  if (powerMul == null) powerMul = ghostPowerMul(avgLv);
  return ghost.party.map((m, i) => {
    const c = CHAR_BY_ID[m.c];
    const skills = m.w.split(',').map((id) => SKILLS[id]).filter(Boolean);
    const acts = [];
    let normal = null;
    for (const sk of skills) {
      const a = actOfSkill(sk, m.c, i, powerMul);
      if (!a) continue;
      a.ki = sk.ki || 0;
      if (sk.id === 'atk_normal') normal = a; else acts.push(a);
    }
    if (!normal) normal = { ...actOfSkill(SKILLS.atk_normal, m.c, i, powerMul), ki: 0 };
    acts.push(normal);
    const count = (st) => acts.filter((a) => a.stance === st).length;
    const u = E.makeEnemy({
      id: `g${i}_${m.c}`,                       // ★味方の hero/mumei と id を衝突させない
      name: `${c.name}の影`,
      mon: c.mon, color: c.color, art: m.c,     // 絵は仲間の紋を借りる
      stats: { hp: Math.max(1, Math.round(m.h * hpMul)), atk: m.a, def: m.d, spd: m.s, mag: m.m, luk: m.u },
      acts, stanceWeights: [count('gou'), count('shitsu'), count('ju')],
      resist: m.r,
    });
    u.ghost = true;
    u.ghostNormal = normal;
    u.uniqueActs = acts;
    u.meguri = m.g;
    u.gki = m.k;
    u.gkiMax = m.k;
    u.lv = m.l;
    u.pickAct = ghostPick;
    return u;
  });
}

// ── 塔が写した影（人が少ない間の相手・端末内で決定論に作る） ──

const NPC_NAMES = ['塔の写し・朔', '塔の写し・弦', '塔の写し・望'];
/** 自分の戦力に対する強さ（格下・互角・格上）。調整戦は幅を狭める */
const NPC_TIERS = { open: [0.85, 1.0, 1.15], fair: [0.9, 1.0, 1.1] };

/**
 * その日の「塔が写した影」を3体作る。
 * ★同じ日・同じ自分なら同じ相手（シードは日付と自分の編成から）。
 *   自分の戦力に合わせて**倍率で**整える（装備は持たせない代わり）。
 * ★調整戦は**自分の最高Lvちょうど**の仲間で作る（±5の約束を写しも守る）。無差別戦は平均Lv
 * @param {'fair'|'open'} mode
 */
export function npcGhosts(save, dayKey, mode = 'open') {
  const mine = snapshotOf(save, 'self');
  if (!mine) return [];
  const avgLv = mode === 'fair' ? mine.l
    : Math.max(1, Math.round(mine.party.reduce((s, m) => s + m.l, 0) / mine.party.length));
  const size = mine.party.length;
  const rng = makeRng(`npc:${mode}:${dayKey}:${mine.party.map((m) => m.c).join('+')}:${avgLv}`);
  return (NPC_TIERS[mode] || NPC_TIERS.open).map((tier, idx) => {
    const pool = CHARS.map((c) => c.id);
    const ids = [];
    while (ids.length < size && pool.length) ids.push(pool.splice(rng.int(0, pool.length - 1), 1)[0]);
    const raw = ids.map((id) => {
      const s = statsAt(id, avgLv);
      return { c: id, l: avgLv, h: s.hp, k: s.ki, a: s.atk, d: s.def, s: s.spd, m: s.mag, u: s.luk,
        g: CHAR_BY_ID[id].meguri || 0, b: 0, r: 0, w: skillsAt(id, avgLv).slice(0, E.MAX_SKILLS).join(',') };
    });
    const k = (mine.p * tier) / Math.max(1, powerOfMembers(raw));
    for (const m of raw) for (const key of ['h', 'k', 'a', 'd', 's', 'm', 'u']) m[key] = Math.max(1, Math.round(m[key] * k));
    const g = sanitizeGhost({ sv: GHOST_SV, n: NPC_NAMES[idx], f: mine.f, party: raw }, `npc${idx}`);
    g.n = NPC_NAMES[idx];      // cleanName を通っても同じだが、念のため固定
    g.uid = `npc:${mode}:${idx}`;
    g.npc = true;
    g.tier = idx;
    return g;
  });
}

/**
 * 相手の候補を選ぶ（最大 n 人）。足りないぶんは塔の写しで埋める。
 *  - 調整戦（fair）: 出撃する仲間の最高Lvの差が ±FAIR_RANGE の影だけ。戦力の近い順
 *  - 無差別戦（open）: 制限なし。日替わり＋「別の相手を探す」で並びが変わる
 * ★「別の相手を探す」（reroll）は候補を3人ずつ送る。一巡したら最初に戻る
 * @param {Array} ghosts sanitize 済みの影
 * @returns {{list:Array, real:number, pool:number}} real＝実在の影の数・pool＝条件に合う影の総数
 */
export function pickOpponents(ghosts, { mode = 'fair', myUid = null, myPower = 0, myLv = 1, nowMs = 0, npcs = [], n = 3, dayKey = '', reroll = 0 } = {}) {
  let pool = (ghosts || [])
    .filter((g) => g && !g.npc && g.uid !== myUid && (!nowMs || !g.t || nowMs - g.t < STALE_MS));
  if (mode === 'fair') {
    pool = pool.filter((g) => Math.abs(g.l - myLv) <= FAIR_RANGE)
      .sort((a, z) => Math.abs(a.p - myPower) - Math.abs(z.p - myPower) || z.t - a.t);
  } else {
    pool = makeRng(`open:${dayKey}`).shuffle(pool.sort((a, z) => (a.uid < z.uid ? -1 : 1)));
  }
  const start = pool.length > n ? (reroll * n) % pool.length : 0;
  const real = [...pool.slice(start), ...pool.slice(0, start)].slice(0, n);
  const list = [...real];
  for (const g of npcs) { if (list.length >= n) break; list.push(g); }
  return { list, real: real.length, pool: pool.length };
}

/**
 * 戦いに効く強さ（格上・格下の見立てに使う）。
 * ★運と気は入れない。運と気を上限まで積み、力・守りを下げた「格上に見えて弱い影」を作れてしまう
 *   （その影から写し装備を狙い続けられる・レビュー指摘）
 */
export function combatPowerOf(party) {
  let p = 0;
  for (const m of party || []) p += (m.h || 0) * 0.25 + (m.a || 0) + (m.d || 0) + (m.s || 0) + (m.m || 0);
  return Math.round(p);
}

/** 相手の強さの見立て（褒美の影鋼の数・写しの可否に使う）。myPower は自分の combatPowerOf */
export function tierOf(ghost, myPower) {
  if (ghost.npc) return 'npc';
  const gp = ghost.party ? combatPowerOf(ghost.party) : ghost.p;
  const r = myPower > 0 ? gp / myPower : 1;
  return r >= 1.12 ? 'up' : (r <= 0.88 ? 'down' : 'even');
}
export const TIER_LABEL = { up: '格上', even: '互角', down: '格下', npc: '塔の写し' };

// ── 戦闘・勝敗・褒美 ──────────────────────────────────────

/**
 * 戦闘のシード（同じ相手・同じ通算の挑戦回数なら同じ戦い＝再現できる）。
 * ★count は通算（日ごとに0へ戻さない）。これで一意になる
 */
export function battleSeed({ myUid, ghost, count }) {
  return `arena:${myUid || 'local'}:${ghost.uid}:${ghost.t || 0}:${count}`;
}

/** battleSteps に渡す引数一式 */
export function battleOpts(save, ghost, seed, { powerMul = null, hpMul = GHOST_HP_MUL, arenaHp = ARENA_HP_MUL } = {}) {
  const allies = myParty(save);
  for (const u of allies) { u.max.hp = Math.max(1, Math.round(u.max.hp * arenaHp)); u.hp = u.max.hp; }
  return {
    seed,
    allies,
    enemies: ghostToEnemies(ghost, { powerMul, hpMul: hpMul * arenaHp }),
    partyTactic: save.party?.tacticParty || 'omakase',
    difficulty: 'normal',          // ★難易度の補正は掛けない（影闘は難易度の外）
    bossFight: true,               // 逃げられない（engine.tryEscape が見る）
    maxTurns: ARENA_MAX_TURNS,
  };
}

/** 生きている側のHPの割合 */
function hpRatio(units) {
  const max = units.reduce((s, u) => s + u.max.hp, 0);
  return max > 0 ? units.reduce((s, u) => s + (u.alive ? u.hp : 0), 0) / max : 0;
}

/**
 * 勝ち負け。手数切れ（draw）は**残りHPの割合**が多いほうの勝ち（同じなら負け＝挑んだ側が攻めきれなかった）
 * @returns {'win'|'lose'}
 */
export function judge(res) {
  if (res.result === 'win') return 'win';
  if (res.result === 'lose') return 'lose';
  const b = res.battle;
  return hpRatio(b.allies) > hpRatio(b.enemies) ? 'win' : 'lose';
}

/** 影闘の記録の器（セーブの版は上げない。無ければここで作る） */
export function recordOf(save) {
  if (!save.arena || typeof save.arena !== 'object' || Array.isArray(save.arena)) save.arena = {};
  const a = save.arena;
  for (const k of ['win', 'lose', 'count', 'fairWin', 'copyAt']) a[k] = Math.max(0, Number(a[k]) || 0);
  // 褒美つきで戦いを始めた時刻（ms）。大きい順に DAILY_REWARDS 件だけ持つ
  if (!Array.isArray(a.rw)) a.rw = [];
  if (!Array.isArray(a.hist)) a.hist = [];
  if (!Array.isArray(a.copied)) a.copied = [];
  if (typeof a.rerollDay !== 'string') a.rerollDay = '';
  delete a.day;        // 暦日で数えていたころの名残（2026-10-11 まで）
  delete a.copyDay;
  return a;
}

/**
 * 記録の時刻を整える（rewardsLeft・begin の入口で必ず通す）。
 * ★未来の時刻（端末の時計を進めて取った褒美）も「使用中」として数える。時計を戻すと
 *   その分だけ褒美が止まる＝**前借りにしかならない**。
 * ★ただし「いま＋24時間」より先の時刻は、そこまで**保存し直して**丸める（advisor 指摘 2026-10-11）。
 *   時計を2030年に誤設定した記録が残り、直しても何年も褒美が出ない、を防ぐ。締め出しは最長48時間。
 *   読むときだけ丸めて保存値を変えないと、効かない
 */
function tidyTimes(a, nowMs) {
  const cap = nowMs + REWARD_WINDOW_MS;
  a.rw = a.rw.map(Number).filter((t) => Number.isFinite(t) && t > 0)
    .map((t) => Math.min(t, cap)).sort((x, z) => z - x).slice(0, DAILY_REWARDS);
  if (a.copyAt > cap) a.copyAt = cap;
}

/**
 * 「別の相手を探す」を今日（端末の暦日 dayKey）もう使ったか。1日1回（オーナー指示 2026-10-11）。
 * ★等号で比べる（`>=` にすると、時計を未来に誤設定した日付が残って、直しても使えなくなる・advisor 指摘）
 */
export function rerollUsed(save, dayKey) {
  return recordOf(save).rerollDay === dayKey;
}
/** 使う（使えたら true）。セーブに残すので、戦い方を切り替えても・読み込み直しても戻らない */
export function useReroll(save, dayKey) {
  if (rerollUsed(save, dayKey)) return false;
  recordOf(save).rerollDay = dayKey;
  return true;
}

/** いま（nowMs）あと何回褒美が出るか（直近24時間で DAILY_REWARDS 回まで） */
export function rewardsLeft(save, nowMs) {
  const a = recordOf(save);
  tidyTimes(a, nowMs);
  return Math.max(0, DAILY_REWARDS - a.rw.filter((t) => t > nowMs - REWARD_WINDOW_MS).length);
}

/** 褒美が0回のとき、次の1回が戻るまでの ms（残りがあれば 0） */
export function nextRewardInMs(save, nowMs) {
  if (rewardsLeft(save, nowMs) > 0) return 0;
  const a = recordOf(save);
  const used = a.rw.filter((t) => t > nowMs - REWARD_WINDOW_MS);
  return Math.max(0, Math.min(...used) + REWARD_WINDOW_MS - nowMs);
}

/**
 * 戦いを**始めた時点で**1回ぶんを数え、ひとまず負けとして記録する（レビュー指摘 2026-10-11）。
 * ★戦闘中に閉じたり読み込み直したりして負けを消す・褒美の回数を減らさない、を防ぐ。
 *   勝って `settle` に届いたら勝ちへ付け替える。
 * ★褒美の回数は直近24時間で数える（rewardsLeft）。褒美つきなら始めた時刻を a.rw に積む
 * ★褒美の中身（影鋼の数・写し装備の当たり外れと、どの装備か）も**ここで決めて保存する**。
 *   勝ったときに抽選すると、外れたら読み込み直して引き直せてしまう（advisor 指摘）
 * ★調整戦の勝ち（段位）になるかも**ここで確定**する。自分の最高Lvは画面から受け取らず数え直す
 *   （一覧を出したあとに編成を替えてもずれない・advisor 指摘）。ghost.l は sanitize で数え直した値
 * @param {number} nowMs 端末の時刻
 * @param {{myUid?:string|null, myPower?:number, mode?:'fair'|'open'}} [o]
 * @returns {{count:number, rewarded:boolean, seed:string, tier:string, fair:boolean}}
 */
export function begin(save, ghost, nowMs, { myUid = null, myPower = 0, mode = 'open' } = {}) {
  const a = recordOf(save);
  const rewarded = rewardsLeft(save, nowMs) > 0;      // ここで時刻も整う
  if (rewarded) a.rw = [nowMs, ...a.rw].sort((x, z) => z - x).slice(0, DAILY_REWARDS);
  const count = a.count;
  const seed = battleSeed({ myUid, ghost, count });
  const tier = tierOf(ghost, myPower);
  const myLv = Math.min(CAP.l, maxLvOf(fightersOf(save).map((id) => ({ l: save.chars[id]?.lv || 1 }))));   // 相手側（sanitize）と同じ上限で丸める
  const fair = mode === 'fair' && Math.abs((ghost.l || 1) - myLv) <= FAIR_RANGE;
  a.count += 1;
  a.lose += 1;
  a.open = { n: ghost.n, at: nowMs, rewarded, tier, fair, kage: rewarded ? KAGE_REWARD[tier] : 0, copy: rewarded ? rollCopy(save, ghost, tier, seed, nowMs) : null };
  return { count, rewarded, seed, tier, fair };
}

/** 写し装備の抽選（当たれば写す装備を返す）。条件は COPY_RATE の注記を参照 */
function rollCopy(save, ghost, tier, seed, nowMs) {
  if (ghost.npc || (tier !== 'up' && tier !== 'even')) return null;
  // ★同じ**相手**（uid）からは1回まで。更新時刻 t を鍵に入れると、30秒ごとに送り直すだけで
  //   何度でも写せてしまう（レビュー指摘）。写しは**直近24時間で1個まで**（褒美の回数と同じ数え方）
  const a = recordOf(save);
  const key = ghost.uid;
  if (a.copied.includes(key) || a.copyAt > nowMs - REWARD_WINDOW_MS) return null;
  const all = ghost.party.flatMap((m) => m.eq || []);
  if (all.length === 0) return null;
  const rng = makeRng(`${seed}:copy`);
  if (rng.next() >= COPY_RATE) return null;
  const src = rng.pick(all);
  return {
    key,
    baseId: src.baseId, prefixId: src.prefixId, suffixId: src.suffixId,
    // ★写しは本物より弱い: +値は半分・二つ銘なし。発見階は**自分の到達階まで**に切る
    //   （偽の影に最強装備の文字列を書いて配る、の旨みを消す・advisor 指摘）
    plus: Math.floor((src.plus || 0) / 2),
    lv: Math.max(1, Math.min(src.lv || 1, everMax(save))),
  };
}

/**
 * 結果をセーブに書く。
 * @returns {{outcome:'win'|'lose', rewarded:boolean, kage:number, copy:string|null, copyFull:boolean, rankUp:string|null}}
 */
export function settle(save, ghost, res, nowMs) {
  const a = recordOf(save);
  // ★begin を通っていない呼び出し（テスト等）でも数が合うように、ここで始めておく（無差別戦扱い）
  if (!a.open) begin(save, ghost, nowMs);
  const open = a.open;
  a.open = null;
  const outcome = judge(res);
  const out = { outcome, rewarded: !!open.rewarded, kage: 0, copy: null, copyFull: false, rankUp: null };
  if (outcome === 'win') {
    a.win += 1;
    a.lose = Math.max(0, a.lose - 1);
    if (open.fair) {
      const before = rankOf(a.fairWin);
      a.fairWin += 1;
      if (rankOf(a.fairWin) > before) out.rankUp = rankName(rankOf(a.fairWin));
    }
    if (open.kage > 0) {
      save.inv.mats = save.inv.mats || {};
      save.inv.mats[KAGE_MAT] = (save.inv.mats[KAGE_MAT] || 0) + open.kage;
      out.kage = open.kage;
    }
    if (open.copy) {
      const { key, ...eq } = open.copy;
      const r = addEquip(save, { ...eq, uid: 0, copy: true });
      if (r.ok) {
        out.copy = equipName(r.equip);
        a.copyAt = Number(open.at) || nowMs;
        a.copied.push(key);
        a.copied = a.copied.slice(-COPIED_MAX);
      } else out.copyFull = true;
    }
  }
  a.hist.unshift({ n: ghost.n, npc: !!ghost.npc, r: outcome, fair: !!open.fair, at: nowMs, turns: res.turns || 0 });
  a.hist = a.hist.slice(0, 10);
  return out;
}

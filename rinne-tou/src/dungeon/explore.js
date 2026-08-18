/**
 * 潜行（1回の探索）の進行管理
 *
 * 本作の設計の芯は「もう1階潜るか、ここで引き上げるか」の判断（spec §1）。
 * 戦闘はオートに任せられるが、**この判断だけはオート化しない**（spec §3-8-7）。
 *
 * DOM非依存。UIからもシミュレーターからも同じこの関数群を使う。
 */

import * as R from '../core/rules.js';
import { makeRng } from '../core/rng.js';
import { moonAge, moonPhase, PHASE_EFFECT } from '../core/time.js';
import { generateFloor, moveTo, choicesOf, NODE, REPEATABLE } from './floor.js';
import { TOWERS, stanceBiasFor, isMarkFloor, sectionOf, powerFloorOf, floorName, isUnderground } from './towers.js';
import { makeEnemyGroup, makeBossGroup, makeParty, runBattle, battleReward } from '../battle/run.js';
import { applyPersistedState, storePartyState } from '../meta/home.js';
import { rollEquip, addEquip, equipRarity, equipName, gainExp, MAT_NAME } from '../meta/growth.js';
import { learnedBetween } from '../../data/chars.js';
import { pickEvent, choose as chooseEvent, autoChoose, payCost } from './events.js';
import { bonusOf as boardBonus, NO_BONUS } from '../meta/board.js';
import { CHAR_BY_ID } from '../../data/chars.js';
import { medicinePouch, addItem as shopAddItem, capItem as shopCapItem } from '../meta/shop.js';
import { markItem, markMat } from '../meta/dex.js';
import { ITEM_BY_ID, TREASURE_MEDS, TREASURE_MED_RATE } from '../../data/items.js';

/**
 * 装備のドロップ率（spec §6-2）
 *
 * 1周（1F〜60F到達）の分母を実測して決めた値:
 *   雑魚戦 約416回 / 宝ノード 約242回 / ボス撃破 36回
 *   → 合計およそ190点／周 ＝ 15点/時 ＝ 2.8点/潜行
 * 有効な装備枠は4人×3＝12なので、2〜4点拾うごとに1回は更新が起きる密度。
 */
export const DROP_RATE = { battle: 0.10, treasure: 0.30, boss: 1 };

/** 潜行を開始する */
export function startRun({ save, tower = 'main', floor = 1, seed, nowMs = 0 }) {
  const phase = moonPhase(moonAge(nowMs));
  // ★ save 全体を渡すこと。save.chars だけを渡すと run.js の isFullSave 判定が false になり、
  //   装備・気の巡り・崩しボーナス・状態異常耐性が**すべて無視される**
  //   （2026-08-02 レビューで発見。装備を実装しても効かない状態だった）
  const party = makeParty(save, save.party.active, save.party.tacticChars || {});
  applyPersistedState(save, party);   // 前回の潜行から持ち越したHP・気（spec §2-0 庵）
  // 因果盤の効果は**毎回その場で数える**（合算値をセーブに持たせると更新漏れで食い違う）
  const board = boardBonus(save);
  const maxAkari = R.AKARI_MAX_BASE + board.akari;
  const run = {
    seed, tower, floor, startFloor: floor, phase,
    /**
     * この潜行でいちばん深く着いた階（2026-08-16）。
     * ★階を行き来できるようにしたので、「進んだ」の判定を `floor` で見ると
     *   往復するだけで灯と深度ボーナスが無限に増える。`moveFloor` の注記を参照。
     */
    deepest: floor,
    floorMaps: {},               // 行き来しても宝や敵が湧き直さないよう、階ごとの地図を取っておく
    // 強さ・報酬の計算に使う階数（本編は floor と同じ・towers.powerFloorOf のコメント参照）
    powerFloor: powerFloorOf(tower, floor),
    /**
     * 「奥」（11F〜）へ降りられるか。
     *
     * ★v1.0では**必ず false**。仕様（spec §4-7-6）ではエンディング後に開くが、
     *   中身がまだ無い。ここを `save.progress.cleared` で開けてしまうと:
     *     ・`powerFloorOf` は表の10階で頭打ちなので、11〜71階の敵が全部30階相当のまま
     *     ・50階の「守」（SIDE_BOSSES に未登録）が雑魚1体に化ける
     *     ・`sectionOf` の 'mumyo'（51F〜）は descend が見ておらず無検問
     *   実測で「鬼哭洞を60階まで降り続けて全滅0回・銭2,752/分」の無限廊下になった
     *   （2026-08-03 レビュー指摘）。**到達しない機能より、開いた壊れた機能のほうが悪い**。
     *   「奥」を実装するときは、この行と `powerFloorOf` と `SIDE_BOSSES[*][50]` を同時に用意すること
     */
    okuOpen: false,
    board,                       // この潜行のあいだ固定（途中で盤は変えられない）
    difficulty: save.difficulty || 'normal',
    rebirth: save.progress?.rebirth ?? 0,
    party,
    // ★層ボスの強さは「出撃した人数」ではなく「シナリオが配った仲間の数」で割り引く。
    //   出撃人数で割り引くと、編成画面で控えを外すだけでボスが弱くなる抜け道になる
    //   （実測: 60Fの還る門が 4人79% に対し 2人99%。2026-08-03 レビュー指摘）
    roster: rosterSize(save),
    akari: maxAkari, maxAkari,
    depth: 0,                    // 連続して降りた階数（深度ボーナス）
    // 拾得物は「基本分」と「深度ボーナスの上乗せ分」を分けて持つ。
    // 全滅すると上乗せ分は**まるごと失う**（spec §4-5-a）。
    // 分けずに合算すると「深く潜って稼ぎ、わざと全滅して帰る」が最適解になる
    gained: { exp: 0, zeni: 0, mats: {}, items: {}, equips: [] },
    bonus: { zeni: 0, mats: {}, equips: [] },
    fuda: save.inv?.items?.fuda ?? 0,
    // 油壺（2026-08-12 に使い道を付けた）。**持っていた数を写して、使った数を数える**。
    // 拾ったぶんは `gained.items.oil` 側にあるので、ここでは触らない
    oilHave: save.inv?.items?.oil ?? 0,
    oilUsed: 0,
    /**
     * 塔へ持ち込んだ薬（2026-08-13）。`{itemId: 残り数}`。
     *
     * ★油壺と同じ考え方で、**持っていた数を写して減らしていく**。
     *   セーブを直接引かないのは、全滅したときに「使った薬だけ減って戻る」
     *   （＝深度ボーナスと同じく、使ったものは戻らない）を素直に書けるため。
     * ★戦闘中に使ったぶんも、戦闘が終わったときにここへ引く（finishBattle）。
     */
    pouch: medicinePouch(save),
    medUsed: {},                 // 使った薬（帰ったときにセーブから引く）
    // 1潜行1回の無料脱出（spec §4-3）。
    // ★**5階ぶん進むまでは灯らない**（2026-08-11 オーナー指示
    //   「無制限に使えるのは強すぎるし、還り札が役割をなくしている」）。
    //   それまでは還り札か、地図の「還りの陣」で戻る。
    //   使い切ったかどうかは `kaeriNoHi`、灯るかどうかは `depth` で決まる（別の条件）。
    kaeriNoHi: true,
    // 装備を1つも持っていない＝まだ仕組みを知らない人。最初の1点を確定で出す
    needFirstEquip: (save.inv?.equips || []).length === 0
      && Object.keys(save.dex?.equips || {}).length === 0,
    /**
     * 一度でも倒した層ボス（`"tower:floor"`）。二度目からは**写し身**が出る
     * （2026-08-12 オーナー要望「同じボスだと感動が薄れる」）。
     * ★`save.dex.bosses` は輪廻しても残る。今の周の `progress.bossBeaten` では
     *   輪廻するたびに本物へ戻ってしまい、「二度目」の意味が失われる
     */
    bossDex: { ...(save.dex?.bosses || {}) },
    /**
     * 潜行を始めた時点で図鑑に載っている敵（2026-08-16）。上級作戦「読み切れ」が見る。
     * ★**この潜行で出会った敵は入れない**（`foundEnemies` は別物）。
     *   セーブへ書き戻るのは帰ってからなので、次の潜行から「知っている」になる。
     */
    knownEnemies: { ...(save.dex?.enemies || {}) },
    foundBosses: {},
    log: [],
    over: false, outcome: null,
    map: null,
    stats: { battles: 0, crushes: 0, floors: 0 },
  };
  run.map = generateFloor({ seed: `${seed}:m`, tower, floor, phase, luk: partyLuk(party) });
  say(run, `${TOWERS[tower].name} ${floorName(floor, tower)}に入った`);
  return run;
}

/** 還りの灯が灯る深さ（2026-08-11 オーナー指示「5階以上進んだら」） */
export const KAERI_NO_HI_DEPTH = 5;

/**
 * 還りの灯が灯っているか（＝使える状態か）。
 *
 * ★「まだ使っていない（`kaeriNoHi`）」とは**別の条件**。
 *   `retreat()` も画面も必ずこの関数を通すこと。
 *   条件を2か所に書くと、片方だけ直したときに
 *   「ボタンは押せるのに何も起きない」形でズレる。
 */
export function akariLit(run) {
  /**
   * ★層ボスを倒したら、深さに関わらず灯る（2026-08-14 オーナー指摘
   *   「支塔で10Fボスに最初から挑むと、還り札でしか還る手段がない。
   *     還り札がない場合に詰むので、ボスを倒したら還れるようにしましょう」）。
   *
   *   支塔は「最奥に入る」で**ボス階から始められる**。その階は1階ぶんなので
   *   `depth` は 5 に届かず、還りの灯が永久に灯らなかった。
   *   還り札を切らしていると、引き上げる手段が本当に無くなる。
   *   ★倒したあとだけ。倒す前に灯すと、ボス階へ入って即引き返す往復ができる。
   */
  if (run?.bossBeaten && Object.keys(run.bossBeaten).length > 0) return true;
  return (run?.depth || 0) >= KAERI_NO_HI_DEPTH;
}

/** 灯るまであと何階ぶんか（0なら灯っている） */
export function akariLeft(run) {
  if (akariLit(run)) return 0;
  return Math.max(0, KAERI_NO_HI_DEPTH - (run?.depth || 0));
}

/** いま還りの灯で引き上げられるか */
export function canUseAkari(run) {
  return !!run?.kaeriNoHi && akariLit(run);
}

function partyLuk(party) {
  return party.reduce((a, u) => a + u.luk, 0) / Math.max(1, party.length);
}

/** 仲間になっている人数（出撃していない控えも数える）。層ボスの割引に使う */
function rosterSize(save) {
  const n = Object.keys(save?.chars || {}).filter((id) => CHAR_BY_ID[id]).length;
  return Math.max(1, Math.min(4, n));
}

/**
 * 潜行の途中で仲間が加わったとき、**この潜行の戦闘にも加える**。
 *
 * ここが無いと「6階で鈴が仲間になった」と出るのに、7〜10階（10階の層ボスを含む）を
 * 主人公ひとりで戦うことになる。通知と実態が食い違ううえ、
 * ボスの人数割引まで「1人ぶん」で計算されて、初回は確実に弾き返される。
 * @returns {boolean} 実際に加わったか
 */
export function joinRun(run, save, charId) {
  if (!run || run.over) return false;
  run.roster = rosterSize(save);            // 控えでも「配られた仲間」は増えている
  if (run.party.some((u) => u.id === charId)) return false;
  if (run.party.length >= 4) return false;  // 出撃枠が埋まっていれば次の潜行から
  const added = makeParty(save, [charId], save.party.tacticChars || {});
  if (added.length === 0) return false;
  run.party.push(added[0]);
  say(run, `${added[0].name} が加わった`, 'join');
  return true;
}

/**
 * 装備のドロップ判定。
 *
 * 【要点】深度ボーナスは **個数（率）** に効かせる。レアリティ（rollEquip の luckBonus）
 * には効かせない。理由は、一度引いたレアリティは全滅時に遡って下げられないため。
 * 率に効かせておけば「上乗せ分の N 点を落とす」で機械的に処理でき、
 * 「深く潜って良い物を引き、わざと全滅して帰る」を成立させない。
 *
 * 乱数は戦闘用とは**別のシード**から引く。同じ rng を使うと、戦闘バランスを
 * 触るたびにドロップ内容が動いて、原因の切り分けができなくなる。
 */
function rollDrops(run, seedKey, { base = 0, chance = 0 }) {
  const rng = makeRng(`${run.seed}:drop:${run.floor}:${seedKey}`);
  const luck = partyLuk(run.party);

  // ★まだ一度も装備を持っていない人には、最初の1点を必ず出す。
  //   出ないと「装備を着せ替える」という遊びの柱に、最初の数十分まったく気づけない
  if (run.needFirstEquip) { base = Math.max(1, base); run.needFirstEquip = false; }

  // 因果盤「拾の因」（spec §6-5）。盤が無ければ倍率1で、乱数の消費数も変わらない
  chance = Math.min(1, chance * (run.board || NO_BONUS).dropMul);
  // ★装備の質は run.floor ではなく run.powerFloor で決める。
  //   支塔の生の階数（1〜10）を渡すと、BASES の階層フィルタが1〜10階の装備しか通さない
  const pf = run.powerFloor || run.floor;
  const lukBonus = luck + (TOWERS[run.tower]?.lukBonus || 0);
  const slotBias = TOWERS[run.tower]?.dropSlot || null;
  const mk = (fromBonus) => {
    // 支塔は狙った枠が出やすい（7割）。10割にすると他の2枠が一生更新されず、
    // 「防具を取りに来たのに武器が一本も出ない塔」になって周回が窮屈になる。
    // ★ slotBias が無い本編では rng.chance を呼ばない＝乱数の消費が変わらない
    const slot = slotBias && rng.chance(0.7) ? slotBias : null;
    const e = rollEquip({ seed: rng.int(1, 1e9), floor: pf, slot, luckBonus: lukBonus });
    e.fromBonus = fromBonus;
    return e;
  };

  const out = [];
  for (let i = 0; i < base; i++) out.push(mk(false));
  if (chance > 0 && rng.chance(chance)) out.push(mk(false));

  // 深度ボーナス由来の上乗せ（全滅時にまるごと失う分）
  let extra = (base + chance) * (R.depthBonus(run.depth) - 1);
  while (extra >= 1) { out.push(mk(true)); extra -= 1; }
  if (extra > 0 && rng.chance(extra)) out.push(mk(true));

  for (const e of out) {
    (e.fromBonus ? run.bonus.equips : run.gained.equips).push(e);
    // 図鑑は拾った時点で登録する（全滅で失っても「見つけた記録」は残す）
    run.foundBases = run.foundBases || {};
    run.foundBases[e.baseId] = 1;
    say(run, `${equipName(e)} を手に入れた${e.fromBonus ? '（深度ボーナス）' : ''}`, 'get');
  }
  return out;
}

/**
 * 支塔の踏破（表の最終階＝10階のボスを倒した）。
 *
 * 【なぜ「1階から通したときだけ」報酬を出すか】
 * 印は10階ごとなので、10階に一度着くと次からは「10階から開始 → 祠 → ボス → 終わり」の
 * 3ノードだけを回せてしまう（`canEnter` は到達済み＋1階まで許す）。
 * ボスのドロップは確定枠なので、**10〜15分の周回として設計した塔が2分の周回に化ける**
 * （2026-08-03 advisor指摘）。
 * ボス自体は何度でも挑めるままにして、**踏破報酬だけを「1階から通した潜行」に限る**。
 * こうすると近道は「ボスの練習」として残り、稼ぎの本線にはならない。
 */
function towerClearBonus(run) {
  const t = TOWERS[run.tower];
  if (!t || t.kind !== 'side' || run.floor !== t.floors) return [];
  run.towerCleared = true;
  if (run.startFloor !== 1) {
    say(run, `${t.name}を踏破した（踏破の品は1階から通したときだけ）`, 'win');
    return [];
  }
  say(run, `${t.name}を踏破した`, 'win');
  return rollDrops(run, 'clear', { base: 2 });
}

function say(run, text, kind = 'info') {
  run.log.push({ floor: run.floor, kind, text });
  if (run.log.length > 300) run.log.shift();
}

/** いま塔の中で使える油壺の数 */
export function oilLeft(run) {
  return Math.max(0, (run?.oilHave || 0) - (run?.oilUsed || 0));
}

/** 油壺1つで戻る灯の量 */
export const OIL_AKARI = 40;

/**
 * 油壺を使う（2026-08-12 オーナー指示「各道具の説明をも追加しておいて」への対応）。
 *
 * ★それまで**使う導線が無い道具**だった。持ち物の画面を作る以上、
 *   「持っているのに何にも使えない物」を並べるわけにはいかない。
 * ★灯が満ちているときは断る。押した瞬間に壺だけ減るのが、いちばん腹が立つ
 */
export function useOil(run) {
  if (run.over) return { ok: false, reason: 'over' };
  if (oilLeft(run) <= 0) return { ok: false, reason: 'none' };
  if (run.akari >= run.maxAkari) return { ok: false, reason: 'full' };
  run.oilUsed++;
  const before = run.akari;
  run.akari = Math.min(run.maxAkari, run.akari + OIL_AKARI);
  const gained = run.akari - before;
  say(run, `油壺をあけた。灯が ${gained} 戻った`, 'heal');
  return { ok: true, gained, left: oilLeft(run) };
}

// ── 薬（2026-08-13） ──────────────────────────────────────

/** いま塔の中で使える薬の数 */
export function medLeft(run, id) { return Math.max(0, (run?.pouch?.[id] || 0)); }

/** 塔の中で使える薬の一覧（持っているものだけ） */
export function medList(run) {
  const out = [];
  for (const [id, cnt] of Object.entries(run?.pouch || {})) {
    const it = ITEM_BY_ID[id];
    if (it && cnt > 0) out.push({ item: it, count: cnt });
  }
  return out;
}

/**
 * 塔の中（戦闘の外）で薬を使う。
 *
 * ★対象は**出撃している全員から1人**。UIが誰に使うかを決めて渡す
 *   （回復はいちばん減っている人、丸薬は選んだ人）。
 * ★丸薬（バフ）はここで使っても効き目のターン数は変わらない。
 *   `unit.buffs` は潜行のあいだ同じユニットに載り続け、次の戦闘の
 *   ターン経過で減っていく（＝戦いの直前に飲んでおく使い方になる）。
 */
export function useMedicine(run, id, unitIndex = -1) {
  if (run.over) return { ok: false, reason: 'over' };
  const it = ITEM_BY_ID[id];
  if (!it || medLeft(run, id) <= 0) return { ok: false, reason: 'none' };

  const living = run.party.filter((u) => u.alive);
  if (living.length === 0) return { ok: false, reason: 'none' };

  /**
   * 蘇生の薬（2026-08-16）。**倒れている人にしか使えない**ので、
   * ほかの薬とは対象の選び方が逆になる。ここで先に片付ける。
   */
  if (it.revive) {
    let d = run.party[unitIndex];
    if (!d || d.alive) d = run.party.find((u) => !u.alive);
    if (!d) return { ok: false, reason: 'full' };
    run.pouch[id] = medLeft(run, id) - 1;
    run.medUsed[id] = (run.medUsed[id] || 0) + 1;
    d.alive = true;
    d.hp = Math.max(1, Math.floor(d.max.hp * it.revive.hp));
    d.ailments = {};
    d.buffs = [];
    const text = `${d.name} が起き上がった（HP ${d.hp}）`;
    say(run, `${it.name}を使った。${text}`, 'heal');
    return { ok: true, text, target: d, left: medLeft(run, id) };
  }

  let t = run.party[unitIndex];
  if (!t || !t.alive) {
    // 既定の相手: HPの薬は一番減っている人、それ以外は先頭
    t = living[0];
    if (it.heal && it.heal.hp) for (const u of living) if (u.hp / u.max.hp < t.hp / t.max.hp) t = u;
    if (it.heal && it.heal.ki) for (const u of living) if (u.ki / u.max.ki < t.ki / t.max.ki) t = u;
    if (it.cure) {
      const ail = living.find((u) => Object.values(u.ailments || {}).some((v) => v > 0));
      if (ail) t = ail;
    }
  }

  // 効かないときは飲ませない（押した瞬間に薬だけ減るのを避ける・useOil と同じ考え）
  if (it.heal && it.heal.hp && t.hp >= t.max.hp) return { ok: false, reason: 'full' };
  if (it.heal && it.heal.ki && t.ki >= t.max.ki) return { ok: false, reason: 'full' };
  if (it.cure && !Object.values(t.ailments || {}).some((v) => v > 0)) return { ok: false, reason: 'full' };
  if (it.buff && t.buffs.some((bf) => bf.key === it.buff.key)) return { ok: false, reason: 'full' };

  run.pouch[id] = medLeft(run, id) - 1;
  run.medUsed[id] = (run.medUsed[id] || 0) + 1;

  let text = '';
  if (it.heal && it.heal.hp) {
    const amount = Math.min(it.heal.hp, t.max.hp - t.hp);
    t.hp += amount;
    text = `${t.name} のHPが ${amount} 回復した`;
  } else if (it.heal && it.heal.ki) {
    const amount = Math.min(it.heal.ki, t.max.ki - t.ki);
    t.ki += amount;
    text = `${t.name} の気が ${amount} 戻った`;
  } else if (it.cure) {
    t.ailments = {};
    text = `${t.name} の異常が消えた`;
  } else if (it.buff) {
    t.buffs.push({ key: it.buff.key, value: it.buff.value, turns: it.buff.turns });
    text = `${t.name} の${STAT_LABEL[it.buff.key] || it.buff.key}が上がった`;
  }
  say(run, `${it.name}を使った。${text}`, 'heal');
  return { ok: true, text, target: t, left: medLeft(run, id) };
}

const STAT_LABEL = { atk: '力', def: '守り', mag: '念', spd: '疾さ', luk: '運' };

/** 常闇（灯0）かどうか */
export function isTokoyami(run) { return run.akari <= 0; }
/** 薄明（灯30以下） */
export function isDim(run) { return run.akari <= R.AKARI_DIM && run.akari > 0; }

function spendAkari(run, n) {
  const phaseAkari = 1;   // 月齢による灯の消費補正は廃止（spec §5・2026-08-02改訂）
  run.akari = Math.max(0, run.akari - Math.round(n * phaseAkari));
  if (run.akari === 0) say(run, '灯が消えた。あたりが常闇に沈む', 'warn');
}

/** いま選べる次のノード */
export function choices(run) { return choicesOf(run.map); }

/**
 * ノードへ進んで、そこで起きることを解決する。
 * @returns {{type:string, ...}} 起きたことの内容（UIが演出に使う）
 */
export function advance(run, nodeId, { interactive = false } = {}) {
  if (run.over) return { type: 'over' };
  // ★`moveTo` は到着したノードに visited を立てるので、**動く前に**見ておく。
  //   ここを後で見ると、初回のマスまで「もう解決済み」と判定されて何も起きなくなる
  const already = !!run.map.nodes[nodeId]?.resolved;
  if (!moveTo(run.map, nodeId)) return { type: 'invalid' };
  /**
   * ★ここは powerFloor ではなく **run.floor**（2026-08-05 実測して確定）。
   *
   * 灯は「敵の強さ」ではなく「どれだけ長く潜っていられるか」の予算なので、
   * 効かせる相手は**歩く階数**であって強さではない。
   * 支塔は floors:10 固定＝必ず10階を1回で通すため、powerFloor（最大40）で引くと
   *   鬼哭洞218 ／ 疾風廊263 ／ 呪詛淵305
   * の灯が要る計算になり、持てる100を大幅に超えて**踏破が不可能**になる
   * （実測でも疾風廊の踏破率が 50% → 0% に落ちた）。
   * 本編は run.floor がそのまま実際の深さなので、これで意図どおり深いほど暗くなる。
   */
  spendAkari(run, R.akariCostMove(run.floor));
  const node = run.map.nodes[nodeId];
  const rng = makeRng(`${run.seed}:${run.floor}:${nodeId}`);

  /**
   * ★通り直したマスでは**何も起きない**（2026-08-12 オーナー指示
   *   「一度通った場所の効果はないものとしましょう」）。
   *
   *   これが無いと、祠と戦闘マスの間を往復するだけで
   *   「全快しながら無限に稼ぐ」ができてしまい、引き際の判断が消える。
   *   歩いたぶんの灯は上ですでに引いてある＝**空振りにも対価がある**。
   * ★階段・還りの陣・入口だけは通り直しても使える（`REPEATABLE`）。
   *   あちらは出来事ではなく構造物で、素通りしただけで消えては困る。
   */
  if (already && !REPEATABLE.has(node.type)) {
    say(run, '来た道だ。ここにはもう何も残っていない');
    return { type: 'revisit' };
  }
  node.resolved = true;

  switch (node.type) {
    case NODE.BATTLE:
    case NODE.BOSS:
      return resolveBattle(run, node, rng, interactive);
    case NODE.TREASURE:
      return resolveTreasure(run, rng);
    case NODE.HOKORA:
      return resolveHokora(run);
    case NODE.TRAP:
      return resolveTrap(run, rng);
    case NODE.AKINDO:
      return resolveAkindo(run, node);
    case NODE.KAII:
      return resolveKaii(run, node, interactive);
    case NODE.KAERI:
      // ★ここでは**まだ帰らない**。帰るかどうかは画面が聞く（`retreat(run, 'jin')`）。
      //   マスに乗った瞬間に強制送還すると、通り道として踏んだだけで潜行が終わる
      say(run, '床に古い陣が刻まれている。ここからなら還れる');
      return { type: 'kaeri' };
    case NODE.STAIRS:
      // 60階（頂）までは登り、そこから先は**塔の地下**へ降りる（2026-08-13 オーナー指示）
      // ★戻ってきたときに「見つけた」とは言わない（2026-08-12・通り直せるようにしたため）
      // ★「60階以上なら下」と直書きしない（2026-08-16）。次の階が地下かどうかで決める。
      //   支塔や周回で階の区切りが変わったとき、直書きだと文言だけ嘘になる
      say(run, already
        ? '階段の前に戻ってきた'
        : (isUnderground(run.floor + 1, run.tower) ? '下へ続く階段を見つけた' : '上へ続く階段を見つけた'));
      return { type: 'stairs' };
    default:
      say(run, '何もなかった');
      return { type: 'empty' };
  }
}

/**
 * 戦闘ノード。
 *
 * @param {boolean} interactive UI用。戦闘を**まわさずに**材料だけ返す。
 *   画面側が battleSteps() で1ターンずつ進め、終わったら finishBattle() を呼ぶ。
 *   ★シミュレーターは interactive=false で従来どおり。乱数の消費は
 *     どちらの経路でも同じ順序になるようにしてある（seedはここで確定させる）。
 */
function resolveBattle(run, node, rng, interactive = false) {
  const isBoss = node.type === NODE.BOSS;
  const bias = stanceBiasFor(run.tower, run.phase, PHASE_EFFECT[run.phase]?.stanceBias);
  const pf = run.powerFloor || run.floor;   // 強さの階数（支塔は生の階数と違う）
  // ボス階は手書きのボスデータを使う。無ければ生成式にフォールバックする
  const enemies = (isBoss && makeBossGroup({
    // 層ボスは「配られた仲間の数」で割り引く（run.roster）。出撃人数ではない
    tower: run.tower, floor: run.floor, powerFloor: pf,
    rebirth: run.rebirth, difficulty: run.difficulty, allies: run.roster || 4,
    dup: !!run.bossDex?.[bossKey(run.tower, run.floor)],
  }))
    || makeEnemyGroup({
      seed: `${run.seed}:e:${run.floor}:${node.id}`,
      floor: pf, tower: run.tower, stanceBias: bias,
      rebirth: run.rebirth, difficulty: run.difficulty,
      count: isBoss ? 1 : null,
      // 敵の数は味方の人数を超えない（battle/run.js のコメント参照）。
      // ★倒れた人数ではなく**編成した人数**で決める。潜行の途中で敵の数が変わると
      //   「立て直せない側がさらに追い込まれる」ので、run.party の長さで固定する
      allies: run.party.length,
    });
  /**
   * 図鑑に「出会った敵」を記録する（2026-08-12 オーナー指摘
   * 「見つけた敵が 0/33 になっている。すでに何匹か討伐しているので0はおかしい」）。
   *
   * ★**一度も書いていなかった**のが原因。装備（`foundBases`）だけ記録していて、
   *   敵の側は保存先（`save.dex.enemies`）だけが用意されて空のままだった。
   * ★記録するのは**出会った時点**。倒した時点にすると、逃げた敵・全滅した相手が
   *   一生載らず、「見たのに図鑑に無い」という別の不審が生まれる。
   * ★`e.art` は種族id（`makeEnemyGroup` が `sp.id` を入れている）。
   *   `e.id` は個体ごとの連番なので、そちらを使ってはいけない。
   * ★ボスは種族表に無いので載らない（層ボスは記録画面の別の欄で扱う）。
   */
  run.foundEnemies = run.foundEnemies || {};
  for (const e of enemies) if (e.art) run.foundEnemies[e.art] = 1;

  // 作戦によって「どこまで粘るか」が変わる（spec §3-8）
  const tactic = run.partyTactic || 'omakase';
  const opts = {
    seed: rng.int(1, 1e9), allies: run.party, enemies,
    partyTactic: tactic,
    tokoyami: isTokoyami(run), difficulty: run.difficulty, bossFight: isBoss,
    autoEscapeAt: ESCAPE_AT[tactic] ?? 0.15,
    // 戦闘中に作戦を変えたら、引き際の判断もその作戦のものに切り替える
    escapeAtOf: (t) => ESCAPE_AT[t] ?? 0.15,
    // 塔へ持ち込んだ薬（2026-08-13）。手動で選ぶほか、作戦「道具を惜しむな」がここから使う
    pouch: run.pouch,
    // 図鑑に載せた敵（2026-08-16）。上級作戦「読み切れ」だけが見る
    dex: knownDexFor(run, enemies),
  };

  if (interactive) return { type: 'battleStart', node, isBoss, enemies, opts };
  return finishBattle(run, node, runBattle(opts), enemies, isBoss);
}

/**
 * この戦闘で「もう知っている」敵（2026-08-16 オーナー指示）。
 *
 * ★見るのは**潜行を始めた時点のセーブの図鑑**（`run.knownEnemies`）。
 *   いま出会った敵（`run.foundEnemies`）を混ぜてはいけない。混ぜると
 *   出会った瞬間に全部「知っている」ことになり、読み切れの条件が意味を失う。
 * ★層ボスは種族図鑑に載らない（記録は `tower:floor`）。**一度倒していれば**
 *   その戦闘に出ている絵のidを知っているものとして扱う。守護者も同じ扱いにする
 *   （前に一度戦っているのだから、癖を読めていておかしくない）。
 */
function knownDexFor(run, enemies) {
  const out = { ...(run.knownEnemies || {}) };
  if (run.bossDex && run.bossDex[`${run.tower}:${run.floor}`]) {
    for (const e of enemies) if (e.art) out[e.art] = 1;
  }
  return out;
}

/** オートで粘る下限（作戦ごと）。spec §4-5-b「理不尽に死なない」の実装 */
export const ESCAPE_AT = {
  inochi: 0.30, mukizu: 0.40, omakase: 0.15, kitame: 0.15, yowai: 0.15, tegowai: 0.12,
  dougu: 0.25, gangan: 0.06, kuzushi: 0.10, kitsukau: 0.15, yomikire: 0.20, todome: 0.10,
};

/** 戦闘の決着を潜行に反映する。UIも自動プレイもここを通る */
export function finishBattle(run, node, res, enemies, isBoss = node.type === NODE.BOSS) {
  run.stats.battles++;
  spendAkari(run, R.AKARI_COST_BATTLE);

  /**
   * 戦闘中に飲んだ薬を潜行の持ち物へ引く（2026-08-13）。
   *
   * ★ここで引くこと。エンジンは `b.pouch` の**写し**を持っているので、
   *   引き忘れると「戦闘中は減るのに、戦闘が終わると元に戻る」無限の薬になる。
   * ★勝敗を問わず引く（逃げても飲んだ薬は戻らない）。
   */
  const used = res?.battle?.itemsUsed;
  if (used) {
    for (const [id, cnt] of Object.entries(used)) {
      if (!(cnt > 0)) continue;
      run.pouch[id] = Math.max(0, (run.pouch[id] || 0) - cnt);
      run.medUsed[id] = (run.medUsed[id] || 0) + cnt;
    }
  }

  if (res.result === 'win') {
    // 層ボスを倒したことを潜行に記録する（精算時にセーブへ移す）。
    // 到達階だけでは「60階に着いた」と「60階のボスを倒した」を区別できず、
    // エンディングの場面が拠点の取りこぼし拾いから漏れる（2026-08-03 レビュー指摘）
    if (isBoss) {
      (run.bossBeaten || (run.bossBeaten = {}))[run.floor] = 1;
      // 次に会うときは写し身。★支塔も含めるので塔IDを鍵に混ぜる
      (run.foundBosses || (run.foundBosses = {}))[bossKey(run.tower, run.floor)] = 1;
    }
    const rw = battleReward(enemies, run.powerFloor || run.floor, run.rebirth, run.difficulty);
    const bonus = R.depthBonus(run.depth);
    run.gained.exp += rw.exp;                              // 経験値には深度ボーナスを掛けない
    run.gained.zeni += rw.zeni;                            // 基本分
    const extraZeni = Math.floor(rw.zeni * (bonus - 1));   // 上乗せ分は別に持つ（全滅で失う）
    run.bonus.zeni += extraZeni;
    say(run, `戦いに勝った（EXP+${rw.exp} 銭+${rw.zeni + extraZeni}）`, 'win');
    const drops = rollDrops(run, `b${node.id}`, isBoss ? { base: 1, chance: 0.5 } : { chance: DROP_RATE.battle });
    if (isBoss) drops.push(...towerClearBonus(run));
    return { type: 'battle', result: 'win', battle: res, reward: rw, drops, cleared: !!run.towerCleared };
  }

  if (res.result === 'lose') {
    if (isBoss) {
      // ボス敗北は全滅扱いにしない（spec §4-5-b 保証4・2026-08-02改訂）
      for (const u of run.party) { u.alive = true; u.hp = Math.max(1, Math.floor(u.max.hp * 0.3)); }
      say(run, 'ボスに敗れ、来た道を引き返した（記録には残らない）', 'warn');
      return { type: 'battle', result: 'bossRetreat', battle: res };
    }
    wipe(run);
    return { type: 'battle', result: 'lose', battle: res };
  }

  // ★層ボス戦がターン上限で引き分けたときは「引き返した」扱いにする。
  //   そのまま切り抜けにすると、**ボスを倒さずに階段へ進めてしまう**。
  //   60階でこれをやられるとエンディングも後日談も出ないまま深層へ降りられる
  //   （2026-08-03 レビュー指摘。引き分け自体は変更前から起きうる）
  if (isBoss && res.result === 'draw') {
    for (const u of run.party) { u.alive = true; u.hp = Math.max(1, Math.floor(u.max.hp * 0.3)); }
    say(run, '決着がつかず、来た道を引き返した（記録には残らない）', 'warn');
    return { type: 'battle', result: 'bossRetreat', battle: res };
  }

  say(run, '戦いを切り抜けた');
  return { type: 'battle', result: res.result, battle: res };
}

/**
 * 怪異（選択肢イベント・spec §4-4）
 * interactive のときは選択肢を返すだけ。UIが選ばせて resolveKaiiChoice を呼ぶ。
 */
function resolveKaii(run, node, interactive) {
  const ev = pickEvent(run, node.id);
  if (!ev) { say(run, '怪異の気配がしたが、何も起こらなかった'); return { type: 'empty' }; }
  say(run, '怪異に出くわした');
  if (interactive) return { type: 'kaii', event: ev, node };
  // 自動プレイは素朴な政策で選ぶ（人間より賢くしない）
  return resolveKaiiChoice(run, ev, autoChoose(run, ev), node.id);
}

/** 選択肢を1つ選んだ結果を反映する。UIも自動プレイもここを通る */
export function resolveKaiiChoice(run, ev, choiceIndex, nodeId) {
  const res = chooseEvent(run, ev, choiceIndex, nodeId);
  if (!res || res.refused) return { type: 'kaii', result: null, refused: true };
  say(run, res.outcome.text, 'get');
  for (const line of res.applied) say(run, line);
  // 怪異で「装備を見つけた」ぶんをここで実際に生成する
  const n = run.pendingEquipDrops || 0;
  let drops = [];
  if (n > 0) {
    run.pendingEquipDrops = 0;
    drops = rollDrops(run, `k${nodeId}`, { base: n });
  }
  return { type: 'kaii', result: res, drops, event: ev };
}

/**
 * 塔の商人（spec §4-2「銭で購入。塔の中でしか買えない品あり」・2026-08-04 実装）
 *
 * それまで `say()` を1行出すだけで**何も起きなかった**（オーナー指摘）。
 *
 * 【何を売るか】
 * 1. **還り札** … 仕様（§4-3）は「拠点で購入」と書いているが拠点の店は未実装で、
 *    実際には怪異イベントでしか手に入らなかった。ここで初めて**銭で買える**ようになる。
 *    「もう1階潜るか、引き上げるか」という本作の芯に、銭で選択肢を買う判断が直に乗る
 * 2. **灯を注ぐ** … その場で灯を満たす。油壺（`oil`）は**使う導線がまだ無い**ので、
 *    アイテムではなく即時効果として売る（使えない物を売らない）
 *
 * 【値段】1潜行（5階ぶん）の稼ぎを実測して決めた: 5階=約1,780／20階=約2,600／40階=約5,370。
 * 還り札はその2〜3割になるようにしてある。安すぎると「札を買い足して延々と潜る」が
 * 最適解になり、引き際の緊張が消える。**在庫は1〜2枚**で、1潜行に買える数も絞る。
 *
 * 【決定論】品揃えは専用の乱数ストリームから作る（`:akindo:`）。
 * `advance()` が作る共有 rng を触ると、戦闘とドロップの消費順序がずれてゴールデンが全滅する。
 */
export function akindoPrices(powerFloor) {
  const pf = Math.max(1, powerFloor || 1);
  return {
    fuda: 200 + pf * 22,     // 5階=310 / 20階=640 / 40階=1,080
    akari: 60 + pf * 9,      // 灯を満たす
    ware: 1200 + pf * 90,    // 掘り出し物。5階=1,650 / 20階=3,000 / 40階=4,800
  };
}

function resolveAkindo(run, node) {
  const rng = makeRng(`${run.seed}:akindo:${run.floor}:${node.id}`);
  const pf = run.powerFloor || run.floor;
  const price = akindoPrices(pf);
  /**
   * 掘り出し物（2026-08-05）。
   *
   * 還り札と灯だけでは1潜行の稼ぎを使い切れず、**銭が無限に貯まる**という指摘を受けて足した。
   * 値段は1潜行ぶんの稼ぎとほぼ同額にしてあり、買うと「今回は儲けが消える」重さがある。
   * ★運を上乗せして良い物が出やすくしてある。ただの拾い物と同じ質なら、誰も買わない
   */
  const ware = rollEquip({ seed: rng.int(1, 1e9), floor: pf, luckBonus: 60 });
  ware.fromBonus = true;      // 買っても全滅すれば消える（銭で買った物だけ助かるのは筋が通らない）
  ware.bought = true;         // ★最高レア保護の対象外にする（settle の③を参照）
  run.shop = {
    nodeId: node.id,
    fudaLeft: rng.int(1, 2),   // 在庫。1潜行で買い占められないようにする
    akariLeft: 1,
    wareLeft: 1,
    ware,
    price,
  };
  say(run, '塔の商人がいる。荷を下ろして、こちらを見た');
  return { type: 'akindo', shop: run.shop };
}

/** 手持ちの銭（潜行中。上乗せ分を含む） */
export function purseOf(run) {
  return (run.gained.zeni || 0) + (run.bonus.zeni || 0);
}

/**
 * 商人から買う。
 * @param {string} what 'fuda' | 'akari'
 * @returns {{ok:boolean, reason?:string, text?:string}}
 */
export function buyFromAkindo(run, what) {
  const shop = run.shop;
  if (!run || run.over || !shop) return { ok: false, reason: 'noshop' };
  const cost = shop.price[what];
  if (cost == null) return { ok: false, reason: 'nosuch' };
  if (purseOf(run) < cost) return { ok: false, reason: 'zeni' };

  if (what === 'fuda') {
    if (shop.fudaLeft <= 0) return { ok: false, reason: 'stock' };
    payCost(run, { zeni: cost });
    shop.fudaLeft--;
    run.fuda++;
    // ★買った枚数を覚えておく。全滅したときに取り消すため（settle を参照）。
    //   payCost は「上乗せ分（全滅で消える銭）」から先に払うので、
    //   これが無いと**全滅する前提なら札が実質タダで手に入る**
    run.fudaBought = (run.fudaBought || 0) + 1;
    say(run, `還り札を買った（銭 ${cost}）`, 'get');
    return { ok: true, text: '還り札を1枚ゆずってもらった。' };
  }
  if (what === 'akari') {
    if (shop.akariLeft <= 0) return { ok: false, reason: 'stock' };
    // 満タンなら売らない（銭だけ取って何も起きないのを防ぐ）
    if (run.akari >= run.maxAkari) return { ok: false, reason: 'full' };
    payCost(run, { zeni: cost });
    shop.akariLeft--;
    run.akari = run.maxAkari;
    say(run, `灯を満たしてもらった（銭 ${cost}）`, 'heal');
    return { ok: true, text: '提灯に油が注がれ、灯が満ちた。' };
  }
  if (what === 'ware') {
    if (shop.wareLeft <= 0 || !shop.ware) return { ok: false, reason: 'stock' };
    payCost(run, { zeni: cost });
    shop.wareLeft--;
    run.bonus.equips.push(shop.ware);
    run.foundBases = run.foundBases || {};
    run.foundBases[shop.ware.baseId] = 1;
    say(run, `${equipName(shop.ware)} を買った（銭 ${cost}）`, 'get');
    return { ok: true, text: `${equipName(shop.ware)} を譲ってもらった。` };
  }
  return { ok: false, reason: 'nosuch' };
}

/**
 * その塔の宝から出る月齢素材を1つ選ぶ（2026-08-12）。
 *
 * ★`moonMats` を持つ塔（朔の窖・望の櫓）は**その一覧から**選ぶ。
 *   月齢素材が「その日の月のあいだしか採れない」＝現実で数日待つ、を無くすための塔。
 * ★それ以外（本編・鬼哭洞・疾風廊・呪詛淵・月渡り）は従来どおり**その日の月**。
 *   月齢で内容が変わるという設計そのものは残す（spec §5）。
 * ★**乱数を引くのは moonMats を持つ塔だけ**。本編でも1回引くようにすると、
 *   これまでの潜行の乱数列が丸ごとずれてゴールデンログが全滅する。
 */
function moonMatOf(run, rng) {
  const list = TOWERS[run.tower]?.moonMats;
  if (list && list.length > 0) return rng.pick(list);
  return PHASE_EFFECT[run.phase]?.material;
}

function resolveTreasure(run, rng) {
  const bonus = R.depthBonus(run.depth);
  // 支塔ごとの素材の偏り（spec §4-7-1「報酬が偏っているので目的を持った周回になる」）。
  // ★本編は倍率1なので、乱数の消費も個数も従来どおり
  const mm = TOWERS[run.tower]?.matMul || {};
  /**
   * ★端数は**確率で**足す。`Math.round` にすると、元の個数が1〜2しかないので
   *   ×0.8 が round(1*0.8)=1・round(2*0.8)=2 となって**倍率1と1個も変わらなかった**
   *   （報酬の偏りの「控えめにする側」だけが効いていない状態・2026-08-03 レビュー指摘）。
   *   本編は倍率1なので `m === 1` で即返し、乱数の消費も従来どおり
   */
  const mul = (key, nBase) => {
    const m = mm[key] ?? 1;
    if (m === 1) return nBase;
    const v = nBase * m;
    const base = Math.floor(v);
    return Math.max(0, base + (rng.chance(v - base) ? 1 : 0));
  };
  const zeni = Math.floor((20 + (run.powerFloor || run.floor) * 6) * rng.float(0.8, 1.3));
  const extraZeni = Math.floor(zeni * (bonus - 1));
  run.gained.zeni += zeni;
  run.bonus.zeni += extraZeni;

  const mat = moonMatOf(run, rng);
  const gotMat = rng.chance(0.5);
  if (gotMat && mat) {
    const base = mul('moon', rng.int(1, 2));
    const extra = Math.max(0, Math.floor(base * bonus) - base);
    run.gained.mats[mat] = (run.gained.mats[mat] || 0) + base;
    if (extra > 0) run.bonus.mats[mat] = (run.bonus.mats[mat] || 0) + extra;
    say(run, `宝を見つけた（銭+${zeni + extraZeni}、${MAT_NAME[mat] || mat}×${base + extra}）`, 'get');
  } else {
    say(run, `宝を見つけた（銭+${zeni + extraZeni}）`, 'get');
  }
  if (rng.chance(0.25)) {
    run.gained.items.oil = (run.gained.items.oil || 0) + 1;
    say(run, '油壺を手に入れた', 'get');
  }
  /**
   * 薬（2026-08-16 オーナー指示「宝からは薬も出るようにしておいて」）。
   *
   * ★1つの宝につき**1つまで**。深いほど良いものが混ざる（`TREASURE_MEDS`）。
   * ★`run.gained.items` に積む＝**持ち帰ってはじめて自分のもの**になり、
   *   99個の上限も `applyToSave` の側で掛かる。ここで `run.pouch` に足すと
   *   その場で飲めてしまい、「持ち込んだぶんで戦う」という設計が崩れる。
   */
  if (rng.chance(TREASURE_MED_RATE)) {
    const pf = run.powerFloor || run.floor;
    const pool = TREASURE_MEDS.filter((m) => pf >= m.f).map((m) => ({ w: m.w, v: m.id }));
    if (pool.length > 0) {
      const medId = rng.weighted(pool).v;
      run.gained.items[medId] = (run.gained.items[medId] || 0) + 1;
      say(run, `${ITEM_BY_ID[medId].name}を手に入れた`, 'get');
    }
  }
  // 鍛冶石・錬気素材もここから出す（無いと鍛冶・錬気の画面が永久に空になる）
  if (rng.chance(0.45)) {
    const nStone = mul('enhance_stone', rng.int(1, 2));
    run.gained.mats.enhance_stone = (run.gained.mats.enhance_stone || 0) + nStone;
  }
  if (rng.chance(0.35)) {
    const nRenki = mul('renki_mat', rng.int(1, 2));
    run.gained.mats.renki_mat = (run.gained.mats.renki_mat || 0) + nRenki;
  }

  // 1〜3階は実質チュートリアル（spec §13-1）。ここだけ宝から必ず装備が出る。
  // 出ないと「装備を着せ替える」という遊びの柱に、最初の数十分まったく気づけない
  const rate = run.tower === 'main' && run.floor <= 3 ? 1 : DROP_RATE.treasure;
  const drops = rollDrops(run, `t${run.map.current}`, { chance: rate });
  return { type: 'treasure', zeni: zeni + extraZeni, drops };
}

function resolveHokora(run) {
  /**
   * ★倒れた仲間も起き上がる（2026-08-03 修正）。
   *
   * spec §4-2 の表は祠を「HP/気全快」と書いているが、`alive` を戻していなかったため
   * **HPだけ満タンになって、戦闘には出てこない**状態になっていた。
   * 画面上は全快と表示されるのに人数が減ったまま戦い続けることになり、
   * 支塔の計測で「HP100%なのにボスに13連敗する」という形で表面化した。
   */
  const revived = run.party.filter((u) => !u.alive).map((u) => u.name);
  for (const u of run.party) { u.alive = true; u.hp = u.max.hp; u.ki = u.max.ki; u.ailments = {}; }
  /**
   * ★灯は**全快させない**（2026-08-05）。
   *
   * 祠はボス階に必ず置かれ、通常階でも数階に一度は引ける。そこで灯を満タンに戻していたため、
   * 移動の消費をいくら上げても「祠に寄る回数が増えるだけ」で、緊張感ではなく手数が増えていた。
   * HP・気は全快のまま（祠の役割）で、灯だけ定量にして「どこまで踏み込むか」の判断を残す。
   */
  const before = run.akari;
  run.akari = Math.min(run.maxAkari, run.akari + R.AKARI_HOKORA_GAIN);
  const gained = run.akari - before;
  // 灯が満ちていれば「灯が 0 戻った」とは書かない
  const akariText = gained > 0 ? `、灯が ${gained} 戻った` : '（灯はもう満ちている）';
  say(run, revived.length > 0
    ? `祠で休んだ。${revived.join('・')} も目を覚ました。HP・気が回復${akariText}`
    : `祠で休んだ。HP・気が回復${akariText}`, 'heal');
  return { type: 'hokora' };
}

function resolveTrap(run, rng) {
  const dmg = rng.int(8, 15);
  spendAkari(run, dmg);
  say(run, `罠だ。灯を ${dmg} 失った`, 'warn');
  return { type: 'trap', akariLost: dmg };
}

/** 階段から次の階へ降りる（＝深度ボーナスが積み上がる） */
export function descend(run, nowMs = 0) {
  if (run.over) return { ok: false };
  const t = TOWERS[run.tower];
  const next = run.floor + 1;
  const sec = sectionOf(run.tower, next);
  if (t.kind === 'side' && sec === 'oku' && !run.okuOpen) {
    say(run, 'この先へは進めない', 'warn');
    return { ok: false, reason: 'locked' };
  }
  return moveFloor(run, next, nowMs);
}

/**
 * いま立っている階段から、そのまま次の階へ（2026-08-16 オーナー報告
 * 「次のステージへ行こうとしても次階層へ進まないケースと進むケースがある」）。
 *
 * ★前の階から戻ってくると**階段の上に立った状態**になる。
 *   `advance` は「隣のマスへ動く」ものなので、足元のマスを押しても `moveTo` が
 *   隣接判定で弾き、何も起きなかった。1マス離れてから踏み直すと動く
 *   ＝「進むときと進まないときがある」の正体。
 * ★歩き賃は `backFloor` と同じく1歩ぶん引く。踏み直した場合は `advance` が引くので、
 *   どちらの道を通っても同じだけ灯を使う（片方だけタダにしない）。
 * ★引くのは**進めたときだけ**。支塔の奥がまだ開いていない等で止まったときに
 *   灯だけ減ると、押すたびに損をする押せないボタンになる。
 */
export function stairsFromHere(run, nowMs = 0) {
  if (run.over) return { ok: false };
  const node = run.map.nodes[run.map.current];
  if (!node || node.type !== NODE.STAIRS) return { ok: false, reason: 'notstairs' };
  const cost = R.akariCostMove(run.floor);
  const r = descend(run, nowMs);
  if (r.ok) spendAkari(run, cost);
  return r;
}

/**
 * 入口から**ひとつ前の階へ戻る**（2026-08-16 オーナー指示
 * 「最上段の入口ボタンを再度押したら前階層へ自動的に進んでください」）。
 *
 * ★この潜行で入った階より下へは戻れない。そこは塔の外だから
 *   （21階の印から入った潜行で20階へ行けてしまうと、印の意味が消える）。
 */
export function backFloor(run, nowMs = 0) {
  if (run.over) return { ok: false };
  const prev = run.floor - 1;
  if (prev < (run.startFloor ?? 1)) return { ok: false, reason: 'entry' };
  /**
   * ★戻るのも1歩ぶんの灯を使う（2026-08-16 オーナー指示
   *   「ただし、戻る場合でも進むごとに灯を使います」）。
   *   入口を押したときは `advance` を通さない＝歩いた扱いにならないので、ここで引く。
   *   引かないと「戻る向きだけ灯がタダ」になり、下の階へ逃げ続けられる。
   * ★引くのは**いま居る階**の歩き賃（深いほど高い）。降りてから引くと1階ぶん安くなる。
   */
  spendAkari(run, R.akariCostMove(run.floor));
  return moveFloor(run, prev, nowMs);
}

/**
 * 階を移る（上へも下へも、ここ1つを通す）。
 *
 * 【階を行き来できるようにしたときに塞いだ抜け道・2026-08-16】
 * 階の行き来ができると、素直に書くと**3つの無限稼ぎ**が生まれる。
 *
 *   ① 灯: 階段を上がるたびに `AKARI_GAIN_STAIRS` が入るので、
 *      往復するだけで灯が無限に湧く。灯は「どこまで踏み込むか」の予算そのもので、
 *      これが無限になると潜行の緊張が丸ごと消える。
 *   ② 深度ボーナス: `depth++` を往復のたびに通すと、同じ階を行き来するだけで
 *      持ち帰り倍率が青天井になる。
 *   ③ 宝と戦闘: `generateFloor` の種は階ごとに固定なので**同じ地図が再生成される**が、
 *      `visited`/`resolved` は初期値に戻る。つまり宝も敵も湧き直す。
 *
 * ★塞ぎ方は「**その潜行で最も深く到達した階を超えたときだけ、進んだと数える**」
 *   （①②）＋「**一度作った階の地図は取っておいて、戻ったら同じものを使う**」（③）。
 *   往復しても、灯も深度ボーナスも増えず、宝も復活しない。
 * ★戻る側は灯も返さない。**歩けば灯は減る**という原則だけが残る。
 */
/**
 * 取っておいた地図の「いま居る場所」を、入ってきた口に置き直す。
 * 見つからなければ何もしない（地図の作りが変わっても、階移動そのものは壊さない）。
 */
function enterAt(map, type) {
  const node = map.nodes.find((x) => x.type === type);
  if (!node) return;
  map.current = node.id;
  node.visited = true;
}

function moveFloor(run, to, nowMs = 0) {
  run.floorMaps = run.floorMaps || {};
  run.floorMaps[run.floor] = run.map;       // いま居る階の状態（開けた宝・倒した敵）を残す
  const deepest = run.deepest ?? run.startFloor ?? run.floor;
  const deeper = to > deepest;
  const back = to < run.floor;

  run.floor = to;
  run.powerFloor = powerFloorOf(run.tower, to);
  run.shop = null;      // 商人は置いてきた（階をまたいで買い続けられないようにする）
  if (deeper) {
    run.deepest = to;
    run.depth++;
    run.stats.floors++;
    run.akari = Math.min(run.maxAkari, run.akari + R.AKARI_GAIN_STAIRS);
  }
  run.phase = moonPhase(moonAge(nowMs));
  const kept = run.floorMaps[to];
  run.map = kept || generateFloor({
    seed: `${run.seed}:m`, tower: run.tower, floor: run.floor,
    phase: run.phase, luk: partyLuk(run.party),
  });
  /**
   * ★戻ってきた階では、**入ってきた口に立たせる**（2026-08-16 オーナー報告
   *   「さらに1個戻ってから進んで次階層へ行くのだが、入口じゃなくなってます」）。
   *
   *   取っておいた地図は `current` も一緒に持っている＝**前に出ていった場所**に
   *   立ち戻っていた。5階を階段から出て4階へ降り、また5階へ登ると、
   *   5階の入口ではなく「前に居た戦闘マス」の上に現れる。
   *   階を移る＝扉をくぐることなので、着く場所は向きで決まる。
   *     上へ（登る）→ その階の入口。下へ（戻る）→ その階の階段。
   * ★`resolved` は触らない。開けた宝も倒した敵もそのまま（湧き直させない）。
   */
  if (kept) enterAt(run.map, back ? NODE.STAIRS : NODE.START);

  // ★印を刻むのは**初めてその階に着いたとき**だけ（往復で何度も刻まない）
  const mark = deeper && isMarkFloor(run.tower, run.floor);
  if (back) {
    say(run, `${floorName(run.floor, run.tower)}へ戻った`, 'floor');
  } else {
    const dir = isUnderground(run.floor, run.tower) ? '降りた' : '登った';
    say(run, deeper
      ? `${floorName(run.floor, run.tower)}へ${dir}（深度ボーナス ×${R.depthBonus(run.depth).toFixed(2)}）${mark ? '／ここに印を刻んだ' : ''}`
      : `${floorName(run.floor, run.tower)}へ${dir}`, 'floor');
  }
  return { ok: true, floor: run.floor, mark, deeper, back, depthBonus: R.depthBonus(run.depth) };
}

/**
 * 引き上げる（還りの灯 / 還り札 / 還りの陣）。拾得物は全て確定する。
 *
 * @param {string} how 'auto'（灯→札の順に使う） | 'jin'（還りの陣。何も消費しない）
 *   | 'gate'（入った階の入口から歩いて外へ出る。何も消費しない）
 *
 * ★`gate` は「潜行を始めた階の入口に立っている」ときだけ画面が呼ぶ
 *   （2026-08-16 オーナー指示「入口から下に行こうとした場合は、祠に戻るか否かを
 *     選択できるようにし、戻る際は祠に戻るようにしましょう」）。
 *   札も灯も減らないが、**そこまで歩いて戻る道のりの灯**が代金になっている
 *   （階を1つ下りるたびに `backFloor` が1歩ぶん引き、階の中の移動でも引かれる）。
 */
export function retreat(run, how = 'auto') {
  if (run.over) return { ok: false };
  if (how === 'gate') {
    say(run, '入ってきた口から、塔の外へ出た。祠へ戻る', 'ret');
  } else if (how === 'jin') {
    // ★陣は「そこまで歩いた」ことが対価なので、灯も札も減らさない。
    //   陣に立っているかどうかの確認は呼び出し側（画面）が済ませている
    say(run, '還りの陣が淡く光った。祠へ戻る', 'ret');
  } else if (canUseAkari(run)) {
    run.kaeriNoHi = false;
    say(run, '還りの灯を灯した。祠へ戻る', 'ret');
  } else if (run.fuda > 0) {
    run.fuda--;
    say(run, '還り札を使った。祠へ戻る', 'ret');
  } else {
    // ★灯が「まだ灯っていない」のと「使い切った」のを区別して返す。
    //   画面がそのまま出せるようにしておかないと、
    //   「引き上げられない」としか言えず、あと何階で灯るのかが伝わらない
    return { ok: false, reason: akariLit(run) ? 'noFuda' : 'notLit', left: akariLeft(run) };
  }
  run.over = true;
  run.outcome = 'retreat';
  return { ok: true, ...settle(run, false) };
}

/** 力尽きる */
function wipe(run) {
  run.over = true;
  run.outcome = 'wipe';
  say(run, 'ちからつきた……気がつくと、麓の祠で目を覚ました', 'down');
}

/**
 * 潜行の精算。
 * @param {boolean} wiped 全滅したか
 * @returns 得たもの／失ったもの／因果
 */
export function settle(run, wiped = run.outcome === 'wipe') {
  const diff = R.DIFFICULTY[run.difficulty] || R.DIFFICULTY.normal;
  // 怪異で得た因果も足す（spec §4-4）。帰還も全滅も同率（spec §4-5）
  // 因果盤「巡の因」（spec §6-5）。盤で得た因果がさらに盤を進める
  const karmaMul = (run.board || NO_BONUS).karmaMul;
  const karma = Math.floor((R.karmaGain(run.gained.exp, run.rebirth) + (run.gained.karma || 0)) * karmaMul);
  const result = {
    outcome: run.outcome,
    exp: run.gained.exp,
    karma,
    zeni: run.gained.zeni + run.bonus.zeni,
    mats: mergeMats(run.gained.mats, run.bonus.mats),
    items: { ...run.gained.items },
    equips: [...run.gained.equips, ...run.bonus.equips],
    lost: { zeni: 0, mats: {}, equips: [] },
    depthBonus: R.depthBonus(run.depth),
    // ★難易度「やさしい」は何も失わない（diff.lost=false）。
    //   ここを wiped だけで判定すると、実際は失っていないのに結果画面が
    //   「上乗せぶんが消えた」と嘘をつく（2026-08-02 レビュー指摘）
    depthBonusLost: (wiped && diff.lost) ? R.depthBonus(run.depth) : 1,
    protectedEquip: null,
    floorsCleared: run.stats.floors,
    battles: run.stats.battles,
    foundBases: run.foundBases || {},
    foundEnemies: run.foundEnemies || {},
    foundBosses: run.foundBosses || {},
  };

  if (wiped && diff.lost) {
    /**
     * ★商人から買った還り札は、全滅したら手元に残さない。
     *
     * 買い物は「上乗せ分（全滅で消える銭）」から先に払う（events.payCost）。
     * ここで札を戻さないと、**どうせ全滅する潜行では札が実質タダで手に入る**
     * ことになり、「わざと全滅して持ち帰る」を封じている下の仕組みに穴が開く
     * （2026-08-04 レビュー指摘。実測で「銭は同額のまま札だけ2枚増える」を確認）。
     */
    if (run.fudaBought > 0) run.fuda = Math.max(0, run.fuda - run.fudaBought);

    // ①深度ボーナス由来の上乗せは**まるごと**失う（spec §4-5-a）。
    //   ここが「わざと全滅して持ち帰る」を成立させないための本体。
    result.lost.zeni = run.bonus.zeni;
    result.zeni = run.gained.zeni;
    result.mats = { ...run.gained.mats };
    for (const [k, v] of Object.entries(run.bonus.mats)) result.lost.mats[k] = v;
    result.lost.equips = [...run.bonus.equips];
    result.equips = [...run.gained.equips];

    // ②残った基本分から、さらに10%を失う（spec §4-5）
    const zeniLost = R.lostAmount(result.zeni);
    result.zeni -= zeniLost;
    result.lost.zeni += zeniLost;
    for (const [k, v] of Object.entries(result.mats)) {
      const lose = R.lostAmount(v);
      if (lose > 0) { result.lost.mats[k] = (result.lost.mats[k] || 0) + lose; result.mats[k] = v - lose; }
    }
    const equipLost = Math.floor(result.equips.length * R.LOST_RATE);
    if (equipLost > 0) {
      // 弱いものから失う（＝その潜行のいちばんの掘り出し物は残りやすい）
      const sorted = [...result.equips].sort((a, b) => equipRarity(a) - equipRarity(b));
      const drop = new Set(sorted.slice(0, equipLost));
      result.lost.equips.push(...drop);
      result.equips = result.equips.filter((e) => !drop.has(e));
    }

    /**
     * ③その潜行の最高レアリティ1点だけは必ず持ち帰る。
     *   目の前で伝説級を失う体験は「理不尽なストレスを作らない」（spec §6-2）と衝突する。
     *
     * ★**商人から買った物はこの保護に入れない**（2026-08-05 レビュー指摘）。
     *   `payCost` は「上乗せ分（全滅で消える銭）」から先に払うので、
     *   どうせ全滅する潜行では支払いが実質0円になる。そのうえ掘り出し物は
     *   運を上乗せして出しているため8割方その潜行の最高レアになり、
     *   **ほぼ必ずこの保護で救出されていた**＝「全滅前提ならタダで最上級品が手に入る」。
     *   還り札で塞いだ穴（`run.fudaBought`）と同じ型の抜け道が経路を変えて再発していた。
     */
    const all = [...run.gained.equips, ...run.bonus.equips].filter((e) => !e.bought);
    if (all.length > 0) {
      const best = all.reduce((a, b) => (equipRarity(b) > equipRarity(a) ? b : a));
      if (equipRarity(best) > 0 && !result.equips.includes(best)) {
        result.equips.push(best);
        result.lost.equips = result.lost.equips.filter((e) => e !== best);
        result.protectedEquip = best;
      }
    }
  }
  return result;
}

function mergeMats(a, b) {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) out[k] = (out[k] || 0) + v;
  return out;
}

/**
 * 潜行の成果をセーブへ反映する。
 * @returns {{overflow:Array, levelUps:Array}} 持ちきれなかった装備と、上がったレベル（UIが使う）
 */
export function applyToSave(save, result, run) {
  save.inv.zeni = (save.inv.zeni || 0) + result.zeni;
  for (const [k, v] of Object.entries(result.mats)) save.inv.mats[k] = (save.inv.mats[k] || 0) + v;
  /**
   * ★道具は1種類99までで頭打ち（2026-08-14 オーナー指示）。
   *   超えたぶんは**捨てた扱い**にする。何をいくつ捨てたかは result に残して
   *   結果画面が伝える（黙って消すと「拾ったはずの物が無い」になる）。
   */
  result.discarded = {};
  for (const [k, v] of Object.entries(result.items)) {
    const r = shopAddItem(save, k, v);
    if (r.discarded > 0) result.discarded[k] = r.discarded;
  }
  const fudaKeep = shopCapItem(run.fuda);
  if (run.fuda > fudaKeep) result.discarded.fuda = (result.discarded.fuda || 0) + (run.fuda - fudaKeep);
  save.inv.items.fuda = fudaKeep;
  // 塔の中で使った油壺を引く（拾ったぶんは上の result.items で足されている）
  if (run.oilUsed > 0) {
    save.inv.items.oil = Math.max(0, (save.inv.items.oil || 0) - run.oilUsed);
  }
  // 塔の中と戦闘中に飲んだ薬を引く（2026-08-13）
  for (const [id, cnt] of Object.entries(run.medUsed || {})) {
    if (cnt > 0) save.inv.items[id] = Math.max(0, (save.inv.items[id] || 0) - cnt);
  }
  save.karma.have = (save.karma.have || 0) + result.karma;

  // 拾った装備。**持ちきれない分を黙って消さない**（呼び出し側が売却を促す）
  const overflow = [];
  for (const e of result.equips || []) {
    const r = addEquip(save, e);
    if (!r.ok) overflow.push(e);
  }
  result.overflow = overflow;

  // 図鑑（見つけた記録は全滅で失っても残る）
  save.dex.equips = save.dex.equips || {};
  for (const baseId of Object.keys(result.foundBases || {})) save.dex.equips[baseId] = 1;
  // ★敵の図鑑（2026-08-12 に配線した。それまで一度も書かれていなかった）
  save.dex.enemies = save.dex.enemies || {};
  for (const spId of Object.keys(result.foundEnemies || {})) save.dex.enemies[spId] = 1;
  save.dex.bosses = save.dex.bosses || {};
  for (const k of Object.keys(result.foundBosses || {})) save.dex.bosses[k] = 1;
  save.dex.events = save.dex.events || {};
  for (const [id, picks] of Object.entries(run.seenEvents || {})) {
    save.dex.events[id] = { ...(save.dex.events[id] || {}), ...picks };
  }
  // ★道具と素材の図鑑（2026-08-13 オーナー指示「見つけた道具（薬）や素材を含める」）。
  //   持ち数（inv）は使えば0に戻るので、**手にした事実**を別に残す（meta/dex.js）
  for (const [id, v] of Object.entries(result.items || {})) if (v > 0) markItem(save, id);
  for (const [id, v] of Object.entries(result.mats || {})) if (v > 0) markMat(save, id);

  // 傷ついたHP・気を持ち越す（庵で休むと全快・spec §2-0）
  storePartyState(save, run.party);

  /**
   * 経験値は出撃メンバーに配る（レベルアップ処理は影送りと共有・growth.gainExp）。
   *
   * ★`gainExp` の戻り値を捨てないこと。誰が何レベル上がったかは**ここにしか無い**情報で、
   *   結果画面のレベルアップ演出はこれを材料にしている（2026-08-04 追加）。
   */
  const share = Math.floor(result.exp / Math.max(1, save.party.active.length));
  const levelUps = [];
  for (const id of save.party.active) {
    const g = gainExp(save, id, share);
    // ★覚えた技も一緒に持って上がる（2026-08-12）。潜行の精算では
    //   何レベルもまとめて上がるので、「そのレベルちょうど」ではなく**範囲**で聞く
    if (g.to > g.from) levelUps.push({ id, from: g.from, to: g.to, learned: learnedBetween(id, g.from, g.to) });
  }
  result.levelUps = levelUps;

  // 倒した層ボスの記録（全滅しても消さない。倒した事実は覆らない）
  if (run.tower === 'main' && run.bossBeaten) {
    save.progress.bossBeaten = save.progress.bossBeaten || {};
    for (const f of Object.keys(run.bossBeaten)) save.progress.bossBeaten[f] = 1;
  }

  // 到達記録
  if (run.tower === 'main') {
    save.progress.maxFloor = Math.max(save.progress.maxFloor || 1, run.floor);
    // ★全周を通じた最高到達。輪廻しても戻さない（機能の解放と印の判定に使う）
    save.progress.everMax = Math.max(save.progress.everMax || 1, save.progress.maxFloor);
    if (run.floor > 60) save.progress.deepMax = Math.max(save.progress.deepMax || 0, run.floor);
  } else {
    save.progress.towerMax = save.progress.towerMax || {};
    save.progress.towerMax[run.tower] = Math.max(save.progress.towerMax[run.tower] || 0, run.floor);
    // ★到達階（towerMax）と踏破は別物。10階に足を踏み入れただけで towerMax は10になるので、
    //   「ボスを倒したか」をこれと区別して残さないと、踏破の表示も「奥」の解放条件も作れない
    if (run.towerCleared) {
      save.progress.towerClear = save.progress.towerClear || {};
      save.progress.towerClear[run.tower] = 1;
    }
  }

  save.stats.battles = (save.stats.battles || 0) + result.battles;
  save.stats.floorsCleared = (save.stats.floorsCleared || 0) + result.floorsCleared;
  if (result.outcome === 'wipe') {
    save.stats.deaths = (save.stats.deaths || 0) + 1;
    save.stats.noDeathRun = false;      // 実績「還らずの登頂」が消える
  }
  return { save, overflow, levelUps };
}

/**
 * 層ボスの識別子（`"tower:floor"`）。
 *
 * ★塔IDを必ず混ぜること。階数だけを鍵にすると、本編10階の「朽ちた門番」を倒しただけで
 *   鬼哭洞10階の「哭き鬼」まで写し身になる（どちらも floor=10 のため）。
 */
export function bossKey(tower, floor) { return `${tower}:${floor}`; }

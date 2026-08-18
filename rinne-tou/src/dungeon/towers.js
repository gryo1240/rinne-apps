/**
 * 塔の定義（本編＋支塔4本＋各「奥」「無明」）
 *
 * spec §4-7（支塔）/ §4-7-6（奥・無明）/ §8（塔の構造）
 *
 * 【設計上の要点】支塔は本編の階層生成コードをそのまま再利用し、
 * 「敵の構え出現テーブル」と「報酬テーブル」を差し替えるだけにする。
 * 新しいダンジョンエンジンを作らない（工数を増やさないため）。
 */

import { everMax } from '../core/save.js';

export const TOWERS = {
  main: {
    id: 'main', name: '輪廻塔', short: '本編',
    kind: 'story',
    floors: 60,                    // 本編は60階（頂）。61F〜は塔の地下（地下1階〜・無限）
    deepFrom: 61,
    markEvery: 5,                  // 5階ごとに還り札の登録点
    bossEvery: 10,                 // 10階ごとに層ボス
    desc: '月へ続いていたという古い塔。頂に「還る門」がある',
    unlock: () => true,
  },
  kikoku: {
    id: 'kikoku', name: '鬼哭洞', short: '剛',
    kind: 'side', stanceOnly: 'gou', effective: 'ryu',
    floors: 10,                    // 表は10階1セット（10〜15分で完結）
    okuFrom: 11, okuTo: 50,        // エンディング後に開く「奥」
    mumyoFrom: 51,                 // 「守」を倒すと無限モード「無明」
    desc: '【剛】の敵ばかり。【流】で崩せる編成が要る',
    // ★ここだけ上限が他より低い。剛の敵は硬くて1戦が長引くぶん消耗が大きい。
    //   最初に開く支塔（月渡りと同時・二章）なので、4本のうち一番やさしい側に置く
    power: { base: 10, top: 17 },  // 表1〜10F ＝ 本編10〜17F 相当（後述）
    dropSlot: 'armor',             // 防具が出やすい
    matMul: { renki_mat: 1.6, enhance_stone: 0.8 },
    unlockChapter: 2, unlockHint: '二章（本編16階）まで進むと開きます',
    unlock: (save) => (save.progress?.chapter ?? 0) >= 2,
  },
  shippu: {
    id: 'shippu', name: '疾風廊', short: '疾',
    kind: 'side', stanceOnly: 'shitsu', effective: 'fu',
    floors: 10, okuFrom: 11, okuTo: 50, mumyoFrom: 51,
    desc: '【疾】の敵ばかり。【封】で止める編成が要る',
    power: { base: 18, top: 30 },  // 表1〜10F ＝ 本編18〜30F 相当
    dropSlot: 'charm',             // 護符が出やすい
    matMul: { renki_mat: 1.6, enhance_stone: 0.8 },
    unlockChapter: 3, unlockHint: '三章（本編26階）まで進むと開きます',
    unlock: (save) => (save.progress?.chapter ?? 0) >= 3,
  },
  jyuso: {
    id: 'jyuso', name: '呪詛淵', short: '呪',
    kind: 'side', stanceOnly: 'ju', effective: 'ha',
    floors: 10, okuFrom: 11, okuTo: 50, mumyoFrom: 51,
    desc: '【呪】の敵ばかり。【破】で潰す編成が要る',
    power: { base: 26, top: 40 },  // 表1〜10F ＝ 本編26〜40F 相当
    dropSlot: 'weapon',            // 武器が出やすい
    matMul: { renki_mat: 1.6, enhance_stone: 0.8 },
    unlockChapter: 4, unlockHint: '四章（本編36階）まで進むと開きます',
    unlock: (save) => (save.progress?.chapter ?? 0) >= 4,
  },
  /**
   * ── 月の素材を集める2本（2026-08-12 オーナー指示
   * 「月の素材が、その月のあいだしか採れないというのをやめたい。
   *   素材回収にリアルタイムで数日待つ必要があるのはストレスでしかないので、
   *   入れるダンジョンを増やして素材を回収できるようにしておこう」）
   *
   * 【なぜ2本なのか】月齢素材は8種ある。1本にまとめると「どれが出るか運任せ」で
   * 目当ての素材まで遠く、8本に分けると塔の一覧が9行になって選ぶ画面が壊れる。
   * **満ちる側4種／欠ける側4種**で割ると、月の巡りという世界観のまま
   * 「今日はどっちへ行くか」の1択に落ちる。
   *
   * 【両方とも二章で開く理由】鍛冶は+1から月齢素材を要る（2026-08-12 の変更）。
   * 片方を三章以降にすると、**最初に配られる小太刀（欠けの欠片）が
   * 三章まで鍛えられない**。素材の供給が装備の供給より遅れてはいけない。
   *
   * ★`moonMats` を持つ塔では、宝から出る月齢素材が**その日の月ではなく
   *   この一覧から**出る（dungeon/explore.js の resolveTreasure）。
   *   本編と月渡りはこれを持たないので、従来どおり「その日の月齢の素材」。
   */
  sakugura: {
    id: 'sakugura', name: '朔の窖', short: '朔',
    kind: 'side', stanceOnly: null, effective: null,
    floors: 10, okuFrom: 11, okuTo: 50, mumyoFrom: 51,
    desc: '月が満ちていく側の素材が採れる。三つの構えが混ざる',
    power: { base: 10, top: 18 },  // 表1〜10F ＝ 本編10〜18F 相当（鬼哭洞と同じ入りやすさ）
    dropSlot: null,
    moonMats: ['yamigoke', 'shogen', 'shippu', 'yoimachi'],   // 新月・三日月・上弦・十三夜
    matMul: { moon: 2.2, enhance_stone: 0.8 },
    unlockChapter: 2, unlockHint: '二章（本編16階）まで進むと開きます',
    unlock: (save) => (save.progress?.chapter ?? 0) >= 2,
  },
  mochiyagura: {
    id: 'mochiyagura', name: '望の櫓', short: '望',
    kind: 'side', stanceOnly: null, effective: null,
    floors: 10, okuFrom: 11, okuTo: 50, mumyoFrom: 51,
    desc: '月が欠けていく側の素材が採れる。朔の窖より手ごわい',
    power: { base: 14, top: 26 },  // 表1〜10F ＝ 本編14〜26F 相当
    dropSlot: null,
    moonMats: ['michi', 'izayoi', 'kake', 'ariake'],          // 満月・十六夜・下弦・二十六夜
    matMul: { moon: 2.2, enhance_stone: 0.8 },
    unlockChapter: 2, unlockHint: '二章（本編16階）まで進むと開きます',
    unlock: (save) => (save.progress?.chapter ?? 0) >= 2,
  },
  tsukiwatari: {
    id: 'tsukiwatari', name: '月渡り', short: '月',
    kind: 'side', stanceOnly: null, effective: null, moonDriven: true,
    floors: 10, okuFrom: 11, okuTo: 50, mumyoFrom: 51,
    desc: '現実の月齢で出る敵の構えが変わる。読みと切り替えが要る',
    power: { base: 10, top: 20 },  // 表1〜10F ＝ 本編10〜20F 相当
    dropSlot: null,                // 枠は偏らない代わりに**質**が上がる
    lukBonus: 25,                  // 稀・伝が出やすい（rollEquip の luckBonus に加算）
    matMul: { enhance_stone: 1.8, moon: 1.6 },   // 鍛冶石と「その日の月齢素材」が多い
    unlockChapter: 2, unlockHint: '二章（本編16階）まで進むと開きます',
    unlock: (save) => (save.progress?.chapter ?? 0) >= 2,
  },
};

export const TOWER_LIST = Object.values(TOWERS);

/**
 * 「実効階層」＝ 敵の強さ・装備ドロップの質を決めるための階数（2026-08-03 追加）
 *
 * 【なぜ要るか】支塔は表が1〜10階しかない。その数字をそのまま強さの計算に渡すと、
 * 敵は本編1〜10階と同じ強さになり、`rollEquip` の階層フィルタ（BASES の f 範囲）も
 * 1〜10階の装備しか通さない。岩鎧(30F〜)・手鏡(24F〜)・大太刀(20F〜)は一生出ない。
 *
 * 一方で支塔が開くのは二章（本編16階）以降。
 * **本編16階まで進んだ人が、1階相当の敵を殴って1階相当の装備を拾う**ことになり、
 * 「報酬が偏っているから通う」以前に通う理由がゼロになる（2026-08-03 advisor指摘）。
 *
 * そこで「見た目の階数（run.floor）」と「強さの階数（run.powerFloor）」を分ける。
 *   - 表示・進行・印・到達記録 … run.floor（1〜10）
 *   - 敵/ボス/装備/報酬の計算  … powerFloorOf() の値
 * **本編は恒等写像**なので、ゴールデンログは1本も動かない。
 *
 * 上限を60に張ってあるのは、deepScale(61F〜) の指数倍率を踏まないため。
 * 「奥」（11〜50F・v1.1）を実装するときは、この写像を別に設計し直すこと。
 */
export function powerFloorOf(towerId, floor) {
  const t = TOWERS[towerId];
  if (!t || t.kind === 'story' || !t.power) return floor;
  const { base, top } = t.power;
  const span = Math.max(1, t.floors - 1);
  const f = Math.min(t.floors, Math.max(1, floor));
  return Math.min(60, Math.round(base + ((top - base) * (f - 1)) / span));
}

/** その塔の踏破（表の最終階のボスを倒したか） */
export function isTowerCleared(save, towerId) {
  return !!save?.progress?.towerClear?.[towerId];
}

/**
 * 月渡りだけは月齢でテーマが変わる（spec §4-7-4）。
 * 【重要】強さは変えない。**対策する系統が変わるだけ**（有利不利を作らない方針）
 */
export function tsukiwatariStance(phase) {
  if (phase === 'new' || phase === 'crescent') return 'ju';
  if (phase === 'firstQuarter' || phase === 'gibbous') return 'shitsu';
  if (phase === 'full' || phase === 'waningGibbous') return 'gou';
  return null;   // 下弦・二十六夜は3種が均等＝最も難しい
}

/** その塔・その階での「敵の構えの偏り」を返す */
export function stanceBiasFor(towerId, phase, moonBias) {
  const t = TOWERS[towerId];
  if (!t) return null;
  if (t.moonDriven) return tsukiwatariStance(phase);
  if (t.stanceOnly) return t.stanceOnly;
  return moonBias || null;      // 本編は月齢の偏りをそのまま使う
}

/**
 * 表示用の階の呼び名（2026-08-13 オーナー指示）。
 *
 * > 「61階からは潜っていくという話ですが、60階から61階に潜るというのはやはり合わないので、
 * >   塔の地下があったことにして、地下1階、2階...と降りていくようにしませんか」
 *
 * 本編の61階以降は **地下1階・地下2階…** と数え直す（頂＝60階の下に地下がある）。
 *
 * ★**内部の階数（run.floor・セーブの maxFloor）は61,62…のまま**。
 *   ここは呼び名だけを変える関数で、強さの計算・印・到達記録・ゴールデンログには一切触らない。
 *   数え方そのものを変えると、既存のセーブ（61階に印がある人）の意味が変わってしまう。
 * ★支塔は「奥」「無明」で階数が伸びるが、あちらは地下ではないので**そのまま「N階」**。
 *   だから塔のIDを受け取る（既定は本編）。
 */
export function floorName(floor, towerId = 'main') {
  const f = Number(floor) || 0;
  const t = TOWERS[towerId];
  if (t && t.kind === 'story' && f > t.floors) return `地下${f - t.floors}階`;
  return `${f}階`;
}

/** 本編の地下（旧・深層）か */
export function isUnderground(floor, towerId = 'main') {
  const t = TOWERS[towerId];
  return !!(t && t.kind === 'story' && (Number(floor) || 0) > t.floors);
}

/** 表示用の区分（表 / 奥 / 無明 / 地下） */
export function sectionOf(towerId, floor) {
  const t = TOWERS[towerId];
  if (!t) return 'unknown';
  if (t.kind === 'story') return floor > t.floors ? 'deep' : 'main';
  if (floor <= t.floors) return 'omote';
  if (floor >= t.mumyoFrom) return 'mumyo';
  return 'oku';
}

/** その階が層ボス階かどうか */
export function isBossFloor(towerId, floor) {
  const t = TOWERS[towerId];
  if (!t) return false;
  if (t.kind === 'story') return floor <= t.floors && floor % t.bossEvery === 0;
  return floor === t.floors || floor === t.okuTo;   // 支塔は最終階と「奥」の50F（＝守）
}

/** 還り札の登録点か */
export function isMarkFloor(towerId, floor) {
  const t = TOWERS[towerId];
  if (!t) return false;
  if (t.kind === 'story') return floor % (t.markEvery || 5) === 0;
  return floor % 10 === 0;
}

/** その塔でその階に入れるか（到達済み範囲＋解放状況） */
export function canEnter(save, towerId, floor) {
  const t = TOWERS[towerId];
  if (!t || !t.unlock(save)) return false;
  if (floor < 1) return false;
  if (t.kind === 'story') {
    if (floor > t.floors && !save.progress?.cleared) return false;   // 地下はクリア後
    // ★輪廻すると maxFloor は1に戻るが、印（登録点）は残る（spec §8-3）。everMax で判定する
    return floor <= everMax(save);
  }
  const reached = save.progress?.towerMax?.[towerId] ?? 0;
  if (floor > t.floors && !save.progress?.cleared) return false;     // 「奥」はクリア後
  return floor <= Math.max(1, reached + 1);
}

/**
 * 拠点の入口UI用の一覧。
 *
 * ★未解放の塔も `locked: true` を付けて**必ず返す**（2026-08-03 変更）。
 *   影送り・因果盤は解放前も「◯階を越えると開きます」と灰色で見せているのに、
 *   支塔だけは存在ごと隠れていて「まだ先がある」が伝わらなかった。
 */
export function availableTowers(save) {
  return TOWER_LIST.map((t) => ({
    id: t.id, name: t.name, desc: t.desc,
    locked: !t.unlock(save),
    hint: t.unlockHint || '',
    reached: t.kind === 'story' ? everMax(save) : (save.progress?.towerMax?.[t.id] ?? 0),
    cleared: t.kind === 'side' && isTowerCleared(save, t.id),
    okuOpen: t.kind === 'side' && !!save.progress?.cleared,
  }));
}

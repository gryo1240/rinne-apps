/**
 * 輪廻（周回）― spec §8-3
 *
 * エンディング後、任意のタイミングで最初から登り直す。
 * 敵が強くなり（×1.35/周）、報酬も増える（×1.5/周）。DOM非依存。
 *
 * ── 何を戻して何を戻さないか（設計の要・2026-08-03） ────────────
 *
 * 進行を表す値は**2つに分けてある**（`save.js` の `everMax()` 参照）:
 *   `progress.maxFloor`  今の周でどこまで登ったか  → 輪廻で1に戻る
 *   `progress.everMax`   全周を通じた最高到達      → 輪廻でも戻さない
 * 機能の解放（因果盤11F・影送り21F）と還り札の登録点は **everMax** で判定する。
 * ここを分けずに `maxFloor` だけで判定していると、輪廻した瞬間に
 * 「因果盤は引き継ぐ」という仕様に反して盤も影送りも画面ごと閉じる。
 *
 * **戻さないものには理由がある**（消すと詰む）:
 *   ・`story.seen`  … 会話は既読のまま＝2周目は出ない。
 *                     ここを消すと `matches()` の boss 分岐が全部成立して、
 *                     輪廻した直後の拠点で**エンディングの場面が再生される**
 *   ・`progress.cleared` … エンディングの場面はもう既読なので、消すと `applyScene` が
 *                     二度と立て直せない。深層に入れず、**二度と輪廻できなくなる**
 *   ・`progress.chapter` … 章は場面が進めるもの。消すと支塔が永久にロックされる
 *
 * ── 仕様との差分（v1.0・意図的） ──────────────────────────
 * 仕様「2周目以降は会話をスキップできる」は、v1.0では
 * **「既読のまま＝最初から全部スキップ済み」**として実装している。
 * 物語を2周目にも流したいなら `story_flow` に
 * 「rebirth>0 なら会話画面へ行かず applyScene だけ静かに回す」経路を足し、
 * `story.seen` を消すのとセットにすること（v1.1）。
 * 加入は `applyScene` が担っているので、この形なら仲間は正しく入る。
 */

import * as R from '../core/rules.js';
import { newSave, SAVE_VERSION } from '../core/save.js';
import { equipScore, unpackEquip, equipName, equipRarity } from './growth.js';
import { CHAR_BY_ID } from '../../data/chars.js';
import { BASES } from '../../data/equips.js';

/** baseId → 装備の枠（武器/防具/護符） */
const BASE_SLOT = Object.fromEntries(BASES.map((b) => [b.id, b.slot]));

/** 引き継げる装備の数（武器・防具・護符を1つずつ＝ちょうど1式） */
export const KEEP_SLOTS = ['weapon', 'armor', 'charm'];

/** 輪廻できるか（エンディング到達後） */
export function canRebirth(save) {
  return !!save?.progress?.cleared;
}

/**
 * 引き継ぐ装備の既定値。**枠ごとに最良を1つずつ**選ぶ。
 *
 * 「スコア上位3つ」にすると武器が3本残りうる。装備枠は武器/防具/護符の3つなので、
 * 枠ごとにベスト＝ちょうど1式になり、仕様の「上位3つ」の意図と一致する。
 * スコアは UI の「おすすめ」と同じ `equipScore` を使う（輪廻だけ別の基準を作らない）。
 * 基準キャラは主人公。2周目もひとりで戦う時間が長いため。
 */
export function defaultKeep(save, charId = 'hero') {
  const best = {};
  for (const t of save?.inv?.equips || []) {
    const e = unpackEquip(t);
    const b = BASE_SLOT[e.baseId];
    if (!b) continue;
    const s = equipScore(charId, e);
    if (!best[b] || s > best[b].score) best[b] = { uid: e.uid, score: s, equip: e };
  }
  return KEEP_SLOTS.map((s) => best[s]).filter(Boolean).map((x) => x.uid);
}

/**
 * 輪廻したら何が残って何が消えるか。確認画面に出す用。
 * **実際の輪廻と同じ関数から作る**（表示と実装がずれないように）。
 */
export function preview(save, keepUids = null) {
  const uids = keepUids || defaultKeep(save);
  const keep = (save.inv?.equips || [])
    .map(unpackEquip)
    .filter((e) => uids.includes(e.uid))
    .map((e) => ({ uid: e.uid, name: equipName(e), rarity: equipRarity(e), slot: BASE_SLOT[e.baseId] }));
  // 輪廻した回数（rebirth）と、プレイヤーが数える「◯周目」は1ずれる。
  // 初回は rebirth=0 で1周目。輪廻すると rebirth=1 になり、そこからが2周目
  const n = (save.progress?.rebirth || 0) + 1;   // 輪廻したあとの回数
  const lap = n + 1;                             // 次に始まる周（表示用）
  const chars = Object.keys(save.chars || {}).filter((id) => CHAR_BY_ID[id]);
  return {
    keep: {
      equips: keep,
      karma: save.karma?.have || 0,
      board: (save.board || []).filter((v) => v).length,
      chars: chars.map((id) => CHAR_BY_ID[id].name),
      renki: chars.reduce((a, id) => a + Object.values(save.chars[id].renki || {}).reduce((x, y) => x + y, 0), 0),
      dex: Object.keys(save.dex?.enemies || {}).length + Object.keys(save.dex?.equips || {}).length,
    },
    lose: {
      lv: Math.max(...chars.map((id) => save.chars[id].lv || 1), 1),
      equips: Math.max(0, (save.inv?.equips || []).length - keep.length),
      zeni: save.inv?.zeni || 0,
      mats: Object.values(save.inv?.mats || {}).reduce((a, b) => a + b, 0),
    },
    next: {
      rebirth: n, lap,
      enemyMul: R.rebirthScale(n),
      rewardMul: R.rebirthReward(n),
      renkiMax: R.renkiMax(n),
      lvCap: R.levelCap(n),
    },
  };
}

/**
 * 輪廻を実行して**新しいセーブを返す**（引数は書き換えない）。
 *
 * ★`newSave()` を土台に、引き継ぐものだけを移す形にしてある。
 *   逆（今のセーブから消していく）にすると、消し忘れが**静かにゲームを壊す**
 *   （60階の装備が1つ残る／dangling な uid が残る）。
 *   引き継ぎ忘れは「因果が消えた」と目に見えるうえ、テストで固定できる。
 *   `newSave()` にフィールドが増えたときの追随漏れは、
 *   test.mjs の「輪廻後のキー集合＝newSave のキー集合」で機械的に捕まえる。
 */
export function rebirth(save, { keepUids = null } = {}) {
  if (!canRebirth(save)) return null;
  const uids = keepUids || defaultKeep(save);
  const kept = (save.inv?.equips || []).filter((t) => uids.includes(t[0]));

  const next = newSave(save.name);

  // ── そのまま持っていくもの ──
  next.v = SAVE_VERSION;   // 中身は新形式なので、古い v を名乗らない
  next.id = save.id;                        // 影送りの乱数シード・ランキングの識別に使う
  next.createdAt = save.createdAt;
  next.playSec = save.playSec || 0;
  next.lastSeenAt = save.lastSeenAt || 0;
  next.difficulty = save.difficulty || 'normal';
  next.settings = { ...save.settings };
  next.ranking = { ...save.ranking };        // uid を消すとランキングの識別子が失われる
  next.karma = { ...save.karma };             // 因果は引き継ぐ（spec §8-3）
  next.board = (save.board || []).slice();    // 因果盤も（輪廻の積み上げ先）
  next.boardV = save.boardV;
  next.dex = JSON.parse(JSON.stringify(save.dex || {}));
  next.story = JSON.parse(JSON.stringify(save.story || { seen: {} }));   // 会話は既読のまま＝出ない
  /**
   * 進行。**「今の周の到達」だけを1に戻す**（spec §8-3「ストーリー進行を失う」）。
   *
   * ・`everMax`（全周の最高到達）は残す。因果盤(11F)・影送り(21F)・支塔の解放と
   *   還り札の登録点はこちらで判定するので、**輪廻しても閉じない**
   *   （＝仕様「2周目以降は登録点が最初から全開放」もこれで満たしている）
   * ・`cleared` は**残す**。エンディングの場面はもう既読なので、消すと
   *   `applyScene` が二度と立て直せず、深層にも入れず二度と輪廻できなくなる
   * ・`chapter` も残す。章は場面が進めるものなので、消すと支塔が永久にロックされる
   * ・`bossBeaten` は今の周の記録なので空にする（記録画面の「突破」表示用）
   */
  next.progress = {
    ...save.progress,
    rebirth: (save.progress?.rebirth || 0) + 1,
    maxFloor: 1,
    everMax: Math.max(1, save.progress?.everMax || 0, save.progress?.maxFloor || 0),
    bossBeaten: {},
  };
  next.stats = { ...save.stats, noDeathRun: true };   // 実績「還らずの登頂」は周ごとに挑める

  // ★その周で使った最も低い難易度。定義上、周が変わればリセットするのが正しい
  next.minDifficulty = 'rinne';

  // ── 仲間: レベルは1へ。錬気とスキル熟練度は引き継ぐ（spec §8-3） ──
  next.chars = {};
  for (const id of Object.keys(save.chars || {})) {
    if (!CHAR_BY_ID[id]) continue;            // 手書きされたセーブの未知IDは落とす
    const c = save.chars[id];
    next.chars[id] = {
      lv: 1, exp: 0,
      renki: { ...(c.renki || {}) },
      skills: { ...(c.skills || {}) },
      equip: [0, 0, 0],                       // ★全員ぶん外す。残さないと宙に浮いた uid になる
      // hp / ki / ailments（庵の持ち越し）は持たせない。Lv1の器に旧HPが載るのを防ぐ
    };
  }
  if (!next.chars.hero) next.chars.hero = { lv: 1, exp: 0, renki: {}, skills: {}, equip: [0, 0, 0] };
  next.party = {
    active: (save.party?.active || ['hero']).filter((id) => next.chars[id]).slice(0, 4),
    tacticParty: save.party?.tacticParty || 'omakase',
    tacticChars: { ...(save.party?.tacticChars || {}) },
  };
  if (next.party.active.length === 0) next.party.active = ['hero'];

  // ── 持ち物: 選んだ装備だけ。素材と銭は失う ──
  next.inv = {
    equips: kept.map((t) => t.slice()),
    mats: {},
    items: { oil: 2, fuda: 1 },   // ★0にしない。1周目にはあった脱出手段が無い状態で始まってしまう
    zeni: 0,
    nextUid: save.inv?.nextUid,   // uid は使い回さない（図鑑・装備参照の取り違えを生む）
  };
  if (next.inv.nextUid == null) delete next.inv.nextUid;
  // 残した装備は主人公に着せる（枠ごとに1つなので必ず収まる）
  next.chars.hero.equip = [0, 0, 0];
  for (const t of next.inv.equips) {
    const e = unpackEquip(t);
    const i = KEEP_SLOTS.indexOf(BASE_SLOT[e.baseId]);
    if (i >= 0) next.chars.hero.equip[i] = e.uid;
  }

  /**
   * ── 影送りは全部畳む ──
   *
   * `dispatch`（稼働中）だけでなく、実行時に生えるフィールドも**意図的に捨てる**:
   *   `dispatchHold`  祠が預かっている拾い物 → 「その他の装備」なので失う（spec §8-3）
   *   `dispatchCool`  影送りのクールタイム   → 周が変われば意味を持たない
   *   `savedAt` / `lastPhase` … 実行時のキャッシュ。次のセーブで入り直す
   * ★これらは `newSave()` に無いので、test.mjs の「キー集合の一致」では捕まらない。
   *   影送りに手を入れて新しい実行時フィールドを足したら、ここも見直すこと
   */
  next.dispatch = [];

  return next;
}

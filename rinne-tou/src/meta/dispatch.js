/**
 * 影送り（かげおくり）＝ 派遣システム（spec §7）
 *
 * > オーナー要件「寝てる時間でも勝手にダンジョン探索してアイテム収集」への回答。
 * > 祠で控えのキャラの「影」を切り離し、塔へ送る。影は主のいない間も歩き続ける。
 *
 * DOM非依存。`Math.random()` は使わない（決定論・README「絶対に壊してはいけないこと」1）。
 *
 * ── 設計上の要点（あとから読む人へ） ──────────────────────
 *
 * 1. **収穫は「経過時間」ではなく「選んだ時間（1〜20hから1時間刻みで選ぶ）」だけで決まる。**
 *    放置した時間で増える作りにすると、時計を進める不正がそのまま利益になる。
 *    固定時間なら、いくら放置しても・いくら時計を進めても収穫は同じ上限で止まる。
 *    これが spec §7-3 の「1回の受け取り上限」を式のレベルで保証する形
 *    （2026-08-13 に選べる最長を12h→20hへ広げた。上限が動いてもこの保証は変わらない）。
 *
 * 2. **`collect()` は「済んだ派遣を配列から取り除く」ことで冪等にする。**
 *    受け取り済みフラグを持つと、フラグの書き込みに失敗した瞬間に二重受領になる。
 *    起動時と「庵で休む」の2箇所から呼ぶので、ここは絶対に壊せない。
 *
 * 3. **時計の状態をセーブに焼かない。**
 *    当初は「単調増加のクロック（`save.dispatchClock`）」を持たせたが、これは失敗だった。
 *    端末の時計を一度でも先に進めて起動すると未来時刻がセーブに残り、**実時刻が
 *    そこへ追いつくまで、以後のすべての派遣が永久に完了しなくなる**（2026-08-03 レビュー指摘。
 *    1年進めて戻すと、30日待っても1通も届かないことを再現した）。
 *    巻き戻し対策は「完了条件が `now >= startedAt + 選んだ時間`」であることだけで足りる
 *    ―― 時計を戻して完了が早まることは、式の上でありえない（spec §7-3-2）。
 *    spec §7-3-3 の「1回の受け取り上限」も、選べる最長（いまは20時間）が上限である以上、
 *    要点1によって式のレベルで満たされている。
 *
 * 4. **送ったキャラは出撃メンバーから外す**（送った瞬間に外す）。
 *    「出撃中かつ派遣中」という状態を作らせないのがいちばん確実で、
 *    探索側・戦闘側に一切の判定を足さずに済む。
 */

import * as R from '../core/rules.js';
import { everMax } from '../core/save.js';
import { makeRng } from '../core/rng.js';
import { moonAge, moonPhase, PHASE_EFFECT } from '../core/time.js';
import { CHAR_BY_ID } from '../../data/chars.js';
import { rollEquip, addEquip, equipValue, renkiTotal, gainExp, equipName } from './growth.js';
import { bonusOf as boardBonus } from './board.js';
import { floorName } from '../dungeon/towers.js';

const HOUR_MS = 3600 * 1000;

/** 解放: 二章クリア（20Fのボスを抜けると maxFloor が21になる・spec §7-1） */
export const UNLOCK_FLOOR = 21;

/** 枠が増える到達階。初期1 → 三章クリアで2。上限4（spec §7-1） */
export const SLOT_FLOORS = [UNLOCK_FLOOR, 31];   // 3〜4枠目は因果盤「影の因」（実装済み）
export const SLOT_MAX = 4;

/**
 * 収穫の素材のうち、鍛冶石・錬気素材に回す割合（残りは月齢素材）。
 * ★ここが影送りのバランスの主ダイヤル。上げると「寝て待つほうが速い」になる。
 *   触ったら必ず `node test/test.mjs` の §16 を通すこと。
 */
export const MAT_SPLIT = { enhance_stone: 0.06, renki_mat: 0.06 };

/**
 * 「12時間の影送り**何回**で、その階に見合うレベルが1つ上がるか」（2026-08-14 新設）。
 *
 * ★影送りだけでも育つ、が成り立つ最低ライン。小さくするほど寝て待つのが強くなる。
 *   触ったら `node test/test.mjs` の §16（1回で1レベルを超えない）を必ず通すこと。
 */
export const DISPATCH_LEVEL_SENDS = 3;

/** 負傷の境目（spec §7-2）。これを下回ると収穫半分＋クールダウン */
export const INJURY_BELOW = 0.6;
export const INJURY_HARVEST_MUL = 0.5;
export const COOLDOWN_HOURS = 2;

/** 祠が預かれる拾い物の上限（セーブが無限に膨らまないように・spec §12-3） */
export const HOLD_MAX = 20;

/** 「夜道」＝二十六夜のときだけ現れる行き先（spec §5 / §7-2） */
export const YOMICHI = 'yomichi';
export const YOMICHI_PHASE = 'waningCrescent';
export const YOMICHI_DROP_MUL = 1.5;

/**
 * 有明の露（2026-08-12 オーナー指示「"有明の露"って何に使うの？使い道を作っておいて」）。
 *
 * 【なぜ影送りに使い道を置いたか】
 * 有明の露は**二十六夜のあいだにしか採れない**月齢素材で、
 * 二十六夜は「影送りに夜道が出る」月でもある（`core/time.js`）。
 * つまりこの素材はもともと影送りの月の産物なので、使い道もここに置くのが素直。
 *
 * 【効果】1つ添えると、その影送りだけ**成功率が100%になり、負傷しなくなる**。
 * ★「深い階へ無理を通す一手」であって、常用するものではない。
 *   採れる月が8分の1しかないので、持てる数がそのまま回数の上限になる。
 * ★成功度は 0.3〜1.5 の収穫倍率。1.0 未満を 1.0 に引き上げるだけで、
 *   もともと 1.0 を超えている（余裕で歩ける）送り出しには**何も足さない**。
 *   上乗せまでさせると、浅い階に露を添えるのが最適解になってしまう。
 */
export const ARIAKE = PHASE_EFFECT[YOMICHI_PHASE].material;
export const ARIAKE_NAME = PHASE_EFFECT[YOMICHI_PHASE].materialName;

/** 手持ちの有明の露 */
export function ariakeCount(save) {
  return save?.inv?.mats?.[ARIAKE] || 0;
}

// ── 時計 ──────────────────────────────────────────────────

/**
 * 実効時刻。**セーブには何も書かない**（上の要点3）。
 * 数値でない値が来ても落ちないようにするだけの関数。
 */
export function effNow(save, now) {
  return Number.isFinite(now) ? now : 0;
}

// ── 解放状況 ──────────────────────────────────────────────

export function isUnlocked(save) {
  // ★輪廻しても閉じない。everMax（全周の最高到達）で判定する
  return everMax(save) >= UNLOCK_FLOOR;
}

/** 到達階だけで決まる枠（因果盤ぶんを含まない） */
function slotsFromFloor(save) {
  const f = everMax(save);
  let n = 0;
  for (const need of SLOT_FLOORS) if (f >= need) n++;
  return n;
}

/** いま使える枠の数 */
export function slotCount(save) {
  return Math.min(SLOT_MAX, slotsFromFloor(save) + boardBonus(save).dispatchSlots);
}

/**
 * 因果盤が**実際に増やしている**枠の数。
 *
 * ★盤が持っている枚数（`bonusOf().dispatchSlots`）をそのまま画面に出してはいけない。
 *   枠は `SLOT_MAX=4` で頭打ちなので、31階以降のプレイヤーは3枚目を買っても増えない。
 *   「盤が主張する値」と「実際に効く値」を混同すると、
 *   **買っても何も起きないのに +3 と表示する**（2026-08-03 レビュー指摘）。
 */
export function boardSlotGain(save) {
  return slotCount(save) - Math.min(SLOT_MAX, slotsFromFloor(save));
}

/**
 * 次の枠が開く階（もう増えないなら null）。
 * ★すでに上限に達していたら null を返す。見ないと
 *   「31階まで登るともう一つ増えます」と嘘をつく
 */
export function nextSlotFloor(save) {
  if (slotCount(save) >= SLOT_MAX) return null;
  const f = everMax(save);
  for (const need of SLOT_FLOORS) if (f < need) return need;
  return null;
}

/**
 * 派遣エントリとして信用してよいか。
 *
 * ★セーブコードは手で書き換えられる（README 実バグ #13）。
 *   `hours` や `startedAt` が数値でないと `endsAt()` が NaN になり、
 *   「未完了と表示しつつ、収穫だけは入る」という抜け道になる（2026-08-03 レビュー指摘）。
 *   完了判定に使う値は、ここで全部その場で検証する。
 */
function validEntry(save, d) {
  return !!d && typeof d === 'object'
    && !!CHAR_BY_ID[d.charId] && !!save.chars?.[d.charId]
    && Number.isFinite(d.startedAt)
    && R.DISPATCH_HOURS.includes(d.hours)
    && Number.isFinite(d.floor) && d.floor >= 1;
}

/** 読み取り専用。**セーブを書き換えない**（描画中に呼ばれるため） */
function listRead(save) {
  const arr = Array.isArray(save?.dispatch) ? save.dispatch : [];
  return arr.filter((d) => validEntry(save, d));
}

/** 書き込み用。ここでだけ不正なエントリを実際に捨てる */
function list(save) {
  save.dispatch = listRead(save);
  return save.dispatch;
}

function cooldowns(save) {
  if (!save.dispatchCool || typeof save.dispatchCool !== 'object') save.dispatchCool = {};
  return save.dispatchCool;
}

function cooldownsRead(save) {
  const c = save?.dispatchCool;
  return c && typeof c === 'object' ? c : {};
}

// ── 送れるか ──────────────────────────────────────────────

export function endsAt(entry) {
  return entry.startedAt + entry.hours * HOUR_MS;
}

/**
 * 戻ってきたか。
 * ★受け取り側（`collect`）も**必ずこの関数を通す**こと。
 *   「未完了」を否定形で別に書くと、NaN のときだけ真偽が逆転して
 *   「画面は未完了、収穫は入る」になる（2026-08-03 レビュー指摘）
 */
export function isDone(entry, save, now) {
  const end = endsAt(entry);
  return Number.isFinite(end) && effNow(save, now) >= end;
}

/** そのキャラがいま派遣中か。**セーブを書き換えない** */
export function isAway(save, charId) {
  return listRead(save).some((d) => d.charId === charId);
}

/** クールダウンの残りミリ秒（0なら明け） */
export function cooldownLeft(save, charId, now) {
  const until = cooldownsRead(save)[charId];
  if (!Number.isFinite(until)) return 0;
  return Math.max(0, until - effNow(save, now));
}

/**
 * @returns {{ok:true} | {ok:false, reason:string, message:string}}
 */
export function canSend(save, charId, now = Date.now()) {
  if (!isUnlocked(save)) return no('locked', '影送りはまだ使えません。');
  if (charId === 'hero') return no('hero', '主人公の影は切り離せません。');
  if (!save.chars?.[charId]) return no('nochar', 'その仲間はまだいません。');
  if (isAway(save, charId)) return no('away', 'その仲間はもう塔へ送っています。');
  const cd = cooldownLeft(save, charId, now);
  if (cd > 0) return no('cooldown', `負傷が癒えていません（あと${Math.ceil(cd / 60000)}分）。`);
  if (listRead(save).length >= slotCount(save)) return no('slots', '影を送れる枠がふさがっています。');
  // 出撃メンバーが空になる送り方はさせない（拠点で詰む）
  const active = save.party?.active || [];
  if (active.includes(charId) && active.length <= 1) return no('lastone', '最後のひとりは送り出せません。');
  return { ok: true };
}

function no(reason, message) { return { ok: false, reason, message }; }

/** 送れる仲間の一覧（UIがそのまま並べられる形で返す） */
export function sendable(save, now = Date.now()) {
  return Object.keys(save.chars || {})
    .filter((id) => CHAR_BY_ID[id])
    .map((id) => {
      const c = save.chars[id];
      const chk = canSend(save, id, now);
      return {
        id,
        name: CHAR_BY_ID[id].name,
        lv: c.lv || 1,
        scout: scoutOf(save, id),
        away: isAway(save, id),
        cooldownLeft: cooldownLeft(save, id, now),
        inParty: (save.party?.active || []).includes(id),
        ok: chk.ok,
        reason: chk.ok ? null : chk.reason,
        message: chk.ok ? null : chk.message,
      };
    });
}

/** 探査力（spec §7-2） */
export function scoutOf(save, charId) {
  const lv = save.chars?.[charId]?.lv || 1;
  return R.scoutPower(lv, equipValue(save, charId), renkiTotal(save, charId));
}

// ── 行き先 ────────────────────────────────────────────────

/**
 * 選べる行き先。**到達済みの階層まで**（spec §7-1）。
 * 5階刻みの印＋到達最深部。二十六夜のあいだだけ「夜道」が増える。
 */
export function destinations(save, now = Date.now()) {
  const max = everMax(save);
  const out = [];
  for (let f = 5; f <= max; f += 5) out.push({ id: `f${f}`, floor: f, name: floorName(f), note: '' });
  if (out.length === 0 || out[out.length - 1].floor !== max) {
    // ★注記は空にしておく（2026-08-16 オーナー指摘「『今の最深部』という文字は不要」）。
    //   階の名前そのものが最深部だと分かるので、1行使って言い直す価値がない。
    out.push({ id: `f${max}`, floor: max, name: floorName(max), note: '' });
  }
  // 月齢は他の画面と同じく**生の現在時刻**で見る。
  // ここだけ別の基準を使うと「拠点は満月なのに影送りだけ夜道が出る」が起きる
  const phase = moonPhase(moonAge(Number.isFinite(now) ? now : Date.now()));
  if (phase === YOMICHI_PHASE) {
    out.push({
      id: YOMICHI, floor: max, name: '夜道',
      note: `二十六夜のあいだだけ通える道。${PHASE_EFFECT[YOMICHI_PHASE].materialName}が採れ、拾い物も増える`,
    });
  }
  return out;
}

// ── 送る ──────────────────────────────────────────────────

/**
 * @returns {{ok:true, entry:object} | {ok:false, reason:string, message:string}}
 */
export function send(save, charId, { destId = null, floor = 1, hours = 2, ariake = false } = {}, now = Date.now()) {
  const chk = canSend(save, charId, now);
  if (!chk.ok) return chk;
  if (!R.DISPATCH_HOURS.includes(hours)) return no('hours', '送り出す時間の指定が正しくありません。');
  // ★露は**送り出しが確定してから**引く。行き先が見つからずに戻る経路が下にあるので、
  //   ここで先に引くと「送れなかったのに露だけ消える」が起きる
  if (ariake && ariakeCount(save) <= 0) return no('ariake', `${ARIAKE_NAME}がありません。`);

  // 行き先を指定されたのに見つからないときは**黙って別の場所へ差し替えない**。
  // 「夜道へ送ります」と確認したのに、月が変わっていて通常階へ送られる、が起きる
  const dests = destinations(save, now);
  const dest = destId ? dests.find((d) => d.id === destId) : dests.find((d) => d.floor === floor);
  if (!dest) {
    return no('dest', destId === YOMICHI
      ? '夜道はもう閉じています（二十六夜が明けました）。'
      : 'その行き先へはまだ行けません。');
  }

  const t = effNow(save, now);
  const entry = {
    charId,
    destId: dest.id,
    floor: dest.floor,
    hours,
    startedAt: t,
    // 送り出した時点の探査力で固定する。留守中に装備を外して収穫だけ得る、を防ぐ
    scout: scoutOf(save, charId),
  };
  if (ariake) {
    entry.ariake = true;
    save.inv.mats[ARIAKE] = ariakeCount(save) - 1;
  }
  list(save).push(entry);

  // 送った影は連れて行けない（spec §7-1）。ここで外すのがいちばん確実
  save.party.active = (save.party.active || []).filter((id) => id !== charId);
  if (save.party.active.length === 0) save.party.active = ['hero'];

  return { ok: true, entry };
}

/**
 * 呼び戻す（まだ終わっていない影を切り上げる）。**収穫は無い**。
 * これが無いと「4人しかいないのに全員送ってしまって塔へ入れない」で詰む。
 */
export function recall(save, charId) {
  const arr = list(save);
  const i = arr.findIndex((d) => d.charId === charId);
  if (i < 0) return { ok: false, reason: 'notaway' };
  // ★添えた露は返す（2026-08-12）。まだ何も持ち帰っていない＝露も使われていない。
  //   返さないと「呼び戻すと貴重品が黙って消える」という罠になる
  const back = !!arr[i].ariake;
  if (back) save.inv.mats[ARIAKE] = ariakeCount(save) + 1;
  arr.splice(i, 1);
  return { ok: true, ariakeBack: back };
}

/** 進行中の影の一覧（残り時間つき）。**セーブを書き換えない** */
export function pending(save, now = Date.now()) {
  const t = effNow(save, now);
  return listRead(save).map((d) => ({
    ...d,
    endsAt: endsAt(d),
    leftMs: Math.max(0, endsAt(d) - t),
    done: isDone(d, save, now),
  }));
}

/** 受け取れるものがあるか（拠点のバッジ表示用） */
export function hasHarvest(save, now = Date.now()) {
  return pending(save, now).some((d) => d.done);
}

// ── 収穫の計算（spec §7-2） ───────────────────────────────

/** 成功度 0.3〜1.5 */
export function successOf(scout, floor) {
  return R.dispatchSuccess(scout, floor);
}

/**
 * 収穫を計算する。**セーブは書き換えない**（テストと表示から安全に呼べるように）。
 * @returns {{exp:number, zeni:number, mats:object, equips:Array, injured:boolean, success:number}}
 */
export function harvestOf(save, entry) {
  const floor = Math.max(1, entry.floor || 1);
  const scout = Number.isFinite(entry.scout) ? entry.scout : scoutOf(save, entry.charId);
  // ★有明の露を添えた影は、成功率が 1.0 を下回らない（＝負傷しない）。
  //   1.0 を**超えている**ぶんはそのまま活かす（露が上振れを潰さないように）
  const raw = successOf(scout, floor);
  const success = entry.ariake ? Math.max(1, raw) : raw;
  const timeMul = R.DISPATCH_TIME_MUL[entry.hours] || 1;
  const injured = success < INJURY_BELOW;
  const mul = timeMul * success * (injured ? INJURY_HARVEST_MUL : 1);

  /**
   * 経験値（2026-08-14 オーナー指示
   * 「影送りは経験値も入手できるようにし、最悪影送りだけでも
   *   キャラのレベルが上がるようにしましょう」）。
   *
   * ★経験値は前から入っていた。**足りなかったのは深い階での量**。
   *   もとの式 `30 + floor*12` は階に対して**直線**なのに、
   *   必要経験値 `needExp` は**二次**（15lv²+25lv）。
   *   そのため階が深いほど差が開き、40階では12時間の影送り10回で
   *   やっと1レベル、60階では15回、という「上がらない」状態になっていた。
   *
   * → **その階に見合うレベルを1つ上げるのに12時間×3回**、を基準に置き直す。
   *   `needExp` を直接使うので、レベル曲線を触ってもここが自動で追随する。
   * ★浅い階は元の式のほうが多いので、`max` で**下げないようにする**
   *   （12階あたりで入れ替わる）。既に遊んでいる人の取り分を減らさない。
   * ★1回で1レベルは超えない。`test.mjs` §16 が最長・最高探査力で見張っている。
   */
  const expLinear = 30 + floor * 12;
  const expCurve = R.needExp(floor) / (DISPATCH_LEVEL_SENDS * R.DISPATCH_TIME_MUL[12]);
  const exp = Math.max(0, Math.floor(Math.max(expLinear, expCurve) * mul));
  const zeni = Math.max(0, Math.floor((20 + floor * 4) * mul));
  const matTotal = Math.max(0, Math.floor((2 + floor * 0.15) * mul));

  // 素材の内訳。
  //
  // ★spec §7-2 は「素材」をひとつのバケツとして書いているが、実装では
  //   鍛冶石・錬気素材・月齢素材の3種に割る必要がある。ここの配分が本機能で
  //   いちばん壊れやすい（2026-08-03 レビュー指摘）。
  //
  //   当初は 35% / 35% / 30% にしていた。すると12時間の影送り1回で
  //   鍛冶石27個・錬気素材27個。銘強化 +0→+10 の総費用が113個なので、
  //   **1日放置するだけで装備1つが+10に届く**（枠2×1日2回＝108個/日）。
  //   経験値と銭は「実プレイ1分ぶん」に抑えられているのに、素材だけが
  //   「実プレイ2時間ぶん」出ていた。装備依存度とプレイ時間の前提が崩れる。
  //
  //   → 鍛冶石・錬気素材は **6%ずつ**に落とし、残りは月齢素材へ回す。
  //     月齢素材はまだ消費先が無いので、ここが増えてもバランスは動かない。
  //     `test.mjs` §16 が「12時間の影送りで銘強化1回ぶんも賄えない」ことを検証している。
  /**
   * ★露を添えた影送りでは、**月齢素材は手に入らない**（2026-08-12・実機で気づいて塞いだ）。
   *
   *   これが無いと、二十六夜（＝有明の露が採れる月）に露を添えたとき、
   *   **1つ使って24個返ってくる**（負傷しないぶん収穫が4倍になるため）。
   *   露が自分で増える＝「持っている数が回数の上限」という位置づけが完全に消える。
   *   理屈のうえでも、露は道の露を吸って影を守るもの、として筋が通る。
   */
  const phaseMat = entry.ariake ? null
    : (entry.destId === YOMICHI
      ? PHASE_EFFECT[YOMICHI_PHASE].material
      : PHASE_EFFECT[moonPhase(moonAge(entry.startedAt))]?.material);
  const mats = {};
  const stone = Math.round(matTotal * MAT_SPLIT.enhance_stone);
  const renki = Math.round(matTotal * MAT_SPLIT.renki_mat);
  const phase = Math.max(0, matTotal - stone - renki);
  if (stone > 0) mats.enhance_stone = stone;
  if (renki > 0) mats.renki_mat = renki;
  if (phase > 0 && phaseMat) mats[phaseMat] = phase;

  // 装備ドロップ（spec §7-2）。決定論のため、この派遣専用のシードを使う。
  // ★シードには charId / floor / hours を必ず含める。startedAt だけにすると、
  //   同じ時刻に戻った複数の影が**全員まったく同じ装備**を持ち帰る
  const key = `${saveKey(save)}:${entry.charId}:${entry.startedAt}:${floor}:${entry.hours}:${entry.destId || ''}`;
  const rng = makeRng(`dispatch:${key}`);
  let rate = Math.min(0.40, 0.05 + floor * 0.004) * (timeMul / 4.8);
  // 因果盤「拾の因」（spec §7-2「× 因果盤補正」）。
  // ★凡例は「装備の拾いやすさ +3%」なので、**装備のドロップ率にだけ**掛ける。
  //   以前は収穫全体（経験・銭・素材）に掛けて装備には掛けておらず、名前と逆だった
  rate *= boardMul(save);
  if (entry.destId === YOMICHI) rate *= YOMICHI_DROP_MUL;
  if (injured) rate *= INJURY_HARVEST_MUL;
  const equips = [];
  if (rng.chance(rate)) {
    // 影送りだけでは最深層のものは取れない（spec §7-2。能動プレイの価値を守る）
    equips.push(rollEquip({ seed: `de:${key}`, floor: Math.max(1, Math.floor(floor * 0.8)) }));
  }

  return { exp, zeni, mats, equips, injured, success, raw, ariake: !!entry.ariake, scout, timeMul, dropRate: rate };
}

/** 因果盤「拾の因」。装備のドロップ率にだけ掛ける（凡例の文言と一致させるため） */
function boardMul(save) { return boardBonus(save).dropMul; }

function saveKey(save) {
  return save?.id ?? save?.createdAt ?? save?.name ?? 'rt';
}

// ── 受け取り ──────────────────────────────────────────────

/**
 * 終わった影を回収してセーブへ反映する。
 *
 * **冪等**: 回収した項目は `save.dispatch` から取り除くので、続けて2回呼んでも
 * 2回目は空を返す。起動時と「庵で休む」の両方から呼ぶための保証。
 *
 * @returns {{letters:Array, totals:object, overflow:Array}}
 */
export function collect(save, now = Date.now()) {
  const t = effNow(save, now);
  const arr = list(save);
  const letters = [];
  const totals = { exp: 0, zeni: 0, mats: {}, equips: 0 };
  const overflow = [];

  // 前回持ちきれずに祠へ預けたぶんを、まず引き取る。
  // ここが無いと、持ち物が満杯のときに拾い物が**黙って消える**
  const held = Array.isArray(save.dispatchHold) ? save.dispatchHold : [];
  const stillHeld = [];
  for (const e of held) {
    const r = addEquip(save, e);
    if (r.ok) totals.equips++; else stillHeld.push(e);
  }
  save.dispatchHold = stillHeld;
  let heldPickedUp = totals.equips;

  const remain = [];
  for (const entry of arr) {
    // ★完了判定は必ず isDone を通す（否定形で書き直すと NaN のとき真偽が逆転する）
    if (!isDone(entry, save, now)) { remain.push(entry); continue; }

    const hv = harvestOf(save, entry);
    const lv = gainExp(save, entry.charId, hv.exp);          // EXPは送った本人に入る（spec §7-2）
    save.inv.zeni = (save.inv.zeni || 0) + hv.zeni;
    save.inv.mats = save.inv.mats || {};
    for (const [k, v] of Object.entries(hv.mats)) save.inv.mats[k] = (save.inv.mats[k] || 0) + v;

    const got = [];
    for (const e of hv.equips) {
      const r = addEquip(save, e);
      if (r.ok) { got.push(equipName(r.equip)); totals.equips++; }
      else if (save.dispatchHold.length < HOLD_MAX) {
        overflow.push(e); save.dispatchHold.push(e);           // 持ちきれない分は祠が預かる（消さない）
      }
      // 預かりも満杯なら受け取らない（セーブが無限に膨らむのを防ぐ・spec §12-3）
    }

    if (hv.injured) cooldowns(save)[entry.charId] = t + COOLDOWN_HOURS * HOUR_MS;

    totals.exp += hv.exp;
    totals.zeni += hv.zeni;
    for (const [k, v] of Object.entries(hv.mats)) totals.mats[k] = (totals.mats[k] || 0) + v;

    letters.push({
      charId: entry.charId,
      name: CHAR_BY_ID[entry.charId]?.name || entry.charId,
      floor: entry.floor,
      destId: entry.destId,
      hours: entry.hours,
      success: hv.success,
      injured: hv.injured,
      exp: hv.exp, zeni: hv.zeni, mats: hv.mats,
      equipNames: got,
      leveled: lv.to > lv.from ? { from: lv.from, to: lv.to } : null,
      text: letterText(entry, hv),
    });
  }

  save.dispatch = remain;
  // heldPickedUp = 「前回あふれて預かっていた分を、今回いくつ引き取れたか」。
  // totals.equips に混ぜたままだと、祠の文がある回に報告が消える
  return { letters, totals, overflow, heldPickedUp, held: save.dispatchHold.length };
}

/** 祠が預かっている拾い物の数（持ち物を空けると受け取れる） */
export function heldCount(save) {
  return Array.isArray(save?.dispatchHold) ? save.dispatchHold.length : 0;
}

/** 「祠の文（ふみ）」の本文（spec §7-1） */
function letterText(entry, hv) {
  const name = CHAR_BY_ID[entry.charId]?.name || '影';
  const where = entry.destId === YOMICHI ? '夜道' : floorName(entry.floor);
  if (hv.injured) {
    return `${name}の影が、${where}から戻った。足を引きずっている。\n「……深すぎた。しばらく休ませて」`;
  }
  if (hv.success >= 1.4) {
    return `${name}の影が、${where}から戻った。手には抱えきれないほどの荷。\n「あの辺りなら、目をつむっていても歩けるよ」`;
  }
  return `${name}の影が、${where}から戻った。\n拾ったものが祠に積んである。`;
}

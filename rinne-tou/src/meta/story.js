/**
 * シナリオ進行（spec §8-1 / §9-3）
 *
 * ここは DOM を知らない。「いま何を読ませるべきか」を決めるだけ。
 * 実際の表示は src/ui/screen_talk.js。
 *
 * ── 設計の芯 ──────────────────────────────────────────────
 * 1. **場面は絶対に取りこぼさない**。
 *    還り札で21階から始めたり、階を飛ばして登ったりできるので、
 *    「ちょうどその階に着いた瞬間」だけを合図にすると場面が永久に消える。
 *    そこで拠点に戻るたびに**取りこぼし拾い**（catchUp）を回す。
 *    章の順番はIDの並び順で保証する（SCENES の配列順に読ませる）。
 *
 * 2. **読んだ場面は save.story.seen に記録し、二度と出さない**。
 *    （既読を読み返す画面は未実装。readable() だけ用意してある）
 *
 * 3. **場面はゲーム状態を変えない**。唯一の例外が `join`（仲間の加入）で、
 *    これは story.js ではなく呼び出し側（UI）が applyScene() で明示的に適用する。
 *    ここを曖昧にすると「会話を飛ばしたら仲間が入らない」事故になる。
 */

import { SCENES, SCENE_BY_ID } from '../../data/scenario.js';
import { CHARS, CHAR_BY_ID } from '../../data/chars.js';
import * as Rc from './recruit.js';

/** save.story を必ず読める形にして返す（壊れたセーブでも落ちない） */
export function stateOf(save) {
  if (!save.story || typeof save.story !== 'object' || Array.isArray(save.story)) save.story = {};
  const s = save.story;
  if (!s.seen || typeof s.seen !== 'object' || Array.isArray(s.seen)) s.seen = {};
  return s;
}

export function isSeen(save, id) { return !!stateOf(save).seen[id]; }
export function markSeen(save, id) { stateOf(save).seen[id] = 1; }
export function seenCount(save) { return Object.keys(stateOf(save).seen).length; }

/** エンディングの場面（ending:true）をすべて読み終えているか */
function endingSeen(save) {
  return SCENES.filter((s) => s.ending).every((s) => isSeen(save, s.id));
}

/**
 * その場面に**出てくる仲間**のID一覧（2026-08-14 新設）。
 *
 * 数え方:
 *   1. その場面の主役（`char`）。**せりふが無くても登場している**
 *      （ともしの回は周りが主人公について話す形なので、主人公の行が1つも無い）
 *   2. せりふのある者（`['suzu', '…']`）。選択肢の返しの中まで見る
 *   3. data 側に `needs: ['suzu']` と書いてある者
 *      → 地の文でだけ動く相手を拾うため（例: 黒羽Lv30の落ちで小魚を干しているのは鈴）
 *
 * ★名前が出るだけ（噂・伝聞）は数えない。「石動には言うな」の石動はその場に居ない。
 * ★仲間以外のIDは無視する（`data/chars.js` に無い者は加入の概念がない）。
 * ★pending() は場面の数だけ呼ばれるので、一度歩いたら覚えておく。
 *   場面データは実行中に書き換わらないのでIDを鍵にしてよい。
 */
const CAST_CACHE = new Map();

export function castOf(sc) {
  if (!sc) return [];
  const hit = CAST_CACHE.get(sc.id);
  if (hit) return hit;
  const set = new Set();
  if (CHAR_BY_ID[sc.char]) set.add(sc.char);
  const walk = (lines) => {
    for (const l of lines || []) {
      if (Array.isArray(l)) {
        if (CHAR_BY_ID[l[0]]) set.add(l[0]);
      } else if (l && l.opts) {
        for (const o of l.opts) walk(o.r);
      }
    }
  };
  walk(sc.lines);
  for (const id of sc.needs || []) if (CHAR_BY_ID[id]) set.add(id);
  const out = [...set];
  CAST_CACHE.set(sc.id, out);
  return out;
}

/** その場面をいま読ませてよいか（既読判定は含まない） */
function matches(save, sc, trig) {
  const maxFloor = save?.progress?.maxFloor || 1;

  // ★階の場面は本編の塔のものだけ。支塔にも階番号があるので、
  //   塔を見ないと支塔の3階で「三階 ― 崩す」が始まってしまう
  if ((sc.at === 'floor' || sc.at === 'boss') && trig.at !== 'home') {
    if ((trig.tower || 'main') !== (sc.tower || 'main')) return false;
  }

  switch (sc.at) {
    case 'newGame':
      if (trig.at === 'newGame') return true;
      // 拾い直し: シナリオ実装前のセーブと、序章の途中で閉じられた場合。
      // 「1つも読んでいない」ときだけなので、通常プレイでは二度と出ない
      return trig.at === 'home' && seenCount(save) === 0;

    case 'floor':
      // その階に着いたとき。飛ばして登った場合も拾えるよう「以上」で見る
      if (trig.at === 'floor') return trig.floor >= sc.floor;
      // 取りこぼし拾い。★「より上」ではなく「以上」。
      //   maxFloor がちょうどその階で止まっているセーブを拾えなくなる
      if (trig.at === 'home') return maxFloor >= sc.floor;
      return false;

    case 'boss':
      // 層ボスを倒した直後。ちょうどその階のときだけ
      if (trig.at === 'boss') return trig.floor === sc.floor;
      // 取りこぼし拾い。★到達階だけで見ると60階（最上階＝エンディング）が永久に漏れる。
      //   「60階に着いた」と「60階のボスを倒した」を到達階では区別できないため、
      //   倒した記録（progress.bossBeaten）を第一の根拠にする。
      //   古いセーブには無いので、「そのボス階より上にいる＝越えている」を保険に残す
      if (trig.at === 'home') {
        return !!save?.progress?.bossBeaten?.[sc.floor] || maxFloor > sc.floor;
      }
      return false;

    case 'cleared':
      // 後日談（spec §9-3）。エンディング到達後、拠点に戻ったときだけ。
      // ★エンディングの場面（ending:true）を読み終えていることも条件にする。
      //   でないと「終章 → 後日談 → あとでエンディング」という順序で流れうる
      return trig.at === 'home' && !!save?.progress?.cleared && endingSeen(save);

    case 'bond':
      // 絆イベント（spec §9-3）。拠点でだけ起きる。相手が仲間になっていることが条件
      if (trig.at !== 'home') return false;
      // ★`requires` は「先に読んでいないと話が通らない場面」。
      //   階数だけを条件にしていたため、**28階の絆イベントが30階で拾う石の話をしていた**
      //   （オーナーが28階で全滅した直後に遭遇して発覚・2026-08-08）。
      //   階数で足りない理由: ボスに負けて引き返す・還り札で飛ぶなど、
      //   「その階を越えたのにボスは倒していない」経路がいくつもある
      if (!requiresMet(save, sc)) return false;
      return maxFloor >= (sc.floor || 1) && !!save.chars?.[sc.char];

    /**
     * 日常の場面（2026-08-13 オーナー指示
     * 「各キャラの新たなストーリーをレベル30,40,50で開放するようにしよう」）。
     *
     * ★条件は**その人自身のレベル**。到達階（絆の側）と分けているのは、
     *   「連れて歩いた仲間ほど早く開く」ようにするため
     *   （階で開くと、控えに置きっぱなしの仲間の話まで一斉に開いてしまう）。
     * ★仲間になっていない相手の場面は出さない（`save.chars` に居ることが条件）。
     * ★**その場面に出てくる仲間が全員そろっていること**も条件にする
     *   （2026-08-14 オーナー指示）。日常の場面はほぼ掛け合いなので、
     *   主役だけを見ていると「まだ会っていない仲間が普通に喋る」場面が起きる
     *   （例: ともしLv30「湯」には縒が出るが、縒の加入は46階）。
     */
    case 'daily': {
      if (trig.at !== 'home') return false;
      /**
       * ★`everyone: true` の回（紬・2026-08-14 オーナー指示
       *   「全員のレベルが30,40,50になっていて、かつエンディング後であれば、
       *     紬の日々のストーリーも解禁にしませんか」）。
       *
       * 紬は仲間ではない（`EXTRA_CAST`）ので「本人のレベル」が無い。
       * 代わりに**仲間全員**がそのレベルに届いていることを条件にする。
       * ★控えに置きっぱなしの仲間は上がらないので、これは自然と「終盤の褒美」になる。
       */
      if (sc.everyone) {
        if (!save?.progress?.cleared || !endingSeen(save)) return false;
        if (!CHARS.every((c) => save.chars?.[c.id])) return false;
        if (!CHARS.every((c) => (save.chars[c.id].lv || 1) >= (sc.lv || 1))) return false;
        return castOf(sc).every((id) => !!save.chars?.[id]);
      }
      const c = save.chars?.[sc.char];
      if (!c) return false;
      if ((c.lv || 1) < (sc.lv || 1)) return false;
      return castOf(sc).every((id) => !!save.chars?.[id]);
    }

    default:
      return false;
  }
}

/** `requires` に挙げた場面をすべて読み終えているか */
function requiresMet(save, sc) {
  const need = sc.requires;
  if (!need || need.length === 0) return true;
  return need.every((id) => isSeen(save, id));
}

/**
 * いま読ませるべき場面のID配列を、**SCENES の並び順**で返す。
 * @param {object} save
 * @param {{at:'newGame'|'floor'|'boss'|'home', floor?:number}} trig
 */
export function pending(save, trig) {
  const out = [];
  for (const sc of SCENES) {
    if (isSeen(save, sc.id)) continue;
    if (matches(save, sc, trig)) out.push(sc.id);
  }
  return out;
}

/**
 * 一度の拠点訪問で読ませる場面の上限。
 *
 * ★更新前から遊んでいた人（v2セーブ）は未読が28本たまっている。
 *   まとめて渡すと「つづきから」を押した瞬間に28場面が始まり、途中で抜けられない。
 *   残りは次に拠点へ戻ったときに拾えばよい（catchUp は何度呼んでも安全）。
 */
export const CATCHUP_MAX = 4;

/** 拠点に戻ったときの取りこぼし拾い */
export function catchUp(save, limit = CATCHUP_MAX) {
  const ids = pending(save, { at: 'home' });
  return limit > 0 ? ids.slice(0, limit) : ids;
}

/** 拾い残しが何本あるか（画面に「まだ続きがあります」と出すため） */
export function catchUpRemaining(save) {
  return Math.max(0, pending(save, { at: 'home' }).length - CATCHUP_MAX);
}

export function sceneOf(id) { return SCENE_BY_ID[id] || null; }

/**
 * 場面を読み終えた（または飛ばした）ときの適用。
 *
 * ★飛ばしても結果は同じにする。会話を飛ばした人だけ仲間が入らない、を作らない。
 * @returns {{joined:object[]}} 新しく加わった仲間
 */
export function applyScene(save, id) {
  const sc = SCENE_BY_ID[id];
  const joined = [];
  if (!sc) return { joined };
  markSeen(save, id);
  for (const cid of sc.join ? [].concat(sc.join) : []) {
    if (CHAR_BY_ID[cid] && Rc.join(save, cid)) joined.push(CHAR_BY_ID[cid]);
  }
  if (sc.chapter != null && save.progress) {
    save.progress.chapter = Math.max(save.progress.chapter || 0, sc.chapter);
  }
  if (sc.ending && save.progress) save.progress.cleared = true;
  return { joined };
}

/** 既読の場面（記録画面で読み返す用。読み返し画面はまだ未実装） */
export function readable(save) {
  return SCENES.filter((sc) => isSeen(save, sc.id));
}

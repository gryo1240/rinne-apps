/**
 * 潜行の結果画面（spec §2 の画面5 / §4-5-a）
 *
 * 【この画面の役割】「もう1階潜るか」の判断材料を、次の潜行のために残すこと。
 * そのため **失った上乗せを必ず明示する**。数字で見せないと、深度ボーナスは
 * 「なんとなく得する仕組み」にしかならず、引き際の緊張が生まれない。
 */

import { fxOff as fxIsOff, h, mon, toast, confirmBox, n, zeni } from './dom.js';
import { CHAR_BY_ID, statsAt } from '../../data/chars.js';
import * as G from '../meta/growth.js';
import { RARITY } from '../../data/equips.js';
import { SKILLS } from '../../data/skills.js';
import { ITEM_BY_ID } from '../../data/items.js';
import { toHome } from './story_flow.js';
import { floorName } from '../dungeon/towers.js';
import { playSe } from './audio.js';

// 素材名は影送りの「祠の文」と同じものを使う（growth.js に集約）
const MAT_NAME = G.MAT_NAME;

/**
 * 道具の名前。
 *
 * ★**必ず `ITEM_BY_ID` を引くこと**（2026-08-16 修正）。
 *   以前は `{ oil: '油壺', fuda: '還り札' }` という手書きの表だった。
 *   同日に「宝からは薬も出るようにしておいて」で薬を宝の抽選に足したとき、
 *   この表を直し忘れたため、結果画面に **`kizugusuri` と生のIDが出た**
 *   （オーナーがスクリーンショットで指摘）。
 *   道具が増えるたびに直す表を持たない＝二度と同じ壊れ方をしない。
 *   教訓: `.company/lessons/dead-flag-promised-in-text.md`（表を足したら読む側も同じコミットで）
 */
const itemName = (id) => ITEM_BY_ID[id]?.name || id;

export function render(ctx) {
  const p = ctx.state.pending;
  const root = h('div');

  if (!p) {
    setTimeout(() => ctx.go('home'), 0);
    return h('div', 'panel', '結果の情報が見つかりませんでした。');
  }
  const { result } = p;
  const wiped = result.outcome === 'wipe';

  // ── 効果音（2026-08-09 オーナー要望）──
  // ★**この画面で最も大きい出来事1つだけ**を鳴らす。
  //   全滅とレベルアップが同時に起きることがあり（力尽きても経験値は入る）、
  //   両方鳴らすと「悲報と朗報」が重なって、どちらの音か分からなくなる。
  //   全滅を優先するのは、次にどうするかの判断に効くのがそちらだから。
  if (wiped) playSe('lose');
  else if ((result.levelUps || []).length > 0) playSe('levelup');

  // ── 見出し ──
  root.appendChild(h('h1', { class: 'title-logo', style: 'font-size:1.6rem;padding:18px 0 4px' },
    wiped ? 'ちからつきた' : '祠へ戻った'));
  root.appendChild(h('p', 'title-sub', wiped
    ? '気がつくと、麓の祠で目を覚ました。'
    : `${floorName(p.floor, p.tower)}から引き上げた`));

  // ── レベルアップ（2026-08-04 追加） ──
  // 経験値は潜行の精算でまとめて配られるので、上がるのはこの画面。
  // 見出しの直後＝いちばん目に入る位置に置く
  if ((result.levelUps || []).length > 0) root.appendChild(levelUpPanel(ctx, result.levelUps));

  // ── 手に入れたもの ──
  /**
   * ★2列にする（2026-08-16 オーナー指摘
   *   「真ん中あたりが余白になっているし、ここも2列で良いんじゃないかな」）。
   *   1行に名前と数だけの短い行が10件前後並ぶので、1列だと真ん中がまるごと空く。
   *   2列にすると行数がちょうど半分になり、そのぶん縦が縮む。
   */
  root.appendChild(h('h2', 'sec-title', '手に入れたもの'));
  const got = h('div', 'panel kv-grid');
  got.appendChild(kv('経験値', `${n(result.exp)}`));
  got.appendChild(kv('銭', zeni(result.zeni)));
  got.appendChild(kv('因果', `${n(result.karma)}`));
  for (const [k, v] of Object.entries(result.mats)) {
    if (v > 0) got.appendChild(kv(MAT_NAME[k] || k, `×${n(v)}`));
  }
  for (const [k, v] of Object.entries(result.items)) {
    if (v > 0) got.appendChild(kv(itemName(k), `×${n(v)}`));
  }
  got.appendChild(kv('進んだ階数', `${result.floorsCleared}階`));
  got.appendChild(kv('戦った回数', `${result.battles}回`));
  root.appendChild(got);

  /**
   * ★持ちきれずに捨てたもの（2026-08-14 オーナー指示で道具の上限を99にしたため）。
   *   黙って消すと「拾ったはずの物が無い」になるので、必ず名指しで伝える。
   */
  const overMax = Object.entries(result.discarded || {}).filter(([, v]) => v > 0);
  if (overMax.length > 0) {
    root.appendChild(h('p', 'small warn',
      `持ちきれず置いてきた: ${overMax.map(([k, v]) => `${itemName(k)} ×${n(v)}`).join('、')}`
      + '（道具は1種類につき99まで）'));
  }

  // ── 拾った装備 ──
  if ((result.equips || []).length > 0) {
    root.appendChild(h('h2', 'sec-title', `拾った装備（${result.equips.length}点）`));
    const list = h('div', 'list');
    for (const e of result.equips.slice(0, 20)) {
      list.appendChild(h('div', { class: 'list__item', style: 'cursor:default' }, [
        h('div', 'list__main', [
          h('div', `rar-${G.equipRarity(e)}`, `${RARITY[G.equipRarity(e)]}｜${G.equipName(e)}`),
          e === result.protectedEquip
            ? h('div', 'list__sub gold', 'いちばんの掘り出し物。これだけは手放さずに済んだ')
            : null,
        ]),
      ]));
    }
    if (result.equips.length > 20) list.appendChild(h('p', 'small dim', `ほか${result.equips.length - 20}点`));
    root.appendChild(list);
  }

  // ── 失ったもの（★ここを曖昧にしない） ──
  if (wiped) {
    root.appendChild(h('h2', 'sec-title', '失ったもの'));
    const lost = h('div', 'panel');
    if (result.depthBonusLost > 1) {
      lost.appendChild(h('p', 'warn', `深度ボーナス ×${result.depthBonusLost.toFixed(2)} の上乗せぶんが消えた`));
    }
    lost.appendChild(kv('銭', `−${zeni(result.lost.zeni)}`, true));
    for (const [k, v] of Object.entries(result.lost.mats)) {
      if (v > 0) lost.appendChild(kv(MAT_NAME[k] || k, `−${n(v)}`, true));
    }
    if ((result.lost.equips || []).length > 0) {
      lost.appendChild(kv('装備', `−${result.lost.equips.length}点`, true));
      lost.appendChild(h('div', 'small dim', result.lost.equips.slice(0, 5).map((e) => G.equipName(e)).join('、')));
    }
    lost.appendChild(h('p', { class: 'small dim', style: 'margin-top:8px' },
      'レベル・錬気・祠に置いてある物は減っていません。失うのはこの潜行で拾った分だけです。'));
    root.appendChild(lost);
  }

  // ── 持ちきれなかった装備 ──
  if ((p.overflow || []).length > 0) {
    root.appendChild(h('div', 'panel', [
      h('p', 'warn', `持ち物がいっぱいで、${p.overflow.length}点を持ち帰れませんでした`),
      h('p', 'small dim', '装備の持ち物は500点までです。いらないものを売ってから、もう一度潜ってください。'),
      h('button', {
        class: 'btn btn--sm btn--inline',
        onclick: () => ctx.go('party', { tab: 'equip' }),
      }, '装備を整理する'),
    ]));
  }

  // ── レベル ──
  root.appendChild(h('h2', 'sec-title', '仲間'));
  const party = h('div', 'panel');
  for (const id of ctx.save.party.active) {
    const c = CHAR_BY_ID[id];
    const sc = ctx.save.chars[id];
    if (!c || !sc) continue;
    party.appendChild(h('div', 'party__row', [
      mon(c, 'sm'),
      h('div', 'list__main', c.name),
      h('div', 'party__num', `Lv${sc.lv}`),
    ]));
  }
  root.appendChild(party);

  // ── 次に何をするか ──
  root.appendChild(h('button', {
    class: 'btn btn--primary', style: 'margin-top:14px',
    onclick: () => { ctx.state.pending = null; toHome(ctx); },
  }, [
    '祠へ',
    h('span', 'btn-sub', '庵で休んで、装備を整えてから、また登りましょう。'),
  ]));

  return root;
}

/**
 * レベルアップの演出（2026-08-04・オーナー指示「もう少し派手目に」）。
 *
 * 派手さの正体は**増えた数字**なので、光らせるだけでなく
 * 「力 +3／守 +2」まで見せる。`statsAt` を前後のレベルで引いて差分を取る。
 *
 * ★演出OFF（設定／OSの「視差効果を減らす」）でも**内容は必ず出す**。
 *   止めるのはアニメーションだけで、情報を減らさない。
 */
function levelUpPanel(ctx, levelUps) {
  const fxOff = fxIsOff();
  const panel = h('div', { class: `panel levelup${fxOff ? '' : ' levelup--fx'}` });
  panel.appendChild(h('div', 'levelup__head gold',
    levelUps.length > 1 ? `${levelUps.length}人のレベルが上がった！` : 'レベルが上がった！'));

  for (const up of levelUps) {
    const c = CHAR_BY_ID[up.id];
    if (!c) continue;
    const renki = ctx.save.chars?.[up.id]?.renki || {};
    const before = statsAt(up.id, up.from, renki);
    const after = statsAt(up.id, up.to, renki);
    const diffs = STAT_KEYS
      .map(([k, label]) => [label, Math.round((after[k] || 0) - (before[k] || 0))])
      .filter(([, d]) => d > 0)
      .map(([label, d]) => `${label} +${d}`);

    panel.appendChild(h('div', 'levelup__row', [
      mon({ ...c, alive: true }, 'sm'),
      h('div', 'levelup__body', [
        h('div', null, [
          h('span', null, `${c.name}　`),
          h('span', 'levelup__lv', `Lv${up.from} → `),
          h('span', 'levelup__lv gold', `Lv${up.to}`),
        ]),
        h('div', 'levelup__stats small', diffs.length > 0 ? diffs.join('　') : '力がついた'),
        // 覚えた技は**必ず名前で出す**。数字の差分だけだと気づかれない
        (up.learned || []).length > 0
          ? h('div', 'levelup__learn gold',
            `新しいわざ: ${up.learned.map((sid) => SKILLS[sid]?.name || sid).join('・')}`)
          : null,
      ]),
    ]));
  }
  return panel;
}

/** 差分を出すステータス（表示順） */
const STAT_KEYS = [['hp', 'HP'], ['ki', '気'], ['atk', '力'], ['def', '守'], ['spd', '速'], ['mag', '術'], ['luk', '運']];

function kv(k, v, warn = false) {
  return h('div', 'kv', [
    h('span', 'kv__k', k),
    h('span', { class: warn ? 'kv__v warn' : 'kv__v' }, v),
  ]);
}

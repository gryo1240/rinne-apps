/**
 * 名前に付く言葉の一覧（2026-08-15 新設・オーナー指示
 * 「装備や敵の名前に付く修飾語について、ヘルプマークや説明がどこかに欲しいな」）
 *
 * 【この部品の役割】装備の接頭・接尾と、敵の接辞が**何を上げるか**を一覧で見せる。
 *
 * ★数値は `data/equips.js` / `data/enemies.js` から**そのつど読む**。
 *   ここに書き写すと、バランスを直したときに片方だけ古くなる。
 * ★**装備と敵は別々に開く**（2026-08-16 オーナー指示
 *   「装備のところで装備品の名前の言葉を知れるのは良いのだけど、
 *     ここで敵の名前の意味を知る必要はないので、敵の名前は図鑑に移動して。
 *     装備は現状の位置で良いが、図鑑にも敵とは分けて追加しておいて」）。
 *   前は1つのモーダルに両方を縦に並べていたので、装備を見に来た人が
 *   敵の接辞11行をスクロールで越える必要があった。
 * ★入口は**他のヘルプと同じ「？」**（`affixHelpBtn`）。大きなボタンを置かない。
 */

import { h, customModal } from './dom.js';
import { PREFIXES, SUFFIXES } from '../../data/equips.js';
import { AFFIXES } from '../../data/enemies.js';

/** ステータスの読み方（screen_party.js の STAT_LABEL と同じ言い方にそろえる） */
const S = { hp: 'HP', ki: '気', atk: '力', def: '守り', spd: '疾さ', mag: '念', luk: '運' };

/** `{atk:6, def:-2}` → 「力+6・守り-2」 */
function statText(s) {
  const parts = [];
  for (const [k, v] of Object.entries(s || {})) {
    if (!v) continue;
    parts.push(`${S[k] || k}${v > 0 ? '+' : ''}${v}`);
  }
  return parts.join('・');
}

/** 装備の接頭・接尾が持つ、ステータス以外の効果 */
function extraText(x) {
  const p = [];
  if (x.meguri) p.push(`気の巡り+${x.meguri}／ターン`);
  if (x.crushBonus) p.push(`崩したときのダメージ+${x.crushBonus}%`);
  if (x.akariCut) p.push(`灯の減りが${x.akariCut}%少ない`);
  if (x.resist) p.push(`状態異常を受けにくい+${x.resist}%`);
  if (x.dispatch) p.push(`影送りの収穫+${x.dispatch}%`);
  return p.join('・');
}

/** 敵の接辞の倍率 `{hp:1.3}` → 「HP ×1.3」 */
function mulText(mul) {
  return Object.entries(mul || {})
    .map(([k, v]) => `${S[k] || k} ×${v}`)
    .join('・');
}

/**
 * 1行。**行の高さを詰める**（2026-08-16 オーナー指摘「スクロール数を減らしたい」）。
 * 装備は22行あるので、1行あたり10px削るだけで1画面に収まる（実測: 921px → 収まる）。
 */
function row(name, text) {
  return h('div', 'legend-row legend-row--tight', [
    h('span', { class: 'legend-row__icon', style: 'flex:0 0 5.5em;text-align:left' }, name),
    h('span', 'legend-row__text', text),
  ]);
}

/** 中身を1枚のモーダルに出す（とじるボタンだけ） */
function openHelp(build) {
  customModal(({ close }) => {
    const txt = document.getElementById('modalText');
    const btns = document.getElementById('modalBtns');
    txt.textContent = '';
    txt.appendChild(build());
    btns.replaceChildren(h('button', { class: 'btn btn--primary', onclick: close }, 'とじる'));
    document.getElementById('modal').hidden = false;
  });
}

/** 装備の名前に付く言葉 */
export function showEquipAffixHelp() {
  // ★見出しの上下の余白も詰める（既定の sec-title は上に14px空く）
  const head = (t) => h('h3', { class: 'sec-title', style: 'margin:8px 0 2px' }, t);
  openHelp(() => h('div', null, [
    h('p', 'gold', '装備の名前に付く言葉'),
    h('p', 'small dim', '「頭の言葉＋品物＋後ろの言葉」。付くほど強く、稀になります。'),
    head('頭に付く言葉'),
    ...PREFIXES.filter((p) => p.name).map((p) => row(p.name,
      [statText(p.s), extraText(p)].filter(Boolean).join('・') || '—')),
    head('後ろに付く言葉'),
    ...SUFFIXES.filter((s) => s.name).map((s) => row(s.name,
      [statText(s.s), extraText(s)].filter(Boolean).join('・') || '—')),
  ]));
}

/** 敵の名前に付く言葉 */
export function showEnemyAffixHelp() {
  openHelp(() => h('div', null, [
    h('p', 'gold', '敵の名前に付く言葉'),
    h('p', 'small dim', 'ときどき付きます。付いた敵はそのぶん強く、倒したときの実入りも増えます。'),
    ...AFFIXES.filter((a) => a.name).map((a) => row(a.name, mulText(a.mul) || '—')),
  ]));
}

/**
 * 入口の「？」。`dom.js` の `helpBtn` と同じ見た目・同じ大きさにする
 * （あちらは文字だけのヘルプ、こちらは表を出すので別実装になっている）。
 * @param {'equip'|'enemy'} kind
 */
export function affixHelpBtn(kind = 'equip') {
  const title = kind === 'enemy' ? '敵の名前に付く言葉' : '装備の名前に付く言葉';
  return h('button', {
    class: 'btn btn--sm btn--help', type: 'button',
    'aria-label': `${title}のヘルプ`,
    title: `${title}のヘルプ`,
    onclick: () => (kind === 'enemy' ? showEnemyAffixHelp() : showEquipAffixHelp()),
  }, '？');
}

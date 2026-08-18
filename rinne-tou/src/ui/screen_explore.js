/**
 * 探索画面（spec §2 の画面3）
 *
 * 本作の設計の芯は「もう1階潜るか、ここで引き上げるか」の判断（spec §1）。
 * したがってこの画面は **深度ボーナスと灯を常に見せる**。
 * 潜るほど取り分が増え、力尽きるとその上乗せが消える、が一目で分かること。
 */

import { h, svg, mon, bar, toast, alertBox, confirmBox, customModal, n, zeni } from './dom.js';
import * as X from '../dungeon/explore.js';
import * as R from '../core/rules.js';
import { NODE, NODE_LABEL, NODE_SHORT, NODE_ICON, viewOf } from '../dungeon/floor.js';
import { TOWERS, isBossFloor, floorName, isUnderground } from '../dungeon/towers.js';
import { PHASE_NAMES, PHASE_EMOJI } from '../core/time.js';
import { AILMENTS } from '../../data/skills.js';
import { TACTICS, availableTactics } from '../battle/tactics.js';
import { endRun } from './run_flow.js';
import { afterFloor } from './story_flow.js';
import { canChoose } from '../dungeon/events.js';
import { playSe } from './audio.js';
import { RARITY } from '../../data/equips.js';
import { equipName, equipRarity, dexPercent } from '../meta/growth.js';
import { medFit, anyFit } from './med_target.js';

export function render(ctx) {
  const root = h('div');

  // 潜行がまだ無ければ始める（拠点から「塔へ入る」で来たとき）
  if (!ctx.state.run) {
    const p = ctx.state.params || {};
    ctx.state.run = X.startRun({
      save: ctx.save,
      tower: p.tower || 'main',
      floor: p.floor || 1,
      seed: `${ctx.save.id || 'r'}:${Date.now()}`,
      nowMs: ctx.now(),
    });
    ctx.state.run.partyTactic = ctx.save.party.tacticParty || 'omakase';
  }
  const run = ctx.state.run;

  /**
   * ★並び順（2026-08-14 オーナー指示）:
   *   「『行動ログ』と『深度ボーナスや持ち帰る予定』の行を入れ替えましょう。
   *     道具行は還り札の上に置きましょう」
   *
   *   行動ログを上へ持ってきたのは、**いま何が起きたか**が地図より先に要るため。
   *
   * ★2026-08-16 オーナー指示で**深度ボーナスと道具の行を入れ替えた**。
   *   道具（薬・油壺）は「進む前に整える」もので、地図と作戦の流れの続き。
   *   深度ボーナスと持ち帰る予定は「引き上げるか」を決める材料なので、
   *   引き上げのボタンのすぐ上に置くほうが、判断の順序と並びが一致する。
   *
   * ★同日さらに「探索パートでは作戦と道具を同じ行にしようか」で**1行に統合**した（readyRow）。
   *   どちらも「次のマスへ踏み出す前に整えること」で、置き場所は作戦のほうへ寄せた。
   *   道具は深度ボーナスより上、という前の指示はそのまま保たれている（さらに上へ動いただけ）。
   */
  root.appendChild(statusBar(ctx, run));
  root.appendChild(logPanel(run));
  root.appendChild(mapPanel(ctx, run));
  root.appendChild(choicePanel(ctx, run));
  root.appendChild(readyRow(ctx, run));
  root.appendChild(partyPanel(run));
  root.appendChild(haulPanel(run));
  root.appendChild(retreatRow(ctx, run));

  // ★「還り」のボタンは**地図の右下**に置いてある（mapPanel の中・2026-08-16）
  return root;
}

// ── 状況バー ──────────────────────────────────────────────

function statusBar(ctx, run) {
  const t = TOWERS[run.tower];
  const boss = isBossFloor(run.tower, run.floor);
  const wrap = h('div');

  wrap.appendChild(h('div', 'statusbar', [
    h('span', 'statusbar__floor', floorName(run.floor, run.tower)),
    h('span', 'statusbar__akari', [
      h('div', { class: 'small', style: 'display:flex;justify-content:space-between' }, [
        h('span', X.isTokoyami(run) ? 'warn' : (X.isDim(run) ? 'gold' : 'dim'),
          X.isTokoyami(run) ? '常闇' : (X.isDim(run) ? '薄明' : '灯')),
        h('span', 'dim', `${run.akari}/${run.maxAkari}`),
      ]),
      bar(run.akari, run.maxAkari, 'akari', true),
    ]),
    h('span', 'statusbar__moon', `${PHASE_EMOJI[run.phase]} ${PHASE_NAMES[run.phase]}`),
    // ★塔の中からも設定を開けるようにする（2026-08-08 オーナー要望）。
    //   設定画面は `ctx.state.run` を見て難易度を disabled にし、戻り先も探索へ分岐する
    //   実装が**すでに入っている**ので、入口を足すだけでよい。
    // ★置き場所は状態バー。進み先パネルに置くと、**階段にいるときだけ消える**
    //   （あちらは選択肢が無いと早期returnする・実機で確認して移した）。
    // ★**戦闘画面には置かない。** あちらは非同期ループが回っており、
    //   途中で別画面へ抜ける導線を作るとループが二重に走る（epoch 機構の注記を参照）
    h('button', {
      class: 'btn btn--help statusbar__gear', 'aria-label': '設定',
      onclick: () => ctx.go('settings', { from: 'explore' }),
    }, '⚙'),
  ]));

  if (boss) {
    wrap.appendChild(h('div', 'panel', [
      h('div', 'gold', 'この階から、恐ろしい気を感じる'),
      h('div', 'small dim', '負けても引き返すだけ。記録には残らない。'),
    ]));
  }
  return wrap;
}

/**
 * 深度ボーナスと持ち帰る予定（spec §4-5-a）。
 * ★2026-08-14 に状況バーから切り出して**引き上げのボタンの近く**へ移した。
 *   「もう一階いくか、ここで引き上げるか」を決める材料なので、判断する場所に置く。
 */
function haulPanel(run) {
  const bonus = R.depthBonus(run.depth);
  const carried = run.gained.zeni + run.bonus.zeni;
  return h('div', 'panel panel--flat small', [
    h('div', 'kv', [
      h('span', 'kv__k', `深度ボーナス（${run.depth}階ぶん連続）`),
      h('span', { class: bonus > 1 ? 'kv__v gold' : 'kv__v' }, `×${bonus.toFixed(2)}`),
    ]),
    h('div', 'kv', [
      h('span', 'kv__k', '持ち帰る予定'),
      h('span', 'kv__v', `銭 ${zeni(carried)}／装備 ${run.gained.equips.length + run.bonus.equips.length}点`),
    ]),
    run.bonus.zeni > 0 || run.bonus.equips.length > 0
      ? h('div', 'kv', [
        h('span', 'kv__k warn', 'うち上乗せ分（力尽きると失う）'),
        h('span', 'kv__v warn', `銭 ${zeni(run.bonus.zeni)}／装備 ${run.bonus.equips.length}点`),
      ])
      : null,
  ]);
}

// ── 階層マップ ────────────────────────────────────────────

function mapPanel(ctx, run) {
  // ★常闇（灯0）は**先が一切見えない**（2026-08-12 オーナー指示）。
  //   一度通ったマスだけは見えたままにしてある（記憶なので暗くても消えない）
  const view = viewOf(run.map, X.isTokoyami(run));
  const layers = Math.max(...view.map((v) => v.layer)) + 1;
  /**
   * ★最下段の下の余白は 24（2026-08-16 オーナー指摘
   *   「今は還りボタンが最下段になっていて、その下に余白も多いです」）。
   *   以前は `H = 30 + layers * ROW` で、最下段の丸の下に ROW（66）まるごと空いていた。
   *   丸の半径は20なので、24あれば切れない。42単位（実寸で約45px）縮む。
   */
  const W = 320, ROW = 66, BOTTOM = 24, H = 30 + (layers - 1) * ROW + BOTTOM;

  const pos = {};
  const byLayer = {};
  for (const v of view) (byLayer[v.layer] = byLayer[v.layer] || []).push(v);
  for (const [L, arr] of Object.entries(byLayer)) {
    arr.forEach((v, i) => { pos[v.id] = { x: (W / (arr.length + 1)) * (i + 1), y: 30 + Number(L) * ROW }; });
  }

  const open = new Set(X.choices(run).map((c) => c.id));
  // ★role="img" にしない（2026-08-05 レビュー指摘）。
  //   ARIAの「children presentational」で **role="img" の子孫は支援技術に一切露出しない**。
  //   進み先のボタンを畳んでこの地図だけを入口にしたので、img のままだと
  //   読み上げ利用者は階段に着くまで一歩も進めなくなる。
  const g = svg('svg', {
    class: 'map', viewBox: `0 0 ${W} ${H}`, role: 'group',
    'aria-label': `${floorName(run.floor, run.tower)}の地図`,
  });

  // 線（通れる道は金色に光らせる）
  for (const v of view) {
    for (const nid of v.next) {
      const a = pos[v.id], b2 = pos[nid];
      if (!a || !b2) continue;
      // ★道は前後どちらへも歩けるので、**戻る向きの線も光らせる**
      //   （2026-08-12。ここを直さないと、押せるのに道が暗いまま）
      const lit = (v.current && open.has(nid)) || (nid === run.map.current && open.has(v.id));
      g.appendChild(svg('line', {
        class: `map__edge${lit ? ' map__edge--open' : ''}`,
        x1: a.x, y1: a.y + 20, x2: b2.x, y2: b2.y - 20,
      }));
    }
  }

  /**
   * ★いま立っているマスでも、**階段と入口だけは押せる**（2026-08-16 オーナー指示
   *   「最下段のボタンに行ったら次階層へ自動的に進めてください。
   *     逆に最上段の入口ボタンを再度押したら前階層へ自動的に進んでください」）。
   *   階段は着いた瞬間に自動で上がるので、ここが効くのは
   *   **前の階から戻ってきて階段の上に立っているとき**。
   *   入口は潜行を始めた階より下へは戻れないので、そのときは押せる的にしない
   *   （押せるのに何も起きないボタンは作らない）。
   */
  const canBack = run.floor > (run.startFloor ?? 1);
  const isDoor = (v) => v.current && (v.type === NODE.STAIRS || v.type === NODE.START);

  // ノード
  for (const v of view) {
    const p = pos[v.id];
    if (!p) continue;
    const isOpen = open.has(v.id);
    const door = isDoor(v);
    const hot = isOpen || door;
    // ★「進める」と「もう通った」は両立する（戻り道）。
    //   両方付けて、金色に光りつつ沈んだ色に見えるようにする
    const cls = v.current ? 'map__node--current'
      : isOpen ? `map__node--open${v.visited ? ' map__node--back' : ''}`
        : v.visited ? 'map__node--visited' : 'map__node';
    const label = door
      ? (v.type === NODE.STAIRS ? '次の階へ進む' : (canBack ? '前の階へ戻る' : '塔の外へ出る'))
      : (v.type
        ? `${NODE_LABEL[v.type]}へ${v.visited ? '戻る' : '進む'}`
        : '見えない道へ進む');
    const grp = svg('g', {
      class: v.dim ? 'map__node--dim' : '',
      ...(hot ? { role: 'button', tabindex: '0', style: 'cursor:pointer', 'aria-label': label } : {}),
      ...(hot ? { onclick: () => goNode(ctx, run, v.id) } : {}),
      ...(hot ? { onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goNode(ctx, run, v.id); } } } : {}),
    });
    grp.appendChild(svg('circle', { class: `map__node ${cls}`, cx: p.x, cy: p.y, r: 20 }));
    // ★指で押す的を広げる。見た目の円は r=20（実寸で34〜43px）しかなく、
    //   進み先ボタンを畳んだ今は、これが唯一の前進手段なので --tap(44px) を下回らせない
    if (hot) grp.appendChild(svg('circle', { class: 'map__hit', cx: p.x, cy: p.y, r: 26 }));
    grp.appendChild(svg('text', { class: 'map__label', x: p.x, y: p.y - 2 },
      v.type ? (NODE_ICON[v.type] || '・') : '？'));
    // ★丸に添える名前は**短いほう**を使う（NODE_SHORT）。
    //   「還りの陣」をそのまま出すと円からはみ出して隣に重なる
    grp.appendChild(svg('text', { class: 'map__label map__label--sub', x: p.x, y: p.y + 11 },
      v.current ? 'いま' : (v.type ? NODE_SHORT[v.type] : '')));
    g.appendChild(grp);
  }

  /**
   * ★「？」は地図の**右上**に重ねる（2026-08-14 オーナー指示
   *   「その横にあるヘルプマークは、探索行の右上あたりに設置しましょう。
   *     これで縦列を少しだけ減らせます」）。
   *   説明文を1行まるごと消せるので、そのぶん地図と選択肢が上に来る。
   *
   * ★「還り」は地図の**右下に重ねて常時出す**（2026-08-16 オーナー指示
   *   「還りボタンはマップ上の右下に常時表示してください」）。
   *   画面の右下に固定で浮かせる形はやめた。理由は3つ:
   *     ① 地図は画面を開いた時点で見えている位置にある（統計上いちばん上の主役）。
   *        地図に貼れば、スクロールの位置に関わらず「還り」が目に入る。
   *     ② 浮かせた玉は本文の上に乗るので、下端のボタンのタップを奪う恐れが常にある。
   *        地図の中なら、そもそも他のボタンに重ならない。
   *     ③ このゲームは iframe 埋め込みで出す。iOS の iframe 内 `position: fixed` は
   *        親のスクロールに合わせて浮く位置がずれることがある（lessons 参照）。
   *        地図に貼れば、その挙動に一切依存しない。
   *   ★重なり事故が起きないのは**偶然ではない**。地図の最下段は必ず階段1つで、
   *     しかも中央に置かれる（floor.js: `layer: midLayers + 1` の単独ノード）。
   *     右下は構造上いつも空いている。
   */
  return h('div', { class: 'panel map-panel' }, [
    h('button', {
      class: 'btn btn--help map-panel__help', 'aria-label': '地図の記号の意味',
      onclick: () => showLegend(),
    }, '？'),
    g,
    retreatFab(ctx, run),
  ]);
}

// ── 進む先 ────────────────────────────────────────────────

function choicePanel(ctx, run) {
  const wrap = h('div', 'choice');
  const cs = X.choices(run);
  const cur = run.map.nodes[run.map.current];

  /**
   * ★「◯階へ登る」のボタンは置かない（2026-08-16 オーナー指示
   *   「次の階に上る時も、『〇階へ登る』というのを表示しないようにしよう。
   *     最下段のボタンに行ったら次階層へ自動的に進めてください」）。
   *   階段のマスに着いた時点で自動的に上がる（`goNode`）。
   *   地図の丸がそのまま入口なので、同じ操作のボタンを1段ぶん占める意味が無い。
   */

  if (cs.length === 0) {
    if (!cur || cur.type !== NODE.STAIRS) {
      wrap.appendChild(h('p', 'small dim', 'この先へは進めません。引き上げてください。'));
    }
    return wrap;
  }

  // ★進み先のボタンは置かない（2026-08-05 オーナー指示）。
  //   地図のノードがそのまま押せるので、同じ選択肢が画面に二度並んでいた。
  //   記号の意味は下の「？」にまとめてある
  /**
   * ★遊び方の一行は消した（2026-08-14 オーナー指示
   *   「『光っている丸を押すと進みます。来た道を戻ることもできます。』は不要なので消そう」）。
   *   記号の意味は地図の右上の「？」から引ける。
   * ★常闇のときだけは残す。**先が見えないのは不具合ではない**と伝える必要があるため。
   */
  if (X.isTokoyami(run)) {
    // ★2026-08-16 から、通った道も見えなくなる。**そうと書かないと不具合に見える**
    wrap.appendChild(h('div', 'choice__guide', [
      h('span', 'small warn', '常闇。先も、通った道も見えない。'),
    ]));
  }
  return wrap;
}

/** 地図の記号の意味（進み先ボタンを畳んだぶん、ここで引けるようにする） */
function showLegend() {
  customModal(({ close }) => {
    const txt = document.getElementById('modalText');
    const btns = document.getElementById('modalBtns');
    txt.textContent = '';
    txt.appendChild(h('div', null, [
      h('p', 'gold', '地図の記号'),
      /**
       * ★記号と説明だけを1行に（2026-08-14 オーナー指示
       *   「地図記号の右側にある『宝』とか『商人』とかは、説明文があるから不要。
       *     でも説明文は1行に収めてほしい」）。
       *   名前は説明文の頭に出てくるので、二重に並べる意味が無かった。
       * ★`kv` は左右に振り分けるので、幅の狭い画面では説明が折り返す。
       *   記号のあとに続けて書いて、1行に収める。
       */
      ...[NODE.BATTLE, NODE.TREASURE, NODE.HOKORA, NODE.KAERI, NODE.AKINDO, NODE.KAII, NODE.TRAP, NODE.EMPTY, NODE.STAIRS, NODE.BOSS]
        .map((t) => h('div', 'legend-row', [
          h('span', 'legend-row__icon', NODE_ICON[t] || '・'),
          h('span', 'legend-row__text', nodeHint(t)),
        ])),
      h('p', 'small dim', '「？」の丸は、行ってみるまで何があるか分かりません。'),
    ]));
    btns.replaceChildren(h('button', { class: 'btn btn--primary', onclick: close }, 'とじる'));
    document.getElementById('modal').hidden = false;
  });
}

/**
 * 記号1つぶんの説明。
 * ★**1行に収める**（2026-08-14 オーナー指示）。390px幅で折り返さない長さ＝24字前後。
 * ★名前を頭に置く。記号の右の名札を消したので、ここが唯一の見分けになる。
 */
function nodeHint(type) {
  return {
    battle: '戦い。経験値・銭・装備が手に入る。',
    treasure: '宝。素材や装備が手に入る。',
    hokora: `祠。HP・気が全快し、灯が${R.AKARI_HOKORA_GAIN}戻る。`,
    kaeri: '還りの陣。札も灯も使わず引き上げられる。',
    trap: '罠。灯を失う。',
    akindo: '商人。還り札・灯・掘り出し物を売る。',
    kaii: '怪異。何が起きるかは分からない。',
    empty: '空。何もない。灯だけ減る。',
    stairs: '階段。次の階へ続く。',
    boss: 'ぬし。この階の主がいる。',
  }[type] || '';
}

// ── 作戦の切り替え（戦闘前に決める） ──────────────────────

/**
 * 作戦と道具を**同じ1行に**（2026-08-16 オーナー指示
 * 「探索パートでは作戦と道具を同じ行にしようか」）。
 *
 * ★どちらも「次のマスへ踏み出す前に整えること」なので、まとめても意味の筋が通る。
 * ★**添え書き（.btn-sub）は置かない。** 1行に4つ並ぶので、1つでも2行になると
 *   行をまとめた意味（縦を詰める）が消える。油壺の「灯が◯戻る」は
 *   押した直後のトーストで出るし、灯の残りはすぐ上の状況バーに常に出ている。
 * ★道具が1つも無ければ作戦だけの行になる（空の枠は出さない）。
 */
function readyRow(ctx, run) {
  const row = tacticRow(ctx, run);
  for (const b of itemButtons(ctx, run)) row.appendChild(b);
  return row;
}

function tacticRow(ctx, run) {
  const avail = availableTactics({
    chapter: ctx.save.progress.chapter ?? 0,
    dexPct: dexPercent(ctx.save),
    pairsFound: Object.keys(ctx.save.dex?.pairs || {}).length,
    boardUnlocked: (ctx.save.board || []).some((v) => v > 0),
  });
  const sel = h('select', {
    'aria-label': '作戦',
    onchange: (e) => {
      run.partyTactic = e.target.value;
      ctx.save.party.tacticParty = e.target.value;
      toast(`作戦を「${TACTICS[e.target.value].name}」にした`);
    },
  }, avail.map((id) => h('option', { value: id, selected: run.partyTactic === id }, TACTICS[id].name)));

  return h('div', { class: 'panel panel--flat', style: 'display:flex;gap:8px;align-items:center;flex-wrap:wrap' }, [
    h('span', 'small dim', '作戦'),
    sel,
  ]);
}

/**
 * 塔の中で使える道具（2026-08-12 新設／2026-08-13 に薬を足した）。
 *
 * ★1つも無いときは**何も返さない**（空の「道具」の見出しだけが残らないように）。
 * ★薬は種類が増えたので選ぶ画面の中へ。油壺だけ外に出しておくのは、
 *   灯が減っているときに1タップで押せることが体験上いちばん効くため。
 * ★2026-08-16、作戦と同じ行に入れるため**行ではなくボタンの配列**を返す形にした。
 */
function itemButtons(ctx, run) {
  const oil = X.oilLeft(run);
  const meds = X.medList(run);
  if (oil <= 0 && meds.length === 0) return [];

  /**
   * ★作戦との間を空ける（2026-08-16 オーナー指示
   *   「探索マップの作戦と道具の間は、もう少し間を開けよう」）。
   *
   * ★`margin-left: auto` にすること。固定値（16px）にしたら**行が折り返して**
   *   行の高さが 72→124px に増え、1行にまとめた意味が消えた（実機で確認）。
   *   auto なら「余っている幅ぶんだけ」離れるので、はみ出しようがない。
   */
  const kids = [h('span', { class: 'small dim', style: 'margin-left:auto' }, '道具')];
  if (oil > 0) {
    const full = run.akari >= run.maxAkari;
    kids.push(h('button', {
      // ★満ちているときは押せなくする。理由は文字で足さず `title` に逃がす
      //   （1行に収めるため。灯の残量はすぐ上の状況バーに常に出ている）
      class: 'btn btn--sm', type: 'button', disabled: full,
      title: full ? '灯はもう満ちています' : `灯が ${X.OIL_AKARI} 戻ります`,
      onclick: () => {
        const r = X.useOil(run);
        if (!r.ok) { toast(r.reason === 'full' ? '灯はもう満ちています' : '使えません'); return; }
        playSe('heal');
        toast(`灯が ${r.gained} 戻った（油壺 残り${r.left}）`);
        ctx.render();
      },
    }, `油壺 ${oil}`));
  }
  if (meds.length > 0) {
    // ★種類の数は書かない（2026-08-16 オーナー指示
    //   「『(9種)』と種類を書く必要がないので消去して」）
    kids.push(h('button', {
      class: 'btn btn--sm', type: 'button',
      onclick: () => showMeds(ctx, run),
    }, '薬'));
  }
  return kids;
}

/**
 * 薬を選ぶ（塔の中）。
 *
 * ★**飲む相手は必ず選ばせる**（2026-08-16 オーナー指示
 *   「薬を使う場合、対象はユーザーが選べるようにしてください」）。
 *   それまでは丸薬だけ選べて、回復・清めは「一番弱っている人」に自動で入っていた。
 *   自動のほうが手数は少ないが、**次の階へ誰を万全にして送り込むか**を決められない。
 * ★使える相手が1人もいない薬は、ここで灰色にしておく
 *   （選んでから「使えません」と言われるのは二度手間）。
 */
function showMeds(ctx, run) {
  customModal(({ close }) => {
    const txt = document.getElementById('modalText');
    const btns = document.getElementById('modalBtns');
    txt.textContent = '';
    const list = h('div', 'list');
    for (const { item: it, count } of X.medList(run)) {
      const usable = anyFit(it, run.party);
      list.appendChild(h('button', {
        class: 'list__item', disabled: !usable,
        onclick: () => { close(); showMedTarget(ctx, run, it); },
      }, [
        h('div', 'list__main', [
          h('div', null, [it.name, h('span', 'dim small', `（残り${count}）`)]),
          h('div', 'list__sub', it.desc),
        ]),
        usable ? null : h('div', 'list__right dim', 'いま使えない'),
      ]));
    }
    txt.appendChild(h('div', null, [h('p', null, 'どの薬を使いますか'), h('div', { style: 'margin-top:10px' }, list)]));
    btns.replaceChildren(h('button', { class: 'btn', onclick: close }, 'やめる'));
    document.getElementById('modal').hidden = false;
  });
}

/**
 * 薬を誰に使うか（どの薬でも通る。効かない相手は押せない・理由を右に出す）。
 *
 * ★使ったあと**探索画面へは戻らない**（2026-08-16 オーナー指示
 *   「連続で使う可能性があるので、使った後も探索パート画面に戻らないで」）。
 *   4人に丸薬を配る／回復薬を2本続けて飲ませる、はどれもよくある使い方なのに、
 *   1本ごとに「道具 → 薬 → 相手」と3回押し直させていた。
 *   → 同じ薬がまだ残って効く相手がいれば**この相手えらびをそのまま開き直す**。
 *     切れたら薬えらびへ、薬が尽きたら閉じる。「やめる」も薬えらびへ戻す
 *     （閉じるのは薬えらびの「やめる」1か所に集める）。
 * ★開き直す前に `ctx.render()` を通す。裏の体力バーと持ち物の数が古いままだと、
 *   「もう1本要るか」を目で確かめられない。
 */
function showMedTarget(ctx, run, it) {
  const stillHas = () => X.medList(run).some((m) => m.item.id === it.id);
  const anyMedLeft = () => X.medList(run).length > 0;
  customModal(({ close }) => {
    const txt = document.getElementById('modalText');
    const btns = document.getElementById('modalBtns');
    txt.textContent = '';
    const list = h('div', 'list');
    run.party.forEach((u, i) => {
      const fit = medFit(it, u);
      list.appendChild(h('button', {
        class: 'list__item', disabled: !fit.ok,
        onclick: () => {
          const r = X.useMedicine(run, it.id, i);
          if (!r.ok) { toast(r.reason === 'full' ? 'いま使っても効きません' : '使えません'); return; }
          playSe('heal');
          toast(`${it.name}を使った。${r.text}`);
          close();
          ctx.render();
          // 続けて使えるところまで戻す（探索画面までは戻さない）
          if (stillHas() && anyFit(it, run.party)) showMedTarget(ctx, run, it);
          else if (anyMedLeft()) showMeds(ctx, run);
        },
      }, [
        h('div', 'list__main', [
          h('div', null, u.name),
          // ★いまの具合を添える。名前だけだと「誰が減っているか」を戻って見に行くことになる
          h('div', 'list__sub dim', u.alive
            ? `HP ${Math.round(u.hp)}／${u.max.hp}　気 ${Math.round(u.ki)}／${u.max.ki}`
            : '力尽きている'),
        ]),
        h('div', 'list__right dim', fit.why),
      ]));
    });
    // ★「飲ませますか」にしない。反魂香は焚くもの、清めの水は洗うもの（2026-08-16）
    txt.appendChild(h('div', null, [h('p', null, `${it.name}｜だれに使いますか`), h('div', { style: 'margin-top:10px' }, list)]));
    // ★ここの「やめる」は薬えらびへ戻る（探索画面まで閉じない）
    btns.replaceChildren(h('button', {
      class: 'btn',
      onclick: () => { close(); if (anyMedLeft()) showMeds(ctx, run); },
    }, '薬をえらび直す'));
    document.getElementById('modal').hidden = false;
  });
}

// ── パーティ ──────────────────────────────────────────────

function partyPanel(run) {
  return h('div', 'panel', h('div', 'party', run.party.map((u) => {
    const ail = Object.entries(u.ailments || {}).filter(([, v]) => v > 0)
      .map(([k]) => AILMENTS[k]?.name).filter(Boolean).join('・');
    return h('div', `party__row${u.alive ? '' : ' party__row--down'}`, [
      mon(u, 'sm'),
      h('div', 'party__name', u.name),
      h('div', 'party__bars', [
        bar(u.hp, u.max.hp, 'hp', true),
        h('div', { style: 'height:3px' }),
        bar(u.ki, u.max.ki, 'ki', true),
      ]),
      h('div', 'party__num', [
        u.alive ? `${Math.round(u.hp)}/${u.max.hp}` : h('span', 'warn', '力尽きた'),
        h('div', { class: ail ? 'warn' : 'dim' }, ail || `気${Math.round(u.ki)}`),
      ]),
    ]);
  })));
}

// ── ログ ──────────────────────────────────────────────────

/**
 * 探索ログ。**常に最新の行が見えている**こと（2026-08-12 オーナー指摘
 * 「常に一番古いのが表示されていて毎回下にスクロールしている現状です」）。
 *
 * ★`scrollTop = scrollHeight` では直らない。この画面は `render()` が
 *   組み立てた**まだ文書に入っていないDOM**を返す作りなので、
 *   この時点では要素に高さが無く（scrollHeight が 0）、代入しても効かない。
 *   `requestAnimationFrame` で入れてから、という手もあるが、
 *   画面を離れた後に走る・演出OFFの端末で1フレーム古い行が見える、という穴が残る。
 * ★そこで **CSSだけで解決する**: `flex-direction: column-reverse` の箱に
 *   行を新しい順で入れる。この向きの箱は**下端が原点**なので、
 *   文書に入った瞬間から最新行が見えていて、上へスクロールすれば過去が読める。
 *   計測もタイミングも要らない（＝画面遷移で壊れようがない）。
 */
function logPanel(run) {
  // ★3行だけ（2026-08-16 オーナー指示「探索マップの行動ログも3行でいいです」）
  const last = run.log.slice(-3);
  return h('div', { class: 'battle-log battle-log--tail', style: 'height:60px' },
    // 逆順で入れる。CSSが上下をひっくり返すので、見た目は元の並びのまま
    last.slice().reverse().map((l) => h('p', `l-${l.kind}`, l.text)));
}

// ── 引き上げ ──────────────────────────────────────────────

/**
 * 引き上げる手段は3つ（2026-08-11 に還りの灯の条件を変えて以降）。
 *   還りの陣 … いま陣の上に立っている。何も消費しない
 *   還りの灯 … 5階ぶん進むか、**層ボスを倒す**と灯る。1潜行に1度きり
 *   還り札  … いつでも使える消耗品
 * ★どれが使えるかは `X.canUseAkari()` を必ず通す。ここで条件を書き直すと、
 *   エンジン側（`X.retreat`）とズレて「押せるのに何も起きない」になる。
 */
/**
 * 引き上げ方と、その説明。
 *
 * ★**ここが唯一の出どころ**（2026-08-16）。最下段のボタンと右下の「還り」の
 *   両方から同じものを引く。文面を2か所に書くと、片方だけ直した日に食い違う。
 * ★`export` しているのは**テストのため**。還りの陣は階の生成しだいで出たり出なかったり
 *   するので、実機を歩き回って踏むのを待つ形だと「運が悪い日だけ落ちるテスト」になる。
 *   ここを直接呼べば、陣の上・札あり・何も無し のどれも確実に確かめられる。
 */
export function retreatInfo(run) {
  const onJin = run.map?.nodes?.[run.map.current]?.type === NODE.KAERI;
  const canAkari = X.canUseAkari(run);
  const fuda = run.fuda;
  const left = X.akariLeft(run);

  let label, sub, how;
  if (onJin) {
    how = 'jin';
    label = '還りの陣で引き上げる';
    sub = '札も灯も使いません。拾ったものはすべて確定します。';
  } else if (canAkari) {
    how = 'auto';
    label = '還りの灯で引き上げる';
    // ★説明文は必ず**灯る条件**から書く（2026-08-12 オーナー指摘。
    //   「一回の潜行につき1度だけ戻れる」だけでは、5階ぶん進むまで
    //   押せない理由がどこにも書かれていないことになる）
    /**
     * ★ボスを倒して灯った場合は、そう書く（2026-08-14）。
     *   「5階ぶん進んだので」と出すと、1階しか歩いていない支塔で嘘になる。
     * ★ただし「**この階の**ぬし」とは書かない（2026-08-15 オーナー指摘）。
     *   60階のぬしを倒したあと地下3階まで潜っても灯は点いたままなので、
     *   いま居る階のぬしを倒したかのように読めてしまう。倒した階は問わない。
     */
    sub = (run.bossBeaten && Object.keys(run.bossBeaten).length > 0)
      ? 'ぬしを倒したので灯りました。'
      : `${X.KAERI_NO_HI_DEPTH}階ぶん進んだので灯りました。`;
  } else if (fuda > 0) {
    how = 'auto';
    label = `還り札で引き上げる（残り${fuda}枚）`;
    sub = left > 0
      ? `還りの灯はあと${left}階ぶん進むと灯ります。それまでは、この札が戻る手だてです。`
      : '拾ったものはすべて確定します。';
  } else {
    how = null;
    label = '引き上げられない';
    // ★「なぜ使えないか」を出し分ける。灯がまだ灯っていないだけなら、
    //   あと何階ぶん進めばいいのかが分かれば手が打てる。
    // ★陣は**あるとは限らない**（2026-08-12 に「必ず1つ置く」保証をやめた）。
    //   「陣から戻れます」と断定すると、無い階で嘘になる
    sub = left > 0
      ? `還りの灯はあと${left}階ぶん進むと灯ります。それまでは還り札か、地図に「還」の陣があればそこから戻れます。`
      : '還り札がありません。地図に「還」の陣があればそこへ、無ければ階段を目指してください。';
  }

  /**
   * ★`lit` ＝ 地図の「還り」を金色に光らせるか（2026-08-16 オーナー指示
   *   「還りボタンは5階層分の潜行、もしくはボス撃破、もしくは還りの陣を踏んだ時は
   *     黄色に光るようにしよう」）。
   *
   *   3つとも「**何も減らさずに帰れる**」場面で、そこだけ光らせる。
   *   還り札しか無いときは光らせない。札は消耗品なので、
   *   光らせると「使っても損しない」ように見えてしまう。
   * ★5階ぶんの潜行とぬし撃破は、どちらも `X.canUseAkari()` が判定している
   *   （還りの灯が灯る条件がこの2つ）。ここで条件を書き直さないこと。
   */
  return { how, label, sub, onJin, lit: onJin || canAkari };
}

/**
 * 引き上げるかどうかを訊く。**入口が2つあっても中身は1つ**（2026-08-16）。
 *
 * ★引き上げられないときは「なぜ駄目か」を出す。黙って押せないボタンにすると、
 *   還り札を買いに行けばいいのか、階段を探せばいいのかが分からない。
 */
async function askRetreat(ctx, run) {
  const { how, label, sub } = retreatInfo(run);
  if (!how) {
    await alertBox(`いまは引き上げられません\n\n${sub}`, 'とじる');
    return;
  }
  const bonus = R.depthBonus(run.depth);
  const head = `${label}\n${sub}`;
  const msg = bonus > 1
    ? `${head}\n\nいま引き上げると、深度ボーナス ×${bonus.toFixed(2)} 込みで持ち帰れます。\n（もう1階潜れば ×${R.depthBonus(run.depth + 1).toFixed(2)} になりますが、力尽きると上乗せは消えます）\n\n引き上げますか？`
    : `${head}\n\n引き上げますか？`;
  if (!await confirmBox(msg, '引き上げる', 'まだ進む')) return;
  const r = X.retreat(run, how);
  // 押した瞬間に条件が変わることは無いが、黙って何も起きない状態は作らない
  if (!r.ok) { toast('いまは引き上げられません'); return; }
  endRun(ctx, run);
}

function retreatRow(ctx, run) {
  const { how, label, sub } = retreatInfo(run);
  return h('button', {
    class: 'btn btn--danger', style: 'margin-top:10px',
    disabled: !how,
    onclick: () => askRetreat(ctx, run),
  }, [label, h('span', 'btn-sub', sub)]);
}

/**
 * 地図の右下に重ねる「還り」（2026-08-16 オーナー指示）。
 *
 * ★**押せなくしない**。引き上げられない階でも押せて、理由が出るようにする。
 *   一番知りたいのは「どうすれば戻れるか」であって、押せない事実ではない。
 * ★金色にするのは「何も減らさずに帰れる」3つの場面
 *   （還りの陣・5階ぶんの潜行・ぬし撃破）。判定は `retreatInfo().lit` に集約してある。
 * ★ラベルは「還り」の2文字。丸ボタンに収まり、地図の「還」とも読みがそろう。
 */
function retreatFab(ctx, run) {
  const { how, lit } = retreatInfo(run);
  return h('button', {
    class: `explore-fab${lit ? ' explore-fab--on' : ''}${how ? '' : ' explore-fab--off'}`,
    type: 'button',
    'aria-label': '引き上げるか決める',
    title: '引き上げるか決める',
    onclick: () => askRetreat(ctx, run),
  }, '還り');
}

// ── 進行 ──────────────────────────────────────────────────

/**
 * マスの中身に対応する効果音（2026-08-09 オーナー要望）。
 *
 * ★**列挙にないものは鳴らさない**。空きマスや階段まで鳴ると、
 *   1階ごとに何度も音が出て「うるさいだけ」になる。
 *   ここに載せるのは「進むかどうかの判断が変わる出来事」だけにする。
 */
const NODE_SE = {
  treasure: 'chest',   // 宝箱
  hokora: 'shrine',    // 祠（神社の本坪鈴）
  kaii: 'kaii',        // 怪異（不気味な出現音）
  akindo: 'chest',     // 塔の商人（買い物ができる＝進み方が変わる）
  trap: 'hit',         // 罠を踏んだ
  kaeri: 'shrine',     // 還りの陣（ここから戻れる＝引き際の判断が変わる）
};
// ★怪異マスでも、イベントの抽選に外れると `empty` が返る
//   （「怪異の気配がしたが、何も起こらなかった」）。**そこは意図的に無音**。
//   何も起きていないのに音だけ鳴ると、プレイヤーは見落としたと思って探し直す

function goNode(ctx, run, nodeId) {
  /**
   * ★入口を押したら**ひとつ前の階へ戻る**（2026-08-16 オーナー指示）。
   *   歩いて入口に着くのではなく、押した時点で階を移る。
   *   マスとして解決させない（＝`advance` を通さない）ので、
   *   「入口に何もなかった」というログも出ない。
   */
  if (run.map.nodes[nodeId]?.type === NODE.START) { goPrevFloor(ctx, run); return; }

  /**
   * ★足元の階段を押したときも次の階へ（2026-08-16 オーナー報告）。
   *   前の階から戻ってくると階段の上に立つので、そこを押しても
   *   `advance`（＝隣へ動く）は何もできなかった。押す場所は同じなのに
   *   「進むときと進まないときがある」ように見えていた。
   */
  if (nodeId === run.map.current && run.map.nodes[nodeId]?.type === NODE.STAIRS) {
    climbFromHere(ctx, run);
    return;
  }

  const ev = X.advance(run, nodeId, { interactive: true });
  playSe(NODE_SE[ev.type]);   // 無い型は undefined → 何も鳴らない

  /**
   * ★階段に着いたら、その場で次の階へ（2026-08-16 オーナー指示。ボタンは置かない）。
   *   `advance` の中で「階段を見つけた」のログは出ているので、続けて階が変わる。
   */
  if (ev.type === 'stairs') { descend(ctx, run); return; }

  if (ev.type === 'battleStart') {
    ctx.go('battle', { ev });
    return;
  }
  if (ev.type === 'kaii' && ev.event) {
    showKaii(ctx, run, ev.event, nodeId);
    return;
  }
  if (ev.type === 'akindo') {
    showAkindo(ctx, run);
    return;
  }
  // ★陣に乗っただけでは帰さない。地図の右下の「還り」（と下の「引き上げる」）が
  //   「還りの陣で引き上げる」に変わるので、そこで選んでもらう。
  //   ただし黙って変わっても気づかないので、ここで一言だけ出す
  // ★案内先は**地図の「還り」**にする（2026-08-16）。ボタンを地図へ移した以上、
  //   「下の」と書いたままだと、いちばん見てほしい瞬間に嘘の道案内をすることになる
  if (ev.type === 'kaeri') {
    toast('還りの陣。地図の右下の「還り」から、札も灯も使わずに戻れます', 3600);
  }
  if (run.over) { endRun(ctx, run); return; }
  ctx.render();
}

// ── 塔の商人（spec §4-2・2026-08-04 実装） ────────────────

/**
 * 商人の売り場。
 *
 * 「銭は帰ってはじめて自分のものになる」という緊張を壊さないよう、
 * **その潜行で拾った銭からその場で払う**（`explore.buyFromAkindo`）。
 * ★全滅すれば買った物も消える（還り札は `run.fudaBought` で巻き戻し、
 *   掘り出し物は上乗せ分に積んだうえで最高レア保護の対象外にしてある）。
 *   ここを緩めると「どうせ全滅する潜行では買い物がタダ」になる。
 */
function showAkindo(ctx, run) {
  customModal(({ close }) => {
    const txt = document.getElementById('modalText');
    const btns = document.getElementById('modalBtns');
    const shop = run.shop || {};

    const draw = () => {
      txt.textContent = '';
      const purse = X.purseOf(run);
      const list = h('div', { class: 'list', style: 'margin-top:10px' });

      const item = (what, label, sub, left, ready = true) => {
        const cost = shop.price?.[what] ?? 0;
        const ok = left > 0 && purse >= cost && ready;
        list.appendChild(h('button', {
          class: 'list__item', disabled: !ok,
          onclick: () => {
            const r = X.buyFromAkindo(run, what);
            if (!r.ok) {
              toast(r.reason === 'zeni' ? '銭がたりません。'
                : r.reason === 'stock' ? 'もう売り切れです。'
                  : r.reason === 'full' ? '灯はもう満ちています。' : '買えませんでした。');
              return;
            }
            toast(r.text);
            draw();          // 在庫と手持ちを描き直す
          },
        }, [
          h('div', 'list__main', [
            h('div', ok ? '' : 'dim', label),
            h('div', 'list__sub', left > 0 ? sub : '売り切れ'),
          ]),
          h('div', { class: ok ? 'list__right gold' : 'list__right dim' }, left > 0 ? `銭 ${zeni(cost)}` : '—'),
        ]));
      };

      // 掘り出し物。1潜行の稼ぎとほぼ同額なので、買うと今回の儲けがほぼ消える
      if (shop.ware) {
        const w = shop.ware;
        item('ware', `${RARITY[equipRarity(w)]}｜${equipName(w)}`,
          '掘り出し物。持ち帰れば自分の物になります', shop.wareLeft);
      }
      item('fuda', '還り札', `残り${shop.fudaLeft}枚。いつでも祠へ戻れます（いま ${run.fuda}枚）`, shop.fudaLeft);
      // 灯が満ちているときは押せない（銭だけ取られるのを防ぐ）
      const full = run.akari >= run.maxAkari;
      item('akari', '灯を注いでもらう',
        full ? `もう満ちています（${Math.round(run.akari)}／${run.maxAkari}）`
          : `提灯が満ちます（いま ${Math.round(run.akari)}／${run.maxAkari}）`,
        shop.akariLeft, !full);

      txt.appendChild(h('div', null, [
        h('p', null, '「塔の中じゃ、銭より灯のほうが役に立つがね」'),
        h('p', 'small dim', `いま持っている銭 ${zeni(purse)}（持ち帰るまでは、この潜行で拾った分です）`),
        list,
      ]));
    };

    draw();
    btns.replaceChildren(h('button', {
      class: 'btn',
      onclick: () => { close(); ctx.render(); },
    }, '先へ進む'));
    document.getElementById('modal').hidden = false;
  });
}

// ── 怪異（選択肢イベント・spec §4-4） ──────────────────────

function showKaii(ctx, run, ev, nodeId) {
  customModal(({ close }) => {
    const txt = document.getElementById('modalText');
    const btns = document.getElementById('modalBtns');

    txt.textContent = '';
    const list = h('div', { class: 'list', style: 'margin-top:10px' });
    for (const [i, c] of ev.choices.entries()) {
      const ok = canChoose(run, c);
      list.appendChild(h('button', {
        class: 'list__item', disabled: !ok,
        onclick: () => { close(); pickKaii(ctx, run, ev, i, nodeId); },
      }, [
        h('div', 'list__main', [
          h('div', ok ? '' : 'dim', c.label),
          c.cost ? h('div', `list__sub${ok ? '' : ' warn'}`, costText(c.cost)) : null,
        ]),
      ]));
    }

    txt.appendChild(h('div', null, [
      h('p', null, ev.text),
      h('p', 'small dim', 'どうしますか'),
      list,
    ]));
    // 選ばずに閉じられると、進んだのに何も起きない状態になる。閉じるボタンは置かない
    btns.replaceChildren();
    document.getElementById('modal').hidden = false;
  });
}

function costText(cost) {
  const p = [];
  if (cost.zeni) p.push(`銭 ${zeni(cost.zeni)}`);
  if (cost.akari) p.push(`灯 ${cost.akari}`);
  if (cost.fuda) p.push(`還り札 ${cost.fuda}枚`);
  if (cost.hp) p.push(`HP ${Math.round(cost.hp * 100)}%`);
  return `（${p.join('・')} を使う）`;
}

async function pickKaii(ctx, run, ev, index, nodeId) {
  const res = X.resolveKaiiChoice(run, ev, index, nodeId);
  if (!res || res.refused) { toast('それは選べない'); ctx.render(); return; }

  const lines = [res.result.outcome.text];
  if (res.result.applied.length > 0) { lines.push(''); lines.push(...res.result.applied); }
  if (res.drops && res.drops.length > 0) lines.push(`装備を ${res.drops.length} 点 手に入れた`);
  await alertBox(lines.join('\n'), '先へ進む');

  if (run.over) { endRun(ctx, run); return; }
  ctx.render();
}

async function descend(ctx, run) {
  const r = X.descend(run, ctx.now());
  if (!r.ok) { toast('この先へは進めない'); return; }

  if (r.mark) toast(`${floorName(run.floor, run.tower)}に印を刻んだ`);
  /**
   * その階の場面（仲間の加入もここで起きる・src/meta/story.js）。
   * ★**初めて着いた階だけ**（2026-08-16）。階を行き来できるようにしたので、
   *   戻ってから上がり直すたびに場面を引きにいくと、同じ入口を何度も叩くことになる。
   */
  if (r.deeper && afterFloor(ctx, run)) return;
  ctx.render();
}

/** 足元の階段を押して、次の階へ（歩いて踏んだときと同じ演出・同じ灯の消費） */
async function climbFromHere(ctx, run) {
  const r = X.stairsFromHere(run, ctx.now());
  if (!r.ok) { toast('この先へは進めない'); return; }
  playSe(NODE_SE.stairs);
  if (r.mark) toast(`${floorName(run.floor, run.tower)}に印を刻んだ`);
  if (r.deeper && afterFloor(ctx, run)) return;
  ctx.render();
}

/**
 * 入口を押して、ひとつ前の階へ戻る（2026-08-16 オーナー指示）。
 * ★戻り先では、前にその階を出たときの地図がそのまま復元される
 *   （開けた宝も倒した敵もそのまま。`explore.moveFloor` の注記を参照）。
 */
async function goPrevFloor(ctx, run) {
  const r = X.backFloor(run, ctx.now());
  if (r.ok) { ctx.render(); return; }

  /**
   * ★入った階の入口＝そこから下は塔の外。**外へ出るかを訊く**（2026-08-16 オーナー指示
   *   「入口から下に行こうとした場合は、祠に戻るか否かを選択できるようにし、
   *     戻る際は祠に戻るようにしましょう」）。
   *
   * ★札も灯も減らない。歩いて帰るのだから当然だが、
   *   **ここまで歩き戻る道のりの灯**がその代金になっている（`backFloor` が1歩ぶん引く）。
   */
  if (r.reason !== 'entry') return;
  const bonus = R.depthBonus(run.depth);
  const head = '入ってきた口です。ここから塔の外へ出られます。\n札も灯も使いません。';
  const msg = bonus > 1
    ? `${head}\n\nいま出ると、深度ボーナス ×${bonus.toFixed(2)} 込みで持ち帰れます。\n\n祠へ戻りますか？`
    : `${head}\n\n祠へ戻りますか？`;
  if (!await confirmBox(msg, '祠へ戻る', 'まだ塔にいる')) return;
  const out = X.retreat(run, 'gate');
  if (!out.ok) { toast('いまは戻れません'); return; }
  endRun(ctx, run);
}

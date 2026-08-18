/**
 * 記録画面（spec §2 の画面7）
 * 統計／図鑑。ランキング（v1.1）と影闘の戦績（v1.2）はまだ入っていない。
 */

import { h, hhmm, n, fold, swapInto, zeni } from './dom.js';
import { SPECIES } from '../../data/enemies.js';
import { BASES } from '../../data/equips.js';
import { ITEMS, MAT_INFO } from '../../data/items.js';
import { MAT_NAME, dexPercent } from '../meta/growth.js';
import * as D from '../meta/dex.js';
import { PHASE_EFFECT } from '../core/time.js';
import { BOSSES, BOSS_FLOORS } from '../../data/bosses.js';
import { TOWERS, isTowerCleared, floorName } from '../dungeon/towers.js';
import { everMax } from '../core/save.js';
import * as R from '../core/rules.js';
import { affixHelpBtn } from './affix_help.js';

export function render(ctx) {
  const save = ctx.save;
  const root = h('div');

  root.appendChild(h('h2', 'sec-title', 'あゆみ'));
  root.appendChild(h('div', 'panel', [
    kv('到達した階', floorName(everMax(save))),
    (save.progress.rebirth || 0) > 0 ? kv('この周の到達', floorName(save.progress.maxFloor)) : null,
    kv('遊んだ時間', hhmm(save.playSec || 0)),
    kv('戦った回数', `${n(save.stats.battles || 0)}回`),
    kv('進んだ階数', `${n(save.stats.floorsCleared || 0)}階`),
    kv('力つきた回数', `${n(save.stats.deaths || 0)}回`),
    kv('輪廻した回数', `${save.progress.rebirth || 0}周`),
    kv('いまの銭', zeni(save.inv.zeni || 0)),
    kv('たまった因果', n(save.karma.have || 0)),
    save.stats.noDeathRun
      ? kv('実績「還らずの登頂」', h('span', 'gold', 'この周ではまだ力尽きていない'))
      : null,
  ]));

  /**
   * ── 層ボス ──
   * ★2026-08-12「縦に長すぎる」。名前と突破／未突破だけを畳んだ1行にし、
   *   姿かたちの説明は開いたときに出す。
   */
  root.appendChild(h('h2', 'sec-title', '層ボス'));
  for (const f of BOSS_FLOORS) {
    // ★「突破したか」は今の周の記録。「名前と姿を知っているか」は全周を通じて。
    //   両方を maxFloor で見ていたため、輪廻すると**倒したはずのボスが「？？？」に戻っていた**
    const beaten = !!save.progress.bossBeaten?.[f] || (save.progress.maxFloor || 1) > f;
    const seen = everMax(save) >= f;
    root.appendChild(fold({
      title: h('span', beaten ? 'gold' : (seen ? '' : 'dim'), `${floorName(f)}　${seen ? BOSSES[f].name : '？？？'}`),
      right: beaten ? '突破' : (seen ? '未突破' : '未到達'),
      dim: !seen,
    }, seen
      ? [h('div', null, BOSSES[f].desc), h('div', 'list__sub dim', BOSSES[f].hint || '')]
      : [h('div', 'dim', 'まだ会っていません。')]));
  }

  // ── 支塔 ──
  root.appendChild(h('h2', 'sec-title', '塔'));
  for (const t of Object.values(TOWERS)) {
    const open = t.unlock(save);
    const reached = t.kind === 'story' ? everMax(save) : (save.progress.towerMax?.[t.id] || 0);
    // ★到達階と踏破は別物。本編ボスを「突破／未突破」で出しているのに、
    //   支塔だけ「10階」としか出ないのは不揃いだった（2026-08-03 レビュー指摘）
    const cleared = t.kind === 'side' && isTowerCleared(save, t.id);
    root.appendChild(fold({
      title: h('span', open ? '' : 'dim', t.name),
      right: h('span', cleared ? 'gold' : '', open ? floorName(reached, t.id) : '—'),
      dim: !open,
    }, [
      h('div', null, open ? t.desc : (t.unlockHint || 'まだ入れない')),
      open && t.kind === 'side'
        ? h('div', 'list__sub dim', cleared ? '踏破済み' : (reached > 0 ? 'まだ主を倒していない' : '未踏'))
        : null,
      // 何が採れる塔かは、入る前に知りたい情報（2026-08-12 月の素材の塔を追加）
      open && t.moonMats
        ? h('div', 'list__sub dim', `採れる月の素材: ${t.moonMats.map((m) => MAT_NAME[m] || m).join('・')}`)
        : null,
    ]));
  }

  /**
   * ── 図鑑 ──
   *
   * ★2026-08-12 オーナー指示で「敵や道具、装備品の一覧を作り、それぞれに説明文を追加」。
   *   それまでは装備の名前だけが並び、敵は数（しかも記録されておらず常に0）だけだった。
   * ★見つけていないものは名前も説明も伏せる（「？？？」）。
   *   先に全部見えてしまうと、塔を登って出会う意味が薄れる。
   */
  const foundEnemies = Object.keys(save.dex?.enemies || {}).length;
  const foundEquips = Object.keys(save.dex?.equips || {}).length;
  root.appendChild(h('h2', 'sec-title', '図鑑'));
  root.appendChild(h('div', 'panel', [
    kv('見つけた敵', `${foundEnemies} / ${SPECIES.length}`),
    kv('見つけた装備', `${foundEquips} / ${BASES.length}`),
    h('p', 'small dim',
      `図鑑を埋めると、上級作戦「読み切れ」が使えるようになります（敵図鑑50%・いま${dexPercent(save)}%）。`),
  ]));

  /**
   * ★一覧は**ジャンルを1つだけ開く**（2026-08-12 オーナー指示
   * 「『敵』や『装備』、『道具』のボタンを横一列に並べ、選択したジャンルだけを広げるように。
   *   選択していないジャンルは閉じること」）。
   *
   *   敵39＋装備20＋道具と素材12＝71項目ある。畳んでおいても、3ジャンル同時に開けると
   *   その気になれば画面が数千pxになる。**同時にひとつ**なら、どれを開いても長さが読める。
   * ★切り替えは**この枠の中だけ**描き直す。`ctx.go` で作り直すと画面が先頭へ飛び、
   *   図鑑は画面の下のほうにあるので、押すたびにスクロールし直しになる。
   */
  const dexHost = h('div');
  root.appendChild(dexHost);
  drawDex(ctx, dexHost);

  root.appendChild(h('div', 'panel', [
    h('p', 'small dim', 'ランキングと闘技は次の更新で入ります'),
  ]));

  root.appendChild(h('button', {
    class: 'btn', style: 'margin-top:14px',
    onclick: () => ctx.go('home'),
  }, '祠へ戻る'));

  return root;
}

const SLOT_NAME = { weapon: '武器', armor: '防具', charm: '護符' };

/** 素材の並び順（鍛冶石・錬気の素材 → 月の順） */
const MAT_ORDER = ['enhance_stone', 'renki_mat', ...Object.values(PHASE_EFFECT).map((p) => p.material)];

/** その敵がどこに出るか。支塔専用の種は塔の名前で出す（本編で探しても見つからないため） */
function enemyWhere(sp) {
  if (sp.towers && sp.towers.length > 0) {
    const names = sp.towers.map((t) => TOWERS[t]?.name).filter(Boolean);
    return names.length > 0 ? names.join('・') : '支塔にだけ出る';
  }
  // ★上限が 999（＝どこまでも出る種）を「1〜999階」と書かない。
  //   61階から下は「地下」になったので、ここも下向きの言い方にそろえる（2026-08-13）
  if (sp.f[1] >= 999) return `${floorName(sp.f[0])}から下ずっと`;
  return `${floorName(sp.f[0])}〜${floorName(sp.f[1])}`;
}

/** 出やすい構え。三すくみのどれで崩せるかの手がかりになる */
function stanceOf(sp) {
  const names = ['剛', '疾', '呪'];
  const total = sp.stance.reduce((a, b) => a + b, 0) || 1;
  return sp.stance
    .map((w, i) => ({ w, name: names[i] }))
    .filter((x) => x.w > 0)
    .sort((a, b) => b.w - a.w)
    .map((x) => `${x.name} ${Math.round((x.w / total) * 100)}%`)
    .join('／');
}

function kv(k, v) {
  return h('div', 'kv', [h('span', 'kv__k', k), h('span', 'kv__v', v)]);
}

/** 図鑑のジャンル切り替え（枠の中だけ描き直す＝画面が先頭へ飛ばない） */
function drawDex(ctx, host) {
  swapInto(host, (root) => buildDex(ctx, root, () => drawDex(ctx, host)));
}

/** 図鑑のジャンル。`build` は開いたときにだけ呼ぶ（閉じている側は組み立てない） */
const DEX_TABS = [
  { id: 'enemy', label: '敵' },
  { id: 'equip', label: '装備' },
  // ★道具（薬を含む）と素材は別のジャンル（2026-08-13 オーナー指示
  //   「道具（薬）と素材は別物なので、区別しておいて」）
  { id: 'item', label: '道具' },
  { id: 'mat', label: '素材' },
];

function buildDex(ctx, root, redraw) {
  const save = ctx.save;
  const cur = ctx.state.params || {};
  /**
   * ★**最初はどれも選ばれていない**（2026-08-13）。
   *   既定を「敵」にしたら、開いた瞬間に39行が並んで **3,531px**（画面4枚ぶん）になった。
   *   縦を短くするのが目的なので、選ぶまでは3つのボタンだけを出す。
   *   もう一度押すと閉じられる（見終わったあと自分で畳める）。
   */
  if (cur.dex != null && !DEX_TABS.some((t) => t.id === cur.dex)) cur.dex = null;

  // 更新前から持っていた道具・素材を図鑑へ取り込む（meta/dex.js の backfill）
  D.backfill(save);

  const foundEnemies = Object.keys(save.dex?.enemies || {}).length;
  const foundEquips = Object.keys(save.dex?.equips || {}).length;
  const count = {
    enemy: `${foundEnemies}／${SPECIES.length}`,
    equip: `${foundEquips}／${BASES.length}`,
    item: `${D.foundItemCount(save)}／${ITEMS.length}`,
    mat: `${D.foundMatCount(save)}／${MAT_ORDER.length}`,
  };

  const genres = h('div', 'btn-row', DEX_TABS.map((t) => h('button', {
    class: `btn btn--sm${cur.dex === t.id ? ' btn--primary' : ''}`,
    type: 'button',
    'aria-pressed': cur.dex === t.id ? 'true' : 'false',
    // 同じボタンをもう一度押したら閉じる
    onclick: () => { cur.dex = cur.dex === t.id ? null : t.id; redraw(); },
  }, `${t.label}（${count[t.id]}）`)));
  /**
   * ★「名前に付く言葉」の「？」は**種類のボタンと同じ行**に置く（2026-08-16 オーナー指摘
   *   「ヘルプマークだけで1行使っている箇所が多い」）。
   *   以前は一覧の頭に右寄せの専用行を作っていたので、「？」だけで1行を占めていた。
   *   この行は4つのボタンですでに2段に折り返しているため、ここへ足しても段は増えない。
   */
  if (cur.dex === 'enemy' || cur.dex === 'equip') genres.appendChild(affixHelpBtn(cur.dex));
  root.appendChild(genres);

  const box = h('div', { style: 'margin-top:10px' });
  if (cur.dex === 'enemy') box.appendChild(dexEnemies(save));
  else if (cur.dex === 'equip') box.appendChild(dexEquips(save));
  else if (cur.dex === 'item') box.appendChild(dexItems(save));
  else if (cur.dex === 'mat') box.appendChild(dexMats(save));
  else box.appendChild(h('p', 'small dim', '見たい種類を選んでください'));
  root.appendChild(box);
}

/** 敵（出会った時点で載る）。「？」は種類のボタンの行にある（buildDex） */
function dexEnemies(save) {
  return h('div', null, [...SPECIES.map((sp) => {
    const got = !!save.dex?.enemies?.[sp.id];
    return fold({
      title: h('span', got ? '' : 'dim', got ? sp.name : '？？？'),
      right: h('span', 'dim', got ? enemyWhere(sp) : '未発見'),
      dim: !got,
    }, got
      ? [h('div', null, sp.desc || ''), h('div', 'list__sub dim', `構え: ${stanceOf(sp)}`)]
      : [h('div', 'dim', 'まだ出会っていません。')]);
  })]);
}

/** 装備（拾った時点で載る） */
function dexEquips(save) {
  return h('div', null, [...BASES.map((b) => {
    const got = !!save.dex?.equips?.[b.id];
    return fold({
      title: h('span', got ? '' : 'dim', got ? b.name : '？？？'),
      right: h('span', 'dim', got ? SLOT_NAME[b.slot] : '未発見'),
      dim: !got,
    }, got
      ? [
        h('div', null, b.desc || ''),
        h('div', 'list__sub dim', `${floorName(b.f[0])}〜${floorName(b.f[1])}で見つかる`),
        h('div', 'list__sub dim', `鍛冶に「${MAT_NAME[b.mat] || '—'}」が要る`),
      ]
      : [h('div', 'dim', 'まだ拾っていません。')]);
  })]);
}

/**
 * 道具（2026-08-13 オーナー指示
 * 「図鑑に、見つけた道具（薬）や素材を含めるようにしてください。
 *   道具（薬）と素材は別物なので、区別しておいて」）。
 *
 * ★以前は道具と素材を1つの欄にまとめ、**全部いつでも見えていた**（＝埋める遊びが無い）。
 *   敵・装備と同じく「見つけたものだけ中身を出す」形に揃える。
 * ★見つけた記録は `save.dex.items` / `save.dex.mats`（`meta/dex.js`）。
 *   持ち数（inv）で判定すると、使い切った瞬間に図鑑から消える。
 */
function dexItems(save) {
  return h('div', null, [
    h('p', 'small dim', 'いくつ持っているかは「持ち物」で見られます。'),
    ...ITEMS.map((it) => {
      const got = D.foundItem(save, it.id);
      return fold({
        title: h('span', got ? '' : 'dim', got ? it.name : '？？？'),
        right: h('span', 'dim', got ? (it.kind === 'medicine' ? '薬' : '道具') : '未発見'),
        dim: !got,
      }, got
        ? [
          h('div', null, it.desc),
          h('div', 'list__sub dim', `入手: ${it.from}`),
          it.note ? h('div', 'list__sub dim', it.note) : null,
        ]
        : [h('div', 'dim', 'まだ手にしていません。')]);
    }),
  ]);
}

/** 素材（道具とは別のジャンル） */
function dexMats(save) {
  return h('div', null, [
    h('p', 'small dim', '鍛冶と錬気で使います'),
    ...MAT_ORDER.map((id) => {
      const info = MAT_INFO[id] || {};
      const got = D.foundMat(save, id);
      return fold({
        title: h('span', got ? '' : 'dim', got ? (MAT_NAME[id] || id) : '？？？'),
        right: h('span', 'dim', got ? '' : '未発見'),
        dim: !got,
      }, got
        ? [
          h('div', null, info.desc || ''),
          info.from ? h('div', 'list__sub dim', `入手: ${info.from}`) : null,
          info.note ? h('div', 'list__sub dim', info.note) : null,
        ]
        : [h('div', 'dim', 'まだ手にしていません。')]);
    }),
  ]);
}

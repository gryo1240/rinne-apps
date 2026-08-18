/**
 * 露店（2026-08-13 新設・オーナー指示
 * 「祠では道具を売買できるようにしておこう。塔内で使うと各ステータス上昇できる
 *   各種の薬とか、回復薬とかを売っておこう」）
 *
 * 【この画面の役割】銭を薬に換える／余った薬と素材を銭に戻す。それだけ。
 *
 * ★説明は畳む（持ち物画面と同じ理由。9種類の説明を全部開くと3画面ぶんになる）。
 * ★「買う」と「売る」はタブで分ける。同じ行に両方置くと、
 *   狭い画面（390px）で数と価格とボタン2つが1行に入らず折り返す。
 * ★増減は `meta/shop.js` だけが行う（この画面は結果を並べるだけ）。
 *
 * ── 2026-08-14 オーナー指摘への対応 ──────────────────────
 *   ・「売値は買値の〜」の一文を消した（値づけの内訳は客に見せるものではない）
 *   ・説明は**店主の言葉**にした。この店を出しているのは、塔で会うあの商人と同じ者。
 *     ★新しい人物を作らないこと。塔の商人（`explore.resolveAkindo`）は
 *       名前も顔も無いまま「荷を担いだ商人」として既に居るので、そこに寄せる。
 *   ・数はつまみ（スライダー）で選ぶ。1つ・5つのボタンでは99まで届かない
 */

import { h, fold, toast, zeni } from './dom.js';
import * as Shop from '../meta/shop.js';
import * as G from '../meta/growth.js';
import * as Sell from './equip_sell.js';
import { affixHelpBtn } from './affix_help.js';
import { RARITY, PREFIXES, SUFFIXES } from '../../data/equips.js';
import { markItem, backfill } from '../meta/dex.js';

/** 装備の一覧は1ページ10件（装備画面と同じ） */
const PAGE = 10;

const TABS = [
  { id: 'buy', name: '買う' },
  { id: 'sell', name: '売る' },
];

/**
 * 店主のひとこと（タブごと）。値づけの説明はしない。
 * ★かぎかっこは付けない（2026-08-14 オーナー指摘。銭の見出しと並ぶと
 *   **「銭」がしゃべっているように見える**）。話し手は絵で分かるので、地の文でよい。
 */
const KOJO = {
  buy: '塔で使うもんなら、ひととおり揃えてある。丸薬は潜る前に飲んどきな。',
  sell: '持ちきれねえもんは置いていきな。銭に換えといてやる。',
};

/** 売る側の内訳（2026-08-14 オーナー指示「『道具』『素材』『装備』とジャンル分け」） */
const SELL_KINDS = [
  { id: 'item', name: '道具' },
  { id: 'mat', name: '素材' },
  { id: 'equip', name: '装備' },
];

export function render(ctx) {
  const save = ctx.save;
  const root = h('div');
  root.appendChild(h('h1', 'screen-title', '露店'));

  if (!save) {
    root.appendChild(h('div', 'panel', '記録が読み込まれていません。'));
    root.appendChild(h('button', {
      class: 'btn btn--primary', style: 'margin-top:14px', onclick: () => ctx.go('title'),
    }, 'タイトルへ戻る'));
    return root;
  }
  // 更新前から持っていた薬を図鑑に取り込む（meta/dex.js の backfill を参照）
  backfill(save);

  const tab = ctx.state.params?.tab === 'sell' ? 'sell' : 'buy';

  /**
   * ★並びは「店主の言葉 → 持っている銭」（2026-08-14 オーナー指摘）。
   *   見出しの「銭」を先に置くと、その下のせりふが銭の発言に見える。
   *   額の見出しは**数のすぐ左**に寄せる（画面の両端に離すと対応が読めない）。
   */
  root.appendChild(h('div', 'panel', [
    h('p', { class: 'small', style: 'margin:0' }, KOJO[tab]),
    h('div', 'shop-purse', [
      h('span', 'dim small', '持っている銭'),
      h('span', 'gold', zeni(save.inv.zeni || 0)),
    ]),
  ]));

  // タブ
  root.appendChild(h('div', { class: 'btn-row', style: 'margin-top:10px' },
    TABS.map((t) => h('button', {
      class: tab === t.id ? 'btn btn--primary btn--sm' : 'btn btn--sm',
      onclick: () => ctx.go('shop', { tab: t.id }),
    }, t.name))));

  // 売る側だけ、扱うものをさらに分ける
  const kind = tab === 'sell'
    ? (SELL_KINDS.some((k) => k.id === ctx.state.params?.kind) ? ctx.state.params.kind : 'item')
    : null;
  if (tab === 'sell') {
    root.appendChild(h('div', { class: 'btn-row btn-row--wrap', style: 'margin-top:6px' },
      SELL_KINDS.map((k) => h('button', {
        class: kind === k.id ? 'btn btn--primary btn--sm' : 'btn btn--sm',
        onclick: () => ctx.go('shop', { tab: 'sell', kind: k.id }),
      }, k.name))));
  }

  const list = h('div', { class: 'list', style: 'margin-top:10px' });
  root.appendChild(list);
  drawList(ctx, list, tab, kind);

  root.appendChild(h('button', {
    class: 'btn', style: 'margin-top:14px', onclick: () => ctx.go('home'),
  }, '祠へ戻る'));
  return root;
}

function drawList(ctx, list, tab, kind) {
  const save = ctx.save;
  while (list.firstChild) list.removeChild(list.firstChild);

  let shown = 0;

  // ── 薬 ──
  for (const it of Shop.STOCK) {
    if (tab === 'sell' && kind !== 'item') break;
    const have = Shop.countOf(save, it.id);
    // 「売る」は持っているものだけ並べる（持っていない行を押せてしまうのは不親切）
    if (tab === 'sell' && have <= 0) continue;
    shown++;
    const price = tab === 'buy' ? Shop.priceOf(it.id) : Shop.sellPriceOf(it.id);
    const room = tab === 'buy' ? Shop.ITEM_MAX - have : have;
    const afford = tab === 'buy' ? Math.floor((save.inv.zeni || 0) / Math.max(1, price)) : room;
    const max = Math.max(0, Math.min(room, afford));

    list.appendChild(fold({
      title: h('span', have > 0 ? '' : 'dim', it.name),
      right: h('span', max > 0 ? 'gold' : 'dim', `${zeni(price)}　持:${have}`),
      dim: max <= 0,
    }, [
      h('div', null, it.desc),
      it.note ? h('div', 'list__sub dim', it.note) : null,
      trade(ctx, tab, {
        id: it.id, name: it.name, price, max, kind: 'item',
        full: tab === 'buy' && room <= 0,
      }),
    ]));
  }

  /**
   * ── 鍛冶の素材（2026-08-14 オーナー指示「売るときは、鍛冶の素材も売れるように」）──
   * ★売るだけ。買えるようにすると塔へ潜る意味が薄れる（meta/shop.js のコメント参照）。
   */
  if (tab === 'sell' && kind === 'mat') {
    for (const m of Shop.MAT_STOCK) {
      const have = Shop.matCountOf(save, m.id);
      if (have <= 0) continue;
      shown++;
      const price = Shop.matSellPriceOf(m.id);
      list.appendChild(fold({
        title: h('span', null, m.name),
        right: h('span', 'gold', `${zeni(price)}　持:${have}`),
      }, [
        h('div', null, '鍛冶と錬気に使う素材です。売ると戻せません。'),
        trade(ctx, tab, {
          id: m.id, name: m.name, price, max: have, kind: 'mat', full: false,
        }),
      ]));
    }
  }

  /**
   * ── 装備（2026-08-14 オーナー指示
   *   「装備は装備ページでも売れるけど、こちらでもフィルターや一括ボタンをつけて売れるように」）──
   *
   * ★売り方の判断（誰が装備中か・いくらになるか）は `meta/growth.js` に置いてある。
   *   ここで数え直さない（装備画面と食い違うと「片方でだけ売れる」になる）。
   */
  if (tab === 'sell' && kind === 'equip') {
    shown += drawEquips(ctx, list);
  }

  if (shown === 0) {
    list.appendChild(h('div', 'panel dim', tab === 'sell'
      ? '売れるものを持っていません。' : '並んでいるものがありません。'));
  }
}

function drawEquips(ctx, list) {
  const save = ctx.save;
  const cur = ctx.state.params || {};
  const equips = (save.inv.equips || []).map(G.unpackEquip);
  if (equips.length === 0) return 0;

  const rar = cur.rar == null ? null : Number(cur.rar);
  /**
   * ★頭・後ろの言葉でもしぼれる（2026-08-16 オーナー指示
   *   「装備を売るときだけど、頭や後ろに付く言葉でフィルターかけられるようにしておいて」）。
   *   稀少度だけだと「珍」に十数点が並び、残したい「の還り」を1点ずつ探すことになる。
   */
  const pre = cur.pre || null;
  const suf = cur.suf || null;
  const match = (e) => (rar == null || G.equipRarity(e) === rar)
    && (!pre || e.prefixId === pre)
    && (!suf || e.suffixId === suf);
  const prev = G.sellPreview(save, match);

  // 稀少度でしぼる。名前に付く言葉は右端の「？」から（2026-08-16 オーナー指示）
  list.appendChild(h('div', 'btn-row btn-row--wrap', [
    h('button', {
      class: `btn btn--sm${rar == null ? ' btn--primary' : ''}`, type: 'button',
      onclick: () => ctx.go('shop', { tab: 'sell', kind: 'equip', rar: null, pre, suf }),
    }, 'すべて'),
    ...RARITY.map((label, i) => h('button', {
      class: `btn btn--sm${rar === i ? ' btn--primary' : ''}`, type: 'button',
      onclick: () => ctx.go('shop', { tab: 'sell', kind: 'equip', rar: i, pre, suf }),
    }, label)),
    affixHelpBtn('equip'),
  ]));

  /**
   * 言葉のしぼりこみ。
   * ★選べるのは**いま持っている装備に付いている言葉だけ**にする。
   *   24種すべてを並べると、選んでも0件になる行がずらりと並ぶ。
   * ★ボタンではなく `select`。ここは階層の違う2つの軸（頭・後ろ）なので、
   *   ボタンで出すと稀少度の列と混ざって、どれが何の絞り込みか分からなくなる。
   */
  const wordRow = h('div', { class: 'kv', style: 'align-items:center;gap:8px;flex-wrap:wrap' });
  const pick = (label, defs, held, value, key) => {
    const has = defs.filter((d) => d.name && held.has(d.id));
    if (has.length === 0) return null;
    const sel = h('select', {
      'aria-label': `${label}でしぼる`,
      onchange: (ev) => ctx.go('shop', {
        tab: 'sell', kind: 'equip', rar, pre, suf, [key]: ev.target.value || null, epage: 0,
      }),
    }, [
      h('option', { value: '', selected: !value }, `${label}：すべて`),
      ...has.map((d) => h('option', { value: d.id, selected: value === d.id }, d.name)),
    ]);
    return sel;
  };
  const heldPre = new Set(equips.map((e) => e.prefixId));
  const heldSuf = new Set(equips.map((e) => e.suffixId));
  const preSel = pick('頭の言葉', PREFIXES, heldPre, pre, 'pre');
  const sufSel = pick('後ろの言葉', SUFFIXES, heldSuf, suf, 'suf');
  if (preSel) wordRow.appendChild(preSel);
  if (sufSel) wordRow.appendChild(sufSel);
  if (pre || suf) {
    wordRow.appendChild(h('button', {
      class: 'btn btn--sm', type: 'button',
      onclick: () => ctx.go('shop', { tab: 'sell', kind: 'equip', rar, pre: null, suf: null, epage: 0 }),
    }, '言葉の指定をやめる'));
  }
  if (preSel || sufSel) list.appendChild(wordRow);


  const redraw = () => ctx.render();
  const listed = equips.filter(match)
    .sort((a, b) => (G.equipRarity(b) - G.equipRarity(a)) || (b.lv - a.lv) || (b.plus - a.plus));

  // ★チェックを付けたものを売る（2026-08-15 オーナー指示）
  list.appendChild(Sell.sellBar(ctx, listed, redraw));

  /**
   * ★ページ送りを付けた（2026-08-15 オーナー指示
   *   「露店でも装備も10点だけでなく、ページ送りを付けて」）。
   *   以前は強い順に10点だけ出して「残りはまとめて売る」と案内していたが、
   *   11点目以降を**1点ずつ選ぶ手だてが無かった**。
   */
  const { shown, nav } = Sell.paginate(listed, ctx.state.params || {}, PAGE, redraw, 'epage');
  const equipped = Sell.equippedSet(save);

  for (const e of shown) {
    const on = equipped.has(e.uid);
    list.appendChild(h('div', { class: 'list__item', style: 'cursor:default' }, [
      Sell.checkbox(ctx, e, equipped, redraw),
      h('div', 'list__main', [
        h('div', `rar-${G.equipRarity(e)}`, `${RARITY[G.equipRarity(e)]}｜${G.equipName(e)}`),
        h('div', 'list__sub dim', on ? '装備中（売れません）' : `${e.lv}階で拾ったもの`),
      ]),
      on ? h('div', 'list__right dim', '—') : h('button', {
        class: 'btn btn--sm btn--danger',
        onclick: async () => {
          const r = G.sellEquip(save, e.uid);
          if (!r.ok) { toast('売れませんでした'); return; }
          toast(`${zeni(r.price)}になった`);
          ctx.saveNow(true); ctx.render();
        },
      }, '売る'),
    ]));
  }
  if (nav) list.appendChild(nav);
  return listed.length;
}

/**
 * 数をつまみで選んで売り買いする一式（2026-08-14 オーナー指示
 * 「店での購入数はスライド式で選べるようにしましょう」）。
 *
 * ★0のときはボタンを押せなくする。鍛冶の画面と同じ作法にそろえた
 *   （`screen_party.js` の `btn--zero`）。0で押せると「押したのに何も起きない」になる。
 * ★上限は「持てる数」と「買える数」の小さいほうまでしか動かない。
 *   つまみを動かしただけで足りない額になる、を作らない。
 */
function trade(ctx, tab, o) {
  const wrap = h('div', { style: 'margin-top:8px' });

  if (o.max <= 0) {
    wrap.appendChild(h('div', 'small dim', o.full
      ? `もう${Shop.ITEM_MAX}持っています。これ以上は持てません。`
      : (tab === 'buy' ? '銭が足りません。' : '持っていません。')));
    return wrap;
  }

  const slider = h('input', {
    type: 'range', class: 'renki__range',
    min: '1', max: String(o.max), value: '1', step: '1',
    'aria-label': `${o.name} を何個${tab === 'buy' ? '買う' : '売る'}か`,
  });
  const sub = h('div', 'small dim');
  const btn = h('button', 'btn btn--sm btn--primary');

  const sync = () => {
    const num = Math.max(1, Number(slider.value) || 1);
    const total = o.price * num;
    sub.textContent = tab === 'buy'
      ? `${num}個で ${zeni(total)}（あと${o.max - num}個まで買えます）`
      : `${num}個で ${zeni(total)}（残り${o.max - num}個）`;
    btn.replaceChildren(`${num}つ${tab === 'buy' ? '買う' : '売る'}`,
      h('span', 'btn-sub', zeni(total)));
    btn.setAttribute('aria-label',
      `${o.name} を ${num}個 ${tab === 'buy' ? '買う' : '売る'}（${zeni(total)}）`);
  };
  sync();
  slider.addEventListener('input', sync);

  btn.addEventListener('click', () => {
    const save = ctx.save;
    const num = Math.max(1, Number(slider.value) || 1);
    const r = o.kind === 'mat'
      ? Shop.sellMat(save, o.id, num)
      : (tab === 'buy' ? Shop.buyItem(save, o.id, num) : Shop.sellItem(save, o.id, num));
    if (!r.ok) {
      toast(r.reason === 'zeni' ? '銭が足りません'
        : r.reason === 'full' ? `1種類につき${Shop.ITEM_MAX}までです` : '足りません');
      return;
    }
    if (o.kind === 'item' && tab === 'sell') markItem(save, o.id);   // 売っても「見つけた」記録は消さない
    toast(tab === 'buy'
      ? `${num}つ買った（−${zeni(r.spent)}／持ち ${r.have}）`
      : `${num}つ売った（＋${zeni(r.gained)}／持ち ${r.have}）`);
    ctx.saveNow(true);
    ctx.render();
  });

  wrap.appendChild(slider);
  wrap.appendChild(sub);
  wrap.appendChild(h('div', { class: 'btn-row', style: 'margin-top:6px' }, [btn]));
  return wrap;
}

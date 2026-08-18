/**
 * 拠点「祠」画面（spec §2 の画面2）
 * 庵で休む／塔へ入る／編成・装備／鍛冶・錬気／記録／設定
 */

import { h, mon, bar, alertBox, confirmBox, customModal, n, zeni } from './dom.js';
import { moonAge, moonPhase, PHASE_NAMES, PHASE_EMOJI, PHASE_EFFECT, daysToNextPhase } from '../core/time.js';
import { CHAR_BY_ID } from '../../data/chars.js';
import { AILMENTS } from '../../data/skills.js';
import * as G from '../meta/growth.js';
import * as H from '../meta/home.js';
import * as D from '../meta/dispatch.js';
import * as Bd from '../meta/board.js';
import { collectDispatch } from './dispatch_flow.js';
import { toExplore, toHome } from './story_flow.js';
import * as St from '../meta/story.js';
import * as Rb from '../meta/rebirth.js';
import { confirmOnce } from './confirm.js';
import { TOWERS, availableTowers, canEnter, isBossFloor, powerFloorOf, floorName } from '../dungeon/towers.js';
import { everMax } from '../core/save.js';
import { bossDefOf } from '../../data/bosses.js';

export function render(ctx) {
  const save = ctx.save;
  const root = h('div');

  // 起動時の「祠の文」（spec §7-1）。会話へ寄り道した場合もここで必ず受け取れる。
  // ★一度きり。params から旗を落としてから走らせる（ctx.render() の再描画で二度出ない）
  if (ctx.state.params?.collect) {
    delete ctx.state.params.collect;
    collectDispatch(ctx).then(() => ctx.render()).catch((e) => console.error(e));
  }

  if (ctx.state.params?.intro) {
    root.appendChild(h('div', 'panel', [
      h('p', null, 'ふもとの祠で目を覚ました。'),
      h('p', 'small dim', '見上げると、月へ続くように塔が伸びている。まずは一階から登ってみよう。'),
    ]));
  }

  root.appendChild(statusBar(ctx));
  root.appendChild(partyPanel(ctx));

  // ── 塔へ入る ──
  root.appendChild(h('h2', 'sec-title', '塔'));
  root.appendChild(h('button', {
    class: 'btn btn--primary',
    onclick: () => showTowerPicker(ctx),
  }, [
    '塔へ入る',
    h('span', 'btn-sub', `本編 ${floorName(everMax(save))}まで到達`),
  ]));

  /**
   * ── 支度（2列・2026-08-16 オーナー指示） ──
   *
   * > 「スクロールを減らしたいから（略）祠画面とか、支度を2列にするのはどうかな？
   * >   説明文も行数を減らすように努めてください」
   * > 「庵で休むボタンも支度の一番上に入れよう」
   *
   * ★1マスの幅は390px端末で約175px。**添え書きは1行に収まる長さだけ**にすること。
   *   長い説明を残すと折り返して、2列にした意味（縦を詰める）がそのまま消える。
   *   目安は全角8〜10字。
   * ★添え書きは「読めば分かること」ではなく**いま変わっている数**だけを残した
   *   （未読の数・保有数・影の数・開いたマス）。動かない説明文は消してある。
   * ★ちょうど8つ＝4行に収まる。増やすときは偶数個を保つと隙間が出ない。
   */
  root.appendChild(h('h2', 'sec-title', '支度'));
  const grid = h('div', 'btn-grid');

  // 庵で休む（無料・回数無制限・spec §2-0）
  const hurt = H.needsRest(save);
  // 未読の場面が残っているか（更新前のセーブや、まとめて溜まったとき）
  const unread = St.pending(save, { at: 'home' }).length;
  grid.appendChild(h('button', {
    class: hurt || unread > 0 ? 'btn btn--primary' : 'btn',
    onclick: () => doRest(ctx),
  }, [
    // ★ふりがなは外した（2026-08-16）。2列だと「庵（いおり）で休む」が折り返す
    '庵で休む',
    h('span', 'btn-sub', unread > 0
      ? `未読の話 ${unread}つ`
      : (hurt ? 'HP・気が戻る' : 'いつでも何度でも')),
  ]));

  grid.appendChild(h('button', { class: 'btn', onclick: () => ctx.go('party', { tab: 'party' }) }, [
    '編成・作戦',
    h('span', 'btn-sub', `${(save.party.active || []).length}人で出発`),
  ]));
  grid.appendChild(h('button', { class: 'btn', onclick: () => ctx.go('party', { tab: 'equip' }) }, [
    '装備',
    // ★「持ち物」は道具・素材の画面の名前。装備の枚数には使わない（2026-08-16 オーナー指示）
    h('span', 'btn-sub', `保有数 ${(save.inv.equips || []).length}／${G.INV_MAX}`),
  ]));
  // ★鍛冶と錬気は別のタブに分かれた（2026-08-13）。入口は1つのままにして、
  //   向こうのタブ列で選ばせる（拠点のボタンを増やすと祠の画面のほうが伸びる）
  grid.appendChild(h('button', { class: 'btn', onclick: () => ctx.go('party', { tab: 'forge' }) }, [
    '鍛冶・錬気',
    h('span', 'btn-sub', '装備を鍛える'),
  ]));
  // ★店は「支度」に置く（2026-08-13 新設）。塔へ入る前に寄る場所なので、
  //   「その他」に落とすと存在に気づかれない
  grid.appendChild(h('button', { class: 'btn', onclick: () => ctx.go('shop', { tab: 'buy' }) }, [
    '露店',
    // ★装備の売り場はここだけになった（2026-08-16 に装備画面から「売る」を外した）ので、
    //   売れることが読み取れる言い方を残す
    h('span', 'btn-sub', '薬・不用品の売買'),
  ]));

  // ── 影送り（spec §7）。解放前は「何をすれば開くか」まで見せる ──
  if (D.isUnlocked(save)) {
    const shadows = D.pending(save, ctx.now());
    const ready = shadows.filter((d) => d.done).length;
    const held = D.heldCount(save);
    grid.appendChild(h('button', {
      class: ready > 0 || held > 0 ? 'btn btn--primary' : 'btn',
      onclick: () => ctx.go('dispatch'),
    }, [
      '影送り',
      h('span', 'btn-sub', ready > 0 ? `祠の文 ${ready}通`
        : (held > 0 ? `預かり ${held}点`
          : (shadows.length > 0 ? `影 ${shadows.length}／${D.slotCount(save)}人` : '影を塔へ送る'))),
    ]));
  } else {
    grid.appendChild(h('button', { class: 'btn', disabled: true }, [
      '影送り',
      h('span', 'btn-sub', `${D.UNLOCK_FLOOR - 1}階を越えると開く`),
    ]));
  }

  // ── 因果盤（spec §6-5） ──
  if (Bd.isUnlocked(save)) {
    const p = Bd.progressText(save);
    // ★「開けるマスが残っているか」まで見る。因果の残高だけで判定すると、
    //   全マス開けたあとも幻の価格を出してボタンが光り続ける（2026-08-03 レビュー指摘）
    const done = p.opened >= p.total;
    const canOpen = !done && (save.karma.have || 0) >= p.cost;
    grid.appendChild(h('button', {
      class: canOpen ? 'btn btn--primary' : 'btn',
      onclick: () => ctx.go('board'),
    }, [
      '因果盤',
      h('span', 'btn-sub', done ? 'すべて開いた' : `${p.opened}／${p.total}マス`),
    ]));
  } else {
    grid.appendChild(h('button', { class: 'btn', disabled: true }, [
      '因果盤',
      h('span', 'btn-sub', `${Bd.UNLOCK_FLOOR - 1}階を越えると開く`),
    ]));
  }

  /**
   * ★人物帳は支度の一覧の**一番下**（2026-08-14 オーナー指示
   *   「祠の支度の一覧だけど、人物帳を一番下にして」）。
   *   2列にした今も、並べる順は変えていないので最後のマス（右下）に来る。
   */
  grid.appendChild(h('button', { class: 'btn', onclick: () => ctx.go('chars') }, [
    '人物帳',
    h('span', 'btn-sub', '仲間のことを読む'),
  ]));
  root.appendChild(grid);

  // ── その他 ──
  root.appendChild(h('h2', 'sec-title', 'その他'));
  root.appendChild(h('div', 'btn-row', [
    h('button', { class: 'btn btn--sm', onclick: () => ctx.saveNow() }, '記録する'),
    h('button', { class: 'btn btn--sm', onclick: () => ctx.go('settings', { from: 'home' }) }, '設定'),
    // ★持ち物は「その他」ではなく上に置きたいところだが、拠点の一等地は
    //   塔と編成に譲る。ここに置いても、素材が見える場所ができたことのほうが効く
    h('button', { class: 'btn btn--sm', onclick: () => ctx.go('items') }, '持ち物'),
    h('button', { class: 'btn btn--sm', onclick: () => ctx.go('records') }, '戦歴'),
    // 読んだ話の読み返し（2026-08-10 オーナー要望）。未読は題も伏せて並べる
    h('button', { class: 'btn btn--sm', onclick: () => ctx.go('story') }, 'ストーリー'),
  ]));

  /**
   * ★「タイトルへ戻る」と「輪廻」は**同じ行**、タイトルが左（2026-08-16 オーナー指示
   *   「祠ページの『輪廻』と『タイトルへ戻る』は同じ行にして、タイトルへ戻るを左側に配置して」）。
   *   どちらも「この画面から出る」操作なので、まとめると1段ぶん縦が詰まる。
   * ★輪廻は `canRebirth` のときだけ出る（2026-08-14 オーナー指示でその他へ移した）。
   *   出ないときは「タイトルへ戻る」が1つで行いっぱいに伸びる（.btn-row の flex）。
   */
  root.appendChild(h('div', { class: 'btn-row', style: 'margin-top:10px' }, [
    h('button', {
      class: 'btn btn--sm',
      onclick: async () => {
        ctx.saveNow(true);
        if (await confirmBox('タイトルへ戻ります。ここまでの記録は保存済みです。', '戻る', 'やめる')) ctx.go('title');
      },
    }, 'タイトルへ戻る'),
    Rb.canRebirth(save)
      ? h('button', { class: 'btn btn--sm', onclick: () => showRebirth(ctx) }, '輪廻')
      : null,
  ]));

  return root;
}

// ── 状況バー ──────────────────────────────────────────────

function statusBar(ctx) {
  const save = ctx.save;
  const age = moonAge(ctx.now());
  const ph = moonPhase(age);
  return h('div', null, [
    h('div', 'statusbar', [
      h('span', 'statusbar__floor', '祠'),
      h('span', 'statusbar__akari', [
        h('span', 'dim', '銭 '), h('span', 'gold', zeni(save.inv.zeni || 0)),
        h('span', 'dim', '　因果 '), h('span', 'gold', n(save.karma.have || 0)),
      ]),
      h('span', 'statusbar__moon', `${PHASE_EMOJI[ph]} ${PHASE_NAMES[ph]}`),
    ]),
    // ★「あと◯日」は**現実の日数**。庵で休んでも進まないので、そうと分かるように書く
    //   （休むと変わると誤解される、というオーナー指摘への対応・2026-08-04）
    // ★2026-08-16、**1行に収める**ために「塔のようす: 」を外した（24字を超えると折り返す）。
    //   すぐ上の状況バーに月の絵と名前が出ているので、その下の1行が何の話かは読める。
    h('p', { class: 'small dim', style: 'margin:-4px 0 8px 2px' },
      `${PHASE_EFFECT[ph].desc}（実際の月であと${daysToNextPhase(age)}日）`),
  ]);
}

// ── パーティ状態 ──────────────────────────────────────────

function partyPanel(ctx) {
  const save = ctx.save;
  const rows = H.partyStatus(save, G.finalStats);
  const panel = h('div', 'panel');
  panel.appendChild(h('div', 'party', rows.map((s) => {
    const c = CHAR_BY_ID[s.id];
    const ail = Object.keys(s.ailments).filter((k) => s.ailments[k] > 0)
      .map((k) => AILMENTS[k]?.name).filter(Boolean).join('・');
    return h('div', 'party__row', [
      mon({ ...c, alive: true }, 'sm'),
      h('div', 'party__name', [c.name, h('div', 'list__sub', `Lv${s.lv}`)]),
      h('div', 'party__bars', [
        bar(s.hp, s.maxHp, 'hp', true),
        h('div', { style: 'height:3px' }),
        bar(s.ki, s.maxKi, 'ki', true),
      ]),
      h('div', 'party__num', [
        `${Math.round(s.hp)}/${s.maxHp}`,
        h('div', { class: ail ? 'warn' : '' }, ail || `気${Math.round(s.ki)}`),
      ]),
    ]);
  })));
  return panel;
}

// ── 庵で休む ──────────────────────────────────────────────

async function doRest(ctx) {
  const res = H.restAtIori(ctx.save, ctx.now());
  ctx.saveNow(true);

  /**
   * ★「一晩が明けた」とは言わない（2026-08-04 オーナー指摘）。
   *   月齢は**現実の月**で決まる（core/time.js）ので、庵で休んでも塔のようすは変わらない。
   *   「一晩明けた」と書くと、すぐ上に出ている「次の変化まであと◯日」と食い違って見える。
   *   ここでやっているのは休息だけなので、そう書く。
   */
  const lines = ['庵で腰を下ろし、しばらく休んだ。'];
  if (res.healed.length > 0) lines.push('傷も気も、すっかり元に戻っている。');
  else lines.push('息を整えた。');
  if (res.phaseChanged) {
    // 前に来たときから**現実の月**が変わっていたときだけ知らせる
    lines.push('');
    lines.push(`空を見ると、月は「${res.phaseChanged.name}」になっていた。`);
    lines.push(`塔のようす: ${res.phaseChanged.desc}`);
  }
  await alertBox(lines.join('\n'), '立ち上がる');

  // 一晩明けたら影送りの成果が届く（spec §2-0）。collect は冪等なので
  // 起動時の受け取りと重なっても二重にはならない
  await collectDispatch(ctx);

  // ★未読の場面が残っていれば、休んだあとに読ませる。
  //   拠点で待っている人（＝塔に入らない人）にも読み進める手段が要る。
  //   一度に読ませる本数は story.CATCHUP_MAX で絞ってあるので、ここで詰まらない
  toHome(ctx);
}

/**
 * 塔へ入る前のひと呼吸。
 *
 * HP・気は潜行のあいだ持ち越されるので（`home.storePartyState`）、
 * **傷ついたまま入って即全滅**という事故が構造的に起こる。庵はただで何度でも使えるのに、
 * 気づかずに入ってしまうのがもったいない。危ないときだけ訊く。
 */
async function enterTower(ctx, params) {
  const rows = H.partyStatus(ctx.save, G.finalStats);
  const hurt = rows.filter((r) => r.hp / Math.max(1, r.maxHp) < 0.5);
  if (hurt.length > 0) {
    const who = hurt.map((r) => `${CHAR_BY_ID[r.id]?.name || r.id}（${Math.round((r.hp / r.maxHp) * 100)}%）`).join('・');
    const ok = await confirmOnce(ctx, 'dive',
      `${who} が、傷を負ったままです。
庵で休めば、ただで全部治せます。

このまま塔へ入りますか。`,
      'このまま入る', 'やめる');
    if (!ok) return;
  }
  toExplore(ctx, params);
}

// ── 輪廻（周回） ──────────────────────────────────────────

/**
 * 何が残って何が消えるかを見せてから輪廻する。
 *
 * ★10時間の積み上げを1タップで作り直す操作なので、
 *   ①内容を全部見せる ②書き込みが成功してから画面上のセーブを差し替える
 *   ③直前のセーブをバックアップに退避する、の3つを必ず通す。
 */
function showRebirth(ctx) {
  customModal(({ close }) => {
    const save = ctx.save;
    const p = Rb.preview(save);
    const txt = document.getElementById('modalText');
    const btns = document.getElementById('modalBtns');
    txt.textContent = '';

    // ★「◯周目」は輪廻した回数+1（初回は rebirth=0 で1周目）
    const laps = (save.progress.rebirth || 0) + 1;
    const li = (k, v) => h('div', 'kv', [h('span', 'kv__k', k), h('span', 'kv__v', v)]);
    txt.appendChild(h('div', null, [
      h('h3', { class: 'sec-title', style: 'margin-top:0' },
        laps > 1 ? `輪廻（いま${laps}周目）` : '輪廻'),
      h('p', null, 'はじめから登り直します。塔は前より手ごわくなり、拾える物も増えます。'),
      h('p', 'small dim', '因果盤・因果・仲間・図鑑と、装備を3つ持っていけます。'),
      h('h3', 'sec-title', '持っていくもの'),
      h('div', 'panel', [
        li('因果', n(p.keep.karma)),
        li('因果盤', `${p.keep.board}マス`),
        li('仲間', p.keep.chars.join('・') || '（なし）'),
        li('錬気', `合計 ${p.keep.renki}`),
        li('図鑑', `${p.keep.dex}件`),
        li('装備', p.keep.equips.length > 0
          ? p.keep.equips.map((e) => e.name).join('／')
          : '（まだ持っていません）'),
      ]),
      h('h3', 'sec-title', '置いていくもの'),
      h('div', 'panel', [
        li('レベル', `${p.lose.lv} → 1`),
        li('ほかの装備', `${p.lose.equips}点`),
        li('銭', zeni(p.lose.zeni)),
        li('素材', `${p.lose.mats}個`),
      ]),
      h('h3', 'sec-title', `${p.next.lap}周目からの塔`),
      h('div', 'panel', [
        li('敵の強さ', `×${p.next.enemyMul.toFixed(2)}`),
        li('もらえる物', `×${p.next.rewardMul.toFixed(2)}`),
        li('レベルの上限', `${p.next.lvCap}`),
        li('錬気の上限', `${p.next.renkiMax}`),
      ]),
      h('p', 'small dim', '読んだ話は読んだままです（もう一度は出ません）。印もそのまま残るので、好きな階から入れます。'),
      h('p', 'small warn', '輪廻する直前の記録は別に取っておきます（タイトル画面の「セーブの持ち出し・取り込み」から戻せます）。'),
      // ★問いかけを最後に置く（2026-08-14 オーナー指示）。
      //   説明を読み終えた位置に置かないと、何に答えているのか分からない
      h('p', { class: 'gold', style: 'margin-top:12px' }, 'もう一度めぐりますか？'),
    ]));

    btns.replaceChildren(
      h('button', { class: 'btn', onclick: close }, 'やめる'),
      h('button', {
        class: 'btn btn--primary',
        onclick: async () => { close(); await doRebirth(ctx); },
      }, 'もう一度めぐる'),
    );
    document.getElementById('modal').hidden = false;
  });
}

async function doRebirth(ctx) {
  if (!await confirmBox('本当に輪廻しますか。\nレベルと持ち物は戻せません。', 'めぐる', 'やめる')) return;

  const next = Rb.rebirth(ctx.save);
  if (!next) { await alertBox('いまは輪廻できません。'); return; }

  // ★書き込みが成功してから画面上のセーブを差し替える。
  //   先に差し替えると、失敗したときに「消えたのに保存もされていない」状態になる
  const backedUp = ctx.backupSave();
  const r = ctx.replaceSave(next);
  if (!r.ok) {
    await alertBox('記録の書き込みに失敗しました。輪廻は取りやめます。\nこれまでの記録はそのままです。');
    return;
  }
  await alertBox(
    `${next.progress.rebirth + 1}周目がはじまった。\n\n`
    + '見上げると、塔はまた一階から続いている。\n'
    + '手のなかに残っているものだけが、前の周の証だ。'
    + (backedUp ? '\n\n（輪廻する前の記録は、タイトル画面の「セーブの持ち出し・取り込み」から戻せます）' : ''),
    'はじめる',
  );
  // 未読の場面が残っていれば拾わせる（拠点へ入る経路は必ず story_flow を通す）
  toHome(ctx);
}

// ── 塔・階の選択 ──────────────────────────────────────────

function showTowerPicker(ctx) {
  customModal(({ close }) => buildTowerPicker(ctx, close));
}

function buildTowerPicker(ctx, close) {
  const save = ctx.save;
  const txt = document.getElementById('modalText');
  const btns = document.getElementById('modalBtns');

  const towers = availableTowers(save);
  txt.textContent = '';
  const list = h('div', 'list');

  for (const t of towers) {
    const def = TOWERS[t.id];
    // ★ availableTowers() が everMax で計算済みの値を使う（ここで再計算しない）。
    //   maxFloor から作り直していたため、輪廻すると「1階まで到達」に戻っていた
    const reached = t.reached;
    // ★未解放の塔も灰色で見せる。影送り・因果盤と同じ扱いに揃えた（2026-08-03）
    if (t.locked) {
      list.appendChild(h('div', 'list__item is-locked', [
        h('div', 'list__main', [
          h('div', 'dim', `${def.name}（まだ入れません）`),
          h('div', 'list__sub', t.hint || def.desc),
        ]),
        h('div', 'list__right dim', '—'),
      ]));
      continue;
    }
    // 支塔は階数が1〜10しかないので、「本編の何階ぐらいの手ごたえか」を添える。
    // これが無いと、10階しかない塔がやさしそうに見えて実際は本編34階相当という食い違いになる
    const pf = def.kind === 'side'
      ? `　手ごたえは本編 ${powerFloorOf(t.id, 1)}〜${powerFloorOf(t.id, def.floors)}階ぐらい`
      : '';
    list.appendChild(h('button', {
      class: 'list__item',
      onclick: () => { close(); showFloorPicker(ctx, t.id); },
    }, [
      h('div', 'list__main', [
        h('div', 'gold', def.name + (t.cleared ? '（踏破済み）' : '')),
        h('div', 'list__sub', def.desc + pf),
      ]),
      h('div', 'list__right', reached > 0 ? floorName(reached, t.id) : '未踏'),
    ]));
  }

  txt.appendChild(h('div', null, [h('p', null, 'どの塔へ入りますか'), h('div', { style: 'margin-top:10px' }, list)]));
  btns.replaceChildren(h('button', { class: 'btn', onclick: close }, 'やめる'));
  document.getElementById('modal').hidden = false;
}

function showFloorPicker(ctx, towerId) {
  customModal(({ close }) => buildFloorPicker(ctx, towerId, close));
}

function buildFloorPicker(ctx, towerId, close) {
  const save = ctx.save;
  const def = TOWERS[towerId];
  const txt = document.getElementById('modalText');
  const btns = document.getElementById('modalBtns');

  // ★印（登録点）は輪廻しても残る。今の周の到達（maxFloor）で作ると、
  //   輪廻した瞬間に選べる階が1階だけになる（確認画面の説明と食い違う）
  const reached = towerId === 'main' ? everMax(save) : (save.progress.towerMax?.[towerId] || 0);
  const markEvery = def.kind === 'story' ? (def.markEvery || 5) : 10;
  /**
   * 印（還り札の登録点）まで直接向かえる。到達済みの範囲だけ。
   *
   * ★以前は `Math.min(reached, def.floors)` で **60階に丸めていた**ので、
   *   地下5階まで進んでいても入口は60階までしか出なかった
   *   （＝地下へ行くたびに60階のボスから登り直し）。
   *   2026-08-13 オーナー指示で「最奥に入る」を足したので、ここで丸めていると
   *   **一番進んでいる階に入れない**＝ボタンの名前と動きが食い違う。
   *   入れるかどうかの判断は `canEnter`（クリア前は地下に入れない）が持っている。
   */
  const floors = H.entryFloors(Math.max(1, reached), markEvery)
    .filter((f) => canEnter(save, towerId, f));

  txt.textContent = '';
  const list = h('div', 'list');
  for (const f of floors) {
    const boss = isBossFloor(towerId, f);
    // ★塔ごとのボス表から引くこと。BOSSES[f] を直に引くと、支塔10階に
    //   本編10階の「朽ちた門番」と表示される（実際に出る敵と食い違う）
    const bd = boss ? bossDefOf(towerId, f) : null;
    list.appendChild(h('button', {
      class: 'list__item',
      onclick: async () => { close(); await enterTower(ctx, { tower: towerId, floor: f }); },
    }, [
      // ★添え字（「○階の印まで進む」）は出さない（2026-08-13 オーナー指摘「縦に長すぎる」）。
      //   階の数だけ行が増える一覧なので、1件2行だと13階ぶんで26行になる。
      //   同じことを言い直しているだけの行なので、消しても分からなくならない
      h('div', 'list__main', floorName(f, towerId) + (f === 1 ? '　（入口）' : '')),
      // ★ボス名だけ。「写し身」は**ここには出さない**（2026-08-13 オーナー指示
      //   「塔選択で、ボスの下に『写し身』という文字は不要なので削除して」）。
      //   一度倒したかどうかは図鑑と戦闘画面の敵名で分かるので、ここで重ねない
      bd ? h('div', 'list__right warn', `ボス: ${bd.name}`) : h('div', 'list__right dim', ''),
    ]));
  }

  // 支塔は「1階から通したときだけ踏破の品が出る」。近道を選ぶ前に知らせる
  const note = def.kind === 'side'
    ? '踏破の品は、1階から通しで登りきったときだけ出ます。'
    : '一度たどりついた「印」までは、いつでも直接向かえます。';
  txt.appendChild(h('div', null, [
    h('p', null, `${def.name}｜どこから始めますか`),
    h('p', 'small dim', note),
    h('div', { style: 'margin-top:10px' }, list),
  ]));
  /**
   * ★ボタンは「戻る」と「いちばん奥へ」の2つ（2026-08-13 オーナー指示）。
   *
   * > 「『やめる』『選びなおす』にしているが、どちらも同じような選択肢なので、
   * >   『やめる』を押すと、塔選択画面に入り、『選びなおす』は『最奥に入る』とし、
   * >   一番進んでいる階の印から入るようにしましょう」
   *
   * 以前は「やめる（閉じる）」と「塔を選び直す」で、**どちらも“先へ進まない”選択肢**だった。
   * 塔選択へ戻る道は1つで足りるので、空いた枠を「いちばん奥から始める」に使う。
   * 毎回いちばん下までスクロールして最深の印を押していた操作が、1タップで済む。
   */
  const deepest = floors[floors.length - 1] || 1;
  btns.replaceChildren(
    h('button', { class: 'btn', onclick: () => { close(); showTowerPicker(ctx); } }, 'やめる'),
    h('button', {
      class: 'btn btn--primary',
      onclick: async () => { close(); await enterTower(ctx, { tower: towerId, floor: deepest }); },
      // ★階の名前は**2行目**に置く（2026-08-13 オーナー指摘
      //   「文章が変なところで切れている」）。1行に続けて書くと、狭い画面では
      //   「最奥に入る（地下5」／「階）」のように**括弧の途中で**折り返す。
      //   `.btn-sub` は block なので、必ず行が変わる位置で切れる
    }, ['最奥に入る', h('span', 'btn-sub', floorName(deepest, towerId))]),
  );
  document.getElementById('modal').hidden = false;
}

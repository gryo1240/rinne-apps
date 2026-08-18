/**
 * 影送り（派遣）画面（spec §7）
 *
 * 【この画面の役割】「寝ているあいだも進んでいる」を、起動した瞬間に実感させること。
 * そのため **受け取り（祠の文）を画面のいちばん上**に置き、送り出しはその下にする。
 *
 * 送り出しは 仲間 → 行き先 → 時間 の3段。段ごとに
 * **見込みの収穫と「負傷しそうか」を先に見せる**（送ってから2時間後に「負傷」と
 * 言われても、プレイヤーには何が悪かったのか分からないため）。
 */

import { h, mon, clear, swapInto, alertBox, confirmBox, toast, n, zeni } from './dom.js';
import { confirmOnce } from './confirm.js';
import { CHAR_BY_ID } from '../../data/chars.js';
import { collectDispatch } from './dispatch_flow.js';
import * as D from '../meta/dispatch.js';
import * as G from '../meta/growth.js';
import * as R from '../core/rules.js';
import { floorName } from '../dungeon/towers.js';

export function render(ctx) {
  const save = ctx.save;
  const root = h('div');
  root.appendChild(h('h1', 'screen-title', '影送り'));

  // ★どの分岐にも必ず戻る手段を置く（README 実バグ #9 の再発防止）
  if (!save) {
    root.appendChild(h('div', 'panel', '記録が読み込まれていません。'));
    root.appendChild(h('button', {
      class: 'btn btn--primary', style: 'margin-top:14px', onclick: () => ctx.go('title'),
    }, 'タイトルへ戻る'));
    return root;
  }

  if (!D.isUnlocked(save)) {
    root.appendChild(h('div', 'panel', [
      h('p', null, 'まだ影を切り離すことはできない。'),
      h('p', 'small dim', `塔の${D.UNLOCK_FLOOR - 1}階を越えると、祠で影を送り出せるようになります。`),
    ]));
    root.appendChild(backBtn(ctx));
    return root;
  }

  root.appendChild(h('p', 'small dim',
    '控えの仲間の「影」を塔へ送ります。影は、あなたが遊んでいない間も歩き続けます。'));

  // ── 受け取り ──
  const ready = D.pending(save, ctx.now()).filter((d) => d.done);
  const held = D.heldCount(save);
  if (ready.length > 0 || held > 0) {
    root.appendChild(h('button', {
      class: 'btn btn--primary',
      onclick: () => doCollect(ctx),
    }, [
      ready.length > 0 ? `祠の文がとどいている（${ready.length}通）` : `祠が預かっている拾い物（${held}点）`,
      h('span', 'btn-sub', ready.length > 0
        ? '戻った影から、拾ってきたものを受け取ります。'
        : '持ち物に空きがあれば受け取れます。'),
    ]));
  }

  // ── いま送っている影 ──
  root.appendChild(h('h2', 'sec-title', `送っている影（${D.pending(save, ctx.now()).length}／${D.slotCount(save)}）`));
  root.appendChild(pendingPanel(ctx));

  // ── 送り出す ──
  const used = D.pending(save, ctx.now()).length;
  const free = D.slotCount(save) - used;
  root.appendChild(h('h2', 'sec-title', '送り出す'));
  if (free <= 0) {
    const next = D.nextSlotFloor(save);
    const how = ready.length > 0
      ? '上の「祠の文」を受け取ると枠が空きます。'          // ← 正しい次の一手を先に出す
      : '戻ってくるのを待つか、呼び戻すと空きます。';
    root.appendChild(h('div', 'panel small dim',
      `枠がふさがっています。${how}${next ? `\n${next}階まで登ると、送れる影がもう一つ増えます。` : ''}`));
  } else {
    root.appendChild(sendPanel(ctx));
  }

  root.appendChild(backBtn(ctx));
  return root;
}

function backBtn(ctx) {
  return h('button', {
    class: 'btn btn--sm btn--inline',
    style: 'margin-top:14px',
    onclick: () => ctx.go('home'),
  }, '祠へ戻る');
}

// ── 送っている影の一覧 ────────────────────────────────────

function pendingPanel(ctx) {
  const save = ctx.save;
  const rows = D.pending(save, ctx.now());
  const panel = h('div', 'panel');
  if (rows.length === 0) {
    panel.appendChild(h('p', 'small dim', 'いま送っている影はいません。'));
    return panel;
  }
  const list = h('div', 'list');
  for (const d of rows) {
    const c = CHAR_BY_ID[d.charId];
    const where = d.destId === D.YOMICHI ? '夜道' : floorName(d.floor);
    list.appendChild(h('div', 'list__item', [
      mon({ ...c, alive: true }, 'sm'),
      h('div', 'list__main', [
        h('div', null, `${c.name}の影`),
        h('div', 'list__sub', `${where}へ ${d.hours}時間`),
      ]),
      h('div', 'list__right', d.done
        ? h('span', 'gold', '戻っている')
        : h('span', 'dim', `あと${leftLabel(d.leftMs)}`)),
      h('button', {
        class: 'btn btn--sm',
        style: 'margin-left:8px',
        onclick: () => doRecall(ctx, d.charId, d.done),
      }, d.done ? '受け取る' : '呼び戻す'),
    ]));
  }
  panel.appendChild(list);
  return panel;
}

function leftLabel(ms) {
  const m = Math.ceil(ms / 60000);
  if (m >= 60) return `${Math.floor(m / 60)}時間${m % 60}分`;
  return `${m}分`;
}

async function doRecall(ctx, charId, done) {
  if (done) { await doCollect(ctx); return; }
  const name = CHAR_BY_ID[charId]?.name || '影';
  // 添えた露は返る（`D.recall` が戻す）。黙って返しても気づかないので先に言う
  const withDew = D.pending(ctx.save, ctx.now()).some((d) => d.charId === charId && d.ariake);
  const ok = await confirmBox(
    `${name}の影を呼び戻します。\nまだ道の途中なので、拾ったものは何も持ち帰れません。`
    + (withDew ? `\n添えた${D.ARIAKE_NAME}は返ります。` : ''),
    '呼び戻す', 'やめる');
  if (!ok) return;
  D.recall(ctx.save, charId);
  ctx.saveNow(true);
  // 送るときに出撃メンバーから外しているので、戻しても自動では入らない。
  // 黙っていると「呼び戻したのに塔へ連れて行けない」と見える
  toast(`${name}の影が戻った（連れて行くには編成で選び直します）`, 3200);
  ctx.render();
}

// ── 受け取り（祠の文） ────────────────────────────────────

async function doCollect(ctx) {
  await collectDispatch(ctx);
  ctx.render();
}

// ── 送り出す ──────────────────────────────────────────────

/**
 * 送り出しのパネル。
 *
 * ★選択のたびに `ctx.render()` を呼んではいけない。
 *   `app.render()` は毎回スクロール位置を先頭へ戻すので、この画面のように
 *   縦に長い（送り出すボタンが1画面目に入らない）画面では、
 *   「行き先を押す → 最上部へ飛ぶ → 700pxスクロールし直す」を選択の数だけ
 *   繰り返させることになる（2026-08-03 レビュー指摘）。
 *   ここではパネルの中身だけを差し替える。
 */
function sendPanel(ctx) {
  const panel = h('div', 'panel');

  // 画面内の選択状態。ctx.state に置くと画面を出入りしても残る
  const sel = ctx.state.dispatchSel || (ctx.state.dispatchSel = { charId: null, destId: null, hours: 8, ariake: false });

  const refresh = () => { clear(panel); build(); };

  // 「見込み」だけを差し替えるための枠。つまみを掴んだまま更新できるようにする
  let previewHost = null;
  let syncPreview = () => {};
  // 送り出しボタンも、相手を選び直したら中身だけ差し替える（作り直さない）
  let sendHost = null;
  let syncSend = () => {};

  function build() {
    const save = ctx.save;
    const people = D.sendable(save, ctx.now()).filter((p) => p.id !== 'hero');
    const dests = D.destinations(save, ctx.now());
    previewHost = h('div');
    syncPreview = () => swapInto(previewHost, (r) => {
      const note = dests.find((d) => d.id === sel.destId)?.note;
      if (note) r.appendChild(h('p', 'small dim', note));
      r.appendChild(previewBox(ctx, sel, dests));
    });

    // 既定値の補正（前回選んだ相手がもう送れない、など）
    if (!people.some((p) => p.id === sel.charId && p.ok)) sel.charId = (people.find((p) => p.ok) || {}).id || null;
    if (!dests.some((d) => d.id === sel.destId)) sel.destId = defaultDest(save, sel.charId, dests);

    if (people.length === 0) {
      panel.appendChild(h('p', 'small dim', '送り出せる仲間がまだいません。'));
      return;
    }

    // 1) 誰を
    //
    // ★相手を選び直しても**パネルを作り直さない**（2026-08-12 オーナー指摘
    //   「キャラを変えたときにページが上に遷移しないようにしてほしい」）。
    //   `clear(panel)` で一度空にすると、縦に長いこの画面では**文書がその瞬間だけ短くなり**、
    //   ブラウザがスクロール位置を「新しい最大値」まで巻き戻す。
    //   組み直しても位置は戻らないので、選ぶたびに上へ飛んだように見える。
    //   → 変えるのは「選択中の印」「見込み」「送り出すボタン」の3つだけにする。
    // ★行き先・時間は**引き継ぐ**（同オーナー指示「キャラ毎に影送りの階や時間の設定を統一」）。
    //   以前はここで `defaultDest()` を引き直していたので、
    //   40階に合わせてから相手を変えると、黙って浅い階に戻されていた。
    // ★2列に並べる（2026-08-16 オーナー指摘「キャラを2列にすれば縦を抑えられる」）。
    //   仲間が7人まで増えるので、1列だと相手を選ぶだけで1画面ぶんスクロールしていた。
    panel.appendChild(h('div', 'small dim', '誰の影を送りますか'));
    const pList = h('div', 'list list--2col');
    const charBtns = new Map();
    for (const p of people) {
      const c = CHAR_BY_ID[p.id];
      const btn = h('button', {
        class: `list__item${sel.charId === p.id ? ' list__item--on' : ''}`,
        disabled: !p.ok,
        onclick: () => {
          sel.charId = p.id;
          for (const [id, b2] of charBtns) b2.classList.toggle('list__item--on', id === sel.charId);
          syncPreview();
          syncSend();
        },
      }, [
        mon({ ...c, alive: true }, 'sm'),
        // ★2列にすると1人ぶんの幅が半分になるので、「出撃中」を右端の列で持てない。
        //   名前のうしろに小さく添える（送ると出撃メンバーから外れるので、消してはいけない情報）
        h('div', 'list__main', [
          h('div', null, [c.name, p.inParty ? h('span', 'small dim', '　出撃中') : null]),
          h('div', 'list__sub', p.ok ? `Lv${p.lv}　探査力${p.scout}` : (p.message || '送れません')),
        ]),
      ]);
      charBtns.set(p.id, btn);
      pList.appendChild(btn);
    }
    panel.appendChild(pList);

    // 2) どこへ（つまみで選ぶ・2026-08-11 オーナー要望）
    //    ★行き先は5階刻み＋最深部なので、到達40階では9個のボタンが3行に折り返していた。
    //      深く登るほどボタンが増え続ける作りなので、つまみに置き換える。
    //    ★「夜道」だけは別のボタンにする。二十六夜のあいだしか現れない特別な道で、
    //      階の並びに混ぜると「つまみを右端まで動かしたら夜道になった」という
    //      意図しない選び方になる（しかも月が変われば黙って消える）。
    const floors = dests.filter((d) => d.id !== D.YOMICHI);
    const yomichi = dests.find((d) => d.id === D.YOMICHI);
    panel.appendChild(h('div', { class: 'small dim', style: 'margin-top:12px' }, 'どこへ送りますか'));

    if (sel.destId === D.YOMICHI && yomichi) {
      panel.appendChild(h('div', 'kv', [
        h('span', { class: 'kv__k gold' }, '夜道'),
        h('button', {
          class: 'btn btn--sm', type: 'button',
          onclick: () => { sel.destId = floors[floors.length - 1]?.id || null; refresh(); },
        }, '階を選ぶ'),
      ]));
    } else {
      const idx = Math.max(0, floors.findIndex((d) => d.id === sel.destId));
      const label = h('span', { class: 'kv__k gold' }, floors[idx]?.name || '—');
      const fSlider = h('input', {
        type: 'range', class: 'renki__range',
        min: '0', max: String(Math.max(0, floors.length - 1)), value: String(idx), step: '1',
        'aria-label': '送り先の階',
      });
      // ★つまみを動かしている最中に **パネルごと差し替えてはいけない**。
      //   掴んでいるつまみのDOMが消えて、指が離れてしまう。
      //   更新するのは「見込み」の枠だけにする（因果盤・錬気と同じ swapInto）。
      fSlider.addEventListener('input', () => {
        const d = floors[Number(fSlider.value) || 0];
        if (!d) return;
        sel.destId = d.id;
        label.textContent = d.name;
        syncPreview();
      });
      panel.appendChild(h('div', { class: 'kv', style: 'align-items:center' }, [
        label,
        yomichi ? h('button', {
          class: 'btn btn--sm', type: 'button',
          onclick: () => { sel.destId = D.YOMICHI; refresh(); },
        }, '夜道へ') : null,
      ]));
      // ★行き先が1つしかないうちは、つまみを出さない。
      //   min も max も 0 のつまみは動かないので、触れるのに何も起きない部品になる
      //   （まだ5階までしか登っていない人が最初に見る画面なので、ここは特に効く）
      if (floors.length > 1) panel.appendChild(fSlider);
      else panel.appendChild(h('p', 'small dim', 'もっと深くまで登ると、送り先を選べるようになります。'));
    }

    // 3) どれだけ（つまみで選ぶ）
    panel.appendChild(h('div', { class: 'small dim', style: 'margin-top:12px' }, 'どれだけ送りますか'));
    const hIdx = Math.max(0, R.DISPATCH_HOURS.indexOf(sel.hours));
    const hLabel = h('span', { class: 'kv__k gold' }, `${R.DISPATCH_HOURS[hIdx]}時間`);
    const hSlider = h('input', {
      type: 'range', class: 'renki__range',
      min: '0', max: String(R.DISPATCH_HOURS.length - 1), value: String(hIdx), step: '1',
      'aria-label': '送り出す時間',
    });
    hSlider.addEventListener('input', () => {
      const hr = R.DISPATCH_HOURS[Number(hSlider.value) || 0];
      if (hr == null) return;
      sel.hours = hr;
      hLabel.textContent = `${hr}時間`;
      syncPreview();
    });
    panel.appendChild(h('div', { class: 'kv', style: 'align-items:center' }, [hLabel]));
    panel.appendChild(hSlider);

    /**
     * 4) 有明の露を添えるか（2026-08-12 オーナー指示「使い道を作っておいて」）。
     *
     * ★手持ちが0のときは**行ごと出さない**。押せない切り替えが常に居座ると、
     *   「何かやり残している」ように見えるだけで、露の入手先（二十六夜）へも導けない。
     *   代わりに、深すぎて負傷する見込みのときだけ一言で入手先を示す（下の previewBox）。
     */
    const ariakeHave = D.ariakeCount(save);
    if (ariakeHave <= 0) sel.ariake = false;
    if (ariakeHave > 0) {
      const aBtn = h('button', {
        class: `btn btn--sm${sel.ariake ? ' btn--primary' : ''}`,
        type: 'button', style: 'margin-top:12px',
        onclick: () => {
          sel.ariake = !sel.ariake;
          aBtn.className = `btn btn--sm${sel.ariake ? ' btn--primary' : ''}`;
          aBtn.replaceChildren(...ariakeLabel(sel.ariake, ariakeHave));
          syncPreview();
        },
      }, ariakeLabel(sel.ariake, ariakeHave));
      panel.appendChild(aBtn);
    }

    // 見込み（つまみを動かすと、この枠だけが引き直される）
    panel.appendChild(previewHost);
    syncPreview();

    sendHost = h('div', { style: 'margin-top:12px' });
    syncSend = () => swapInto(sendHost, (r) => {
      const chk = sel.charId ? D.canSend(save, sel.charId, ctx.now()) : { ok: false, message: '仲間を選んでください。' };
      r.appendChild(h('button', {
        class: 'btn btn--primary',
        disabled: !chk.ok,
        onclick: () => doSend(ctx, sel),
      }, chk.ok ? '影を送り出す' : (chk.message || '送れません')));
    });
    panel.appendChild(sendHost);
    syncSend();
  }

  build();
  return panel;
}

/**
 * 既定の行き先。**負傷しない範囲でいちばん深い階**を選ぶ。
 * 最深部を既定にすると、多くの場合いきなり負傷する（実機で確認: 鈴Lv25 → 40階で成功度0.57）。
 * 既定のまま送って毎回痛い目を見る作りは、仕組みを理解する前に嫌われる。
 */
function defaultDest(save, charId, dests) {
  if (!dests.length) return null;
  if (!charId) return dests[dests.length - 1].id;
  const scout = D.scoutOf(save, charId);
  let best = dests[0];
  for (const d of dests) {
    if (d.id === D.YOMICHI) continue;                 // 夜道は自分で選ぶもの
    if (D.successOf(scout, d.floor) >= 1.0) best = d;
  }
  return best.id;
}

/**
 * 見込みの収穫。**実際の収穫と同じ `harvestOf` を通す**ので、
 * ここに書いた数字と受け取る数字が食い違うことがない。
 */
function previewBox(ctx, sel, dests) {
  const save = ctx.save;
  const box = h('div', { class: 'panel', style: 'margin-top:12px' });
  if (!sel.charId) { box.appendChild(h('p', 'small dim', '仲間を選ぶと、見込みが出ます。')); return box; }

  const dest = dests.find((d) => d.id === sel.destId) || dests[dests.length - 1];
  const entry = {
    charId: sel.charId, destId: dest.id, floor: dest.floor, hours: sel.hours,
    startedAt: D.effNow(save, ctx.now()), scout: D.scoutOf(save, sel.charId),
    ariake: !!sel.ariake,
  };
  const hv = D.harvestOf(save, entry);

  box.appendChild(h('div', 'small dim', '見込み'));
  const got = [`経験 ${n(hv.exp)}`, `銭 ${zeni(hv.zeni)}`];
  for (const [k, v] of Object.entries(hv.mats)) if (v > 0) got.push(`${G.MAT_NAME[k] || k} ×${n(v)}`);
  box.appendChild(h('p', null, got.join('　')));

  // ★成功率（2026-08-11 オーナー指示）。
  //   以前は「探査力 120 ／ 40階の要求 44（成功度 1.35）」と内部の数字をそのまま
  //   並べていて、何と何を見比べればいいのか分からなかった。
  //   内部の「成功度」は 0.3〜1.5 の**収穫の倍率**なので、100%で頭打ちにして出す。
  //   1.0 を超えるぶん（余裕で歩けるときの上振れ）は上の「見込み」の数字に
  //   もう乗っているので、ここで二重に見せる必要はない。
  const rate = Math.min(100, Math.round(hv.success * 100));
  box.appendChild(h('p', hv.injured ? 'warn' : null, [
    '成功率 ',
    h('span', hv.injured ? null : 'gold', `${rate}%`),
    h('span', 'small dim', `　${successNote(hv)}`),
  ]));
  box.appendChild(h('p', 'small dim',
    `装備の拾い物 ${Math.round(hv.dropRate * 100)}%`));

  if (hv.injured) {
    box.appendChild(h('p', 'warn',
      `この深さは荷が勝ちます。収穫は半分、戻ったあと${D.COOLDOWN_HOURS}時間は送り出せません。`));
  }
  if (hv.ariake) {
    box.appendChild(h('p', 'small dim',
      `${D.ARIAKE_NAME}を1つ添えます（成功率が100%になり、負傷しません）。`
      + 'そのぶん、この道で採れる月の素材は手に入りません。'));
  } else if (rate < 100) {
    box.appendChild(h('p', 'small dim',
      D.ariakeCount(save) > 0
        ? `装備を持たせるか、浅い階を選ぶと成功率が上がります。${D.ARIAKE_NAME}を添えても100%になります。`
        : `装備を持たせるか、浅い階を選ぶと成功率が上がります。二十六夜に採れる「${D.ARIAKE_NAME}」を添えても100%になります。`));
  }
  return box;
}

/** 「有明の露を添える」ボタンの中身。押すたびに入れ替える */
function ariakeLabel(on, have) {
  return [
    on ? `${D.ARIAKE_NAME}を添える（残り${have}）` : `${D.ARIAKE_NAME}を添えない（手持ち${have}）`,
    h('span', 'btn-sub', on
      ? '成功率が100%になり、負傷しません（月の素材は採れません）。'
      : '1つ添えると、成功率が100%になり、負傷しません。'),
  ];
}

/** 成功率に添えるひとこと。数字だけだと「何%なら送っていいのか」が分からない */
function successNote(hv) {
  if (hv.injured) return '負傷します';
  if (hv.success < 0.85) return '手こずって、持ち帰りが減ります';
  if (hv.success < 1.0) return 'だいたい歩けます';
  return '危なげなく歩けます';
}

async function doSend(ctx, sel) {
  const dests = D.destinations(ctx.save, ctx.now());
  const dest = dests.find((d) => d.id === sel.destId) || dests[dests.length - 1];
  const name = CHAR_BY_ID[sel.charId]?.name || '影';

  const inParty = (ctx.save.party?.active || []).includes(sel.charId);
  const warn = inParty ? `\n${name}は出撃メンバーから外れます（送っている間は連れて行けません）。` : '';
  // ★露は戻せない資源なので、確認の文に必ず出す（`confirmOnce` は
  //   「次から聞かない」を選べるが、そのときも文面は同じものが記録に残る）
  const dew = sel.ariake ? `
${D.ARIAKE_NAME}を1つ使います（成功率100%・負傷なし）。` : '';
  const ok = await confirmOnce(ctx, 'dispatch',
    `${name}の影を ${dest.name} へ ${sel.hours}時間 送り出します。${dew}${warn}`, '送り出す', 'やめる');
  if (!ok) return;

  const r = D.send(ctx.save, sel.charId,
    { destId: dest.id, floor: dest.floor, hours: sel.hours, ariake: !!sel.ariake }, ctx.now());
  if (!r.ok) { await alertBox(r.message || '送り出せませんでした。'); ctx.render(); return; }
  ctx.saveNow(true);
  toast(`${name}の影を送り出した`);
  ctx.render();
}

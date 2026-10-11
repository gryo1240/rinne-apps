/**
 * 影闘（かげとう）の画面（2026-10-11 オーナー指示「他人とのバトルを追加」）
 *
 * 【この画面でやること】
 *  1. 自分の「戦える仲間（最大4人）」と戦力を見せる
 *  2. 自分の影を**預けるかどうか**を本人に選ばせる（初回は必ず説明してから）
 *  3. 他の人の影（最新の編成）を3人まで並べ、選んだ相手と戦わせる
 *     「調整戦」（出撃する仲間の最高Lvが±5）と「無差別戦」を切り替えられる（2026-10-11 オーナー指示）
 *  4. 戦いのあとは結果と褒美（影鋼・写し装備・段位）を見せる
 *
 * ルール・数値は `meta/arena.js`、通信は `net/api.js`。ここは並べて押させるだけ。
 * ★相手の名前は**他人が書いた文字列**。必ず textContent（`h()` の文字列子要素）で出し、
 *   innerHTML に入れない。
 */

import { h, mon, toast, alertBox, confirmBox, helpBtn, n } from './dom.js';
import * as A from '../meta/arena.js';
import * as Net from '../net/api.js';
import { CHAR_BY_ID } from '../../data/chars.js';
import { floorName } from '../dungeon/towers.js';
import { KAGE_MAT, MAT_NAME } from '../meta/growth.js';

/** 相手の一覧を取り直す間隔（戦うたびに通信しない） */
const CACHE_MS = 60_000;
/** 自分の影を送り直す最短の間隔（ルール v3 の30秒より少し長く） */
const SYNC_MIN_MS = 35_000;

/** 端末の暦で「今日」（塔の写しと無差別戦の並びが日替わり。褒美の回数は24時間の窓で数える） */
export function dayKey(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * 自分の影を送る（同意している人だけ・中身が変わったときだけ）。
 * 拠点に戻ったとき（screen_home）と、この画面を開いたときに呼ぶ。
 * ★セーブ（saveNow）には混ぜない。saveNow はタブを閉じる瞬間にも呼ばれるので、
 *   そこで通信すると途中で切られる（advisor 指摘 2026-10-11）
 * ★待たない・失敗を言わない。影闘は本編の外にある
 */
let syncing = false;
export async function syncGhost(ctx, { force = false } = {}) {
  try {
    const save = ctx.save;
    const st = Net.loadNet();
    if (!save || !st.consent || syncing || !A.isUnlocked(save)) return;
    const snap = A.snapshotOf(save, st.pubName || save.name);
    if (!snap) return;
    const hash = JSON.stringify(snap);
    const now = ctx.now();
    if (!force && hash === st.lastHash) return;
    if (st.lastAt && now - st.lastAt < SYNC_MIN_MS) return;
    syncing = true;
    const r = await Net.putGhost(snap);
    if (r.ok) Net.saveNet({ lastHash: hash, lastAt: now, slot: ctx.state.slot });
  } catch (_) { /* 影闘の通信で本編を止めない */ } finally {
    syncing = false;
  }
}

export function render(ctx) {
  const save = ctx.save;
  const root = h('div');
  root.appendChild(h('div', 'btn-row', [
    h('h1', { class: 'screen-title', style: 'flex:1 1 auto' }, '影闘'),
    helpBtn('影闘', [
      '他の灯守（プレイヤー）が預けた「影」と手合わせします。',
      '影は、その人の最新の編成から「戦える仲間（影送りに出ていない仲間）」を最大4人写したものです。',
      '',
      '影の構えは、次に使う技の系統で決まります。',
      '　破の技 → 剛　／　流の技 → 疾　／　封の技 → 呪',
      'つまり「相手の破には流、流には封、封には破」で崩せます。',
      '',
      '【調整戦】出撃する仲間の最高Lvが、こちらと±5以内の相手だけが出ます',
      '【無差別戦】強さを問わず、だれとでも当たります',
      '',
      '・影闘では双方の体力が2倍になります。20手で決着しなければ、残りの体力の割合で勝ち負けを決めます',
      '・逃げることはできません。道具も持ち込めません。負けても何も失いません',
      '・勝つと影鋼（二つ銘の素材）。格上ほど多くもらえます（直近24時間で5回まで。受け取った時刻から24時間たつと1回ずつ戻ります）',
      '・ほかの灯守の格上・互角の影に勝つと、ときどき相手の装備の「写し」が手に入ります',
      '・調整戦の勝ち星で段位が上がり、預けた影に称号として表示されます',
      '・二つ銘は、鍛冶の画面で身につけている装備に刻めます',
      '・人が少ないうちは「塔の写し」（その日だけの相手）が混ざります',
    ].join('\n')),
  ]));

  if (!save) {
    root.appendChild(h('div', 'panel', '記録が読み込まれていません。'));
    root.appendChild(h('button', { class: 'btn btn--primary', onclick: () => ctx.go('title') }, 'タイトルへ戻る'));
    return root;
  }
  if (!A.isUnlocked(save)) {
    root.appendChild(h('div', 'panel', `影闘は${A.UNLOCK_TEXT}。`));
    root.appendChild(backBtn(ctx));
    return root;
  }

  const day = dayKey(ctx.now());
  const rec = A.recordOf(save);

  // ── 直前の結果 ──
  const last = ctx.state.pending?.arena;
  if (last) {
    ctx.state.pending = null;
    const got = [];
    if (last.kage > 0) got.push(h('div', 'small gold', `${MAT_NAME[KAGE_MAT]} ×${last.kage}`));
    if (last.copy) got.push(h('div', 'small gold', ['写しを手に入れた：', h('span', null, last.copy)]));
    if (last.copyFull) got.push(h('div', 'small warn', '写しが手に入るはずでしたが、装備がいっぱいで受け取れませんでした'));
    if (last.rankUp) got.push(h('div', 'small gold', `段位が「${last.rankUp}」に上がった`));
    if (last.outcome === 'win' && !last.rewarded) got.push(h('div', 'small dim', '褒美の回数を使い切っています（直近24時間で5回まで・勝ち星は数えます）'));
    root.appendChild(h('div', `panel arena-result arena-result--${last.outcome}`, [
      h('div', 'arena-result__head', last.outcome === 'win' ? '勝った' : '負けた'),
      h('div', 'small', `${last.name} との手合わせ（${last.turns}手）`),
      ...got,
    ]));
  }

  // ── 自分の側 ──
  const fighters = A.fightersOf(save);
  const mine = A.snapshotOf(save, 'self');
  root.appendChild(h('h2', 'sec-title', 'こちらの顔ぶれ'));
  root.appendChild(h('div', 'panel', [
    fighters.length
      ? h('div', 'arena-team', fighters.map((id) => member(CHAR_BY_ID[id], save.chars[id]?.lv || 1)))
      : h('p', 'warn', '戦える仲間がいません。編成に仲間を入れるか、影送りから戻るのを待ってください。'),
    mine ? kv('戦力', n(mine.p)) : null,
    mine ? kv('出撃する仲間の最高Lv', `Lv${mine.l}`) : null,
    kv('段位', rankLine(rec.fairWin)),
    kv('戦績', `${rec.win}勝 ${rec.lose}敗（うち調整戦の勝ち ${rec.fairWin}）`),
    kv('褒美', rewardLine(save, ctx.now())),
    kv(MAT_NAME[KAGE_MAT], `${n(save.inv.mats?.[KAGE_MAT] || 0)}個`),
  ]));

  // ── 自分の影を預けるか ──
  root.appendChild(h('h2', 'sec-title', 'あなたの影'));
  const pubBox = h('div', 'panel');
  drawPublish(ctx, pubBox);
  root.appendChild(pubBox);

  // ── 相手（調整戦／無差別戦） ──
  root.appendChild(h('h2', 'sec-title', '手合わせの相手'));
  const mode = view.mode;
  root.appendChild(h('div', 'btn-row', [
    ['fair', '調整戦（±5Lv）'], ['open', '無差別戦'],
  ].map(([id, label]) => h('button', {
    class: `btn btn--sm${mode === id ? ' btn--primary' : ''}`, type: 'button',
    'aria-pressed': mode === id ? 'true' : 'false',
    onclick: () => { if (view.mode !== id) { view.mode = id; view.reroll = 0; ctx.render(); } },
  }, label))));
  const list = h('div', null, h('p', 'dim small', '影を探しています…'));
  root.appendChild(list);
  if (fighters.length) {
    loadOpponents(ctx, list, mine, day);
    root.appendChild(h('button', {
      class: 'btn btn--sm', type: 'button',
      onclick: () => { view.reroll += 1; list.replaceChildren(h('p', 'dim small', '影を探しています…')); loadOpponents(ctx, list, mine, day); },
    }, '別の相手を探す'));
  } else list.replaceChildren(h('p', 'dim small', '戦える仲間がいないため、相手を選べません。'));

  root.appendChild(backBtn(ctx));
  syncGhost(ctx);
  return root;
}

/** 画面をまたいで覚えておく見え方（戦闘から戻っても同じ戦い方のまま） */
const view = { mode: 'fair', reroll: 0 };

/** 段位の表示（次の段位まで調整戦であと何勝か） */
function rankLine(wins) {
  const cur = A.rankName(A.rankOf(wins));
  const next = A.nextRank(wins);
  return next ? `${cur}（${next.name}まで調整戦であと${next.left}勝）` : cur;
}

/** 褒美の残り（0回なら、次の1回が戻るまでの目安） */
function rewardLine(save, now) {
  const left = A.rewardsLeft(save, now);
  if (left > 0) return `あと${left}回`;
  const min = Math.ceil(A.nextRewardInMs(save, now) / 60000);
  return min >= 60 ? `あと0回（約${Math.floor(min / 60)}時間${min % 60}分後に1回戻る）` : `あと0回（約${min}分後に1回戻る）`;
}

function backBtn(ctx) {
  return h('button', { class: 'btn', style: 'margin-top:14px', onclick: () => ctx.go('home') }, '祠へ戻る');
}

function kv(k, v) {
  return h('div', 'kv', [h('span', 'kv__k', k), h('span', 'kv__v', v)]);
}

/** 仲間1人ぶんの小さな札（紋＋名前＋Lv） */
function member(c, lv) {
  if (!c) return null;
  return h('div', 'arena-member', [
    mon({ id: c.id, art: c.id, name: c.name, mon: c.mon, color: c.color }, 'sm'),
    h('div', 'arena-member__name', c.name),
    h('div', 'arena-member__lv dim', `Lv${lv}`),
  ]);
}

// ── 公開（同意） ──────────────────────────────────────────

function drawPublish(ctx, box) {
  const save = ctx.save;
  const st = Net.loadNet();
  if (st.consent) {
    box.replaceChildren(
      kv('公開中の名前', st.pubName || save.name),
      h('p', 'small dim', '拠点に戻るたび、いま遊んでいる記録の編成（強さ・技・身につけている装備・段位）が影として預けられます。'),
      h('div', 'btn-row', [
        h('button', { class: 'btn btn--sm', onclick: () => askName(ctx, box) }, '名前を変える'),
        h('button', {
          class: 'btn btn--sm',
          onclick: async () => {
            if (!await confirmBox('影を預けるのをやめます。預けてある影も消します。', '消す', 'やめる')) return;
            const r = await Net.deleteGhost();
            if (!r.ok && r.reason === 'lost') {
              Net.saveNet({ consent: false, lastHash: null });
              alertBox('この端末の身元が変わったため、前に預けた影はこちらから消せませんでした。預けるのはやめました（前の影は30日で相手に出なくなります）。');
              drawPublish(ctx, box);
              return;
            }
            if (!r.ok) { alertBox('通信できなかったため、影を消せませんでした。少し待ってからもう一度お試しください。'); return; }
            Net.saveNet({ consent: false, lastHash: null, lastAt: 0 });
            toast('影を消した');
            drawPublish(ctx, box);
          },
        }, '公開をやめる'),
      ]),
    );
    return;
  }
  box.replaceChildren(
    h('p', 'small', '影を預けると、ほかの人があなたの影と手合わせできるようになります。'),
    h('p', 'small dim', [
      '預けるもの：公開する名前・本編の到達階・段位と勝ち数・戦える仲間（最大4人）の強さと技と身につけている装備。',
      h('br'), 'それ以外のセーブの中身（持ち物・銭・物語の進み方）は預けません。',
      h('br'), '★この端末で最後に遊んだ記録の編成が影になります。',
      h('br'), '★ブラウザのデータを消すと、預けた影をこちらから消せなくなります（30日で相手に出なくなります）。',
    ]),
    h('button', { class: 'btn btn--primary', onclick: () => askName(ctx, box) }, '影を預ける'),
    h('p', 'small dim', '預けなくても、ほかの人の影とは戦えます。'),
  );
}

/** 公開名を決めて、同意を記録して、すぐに送る */
function askName(ctx, box) {
  const save = ctx.save;
  const st = Net.loadNet();
  const input = h('input', {
    type: 'text', maxlength: '12', value: st.pubName || save.name || '',
    'aria-label': '公開する名前', autocomplete: 'off',
  });
  box.replaceChildren(
    h('p', 'small', '公開する名前（12文字まで）。ほかの人の画面に出ます。本名は避けてください。'),
    input,
    h('div', { class: 'btn-row', style: 'margin-top:8px' }, [
      h('button', { class: 'btn btn--sm', onclick: () => drawPublish(ctx, box) }, 'やめる'),
      h('button', {
        class: 'btn btn--sm btn--primary',
        onclick: async (e) => {
          const name = A.cleanName(input.value);
          // ★lastAt は消さない。前に送ってから30秒たっていないとサーバーに拒否されるので、
          //   そのときは次に祠へ戻ったとき送る（lastHash を消してあるので必ず送り直す）
          Net.saveNet({ consent: true, pubName: name, lastHash: null });
          e.currentTarget.disabled = true;
          await syncGhost(ctx, { force: true });
          const ok = Net.loadNet().lastHash;
          toast(ok ? `「${name}」の影を預けた` : '少し後（次に祠へ戻ったとき）に預けます');
          drawPublish(ctx, box);
        },
      }, 'この名前で預ける'),
    ]),
  );
  input.focus();
}

// ── 相手 ──────────────────────────────────────────────────

/** 相手の一覧（戦い方ごとに取る。調整戦は自分の最高Lvも鍵に入れる） */
let cache = { key: '', at: 0, ghosts: null, ok: false };

async function loadOpponents(ctx, list, mine, day) {
  try {
    await loadOpponentsInner(ctx, list, mine, day);
  } catch (e) {
    // ★ここで止まると「影を探しています…」のまま固まる。塔の写しだけでも出す
    console.error(e);
    cache = { key: '', at: 0, ok: false, ghosts: [] };
    try { await loadOpponentsInner(ctx, list, mine, day); } catch (_) {
      list.replaceChildren(h('p', 'small warn', '相手を読み込めませんでした。祠へ戻ってからもう一度お試しください。'));
    }
  }
}

async function loadOpponentsInner(ctx, list, mine, day) {
  const save = ctx.save;
  const now = ctx.now();
  const mode = view.mode;
  const myLv = mine ? mine.l : 1;
  const key = mode === 'fair' ? `fair:${myLv}` : 'open';
  if (cache.key !== key || !cache.ghosts || now - cache.at > CACHE_MS) {
    /**
     * 調整戦は「Lvの範囲（サーバーで絞る）」と「最近の50件」の**両方**を取って合わせる。
     * ★Lv順だけだと、同じLvに人が50を超えたとき古い影ばかり返って（30日で捨てる）
     *   「影はいません」になりうる（レビュー指摘）。最近の50件で新しい人を必ず拾う
     */
    const rs = mode === 'fair'
      ? await Promise.all([
        Net.fetchGhosts({ by: 'l', lo: Math.max(1, myLv - A.FAIR_RANGE), hi: Math.min(120, myLv + A.FAIR_RANGE) }),
        Net.fetchGhosts({ by: 't' }),
      ])
      : [await Net.fetchGhosts({ by: 't' })];
    const okAny = rs.some((r) => r.ok);
    const byUid = new Map();
    for (const r of rs) if (r.ok) for (const x of r.list) byUid.set(x.uid, x);
    cache = okAny
      ? { key, at: now, ok: true, ghosts: [...byUid.values()].map((x) => A.sanitizeGhost(x.raw, x.uid)).filter(Boolean) }
      : { key, at: now, ok: false, ghosts: [] };
  }
  if (!list.isConnected) return;     // 待っているあいだに画面を離れた
  const myUid = Net.loadNet().uid || null;
  const picked = A.pickOpponents(cache.ghosts, {
    mode, myUid, myPower: mine ? mine.p : 0, myLv, nowMs: now, dayKey: day, reroll: view.reroll,
    npcs: A.npcGhosts(save, day, mode),
  });
  const kids = [];
  // ★条件に合う影がいないときは何も言わず塔の写しで埋める（オーナー指示 2026-10-11「いませんの一言は不要」）
  if (!cache.ok) kids.push(h('p', 'small warn', '通信できなかったため、塔の写しとだけ戦えます。'));
  else if (picked.pool > 3) kids.push(h('p', 'small dim', `条件に合う影 ${picked.pool}人から選んでいます。`));
  for (const g of picked.list) kids.push(card(ctx, g, mine, day));
  list.replaceChildren(...kids);
}

function card(ctx, g, mine, day) {
  const tier = A.tierOf(g, mine ? A.combatPowerOf(mine.party) : 0);
  const tag = A.TIER_LABEL[tier];
  const eqCount = g.party.reduce((x, m) => x + (m.eq || []).length, 0);
  return h('div', 'panel arena-card', [
    h('div', 'arena-card__head', [
      h('span', 'arena-card__name', g.n),
      h('span', `arena-card__tag${g.npc ? ' dim' : ''}`, tag),
    ]),
    h('div', 'small dim', g.npc
      ? `今日だけ現れる相手　戦力 ${n(g.p)}`
      : `${A.rankName(g.rk)}　${floorName(g.f)}まで到達　戦力 ${n(g.p)}${eqCount ? `　装備${eqCount}点` : ''}`),
    h('div', 'arena-team', g.party.map((m) => member(CHAR_BY_ID[m.c], m.l))),
    h('button', { class: 'btn btn--primary', onclick: () => startBattle(ctx, g, view.mode) }, '挑む'),
  ]);
}

function startBattle(ctx, ghost, mode) {
  const save = ctx.save;
  if (A.fightersOf(save).length === 0) { toast('戦える仲間がいません'); return; }
  const mine = A.snapshotOf(save, 'self');
  // ★始めた時点で1回と数え、ひとまず負けで記録。褒美の中身もここで決まる（読み込み直しで引き直せない）
  const { seed } = A.begin(save, ghost, ctx.now(), { myUid: Net.loadNet().uid || null, myPower: mine ? A.combatPowerOf(mine.party) : 0, mode });
  ctx.saveNow(true);
  const opts = A.battleOpts(save, ghost, seed);
  const arena = {
    run: { partyTactic: opts.partyTactic },
    status: () => h('div', 'statusbar', [
      h('span', 'statusbar__floor', '影闘'),
      h('span', 'arena-vs', ['相手：', h('span', 'gold', ghost.n)]),
    ]),
    finish: (res) => {
      const out = A.settle(save, ghost, res, ctx.now());
      ctx.saveNow(true);
      ctx.state.pending = { arena: { ...out, name: ghost.n, turns: res.turns } };
      ctx.go('arena');
    },
  };
  // 作戦は戦闘画面で変えられる（変えたら save.party.tacticParty に残る）
  ctx.go('battle', { ev: { arena, opts, enemies: opts.enemies, isBoss: false } });
}

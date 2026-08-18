/**
 * 編成・装備・鍛冶の画面（spec §2 の画面2の下層）
 *
 * ここが本作のビルド要素の入口（spec §3-8-5）。
 * 「作戦 × スキルセット × 編成 × 装備」の4つで戦い方を作る。
 */

// ★`zeni` は鍛冶のところで「必要な銭の額」を入れる局所変数の名前とぶつかるので、
//   この画面だけ `zeniText` という名前で受ける（2026-08-14）
import { h, swapInto, mon, bar, toast, alertBox, confirmBox, helpBtn, lineTag, n, zeni as zeniText } from './dom.js';
import { CHARS, CHAR_BY_ID, statsAt, skillsAt, nextLearn } from '../../data/chars.js';
import { SKILLS } from '../../data/skills.js';
import { BASES, RARITY } from '../../data/equips.js';
import * as Sell from './equip_sell.js';
import { affixHelpBtn } from './affix_help.js';
import { TACTICS, ROLE_TACTICS, availableTactics } from '../battle/tactics.js';
import * as G from '../meta/growth.js';
import * as H from '../meta/home.js';
import * as Rc from '../meta/recruit.js';
import * as D from '../meta/dispatch.js';
import * as R from '../core/rules.js';
import { confirmOnce } from './confirm.js';

/**
 * ステータスの表示名。
 * ★2026-08-14 に1字の略（体・守・速・術）をやめて、他の画面と同じ言い方にそろえた。
 *   薬の説明は「念が1.5倍」、作戦の説明は「疾さ」と書いているのに、
 *   ここだけ「術」「速」と出ていて、同じものだと分からなかった。
 */
const STAT_LABEL = { hp: 'HP', ki: '気', atk: '力', def: '守り', spd: '疾さ', mag: '念', luk: '運' };

/**
 * それぞれの値が何に効くか（2026-08-14 オーナー指示
 * 「ステータスの各値が何を示しているかをヘルプマークつけて説明できるようにしましょう。
 *   気とか力とか念、運が何に影響してくるか知りたい」）。
 *
 * ★仕組みの言葉（係数・乱数）を出さない。「何をすると得か」だけを書く。
 */
const STAT_HELP = `それぞれの値が何に効くかです。

■ HP
0になると力尽きます。石動がとび抜けて高く、狐火と鈴は低めです。

■ 気（き）
わざを使うための力。足りないと通常攻撃しか出せません。
毎ターン少しずつ戻り、戻る量は「気の巡り」で決まります。

■ 力（ちから）
刀や拳で殴るわざの威力。

■ 守り（まもり）
受けるダメージを減らします。相手の力が高いほど効きます。

■ 疾さ（はやさ）
行動の順番。高いほど先に動けます。ボスより先に動けるかがここで決まります。

■ 念（ねん）
術のわざの威力や回復量。
相手の守りではなく、相手の念の高さに阻まれます。

■ 運（うん）
会心（大きく当たる）の出やすさと、宝の中身の良さ。
崩しが決まったときの上乗せにも少し効きます。

■ 気の巡り
毎ターン戻る気の量。装備で足せますが +3 で頭打ちです。`;
const SLOT_LABEL = ['武器', '防具', '護符'];

/**
 * 各タブのヘルプ（2026-08-10 オーナー要望）。
 *
 * ★`alertBox` はプレーンテキストで出す。**Markdown の記法は書かない**
 *   （`**強調**` と書くと、その記号ごと画面に出る）。
 * ★数字を書くときは、この画面で実際に見えている数字と食い違わせないこと。
 *   食い違うと、ヘルプのほうが嘘になる。迷ったら数字を書かない
 */
const HELP = {
  party: {
    title: '編成・作戦',
    text: `出撃する仲間（最大4人）と、戦い方の方針を決めます。

■ 作戦
戦闘中はみんな自動で動きます。その判断のクセを決めるのが作戦です。
戦闘の画面からいつでも変えられます。

■ 役割
仲間ひとりだけ、全体の作戦とは違う動きにできます。
「かばえ」を1人に付けておくと、その人が攻撃を引き受けます。

■ 迷ったら
「おまかせ」で問題ありません。全滅が続くようなら「いのちだいじに」へ。`,
  },
  equip: {
    title: '装備',
    text: `武器・防具・護符の3か所に、1つずつ着けられます。

■ 自動
その仲間に合う物を、持ち物の中から選んで着せます。
ほかの仲間が着けている物は選ばれないので、押しても仲間の装備は外れません。

■ 一覧の見方
装備していない物には、いま着けている物との差が出ます。
緑は上がる値、赤は下がる値です。

■ 持ち物がいっぱいのとき
いらない物は「売る」で銭に換えられます。売った物は戻せません。
稀少度の高い物は、売るときに毎回確認します。
枠と稀少度でしぼって、チェックを付けた物をまとめて売ることもできます。

■ 名前の見方
装備の名は「頭の言葉＋品物＋後ろの言葉」でできています。
たとえば「研ぎの打刀の崩し」なら、打刀に「研ぎの」と「の崩し」が付いた物。
どの言葉が何を上げるかは、一覧の上にある「名前の言葉」から引けます。`,
  },
  forge: {
    title: '鍛冶（銘強化）',
    text: `拾った装備を鍛えて、効果を上げる場所です。失敗はありません。

つまみを動かして「どこまで鍛えるか」を決め、
ボタンを押すとまとめて反映されます。
つまみが 0 の行は灰色の「0」になり、何も起きません。

■ 要るもの
行の説明に「鍛冶石◯個／月齢素材◯個／銭◯文」と、そのぶんに要る数が出ます。
月齢素材は装備ごとに決まっていて、鍛えるほど数が増えます。
どれか足りないと、行に足りないものの名前が出ます。

■ 素材の集めかた
鍛冶石は塔の宝や敵から。
月齢素材は「朔の窖」「望の櫓」でいつでも集められます。`,
  },
  renki: {
    title: '錬気',
    text: `仲間のステータスを直接伸ばす場所です。

上の絵を押すと、伸ばす仲間を切り替えられます。
つまみを動かして「どれだけ伸ばすか」を決め、
ボタンを押すとまとめて反映されます。
行の説明に「錬気玉◯個」と、そのぶんに要る数が出ます。
1ポイントごとに少しずつ高くなります。

■ 上限を伸ばすには
錬気の上限は、輪廻（周回）と因果盤の「錬の因」で伸びます。`,
  },
  // ★2026-08-14 に「わざ」→「ステータス」へ。ステータスとわざを同じ場所で見せる
  // （このコメントの位置は変えない。下の skills: と対になっている）
  skills: {
    title: 'ステータス',
    text: `その仲間のいまの数値と、使えるわざの一覧です。

■ 上の絵
押すと、見る仲間を切り替えられます。
出撃していない仲間も見られます。

■ 数値について
装備・錬気・因果盤を足したあとの値です。戦いに出るときの実際の数と同じ。
かっこの中は、装備などで上がっているぶんです。
それぞれが何に効くかは、数値の右にある「？」を押してください。

■ わざはレベルで増えます
決まったレベルに達すると新しいわざを覚えます。
一番下に「次のわざは Lv◯」と出ます。
覚えたわざはすべて自動戦闘の候補になり、どれを使うかは作戦（編成のタブ）で変わります。`,
  },
};

export function render(ctx) {
  const tab = ctx.state.params?.tab || 'party';
  const root = h('div');

  /**
   * ★タブは5つ（2026-08-13 オーナー指示「鍛冶と錬気のページは別にしよう」
   *   「使う技も別ページにして、錬気と同様に各キャラのアイコンでそれぞれ表示できるように」）。
   *   `btn-row` は折り返すので、狭い画面では2段になる。1段に詰めるために
   *   ラベルを削るより、**折り返して全部見えている**ほうがよいと判断した。
   */
  root.appendChild(h('div', 'btn-row', [
    tabBtn(ctx, 'party', '編成', tab),
    tabBtn(ctx, 'skills', 'ステータス', tab),
    tabBtn(ctx, 'equip', '装備', tab),
    tabBtn(ctx, 'forge', '鍛冶', tab),
    tabBtn(ctx, 'renki', '錬気', tab),
  ]));

  const body = h('div', { style: 'margin-top:12px' });
  if (tab === 'party') renderParty(ctx, body);
  else if (tab === 'skills') renderSkills(ctx, body);
  else if (tab === 'equip') renderEquip(ctx, body);
  else if (tab === 'renki') renderRenki(ctx, body);
  else renderForge(ctx, body);
  /**
   * ★ヘルプは**開いているタブのぶんだけ**（2026-08-10 オーナー要望）。
   *   並べると、押す前に「どれが今の画面の説明か」を考えさせてしまう。
   * ★置き場所はタブの列ではなく、**そのタブの最初の見出しの右端**
   *   （2026-08-16 オーナー指摘「ヘルプマークだけで1行分使っているのもったいないね。
   *     身に着けている物の右あたりに持っていく？」）。
   *   タブが5つあると390px端末では列が折り返し、「？」だけが2段目に落ちて
   *   **1行まるごと占めていた**。見出しの行なら1pxも増えない。
   */
  /**
   * ★錬気タブだけは見出しが1つで、そこにはすでに「ステータスの読み方」が付いている。
   *   同じ形の「？」を2つ並べると、どちらが何の説明か分からない。
   *   なので**あちら側で1つにまとめてある**（`buildRenki`）。ここでは足さない。
   */
  if (tab !== 'renki') attachHelp(body, helpBtn(HELP[tab].title, HELP[tab].text));
  root.appendChild(body);

  root.appendChild(h('button', {
    class: 'btn', style: 'margin-top:16px',
    onclick: () => { ctx.saveNow(true); ctx.go('home'); },
  }, '祠へ戻る'));

  return root;
}

/**
 * ヘルプの「？」を、中身の**最初の見出しの右端**に寄せる（2026-08-16）。
 *
 * ★すでに自前のヘルプを持っている見出しは飛ばす。
 *   「いまの数値」（ステータスの読み方）や「錬気」の行に重ねると、
 *   同じ形の「？」が2つ並んで、どちらが何の説明か分からなくなる。
 * ★見出しが1つも無いタブでは、右寄せの小さい行を頭に足す（最後の逃げ道）。
 * ★`h()` が返すのは文書に入る前のDOM。`querySelectorAll` はそのままでも動く。
 */
function attachHelp(body, btn) {
  const has = (el) => !!(el && el.querySelector && el.querySelector('.btn--help'));
  /**
   * ★親まで見るのは「見出しと？が `btn-row` に並んでいる」形のときだけ。
   *   親を無条件に見ると、見出しの親が中身まるごと（body）になっている場合に、
   *   **画面のどこかに？が1つでもあれば全部の見出しが除外される**。
   *   実際それで装備タブが専用行に落ちていた（2026-08-16 実機で発見）。
   */
  const taken = (el) => has(el)
    || !!(el.parentElement && el.parentElement.classList
      && el.parentElement.classList.contains('btn-row') && has(el.parentElement));
  const title = [...body.querySelectorAll('.sec-title')].find((el) => !taken(el));
  // ★置ける見出しが無ければ**何もしない**。「？」だけの行を作らない（それが今回の指摘）
  if (!title) return false;
  title.style.display = 'flex';
  title.style.alignItems = 'center';
  title.style.gap = '8px';
  // 見出しの文字をひとまとめにして、伸びるのは文字のほうにする
  const inner = h('span', { style: 'flex:1 1 auto' });
  while (title.firstChild) inner.appendChild(title.firstChild);
  title.appendChild(inner);
  title.appendChild(btn);
  return true;
}

function tabBtn(ctx, id, label, cur) {
  return h('button', {
    class: `btn btn--sm${cur === id ? ' btn--primary' : ''}`,
    onclick: () => ctx.go('party', { tab: id }),
  }, label);
}

// ══════════════════════════════════════════════════════════
// 編成・作戦
// ══════════════════════════════════════════════════════════

function renderParty(ctx, root) {
  const save = ctx.save;
  const roster = Rc.roster(save);

  root.appendChild(h('h2', 'sec-title', `出撃する仲間（${save.party.active.length}／4）`));
  root.appendChild(h('p', 'small dim', '4人まで連れて行けます。押すと入れ替わります。'));

  for (const c of roster) {
    const active = save.party.active.includes(c.id);
    const away = D.isAway(save, c.id);       // 影送りに出ている間は連れて行けない（spec §7-1）
    const sc = save.chars[c.id];
    root.appendChild(h('button', {
      class: `list__item${active ? ' list__item--on' : ''}`,
      disabled: away,
      onclick: () => toggleActive(ctx, c.id),
    }, [
      mon(c, 'sm'),
      h('div', 'list__main', [
        h('div', null, [c.name, ' ', lineTag(c.line)]),
        h('div', 'list__sub', away ? '影送りに出ています（呼び戻すと連れて行けます）' : `Lv${sc.lv}　${c.role}`),
      ]),
      h('div', 'list__right',
        away ? h('span', 'dim', '影送り中') : (active ? h('span', 'gold', '出撃') : h('span', 'dim', '待機'))),
    ]));
  }

  if (roster.length === 1) {
    root.appendChild(h('p', 'small dim', 'まだ一人です。塔を登ると仲間が加わります。'));
  }

  // ── 全体作戦 ──
  root.appendChild(h('h2', 'sec-title', '全体の作戦'));
  root.appendChild(h('p', 'small dim', 'この方針で自動で戦います（戦闘中も変えられます）'));

  const avail = availableTactics({
    chapter: save.progress.chapter ?? 0,
    dexPct: G.dexPercent(save),
    pairsFound: Object.keys(save.dex?.pairs || {}).length,
    boardUnlocked: (save.board || []).some((v) => v > 0),
  });

  for (const id of avail) {
    const t = TACTICS[id];
    const on = save.party.tacticParty === id;
    root.appendChild(h('button', {
      class: `list__item${on ? ' list__item--on' : ''}`,
      onclick: () => { save.party.tacticParty = id; ctx.saveNow(true); ctx.render(); },
    }, [
      h('div', 'list__main', [
        h('div', on ? 'gold' : '', t.name),
        h('div', 'list__sub', t.desc),
      ]),
    ]));
  }
  const locked = Object.values(TACTICS).filter((t) => !avail.includes(t.id));
  if (locked.length > 0) {
    root.appendChild(h('p', 'small dim',
      `まだ選べない作戦: ${locked.map((t) => t.name).join('・')}（塔を進めると増えます）`));
  }

  // ── 個別の役割 ──
  root.appendChild(h('h2', 'sec-title', '仲間ごとの役割'));
  root.appendChild(h('p', 'small dim', '特定の仲間だけ動きを変えたいときに使います'));
  for (const id of save.party.active) {
    const c = CHAR_BY_ID[id];
    if (!c) continue;
    const sel = h('select', {
      onchange: (e) => {
        save.party.tacticChars = save.party.tacticChars || {};
        save.party.tacticChars[id] = e.target.value;
        ctx.saveNow(true);
      },
    }, Object.values(ROLE_TACTICS).map((r) => h('option', {
      value: r.id,
      selected: (save.party.tacticChars?.[id] || 'follow') === r.id,
    }, r.name)));
    root.appendChild(h('div', { class: 'list__item', style: 'cursor:default' }, [
      mon(c, 'sm'),
      h('div', 'list__main', c.name),
      sel,
    ]));
  }

  // ★わざの一覧は「わざ」タブへ移した（2026-08-13 オーナー指示「全キャラを表示すると縦が長い」）。
  //   ここには**入口だけ**を残す。編成を決めている最中に「この人は何ができるんだったか」を
  //   確かめたくなるので、導線を切ってしまわない
  root.appendChild(h('button', {
    class: 'btn btn--sm btn--inline', style: 'margin-top:14px',
    onclick: () => ctx.go('party', { tab: 'skills' }),
  }, 'ステータスとわざを見る'));
}

function toggleActive(ctx, id) {
  const save = ctx.save;
  // ボタンは disabled にしてあるが、状態の食い違いを唯一の場所で止めておく
  if (D.isAway(save, id)) { toast('その仲間は影送りに出ています。'); return; }
  const i = save.party.active.indexOf(id);
  if (i >= 0) {
    if (save.party.active.length <= 1) { toast('ひとりは連れて行く必要があります。'); return; }
    save.party.active.splice(i, 1);
  } else {
    if (save.party.active.length >= 4) { toast('連れて行けるのは4人までです。'); return; }
    save.party.active.push(id);
  }
  ctx.saveNow(true);
  ctx.render();
}

// ══════════════════════════════════════════════════════════
// 装備
// ══════════════════════════════════════════════════════════

function renderEquip(ctx, root) {
  const save = ctx.save;
  const roster = Rc.roster(save);
  const charId = ctx.state.params?.char || save.party.active[0] || roster[0]?.id;
  const c = CHAR_BY_ID[charId];
  if (!c) { root.appendChild(h('p', null, '仲間がいません')); return; }

  // 誰の装備を見るか。
  // ★`btn-row`（flex）で並べてはいけない（2026-08-11 オーナー指摘
  //   「1キャラだけが広すぎるのは微妙」）。flexの `flex:1 1 0` は**行ごと**に
  //   余りを分けるので、6人だと最後の1人が2行目で**全幅に伸びる**。
  //   格子（grid）にすると、折り返しても1人ぶんの幅は変わらない。
  root.appendChild(h('div', 'charpick', roster.map((x) => h('button', {
    class: `charpick__btn${x.id === charId ? ' charpick__btn--on' : ''}`,
    type: 'button',
    'aria-pressed': x.id === charId ? 'true' : 'false',
    onclick: () => ctx.go('party', { tab: 'equip', char: x.id }),
  }, [
    mon({ ...CHAR_BY_ID[x.id], alive: true }, 'sm'),
    h('span', 'charpick__name', x.name),
  ]))));

  const sc = save.chars[charId];
  sc.equip = sc.equip || [0, 0, 0];
  const st = G.finalStats(save, charId);
  const base = statsAt(charId, sc.lv, sc.renki || {});

  // ── いまのステータス ──
  const statPanel = h('div', { class: 'panel', style: 'margin-top:10px' });
  statPanel.appendChild(h('div', 'gold', `${c.name}　Lv${sc.lv}`));
  for (const k of ['hp', 'ki', 'atk', 'def', 'spd', 'mag', 'luk']) {
    const diff = st[k] - base[k];
    statPanel.appendChild(h('div', 'kv', [
      h('span', 'kv__k', STAT_LABEL[k]),
      h('span', 'kv__v', [
        String(st[k]),
        diff !== 0 ? h('span', { class: diff > 0 ? 'up small' : 'down small' }, ` (${diff > 0 ? '+' : ''}${diff})`) : null,
      ]),
    ]));
  }
  if (st.meguri) statPanel.appendChild(h('div', 'kv', [h('span', 'kv__k', '気の巡り'), h('span', 'kv__v', `+${st.meguri}／ターン`)]));
  if (st.crushBonus) statPanel.appendChild(h('div', 'kv', [h('span', 'kv__k', '崩し時ダメージ'), h('span', 'kv__v', `+${st.crushBonus}%`)]));
  if (st.resist) statPanel.appendChild(h('div', 'kv', [h('span', 'kv__k', '状態異常耐性'), h('span', 'kv__v', `${st.resist}%`)]));
  root.appendChild(statPanel);

  // ── 装備中の3枠 ──
  root.appendChild(h('h2', 'sec-title', '身につけているもの'));
  // 「自動」。持ち物が増えると1枠ずつ見比べるのが現実的でなくなるため（2026-08-05 オーナー指摘）。
  // ★他のキャラが装備中の物は候補にしない（`suggestEquip`）ので、押しても仲間の装備は外れない
  root.appendChild(h('div', 'btn-row', [
    h('button', {
      class: 'btn btn--sm',
      onclick: () => {
        const changed = G.autoEquip(save, charId);
        if (changed === 0) { toast('いま以上に良い組み合わせは見つかりませんでした。'); return; }
        toast(`${changed}か所を替えました`);
        ctx.saveNow(true); ctx.render();
      },
    }, '自動'),
    h('span', 'small dim', 'この仲間に合う物を選んで着せます'),
  ]));
  for (let slot = 0; slot < 3; slot++) {
    const uid = sc.equip[slot];
    const t = uid ? (save.inv.equips || []).find((x) => x[0] === uid) : null;
    const e = t ? G.unpackEquip(t) : null;
    root.appendChild(h('div', { class: 'list__item', style: 'cursor:default' }, [
      h('div', 'list__main', [
        h('div', 'small dim', SLOT_LABEL[slot]),
        e ? h('div', `rar-${G.equipRarity(e)}`, `${RARITY[G.equipRarity(e)]}｜${G.equipName(e)}`) : h('div', 'dim', '（なし）'),
      ]),
      e ? h('button', {
        class: 'btn btn--sm',
        onclick: () => { G.unequip(save, charId, slot); ctx.saveNow(true); ctx.render(); },
      }, 'はずす') : null,
    ]));
  }

  // ── 持ち物 ──
  // ★一覧だけ描き直せるように切り出す（ページ送り・売却でいちいち画面の先頭へ
  //   飛ばされないため。錬気で同じ問題を踏んでいる・2026-08-10）
  const invBox = h('div');
  root.appendChild(invBox);
  drawInv(ctx, invBox, charId);
}

/** 一覧の1ページに並べる数（鍛冶・持ち物で共通・2026-08-10 オーナー要望） */
const PAGE = 10;

/**
 * ページ送りの行。1ページに収まるときは何も出さない。
 *
 * ★`ctx.go()` で描き直さない。画面が先頭へ飛んで、一覧の続きを見ていた人が
 *   毎回上まで戻される（オーナーが錬気で指摘したのと同じ事象）。
 *   ページ番号は `ctx.state.params` に置くので、画面を離れて戻っても続きから見られる。
 */
function pager(page, pages, goPage) {
  if (pages <= 1) return null;
  return h('div', { class: 'btn-row', style: 'align-items:center' }, [
    h('button', {
      class: 'btn btn--sm', type: 'button', disabled: page <= 0,
      'aria-label': '前のページ', onclick: () => goPage(page - 1),
    }, '‹ 前'),
    h('span', 'small dim', `${page + 1} / ${pages}`),
    h('button', {
      class: 'btn btn--sm', type: 'button', disabled: page >= pages - 1,
      'aria-label': '次のページ', onclick: () => goPage(page + 1),
    }, '次 ›'),
  ]);
}

/**
 * 持ち物の一覧（枠でしぼる＋ページ送り）。ここだけ描き直せる。
 *
 * ★描き直しの宛先は**常に画面に付いている枠（host）**にする。
 *   `swapInto` に渡される使い捨ての枠を閉じ込めると、
 *   2回目以降の操作は使い捨ての枠を差し替えるだけになり、画面が変わらない
 *   （「ページ送りは効くのに、そのあとフィルターが効かない」形で実際に出た・2026-08-10）。
 * ★`clear` してから足し直さないこと。空を経由した一瞬にページの高さが縮み、
 *   スクロール位置が先頭へ詰められる（実機で 1302 → 0 になった）。
 */
function drawInv(ctx, host, charId) {
  const redraw = () => drawInv(ctx, host, charId);
  swapInto(host, (root) => buildInv(ctx, root, charId, redraw));
}

function buildInv(ctx, root, charId, redraw) {
  const save = ctx.save;
  const c = CHAR_BY_ID[charId];
  const sc = save.chars[charId];

  const equips = (save.inv.equips || []).map(G.unpackEquip);
  /**
   * ★見出しは「保有数」（2026-08-16 オーナー指示
   *   「祠ページですが、装備行のところ、『持ち物』という記載は『保有数』に変えましょう。
   *     装備ページ内も同様です」）。
   *   「持ち物」は道具・素材をまとめて見る**別の画面**の名前なので、
   *   装備の枚数にも同じ語を当てていると、同じ言葉が2つの意味で走っていた。
   * ★名前に付く言葉は、見出しの右の「？」から（他のヘルプと同じ大きさ・2026-08-16）
   */
  root.appendChild(h('div', { class: 'sec-title', style: 'display:flex;align-items:center;gap:8px' }, [
    h('span', { style: 'flex:1 1 auto' }, `保有数（${equips.length}／${G.INV_MAX}）`),
    affixHelpBtn('equip'),
  ]));
  if (equips.length === 0) {
    root.appendChild(h('p', 'small dim', 'まだ何も持っていません（塔の宝や敵から）'));
    return;
  }
  if (equips.length >= G.INV_MAX * 0.9) {
    root.appendChild(h('p', 'small warn', 'いっぱいに近づいています。露店で売りましょう'));
  }

  // 装備中の物がどのキャラに付いているか
  const owner = {};
  for (const [id, ch] of Object.entries(save.chars)) {
    for (const uid of ch.equip || []) if (uid) owner[uid] = CHAR_BY_ID[id]?.name || id;
  }

  // 強い順（発見階層×稀少度）に並べる。数が増えると探せなくなるため
  equips.sort((a, b) => (G.equipRarity(b) - G.equipRarity(a)) || (b.lv - a.lv) || (b.plus - a.plus));

  // ★行ごとに BASES と inv.equips を線形検索すると、表示件数を増やしたときに O(n²) になる
  const BASE_BY_ID = new Map(BASES.map((x) => [x.id, x]));
  const TUP_BY_UID = new Map((save.inv.equips || []).map((t) => [t[0], t]));
  const slotOf = (e) => ({ weapon: 0, armor: 1, charm: 2 })[BASE_BY_ID.get(e.baseId)?.slot];

  // 枠でしぼる。数が増えると、目当ての枠の候補が上位から押し出されて見えなくなる
  // ★状態は `ctx.state.params` に置く（既存流儀）。ただし**書き換えたら自分で描き直す**。
  //   `ctx.go()` を通すと画面が先頭へ飛ぶ
  const cur = ctx.state.params || {};
  const filter = cur.slot;
  const setSlot = (v) => { cur.slot = v; cur.page = 0; redraw(); };
  root.appendChild(h('div', 'btn-row', [
    h('button', {
      class: `btn btn--sm${filter == null ? ' btn--primary' : ''}`, type: 'button',
      onclick: () => setSlot(null),
    }, 'すべて'),
    ...SLOT_LABEL.map((label, i) => h('button', {
      class: `btn btn--sm${filter === i ? ' btn--primary' : ''}`, type: 'button',
      onclick: () => setSlot(i),
    }, label)),
  ]));

  /**
   * ── 稀少度でしぼる（2026-08-14 オーナー指示
   *   「装備が増えてきて、売るのが大変。フィルター機能をつけてくれない？」）──
   *
   * ★**売る導線はここに置かない**（2026-08-16 オーナー指示
   *   「装備ページですが、売るボタンは消そう。売るのは露店で統一すること」）。
   *   この画面は縦が長い（実測2,406px）ので、同じことが2か所でできるぶんだけ
   *   スクロールが増えていた。売買は露店に1本化する。
   */
  const rar = cur.rar == null ? null : Number(cur.rar);
  const setRar = (v) => { cur.rar = v; cur.page = 0; redraw(); };
  root.appendChild(h('div', { class: 'btn-row btn-row--wrap', style: 'margin-top:6px' }, [
    h('button', {
      class: `btn btn--sm${rar == null ? ' btn--primary' : ''}`, type: 'button',
      onclick: () => setRar(null),
    }, 'すべて'),
    ...RARITY.map((label, i) => h('button', {
      class: `btn btn--sm${rar === i ? ' btn--primary' : ''}`, type: 'button',
      onclick: () => setRar(i),
    }, label)),
  ]));

  const match = (e) => (filter == null || slotOf(e) === filter)
    && (rar == null || G.equipRarity(e) === rar);
  const listed = equips.filter(match);

  if (listed.length === 0) {
    root.appendChild(h('p', 'small dim', 'この絞り込みでは、まだ何も持っていません。'));
    return;
  }

  // ★1ページ10件（2026-08-10 オーナー要望）。
  //   上限500点に達したときに500行＋行ごとのO(n)検索で固まるのも同時に防いでいる
  const { shown, nav: pageNav } = Sell.paginate(listed, cur, PAGE, redraw);
  const list = h('div', 'list');
  for (const e of shown) {
    const b = BASE_BY_ID.get(e.baseId);
    if (!b) continue;
    const slotIdx = { weapon: 0, armor: 1, charm: 2 }[b.slot];
    const eff = G.equipEffect(e);
    const mine = sc.equip[slotIdx] === e.uid;
    const held = owner[e.uid];

    // 今つけている物との差（何が良くなるかを事前に見せる）
    const curUid = sc.equip[slotIdx];
    const curT = curUid ? TUP_BY_UID.get(curUid) : null;
    const curEff = curT ? G.equipEffect(G.unpackEquip(curT)) : null;
    const diffs = [];
    for (const k of ['hp', 'ki', 'atk', 'def', 'spd', 'mag', 'luk']) {
      const d = (eff[k] || 0) - (curEff ? (curEff[k] || 0) : 0);
      if (d !== 0) diffs.push(h('span', { class: d > 0 ? 'up' : 'down' }, `${STAT_LABEL[k]}${d > 0 ? '+' : ''}${d} `));
    }

    list.appendChild(h('div', { class: `list__item${mine ? ' list__item--on' : ''}`, style: 'cursor:default' }, [
      h('div', 'list__main', [
        h('div', `rar-${G.equipRarity(e)}`, `${RARITY[G.equipRarity(e)]}｜${G.equipName(e)}`),
        h('div', 'list__sub', [`${SLOT_LABEL[slotIdx]}・${e.lv}階　`, ...(mine ? [h('span', 'gold', '装備中')] : diffs)]),
        held && !mine ? h('div', 'list__sub warn', `${held}が装備中`) : null,
      ]),
      // ★売る導線はここに置かない（露店に一本化・2026-08-16）
      mine ? null : h('button', {
        class: 'btn btn--sm',
        onclick: async () => {
          const ok = await confirmOnce(ctx, 'equipOn',
            `${c.name}に「${G.equipName(e)}」（${SLOT_LABEL[slotIdx]}）をつけます。`, 'つける', 'やめる');
          if (!ok) return;
          const r = G.equipTo(save, charId, e.uid);
          if (!r.ok) { toast('装備できませんでした'); return; }
          ctx.saveNow(true); ctx.render();
        },
      }, 'つける'),
    ]));
  }
  root.appendChild(list);
  if (pageNav) root.appendChild(pageNav);
  // 売りたい人のための行き先。ここに売るボタンを戻さないこと（露店に一本化・2026-08-16）
  root.appendChild(h('p', { class: 'small dim', style: 'margin-top:8px' },
    'いらない装備は露店で売れます（祠の「露店」→「売る」→「装備」）。'));
}

// ══════════════════════════════════════════════════════════
// 鍛冶・錬気
// ══════════════════════════════════════════════════════════

/**
 * 鍛冶（銘強化）だけのタブ。
 *
 * ★2026-08-13 オーナー指示で錬気と分けた。以前は1画面に両方あり、
 *   錬気は画面のいちばん下だったので、そこへ行くだけで毎回スクロールが要った。
 * ★一覧だけ描き直せるように切り出してある（鍛えるたびに画面の先頭へ飛ばされないため）。
 *   ★鍛冶石の残数**もこの枠の中**に入れること。外に置くと、鍛えても数字だけ古いまま残る
 */
function renderForge(ctx, root) {
  const forgeBox = h('div');
  root.appendChild(forgeBox);
  drawForge(ctx, forgeBox);
}

/**
 * 錬気だけのタブ。
 *
 * ★**この枠の中だけ描き直す**（2026-08-10 オーナー要望
 *   「大量に上げたいときにいちいち上の方まで画面を戻されてしまい面倒」）。
 *   `ctx.render()` を呼ぶと画面が先頭へ飛ぶので、1回上げるたびに迷子になっていた。
 *   因果盤（screen_board.js の drawInto）と同じ作り
 */
function renderRenki(ctx, root) {
  const renkiBox = h('div');
  root.appendChild(renkiBox);
  drawRenki(ctx, renkiBox);
}

/**
 * 使うわざのタブ（2026-08-13 オーナー指示
 * 「使う技も別ページにして、錬気と同様に各キャラのアイコンで、それぞれ表示できるようにしよう。
 *   全キャラを表示すると縦が長い」）。
 *
 * ★**表示するのは1人ぶんだけ**。以前は編成タブの下に出撃4人ぶんを縦に並べていたので、
 *   1人5〜6わざ×4人＝24行あり、下の仲間はスクロールしないと見えなかった。
 * ★切り替えは**この枠の中だけ**描き直す（錬気と同じ理由。`ctx.go` だと先頭へ飛ぶ）。
 * ★対象は出撃メンバーではなく**仲間全員**。誰を連れて行くか決める前に
 *   「この人は何ができるか」を見比べたい場面なので、控えも引けるようにしてある。
 */
function renderSkills(ctx, root) {
  const box = h('div');
  root.appendChild(box);
  drawSkills(ctx, box);
}

function drawSkills(ctx, host) {
  swapInto(host, (root) => buildSkills(ctx, root, () => drawSkills(ctx, host)));
}

function buildSkills(ctx, root, redraw) {
  const save = ctx.save;
  const roster = Rc.roster(save);

  if (roster.length === 0) {
    root.appendChild(h('p', 'small dim', '仲間がいません。'));
    return;
  }

  const cur = ctx.state.params || {};
  // 仲間が増減しても迷子にならないよう、知らないIDなら先頭へ戻す
  if (!roster.some((x) => x.id === cur.schar)) cur.schar = roster[0].id;
  const charId = cur.schar;
  const c = CHAR_BY_ID[charId];
  const lv = save.chars?.[charId]?.lv || 1;

  root.appendChild(h('div', 'charpick', roster.map((x) => h('button', {
    class: `charpick__btn${x.id === charId ? ' charpick__btn--on' : ''}`,
    type: 'button',
    'aria-pressed': x.id === charId ? 'true' : 'false',
    onclick: () => { cur.schar = x.id; redraw(); },
  }, [
    mon({ ...CHAR_BY_ID[x.id], alive: true }, 'sm'),
    h('span', 'charpick__name', x.name),
  ]))));

  const out = save.party.active.includes(charId);
  root.appendChild(h('div', 'panel panel--flat', [
    h('div', 'gold', [c.name, ' ', lineTag(c.line), `　Lv${lv}`]),
    h('div', 'list__sub', `${c.role}${out ? '' : '／いまは出撃していません'}`),
  ]));

  /**
   * ── いまの数値（2026-08-14 オーナー指示で人物帳から移した）──
   * ★かっこの中は「素の値との差」＝装備・錬気・因果盤で上がっているぶん。
   *   合計だけ出すと、装備を替えた効果が見えない。
   */
  const sc2 = save.chars[charId] || { lv, renki: {} };
  const stNow = G.finalStats(save, charId);
  const stBase = statsAt(charId, sc2.lv || lv, sc2.renki || {});
  root.appendChild(h('div', { class: 'btn-row', style: 'margin-top:10px;align-items:center' }, [
    h('h2', { class: 'sec-title', style: 'margin:0;flex:1 1 auto' }, 'いまの数値'),
    helpBtn('ステータスの読み方', STAT_HELP),
  ]));
  const stPanel = h('div', 'panel');
  for (const k of ['hp', 'ki', 'atk', 'def', 'spd', 'mag', 'luk']) {
    const diff = (stNow[k] || 0) - (stBase[k] || 0);
    stPanel.appendChild(h('div', 'kv', [
      h('span', 'kv__k', STAT_LABEL[k]),
      h('span', 'kv__v', [
        n(stNow[k] || 0),
        diff !== 0 ? h('span', { class: diff > 0 ? 'up small' : 'down small' }, ` (${diff > 0 ? '+' : ''}${diff})`) : null,
      ]),
    ]));
  }
  if (stNow.meguri) {
    stPanel.appendChild(h('div', 'kv', [
      h('span', 'kv__k', '気の巡り'), h('span', 'kv__v', `+${stNow.meguri}／ターン`),
    ]));
  }
  root.appendChild(stPanel);

  root.appendChild(h('h2', 'sec-title', '使うわざ'));
  root.appendChild(h('p', 'small dim',
    '自動戦闘は、ここにあるわざの中からしか選びません。レベルが上がると増えます。'));

  for (const sid of skillsAt(charId, lv)) {
    const s = SKILLS[sid];
    if (!s) continue;
    root.appendChild(h('div', { class: 'list__item', style: 'cursor:default' }, [
      h('div', 'list__main', [
        h('div', null, [lineTag(s.line), ' ', s.name]),
        h('div', 'list__sub', s.desc),
      ]),
      h('div', 'list__right dim', s.ki ? `気${s.ki}` : '—'),
    ]));
  }

  // 次の目標を出す。出さないと「もう増えないのか」が分からない
  const next = nextLearn(charId, lv);
  root.appendChild(h('p', 'small dim', next
    ? `次のわざは Lv${next.lv}（あと${next.lv - lv}）`
    : 'わざはすべて覚えました'));
}

/**
 * 鍛冶（銘強化）の一覧。枠でしぼる＋1ページ10件（2026-08-10 オーナー要望）。
 *
 * ★以前は「上位40件を出して、残りは『ほか○個は省略しています』と書くだけ」だった。
 *   省略された物には**手の届きようが無い**ので、稀少度の低い物を鍛えたい人は詰んでいた。
 */
function drawForge(ctx, host) {
  // ★宛先は常に画面に付いている枠（drawInv のコメント参照）
  const redraw = () => drawForge(ctx, host);
  swapInto(host, (root) => buildForge(ctx, root, redraw));
}

function buildForge(ctx, root, redraw) {
  const save = ctx.save;
  const stones = save.inv.mats?.[G.STONE] || 0;

  root.appendChild(h('h2', 'sec-title', '鍛冶（銘強化）'));
  // ※ここはプレーンテキストなので Markdown の記法は使わない（そのまま表示されてしまう）
  root.appendChild(h('p', 'small dim', [
    `鍛冶石 ${n(stones)}個。`,
    h('span', 'gold', '失敗はありません'),
    '。+10まで鍛えられます。',
    h('br'),
    'つまみを動かすと、行に',
    h('span', 'gold', '要るものの数'),
    'が出ます。',
    h('br'),
    // ★2026-08-12 オーナー指示で月齢素材も要るようになった。
    //   「押してから足りないと分かる」を作らないよう、行にも要る数を出してある
    '装備ごとに、',
    h('span', 'gold', '月齢素材'),
    'も要ります（鍛えるほど数が増えます）。素材は月が変わると採れるものが変わります。',
  ]));

  const all = (save.inv.equips || []).map(G.unpackEquip)
    .filter((e) => e.plus < G.ENHANCE_MAX)
    .sort((a, b) => (G.equipRarity(b) - G.equipRarity(a)) || (b.lv - a.lv) || (b.plus - a.plus));

  if (all.length === 0) {
    root.appendChild(h('p', 'small dim', '鍛えられる装備がありません。'));
    return;
  }

  const BASE_BY_ID = new Map(BASES.map((x) => [x.id, x]));
  const slotOf = (e) => ({ weapon: 0, armor: 1, charm: 2 })[BASE_BY_ID.get(e.baseId)?.slot];

  const cur = ctx.state.params || {};
  const filter = cur.fslot;
  const setSlot = (v) => { cur.fslot = v; cur.fpage = 0; redraw(); };
  root.appendChild(h('div', 'btn-row', [
    h('button', {
      class: `btn btn--sm${filter == null ? ' btn--primary' : ''}`, type: 'button',
      onclick: () => setSlot(null),
    }, 'すべて'),
    ...SLOT_LABEL.map((label, i) => h('button', {
      class: `btn btn--sm${filter === i ? ' btn--primary' : ''}`, type: 'button',
      onclick: () => setSlot(i),
    }, label)),
  ]));

  const listed = filter == null ? all : all.filter((e) => slotOf(e) === filter);
  if (listed.length === 0) {
    root.appendChild(h('p', 'small dim', `鍛えられる${SLOT_LABEL[filter]}がありません。`));
    return;
  }

  const pages = Math.max(1, Math.ceil(listed.length / PAGE));
  // ★+10まで鍛えると一覧から消えるので、最後のページが無くなることがある。
  //   はみ出したページ番号はここで戻す（空の一覧を出さない）
  const page = Math.min(Math.max(0, Number(cur.fpage) || 0), pages - 1);
  cur.fpage = page;

  const list = h('div', 'list');
  for (const e of listed.slice(page * PAGE, page * PAGE + PAGE)) {
    list.appendChild(forgeRow(ctx, { e, slotIdx: slotOf(e), stones, redraw }));
  }
  root.appendChild(list);
  const nav = pager(page, pages, (p) => { cur.fpage = p; redraw(); });
  if (nav) root.appendChild(nav);
}

/**
 * 鍛冶1行（スライダー＋確定ボタン・2026-08-11 オーナー要望）。
 *
 * ★錬気とまったく同じ操作にそろえてある。以前は「+1ぶんの石」ボタンだけで、
 *   +0 から +10 まで鍛えるのに 10 回の確認ダイアログを往復させていた。
 * ★つまみは **0 から始める**。0 のあいだは灰色の「0」で、この装備は
 *   触らないことをはっきり示す。
 * ★石は全装備で共有なので、可動域はその行を描いた時点の残数で決まる。
 *   確定したら `redraw()` で全行が引き直される。
 */
/**
 * つまみを動かしたときのボタンの見た目（鍛冶・錬気で共通）。
 *
 * ★ボタンには**数を書かない**（2026-08-16 オーナー指示
 *   「決定ボタンに使う鍛冶石の総数を書くのをやめたい。他素材と同じように並べて書いて」）。
 *   鍛冶は鍛冶石・月齢素材・銭の3つを使うのに、ボタンに載るのは鍛冶石だけだった。
 *   1つだけボタンに出ていると、それが「押すのに要るもの全部」に見える。
 * ★ただし**いくら要るのかを画面から消してはいけない**。押した瞬間に素材が減る（戻せない）。
 *   → 行の説明へ、要るものを同じ並びで出す（下の `sync`）。ボタンは「決定」だけにする。
 *   数字が消えたので、数字を指していたオレンジの吹き出し（btn__go）もやめる。
 * ★0のときは「決定」を出さない。触っていない行にまで並ぶと、
 *   どこを動かしたのか分からなくなる（0を灰色にした狙いが消える）。
 */
function setGo(btn) {
  btn.textContent = '決定';
  btn.disabled = false;
  btn.className = 'btn btn--sm btn--primary';
}

function forgeRow(ctx, { e, slotIdx, stones, redraw }) {
  const save = ctx.save;
  // ★この装備に要る月齢素材（2026-08-12。装備ごとに違う）
  const matId = G.enhanceMatOf(e);
  const matName = G.MAT_NAME[matId] || '素材';
  const moonHave = save.inv.mats?.[matId] || 0;
  // ★銭も要る（2026-08-13 オーナー指示）。値段は装備の階層に比例する
  const zeniHave = save.inv.zeni || 0;
  const room = R.enhanceAffordable(e.plus, G.ENHANCE_MAX, stones, moonHave, zeniHave, e.lv || 1);
  const title = h('div', `rar-${G.equipRarity(e)}`, G.equipName(e));
  const sub = h('div', 'list__sub');
  const btn = h('button', { class: 'btn btn--sm', type: 'button' });
  const row = h('div', 'forge-row');
  const baseLine = () => `${SLOT_LABEL[slotIdx] || ''}　+${e.plus}　効果 ×${R.enhanceMul(e.plus).toFixed(2)}`;

  if (room === 0) {
    // 次の1段階すら鍛えられない。**何がいくら足りないか**を出す（黙って灰色にしない）
    const need = R.enhanceCost(e.plus);
    const moonNeed = R.enhanceMoonCost(e.plus);
    // ★足りないほうを名指しする。「素材が足りません」だけだと、
    //   石を集めればいいのか月を待てばいいのか分からない
    const zeniNeed = R.enhanceZeni(e.plus, e.lv || 1);
    const lackStone = stones < need;
    const lackZeni = !lackStone && moonHave >= moonNeed && zeniHave < zeniNeed;
    const lack = lackStone
      ? `鍛冶石が${need - stones}個たりません`
      : (lackZeni ? `銭が${zeniText(zeniNeed - zeniHave)}たりません`
        : `${matName}が${moonNeed - moonHave}個たりません`);
    // ★要るものは「持ち／要る」で3つとも並べる（決定ボタンから数字を外したのと同じ理由）
    sub.textContent = `${baseLine()}　／ 鍛冶石 ${stones}／${need}　／ ${matName} ${moonHave}／${moonNeed}　／ 銭 ${zeniText(zeniNeed)}`;
    btn.disabled = true;
    btn.textContent = lackStone ? `${need}` : (lackZeni ? '銭' : `${moonNeed}`);
    btn.setAttribute('aria-label', `1段階鍛えるには鍛冶石${need}個・${matName}${moonNeed}個・銭${zeniText(zeniNeed)}が要ります（${lack}）`);
    btn.title = lack;
    /**
     * ★鍛えられない行だと**ひと目で分かるようにする**（2026-08-16 オーナー指摘
     *   「錬気とか鍛冶ができるか否かが分かりづらい。できるものは色分けしてほしい」）。
     * ★色だけに頼らない（spec §13-4）。何がいくら足りないかを**文字でも出す**。
     *   それまでは `btn.title`（マウスを載せたときの吹き出し）にしか書いておらず、
     *   スマホでは読む手段が無かった。
     */
    row.className = 'forge-row forge-row--lack';
    title.appendChild(h('span', 'small warn', `　${lack}`));
    row.appendChild(h('div', { class: 'kv', style: 'align-items:center' }, [
      h('div', 'list__main', [title, sub]), btn,
    ]));
    return row;
  }
  // ここから下は鍛えられる行。枠の色でも分かるようにする
  row.className = 'forge-row forge-row--ok';

  const slider = h('input', {
    type: 'range', class: 'renki__range',
    min: '0', max: String(room), value: '0', step: '1',
    'aria-label': `${G.equipName(e)} を何段階鍛えるか`,
  });

  const sync = () => {
    const add = Number(slider.value) || 0;
    const cost = R.enhanceCostTotal(e.plus, add);
    const moon = R.enhanceMoonTotal(e.plus, add);
    const zeni = R.enhanceZeniTotal(e.plus, add, e.lv || 1);
    if (add === 0) {
      sub.textContent = `${baseLine()}　／ ${matName} ${moonHave}個　／ 銭 ${zeniText(zeniHave)}`;
      btn.textContent = '0';
      btn.disabled = true;
      btn.className = 'btn btn--sm btn--zero';
      btn.setAttribute('aria-label', `${G.equipName(e)} は鍛えません`);
      btn.title = 'つまみを動かすと鍛えられます';
      row.className = 'forge-row forge-row--ok forge-row--zero';
      return;
    }
    // ★要るものは3つとも同じ並びで出す（鍛冶石だけボタン側、にしない）
    sub.textContent = `${SLOT_LABEL[slotIdx] || ''}　+${e.plus} → +${e.plus + add}　効果 ×${R.enhanceMul(e.plus).toFixed(2)} → ×${R.enhanceMul(e.plus + add).toFixed(2)}　／ 鍛冶石 ${cost}個　／ ${matName} ${moon}個　／ 銭 ${zeniText(zeni)}`;
    setGo(btn);
    btn.setAttribute('aria-label', `${G.equipName(e)} を ${add} 段階鍛える（鍛冶石 ${cost}個・${matName} ${moon}個・銭 ${zeniText(zeni)}）`);
    btn.title = `鍛冶石${cost}個・${matName}${moon}個・銭${zeniText(zeni)}をつかって +${e.plus} → +${e.plus + add}`;
    row.className = 'forge-row forge-row--ok';
  };
  sync();
  slider.addEventListener('input', sync);

  btn.addEventListener('click', async () => {
    const add = Number(slider.value) || 0;
    if (add === 0) return;
    const cost = R.enhanceCostTotal(e.plus, add);
    const moon = R.enhanceMoonTotal(e.plus, add);
    const zeni = R.enhanceZeniTotal(e.plus, add, e.lv || 1);
    // 押した瞬間に素材と銭が減る。押し間違いが痛いので一度だけ確かめる
    const ok = await confirmOnce(ctx, 'kaji',
      `${G.equipName(e)} を鍛えます。
鍛冶石 ${cost} 個・${matName} ${moon} 個・銭 ${zeniText(zeni)} をつかって +${e.plus} → +${e.plus + add} になります。`,
      '鍛える', 'やめる');
    if (!ok) return;
    const r = G.enhanceMany(save, e.uid, add);
    if (!r.ok) {
      toast(r.reason === 'material' ? `鍛冶石が${r.need - r.have}個たりません`
        : r.reason === 'moon' ? `${G.MAT_NAME[r.matId] || '素材'}が${r.need - r.have}個たりません`
          : r.reason === 'zeni' ? `銭が${zeniText(r.need - r.have)}たりません`
            : '鍛えられません');
      return;
    }
    // 途中で石が足りなくなっても、そこまでは成立している
    toast(r.done === add ? `+${r.plus} になった` : `+${r.plus} になった（石が足りず ${r.done} 段階まで）`);
    ctx.saveNow(true);
    redraw();
  });

  row.appendChild(h('div', { class: 'kv', style: 'align-items:center' }, [
    h('div', 'list__main', [title, sub]), btn,
  ]));
  row.appendChild(slider);
  return row;
}

/**
 * 錬気（ステータス上げ）。**ここだけ描き直せる**ように独立させてある。
 *
 * ★スライダーで「何ポイント上げるか」を決めて、ボタンで確定する（2026-08-10 オーナー要望）。
 *   以前は1ポイントごとに確認ダイアログ＋全画面再描画で、20ポイント上げるのに
 *   20往復かかっていた。
 * ★上限は `G.renkiMaxOf(save)` から取る。`R.renkiMax()` だけを見ていたせいで、
 *   因果盤の「錬気の上限 +N」が画面に反映されず、盤で開けたぶんが使えなかった
 *   （この画面だけがズレていた。エンジン側は正しかった）。
 */
function drawRenki(ctx, host) {
  // ★宛先は常に画面に付いている枠（drawInv のコメント参照）
  const redraw = () => drawRenki(ctx, host);
  swapInto(host, (root) => buildRenki(ctx, root, redraw));
}

function buildRenki(ctx, root, redraw) {
  const save = ctx.save;
  const rmats = save.inv.mats?.[G.RENKI_MAT] || 0;
  const max = G.renkiMaxOf(save);

  /**
   * ★ここにも値の説明を置く（2026-08-15 オーナー指示
   *   「錬気のページでも、ヘルプマークを押すと、ステータスページで読めるような
   *     各ステータスの説明文を表示するようにしてください」）。
   *   どれを伸ばすか決める画面なので、**決める場所に説明が要る**。
   *   文面は `STAT_HELP` を共有する（2か所に書くと、片方だけ古くなる）。
   */
  /**
   * ★「？」は**1つにまとめる**（2026-08-16 オーナー指摘
   *   「ヘルプマークだけで1行使っている箇所が多い」）。
   *   このタブの見出しはここ1つきりなので、タブの説明を別行に出すと「？」だけの行ができる。
   *   錬気そのものの説明と、各ステータスの読み方を1つの「？」に続けて入れる。
   */
  root.appendChild(h('div', { class: 'btn-row', style: 'align-items:center' }, [
    h('h2', { class: 'sec-title', style: 'margin:0;flex:1 1 auto' }, '錬気（ステータス上げ）'),
    helpBtn(HELP.renki.title, `${HELP.renki.text}\n\n${STAT_HELP}`),
  ]));
  // ★見出しに「素材の必要数」と置いて、各行のボタンは**数字だけ**にする
  //   （オーナー指示。「素材〇」というボタン文言が押す気にならない、という指摘）
  /**
   * ★何個要るかは**各行に出す**（2026-08-16 オーナー指摘
   *   「各ステータスにそれぞれ何個素材が必要か分かりにくい」）。
   *   それまでは、つまみを動かすまでボタンに数が出なかったので、
   *   「次の1つにいくら要るのか」を知るには7項目すべてを動かしてみるしかなかった。
   */
  /**
   * ★「錬気玉◯個／上限25」と並べない（2026-08-16 オーナー指摘
   *   「右側は錬気玉の数値じゃないし、ユーザーが混乱する」）。
   *   「◯個／上限25」は、同じ物の**持ち数と入れ物の大きさ**に見える。
   *   実際の上限はステータスを伸ばせる幅なので、何の上限かを言葉で書く。
   */
  root.appendChild(h('p', 'small dim', [
    `錬気玉 ${n(rmats)}個。錬気の上限 ${max}。`,
    h('br'),
    '各行の「＋1に錬気玉◯個」が、次の1つに要る数です。',
  ]));

  // ── 誰を伸ばすか（2026-08-11 オーナー要望）──
  // ★以前は出撃メンバー全員ぶんを縦に並べていた。4人×7項目＝28行あり、
  //   下のほうの仲間はスクロールしないと見えなかった。
  //   ここで1人ぶんに絞る。**切り替えは局所再描画**で行う（ctx.go だと画面が
  //   先頭へ飛び、錬気は画面のいちばん下にあるので毎回スクロールし直しになる）。
  /**
   * ★**仲間全員**を並べる（2026-08-16 オーナー指示
   *   「編成中メンバーだけじゃなく、全メンバーをステ上げできるように
   *     各キャラのアイコンを置いておいて」）。
   *   錬気は塔に入らなくてもできる支度なので、出撃の有無で絞る理由が無い。
   *   控えを先に育ててから編成に入れる、という順序も塞がない。
   *   ★装備タブと同じ `Rc.roster` を使う（並び順と対象をそろえる）。
   */
  const ids = Rc.roster(save).map((x) => x.id).filter((id) => CHAR_BY_ID[id] && save.chars[id]);
  if (ids.length === 0) {
    root.appendChild(h('p', 'small dim', 'まだ仲間がいません。'));
    return;
  }
  const cur = ctx.state.params || {};
  // 仲間が増減すると、前に選んでいた相手がいなくなることがある。そのときは先頭へ戻す
  if (!ids.includes(cur.rchar)) cur.rchar = ids[0];
  const charId = cur.rchar;

  root.appendChild(h('div', 'charpick', ids.map((id) => {
    const cc = CHAR_BY_ID[id];
    const on = id === charId;
    return h('button', {
      class: `charpick__btn${on ? ' charpick__btn--on' : ''}`,
      type: 'button',
      'aria-pressed': on ? 'true' : 'false',
      onclick: () => { cur.rchar = id; redraw(); },
    }, [
      mon({ ...cc, alive: true }, 'sm'),
      h('span', 'charpick__name', cc.name),
    ]);
  })));

  const c = CHAR_BY_ID[charId];
  const sc = save.chars[charId];
  const panel = h('div', 'panel panel--flat', [h('div', 'gold', `${c.name}　Lv${sc.lv}`)]);
  for (const k of G.RENKI_KEYS) {
    panel.appendChild(renkiRow(ctx, { id: charId, name: c.name, k, sc, max, rmats, redraw }));
  }
  root.appendChild(panel);
}

/** 錬気1行（スライダー＋確定ボタン） */
function renkiRow(ctx, { id, name, k, sc, max, rmats, redraw }) {
  const cur = sc.renki?.[k] || 0;
  // 素材と上限の**両方**で決まる可動域。0なら動かせない
  const room = R.renkiAffordable(cur, max, rmats);
  const label = h('span', 'kv__k');
  const btn = h('button', { class: 'btn btn--sm' });

  // ★つまみが出せない行にも `.renki` を付ける。ここだけ素の div にすると、
  //   行の高さ（.renki .btn の margin 打ち消し）が揃わないうえ、
  //   検証スクリプトが「7項目ぶんの行」を数えられない
  const flat = (extra) => h('div', `renki${extra || ''}`, [
    h('div', { class: 'kv', style: 'align-items:center' }, [label, btn]),
  ]);

  /**
   * ★行に「＋1に錬気玉◯」を出す（2026-08-16 オーナー指摘
   *   「各ステータスにそれぞれ何個素材が必要か分かりにくい」）。
   *   錬気の値段は**いまの値で変わる**（`R.renkiCost(cur)`）ので、7項目それぞれ違う。
   *   つまみを動かさないと分からない状態だと、どこから伸ばすか決めようがない。
   */
  const nextCost = R.renkiCost(cur);

  /**
   * ★伸ばせる行と伸ばせない行を**枠の色でも分ける**（2026-08-16 オーナー指摘
   *   「錬気とか鍛冶ができるか否かが分かりづらい。できるものは色分けしてほしい」）。
   *   7項目が同じ見た目で並ぶので、つまみの有無だけでは見分けに目が要った。
   * ★色だけに頼らない（spec §13-4）。理由（上限／いくら足りない）は文字でも出す。
   */
  if (cur >= max) {
    label.textContent = `${STAT_LABEL[k]}　${cur}／${max}　これ以上は伸ばせません`;
    btn.disabled = true;
    btn.textContent = '上限';
    return flat(' renki--lack');
  }
  if (room === 0) {
    // 次の1ポイントすら買えない。**いくら足りないか**を出す（黙って灰色にしない）
    label.textContent = `${STAT_LABEL[k]}　${cur}／${max}　＋1に錬気玉${nextCost}個（${nextCost - rmats}個たりません）`;
    btn.disabled = true;
    btn.textContent = `${nextCost}`;
    btn.setAttribute('aria-label', `${STAT_LABEL[k]} を1上げるには錬気玉が${nextCost}個要ります（${nextCost - rmats}個たりません）`);
    btn.title = `錬気玉が${nextCost - rmats}個たりません`;
    return flat(' renki--lack');
  }

  // ★つまみは **0 から始める**（2026-08-11 オーナー要望）。
  //   1 から始めると、触っていない行まで「素材を使う気でいる」ように見え、
  //   7項目のうちどこを動かしたのかが分からなくなる。
  const slider = h('input', {
    type: 'range', class: 'renki__range',
    min: '0', max: String(room), value: '0', step: '1',
    'aria-label': `${name} の ${STAT_LABEL[k]} を何ポイント伸ばすか`,
  });

  const row = h('div', 'renki renki--ok');

  const sync = () => {
    const add = Number(slider.value) || 0;
    const cost = R.renkiCostTotal(cur, add);
    // 0＝この項目は変えない。灰色の「0」で、触っていないことをはっきり示す
    if (add === 0) {
      // ★動かしていない行でも「次の1つにいくら要るか」は出しておく
      label.textContent = `${STAT_LABEL[k]}　${cur}／${max}　＋1に錬気玉${nextCost}個`;
      btn.textContent = '0';
      btn.disabled = true;
      btn.className = 'btn btn--sm btn--zero';
      btn.setAttribute('aria-label', `${STAT_LABEL[k]} は変えません（次の1つに錬気玉${nextCost}個）`);
      btn.title = 'つまみを動かすと伸ばせます';
      row.className = 'renki renki--ok renki--zero';
      return;
    }
    label.textContent = `${STAT_LABEL[k]}　${cur} → ${cur + add}／${max}　錬気玉${cost}個`;
    setGo(btn);
    // ★ボタンの見た目は数字だけなので、読み上げには意味のある文を渡す
    btn.setAttribute('aria-label', `${STAT_LABEL[k]} を ${add} 上げる（錬気玉 ${cost}個）`);
    btn.title = `錬気玉を${cost}個つかって ${cur} → ${cur + add}`;
    row.className = 'renki renki--ok';
  };
  sync();
  // ★input（つまみを動かしている最中）で追従させる。change だけだと
  //   指を離すまで数字が変わらず、いくら要るのか見ながら決められない
  slider.addEventListener('input', sync);

  btn.addEventListener('click', async () => {
    const add = Number(slider.value) || 0;
    if (add === 0) return;              // 0 のときは押せないが、念のため
    const cost = R.renkiCostTotal(cur, add);
    // ★確認は残す（素材は戻せない）。ただし**まとめて1回**なので、
    //   以前のように1ポイントごとに聞かれることはない
    const ok = await confirmOnce(ctx, 'renki',
      `${name} の ${STAT_LABEL[k]} を伸ばします。
錬気玉を ${cost} 個つかって ${cur} → ${cur + add} になります。`,
      '伸ばす', 'やめる');
    if (!ok) return;
    const r = G.renkiMany(ctx.save, id, k, add);
    if (!r.ok) {
      toast(r.reason === 'material' ? `錬気玉が${r.need - r.have}個たりません` : r.reason === 'max' ? '上限です' : '上げられません');
      return;
    }
    // 途中で足りなくなっても、そこまでは成立している
    toast(r.done === add
      ? `${STAT_LABEL[k]} が ${r.value} になった`
      : `${STAT_LABEL[k]} が ${r.value} になった（錬気玉が足りず ${r.done} ぶんまで）`);
    ctx.saveNow(true);
    redraw();
  });

  row.appendChild(h('div', { class: 'kv', style: 'align-items:center' }, [label, btn]));
  row.appendChild(slider);
  return row;
}

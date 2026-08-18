/**
 * 戦闘画面（spec §2-1 のレイアウト）
 *
 * 【この画面の核】敵の【構え】が常に1手先に見えていること。
 * ここが読めれば絵がなくても駆け引きが成立する、というのが本作の前提。
 *
 * オートが本線（spec §3-8-1）。プレイヤーが決めるのは作戦・編成・装備で、
 * 毎ターンの操作は任意。モードは **[オート] ⇄ [手動] の2つだけ**
 * （2026-08-11 オーナー指示）。手動に切り替えたら、**その場から**手動が続く。
 *
 * ★以前は [オート] → [このターンだけ手動] → [ずっと手動] の3つを巡回していたが、
 *   1回押しただけでは何が起きるのか分からず、押し間違えると1ターンだけ手動になって
 *   すぐオートへ戻る（＝押したのに戻っている）という挙動になっていた。
 *
 * 実装はエンジンの battleSteps() を1ステップずつ進めるだけ。
 * ロジックはここに一切書かない（シミュレーターと同じ結果になることが担保される）。
 */

import { h, mon, bar, telegraph, lineTag, clear, wait, toast, alertBox, customModal, fxOff, shakeScreen } from './dom.js';
import { playSe } from './audio.js';
import { FX_RANK, fxIdOf, seForLines } from './battle_fx.js';
import { battleSteps } from '../battle/run.js';
import * as X from '../dungeon/explore.js';
import * as R from '../core/rules.js';
import { dexPercent } from '../meta/growth.js';
import { SKILLS, AILMENTS } from '../../data/skills.js';
import { ART_FX, fxSrc } from '../../assets/art-manifest.js';
import { canUse, kiCostOf, livingOf, battleUsable } from '../battle/engine.js';
import { ITEM_BY_ID } from '../../data/items.js';
import { TACTICS, availableTactics } from '../battle/tactics.js';
import { medFit, anyFit } from './med_target.js';
import { PHASE_EMOJI } from '../core/time.js';
import { TOWERS, floorName } from '../dungeon/towers.js';
import { endRun } from './run_flow.js';
import { afterBoss } from './story_flow.js';

const MODE_LABEL = { auto: 'オート', manual: '手動' };

/**
 * 画面の世代番号。
 * 戦闘の進行は非同期ループなので、**画面を離れたあとも回り続けうる**。
 * 古い世代のループは、DOMを触る前にここで自分を止める。
 * 入れておかないと、戦闘中に別画面へ行ける導線を1つ足した瞬間に
 * 「ループが2本走って報酬・ドロップ・灯が二重計上される」事故になる（2026-08-02 レビュー指摘）。
 */
let epoch = 0;

export function render(ctx) {
  const ev = ctx.state.params?.ev;
  const run = ctx.state.run;
  if (!ev || !run) {
    // 直接この画面に来た（リロード等）。安全に拠点へ戻す
    setTimeout(() => ctx.go(run ? 'explore' : 'home'), 0);
    return h('div', 'panel', '戦闘の情報が見つかりませんでした。');
  }

  const root = h('div');
  const myEpoch = ++epoch;
  const st = {
    ctx, run, ev, epoch: myEpoch,
    // 設定「ボス戦は手動から始める」はここで効かせる（spec §3-8-4）
    mode: (ev.isBoss && ctx.save.settings?.bossManual) ? 'manual'
      : (ctx.save.settings?.battleMode === 'manual' ? 'manual' : 'auto'),
    paused: false,
    speed: ctx.save.progress?.cleared ? (ctx.save.settings?.speed || 1) : 1,   // 倍速は本編クリア後（spec §3-7）
    resolveInput: null,
    battle: null,
    pick: null,          // 手動入力中の {unit, skillId}
  };

  // 画面の骨組み。中身は進行に合わせて差し替える
  st.el = {
    status: h('div'),
    // ログは敵の上に**1行だけ**（2026-08-05 オーナー指示）。
    // 数字はキャラの上へ飛ばすので、ここは「何が起きたか」の一文に絞る
    log: h('p', { class: 'battle-line', 'aria-live': 'polite' }, ''),
    enemies: h('div', 'enemies'),
    timeline: h('div', 'timeline'),
    gauge: h('div', 'gauge-crush'),
    party: h('div', 'party party--row'),
    // ダメージの数字を置く層。**再描画されるパネルの外**に出しておく。
    // 中に入れると、次のステップの drawEnemies/drawParty の clear() で消える
    fx: h('div', 'fxlayer', ''),
    cmd: h('div'),
    controls: h('div', 'controls'),
  };
  st.nodeOf = new Map();   // ユニット → その紋のDOM（数字を飛ばす位置決めに使う）

  const stage = h('div', 'battle-stage', [
    h('div', 'panel', [st.el.log, st.el.enemies, st.el.timeline, st.el.gauge]),
    h('div', 'panel', st.el.party),
    st.el.fx,
  ]);
  root.appendChild(st.el.status);
  root.appendChild(stage);
  root.appendChild(st.el.cmd);
  root.appendChild(st.el.controls);

  drawControls(st);
  // 描画がDOMに入ってから回し始める。
  // ★必ず catch を付ける。付けないと例外が unhandledrejection として静かに消え、
  //   プレイヤーは戦闘画面で永久に固まる（潜行状態は保存されないので周回が丸ごと消える）
  setTimeout(() => {
    play(st).catch(async (e) => {
      console.error(e);
      if (st.epoch !== epoch) return;
      await alertBox('戦闘の進行でエラーが起きました。祠へ戻ります。（ここまでの記録は残っています）');
      ctx.state.run = null;
      ctx.go('home');
    });
  }, 0);
  return root;
}

// ── 進行 ──────────────────────────────────────────────────

async function play(st) {
  const { ev, run } = st;
  preloadFx(st);
  const it = battleSteps({
    ...ev.opts,
    // ★毎回この場で読むので、手動に切り替えた**次の1人から**すぐ手動になる
    //   （オーナー指示「手動にしたら、その場面から手動にしてください」）
    manualFor: () => st.mode === 'manual',
  });

  let r = it.next();
  while (!r.done) {
    if (st.epoch !== epoch) return;      // 画面を離れた。古いDOMを触らずに止まる
    const s = r.value;
    st.battle = s.battle;

    drawAll(st, s);

    if (s.type === 'needInput') {
      const action = await askInput(st, s.unit);
      if (st.epoch !== epoch) return;
      r = it.next(action);
      continue;
    }

    // 一時停止（作戦の見直し）
    while (st.paused && st.epoch === epoch) await wait(120, 1);
    if (st.epoch !== epoch) return;

    // 演出の間。★ログを1行に絞ったぶん、1行が読めるまで待つ必要がある。
    //   「戦闘ペースは遅くなるけど致し方なし」（2026-08-05 オーナー了承済み）
    const ms = s.type === 'acted' ? 900 : s.type === 'stances' ? 620 : 180;
    await wait(ms, st.speed);
    r = it.next();
  }

  if (st.epoch !== epoch) return;
  drawAll(st, { type: 'end', battle: r.value.battle });
  // 戦闘が終わった合図（2026-08-11 オーナー要望）。★勝ったときだけ鳴らす。
  // 全滅は結果画面で `lose` が鳴るので二重になり、逃走で勝ちの音を鳴らすと嘘になる
  if (r.value.battle?.result === 'win') playSe('win');
  await wait(500, st.speed);
  if (st.epoch !== epoch) return;
  finish(st, r.value);
}

function finish(st, res) {
  const { ctx, run, ev } = st;
  const out = X.finishBattle(run, ev.node, res, ev.enemies, ev.isBoss);

  // ボスに敗れたとき。**全滅扱いにしない**（spec §4-5-b）ので、
  // 「どう立て直せばいいか」をここで必ず示す。
  // これが無いと同じボスに突撃し続けて詰まる（シミュレーターで実際に検出した）
  if (out.result === 'bossRetreat') {
    showBossHint(st);
    return;
  }
  if (run.over) { endRun(ctx, run); return; }

  const got = out.drops && out.drops.length ? `／${out.drops.length}点の装備を拾った` : '';
  // ★支塔の踏破は「勝った」で流さない。10〜15分の潜行の締めくくりなので、
  //   そうと分かる言葉にする（explore.finishBattle が返す cleared を使う）
  if (out.result === 'win' && out.cleared) {
    toast(`${TOWERS[run.tower]?.name || 'この塔'}を踏破した（EXP+${out.reward?.exp || 0}${got}）`);
  } else if (out.result === 'win') toast(`勝った（EXP+${out.reward?.exp || 0}${got}）`);
  else if (out.result === 'escape') toast('逃げ切った');

  // 層ボスを倒した直後の場面（spec §8-1）。読むものがあれば会話へ寄り道する
  if (out.result === 'win' && ev.isBoss && afterBoss(ctx, run)) return;
  ctx.go('explore');
}

function showBossHint(st) {
  customModal(({ close }) => buildBossHint(st, close));
}

function buildBossHint(st, close) {
  const { ctx, run, ev } = st;
  const boss = ev.enemies[0];
  const txt = document.getElementById('modalText');
  const btns = document.getElementById('modalBtns');
  const canGoBack = X.canUseAkari(run) || run.fuda > 0;

  txt.textContent = '';
  txt.appendChild(h('div', null, [
    h('p', 'gold', `${boss.name} に敗れた`),
    h('p', 'small', '来た道を引き返した。記録には残らないし、拾ったものも失っていない。'),
    boss.hint ? h('p', { class: 'panel', style: 'margin-top:10px' }, [
      h('div', 'small dim', '手がかり'),
      h('div', null, boss.hint),
    ]) : null,
    h('p', 'small dim', 'いったん下の階で鍛え直してから、もう一度挑むのが近道です。'),
  ]));

  btns.replaceChildren(
    h('button', {
      class: 'btn', onclick: () => { close(); ctx.go('explore'); },
    }, 'この階で続ける'),
    h('button', {
      class: 'btn btn--primary',
      // ★還りの灯も還り札も無いときは戻れない。探索画面と同じ判定にする。
      //   ここで塞がないと「ボスにわざと負ければ札なしで何度でも全戦利品を持ち帰れる」
      //   という抜け道になる（2026-08-02 レビュー指摘）。
      // ★灯の条件は `X.canUseAkari()` を通す（2026-08-11 に「5階ぶん進むまで灯らない」
      //   に変えたので、`run.kaeriNoHi` だけを見ると探索画面とズレる）。
      //   ここはボスのマスなので、還りの陣は使えない
      disabled: !canGoBack,
      onclick: () => {
        const r = X.retreat(run);
        if (!r.ok) {
          close();
          alertBox(r.reason === 'notLit'
            ? `還りの灯はあと${r.left}階ぶん進むと灯ります。還り札もありません。階段を探して自力で戻ってください。`
            : '還りの灯も還り札も残っていません。階段を探して自力で戻ってください。');
          ctx.go('explore');
          return;
        }
        close();
        endRun(ctx, run);
      },
    }, [
      canGoBack ? '印まで戻って鍛える' : '戻る手段がない',
      h('span', 'btn-sub', canGoBack
        ? '拾ったものは全部持ち帰ります。'
        : (X.akariLeft(run) > 0
          ? `還りの灯はあと${X.akariLeft(run)}階ぶん進むと灯ります。還り札もありません。`
          : '還りの灯を使い切り、還り札もありません。')),
    ]),
  );
  document.getElementById('modal').hidden = false;
}

// ── 手動入力 ──────────────────────────────────────────────

function askInput(st, unit) {
  return new Promise((resolve) => {
    st.pick = { unit, skillId: null };
    st.resolveInput = (action) => { st.pick = null; st.resolveInput = null; drawCmd(st); resolve(action); };
    drawCmd(st);
  });
}

function drawCmd(st) {
  const el = st.el.cmd;
  clear(el);
  if (!st.pick) return;

  const { unit } = st.pick;
  const b = st.battle;
  const enemies = livingOf(b.enemies);

  const panel = h('div', 'panel');
  panel.appendChild(h('div', 'gold', `${unit.name} は どうする？`));
  panel.appendChild(h('div', 'small dim', `気 ${Math.round(unit.ki)}／${unit.max.ki}`));

  // わざ一覧。★「いま狙える敵を崩せるか」を必ず出す（この画面の教育装置）
  const list = h('div', { class: 'list', style: 'margin-top:8px' });
  for (const sid of unit.skills) {
    const sk = SKILLS[sid];
    if (!sk) continue;
    const usable = canUse(unit, sk);
    const cost = kiCostOf(unit, sk);

    // 予告構えに対する相性（対象を選ぶ前でも、敵ごとの結果を出しておく）
    const marks = enemies.map((e) => {
      const aff = R.affinityOf(sk.line, e.nextAct ? e.nextAct.stance : null);
      if (aff === R.AFFINITY.CRUSH) return h('span', 'gold', ` ${e.mon}=崩し`);
      if (aff === R.AFFINITY.ADVERSE) return h('span', 'warn', ` ${e.mon}=逆風`);
      return h('span', 'dim', ` ${e.mon}=—`);
    });

    list.appendChild(h('button', {
      class: 'list__item', disabled: !usable,
      onclick: () => chooseSkill(st, sid),
    }, [
      h('div', 'list__main', [
        h('div', null, [lineTag(sk.line), ' ', sk.name, cost ? h('span', 'dim small', `（気${cost}）`) : null]),
        h('div', 'list__sub', sk.desc),
        h('div', 'list__sub', marks),
      ]),
    ]));
  }
  panel.appendChild(list);

  panel.appendChild(h('div', { class: 'btn-row', style: 'margin-top:8px' }, [
    h('button', {
      class: 'btn btn--sm',
      onclick: () => st.resolveInput(null),          // null = AIにまかせる
    }, 'まかせる'),
    /**
     * 道具（2026-08-13 オーナー指示「薬を導入したら、戦闘中でも手動にしたら
     * 道具も選べるようにしておいて」）。
     * ★1つも持っていないときは**押せない状態で出す**（消さない）。
     *   消すと「戦闘中は道具が使えない」と誤解される。
     */
    h('button', {
      class: 'btn btn--sm', disabled: itemStock(b).length === 0,
      onclick: () => chooseItem(st),
    }, itemStock(b).length === 0 ? '道具なし' : '道具'),
    h('button', {
      class: 'btn btn--sm btn--danger', disabled: b.bossFight || b.tokoyami,
      onclick: () => st.resolveInput({ kind: 'escape' }),
    }, b.bossFight ? '逃げられない' : (b.tokoyami ? '常闇では逃げられない' : '逃げる')),
  ]));

  el.appendChild(panel);
}

// ── 道具（2026-08-13） ────────────────────────────────────

/** いま戦闘中に使える道具（残りがあるものだけ） */
function itemStock(b) {
  const out = [];
  for (const [id, cnt] of Object.entries(b.pouch || {})) {
    const it = ITEM_BY_ID[id];
    if (it && cnt > 0 && battleUsable(it)) out.push({ item: it, count: cnt });
  }
  return out;
}

/**
 * 道具を選ぶ。
 *
 * ★**対象は選ばせる**（2026-08-16 オーナー指示
 *   「薬を使う場合、対象はユーザーが選べるようにしてください。戦闘パートも同様に」）。
 *   それまでは「一番困っている仲間へ」と自動で入れていた。手数は少ないが、
 *   丸薬を誰に乗せるか・蘇生を誰に使うかは、手動戦闘でいちばん決めたいところ。
 *   自動で済ませたい人には**そのまま作戦（道具を惜しむな）がある**ので、
 *   手動側は選べるほうへ寄せる。
 * ★使える相手が1人もいない道具は、ここで灰色にする。
 */
function chooseItem(st) {
  const b = st.battle;
  const { unit } = st.pick;
  const el = st.el.cmd;
  clear(el);

  const list = h('div', { class: 'list', style: 'margin-top:8px' });
  for (const { item: it, count } of itemStock(b)) {
    const usable = anyFit(it, b.allies);
    list.appendChild(h('button', {
      class: 'list__item', disabled: !usable,
      onclick: () => chooseItemTarget(st, it),
    }, [
      h('div', 'list__main', [
        h('div', null, [it.name, h('span', 'dim small', `（残り${count}）`)]),
        h('div', 'list__sub', it.desc),
      ]),
      usable ? null : h('div', 'list__right dim', 'いま使えない'),
    ]));
  }

  el.appendChild(h('div', 'panel', [
    h('div', 'gold', `${unit.name}｜どの道具を使う？`),
    list,
    h('button', { class: 'btn btn--sm', onclick: () => drawCmd(st) }, 'やめる'),
  ]));
}

/** 道具を誰に使うか（効かない相手は押せない。理由を右に出す） */
function chooseItemTarget(st, it) {
  const b = st.battle;
  const el = st.el.cmd;
  clear(el);

  const list = h('div', { class: 'list', style: 'margin-top:8px' });
  b.allies.forEach((u, i) => {
    const fit = medFit(it, u);
    list.appendChild(h('button', {
      class: 'list__item', disabled: !fit.ok,
      onclick: () => st.resolveInput({ kind: 'item', itemId: it.id, targetIndex: i }),
    }, [
      h('div', 'list__main', [
        h('div', null, u.name),
        h('div', 'list__sub dim', u.alive
          ? `HP ${Math.round(u.hp)}／${u.max.hp}　気 ${Math.round(u.ki)}／${u.max.ki}`
          : '力尽きている'),
      ]),
      h('div', 'list__right dim', fit.why),
    ]));
  });

  el.appendChild(h('div', 'panel', [
    h('div', 'gold', `${it.name}｜だれに使う？`),
    list,
    h('button', { class: 'btn btn--sm', onclick: () => chooseItem(st) }, '道具を選び直す'),
  ]));
}

function chooseSkill(st, skillId) {
  const sk = SKILLS[skillId];
  const b = st.battle;

  // 味方への回復は、いちばん減っている味方へ（対象選択で手間を増やさない）
  if (sk.heal || sk.target === 'ally') {
    const allies = livingOf(b.allies);
    let weak = allies[0];
    for (const a of allies) if (a.hp / a.max.hp < weak.hp / weak.max.hp) weak = a;
    st.resolveInput({ kind: 'skill', skillId, targetIndex: b.allies.indexOf(weak) });
    return;
  }
  if (sk.target === 'all' || sk.target === 'self' || sk.taunt) {
    st.resolveInput({ kind: 'skill', skillId, targetIndex: 0 });
    return;
  }

  const enemies = livingOf(b.enemies);
  if (enemies.length === 1) {
    st.resolveInput({ kind: 'skill', skillId, targetIndex: b.enemies.indexOf(enemies[0]) });
    return;
  }
  // 対象を選ぶ（敵の紋を押す）
  st.pick.skillId = skillId;
  drawEnemies(st);
  const el = st.el.cmd;
  clear(el);
  el.appendChild(h('div', 'panel', [
    h('div', 'gold', `${sk.name}｜だれに？`),
    h('div', 'small dim', '上の敵を押してください'),
    h('button', { class: 'btn btn--sm', style: 'margin-top:8px', onclick: () => { st.pick.skillId = null; drawEnemies(st); drawCmd(st); } }, 'わざを選び直す'),
  ]));
}

// ── 描画 ──────────────────────────────────────────────────

function drawAll(st, step) {
  drawStatus(st);
  st.nodeOf.clear();
  drawEnemies(st);
  drawTimeline(st, step);
  drawCrushEffect(st, step.lines);
  drawParty(st);
  if (step.lines && step.lines.length) {
    drawLog(st, step.lines);
    // 重なりは z-index で決めてあるので、この2つの呼ぶ順は見た目に影響しない
    popFx(st, step.lines);
    popNumbers(st, step.lines);
    shakeOnBigHit(step.lines);
    playStepSe(step.lines);
  }
}

/**
 * そのステップの効果音（2026-08-09 オーナー要望）。
 *
 * 判定そのものは `battle_fx.js` にある（DOMに触らないので、
 * `test.mjs` が**実際の戦闘ログを流して**「無音になる行が無いか」を検証できる）。
 */
function playStepSe(lines) {
  playSe(seForLines(lines));
}

/**
 * 大ダメージのとき画面を揺らす（2026-08-08 オーナー要望）。
 *
 * 相手の最大HPの **25%以上で小さく、50%以上で大きく**揺らす。
 * 敵・味方どちらが受けた場合も出す（「効いた」「まずい」が同じ言葉で伝わる）。
 *
 * ★割合は `l.amount` と `l.target.max.hp` から計算する。
 *   ログの文面を読んで判定しない（`popNumbers` と同じ理由。文型が増えるたびに壊れる）。
 * ★同じステップで複数当たったら、**いちばん大きい1回**で決める。
 *   全体攻撃で4回揺らすと画面が壊れたように見える。
 */
function shakeOnBigHit(lines) {
  let worst = 0;
  for (const l of lines) {
    if (l.kind !== 'damage' && l.kind !== 'crush' && l.kind !== 'adverse') continue;
    const max = l.target?.max?.hp;
    if (!max || !l.amount) continue;
    worst = Math.max(worst, l.amount / max);
  }
  if (worst >= 0.5) shakeScreen('big');
  else if (worst >= 0.25) shakeScreen('small');
}

function drawStatus(st) {
  const { run } = st;
  const el = st.el.status;
  clear(el);
  el.appendChild(h('div', 'statusbar', [
    h('span', 'statusbar__floor', floorName(run.floor, run.tower)),
    h('span', 'statusbar__akari', [
      h('div', { class: 'small', style: 'display:flex;justify-content:space-between' }, [
        h('span', X.isTokoyami(run) ? 'warn' : 'dim', X.isTokoyami(run) ? '常闇' : '灯'),
        h('span', 'dim', `${run.akari}`),
      ]),
      bar(run.akari, run.maxAkari, 'akari', true),
    ]),
    h('span', 'statusbar__moon', PHASE_EMOJI[run.phase] || ''),
  ]));
}

function drawEnemies(st) {
  const b = st.battle;
  const el = st.el.enemies;
  clear(el);
  if (!b) return;

  const picking = st.pick && st.pick.skillId;
  b.enemies.forEach((e, i) => {
    const focused = !!b.focus && e.id === b.focus && e.alive;
    const card = h('div', `enemy${picking && e.alive ? ' enemy--targeted' : ''}${focused ? ' enemy--focus' : ''}`);
    if (picking && e.alive) {
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', '0');
      card.style.cursor = 'pointer';
      const fire = () => st.resolveInput({ kind: 'skill', skillId: st.pick.skillId, targetIndex: i });
      card.addEventListener('click', fire);
      card.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); fire(); } });
    } else if (e.alive) {
      // ★わざを選んでいないとき（＝オート中も）敵を押すと「狙う相手」を指せる
      //   （2026-08-10 オーナー要望）。
      //   指定は**行動の上書きではなくAIの評価への加点**（rules.js の FOCUS_BONUS）。
      //   上書きにすると、瀕死の味方がいても回復せず殴りに行くAIになる。
      //   もう一度押すと解除。ほかの敵を押すと移る
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', '0');
      card.setAttribute('aria-pressed', focused ? 'true' : 'false');
      card.setAttribute('aria-label', focused ? `${e.name} を狙うのをやめる` : `${e.name} を狙う`);
      card.style.cursor = 'pointer';
      const toggle = () => {
        b.focus = focused ? null : e.id;
        // ★この枠だけ描き直す。`ctx.render()` を呼ぶと画面が作り直されて
        //   進行中の演出（数字・エフェクト）が消える
        drawEnemies(st);
        drawCrushEffect(st, null);
      };
      card.addEventListener('click', toggle);
      card.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); toggle(); } });
    }
    // 赤▼は紋の上（オーナー指定）。
    // ★狙っていないカードにも**同じ高さの空き枠を置く**。狙っている1枚だけに足すと、
    //   そのカードだけ下へずれて隣の敵と高さが揃わない（実機のスクショで気づいた）。
    //   押すたびに列全体が跳ねるのも防げる
    card.appendChild(h('div', { class: 'enemy__focus', 'aria-hidden': 'true' }, focused ? '▼' : ''));
    const glyph = mon(e, e.isBoss ? 'lg' : '');
    st.nodeOf.set(e, glyph);
    card.appendChild(glyph);
    card.appendChild(enemyName(e));
    card.appendChild(bar(e.hp, e.max.hp, 'enemy', true));
    // ★次の構え（この画面の核）。列を狭めても**ここだけは削らない**
    card.appendChild(h('div', { style: 'margin-top:3px' }, e.alive ? telegraph(e.nextAct?.stance) : h('span', 'dim small', '—')));
    if (e.alive && e.nextAct) {
      // ★崩した敵には、その敵が動くまで印を残す（2026-08-10 オーナー要望
      //   「崩し成立が山場として気持ちよくない」）。
      //   崩しの見返りは**次にその敵が殴ってきたとき**に出るので、成立の一瞬だけ光らせても
      //   因果がつながらない。「崩した → この敵に印が付く → 殴られたら数字が半分」で1本にする。
      //   `e.crushed` は engine.js の endTurn で降ろされるので、消し忘れは起きない。
      // ★これは**演出ではなく状態表示**なので `fxOff()` で消さない。
      //   演出を切っている人にも、崩しが効いているかどうかは見えている必要がある
      // ★逆風の印も同じ場所に出す（2026-08-11 オーナー要望）。崩しの対になる状態で、
      //   放っておくと**この敵の次の一手が1.2倍**になる。崩しの印だけ出していたのでは
      //   三すくみの片側しか見えない。
      // ★崩しと逆風が両方立っているときは崩しを出す（engine の威力計算も崩し優先）。
      card.appendChild(h('div', 'enemy__act', [
        e.crushed
          ? h('span', { class: 'crushmark', title: '崩し成立。この一手は威力半減・追加効果なし' }, '崩')
          : (e.adverse ? h('span', { class: 'advmark', title: '逆風。この一手は威力が上がっています' }, '逆') : null),
        e.nextAct.name,
      ]));
    }
    const ail = Object.entries(e.ailments || {}).filter(([, v]) => v > 0).map(([k]) => AILMENTS[k]?.name).filter(Boolean);
    if (ail.length) card.appendChild(h('div', 'enemy__act warn', ail.join('・')));
    el.appendChild(card);
  });
}

/**
 * 敵の名前。**「写し身」を行の途中で割らない**（2026-08-13 オーナー指摘
 * 「『写し身』の文字が変な所で2行目に分かれているケースあり」）。
 *
 * ★敵の枠は72pxしかなく、日本語は文字と文字のあいだならどこでも折り返せるので、
 *   「朽ちた門番の写し身」は放っておくと「写し／身」のように割れる。
 * ★直し方は**折り返す場所をこちらで決める**こと。
 *   本体の名前と「写し身」を別の行に分け、「写し身」だけは折り返さない。
 * ★`e.name` そのものは変えない（戦闘ログや図鑑の文面はフルネームのままでよい）。
 */
const DUP_SUFFIX = 'の写し身';
export function enemyName(e) {
  const nm = String(e.name || '');
  if (!nm.endsWith(DUP_SUFFIX)) return h('div', 'enemy__name', nm);
  return h('div', 'enemy__name', [
    nm.slice(0, -DUP_SUFFIX.length),
    h('span', 'enemy__dup', '写し身'),
  ]);
}

function drawTimeline(st, step) {
  const b = st.battle;
  const el = st.el.timeline;
  clear(el);
  if (!b || !b.order || b.order.length === 0) return;
  el.appendChild(h('span', 'dim', '行動順 '));
  for (const u of b.order) {
    if (!u.alive) continue;
    const now = step && step.type === 'acted' && step.unit === u;
    el.appendChild(h('span', `timeline__item${now ? ' timeline__item--now' : ''}`, u.name));
  }
}

/**
 * 崩しの「効き目」を出す枠（2026-08-08）。
 *
 * ★以前はここに「崩し ○○○」というゲージを出していたが、**3つ溜めても何も起きなかった**。
 *   満タンで出るはずの「合わせ技」はエンジンに未実装で、`crushGauge` は
 *   ai.js の評価に使われるだけ。何も起きないゲージは「何か見落としている」と
 *   考えさせるだけで害しかないので外した（オーナー指摘・2026-08-08）。
 *   崩しの本当の報酬はその場にある（相手の次の一手が威力半減＋追加効果なし）ので、
 *   そちらを言葉で見せる。合わせ技は v1.1 送り。
 * ★`b.crushGauge` 自体はエンジンに残す。消すと ai.js の評価が変わり、
 *   ゴールデン26シナリオが落ちる（＝挙動を変えたことになる）
 */
function drawCrushEffect(st, lines) {
  const el = st.el.gauge;
  clear(el);
  /**
   * ★崩しの報せは**この枠に出さない**（2026-08-15 オーナー指摘
   *   「崩しをしたときに、崩しの行が1行増えてしまい、味方キャラが1段下にずれるのをやめたい。
   *     崩しのときも上の行動ログに表示するようにしてください」）。
   *
   *   この枠は中身が無いと高さ0になるので、崩しのたびに1行ぶん伸びて
   *   下の仲間の列が押し下げられていた。戦闘中に足元が動くのは目に障る。
   *   → 崩しの効き目は `drawLog` が**上の1行**に混ぜて出す。
   *      この枠は「狙っている相手」だけを受け持つ。
   *   高さは CSS の `min-height` で固定してあるので、ここが空でも列は動かない。
   */
  const b = st.battle;
  if (!b) return;
  const target = b.focus ? b.enemies.find((e) => e.id === b.focus && e.alive) : null;
  if (target) {
    el.appendChild(h('span', 'warn small', `▼ ${target.name} を狙っています`));
    el.appendChild(h('span', 'dim small', '　もう一度押すと解除'));
    return;
  }
  // ★案内は**最初のターンだけ**。毎ターン出すと崩しの報せの居場所を奪う
  if (b.turn <= 1) el.appendChild(h('span', 'dim small', '敵を押すと、みんながそこを狙います'));
}

/**
 * 味方は**横に1列**（2026-08-05 オーナー指示）。
 * 1人1行で縦に積むとHP・気のバーが画面幅いっぱいに伸び、4人で縦幅を大きく食っていた。
 * 1人ぶんは上から「紋・名前・HPバー・気バー・状態異常」の縦積みにする。
 * ★具体的な数値は出さない。バーの減り具合で足りるという判断（手動時の気の残量は drawCmd 側に出る）。
 */
function drawParty(st) {
  const b = st.battle;
  const el = st.el.party;
  clear(el);
  if (!b) return;
  for (const u of b.allies) {
    const ail = Object.entries(u.ailments || {}).filter(([, v]) => v > 0).map(([k]) => AILMENTS[k]?.name).filter(Boolean).join('・');
    const glyph = mon(u, 'sm');
    st.nodeOf.set(u, glyph);
    el.appendChild(h('div', `party__cell${u.alive ? '' : ' party__cell--down'}`, [
      glyph,
      h('div', 'party__name', u.name),
      bar(u.hp, u.max.hp, 'hp', true),
      bar(u.ki, u.max.ki, 'ki', true),
      // 状態異常はアイコン化しない。バーの色だけでは何が起きているか分からない。
      // ★「力尽きた」は必ず warn で出す（セル全体が opacity 0.4 で沈むので、dim だと読めない）
      h('div', { class: `party__ail${(!u.alive || ail) ? ' warn' : ' dim'}` }, u.alive ? (ail || '') : '力尽きた'),
    ]));
  }
}

/**
 * 1行に絞ったときに、どの行を残すかの優先度（2026-08-05 レビュー指摘）。
 *
 * ★単純に「最後の行」を採ると、**撃破の告知が全ケースで消える**。
 *   `applyDamage` は死亡行をダメージ計算の**中**で push し、ダメージ行は呼び出し側が
 *   **後から** push するので、順序は必ず `[力尽きた] → [ダメージ]` になる。
 *   数字はキャラの上に飛ぶので、文章側は「damage より重い出来事」を優先して出す。
 */
const LINE_RANK = { down: 6, phase: 5, crush: 4, adverse: 3, ailment: 2, heal: 1, slip: 1 };

function drawLog(st, lines) {
  // 同じ重さなら後の行（新しい出来事）を採る
  let pick = null, best = -1;
  for (const l of lines) {
    const r = LINE_RANK[l.kind] ?? 0;
    if (r >= best) { best = r; pick = l; }
  }
  if (!pick) return;
  st.el.log.className = `battle-line l-${pick.kind}`;
  /**
   * ★崩しの効き目は**この1行に添える**（2026-08-15）。
   *   下の枠に別行として出すと、崩すたびに画面が1行ぶん伸びて仲間の列がずれる。
   *   崩しの行が選ばれているときだけ足す（別の出来事が勝った回に混ぜると、
   *   何に対する説明なのか分からなくなる）。
   */
  // ★補足は**短く**（2026-08-15）。長いと行が3行に伸びて、結局そのぶん下がずれる
  st.el.log.textContent = pick.kind === 'crush'
    ? `${pick.text}　次の一手は威力半減`
    : pick.text;
  // 崩し・逆風が成立した瞬間だけ光らせる（演出OFFのときは CSS 側で止まる）
  const crushed = lines.filter((l) => l.kind === 'crush');
  if (crushed.length) flashCards(st, crushed, 'flash-crush');
  // ★逆風にも光を出す（2026-08-11）。崩しだけ光らせていたので、
  //   不利に入ったことは数字を読まないと分からなかった
  const adverse = lines.filter((l) => l.kind === 'adverse');
  if (adverse.length) flashCards(st, adverse, 'flash-adverse');
}

/**
 * ダメージ・回復の数字を、当たったキャラの上に0.5秒だけ飛ばす。
 *
 * ★数字は `push()` が積んだ `target`（ユニットそのもの）と `amount` から取る。
 *   ログの文面を正規表現で読まない（会心・崩し・スリップで文型が増えるたびに壊れるため）。
 * ★同じキャラに複数当たったときは段をずらす。全体攻撃で数字が完全に重なって読めなくなる。
 */
function popNumbers(st, lines) {
  // 演出OFFではログの1行だけで伝える（設定は真偽値。false が「なし」）
  if (fxOff()) return;
  const layer = st.el.fx;
  const base = layer.getBoundingClientRect();
  const seen = new Map();

  for (const l of lines) {
    if (l.amount == null || !l.target) continue;
    const node = st.nodeOf.get(l.target);
    if (!node) continue;
    const r = node.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;

    // ★崩しが効いた一撃は「本来いくらだったか」を上に重ねて出す（2026-08-10 オーナー要望）。
    //   崩した瞬間にバナーを出す案は見送った。30〜40階では**1戦で9〜15回**成立するので、
    //   毎ターン出る大文字は山場ではなくなり、`acted` の1歩に使える時間（約900ms）も食う。
    //   代わりに、見返りが実際に発生するこの瞬間に、減った幅そのものを数字で見せる。
    const suppressed = !!l.suppressed && l.fullAmount > l.amount;
    // ★三すくみの当たり方は、数字そのものを別物にする（2026-08-11 オーナー指摘
    //   「逆風と崩しの演出が弱くて普段の攻撃と分かりづらい」）。
    //   同じ形の数字が飛ぶだけでは、有利に入ったのか弾かれたのかが目に入らない。
    //   崩し＝金の大きい数字＋「崩し」の札／逆風＝青白い小さい数字＋「逆風」の札。
    let pop;
    if (suppressed) {
      pop = h('span', 'pop pop--dmg pop--suppressed', [
        h('span', 'pop__was', String(l.fullAmount)),
        h('span', 'pop__now', String(l.amount)),
      ]);
    } else if (l.kind === 'crush' || l.kind === 'adverse') {
      const crush = l.kind === 'crush';
      pop = h('span', `pop pop--${crush ? 'crush' : 'adverse'}`, [
        h('span', 'pop__tag', crush ? '崩し' : '逆風'),
        h('span', 'pop__num', String(l.amount)),
      ]);
    } else {
      pop = h('span', `pop pop--${l.kind === 'heal' ? 'heal' : l.crit ? 'crit' : 'dmg'}`,
        `${l.kind === 'heal' ? '+' : ''}${l.amount}`);
    }

    // ★ずらし幅は**段数ではなく画素で積む**。2段の数字（崩し・逆風・威力半減）は
    //   1段より背が高いので、段数×18px にすると連撃（act.hits ≥ 2）のときに
    //   上下が重なって読めなくなる
    const tall = suppressed || l.kind === 'crush' || l.kind === 'adverse';
    const off = seen.get(l.target) || 0;
    seen.set(l.target, off + (tall ? 30 : 18));

    pop.style.left = `${r.left - base.left + r.width / 2}px`;
    pop.style.top = `${r.top - base.top - off}px`;
    // ★寿命は倍速に合わせて縮める。固定にすると×2のとき次の数字と混ざる
    const ms = Math.round(500 / (st.speed || 1));
    pop.style.setProperty('--pop-ms', `${ms}ms`);
    // ★片付けは animationend ではなくタイマーで。
    //   演出OFF（data-fx=off）でアニメーションが止まると animationend は永久に来ず、
    //   数字が画面に residue として残り続ける
    setTimeout(() => pop.remove(), ms + 80);
    layer.appendChild(pop);
  }
}

/**
 * 攻撃・回復・状態異常のエフェクトを、当たったキャラの上に重ねる（2026-08-06）。
 *
 * ★**1対象につき1枚だけ**。味方の紋は34px（.mon--sm）しかない。そこへ2枚重ねたら泥になる。
 *   どれを出すかは `battle_fx.js` の FX_RANK で決める（音と同じ表を使う）。
 *   `drawLog` が「最も重い1行だけ出す」のと同じ思想。
 * ★絵が無ければ `fxSrc()` が null を返すので**何も起きない**（＝いままでと完全に同じ）。
 */
function popFx(st, lines) {
  if (ART_FX.size === 0) return;          // 絵が1枚も無いなら座標も測らない
  // ★演出の可否は **DOM に反映済みの1か所**（`data-fx`）だけを見る。
  //   `save.settings.fx` を直接見ると、端末側の設定と食い違ったときに
  //   CSSは止まっているのに絵だけ出る（またはその逆）という状態になる。
  //   以前ここに prefers-reduced-motion の判定も置いていたが、
  //   **OSでアニメーションを切っている人に演出が丸ごと出ない**原因だったので外した（2026-08-08）
  if (fxOff()) return;

  // 1対象につき、いちばん重い1行だけを残す
  const best = new Map();
  for (const l of lines) {
    if (!l.target) continue;
    const rank = FX_RANK[l.kind];
    if (rank == null) continue;                 // slip / down / phase には出さない
    // ★**絵が無い行を勝たせない**。状態異常を付ける攻撃は、同じ対象・同じステップに
    //   damage 行と ailment 行が両方入る（engine.js の applyDamage → tryAilment）。
    //   ailment のほうが格上なので、ail の絵がまだ無いと damage を押しのけて
    //   **何も出なくなる**（＝素の攻撃は光るのに、火傷や麻痺を付けた攻撃だけ光らない）。
    //   FX_FALLBACK で防いだはずの「重要度の逆転」が、ここで再発していた（2026-08-06）
    if (!fxSrc(fxIdOf(l))) continue;
    const cur = best.get(l.target);
    if (!cur || rank >= FX_RANK[cur.kind]) best.set(l.target, l);
  }
  if (best.size === 0) return;

  const layer = st.el.fx;
  const base = layer.getBoundingClientRect();
  // ★座標は**ずらす前に全部取り切る**。遅延先で取ると、枚数ぶんリフローが走るうえ、
  //   画面を離れたあとの外れたノードから 0×0 を拾う
  const shots = [];
  for (const [unit, l] of best) {
    const node = st.nodeOf.get(unit);
    if (!node) continue;
    const r = node.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    const src = fxSrc(fxIdOf(l));                // 上で絞ってあるので必ず引ける
    shots.push({ src, seq: l.seq, r });
    if (shots.length >= 3) break;                // 全体攻撃で4体同時に閃くと目が潰れる
  }
  if (shots.length === 0) return;

  const ms = Math.round(360 / (st.speed || 1));
  shots.forEach((s, i) => {
    // ★大きさは**1体ずつ**その紋から出す。1回だけ測って使い回すと、
    //   ボス（mon--lg・72px）と守護者（mon・52px）が同じステップに並んだとき
    //   守護者のエフェクトが1.4倍に膨らむ（狐火の巫女＋分身2体＋全体技で必ず起きる）
    const size = Math.round(s.r.width * 1.7);
    setTimeout(() => {
      const el = h('img', {
        class: 'fx-burst', src: s.src, alt: '', 'aria-hidden': 'true',
        width: size, height: size,
      });
      // ★傾きは乱数で決めない（Math.random は src/ で禁止・test.mjs §1が検出）。
      //   ログの通し番号から決めれば、同じ戦闘は何度再生しても同じに見える
      el.style.setProperty('--fx-rot', `${(s.seq % 3) * 12 - 12}deg`);
      el.style.setProperty('--fx-ms', `${ms}ms`);
      // 端の敵で画面外へはみ出すと、狭い端末で横スクロールが生える
      const cx = s.r.left - base.left + s.r.width / 2;
      el.style.left = `${Math.max(size / 2, Math.min(base.width - size / 2, cx))}px`;
      // 中心よりすこし下へ。上は数字（.pop）のために空けておく
      el.style.top = `${s.r.top - base.top + s.r.height * 0.62}px`;
      // ★タイマーの中では remove() 以外を一切しない。
      //   st や ctx に触ると世代（epoch）の確認が要るようになり、そこから漏れる
      setTimeout(() => el.remove(), ms + 80);
      layer.appendChild(el);
      // ★ずらし幅も倍速に追従させる。固定にすると×2のとき3枚目が
      //   1枚目の寿命の2/3を過ぎてから出る
    }, Math.round(i * 60 / (st.speed || 1)));
  });
}

/**
 * エフェクトの絵を先に読み込んでおく。
 * ★アプリ起動時ではなく**最初の戦闘のとき**に1回だけ。タイトルの表示を遅くしないため。
 *   どの絵が要るかは事前に読めない（技はターンごとに変わる）ので、列挙ぶん全部を読む。
 */
let fxPreloaded = false;
const fxKeep = [];        // GCで捨てられないように参照を残す
function preloadFx(st) {
  if (fxPreloaded || fxOff()) return;
  fxPreloaded = true;
  for (const id of ART_FX) {
    const src = fxSrc(id);
    if (!src) continue;
    const img = new Image();
    img.decoding = 'async';
    img.src = src;
    fxKeep.push(img);
  }
}

/**
 * 崩し成立の一瞬の光（spec §2-1「崩しがUIの核」）。
 *
 * ★**崩れた敵のカードだけ**を光らせる（2026-08-10）。
 *   以前は敵の列ごと光らせていたが、4体並ぶ階では
 *   「どれを崩したのか」がまったく分からず、直後に付く「崩」の印とも結びつかなかった。
 * ★対象が取れないときは列ごと光らせる（何も光らないより良い）。
 */
function flashCards(st, lines, cls) {
  const cards = [];
  for (const l of lines || []) {
    const node = l.target ? st.nodeOf.get(l.target) : null;
    const card = node?.closest?.('.enemy');
    if (card && !cards.includes(card)) cards.push(card);
  }
  for (const el of (cards.length ? cards : [st.el.enemies])) {
    el.classList.remove(cls);
    void el.offsetWidth;          // アニメーションを撃ち直すためのリフロー
    el.classList.add(cls);
  }
}

function drawControls(st) {
  const el = st.el.controls;
  clear(el);

  const avail = availableTactics({
    chapter: st.ctx.save.progress.chapter ?? 0,
    dexPct: dexPercent(st.ctx.save),
    pairsFound: Object.keys(st.ctx.save.dex?.pairs || {}).length,
    boardUnlocked: (st.ctx.save.board || []).some((v) => v > 0),
  });

  // 作戦は戦闘中いつでも変えられる（spec §3-8-2）
  el.appendChild(h('select', {
    'aria-label': '作戦',
    onchange: (e) => {
      const id = e.target.value;
      if (st.battle) st.battle.partyTactic = id;
      st.run.partyTactic = id;
      st.ctx.save.party.tacticParty = id;
      toast(`作戦を「${TACTICS[id].name}」にした`);
    },
  }, avail.map((id) => h('option', { value: id, selected: st.run.partyTactic === id }, TACTICS[id].name))));

  // モードは2つだけ。押すと入れ替わる（2026-08-11 オーナー指示）
  // ★ボタンの文字は「いまどちらか」。押したあとどうなるかは title と読み上げで補う
  el.appendChild(h('button', {
    class: `btn btn--sm${st.mode === 'manual' ? ' btn--primary' : ''}`,
    type: 'button',
    'aria-pressed': st.mode === 'manual' ? 'true' : 'false',
    title: st.mode === 'manual' ? '押すとオートに戻ります' : '押すと、ここから手動になります',
    'aria-label': st.mode === 'manual' ? 'いまは手動。押すとオートに戻ります' : 'いまはオート。押すと手動になります',
    onclick: () => {
      st.mode = st.mode === 'manual' ? 'auto' : 'manual';
      st.ctx.save.settings.battleMode = st.mode;
      drawControls(st);
    },
  }, MODE_LABEL[st.mode]));

  el.appendChild(h('button', {
    class: 'btn btn--sm',
    onclick: (e) => { st.paused = !st.paused; e.target.textContent = st.paused ? '再開' : '一時停止'; },
  }, st.paused ? '再開' : '一時停止'));

  if (st.ctx.save.progress?.cleared) {
    el.appendChild(h('button', {
      class: 'btn btn--sm',
      /**
       * ★選んだ速さは**記録に残す**（2026-08-13 オーナー指摘
       * 「エンディング後、戦闘速度を2倍にしたら、他の戦闘でも2倍にするようにしておいて」）。
       *
       * ここは戦闘ごとに作り直される `st`（その戦闘だけの状態）なので、
       * 書き戻さないと**次の戦闘で必ず等速に戻る**。設定画面の「戦闘の速さ」と
       * 同じ置き場所（`save.settings.speed`）に入れて、両方から同じ値を見る。
       */
      onclick: (e) => {
        st.speed = st.speed === 1 ? 2 : 1;
        e.target.textContent = `×${st.speed}`;
        st.ctx.save.settings = st.ctx.save.settings || {};
        st.ctx.save.settings.speed = st.speed;
        // ★潜行中は自動セーブが止まっているので、ここで書いておく（silent）
        try { st.ctx.saveNow(true); } catch (_) { /* 保存できなくても戦闘は続ける */ }
      },
    }, `×${st.speed}`));
  }
}

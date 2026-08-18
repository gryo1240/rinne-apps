/**
 * 会話画面（spec §9・§13-2）
 *
 * ── 設計の芯 ──────────────────────────────────────────────
 * 1. **1行ごとに ctx.render() を呼ばない**。
 *    画面を作り直すとスクロール位置と読み上げ位置が毎行リセットされる。
 *    ここは本文の差し替えだけを直接DOMでやる（因果盤の画面と同じ方針）。
 *
 * 2. **飛ばしても結果は同じ**。
 *    「送る」を押さずに飛ばした人だけ仲間が入らない、という事故を作らない。
 *    加入も既読も story.applyScene() が一手でやる（screen 側で個別に触らない）。
 *
 * 3. **戻り先は呼び出し元が決める**。
 *    潜行中に呼ばれることもあるので、勝手に拠点へ帰さない。
 *    params.back（既定 'home'）へ返す。
 *
 * @param params {{ids:string[], back?:string, backParams?:object}}
 */

import { h, clear, alertBox, confirmBox } from './dom.js';
import { confirmOnce } from './confirm.js';
import { charaSrc, bgForScene } from '../../assets/art-manifest.js';
import { applyBgm } from './audio.js';
import { SPEAKER_BY_ID } from '../../data/chars.js';
import * as St from '../meta/story.js';
import * as X from '../dungeon/explore.js';

/** 表示中の状態。画面をまたいで持ち越さない（go し直したら作り直す） */
let cur = null;

export function render(ctx) {
  // ★読み返し（ストーリー画面から）。2026-08-10 オーナー要望。
  //   既読フィルタを外し、読み終わっても applyScene を呼ばない。
  //   applyScene は既読の記録だけでなく**仲間の加入・章の進行・クリア判定**まで触るので、
  //   読み返しただけで進行が動くと周回の状態が壊れる
  const replay = !!ctx.state.params.replay;
  // ★既読は弾く。会話中に何かの理由で ctx.render() が走ると cur が作り直されるので、
  //   弾いておかないと、そのぶんだけ先頭から再生し直してしまう
  const ids = (ctx.state.params.ids || [])
    .filter((id) => St.sceneOf(id) && (replay || !St.isSeen(ctx.save, id)));
  const back = ctx.state.params.back || 'home';
  const backParams = ctx.state.params.backParams || {};

  // 読むものが無ければ即座に戻す（空の会話画面で詰まらせない）
  if (ids.length === 0) {
    setTimeout(() => ctx.go(back, backParams), 0);
    return h('div', 'screen', [h('p', 'panel dim', '…')]);
  }

  cur = { ctx, ids, back, backParams, replay, sceneIndex: 0, queue: [], line: null };

  const root = h('div', 'screen screen--talk');

  // 見出しは h2 にする。app.js が画面遷移のたびに h1/h2 を探してフォーカスを移すので、
  // div のままだと**この画面だけ読み上げソフトに何も伝わらない**（本作で一番文章が多い画面）
  const head = h('div', 'talk__head', [
    h('h2', 'talk__title', ''),
    h('div', 'talk__place small dim', ''),
  ]);
  const stage = h('div', 'talk__stage', [
    h('div', 'talk__chara'),
  ]);
  // 本文は1行ずつ差し替わる。aria-live が無いと、送っても読み上げられない
  const box = h('div', { class: 'talk__box', 'aria-live': 'polite' }, [
    h('div', 'talk__who'),
    h('p', 'talk__text', ''),
    h('div', 'talk__opts'),
    h('div', { class: 'talk__next small dim', 'aria-hidden': 'true' }, '　'),
  ]);

  // 本文のどこを押しても進む。キーボードでも進めるよう button にする
  const advance = h('button', {
    class: 'talk__tap', type: 'button',
    onclick: () => step(),
    'aria-label': '次へ進む',
  });

  const skip = h('button', {
    class: 'btn btn--sm btn--inline', type: 'button',
    onclick: async () => {
      // ★連打で二重に走らせない。確認ダイアログはキューされるので、
      //   素早く2回押すと finishScene が2つ走り、場面が1つ丸ごと飛ぶ
      if (cur?.finishing || cur?.confirming) return;
      cur.confirming = true;
      try {
        const ok = await confirmOnce(ctx, 'skipTalk',
          'この場面を最後まで飛ばします。仲間の加入など、結果は読んだときと同じです。', '飛ばす', 'やめる');
        if (ok && !cur?.finishing) finishScene();
      } finally {
        if (cur) cur.confirming = false;
      }
    },
  }, 'とばす');

  root.appendChild(head);
  root.appendChild(stage);
  root.appendChild(h('div', 'talk__body', [advance, box]));
  root.appendChild(h('div', 'talk__foot', [skip]));

  cur.el = { root, head, stage, box, advance, skip };
  startScene(0);
  return root;
}

// ── 場面の進行 ────────────────────────────────────────────

function startScene(i) {
  const sc = St.sceneOf(cur.ids[i]);
  if (!sc) { leave(); return; }

  // ★場面を切り替えるときは、前の場面の選択肢と入力ロックを必ず捨てる。
  //   選択肢が出ている最中に「とばす」を押すと、ボタンが残ったまま次の場面へ入り、
  //   本文タップが disabled のままになって**以後まったく送れなくなる**（レビューで実機再現）。
  //   さらに残ったボタンを押すと、前の場面の返答が今の場面に混入する
  clear(cur.el.box.querySelector('.talk__opts'));
  cur.el.advance.disabled = false;
  cur.pausedForChoice = false;

  cur.sceneIndex = i;
  cur.queue = (sc.lines || []).slice();
  cur.scene = sc;

  cur.el.head.children[0].textContent = sc.title || '';
  cur.el.head.children[1].textContent = sc.place || '';
  cur.el.head.hidden = !sc.title && !sc.place;

  // ★背景は**場面ごとに**敷き直す（2026-08-09 オーナー要望）。
  //   取りこぼした場面をまとめて読むときは「15階の場面 → 祠の絆イベント」のように
  //   1回の会話の中で場所が変わるので、画面に入るときの1回では足りない。
  //   `.bglayer` に 400ms のクロスフェードが入っているので、切り替えは自然につながる
  cur.ctx.setBg(bgForScene(sc));

  /**
   * ★曲も**場面ごとに**掛け直す（2026-08-12 オーナー要望
   * 「各ストーリーは状況に応じてBGMを適切な曲に変えてほしい。
   *   後から見返す時も、その時と同じ曲を使って、過去に感じた高揚感を思い出せるように」）。
   *
   * ★曲の指定は**場面データ（`data/scenario.js` の `bgm`）が持つ**。
   *   呼び出し側（拠点から／潜行中から／読み返しから）に持たせると、
   *   入口が増えるたびに指定が抜け、**読み返しだけ違う曲になる**。
   *   ここで場面から読めば、どの入口から来ても同じ曲が鳴る。
   * ★`sc.bgm` が無ければ、これまでどおり場所（塔の中か拠点か）で決まる。
   *
   * ★★選んだ曲は `ctx.state.params.bgm` に**書き戻すこと**（2026-08-12 修正）。
   *   `app.js` は「画面を描く → applyBgm(state)」の順で動くので、
   *   ここで場面の曲に切り替えても、**戻った直後に state から計算し直されて上書き**される。
   *   読み返し（ストーリー画面→talk）は params に bgm が無いので、
   *   上書き後の答えは必ず拠点の曲になり、**祠から読み返すと曲が変わらない**という形で出ていた。
   *   （このとき曲の取得だけは走るので、「取りに行った曲」を数える検証では通ってしまう。
   *     鳴っている曲そのものを見ないと捕まらない＝教訓 lessons/ に記録）
   */
  const wantBgm = sc.bgm || cur.ctx.state?.params?.bgm;
  if (cur.ctx.state?.params) cur.ctx.state.params.bgm = wantBgm;
  applyBgm({
    screen: 'talk',
    params: { ...(cur.ctx.state?.params || {}), bgm: wantBgm },
    run: cur.ctx.state?.run || null,
    save: cur.ctx.save || null,
  });

  preloadFaces(sc);
  step();
}

/**
 * この場面で使う立ち絵を先に読み込んでおく。
 *
 * ★表情差分が入って**1キャラ1枚ではなくなった**ので、これが要る。
 *   drawChara は古い img を捨ててから新しい img を貼るので、先読みが無いと
 *   その表情の初回だけ「読み込みが終わるまでキャラが消える」（回線の細いスマホで目立つ）。
 *   枠の高さは CSS で確保してあるのでレイアウトは動かないが、絵はちらつく。
 */
function preloadFaces(sc) {
  const seen = new Set();
  const walk = (lines) => {
    for (const l of lines) {
      if (Array.isArray(l)) {
        const src = charaSrc(l[0], l[2]);
        if (src && !seen.has(src)) { seen.add(src); new Image().src = src; }
      } else if (l && l.opts) {
        for (const o of l.opts) walk(o.r || []);
      }
    }
  };
  walk(sc.lines || []);
}

/** 次の行へ。選択肢に当たったら止まる */
function step() {
  if (cur.pausedForChoice) return;
  if (cur.queue.length === 0) { finishScene(); return; }
  const raw = cur.queue.shift();

  // 主人公の選択肢（分岐しない。返す言葉が変わるだけ）
  if (raw && typeof raw === 'object' && !Array.isArray(raw) && raw.opts) {
    showChoices(raw.opts);
    return;
  }

  const who = Array.isArray(raw) ? raw[0] : null;
  const text = Array.isArray(raw) ? raw[1] : String(raw);
  // 第3要素は表情（省略可）。差分が無ければ基本表情のまま出る
  const face = Array.isArray(raw) ? raw[2] : null;
  showLine(who, text, face);
}

function showLine(who, text, face) {
  // ★仲間だけでなく `EXTRA_CAST`（紬）も引ける表を使う。
  //   CHAR_BY_ID のままだと、紬の行は名前も立ち絵も出ずに地の文になる
  const c = who ? SPEAKER_BY_ID[who] : null;
  const box = cur.el.box;
  const whoEl = box.querySelector('.talk__who');
  const textEl = box.querySelector('.talk__text');

  whoEl.textContent = c ? c.name : '';
  whoEl.hidden = !c;
  if (c) whoEl.style.setProperty('--c', c.color || '#c9a227');

  textEl.textContent = subst(text);
  textEl.className = `talk__text${c ? '' : ' talk__text--narr'}`;

  drawChara(c, face);
  box.querySelector('.talk__next').textContent = cur.queue.length > 0 ? '▼' : '　';
}

/** 立ち絵。無ければ紋の色だけ置く（枠が動かないので、絵を入れてもレイアウトが変わらない） */
function drawChara(c, face) {
  const slot = cur.el.stage.querySelector('.talk__chara');
  const id = c ? c.id : null;
  const src = c ? charaSrc(c.id, face) : null;
  // ★同じものを貼り直さないための鍵。**表情まで含める**こと。
  //   ここを id だけにすると、同じキャラが続けて話す間ずっと表情が切り替わらない
  const key = `${id || ''}|${src || ''}`;
  if (slot.dataset.key === key) return;
  slot.dataset.key = key;
  clear(slot);
  if (!c) return;
  if (src) {
    slot.appendChild(h('img', { class: 'talk__img', src, alt: c.name }));
  } else {
    slot.appendChild(h('span', {
      class: 'talk__glyph', style: `--c:${c.color || '#c9a227'}`, 'aria-hidden': 'true',
    }, c.mon || '？'));
  }
}

function showChoices(opts) {
  cur.pausedForChoice = true;
  const box = cur.el.box;
  // ★話者の名前は消さない。直前の行（＝問いかけ）が誰の言葉か分からなくなる
  box.querySelector('.talk__next').textContent = '　';
  cur.el.advance.disabled = true;

  const wrap = box.querySelector('.talk__opts');
  clear(wrap);
  for (const o of opts) {
    wrap.appendChild(h('button', {
      class: 'btn btn--sm', type: 'button',
      onclick: () => {
        clear(wrap);
        cur.pausedForChoice = false;
        cur.el.advance.disabled = false;
        // 選んだ返しを、この場面の残りの先頭に差し込む
        cur.queue = [].concat(o.r || [], cur.queue);
        step();
        cur.el.advance.focus({ preventScroll: true });
      },
    }, subst(o.l)));
  }
  wrap.firstChild?.focus({ preventScroll: true });
}

/** この場面を読み終えた（飛ばした場合も同じ処理を通す） */
async function finishScene() {
  if (cur.finishing) return;          // 「とばす」連打・演出中の二重呼び出しを止める
  cur.finishing = true;
  const ctx = cur.ctx;
  const sc = cur.scene;
  const mine = cur;                   // 途中で画面を離れたら、以後DOMを触らない
  cur.pausedForChoice = true;         // 演出中に押されても進まないようにする
  cur.el.skip.disabled = true;

  // ★読み返しでは**セーブに一切触らない**（applyScene も saveNow も呼ばない）。
  //   applyScene は既読の記録のほかに仲間の加入・章の進行・クリア判定まで動かす。
  //   「もう一度読んだら仲間がまた入った」「章が進んだ」を作らないための分岐
  const { joined } = cur.replay ? { joined: [] } : St.applyScene(ctx.save, sc.id);
  if (!cur.replay) ctx.saveNow(true);

  for (const c of joined) {
    // ★潜行の途中なら、この潜行の戦闘にも加える。
    //   加えないと「6階で鈴が仲間になった」と出たのに、10階の層ボスを
    //   主人公ひとりで戦うことになる（通知と実態が食い違う）
    const inRun = ctx.state.run ? X.joinRun(ctx.state.run, ctx.save, c.id) : false;
    const where = inRun
      ? 'いま、この潜行から一緒に戦います。'
      : (ctx.state.run
        ? '出撃の枠が埋まっているので、祠へ戻ってから編成に入れてください。'
        : '拠点の「編成」から出撃メンバーに入れられます。');
    await alertBox(`${c.name} が仲間になった。\n\n${c.role}\n\n${where}`, 'よろしく');
  }
  if (sc.tip) await alertBox(sc.tip, 'わかった');

  if (cur !== mine) return;           // 画面を離れていた
  cur.finishing = false;
  cur.pausedForChoice = false;
  cur.el.skip.disabled = false;
  if (cur.sceneIndex + 1 < cur.ids.length) { startScene(cur.sceneIndex + 1); return; }
  leave();
}

function leave() {
  const { ctx, back, backParams } = cur;
  cur = null;
  ctx.go(back, backParams);
}

// ── 文字列 ────────────────────────────────────────────────

function subst(s) {
  return String(s).replace(/\{name\}/g, cur?.ctx?.save?.name || 'ともし');
}

/**
 * ストーリー（読んだ話の読み返し）・2026-08-10 オーナー要望
 *
 * ── 設計の芯 ──────────────────────────────────────────────
 * 1. **未読はタイトルも伏せる**。
 *    `b_isurugi_1` のように、タイトル自体が展開を明かしてしまう場面がある。
 *    伏せたうえで「何をすれば読めるか」だけを添える。
 *
 * 2. **読み返しでは `applyScene()` を呼ばない**。
 *    あれは既読の記録だけでなく、仲間の加入・章の進行・クリア判定まで触る。
 *    読み返しただけで進行が動くと、周回の状態が壊れる。
 *    → `screen_talk.js` に `replay:true` を渡し、あちらで applyScene を飛ばす。
 *
 * 3. 一覧は**話の順**に出す（`data/scenario.js` の並び）。
 *    既読数で並べ替えたりしない。読み返したい人は「あの辺」で探すため。
 */

import { h, swapInto, foldSection } from './dom.js';
import { SCENES } from '../../data/scenario.js';
import { CHAR_BY_ID, SPEAKER_BY_ID } from '../../data/chars.js';
import * as St from '../meta/story.js';

/**
 * 章立ての見出し。`at` をそのまま出すと英語が漏れる。
 *
 * ★`s.at !== 'bond'` のままにしないこと。2026-08-13 に日常の場面（daily）を足したので、
 *   除外を並べる書き方だと**新しい種類が黙って「本編」に混ざる**。
 * ★仲間との会話（bond）と日々のこと（daily）は**1つにまとめた**（2026-08-16 オーナー指示
 *   「『仲間との会話』と『日々のこと』は統合しよう。全部含めて『仲間との話』で良いです」）。
 *   どちらも中では**相手ごと**に分かれるので、分けても同じ人の名前が2か所に出るだけだった。
 */
const GROUPS = [
  { key: 'main', label: '本編', match: (s) => s.at !== 'bond' && s.at !== 'daily' },
  { key: 'bond', label: '仲間との話', match: (s) => s.at === 'bond' || s.at === 'daily' },
];

/**
 * その人の名前を出してよいか（2026-08-16 オーナー指摘
 * 「仲間との話ですが、仲間になっていないときに仲間の名前が出ているのでネタバレになっている。
 *   "？？？"にすること」）。
 *
 * ★以前は「誰が仲間になるかは編成画面で見えているから名前は出してよい」と書いていたが、
 *   **編成画面に出るのは加入した人だけ**だった。つまりこの画面だけが、
 *   まだ会っていない仲間の名前を先に見せていた。
 * ★仲間ではない人（紬）は `save.chars` に入らないので、
 *   **その人の話を1つでも読んでいるか**で判断する。
 */
function nameShown(save, id) {
  if (!id) return false;
  if (CHAR_BY_ID[id]) return !!save?.chars?.[id];
  return SCENES.some((sc) => sc.char === id && St.isSeen(save, sc.id));
}

/** 一覧に出す名前。まだ出してよくない人は伏せる */
function nameOf(save, id) {
  return nameShown(save, id) ? (SPEAKER_BY_ID[id]?.name || 'その他') : '？？？';
}

/** 未読のときに出す「何をすれば読めるか」。中身は明かさない */
function hintOf(save, sc) {
  if (sc.at === 'bond') {
    // ★名前を出してよいのは加入後だけ。加入前は「誰の話か」ごと伏せる
    if (!nameShown(save, sc.char)) return 'まだ会っていない相手の話です';
    const c = CHAR_BY_ID[sc.char];
    return c ? `${c.name}と親しくなると読めます（${sc.floor}階まで到達）` : 'まだ読めません';
  }
  if (sc.at === 'daily') {
    // ★紬の話は「全員が Lv◯・エンディング後」（data/daily.js の everyone）。
    //   仲間ひとりのレベルでは開かないので、そのままの文面だと嘘になる
    if (sc.everyone) return `仲間全員が Lv${sc.lv} になり、塔を登りきると読めます`;
    if (!nameShown(save, sc.char)) return 'まだ会っていない相手の話です';
    const c = SPEAKER_BY_ID[sc.char];
    return c ? `${c.name}が Lv${sc.lv} になると読めます` : 'まだ読めません';
  }
  if (sc.at === 'boss') return `${sc.floor}階の主に挑むと読めます`;
  if (sc.at === 'floor') return `${sc.floor}階へ進むと読めます`;
  if (sc.at === 'cleared') return '塔を登りきると読めます';
  return 'まだ読めません';
}

export function render(ctx) {
  const root = h('div');
  const host = h('div');
  root.appendChild(host);
  draw(ctx, host);
  root.appendChild(h('button', {
    class: 'btn btn--sm btn--inline', style: 'margin-top:14px',
    onclick: () => ctx.go('home'),
  }, '祠へ戻る'));
  return root;
}

function draw(ctx, host) {
  swapInto(host, (root) => build(ctx, root));
}

function build(ctx, root) {
  const save = ctx.save;
  const seen = SCENES.filter((sc) => St.isSeen(save, sc.id)).length;

  root.appendChild(h('h1', 'sec-title', 'ストーリー'));
  root.appendChild(h('p', 'small dim',
    `読んだ話 ${seen}／${SCENES.length}。読んだ話はいつでも読み返せます。`));

  /**
   * ★**章ごとに畳む**（2026-08-12 オーナー指摘「縦が長すぎる」）。
   *   本編29＋仲間との話21＝50場面あり、全部並べると 3,663px（実測・iPhone幅）＝
   *   画面4枚ぶんになる。読み返したい話は「あの章のあれ」で探すので、
   *   章で畳めば1〜2タップで同じ場所へ着く。
   * ★**最初はすべて閉じる**（2026-08-16 オーナー指示
   *   「ページに飛ぶと、デフォルトで全て開いています。縦列を抑制するために
   *     全て画面は閉じておきましょう。ユーザーが見たいところを開いてみれるようにします」）。
   *   以前は「読んだ話が1つでもある章は開く」にしていたが、進むほど開く章が増え、
   *   終盤には結局ほぼ全開＝最初の「縦が長すぎる」に戻っていた。
   *   読んだ数は畳んだ行の右に出ているので、閉じていても進み具合は分かる。
   */
  for (const g of GROUPS) {
    const list = SCENES.filter(g.match);
    if (list.length === 0) continue;
    const done = list.filter((sc) => St.isSeen(save, sc.id)).length;
    root.appendChild(h('h2', 'sec-title', `${g.label}（${done}／${list.length}）`));

    for (const sub of subGroups(save, g, list)) {
      const subDone = sub.list.filter((sc) => St.isSeen(save, sc.id)).length;
      const box = h('div', 'list');
      for (const sc of sub.list) box.appendChild(row(ctx, save, sc));
      root.appendChild(foldSection(sub.label, `${subDone}／${sub.list.length}`, box, false));
    }
  }

  if (seen === 0) {
    root.appendChild(h('p', 'small dim', 'まだ読んだ話がありません。塔を登ると増えていきます。'));
  }
}

/** 章の名前。`chapter` は data/scenario.js が持っている数字 */
const CHAPTER_NAME = ['序章', '一章', '二章', '三章', '四章', '五章', '終章'];

/**
 * 見出しの中をさらに分ける。
 *   本編      → 章ごと（序章〜終章）
 *   仲間との話 → 相手ごと（誰の話かで探すため）
 * ★並び順は `data/scenario.js` の並びを崩さない。既読数で並べ替えない
 */
function subGroups(save, g, list) {
  const out = [];
  const seen = new Map();
  for (const sc of list) {
    // 仲間との話（bond と daily の両方が入っている）は相手ごとに分ける
    const byChar = g.key === 'bond';
    const key = byChar ? (sc.char || '?') : String(sc.chapter ?? 0);
    if (!seen.has(key)) {
      const label = byChar
        // ★まだ仲間になっていない人は「？？？」（2026-08-16 オーナー指摘）。
        //   仲間でない人（紬）も話し手になるので、判断は nameOf に任せる
        ? nameOf(save, sc.char)
        : (CHAPTER_NAME[sc.chapter] || `第${sc.chapter}章`);
      const grp = { key, label, list: [] };
      seen.set(key, grp);
      out.push(grp);
    }
    seen.get(key).list.push(sc);
  }
  return out;
}

/** 1場面ぶんの行 */
function row(ctx, save, sc) {
  const read = St.isSeen(save, sc.id);
  return h('div', {
    class: `list__item${read ? '' : ' list__item--locked'}`,
    style: 'cursor:default',
  }, [
    h('div', 'list__main', [
      // ★未読は題も伏せる。題が展開を明かす場面がある
      h('div', read ? '' : 'dim', read ? sc.title : '？？？'),
      h('div', 'list__sub dim', read ? (sc.place || '') : hintOf(save, sc)),
    ]),
    read ? h('button', {
      class: 'btn btn--sm',
      onclick: () => ctx.go('talk', {
        ids: [sc.id],
        back: 'story',
        // ★読み返しの目印。これが無いと screen_talk が既読を弾いて
        //   「押しても何も起きない」になる
        replay: true,
      }),
    }, '読む') : null,
  ]);
}

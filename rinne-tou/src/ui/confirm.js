/**
 * 「もう一度だけ確かめる」ダイアログ（2026-08-04 オーナー指示）
 *
 * 鍛冶・錬気のように**押した瞬間に素材が減る**操作は、押し間違いが痛い。
 * かといって毎回訊かれるのを嫌う人もいるので、
 * **「次から確かめない」のチェックを添えて、選ばせる**。
 *
 * ── 設計の要点 ────────────────────────────────────────────
 * 1. **記憶は操作の種類ごと**（`CONFIRM_KEYS`）。全体で1つにすると、
 *    鍛冶の確認だけ切りたい人が、取り消せない操作の確認まで消してしまう
 * 2. **取り消せない操作にはチェックを出さない**。
 *    輪廻・記録の削除・上書き・因果盤のマス開放・塔からの引き上げは、
 *    ここを通さず `confirmBox` のまま（＝必ず訊く）にしてある
 *    ★装備の売却は 2026-08-05 に方針を変えた。**稀（rarity 2）以上は今も必ず訊く**が、
 *      常・珍は数が多く毎回訊かれると片付けが進まないので、省略できる側へ移した
 *      （オーナー判断: 「安い物だけ省略可にする」）
 * 3. **記憶するのは「チェックを入れて『はい』を押したとき」だけ**。
 *    「やめる」を押したときは、チェックが入っていても覚えない（意図が曖昧なため）
 * 4. 既定は「訊く」。判定は `!== false` で書くこと。
 *    `=== true` にすると、`confirm` を持たない既存セーブで確認が全部消える
 *
 * dom.js に置かない理由: dom.js は「DOMの薄いヘルパ」で、セーブを知らない層。
 * ここはセーブの設定を読むので、別ファイルにして層を保つ。
 */

import { h, customModal } from './dom.js';

/** チェックボックスを出してよい操作（＝やり直しがきくもの） */
export const CONFIRM_KEYS = {
  kaji:     { label: '鍛冶（銘強化）', desc: '装備を鍛えるとき' },
  renki:    { label: '錬気', desc: 'ステータスを直接伸ばすとき' },
  dispatch: { label: '影送り', desc: '仲間の影を塔へ送り出すとき' },
  skipTalk: { label: '会話をとばす', desc: '話を飛ばすとき' },
  dive:     { label: '傷を負ったまま塔へ', desc: '手当てせずに潜ろうとしたとき' },
  equipOn:  { label: '装備をつける', desc: '持ち物を着せ替えるとき' },
  // ★`equipSell` は消した（2026-08-16）。装備の売却を露店へ一本化したので、
  //   装備画面から1点ずつ売る道が無くなり、このキーを読む場所が消えたため。
  //   設定に残しておくと「押しても何も変わらないつまみ」になる
  //   （教訓 `lessons/dead-flag-promised-in-text.md`）。
};

/** そのキーの確認を出すか（既定は出す） */
export function willAsk(save, key) {
  return save?.settings?.confirm?.[key] !== false;
}

/** 設定を書き換える（設定画面から） */
export function setAsk(save, key, ask) {
  if (!save.settings) save.settings = {};
  if (!save.settings.confirm) save.settings.confirm = {};
  if (ask) delete save.settings.confirm[key];
  else save.settings.confirm[key] = false;
}

/** すべて「確認する」に戻す */
export function resetAll(save) {
  if (save?.settings) save.settings.confirm = {};
}

/**
 * 確認して、進めてよければ true を返す。
 *
 * @param {object} ctx    画面コンテキスト（save と saveNow を使う）
 * @param {string} key    CONFIRM_KEYS のキー。null を渡すとチェックボックス無しの確認になる
 * @param {string} text   本文（改行可）
 * @param {string} okLabel
 * @param {string} ngLabel
 * @returns {Promise<boolean>}
 */
export function confirmOnce(ctx, key, text, okLabel = 'はい', ngLabel = 'やめる') {
  if (key && !willAsk(ctx.save, key)) return Promise.resolve(true);

  return new Promise((resolve) => customModal(({ close }) => {
    const txt = document.getElementById('modalText');
    const btns = document.getElementById('modalBtns');
    // ★ close() は値を取らないので、閉じてから自分で resolve する
    const done = (v) => { close(); resolve(v); };
    txt.textContent = '';

    const box = h('div', null, String(text).split('\n').map((line) => h('p', null, line)));
    txt.appendChild(box);

    let skipNext = null;
    if (key) {
      const cb = h('input', { type: 'checkbox', id: 'confirmSkip' });
      skipNext = cb;
      txt.appendChild(h('label', { class: 'checkline', for: 'confirmSkip' }, [
        cb, h('span', null, '次からは確かめない'),
      ]));
      txt.appendChild(h('p', 'small dim', '設定画面から、いつでも確かめる側に戻せます。'));
    }

    const ok = h('button', {
      class: 'btn btn--primary',
      onclick: () => {
        // ★覚えるのは「はい」を押したときだけ。「やめる」では覚えない
        if (skipNext && skipNext.checked) {
          setAsk(ctx.save, key, false);
          ctx.saveNow(true);
        }
        done(true);
      },
    }, okLabel);
    btns.replaceChildren(h('button', { class: 'btn', onclick: () => done(false) }, ngLabel), ok);
    document.getElementById('modal').hidden = false;
    ok.focus();
  }));
}

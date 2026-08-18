/**
 * タイトル画面（spec §2 の画面1）
 * つづきから／はじめから／記録／設定／あそびかた／セーブの持ち出し
 */

import { h, toast, confirmBox, alertBox, customModal, hhmm } from './dom.js';
import * as S from '../core/save.js';
import { moonAge, moonPhase, PHASE_NAMES, PHASE_EMOJI, PHASE_EFFECT, daysToNextPhase } from '../core/time.js';
import { START_PARTY } from '../meta/recruit.js';
import * as St from '../meta/story.js';
import { toHome } from './story_flow.js';
import { floorName } from '../dungeon/towers.js';

const SLOTS = [1, 2, 3];

export function render(ctx) {
  const root = h('div');

  root.appendChild(keyVisual());
  root.appendChild(h('h1', 'title-logo', '輪廻の塔'));
  root.appendChild(h('p', 'title-sub', '死ぬたびに強くなる。月が変えるダンジョンを、何度でも登れ'));

  // 今夜の月（りんねブログの月アプリ群と同じ計算・core/time.js）
  const age = moonAge(Date.now());
  const ph = moonPhase(age);
  root.appendChild(h('div', 'panel panel--flat center small', [
    h('div', null, `${PHASE_EMOJI[ph]} 今夜は「${PHASE_NAMES[ph]}」（月齢 ${age.toFixed(1)}）`),
    h('div', 'dim', `塔のようす: ${PHASE_EFFECT[ph].desc}　／　次の変化まであと${daysToNextPhase(age)}日`),
  ]));

  // ── スロット ──
  root.appendChild(h('h2', 'sec-title', '記録'));
  for (const slot of SLOTS) {
    root.appendChild(slotRow(ctx, slot));
  }

  // ── その他 ──
  root.appendChild(h('h2', 'sec-title', 'その他'));
  root.appendChild(h('button', { class: 'btn', onclick: () => showHowTo() }, 'あそびかた'));
  root.appendChild(h('button', { class: 'btn', onclick: () => ctx.go('settings', { from: 'title' }) }, '設定'));
  root.appendChild(h('button', { class: 'btn', onclick: () => showTransfer(ctx) }, [
    'セーブの持ち出し・取り込み',
    h('span', 'btn-sub', '機種変更やバックアップに使います。'),
  ]));

  root.appendChild(h('p', { class: 'small dim center', style: 'margin-top:16px' },
    'このゲームの記録はお使いのブラウザに保存されます。ブラウザのデータを消すと記録も消えます。'));
  root.appendChild(credits());

  return root;
}

/**
 * 素材のクレジット（2026-08-08）
 *
 * ★**消さないこと。** BGMは魔王魂（作曲: 森田交一）の素材で、
 *   利用規約が「著作表記」を必須としている。曲を差し替えるときも、
 *   別の素材元に変えるのでない限りこの行は残す。
 *   規約: https://maou.audio/rule/
 * ★リンクまで出しているのは、配布元が二次配布時に
 *   「著作表記と魔王魂へのリンク、またはURLの記載」を求めているため。
 *   このゲームは mp3 を自分のサーバーから配るので、そちらに寄せて安全側に倒す。
 *
 * ★効果音は Springin' Sound Stock（2026-08-09 追加）。
 *   こちらは**表記が必須ではない**が、配布元が「Springin' Sound Stock を含む
 *   クレジット表記をお願いします」と推奨しているので出している。
 *   規約: https://www.springin.org/sound-stock/guideline/
 *   （商用利用可・申請不要。ただし素材の再配布・素材そのものの販売・NFT化は禁止）
 */
function credits() {
  return h('p', { class: 'small dim center', style: 'margin-top:10px' }, [
    '音楽：',
    h('a', {
      href: 'https://maou.audio/', target: '_blank', rel: 'noopener noreferrer',
    }, '魔王魂'),
    '　効果音：',
    h('a', {
      href: 'https://www.springin.org/sound-stock/', target: '_blank', rel: 'noopener noreferrer',
    }, "Springin' Sound Stock"),
  ]);
}

/**
 * キービジュアル（assets/bg/title.png / .jpg / .webp）
 *
 * 【絵が無くても完成している】ことがこのゲームの前提（tech-design §6）なので、
 * 読めなければ枠ごと消す。拡張子は順に試すので、オーナーは
 * **assets/bg/ に title.* を置くだけ**でよい（コードの変更は不要）。
 */
function keyVisual() {
  const wrap = h('div', { class: 'keyvisual', hidden: true });
  // .jpg を先に試す: 背景は tools/optimize_game_images.py が必ず JPEG に変換するので、
  // 実際に置かれるのはほぼ .jpg。.png を先に見にいくと毎回404が1件出る
  const candidates = ['assets/bg/title.jpg', 'assets/bg/title.png', 'assets/bg/title.webp'];
  let i = 0;
  const img = h('img', {
    class: 'keyvisual__img', alt: '', 'aria-hidden': 'true', decoding: 'async',
    onload: () => { wrap.hidden = false; },
    onerror: () => { i++; if (i < candidates.length) img.src = candidates[i]; else wrap.remove(); },
  });
  img.src = candidates[0];
  wrap.appendChild(img);
  return wrap;
}

function slotRow(ctx, slot) {
  const info = S.slotInfo(slot);

  if (info.broken) {
    return h('div', 'panel', [
      h('div', null, `記録${slot}：読み込めませんでした`),
      h('div', 'small warn', 'データが壊れていたため、バックアップとして退避しました。新しく始められます。'),
      h('button', { class: 'btn btn--sm btn--inline', onclick: () => startNew(ctx, slot) }, 'ここではじめる'),
    ]);
  }

  if (info.empty) {
    return h('button', {
      class: 'btn',
      onclick: () => startNew(ctx, slot),
    }, [`記録${slot}：はじめから`, h('span', 'btn-sub', 'あたらしく登りはじめます。')]);
  }

  const sub = `Lv${info.lv}／到達 ${floorName(info.maxFloor)}${info.cleared ? '（クリア済）' : ''}${info.rebirth > 0 ? `／${info.rebirth + 1}周目（輪廻${info.rebirth}回）` : ''}／${hhmm(info.playSec)}`;
  return h('div', 'panel', [
    h('button', {
      class: 'list__item',
      onclick: () => continueGame(ctx, slot),
    }, [
      h('div', 'list__main', [
        h('div', null, `記録${slot}：${info.name}`),
        h('div', 'list__sub', sub),
      ]),
      h('div', 'list__right gold', 'つづきから'),
    ]),
    h('button', {
      class: 'btn btn--sm btn--inline btn--danger',
      style: 'margin-top:8px',
      onclick: async () => {
        const ok = await confirmBox(
          `記録${slot}「${info.name}」を消します。\nLv${info.lv}・${floorName(info.maxFloor)}・${hhmm(info.playSec)}のぶんが元に戻せなくなります。\n\n本当に消しますか？`,
          '消す', 'やめる');
        if (!ok) return;
        S.removeSlot(slot);
        toast('記録を消しました');
        ctx.render();
      },
    }, 'この記録を消す'),
  ]);
}

function continueGame(ctx, slot) {
  const r = S.load(slot);
  if (!r.ok) { alertBox(r.message || '記録を読み込めませんでした。'); ctx.render(); return; }
  ctx.setSave(r.data, slot);
  // 未読の場面（バージョンアップで増えた分も含む）があれば先に読ませる。
  // 起動時の「祠の文」（spec §7-1）は collect:true で拠点側に頼む。
  // ★ここで直に出すと、会話へ寄り道したときに会話の上へ受け取りモーダルが重なる
  toHome(ctx, { collect: true });
}

async function startNew(ctx, slot) {
  const save = S.newSave('ともし');
  save.createdAt = Date.now();
  save.lastSeenAt = Date.now();
  // 初期パーティ。残りは塔を登ると加わる（src/meta/recruit.js）
  save.party.active = START_PARTY.slice();
  save.chars = {};
  for (const id of START_PARTY) {
    save.chars[id] = { lv: 1, exp: 0, renki: {}, skills: {}, equip: [0, 0, 0], equipped: null };
  }

  ctx.setSave(save, slot);
  const res = ctx.saveNow(true);
  if (!res.ok) return;    // 保存できない端末では始めさせない（10時間遊んで消える方が残酷）

  // 序章。読み終える（または飛ばす）と拠点へ出る
  const ids = St.pending(save, { at: 'newGame' });
  if (ids.length > 0) { ctx.go('talk', { ids, back: 'home', backParams: { intro: true } }); return; }
  ctx.go('home', { intro: true });
}

// ── あそびかた ────────────────────────────────────────────

function showHowTo() {
  return alertBox(
    [
      '■ 戦い方',
      '戦闘は自動で進みます。あなたが決めるのは「作戦」「編成」「装備」の3つです。',
      '',
      '■ いちばん大事な仕組み ―― 構え読み',
      '敵は次の行動の【構え】を1手前に見せています。',
      '　【破】は 敵の【呪】を崩す',
      '　【流】は 敵の【剛】を崩す',
      '　【封】は 敵の【疾】を崩す',
      '崩すと、こちらの攻撃がよく通り、敵のその行動は弱まって追加の効果も乗らなくなります。',
      '逆に一巡ずれると【逆風】になり、攻撃が通りにくくなったうえ、相手の一撃が重くなります。',
      '',
      '■ 探索',
      '「もう1階登るか、ここで引き上げるか」がこのゲームの本題です。',
      '登るほど深度ボーナスが上がって取り分が増えますが、力尽きるとその上乗せは消えます。',
      '',
      '■ 力尽きたら',
      '失うのは「その潜行で拾ったもの」の1割だけです。拠点に置いてある物は減りません。',
      'レベルも装備も残ります。',
    ].join('\n'), 'わかった');
}

// ── セーブの持ち出し・取り込み ────────────────────────────

function showTransfer(ctx) {
  customModal(({ close }) => buildTransfer(ctx, close));
}

function buildTransfer(ctx, close) {
  const txt = document.getElementById('modalText');
  const btns = document.getElementById('modalBtns');

  txt.textContent = '';
  const area = h('textarea', {
    placeholder: '持ち出したコードをここに貼り付けて「取り込む」を押します',
    spellcheck: 'false',
  });
  const pick = h('select', null, SLOTS.map((s) => {
    const i = S.slotInfo(s);
    return h('option', { value: String(s) }, `記録${s}${i.empty ? '（空）' : `：${i.name} Lv${i.lv}`}`);
  }));

  txt.appendChild(h('div', null, [
    h('p', null, 'セーブの持ち出し・取り込み'),
    h('p', 'small dim', '「持ち出す」でコードを作り、別の端末やブラウザで「取り込む」と続きから遊べます。'),
    h('div', { style: 'margin:10px 0' }, pick),
    area,
    // 輪廻は取り消せない操作なので、直前の記録を1つだけ別に取ってある
    h('button', {
      class: 'btn btn--sm btn--inline', style: 'margin-top:10px',
      onclick: () => {
        const code = S.loadBackup(Number(pick.value));
        if (!code) { toast('この記録には、輪廻する前の控えがありません。'); return; }
        area.value = code;
        area.select();
        toast('輪廻する前の記録を出しました。「取り込む」で戻せます。');
      },
    }, '輪廻する前の記録を出す'),
  ]));
  document.getElementById('modal').hidden = false;

  btns.replaceChildren(
    h('button', { class: 'btn', onclick: close }, 'とじる'),
    h('button', {
      class: 'btn', onclick: () => {
        const slot = Number(pick.value);
        const r = S.load(slot);
        if (!r.ok) { toast('その記録は空です。'); return; }
        area.value = S.exportSave(r.data);
        area.select();
        toast('コードを作りました。コピーして保管してください。');
      },
    }, '持ち出す'),
    h('button', {
      class: 'btn btn--primary', onclick: async () => {
        const slot = Number(pick.value);
        const r = S.importSave(area.value);
        if (!r.ok) { alertBox(r.message); return; }
        const cur = S.slotInfo(slot);
        close();
        if (!cur.empty) {
          const ok = await confirmBox(
            `記録${slot}「${cur.name}」（Lv${cur.lv}・${floorName(cur.maxFloor)}）に上書きします。\n今ある記録は元に戻せません。よろしいですか？`,
            '上書きする', 'やめる');
          if (!ok) return;
        }
        const w = S.save(slot, r.data);
        if (!w.ok) { alertBox(w.message); return; }
        toast('取り込みました');
        ctx.render();
      },
    }, '取り込む'),
  );
}

/**
 * 設定画面（spec §13-4 / §13-5）
 *
 * 【要点】難易度は**祠にいるときだけ**変更できる。
 * ダンジョン内で変えられると、ボスの直前でやさしいに落とせてしまい、
 * ランキングが成立しない（spec §13-5・オーナー指示）。
 */

import { h, toast, alertBox, confirmBox, fxOff } from './dom.js';
import * as S from '../core/save.js';
import * as R from '../core/rules.js';
import { CONFIRM_KEYS, willAsk, setAsk, resetAll } from './confirm.js';
import { setVolume, volumeOf, setSeVolume, seVolumeOf, playSe, testTone, audioState } from './audio.js';

export function render(ctx) {
  const save = ctx.save;
  const root = h('div');
  const inDungeon = !!ctx.state.run;
  const from = ctx.state.params?.from || 'home';

  root.appendChild(h('h2', 'sec-title', '設定'));

  // ★タイトル画面からは記録を読み込む前なので save が無い。
  //   ここで save を前提にすると、起動直後に2クリックでアプリが死ぬ（2026-08-02 レビュー指摘）
  if (!save) return renderNoSave(ctx, root);

  // ── 難易度 ──
  root.appendChild(h('div', 'panel', [
    h('div', 'gold', '難易度'),
    inDungeon
      ? h('p', 'small warn', '塔の中では変えられません（祠に戻ってから）')
      // ★1行に収める（2026-08-16 オーナー指示「説明文も行数を減らすように努めてください」）。
      //   390px端末では全角23字で折り返す。「いつでも変えられます」はボタンが押せることで分かる
      : h('p', 'small dim', '記録にはその周でいちばんやさしい難易度が残ります'),
    ...Object.values(R.DIFFICULTY).map((d) => {
      const on = (save.difficulty || 'normal') === d.id;
      return h('button', {
        class: `list__item${on ? ' list__item--on' : ''}`,
        disabled: inDungeon,
        onclick: () => setDifficulty(ctx, d.id),
      }, [
        h('div', 'list__main', [
          h('div', on ? 'gold' : '', d.label),
          h('div', 'list__sub', difficultyDesc(d)),
        ]),
      ]);
    }),
    save.minDifficulty && save.minDifficulty !== 'rinne'
      ? h('p', 'small dim', `この周で使ったいちばんやさしい難易度: ${R.DIFFICULTY[save.minDifficulty]?.label || save.minDifficulty}`)
      : null,
  ]));

  // ── 見やすさ ──
  root.appendChild(h('h2', 'sec-title', '見やすさ'));
  root.appendChild(h('div', 'panel', [
    row('文字の大きさ', h('select', {
      onchange: (e) => { save.settings.textSize = e.target.value; applyAndSave(ctx); },
    }, [['s', '小'], ['m', '中'], ['l', '大']].map(([v, l]) =>
      h('option', { value: v, selected: (save.settings.textSize || 'm') === v }, l)))),
    row('画面の演出', h('select', {
      // ★端末側にも必ず書く。ここだけだと「タイトル画面で切った設定」と食い違う
      //   （applySettings は端末側を先に見る・2026-08-08）
      onchange: (e) => {
        save.settings.fx = e.target.value === 'on';
        const cfg = S.loadSettings() || {};
        cfg.fx = save.settings.fx; S.saveSettings(cfg);
        applyAndSave(ctx);
      },
    }, [['on', 'あり'], ['off', 'なし（点滅・揺れを止める）']].map(([v, l]) =>
      h('option', { value: v, selected: (fxOff() ? 'off' : 'on') === v }, l)))),
  ]));

  // ── 音 ──
  root.appendChild(h('h2', 'sec-title', '音'));
  root.appendChild(h('div', 'panel', [
    volumeRow('BGM', volumeOf(save.settings), setVolume, (v, done) => {
      save.settings.volume = v;
      if (done) applyAndSave(ctx);            // 書き込みは離したときだけ（つまみを動かす間ずっと書かない）
    }),
    volumeRow('SE', seVolumeOf(save.settings), setSeVolume, (v, done) => {
      save.settings.seVolume = v;
      if (done) applyAndSave(ctx);
    }, 'decide'),
    // ★「0にすると鳴りません」は消した（つまみを0にすれば分かる・2026-08-16）
    h('p', 'small dim', '曲は最初に画面を触ってから鳴りはじめます'),
    /**
     * 著作表記。
     * ★魔王魂は利用規約で**必須**。Springin' Sound Stock は推奨（2026-08-12 オーナー指示）。
     *   タイトル画面にも出しているが、あちらは最下部でスクロールしないと見えない。
     *   **音を気にした人が必ず開くのはこの画面**なので、ここには必ず両方置く。
     * ★2026-08-16、2行を**1行にまとめた**（表記は減らさず、行だけ減らす）。
     */
    h('p', 'small dim', [
      '音楽：',
      h('a', { href: 'https://maou.audio/', target: '_blank', rel: 'noopener noreferrer' }, '魔王魂'),
      '／効果音：',
      h('a', {
        href: 'https://www.springin.org/sound-stock/',
        target: '_blank', rel: 'noopener noreferrer',
      }, "Springin' Sound Stock"),
    ]),
    soundHelp(),
  ]));

  // ── 戦闘 ──
  root.appendChild(h('h2', 'sec-title', '戦闘'));
  root.appendChild(h('div', 'panel', [
    row('ボス戦は手動から始める', h('select', {
      onchange: (e) => { save.settings.bossManual = e.target.value === 'on'; applyAndSave(ctx); },
    }, [['off', 'しない'], ['on', 'する']].map(([v, l]) =>
      h('option', { value: v, selected: (save.settings.bossManual ? 'on' : 'off') === v }, l)))),
    save.progress?.cleared
      ? row('戦闘の速さ', h('select', {
        onchange: (e) => { save.settings.speed = Number(e.target.value); applyAndSave(ctx); },
      }, [[1, '等速'], [2, '×2']].map(([v, l]) =>
        h('option', { value: String(v), selected: (save.settings.speed || 1) === v }, l))))
      : h('p', 'small dim', '倍速はエンディング到達後に使えるようになります。'),
  ]));

  // ── 確認画面（2026-08-04 オーナー指示） ──
  root.appendChild(h('h2', 'sec-title', '確認画面'));
  root.appendChild(h('div', 'panel', [
    h('p', 'small dim', '「次からは確かめない」をここで戻せます'),
    ...Object.entries(CONFIRM_KEYS).map(([key, info]) => row(
      info.label,
      h('select', {
        onchange: (e) => { setAsk(save, key, e.target.value === 'on'); applyAndSave(ctx); },
      }, [['on', '確かめる'], ['off', '確かめない']].map(([v, l]) =>
        h('option', { value: v, selected: (willAsk(save, key) ? 'on' : 'off') === v }, l))),
    )),
    h('button', {
      class: 'btn btn--sm btn--inline', style: 'margin-top:10px',
      onclick: () => { resetAll(save); applyAndSave(ctx); ctx.render(); toast('すべて確かめる側に戻しました'); },
    }, 'すべて確かめる側に戻す'),
  ]));

  // ── 記録 ──
  root.appendChild(h('h2', 'sec-title', '記録'));
  root.appendChild(h('div', 'panel', [
    row('自動で記録する', h('select', {
      onchange: (e) => { save.settings.autoSave = e.target.value === 'on'; applyAndSave(ctx); },
    }, [['on', 'する'], ['off', 'しない']].map(([v, l]) =>
      h('option', { value: v, selected: (save.settings.autoSave !== false ? 'on' : 'off') === v }, l)))),
    row('ランキングに参加する', h('select', {
      onchange: (e) => { save.ranking.optIn = e.target.value === 'on'; applyAndSave(ctx); },
    }, [['on', 'する'], ['off', 'しない']].map(([v, l]) =>
      h('option', { value: v, selected: (save.ranking?.optIn !== false ? 'on' : 'off') === v }, l)))),
    h('p', 'small dim', '次の更新で対応。到達階などの記録だけ送ります'),
  ]));

  root.appendChild(h('button', {
    class: 'btn', style: 'margin-top:14px',
    onclick: () => ctx.go(from === 'title' ? 'title' : (inDungeon ? 'explore' : 'home')),
  }, '戻る'));

  return root;
}

/**
 * 記録を読み込む前（タイトル画面から開いたとき）の設定。
 * 難易度・戦闘・ランキングは記録ごとの設定なので、ここでは触れない。
 */
function renderNoSave(ctx, root) {
  const cfg = S.loadSettings() || { textSize: 'm', fx: true };
  const put = (k, v) => { cfg[k] = v; S.saveSettings(cfg); ctx.applySettings(cfg); toast('設定を変えた'); };

  root.appendChild(h('div', 'panel', [
    h('p', 'small dim', '記録を読み込むと難易度なども変えられます'),
    // ★音量はここにも必ず置く。タイトル画面で曲が鳴りはじめるので、
    //   この経路に無いと「うるさいのに止める手段が無い」状態になる
    volumeRow('BGM', volumeOf(cfg), setVolume, (v, done) => { if (done) put('volume', v); else cfg.volume = v; }),
    volumeRow('SE', seVolumeOf(cfg), setSeVolume, (v, done) => { if (done) put('seVolume', v); else cfg.seVolume = v; }, 'decide'),
    // ★こちらにも置く。音が鳴らない人は、記録を読み込む前にここへ来ることが多い
    soundHelp(),
    row('文字の大きさ', h('select', {
      onchange: (e) => put('textSize', e.target.value),
    }, [['s', '小'], ['m', '中'], ['l', '大']].map(([v, l]) =>
      h('option', { value: v, selected: (cfg.textSize || 'm') === v }, l)))),
    row('画面の演出', h('select', {
      onchange: (e) => put('fx', e.target.value === 'on'),
    }, [['on', 'あり'], ['off', 'なし（点滅・揺れを止める）']].map(([v, l]) =>
      h('option', { value: v, selected: (cfg.fx !== false ? 'on' : 'off') === v }, l)))),
  ]));

  root.appendChild(h('button', {
    class: 'btn', style: 'margin-top:14px',
    onclick: () => ctx.go('title'),
  }, 'タイトルへ戻る'));
  return root;
}

/**
 * 音量つまみ。**曲と効果音で1本ずつ**（2026-08-12 オーナー要望）。
 *
 * ★入/切ではなくスライダーにしてある。「消したい」より「小さくしたい」のほうが多いため。
 * ★音は動かした瞬間に反映し、**記録は指を離したときだけ**行う
 *   （動かすたびに書くと、その間ずっとストレージを叩き続ける）。
 * ★耳へ反映する関数（`apply`）を引数で受ける。ここで `setVolume` を直接呼んでいると、
 *   効果音のつまみを動かしたのに**曲の音量が変わる**という取り違えが起きる。
 *
 * @param {string} label 「曲」「効果音」
 * @param {number} value 0〜100
 * @param {(v:number)=>void} apply 耳への即時反映（setVolume / setSeVolume）
 * @param {(v:number, done:boolean)=>void} onChange 記録への反映
 */
/**
 * 「音が出ないとき」（2026-08-16 新設・オーナー指摘
 * 「iphoneだと、SafariやBrave上で、設定上はオンにしているBGMやSEが鳴らない」）。
 *
 * ★**iPhoneの症状はスズカの手元（Windows）では再現できない**ので、
 *   オーナー自身が切り分けられる形にしておく。
 * ★「テストの音」は音源ファイルもBGM/SEのつまみも通さない（`audio.js` の `testTone`）。
 *   これが鳴れば「出力は生きている＝つまみか音源の問題」、
 *   鳴らなければ「端末が音を止めている」と分かる。
 */
function soundHelp() {
  return h('details', { class: 'fold', style: 'margin-top:8px' }, [
    h('summary', 'small', '音が出ないとき'),
    h('p', 'small dim',
      'iPhoneは本体の消音スイッチ（マナーモード）でブラウザの音を止めます。'
      + 'まずスイッチを解除して、端末の音量も上げてみてください。'),
    h('div', 'btn-row', [
      h('button', {
        class: 'btn btn--sm', type: 'button',
        onclick: async () => {
          const st = await testTone();
          toast(st === 'running' ? 'テストの音を鳴らしました' : `鳴らせません（${st}）`);
        },
      }, 'テストの音'),
      h('button', {
        class: 'btn btn--sm', type: 'button',
        onclick: () => {
          const s = audioState();
          alertBox('音の状態\n\n'
            + Object.entries(s).map(([k, v]) => `${k}: ${v}`).join('\n'), 'とじる');
        },
      }, '音の状態'),
    ]),
    h('p', 'small dim',
      'テストの音が鳴るのに曲や効果音が鳴らないときは、上のつまみが0になっていないか見てください。'),
  ]);
}

function volumeRow(label, value, apply, onChange, preview = null) {
  const out = h('span', { class: 'small dim', style: 'min-width:3em;text-align:right' }, `${value}`);
  // ★つまみを動かしている間に何度も鳴らさない（連続で鳴ると音が潰れて、
  //   かえって音量が分からなくなる）。最後に鳴らしてから 220ms は置く
  let lastAt = 0;
  const input = h('input', {
    type: 'range', min: 0, max: 100, step: 5, value,
    'aria-label': `${label}の音量`,
    oninput: (e) => {
      const v = Number(e.target.value);
      out.textContent = `${v}`;
      apply(v);                // 耳への反映は即時
      // ★動かしながら音を確かめられるようにする（2026-08-12 オーナー要望）。
      //   BGMは鳴りっぱなしなので不要。効果音だけ、動かすたびに1つ鳴らす
      if (preview && v > 0) {
        const now = Date.now();
        if (now - lastAt >= 220) { lastAt = now; playSe(preview); }
      }
      onChange(v, false);
    },
    onchange: (e) => onChange(Number(e.target.value), true),
  });
  /**
   * ★ラベルの幅を固定する（2026-08-12 オーナー指摘
   * 「BGMとSEでスライドできる長さが違うので揃えてください」）。
   *   `.kv__k` は中身の文字数で幅が決まるので、「BGM」と「SE」で
   *   ラベルの幅が変わり、そのぶん**つまみの長さが変わっていた**。
   *   つまみは同じ長さでないと、同じ位置＝同じ音量に見えない。
   */
  return h('div', { class: 'volrow' }, [
    h('span', 'volrow__label', label),
    input,
    out,
  ]);
}

function row(label, control) {
  return h('div', { class: 'kv', style: 'align-items:center;padding:6px 0' }, [
    h('span', 'kv__k', label),
    control,
  ]);
}

/**
 * 難易度1つぶんの説明。
 * ★**1行に収める**（2026-08-16 オーナー指示「説明文も行数を減らす」）。
 *   難易度は3つ並ぶので、1件2行だと6行になる。
 *   「力尽きると拾ったものの一部を失う」は主語（力尽きたら）が3つとも同じなので畳んだ。
 */
function difficultyDesc(d) {
  const parts = [
    `敵 ×${d.enemyMul}`,
    `受ける傷 ×${d.takenMul}`,
    d.lost ? '力尽きると一部を失う' : '失うものなし',
    d.ranked ? '' : 'ランキング対象外',
  ].filter(Boolean);
  return parts.join('／');
}

function setDifficulty(ctx, id) {
  const save = ctx.save;
  save.difficulty = id;
  // その周で使った「もっともやさしい」難易度を残す（ランキング判定・spec §13-5）
  const rank = { easy: 0, normal: 1, rinne: 2 };
  if (rank[id] < rank[save.minDifficulty ?? 'rinne']) save.minDifficulty = id;
  applyAndSave(ctx);
  ctx.render();
}

function applyAndSave(ctx) {
  // ★保存が先。applySettings は音量を「端末の設定」から読み直すので、
  //   先に applySettings を呼ぶと、いま動かしたつまみが1つ前の値に戻される
  S.saveSettings(ctx.save.settings);
  ctx.applySettings();
  ctx.saveNow(true);
  toast('設定を変えた');
}

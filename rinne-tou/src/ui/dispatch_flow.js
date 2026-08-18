/**
 * 影送りの受け取り（画面をまたぐ共通処理）
 *
 * 拠点画面（庵で休む・起動時）と影送り画面の両方から呼ぶ。
 * **画面モジュールどうしが直接 import し合わないようにするため**にここへ出した
 * （app.js の方針・`run_flow.js` と同じ理由）。
 *
 * `D.collect()` は「済んだ派遣を配列から取り除く」ことで冪等なので、
 * 2箇所から呼んでも二重受領にはならない。
 */

import { alertBox, n, zeni } from './dom.js';
import * as D from '../meta/dispatch.js';
import * as G from '../meta/growth.js';

/**
 * 終わった影を回収し、「祠の文」を1通ずつ見せる。
 * @returns {Promise<object>} collect() の結果
 */
export async function collectDispatch(ctx) {
  const res = D.collect(ctx.save, ctx.now());
  const nothing = res.letters.length === 0 && res.heldPickedUp === 0 && res.held === 0;
  if (nothing) return res;

  ctx.saveNow(true);

  // 前回あふれて祠が預かっていたぶんを引き取れた場合。
  // 祠の文がある回でも必ず報告する（`totals.equips` に混ぜると報告が消える）
  if (res.heldPickedUp > 0) {
    await alertBox(`祠が預かっていた装備 ${res.heldPickedUp}点を受け取った。`, 'とじる');
  }

  for (const L of res.letters) {
    const lines = [L.text, ''];
    const got = [];
    if (L.exp > 0) got.push(`経験 ${n(L.exp)}`);
    if (L.zeni > 0) got.push(`銭 ${zeni(L.zeni)}`);
    for (const [k, v] of Object.entries(L.mats)) if (v > 0) got.push(`${G.MAT_NAME[k] || k} ×${n(v)}`);
    for (const nm of L.equipNames) got.push(nm);
    lines.push(got.length ? got.join('　') : '　めぼしいものは無かった。');
    if (L.leveled) lines.push(`${L.name} は Lv${L.leveled.to} になった。`);
    if (L.injured) lines.push(`${L.name} は ${D.COOLDOWN_HOURS}時間ほど休みます。`);
    await alertBox(lines.join('\n'), '受け取る');
  }

  if (res.held > 0) {
    await alertBox(
      `持ち物がいっぱいなので、拾ってきた装備 ${res.held}点は祠が預かっています。\n` +
      'いらない装備を売ってから、もう一度「祠の文」を開くと受け取れます。', 'わかった');
  }
  return res;
}

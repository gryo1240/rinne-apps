/**
 * 戦闘の「どの絵を出すか・どの音を鳴らすか」の判定（2026-08-09 に screen_battle.js から分離）
 *
 * 【なぜ分けたか】
 * 判定が screen_battle.js の中にあった間、**テストから呼べなかった**。
 * `test.mjs` はソースを文字列として読んで対応表の綴りを見るしかできず、
 * 「順位で勝ちうる行に音の割り当てが漏れていないか」を確かめられなかった。
 * その隙で実際にバグが出ている:
 *   状態異常(rank 3)はダメージ(rank 1)より格上なので、
 *   **火傷や麻痺を付けた攻撃は ailment 行が勝ち、音の対応表に無いので無音**になっていた
 *   （実ログ360戦で 7096ステップ中 242件・3.4%。2026-08-09 レビュー指摘）。
 *
 * ここはDOMに一切触らない。だから `test.mjs` が**実際の戦闘ログを流して**検証できる。
 */

import { SKILLS } from '../../data/skills.js';
import { FX_BY_LINE, FX_BY_AILMENT } from '../../assets/art-manifest.js';

/**
 * 1つの対象に複数当たったとき、どの行を代表にするかの格付け。
 *
 * ★**1対象につき絵は1枚・1ステップにつき音は1つ**。味方の紋は34px しかなく、
 *   2枚重ねたら泥になる。音も全体攻撃で4回鳴ると潰れて「バリッ」としか聞こえない。
 *   `drawLog` が「最も重い1行だけ出す」のと同じ思想でそろえてある。
 */
/* ★`adverse` は `damage` より上に置く（2026-08-11 オーナー指摘
   「逆風と崩しの演出が弱くて普段の攻撃と分かりづらい」）。
   以前は damage と同じ 1 で、同順位なら後の行が勝つ実装だったため、
   全体攻撃で「逆風の1体＋通常ヒットの3体」が同じステップに入ると、
   **逆風が代表に選ばれるかどうかが並び順まかせ**になっていた（＝音が鳴ったり鳴らなかったりする）。 */
export const FX_RANK = { crush: 5, ailment: 4, heal: 3, adverse: 2, damage: 1 };

/** そのログ行に出すエフェクトのID */
export function fxIdOf(l) {
  if (l.kind === 'crush') return 'crush';
  // ★三すくみの反対側。崩しだけ専用の絵で、逆風が通常ヒットと見分けられないと
  //   「有利／不利」の片側しか伝わらない
  if (l.kind === 'adverse') return 'adverse';
  if (l.kind === 'ailment') return FX_BY_AILMENT[l.ail] || 'ail';
  if (l.kind === 'heal') return 'heal';
  // 敵の攻撃は系統を持たない（あるのは構え）。同じ絵に2つの意味を持たせると
  // 本作の核である三すくみの読み取りを汚すので、敵は hit 一択にする
  if (l.actId) return 'hit';
  const line = SKILLS[l.skillId]?.line;
  return FX_BY_LINE[line] || 'hit';
}

/**
 * エフェクトID → 効果音ID。
 *
 * ★状態異常（ail / burn / numb / slow）には**わざと音を割り当てていない**。
 *   専用の音を持っていないので、無理に当てると「何の音か分からない音」が増えるだけ。
 *   ただし**割り当てが無い行を代表に選んではいけない**（下の seForLines を参照）。
 */
export const SE_BY_FX = {
  crush: 'crush',      // 崩し成立（会心の一撃）★山場
  heal: 'heal',        // 回復
  slash: 'slash',      // 破（斬撃）
  guard: 'slash',      // 流（受け流しつつ斬る）。破と同系統の音でよい
  seal: 'hit',         // 封（縛る）。専用の音は持っていない
  hit: 'hit',          // 通常攻撃・敵の攻撃
  // 逆風（弾かれて弱く当たった）。★2026-08-11 まで 'hit' を割り当てていたが、
  // それでは通常ヒットと**まったく同じ音**で、三すくみの不利側だけ耳に届かなかった。
  // 金属が噛み合う音にして、崩し（会心）と対になるようにしてある
  adverse: 'clash',
};

/**
 * そのステップで鳴らす効果音を1つ返す（鳴らさないときは null）。
 *
 * ★**音を持たない行を勝たせない**。これが今回の要点。
 *   `popFx` が `fxSrc()` の有無で同じガードを持っている（絵が無い行を勝たせない）。
 *   2026-08-06 に絵の側で踏んだ罠を、音の側で再発させたので同じ形にそろえた。
 *   これが無いと「火傷を付けた攻撃はダメージも与えているのに無音」になる。
 *
 * @param {Array} lines そのステップのログ行
 * @returns {string|null} 効果音ID
 */
export function seForLines(lines) {
  if (!lines || !lines.length) return null;
  let best = null;
  for (const l of lines) {
    if (!l.target) continue;
    const rank = FX_RANK[l.kind];
    if (rank == null) continue;
    if (!SE_BY_FX[fxIdOf(l)]) continue;          // ★音の無い行は代表にしない
    if (!best || rank >= FX_RANK[best.kind]) best = l;
  }
  return best ? SE_BY_FX[fxIdOf(best)] : null;
}

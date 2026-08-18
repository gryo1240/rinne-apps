/**
 * 絵の差し替え機構（tech-design §6）
 *
 * **ここに列挙したIDだけ**が画像として読まれる。列挙が無ければ漢字1字の「紋」で表示される。
 * つまり v1.0 は絵ゼロで完成し、絵ができたら
 *   ① assets/mon/<id>.png を置く  ② 下の Set に <id> を1行足す
 * の2手順だけで反映される。**コードは1行も変えなくてよい。**
 *
 * ⚠ 存在しない画像を列挙すると 404 が出て見た目が壊れる。
 *   置いてから足すこと（順序を逆にしない）。
 */

/**
 * 敵・キャラの紋（円形・52px想定）
 *
 * ★引くときのIDは `dom.mon()` が `e.art` → `e.id` の順で見る。
 *   敵の `id` は `onibi_0` のように個体ごとの連番が付くので、**絵は種族IDで持つ**。
 *   ボスは `boss_` を前置してある（キャラの「無銘」とボス「無銘の影」が
 *   どちらも `id: 'mumei'` で衝突するため）。
 */
export const ART_MON = new Set([
  // 仲間
  'hero',       // ともし（主人公）
  'suzu',       // 鈴
  'kuroha',     // 黒羽
  'isurugi',    // 石動
  'kitsunebi',  // 狐火
  'yori',       // 縒（2026-08-05）
  // ★キャラの「無銘」とボスの「無銘の影」はどちらも id: 'mumei'。
  //   ボス側は `boss_mumei` に前置してあるので衝突しない
  'mumei',      // 無銘（2026-08-05）
  // 雑魚・本編（種族ID）
  'onibi',      // 鬼火
  'tsuchigumo', // 土蜘蛛
  'karakasa',   // 唐傘
  'kappa',      // 河童
  'shirohebi',  // 白蛇
  'ishizaru',   // 石猿
  'nezumi',     // 影鼠
  'nurikabe',   // 塗壁
  'yamabiko',   // 山彦
  'kamaitachi', // 鎌鼬
  'sagari',     // 下がり
  'hitodama',   // 人魂
  'oni',        // 赤鬼
  'tengu',      // 木天狗
  'nue',        // 鵺
  'ubume',      // 姑獲鳥
  'gashadokuro',// 骸骨
  'ittanmomen', // 一反木綿
  // 雑魚・支塔（鬼哭洞・疾風廊・呪詛淵・月渡り）
  'ishikame',   // 石亀
  'oniwaraji',  // 鬼草鞋
  'iwaushi',    // 岩牛
  'kobushi',    // 拳鬼
  'kazehiki',   // 風曳
  'hayate',     // 疾風丸
  'tsujikaze',  // 辻風
  'hayabusa',   // 隼影
  'norotama',   // 呪玉
  'tatarigami', // 祟神
  'ubagami',    // 姥神
  'kuchinawa',  // 朽縄
  'tsukiishi',  // 月石
  'tsukiusagi', // 月兎
  'tsukikasa',  // 月暈
  // 本編の層ボス（boss_ + ボスID）
  'boss_monban', // 朽ちた門番（10F）
  'boss_kemono', // 月喰みの獣（20F）
  'boss_ishi',   // 石の記憶（30F）
  'boss_miko',   // 狐火の巫女（40F）
  'boss_mumei',  // 無銘の影（50F）
  'boss_mon',    // 還る門（60F）
  // 支塔の主（2026-08-06）
  'boss_s_nakioni',      // 哭き鬼（鬼哭洞）
  'boss_s_kazakiri',     // 風切（疾風廊）
  'boss_s_fuchinokuchi', // 淵の口（呪詛淵）
  'boss_s_wataritsuki',  // 渡り月（月渡り）
  // ── 朔の窖・望の櫓（2026-08-14 オーナー提供の敵シート7から切り出し）──
  //   ★ここが空だったので、支塔2本の敵だけ漢字1字の紋のまま出ていた
  'sakuishi',   // 朔石（朔の窖・剛）
  'yoiga',      // 宵蛾（朔の窖・疾）
  'tsutakage',  // 蔦影（朔の窖・呪）
  'mochigane',  // 望鐘（望の櫓・剛）
  'kakebito',   // 欠人（望の櫓・疾）
  'ariakebi',   // 有明火（望の櫓・呪）
  'boss_s_sodachimayu',  // 育ちの繭（朔の窖の主）
  'boss_s_kakenokami',   // 欠けの守（望の櫓の主）
  // ★「これで全部揃った」とは書かないこと（2026-08-14）。
  //   2026-08-06 にそう書いたが、その後 塔が2本増えて6種＋2体が足りなくなった。
  //   いま揃っているのは: 仲間7人・雑魚39種・本編ボス6体・支塔の主6体
]);

/** キャラ立ち絵（会話画面用） */
export const ART_CHARA = new Set([
  'hero',       // ともし（2026-08-04・オーナー提供の立ち絵を採用）
  'suzu',       // 鈴
  'kuroha',     // 黒羽
  'isurugi',    // 石動
  'kitsunebi',  // 狐火
  'yori',       // 縒（2026-08-05）
  'mumei',      // 無銘（2026-08-05）
  // ★紬は**仲間ではない**（data/chars.js の EXTRA_CAST）。会話にだけ出る
  'tsumugi',    // 紬（2026-08-12・オーナー提供）
]);

/**
 * 使える表情の語彙（これ以外は書いても無視され、基本表情のまま出る）。
 *
 * ★勝手に増やさない。増やすとシナリオ側の書き間違いが素通りする。
 *   増やすときはここと test.mjs の検査を同時に直すこと。
 */
export const FACES = ['smile', 'sad', 'angry', 'surprise', 'hurt'];

/**
 * 表情差分の立ち絵（会話画面用）。置き場は `assets/chara/<id>_<表情>.png`。
 *
 * ★**ファイル名をそのまま1行足す**（`'suzu_smile'` のように）。ART_CHARA と同じ作法。
 *   無い表情を指定しても404にはならない。次の順で静かに落ちる:
 *     ① assets/chara/<id>_<表情>.png（ここに列挙されているとき）
 *     ② assets/chara/<id>.png（ART_CHARA にあるとき＝基本表情）
 *     ③ 漢字1字の紋
 *   したがって**全員ぶんの差分を揃える必要はない**。作った人ぶんだけ置けばよい。
 */
export const ART_FACE = new Set([
  // 鈴（2026-08-06・オーナー提供。基本表情も新しい絵に差し替え済み）
  'suzu_smile',     // 笑顔
  'suzu_sad',       // 困り顔
  'suzu_angry',     // 怒り
  'suzu_surprise',  // 驚き
  'suzu_hurt',      // ダメージ
  // 黒羽（2026-08-06・オーナー提供）
  'kuroha_smile',
  'kuroha_sad',
  'kuroha_angry',
  'kuroha_surprise',
  'kuroha_hurt',
  // 石動（2026-08-07・オーナー提供。基本表情も新しい絵に差し替え済み）
  'isurugi_smile',
  'isurugi_sad',
  'isurugi_angry',
  'isurugi_surprise',
  'isurugi_hurt',
  // 狐火（2026-08-07・同上。基本表情の元絵は kitsunebi_raw.png）
  'kitsunebi_smile',
  'kitsunebi_sad',
  'kitsunebi_angry',
  'kitsunebi_surprise',
  'kitsunebi_hurt',
  // 無銘（2026-08-09・オーナー提供。基本表情も新しい絵に差し替え済み）
  // ★この子だけ「困り顔」の元絵が無いので4種。`sad` を指定した場面は基本表情に落ちる
  'mumei_smile',
  'mumei_angry',
  'mumei_surprise',
  'mumei_hurt',
  // 縒（2026-08-10・オーナー提供。基本表情も新しい絵に差し替え済み）
  // ★元絵 yori_normal.png だけ背景が黒く塗られていた（差分5枚は透過済み）。
  //   `tools/remove_bg_dark.py`（--tol 8）で外周から塗りつぶして抜いてから取り込んだ。
  //   ★白背景用の `remove_bg.py` は使えない。あちらは色距離でアルファを決めるので、
  //     黒背景だと墨の輪郭線ごと消える（標準・--geometric のどちらでも線画が抜けた・2026-08-10）。
  //   しきい値を30まで上げると髪と袴まで消える（黒背景と墨の輪郭線が近い色のため）
  'yori_smile',
  'yori_sad',
  'yori_angry',
  'yori_surprise',
  'yori_hurt',
  // 紬（2026-08-12・オーナー提供）。★仲間ではないので基本＋3枚だけ
  //   （怒りと困り顔は使う場面が無い。無い表情を指定しても基本表情に落ちる）
  'tsumugi_smile',     // 後日談・糸車を回している場面
  'tsumugi_surprise',  // 五十六階・はじめて目が合う場面
  'tsumugi_hurt',      // 頂・「わたしが、やる」の場面
  // ★各6枚は tools/make_chara_faces.py で**同じ切り出し枠**にそろえてある。
  //   1枚ずつ作ると表情が変わるたびに顔の位置と大きさが動く
]);

/**
 * 戦闘エフェクト（2026-08-06）。置き場は `assets/fx/<id>.png`。
 *
 * ★**1エフェクト＝1枚の透過PNG（256×256）**。コマ割り（スプライトシート）にしない。
 *   `tools/make_game_fx.py` が元絵から作る（手で縮めない）。
 *   生成AIでコマ間の位置と大きさを揃えるのは現実的でなく、ずれると使えないため。
 *   拡大とフェードは CSS でやる（`.fx-burst`）。
 *
 * ★**列挙が無ければ何も出ない**＝いまと完全に同じ挙動。だから絵ゼロで完成している。
 */
export const FX = ['hit', 'slash', 'guard', 'seal', 'crush', 'adverse',
  'heal', 'ail', 'burn', 'numb', 'slow'];

/**
 * 絵が無いときの落とし先。null は「出さない」。
 *
 * ★これが無いと、`hit` だけ用意した段階で
 *   「通常攻撃は光るのに崩しは光らない」という**重要度の逆転**が起きる。
 * ★綴りを間違えても実機では黙って何も出ないだけなので、test.mjs が
 *   「キーが FX 全種」「値が FX か null」「循環していない」を機械で見張っている
 */
export const FX_FALLBACK = {
  crush: 'hit', adverse: 'hit', slash: 'hit', guard: 'hit', seal: 'hit',
  burn: 'ail', numb: 'ail', slow: 'ail',
  hit: null, heal: null, ail: null,
};

/** 技の系統（data/skills.js の line）→ エフェクト */
export const FX_BY_LINE = { ha: 'slash', ryu: 'guard', fu: 'seal', none: 'hit' };

/**
 * 状態異常（data/skills.js の AILMENTS）→ エフェクト。
 * 載っていない異常は共通の `ail` に落ちるので、9種すべてで見え方が揃う
 */
export const FX_BY_AILMENT = { yakedo: 'burn', mahi: 'numb', don: 'slow' };

export const ART_FX = new Set([
  // ★2026-08-07 に**11種すべて揃った**（オーナー提供）。FX_FALLBACK はもう使われないが、
  //   絵を差し替える途中で1枚だけ外しても壊れないように残してある
  'hit',      // 墨の飛沫＋白い円相＋金の筋（通常攻撃・敵の攻撃）
  'slash',    // 朱と白の三日月（破）
  'guard',    // 水色の帯（流）
  'seal',     // 注連縄の輪＋紙垂（封）
  'crush',    // 金の炸裂（崩し）★山場
  'adverse',  // 鉛色の二重輪（逆風）。崩しと正反対に、暗く・すぼまる
  'heal',     // 縦に連なる金の灯（回復）
  'ail',      // 紫の靄（状態異常・共通）
  'burn',     // 炎（火傷）
  'numb',     // 稲妻（麻痺）
  'slow',     // 絡まる金の糸（鈍）
]);

/**
 * そのエフェクトのURL。無ければ順に落とし、行き先が尽きたら null（何も出さない）。
 * ★回数を決め打ちにしない。いまの表は全部1段だが、2段の連鎖を足した瞬間に
 *   1段足りずに黙って消える罠になる。訪問済みで止めれば循環しても安全
 */
export function fxSrc(id) {
  const seen = new Set();
  let cur = id;
  while (cur && !seen.has(cur)) {
    if (ART_FX.has(cur)) return `assets/fx/${cur}.png`;
    seen.add(cur);
    cur = FX_FALLBACK[cur] || null;
  }
  return null;
}

/**
 * 背景。置き場は `assets/bg/<id>.jpg`。
 *   tower-1〜4 … 本編60階を4つの帯に割ったもの
 *   deep       … 深層（61階〜）
 *   home       … 拠点（祠）
 */
export const ART_BG = new Set([
  'tower-1', 'tower-2', 'tower-3', 'tower-4', 'deep', 'home',
  // 支塔ごとの絵（2026-08-14 オーナー提供）。**持っている塔だけ**ここに足す
  'sakugura', 'mochiyagura',
]);

/**
 * 塔そのものの絵を持っている支塔（`dungeon/towers.js` のID）。
 *
 * ★ここに無い支塔（鬼哭洞・疾風廊・呪詛淵・月渡り）は、
 *   従来どおり**階数で本編の帯**に落とす。絵が無いのに専用IDを書くと
 *   `ART_BG.has()` で弾かれて黒背景になるだけなので、**絵を置いてから足す**。
 */
const TOWER_BG = { sakugura: 'sakugura', mochiyagura: 'mochiyagura' };

/**
 * その階に敷く背景のID（無ければ null）。
 * @param {number} floor
 * @param {string} [tower] 塔ID。専用の絵を持つ支塔はそちらを優先する
 */
export function bgForFloor(floor, tower = 'main') {
  const t = TOWER_BG[tower];
  if (t && ART_BG.has(t)) return t;
  const f = Math.max(1, Number(floor) || 1);
  const id = f > 60 ? 'deep'
    : f <= 15 ? 'tower-1' : f <= 35 ? 'tower-2' : f <= 55 ? 'tower-3' : 'tower-4';
  return ART_BG.has(id) ? id : null;
}

/** 画面ごとの背景ID（塔の中は bgForFloor が決める） */
export function bgForScreen(screen) {
  // 拠点まわり（祠・編成・鍛冶・記録・影送り・因果盤）は同じ庵の絵で通す
  const HOME_SCREENS = ['home', 'party', 'records', 'dispatch', 'board', 'result', 'shop', 'chars'];
  return HOME_SCREENS.includes(screen) && ART_BG.has('home') ? 'home' : null;
}

/**
 * 会話の場面に敷く背景ID（2026-08-09 オーナー要望「ストーリー中に背景が真っ暗」）。
 *
 * ★**場面データから自動で決める**。`data/scenario.js` に `bg` フィールドは足さない。
 *   足すと「書いたのに一生出ない」書き間違いを機械で見張る責務が増えるだけで、
 *   置ける絵は結局この6枚しかない（表情の `face` で同じ罠を踏んでいる）。
 *
 * ★**`ctx.state.run.floor` から引いてはいけない。** 2か所で破綻する:
 *   ① `story_flow.toExplore()` は探索画面に**入る前**に会話へ飛ぶので run はまだ null
 *   ② 拠点で読む「取りこぼした階の場面」は run が null のまま中身が塔の場面
 *   場面が自分で持っている `floor` を使うこと。
 *
 * ★絆イベントの `floor` は**「到達階の条件」であって場所ではない**（拠点で起きる）。
 *   ここを取り違えると、8階で解放される鈴の話に塔の絵が敷かれる。
 */
export function bgForScene(sc) {
  if (!sc) return null;
  if (sc.at === 'bond' || sc.at === 'newGame' || sc.at === 'cleared') {
    return ART_BG.has('home') ? 'home' : null;
  }
  return bgForFloor(sc.floor);
}

export function hasMon(id)   { return ART_MON.has(id); }
export function hasChara(id) { return ART_CHARA.has(id); }
export function hasBg(id)    { return ART_BG.has(id); }

/** その表情の差分があるか。無ければ呼び元が基本表情へ落とす */
export function hasFace(id, face) {
  return !!id && !!face && ART_FACE.has(`${id}_${face}`);
}

/**
 * 表情の並び順と日本語名（2026-08-16 新設・オーナー指示
 * 「立ち絵タップでの拡大では、せっかくですから、他の表情差分も見えるようにしましょうか」）。
 *
 * ★ここに無い表情は人物帳の切り替えに出ない。`ART_FACE` に足したら**ここにも足す**
 *   （`test.mjs` が「ART_FACE の表情がすべてこの表にある」ことを見張っている）。
 */
export const FACE_LABEL = {
  smile: '笑顔',
  sad: '困り顔',
  angry: '怒り',
  surprise: '驚き',
  hurt: '傷ついた顔',
};
export const FACE_ORDER = Object.keys(FACE_LABEL);

/**
 * その人の立ち絵を、基本表情＋差分の順に並べて返す。
 * 差分が1枚も無い人（ともし）は基本表情だけの1件になる。
 * @returns {Array<{face:string|null, label:string, src:string}>}
 */
export function faceListOf(id) {
  const out = [];
  if (hasChara(id)) out.push({ face: null, label: '基本', src: `assets/chara/${id}.png` });
  for (const f of FACE_ORDER) {
    if (hasFace(id, f)) out.push({ face: f, label: FACE_LABEL[f], src: `assets/chara/${id}_${f}.png` });
  }
  return out;
}

/**
 * 会話画面で貼る立ち絵のURL。無ければ null（呼び元が紋に落とす）。
 * ★ここで表情→基本表情の落とし込みまで済ませる。呼び元で分岐させない
 */
export function charaSrc(id, face) {
  if (hasFace(id, face)) return `assets/chara/${id}_${face}.png`;
  if (hasChara(id)) return `assets/chara/${id}.png`;
  return null;
}

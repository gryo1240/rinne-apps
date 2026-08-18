/**
 * 曲の差し替え機構（art-manifest.js の音版・2026-08-05）
 *
 * **ここに列挙したIDだけ**が鳴る。列挙が無ければ**その場面は無音**になる（エラーにはならない）。
 * つまり音源ゼロのまま完成しており、曲ができたら
 *   ① assets/bgm/<id>.mp3 を置く  ② 下の Set に <id> を1行足す
 * の2手順だけで鳴りだす。**コードは1行も変えなくてよい。**
 *
 * ⚠ 存在しない曲を列挙すると、その場面で取得に失敗して無音になる（音は出ないが害もない）。
 *   絵と同じく、置いてから足すこと。
 *
 * 【容量の注意】絵より音のほうが重い。**1曲1.5MB以内**（モノラル・96〜128kbps・
 * ループ90〜120秒）を守ること。スマホの通信量に直結する。
 */

/** 鳴らせる曲。ファイルは assets/bgm/<id>.mp3 */
/**
 * ★2026-08-08 に5曲すべて入った。素材は **魔王魂**（作曲: 森田交一）。
 *   商用利用可・申請不要だが **著作表記が必須**なので、
 *   タイトル画面に「音楽：魔王魂」とリンクを出している（screen_title.js）。
 *   **曲を差し替えても、この表記は消さないこと。**
 *
 * ★入れてあるのは配布元の**ループ版**。末尾が先頭につながるよう作られているので、
 *   `tools/make_game_bgm.py --no-fade` で変換している（フェードを焼くと1周ごとに音が凹む）。
 */
export const BGM = new Set([
  'title',    // タイトル画面（民族32・琴）
  'home',     // 拠点（祠・編成・記録・影送り・因果盤）（ヒーリング13「帰路へ」）
  'tower',    // 塔の中（探索・通常戦闘）（ファンタジー07「深層で見た太陽」）
  'boss',     // 層ボス・支塔の主（民族33「和bravery heart」）
  'battle',   // 通常戦闘（ネオロック73「夕日の沈む丘へ」和風ロック）
  'ending',   // 終章（エンディング到達後）（民族31）
]);

/**
 * 鳴らせる効果音。ファイルは assets/se/<id>.mp3（2026-08-09 オーナー要望で追加）
 *
 * ★曲と同じく**ここに列挙したIDだけ**が鳴る。無ければその場面は無音（エラーにはならない）。
 *   足す手順も同じ2つだけ:
 *     ① tools/make_game_se.py で assets/se/<id>.mp3 を作る  ② 下の Set に足す
 *
 * 素材は **Springin' Sound Stock**（商用利用可・申請不要・表記は必須ではないが推奨）。
 *   推奨に従いタイトル画面に「効果音：Springin' Sound Stock」を出している（screen_title.js）。
 *   **差し替えても、この表記は消さないこと。**
 *
 * 【容量】曲と違って一度に何本も鳴るが、1本10〜40KBなので11本で約190KB。
 *   増やすときも**合計1MBを超えないこと**（超えたら make_game_se.py の --kbps を下げる）。
 */
export const SE = new Set([
  // 操作
  'tap',      // 選択・カーソル（軽い）
  'decide',   // 決定・画面を進める
  // 探索
  'chest',    // 宝箱（きらめき）
  'kaii',     // 怪異に出くわす（不気味な出現音）
  'shrine',   // 祠（神社の本坪鈴）
  // 戦闘
  'slash',    // 斬る系（破・流）
  'hit',      // 打撃・被弾
  'crush',    // 崩し成立（会心の一撃）
  'clash',    // 逆風（剣ぶつかり合い3）★通常ヒットと同じ音では有利・不利が伝わらない
  'heal',     // 回復
  // 節目
  'win',      // 戦闘に勝った（太鼓2連打）
  'levelup',  // レベルが上がった
  'lose',     // 全滅
]);

/** 効果音のURL。sw.js はこの拡張子を見て音声用のキャッシュに振り分ける */
export function seUrl(id) { return `assets/se/${id}.mp3`; }

export function hasSe(id) { return SE.has(id); }

/**
 * 「いまの曲を変えない」を表す合図。
 *
 * ★会話画面・設定画面でこれを返しているのは意図的。開くたびに曲が切り替わると、
 *   往復のたびに曲がぶつ切りになって頭から鳴り直す。会話に専用曲がほしくなったら
 *   `'talk'` を返すように変えて `BGM` に足せばよい（設定画面は常に KEEP でよい）。
 */
export const KEEP = Symbol('keep');

/**
 * いまの画面に対して鳴らすべき曲を1つ返す。
 *
 * ★**画面単位ではなく場面単位**で決める。拠点まわりだけで5画面あるので、
 *   画面ごとに切り替えると祠を歩くたびに曲が切れる。
 *
 * @param {{screen:string, run:object|null, params:object, save:object|null}} st
 * @returns {string|null|KEEP} 曲ID／null（無音）／KEEP（今のまま）
 */
export function bgmForScene(st) {
  const screen = st?.screen;
  // ★設定画面は今の曲のまま。入れないと「タイトル→設定→戻る」で
  //   タイトル曲→拠点曲→タイトル曲(頭から) と2回切り替わる（設定は塔の中からも開ける）
  if (screen === 'settings') return KEEP;

  // ★会話画面は**中身で決める**（2026-08-08 オーナー指摘）。
  //   以前は無条件に KEEP にしていたため、**ボスを倒した直後の場面が
  //   ボス戦の曲のまま進行**していた（story_flow.afterBoss → talk）。
  //   場面側が `bgm` を明示していればそれを最優先。
  //   明示が無ければ「塔の中なら塔の曲／それ以外は拠点の曲」に戻す。
  //   ただし**同じ曲が続く往復では KEEP と同じ結果になる**ので、
  //   拠点⇔会話を行き来しても曲は切れない（それが KEEP の本来の目的だった）。
  if (screen === 'talk') {
    const want = st?.params?.bgm;
    if (want === 'keep') return KEEP;
    if (want) return pick(want, 'home');
    // 塔の中の会話（階の場面・ボス撃破後）は塔の曲へ戻す。
    // ★ボス曲には戻さない。戦いは終わっているので、ここが今回の修正点
    if (st?.run) return pick(bandOf(st.run.floor), 'tower');
    return homeBgm();
  }

  if (screen === 'title') return pick('title');

  // 塔の中。**探索と戦闘で曲を分ける**（2026-08-08 オーナー要望）
  if (st?.run) {
    if (screen === 'battle') {
      // ボスは専用曲。通常戦闘は battle。どちらも無ければ塔の曲のまま
      if (st.params?.ev?.isBoss) return pick('boss', 'battle', bandOf(st.run.floor), 'tower');
      return pick('battle', bandOf(st.run.floor), 'tower');
    }
    if (screen === 'explore') {
      // 階の帯ごとに曲を分けたくなったら `tower-1`〜`tower-4`・`deep` を置くだけでよい。
      // 無ければ `tower` に落ちる（絵の bgForFloor と同じ帯の切り方に合わせてある）
      return pick(bandOf(st.run.floor), 'tower');
    }
  }

  return homeBgm();
}

/**
 * 拠点まわりの曲。**いつでも拠点の曲**。
 *
 * ★以前はクリア後だけ `ending`（終章の曲）に差し替えていたが、やめた
 *   （2026-08-13 オーナー指摘「ストーリーのBGMが普段と違った場合、
 *     祠に戻ってからも同じBGMが流れ続けている」）。
 *   60階の場面と後日談は `ending` を鳴らすので、クリア後の拠点を `ending` にすると
 *   **読み終えて祠へ戻っても曲が変わらない**＝「場面の曲が鳴り止まない」ように見える。
 *   実測でもクリア済みの記録では祠・ストーリー画面とも `ending` が鳴り続けていた。
 * ★終章の曲は「その場面のための曲」であって、拠点の常用曲ではない。
 *   拠点は拠点の曲に必ず戻す、と決めておけば、場面側にどんな曲を足しても
 *   「戻したのに戻らない」は起きない。
 */
function homeBgm() {
  return pick('home');
}

/** 階 → 帯（assets/art-manifest.js の bgForFloor と同じ区切り） */
function bandOf(floor) {
  const f = Math.max(1, Number(floor) || 1);
  return f > 60 ? 'deep'
    : f <= 15 ? 'tower-1' : f <= 35 ? 'tower-2' : f <= 55 ? 'tower-3' : 'tower-4';
}

/** 先に見つかった「実在する曲」を返す。1つも無ければ null（無音） */
function pick(...ids) {
  for (const id of ids) if (BGM.has(id)) return id;
  return null;
}

export function hasBgm(id) { return BGM.has(id); }

/** 曲のURL。sw.js はこの拡張子を見て音声用のキャッシュに振り分ける */
export function bgmUrl(id) { return `assets/bgm/${id}.mp3`; }

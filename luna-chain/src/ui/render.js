/**
 * ルナチェイン｜盤の描画と演出
 *
 * ★ここはルールを判断しない★ 記録済みのイベント（rules.js の events）を
 *   applyEvent で1つずつ再生して描くだけ。連鎖の理屈を画面側に書き直さない。
 *
 * ★ド派手にしても、テンポを殺さない★（仕様書§5-2）
 *   連鎖が進むほど1コマを短くする（加速）。何連鎖でも演出の総時間は MAX_ANIM_MS に収める。
 *
 * ★光過敏性発作への配慮は演出より優先★（§5-4）
 *   広い面積の明滅は1秒に3回以下・赤の強い明滅は使わない・全画面フラッシュは連続させない。
 */
import { N, W, H, T_CRATER, T_STARDUST, T_CLOUD, xOf, yOf } from '../core/board.js';
import { applyEvent, capAt, effTerrain } from '../core/rules.js';

export const COLORS = {
  bg1: '#070b1c', bg2: '#111a3a',
  cell: 'rgba(255,255,255,0.045)', cellEdge: 'rgba(255,255,255,0.10)',
  p1: '#f7d774', p1soft: 'rgba(247,215,116,0.30)',
  p2: '#7f8cff', p2soft: 'rgba(127,140,255,0.30)',
  text: '#e8ecff', dim: 'rgba(232,236,255,0.55)',
};
/**
 * ★「自分はいつも金色」に統一する★（2026-09-08）
 *   先手・後手は1戦ごとにランダムなので、席の番号で色を決めると
 *   **自分が後手の対戦だけ自分の色が青になり、どちらが自分か分からなくなる**。
 *   （上の数字は金色のままなので、盤と食い違って読めなくなっていた）
 */
const seatColor = (o, goldSeat) => (o === 0 ? COLORS.dim : (o === goldSeat ? COLORS.p1 : COLORS.p2));

/**
 * 連鎖のカットインを「出し直して」よい最短の間隔（ミリ秒）。
 * ★1秒に3回を超える明滅を作らないための歯止め★（仕様書§5-4）。
 *   600ms なら最大でも毎秒1.67回。test/test-render.mjs が実際に数えて検査している。
 */
export const POP_MIN_MS = 600;
/** ここから画面側に知らせる連鎖数。1＝はじけたら必ず知らせる（出し分けは app.js） */
export const POP_MIN_CHAIN = 1;
/** ここから「画面いっぱいの文字」を出す。これ未満は揺れだけ。★正本はここ★ */
export const POP_TEXT_CHAIN = 2;

/**
 * 画面のゆれ。★px と ms の正本はここ★（CSSの係数だけで表現しない）
 *
 * ★2026-09-09 実測で全面的に見直した★
 *   前の版は「1連鎖 3px / 3連鎖 6px を 0.42秒かけて往復3回弱」だった。
 *   本番で `getComputedStyle(#stage).transform` を測ったら **最大2.91px**。
 *   0.42秒かけて3px動くのは「ゆっくり傾いた」であって、揺れとして知覚できない。
 *   オーナーの「画面揺れが全然ない」は測定と完全に一致していた。
 *
 * ★下限があること自体が大事★
 *   これまで数値化されていたのは**上限だけ**（600ms・2.2秒・明滅3回/秒）だったので、
 *   「弱すぎて見えない」はどの検査にも引っかからなかった。min はそのための下限。
 *
 * ★cellRatio（マスの大きさに対する上限）★
 *   8×10 の盤では1マスが24〜30pxまで小さくなる。px固定だと**盤1マスぶん動く**ことになり、
 *   どのマスを押したのか分からなくなる。盤の縮尺に紐づけて、どの大きさでも同じ強さに見せる。
 */
export const SHAKE = {
  /* ★max(24px) に届くのは 9連鎖以上＝実際には起きない★（2026-09-09 実測）
       §0-8 の実測では 41〜50手でも3連鎖は7%。**遊んでいる人が生涯見る揺れは min〜13px の帯だけ**なので、
       「上限を上げるか」は的外れで、効くのは min と perChain しかない。
       上限を触る前に、必ずこの帯の実測から考えること。 */
  min: 9,            // 1連鎖の振幅(px)。★これ未満は知覚できない★（6pxでは「揺れていない」と2回言われた）
  perChain: 2.2,     // 連鎖が1増えるごとに足す(px)
  max: 24,           // 振幅の上限(px)。★§5-4（酔い）側の安全上限。上げないこと★
  cellRatio: 0.55,   // 1マスの何倍まで。小さい盤ではこちらが効く
  msSmall: 200,      // 1連鎖の長さ(ms)。短いほど疲れない
  msBig: 340,        // 2連鎖以上の長さ(ms)。★0.45秒を超えないこと★
  /* ★「ひかえめ」のときの倍率★ 0 にしない（＝消さない）。§5-4が求めているのは「弱める」。
       reduced-motion は別扱い（揺れは0にする。下の SOFT の説明を読むこと）。 */
  lightScale: 0.4,
};

/** その連鎖数のときに実際に動かす px（cell を知っている側で計算する） */
export function shakeAmp(chain, cell = 48) {
  const px = chain >= POP_TEXT_CHAIN ? SHAKE.min + SHAKE.perChain * chain : SHAKE.min;
  return Math.round(Math.min(px, SHAKE.max, cell * SHAKE.cellRatio));
}
/** その連鎖数のときに揺らす長さ(ms) */
export const shakeMs = (chain) => (chain >= POP_TEXT_CHAIN ? SHAKE.msBig : SHAKE.msSmall);

/**
 * 音符と星（連鎖のごほうび）。★数の正本はここ★
 *   オーナー指示（2026-09-09）「連鎖が増えるごとに音符や星マークがド派手に出てほしい」
 *
 * ★絵文字（フォント）で描かない★
 *   ♪(U+266A)や★(U+2605)は端末によってカラー絵文字フォントに落ち、
 *   大きさも形も端末ごとに変わる。**説明にも演出にもならない**ので、線で描く。
 *
 * ★上限は「個数」ではなく「面積」で決める★
 *   §5-4（光過敏性発作への配慮）が気にしているのは**光る面積**。
 *   個数だけ縛っても、1枚を大きくすれば同じことになる。
 *   test/test-render.mjs が「同時に光る面積 ≤ 盤の面積の18%」を機械で確かめる。
 *
 * ★上限に達したら「いちばん古いものを置き換える」★
 *   break で打ち切ると、323はじけの大連鎖で**前半だけ光って後半が無反応**になる。
 */
/**
 * ★光の粒（火花・尾）の上限★
 *   もとは burst() が 1200 で **break**、trail() には上限が無かった。
 *   trail は 1はじけ最大4方向×6粒＝24粒、1フレームで最大400はじけ消化するので
 *   **1フレーム9,600粒**まで積める。先に trail が枠を食い切ると、
 *   以降 burst が丸ごと出なくなる＝**大連鎖の後半だけ火花が消える**。
 *   ★break ではなく「いちばん古いものを捨てる」★
 *   （音符と星で同じ判断をした理由と同じ。打ち切ると後半が無反応になる）
 */
export const PARTICLE_MAX = 900;

/* ★粒の見た目の正本★ 描くところと 面積を数えるところで、式を2か所に書かない
     （分母を2か所に書いていて偽の合格になった、v1.6 の失敗と同じ形を作らない）。 */
export const PARTICLE_R = 0.040;      // マスの何倍の半径か
export const PARTICLE_ALPHA = 0.85;   // 一番濃いときの不透明度

/**
 * ★火花の飛び方★（2026-09-09 オーナー依頼「画面いっぱいに散らす『パーティクル大爆発』」）
 *
 * ★着手前の実測（本番 430x860・マス69px）★
 *   到達距離は **44〜46px ＝ 1マス(69px)の3分の2**。連鎖が1でも100でも同じだった。
 *   つまり「マスの中だけ」というオーナーの言葉は感想ではなく**物理の正確な記述**。
 *   描く板を画面いっぱいに広げても、粒がマスの外へ出ないなら広げた場所は永久に空のまま。
 *
 * ★到達距離の式★ v0 × (1 − decay^フレーム数) ÷ (1 − decay)
 *   寿命 = 1 ÷ fade フレーム。いまの値は下の DEV コメントの表を参照。
 *
 * ★大きさは小さくする（PARTICLE_R 0.055→0.040）★
 *   面積は半径の2乗で効くので、小さくすると同じ予算で数を増やせる。
 *   「画面いっぱいに散った」の正体は**小さい粒がたくさん**であって、大きい粒ではない。
 *
 * ★寿命は延ばさない★
 *   同時に光る面積 ≒ 出る数 × 寿命。寿命を延ばすと予算を食うだけで、
 *   体感の派手さは「新しい光が現れる勢い」がほとんどを決める。
 *   長生きする粒は「火花」ではなく「浮遊物」に見える。
 */
export const SPARK = {
  speed: 2.4,        // 基本の初速（マス48px 換算の px/フレーム）
  speedRand: 3.4,    // ばらつき
  perChain: 0.16,    // 連鎖1つあたり どれだけ速くなるか
  maxChain: 24,      // 速さが伸びきる連鎖数（ここで頭打ち）
  decay: 0.972,      // 1フレームあたりの減速（1に近いほど遠くまで伸びる）
  fade: 0.030,       // 1フレームあたり薄くなる量（1/0.030 ≒ 33フレーム ≒ 0.55秒）
  lightScale: 0.3,   // 「ひかえめ」のときの枚数の倍率。★0にしない（消さない）★
};

/** その連鎖数のときの初速の倍率。★頭打ちを必ず置く★ 300連鎖で画面外へ飛び去らないように */
/**
 * ★衝撃波の輪★
 *   合算(lightAreaRatio)を作って初めて分かったが、306連鎖で**画面の6.6%**を占めていた。
 *   輪は脇役（はじけた場所を「点」でなく「広がり」に見せるだけ）なので、ここを絞る。
 *   ★主役の音符と星を削らない★ オーナーが求めているのは「もっと派手に」であって、
 *   予算が足りないときに主役から削るのは、依頼と逆を向く。
 *   内訳の実測は tools/README と仕様書§5-4 に記録してある。
 */
export const RING = {
  maxAlive: 6,      // 同時に出す本数（40本だと306連鎖で予算の3分の1を食う）
  width: 0.055,     // マスの何倍の太さか
  alpha: 0.55,
};

/**
 * ★画面の枠の発光★（2026-09-09 オーナー依頼）
 *   > 全画面エフェクトとして、大連鎖中は画面の枠（レイヤー）を
 *   > 黄金やネオン色などに派手に光らせてほしい
 *
 * ★明滅にしない★
 *   画面いっぱいの面積が点滅すると §5-4（光過敏性発作）に直撃する。
 *   立ち上がりは1回、あとはゆっくり減衰。出し直しは minMs 以上あける。
 *   （カットインの POP_MIN_MS と同じ考え方。あちらは文字、こちらは枠）
 *
 * ★色はここでは決めない★ 実際の色は style/base.css の #rim。
 *   ただし **シアンとマゼンタは使わない**——マゼンタは飽和した赤に近く（§5-4）、
 *   シアンは相手の色 --p2:#7f8cff とぶつかって「どっちの陣地か」が読めなくなる。
 *   黄金（--p1 系）から白へ、という既存の段階に合わせる。
 *
 * ★太さとにじみを JS に置く理由★
 *   面積（rimArea）をここから計算するため。CSS 側に数字を書くと、
 *   **CSSだけ変えたときに面積の検査が反応しない**（2.91px 事件と同じ形）。
 *   通し検証が getComputedStyle の px と突き合わせて、ズレを捕まえる。
 */
/**
 * ★全画面フラッシュの決まり★（仕様書§5-4「1回0.6秒以内で、連続させない」）
 *   面積の予算（18%）とは**別の規則**。ここを数字で持ち、検査はこの値を見る
 *   （検査側に 0.6 や 600 を書き写すと、実装を変えても検査が反応しない）。
 */
export const FLASH = {
  peak: 0.55,       // 白飛びさせない上限
  lightPeak: 0.20,  // 「ひかえめ」のとき
  decay: 0.88,      // 1フレームあたり
  offAt: 0.02,      // これ以下は消えたとみなす
  maxMs: 600,       // 消えるまでに かけてよい時間
  minGapMs: 600,    // 次に出すまでの最短間隔（連続させない）
};

/**
 * ★盤のふちの発光★（style/base.css の `#stage.rim #board`）
 *   1連鎖から600msおきに光るので、画面の枠(#rim)よりずっと高頻度。
 *   ★数字が CSS にしか無いと、合算に入れられない★（2026-09-09 レビュー指摘）
 *   ここを正本にして、CSS は --brim-w / --brim-blur を読むだけにする。
 */
export const BOARD_RIM = {
  wPx: 3,             // ふちの線の太さ（★揺れを見えるようにしている線。細くしない★）
  ringAlpha: 0.95,    // その線の濃さ
  /* ★にじみは 30px → 14px に縮めた★（2026-09-09）
       合算に入れて初めて分かったが、30px のにじみだけで**画面の6%以上**を占めていた。
       盤のふちの役目は「揺れが見えるように基準線を1本置く」ことなので、
       役目を担っているのは線のほうで、にじみは飾り。予算はそちらに回す。 */
  blurPx: 14,
  blurWeight: 0.4,    // にじみは端ほど薄いので、面積はこの割合で数える
  blurAlpha: 0.45,    // にじみの濃さ（CSS の rgba と合わせる）
};

export const RIM = {
  minChain: 10,     // これ以上の連鎖で光る（毎手光ると ごほうびにならない）
  /* ★数字は「合算してから」決めた★（2026-09-09）
       最初に書いた 太さ10px＋にじみ26px は、周長×帯幅で **画面の29%** を占めていた。
       スマホの幅430pxに対して片側36pxの帯は、感覚では細く見えても実際は画面の4分の1。
       ここは目分量では絶対に決められない。合算(lightAreaRatio)の数字で決めること。 */
  peak: 0.45,
  lightScale: 0.35, // 「ひかえめ」のときの倍率。★0にしない（消さない）★
  fade: 0.016,      // 1フレームあたり（0.55/0.016 ≒ 34フレーム ≒ 0.57秒）
  minMs: 600,       // 立ち上げ直しの最短間隔
  wPx: 4,           // 枠の太さ
  blurPx: 10,       // にじみ
  blurWeight: 0.6,  // にじみは端ほど薄いので、面積は全幅ではなくこの割合で数える
};

export const sparkGain = (chain) =>
  1 + Math.min(SPARK.maxChain, Math.max(0, chain - 1)) * SPARK.perChain;

/* ★マスの数字（連鎖の予告）の濃さ★（2026-09-11 オーナー指示「数字が見辛い」）
     もとは 0.34〜0.84 で、**小さい連鎖ほど薄くて読めなかった**。
     連鎖が大きいほど濃い、という情報は残したいので、下限だけを上げる。 */
export const HINT_ALPHA = { min: 0.72, max: 1.0 };

export const GLYPH = {
  /* ★大きさと枚数は面積予算から逆算してある★
       同時30枚 ×(1.25×size)^2 ×平均の不透明度0.5 ≦ 盤の面積の18%
       → size ≦ cell×0.57。1.25 は **にじみ（glow）のぶん**。
       にじみを数えないと、測った面積より実際に光る面積のほうが広くなる。 */
  /* ★「小さく・多く」へ振る★（2026-09-09）
       面積は大きさの2乗で効くので、1枚を小さくすると同じ予算で枚数を増やせる。
       「画面いっぱいに散った」の正体は**小さいものがたくさん**であって、大きいものではない。
       ★主役を削らない★ 予算が足りないときに音符と星の枚数を減らすのは、依頼と逆を向く。 */
  maxAlive: 24,        // 同時に生きていられる数（★面積予算18%から逆算★。増やすなら再計測）
  /* ★1はじけの枚数を増やしても、同時に光る面積の最悪値は変わらない★
       面積を縛っているのは maxAlive×最大サイズであって、1はじけの枚数ではない。
       枚数を増やすと「低い連鎖でも早く上限まで濃くなる」だけ。
       低い連鎖（1〜3）しか実際には起きないので、効くのはここ。 */
  base: 4,             // 1はじけあたりの発生数＝base + perChain×連鎖数
  perChain: 1.6,
  /* ★天井は連鎖10で当たるようにする★ 14 だと連鎖4.5で頭打ちになり、
       「連鎖が増えるごとにド派手に」というお題が 1〜4 の範囲でしか効かなくなる。 */
  maxPerBoom: 24,
  /* ★1マスの0.30倍を下回らない★ ここは「小さすぎて見えない」を防ぐための下限で、
       通し検証が実測している。予算が足りないときに**ここを削ってはいけない**——
       枚数で調整する（小さくして見えなくなったら、何枚出しても意味が無い）。 */
  sizeBase: 0.30,      // 大きさ＝cell×(sizeBase + min(sizeGain, 連鎖×sizeStep))
  sizeStep: 0.03,
  sizeGain: 0.20,      // ★これで上限 cell×0.56★
  glow: 1.25,          // にじみを入れた実際の光る幅（面積の計算に使う）
  /* ★初速は「画面の高さぶん飛べるか」で決める★（2026-09-09 実測で判明）
       音符と星は #fx（画面いっぱい）に描くようになったので、盤の外まで飛べる。
       初速が足りないと、キャンバスだけ広げても盤の周りに固まったままになる。 */
  speed: 3.2,          // 初速（cell=48 のときの px/frame）。散らばりの広さ
  speedRand: 5.0,
  gravity: 0.10,       // 落ちる（放物線を描くと「爆発」でなく「祝祭」に見える）
  spin: 0.18,          // 回転の上限(rad/frame)。これ以上はバグに見える
  fade: 0.024,         // 1フレームで減る寿命（≒0.7秒）
  /* ★分母は「盤」ではなく「描いている画面」★（2026-09-09 修正）
       §5-4 が気にしているのは**画面のうちどれだけが光るか**。
       v1.6 までは盤の面積で割っていたが、音符と星は #fx（画面いっぱい）に描くので分母が違っていた。
       ★同時に光る絶対面積（px²）は v1.6 から増やしていない★——maxAlive も最大サイズも据え置き。
       変えたのは「同じ光を、より広い範囲に散らす」ことと、割り算の分母だけ。
       正しい割合は glyphAreaRatio() が返す。 */
  areaLimit: 0.18,     // 描画面（#fx）の面積に対する、同時に光ってよい割合
};

/** 演出の総時間の上限（ミリ秒）。20連鎖でも300連鎖でもここに収める */
export const MAX_ANIM_MS = 2200;
const BASE_STEP = 130;
const MIN_STEP = 3;   // これ以上短くしても目には追えないが、総時間の上限を守るために必要

/**
 * はじけ n 回ぶんの「1コマの長さ」。★n × stepFor(n) が MAX_ANIM_MS を超えないこと★
 * （test/test-render.mjs で機械検査している）
 */
export function stepFor(booms) {
  if (booms <= 1) return BASE_STEP;
  return Math.max(MIN_STEP, Math.min(BASE_STEP, MAX_ANIM_MS / booms));
}

/**
 * 光の粒の配置（1〜5個以上）。
 * ★あそびかた画面の図もこの表を読む★（盤と図で玉の位置がずれると説明にならない）
 */
export const DOTS = {
  1: [[0, 0]],
  2: [[-0.22, 0], [0.22, 0]],
  3: [[0, -0.24], [-0.23, 0.16], [0.23, 0.16]],
  4: [[-0.22, -0.22], [0.22, -0.22], [-0.22, 0.22], [0.22, 0.22]],
  5: [[-0.24, -0.24], [0.24, -0.24], [-0.24, 0.24], [0.24, 0.24], [0, 0]],
};

export class BoardView {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    /* ★音符と星だけは「画面いっぱいのキャンバス」に描く★（2026-09-09 追加）
         盤の canvas は 426×495＝画面の 60.6% しかなく、**盤の外に出た粒はその瞬間に消えていた**。
         「画面いっぱいにド派手に」は、この作りのままでは物理的に出せない（実測で判明）。
         カットイン文字を 2026-09-08 に DOM へ移したのと同じ判断を、粒にも適用する。
         ★渡されなければ盤の canvas に描く（今までどおり）★——
           テストと、万一 #fx が無い版の index.html でも壊れないため。 */
    this.fxCanvas = opts.fxCanvas || null;
    this.fxCtx = this.fxCanvas ? this.fxCanvas.getContext('2d') : null;
    this.fxW = 0; this.fxH = 0;      // 描画面の大きさ(CSS px)
    this.fxOff = { x: 0, y: 0 };     // 描画面の中での「盤の左上」
    this.cell = 48;
    this.pad = 6;
    this.disp = null;          // 表示用の盤（本物とは別）
    this.queue = [];           // 再生待ちのイベント
    this.stepMs = BASE_STEP;
    this.nextAt = 0;
    this.particles = [];
    this.glyphs = [];          // 音符・星（連鎖のごほうび。数の正本は GLYPH）
    this.flash = 0;
    this.flashAt = -9999;      // 直前の全画面フラッシュの時刻（連続させないため）
    this.chainPop = null;      // 連鎖数のカットイン（★描くのは画面側★ ここは重複発火を防ぐ記録）
    // ★カットインは盤のキャンバスではなく、画面いっぱいのDOMに出す★（2026-09-08 オーナー指示）
    //   > 画面全面に『〇連鎖！』みたいな大きな文字をドーン！と表示する感じでどうでしょう
    //   キャンバスは盤の大きさしか無いので「画面全面」にはできない。
    //   ここは「何連鎖が起きたか」を知らせるだけで、見せ方は app.js が持つ。
    this.onChainPop = null;
    /* ★歯止めは「文字」と「揺れ」で別々に持つ★（2026-09-09）
       ひとつにすると、1連鎖の揺れが600msの枠を使い切り、
       **その直後に伸びた連鎖のカットインが出なくなる**（通し検証で実際に落ちた）。
       光過敏の基準が縛っているのは「広い面積の明滅」＝文字のほうなので、分けてよい。 */
    this.popAt = -99999;       // 直前に「文字」を出し直した時刻（明滅の歯止め）
    this.shakeAt = -99999;     // 直前に「揺れ」を出し直した時刻
    this.pulse = 0;
    this.playing = false;
    this.onDone = null;
    this.legal = null;         // ハイライトするマス
    this.preview = null;       // 連鎖の予告（指を置いている間だけ光らせるマス）
    this.hints = null;         // 盤ぜんぶの「押したら何連鎖するか」（自分の手番のあいだ出しっぱなし）
    // ★名前を goldSeat にしてある（もとは mySeat）★
    //   「自分の席」と読めると、二人対戦（どちらも自分）で必ず読み違える。
    //   ここが持っているのは **どちらの席を金色で描くか** だけ。操作権とは無関係。
    this.goldSeat = 1;
    this.rings = [];           // はじけた場所から広がる輪（演出）
    this.lastMove = -1;
    this.fx = opts.fx || 'normal';         // 'normal' | 'light'（演出ひかえめ）
    /* ★動きを止めるかどうかの正本は、この2行だけ★
         matchMedia を読むのは resolveMotion() 1か所（app.js も同じ関数を使う）。
         2か所で読むと、片方だけ古くなって「設定画面の表示と実際の動きが食い違う」ことになる。 */
    this.rim = 0;              // 画面の枠の明るさ 0〜1
    this.boardRim = false;     // 盤のふちが光っているか（点灯は app.js、面積はここで数える）
    this.rimAt = -99999;       // 最後に立ち上げた時刻（明滅にしないための歯止め）
    this.onRim = null;         // 画面側へ知らせる（見せ方は app.js の仕事）
    this.motion = opts.motion === 'still' ? 'still' : 'full';
    this.reduced = resolveMotion(this.motion);
    this.frameTimes = [];
    this.budget = 1;           // 1=全部出す。重いと自動で下がる
    this._raf = null;
  }

  setEffects(level) { this.fx = level; }

  /**
   * 動きの扱いを変える（'auto' | 'full' | 'still'）。
   * ★対戦中に呼ばれても壊れないこと★ せってい画面はいつでも開けるので、
   *   ここで盤の状態は一切触らない（this.reduced を差し替えるだけ）。
   */
  setMotion(mode) {
    this.motion = mode === 'still' ? 'still' : 'full';
    this.reduced = resolveMotion(this.motion);
  }

  /* ★配慮設定は2種類あり、意味が違う★（2026-09-09 分離）
       v1.6 までは `fx==='light' || reduced` と1つに潰していたため、
       **どちらでも 揺れも粒も音符も全部ゼロ**になっていた。
       仕様§5-4 が求めているのは「弱める」であって「消す」ではない。

       motionOff … 端末の prefers-reduced-motion。前庭障害（乗り物酔い）への配慮。
                   ★動かすこと自体が問題★なので **揺れは止める**。
                   ただし音符と星は「その場に出してフェード」で見せる（動かなければ問題ない）。
                   ゆっくり動かす、は逆効果なので絶対にやらない。
       weakened  … アプリの「えんしゅつを ひかえめに」。まぶしい・うるさいを弱める設定。
                   ★止めるのではなく薄くする★ 揺れも粒も倍率をかけて出す。
       両方入っていることもある（そのときは「動かさず、かつ少なく」）。 */
  get motionOff() { return !!this.reduced; }
  get weakened() { return this.fx === 'light'; }
  /** 演出の量にかける倍率（0にはしない＝消さない） */
  get fxScale() { return this.weakened ? SHAKE.lightScale : 1; }

  /**
   * 盤ぜんぶの連鎖予告を出す（自分の手番のあいだ、ずっと見えている）。
   * ★2026-09-08★ 「指を置いたマスだけ」では、はじける手が全体の21%しかなく
   *   4回に3回は何も光らないため「予告が機能していない」と言われた。数える計算は rules.js の chainMap。
   */
  setHints(map) { this.hints = map || null; this.draw(); }

  /**
   * どちらの席を金色で描くかを教える。★対戦を始めるたびに必ず呼ぶ★
   *   CPU戦 … 自分の席を渡す（自分はいつも金色になる）
   *   二人対戦 … 1 を渡す（先手＝金・後手＝青で固定。どちらも「自分」なので入れ替えない）
   */
  setSeat(seat) { this.goldSeat = seat === 2 ? 2 : 1; this.draw(); }

  /** 持ち主の色（金の席＝金・もう一方＝藍） */
  colorOf(owner) { return seatColor(owner, this.goldSeat); }

  /**
   * ★演出を途中で捨てる★（2026-09-08 アドバイザー指摘で新設）
   *   tick() は match の世代番号を見ないので、キューは最後まで消化され続ける。
   *   これまでは中断が「画面遷移＝盤が見えなくなる」経由しかなかったので実害が出なかったが、
   *   **対戦中の設定から「さいしょから」を押すと、盤に留まったまま新しい対戦が始まる**。
   *   そのとき古いキューの applyEvent が新しい盤を書き換え、玉数と持ち主が壊れる
   *   （例外は出ないので「たまに盤がおかしい」としか見えない＝最悪の壊れ方）。
   */
  cancelAnimation() {
    this.queue = [];
    this.index = 0;
    this.startAt = -1;
    this.playing = false;
    this.onDone = null;
    this.particles.length = 0;
    this.rings.length = 0;
    this.glyphs.length = 0;
    this.flash = 0;
    // ★枠も必ず消す★ 消さないと、画面を移っても光ったまま居座る
    if (this.rim !== 0) { this.rim = 0; if (this.onRim) this.onRim(0); }
    this.rimAt = -99999;
    this.boardRim = false;
    this.chainPop = null;
    this.preview = null;
    this.stop();
  }

  /**
   * 連鎖の予告を出す（指を置いている間）。★2026-09-08 追加★
   *   「何が起こっているか分からないから、後半は連打ゲーになっちゃう」（オーナー）
   *   への対策。押す前に、はじけるマスを光らせる。
   *   ★ここでは連鎖を計算しない★ 計算は rules.js の previewChain が持つ。
   */
  setPreview(cells) {
    const next = (cells && cells.length) ? [...new Set(cells)] : null;
    const same = (!next && !this.preview)
      || (next && this.preview && next.length === this.preview.length
          && next.every((v, k) => v === this.preview[k]));
    if (same) return;
    this.preview = next;
    if (next) this.start(); else this.draw();
  }

  resize() {
    const box = this.canvas.parentElement;
    const availW = Math.max(240, box.clientWidth);
    const availH = Math.max(240, box.clientHeight || 0);
    let cell = Math.floor((availW - this.pad * 2) / W);
    if (availH > 80) cell = Math.min(cell, Math.floor((availH - this.pad * 2) / H));
    /* ★下限を高くしすぎると、たての大きい盤で canvas が親からはみ出す★（2026-09-09）
       cell は「幅と高さの両方に収まる大きさ」として計算済みなので、
       下限が効くのは「そもそも収まらない」ときだけ。そこで無理に大きくすると、
       盤の下がちぎれて押せなくなる。★CSSで縮めるのは禁止★——
       hit() は this.cell から座標を逆算するので、見た目だけ縮むと押す場所がずれる。 */
    this.cell = Math.max(24, Math.min(72, cell));
    const w = this.cell * W + this.pad * 2;
    const h = this.cell * H + this.pad * 2;
    const dpr = Math.min(3, globalThis.devicePixelRatio || 1);
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.resizeFx(dpr, w, h);
    this.draw();
  }

  /**
   * 画面いっぱいのキャンバス(#fx)を、盤と同じ倍率で用意する。
   * ★盤の左上が #fx のどこに来るかを必ず測り直す★
   *   #boardBox は中央寄せなので、盤の大きさが変わるとオフセットも変わる。
   *   ここを更新し忘れると、音符と星が盤とずれた場所から飛び出す（見た目だけの不具合なので気づきにくい）。
   */
  resizeFx(dpr, boardW, boardH) {
    if (!this.fxCanvas || !this.fxCtx) {
      // #fx が無いときは「盤の中だけ」が描画面。分母もそれに合わせる（今までどおりの動き）
      this.fxW = boardW; this.fxH = boardH;
      this.fxOff = { x: 0, y: 0 };
      return;
    }
    const box = this.fxCanvas.parentElement;
    const w = Math.max(1, box.clientWidth);
    const h = Math.max(1, box.clientHeight);
    this.fxCanvas.width = Math.round(w * dpr);
    this.fxCanvas.height = Math.round(h * dpr);
    this.fxCanvas.style.width = w + 'px';
    this.fxCanvas.style.height = h + 'px';
    this.fxCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.fxW = w; this.fxH = h;
    const br = this.canvas.getBoundingClientRect();
    const fr = this.fxCanvas.getBoundingClientRect();
    this.fxOff = { x: br.left - fr.left, y: br.top - fr.top };
  }

  /** タップされた座標をマス番号に変換（外れたら -1） */
  hit(clientX, clientY) {
    const r = this.canvas.getBoundingClientRect();
    const x = Math.floor((clientX - r.left - this.pad) / this.cell);
    const y = Math.floor((clientY - r.top - this.pad) / this.cell);
    if (x < 0 || x >= W || y < 0 || y >= H) return -1;
    return y * W + x;
  }

  /** 本物の盤を表示用にコピーして持つ（演出の起点） */
  sync(state) {
    this.disp = {
      owner: Int8Array.from(state.owner),
      count: Int8Array.from(state.count),
      terrain: Int8Array.from(state.terrain),
      cloud: Int8Array.from(state.cloud),
      geo: state.geo,
      wrapX: state.wrapX,
    };
    this.draw();
  }

  /**
   * 1手ぶんのイベントを演出付きで再生する。
   * ★はじけの数がいくつでも、総時間は MAX_ANIM_MS を超えない★
   */
  animate(events, onDone) {
    const booms = events.filter((e) => e.t === 'boom').length;
    this.chainPop = null;              // ★1手ごとに数え直す★（前の手の記録が残ると出なくなる）
    this.stepMs = stepFor(booms);      // 加速: はじけが多いほど1コマを短くする
    this.queue = events.slice();
    this.index = 0;
    this.startAt = -1;                 // 最初のtickで決める
    this.onDone = onDone;
    this.playing = true;
    this.start();
  }

  start() {
    if (this._raf) return;
    const loop = (t) => {
      this._raf = requestAnimationFrame(loop);
      this.tick(t);
    };
    this._raf = requestAnimationFrame(loop);
  }

  stop() { if (this._raf) cancelAnimationFrame(this._raf); this._raf = null; }

  tick(t) {
    // ── 描画が重いときは演出を段階的に落とす（連鎖が止まるほうが致命的）
    this.frameTimes.push(t);
    if (this.frameTimes.length > 30) this.frameTimes.shift();
    if (this.frameTimes.length === 30) {
      const avg = (this.frameTimes[29] - this.frameTimes[0]) / 29;
      if (avg > 20 && this.budget > 0.25) this.budget -= 0.05;
      else if (avg < 15 && this.budget < 1) this.budget += 0.02;
    }

    if (this.playing) {
      if (this.startAt < 0) this.startAt = t;
      // ★1フレームに1つずつしか進めないと、300連鎖で10秒近く操作できなくなる★
      //   経過時間から「いま何個目まで進んでいるべきか」を出して、遅れている分をまとめて消化する
      const want = Math.min(this.queue.length, Math.floor((t - this.startAt) / this.stepMs) + 1);
      let guard = 0;
      while (this.index < want && guard++ < 400) this.consume(this.queue[this.index++], t);
      if (this.index >= this.queue.length) {
        this.playing = false;
        const cb = this.onDone; this.onDone = null;
        if (cb) cb();
      }
    }

    this.pulse = (Math.sin(t / 420) + 1) / 2;
    this.flash *= FLASH.decay;
    this.updateParticles();
    this.updateRings();
    this.updateGlyphs();
    this.stepRim();
    if (this.chainPop && t - this.chainPop.t > 700) this.chainPop = null;
    this.draw(t);

    // 何も動いていなければループを止める（電池を無駄にしない）
    //   ★予告を出している間は止めない★（脈動が固まって「壊れている」ように見える）
    if (!this.playing && !this.preview && this.particles.length === 0
        && this.rings.length === 0 && this.glyphs.length === 0
        && this.flash < 0.02 && this.rim <= 0 && !this.chainPop) {
      this.stop();
      this.draw(t);
    }
  }

  consume(ev, t) {
    if (!this.disp) return;
    applyEvent(this.disp, ev);           // ★ルールは書き直さず、記録を再生するだけ
    if (ev.t === 'place') {
      this.burst(ev.i, this.colorOf(ev.player), 6);
    } else if (ev.t === 'boom') {
      const col = this.colorOf(ev.player);
      // ★連鎖が伸びるほど粒を増やす★（オーナー指示「もっと派手な演出を出したいね」）
      //   ただし this.budget（重いときに下がる）を必ず掛ける。派手さでコマ落ちさせない
      this.burst(ev.i, col, 14 + Math.min(16, ev.chain * 2), ev.chain);
      this.ring(ev.i, col, ev.chain);
      this.spawnGlyphs(ev.i, col, ev.chain);   // ★音符と星（連鎖が伸びるほど増える）★
      // 大連鎖では白い火花も混ぜて「色が変わった」ように見せる
      if (ev.chain >= 5) this.burst(ev.i, '#fff6d8', 8, ev.chain);
      for (const j of ev.to) if (j >= 0) this.trail(ev.i, j, col);
      /* ★知らせるのは「1回でも はじけた」ところから★（2026-09-09 オーナー指摘で変更）
           もとは3連鎖以上でだけ出していた。しかし実測すると、
             ・最初の10手で3連鎖が起きるのは **0%**
             ・21〜30手でも 1〜2%、41〜50手でようやく 7%
           で、**1局の大半で演出が一度も出ない**（オーナー「〇連鎖とか揺れは全然ないよ」）。
           1連鎖以上なら 11〜20手で17%、31〜40手で29〜39%あるので、ここを入口にする。
           出し分けは画面側（app.js）の仕事: 1連鎖＝小さく揺らすだけ、2連鎖以上＝カットイン。 */
      /* ★soft = 「画面を揺らさない」だけの意味★（2026-09-09 に意味を狭めた）
           揺らさないのは prefers-reduced-motion のときだけ。
           「ひかえめ」は**弱めて揺らす**（app.js が SHAKE.lightScale を掛ける）。 */
      // ★大連鎖では画面の枠も光らせる★（明滅にしない歯止めは lightRim が持つ）
      if (ev.chain >= RIM.minChain) this.lightRim(t);
      const soft = this.motionOff;
      // ★同じ手のあいだは「より大きくなったとき」だけ知らせる★
      //   1手のあいだに3→4→5…と伸びるので、毎回出すと点滅になる（光過敏の配慮）
      if (ev.chain >= POP_MIN_CHAIN && (!this.chainPop || ev.chain > this.chainPop.n)) {
        this.chainPop = { n: ev.chain, t };
        if (this.onChainPop) {
          /* ★「出し直す」のは POP_MIN_MS おきまで★（仕様書§5-4 光過敏性発作への配慮）
             20はじけなら1コマ110ms、300はじけなら7ms。連鎖段が上がるたびに出し直すと
             **1秒に5〜9回**の明滅になる。数だけ差し替えて、透明度は上げ直さない。 */
          const big = ev.chain >= POP_TEXT_CHAIN;
          const restart = t - (big ? this.popAt : this.shakeAt) >= POP_MIN_MS;
          if (restart) { if (big) this.popAt = t; else this.shakeAt = t; }
          /* ★第3引数 soft★ 「ひかえめ」と reduced-motion でも **文字だけは出す**。
             仕様書§5-4が求めているのは「弱める」であって「消す」ではない。
             全部消すと、その設定の人は何が起きたか一生分からない（2026-09-09 の設計ミス）。 */
          this.onChainPop(ev.chain, restart, soft);
        }
      }
    }
  }

  /** 全画面のひかり。★連続させない★（0.6秒以内・1秒に3回を超えない） */
  bigFlash(t = performance.now()) {
    /* ★「ひかえめ」では弱めて出す（消さない）★（§5-4 追記(2)）
         全画面の光は「勝負がついた」の合図なので、消すとその設定の人に決着が伝わらない。
       ★動きを止める設定では出さない★ 画面全体の急な変化は前庭にも響く。 */
    if (this.motionOff) return;
    if (t - this.flashAt < FLASH.minGapMs) return;   // 直前のフラッシュから0.6秒は出さない
    this.flashAt = t;
    this.flash = this.weakened ? FLASH.lightPeak : FLASH.peak;   // 白飛びさせない
    this.start();
  }

  /**
   * はじけた場所から広がる輪（衝撃波）。★はじけた瞬間が「点」ではなく「広がり」に見える★
   *   全画面フラッシュと違って**局所**なので、光過敏の観点でも安全側
   *   （広い面積の明滅は1秒3回以下という制約は bigFlash 側で守っている）。
   */
  ring(i, color, chain = 1) {
    // ★「ひかえめ」では消さずに弱める★（§5-4 追記(2)）。広がる動きなので、止める設定では出さない
    if (this.motionOff) return;
    if (this.rings.length >= RING.maxAlive) this.rings.shift();   // 打ち切らず、古いものを捨てる
    this.rings.push({
      x: this.fxOff.x + this.pad + (xOf(i) + 0.5) * this.cell,
      y: this.fxOff.y + this.pad + (yOf(i) + 0.5) * this.cell,
      r: this.cell * 0.22,
      max: this.cell * (1.0 + Math.min(1.4, chain * 0.12)),
      life: this.weakened ? 0.4 : 1,     // ★弱める（消さない）★
      color,
    });
  }

  updateRings() {
    for (let k = this.rings.length - 1; k >= 0; k--) {
      const r = this.rings[k];
      r.r += (r.max - r.r) * 0.22;
      r.life -= 0.075;
      if (r.life <= 0) this.rings.splice(k, 1);
    }
  }

  burst(i, color, n, chain = 1) {
    /* ★光の粒は「速く飛ぶ」ことが本体★なので、prefers-reduced-motion では出さない。
         消しても情報は失われない——同じ場所に、動かない音符と星が出るため。
         （何も無いと伝わらない、という §5-4 の要求は spawnGlyphs 側で満たしている） */
    if (this.motionOff) return;
    /* ★倍率の正本は SPARK.lightScale★（2026-09-09 レビュー指摘）
         もとは burst が 0.3 の直書き、trail が fxScale（＝揺れ用の SHAKE.lightScale 0.4）で、
         同じ「光の粒」に2つの数字があった。
       ★最低1粒★ 0枚になると「はじけたこと」自体が伝わらない（音符と星と同じ考え方）。 */
    const count = Math.max(1, Math.round(n * this.budget
                                         * (this.weakened ? SPARK.lightScale : 1)));
    // ★描画面(#fx)のなかの座標にする★（2026-09-09 移設。音符と星と同じ基準にそろえる）
    const cx = this.fxOff.x + this.pad + (xOf(i) + 0.5) * this.cell;
    const cy = this.fxOff.y + this.pad + (yOf(i) + 0.5) * this.cell;
    /* ★連鎖が伸びるほど 遠くまで飛ばす★
         v1.10 までは連鎖数を見ていなかったので、1連鎖も100連鎖も同じ 45px しか飛ばなかった。
       ★速さで派手さを稼ぐ★ 速度を上げても「同時に光る面積」は1ピクセルも増えない。
         面積の予算（§5-4 の18%）を使わずに「画面いっぱい」にできる、いちばん安い手。 */
    const gain = sparkGain(chain);
    for (let k = 0; k < count; k++) {
      const a = Math.random() * Math.PI * 2;
      const sp = (SPARK.speed + Math.random() * SPARK.speedRand) * gain * (this.cell / 48);
      this.addParticle({
        x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1, color,
      });
    }
  }

  /**
   * 粒を1つ足す。★上限に達したら いちばん古いものを捨てる★
   *   break にすると、上限のあとに来た はじけが**まるごと無反応**になる。
   *   （音符と星で同じ結論に達している。大連鎖の後半こそ見せ場なので、そこを消さない）
   */
  addParticle(p) {
    if (this.particles.length >= PARTICLE_MAX) this.particles.shift();
    this.particles.push(p);
    return p;
  }

  /**
   * 音符と星を撒く。連鎖が伸びるほど 数・大きさ・回転が増える。
   * ★色は所有者の色のまま★ 虹色にしない——盤の上で自分の色を読む手がかりが壊れるうえ、
   *   飽和した赤は§5-4（赤の強い明滅を使わない）に直撃する。
   *   派手さは「段階で色が上がる」（5連鎖でクリーム・8連鎖で白）で出す。
   */
  spawnGlyphs(i, color, chain) {
    /* ★どの設定でも 1枚は必ず出す★（2026-09-09）
         v1.6 は「ひかえめ」と reduced-motion で **0枚** にしていた。
         それでは その設定の子には「はじけたこと」自体が伝わらない（§5-4は「弱める」）。 */
    const n = Math.min(GLYPH.maxPerBoom,
                       Math.max(1, Math.round((GLYPH.base + GLYPH.perChain * chain)
                                              * this.budget * this.fxScale)));
    // ★描画面(#fx)のなかの座標にする★ 盤の canvas 基準のままだと、盤の左上ぶんずれる
    const cx = this.fxOff.x + this.pad + (xOf(i) + 0.5) * this.cell;
    const cy = this.fxOff.y + this.pad + (yOf(i) + 0.5) * this.cell;
    const size = this.cell * (GLYPH.sizeBase + Math.min(GLYPH.sizeGain, chain * GLYPH.sizeStep));
    const hot = chain >= 8 ? '#ffffff' : (chain >= 5 ? '#fff6d8' : color);
    for (let k = 0; k < n; k++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2;      // 上向きに散らす
      /* ★prefers-reduced-motion では初速ゼロ＝その場でふわっと出て消える★
           「ゆっくり動かす」にしないこと。ゆっくりの移動は前庭系にはむしろ悪い。
           位置と色と枚数だけで「どこで何連鎖したか」は伝わる。 */
      const sp = this.motionOff ? 0
        : (GLYPH.speed + Math.random() * GLYPH.speedRand) * (this.cell / 48);
      const g = {
        x: cx, y: cy,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        rot: Math.random() * Math.PI * 2,
        spin: this.motionOff ? 0
          : (Math.random() - 0.5) * Math.min(GLYPH.spin, 0.06 + chain * 0.010) * 2,
        size, life: 1, age: 0,
        star: Math.random() < 0.5,
        color: Math.random() < 0.35 ? hot : color,
      };
      // ★古いものを置き換える★（break すると大連鎖の後半が無反応になる）
      if (this.glyphs.length >= GLYPH.maxAlive) this.glyphs.shift();
      this.glyphs.push(g);
    }
  }

  updateGlyphs() {
    const gs = this.glyphs;
    // ★動きを止める設定では重力もかけない★（落下も「動き」）。寿命だけが進む
    const grav = this.motionOff ? 0 : GLYPH.gravity * (this.cell / 48);
    for (let k = gs.length - 1; k >= 0; k--) {
      const g = gs[k];
      g.x += g.vx; g.y += g.vy;
      g.vy += grav;
      g.vx *= 0.985; g.vy *= 0.985;
      g.rot += g.spin;
      g.age++;
      g.life -= GLYPH.fade;
      if (g.life <= 0) gs.splice(k, 1);
    }
  }

  /** いま光っている音符・星の面積（★§5-4の面積予算を測るのはここ★） */
  /**
   * いま光っている音符・星が、**描画面のうち何割を占めるか**（0〜1）。
   * ★§5-4の面積予算はこの値で見る★ テスト側で割り算をしない——
   *   分母（盤か画面か）を2か所に書くと、v1.6 でやったように片方だけ古くなる。
   */
  /**
   * ★同時に光っている面積の割合★（仕様書§5-4 の上限 18% を判定する正本）
   *
   * ★音符と星だけを数えてはいけない★（2026-09-09）
   *   v1.6 の検査は音符と星しか数えず、実際は上限を超えていたのに合格していた。
   *   火花・尾・全画面のひかりも「同時に光っている面積」なので、ここで合算する。
   * ★決着の全画面フラッシュ（bigFlash）はここに入れない★（2026-09-09 いったん入れて外した）
   *   仕様書§5-4 は2つの別々の規則を持っている。
   *     (a) 繰り返し出る演出の「同時に光る面積 ≦ 18%」——連鎖のたびに何度も出るもの
   *     (b) 全画面フラッシュは「1回0.6秒以内で、連続させない」——1局に1回の合図
   *   bigFlash は定義上ほぼ全画面（実測ピーク 48.4%）なので、(a) に混ぜると
   *   **どう作っても上限を超える＝18%という数字が意味を失う**。
   *   混ぜたまま数字だけ緩めるのは、規則を骨抜きにするのと同じ。
   *   → (b) は FLASH 定数を正本にして、test-render.mjs の
   *     「全画面フラッシュの決まり」が別に検査する（消えるまでの時間・出し直しの間隔・上限）。
   *     ここは (a) だけを見る。
   *
   * ★光るものを足したら、次の6か所を必ず全部直す★（1つ抜けると静かに壊れる）
   *   1. この合算（lightAreaRatio）に足す —— 抜けると上限が嘘になる
   *   2. tick() の「1コマ進める」に足す —— 抜けると消えずに積み上がる
   *   3. tick() の「止める条件」に足す —— 抜けると光ったまま画面が止まる
   *   4. cancelAnimation() に足す —— 抜けると画面を移っても残る
   *   5. **描く場所を #fx だけにする** —— 盤の canvas にも描くと
   *      座標が #fx 基準なので**盤の左上ぶんずれた位置に二重**に出る。
   *      しかも合算は1回ぶんしか数えないので、**検査は通るのに実際は2倍光る**
   *      （2026-09-09 の出荷前レビューで実際に見つかった）
   *   6. test-render.mjs の runBooms の「1コマ進める」に足す
   *      —— 抜けると **寿命が減らない状態を測って、実際より多いと誤判定する**
   *   （2026-09-09 に 5 を2回、続けて踏んだ。足す順ではなく、この一覧で確認すること）
   *   分母は描画面（#fx）＝実際に光が乗る面。盤ではない。
   */
  lightAreaRatio() {
    const area = this.fxW * this.fxH;
    if (!(area > 0)) return 0;
    return (this.glyphArea() + this.particleArea() + this.ringArea()
            + this.rimArea() + this.boardRimArea()) / area;
  }

  /** ★もとの名前も残す★ 音符と星だけを見たいとき（内訳の確認）に使う */
  glyphAreaRatio() {
    const area = this.fxW * this.fxH;
    return area > 0 ? this.glyphArea() / area : 0;
  }

  /** 火花と尾。draw() が描く円と同じ式で数える（2か所に式を書かない） */
  particleArea() {
    let a = 0;
    for (const p of this.particles) {
      const r = Math.max(1, this.cell * PARTICLE_R * p.life);
      /* ★画面の外へ出た粒は数えない★
           連鎖が伸びると火花は画面の外まで飛び抜ける（30連鎖で847px）。
           見えていないものを数えると、実際より多く光っていることになり、
           **本当は余裕があるのに上限に当たる**＝派手にできる余地を自分で削ってしまう。 */
      if (p.x < -r || p.y < -r || p.x > this.fxW + r || p.y > this.fxH + r) continue;
      a += Math.PI * r * r * Math.max(0, p.life) * PARTICLE_ALPHA;
    }
    return a;
  }

  /** 輪（線なので、周長×太さで数える） */
  ringArea() {
    let a = 0;
    for (const r of this.rings) {
      a += 2 * Math.PI * r.r * Math.max(1, this.cell * RING.width)
           * Math.max(0, r.life) * RING.alpha;
    }
    return a;
  }

  /**
   * 画面の枠。★にじみの幅まで数える★
   *   見えている光は枠の線より広い（音符と星で glow を数えているのと同じ理由）。
   *   角の重なりは引かない＝少し多めに数える（安全側）。
   */
  rimArea() {
    if (!(this.rim > 0)) return 0;
    const band = RIM.wPx + RIM.blurPx * RIM.blurWeight;
    return 2 * (this.fxW + this.fxH) * band * this.rim;
  }

  /**
   * 盤のふちの発光。★周長×帯幅で数える★
   *   点いているあいだだけ数えたいので、画面側（app.js）が boardRim を上げ下げする。
   */
  boardRimArea() {
    if (!this.boardRim) return 0;
    const band = BOARD_RIM.wPx * BOARD_RIM.ringAlpha
               + BOARD_RIM.blurPx * BOARD_RIM.blurWeight * BOARD_RIM.blurAlpha;
    const w = this.cell * W + this.pad * 2;
    const h = this.cell * H + this.pad * 2;
    return 2 * (w + h) * band;
  }

  /**
   * 全画面のひかりの面積。★18%の予算には入れない★（上の説明を読むこと）
   * ★アプリ本体からは呼ばない★ 内訳を調べるときだけ使う窓口。
   */
  flashArea(area) {
    return area * Math.max(0, this.flash);
  }

  glyphArea() {
    let a = 0;
    // ★にじみのぶんまで数える★ 見えている光は文字の枠より広い
    for (const g of this.glyphs) {
      const w = g.size * GLYPH.glow;
      a += w * w * this.glyphAlpha(g);
    }
    return a;
  }
  /** 出はじめの3フレームだけ薄い（いきなり最大輝度で現れない） */
  glyphAlpha(g) {
    return Math.max(0, Math.min(1, g.life)) * Math.min(1, (g.age + 1) / 4) * 0.9;
  }

  /** 星（5芒星）と音符を線で描く。★フォントに頼らない★ */
  drawGlyph(g, target = null) {
    const ctx = target || this.fxCtx || this.ctx;
    if (!ctx) return;
    ctx.save();
    ctx.globalAlpha = this.glyphAlpha(g);
    ctx.translate(g.x, g.y);
    ctx.rotate(g.rot);
    ctx.fillStyle = g.color;
    // ★にじませる★ これが無いと、盤の模様に紛れて「出ていない」ように見える
    ctx.shadowColor = g.color;
    ctx.shadowBlur = g.size * 0.5;
    const r = g.size / 2;
    ctx.beginPath();
    if (g.star) {
      for (let k = 0; k < 10; k++) {
        const rr = k % 2 === 0 ? r : r * 0.42;
        const th = -Math.PI / 2 + k * Math.PI / 5;
        const px = Math.cos(th) * rr, py = Math.sin(th) * rr;
        if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
    } else {
      // 音符: 玉（楕円）＋棒＋旗
      ctx.ellipse(-r * 0.28, r * 0.55, r * 0.42, r * 0.32, -0.35, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.rect(r * 0.06, -r * 0.95, r * 0.16, r * 1.6);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(r * 0.22, -r * 0.95);
      ctx.quadraticCurveTo(r * 0.95, -r * 0.6, r * 0.32, -r * 0.05);
      ctx.quadraticCurveTo(r * 0.62, -r * 0.55, r * 0.22, -r * 0.5);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  /**
   * はじけた先へ伸びる尾。
   * ★「ひかえめ」では消さずに弱める★（§5-4 追記(2)。消すのは前庭障害の設定のときだけ）
   * ★上限は addParticle が持つ★ ここに歯止めが無く、1フレーム9,600粒まで積めていた。
   */
  trail(from, to, color) {
    if (this.motionOff) return;                       // 動きそのものなので、止める設定では出さない
    const fx = this.fxOff.x + this.pad + (xOf(from) + 0.5) * this.cell;
    const fy = this.fxOff.y + this.pad + (yOf(from) + 0.5) * this.cell;
    const tx = this.fxOff.x + this.pad + (xOf(to) + 0.5) * this.cell;
    const ty = this.fxOff.y + this.pad + (yOf(to) + 0.5) * this.cell;
    const n = Math.max(1, Math.round(6 * this.budget
                                     * (this.weakened ? SPARK.lightScale : 1)));
    for (let k = 0; k < n; k++) {
      const p = k / Math.max(1, n);
      this.addParticle({
        x: fx + (tx - fx) * p, y: fy + (ty - fy) * p,
        vx: (tx - fx) / 26, vy: (ty - fy) / 26, life: 0.8, color,
      });
    }
  }

  /**
   * 画面の枠を光らせる。★立ち上げ直しは minMs 以上あける★
   *   大連鎖は1手のなかで何度も伸びるので、毎回立ち上げ直すと明滅になる。
   */
  lightRim(t = performance.now()) {
    if (t - this.rimAt < RIM.minMs) return false;
    this.rimAt = t;
    // ★「ひかえめ」でも消さずに弱める★（§5-4）。動きではないので、止める設定でも出す
    this.rim = RIM.peak * (this.weakened ? RIM.lightScale : 1);
    this.start();
    if (this.onRim) this.onRim(this.rim);
    return true;
  }

  /** 枠をゆっくり暗くする。★必ず0まで落とす★ 落とし切らないと光ったままになる */
  stepRim() {
    if (this.rim <= 0) return;
    this.rim = Math.max(0, this.rim - RIM.fade);
    if (this.onRim) this.onRim(this.rim);
  }

  updateParticles() {
    const ps = this.particles;
    for (let k = ps.length - 1; k >= 0; k--) {
      const p = ps[k];
      p.x += p.vx; p.y += p.vy;
      p.vx *= SPARK.decay; p.vy *= SPARK.decay;
      p.life -= SPARK.fade;
      if (p.life <= 0) ps.splice(k, 1);
    }
  }

  draw(t = 0) {
    const { ctx, cell, pad } = this;
    if (!ctx) return;
    const w = cell * W + pad * 2, h = cell * H + pad * 2;

    /* ★canvas の中身は揺らさない★（2026-09-09 撤去）
         もとは ctx.translate でランダムに揺らしていたが、
         (a) #stage の揺れと位相が独立なので打ち消し合い、弱く見えることがある
         (b) canvas の中身だけ動くので getBoundingClientRect は動かず、
             **見た目と当たり判定がずれる**（押した場所と光る場所が違う）
         (c) 揺れの強さの正本が2か所になる
         揺らすのは #stage だけ。強さの正本は上の SHAKE。 */
    ctx.save();
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, COLORS.bg1); g.addColorStop(1, COLORS.bg2);
    ctx.fillStyle = g; ctx.fillRect(-10, -10, w + 20, h + 20);

    if (this.disp) {
      for (let i = 0; i < N; i++) this.drawCell(i, t);
      if (this.legal) {
        ctx.save();
        ctx.strokeStyle = 'rgba(247,215,116,0.75)';
        ctx.lineWidth = 2;
        for (const i of this.legal) {
          const x = pad + xOf(i) * cell, y = pad + yOf(i) * cell;
          roundRect(ctx, x + 3, y + 3, cell - 6, cell - 6, 9);
          ctx.stroke();
        }
        ctx.restore();
      }
    }

    // ── 連鎖の予告（押す前に「どこがはじけるか」を見せる）──────────────
    if (this.preview) {
      ctx.save();
      const a = 0.22 + this.pulse * 0.26;
      for (const i of this.preview) {
        const x = pad + xOf(i) * cell, y = pad + yOf(i) * cell;
        ctx.fillStyle = `rgba(247,215,116,${a * 0.55})`;
        roundRect(ctx, x + 2, y + 2, cell - 4, cell - 4, 10);
        ctx.fill();
        ctx.strokeStyle = `rgba(255,246,214,${0.5 + this.pulse * 0.4})`;
        ctx.lineWidth = Math.max(2, cell * 0.055);
        roundRect(ctx, x + 3, y + 3, cell - 6, cell - 6, 10);
        ctx.stroke();
      }
      ctx.restore();
    }

    /* ★輪・光の粒・音符と星は、ここでは描かない★（2026-09-09 #fx へ移設）
         盤の canvas は画面の 60.6% しかなく、外に出た粒が消えていた。
         描くのは下の drawFx()。ここに描き戻すと「盤の周りに固まる」に逆戻りする。 */

    /* ★連鎖数のカットインは、ここでは描かない★
       盤のキャンバスは盤の大きさしか無いので「画面全面」にできない。
       2026-09-08 に、画面いっぱいのDOM（#chainPop）へ移した。
       この場所に描き戻すと、オーナーの「画面全面にドーン！」が盤の中の小さい文字に戻る。 */

    // 全画面のひかり（白飛びさせない・連続させない）
    if (this.flash > 0.02) {
      ctx.fillStyle = `rgba(255,246,214,${Math.min(0.55, this.flash)})`;
      ctx.fillRect(-10, -10, w + 20, h + 20);
    }
    ctx.restore();

    this.drawFx();
  }

  /**
   * 画面いっぱいのキャンバス(#fx)に、光るものを全部描く。
   *   輪 → 火花と尾 → 音符と星 の順（薄いものを下、読ませたいものを上）。
   *
   * ★毎フレーム必ず全面を消す★
   *   粒が0枚でも呼ぶこと。消さないと、最後の1枚が画面に焼き付いたまま残る。
   *
   * ★背景は塗らない★
   *   §5-4「画面いっぱいの背景の塗りつぶしをしない」。ここは透明のまま重ねる板であって、
   *   一枚の絵ではない。塗った瞬間に盤が見えなくなる。
   *
   * ★2026-09-09 火花・尾・輪もここへ移した★
   *   盤の canvas は画面の 60.6% しかなく、外へ出た粒はその瞬間に消えていた。
   *   座標を #fx 基準にしたら描く板もここにする——片方だけ直すと盤の左上ぶんずれる。
   */
  drawFx() {
    const ctx = this.fxCtx;
    if (!ctx) {
      // #fx が無い版では、今までどおり盤の canvas に描く（描かないと「出ていない」になる）
      if (this.ctx) {
        this.drawSparks(this.ctx);
        for (const g of this.glyphs) this.drawGlyph(g, this.ctx);
        this.ctx.globalAlpha = 1;
      }
      return;
    }
    ctx.clearRect(0, 0, this.fxW, this.fxH);
    this.drawSparks(ctx);
    for (const g of this.glyphs) this.drawGlyph(g, ctx);
    ctx.globalAlpha = 1;
  }

  /** 輪と、火花・尾。★面積を数える式（particleArea / ringArea）と同じ定数を使う★ */
  drawSparks(c) {
    for (const r of this.rings) {
      c.globalAlpha = Math.max(0, r.life) * RING.alpha;
      c.strokeStyle = r.color;
      c.lineWidth = Math.max(1.5, this.cell * RING.width * r.life);
      c.beginPath();
      c.arc(r.x, r.y, r.r, 0, Math.PI * 2);
      c.stroke();
    }
    c.globalAlpha = 1;
    for (const p of this.particles) {
      c.globalAlpha = Math.max(0, p.life) * PARTICLE_ALPHA;
      c.fillStyle = p.color;
      c.beginPath();
      c.arc(p.x, p.y, Math.max(1, this.cell * PARTICLE_R * p.life), 0, Math.PI * 2);
      c.fill();
    }
    c.globalAlpha = 1;
  }

  drawCell(i, t) {
    const { ctx, cell, pad, disp } = this;
    const x = pad + xOf(i) * cell, y = pad + yOf(i) * cell;
    const terr = effTerrain(disp, i);
    const owner = disp.owner[i], count = disp.count[i];

    if (terr === T_STARDUST) {
      // 光の通り道: マスを置かず、十字の光だけを描く
      ctx.save();
      ctx.strokeStyle = 'rgba(200,220,255,0.32)';
      ctx.lineWidth = Math.max(1.5, cell * 0.05);
      ctx.beginPath();
      ctx.moveTo(x + cell * 0.5, y + cell * 0.12); ctx.lineTo(x + cell * 0.5, y + cell * 0.88);
      ctx.moveTo(x + cell * 0.12, y + cell * 0.5); ctx.lineTo(x + cell * 0.88, y + cell * 0.5);
      ctx.stroke();
      ctx.fillStyle = 'rgba(200,220,255,0.5)';
      ctx.beginPath(); ctx.arc(x + cell / 2, y + cell / 2, cell * 0.07, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      return;
    }

    ctx.save();
    ctx.fillStyle = owner
      ? (owner === this.goldSeat ? 'rgba(247,215,116,0.13)' : 'rgba(127,140,255,0.13)')
      : COLORS.cell;
    roundRect(ctx, x + 2, y + 2, cell - 4, cell - 4, 10);
    ctx.fill();
    ctx.strokeStyle = COLORS.cellEdge; ctx.lineWidth = 1;
    ctx.stroke();

    if (terr === T_CRATER) {          // クレーター: はじけにくい＝二重の輪
      ctx.strokeStyle = 'rgba(255,255,255,0.22)';
      ctx.lineWidth = Math.max(1, cell * 0.035);
      ctx.beginPath(); ctx.arc(x + cell / 2, y + cell / 2, cell * 0.36, 0, Math.PI * 2); ctx.stroke();
    }
    if (terr === T_CLOUD) {           // 雲: くぐもった帯
      ctx.fillStyle = 'rgba(190,200,225,0.22)';
      roundRect(ctx, x + 5, y + cell * 0.3, cell - 10, cell * 0.4, cell * 0.2);
      ctx.fill();
    }

    // ★臨界（あと1つでいっぱい）は光る輪で必ず分かるようにする＝戦略が読める
    const cap = capAt(disp, i);
    if (owner && count === cap - 1) {
      ctx.strokeStyle = this.colorOf(owner);
      ctx.globalAlpha = 0.35 + this.pulse * 0.45;
      ctx.lineWidth = Math.max(1.5, cell * 0.045);
      roundRect(ctx, x + 3, y + 3, cell - 6, cell - 6, 10);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    if (i === this.lastMove) {
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.setLineDash([3, 3]); ctx.lineWidth = 1.5;
      roundRect(ctx, x + 5, y + 5, cell - 10, cell - 10, 8);
      ctx.stroke(); ctx.setLineDash([]);
    }

    // ★「あと何個ではじけるか」を盤の上で必ず見せる★（2026-09-08 オーナー実測で追加）
    //   容量はマスの位置で違う（かど2・へり3・まんなか4）。ここを描かないと、
    //   遊んでいる人は盤をいくら見てもルールに気づけない。実際に「ルールが分からない」と言われた。
    //   空き枠を薄い輪で描き、たまった光がその輪を1つずつ埋めていく形にする。
    //   ★輪の数＝capAt（rules.js）をそのまま読む。画面側で容量を計算し直さないこと★
    const slots = (terr !== T_CLOUD && cap >= 1 && cap <= 5) ? DOTS[cap] : null;
    if (slots && count <= cap) {
      const col = this.colorOf(owner);
      for (let k = 0; k < slots.length; k++) {
        const cx = x + cell / 2 + slots[k][0] * cell;
        const cy = y + cell / 2 + slots[k][1] * cell;
        if (k < count) {
          ctx.fillStyle = col;
          ctx.shadowColor = col; ctx.shadowBlur = cell * 0.28;
          ctx.beginPath(); ctx.arc(cx, cy, cell * 0.105, 0, Math.PI * 2); ctx.fill();
          ctx.shadowBlur = 0;
        } else {
          // 空き枠。持ち主がいるマスは少し濃く、空きマスはごく薄く（盤がうるさくならない範囲で）
          ctx.strokeStyle = owner ? 'rgba(255,255,255,0.24)' : 'rgba(255,255,255,0.11)';
          ctx.lineWidth = Math.max(1, cell * 0.028);
          ctx.beginPath(); ctx.arc(cx, cy, cell * 0.088, 0, Math.PI * 2); ctx.stroke();
        }
      }
    } else if (count > 0) {
      // 容量を超えている途中経過（演出の再生中に一時的にそうなる）は、数で見せる
      const col = this.colorOf(owner);
      const dots = DOTS[Math.min(5, count)] || DOTS[5];
      ctx.fillStyle = col;
      ctx.shadowColor = col; ctx.shadowBlur = cell * 0.28;
      for (const [dx, dy] of dots) {
        ctx.beginPath();
        ctx.arc(x + cell / 2 + dx * cell, y + cell / 2 + dy * cell, cell * 0.105, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.shadowBlur = 0;
      if (count > 5) {
        ctx.fillStyle = '#0b1024';
        ctx.font = `bold ${Math.round(cell * 0.26)}px system-ui, sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(String(count), x + cell / 2, y + cell / 2 + 1);
      }
    }

    /* ── 押したら何連鎖するか（自分の手番のあいだ出しっぱなし）──────────
       ★かならず drawCell のいちばん最後に描くこと★（2026-09-11 オーナー指示）
         > マス内のレイヤーは数字を一番上にして。現状は数字が見辛い
         canvas は**後に描いたものが上**になる。もとはこのブロックが光の粒より
         前にあり、粒（しかも shadowBlur 付き）が数字を覆っていた。
         暗い縁と影を敷いてはいたが、光る粒の上では効かない。
       ★test-render.mjs が「fillText が最後の arc より後か」を機械で見ている★
         次に誰かが drawCell を触ったときに、静かに元へ戻らないようにするため。
       ★ここに明滅する効果を足さないこと★
         仕様書§5-4 の「同時に光る面積 ≤ 18%」は #fx に描くものだけを数えており、
         盤の canvas に描くこれは**予算の外**＝検査が守ってくれない。
         いまは固定の濃さなので問題ないが、脈打たせた瞬間に予算外の明滅が生まれる。
       ★演出中は setHints(null) されるので、上の count>5 の数字とは重ならない★
         演出中も数字を出す変更をするなら、ここの重なりを見直すこと。 */
    const hint = this.hints ? this.hints[i] : 0;
    if (hint > 0) {
      ctx.save();
      // 数が大きいほど明るく・大きく。★数字そのものを出す★（強さの序列が一目で分かる）
      const big = Math.min(1, hint / 8);
      ctx.globalAlpha = HINT_ALPHA.min + big * (HINT_ALPHA.max - HINT_ALPHA.min);
      ctx.font = `bold ${Math.round(cell * (0.44 + big * 0.16))}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const tx = x + cell / 2;
      const ty = y + cell / 2 + 1;
      /* ★影ではなく「縁取り」で読ませる★
           shadowBlur だけだと、下に光る粒があるとにじみが負けて字がぼやける。
           先に暗い縁を実線で描いてから、その上に本体を置く。 */
      ctx.lineWidth = Math.max(2, cell * 0.075);
      ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(6,10,26,0.92)';
      ctx.strokeText(String(hint), tx, ty);
      ctx.fillStyle = hint >= 8 ? '#ffffff' : hint >= 4 ? '#fff2c4' : COLORS.p1;
      ctx.fillText(String(hint), tx, ty);
      ctx.restore();
    }
    ctx.restore();
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function osWantsStill() {
  // ★必ず真偽値で返す★ matchMedia が無い環境（Nodeのテスト）で undefined を返すと、
  //   それを他へ渡したときに undefined が漏れて検査をすり抜ける
  try { return !!(globalThis.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches); }
  catch { return false; }
}

/**
 * 「動きを止めるか」を決める唯一の関数。★matchMedia を読むのはここだけ★
 *   mode … 'auto'（端末に従う）| 'full'（必ず動かす）| 'still'（必ず止める）
 * ★app.js も この関数を使うこと★
 *   設定画面の表示と、実際の挙動が食い違わないようにするため。
 *   2026-09-09 に、matchMedia を render.js と app.js の2か所で読んでいて
 *   「ゆれません と出ているのに揺れる」が起こりうる状態になっていた。
 */
export function resolveMotion(mode) {
  /* ★'still' だけが「止める」★（2026-09-09 オーナー指示で既定オンにした）
       それ以外（'full'・未設定・壊れた値・古い 'auto'）はすべて揺らす。
       端末の prefers-reduced-motion は **もう参照しない**——
       既定で従うかどうかはオーナーの判断で、いまは「従わない」と決まっている。
       ただし表示用に deviceWantsStill() は残す（せってい画面に端末の状態を出すため）。 */
  return mode === 'still';
}

/** 端末が「動きを減らす」と言っているか（表示用。判定には resolveMotion を使う） */
export const deviceWantsStill = () => osWantsStill();

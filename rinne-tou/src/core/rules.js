/**
 * 全ゲーム数式の集約点
 *
 * 【厳守】仕様書 rinne-tou-spec.md §14 の式をそのまま実装する。
 * 定数（数値）はシミュレーターの結果で調整してよいが、**式の形は変えない**。
 * ただし CRUSH_MUL（崩し倍率）だけは 1.5〜1.9 で調整可（§14 末尾の例外・2026-08-02改訂）。
 */

// ── 構え（敵）と系統（味方） ────────────────────────────────
export const STANCE = { GOU: 'gou', SHITSU: 'shitsu', JU: 'ju' };      // 剛 / 疾 / 呪
export const LINE = { HA: 'ha', RYU: 'ryu', FU: 'fu', NONE: 'none' };   // 破 / 流 / 封 / 無系統

export const STANCE_LABEL = { gou: '剛', shitsu: '疾', ju: '呪' };
export const LINE_LABEL = { ha: '破', ryu: '流', fu: '封', none: '—' };

/** 相性の結果 */
export const AFFINITY = { CRUSH: 'crush', NEUTRAL: 'neutral', ADVERSE: 'adverse' };

/**
 * 三すくみ表（spec §3-1）
 *        剛      疾      呪
 * 破    逆風    中立    崩し
 * 流    崩し    逆風    中立
 * 封    中立    崩し    逆風
 */
const AFFINITY_TABLE = {
  ha:  { gou: AFFINITY.ADVERSE, shitsu: AFFINITY.NEUTRAL, ju: AFFINITY.CRUSH },
  ryu: { gou: AFFINITY.CRUSH,   shitsu: AFFINITY.ADVERSE, ju: AFFINITY.NEUTRAL },
  fu:  { gou: AFFINITY.NEUTRAL, shitsu: AFFINITY.CRUSH,   ju: AFFINITY.ADVERSE },
};

/** 味方スキルの系統 × 敵の構え → 相性 */
export function affinityOf(line, stance) {
  if (!line || line === LINE.NONE) return AFFINITY.NEUTRAL;
  const row = AFFINITY_TABLE[line];
  if (!row || !stance) return AFFINITY.NEUTRAL;
  return row[stance] || AFFINITY.NEUTRAL;
}

// ── 戦闘の定数 ────────────────────────────────────────────
export const CRUSH_MUL = 1.5;      // 崩し時の与ダメージ倍率（★暫定値・1.5〜1.9で調整可）
export const ADVERSE_MUL = 0.8;    // 逆風時の与ダメージ倍率（変更禁止）
export const CRUSH_ENEMY_MUL = 0.5;   // 崩し成立時、敵の予告行動の威力（2026-08-02: キャンセル廃止）
export const ADVERSE_ENEMY_MUL = 1.2; // 逆風時、敵の予告行動が強化される倍率
export const CRIT_MUL = 1.5;
export const CRIT_CAP = 30;        // 会心率の上限(%)
export const DMG_RAND_MIN = 0.95;
export const DMG_RAND_MAX = 1.05;
export const CRUSH_GAUGE_MAX = 3;  // 崩しゲージ満タン＝合わせ技
export const KI_REGEN_TURN = 2;    // ターン終了時の気の自然回復
export const KI_REGEN_ATTACK = 5;  // 通常攻撃時の気回復
export const KI_MEGURI_CAP = 3;    // 「気の巡り」の合計上限（spec §3-5）

/** 与ダメージの相性倍率 */
export function affinityMul(aff) {
  if (aff === AFFINITY.CRUSH) return CRUSH_MUL;
  if (aff === AFFINITY.ADVERSE) return ADVERSE_MUL;
  return 1.0;
}

/** 崩された/逆風になったときの、敵の予告行動の威力倍率 */
export function enemyActionMul(aff) {
  if (aff === AFFINITY.CRUSH) return CRUSH_ENEMY_MUL;
  if (aff === AFFINITY.ADVERSE) return ADVERSE_ENEMY_MUL;
  return 1.0;
}

/** 会心率(%)。運が高いほど上がる。上限30% */
export function critRate(luk) {
  return Math.min(CRIT_CAP, 5 + luk / 20);
}

/**
 * ダメージ計算（spec §14・変更禁止）
 *   物理: atk=力, def=守
 *   術  : atk=術, def=守×0.5
 * @param {object} o
 * @param {number} o.atk    攻撃側のステータス（力 or 術）
 * @param {number} o.def    防御側の守
 * @param {number} o.power  スキル威力（100=等倍）
 * @param {boolean} o.isMagic 術かどうか
 * @param {number} o.affMul 相性倍率
 * @param {number} o.critMul 会心倍率（1.0 or 1.5）
 * @param {number} o.stateMul 状態異常等の倍率（脆など）
 * @param {number} o.rand   0.95〜1.05
 */
export function damage({ atk, def, power, isMagic = false, affMul = 1, critMul = 1, stateMul = 1, rand = 1 }) {
  const effDef = isMagic ? def * 0.5 : def;
  const base = atk * (power / 100);
  const mitigation = 100 / (100 + Math.max(0, effDef));
  const d = Math.floor(base * mitigation * affMul * critMul * stateMul * rand);
  return Math.max(1, d);
}

// ── 成長 ──────────────────────────────────────────────────
/** Lv → Lv+1 に必要な経験値（spec §14） */
export function needExp(lv) {
  return Math.floor(15 * lv * lv + 25 * lv);
}

/** Lv1からlvまでの累計必要経験値 */
export function totalExpTo(lv) {
  let t = 0;
  for (let i = 1; i < lv; i++) t += needExp(i);
  return t;
}

/**
 * 本編の敵ステータス倍率（階層F）
 *
 * 【2026-08-02 調整】当初は全ステータス一律 `1 + 0.09*F` だったが、
 * balance.mjs で実測したところ**全階層・全難易度で勝率100%**だった。
 * 原因は、味方の守がレベルで大きく伸びる一方、被ダメージが `100/(100+守)` の
 * 逓減曲線で潰れるため、敵の攻撃力が相対的にどんどん無力化されること。
 * （Lv60の石動は守378 → 被ダメージが約2割まで落ちる）
 *
 * そこで **攻撃系だけ急な傾き**にして、守の成長に追随させる。
 * ダメージ式そのもの（spec §14 の逓減の形）は変えていない。
 */
export function enemyScale(floor) {
  return 1 + 0.09 * floor;   // 互換用（テスト・表示で使う基準値）
}

/** ステータス種別ごとの倍率。ここがバランス調整の主ダイヤル */
export const ENEMY_SCALE = {
  hp:  (f) => 1 + 0.115 * f,
  atk: (f) => 1 + 0.45 * f,
  mag: (f) => 1 + 0.45 * f,
  def: (f) => 1 + 0.10 * f,
  spd: (f) => 1 + 0.05 * f,
  luk: (f) => 1 + 0.05 * f,
};

export function enemyScaleFor(key, floor) {
  const fn = ENEMY_SCALE[key];
  return fn ? fn(floor) : enemyScale(floor);
}

/** 深層（61F〜）の追加倍率 */
export function deepScale(floor) {
  return floor > 60 ? Math.pow(1.06, floor - 60) : 1;
}

/** 支塔「無明」の倍率（層） */
export function mumyoScale(layer) {
  return layer > 50 ? Math.pow(1.07, layer - 50) : 1;
}

/** 輪廻（周回）による敵強化倍率 */
export function rebirthScale(n) {
  return 1 + 0.35 * n;
}

/** 輪廻による報酬倍率 */
export function rebirthReward(n) {
  return 1 + 0.5 * n;
}

/** 上げられるレベルの上限（spec §6-1「本編Lv60 → 輪廻ごとに+10・上限120」） */
export const LV_HARD_MAX = 120;
export function levelCap(rebirth = 0) {
  return Math.min(LV_HARD_MAX, 60 + 10 * Math.max(0, Math.floor(rebirth)));
}

/**
 * 経験値・銭の全体レート（バランス調整の主ダイヤル）
 *
 * 【2026-08-02 調整】sim.mjs で1F〜60Fを通したところ、初期値では
 * 60F到達時点でLv44（推奨Lv60）にしかならず、慢性的なレベル不足で
 * 全滅123回・39時間という「作業ゲー」になっていた。
 * 経験値だけを引き上げて、レベルが階層に追随するようにする。
 *
 * 【2026-08-03 再調整】2.2 → 1.60。
 * シナリオを実装して仲間が章ごとに加わるようになり、序盤が1〜2人になった。
 * それに合わせて敵の数とボスの強さを人数で割り引いた（BOSS_PARTY_SCALE）ところ、
 * 全体が易しくなりすぎて 9.6h / 全滅4.7回（合格ラインは10h以上・5〜25回）に落ちた。
 * 経験値レートを戻して、レベルが階層に追いつく速さを緩めた。
 *
 * ★このダイヤルと `data/bosses.js` の基礎値は**互いに影響し合う**。
 *   ボスを弱くすると再挑戦が減ってレベルが下がり、次の計測でボスがまた強く見える。
 *   1回直して終わりにせず、次の順で**収束するまで往復すること**:
 *     ① sim.mjs → ボス階の到達レベルを読む
 *     ② その値を boss.mjs / tune_boss.mjs の REC_LV に反映
 *     ③ tune_boss.mjs で各ボスの適正倍率を出し、bosses.js に反映
 *     ④ ①へ戻る（2〜3往復で落ち着く）
 *   実測の推移: 2.05→10.3h、1.95→10.7h、1.85→11.2h（ボス調整前）／
 *   ボス調整後は 1.85→9.2h、1.70→10.0h、**1.60→10.3h・全滅7.5回**（40周・mid）
 *
 * ★ここは因果にも効く。`karmaGain()` が `runExp` 由来なので、下げると
 *   因果盤の開放マス数も一緒に減る。触ったら sim の「因果盤の開放」が
 *   10〜20マスに収まっているかも必ず見ること（KARMA_RATE と同じ注意）。
 */
export const EXP_RATE = 1.36;
export const ZENI_RATE = 2.0;

// ── 因果（永続通貨・spec §14。2026-08-02改訂で帰還と全滅を同率に） ──
/**
 * 因果の全体レート（★因果盤のペース配分の主ダイヤル）
 *
 * 【2026-08-03 追加】spec §14 は `floor(runExp / 10)` と書いているが、
 * この式は EXP_RATE を 2.2 に引き上げる**前**に書かれたもの。
 * そのまま実装して sim.mjs で測ったところ、mid が本編クリアまでに
 * **48マス中41マスを開けてしまい**（因果 99,501 を使用）、
 * 通しプレイが 9.0h → 5.1h、全滅が 7.3回 → 2.2回 に落ちた。
 *
 * spec §6-5 は因果盤を「**エンディング後の主戦場**」「49マス全開放に約26万因果
 * （数十時間規模）」と位置づけている。本編中に8割開いてしまうのは設計意図と正反対。
 * 式の形（EXPに比例・帰還と全滅は同率）は変えず、レートだけを分離した。
 *
 * ★ここを触ったら必ず `node test/sim.mjs` を回し、
 *   「本編クリアまでの開放マス数」が10〜20マスに収まっているか確認すること。
 */
export const KARMA_RATE = 0.02;

export function karmaGain(runExp, rebirth) {
  if (runExp <= 0) return 0;
  // 浅い潜行でも0にはしない（「何も増えなかった」で終わる潜行を作らない）
  const base = Math.max(1, Math.floor((runExp / 10) * KARMA_RATE));
  return base * rebirthReward(rebirth);
}

/** 全滅時のロスト（その潜行で得た分の10%のみ・2026-08-02改訂） */
export const LOST_RATE = 0.10;
export function lostAmount(gainedInRun) {
  return Math.floor(gainedInRun * LOST_RATE);
}

/** 深度ボーナス（spec §4-5-a）。素材・銭・装備ドロップ率にのみ掛ける（因果には掛けない） */
export function depthBonus(consecutiveFloors) {
  return Math.min(2.0, 1 + 0.04 * consecutiveFloors);
}

// ── 強化系 ────────────────────────────────────────────────
/** 因果盤: 開放済みマス数 → 次のマスのコスト */
export function boardCost(opened) {
  return Math.floor(50 * Math.pow(1.15, opened));
}

/**
 * 装備の階層スケール（発見階層1つあたり何%強くなるか）
 *
 * 【2026-08-02 調整】当初 0.08。装備ドロップを実装して初めて実測したところ、
 * 通しプレイが 12.8h → 3.5h に短縮し、終盤の装備依存度が 48〜53% になった
 * （目標30〜40%）。装備がレベル・錬気・因果盤の意味を食い潰していた。
 *
 * 【2026-08-05 調整】0.038 のままだと装備依存度が 43% で目標を超え続けていた。
 * 5水準を実測して単調に効くことを確認したうえで 0.030 を採った:
 *   0.038→43% ／ 0.034→42% ／ 0.032→41% ／ **0.030→39%** ／ 0.026→38%（ただし全滅が11.8回に増える）
 * 下げすぎると装備の更新が嬉しくなくなり、全滅回数だけが増える。
 *
 * ★ここが「装備が強すぎる／弱すぎる」の唯一の調整点。
 *   ダメージ式（§14）や敵スケールには触らないこと。
 */
export const EQUIP_FLOOR_SCALE = 0.030;

/** 銘強化: 現在の+値 → 次の強化に必要な石の数 */
export function enhanceCost(plus) {
  return Math.ceil(2 * Math.pow(1.35, plus));
}

/**
 * 銘強化: 次の1段階に要る**銭**（2026-08-13 オーナー指示「鍛冶だけど、銭も使うようにしよう。銭が余り過ぎる」）。
 *
 * ★実測: シミュレーターでクリアした時点の残り銭は**平均98万**（`sim.mjs --runs 12`）。
 *   買うものが「塔の中の商人」しかなく、銭がほぼ死に資源になっていた。
 * ★増え方は石と同じ 1.35^plus にそろえる（別の曲線にすると、
 *   「石は足りるのに銭で止まる」段が飛び飛びに現れて読めない）。
 * ★**装備の階層(lv)に比例**させるのが肝。序盤の装備まで高くすると、
 *   銭の少ない序盤に鍛冶が止まる。深い装備ほど高くつく形にする。
 *   例: 45階の装備を+0→+10 で約37,000銭（4人×3枠を全部やると45万前後）。
 */
export function enhanceZeni(plus, lv = 1) {
  const base = 20 + Math.max(1, Math.floor(lv)) * 20;
  return Math.ceil(base * Math.pow(1.35, plus));
}

/** 銘強化を plus から n 段階ぶん進めるのに要る銭の合計 */
export function enhanceZeniTotal(plus, n, lv = 1) {
  let total = 0;
  for (let i = 0; i < Math.max(0, Math.floor(n) || 0); i++) total += enhanceZeni(plus + i, lv);
  return total;
}

/** 銘強化: +値 → 主効果の倍率 */
export function enhanceMul(plus) {
  return 1 + 0.08 * plus;
}

/**
 * 銘強化を plus から n 段階ぶん進めるのに要る石の合計（2026-08-11）。
 *
 * ★1段階ごとに 1.35 倍で値上がりするので、`enhanceCost(plus) * n` では**まるで足りない**
 *   （+0 から3段階なら 2+3+4=9 だが、掛け算では 6 になる）。必ずここを通すこと。
 *   錬気の `renkiCostTotal` と同じ役割。
 */
export function enhanceCostTotal(plus, n) {
  let total = 0;
  for (let i = 0; i < Math.max(0, Math.floor(n) || 0); i++) total += enhanceCost(plus + i);
  return total;
}

/**
 * 石 have で plus から何段階鍛えられるか（上限 max まで）。
 * スライダーの可動域を決めるのに使う。
 *
 * ★上限は引数で受ける。`ENHANCE_MAX` は growth.js が持っており、
 *   ここ（core）から meta を参照すると依存が逆向きになる。
 */
/**
 * 銘強化1段階に要る**月齢素材**の数（2026-08-12 オーナー指示
 * 「鍛冶石以外にも月齢素材を使うようにしよう。装備品によって、使う素材を分ける感じにしつつ、
 * 強化段階が進むほど、使う素材数を増やしましょう」）。
 *
 * ★どの素材を使うかは**装備のベース**が持つ（`data/equips.js` の `mat`）。
 *   刀は「欠けの欠片」、鉄物は「闇苔」…と分けてあるので、
 *   鍛えたい装備によって通う月が変わる。
 * ★数は3段階ごとに1つずつ増える（+0〜2で1個、+3〜5で2個、+6〜8で3個、+9で4個）。
 *   0→+10 の合計は22個。月齢素材は8種のうち1種しか採れない月が3.7日ごとに回るので、
 *   これ以上にすると「今月は鍛冶ができない」が常態になる。
 * ★鍛冶石のほうは据え置き。**石＝作業量、月齢素材＝待ち時間**という役割分けにしてある。
 */
export function enhanceMoonCost(plus) {
  return 1 + Math.floor(Math.max(0, plus) / 3);
}

/** 月齢素材の合計（plus から n 段階ぶん） */
export function enhanceMoonTotal(plus, n) {
  let total = 0;
  for (let i = 0; i < Math.max(0, Math.floor(n) || 0); i++) total += enhanceMoonCost(plus + i);
  return total;
}

/**
 * 石・月齢素材・**銭**がそろっているところまで、何段階鍛えられるか。
 *
 * ★**3つとも**見る（2026-08-13 に銭を追加）。1つでも見落とすと、
 *   つまみは最大まで動くのに押した瞬間に「たりません」で止まる（＝押す前に分からない）。
 * @param {number} zeniHave 手持ちの銭。省略時は無限＝銭を見ない（古い呼び出し向け）
 * @param {number} lv       その装備の階層（銭の値段はこれに比例する）
 */
export function enhanceAffordable(plus, max, have, moonHave = Infinity, zeniHave = Infinity, lv = 1) {
  let n = 0;
  let spent = 0;
  let moon = 0;
  let zeni = 0;
  while (plus + n < max) {
    const c = enhanceCost(plus + n);
    const m = enhanceMoonCost(plus + n);
    const z = enhanceZeni(plus + n, lv);
    if (spent + c > have || moon + m > moonHave || zeni + z > zeniHave) break;
    spent += c;
    moon += m;
    zeni += z;
    n++;
  }
  return n;
}

/** 錬気: 現在値 → 次の+1に必要な素材数 */
export function renkiCost(cur) {
  return 3 + Math.floor(cur / 5);
}

/**
 * 錬気を cur から n ポイント上げるのに要る素材の合計（2026-08-10）。
 *
 * ★1ポイントごとに値段が上がる（5ポイントごとに+1）ので、
 *   `renkiCost(cur) * n` では**足りない**。必ずここを通すこと。
 */
export function renkiCostTotal(cur, n) {
  let total = 0;
  for (let i = 0; i < Math.max(0, Math.floor(n) || 0); i++) total += renkiCost(cur + i);
  return total;
}

/**
 * 素材 have で cur から何ポイント上げられるか（上限 max まで）。
 * スライダーの可動域を決めるのに使う。
 */
export function renkiAffordable(cur, max, have) {
  let n = 0;
  let spent = 0;
  while (cur + n < max) {
    const c = renkiCost(cur + n);
    if (spent + c > have) break;
    spent += c;
    n++;
  }
  return n;
}

/** 錬気の上限（輪廻回数で伸びる） */
export function renkiMax(rebirth) {
  // ★天井を張る。輪廻は `cleared` が残っているかぎり何度でも押せるので、
  //   上限が伸び続けると「1階も登らずに連打して恒久上限だけ稼ぐ」経路になる
  //   （2026-08-03 レビュー指摘）。レベル上限が120で止まる周回数（6周）に揃えた
  return 20 + Math.min(Math.max(0, Math.floor(rebirth) || 0), REBIRTH_CAP) * 10;
}

/** 倍率・上限が伸びる周回数の上限（レベル上限が120に達する回数） */
export const REBIRTH_CAP = 6;

// ── 探索 ──────────────────────────────────────────────────
export const AKARI_MAX_BASE = 100;         // 灯の初期最大値
export const AKARI_COST_MOVE = 4;          // ノード移動（1〜7階。深いほど下の akariCostMove で増える）
export const AKARI_COST_BATTLE = 3;        // 戦闘
export const AKARI_GAIN_STAIRS = 8;        // 階段で次の階へ
export const AKARI_DIM = 30;               // これ以下で「薄明」
export const AKARI_HOKORA_GAIN = 30;       // 祠での灯の回復量

/**
 * ノード移動で減る灯。**深いほど暗くなる**（2026-08-05）。
 *
 * それまで全階で一律4だったため、1階と19階で灯の判断がまったく同じだった。
 * 「19階まで遊んでも灯が減らず緊張感がない」という実プレイの指摘の主因がこれ。
 * ★序盤（1〜7階）は据え置き。ここを上げると、主人公ひとりで戦う序章が難しくなりすぎる。
 * ★引数は**実際の階数（run.floor）**を渡すこと。powerFloor（強さの指標）ではない。
 *   灯は「どれだけ長く潜っていられるか」の予算なので、効かせる相手は歩く階数のほう。
 *   支塔（10階を1回で通す）に powerFloor を渡すと必要な灯が持てる量の3倍になり踏破不能になる。
 */
export function akariCostMove(floor) {
  return Math.min(10, AKARI_COST_MOVE + Math.floor(Math.max(1, floor) / 8));
}
export const TOKOYAMI_ENEMY_MUL = 1.5;     // 常闇での敵強化（守り・速さ・HP）
export const TOKOYAMI_SLIP = 0.03;         // 常闇の毎ターンスリップ（最大HP比）
/**
 * 常闇のデメリット強化（2026-08-12 オーナー指示）。
 *
 * 指示は「探索で先が一切見えない他、敵の攻撃を100%アップさせつつ、
 * 味方の攻撃を50%の確率で外すようにしましょう」。
 *
 * ★灯0は「じわじわ不利」ではなく**明確な事故**にする。
 *   それまでは敵が1.5倍になるだけで、レベルが足りていれば押し切れてしまい、
 *   灯を使い切ることのリスクが数字の上でしか存在しなかった。
 * ★攻撃力だけを2.0にして、守り・速さ・HPは1.5のままにしてある。
 *   全部2.0にすると「硬くて速くて痛い」になり、逃げも通らず立て直しが不可能になる。
 *   痛いが**倒せる**——引き返す判断が意味を持つ強さに留めること。
 */
export const TOKOYAMI_ENEMY_ATK_MUL = 2.0;  // 常闇での敵の攻撃力（atk・mag）
export const TOKOYAMI_MISS = 0.5;           // 常闇で味方の攻撃が外れる確率

/** 逃走成功率(%)。常闇では呼ばない（逃走不可） */
export function escapeRate(allySpd, enemySpd) {
  return Math.min(90, Math.max(10, 50 + (allySpd - enemySpd)));
}

// ── 影送り（派遣・spec §7） ──────────────────────────────
/**
 * 送り出す時間。**1〜20時間を1時間刻み**（2026-08-13 オーナー指示
 * 「影送りは1時間から20時間の幅で1時間単位で選べるようにすること」）。
 *
 * ★以前は 2/4/8/12 の4択だった。生活の区切り（昼休みの1時間・寝る前の7時間・
 *   出かける13時間）に合わせられないのが不便、というのが今回の指摘。
 * ★**2/4/8/12 の倍率は1つも動かしていない**。あの4点は
 *   「寝て待つほうが得」にならない上限として調整済みなので（`test.mjs` §16）、
 *   間の時間はその4点を通る線でつなぎ、12時間より先は同じ調子で伸ばした。
 */
export const DISPATCH_HOURS = Array.from({ length: 20 }, (_, i) => i + 1);

/**
 * 時間ごとの収穫倍率。**1時間あたりの取り分は伸ばすほど減る**（下の右列）。
 * ここを一定にすると「長く送るのが常に最適」になり、選ぶ意味が消える。
 *
 *      倍率   1時間あたり            倍率   1時間あたり
 *   1h  0.55   0.550            11h  4.48   0.407
 *   2h  1.00   0.500  ←既存      12h  4.80   0.400  ←既存
 *   4h  1.90   0.475  ←既存      16h  5.88   0.367
 *   8h  3.50   0.438  ←既存      20h  6.76   0.338
 *
 * ★触ったら必ず `node test/test.mjs` の §16 を通すこと。
 *   20時間でも「1レベルぶんの経験値」「銘強化1回ぶんの鍛冶石」を超えないことを見ている。
 */
export const DISPATCH_TIME_MUL = {
  1: 0.55, 2: 1.00, 3: 1.45, 4: 1.90, 5: 2.30,
  6: 2.70, 7: 3.10, 8: 3.50, 9: 3.83, 10: 4.15,
  11: 4.48, 12: 4.80, 13: 5.07, 14: 5.34, 15: 5.61,
  16: 5.88, 17: 6.10, 18: 6.32, 19: 6.54, 20: 6.76,
};
export const DISPATCH_CAP_HOURS = 20;      // 蓄積上限（＝選べる最長。式の上でここが受け取りの上限になる）

/** 探査力 */
export function scoutPower(lv, equipValue, renkiTotal) {
  return lv + Math.floor(equipValue / 10) + Math.floor(renkiTotal / 5);
}

/** 成功度（0.3〜1.5） */
export function dispatchSuccess(scout, floor) {
  const req = floor * 1.1;
  return Math.min(1.5, Math.max(0.3, scout / req));
}

// ── 難易度（spec §13-5。拠点でのみ変更可） ────────────────
export const DIFFICULTY = {
  easy:   { id: 'easy',   label: 'やさしい', enemyMul: 0.8,  takenMul: 0.6, rewardMul: 1.0, lost: false, ranked: false },
  normal: { id: 'normal', label: 'ふつう',   enemyMul: 1.0,  takenMul: 1.0, rewardMul: 1.0, lost: true,  ranked: true },
  rinne:  { id: 'rinne',  label: '輪廻',     enemyMul: 1.15, takenMul: 1.4, rewardMul: 1.2, lost: true,  ranked: true },
};

/**
 * 層ボスの強さを、出撃人数に合わせて下げる倍率（2026-08-03 追加）
 *
 * 仕様（spec §8-1・plan §4 の章立て表）では
 *   10Fボス＝2人／20Fボス＝3人／30F以降＝4人
 * で戦うことになる。しかしボスの数値は**4人前提**で作って test/boss.mjs で
 * 合格ライン（初見突破率30〜75%）を確認したものだった。
 * そのままだと2人で10Fボスに挑むことになり、シミュレーターで
 * 「ボスに撃退される回数 平均31回・一章だけで6時間」という詰まり方をした。
 *
 * ★4人のときは必ず 1.0（＝boss.mjs で測った数値をそのまま保つ）。
 *   人数が減ったぶんだけ下げる。上げることはしない。
 */
export const BOSS_PARTY_SCALE = { 1: 0.35, 2: 0.5, 3: 0.8, 4: 1 };
export function bossPartyScale(allies) {
  const n = Math.max(1, Math.min(4, Math.floor(allies) || 1));
  return BOSS_PARTY_SCALE[n];
}

// ── 影闘レート（v1.2） ───────────────────────────────────
export function eloDelta(myRate, oppRate, won) {
  const expected = 1 / (1 + Math.pow(10, (oppRate - myRate) / 400));
  return Math.round(32 * ((won ? 1 : 0) - expected));
}

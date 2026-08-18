/**
 * 敵データ（spec / tech-design §4-1「種族テーブル × 階層スケール × 接辞」方式）
 *
 * 60階分の敵を手書きすると破綻するので、
 *   種族24種 × 接辞12種 = 実質288通り
 * を生成式で作る。ボスだけが完全手書き（data/bosses.js）。
 *
 * stance: [剛, 疾, 呪] の出現重み。月齢フェーズで偏りが上乗せされる（spec §5）
 */

export const SPECIES = [
  // ── 序盤（1〜20F） ──
  { id: 'onibi',    name: '鬼火',   mon: '火', color: '#e0533a', base: { hp: 38, atk: 9, def: 4, spd: 12, mag: 14, luk: 5 }, stance: [10, 20, 70], f: [1, 25],  acts: ['ju_bolt', 'ju_curse'], desc: '灯を求めて寄ってくる。近づくと、こちらの提灯が少しだけ暗くなる。' },
  { id: 'ishizaru', name: '石猿',   mon: '猿', color: '#9a9a8a', base: { hp: 52, atk: 12, def: 9, spd: 9,  mag: 3,  luk: 4 }, stance: [65, 25, 10], f: [1, 22],  acts: ['gou_smash', 'gou_guard'], desc: '塔の石段を運んだ猿。仕事が終わったあとも、石を抱えたままでいる。' },
  { id: 'karakasa', name: '唐傘',   mon: '傘', color: '#c96a6a', base: { hp: 40, atk: 8,  def: 5, spd: 18, mag: 6,  luk: 9 }, stance: [15, 70, 15], f: [1, 24],  acts: ['sh_double', 'sh_haste'], desc: '捨てられた傘の付喪神。雨も降っていないのに、いつも開いている。' },
  { id: 'nezumi',   name: '影鼠',   mon: '鼠', color: '#8a8a9a', base: { hp: 30, atk: 7,  def: 3, spd: 20, mag: 4,  luk: 12 }, stance: [10, 75, 15], f: [1, 18],  acts: ['sh_double'], desc: '影だけになった鼠。踏んでも手応えがなく、足の下をすり抜けていく。' },
  { id: 'kappa',    name: '河童',   mon: '河', color: '#5fa08a', base: { hp: 58, atk: 11, def: 11, spd: 10, mag: 9, luk: 6 }, stance: [45, 30, 25], f: [3, 30],  acts: ['gou_smash', 'sh_haste'], desc: '塔の下を流れていた川の主。川が涸れてからも、皿を濡らして待っている。' },
  { id: 'tsuchigumo', name: '土蜘蛛', mon: '蜘', color: '#6a5a4a', base: { hp: 72, atk: 14, def: 12, spd: 8, mag: 6, luk: 4 }, stance: [70, 20, 10], f: [5, 34],  acts: ['gou_smash', 'gou_guard'], desc: '床下に巣を張る。糸は名前を写せるほど細くないが、人ひとりは絡め取る。' },

  // ── 中盤（15〜40F） ──
  { id: 'shirohebi', name: '白蛇',  mon: '蛇', color: '#d8d8c8', base: { hp: 66, atk: 13, def: 9, spd: 16, mag: 15, luk: 11 }, stance: [20, 40, 40], f: [12, 42], acts: ['sh_double', 'ju_curse'], desc: '祠の守りだったもの。祀る者がいなくなり、守る相手を探して塔を這う。' },
  { id: 'nurikabe',  name: '塗壁',  mon: '壁', color: '#8a8a7a', base: { hp: 130, atk: 12, def: 26, spd: 4, mag: 4, luk: 3 }, stance: [80, 5, 15],  f: [14, 46], acts: ['gou_guard', 'gou_smash'], desc: '道をふさぐ壁。押しても叩いても動かないが、名前を呼ぶと少しだけ薄くなる。' },
  { id: 'yamabiko',  name: '山彦',  mon: '彦', color: '#7f9fd8', base: { hp: 60, atk: 9,  def: 8, spd: 14, mag: 20, luk: 10 }, stance: [10, 20, 70], f: [16, 48], acts: ['ju_wave', 'ju_bolt'], desc: 'こちらの声をそのまま返す。返ってくる声には、知らない訛りが少し混ざる。' },
  { id: 'kamaitachi', name: '鎌鼬', mon: '鎌', color: '#a0c8d8', base: { hp: 62, atk: 17, def: 8, spd: 26, mag: 6, luk: 14 }, stance: [10, 80, 10], f: [18, 50], acts: ['sh_double', 'sh_haste'], desc: '風そのものが刃になったもの。斬られたと気づくのは、三歩ほど歩いたあと。' },
  { id: 'sagari',    name: '下がり', mon: '下', color: '#b08a6a', base: { hp: 78, atk: 15, def: 13, spd: 13, mag: 11, luk: 8 }, stance: [40, 35, 25], f: [20, 52], acts: ['gou_smash', 'ju_curse'], desc: '梁からぶら下がって待っている。落ちてくる前に、必ず一度だけ嘶く。' },
  { id: 'hitodama',  name: '人魂',  mon: '魂', color: '#9fd8c8', base: { hp: 54, atk: 8,  def: 6, spd: 19, mag: 24, luk: 13 }, stance: [5, 25, 70],  f: [22, 54], acts: ['ju_drain', 'ju_wave'], desc: '還れなかった人の灯。近づくと、憶えている名前をひとつ持っていくことがある。' },

  // ── 終盤（35〜60F） ──
  { id: 'oni',       name: '赤鬼',  mon: '鬼', color: '#c0392b', base: { hp: 150, atk: 26, def: 18, spd: 12, mag: 8, luk: 8 }, stance: [75, 15, 10], f: [32, 60], acts: ['gou_smash', 'gou_guard'], desc: '上の層を歩き回る。手にした金棒には、数えきれない打ち跡が残っている。' },
  { id: 'tengu',     name: '木天狗', mon: '天', color: '#7d5fa8', base: { hp: 118, atk: 23, def: 14, spd: 28, mag: 14, luk: 16 }, stance: [15, 70, 15], f: [34, 60], acts: ['sh_double', 'sh_haste'], desc: '梢に棲む天狗。羽の色が黒くないのは、まだ里へ降りたことがないから。' },
  { id: 'nue',       name: '鵺',    mon: '鵺', color: '#5a4a6a', base: { hp: 132, atk: 20, def: 16, spd: 20, mag: 26, luk: 12 }, stance: [25, 30, 45], f: [38, 60], acts: ['ju_wave', 'ju_curse', 'sh_double'], desc: '寄せ集めの獣。どの部分も、誰かが忘れた別のものの形をしている。' },
  { id: 'ubume',     name: '姑獲鳥', mon: '姑', color: '#a8a0c8', base: { hp: 112, atk: 16, def: 13, spd: 22, mag: 30, luk: 14 }, stance: [10, 25, 65], f: [40, 60], acts: ['ju_drain', 'ju_bolt'], desc: '子を探して飛ぶ。誰の子かは、本人ももう憶えていない。' },
  { id: 'gashadokuro', name: '骸骨', mon: '骸', color: '#d8d8d8', base: { hp: 190, atk: 30, def: 20, spd: 10, mag: 10, luk: 6 }, stance: [80, 10, 10], f: [44, 60], acts: ['gou_smash'], desc: '弔われなかった者たちが寄り集まった骨。ひとつ動くたび、乾いた音が響く。' },
  { id: 'ittanmomen', name: '一反木綿', mon: '綿', color: '#e8e8e0', base: { hp: 96, atk: 18, def: 10, spd: 32, mag: 12, luk: 20 }, stance: [5, 85, 10], f: [46, 60], acts: ['sh_double', 'sh_haste'], desc: '一反の木綿が宙を走る。巻きつかれると、目の前が白一色になる。' },

  // ── 支塔・深層向け（構えが偏った専用種） ──
  { id: 'ishikame',  name: '石亀',  mon: '亀', color: '#7a8a6a', base: { hp: 75, atk: 8, def: 18, spd: 5, mag: 2, luk: 4 }, stance: [100, 0, 0], f: [1, 999], acts: ['gou_guard', 'gou_smash'], towers: ['kikoku'], desc: '甲羅が岩そのもの。急ぎはしないが、決して引き返さない。' },
  { id: 'oniwaraji', name: '鬼草鞋', mon: '鞋', color: '#8a6a4a', base: { hp: 56, atk: 11, def: 12, spd: 9, mag: 2, luk: 5 }, stance: [100, 0, 0], f: [1, 999], acts: ['gou_smash'], towers: ['kikoku'], desc: '履き潰された草鞋の付喪神。持ち主の歩き方を、そのまま真似て歩く。' },
  { id: 'kazehiki',  name: '風曳',  mon: '風', color: '#9fc8d8', base: { hp: 41, atk: 9, def: 5, spd: 34, mag: 4, luk: 18 }, stance: [0, 100, 0], f: [1, 999], acts: ['sh_double', 'sh_haste'], towers: ['shippu'], desc: '風だけが形を持ったもの。曲がり角では、必ず先回りしている。' },
  { id: 'hayate',    name: '疾風丸', mon: '疾', color: '#b8d8e8', base: { hp: 36, atk: 10, def: 4, spd: 40, mag: 3, luk: 22 }, stance: [0, 100, 0], f: [1, 999], acts: ['sh_double'], towers: ['shippu'], desc: '廊を駆ける影。姿を見てから構えたのでは、まず間に合わない。' },
  { id: 'norotama',  name: '呪玉',  mon: '呪', color: '#6a4a7a', base: { hp: 39, atk: 4, def: 6, spd: 15, mag: 14, luk: 12 }, stance: [0, 0, 100], f: [1, 999], acts: ['ju_bolt', 'ju_wave'], towers: ['jyuso'], desc: '溜まった恨みが玉になったもの。割ると、中身が近くの誰かへ移る。' },
  { id: 'tatarigami', name: '祟神', mon: '祟', color: '#4a3a5a', base: { hp: 51, atk: 5, def: 8, spd: 17, mag: 16, luk: 15 }, stance: [0, 0, 100], f: [1, 999], acts: ['ju_curse', 'ju_drain'], towers: ['jyuso'], desc: '祀られなくなった神。祟る相手を選べないまま、目の前の者に降りかかる。' },
  // 各塔+2種（2026-08-03 追加）。2種だけだと10〜15分の周回を繰り返す体験として薄い
  { id: 'iwaushi',   name: '岩牛',  mon: '牛', color: '#6a6a5a', base: { hp: 96, atk: 10, def: 16, spd: 6, mag: 1, luk: 3 }, stance: [100, 0, 0], f: [1, 999], acts: ['gou_smash', 'gou_guard'], towers: ['kikoku'], desc: '荷を運んでいた牛。荷はとうに届け終えたが、まだ同じ坂を登っている。' },
  { id: 'kobushi',   name: '拳鬼',  mon: '拳', color: '#a05a4a', base: { hp: 45, atk: 15, def: 7, spd: 14, mag: 2, luk: 7 }, stance: [100, 0, 0], f: [1, 999], acts: ['gou_smash'], towers: ['kikoku'], desc: '得物を持たない鬼。素手のほうが確かだと、どこかで決めたらしい。' },
  { id: 'tsujikaze', name: '辻風',  mon: '辻', color: '#c8e0e8', base: { hp: 33, atk: 8, def: 4, spd: 46, mag: 3, luk: 26 }, stance: [0, 100, 0], f: [1, 999], acts: ['sh_double', 'sh_haste'], towers: ['shippu'], desc: '辻に立つつむじ風。通り過ぎる者の袖から、軽いものだけを抜いていく。' },
  { id: 'hayabusa',  name: '隼影',  mon: '隼', color: '#8ab0c8', base: { hp: 49, atk: 12, def: 7, spd: 30, mag: 4, luk: 16 }, stance: [0, 100, 0], f: [1, 999], acts: ['sh_double'], towers: ['shippu'], desc: '隼の影だけが残ったもの。本体がどこへ行ったかは、影も知らない。' },
  { id: 'ubagami',   name: '姥神',  mon: '姥', color: '#5a4a6a', base: { hp: 61, atk: 6, def: 11, spd: 12, mag: 14, luk: 10 }, stance: [0, 0, 100], f: [1, 999], acts: ['ju_wave', 'ju_bolt'], towers: ['jyuso'], desc: '境を守る老女の神。通す者と通さぬ者を、理由を言わずに分ける。' },
  { id: 'kuchinawa', name: '朽縄',  mon: '朽', color: '#4a5a4a', base: { hp: 42, atk: 4, def: 7, spd: 24, mag: 18, luk: 14 }, stance: [0, 0, 100], f: [1, 999], acts: ['ju_drain', 'ju_curse'], towers: ['jyuso'], desc: '朽ちた縄が蛇になったもの。締めるのではなく、ゆっくり巻きついて離れない。' },

  /**
   * 月渡り専用（2026-08-03 追加）。
   * この塔だけ**3つの構えを揃えて置く**。`makeEnemyGroup` が、その日の月齢が示す構えの
   * 種だけにプールを絞る（下弦・二十六夜は絞らない＝3種が混ざる＝最も難しい）。
   * ★ここが空だったため、月渡りではプールが空になり、階層フィルタの無い
   *   フォールバックが走って1階に44階の骸骨が出ていた（2026-08-03 修正）
   */
  { id: 'tsukiishi', name: '月石',  mon: '石', color: '#b0b0c8', base: { hp: 83, atk: 10, def: 17, spd: 7, mag: 3, luk: 6 }, stance: [100, 0, 0], f: [1, 999], acts: ['gou_smash', 'gou_guard'], towers: ['tsukiwatari'], desc: '月の光を吸った石。欠けた月の下では、こちらも欠けた形をしている。' },
  { id: 'tsukiusagi', name: '月兎', mon: '兎', color: '#e0e0e8', base: { hp: 39, atk: 9, def: 5, spd: 38, mag: 5, luk: 24 }, stance: [0, 100, 0], f: [1, 999], acts: ['sh_double', 'sh_haste'], towers: ['tsukiwatari'], desc: '月へ渡りそこねた兎。杵を持ったまま、渡る順番を待ち続けている。' },
  { id: 'tsukikasa', name: '月暈',  mon: '暈', color: '#c0b8e0', base: { hp: 46, atk: 5, def: 7, spd: 18, mag: 16, luk: 13 }, stance: [0, 0, 100], f: [1, 999], acts: ['ju_wave', 'ju_bolt'], towers: ['tsukiwatari'], desc: '月にかかる暈が降りてきたもの。触れると、その日の月齢だけ憶えて消える。' },

  /**
   * 朔の窖・望の櫓 専用（2026-08-12 追加）。
   *
   * ★**塔ごとに3種（剛・疾・呪を1種ずつ）置くこと**。この2本は構えを固定しない塔なので、
   *   1種でも欠けるとその構えが一度も出ず、「三つの構えが混ざる」という説明が嘘になる。
   *   （専用種を持たない塔でプールが空になると、階層フィルタの無いフォールバックが
   *     走って場違いな敵が出る事故が過去にある＝月渡りの1階に骸骨。同じ轍を踏まない）
   * ★月渡り専用種と同じくらいの基礎値にしてある。強さは `powerFloorOf` が塔ごとに
   *   引き上げるので、ここで塔の難度差を作らない。
   */
  // ── 朔の窖（満ちていく側） ──
  { id: 'sakuishi',  name: '朔石',   mon: '朔', color: '#6a6a7a', base: { hp: 86, atk: 11, def: 17, spd: 7,  mag: 3,  luk: 6 },  stance: [100, 0, 0], f: [1, 999], acts: ['gou_smash', 'gou_guard'], towers: ['sakugura'], desc: '新月の晩に転がり出る石。表に細い筋が一本だけ入っていて、月と同じだけ増える。' },
  { id: 'yoiga',     name: '宵蛾',   mon: '蛾', color: '#c8b8a0', base: { hp: 41, atk: 10, def: 5,  spd: 36, mag: 5,  luk: 22 }, stance: [0, 100, 0], f: [1, 999], acts: ['sh_double', 'sh_haste'], towers: ['sakugura'], desc: '灯を目指して集まる蛾。提灯に近い者から順に、まとわりついてくる。' },
  { id: 'tsutakage', name: '蔦影',   mon: '蔦', color: '#5a7a5a', base: { hp: 48, atk: 5,  def: 8,  spd: 16, mag: 17, luk: 12 }, stance: [0, 0, 100], f: [1, 999], acts: ['ju_curse', 'ju_bolt'], towers: ['sakugura'], desc: '窖の壁を這う蔦の影。伸びた先には、いつも誰かの手形が付いている。' },

  // ── 望の櫓（欠けていく側） ──
  { id: 'mochigane', name: '望鐘',   mon: '鐘', color: '#a89a6a', base: { hp: 92, atk: 12, def: 18, spd: 8,  mag: 4,  luk: 5 },  stance: [100, 0, 0], f: [1, 999], acts: ['gou_smash', 'gou_guard'], towers: ['mochiyagura'], desc: '満月の晩にひとりでに鳴る鐘。撞く者がいないのに、いつも同じ数だけ鳴る。' },
  { id: 'kakebito',  name: '欠人',   mon: '欠', color: '#9a9aa8', base: { hp: 44, atk: 12, def: 6,  spd: 33, mag: 6,  luk: 20 }, stance: [0, 100, 0], f: [1, 999], acts: ['sh_double'], towers: ['mochiyagura'], desc: '半身だけの人影。欠けた側から先に動くので、こちらの目には残像しか映らない。' },
  { id: 'ariakebi',  name: '有明火', mon: '明', color: '#b8a0c8', base: { hp: 50, atk: 5,  def: 8,  spd: 19, mag: 18, luk: 14 }, stance: [0, 0, 100], f: [1, 999], acts: ['ju_drain', 'ju_wave'], towers: ['mochiyagura'], desc: '夜明けまで消えずに残る火。近づくと、明け方に見た夢だけを思い出す。' },
];

export const SPECIES_BY_ID = Object.fromEntries(SPECIES.map((s) => [s.id, s]));

/**
 * 接辞（1体ごとに確率で付く）。ステータスに倍率をかける。
 * w = 出現重み。none が圧倒的に多く、稀に強い個体が出る。
 */
export const AFFIXES = [
  { id: 'none',   name: '',         w: 100, mul: {} },
  { id: 'sueta',  name: '饐えた',   w: 14,  mul: { hp: 1.3 } },
  { id: 'hayai',  name: '疾い',     w: 14,  mul: { spd: 1.4 } },
  { id: 'katai',  name: '硬い',     w: 12,  mul: { def: 1.5 } },
  { id: 'araburu', name: '荒ぶる',  w: 12,  mul: { atk: 1.35 } },
  { id: 'tatari', name: '祟りの',   w: 10,  mul: { mag: 1.5 } },
  { id: 'yaseta', name: '痩せた',   w: 10,  mul: { hp: 0.7, spd: 1.2 } },
  { id: 'oinaru', name: '大いなる', w: 5,   mul: { hp: 1.5, atk: 1.2, def: 1.2 } },
  { id: 'kiyoi',  name: '清い',     w: 5,   mul: { luk: 2.0, mag: 1.2 } },
  { id: 'kurui',  name: '狂い',     w: 5,   mul: { atk: 1.5, def: 0.7 } },
  { id: 'furui',  name: '古い',     w: 4,   mul: { hp: 1.2, def: 1.3, spd: 0.8 } },
  { id: 'tsuki',  name: '月喰みの', w: 2,   mul: { hp: 1.4, atk: 1.3, mag: 1.3, luk: 1.5 } },
];

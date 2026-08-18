/**
 * スキル定義（spec §3-1 系統 / §3-6 状態異常）
 *
 * line : 'ha'(破) / 'ryu'(流) / 'fu'(封) / 'none'(通常攻撃)
 * target: 'one' | 'all' | 'ally' | 'allyAll' | 'self'
 * power : 100 = 等倍
 * magic : true なら術（守が半分で計算される）
 * ki    : 消費する気。通常攻撃だけは 0 で、逆に KI_REGEN_ATTACK ぶん回復する
 */

export const SKILLS = {
  // ── 通常攻撃（全員が持つ） ──
  atk_normal: {
    id: 'atk_normal', name: 'たたかう', line: 'none', target: 'one',
    power: 100, ki: 0, magic: false, desc: '気を5回復する',
  },

  // ── 破（高威力・一撃） ──
  s_kiru: {
    id: 's_kiru', name: '一閃', line: 'ha', target: 'one',
    power: 155, ki: 6, magic: false, desc: '単体に強い一撃',
  },
  s_kazakiri: {
    id: 's_kazakiri', name: '風斬り', line: 'ha', target: 'one',
    power: 130, ki: 5, magic: false, critBonus: 15, desc: '会心が出やすい',
  },
  s_kitsunebi: {
    id: 's_kitsunebi', name: '狐火', line: 'ha', target: 'all',
    power: 95, ki: 12, magic: true, ailment: { id: 'yakedo', rate: 30 },
    desc: '敵全体に術。ときどき火傷させる',
  },

  // ── 流（受け・軽減・カウンター） ──
  s_iwato: {
    id: 's_iwato', name: '岩戸受け', line: 'ryu', target: 'one',
    power: 105, ki: 5, magic: false, selfBuff: { def: 0.3, turns: 2 },
    desc: '攻めながら、しばらく守りを固める',
  },
  s_nagashi: {
    id: 's_nagashi', name: '受け流し', line: 'ryu', target: 'one',
    power: 120, ki: 6, magic: false, desc: '受け流しの一撃',
  },
  s_kabau: {
    id: 's_kabau', name: 'かばう', line: 'ryu', target: 'self',
    power: 0, ki: 4, magic: false, taunt: { turns: 2 },
    desc: 'しばらくのあいだ、味方への攻撃を引き受ける',
  },

  // ── 封（拘束・封じ・補助/回復） ──
  s_himoro: {
    id: 's_himoro', name: '灯明', line: 'fu', target: 'ally',
    power: 0, ki: 8, magic: true, heal: 160, desc: '味方一人のHPを回復',
  },
  s_shizume: {
    id: 's_shizume', name: '鎮め', line: 'fu', target: 'one',
    power: 70, ki: 7, magic: true, ailment: { id: 'mahi', rate: 45 },
    desc: 'しばしば麻痺させる',
  },
  s_itogarami: {
    id: 's_itogarami', name: '糸がらみ', line: 'fu', target: 'one',
    power: 85, ki: 7, magic: false, ailment: { id: 'don', rate: 60 },
    desc: 'よく効く。当たると相手の動きが鈍る',
  },

  // ══════════════════════════════════════════════════════════
  // レベルで覚える技（2026-08-12 オーナー要望
  // 「各キャラはレベルに応じて技を増やすようにしましょう。
  //   ともしや無銘が万能タイプなのに、技の種類が少なすぎます」）
  //
  // 【設計の制約】ここに置けるのは**エンジンが既に解釈できる形**だけ:
  //   power / ki / magic / critBonus / target(one|all|ally|allyAll|self) /
  //   heal / ailment / selfBuff / taunt
  // ★「効果だけで威力が0」の技を作らないこと。AI（battle/ai.js）は
  //   回復・挑発以外を**期待ダメージ**で採点するので、威力0の支援技は
  //   点が付かず**一生選ばれない**。支援は攻撃に乗せる（岩戸受けと同じ形）。
  // ★誰が何レベルで覚えるかは data/chars.js の `learn`。ここは技の定義だけ。
  // ══════════════════════════════════════════════════════════

  // ── ともし（万能。三系統を一通り持たせる） ──
  s_tomoshikaeshi: {
    id: 's_tomoshikaeshi', name: '灯返し', line: 'ryu', target: 'one',
    power: 118, ki: 5, magic: false, selfBuff: { def: 0.25, turns: 2 },
    desc: '受けながら打つ。しばらく守りが上がる',
  },
  s_tomoshitsugi: {
    id: 's_tomoshitsugi', name: '灯継ぎ', line: 'fu', target: 'ally',
    power: 0, ki: 7, magic: true, heal: 110,
    desc: '味方一人のHPを回復する',
  },
  s_tomoshidachi: {
    id: 's_tomoshidachi', name: '灯断ち', line: 'ha', target: 'one',
    power: 178, ki: 10, magic: false,
    desc: '踏み込んで斬る。気を多く使う',
  },
  s_tomoshibi: {
    id: 's_tomoshibi', name: '灯散らし', line: 'ha', target: 'all',
    power: 102, ki: 13, magic: false,
    desc: '敵全体を薙ぐ',
  },

  // ── 鈴（封・回復） ──
  s_haraibell: {
    id: 's_haraibell', name: '祓いの鈴', line: 'fu', target: 'allyAll',
    power: 0, ki: 14, magic: true, heal: 95,
    desc: '味方全体のHPを回復',
  },
  s_kotohogi: {
    id: 's_kotohogi', name: '言祝ぎ', line: 'fu', target: 'one',
    power: 78, ki: 9, magic: true, ailment: { id: 'fu', rate: 45 },
    desc: 'しばしば技を封じる',
  },

  // ── 黒羽（破・速攻） ──
  s_tsubame: {
    id: 's_tsubame', name: '燕返し', line: 'ha', target: 'one',
    power: 150, ki: 7, magic: false, critBonus: 10,
    desc: '踏み替えて二度目を入れる。会心が出やすい',
  },
  s_hagarami: {
    id: 's_hagarami', name: '羽がらめ', line: 'ha', target: 'one',
    power: 96, ki: 8, magic: false, ailment: { id: 'don', rate: 50 },
    desc: '羽を巻きつけて動きを鈍らせる',
  },
  s_karasumure: {
    id: 's_karasumure', name: '鴉群れ', line: 'ha', target: 'all',
    power: 90, ki: 13, magic: false,
    desc: '鴉を呼んで敵全体を突く',
  },

  // ── 石動（流・盾） ──
  s_iwaoshi: {
    id: 's_iwaoshi', name: '岩押し', line: 'ryu', target: 'one',
    power: 142, ki: 7, magic: false,
    desc: '全身で押し潰す',
  },
  s_jibiki: {
    id: 's_jibiki', name: '地曳き', line: 'ryu', target: 'one',
    power: 82, ki: 9, magic: false, ailment: { id: 'kon', rate: 35 },
    desc: '地面ごと引き倒す。ときどき昏倒させる',
  },

  // ── 狐火（破・術） ──
  s_hinotama: {
    id: 's_hinotama', name: '火の玉', line: 'ha', target: 'one',
    power: 152, ki: 8, magic: true,
    desc: '一点に絞った術',
  },
  s_kagerou: {
    id: 's_kagerou', name: '陽炎', line: 'ha', target: 'all',
    power: 72, ki: 11, magic: true, ailment: { id: 'madoi', rate: 40 },
    desc: '敵全体に術。ときどき惑わせる',
  },
  s_ookitsunebi: {
    id: 's_ookitsunebi', name: '大狐火', line: 'ha', target: 'all',
    power: 128, ki: 18, magic: true,
    desc: '敵全体を焼く大きな術。気を大きく使う',
  },

  // ── 縒（封・拘束） ──
  s_itoyose: {
    id: 's_itoyose', name: '糸寄せ', line: 'fu', target: 'all',
    power: 94, ki: 12, magic: false, ailment: { id: 'don', rate: 35 },
    desc: '敵全体を糸で手繰る',
  },
  s_nawame: {
    id: 's_nawame', name: '縄目', line: 'fu', target: 'one',
    power: 86, ki: 9, magic: true, ailment: { id: 'fu', rate: 50 },
    desc: 'よく効く。当たると技を封じる',
  },
  s_yorinaoshi: {
    id: 's_yorinaoshi', name: '縒り直し', line: 'fu', target: 'ally',
    power: 0, ki: 9, magic: true, heal: 140,
    desc: '解けかけた糸を縒り直す。味方一人を回復',
  },

  // ── 無銘（万能。三系統を一通り持たせる） ──
  s_nawofusu: {
    id: 's_nawofusu', name: '名を伏せる', line: 'fu', target: 'one',
    power: 90, ki: 7, magic: false, ailment: { id: 'kare', rate: 40 },
    desc: '相手の気の巡りを枯らす',
  },
  s_sayabashiri: {
    id: 's_sayabashiri', name: '鞘走り', line: 'ryu', target: 'one',
    power: 134, ki: 6, magic: false, selfBuff: { spd: 0.3, turns: 2 },
    desc: '抜き打ち。しばらく速くなる',
  },
  s_mumeigiri: {
    id: 's_mumeigiri', name: '無銘斬り', line: 'ha', target: 'one',
    power: 170, ki: 10, magic: false,
    desc: '名の無い刀の一振り',
  },

  // ══════════════════════════════════════════════════════════
  // 高位の技（2026-08-13 オーナー要望
  // 「技はレベルを上げていったら、さらに強力な技を覚えるようにしましょう。
  //   レベル上げのやりこみ要素です」）
  //
  // 【覚える段は3つ】data/chars.js の `learn` を参照。
  //   Lv50 … 本編の終盤〜塔の地下に入るころ
  //   Lv60 … 1周目に上げられる上限（＝地下でレベルを上げきった人へのごほうび）
  //   Lv80 … 輪廻を2回してようやく届く段（spec §6-1 の上限 60+10×輪廻）
  //
  // 【威力の目安】既存の最上位（灯断ち178・無銘斬り170・大狐火128全体）を基準に、
  //   50で+15%、60で+30%、80で+55% 程度。**気の消費も一緒に上げる**こと。
  //   威力だけ上げると「毎ターン最強技を撃つだけ」になり、気のやりくりが消える。
  // ★ここでも「効果だけで威力0」は作らない（AIが選ばない）。
  //   例外は**回復と挑発**だけ（battle/ai.js が別枠で採点する）。
  // ══════════════════════════════════════════════════════════

  // ── ともし（万能。三系統それぞれの上位） ──
  s_hitsuranuki: {
    id: 's_hitsuranuki', name: '灯貫き', line: 'ha', target: 'one',
    power: 205, ki: 12, magic: false,
    desc: '一点に灯を集めて貫く。灯断ちより深く入る',
  },
  s_higoromo: {
    id: 's_higoromo', name: '灯衣', line: 'ryu', target: 'one',
    power: 176, ki: 12, magic: false, selfBuff: { def: 0.4, turns: 3 },
    desc: '灯をまとって打つ。しばらく守りが大きく上がる',
  },
  s_mandou: {
    id: 's_mandou', name: '万灯', line: 'ha', target: 'all',
    power: 172, ki: 22, magic: false,
    desc: '灯を万に散らして薙ぐ。気を大きく使う',
  },

  // ── 鈴（回復と足止めの上位） ──
  s_suzuhibiki: {
    id: 's_suzuhibiki', name: '鈴響き', line: 'fu', target: 'allyAll',
    power: 0, ki: 18, magic: true, heal: 150,
    desc: '味方全体を大きく回復',
  },
  s_kotoshizume: {
    id: 's_kotoshizume', name: '言鎮め', line: 'fu', target: 'all',
    power: 96, ki: 16, magic: true, ailment: { id: 'mahi', rate: 35 },
    desc: '敵全体に術。しばしば麻痺させる',
  },
  s_kagurasuzu: {
    id: 's_kagurasuzu', name: '神楽鈴', line: 'fu', target: 'allyAll',
    power: 0, ki: 28, magic: true, heal: 300,
    desc: '味方全体を深く回復する、鈴の極み',
  },

  // ── 黒羽（会心の上位） ──
  s_hayabusaotoshi: {
    id: 's_hayabusaotoshi', name: '隼落とし', line: 'ha', target: 'one',
    power: 198, ki: 10, magic: false, critBonus: 20,
    desc: '真上から落ちる一撃。会心がよく出る',
  },
  s_kurohagaeshi: {
    id: 's_kurohagaeshi', name: '黒羽返し', line: 'ha', target: 'one',
    power: 228, ki: 14, magic: false, critBonus: 25,
    desc: '返す刃で二度打つ。会心がとてもよく出る',
  },
  s_gunwa: {
    id: 's_gunwa', name: '群鴉', line: 'ha', target: 'all',
    power: 168, ki: 21, magic: false, critBonus: 10,
    desc: '鴉の群れで敵全体を裂く',
  },

  // ── 石動（受けの上位） ──
  s_iwaotoshi: {
    id: 's_iwaotoshi', name: '巌落とし', line: 'ryu', target: 'one',
    power: 196, ki: 11, magic: false,
    desc: '岩そのものを落とす',
  },
  s_fudou: {
    id: 's_fudou', name: '不動', line: 'ryu', target: 'one',
    power: 152, ki: 12, magic: false,
    selfBuff: { def: 0.5, turns: 3 }, taunt: { turns: 2 },
    desc: '打ちながら前に立つ。守りが大きく上がり、攻撃を引き受ける',
  },
  s_jiware: {
    id: 's_jiware', name: '地割れ', line: 'ryu', target: 'all',
    power: 158, ki: 20, magic: false, ailment: { id: 'kon', rate: 25 },
    desc: '地を裂いて敵全体を落とす。ときどき昏倒させる',
  },

  // ── 狐火（術の上位） ──
  s_byakko: {
    id: 's_byakko', name: '白狐火', line: 'ha', target: 'one',
    power: 205, ki: 12, magic: true,
    desc: '白く燃える一点の術',
  },
  s_kitsunebijin: {
    id: 's_kitsunebijin', name: '狐火陣', line: 'ha', target: 'all',
    power: 152, ki: 20, magic: true, ailment: { id: 'yakedo', rate: 35 },
    desc: '陣を敷いて敵全体を焼く。しばしば火傷させる',
  },
  s_kyubi: {
    id: 's_kyubi', name: '九尾', line: 'ha', target: 'all',
    power: 188, ki: 26, magic: true,
    desc: '九つの尾で焼き払う。気を非常に大きく使う',
  },

  // ── 縒（拘束の上位） ──
  s_chijinoito: {
    id: 's_chijinoito', name: '千々の糸', line: 'fu', target: 'all',
    power: 118, ki: 15, magic: false, ailment: { id: 'don', rate: 40 },
    desc: '敵全体を細い糸で搦める',
  },
  s_musubinaoshi: {
    id: 's_musubinaoshi', name: '結び直し', line: 'fu', target: 'allyAll',
    power: 0, ki: 22, magic: true, heal: 200,
    desc: '解けた糸を結び直す。味方全体を回復',
  },
  s_yorinoo: {
    id: 's_yorinoo', name: '縒の緒', line: 'fu', target: 'one',
    power: 210, ki: 16, magic: true, ailment: { id: 'fu', rate: 55 },
    desc: '緒を絞って断つ。よく効き、技を封じる',
  },

  // ── 無銘（万能の上位） ──
  s_mumeigaeshi: {
    id: 's_mumeigaeshi', name: '無銘返し', line: 'ryu', target: 'one',
    power: 190, ki: 11, magic: false, selfBuff: { spd: 0.3, turns: 2 },
    desc: '受けて返す。しばらく速くなる',
  },
  s_meinashidachi: {
    id: 's_meinashidachi', name: '銘無し太刀', line: 'ha', target: 'one',
    power: 232, ki: 14, magic: false,
    desc: '名を持たぬ者の、いちばん深い一振り',
  },
  s_kuunohitofuri: {
    id: 's_kuunohitofuri', name: '空の一振り', line: 'ha', target: 'all',
    power: 170, ki: 22, magic: false,
    desc: '空を薙ぐ。敵全体を斬る',
  },
};

/** 状態異常の定義（spec §3-6・全9種） */
export const AILMENTS = {
  yakedo: { id: 'yakedo', name: '火傷', turns: 3, slipPct: 0.03 },
  doku:   { id: 'doku',   name: '毒',   turns: 5, slipPct: 0.05, stack: 2 },
  mahi:   { id: 'mahi',   name: '麻痺', turns: 3, actFailRate: 0.30, spdMul: 0.7 },
  fu:     { id: 'fu',     name: '封',   turns: 2, noSkill: true },
  madoi:  { id: 'madoi',  name: '惑',   turns: 2, confuseRate: 0.35 },
  don:    { id: 'don',    name: '鈍',   turns: 3, spdMul: 0.6 },
  moro:   { id: 'moro',   name: '脆',   turns: 3, takenMul: 1.3 },
  kon:    { id: 'kon',    name: '昏',   turns: 2, noAct: true, wakeOnHit: true },
  // 2026-08-02 オーナー指示で追加。「封」との差別化のため気消費+50%を併せ持つ
  kare:   { id: 'kare',   name: '枯',   turns: 3, noKiRegen: true, kiCostMul: 1.5 },
};

/** 敵の構えごとの行動（spec §3-1。予告表示される） */
export const ENEMY_ACTS = {
  gou_smash:  { id: 'gou_smash',  name: '渾身', stance: 'gou',    power: 145, magic: false },
  gou_guard:  { id: 'gou_guard',  name: '構え', stance: 'gou',    power: 100, magic: false, selfBuff: { def: 0.4, turns: 1 } },
  sh_double:  { id: 'sh_double',  name: '連撃', stance: 'shitsu', power: 65,  magic: false, hits: 2 },
  sh_haste:   { id: 'sh_haste',   name: '疾走', stance: 'shitsu', power: 80,  magic: false, selfBuff: { spd: 0.4, turns: 2 } },
  ju_bolt:    { id: 'ju_bolt',    name: '呪詛', stance: 'ju',     power: 120, magic: true },
  ju_curse:   { id: 'ju_curse',   name: '祟り', stance: 'ju',     power: 70,  magic: true, ailment: { id: 'moro', rate: 50 } },
  ju_wave:    { id: 'ju_wave',    name: '呪波', stance: 'ju',     power: 85,  magic: true, target: 'all' },
  ju_drain:   { id: 'ju_drain',   name: '気喰い', stance: 'ju',   power: 60,  magic: true, ailment: { id: 'kare', rate: 55 } },
};

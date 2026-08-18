/**
 * 装備データ（spec §6-2）
 *
 * ベース20種 × 接頭12 × 接尾12 = 2,880通りを生成式で作る。
 * 手書きするのは表だけで、実際の装備はドロップ時に組み立てる。
 *
 * slot: weapon(武器) / armor(防具) / charm(護符)
 * rarity: 0=常(白) 1=珍(青) 2=稀(紫) 3=伝(金) 4=銘打(虹・深層専用)
 */

export const RARITY = ['常', '珍', '稀', '伝', '銘打'];
export const RARITY_COLOR = ['#c8c8c8', '#7fb0d8', '#a87fd8', '#e0b34a', '#e07ad8'];

export const BASES = [
  // ── 武器 ──
  { id: 'w_kodachi', slot: 'weapon', name: '小太刀', s: { atk: 8 }, f: [1, 20], mat: 'kake', desc: '取り回しの軽い短めの刀。塔へ入る者が、最初に持たされる一本。' },
  { id: 'w_katana',  slot: 'weapon', name: '打刀',   s: { atk: 14 }, f: [8, 35], mat: 'kake', desc: '里の鍛冶が打った刀。癖がなく、振り慣れるほど手に馴染む。' },
  { id: 'w_odachi',  slot: 'weapon', name: '大太刀', s: { atk: 22, spd: -3 }, f: [20, 60], mat: 'michi', desc: '両手で構える長大な刀。一撃は重いが、次の一歩が遅れる。' },
  { id: 'w_yari',    slot: 'weapon', name: '槍',     s: { atk: 16, spd: 2 }, f: [14, 50], mat: 'shippu', desc: '間合いの外から突く。前へ出ずに戦いたい者向き。' },
  { id: 'w_kagura',  slot: 'weapon', name: '神楽鈴', s: { mag: 15, ki: 4 }, f: [6, 40], mat: 'izayoi', desc: '祈りに使う鈴。振ると気が満ち、術の通りがよくなる。' },
  { id: 'w_shaku',   slot: 'weapon', name: '笏',     s: { mag: 22, def: 2 }, f: [22, 60], mat: 'izayoi', desc: '祝詞を読むための板。武器ではないが、術の芯がまっすぐ通る。' },
  { id: 'w_tetsu',   slot: 'weapon', name: '鉄杖',   s: { atk: 12, def: 6 }, f: [10, 45], mat: 'yamigoke', desc: '鉄の芯を入れた杖。打つことも、受けることもできる。' },
  { id: 'w_ito',     slot: 'weapon', name: '操り糸', s: { atk: 9, luk: 8 }, f: [12, 55], mat: 'shogen', desc: '指に巻いて操る細い糸。使い手の運を、そのまま拾い上げる。' },

  // ── 防具 ──
  { id: 'a_nuno',    slot: 'armor', name: '布衣',   s: { def: 6, spd: 2 }, f: [1, 18], mat: 'shogen', desc: '厚手の布を重ねただけの衣。軽いぶん、走れる。' },
  { id: 'a_kawa',    slot: 'armor', name: '革胴',   s: { def: 12 }, f: [8, 32], mat: 'yoimachi', desc: 'なめし革を貼った胴当て。刃を止めずに、滑らせて逃がす。' },
  { id: 'a_tetsu',   slot: 'armor', name: '鉄胴',   s: { def: 20, spd: -3 }, f: [20, 60], mat: 'yamigoke', desc: '鉄板を綴じた胴。守りは固いが、足がそのぶん重くなる。' },
  { id: 'a_hakui',   slot: 'armor', name: '白衣',   s: { def: 8, mag: 8 }, f: [12, 48], mat: 'michi', desc: '祠で使う白い衣。身は守らないが、術が濁らない。' },
  { id: 'a_haori',   slot: 'armor', name: '旅羽織', s: { def: 10, spd: 4 }, f: [14, 52], mat: 'shippu', desc: '塔を歩く者の羽織。裾が短く、石段でつまずかない。' },
  { id: 'a_iwa',     slot: 'armor', name: '岩鎧',   s: { def: 28, spd: -6, hp: 40 }, f: [30, 60], mat: 'yamigoke', desc: '塔の石を削って組んだ鎧。着ていると、自分も塔の一部になった気がする。' },

  // ── 護符 ──
  { id: 'c_omamori', slot: 'charm', name: 'お守り',   s: { luk: 6 }, f: [1, 22], mat: 'yoimachi', desc: '里の祠で配られた守り袋。中身は、渡した本人も見たことがない。' },
  { id: 'c_juzu',    slot: 'charm', name: '数珠',     s: { ki: 6, mag: 4 }, f: [8, 40], mat: 'izayoi', desc: '繰るたびに気が整う。数を数えているうちに、息が落ち着く。' },
  { id: 'c_suzu',    slot: 'charm', name: '鈴飾り',   s: { spd: 8 }, f: [12, 46], mat: 'shippu', desc: '腰に下げる小さな鈴。足の運びに合わせて鳴り、体が軽くなる。' },
  { id: 'c_fuda',    slot: 'charm', name: '護符',     s: { def: 6, hp: 25 }, f: [16, 55], mat: 'kake', desc: '祠で刷った紙の札。大きな一撃を、一度だけ受け止めるという。' },
  { id: 'c_kagami',  slot: 'charm', name: '手鏡',     s: { luk: 12, mag: 6 }, f: [24, 60], mat: 'yoimachi', desc: '曇った手鏡。覗くと、いまの自分より少しだけ先が映ることがある。' },
  { id: 'c_tomoshi', slot: 'charm', name: '灯かご',   s: { hp: 30, ki: 5 }, f: [20, 60], mat: 'ariake', desc: '提灯を吊るす小さな籠。灯を守っているだけで、体まで守られる気がする。' },
];

/** 接頭（主にステータス） */
export const PREFIXES = [
  { id: 'p_none', name: '',       w: 100, rarity: 0, s: {} },
  { id: 'p_toki', name: '研ぎの', w: 30, rarity: 1, s: { atk: 6 } },
  { id: 'p_kata', name: '堅い',   w: 30, rarity: 1, s: { def: 6 } },
  { id: 'p_haya', name: '疾い',   w: 28, rarity: 1, s: { spd: 5 } },
  { id: 'p_shizu', name: '静かな', w: 26, rarity: 1, s: { mag: 6 } },
  { id: 'p_saiwai', name: '幸いの', w: 22, rarity: 1, s: { luk: 7 } },
  { id: 'p_gan',  name: '頑なの', w: 18, rarity: 2, s: { hp: 40 } },
  { id: 'p_meguri', name: '巡りの', w: 14, rarity: 2, s: {}, meguri: 1 },
  { id: 'p_tsuki', name: '月影の', w: 10, rarity: 2, s: { atk: 8, mag: 8 } },
  { id: 'p_kiyo', name: '清めの', w: 8,  rarity: 2, s: { def: 8 }, resist: 15 },
  { id: 'p_ogami', name: '大神の', w: 4,  rarity: 3, s: { atk: 12, def: 8, spd: 4 } },
  { id: 'p_rinne', name: '輪廻の', w: 2,  rarity: 3, s: { hp: 60, ki: 8, luk: 10 } },
];

/** 接尾（主に特殊効果） */
export const SUFFIXES = [
  { id: 's_none', name: '',           w: 100, rarity: 0, s: {} },
  { id: 's_ikusa', name: 'の戦',      w: 30, rarity: 1, s: { atk: 5 } },
  { id: 's_mamori', name: 'の守り',   w: 30, rarity: 1, s: { def: 5 } },
  { id: 's_kaze', name: 'の風',       w: 26, rarity: 1, s: { spd: 4 } },
  { id: 's_kuzushi', name: 'の崩し',  w: 20, rarity: 2, s: {}, crushBonus: 8 },   // 崩し時ダメージ+8%
  { id: 's_akari', name: 'の灯',      w: 18, rarity: 2, s: {}, akariCut: 10 },   // 灯の消費-10%
  { id: 's_kage', name: 'の影送り',   w: 16, rarity: 2, s: {}, dispatch: 12 },   // 影送りの収穫+12%
  { id: 's_shinogi', name: 'の凌ぎ',  w: 16, rarity: 2, s: {}, resist: 20 },     // 状態異常耐性+20%
  { id: 's_meguri', name: 'の巡り',   w: 12, rarity: 2, s: { hp: -25 }, meguri: 2 }, // 気の巡り+2／HP-25（代償つき）
  { id: 's_hitomi', name: 'の見切り', w: 10, rarity: 3, s: { luk: 10 }, crushBonus: 6 },
  { id: 's_tsuwamono', name: 'の兵',  w: 6,  rarity: 3, s: { atk: 10, hp: 40 } },
  { id: 's_kaeri', name: 'の還り',    w: 3,  rarity: 3, s: { hp: 50, def: 10 }, resist: 25 },
];

export const BASE_BY_ID = Object.fromEntries(BASES.map((b) => [b.id, b]));
export const PREFIX_BY_ID = Object.fromEntries(PREFIXES.map((p) => [p.id, p]));
export const SUFFIX_BY_ID = Object.fromEntries(SUFFIXES.map((s) => [s.id, s]));

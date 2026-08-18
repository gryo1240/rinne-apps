/**
 * 層ボス6体（spec §8-1）
 *
 * 雑魚は生成式で量産するが、**ボスだけは完全に手書き**する。
 * ここが章の山場であり、「作戦の選択が結果を変える」ことを最も強く問う場所。
 *
 * phases: HP割合で構えの傾向と行動が変わる（上から順に判定）
 * protectors: 一緒に出る守護者。生きている間、ボスへのダメージが減る
 * hint: 攻略の方向（UIで敗北時に少しだけ出す）
 */

export const BOSS_ACTS = {
  // 10F 朽ちた門番
  b_monban:   { id: 'b_monban',   name: '門扉打ち', stance: 'gou', power: 165, magic: false },
  b_kamae:    { id: 'b_kamae',    name: '仁王立ち', stance: 'gou', power: 90,  magic: false, selfBuff: { def: 0.5, turns: 2 } },
  // 20F 月喰みの獣
  b_rendan:   { id: 'b_rendan',   name: '三連牙',   stance: 'shitsu', power: 62, magic: false, hits: 3 },
  b_kake:     { id: 'b_kake',     name: '駆け抜け', stance: 'shitsu', power: 95, magic: false, selfBuff: { spd: 0.6, turns: 3 } },
  b_tsukibami:{ id: 'b_tsukibami',name: '月喰み',   stance: 'ju', power: 105, magic: true, ailment: { id: 'kare', rate: 60 } },
  // 30F 石の記憶
  b_iwakudaki:{ id: 'b_iwakudaki',name: '岩砕き',   stance: 'gou', power: 150, magic: false },
  b_ishinami: { id: 'b_ishinami', name: '石波',     stance: 'ju', power: 88, magic: true, target: 'all' },
  b_kioku:    { id: 'b_kioku',    name: '記憶還り', stance: 'shitsu', power: 70, magic: false, hits: 2, selfBuff: { def: 0.3, turns: 2 } },
  // 40F 狐火の巫女
  b_kitsunebi:{ id: 'b_kitsunebi',name: '狐火乱舞', stance: 'ju', power: 92, magic: true, target: 'all', ailment: { id: 'yakedo', rate: 45 } },
  b_noroi:    { id: 'b_noroi',    name: '呪縛',     stance: 'ju', power: 60, magic: true, ailment: { id: 'fu', rate: 55 } },
  b_madowashi:{ id: 'b_madowashi',name: '惑わし',   stance: 'ju', power: 55, magic: true, ailment: { id: 'madoi', rate: 50 } },
  // 50F 無銘の影
  b_utsushi:  { id: 'b_utsushi',  name: '写し斬り', stance: 'gou', power: 155, magic: false },
  b_kagenui:  { id: 'b_kagenui',  name: '影縫い',   stance: 'shitsu', power: 75, magic: false, hits: 2, ailment: { id: 'don', rate: 55 } },
  b_mumeigiri:{ id: 'b_mumeigiri',name: '無銘斬',   stance: 'ju', power: 118, magic: true, ailment: { id: 'moro', rate: 50 } },
  // 60F 還る門
  b_mon1:     { id: 'b_mon1',     name: '門の圧',   stance: 'gou', power: 175, magic: false },
  b_mon2:     { id: 'b_mon2',     name: '無数の目', stance: 'shitsu', power: 68, magic: false, hits: 3 },
  b_mon3:     { id: 'b_mon3',     name: '還りの光', stance: 'ju', power: 112, magic: true, target: 'all' },
  b_mon4:     { id: 'b_mon4',     name: '因果の糸', stance: 'ju', power: 80, magic: true, ailment: { id: 'kare', rate: 65 } },

  // ── 支塔の主（表10F・spec §4-7） ──
  // 鬼哭洞
  s_nakigoe:  { id: 's_nakigoe',  name: '哭き声',   stance: 'gou', power: 72, magic: false, target: 'all' },
  s_onikudaki:{ id: 's_onikudaki',name: '鬼砕き',   stance: 'gou', power: 158, magic: false },
  s_urami:    { id: 's_urami',    name: '恨み節',   stance: 'ju', power: 76, magic: true, ailment: { id: 'moro', rate: 50 } },
  // 疾風廊
  s_kazakiri: { id: 's_kazakiri', name: '風の刃',   stance: 'shitsu', power: 58, magic: false, hits: 3 },
  s_shukuchi: { id: 's_shukuchi', name: '縮地',     stance: 'shitsu', power: 92, magic: false, selfBuff: { spd: 0.5, turns: 3 } },
  s_tsumuji:  { id: 's_tsumuji',  name: '辻風',     stance: 'ju', power: 70, magic: true, target: 'all', ailment: { id: 'don', rate: 45 } },
  // 呪詛淵
  s_noroiuta: { id: 's_noroiuta', name: '呪い唄',   stance: 'ju', power: 74, magic: true, target: 'all' },
  s_fukashizumi:{ id: 's_fukashizumi', name: '深沈み', stance: 'ju', power: 116, magic: true, ailment: { id: 'fu', rate: 50 } },
  s_tsukamu:  { id: 's_tsukamu',  name: '掴み上げ', stance: 'gou', power: 140, magic: false },
  // 朔の窖（2026-08-12）
  s_mayugomori: { id: 's_mayugomori', name: '繭ごもり', stance: 'gou', power: 96, magic: false, selfBuff: { def: 0.45, turns: 2 } },
  s_wakabae:    { id: 's_wakabae',    name: '若映え',   stance: 'shitsu', power: 64, magic: false, hits: 2 },
  s_tsukisodachi: { id: 's_tsukisodachi', name: '月育ち', stance: 'ju', power: 104, magic: true, ailment: { id: 'moro', rate: 45 } },
  // 望の櫓（2026-08-12）
  s_kakeotoshi: { id: 's_kakeotoshi', name: '欠け落とし', stance: 'gou', power: 154, magic: false },
  s_yoiyamibashiri: { id: 's_yoiyamibashiri', name: '宵闇走り', stance: 'shitsu', power: 72, magic: false, hits: 2, ailment: { id: 'don', rate: 40 } },
  s_ariakegiri: { id: 's_ariakegiri', name: '有明霧',   stance: 'ju', power: 82, magic: true, target: 'all', ailment: { id: 'kare', rate: 45 } },
  // 月渡り
  s_tsukiha:  { id: 's_tsukiha',  name: '月刃',     stance: 'gou', power: 148, magic: false },
  s_tsukikage:{ id: 's_tsukikage',name: '月影',     stance: 'shitsu', power: 66, magic: false, hits: 2 },
  s_tsukiakari:{ id: 's_tsukiakari', name: '月あかり', stance: 'ju', power: 98, magic: true, target: 'all' },
};

export const BOSSES = {
  10: {
    id: 'monban', floor: 10, name: '朽ちた門番', mon: '門', color: '#8a7a5a',
    // 2026-08-05: ×0.95（装備を弱くしたぶん、初見が27%まで落ちていた）
    base: { hp: 538, atk: 52, def: 24, spd: 9, mag: 6, luk: 6 },
    stance: [100, 0, 0], acts: ['b_monban', 'b_kamae'],
    hint: '力押ししか使ってこない。【流】で受け流せば崩せる',
    desc: '朽ちた仁王像。眼窩の奥に朱い光',
  },
  20: {
    id: 'kemono', floor: 20, name: '月喰みの獣', mon: '獣', color: '#5a4a6a',
    base: { hp: 752, atk: 50, def: 18, spd: 22, mag: 16, luk: 12 },
    stance: [5, 90, 5], acts: ['b_rendan', 'b_kake'],
    phases: [
      { hpAbove: 0.5, stance: [5, 90, 5], acts: ['b_rendan', 'b_kake'] },
      { hpAbove: 0.0, stance: [0, 75, 25], acts: ['b_rendan', 'b_kake', 'b_tsukibami'] },  // 半分で加速＋気を枯らす
    ],
    hint: '速い。【封】で止めるか、麻痺・鈍を入れて手数を削る',
    desc: '輪郭の定まらない黒い獣。背に三日月の模様',
  },
  30: {
    id: 'ishi', floor: 30, name: '石の記憶', mon: '記', color: '#6a6a5a',
    base: { hp: 644, atk: 40, def: 26, spd: 13, mag: 27, luk: 8 },
    stance: [40, 25, 35], acts: ['b_iwakudaki', 'b_kioku', 'b_ishinami'],
    hint: '毎ターン構えが変わる。予告を見て、そのつど系統を変える必要がある',
    desc: '石動と同じ造形の黒曜石の巨人。周囲に石の破片が浮く',
  },
  40: {
    id: 'miko', floor: 40, name: '狐火の巫女', mon: '巫', color: '#c0554a',
    base: { hp: 700, atk: 16, def: 22, spd: 20, mag: 32, luk: 18 },
    stance: [0, 10, 90], acts: ['b_kitsunebi', 'b_noroi', 'b_madowashi'],
    protectors: [
      { name: '狐火の分身', mon: '火', color: '#e0a05f', hpRate: 0.14, statRate: 0.5, stance: [0, 20, 80], acts: ['ju_bolt', 'ju_curse'] },
      { name: '狐火の分身', mon: '火', color: '#e0a05f', hpRate: 0.14, statRate: 0.5, stance: [0, 20, 80], acts: ['ju_bolt', 'ju_curse'] },
    ],
    protectDR: 0.70,   // 分身が生きている間、本体への与ダメージを70%カット
    hint: '分身が本体を守っている。先に分身を落とさないと本体に通らない',
    desc: '狐の面をつけた白装束。周囲に無数の狐火',
  },
  50: {
    id: 'mumei', floor: 50, name: '無銘の影', mon: '影', color: '#3a3a4a',
    base: { hp: 639, atk: 33, def: 24, spd: 26, mag: 27, luk: 16 },
    stance: [34, 33, 33], acts: ['b_utsushi', 'b_kagenui', 'b_mumeigiri'],
    phases: [
      { hpAbove: 0.6, stance: [60, 20, 20], acts: ['b_utsushi', 'b_kagenui'] },
      { hpAbove: 0.3, stance: [20, 60, 20], acts: ['b_kagenui', 'b_utsushi'] },
      { hpAbove: 0.0, stance: [20, 20, 60], acts: ['b_mumeigiri', 'b_kagenui'] },
    ],
    hint: '3つの構えをすべて使う。偏った編成だと必ずどこかで逆風を踏む',
    desc: '輪郭だけが金色に光る人型。背後に同じ形の影が重なる',
  },
  60: {
    id: 'mon', floor: 60, name: '還る門', mon: '還', color: '#c9a227',
    // 2026-08-05: ×1.10。装備を弱くしたら鍛え直しが増え、60階の到達Lvが33→41に上がった。
    // その結果、最終ボスの初見突破率が86%まで落ちて「素通り」になっていた
    base: { hp: 1043, atk: 29, def: 28, spd: 22, mag: 29, luk: 20 },
    stance: [34, 33, 33], acts: ['b_mon1', 'b_mon2', 'b_mon3'],
    phases: [
      { hpAbove: 0.66, stance: [80, 10, 10], acts: ['b_mon1'] },
      { hpAbove: 0.33, stance: [10, 80, 10], acts: ['b_mon2'] },
      { hpAbove: 0.0,  stance: [10, 10, 80], acts: ['b_mon3', 'b_mon4'] },
    ],
    hint: '形態ごとに構えが偏る。3形態それぞれに合う系統を用意しておくこと',
    desc: '巨大な鳥居。柱に無数の目。向こうは夜ではなく白い光',
  },
};

export const BOSS_FLOORS = Object.keys(BOSSES).map(Number).sort((a, b) => a - b);

/**
 * 支塔の主（表10F・spec §4-7）
 *
 * 【なぜ別テーブルにしたか】`BOSSES` は「階数がキー」で、golden.mjs / boss.mjs /
 * tune_boss.mjs が `BOSS_FLOORS` を直接参照している。`BOSSES` を
 * `{main:{...}, kikoku:{...}}` の2階層に作り替えるとテスト3本を巻き込むので、
 * **既存テーブルには一切触らず**、支塔だけを別テーブルから引く形にした。
 * `makeBossGroup` は `tower` を渡さなければ従来と同じ経路を通る（ゴールデン不変）。
 *
 * 【構えの設計】塔の売りは「その構えばかりが出る」ことだが、
 * **ボスまで単一構えにすると『有効な系統を連打するだけ』になって山場にならない**。
 * そこで半分を切ったところで別の構えを1つ混ぜる。ただし**混ぜたあとも塔の構えが過半数**
 * に留めてあるので、「有効系統を積んだ編成が有利」という塔の設計意図は壊れない。
 *
 * 【月渡りだけ例外】仕様では月齢で構えが入れ替わるが、v1.0では**雑魚だけ月齢連動**にし、
 * ボスは3構えの固定ローテにしてある。ボスの構えに実時間が混ざると、
 * ゴールデンログもボスの突破率計測も「測った日によって変わる」ものになるため。
 */
export const SIDE_BOSSES = {
  kikoku: {
    10: {
      id: 's_nakioni', floor: 10, name: '哭き鬼', mon: '哭', color: '#8a5a4a',
      base: { hp: 480, atk: 34, def: 26, spd: 12, mag: 6, luk: 8 },
      stance: [100, 0, 0], acts: ['s_onikudaki', 's_nakigoe'],
      phases: [
        { hpAbove: 0.5, stance: [100, 0, 0], acts: ['s_onikudaki', 's_nakigoe'] },
        { hpAbove: 0.0, stance: [70, 0, 30], acts: ['s_onikudaki', 's_nakigoe', 's_urami'] },
      ],
      hint: '基本は【剛】。半分を切ると恨み節（呪）を混ぜてくる',
      desc: '洞の奥で泣き続けている巨鬼。涙が石になって落ちている',
    },
  },
  shippu: {
    10: {
      id: 's_kazakiri', floor: 10, name: '風切', mon: '風', color: '#9fc8d8',
      base: { hp: 518, atk: 35, def: 18, spd: 32, mag: 11, luk: 22 },
      stance: [0, 100, 0], acts: ['s_kazakiri', 's_shukuchi'],
      phases: [
        { hpAbove: 0.5, stance: [0, 100, 0], acts: ['s_kazakiri', 's_shukuchi'] },
        { hpAbove: 0.0, stance: [0, 70, 30], acts: ['s_kazakiri', 's_shukuchi', 's_tsumuji'] },
      ],
      hint: '基本は【疾】。速さを自分で上げてくるので、封じるか鈍らせる',
      desc: '廊下を吹き抜けていく鎌。姿はほとんど見えない',
    },
  },
  jyuso: {
    10: {
      id: 's_fuchinokuchi', floor: 10, name: '淵の口', mon: '淵', color: '#5a4a7a',
      base: { hp: 696, atk: 23, def: 22, spd: 20, mag: 36, luk: 16 },
      stance: [0, 0, 100], acts: ['s_fukashizumi', 's_noroiuta'],
      phases: [
        { hpAbove: 0.5, stance: [0, 0, 100], acts: ['s_fukashizumi', 's_noroiuta'] },
        { hpAbove: 0.0, stance: [30, 0, 70], acts: ['s_fukashizumi', 's_noroiuta', 's_tsukamu'] },
      ],
      hint: '基本は【呪】。半分を切ると掴み上げ（剛）で殴ってくる',
      desc: '水面に開いた大きな口。覗き込むと自分の顔が沈んでいる',
    },
  },
  /**
   * 朔の窖・望の櫓の主（2026-08-12）。
   * ★どちらも構えを固定しない塔なので、主も三つの構えを持たせる。
   *   ただし**段取りは読める**ようにしてある（写し身だけが段取りを失う・run.js の duplicateOf）。
   */
  sakugura: {
    10: {
      id: 's_sodachimayu', floor: 10, name: '育ちの繭', mon: '繭', color: '#b8a878',
      base: { hp: 640, atk: 33, def: 23, spd: 17, mag: 22, luk: 13 },
      stance: [60, 20, 20], acts: ['s_mayugomori', 's_wakabae'],
      phases: [
        { hpAbove: 0.5, stance: [60, 20, 20], acts: ['s_mayugomori', 's_wakabae'] },
        { hpAbove: 0.0, stance: [20, 30, 50], acts: ['s_wakabae', 's_tsukisodachi'] },
      ],
      hint: '前半は固く守る。半分を切ると殻を破って呪へ変わる',
      desc: '窖の底で膨らみ続けている繭。夜ごとに一回り大きくなる',
    },
  },
  mochiyagura: {
    10: {
      id: 's_kakenokami', floor: 10, name: '欠けの守', mon: '欠', color: '#8a8aa0',
      base: { hp: 712, atk: 39, def: 25, spd: 23, mag: 25, luk: 16 },
      stance: [45, 30, 25], acts: ['s_kakeotoshi', 's_yoiyamibashiri'],
      phases: [
        { hpAbove: 0.6, stance: [70, 30, 0], acts: ['s_kakeotoshi', 's_yoiyamibashiri'] },
        { hpAbove: 0.25, stance: [20, 40, 40], acts: ['s_yoiyamibashiri', 's_ariakegiri'] },
        { hpAbove: 0.0, stance: [10, 10, 80], acts: ['s_ariakegiri', 's_kakeotoshi'] },
      ],
      hint: '削るほど呪へ寄っていく。長引くと気を枯らされる',
      desc: '櫓の上で月を数えている影。数えるたびに、自分の一部が欠けていく',
    },
  },
  tsukiwatari: {
    10: {
      id: 's_wataritsuki', floor: 10, name: '渡り月', mon: '渡', color: '#c9c0e0',
      base: { hp: 689, atk: 37, def: 24, spd: 22, mag: 24, luk: 16 },
      stance: [34, 33, 33], acts: ['s_tsukiha', 's_tsukikage', 's_tsukiakari'],
      phases: [
        { hpAbove: 0.66, stance: [80, 10, 10], acts: ['s_tsukiha'] },
        { hpAbove: 0.33, stance: [10, 80, 10], acts: ['s_tsukikage'] },
        { hpAbove: 0.0,  stance: [10, 10, 80], acts: ['s_tsukiakari'] },
      ],
      hint: '3つの構えを順に使う。偏った編成だと必ずどこかで逆風を踏む',
      desc: '空に浮かぶもう一つの月。近づくと欠けていく',
    },
  },
};

/** その塔・その階のボス定義（無ければ null） */
export function bossDefOf(tower, floor) {
  return (tower === 'main' ? BOSSES[floor] : SIDE_BOSSES[tower]?.[floor]) || null;
}

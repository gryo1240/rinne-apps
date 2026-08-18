/**
 * 怪異（選択肢イベント・spec §4-4）
 *
 * テキスト＋2〜3択のミニイベント。**結果は確率的**にする。
 * 毎回同じだと2周目から単なる作業になり、「選ぶ」意味が消えるため。
 *
 * ここは純データ。ロジックを書かない（解決は src/dungeon/events.js）。
 *
 * ── 効果の書き方 ──────────────────────────────────────────
 * type      内容
 * stat      その潜行のあいだ、パーティ全員の能力が上下する {key, value}
 *           （戦闘ユニットは1潜行のあいだ使い回されるので、直接足せば持続する）
 * hp        最大HPに対する割合で回復／消耗 {pct}   例 {pct:0.3} = 3割回復
 * ki        気の増減 {value}
 * akari     灯の増減 {value}
 * zeni      銭の増減 {value}（マイナスは所持ぶんを超えない）
 * karma     因果の増減 {value}
 * mat       素材 {id, value}
 * equip     装備を拾う {count}
 * fuda      還り札 {value}
 * ailment   パーティ1人が状態異常になる {id}
 * cure      状態異常をすべて治す
 * reveal    この階の未踏ノードの種別がすべて見える
 *
 * ── 選択肢の cost ────────────────────────────────────────
 * cost: { zeni, akari, hp } を満たさないと選べない（UIがグレーアウトする）
 */

export const EVENTS = [
  // ── 塔の遺物・落とし物 ──────────────────────────────
  {
    id: 'ev_waraji', floors: [1, 60],
    text: '石段に、履き潰した草鞋が揃えて置かれている。まだ温かい。',
    choices: [
      {
        label: '履いてみる',
        outcomes: [
          { w: 75, text: '足が軽くなった。まだ誰かが歩いているような気がする。', effects: [{ type: 'stat', key: 'spd', value: 4 }] },
          { w: 25, text: '足元が急にぐらついた。誰かの疲れが移ったらしい。', effects: [{ type: 'ailment', id: 'don' }] },
        ],
      },
      { label: 'そのままにする', outcomes: [{ w: 100, text: 'またいで先へ進んだ。', effects: [] }] },
      {
        label: '供養する', cost: { zeni: 100 },
        outcomes: [{ w: 100, text: '手を合わせると、草鞋はほどけて灰になった。', effects: [{ type: 'karma', value: 30 }] }],
      },
    ],
  },
  {
    id: 'ev_kagami', floors: [1, 60],
    text: '割れた鏡が壁に立てかけてある。映っているのは、いまのあなたより少しだけ疲れた顔だ。',
    choices: [
      {
        label: 'のぞき込む',
        outcomes: [
          { w: 55, text: '鏡の中の自分が先に目をそらした。何かを見切った気がする。', effects: [{ type: 'stat', key: 'luk', value: 5 }] },
          { w: 45, text: '目が合った瞬間、鏡がひび割れた。', effects: [{ type: 'hp', pct: -0.10 }] },
        ],
      },
      { label: '布をかける', outcomes: [{ w: 100, text: '鏡を伏せた。背中が少し軽くなった。', effects: [{ type: 'ki', value: 8 }] }] },
    ],
  },
  {
    id: 'ev_fumi', floors: [1, 60],
    text: '床に文が落ちている。宛名の部分だけが、丁寧に破り取られている。',
    choices: [
      {
        label: '読む',
        outcomes: [
          { w: 60, text: '「上で待つ」とだけ書いてある。誰の字かは分からない。', effects: [{ type: 'reveal' }] },
          { w: 40, text: '文字が滲んで読めない。指先だけが冷たくなった。', effects: [{ type: 'akari', value: -8 }] },
        ],
      },
      { label: '懐にしまう', outcomes: [{ w: 100, text: 'いつか宛名が分かる日が来るかもしれない。', effects: [{ type: 'karma', value: 15 }] }] },
    ],
  },
  {
    id: 'ev_kanzashi', floors: [2, 60],
    text: '簪（かんざし）が一本、階段の隅に刺さっている。',
    choices: [
      {
        label: '抜く',
        outcomes: [
          { w: 50, text: '見た目より重い。売れば銭になりそうだ。', effects: [{ type: 'zeni', value: 240 }] },
          { w: 30, text: '抜いた途端、階段がわずかに軋んだ。', effects: [{ type: 'akari', value: -12 }] },
          { w: 20, text: '簪の下から、古い装備が出てきた。', effects: [{ type: 'equip', count: 1 }] },
        ],
      },
      { label: '触らない', outcomes: [{ w: 100, text: '刺さったままにしておいた。', effects: [] }] },
    ],
  },

  // ── 灯・明かり ────────────────────────────────────
  {
    id: 'ev_toboshibi', floors: [1, 60],
    text: '誰も灯していないはずの燭台に、火がともっている。',
    choices: [
      {
        label: '灯を分けてもらう',
        outcomes: [
          { w: 70, text: '火はおとなしく移った。灯が満ちる。', effects: [{ type: 'akari', value: 30 }] },
          { w: 30, text: '火は移った。が、こちらの灯も少し吸われた気がする。', effects: [{ type: 'akari', value: 12 }] },
        ],
      },
      {
        label: '吹き消す',
        outcomes: [
          { w: 100, text: '消した瞬間、遠くで戸が閉まる音がした。', effects: [{ type: 'karma', value: 20 }, { type: 'akari', value: -5 }] },
        ],
      },
    ],
  },
  {
    id: 'ev_kagenobi', floors: [8, 60],
    text: '自分の影だけが、灯とは逆の方向へ伸びている。',
    choices: [
      {
        label: '影を追う',
        outcomes: [
          { w: 45, text: '影は隠し戸の前で消えた。中に何かある。', effects: [{ type: 'equip', count: 1 }, { type: 'zeni', value: 150 }] },
          { w: 55, text: '追ううちに灯を使い果たしかけた。', effects: [{ type: 'akari', value: -20 }] },
        ],
      },
      { label: '見なかったことにする', outcomes: [{ w: 100, text: '影は元の向きに戻っていた。', effects: [] }] },
    ],
  },
  {
    id: 'ev_abura', floors: [2, 60],
    text: '油壺がいくつも並んでいる。どれも半分だけ減っている。',
    choices: [
      {
        label: '一つ持っていく',
        outcomes: [
          { w: 80, text: '中身はまだ使える。', effects: [{ type: 'akari', value: 22 }] },
          { w: 20, text: '持ち上げた壺は空だった。底に穴が空いている。', effects: [] },
        ],
      },
      {
        label: 'すべて満たしてやる', cost: { akari: 25 },
        outcomes: [{ w: 100, text: '壺が順に灯った。道の先までよく見える。', effects: [{ type: 'reveal' }, { type: 'karma', value: 25 }] }],
      },
    ],
  },

  // ── 水・井戸 ──────────────────────────────────────
  {
    id: 'ev_ido', floors: [1, 60],
    text: '塔の中に、井戸がある。のぞくと月が映っている。今夜の月と、形が違う。',
    choices: [
      {
        label: '水を飲む',
        outcomes: [
          { w: 60, text: '冷たい。体の芯が戻ってきた。', effects: [{ type: 'hp', pct: 0.35 }] },
          { w: 40, text: '飲んだ水が妙に重い。', effects: [{ type: 'ailment', id: 'don' }, { type: 'hp', pct: 0.15 }] },
        ],
      },
      {
        label: '銭を投げる', cost: { zeni: 50 },
        outcomes: [
          { w: 70, text: '波紋が消えると、井戸の底が明るくなった。', effects: [{ type: 'karma', value: 40 }] },
          { w: 30, text: '音がしない。底がないのかもしれない。', effects: [{ type: 'karma', value: 15 }] },
        ],
      },
      { label: '離れる', outcomes: [{ w: 100, text: '井戸を回り込んで先へ進んだ。', effects: [] }] },
    ],
  },
  {
    id: 'ev_amamori', floors: [6, 60],
    text: '天井から水が落ちている。塔の外は晴れているはずだ。',
    choices: [
      {
        label: '手で受ける',
        outcomes: [
          { w: 65, text: '雨の匂いがした。傷が少し塞がる。', effects: [{ type: 'hp', pct: 0.20 }, { type: 'cure' }] },
          { w: 35, text: '水は生ぬるく、鉄の味がした。', effects: [{ type: 'hp', pct: -0.08 }] },
        ],
      },
      { label: '避けて通る', outcomes: [{ w: 100, text: '濡れずに済んだ。', effects: [] }] },
    ],
  },

  // ── 人ならざるもの ────────────────────────────────
  {
    id: 'ev_kodomo', floors: [1, 40],
    text: '子どもの声で「かくれんぼ、まだ終わってないよ」と聞こえた。姿は見えない。',
    choices: [
      {
        label: '探してやる', cost: { akari: 15 },
        outcomes: [
          { w: 60, text: '柱の陰で見つけた。礼だと言って何かを握らせてきた。', effects: [{ type: 'equip', count: 1 }, { type: 'karma', value: 20 }] },
          { w: 40, text: '見つからない。声だけが遠ざかっていった。', effects: [{ type: 'karma', value: 10 }] },
        ],
      },
      {
        label: '「見つけた」と言ってみる',
        outcomes: [
          { w: 50, text: '笑い声がして、それきり静かになった。', effects: [{ type: 'stat', key: 'luk', value: 4 }] },
          { w: 50, text: '「うそつき」と耳元で言われた。', effects: [{ type: 'ailment', id: 'madoi' }] },
        ],
      },
      { label: '答えない', outcomes: [{ w: 100, text: '声はしばらくして止んだ。', effects: [] }] },
    ],
  },
  {
    id: 'ev_ryojin', floors: [10, 60],
    text: '旅装の男が壁にもたれて座っている。「先に行くのか」と、目も合わせずに言った。',
    choices: [
      {
        label: '話を聞く',
        outcomes: [
          { w: 70, text: '男はこの階の造りを教えてくれた。', effects: [{ type: 'reveal' }] },
          { w: 30, text: '「忘れた」と言われた。実際、忘れているようだった。', effects: [] },
        ],
      },
      {
        label: '水を分ける', cost: { hp: 0.10 },
        outcomes: [{ w: 100, text: '男は初めて顔を上げ、自分の護符をよこした。', effects: [{ type: 'equip', count: 1 }, { type: 'karma', value: 35 }] }],
      },
      { label: '会釈して通り過ぎる', outcomes: [{ w: 100, text: '振り返ると、誰もいなかった。', effects: [] }] },
    ],
  },
  {
    id: 'ev_zatou', floors: [12, 60],
    text: '目を閉じたまま琵琶を弾く者がいる。曲は途中で止まったままだ。',
    choices: [
      {
        label: '続きを待つ',
        outcomes: [
          { w: 55, text: '最後まで聴いた。息が整い、気が満ちる。', effects: [{ type: 'ki', value: 20 }, { type: 'stat', key: 'mag', value: 4 }] },
          { w: 45, text: '曲は終わらなかった。ずいぶん時間を使った。', effects: [{ type: 'akari', value: -14 }] },
        ],
      },
      {
        label: '銭を置く', cost: { zeni: 120 },
        outcomes: [{ w: 100, text: '弾き手は頷き、曲を最後まで弾いた。', effects: [{ type: 'hp', pct: 0.4 }, { type: 'cure' }, { type: 'karma', value: 25 }] }],
      },
    ],
  },
  {
    id: 'ev_onna', floors: [15, 60],
    text: '白い着物の女が、こちらに背を向けて立っている。「どちらから登ってきました」と訊かれた。',
    choices: [
      {
        label: '正直に答える',
        outcomes: [
          { w: 60, text: '女は「そう」とだけ言って消えた。道が少し明るくなった。', effects: [{ type: 'akari', value: 18 }] },
          { w: 40, text: '振り返った顔に、目がなかった。', effects: [{ type: 'ailment', id: 'kon' }] },
        ],
      },
      {
        label: '嘘をつく',
        outcomes: [
          { w: 50, text: '女は笑って、逆の道を教えてくれた。それが正しかった。', effects: [{ type: 'reveal' }, { type: 'stat', key: 'luk', value: 5 }] },
          { w: 50, text: '「嘘は、ここでは重くなります」', effects: [{ type: 'ailment', id: 'moro' }] },
        ],
      },
      { label: '黙って通り過ぎる', outcomes: [{ w: 100, text: '何も起こらなかった。', effects: [] }] },
    ],
  },

  // ── 塔そのもの ────────────────────────────────────
  {
    id: 'ev_kaidan_gyaku', floors: [5, 60],
    text: '上りのはずの階段が、途中から下りになっている。',
    choices: [
      {
        label: 'かまわず進む',
        outcomes: [
          { w: 55, text: '気づけば元の高さに戻っていた。損はしていない。', effects: [] },
          { w: 45, text: 'ずいぶん降りてしまった。登り直しだ。', effects: [{ type: 'akari', value: -18 }] },
        ],
      },
      {
        label: '壁づたいに登る', cost: { hp: 0.08 },
        outcomes: [{ w: 100, text: '手が擦り切れたが、階段を使わずに済んだ。', effects: [{ type: 'stat', key: 'atk', value: 3 }] }],
      },
    ],
  },
  {
    id: 'ev_kabe_ji', floors: [4, 60],
    text: '壁一面に、同じ字が彫られている。「還」。',
    choices: [
      {
        label: 'なぞってみる',
        outcomes: [
          { w: 50, text: '指先が熱い。帰り道が身体に入った気がする。', effects: [{ type: 'fuda', value: 1 }] },
          { w: 50, text: 'なぞった指の跡が、消えずに残った。', effects: [{ type: 'karma', value: 20 }] },
        ],
      },
      {
        label: '一字だけ削る',
        outcomes: [
          { w: 40, text: '壁の裏に空洞があった。', effects: [{ type: 'equip', count: 1 }] },
          { w: 60, text: '削った端から、字がまた浮かび上がってきた。', effects: [{ type: 'akari', value: -10 }] },
        ],
      },
      { label: '見上げるだけにする', outcomes: [{ w: 100, text: '数え切れないほどあった。', effects: [] }] },
    ],
  },
  {
    id: 'ev_tsuki_mado', floors: [7, 60],
    text: '窓がある。外に月が出ている ―― 塔の中にいるはずなのに。',
    choices: [
      {
        label: '月を見る',
        outcomes: [
          { w: 70, text: '月の光を浴びた。気が澄んでいく。', effects: [{ type: 'ki', value: 25 }, { type: 'stat', key: 'mag', value: 3 }] },
          { w: 30, text: '見ているうちに、月の方が近づいてきた気がした。', effects: [{ type: 'ailment', id: 'madoi' }] },
        ],
      },
      {
        label: '窓を開ける',
        outcomes: [
          { w: 45, text: '風が入って灯が揺れ、そして強くなった。', effects: [{ type: 'akari', value: 25 }] },
          { w: 55, text: '風で灯が消えかけた。', effects: [{ type: 'akari', value: -18 }] },
        ],
      },
      { label: '閉めて先へ行く', outcomes: [{ w: 100, text: '窓の外は、ただの壁だった。', effects: [] }] },
    ],
  },
  {
    id: 'ev_onaji_heya', floors: [9, 60],
    text: 'さっき通ったのと寸分違わぬ部屋に出た。床の傷まで同じだ。',
    choices: [
      {
        label: '印を付けてもう一周する', cost: { akari: 12 },
        outcomes: [
          { w: 65, text: '二周目、印は付いていなかった。別の部屋だったらしい。道が分かった。', effects: [{ type: 'reveal' }] },
          { w: 35, text: '印は付いていた。同じ部屋を回っていた。', effects: [{ type: 'akari', value: -10 }] },
        ],
      },
      { label: '気にせず進む', outcomes: [{ w: 100, text: '次の部屋は違う造りだった。', effects: [] }] },
    ],
  },

  // ── 祠・供物 ──────────────────────────────────────
  {
    id: 'ev_kuyo', floors: [1, 60],
    text: '小さな石仏に、真新しい供物が置かれている。誰かが最近ここまで来ている。',
    choices: [
      {
        label: '供物を足す', cost: { zeni: 150 },
        outcomes: [{ w: 100, text: '手を合わせた。身体の重さが抜けていく。', effects: [{ type: 'hp', pct: 0.5 }, { type: 'cure' }, { type: 'karma', value: 30 }] }],
      },
      {
        label: '供物をもらう',
        outcomes: [
          { w: 55, text: '腹が満ちた。少しだけ後ろめたい。', effects: [{ type: 'hp', pct: 0.3 }, { type: 'karma', value: -10 }] },
          { w: 45, text: '口に入れた途端、砂の味がした。', effects: [{ type: 'ailment', id: 'doku' }] },
        ],
      },
      { label: '手を合わせるだけ', outcomes: [{ w: 100, text: '静かに一礼して通り過ぎた。', effects: [{ type: 'karma', value: 10 }] }] },
    ],
  },
  {
    id: 'ev_kane', floors: [8, 60],
    text: '天井から鐘が吊るされている。撞木（しゅもく）は、ちょうど手の届く高さにある。',
    choices: [
      {
        label: '一度だけ撞く',
        outcomes: [
          { w: 60, text: '澄んだ音が階じゅうに響いた。気が満ちる。', effects: [{ type: 'ki', value: 30 }] },
          { w: 40, text: '音を聞きつけて、何かがこちらに向かってきた。', effects: [{ type: 'akari', value: -15 }, { type: 'stat', key: 'spd', value: 3 }] },
        ],
      },
      { label: '触らない', outcomes: [{ w: 100, text: '鐘は静かなままだった。', effects: [] }] },
    ],
  },
  {
    id: 'ev_hokora_kowareta', floors: [10, 60],
    text: '祠が壊されている。中身は空だ。',
    choices: [
      {
        label: '直す', cost: { zeni: 200 },
        outcomes: [{ w: 100, text: '石を積み直した。祠の中がぼんやりと灯った。', effects: [{ type: 'akari', value: 25 }, { type: 'karma', value: 45 }] }],
      },
      {
        label: '瓦礫を調べる',
        outcomes: [
          { w: 55, text: '床下に隠されていたものを見つけた。', effects: [{ type: 'equip', count: 1 }] },
          { w: 45, text: '何も出てこない。手を切っただけだった。', effects: [{ type: 'hp', pct: -0.06 }] },
        ],
      },
      { label: 'そのままにする', outcomes: [{ w: 100, text: '見なかったことにした。', effects: [] }] },
    ],
  },

  // ── 商い・取引 ────────────────────────────────────
  {
    id: 'ev_kotori', floors: [6, 60],
    text: '籠に入った鳥が「かって」「かって」と鳴いている。売り手はいない。',
    choices: [
      {
        label: '籠ごと銭を置いていく', cost: { zeni: 200 },
        outcomes: [
          { w: 60, text: '鳥は先へ飛び、道を教えるように鳴いた。', effects: [{ type: 'reveal' }, { type: 'karma', value: 20 }] },
          { w: 40, text: '鳥は「まいど」と言って消えた。籠に装備が残っていた。', effects: [{ type: 'equip', count: 1 }] },
        ],
      },
      {
        label: '逃がしてやる',
        outcomes: [{ w: 100, text: '鳥は一度だけ振り返って、暗がりへ消えた。', effects: [{ type: 'karma', value: 30 }, { type: 'stat', key: 'luk', value: 3 }] }],
      },
      { label: '放っておく', outcomes: [{ w: 100, text: '鳴き声はしばらく続いていた。', effects: [] }] },
    ],
  },
  {
    id: 'ev_kokan', floors: [12, 60],
    text: '石の台に「置いたものと同じだけ返す」と彫ってある。',
    choices: [
      {
        label: '銭を置く', cost: { zeni: 300 },
        outcomes: [
          { w: 45, text: '倍になって返ってきた。', effects: [{ type: 'zeni', value: 600 }] },
          { w: 35, text: '同じ額が返ってきた。何も変わらない。', effects: [{ type: 'zeni', value: 300 }] },
          { w: 20, text: '返ってきたのは銭ではなく、これだった。', effects: [{ type: 'equip', count: 1 }] },
        ],
      },
      {
        label: '灯を置く', cost: { akari: 20 },
        outcomes: [
          { w: 60, text: '灯が倍になって戻った。', effects: [{ type: 'akari', value: 40 }] },
          { w: 40, text: '戻ってきたのは、暖かさだけだった。', effects: [{ type: 'hp', pct: 0.25 }] },
        ],
      },
      { label: '何も置かない', outcomes: [{ w: 100, text: '台は何も言わなかった。', effects: [] }] },
    ],
  },

  // ── 危険 ──────────────────────────────────────────
  {
    id: 'ev_yuka_nuke', floors: [5, 60],
    text: '床板の一部が、明らかに新しい。',
    choices: [
      {
        label: '踏んでみる',
        outcomes: [
          { w: 45, text: '床が抜けて下の階へ落ちた。登り直しだ。', effects: [{ type: 'akari', value: -22 }, { type: 'hp', pct: -0.12 }] },
          { w: 55, text: '床下に隠し戸があった。', effects: [{ type: 'zeni', value: 300 }, { type: 'equip', count: 1 }] },
        ],
      },
      { label: '迂回する', cost: { akari: 8 }, outcomes: [{ w: 100, text: '遠回りしたが、安全に抜けられた。', effects: [] }] },
    ],
  },
  {
    id: 'ev_kemuri', floors: [14, 60],
    text: '甘い匂いの煙が、通路の先から流れてくる。',
    choices: [
      {
        label: '進む',
        outcomes: [
          { w: 50, text: '香の間だった。息を整えられた。', effects: [{ type: 'hp', pct: 0.3 }, { type: 'ki', value: 15 }] },
          { w: 50, text: '頭が重くなってきた。', effects: [{ type: 'ailment', id: 'kon' }] },
        ],
      },
      {
        label: '袖で口を覆って進む', cost: { hp: 0.05 },
        outcomes: [{ w: 100, text: '息苦しかったが、何も起きなかった。', effects: [] }] },
    ],
  },
  {
    id: 'ev_ito', floors: [18, 60],
    text: '通路一面に細い糸が張られている。切れば通れるが、糸の主が近くにいるかもしれない。',
    choices: [
      {
        label: '切って進む',
        outcomes: [
          { w: 55, text: '何も出てこなかった。糸には何かが絡まっている。', effects: [{ type: 'equip', count: 1 }] },
          { w: 45, text: '糸が身体に絡みついた。', effects: [{ type: 'ailment', id: 'don' }, { type: 'hp', pct: -0.08 }] },
        ],
      },
      {
        label: 'くぐって進む', cost: { akari: 10 },
        outcomes: [{ w: 100, text: '時間はかかったが、糸を一本も切らずに抜けた。', effects: [{ type: 'stat', key: 'spd', value: 3 }] }],
      },
    ],
  },
  {
    id: 'ev_koe_yobu', floors: [20, 60],
    text: '仲間のひとりの声で、通路の奥から名を呼ばれた。全員、ここにいる。',
    choices: [
      {
        label: '返事をする',
        outcomes: [
          { w: 40, text: '声は「よかった」と言って止んだ。', effects: [{ type: 'karma', value: 20 }] },
          { w: 60, text: '呼び声が増えた。何人もの声が、同じ名を呼んでいる。', effects: [{ type: 'ailment', id: 'madoi' }, { type: 'akari', value: -12 }] },
        ],
      },
      {
        label: '無視して進む',
        outcomes: [{ w: 100, text: '声は途中で止まった。誰も振り返らなかった。', effects: [{ type: 'stat', key: 'def', value: 3 }] }],
      },
    ],
  },

  // ── 恵み ──────────────────────────────────────────
  {
    id: 'ev_ki_no_ma', floors: [1, 60],
    text: '風の抜ける小部屋に出た。塔の中で、ここだけ空気が違う。',
    choices: [
      { label: 'ひと息つく', outcomes: [{ w: 100, text: '呼吸が整った。', effects: [{ type: 'hp', pct: 0.25 }, { type: 'ki', value: 15 }] }] },
      {
        label: 'すぐ先へ進む',
        outcomes: [{ w: 100, text: '休まずに進んだぶん、灯を使わずに済んだ。', effects: [{ type: 'akari', value: 10 }] }],
      },
    ],
  },
  {
    id: 'ev_wasuremono', floors: [1, 60],
    text: '真新しい荷物が置き去りにされている。持ち主が戻ってくる気配はない。',
    choices: [
      {
        label: '開ける',
        outcomes: [
          { w: 60, text: '旅の支度が一式そろっていた。', effects: [{ type: 'equip', count: 1 }, { type: 'zeni', value: 180 }] },
          { w: 40, text: '中は空だった。持ち主が持って出たらしい。', effects: [] },
        ],
      },
      {
        label: '目印を置いて残す',
        outcomes: [{ w: 100, text: 'いつか取りに来るかもしれない。', effects: [{ type: 'karma', value: 35 }] }],
      },
    ],
  },
  {
    id: 'ev_kajiba', floors: [16, 60],
    text: '打ち捨てられた鍛冶場がある。炉はまだ温かい。',
    choices: [
      {
        label: '火を熾す', cost: { akari: 15 },
        outcomes: [
          { w: 70, text: '鍛冶石がいくつも見つかった。', effects: [{ type: 'mat', id: 'enhance_stone', value: 4 }] },
          { w: 30, text: '炉は崩れたが、道具箱が出てきた。', effects: [{ type: 'equip', count: 1 }] },
        ],
      },
      {
        label: '道具を漁る',
        outcomes: [
          { w: 60, text: '使えそうな石を拾った。', effects: [{ type: 'mat', id: 'enhance_stone', value: 2 }] },
          { w: 40, text: '錆びた鉄くずばかりだった。', effects: [{ type: 'zeni', value: 60 }] },
        ],
      },
    ],
  },
  {
    id: 'ev_yakusou', floors: [1, 60],
    text: '石の隙間から、見たことのない草が生えている。',
    choices: [
      {
        label: '摘む',
        outcomes: [
          { w: 65, text: '錬気に使えそうな草だった。', effects: [{ type: 'mat', id: 'renki_mat', value: 3 }] },
          { w: 35, text: '触ると手が痺れた。', effects: [{ type: 'ailment', id: 'mahi' }] },
        ],
      },
      {
        label: '食べてみる',
        outcomes: [
          { w: 50, text: '苦い。だが力が湧いてきた。', effects: [{ type: 'stat', key: 'atk', value: 4 }, { type: 'hp', pct: 0.15 }] },
          { w: 50, text: '喉が焼ける。', effects: [{ type: 'ailment', id: 'doku' }, { type: 'hp', pct: -0.1 }] },
        ],
      },
      { label: 'そっとしておく', outcomes: [{ w: 100, text: '草はまだそこにある。', effects: [] }] },
    ],
  },

  // ── 因果・輪廻 ────────────────────────────────────
  {
    id: 'ev_jibun', floors: [25, 60],
    text: '倒れている者がいる。装備も、背格好も、あなたたちとまったく同じだ。',
    choices: [
      {
        label: '確かめる',
        outcomes: [
          { w: 50, text: '顔を見た。知らない顔だった。少しだけ安心した。', effects: [{ type: 'karma', value: 50 }] },
          { w: 50, text: '顔を見た。それ以上は思い出せない。', effects: [{ type: 'ailment', id: 'madoi' }, { type: 'karma', value: 30 }] },
        ],
      },
      {
        label: '装備をもらう',
        outcomes: [{ w: 100, text: '手に取ると、装備だけが残って本人は消えた。', effects: [{ type: 'equip', count: 2 }, { type: 'karma', value: -20 }] }],
      },
      {
        label: '弔う', cost: { zeni: 250 },
        outcomes: [{ w: 100, text: '手を合わせると、身体は灯になってほどけていった。', effects: [{ type: 'karma', value: 90 }, { type: 'hp', pct: 0.3 }] }],
      },
    ],
  },
  {
    id: 'ev_kagami_ike', floors: [22, 60],
    text: '床一面が水鏡になっている。映っているのは、この階ではない景色だ。',
    choices: [
      {
        label: '踏み込む',
        outcomes: [
          { w: 45, text: '一瞬で別の場所に出た。道が短くなった。', effects: [{ type: 'akari', value: 30 }, { type: 'reveal' }] },
          { w: 55, text: '足首まで沈んだだけだった。冷たい。', effects: [{ type: 'hp', pct: -0.08 }] },
        ],
      },
      { label: '端を回って進む', outcomes: [{ w: 100, text: '水鏡は最後まで波立たなかった。', effects: [] }] },
    ],
  },
  {
    id: 'ev_meguri', floors: [30, 60],
    text: '「二度目ですね」と、誰もいない方向から声がした。',
    choices: [
      {
        label: '「初めてだ」と答える',
        outcomes: [
          { w: 55, text: '「そうですか」。声は納得したようだった。', effects: [{ type: 'karma', value: 40 }] },
          { w: 45, text: '「では、これも初めてですね」。何かが軽くなった気がする。', effects: [{ type: 'stat', key: 'luk', value: 6 }] },
        ],
      },
      {
        label: '黙って頷く',
        outcomes: [{ w: 100, text: '声は満足したように途切れ、還り札が足元に落ちていた。', effects: [{ type: 'fuda', value: 1 }, { type: 'karma', value: 30 }] }],
      },
    ],
  },

  // ── 深層向け ──────────────────────────────────────
  {
    id: 'ev_mumei_hi', floors: [35, 60],
    text: '名前の彫られていない墓標が、数えきれないほど並んでいる。',
    choices: [
      {
        label: '一つずつ数える', cost: { akari: 20 },
        outcomes: [{ w: 100, text: '数え終える頃には、道の造りが頭に入っていた。', effects: [{ type: 'reveal' }, { type: 'karma', value: 60 }] }],
      },
      {
        label: '自分の名を彫る',
        outcomes: [
          { w: 50, text: '彫った端から消えていった。', effects: [{ type: 'karma', value: 40 }] },
          { w: 50, text: '名は残った。背筋が冷たくなった。', effects: [{ type: 'stat', key: 'def', value: 6 }, { type: 'ailment', id: 'moro' }] },
        ],
      },
      { label: '通り過ぎる', outcomes: [{ w: 100, text: '足音だけが響いた。', effects: [] }] },
    ],
  },
  {
    id: 'ev_tobira', floors: [28, 60],
    text: '鍵のかかった扉がある。鍵穴は、ちょうど還り札と同じ形をしている。',
    choices: [
      {
        label: '還り札を使う', cost: { fuda: 1 },
        outcomes: [
          { w: 70, text: '扉の奥は宝物庫だった。', effects: [{ type: 'equip', count: 2 }, { type: 'zeni', value: 500 }] },
          { w: 30, text: '扉の奥は、また同じ扉だった。', effects: [{ type: 'zeni', value: 200 }] },
        ],
      },
      { label: '諦める', outcomes: [{ w: 100, text: '扉は開かなかった。', effects: [] }] },
    ],
  },
  {
    id: 'ev_kaze_koe', floors: [24, 60],
    text: '風が言葉のように鳴っている。「もどれ」と聞こえた気がする。',
    choices: [
      {
        label: '聞き流す',
        outcomes: [{ w: 100, text: '風はやがて、ただの風になった。', effects: [{ type: 'stat', key: 'def', value: 4 }] }],
      },
      {
        label: '耳を澄ます', cost: { akari: 10 },
        outcomes: [
          { w: 60, text: '「もどれ」ではなく「もどせ」だった。何かを返すべきらしい。', effects: [{ type: 'karma', value: 45 }] },
          { w: 40, text: '長く聞きすぎた。耳が痛い。', effects: [{ type: 'ailment', id: 'kare' }] },
        ],
      },
    ],
  },
  {
    id: 'ev_hoshi', floors: [18, 60],
    text: '天井に穴が空いていて、星が見える。塔の高さからすると、あり得ない見え方だ。',
    choices: [
      {
        label: '星を読む',
        outcomes: [
          { w: 65, text: '進むべき方角が分かった。', effects: [{ type: 'reveal' }, { type: 'stat', key: 'luk', value: 4 }] },
          { w: 35, text: '知らない星ばかりだった。', effects: [] },
        ],
      },
      { label: '見上げて休む', outcomes: [{ w: 100, text: '首が痛くなったが、気が満ちた。', effects: [{ type: 'ki', value: 20 }] }] },
    ],
  },
  {
    id: 'ev_ashiato', floors: [7, 60],
    text: '自分たちのものではない足跡が、先へ続いている。数は、こちらと同じ人数だ。',
    choices: [
      {
        label: '追う',
        outcomes: [
          { w: 55, text: '足跡は階段の前で消えていた。近道だった。', effects: [{ type: 'akari', value: 20 }, { type: 'reveal' }] },
          { w: 45, text: '足跡は途中で引き返していた。何かがあったらしい。', effects: [{ type: 'akari', value: -10 }, { type: 'stat', key: 'def', value: 3 }] },
        ],
      },
      { label: '別の道を行く', outcomes: [{ w: 100, text: '足跡には二度と出会わなかった。', effects: [] }] },
    ],
  },
  {
    id: 'ev_ame_oto', floors: [11, 60],
    text: '雨音がする。この階に窓はない。',
    choices: [
      {
        label: '音の出どころを探す', cost: { akari: 12 },
        outcomes: [
          { w: 60, text: '壁の裏に水路があった。流れの中に何かが引っかかっている。', effects: [{ type: 'equip', count: 1 }] },
          { w: 40, text: '見つからない。音だけが続いている。', effects: [] },
        ],
      },
      { label: '聞かなかったことにする', outcomes: [{ w: 100, text: '進むうちに音は消えた。', effects: [] }] },
    ],
  },
  {
    id: 'ev_te', floors: [26, 60],
    text: '壁から手が一本、こちらへ差し出されている。開いた掌に、何も乗っていない。',
    choices: [
      {
        label: '銭を乗せる', cost: { zeni: 200 },
        outcomes: [{ w: 100, text: '手は握り込まれ、代わりに別のものを差し出した。', effects: [{ type: 'equip', count: 1 }, { type: 'karma', value: 25 }] }],
      },
      {
        label: '握手する',
        outcomes: [
          { w: 45, text: '暖かかった。力が湧いてくる。', effects: [{ type: 'stat', key: 'atk', value: 5 }, { type: 'stat', key: 'def', value: 3 }] },
          { w: 55, text: '離してくれない。振りほどくのに手間取った。', effects: [{ type: 'hp', pct: -0.1 }, { type: 'akari', value: -8 }] },
        ],
      },
      { label: '通り過ぎる', outcomes: [{ w: 100, text: '手はゆっくりと壁に戻っていった。', effects: [] }] },
    ],
  },
  {
    id: 'ev_kagami_futatsu', floors: [32, 60],
    text: '向かい合わせの鏡に挟まれた。無限に続く自分たちが見える。奥のほうは、こちらを見ていない。',
    choices: [
      {
        label: '奥の自分に手を振る',
        outcomes: [
          { w: 45, text: '振り返してきた。数が一人多い気がした。', effects: [{ type: 'karma', value: 55 }, { type: 'ailment', id: 'madoi' }] },
          { w: 55, text: '全員が振り返した。気持ちが軽くなった。', effects: [{ type: 'hp', pct: 0.4 }, { type: 'cure' }] },
        ],
      },
      {
        label: '鏡を割る', cost: { hp: 0.12 },
        outcomes: [{ w: 100, text: '破片の下から、埋められていたものが出てきた。', effects: [{ type: 'equip', count: 1 }, { type: 'zeni', value: 350 }] }],
      },
    ],
  },
  {
    id: 'ev_saigo_no_dan', floors: [40, 60],
    text: '「ここから上は、還ってきた者がいない」と札に書いてある。字は新しい。',
    choices: [
      {
        label: '札を裏返す',
        outcomes: [
          { w: 60, text: '裏には「それでも登れ」とあった。', effects: [{ type: 'stat', key: 'atk', value: 5 }, { type: 'stat', key: 'mag', value: 5 }] },
          { w: 40, text: '裏は白紙だった。書いた者も還らなかったのだろう。', effects: [{ type: 'karma', value: 60 }] },
        ],
      },
      {
        label: '札を持っていく',
        outcomes: [{ w: 100, text: '懐に入れた。次に来る者は、これを読めない。', effects: [{ type: 'fuda', value: 1 }, { type: 'karma', value: -15 }] }],
      },
      { label: '読んで進む', outcomes: [{ w: 100, text: '何も変えずに先へ進んだ。', effects: [] }] },
    ],
  },

  /**
   * ── 塔の地下（61階〜・2026-08-13 新設） ────────────────
   *
   * ★**ここが無いと地下では怪異が1つも出ない**（2026-08-13 オーナー指摘
   *   「エンディングの怪異が設定されていないので新たな怪異を設定しておこう」）。
   *   上の怪異はすべて `floors: [n, 60]` で頭打ちになっていて、
   *   `eventsFor(61)` が空配列を返し、`pickEvent` が null を返していた。
   *   ＝地下では怪異ノードを踏んでも何も起きない状態だった。
   *
   * 【地下の書き方】終章のあとの場所なので、**怖がらせにいかない**。
   *   還る門をくぐった者にとって、塔はもう「登るもの」ではない。
   *   降りるほど、上でやり残したことのほうが不気味に見えてくる、という向き。
   * ★上限は 999（地下の深さに上限を作っていないため）。
   */
  {
    id: 'ev_shita_kaidan', floors: [61, 999],
    text: '下りの石段に、段数が彫られている。いま踏んだ段は「一」だった。何度降りても「一」のままだ。',
    choices: [
      {
        label: '数えながら降りる', cost: { akari: 18 },
        outcomes: [{ w: 100, text: '百段目でようやく「二」になった。造りが読めた。', effects: [{ type: 'reveal' }, { type: 'karma', value: 110 }] }],
      },
      {
        label: '彫り直す',
        outcomes: [
          { w: 55, text: '「一」の隣に「一」と彫った。二人ぶんになった気がする。', effects: [{ type: 'stat', key: 'atk', value: 7 }, { type: 'stat', key: 'mag', value: 7 }] },
          { w: 45, text: '刃が滑って、自分の指を彫った。', effects: [{ type: 'hp', pct: -0.12 }, { type: 'karma', value: 60 }] },
        ],
      },
      { label: '見ずに降りる', outcomes: [{ w: 100, text: '段数のことは忘れた。それでちょうどよかった。', effects: [{ type: 'stat', key: 'def', value: 5 }] }] },
    ],
  },
  {
    id: 'ev_mon_no_ura', floors: [61, 999],
    text: '還る門の裏側が、こちらを向いて立っている。表から見たときの飾りが、ぜんぶ内側にある。',
    choices: [
      {
        label: '内側の飾りを読む',
        outcomes: [
          { w: 60, text: 'くぐった者の名が並んでいた。いちばん新しいのは、自分たちの名だった。', effects: [{ type: 'karma', value: 140 }, { type: 'cure' }] },
          { w: 40, text: '名が多すぎて、自分のものが見つからない。', effects: [{ type: 'ailment', id: 'madoi' }, { type: 'karma', value: 70 }] },
        ],
      },
      {
        label: 'もう一度くぐる', cost: { hp: 0.15 },
        outcomes: [{ w: 100, text: 'くぐった先も、やはり地下だった。門は一度きりのものらしい。', effects: [{ type: 'equip', count: 2 }, { type: 'zeni', value: 1200 }] }],
      },
      { label: '背を向ける', outcomes: [{ w: 100, text: '門は何も言わなかった。', effects: [] }] },
    ],
  },
  {
    id: 'ev_shita_no_hi', floors: [61, 999],
    text: '灯が、下から照らしている。影が天井へ伸びていく。',
    choices: [
      {
        label: '影を追って見上げる',
        outcomes: [
          { w: 65, text: '天井の影が、登っていたころの自分たちの形をしていた。', effects: [{ type: 'ki', value: 40 }, { type: 'stat', key: 'luk', value: 6 }] },
          { w: 35, text: '見上げているうちに、どちらが下か分からなくなった。', effects: [{ type: 'ailment', id: 'don' }] },
        ],
      },
      {
        label: '提灯を下へ向ける',
        outcomes: [{ w: 100, text: '足元だけが明るくなった。降りる者の灯はこれでいい。', effects: [{ type: 'akari', value: 35 }] }],
      },
    ],
  },
  {
    id: 'ev_todokanu_fumi', floors: [61, 999],
    text: '祠へ宛てた文が、束になって落ちている。差出人はどれも、影送りに出したはずの仲間の名だ。',
    choices: [
      {
        label: '読む',
        outcomes: [
          { w: 55, text: '「もう帰った」とだけ書いてある。届かなかっただけらしい。', effects: [{ type: 'karma', value: 120 }, { type: 'hp', pct: 0.5 }] },
          { w: 45, text: '最後の一通だけ、字が自分のものだった。', effects: [{ type: 'ailment', id: 'kare' }, { type: 'karma', value: 90 }] },
        ],
      },
      {
        label: '持ち帰る',
        outcomes: [{ w: 100, text: '束ねて懐に入れた。宛先は分かっている。', effects: [{ type: 'fuda', value: 2 }, { type: 'karma', value: 60 }] }],
      },
      { label: '拾わない', outcomes: [{ w: 100, text: '文は、まだ誰かを待っている。', effects: [] }] },
    ],
  },
  {
    id: 'ev_shita_no_akindo', floors: [61, 999],
    text: '商人が背を向けて座っている。塔の商人と同じ荷だが、こちらを振り向かない。',
    choices: [
      {
        label: '肩を叩く',
        outcomes: [
          { w: 50, text: '振り向いた顔は、こちらと同じ顔だった。荷を置いて去っていった。', effects: [{ type: 'equip', count: 2 }, { type: 'mat', id: 'enhance_stone', value: 6 }] },
          { w: 50, text: '振り向かない。肩の下に、誰もいなかった。', effects: [{ type: 'akari', value: -15 }, { type: 'karma', value: 80 }] },
        ],
      },
      {
        label: '黙って銭を置く', cost: { zeni: 800 },
        outcomes: [{ w: 100, text: '荷から一つ、こちらへ滑ってきた。', effects: [{ type: 'equip', count: 1 }, { type: 'mat', id: 'renki_mat', value: 5 }, { type: 'karma', value: 40 }] }],
      },
      { label: 'そっと通る', outcomes: [{ w: 100, text: '商人はずっと同じ姿勢のままだった。', effects: [] }] },
    ],
  },
  {
    id: 'ev_ne_no_ma', floors: [61, 999],
    text: '塔の根が、天井から床へ突き抜けている。塔はここから生えているらしい。',
    choices: [
      {
        label: '根に触れる',
        outcomes: [
          { w: 60, text: '脈のようなものが伝わってきた。塔はまだ生きている。', effects: [{ type: 'stat', key: 'atk', value: 8 }, { type: 'stat', key: 'def', value: 8 }] },
          { w: 40, text: '触れた指から力が吸われた。', effects: [{ type: 'hp', pct: -0.15 }, { type: 'karma', value: 100 }] },
        ],
      },
      {
        label: '削り取る', cost: { akari: 25 },
        outcomes: [{ w: 100, text: '硬い。石とも木ともつかないものが取れた。', effects: [{ type: 'mat', id: 'enhance_stone', value: 8 }, { type: 'mat', id: 'renki_mat', value: 4 }] }],
      },
      { label: '手を合わせる', outcomes: [{ w: 100, text: '根は静かだった。', effects: [{ type: 'karma', value: 90 }, { type: 'cure' }] }] },
    ],
  },
  {
    id: 'ev_nobori_no_koe', floors: [61, 999],
    text: '上から足音が降ってくる。登っている者の音だ。この塔に、まだ登っている者がいる。',
    choices: [
      {
        label: '声をかける',
        outcomes: [
          { w: 55, text: '「頂には何がある」と聞かれた。答えると、足音は軽くなった。', effects: [{ type: 'karma', value: 130 }, { type: 'ki', value: 35 }] },
          { w: 45, text: '返ってきたのは、自分の声だった。', effects: [{ type: 'ailment', id: 'madoi' }, { type: 'stat', key: 'luk', value: 6 }] },
        ],
      },
      {
        label: '道を空ける',
        outcomes: [{ w: 100, text: '足音は横を通り過ぎ、上へ消えた。誰かが登っているなら、それでいい。', effects: [{ type: 'reveal' }, { type: 'karma', value: 70 }] }],
      },
    ],
  },
  {
    id: 'ev_soko_no_mizu', floors: [61, 999],
    text: '水面がある。覗くと、映っているのは天井ではなく、いちばん上の階だ。',
    choices: [
      {
        label: '手を入れる',
        outcomes: [
          { w: 50, text: '指先が、あの日の風の温度に触れた。', effects: [{ type: 'hp', pct: 0.6 }, { type: 'cure' }] },
          { w: 50, text: '水は冷たいだけだった。映っていたものも消えた。', effects: [{ type: 'akari', value: -12 }] },
        ],
      },
      {
        label: '灯を落とす', cost: { akari: 30 },
        outcomes: [{ w: 100, text: '沈んでいく灯を追って、底に何かが光った。', effects: [{ type: 'equip', count: 2 }, { type: 'zeni', value: 900 }] }],
      },
      { label: '飲む', outcomes: [{ w: 100, text: '塩辛かった。誰かの涙のような味がした。', effects: [{ type: 'ki', value: 45 }, { type: 'karma', value: 50 }] }] },
    ],
  },
];

export const EVENT_BY_ID = Object.fromEntries(EVENTS.map((e) => [e.id, e]));

/** その階で出る怪異の候補 */
export function eventsFor(floor) {
  return EVENTS.filter((e) => floor >= e.floors[0] && floor <= e.floors[1]);
}

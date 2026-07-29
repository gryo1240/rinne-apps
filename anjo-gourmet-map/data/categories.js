/* ============================================================
   categories.js － カテゴリの設計図
   ------------------------------------------------------------
   【なぜ作り直したか】
   以前は「飲食店のジャンル8種」がコードの中に直接書かれていました。
   観光・イベント・ホテル・公園・温泉・買い物まで扱うには、
   ジャンルを**データとして**持つ必要があります。

   3階層で持ちます。

     domain（領域）   … グルメ／観光／イベント／宿泊／公園／温泉／買い物
       └ group（大分類）… 地図のピンの色になる単位。1領域あたり3つまで（後述）
           └ category（カテゴリ）… 和食・カフェ… 実際のデータに入っている値

   さらに、領域をまたいで使う「シーン」を別に持ちます。
     scene（シーン）  … ランチ／モーニング／カフェ／夜ご飯／子連れ／デート…
   シーンは
     ・ホームの横スクロールカード
     ・SEOのカテゴリページ（/c/lunch/ など）
     ・AI相談の答え → 条件への変換
   の3か所で同じ定義を使います。**増やすときはここに1行足すだけ**です。

   【地図のピンの色は1領域につき3色まで】
   配色検証ツールで実測したところ、4色目はどの色相でも色覚特性の判定に落ちました。
   詳しくは HANDOFF-dev.md 第4章 4-4。groups を4つ以上にしないこと。
   ============================================================ */
window.AGM_CATEGORIES = {

  /* ---------- 領域 ----------
     いまは gourmet だけ enabled。ほかは受け皿として先に定義してある。
     データ（places）側の domain がここの id と一致していれば、そのまま扱えます。 */
  domains: [
    { id:"gourmet",     label:"グルメ",   enabled:true,  schema:"FoodEstablishment",
      unit:"店", verb:"食べる" },
    { id:"sightseeing", label:"観光",     enabled:false, schema:"TouristAttraction",
      unit:"か所", verb:"見る" },
    { id:"event",       label:"イベント", enabled:false, schema:"Event",
      unit:"件", verb:"参加する" },
    { id:"hotel",       label:"宿泊",     enabled:false, schema:"LodgingBusiness",
      unit:"軒", verb:"泊まる" },
    { id:"park",        label:"公園",     enabled:false, schema:"Park",
      unit:"か所", verb:"遊ぶ" },
    { id:"onsen",       label:"温泉",     enabled:false, schema:"HealthAndBeautyBusiness",
      unit:"か所", verb:"入る" },
    { id:"shopping",    label:"買い物",   enabled:false, schema:"Store",
      unit:"店", verb:"買う" }
  ],

  /* ---------- 大分類（ピンの色） ---------- */
  groups: [
    { id:"meal",  domain:"gourmet", label:"ごはん",           colorVar:"--c-meal" },
    { id:"cafe",  domain:"gourmet", label:"カフェ・甘いもの", colorVar:"--c-cafe" },
    { id:"bar",   domain:"gourmet", label:"居酒屋・バー",     colorVar:"--c-bar"  }
  ],

  /* ---------- カテゴリ ----------
     label は places のデータに入っている文字そのもの。
     glyph は写真の代わりに出す1文字（写真は権利上ぜったいに転載しない）。 */
  categories: [
    { id:"washoku", domain:"gourmet", group:"meal", label:"和食",           glyph:"和" },
    { id:"yoshoku", domain:"gourmet", group:"meal", label:"洋食",           glyph:"洋" },
    { id:"chuka",   domain:"gourmet", group:"meal", label:"中華・ラーメン", glyph:"麺" },
    { id:"yakiniku",domain:"gourmet", group:"meal", label:"焼肉・鉄板焼き", glyph:"焼" },
    { id:"ethnic",  domain:"gourmet", group:"meal", label:"多国籍",         glyph:"多" },
    { id:"cafe",    domain:"gourmet", group:"cafe", label:"カフェ・喫茶",   glyph:"珈" },
    { id:"sweets",  domain:"gourmet", group:"cafe", label:"スイーツ・パン", glyph:"菓" },
    { id:"izakaya", domain:"gourmet", group:"bar",  label:"居酒屋・バー",   glyph:"酒" }
  ],

  /* ---------- 設備（データの文字 → 短い表示名と意味） ----------
     places 側の features はこの id に正規化されます。 */
  features: [
    { id:"reserve",  label:"予約できる",   raw:"席予約可能" },
    { id:"nosmoke",  label:"全席禁煙",     raw:"全席完全禁煙" },
    { id:"takeout",  label:"テイクアウト", raw:"テイクアウトメニュー有" },
    { id:"kids",     label:"子連れOK",     raw:"お子様連れ対応可能" },
    { id:"kidsmenu", label:"キッズメニュー", raw:"キッズメニュー有" },
    { id:"wifi",     label:"Wi-Fi",        raw:"無料Wi-Fi利用可能" },
    { id:"veggie",   label:"野菜たっぷり", raw:"野菜を120g以上使用したメニュー有" },
    { id:"delivery", label:"宅配",         raw:"宅配可能" }
  ],

  /* ---------- シーン ----------
     rule は scenes.js が解釈します。使える条件は次のとおり。
       openBetween : [開始分, 終了分]  その時間帯に開いている
       groups      : [大分類id]        どれかに当てはまる
       categories  : [カテゴリid]
       features    : [設備id]          すべて必要
       anyFeature  : [設備id]          どれか1つ
       parking     : true              駐車場あり
       seatsMax    : 数                席数がこれ以下（静か・こぢんまり）
       seatsMin    : 数
       budgetMax   : 円                昼の下限がこれ以下
       hasBudget   : true              予算が載っている

     seo は自動生成するカテゴリページ（/c/<slug>/）の文言。
     {city} は data/city.js の name に置き換わります。 */
  scenes: [
    { id:"lunch", slug:"lunch", label:"ランチ", icon:"🍚", shelf:true,
      rule:{ openBetween:[11*60, 14*60], groups:["meal","cafe"] },
      seo:{ h1:"{city}のランチ", lead:"お昼に開いているお店を、営業時間と駐車場つきで。",
            q:"{city}でランチができるお店は？" } },

    { id:"morning", slug:"morning", label:"モーニング", icon:"🥐", shelf:true,
      rule:{ openBetween:[7*60, 10*60+30] },
      seo:{ h1:"{city}のモーニング", lead:"朝から開いているお店。愛知のモーニング文化を朝いちで。",
            q:"{city}で朝からやっているお店は？" } },

    { id:"cafe", slug:"cafe", label:"カフェ", icon:"☕", shelf:true,
      rule:{ groups:["cafe"] },
      seo:{ h1:"{city}のカフェ・喫茶店", lead:"ひと休みできるお店。Wi-Fiや席数も載せています。",
            q:"{city}でゆっくりできるカフェは？" } },

    { id:"dinner", slug:"dinner", label:"夜ご飯", icon:"🌙", shelf:true,
      rule:{ openBetween:[18*60, 21*60] },
      seo:{ h1:"{city}の夜ご飯", lead:"夜に開いているお店。閉店時刻まで一目で分かります。",
            q:"{city}で夜おそくまでやっているお店は？" } },

    { id:"sweets", slug:"sweets", label:"スイーツ", icon:"🍰", shelf:true,
      rule:{ categories:["sweets"] },
      seo:{ h1:"{city}のスイーツ・パン", lead:"甘いものと焼きたてパン。",
            q:"{city}でケーキやパンが買えるお店は？" } },

    { id:"takeout", slug:"takeout", label:"テイクアウト", icon:"🥡", shelf:true,
      rule:{ features:["takeout"] },
      seo:{ h1:"{city}のテイクアウト", lead:"持ち帰りができるお店。宅配できる店も分かります。",
            q:"{city}でテイクアウトできるお店は？" } },

    { id:"kids", slug:"kids", label:"子連れ", icon:"👶", shelf:true,
      rule:{ features:["kids"], parking:true },
      seo:{ h1:"{city}の子連れで行けるお店", lead:"子連れ対応＋駐車場ありのお店だけ。キッズメニューの有無も。",
            q:"{city}で子連れでも入りやすいお店は？" } },

    { id:"date", slug:"date", label:"デート", icon:"🍷", shelf:true,
      rule:{ anyFeature:["reserve"], hasBudget:true },
      seo:{ h1:"{city}のデートで使えるお店", lead:"予約ができて、予算が分かるお店。",
            q:"{city}で記念日やデートに使えるお店は？" } },

    { id:"tabearuki", slug:"tabearuki", label:"食べ歩き", icon:"🚶", shelf:false,
      rule:{ features:["takeout"], groups:["cafe"] },
      seo:{ h1:"{city}の食べ歩き", lead:"持ち帰って歩きながら食べられるお店。",
            q:"{city}で食べ歩きできるお店は？" } },

    { id:"parking", slug:"parking", label:"駐車場あり", icon:"🅿️", shelf:false,
      rule:{ parking:true },
      seo:{ h1:"{city}の駐車場があるお店", lead:"車で行けるお店。台数も載せています。",
            q:"{city}で駐車場のあるお店は？" } },

    { id:"quiet", slug:"quiet", label:"静かに過ごす", icon:"🤫", shelf:false,
      rule:{ seatsMax:20 },
      seo:{ h1:"{city}の静かに過ごせるお店", lead:"席数が少なめの、こぢんまりしたお店。",
            q:"{city}で静かに過ごせるお店は？" } },

    { id:"cheap", slug:"cheap", label:"1000円以下", icon:"💴", shelf:false,
      rule:{ budgetMax:1000 },
      seo:{ h1:"{city}の1,000円以下で食べられるお店", lead:"昼の平均予算が1,000円以下のお店。",
            q:"{city}で安く食べられるお店は？" } }
  ]
};

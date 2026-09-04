/* 配当金なに買える？ 換算アイテム
 *
 * 【設計の前提・ここを崩すと保守が破綻する】
 * - **企業名・ブランド名・商品名を一切持たない。** 「動画配信サービス」であって特定社名ではない。
 *   商標を推す表現になり、サービス終了・値上げのたびに更新義務が発生するため（三河の旬カレンダーで
 *   ふるなびの規約から学んだのと同じ理屈）
 * - **価格は「目安」であり、画面上でユーザーが自由に書き換えられる。** だからこの数字の正確さを
 *   会社が保証する必要がない＝オーナー作業ゼロで維持できる。出典も持たない（持つと更新義務になる）
 * - 数字は2026年8月時点の一般的な感覚で置いた概算。**税・地域差・店舗差は考慮しない**
 * - 金額が変動しやすいもの（生鮮食品の相場・株価など）は入れない
 */

const CONVERT_ITEMS = [
  /* ---- 食べもの・飲みもの ---- */
  { id: "conveni-coffee", label: "コンビニのコーヒー", unit: "杯", emoji: "☕", price: 150, category: "食べもの" },
  { id: "cafe-latte",     label: "カフェのカフェラテ", unit: "杯", emoji: "🥤", price: 550, category: "食べもの" },
  { id: "onigiri",        label: "おにぎり",           unit: "個", emoji: "🍙", price: 180, category: "食べもの" },
  { id: "ramen",          label: "ラーメン",           unit: "杯", emoji: "🍜", price: 1000, category: "食べもの" },
  { id: "gyudon",         label: "牛丼（並）",         unit: "杯", emoji: "🍚", price: 500, category: "食べもの" },
  { id: "sushi-plate",    label: "回転寿司",           unit: "皿", emoji: "🍣", price: 150, category: "食べもの" },
  { id: "beer",           label: "缶ビール（350ml）",  unit: "本", emoji: "🍺", price: 230, category: "食べもの" },
  { id: "cake",           label: "ケーキ",             unit: "個", emoji: "🍰", price: 500, category: "食べもの" },

  /* ---- おでかけ・たのしみ ---- */
  { id: "movie",          label: "映画館",             unit: "回", emoji: "🎬", price: 2000, category: "たのしみ" },
  { id: "sento",          label: "銭湯",               unit: "回", emoji: "♨", price: 550, category: "たのしみ" },
  { id: "super-sento",    label: "スーパー銭湯",       unit: "回", emoji: "🧖", price: 900, category: "たのしみ" },
  { id: "karaoke",        label: "カラオケ（1時間）",  unit: "回", emoji: "🎤", price: 700, category: "たのしみ" },
  { id: "manga",          label: "マンガの単行本",     unit: "冊", emoji: "📚", price: 600, category: "たのしみ" },
  { id: "bunko",          label: "文庫本",             unit: "冊", emoji: "📖", price: 800, category: "たのしみ" },
  { id: "video-sub",      label: "動画配信サービス（1か月）", unit: "か月", emoji: "📺", price: 1000, category: "たのしみ" },
  { id: "music-sub",      label: "音楽配信サービス（1か月）", unit: "か月", emoji: "🎧", price: 1080, category: "たのしみ" },
  { id: "gacha",          label: "カプセルトイ",       unit: "回", emoji: "🎰", price: 400, category: "たのしみ" },

  /* ---- くらし ---- */
  { id: "gasoline",       label: "ガソリン",           unit: "L", emoji: "⛽", price: 175, category: "くらし" },
  { id: "train",          label: "電車の初乗り",       unit: "回", emoji: "🚃", price: 180, category: "くらし" },
  { id: "taxi",           label: "タクシーの初乗り",   unit: "回", emoji: "🚕", price: 500, category: "くらし" },
  { id: "bread",          label: "食パン",             unit: "斤", emoji: "🍞", price: 200, category: "くらし" },
  { id: "egg",            label: "卵（10個入り）",     unit: "パック", emoji: "🥚", price: 300, category: "くらし" },
  { id: "rice5kg",        label: "お米（5kg）",        unit: "袋", emoji: "🌾", price: 3500, category: "くらし" },
  { id: "haircut",        label: "散髪",               unit: "回", emoji: "💇", price: 3500, category: "くらし" },

  /* ---- 毎月の支払い（2026-09-04 オーナー指示で追加） ----
     配当金の使い道として「生活費のこの部分が賄えている」と実感しやすいので入れた。
     単価が大きいので、少額のうちは 0 が並ぶ。それ自体が現在地の情報になる（隠さない）。
     **金額は世帯・地域・季節で大きく違う。** ここも他と同じく「目安」で、画面上で書き換えられる。
     出典は持たない（持つと更新義務が発生する。data.js 冒頭の設計の前提を参照） */
  { id: "denki",          label: "電気代（1か月）",    unit: "か月", emoji: "💡", price: 11000, category: "毎月の支払い" },
  { id: "gas",            label: "ガス代（1か月）",    unit: "か月", emoji: "🔥", price: 5500, category: "毎月の支払い" },
  { id: "suido",          label: "水道代（1か月）",    unit: "か月", emoji: "🚰", price: 4000, category: "毎月の支払い" },
  { id: "denwa",          label: "電話代（1か月）",    unit: "か月", emoji: "📱", price: 5000, category: "毎月の支払い" },
  { id: "yachin",         label: "家賃（1か月）",      unit: "か月", emoji: "🏠", price: 60000, category: "毎月の支払い" }
];

if (typeof module !== "undefined" && module.exports) {
  module.exports = { CONVERT_ITEMS };
} else {
  window.CONVERT_ITEMS = CONVERT_ITEMS;
}

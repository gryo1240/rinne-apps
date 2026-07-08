// MobileNet(ImageNet1000クラス)の分類結果を日本語の名詞に変換する。
// 全1000クラスの逐語訳はせず、よく撮られそうな主要カテゴリ(約130語)だけ辞書化し、
// 未収録・低信頼のものはジャンル別の総称(「謎の物体」等)に丸めてジョークとして成立させる
// (2026-07-09 advisor助言: 精度を追わず雑な認識自体をネタにする設計)。
"use strict";

// 主要語(className先頭カンマ区切りの1語目、小文字)→自然な日本語名詞
const DICT = {
  // 動物
  tabby: "猫", "tiger cat": "猫", "persian cat": "猫", "siamese cat": "猫", "egyptian cat": "猫",
  chihuahua: "犬", pug: "犬", "golden retriever": "犬", "labrador retriever": "犬", poodle: "犬",
  "toy poodle": "犬", "miniature poodle": "犬", "standard poodle": "犬", "siberian husky": "犬",
  "french bulldog": "犬", dalmatian: "犬", beagle: "犬", "german shepherd": "犬", collie: "犬",
  "wood rabbit": "うさぎ", hare: "うさぎ", hamster: "ハムスター", goldfish: "金魚",
  ostrich: "ダチョウ", peacock: "クジャク", parrot: "オウム", macaw: "インコ", hummingbird: "ハチドリ",
  koala: "コアラ", panda: "パンダ", "giant panda": "パンダ", "lesser panda": "レッサーパンダ",
  hedgehog: "ハリネズミ", "guinea pig": "モルモット", squirrel: "リス", "fox squirrel": "リス",
  butterfly: "蝶", "monarch": "蝶", "admiral": "蝶", ladybug: "てんとう虫", snail: "カタツムリ",

  // 食べ物
  pizza: "ピザ", hotdog: "ホットドッグ", cheeseburger: "チーズバーガー", "ice cream": "アイスクリーム",
  banana: "バナナ", orange: "オレンジ", lemon: "レモン", strawberry: "いちご", pineapple: "パイナップル",
  fig: "いちじく", pomegranate: "ざくろ", mushroom: "きのこ", pretzel: "プレッツェル", bagel: "ベーグル",
  cucumber: "きゅうり", broccoli: "ブロッコリー", cauliflower: "カリフラワー", corn: "とうもろこし",
  "bell pepper": "ピーマン", artichoke: "アーティチョーク", "french loaf": "フランスパン",
  espresso: "エスプレッソ", cup: "カップ", "coffee mug": "マグカップ", "hot pot": "鍋料理",
  guacamole: "ワカモレ", trifle: "トライフル", dough: "生地", burrito: "ブリトー",

  // 家電・道具・日用品
  laptop: "ノートパソコン", "desktop computer": "デスクトップパソコン", "computer keyboard": "キーボード",
  mouse: "マウス", "cellular telephone": "スマートフォン", "dial telephone": "電話",
  television: "テレビ", microwave: "電子レンジ", refrigerator: "冷蔵庫", "remote control": "リモコン",
  "electric fan": "扇風機", "table lamp": "電気スタンド", umbrella: "傘", backpack: "リュック",
  wallet: "財布", purse: "財布", sunglasses: "サングラス", sunglass: "サングラス",
  "acoustic guitar": "ギター", "electric guitar": "ギター", violin: "バイオリン", piano: "ピアノ",
  "grand piano": "ピアノ", drum: "ドラム", "water bottle": "水筒", teapot: "急須", vase: "花瓶",
  candle: "ろうそく", pillow: "枕", "coffeepot": "コーヒーポット",

  // 乗り物
  "sports car": "スポーツカー", convertible: "オープンカー", jeep: "ジープ", minivan: "ミニバン",
  "mountain bike": "マウンテンバイク", "bicycle-built-for-two": "二人乗り自転車", "motor scooter": "スクーター",
  airliner: "旅客機", airship: "飛行船", canoe: "カヌー", speedboat: "スピードボート",

  // 衣類
  jean: "ジーンズ", "running shoe": "スニーカー", sock: "靴下", sweatshirt: "スウェット",
  "cowboy hat": "カウボーイハット", kimono: "着物", jersey: "ユニフォーム",

  // 植物・自然
  daisy: "デイジー", "yellow lady's slipper": "花", cliff: "崖", volcano: "火山", coral: "サンゴ",
  "coral reef": "サンゴ礁", alp: "山", valley: "谷", seashore: "海辺", lakeside: "湖畔",
};

// 辞書に無いクラスのジャンル別の総称(こちらもジョークとして成立するよう選定)
const FALLBACK_BUCKETS = [
  { keywords: ["dog", "hound", "terrier", "spaniel", "retriever", "setter", "collie", "poodle", "wolf", "fox", "coyote"], label: "犬っぽい何か" },
  { keywords: ["cat", "lion", "tiger", "leopard", "cheetah", "jaguar", "lynx"], label: "猫っぽい何か" },
  { keywords: ["snake", "lizard", "turtle", "gecko", "iguana", "chameleon", "crocodile", "alligator"], label: "爬虫類らしき何か" },
  { keywords: ["fish", "shark", "ray", "eel", "trout", "salmon"], label: "謎の魚" },
  { keywords: ["bird", "finch", "eagle", "owl", "parrot", "duck", "goose", "swan", "penguin", "crane", "heron"], label: "鳥類らしき何か" },
  { keywords: ["monkey", "ape", "gorilla", "chimpanzee", "baboon", "gibbon"], label: "サルの仲間っぽい何か" },
  { keywords: ["bear"], label: "クマっぽい何か" },
  { keywords: ["spider", "beetle", "bee", "ant", "fly", "moth", "grasshopper", "cricket", "cockroach", "mantis"], label: "虫の仲間" },
  { keywords: ["cake", "bread", "sandwich", "soup", "sauce", "meat", "sausage", "pasta", "noodle", "rice", "salad", "pot pie", "waffle"], label: "何かの料理" },
  { keywords: ["apple", "berry", "fruit", "melon", "squash", "pepper", "cabbage", "vegetable", "grape"], label: "何かの野菜か果物" },
  { keywords: ["car", "truck", "bus", "van", "vehicle", "wagon", "cart"], label: "何かの乗り物"},
  { keywords: ["train", "locomotive", "railway"], label: "電車っぽい何か" },
  { keywords: ["boat", "ship", "yacht", "sail", "vessel"], label: "船っぽい何か" },
  { keywords: ["plane", "aircraft", "jet"], label: "飛行機っぽい何か" },
  { keywords: ["shirt", "coat", "dress", "gown", "suit", "hat", "cap", "shoe", "boot", "sandal", "glove", "scarf"], label: "服っぽい何か" },
  { keywords: ["chair", "table", "desk", "sofa", "couch", "cabinet", "shelf", "bed", "furniture"], label: "家具っぽい何か" },
  { keywords: ["flower", "plant", "tree", "leaf", "blossom", "fungus", "fungi"], label: "植物っぽい何か" },
  { keywords: ["building", "house", "church", "castle", "tower", "bridge", "palace", "temple", "mosque"], label: "建物っぽい何か" },
  { keywords: ["machine", "device", "tool", "instrument", "equipment", "appliance"], label: "何かの機械" },
];

/**
 * MobileNet分類結果のclassName(例: "tabby, tabby cat")を日本語名詞に変換する。
 * 信頼度が低い場合や未知のラベルは総称に丸める。
 */
function toJapaneseNoun(className, probability) {
  const lower = (className || "").toLowerCase();
  const primary = lower.split(",")[0].trim();

  if (typeof probability === "number" && probability < 0.15) {
    return "正体不明の何か";
  }
  if (DICT[primary]) return DICT[primary];

  for (const { keywords, label } of FALLBACK_BUCKETS) {
    if (keywords.some((k) => lower.includes(k))) return label;
  }
  return "謎の物体";
}

if (typeof window !== "undefined") {
  window.GekikaraLabels = { toJapaneseNoun };
}

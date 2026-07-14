"use strict";
/*
 * 立ち絵・背景の間接参照テーブル（差し替えはここ1箇所だけ）
 * 表情ID → キャラ＋ラベル。img を足せば画像表示に切り替わる（無ければCSSプレースホルダ描画）。
 * 画像を用意したら faces[id].img = "assets/koyomi_normal.png" のように追記するだけ。
 * 生成仕様は koyomi-jikenbo-art-prompts.md 参照（透過PNG・膝上・高さ目安1024px・2キャラの縮尺と目線を揃える）。
 *
 * 2026-07-15: オーナー提供の立ち絵(こよみ画像/・ひなた画像/)を反映。元絵はどちらも左向き。
 * こよみは chars.koyomi.side="right"(画面右配置)のため左向きのまま使用(中央=左を向く=正しい)。
 * ひなたは chars.hinata.side="left"(画面左配置)のため、中央(右)を向くよう左右反転してassets/へ保存。
 * ひなた画像/ひなた_カンファレンスシート.png は複数アングルの設定資料であり単体スプライトではないため未使用。
 */
var SPRITES = {
  chars: {
    koyomi: { name: "宵乃こよみ", color: "#c9a6e8", side: "right" },
    hinata: { name: "ひなた",   color: "#e8c07a", side: "left" },
    akari:  { name: "あかり",   color: "#86c0ac", side: "left" },
    mother: { name: "母",       color: "#d8a6a6", side: "left" }
  },
  // 表情ID → { char, label, img? }
  faces: {
    koyomi_normal:  { char: "koyomi", label: "", img: "assets/koyomi_normal.png" },
    koyomi_smile:   { char: "koyomi", label: "" },
    koyomi_serious: { char: "koyomi", label: "" },
    koyomi_think:   { char: "koyomi", label: "", img: "assets/koyomi_think.png" },
    koyomi_sad:     { char: "koyomi", label: "", img: "assets/koyomi_sad.png" },
    hinata_worried: { char: "hinata", label: "", img: "assets/hinata_worried.png" },
    hinata_cry:     { char: "hinata", label: "", img: "assets/hinata_cry.png" },
    hinata_surprise:{ char: "hinata", label: "", img: "assets/hinata_surprise.png" },
    hinata_talk:    { char: "hinata", label: "", img: "assets/hinata_talk.png" },
    hinata_smile:   { char: "hinata", label: "", img: "assets/hinata_smile.png" },
    akari_normal:   { char: "akari",  label: "" },
    akari_cry:      { char: "akari",  label: "" }
  },
  // 背景ID → CSS背景（プレースホルダ。画像化する場合もここを差し替え）
  bgs: {
    bg_shop:       "radial-gradient(circle at 50% 35%, #2c2542 0%, #191324 55%, #0f0b17 100%)",
    bg_shop_dim:   "radial-gradient(circle at 50% 40%, #1c1830 0%, #100c1a 60%, #08060e 100%)",
    bg_window_moon:"linear-gradient(180deg, #0c0f1d 0%, #17203c 60%, #232c4e 100%)",
    bg_morning:    "linear-gradient(180deg, #f6b98a 0%, #f9dcae 45%, #cfe3d9 100%)",
    bg_station:    "linear-gradient(180deg, #9cc0dd 0%, #c4dcec 55%, #e8f0f6 100%)",
    bg_black:      "#05060a"
  }
};
if (typeof module !== "undefined") module.exports = SPRITES;

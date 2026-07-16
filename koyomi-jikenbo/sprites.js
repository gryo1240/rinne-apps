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
 *
 * 2026-07-15(2): オーナー指摘「キャラ画像が反映されていない箇所がある」に対応。
 * koyomi_smile(シナリオ最頻出17回)・koyomi_serious(7回)は当時未提供のため暫定流用にしていた。
 * 2026-07-15(3): オーナーが正式差分(こよみ画像/こよみ_笑顔.png・こよみ_真剣.png)を生成。
 * 肌のハイライトが背景白とほぼ同色(色距離7未満)でremove_bg.py標準処理では手が欠けたため、
 * 幾何連結ベースの透過処理(tools/remove_bg.py --geometric)で変換しassetsへ配置、暫定流用を解消。
 * 2026-07-15(4): オーナーがあかり(あかり画像/akari_normal.png・akari_cry.png)を追加生成、任意キャラの
 * akari_normal/akari_cryを新規に組み込んだ(以前はプレースホルダのみ)。akari_normalは既に透過済みで
 * そのまま使用、akari_cryは背景が不均一なグラデーション(色距離ベースの自動透過が困難)だったため
 * ポーズがほぼ同一なakari_normalのアルファチャンネルを転用(市松合成で境界のズレ無しを確認)。
 * akari.side="left"(hinataと同じ)のため、koyomi/hinataの慣例(左向き原画→中央=右向きへ反転)に
 * 合わせて2枚とも左右反転して保存。原画の向きが実際に左だったかは未確認のため、実際のゲーム画面で
 * 不自然に見えたら反転を戻すこと。
 *
 * 2026-07-16: オーナー指摘「あかりの立ち絵が使われていない」に対応。scenario.jsを調査した結果、
 * TRUEエンド終盤(end_true_03〜05)は全てsprite:nullの一人称モノローグとして書かれており、あかりを
 * 画面に表示する場面が構造上一つも存在しなかったことが判明(セリフ文言・展開は変更しない前提でadvisor相談)。
 * engine.jsのrenderSprite()はsprite:nullのときだけ両サイドをクリアする実装(背景転換時のクリア処理は無い)
 * ため、end_true_letter(母の手紙)にakari_normal・end_true_04(号泣→笑う場面)にakari_cryのみ設定し、
 * 前後のend_true_03/05はnullのまま(ステージ掃除役)として残した。こよみ・ひなたの残像が別シーンに
 * 持ち越される描画バグを避けるための最小変更。NORMALエンド側は同種の構造だが今回はスコープ外(要判断ならオーナー確認)。
 *
 * 2026-07-17: こよみ(全身フルショット)がひなた(バストアップ)より顔が小さく見えるサイズ感不一致を修正。
 * tools/koyomi_bustup_crop.py でキャンバス上部をバストアップ相当に切り出して再拡大した
 * *_bustup.png を新規生成し、こちらを参照するよう差し替えた。オーナー指示により既存のassets/koyomi_*.png
 * (全身フルショット原版)は上書きせずそのまま温存している(未参照だが将来別用途で使う可能性を残す)。
 * 同日、オーナー指摘「こよみが大きすぎる」を受けCROP_RATIOを0.55→0.6111(倍率-10%)に変更し再生成。
 *
 * 2026-07-17(2): オーナー指示でakariをside="left"→"right"に変更(koyomiと同じ側)。
 * 2026-07-15(4)の反転(左配置前提で中央=右向きに反転済み)を前提にside だけ変えると画面外(右)を向いて
 * しまうため、akari_normal_right.png/akari_cry_right.pngとして再反転(=原画の向きに戻す)した別ファイルを
 * 新規生成しこちらを参照(オーナー指示により既存のakari_normal.png/akari_cry.pngは上書きしていない)。
 * 【重要な制約】koyomiもside="right"のため、akariとkoyomiは同一スロットを取り合い同時表示できない
 * (renderSpriteは1ノード1立ち絵・対面演出は前ノードの反対側dim描画に依存する設計のため)。将来
 * akari×koyomiの対話シーンを書く場合はsideの再検討かengineの複数立ち絵対応が必要(advisor指摘)。
 *
 * 2026-07-17(3): オーナー指摘「ひなたが(こよみ比で)小さい」を受け、ひなた5表情を10%拡大した
 * *_big.png を tools/sprite_zoom.py --zoom 1.1 で新規生成し参照を差し替え(原版は上書きせず温存)。
 */
var SPRITES = {
  chars: {
    koyomi: { name: "宵乃こよみ", color: "#c9a6e8", side: "right" },
    hinata: { name: "ひなた",   color: "#e8c07a", side: "left" },
    akari:  { name: "あかり",   color: "#86c0ac", side: "right" },
    mother: { name: "母",       color: "#d8a6a6", side: "left" }
  },
  // 表情ID → { char, label, img? }
  faces: {
    koyomi_normal:  { char: "koyomi", label: "", img: "assets/koyomi_normal_bustup.png" },
    koyomi_smile:   { char: "koyomi", label: "", img: "assets/koyomi_smile_bustup.png" },
    koyomi_serious: { char: "koyomi", label: "", img: "assets/koyomi_serious_bustup.png" },
    koyomi_think:   { char: "koyomi", label: "", img: "assets/koyomi_think_bustup.png" },
    koyomi_sad:     { char: "koyomi", label: "", img: "assets/koyomi_sad_bustup.png" },
    hinata_worried: { char: "hinata", label: "", img: "assets/hinata_worried_big.png" },
    hinata_cry:     { char: "hinata", label: "", img: "assets/hinata_cry_big.png" },
    hinata_surprise:{ char: "hinata", label: "", img: "assets/hinata_surprise_big.png" },
    hinata_talk:    { char: "hinata", label: "", img: "assets/hinata_talk_big.png" },
    hinata_smile:   { char: "hinata", label: "", img: "assets/hinata_smile_big.png" },
    akari_normal:   { char: "akari",  label: "", img: "assets/akari_normal_right.png" },
    akari_cry:      { char: "akari",  label: "", img: "assets/akari_cry_right.png" }
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

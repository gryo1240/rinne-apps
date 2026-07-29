/* ============================================================
   visual.js － 店の「絵」
   ------------------------------------------------------------
   【写真について。ここは方針の話なので必ず読んでください】

   ご依頼には「店写真」を出すとありましたが、**写真は載せていません。**

   出典サイト（安城グルメガイド）の写真は、店名や営業時間のような事実情報と違い
   明確な著作物です。取得も転載もしない、というのがこのプロジェクトの前提で、
   HANDOFF-dev.md 第3章にも「紹介文と写真は取得も転載もしない」と書かれています。
   非公式サイトが無断で写真を載せると、いちばん困るのは掲載されているお店です。

   そのかわり、**カードが「絵として認識できる」状態は作ります。**
   ジャンルごとに色と文字を決めた図形を、その場で組み立てて出します。
   ・一目でジャンルが分かる（和＝オレンジ／珈＝緑／酒＝青）
   ・店ごとに違う模様になるので、同じ絵が並んで見分けがつかない、が起きない
   ・画像を1枚も読み込まないので、表示が速い（LCP に効く）

   【本物の写真を出せるようになったら】
   place.photo に URL が入っていれば、そちらを優先して表示します。
   入れてよいのは次のどちらかだけです。
     1. 安城市観光協会から許諾を得た写真
     2. 店舗自身から提供された写真（有料掲載などの形で）
   scripts/import_csv.py の photo 列から取り込めます。
   ============================================================ */
window.AGM = window.AGM || {};
AGM.ui = AGM.ui || {};

(function(){
"use strict";

var U = AGM.util, T = AGM.taxonomy;
var V = AGM.ui.visual = {};

/* 店ごとに安定した模様を作るための数値（同じ店なら毎回同じ絵になる） */
function hash(s){
  var h = 0, str = String(s);
  for(var i=0;i<str.length;i++){ h = (h*31 + str.charCodeAt(i)) | 0; }
  return Math.abs(h);
}

/* 大きさ違いで使うので size を渡せるようにしてある */
V.html = function(p, opts){
  opts = opts || {};
  var cls = "pvis" + (opts.size ? " is-"+opts.size : "");

  /* 本物の写真があるときだけ img を出す（許諾が取れたデータのみ） */
  if(p.photo){
    return '<div class="'+cls+'"><img src="'+U.esc(p.photo)+'" alt="" loading="lazy" '+
           'width="320" height="200"></div>';
  }

  var c = T.color(p.big);
  var h = hash(p.id + p.name);
  var angle = 100 + (h % 80);          // 100〜179度
  var dots  = h % 3;                   // 模様の種類を3つだけ用意する
  return '<div class="'+cls+'" style="--cc:'+c+';--pa:'+angle+'deg" data-pat="'+dots+'" '+
         'role="img" aria-label="'+U.esc(p.genre)+'のイメージ">'+
           '<span class="pg" aria-hidden="true">'+U.esc(p.glyph||"食")+'</span>'+
           '<span class="pl" aria-hidden="true">'+U.esc(p.genre)+'</span>'+
         '</div>';
};

/* 共有画像（canvas）でも同じ見た目を使う。
   share.js から呼ぶので、CSS ではなく描画命令として持っている。 */
V.paint = function(g, p, x, y, w, h){
  var COLORS = {"ごはん":"#eb6834","カフェ・甘いもの":"#199e70","居酒屋・バー":"#2a78d6"};
  var c = COLORS[p.big] || "#8a837a";
  var hs = hash(p.id + p.name);

  g.save();
  g.beginPath();
  var r = 10;
  g.moveTo(x+r,y); g.arcTo(x+w,y,x+w,y+h,r); g.arcTo(x+w,y+h,x,y+h,r);
  g.arcTo(x,y+h,x,y,r); g.arcTo(x,y,x+w,y,r); g.closePath();
  g.clip();

  g.fillStyle = c; g.fillRect(x,y,w,h);
  /* うっすら明るい帯を斜めに入れて、単色のべた塗りに見えないようにする */
  g.globalAlpha = 0.18; g.fillStyle = "#fff";
  for(var i=0;i<4;i++){
    g.beginPath();
    var off = (hs % 20) + i*(w/3);
    g.moveTo(x+off, y+h); g.lineTo(x+off+w*0.28, y);
    g.lineTo(x+off+w*0.40, y); g.lineTo(x+off+w*0.12, y+h);
    g.closePath(); g.fill();
  }
  g.globalAlpha = 1;

  g.fillStyle = "rgba(255,255,255,.95)";
  g.font = '700 '+Math.round(h*0.42)+'px "Hiragino Kaku Gothic ProN","Yu Gothic UI",Meiryo,sans-serif';
  g.textAlign = "center"; g.textBaseline = "middle";
  g.fillText(p.glyph||"食", x+w/2, y+h/2);
  g.restore();
  g.textAlign = "left"; g.textBaseline = "alphabetic";
};

})();

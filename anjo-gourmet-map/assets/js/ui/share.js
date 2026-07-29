/* ============================================================
   share.js － ルートの共有
   画像化（canvas）→ X／LINE／URLコピー／端末の共有シート
   ------------------------------------------------------------
   ・画像は端末の中だけで作る。どこにもアップロードしない。
   ・URL には候補の店IDと出発地が入るので、開いた人は同じルートを見られる。
   ・X の投稿画面には画像を直接添付できない（仕様）ので、
     画像を保存する導線を必ず添える。黙って落とさないこと。
   ============================================================ */
window.AGM = window.AGM || {};
AGM.ui = AGM.ui || {};

(function(){
"use strict";

var U = AGM.util, T = AGM.taxonomy;
var S = AGM.ui.share = {};

var W = 1200, H = 630;

/* 共有用のURL。候補の並び順まで復元できる */
S.url = function(){
  var ids = AGM.ui.plan.ids();
  var q = AGM.ui.filters.toQuery(ids.length ? {plan: ids.join(".")} : null);
  return U.absUrl("") + q;
};

S.text = function(){
  var shops = AGM.ui.plan.shops();
  var city = AGM.places.cityName();
  if(!shops.length) return city+"で今日どこに行くか、質問に答えるだけで決まります";
  var names = shops.slice(0,3).map(function(s){ return s.name; }).join("→");
  var km = AGM.ui.plan.totalKm();
  return "今日まわる順番（"+city+"）"+shops.length+"軒／"+names+
         (shops.length>3?"→…":"")+
         "／移動 約"+U.fmtDist(km)+"・徒歩なら約"+U.walkMin(km)+"分";
};

/* ---------- 画像を作る ---------- */
function roundRect(g,x,y,w,h,r){
  g.beginPath();
  g.moveTo(x+r,y); g.arcTo(x+w,y,x+w,y+h,r); g.arcTo(x+w,y+h,x,y+h,r);
  g.arcTo(x,y+h,x,y,r); g.arcTo(x,y,x+w,y,r); g.closePath();
}
function fit(g, text, max){
  var t=String(text);
  if(g.measureText(t).width<=max) return t;
  while(t.length>1 && g.measureText(t+"…").width>max) t=t.slice(0,-1);
  return t+"…";
}

/* 「今日まわる順番」を1枚の画像にする。
   入れるもの：店の絵（写真は権利上のせない）・店名・順路・所要時間・簡易マップ。
   写真の代わりに visual.paint() が作る絵を使う（visual.js の解説を参照）。 */
S.draw = function(canvas){
  var g = canvas.getContext("2d");
  canvas.width=W; canvas.height=H;
  var F='"Hiragino Kaku Gothic ProN","Yu Gothic UI",Meiryo,system-ui,sans-serif';
  var shops = AGM.ui.plan.shops().slice(0,4);
  var origin = AGM.ui.filters.origin();
  var city = AGM.places.cityName();
  var km = AGM.ui.plan.totalKm();

  /* 明るい配色で固定する。共有先（Xのタイムラインなど）は
     見る人の設定に関係なく白背景の上に並ぶため、暗い配色だと沈む。 */
  g.fillStyle="#faf7f3"; g.fillRect(0,0,W,H);
  g.fillStyle="#fbeee0"; g.beginPath(); g.arc(W-90,-40,300,0,Math.PI*2); g.fill();
  g.fillStyle="#e3f0e8"; g.beginPath(); g.arc(-60,H+40,240,0,Math.PI*2); g.fill();

  g.fillStyle="#b45309"; g.font="700 25px "+F;
  g.fillText("今日まわる順番｜"+city, 60, 74);

  g.fillStyle="#241d17"; g.font="900 44px "+F;
  var title = shops.length ? (city+"で"+AGM.ui.plan.count()+"軒めぐり") : (city+"のグルメを探す");
  g.fillText(fit(g,title,W-460), 60, 132);

  g.font="400 21px "+F; g.fillStyle="#6d6259";
  var meta = [];
  if(origin) meta.push("出発 "+origin.name);
  if(shops.length) meta.push("移動 約"+U.fmtDist(km));
  if(shops.length) meta.push("徒歩なら約"+U.walkMin(km)+"分");
  g.fillText(fit(g, meta.join("　／　") || "営業時間・定休日・駐車場つき", W-460), 60, 172);

  /* 左：お店のカード（絵つき） */
  var y=206, cardH=92, cardW=690;
  var COLORS={"ごはん":"#eb6834","カフェ・甘いもの":"#199e70","居酒屋・バー":"#2a78d6"};
  shops.forEach(function(s,i){
    g.fillStyle="#ffffff";
    roundRect(g,60,y,cardW,cardH-10,12); g.fill();

    AGM.ui.visual.paint(g, s, 70, y+8, 108, cardH-26);

    g.fillStyle=COLORS[s.big]||"#8a837a";
    g.beginPath(); g.arc(70+108+26, y+26, 16, 0, Math.PI*2); g.fill();
    g.fillStyle="#fff"; g.font="700 17px "+F; g.textAlign="center";
    g.fillText(String(i+1), 70+108+26, y+32); g.textAlign="left";

    g.fillStyle="#241d17"; g.font="700 25px "+F;
    g.fillText(fit(g,s.name,cardW-230), 70+108+52, y+34);
    g.fillStyle="#6d6259"; g.font="400 17px "+F;
    var m2 = [s.genre];
    if(s.hasParking) m2.push("駐車場あり");
    if(s.kid) m2.push("子連れOK");
    if(s.hours) m2.push(U.oneline(s.hours).slice(0,22));
    g.fillText(fit(g,m2.join("／"),cardW-190), 70+108+20, y+62);
    y += cardH;
  });

  if(AGM.ui.plan.count()>4){
    g.fillStyle="#6d6259"; g.font="400 18px "+F;
    g.fillText("ほか "+(AGM.ui.plan.count()-4)+"軒", 64, y+22);
  }

  /* 右：簡易マップ（順路を線で描く。地図タイルは読み込まない＝オフラインでも作れる） */
  drawMiniMap(g, W-400, 206, 340, 300, shops, origin);

  g.fillStyle="#6d6259"; g.font="400 19px "+F;
  g.fillText("質問に答えるだけで、今日行くお店が決まります", 60, H-58);
  g.font="400 16px "+F; g.fillStyle="#8a837a";
  g.fillText("個人が作成した非公式マップ／出典：安城グルメガイド（安城市観光協会）／店の絵はイメージです",
    60, H-28);
};

/* 座標を四角の中に収めて順路を描く。実際の地図画像は使わない。 */
function drawMiniMap(g, x, y, w, h, shops, origin){
  var pts = [];
  if(origin) pts.push({lat:origin.lat, lng:origin.lng, o:true});
  shops.forEach(function(s){ pts.push({lat:s.lat, lng:s.lng, big:s.big}); });

  g.fillStyle="#ffffff";
  roundRect(g,x,y,w,h,14); g.fill();
  g.strokeStyle="#e6ded4"; g.lineWidth=1; g.stroke();

  var F='"Hiragino Kaku Gothic ProN","Yu Gothic UI",Meiryo,sans-serif';
  g.fillStyle="#8a837a"; g.font="400 14px "+F;
  g.fillText("順路（直線距離のイメージ）", x+14, y+24);

  if(pts.length<1) return;
  var la=pts.map(function(p){ return p.lat; }), lo=pts.map(function(p){ return p.lng; });
  var minLa=Math.min.apply(null,la), maxLa=Math.max.apply(null,la);
  var minLo=Math.min.apply(null,lo), maxLo=Math.max.apply(null,lo);
  var pad=40, iw=w-pad*2, ih=h-pad*2-20;
  var dLa=(maxLa-minLa)||0.01, dLo=(maxLo-minLo)||0.01;
  function px(p){
    return { x: x+pad + ((p.lng-minLo)/dLo)*iw,
             y: y+pad+20 + (1-(p.lat-minLa)/dLa)*ih };
  }
  var xy = pts.map(px);

  if(xy.length>1){
    g.strokeStyle="#b45309"; g.lineWidth=2.5; g.setLineDash([7,6]);
    g.beginPath(); g.moveTo(xy[0].x, xy[0].y);
    for(var i=1;i<xy.length;i++) g.lineTo(xy[i].x, xy[i].y);
    g.stroke(); g.setLineDash([]);
  }
  var COLORS={"ごはん":"#eb6834","カフェ・甘いもの":"#199e70","居酒屋・バー":"#2a78d6"};
  xy.forEach(function(pt, i){
    var p=pts[i];
    if(p.o){
      g.fillStyle="#14110e";
      g.save(); g.translate(pt.x,pt.y); g.rotate(Math.PI/4);
      g.fillRect(-8,-8,16,16); g.restore();
      return;
    }
    var n = origin ? i : i+1;
    g.fillStyle=COLORS[p.big]||"#8a837a";
    g.beginPath(); g.arc(pt.x, pt.y, 15, 0, Math.PI*2); g.fill();
    g.strokeStyle="#fff"; g.lineWidth=3; g.stroke();
    g.fillStyle="#fff"; g.font="700 15px "+F; g.textAlign="center";
    g.fillText(String(n), pt.x, pt.y+5); g.textAlign="left";
  });
}

function toBlob(canvas){
  return new Promise(function(res){
    if(canvas.toBlob) canvas.toBlob(function(b){ res(b); }, "image/png");
    else res(null);
  });
}

/* ---------- 各操作 ---------- */
S.download = function(){
  var c = U.$("sharecanvas");
  toBlob(c).then(function(b){
    if(!b){ U.toast("この端末では画像を保存できません"); return; }
    var a=document.createElement("a");
    a.href=URL.createObjectURL(b);
    a.download="anjo-gourmet-route.png";
    document.body.appendChild(a); a.click();
    setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); }, 1500);
    U.toast("画像を保存しました");
  });
};

S.toX = function(){
  var u="https://twitter.com/intent/tweet?text="+encodeURIComponent(S.text()+"\n")+
        "&url="+encodeURIComponent(S.url())+"&hashtags="+encodeURIComponent("安城グルメ,安城市");
  window.open(u,"_blank","noopener");
};

S.toLine = function(){
  var u="https://line.me/R/msg/text/?"+encodeURIComponent(S.text()+"\n"+S.url());
  window.open(u,"_blank","noopener");
};

S.copy = function(){
  U.copy(S.url()).then(function(ok){
    U.toast(ok ? "URLをコピーしました" : "コピーできませんでした");
  });
};

/* 端末の共有シート。対応していればここが一番早い（画像も一緒に渡せる） */
S.native = function(){
  var c=U.$("sharecanvas");
  toBlob(c).then(function(b){
    var data = { title:"安城グルメ 店めぐりマップ", text:S.text(), url:S.url() };
    if(b && navigator.canShare){
      var f=new File([b],"anjo-gourmet-route.png",{type:"image/png"});
      if(navigator.canShare({files:[f]})) data.files=[f];
    }
    if(navigator.share) navigator.share(data).catch(function(){});
    else S.copy();
  });
};

S.open = function(){
  AGM.ui.dialog.open(U.$("sharesheet"));
  /* まず即座に描く。開いた直後に真っ白なカードが見えるのを防ぐため。
     そのうえで、レイアウトが確定してからもう一度描き直す
     （非表示のうちに描くと幅が取れない端末があるので、2回描くのは意図的）。 */
  S.draw(U.$("sharecanvas"));
  setTimeout(function(){ S.draw(U.$("sharecanvas")); }, 30);
  var box=U.$("shareurl");
  if(box) box.value=S.url();
  U.$("share-native").hidden = !navigator.share;
};

})();

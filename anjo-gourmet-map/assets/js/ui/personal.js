/* ============================================================
   personal.js － 自分の記録
   「行きたい」／最近見たお店／保存したまわる順番
   ------------------------------------------------------------
   【名前を変えた理由】
   「お気に入り」→「行きたい」に変えました。
   「お気に入り」は“もう好きだと決めている店”を入れる場所に感じられて、
   まだ行っていない店には押しにくい。「行きたい」なら気軽に押せます。
   押す心理的ハードルが下がるほど記録が増え、次に開いたときの価値が上がります。
   （保存キーは互換のため fav.v1 のままです。表示名だけを変えています）

   【ランキングを外した理由】
   以前あった「人気ランキング」は、アクセス数を集計していない以上サンプル表示にしかならず、
   さらに**見比べる材料が増えて決断が遅くなる**ものでした。
   このアプリの KPI は「決めるまでの時間」なので、外しています。
   代わりに「今日の気分から選ぶ」棚（shelf.js）が同じ役割を、
   1タップで3軒に直行する形で果たします。
   ============================================================ */
window.AGM = window.AGM || {};
AGM.ui = AGM.ui || {};

(function(){
"use strict";

var U = AGM.util, ST = AGM.store, C = AGM.ui.card;
var P = AGM.ui.personal = {};

function stripHtml(places){
  if(!places.length) return "";
  return '<ul class="strip">'+places.map(function(p){
    var st = AGM.shops.state(p);
    return '<li><a class="scard" href="'+U.esc(p.detailUrl)+'" data-detail="'+U.esc(p.id)+'">'+
      AGM.ui.visual.html(p)+
      '<b>'+U.esc(p.name)+'</b>'+
      '<span class="m">'+U.esc(p.genre)+'</span>'+
      '<span class="m"><span class="openbadge is-'+st.code+'">'+
        '<span class="dot" aria-hidden="true">'+st.sign+'</span>'+U.esc(st.label)+'</span></span>'+
    '</a></li>';
  }).join("")+'</ul>';
}

P.render = function(){
  /* 最近見たお店 */
  var hist = ST.history().map(AGM.shops.byId).filter(Boolean).slice(0,10);
  var hb = U.$("historybox");
  if(hb){
    hb.innerHTML = hist.length
      ? stripHtml(hist)
      : '<p class="hint">お店の詳細を開くと、ここに履歴が残ります（この端末の中だけ）。</p>';
    var hs = U.$("historysec");
    if(hs) hs.hidden = false;
  }

  /* 行きたい */
  var favs = ST.favs().map(AGM.shops.byId).filter(Boolean);
  var fb = U.$("favbox");
  if(fb){
    fb.innerHTML = favs.length
      ? '<ul class="list">'+favs.map(function(s){
          return C.html(s, {origin:AGM.ui.filters.origin(), plan:AGM.ui.plan.ids()});
        }).join("")+'</ul>'
      : '<p class="empty" style="font-size:13.5px">まだありません。<br>'+
        'おすすめカードの <b>♡ 行きたい</b> を押すと、ここにたまっていきます。</p>';
  }
  var fc=U.$("favcount"); if(fc) fc.textContent=favs.length;
  var nf=U.$("navfav-cnt");
  if(nf){ nf.textContent=favs.length; nf.hidden = favs.length===0; }

  /* 保存したまわる順番 */
  var sb = U.$("savedbox");
  if(sb){
    var routes = ST.routes();
    sb.innerHTML = routes.length
      ? '<ol class="rank">'+routes.map(function(r){
          return '<li><span class="rn"><b>'+U.esc(r.name)+'</b>'+
            '<span>'+r.ids.length+'軒'+(r.from?' ／ '+U.esc(r.from)+'から':'')+
            (r.km?' ／ 約'+r.km+'km':'')+' ／ '+U.esc(r.at)+'</span></span>'+
            '<span class="ra">'+
              '<button class="act" data-route="'+U.esc(r.id)+'">開く</button> '+
              '<button class="act" data-routedel="'+U.esc(r.id)+'" aria-label="このプランを削除">×</button>'+
            '</span></li>';
        }).join("")+'</ol>'
      : '<p class="hint">プランを作って「このプランを保存」を押すと、ここに並びます。</p>';
  }
};

})();

/* ============================================================
   shop-page.js － 店舗詳細ページ（/shop/xxxx/）用
   ------------------------------------------------------------
   ページの中身（店名・営業時間・住所・近くの店・構造化データ）は
   scripts/build_pages.py が**静的に**書き出している。
   検索エンジンにも、JSが動かない環境にも、そのまま読める状態にしてある。

   このファイルがやるのは「動きのある部分」だけ。
     ・いま営業中かどうかのバッジ
     ・今日まわる順番に追加／行きたい（トップと同じ localStorage を共有する）
     ・小さい地図（Leaflet の遅延読み込み）
     ・閲覧履歴への記録
   ============================================================ */
window.AGM = window.AGM || {};

(function(){
"use strict";

var U = AGM.util, T = AGM.taxonomy, ST = AGM.store;

function init(){
  var root = U.$("shoppage");
  if(!root) return;
  var id = root.getAttribute("data-shop-id");
  var s = AGM.shops.byId(id);
  if(!s) return;

  /* 閲覧履歴に残す（トップの「最近見た店舗」「おすすめ」に効く） */
  ST.pushHistory(id);

  /* 営業状態。1分ごとに見直す */
  function badge(){
    var el=U.$("openstate");
    if(!el) return;
    var st = AGM.shops.state(s);
    el.className = "openbadge is-"+st.code;
    el.innerHTML = '<span class="dot" aria-hidden="true">'+st.sign+'</span>'+U.esc(st.label);
    var sub=U.$("opensub");
    if(sub) sub.textContent = st.sub || "";
    var today=U.$("todayhours");
    if(today){
      var t = AGM.hours.todayText(s);
      today.textContent = t ? ("本日の営業時間 "+t) : "";
    }
  }
  badge();
  setInterval(badge, 60000);

  /* 今日まわる順番・行きたい */
  AGM.ui.plan.init(function(){ sync(); });
  function sync(){
    var pb=U.$("btn-plan");
    if(pb){
      var on=AGM.ui.plan.has(id);
      pb.classList.toggle("on", on);
      pb.textContent = on ? "✓ 入れた" : "＋ 今日まわる順番に入れる";
    }
    var fb=U.$("btn-fav");
    if(fb){
      var f=ST.isFav(id);
      fb.setAttribute("aria-pressed", f?"true":"false");
      fb.textContent = f ? "✓ 行きたい" : "♡ 行きたい";
    }
    var n=AGM.ui.plan.count();
    var c=U.$("plan-count");
    if(c){ c.textContent = n; c.hidden = n===0; }
  }
  sync();

  var pb=U.$("btn-plan");
  if(pb) pb.addEventListener("click", function(){
    var added=AGM.ui.plan.toggle(id);
    U.toast(added ? "今日まわる順番に入れました" : "まわる順番から外しました");
  });
  var fb=U.$("btn-fav");
  if(fb) fb.addEventListener("click", function(){
    var on=ST.toggleFav(id);
    sync();
    U.toast(on ? "「行きたい」に入れました" : "「行きたい」から外しました");
  });

  /* 地図。見えそうになってから Leaflet を読む（この1店だけ表示） */
  var mapEl=U.$("map");
  if(mapEl){
    var load=function(){
      var base=AGM.config.base;
      var css=document.createElement("link");
      css.rel="stylesheet"; css.href=base+"vendor/leaflet.css";
      document.head.appendChild(css);
      var js=document.createElement("script");
      js.src=base+"vendor/leaflet.js";
      js.onload=function(){
        mapEl.innerHTML="";
        var m=L.map(mapEl,{scrollWheelZoom:false}).setView([s.lat,s.lng],16);
        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png",{
          maxZoom:18,
          attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        }).addTo(m);
        L.marker([s.lat,s.lng],{
          icon:L.divIcon({className:"",
            html:'<div class="pin p" style="background:'+T.color(s.big)+'"></div>',
            iconSize:[19,19], iconAnchor:[10,10]})
        }).addTo(m).bindPopup("<b>"+U.esc(s.name)+"</b>");
        /* 近くの店も同じ地図に薄く出す。回遊のきっかけになる */
        AGM.shops.near(s,6).forEach(function(x){
          L.marker([x.shop.lat,x.shop.lng],{
            icon:L.divIcon({className:"",
              html:'<div class="pin" style="background:'+T.color(x.shop.big)+';opacity:.75"></div>',
              iconSize:[13,13], iconAnchor:[7,7]}),
            title:x.shop.name
          }).addTo(m).bindPopup('<b>'+U.esc(x.shop.name)+'</b><br>'+
            U.esc(x.shop.genre)+'<br><a href="'+U.esc(x.shop.detailUrl)+'">詳しく見る</a>');
        });
      };
      js.onerror=function(){ mapEl.innerHTML='<div class="map-ph">地図を読み込めませんでした</div>'; };
      document.head.appendChild(js);
    };
    var loaded=false;
    var loadOnce=function(){ if(!loaded){ loaded=true; load(); } };
    if(window.IntersectionObserver){
      var io=new IntersectionObserver(function(e){
        if(e.some(function(x){ return x.isIntersecting; })){ io.disconnect(); loadOnce(); }
      },{rootMargin:"300px"});
      io.observe(mapEl);
    }
    /* 保険：IntersectionObserver は**要素が非表示だと永久に発火しない**。
       CSS の指定ミスで右カラムが隠れていたときに地図が出ないままだったので、
       空き時間にも必ず読むようにしてある（実測で発見）。 */
    U.whenIdle(loadOnce, 2500);
  }

  /* 収益化の枠（既定では何も出ない） */
  if(AGM.ui.slots) AGM.ui.slots.render();
}

if(document.readyState==="loading") document.addEventListener("DOMContentLoaded", init);
else init();

})();

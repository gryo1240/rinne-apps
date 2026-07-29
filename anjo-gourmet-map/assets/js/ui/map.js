/* ============================================================
   map.js － 地図（Leaflet）
   ------------------------------------------------------------
   【パフォーマンス】
   Leaflet は 145KB ある。以前は最初から読み込んでいたため、
   文字が出るまでの時間（LCP）をこれが押さえ込んでいた。
   いまは **地図が視界に入りそうになってから** 読み込む。
   ・#map の高さは CSS で先に確保してあるので、あとから入っても
     ページがずれない（CLS が出ない）
   ・視界に入らないまま操作されたときのために、
     空き時間にも読み込む保険を入れてある
   ・「地図をクリックして指定」など、地図が要る操作からは ensure() で先に読む
   ============================================================ */
window.AGM = window.AGM || {};
AGM.ui = AGM.ui || {};

(function(){
"use strict";

var U = AGM.util, T = AGM.taxonomy, ST = AGM.store;
var M = AGM.ui.map = {};

var map=null, layer=null, routeLayer=null, originMarker=null, markers={};
var loading=null, ready=false, pending=null;

M.isReady = function(){ return ready; };
M.markers = function(){ return markers; };
M.routeLayer = function(){ return routeLayer; };

/* ---------- 読み込み ---------- */
function loadLeaflet(){
  if(loading) return loading;
  loading = new Promise(function(resolve, reject){
    if(window.L){ resolve(); return; }
    var base = AGM.config.base;
    var css=document.createElement("link");
    css.rel="stylesheet"; css.href=base+"vendor/leaflet.css";
    document.head.appendChild(css);
    var js=document.createElement("script");
    js.src=base+"vendor/leaflet.js";
    js.onload=function(){ resolve(); };
    js.onerror=function(){ reject(new Error("leaflet")); };
    document.head.appendChild(js);
  });
  return loading;
}

/* 地図を用意する。何度呼んでも1回しか作らない。 */
M.ensure = function(){
  return loadLeaflet().then(function(){
    if(ready) return;
    build();
    ready = true;
    if(pending){ M.draw(pending.rows, pending.opts); pending=null; }
  }).catch(function(){
    var el=U.$("map");
    if(el) el.innerHTML='<div class="map-ph">地図を読み込めませんでした。'+
      'リストからはすべての機能をお使いいただけます。</div>';
  });
};

function build(){
  var el=U.$("map");
  el.innerHTML="";
  map = L.map(el, {scrollWheelZoom:true, wheelPxPerZoomLevel:120});
  map.setView([34.96,137.08],13);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png",{
    maxZoom:18,
    attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  }).addTo(map);
  layer = L.layerGroup().addTo(map);
  routeLayer = L.layerGroup().addTo(map);

  map.on("click", function(e){
    if(!AGM.ui.filters.pickMode()) return;
    AGM.ui.filters.setOrigin({
      name:"地図で指定した地点", lat:e.latlng.lat, lng:e.latlng.lng,
      q:e.latlng.lat.toFixed(6)+","+e.latlng.lng.toFixed(6)
    });
    AGM.ui.filters.endPick();
  });
  M.map = map;
}

/* ---------- ピン ---------- */
function pinHtml(s, plan){
  var cls="pin", style="background:"+T.color(s.big);
  if(plan.indexOf(String(s.id))>=0) cls+=" p";
  if(ST.isVisited(s.id)) cls+=" v";
  if(AGM.shops.state(s).openNow) cls+=" open-now";
  return '<div class="'+cls+'" style="'+style+'"></div>';
}
function iconFor(s, plan){
  // 候補に入れたお店は、地図上でも回る順番の番号で示す
  var idx = plan.indexOf(String(s.id));
  if(idx>=0){
    return L.divIcon({className:"",
      html:'<div class="pinno" style="background:'+T.color(s.big)+'">'+(idx+1)+'</div>',
      iconSize:[26,26], iconAnchor:[13,13]});
  }
  return L.divIcon({className:"", html:pinHtml(s, plan), iconSize:[13,13], iconAnchor:[7,7]});
}
function plainIcon(cls,sz){
  return L.divIcon({className:"", html:'<div class="pin '+cls+'"></div>',
    iconSize:[sz,sz], iconAnchor:[sz/2,sz/2]});
}
M.iconFor = iconFor;

/* ---------- 描画 ---------- */
M.draw = function(rows, opts){
  opts = opts || {};
  if(!ready){ pending={rows:rows, opts:opts}; M.ensure(); return; }
  var plan = AGM.ui.plan.ids();
  layer.clearLayers(); markers={};

  rows.forEach(function(s){
    var m = L.marker([s.lat,s.lng],{icon:iconFor(s, plan), title:s.name}).addTo(layer);
    markers[s.id]=m;
    var st = AGM.shops.state(s);
    m.bindPopup(
      '<b>'+U.esc(s.name)+'</b><br>'+
      '<span style="color:'+T.color(s.big)+';font-weight:700">'+U.esc(s.genre)+'</span>'+
      ' <span class="openbadge is-'+st.code+'" style="font-size:11px;padding:0 7px">'+
        st.sign+' '+U.esc(st.label)+'</span>'+
      (s.hours?'<br>'+U.esc(U.oneline(s.hours)):'')+
      (s.closed?'<br>定休日：'+U.esc(s.closed):'')+
      '<div class="pop-acts">'+
        '<a href="'+U.esc(s.detailUrl)+'">詳しく見る</a>'+
        '<a href="'+U.gmapUrl(s, AGM.ui.filters.origin())+'" target="_blank" rel="noopener">Googleマップ</a>'+
        '<button data-plan="'+U.esc(s.id)+'">＋ プラン</button>'+
      '</div>'
    );
  });

  M.drawRoute();

  if(originMarker){ map.removeLayer(originMarker); originMarker=null; }
  var origin = AGM.ui.filters.origin();
  if(origin){
    originMarker = L.marker([origin.lat,origin.lng],{icon:plainIcon("o",20),title:origin.name})
      .addTo(map).bindPopup("<b>出発地：</b>"+U.esc(origin.name));
  }
  if(opts.fit && origin) map.setView([origin.lat,origin.lng], Math.max(map.getZoom(),13));
};

/* 出発地 →① →② … を線でつなぐ。候補の順番を地図でも分かるようにする。 */
M.drawRoute = function(){
  if(!ready) return;
  routeLayer.clearLayers();
  var plan = AGM.ui.plan.ids();
  if(plan.length < 1) return;
  var pts = [], origin = AGM.ui.filters.origin();
  if(origin) pts.push([origin.lat, origin.lng]);
  plan.forEach(function(id){ var s=AGM.shops.byId(id); if(s) pts.push([s.lat,s.lng]); });
  if(pts.length < 2) return;
  /* 順路の線だけは色をベタ書きしている。地図タイルは暗い配色でも明るいままなので、
     ここを --accent（暗い配色では明るいオレンジ）にすると、かえって見えにくくなる。
     ピンの色と違い CSS 変数から取らないのは意図的。 */
  L.polyline(pts,{color:"#14110e",weight:4,opacity:.35}).addTo(routeLayer);
  L.polyline(pts,{color:"#b45309",weight:2.5,opacity:.95,dashArray:"7 6"}).addTo(routeLayer);
};

/* プランを出し入れすると後ろの番号がずれるので、関係するピンをまとめて描き直す。
   patchSpot() だけでは番号の振り直しができない。 */
M.syncPlanMarkers = function(extraId){
  if(!ready) return;
  var plan = AGM.ui.plan.ids();
  var ids = plan.slice();
  if(extraId && ids.indexOf(String(extraId))<0) ids.push(String(extraId));
  ids.forEach(function(id){
    var s = AGM.shops.byId(id);
    if(s && markers[s.id]) markers[s.id].setIcon(iconFor(s, plan));
  });
  M.drawRoute();
};

M.refreshIcon = function(id){
  if(!ready) return;
  var s=AGM.shops.byId(id);
  if(s && markers[s.id]) markers[s.id].setIcon(iconFor(s, AGM.ui.plan.ids()));
};

M.focus = function(id, zoom){
  var s = AGM.shops.byId(id);
  if(!s) return;
  M.ensure().then(function(){
    map.setView([s.lat,s.lng], zoom||16);
    if(markers[s.id]) markers[s.id].openPopup();
    U.$("map").scrollIntoView({behavior:"smooth", block:"center"});
  });
};

M.fitAll = function(){
  if(!ready || !AGM.shops.ALL.length) return;
  map.fitBounds(L.latLngBounds(AGM.shops.ALL.map(function(s){ return [s.lat,s.lng]; })).pad(.05));
};

M.invalidate = function(){ if(ready && map) setTimeout(function(){ map.invalidateSize(); }, 60); };

/* ---------- 読み込みのきっかけ ---------- */
M.autoload = function(){
  var el = U.$("map");
  if(!el) return;
  if(window.IntersectionObserver){
    var io = new IntersectionObserver(function(entries){
      if(entries.some(function(e){ return e.isIntersecting; })){
        io.disconnect();
        M.ensure().then(function(){ M.fitAll(); });
      }
    }, {rootMargin:"400px"});
    io.observe(el);
  }
  /* 保険：視界に入らなくても、空いた時間に読んでおく。
     ここが無いと「地図を一度も見ずに候補だけ作った」場合に順路の線が出ない。 */
  U.whenIdle(function(){
    if(!ready) M.ensure().then(function(){ M.fitAll(); });
  }, 2500);
};

})();

/* ============================================================
   place.js － 場所（Place）のモデル
   ------------------------------------------------------------
   飲食店だけでなく、観光・イベント・ホテル・公園・温泉・買い物まで
   同じ形で扱えるようにするための層です。

   いまのデータ（data/shops.js）は飲食店専用の形をしているので、
   ここで **Place モデルへ翻訳** しています。
   別の自治体・別の領域のデータを足すときは
     ・data/places.<city>.js に同じ Place の形で置く
     ・または adapt() に変換を1つ足す
   だけで、リスト・地図・AI相談・共有はそのまま動きます。

   【重要】既存の shop オブジェクトを作り直さず、**同じオブジェクトに項目を足して**います。
   配列を2本持つと必ずどちらかが古くなるためです。
   AGM.shops.ALL と AGM.places.ALL は同じ配列を指しています。
   ============================================================ */
window.AGM = window.AGM || {};

(function(){
"use strict";

var U = AGM.util;
var C = window.AGM_CATEGORIES || {domains:[],groups:[],categories:[],features:[],scenes:[]};
var CITY = window.AGM_CITY || {name:"", pref:""};

var P = AGM.places = {};
P.CITY = CITY;
P.CATS = C;

/* ---------- 引き表 ---------- */
var catByLabel = {}, catById = {}, groupById = {}, featByRaw = {}, featById = {}, domById = {};
C.categories.forEach(function(x){ catByLabel[x.label]=x; catById[x.id]=x; });
C.groups.forEach(function(x){ groupById[x.id]=x; });
C.features.forEach(function(x){ featByRaw[x.raw]=x; featById[x.id]=x; });
C.domains.forEach(function(x){ domById[x.id]=x; });

P.category = function(id){ return catById[id]||null; };
P.group    = function(id){ return groupById[id]||null; };
P.feature  = function(id){ return featById[id]||null; };
P.domain   = function(id){ return domById[id]||null; };
P.activeDomains = function(){ return C.domains.filter(function(d){ return d.enabled; }); };

/* ---------- 翻訳 ----------
   飲食店データ（SHOP_DATA）→ Place。
   すでに Place の形で来ているデータは、そのまま通します。 */
function adapt(s){
  var cat = catByLabel[s.genre] || null;

  s.domain    = s.domain || "gourmet";
  s.catId     = cat ? cat.id : null;
  s.groupId   = cat ? cat.group : null;
  s.glyph     = cat ? cat.glyph : "食";

  /* 設備を id に正規化する。表示名は categories.js 側にあるので、
     画面のコピーを変えたいときはこのファイルを触らなくてよい。 */
  s.featureIds = (s.svc||[]).map(function(v){
    return featByRaw[v] ? featByRaw[v].id : null;
  }).filter(Boolean);
  s.hasFeature = function(id){ return this.featureIds.indexOf(id)>=0; };

  /* 席数。「14 席」「34席（テーブル席有）」のような書き方から最初の数字を取る */
  s.seatCount = U.money(s.seats);

  /* 写真は持っていない。
     【重要】出典サイトの写真は著作物なので取得も転載もしません（HANDOFF 第3章）。
     photo が入っているのは「その自治体・店舗が自前で用意した画像」を
     CSV などで渡されたときだけです。無ければ visual.js が代わりの絵を作ります。 */
  s.photo = s.photo || null;

  s.cityId = s.cityId || CITY.id;
  return s;
}

/* ---------- 読み込み ----------
   いまは AGM.shops.ALL（飲食店100件）だけ。
   将来 data/places.*.js を足したら、ここで concat すれば全画面に反映されます。 */
var ALL = (AGM.shops && AGM.shops.ALL) ? AGM.shops.ALL : [];
ALL.forEach(adapt);

/* 別領域のデータが読み込まれていれば足す（観光・イベントなど） */
if(window.AGM_PLACES && window.AGM_PLACES.length){
  window.AGM_PLACES.forEach(function(p){ ALL.push(adapt(p)); });
}

P.ALL = ALL;
P.byId = function(id){ return AGM.shops.byId(id); };

/* ---------- 絞り込みの部品 ---------- */
P.inDomain = function(id){
  return ALL.filter(function(p){ return p.domain===id; });
};
P.inGroup = function(id){
  return ALL.filter(function(p){ return p.groupId===id; });
};
P.inCategory = function(id){
  return ALL.filter(function(p){ return p.catId===id; });
};

/* 都市の表示名。「安城市ランチ」のような文言を組み立てるのに使う */
P.cityName = function(){ return CITY.name || ""; };
P.fill = function(text){
  return String(text||"").replace(/\{city\}/g, P.cityName())
                         .replace(/\{pref\}/g, CITY.pref||"");
};

})();

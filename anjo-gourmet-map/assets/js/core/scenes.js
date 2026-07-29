/* ============================================================
   scenes.js － シーン（ランチ／モーニング／子連れ…）の判定
   ------------------------------------------------------------
   categories.js に書いた rule を解釈するだけの小さな層です。
   ここで判定した結果を、次の3か所が同じように使います。

     1. ホームの横スクロールカード（今日営業中・ランチ・カフェ…）
     2. SEO のカテゴリページ（/c/lunch/ など）
     3. AI相談の答え → 条件への変換

   同じ判定を3か所に書かないための層なので、
   **画面側でシーンの条件を直接書かないこと。**
   ============================================================ */
window.AGM = window.AGM || {};

(function(){
"use strict";

var U = AGM.util;
var C = window.AGM_CATEGORIES;
var S = AGM.scenes = {};

var byId = {}, bySlug = {};
C.scenes.forEach(function(x){ byId[x.id]=x; bySlug[x.slug]=x; });

S.ALL = C.scenes;
S.get = function(id){ return byId[id]||null; };
S.bySlug = function(slug){ return bySlug[slug]||null; };
S.shelf = function(){ return C.scenes.filter(function(s){ return s.shelf; }); };

/* その店が、指定の時間帯に開いているか（曜日はきょう）。
   営業時間を読み取れなかった店は「分からない」＝ここでは通す。
   落としてしまうと、情報が少ないだけの店が全シーンから消えてしまうため。 */
function opensBetween(place, from, to, now){
  var hi = place._hi;
  if(!hi || !hi.parsed) return true;
  var d = now || U.nowJST();
  var rs = hi.byDay[d.getDay()];
  if(!rs.length) return false;
  for(var i=0;i<rs.length;i++){
    var r = rs[i];
    var e = (r.e==null) ? from+1 : r.e;    // 終わり未定は「開いている」側で見る
    if(r.s < to && e > from) return true;
  }
  return false;
}

/* rule を1つ評価する */
S.match = function(place, scene, now){
  var r = scene.rule || {};
  if(place.closedForGood) return false;          // 閉業した店はどのシーンにも出さない

  if(r.openBetween && !opensBetween(place, r.openBetween[0], r.openBetween[1], now)) return false;
  if(r.groups && r.groups.indexOf(place.groupId)<0) return false;
  if(r.categories && r.categories.indexOf(place.catId)<0) return false;
  if(r.parking && !place.hasParking) return false;
  if(r.features){
    for(var i=0;i<r.features.length;i++){
      if(place.featureIds.indexOf(r.features[i])<0) return false;
    }
  }
  if(r.anyFeature){
    var ok=false;
    r.anyFeature.forEach(function(f){ if(place.featureIds.indexOf(f)>=0) ok=true; });
    if(!ok) return false;
  }
  if(r.seatsMax!=null && !(place.seatCount!=null && place.seatCount<=r.seatsMax)) return false;
  if(r.seatsMin!=null && !(place.seatCount!=null && place.seatCount>=r.seatsMin)) return false;
  if(r.budgetMax!=null && !(place.budget!=null && place.budget<=r.budgetMax)) return false;
  if(r.hasBudget && place.budget==null && place.budgetDinner==null) return false;
  return true;
};

/* シーンに当てはまる店の一覧 */
S.places = function(sceneId, now){
  var scene = byId[sceneId];
  if(!scene) return [];
  var d = now || U.nowJST();
  return AGM.places.ALL.filter(function(p){ return S.match(p, scene, d); });
};

S.count = function(sceneId, now){ return S.places(sceneId, now).length; };

/* その店が当てはまるシーンの一覧（店舗ページの「関連ページ」に使う） */
S.of = function(place, now){
  var d = now || U.nowJST();
  return C.scenes.filter(function(s){ return S.match(place, s, d); });
};

/* ---------- 時間帯 ----------
   「いま」がどのシーンかを返す。ホームの並び順と、おすすめ理由の文面に使う。 */
S.nowScene = function(now){
  var d = now || U.nowJST();
  var m = d.getHours()*60 + d.getMinutes();
  if(m < 10*60+30) return "morning";
  if(m < 14*60+30) return "lunch";
  if(m < 17*60)    return "cafe";
  return "dinner";
};

/* 混雑の目安。
   【正直に】実際の混雑データは持っていません（サーバを持たない静的サイトのため）。
   ここで返すのは**時間帯からの一般的な目安**だけで、画面にもそう書いています。
   「空いています」と断定せず「ピークを外した時間帯です」という言い方にすること。 */
S.crowdHint = function(now){
  var d = now || U.nowJST();
  var m = d.getHours()*60 + d.getMinutes();
  var wend = (d.getDay()===0 || d.getDay()===6);
  if(m >= 12*60 && m < 13*60)  return { level:"peak",  text:"12時台はランチのピークです" };
  if(m >= 18*60 && m < 20*60)  return { level:"peak",  text:(wend?"週末の":"")+"夕食のピークの時間帯です" };
  if(m >= 14*60 && m < 17*60)  return { level:"calm",  text:"14〜17時はランチのピークを過ぎた時間帯です" };
  if(m >= 10*60 && m < 11*60+30) return { level:"calm", text:"開店直後で落ち着いて入りやすい時間帯です" };
  if(m >= 20*60+30)            return { level:"calm",  text:"遅めの時間で落ち着いて入りやすい時間帯です" };
  return { level:"normal", text:"" };
};

})();

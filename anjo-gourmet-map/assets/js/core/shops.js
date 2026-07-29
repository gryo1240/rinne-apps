/* ============================================================
   shops.js － 店舗データの読み込みと正規化
   window.SHOP_DATA（data/shops.js）を、画面が使いやすい形に整える。
   ここから先は「生データの書き方の揺れ」を意識しなくていい状態にする。
   ============================================================ */
window.AGM = window.AGM || {};

(function(){
"use strict";

var U = AGM.util, T = AGM.taxonomy;
var S = AGM.shops = {};

var DATA = window.SHOP_DATA || {};
var ALL = (DATA.items || []).filter(function(s){ return s.lat != null; });

ALL.forEach(function(s){
  /* 【罠】元データの住所はほとんどが市名なし（「三河安城本町1-1-8」）だが、
     100件中1件だけ「安城市朝日町1-1」と市名入りで登録されている。
     表示で「安城市」を頭に付けるので、そのままだと「安城市安城市朝日町…」になり、
     Googleマップに渡す文字列も壊れる。ここでも落としておく（取得側でも同じ処理をしている。
     前置きが無ければ何も起きないので、二重に通しても安全）。 */
  s.addr = String(s.addr||"").replace(/^\s*愛知県\s*/,"").replace(/^\s*安城市\s*/,"").trim();

  /* 1店1ジャンル（取得時に確認済み）。念のため配列でも文字列でも受ける。 */
  s.genre = Array.isArray(s.genres) ? (s.genres[0]||"その他") : (s.genres||"その他");
  s.big   = T.bigOf(s);
  s.svc   = s.services || [];

  /* 【罠】駐車場の値には「12台」「なし」のほかに
     「なし（「駅西駐車場」駐車券サービス最大2時間有）」という書き方が2件ある。
     「なし」を含むかどうかで判定しているので、この2件は「駐車場あり」に入らない（実測 90件）。
     ただし但し書きは利用者に有益なので、表示では元の文字をそのまま出すこと。 */
  s.hasParking = !!(s.parking && s.parking.indexOf("なし")<0);

  s.kid    = s.svc.indexOf("お子様連れ対応可能")>=0;

  /* 【実データで発見】店名に【閉業】が付いたまま、営業時間の欄は埋まっている店が2件ある。
     時間だけで判定すると「営業中」と出てしまうので、ここで印を付けておく（hours.js が最優先で見る）。 */
  s.closedForGood = /【?\s*(閉業|閉店)\s*】?/.test(s.name);
  s.budget = U.money(s.lunch);            // 並べ替え用（昼の下限）
  s.budgetDinner = U.money(s.dinner);

  /* 営業時間・定休日は先に解析しておく。100件でも一瞬で終わる（実測 数ミリ秒）。
     解析結果は hours.js が shop._hi / shop._ci に持たせる。 */
  s._hi = AGM.hours.parseHours(s.hours);
  s._ci = AGM.hours.parseClosed(s.closed);

  /* 検索用のインデックス。毎回つなぎ直すと入力のたびに重くなるので1回だけ作る */
  s._hay = (s.name+" "+(s.addr||"")+" "+s.genre+" "+s.big+" "+s.svc.join(" ")+" "+
            (s.tel||"")+" "+(s.hours||"")).toLowerCase();

  /* 店舗ページの場所。店舗ページ自身から読んでも正しく解決できるよう base を通す。
     href() は file:// で開いたときだけ index.html を足す（config.js 参照）。
     これを外すと、ダブルクリック起動でカードを押してもフォルダ一覧に飛びます。 */
  s.detailUrl = AGM.config.href(AGM.config.base + "shop/" + s.id + "/");
});

S.DATA = DATA;
S.ALL = ALL;
S.fetched = DATA.fetched || "";

var INDEX = {};
ALL.forEach(function(s){ INDEX[String(s.id)] = s; });
S.byId = function(id){ return INDEX[String(id)] || null; };

/* いまの営業状態（判定は hours.js） */
S.state = function(shop, now){ return AGM.hours.state(shop, now); };

/* ---------- ヒーローに出す数字 ----------
   すべて実データから数える。手で書いた数字を置かないこと（更新でずれるため）。 */
S.stats = function(){
  var n = ALL.length || 1;
  var withHours = ALL.filter(function(s){ return (s.hours||"").trim(); }).length;
  return {
    total: ALL.length,
    hoursRate: Math.round(withHours / n * 100),
    kids: ALL.filter(function(s){ return s.kid; }).length,
    parking: ALL.filter(function(s){ return s.hasParking; }).length,
    genres: (function(){ var g={}; ALL.forEach(function(s){ g[s.genre]=1; }); return Object.keys(g).length; })(),
    fetched: S.fetched
  };
};

/* いま営業中の店の数。ヒーローと絞り込みで使う */
S.openNowCount = function(now){
  var d = now || U.nowJST();
  return ALL.filter(function(s){ return S.state(s,d).openNow; }).length;
};

/* ---------- 近くの店 ---------- */
S.near = function(shop, n){
  return ALL
    .filter(function(s){ return s.id!==shop.id; })
    .map(function(s){ return {shop:s, d:U.km(shop.lat,shop.lng,s.lat,s.lng)}; })
    .sort(function(a,b){ return a.d-b.d; })
    .slice(0, n||6);
};

/* ---------- 新しく掲載された店 ----------
   元データに登録日は無い。公式サイトの店舗IDは登録順に振られているので、
   IDの大きい順を「新しく載った店」の目安として使う（推測であることは画面にも書く）。 */
S.recentlyAdded = function(n){
  return ALL.slice().sort(function(a,b){ return b.id-a.id; }).slice(0, n||8);
};

/* ---------- おすすめ（条件がそろっている店） ----------
   口コミや評価は持っていないので「人気」とは呼ばない。
   営業時間・駐車場・子連れ対応・予算など、**載っている情報の多さ**で並べる。
   何を根拠にしたかは画面にも出すこと。 */
S.wellDocumented = function(n){
  return ALL.slice().map(function(s){
    var score = 0;
    if((s.hours||"").trim()) score += 2;
    if(s._hi.parsed) score += 2;
    if((s.closed||"").trim()) score += 1;
    if(s.hasParking) score += 2;
    if(s.kid) score += 2;
    if(s.lunch) score += 1;
    if(s.dinner) score += 1;
    if(s.web) score += 1;
    score += Math.min(4, s.svc.length);
    return {shop:s, score:score};
  }).sort(function(a,b){
    return b.score-a.score || a.shop.name.localeCompare(b.shop.name,"ja");
  }).slice(0, n||10);
};

})();

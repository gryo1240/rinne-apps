/* ============================================================
   card.js － 店舗カード
   情報の優先順位（上から順に目に入るように並べる）
     1 店名
     2 営業中かどうか
     3 出発地／現在地からの距離
     4 駐車場
     5 子連れ
     6 営業時間
     7 定休日
     8 予算
   ボタンは Googleマップ → 今日まわる順番に入れる → 詳細 の順。
   ============================================================ */
window.AGM = window.AGM || {};
AGM.ui = AGM.ui || {};

(function(){
"use strict";

var U = AGM.util, T = AGM.taxonomy, ST = AGM.store;
var C = AGM.ui.card = {};

/* ---------- 営業状態バッジ ----------
   色だけで意味を伝えないこと。記号（●○—?）と文字ラベルを必ず一緒に出す。 */
C.openBadge = function(shop, now){
  var s = AGM.shops.state(shop, now);
  return '<span class="openbadge is-'+s.code+'">'+
           '<span class="dot" aria-hidden="true">'+s.sign+'</span>'+U.esc(s.label)+
         '</span>'+
         (s.sub ? '<span class="opensub">'+U.esc(s.sub)+'</span>' : '');
};

C.budgetText = function(shop){
  var a=[];
  if(shop.lunch) a.push("昼 "+shop.lunch);
  if(shop.dinner) a.push("夜 "+shop.dinner);
  return a.join(" ／ ");
};

/* ---------- 一覧のカード ---------- */
C.html = function(s, ctx){
  ctx = ctx || {};
  var origin = ctx.origin, plan = ctx.plan || [], now = ctx.now;
  var d = origin ? U.km(origin.lat,origin.lng,s.lat,s.lng) : null;
  var inPlan = plan.indexOf(String(s.id))>=0;
  var isFav = ST.isFav(s.id);
  var visited = ST.isVisited(s.id);
  var c = T.color(s.big);
  var gm = U.gmapUrl(s, origin);
  var bud = C.budgetText(s);

  /* 【罠】以前は id="spNN" を振っていたが、「行きたい」欄と「探す」の一覧に
     同じ店が同時に出ると **同じ id が2つ**できて HTML として不正だった。
     目印は data-id だけにして、更新は属性セレクタでまとめて当てる（実測で発見）。 */
  return '<li class="spot'+(visited?" visited":"")+(inPlan?" inplan":"")+
      '" data-id="'+U.esc(s.id)+'"'+
      ' style="--cc:'+c+';--cc-soft:'+T.soft(c)+'">'+

    /* 1 店名 */
    '<div class="spot-head">'+
      '<h3 class="sname"><a href="'+U.esc(s.detailUrl)+'" data-detail="'+U.esc(s.id)+'">'+
        U.esc(s.name)+'</a></h3>'+
      '<button class="favbtn" data-fav="'+U.esc(s.id)+'" aria-pressed="'+(isFav?"true":"false")+
        '" title="行きたい" aria-label="'+U.esc(s.name)+'を「行きたい」に入れる">'+
        (isFav?"★":"♡")+'</button>'+
    '</div>'+

    /* 2 営業中か　3 距離 */
    '<div class="statusrow">'+
      C.openBadge(s, now)+
      (d!==null?'<span class="dist">'+U.esc(U.fmtDist(d))+
        '<span class="visually-hidden">（出発地から）</span></span>':'')+
    '</div>'+

    /* 4 駐車場　5 子連れ　＋ ジャンル・予算 */
    '<div class="tags">'+
      '<span class="t cat">'+U.esc(s.genre)+'</span>'+
      (s.hasParking?'<span class="t park">駐車場あり</span>':'')+
      (s.kid?'<span class="t kid">子連れOK</span>':'')+
      (bud?'<span class="t money">'+U.esc(bud)+'</span>':'')+
      (s.seats?'<span class="t">'+U.esc(String(s.seats).replace(/\s+/g,""))+'</span>':'')+
    '</div>'+

    /* 6 営業時間　7 定休日 */
    '<div class="info">'+
      (s.hours?'<div><span class="k">営業時間</span><span class="v">'+U.esc(U.oneline(s.hours))+'</span></div>':'')+
      (s.closed?'<div><span class="k">定休日</span><span class="v closed">'+U.esc(s.closed)+'</span></div>':'')+
      /* 「なし（駅西駐車場の駐車券サービス…）」のような但し書きを落とさないため、
         絞り込みは hasParking で判定しつつ、表示は元の文字をそのまま出す */
      (s.parking?'<div><span class="k">駐車場</span><span class="v">'+U.esc(s.parking)+'</span></div>':'')+
      (s.svc.length?'<div><span class="k">設備</span><span class="v">'+U.esc(s.svc.join("／"))+'</span></div>':'')+
      (s.tel?'<div><span class="k">電話</span><span class="v"><a href="tel:'+U.esc(String(s.tel).replace(/[^\d+]/g,""))+'">'+U.esc(s.tel)+'</a></span></div>':'')+
    '</div>'+
    '<p class="addr">安城市'+U.esc(s.addr)+'</p>'+

    /* ボタン：Googleマップ → 候補へ追加 → 詳細 */
    '<div class="acts">'+
      '<a class="act gmap" href="'+gm+'" target="_blank" rel="noopener">Googleマップ</a>'+
      '<button class="act plan'+(inPlan?" on":"")+'" data-plan="'+U.esc(s.id)+'">'+
        (inPlan?"✓ 入れた":"＋ 今日まわる順番に入れる")+'</button>'+
      '<a class="act" href="'+U.esc(s.detailUrl)+'" data-detail="'+U.esc(s.id)+'">詳細</a>'+
      '<button class="act'+(visited?" on":"")+'" data-visit="'+U.esc(s.id)+'">'+
        (visited?"✓ 行った":"行った")+'</button>'+
      '<button class="act sub" data-here="'+U.esc(s.id)+'">ここを出発地に</button>'+
      '<button class="act sub" data-focus="'+U.esc(s.id)+'">地図で見る</button>'+
      '<a class="act sub" href="'+U.esc(s.url)+'" target="_blank" rel="noopener">公式の店舗ページ</a>'+
      (s.web?'<a class="act sub" href="'+U.esc(s.web)+'" target="_blank" rel="noopener">お店のサイト</a>':'')+
    '</div>'+
  '</li>';
};

/* ---------- 横スクロールの小さいカード ----------
   「最近見た」「新しく載った」「おすすめ」で使う */
C.mini = function(s, note){
  var c = T.color(s.big);
  var st = AGM.shops.state(s);
  return '<li><a class="minicard" href="'+U.esc(s.detailUrl)+'" data-detail="'+U.esc(s.id)+'"'+
    ' style="--cc:'+c+'">'+
    '<b>'+U.esc(s.name)+'</b>'+
    '<span class="m">'+U.esc(s.genre)+'</span>'+
    '<span class="m"><span class="openbadge is-'+st.code+'" style="padding:0 7px;font-size:11px">'+
      '<span class="dot" aria-hidden="true">'+st.sign+'</span>'+U.esc(st.label)+'</span></span>'+
    (note?'<span class="m">'+U.esc(note)+'</span>':'')+
  '</a></li>';
};

/* ---------- ランキングの1行 ---------- */
C.rankRow = function(s, note){
  return '<li>'+
    '<span class="rn"><b><a href="'+U.esc(s.detailUrl)+'" data-detail="'+U.esc(s.id)+'">'+
      U.esc(s.name)+'</a></b>'+
    '<span>'+U.esc(s.genre)+(note?" ／ "+U.esc(note):"")+'</span></span>'+
    '<span class="ra"><button class="act" data-plan="'+U.esc(s.id)+'">＋ プラン</button></span>'+
  '</li>';
};

})();

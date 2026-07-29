/* ============================================================
   shelf.js － ホームの横スクロールカード
   ------------------------------------------------------------
   質問に答えるほどでもない人のための、もう一本の近道です。
   「ランチ」を押した瞬間に、質問をとばして3軒が出ます。
   ＝ **1タップで決まる導線**。

   出す棚（categories.js の scenes で shelf:true のもの）
     いま営業中／いま空いていそう／モーニング／ランチ／カフェ／夜ご飯／
     スイーツ／テイクアウト／子連れ／デート

   【「いま空いていそう」について】
   混雑の実データは持っていません（サーバのない静的サイトのため）。
   時間帯からの目安だけを出し、棚の説明にもそう書いています。
   「空いています」と断定しないこと。
   ============================================================ */
window.AGM = window.AGM || {};
AGM.ui = AGM.ui || {};

(function(){
"use strict";

var U = AGM.util, SC = AGM.scenes;
var SH = AGM.ui.shelf = {};

/* シーン以外に、時間で決まる棚を2つ足す */
function specialShelves(now){
  var open = AGM.places.ALL.filter(function(p){
    return AGM.shops.state(p, now).openNow;
  });
  var crowd = SC.crowdHint(now);
  var out = [
    { id:"opennow", label:"今日いま営業中", icon:"🟢", places:open,
      note:"現在時刻と各店の営業時間・定休日から判定しています" }
  ];
  /* ピークを外した時間帯のときだけ「空いていそう」を出す。
     ピーク時に出すと嘘になるので、そのときは棚ごと出さない */
  if(crowd.level==="calm"){
    out.push({ id:"calm", label:"いま空いていそう", icon:"🍃",
      places: open.filter(function(p){ return p.seatCount==null || p.seatCount>=20; }),
      note: crowd.text+"（混雑の実データは持っていません。時間帯からの目安です）" });
  }
  return out;
}

/* 棚の中の並び順。**緑（営業中）→ 赤（営業時間外）→ 黄（要確認）→ 灰（定休日・閉業）**
   ばらばらの色が混ざっていると、目で拾い直すぶん決めるのが遅くなります。
   いま行ける店から順に並べれば、左から読むだけで候補が絞れます。
   ※ 棚に出すのは先頭12件なので、**切り取る前に並べ替えること**。
     あとから並べ替えると「営業中なのに棚に出てこない店」ができます。 */
var STATE_RANK = { open:0, closed:1, unknown:2, holiday:3 };
function byState(now){
  return function(a, b){
    var ra = STATE_RANK[AGM.shops.state(a, now).code];
    var rb = STATE_RANK[AGM.shops.state(b, now).code];
    if(ra === undefined) ra = 9;
    if(rb === undefined) rb = 9;
    return ra - rb;      // 同じ状態どうしは元の並びのまま（sort は安定）
  };
}

function shelfHtml(sh, now){
  if(!sh.places.length) return "";
  var items = sh.places.slice().sort(byState(now)).slice(0, 12);
  return '<section class="shelf" data-shelf="'+U.esc(sh.id)+'">'+
    '<div class="shelf-h">'+
      '<h3>'+(sh.icon?'<span aria-hidden="true">'+sh.icon+'</span> ':'')+U.esc(sh.label)+
        '<span class="n">'+sh.places.length+'</span></h3>'+
      '<button class="linkbtn" data-shelf-go="'+U.esc(sh.id)+'">この条件で3軒えらぶ →</button>'+
    '</div>'+
    (sh.note?'<p class="tiny shelf-note">'+U.esc(sh.note)+'</p>':'')+
    '<ul class="strip">'+ items.map(function(p){
      var st = AGM.shops.state(p, now);
      return '<li><a class="scard" href="'+U.esc(p.detailUrl)+'" data-detail="'+U.esc(p.id)+'">'+
        AGM.ui.visual.html(p)+
        '<b>'+U.esc(p.name)+'</b>'+
        '<span class="m">'+U.esc(p.genre)+'</span>'+
        '<span class="m"><span class="openbadge is-'+st.code+'">'+
          '<span class="dot" aria-hidden="true">'+st.sign+'</span>'+U.esc(st.label)+'</span></span>'+
      '</a></li>';
    }).join("") +'</ul>'+
  '</section>';
}

SH.render = function(){
  var box = U.$("shelves");
  if(!box) return;
  var now = U.nowJST();

  var list = specialShelves(now);
  SC.shelf().forEach(function(s){
    list.push({ id:s.id, label:s.label, icon:s.icon, places:SC.places(s.id, now),
                scene:true });
  });

  /* 【注意】list.map(shelfHtml) と書くと第2引数に**添字**が渡ってしまい、
     now のつもりが 0,1,2… になります。必ず包んで渡すこと。 */
  box.innerHTML = list.map(function(sh){ return shelfHtml(sh, now); }).join("");
};

/* 棚の「この条件で3軒えらぶ」→ 質問をとばして結果へ */
SH.go = function(id){
  var a = AGM.decide.defaults();
  var prev = AGM.ui.wizard.answers();
  a.origin = prev.origin;          // 出発地だけは引き継ぐ（毎回聞かない）

  if(id==="opennow"){ a.openNow = true; }
  else if(id==="calm"){ a.openNow = true; a.stay = "normal"; }
  else { a.scene = id; a.openNow = true; }

  /* goResult() → wizard の finish() → app.js の callback → reco.show という順で
     結果が出る。ここで先に reco.show を呼ぶと**同じ計算を2回**することになるので呼ばない。 */
  AGM.ui.wizard.setAnswers(a);
  AGM.ui.wizard.goResult();
  var el = U.$("recobox");
  if(el) el.scrollIntoView({behavior:"smooth", block:"start"});
};

})();

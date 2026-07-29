/* ============================================================
   filters.js － 検索と絞り込み
   ------------------------------------------------------------
   【設計の意図】
   以前は「検索・種類・ジャンル・条件・出発地・並び順」を全部いきなり出していた。
   項目が多すぎて、最初の画面で何をすればいいのか分からなかった。

   いまは
     ・最初に見えるのは **検索ボックスとよく使う3つの条件だけ**
     ・細かい条件は「絞り込み」ボタンで開くアコーディオン
   にしている。**機能は1つも減らしていない**（開けば全部ある）。
   ============================================================ */
window.AGM = window.AGM || {};
AGM.ui = AGM.ui || {};

(function(){
"use strict";

var U = AGM.util, T = AGM.taxonomy, ST = AGM.store;
var Fx = AGM.ui.filters = {};

var ALL = AGM.shops.ALL;

/* ---------- 駅データ（459駅・27KB）はあとから読む ----------
   使うのは最後の質問（出発地）と絞り込みの出発地欄だけなので、
   初回表示では読み込みません。入力欄に触れた瞬間に読みます。

   【注意】ここを `var STATIONS = window.STATION_DATA` の1行に戻さないこと。
   読み込み前は空配列なので、**あとから来たデータを取り込む口**が要ります。 */
var STATIONS = [];
var STATION_BY_NAME = {};
Fx.STATIONS = STATIONS;
Fx.STATION_BY_NAME = STATION_BY_NAME;

function adoptStations(){
  var src = window.STATION_DATA || [];
  if(!src.length || STATIONS.length) return false;
  src.forEach(function(s){ STATIONS.push(s); STATION_BY_NAME[s.n] = s; });
  fillStationList();
  return true;
}
Fx.stationsReady = function(){ return STATIONS.length>0; };

/* 出発地の入力欄に触れたら読む。読めたら候補（datalist）も作り直す。 */
Fx.ensureStations = function(cb){
  if(STATIONS.length){ if(cb) cb(); return; }
  if(window.STATION_DATA){ adoptStations(); if(cb) cb(); return; }
  U.withScript("data/stations.js", function(){ adoptStations(); if(cb) cb(); });
};

function fillStationList(){
  var dl=U.$("stationlist");
  if(!dl) return;
  dl.innerHTML="";
  var frag=document.createDocumentFragment();
  STATIONS.forEach(function(st){
    var o=document.createElement("option"); o.value=st.n; frag.appendChild(o);
  });
  dl.appendChild(frag);
  var ob=U.$("origin");
  if(ob && STATIONS.length){ ob.disabled=false; ob.placeholder="駅名を入力（例：安城）"; }
}

/* 【重要】ページが先に data/stations.js を読み込んでいる場合（/ai がそうです）は、
   ここで取り込むこと。これを忘れると、駅名を読み取る機能が黙って壊れます
   （「三河安城の近く」が認識されなくなりました）。 */
adoptStations();

/* 出発地の欄に触れた瞬間に読み込む（トップ・絞り込み・質問カードのどれでも） */
document.addEventListener("focusin", function(e){
  var id = e.target && e.target.id;
  if(id==="origin" || id==="wzstation") Fx.ensureStations();
});

/* 絞り込みの状態。URL とも同期する（共有・ブックマークできるように） */
var F = Fx.F = {
  q:"", big:null, genre:null, svc:null,
  parking:false, unvisited:false, openNow:false, fav:false,
  sort:"type"
};
var origin = null;
var pickMode = false;
var onChange = function(){};

Fx.origin = function(){ return origin; };
Fx.pickMode = function(){ return pickMode; };

/* ---------- 絞り込みの判定 ---------- */
Fx.match = function(s, now){
  if(F.big && s.big!==F.big) return false;
  if(F.genre && s.genre!==F.genre) return false;
  if(F.svc && s.svc.indexOf(F.svc)<0) return false;
  if(F.parking && !s.hasParking) return false;
  if(F.unvisited && ST.isVisited(s.id)) return false;
  if(F.fav && !ST.isFav(s.id)) return false;
  if(F.openNow && !AGM.shops.state(s, now).openNow) return false;
  if(F.q){
    var q = F.q.trim().toLowerCase();
    if(q){
      /* 「ラーメン」「パン」など、データに無い言い方でも引けるようにする */
      var alt = T.SYNONYM[F.q.trim()];
      if(s._hay.indexOf(q)<0 && !(alt && s._hay.indexOf(alt.toLowerCase())>=0)) return false;
    }
  }
  return true;
};

Fx.filtered = function(){
  var now = U.nowJST();
  return ALL.filter(function(s){ return Fx.match(s, now); });
};

/* 「いくつ条件が入っているか」。絞り込みボタンの数字に出す */
Fx.activeCount = function(){
  var n=0;
  if(F.big) n++; if(F.genre) n++; if(F.svc) n++;
  if(F.parking) n++; if(F.unvisited) n++; if(F.openNow) n++; if(F.fav) n++;
  return n;
};

/* ---------- 出発地 ---------- */
Fx.setOrigin = function(o, opts){
  opts = opts || {};
  origin = o;
  var box = U.$("origin");
  if(box){
    box.value = o ? o.name : "";
    box.classList.remove("needs");
  }
  var note = U.$("orignote");
  if(note) note.classList.remove("show");
  if(o && F.sort!=="dist"){
    F.sort="dist";
    var sel=U.$("sort"); if(sel) sel.value="dist";
  }
  onChange({origin:true, fit:!!o && opts.fit!==false});
};

/* 現在地（任意）。
   【前提】このアプリは GPS を必須にしない。出発地は駅名でも地図クリックでも指定できる。
   ここは「使いたい人だけが押すボタン」。押すまで位置情報は一切要求しない。 */
Fx.useGeolocation = function(cb){
  if(!navigator.geolocation){
    U.toast("この端末では現在地を取得できません");
    if(cb) cb(null);
    return;
  }
  U.toast("現在地を確認しています…");
  navigator.geolocation.getCurrentPosition(function(pos){
    var o = {
      name:"現在地", lat:pos.coords.latitude, lng:pos.coords.longitude,
      q: pos.coords.latitude.toFixed(6)+","+pos.coords.longitude.toFixed(6)
    };
    Fx.setOrigin(o);
    U.toast("現在地を出発地にしました");
    if(cb) cb(o);
  }, function(){
    /* 拒否されても行き止まりにしない。駅指定へ誘導して先へ進める */
    U.toast("現在地を取得できませんでした。駅名で指定してください");
    if(cb) cb(null);
  }, {enableHighAccuracy:false, timeout:8000, maximumAge:120000});
};

function applyOriginInput(){
  var box=U.$("origin"), v=box.value.trim();
  if(!v){ Fx.setOrigin(null); return; }
  /* 【重要】駅データ（27KB）はあとから読み込む。
     まだ来ていない段階で照合すると、実在する駅でも
     「その駅は見つかりません」と**嘘の案内**を出してしまいます。
     読み込みを待ってからもう一度ここへ来ること。 */
  if(!STATIONS.length){
    Fx.ensureStations(function(){ applyOriginInput(); });
    return;
  }
  var st=STATION_BY_NAME[v] || STATION_BY_NAME[v+"駅"];
  if(st){ Fx.setOrigin({name:st.n,lat:st.lat,lng:st.lng,q:st.n}); return; }
  if(origin && origin.name===v) return;
  box.classList.add("needs");
  /* 駅データは愛知県のみ。文言もそれに合わせる（姉妹アプリからの写し間違いに注意） */
  var note=U.$("orignote");
  note.textContent="← その駅は見つかりません（愛知県の駅名を入力してください）";
  note.classList.add("show");
}

/* ---------- チップの生成 ----------
   件数や並びは**データから作る**。手で並べないこと（データ更新でずれるため）。 */
function buildChips(){
  var bigs = T.BIG_ORDER.filter(function(b){
    return ALL.some(function(s){ return s.big===b; }); });
  U.$("bigchips").innerHTML = bigs.map(function(b){
    var col=T.color(b);
    return '<button class="chip cc" data-f="big" data-v="'+U.esc(b)+'" aria-pressed="false" '+
           'style="--cc:'+col+';--cc-soft:'+T.soft(col)+'">'+U.esc(b)+'</button>';
  }).join(" ");

  var genres=[];
  ALL.forEach(function(s){ if(genres.indexOf(s.genre)<0) genres.push(s.genre); });
  genres.sort(function(a,b){
    var ia=T.GENRE_ORDER.indexOf(a), ib=T.GENRE_ORDER.indexOf(b);
    return (ia<0?99:ia)-(ib<0?99:ib);
  });
  U.$("genrechips").innerHTML = genres.map(function(g){
    var n = ALL.filter(function(s){ return s.genre===g; }).length;
    return '<button class="chip" data-f="genre" data-v="'+U.esc(g)+'" aria-pressed="false" '+
      'title="'+U.esc(g)+'（'+n+'件）">'+U.esc(g)+'</button>';
  }).join(" ");

  var cnt={};
  ALL.forEach(function(s){ s.svc.forEach(function(v){ cnt[v]=(cnt[v]||0)+1; }); });
  var svcs=Object.keys(cnt).sort(function(a,b){ return cnt[b]-cnt[a]; });
  U.$("svcchips").innerHTML = svcs.map(function(v){
    return '<button class="chip" data-f="svc" data-v="'+U.esc(v)+'" aria-pressed="false" '+
      'title="'+U.esc(v)+'（'+cnt[v]+'件）">'+U.esc(T.SVC_SHORT[v]||v)+'</button>';
  }).join(" ");

  /* 駅の候補はデータが来てから作る（fillStationList）。
     まだ読んでいない段階では、入力欄に「触れると読み込む」と分かる表示にしておく。 */
  if(!STATIONS.length){
    var ob=U.$("origin");
    if(ob && !ob.value) ob.placeholder="駅名を入力（例：安城）";
  }else{
    fillStationList();
  }
}

Fx.sync = function(){
  U.all(".chip[data-f]").forEach(function(c){
    var f=c.getAttribute("data-f"), v=c.getAttribute("data-v");
    var on=(f==="big"||f==="genre"||f==="svc") ? F[f]===v : !!F[f];
    c.setAttribute("aria-pressed", on?"true":"false");
  });
  var n=Fx.activeCount(), badge=U.qs("#filtoggle .n");
  if(badge){ badge.textContent=n; badge.hidden = n===0; }
  var clr=U.$("qclear"); if(clr) clr.hidden = !F.q;
};

/* チップを押したときの分岐。ここは過去に不具合が出た場所なので慎重に。 */
Fx.toggleChip = function(f, v){
  if(f==="big"||f==="genre"||f==="svc"){ F[f]=(F[f]===v)?null:v; }
  else { F[f]=!F[f]; }
  // ジャンルを選んだら、種類はそのジャンルの大分類に自動で寄せる
  if(f==="genre" && F.genre) F.big = T.BIG_OF[F.genre] || null;
  /* 【罠】種類を「別の種類に切り替えた」ときだけ、合わなくなったジャンルを外す。
     F.big が null（＝種類を解除しただけ）のときにも外すと、
     「和食」を選んで自動で押された「ごはん」を解除しただけで
     ジャンルまで消えて全100件に戻ってしまう（実測で発見）。 */
  if(f==="big" && F.big && F.genre && T.BIG_OF[F.genre]!==F.big) F.genre=null;
  Fx.sync();
  onChange({});
};

Fx.reset = function(){
  F.q=""; F.big=null; F.genre=null; F.svc=null;
  F.parking=false; F.unvisited=false; F.openNow=false; F.fav=false;
  var q=U.$("q"); if(q) q.value="";
  Fx.sync();
  onChange({});
};

/* ---------- URL との同期 ----------
   条件つきの一覧をそのまま人に渡せるようにする（回遊とSEOの両方に効く）。 */
Fx.toQuery = function(extra){
  var o = {};
  if(F.q) o.q=F.q;
  if(F.big) o.big=F.big;
  if(F.genre) o.genre=F.genre;
  if(F.svc) o.svc=F.svc;
  if(F.parking) o.parking=1;
  if(F.openNow) o.open=1;
  if(F.fav) o.fav=1;
  if(F.sort && F.sort!=="type") o.sort=F.sort;
  if(origin && origin.name!=="地図で指定した地点") o.from=origin.name;
  if(extra) Object.keys(extra).forEach(function(k){ o[k]=extra[k]; });
  return U.buildQuery(o);
};

Fx.fromQuery = function(p){
  if(p.q){ F.q=p.q; var q=U.$("q"); if(q) q.value=p.q; }
  if(p.big) F.big=p.big;
  if(p.genre){ F.genre=p.genre; if(!p.big) F.big=T.BIG_OF[p.genre]||null; }
  if(p.svc) F.svc=p.svc;
  if(p.parking) F.parking=true;
  if(p.open) F.openNow=true;
  if(p.fav) F.fav=true;
  if(p.sort) F.sort=p.sort;
  var sel=U.$("sort"); if(sel) sel.value=F.sort;
  if(p.from && STATION_BY_NAME[p.from]){
    var st=STATION_BY_NAME[p.from];
    origin={name:st.n,lat:st.lat,lng:st.lng,q:st.n};
    var box=U.$("origin"); if(box) box.value=st.n;
  }
};

/* ---------- 組み立て ---------- */
Fx.init = function(cb){
  onChange = cb || function(){};
  buildChips();

  var q = U.$("q");
  /* 入力のたびに100件を作り直すと、打っている途中で引っかかる。
     150ms 待ってからまとめて描く（体感が明らかに変わる） */
  var onType = U.debounce(function(){ F.q=q.value; Fx.sync(); onChange({}); }, 150);
  q.addEventListener("input", function(){
    U.$("qclear").hidden = !this.value;   // ×ボタンの出し入れは待たずに即
    onType();
  });
  U.$("qclear").addEventListener("click", function(){
    q.value=""; F.q=""; this.hidden=true; Fx.sync(); onChange({}); q.focus();
  });

  var tog = U.$("filtoggle"), panel = U.$("filterpanel");
  tog.addEventListener("click", function(){
    var open = this.getAttribute("aria-expanded")==="true";
    this.setAttribute("aria-expanded", open?"false":"true");
    panel.hidden = open;
    if(!open) ST.setSetting("filtersOpen", true); else ST.setSetting("filtersOpen", false);
  });
  if(ST.settings().filtersOpen){
    tog.setAttribute("aria-expanded","true"); panel.hidden=false;
  }

  U.$("sort").addEventListener("change", function(){
    F.sort=this.value;
    var need=(this.value==="dist" && !origin);
    var note=U.$("orignote");
    note.textContent="← 先に出発地を決めてください";
    note.classList.toggle("show", need);
    U.$("origin").classList.toggle("needs", need);
    if(need){
      // 絞り込みが閉じていると入力欄が見えないので開く
      if(panel.hidden){ tog.click(); }
      U.$("origin").focus();
    }
    onChange({});
  });

  U.$("origin").addEventListener("change", applyOriginInput);
  U.$("origin").addEventListener("input", function(){
    if(STATION_BY_NAME[this.value.trim()]) applyOriginInput();
  });
  U.$("originclear").addEventListener("click", function(){ Fx.setOrigin(null); });
  U.$("geoloc").addEventListener("click", function(){ Fx.useGeolocation(); });

  U.$("pickmap").addEventListener("click", function(){
    pickMode=!pickMode;
    this.setAttribute("aria-pressed", pickMode?"true":"false");
    this.textContent = pickMode?"地図をクリックしてください…":"地図をクリックして指定";
    if(pickMode){
      AGM.ui.map.ensure();
      U.$("map").scrollIntoView({behavior:"smooth", block:"center"});
    }
  });
  Fx.endPick = function(){
    pickMode=false;
    var b=U.$("pickmap");
    b.setAttribute("aria-pressed","false");
    b.textContent="地図をクリックして指定";
  };

  U.$("reset").addEventListener("click", Fx.reset);
};

})();

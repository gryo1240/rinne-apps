/* ============================================================
   app.js － 画面の組み立て
   各モジュールをつなぐだけの層。ここにロジックを書かないこと。
   （決める＝decide／絞り込み＝filters／営業判定＝hours／保存＝store）

   【この画面の思想】
   最初に出すのは一覧ではなく質問です。
   「探す」タブ（従来の検索・地図・一覧）は残していますが、
   初期表示では出しません。**一覧が見えると人は見比べはじめて、決まらなくなる**ためです。
   ============================================================ */
window.AGM = window.AGM || {};

(function(){
"use strict";

var U = AGM.util, T = AGM.taxonomy, ST = AGM.store, C = AGM.ui.card;
var Fx = AGM.ui.filters, M = AGM.ui.map, PL = AGM.ui.plan;
var App = AGM.app = {};

var ALL = AGM.shops.ALL;
var collapsed = {}, highlighted = null;

/* ---------- 一覧（「探す」タブ） ---------- */
function sortRows(rows){
  var origin = Fx.origin();
  if(Fx.F.sort==="dist" && origin){
    rows.sort(function(a,b){
      return U.km(origin.lat,origin.lng,a.lat,a.lng)-U.km(origin.lat,origin.lng,b.lat,b.lng); });
  }else if(Fx.F.sort==="budget"){
    // 予算が載っていない店は最後にまとめる（0円として先頭に来ると誤解を招く）
    rows.sort(function(a,b){
      var x=a.budget, y=b.budget;
      if(x==null && y==null) return a.name.localeCompare(b.name,"ja");
      if(x==null) return 1;
      if(y==null) return -1;
      return x-y || a.name.localeCompare(b.name,"ja");
    });
  }else if(Fx.F.sort==="open"){
    var now=U.nowJST();
    var rank={open:0, unknown:1, closed:2, holiday:3};
    rows.sort(function(a,b){
      var ra=rank[AGM.shops.state(a,now).code], rb=rank[AGM.shops.state(b,now).code];
      return ra-rb || a.name.localeCompare(b.name,"ja");
    });
  }else{
    rows.sort(function(a,b){ return a.name.localeCompare(b.name,"ja"); });
  }
  return rows;
}

App.render = function(){
  var box = U.$("listbox");
  if(!box) return;
  var rows = Fx.filtered();
  var ctx = {origin:Fx.origin(), plan:PL.ids(), now:U.nowJST()};
  var cntEl = U.$("cnt");
  if(cntEl) cntEl.textContent = rows.length;

  var html="";
  if(!rows.length){
    html='<div class="card empty">条件に合うお店がありません。<br>'+
         '<button class="btn ghost" id="empty-reset" style="margin-top:10px">条件をクリアする</button></div>';
  } else if(Fx.F.sort==="type"){
    var groups={}, order=[];
    rows.forEach(function(s){
      var k = s.big==="ごはん" ? ("ごはん － "+s.genre) : s.big;
      if(!groups[k]){ groups[k]=[]; order.push(k); }
      groups[k].push(s);
    });
    var rank={};
    T.GROUP_ORDER.forEach(function(k,i){ rank[k]=i; });
    order.sort(function(a,b){
      var ra=rank[a]!=null?rank[a]:9, rb=rank[b]!=null?rank[b]:9;
      return ra!==rb ? ra-rb : a.localeCompare(b,"ja");
    });
    var origin=Fx.origin();
    order.forEach(function(k){
      var g=groups[k];
      if(origin) g.sort(function(a,b){
        return U.km(origin.lat,origin.lng,a.lat,a.lng)-U.km(origin.lat,origin.lng,b.lat,b.lng); });
      var open=!collapsed[k];
      html+='<button class="groupttl" data-group="'+U.esc(k)+'" data-key="'+U.esc(k)+
              '" aria-expanded="'+(open?"true":"false")+'">'+
              '<span class="ar" aria-hidden="true">▼</span>'+U.esc(k)+
              '<span class="n">'+g.length+'</span></button>'+
            '<ul class="list" data-key="'+U.esc(k)+'"'+(open?"":" hidden")+'>'+
              g.map(function(s){ return C.html(s, ctx); }).join("")+'</ul>';
    });
  } else {
    html='<ul class="list">'+sortRows(rows).map(function(s){ return C.html(s, ctx); }).join("")+'</ul>';
  }
  box.innerHTML = html;
  document.body.classList.add("ready");
  highlighted = null;

  M.draw(rows, {});
  PL.render();
};

/* 全体を作り直さず、そのカードとピンだけ更新する（リストがガタつかない） */
function patchSpot(id){
  var s=AGM.shops.byId(id); if(!s) return;
  U.all('li.spot[data-id="'+id+'"]').forEach(function(li){
    var inPlan = PL.has(id), visited = ST.isVisited(id);
    li.classList.toggle("visited", visited);
    li.classList.toggle("inplan", inPlan);
    var vb=li.querySelector("[data-visit]");
    if(vb){ vb.classList.toggle("on", visited);
      vb.textContent = visited?"✓ 行った":"行った"; }
    var pb=li.querySelector("[data-plan]");
    if(pb){ pb.classList.toggle("on", inPlan);
      pb.textContent = inPlan?"✓ 入れた":"＋ 今日まわる順番に入れる"; }
    var fb=li.querySelector("[data-fav]");
    if(fb){ var f=ST.isFav(id);
      fb.setAttribute("aria-pressed", f?"true":"false");
      fb.textContent = f?"★":"♡"; }
  });
  /* おすすめカード側のボタンも合わせる */
  U.all('.reco[data-id="'+id+'"]').forEach(function(el){
    var pb=el.querySelector("[data-plan]");
    if(pb){ var on=PL.has(id);
      pb.classList.toggle("on", on);
      pb.textContent = on?"✓ 入れた":"＋ 今日まわる順番に入れる"; }
    var fb=el.querySelector("[data-fav]");
    if(fb){ var f=ST.isFav(id);
      fb.setAttribute("aria-pressed", f?"true":"false");
      fb.classList.toggle("on", f);
      fb.textContent = f?"✓ 行きたい":"♡ 行きたい"; }
  });
  M.refreshIcon(id);
}
App.patchSpot = patchSpot;

/* ---------- URL との同期 ---------- */
var syncUrl = U.debounce(function(){
  if(!window.history || !history.replaceState) return;
  var ids = PL.ids();
  var q = Fx.toQuery(ids.length ? {plan:ids.join(".")} : null);
  try{ history.replaceState(null, "", q || location.pathname); }catch(e){}
}, 400);

/* ---------- 変更の受け口 ---------- */
function onChange(info){
  info = info || {};
  if(info.id!=null){
    patchSpot(info.id);
    M.syncPlanMarkers(info.id);
    PL.render();
  }else if(info.cleared){
    info.cleared.forEach(patchSpot);
    M.syncPlanMarkers();
    PL.render();
  }else if(info.reorder){
    M.syncPlanMarkers();
    PL.render();
  }else if(info.full){
    PL.render();
    U.all("li.spot,.reco").forEach(function(el){
      var id = el.getAttribute("data-id");
      if(id) patchSpot(id);
    });
    M.syncPlanMarkers();
  }else{
    App.render();
    if(info.origin && info.fit && M.isReady()) M.draw(Fx.filtered(), {fit:true});
  }
  syncUrl();
}

/* ---------- イベント ---------- */
document.addEventListener("click", function(e){
  var t = e.target.closest ? e.target.closest(
    "[data-visit],[data-plan],[data-unplan],[data-here],[data-focus],[data-group],[data-act],"+
    "[data-fav],[data-detail],[data-route],[data-routedel],[data-shelf-go],[data-reco],"+
    "[data-reco-swap],[data-reco-need],[data-tabgo],[data-scene-go],.chip") : null;
  if(!t) return;

  if(t.hasAttribute("data-detail")){
    ST.pushHistory(t.getAttribute("data-detail"));
    return;   // 既定のリンク遷移はそのまま
  }
  if(t.hasAttribute("data-tabgo")){
    e.preventDefault();
    AGM.ui.nav.go(t.getAttribute("data-tabgo"));
    return;
  }
  if(t.hasAttribute("data-shelf-go")){ AGM.ui.shelf.go(t.getAttribute("data-shelf-go")); return; }
  if(t.hasAttribute("data-scene-go")){
    var sid = t.getAttribute("data-scene-go");
    AGM.ui.nav.go("home", {silent:true});
    AGM.ui.shelf.go(sid);
    return;
  }
  if(t.hasAttribute("data-reco-swap")){ AGM.ui.reco.swap(t.getAttribute("data-reco-swap")); return; }
  /* 結果画面の「条件を足す」。質問カードには戻さず、その場で3軒を作り直す。
     .chip も拾うセレクタなので、絞り込みタブの chip 処理より**先に**返すこと。 */
  if(t.hasAttribute("data-reco-need")){
    AGM.ui.reco.toggleNeed(t.getAttribute("data-reco-need"));
    return;
  }
  if(t.hasAttribute("data-reco")){
    if(t.getAttribute("data-reco")==="all") AGM.ui.reco.addAll();
    return;
  }
  if(t.hasAttribute("data-fav")){
    var fid=t.getAttribute("data-fav");
    var on=ST.toggleFav(fid);
    patchSpot(fid);
    AGM.ui.personal.render();
    U.toast(on?"「行きたい」に入れました":"「行きたい」から外しました");
    if(Fx.F.fav) App.render();
    return;
  }
  if(t.hasAttribute("data-visit")){
    var id=t.getAttribute("data-visit");
    ST.toggleVisited(id);
    if(Fx.F.unvisited) App.render(); else patchSpot(id);
    return;
  }
  if(t.hasAttribute("data-plan")){ PL.toggle(t.getAttribute("data-plan")); return; }
  if(t.hasAttribute("data-unplan")){ PL.remove(t.getAttribute("data-unplan")); return; }
  if(t.hasAttribute("data-here")){
    var s=AGM.shops.byId(t.getAttribute("data-here"));
    if(s) Fx.setOrigin({name:s.name,lat:s.lat,lng:s.lng,q:U.gq(s)});
    return;
  }
  if(t.hasAttribute("data-focus")){
    /* 【罠】「行きたい」タブでは右カラム（地図）が隠れているので、
       そのまま focus しても何も起きなかった。先に地図の見える画面へ移す（実測で発見）。 */
    if(AGM.ui.nav.current()!=="search") AGM.ui.nav.go("search", {silent:true});
    M.focus(t.getAttribute("data-focus"));
    return;
  }
  if(t.hasAttribute("data-group")){
    var key=t.getAttribute("data-group");
    var ul=document.querySelector('ul.list[data-key="'+key+'"]');
    if(collapsed[key]) delete collapsed[key]; else collapsed[key]=1;
    var open=!collapsed[key];
    if(ul) ul.hidden=!open;
    t.setAttribute("aria-expanded", open?"true":"false");
    return;
  }
  if(t.hasAttribute("data-route")){
    var r = ST.routes().filter(function(x){ return x.id===t.getAttribute("data-route"); })[0];
    if(r){
      PL.set(r.ids, "保存したプラン「"+r.name+"」を開きました。");
      U.toast("プランを開きました");
      AGM.ui.dialog.open(U.$("sheet"));
    }
    return;
  }
  if(t.hasAttribute("data-routedel")){
    if(confirm("この保存プランを消します。よろしいですか？")){
      ST.removeRoute(t.getAttribute("data-routedel"));
      AGM.ui.personal.render();
    }
    return;
  }
  if(t.hasAttribute("data-act")){
    var a=t.getAttribute("data-act");
    if(a==="opt") PL.optimize();
    else if(a==="clear") PL.clear();
    /* 共有（canvas での画像生成つき・9.7KB）は押されるまで読まない */
    else if(a==="share") U.withScript("assets/js/ui/share.js", function(){ AGM.ui.share.open(); });
    else if(a==="saveroute") PL.save();
    else if(a==="ai"){ AGM.ui.dialog.close(U.$("sheet")); AGM.ui.nav.go("home"); restart(); }
    return;
  }
  if(t.classList.contains("chip") && t.hasAttribute("data-f")){
    Fx.toggleChip(t.getAttribute("data-f"), t.getAttribute("data-v"));
    return;
  }
});

/* 質問のやり直し */
function restart(){
  AGM.ui.wizard.reset();
  var box=U.$("recobox"); if(box) box.innerHTML="";
  var w=U.$("wizard"); if(w) w.scrollIntoView({behavior:"smooth", block:"center"});
}
App.restart = restart;

document.addEventListener("click", function(e){
  if(e.target && e.target.id==="empty-reset") Fx.reset();
  var w = e.target.closest && e.target.closest('[data-wz="restart"]');
  if(w){ AGM.ui.nav.go("home", {silent:true}); restart(); }
});

/* ---------- 初期化 ---------- */
function init(){
  if(!ALL.length){
    var lb=U.$("listbox");
    if(lb) lb.innerHTML='<div class="card empty">'+
      'データが読み込めませんでした。<br><code>python scripts/fetch_data.py</code> を実行して '+
      '<code>data/shops.js</code> を作ってください。</div>';
    return;
  }

  Fx.init(onChange);
  PL.init(onChange);
  AGM.ui.nav.init();
  AGM.ui.slots.render();

  /* URL から状態を復元（共有されたリンクを開いたとき） */
  var p = U.readQuery();
  Fx.fromQuery(p);
  if(p.plan) PL.set(p.plan.split("."), "共有されたプランを開きました。");

  Fx.sync();
  App.render();
  AGM.ui.personal.render();
  AGM.ui.shelf.render();
  renderSceneLinks();
  /* 棚の場所取りを解除（layout.css の解説を参照） */
  document.body.classList.add("decide-ready");

  /* 質問カード。答え終わったら3軒を出す */
  AGM.ui.wizard.init(function(answers, stats){
    /* 【罠】棚や「安城市のランチ」ページから来たときもここを通る。
       そのまま保存すると、前に答えた「家族で」が消えてしまう。
       **自分で1問目に答えたときだけ**覚える（実測で発見）。 */
    if(answers.who) AGM.ui.wizard.save();
    AGM.ui.reco.show(answers, stats);
    var box=U.$("recobox");
    if(box) box.scrollIntoView({behavior:"smooth", block:"start"});
  });

  /* 共有リンクやシーン指定で開かれたときは、質問をとばして結果を出す */
  if(p.scene && AGM.scenes.get(p.scene)) AGM.ui.shelf.go(p.scene);
  if(p.tab) AGM.ui.nav.go(p.tab, {silent:true});

  M.autoload();
  setInterval(refreshOpenBadges, 60000);

  var lg=U.$("legend");
  if(lg){
    var bigs = T.BIG_ORDER.filter(function(b){ return ALL.some(function(s){ return s.big===b; }); });
    lg.innerHTML = bigs.map(function(b){
        return '<span><i style="background:'+T.color(b)+'"></i>'+U.esc(b)+'</span>'; }).join("")+
      '<span><i style="background:#9a9489"></i>行った</span>'+
      '<span><i style="background:transparent;box-shadow:0 0 0 2px #14110e"></i>プラン（①②…）</span>'+
      '<span><i class="dia" style="background:#14110e"></i>出発地</span>';
  }

  var top=U.$("totop");
  if(top){
    top.addEventListener("click", function(){ window.scrollTo({top:0,behavior:"smooth"}); });
    window.addEventListener("scroll", function(){
      top.classList.toggle("show", window.scrollY>700);
    }, {passive:true});
  }
  var os=U.$("opensheet");
  if(os) os.addEventListener("click", function(){ AGM.ui.dialog.open(U.$("sheet")); });

  U.all("[data-scroll]").forEach(function(b){
    b.addEventListener("click", function(){
      var el=U.$(this.getAttribute("data-scroll"));
      if(el) el.scrollIntoView({behavior:"smooth", block:"start"});
    });
  });
  var ca=U.$("collapseall");
  if(ca) ca.addEventListener("click", function(){
    U.all("ul.list[data-key]").forEach(function(ul){
      collapsed[ul.getAttribute("data-key")]=1; ul.hidden=true; });
    U.all(".groupttl").forEach(function(b){ b.setAttribute("aria-expanded","false"); });
  });
  var ea=U.$("expandall");
  if(ea) ea.addEventListener("click", function(){
    collapsed={};
    U.all("ul.list[data-key]").forEach(function(ul){ ul.hidden=false; });
    U.all(".groupttl").forEach(function(b){ b.setAttribute("aria-expanded","true"); });
  });

  /* 共有シートの中のボタン。ここに来る時点で share.js は読み込み済みだが、
     URL 直開きなど順番が入れ替わる場合に備えて念のため通す。 */
  function share(fn){
    return function(){ U.withScript("assets/js/ui/share.js", function(){ AGM.ui.share[fn](); }); };
  }
  bind("share-dl", share("download"));
  bind("share-x", share("toX"));
  bind("share-line", share("toLine"));
  bind("share-copy", share("copy"));
  bind("share-native", share("native"));
  bind("set-restart", function(){
    AGM.ui.dialog.close(U.$("settingsheet"));
    AGM.ui.nav.go("home", {silent:true});
    restart();
  });

  fixCanonical();
}

function bind(id, fn){
  var el=U.$(id);
  if(el) el.addEventListener("click", fn);
}

/* 目的別ページへの入口。

   【重要】通常は index.html に**静的HTML**で書いてあります
   （scripts/build_pages.py の write_scenelinks が生成）。
   クローラが最初に受け取るHTMLにリンクが無いと、目的別12枚と
   そこから辿る店舗100枚がインデックスされないためです。

   ここは**中身が空のときだけ**作ります。理由は2つ。
     1) 二重生成を避ける（静的HTMLを上書きすると内部リンクが一瞬消える）
     2) マーカーを消してしまった index.html や、他のページでも動くようにする
   文言は静的側と同じ seo.h1 を使うこと（食い違うと差し替え漏れに気づけない）。 */
function renderSceneLinks(){
  var box=U.$("scenepills");
  if(box && !box.children.length){
    box.innerHTML = AGM.scenes.ALL.map(function(s){
      return '<a class="chip" href="'+U.esc(AGM.config.href("c/"+s.slug+"/"))+'">'+
        (s.icon?s.icon+" ":"")+U.esc(AGM.places.fill(s.seo.h1))+'</a>';
    }).join("");
  }
  var fl=U.$("footlinks");
  if(fl && !fl.children.length){
    fl.innerHTML = '<li><a href="'+U.esc(AGM.config.href("ai/"))+'">言葉で相談する</a></li>' +
      AGM.scenes.ALL.map(function(s){
        return '<li><a href="'+U.esc(AGM.config.href("c/"+s.slug+"/"))+'">'+
          U.esc(AGM.places.fill(s.seo.h1))+'</a></li>';
      }).join("");
  }
  /* 静的HTMLのリンクは末尾が "c/lunch/" のままなので、file:// で開いたときは
     ここで index.html を足す（罠4-25）。http(s) では何もしない。 */
  if(AGM.config.fileMode && AGM.config.fixLinks) AGM.config.fixLinks();
}

function refreshOpenBadges(){
  var now=U.nowJST();
  U.all("li.spot").forEach(function(li){
    var s=AGM.shops.byId(li.getAttribute("data-id"));
    if(!s) return;
    var row=li.querySelector(".statusrow");
    if(!row) return;
    var dist=row.querySelector(".dist");
    row.innerHTML = C.openBadge(s, now) + (dist?dist.outerHTML:"");
  });
}

function fixCanonical(){
  if(AGM.config.site.origin) return;
  var here = location.href.split("#")[0].split("?")[0];
  var c=document.querySelector('link[rel="canonical"]');
  if(c) c.setAttribute("href", here);
  var og=document.querySelector('meta[property="og:url"]');
  if(og) og.setAttribute("content", here);
}

if(document.readyState==="loading") document.addEventListener("DOMContentLoaded", init);
else init();

/* selfcheck.py から実測するための入口。
   本体のロジックはここを通さない（テスト用の窓口としてだけ使う）。 */
AGM.debug = {
  ALL: ALL,
  F: Fx.F,
  filtered: function(){ return Fx.filtered(); },
  money: U.money,
  km: U.km,
  fmtDist: U.fmtDist,
  gq: U.gq,
  origin: function(){ return Fx.origin(); },
  setOrigin: function(o){ Fx.setOrigin(o); },
  plan: PL,
  map: M,
  render: App.render,
  state: AGM.shops.state,
  stations: Fx.STATIONS,
  stationByName: Fx.STATION_BY_NAME,
  LS: ST.LS,
  decide: AGM.decide,
  scenes: AGM.scenes,
  wizard: AGM.ui.wizard,
  reco: AGM.ui.reco,
  restart: restart
};

})();

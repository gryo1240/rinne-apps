/* ============================================================
   plan.js － 今日まわる順番（旧「候補」）
   このアプリの中心機能。以前と挙動は変えていないが、次を足した。
     ・再読み込みしても中身が残る（保存するようにした）
     ・プランに名前をつけて保存できる
     ・共有（画像・X・LINE・URL）へつなぐ
   ============================================================ */
window.AGM = window.AGM || {};
AGM.ui = AGM.ui || {};

(function(){
"use strict";

var U = AGM.util, T = AGM.taxonomy, ST = AGM.store;
var P = AGM.ui.plan = {};

var MAX_STOPS = AGM.config.maxStops;
var plan = [];
var planHint = "", prevPos = null, lastCount = 0;
var onChange = function(){};

/* 店舗詳細ページ（/shop/xxxx/）では絞り込みUIを読み込まない。
   出発地はそこには無いので、無ければ null として扱う。 */
function currentOrigin(){
  var f = AGM.ui.filters;
  return (f && f.origin) ? f.origin() : null;
}

P.ids = function(){ return plan; };
P.count = function(){ return plan.length; };
P.has = function(id){ return plan.indexOf(String(id))>=0; };
P.shops = function(){ return plan.map(AGM.shops.byId).filter(Boolean); };

function persist(){ ST.savePlan(plan); }

P.load = function(){
  plan = ST.loadPlan().filter(function(id){ return !!AGM.shops.byId(id); });
};
P.set = function(ids, hint){
  plan = ids.map(String).filter(function(id){ return !!AGM.shops.byId(id); });
  planHint = hint||""; prevPos=null;
  persist();
  onChange({full:true});
};
P.toggle = function(id){
  id=String(id);
  var i=plan.indexOf(id);
  if(i>=0) plan.splice(i,1); else plan.push(id);
  planHint=""; prevPos=null;
  persist();
  onChange({id:id});
  return i<0;
};
P.remove = function(id){
  id=String(id);
  var i=plan.indexOf(id);
  if(i>=0) plan.splice(i,1);
  planHint=""; prevPos=null;
  persist();
  onChange({id:id});
};
P.clear = function(silent){
  if(!silent && plan.length>1 &&
     !confirm("今日まわる順番を"+plan.length+"軒ぶんすべて消します。よろしいですか？")) return false;
  var old=plan.slice();
  plan=[]; planHint=""; prevPos=null;
  persist();
  onChange({cleared:old});
  return true;
};

/* ---------- 表示 ---------- */
function planHtml(){
  if(!plan.length){
    return '<p class="empty" style="padding:16px 14px;font-size:13px;line-height:1.8">'+
      'まだ何も入っていません。<br>おすすめカードの<b style="color:var(--accent)">「＋ 今日まわる順番に入れる」</b>で、'+
      'その日に回るお店がたまっていきます。<br>'+
      '<button class="btn ghost" data-act="ai" style="margin-top:10px">言葉で相談して決める</button></p>';
  }
  var origin = currentOrigin();
  var items=plan.map(function(id,i){
    var s=AGM.shops.byId(id); if(!s) return "";
    var mv="";
    if(prevPos && prevPos[id]!=null && prevPos[id]!==i)
      mv='<span class="pmv">'+(prevPos[id]+1)+'番目から</span>';
    var over=(i>=MAX_STOPS)
      ? '<br><span style="color:var(--warn);font-size:11px">※Googleマップには載りません</span>':'';
    var st=AGM.shops.state(s);
    return '<li'+(mv?' class="moved"':'')+'><span class="pn">'+U.esc(s.name)+mv+
      '<br><span style="color:var(--sub);font-size:11px">'+
      '<span style="color:'+T.color(s.big)+'">●</span> '+U.esc(s.genre)+
      ' ／ <span style="color:var(--'+(st.code==="open"?"ok":st.code==="closed"?"ng":"sub")+')">'+
      U.esc(st.label)+'</span></span>'+
      (s.closed?'<span class="phr">定休日：'+U.esc(s.closed)+'</span>':'')+
      over+'</span>'+
      '<button class="px" data-unplan="'+U.esc(id)+'" title="はずす" '+
        'aria-label="'+U.esc(s.name)+'をプランからはずす">×</button></li>';
  }).join("");

  var url = U.gmapRouteUrl(plan.slice(0,MAX_STOPS).map(AGM.shops.byId).filter(Boolean), origin);
  var canOpt = plan.length>=2;

  return '<ol class="plan">'+items+'</ol>'+
    '<div class="planbtns">'+
      '<button class="btn'+(canOpt?"":" off")+'" data-act="opt">まわる順番を決める</button>'+
      '<a class="btn ghost" href="'+url+'" target="_blank" rel="noopener">Googleマップで開く</a>'+
      '<button class="btn ghost" data-act="share">共有する</button>'+
      '<button class="btn ghost" data-act="saveroute">このプランを保存</button>'+
      '<button class="btn ghost" data-act="clear">空にする</button>'+
    '</div>'+
    (canOpt?"":'<p class="hint">2軒以上入れると「まわる順番を決める」が使えます。</p>')+
    (plan.length>MAX_STOPS
      ? '<p class="hint warn">Googleマップで一度に開ける立ち寄り先は'+MAX_STOPS+
        'か所までです。上から'+MAX_STOPS+'件だけが経路に入ります。</p>':"")+
    '<p class="hint">定休日と営業時間はお店ごとに違います。回る前に必ずご確認ください。</p>'+
    (planHint?'<p class="hint strong">'+U.esc(planHint)+'</p>':'');
}

P.render = function(){
  U.all(".planbox").forEach(function(el){ el.innerHTML=planHtml(); });
  U.all(".plann").forEach(function(el){
    el.textContent = el.tagName==="B" ? String(plan.length) : plan.length+" 件"; });

  var bar=U.$("bar");
  if(bar){
    bar.classList.toggle("show", plan.length>0);
    document.documentElement.style.setProperty("--barh", plan.length?"58px":"0px");
    if(plan.length>lastCount){
      bar.classList.remove("bump"); void bar.offsetWidth; bar.classList.add("bump");
    }
  }
  var nav=U.$("navplan-cnt");
  if(nav){ nav.textContent=plan.length; nav.hidden = plan.length===0; }
  if(!plan.length && AGM.ui.dialog.isOpen(U.$("sheet"))) AGM.ui.dialog.close(U.$("sheet"));
  lastCount=plan.length;
};

/* ---------- 回る順番を組む ----------
   最近傍でつないでから 2-opt で交差をほどく。直線距離での目安。 */
P.optimize = function(){
  var pts=P.shops();
  if(pts.length<2) return;
  var origin = currentOrigin();
  var before=plan.slice();
  var start = origin ? {lat:origin.lat,lng:origin.lng} : pts[0];
  function total(r){
    var t=0,p=start;
    for(var i=0;i<r.length;i++){ t+=U.km(p.lat,p.lng,r[i].lat,r[i].lng); p=r[i]; }
    return t;
  }
  var beforeKm=total(pts);
  var rest=pts.slice(), route=[], cur=start;
  if(!origin){ route.push(rest.shift()); cur=route[0]; }
  while(rest.length){
    var bi=0,bd=Infinity;
    for(var i=0;i<rest.length;i++){
      var d=U.km(cur.lat,cur.lng,rest[i].lat,rest[i].lng);
      if(d<bd){ bd=d; bi=i; }
    }
    cur=rest[bi]; route.push(cur); rest.splice(bi,1);
  }
  var improved=true, guard=0;
  while(improved && guard++<60){
    improved=false;
    for(var a=0;a<route.length-1;a++){
      for(var b=a+1;b<route.length;b++){
        var cand=route.slice(0,a).concat(route.slice(a,b+1).reverse(), route.slice(b+1));
        if(total(cand)<total(route)-1e-9){ route=cand; improved=true; }
      }
    }
  }
  var afterKm=total(route);
  plan=route.map(function(s){ return String(s.id); });
  persist();

  prevPos={}; var moved=0;
  plan.forEach(function(id,i){
    var was=before.indexOf(id); prevPos[id]=was; if(was!==i) moved++;
  });
  var tail = origin ? "" : "（出発地を決めると、より実際に近い順番になります）";
  /* 【罠】すでに最適なときに何も表示しないと、ボタンが壊れて見える。
     変化がなかったことを必ず明示する。この挙動を消さないこと。 */
  if(moved===0){
    prevPos=null;
    planHint="すでに回りやすい順番でした。並べ替えはありません（移動距離の目安 約"+
      U.fmtDist(afterKm)+"）。"+tail;
  }else if(Math.abs(beforeKm-afterKm) < 0.05){
    // 表示上の丸め幅（50m）より差が小さいと「約1.1km → 約1.1km」と出て変化なしに見える
    planHint="順番を入れ替えました（"+moved+"件が移動）。"+
      "ただし移動距離はほとんど変わりません（約"+U.fmtDist(afterKm)+"）。"+tail;
  }else{
    planHint="順番を入れ替えました："+moved+"件が移動し、移動距離の目安が 約"+
      U.fmtDist(beforeKm)+" → 約"+U.fmtDist(afterKm)+" になりました。"+tail+
      " 直線距離での計算なので、実際の経路はGoogleマップでご確認ください。";
  }
  onChange({reorder:true});
};

/* 直線距離の合計（共有カードとルート保存で使う） */
P.totalKm = function(){
  var pts=P.shops();
  if(!pts.length) return 0;
  var origin=currentOrigin();
  var t=0, p=origin?{lat:origin.lat,lng:origin.lng}:pts[0];
  var start = origin?0:1;
  for(var i=start;i<pts.length;i++){ t+=U.km(p.lat,p.lng,pts[i].lat,pts[i].lng); p=pts[i]; }
  return t;
};

/* ---------- 保存したルート ---------- */
P.save = function(){
  if(!plan.length){ U.toast("プランが空です"); return; }
  var first=AGM.shops.byId(plan[0]);
  var suggest = (currentOrigin() ? currentOrigin().name+"から" : "")+
                first.name+(plan.length>1?" ほか"+(plan.length-1)+"軒":"");
  var name = prompt("「今日まわる順番」に名前をつけて保存します", suggest);
  if(name===null) return;
  var origin = currentOrigin();
  ST.saveRoute({
    id: "r"+Date.now(),
    name: (name||suggest).slice(0,60),
    ids: plan.slice(),
    from: origin ? origin.name : "",
    km: Math.round(P.totalKm()*10)/10,
    at: new Date().toISOString().slice(0,10)
  });
  U.toast("プランを保存しました");
  if(AGM.ui.personal) AGM.ui.personal.render();
};

P.init = function(cb){ onChange = cb || function(){}; P.load(); };

})();

/* ============================================================
   util.js － どこからでも使う小さな道具
   DOM も状態も持たない純粋な関数だけを置く（テストしやすくするため）。
   ============================================================ */
window.AGM = window.AGM || {};

(function(){
"use strict";

var U = AGM.util = {};

/* ---------- DOM ---------- */
U.$  = function(id){ return document.getElementById(id); };
U.qs = function(sel, root){ return (root||document).querySelector(sel); };
U.all = function(sel, root){ return [].slice.call((root||document).querySelectorAll(sel)); };

/* ---------- 文字 ---------- */
U.esc = function(s){
  return String(s==null?"":s).replace(/[&<>"']/g, function(c){
    return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];
  });
};

/* 営業時間は元データに改行が入っている（100件中58件）。1行にたたんで見せる。 */
U.oneline = function(s){ return String(s||"").replace(/\s*\n+\s*/g," ／ ").trim(); };

/* 【罠】平均予算は「1,500円」だけでなく「550〜900円」「1,000〜円」
   「ランチ 2200円／会席 3500円」のような書き方が20件ある。
   数字を全部つなげると 550900 や 10002000 というでたらめな値になり、
   「安い順」が完全に壊れる（実測で発見）。
   カンマを外したうえで**最初に出てくる金額（下限）**を取ること。 */
U.money = function(v){
  if(!v) return null;
  var m = String(v).replace(/,/g,"").match(/\d+/);
  return m ? parseInt(m[0],10) : null;
};

/* ---------- 距離 ---------- */
U.km = function(a,b,c,d){
  var R=6371, p=Math.PI/180;
  var dLa=(c-a)*p, dLo=(d-b)*p;
  var x=Math.sin(dLa/2)*Math.sin(dLa/2)+
        Math.cos(a*p)*Math.cos(c*p)*Math.sin(dLo/2)*Math.sin(dLo/2);
  return R*2*Math.atan2(Math.sqrt(x),Math.sqrt(1-x));
};
U.fmtDist = function(v){
  if(v == null) return "";
  if(v < 1) return Math.round(v*1000)+"m";
  return v<10 ? v.toFixed(1)+"km" : Math.round(v)+"km";
};
/* 歩いた場合のおおよその所要時間（分速80m＝不動産表記に合わせる） */
U.walkMin = function(kmv){ return Math.max(1, Math.round(kmv*1000/80)); };

/* ---------- 日付 ---------- */
U.WD = ["日","月","火","水","木","金","土"];

/* 日本時間の「いま」。海外や時計のずれた端末でも営業中判定が狂わないようにする。
   Intl が使えない古い環境では端末のローカル時刻にそのまま落とす。 */
U.nowJST = function(base){
  var d = base || new Date();
  try{
    var f = new Intl.DateTimeFormat("en-US",{
      timeZone:"Asia/Tokyo", hour12:false,
      year:"numeric",month:"2-digit",day:"2-digit",
      hour:"2-digit",minute:"2-digit",second:"2-digit"
    });
    var p={};
    f.formatToParts(d).forEach(function(x){ p[x.type]=x.value; });
    // hour は 24 が返ることがある（深夜0時台）ので %24 で丸める
    return new Date(+p.year, +p.month-1, +p.day, (+p.hour)%24, +p.minute, +p.second);
  }catch(e){ return d; }
};

U.fmtDate = function(s){
  if(!s) return "";
  var m = String(s).match(/(\d{4})-(\d{2})-(\d{2})/);
  return m ? (m[1]+"年"+(+m[2])+"月"+(+m[3])+"日") : String(s);
};
U.fmtTime = function(min){
  var h = Math.floor(min/60), m = min%60;
  return (h%24) + ":" + (m<10?"0":"") + m;
};

/* ---------- 制御 ---------- */
U.debounce = function(fn, ms){
  var t=null;
  return function(){
    var self=this, args=arguments;
    clearTimeout(t);
    t=setTimeout(function(){ fn.apply(self,args); }, ms||150);
  };
};
/* 空いた時間に走らせる。LCP を邪魔しないための保険つき */
U.whenIdle = function(fn, timeout){
  if(window.requestIdleCallback) window.requestIdleCallback(fn, {timeout: timeout||1200});
  else setTimeout(fn, 200);
};

/* ---------- Googleマップ ----------
   【罠】座標をそのまま渡すと、Googleが逆ジオコーディングして「一番近い別の住所」を
   ピンに出すことがある。必ず店名＋住所のテキストで渡すこと。 */
U.gq = function(s){ return (s.name+" 安城市"+(s.addr||"")).trim(); };

U.gmapUrl = function(s, origin){
  return "https://www.google.com/maps/dir/?api=1&travelmode=transit&destination="+
    encodeURIComponent(U.gq(s)) + (origin ? "&origin="+encodeURIComponent(origin.q) : "");
};
U.gmapRouteUrl = function(shops, origin){
  var qs = shops.map(U.gq);
  if(!qs.length) return "https://www.google.com/maps";
  var url = "https://www.google.com/maps/dir/?api=1&travelmode=transit";
  if(origin) url += "&origin="+encodeURIComponent(origin.q);
  url += "&destination="+encodeURIComponent(qs[qs.length-1]);
  if(qs.length>1) url += "&waypoints="+qs.slice(0,-1).map(encodeURIComponent).join("|");
  return url;
};

/* ---------- URL ----------
   共有・ブックマークできる状態を1か所で扱う。
   将来サービスが増えても ?service= を足すだけで済むようにしている。 */
U.readQuery = function(search){
  var out={}, s=(search==null?location.search:search).replace(/^\?/,"");
  if(!s) return out;
  s.split("&").forEach(function(kv){
    if(!kv) return;
    var i=kv.indexOf("="), k=i<0?kv:kv.slice(0,i), v=i<0?"":kv.slice(i+1);
    try{ out[decodeURIComponent(k)] = decodeURIComponent(v.replace(/\+/g," ")); }catch(e){}
  });
  return out;
};
U.buildQuery = function(obj){
  var a=[];
  Object.keys(obj).forEach(function(k){
    var v=obj[k];
    if(v==null || v==="" || v===false) return;
    a.push(encodeURIComponent(k)+"="+encodeURIComponent(String(v)));
  });
  return a.length ? "?"+a.join("&") : "";
};

/* 公開URL。config.site.origin が空なら、いま開いている場所から組み立てる。 */
U.absUrl = function(pathAndQuery){
  var base = (AGM.config.site.origin||"").replace(/\/+$/,"");
  if(base) return base + "/" + String(pathAndQuery||"").replace(/^\.?\//,"");
  var here = location.href.split("#")[0].split("?")[0];
  if(!pathAndQuery) return here;
  return here.replace(/[^\/]*$/,"") + String(pathAndQuery).replace(/^\.?\//,"");
};

/* ---------- あとから読む ----------
   初回表示に要らないものは、必要になった瞬間に読む。
   【重要】同じ src を2回読まないこと（イベントが二重に付く）。
   base を通すので、店舗ページ（shop/12/）からでも正しく解決できる。 */
var _loaded = {};
U.loadScript = function(src){
  if(_loaded[src]) return _loaded[src];
  _loaded[src] = new Promise(function(res, rej){
    var s = document.createElement("script");
    s.src = AGM.config.base + src; s.async = true;
    s.onload = function(){ res(); };
    s.onerror = function(){ delete _loaded[src]; rej(new Error(src)); };
    document.head.appendChild(s);
  });
  return _loaded[src];
};
/* 読み込んでから実行する。読み込み中は押しても無反応に見えるので、
   少し待たされるときだけ「読み込んでいます」と出す。 */
U.withScript = function(src, fn){
  if(_loaded[src] && _loaded[src]._done){ fn(); return; }
  var slow = setTimeout(function(){ U.toast("読み込んでいます…"); }, 250);
  U.loadScript(src).then(function(){
    _loaded[src]._done = true;
    clearTimeout(slow);
    fn();
  }, function(){
    clearTimeout(slow);
    U.toast("読み込めませんでした。通信環境をご確認ください");
  });
};

/* ---------- 通知 ---------- */
var toastEl=null, toastT=null;
U.toast = function(msg){
  if(!toastEl){
    toastEl=document.createElement("div");
    toastEl.className="toast";
    toastEl.setAttribute("role","status");
    toastEl.setAttribute("aria-live","polite");
    document.body.appendChild(toastEl);
  }
  toastEl.textContent=msg;
  toastEl.classList.add("show");
  clearTimeout(toastT);
  toastT=setTimeout(function(){ toastEl.classList.remove("show"); }, 2600);
};

/* ---------- クリップボード ----------
   http:// や file:// では navigator.clipboard が無いので、必ず代替を用意する。 */
U.copy = function(text){
  function fallback(){
    var ta=document.createElement("textarea");
    ta.value=text; ta.setAttribute("readonly","");
    ta.style.cssText="position:fixed;top:-1000px;opacity:0";
    document.body.appendChild(ta); ta.select();
    var ok=false;
    try{ ok=document.execCommand("copy"); }catch(e){}
    document.body.removeChild(ta);
    return ok;
  }
  if(navigator.clipboard && navigator.clipboard.writeText){
    return navigator.clipboard.writeText(text)
      .then(function(){ return true; })
      .catch(function(){ return fallback(); });
  }
  return Promise.resolve(fallback());
};

})();

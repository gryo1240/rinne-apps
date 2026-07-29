/* ============================================================
   store.js － ブラウザ内の保存（localStorage）
   ここを通さずに localStorage を直接触らないこと。
   ・キーの接頭辞を1か所に閉じ込める（姉妹アプリとの混線防止）
   ・プライベートモードなど保存できない環境でも例外を投げない
   ・保存した内容はどこにも送信しない（フッターの記載どおり）
   ============================================================ */
window.AGM = window.AGM || {};

(function(){
"use strict";

var NS = AGM.config.ns;      // "anjo-gourmet."
var S = AGM.store = {};

function get(key, dflt){
  try{
    var v = localStorage.getItem(NS+key);
    return v==null ? dflt : JSON.parse(v);
  }catch(e){ return dflt; }
}
function set(key, val){
  try{ localStorage.setItem(NS+key, JSON.stringify(val)); return true; }
  catch(e){ return false; }   // 容量超過・保存禁止でもアプリは動き続ける
}
function del(key){ try{ localStorage.removeItem(NS+key); }catch(e){} }

S.get = get; S.set = set; S.del = del;

/* 保存キーの一覧。selfcheck.py がここを見て姉妹アプリとの衝突を検査する。 */
S.KEYS = {
  visited:  "stamp.v1",     // 「行った」の記録。**キー名は変えないこと**
                            //（旧バージョンのスタンプ記録をそのまま引き継ぐため。
                            //  表示上の名前だけ「行った」に変えました）
  intro:    "intro.v1",     // 旧「はじめての方へ」を閉じたか
  tutorial: "tutorial.v1",  // 3ステップのチュートリアルを見たか
  fav:      "fav.v1",       // お気に入り
  history:  "history.v1",   // 閲覧履歴（最近見た店）
  views:    "views.v1",     // 店ごとの閲覧回数（自分のランキング用）
  plan:     "plan.v1",      // 候補（次に開いたときも残す）
  routes:   "routes.v1",    // 保存したルート
  settings: "settings.v1",  // 表示設定
  shown:    "shown.v1"      // 直近に出したおすすめの店ID（最大9件）。
                            // decide.js が「同じ3軒を続けて出さない」ために見る
};
/* 互換のために公開している旧定数名。selfcheck.py が参照する */
S.LS = NS + S.KEYS.visited;

/* ---------- 「行った」（回った記録） ---------- */
var visited = get(S.KEYS.visited, {}) || {};
S.visited = function(){ return visited; };
S.isVisited = function(id){ return !!visited[id]; };
S.toggleVisited = function(id){
  if(visited[id]) delete visited[id]; else visited[id]=1;
  set(S.KEYS.visited, visited);
  return !!visited[id];
};
S.visitedCount = function(){
  var n=0; for(var k in visited){ if(visited[k]) n++; }
  return n;
};
S.clearVisited = function(){ visited={}; set(S.KEYS.visited, visited); };

/* ---------- お気に入り ----------
   「また開きたくなる」ための中心。順序は登録順（新しいものが後ろ）。 */
var fav = get(S.KEYS.fav, []) || [];
if(!Array.isArray(fav)) fav=[];
S.favs = function(){ return fav.slice(); };
S.isFav = function(id){ return fav.indexOf(String(id))>=0; };
S.toggleFav = function(id){
  id=String(id);
  var i=fav.indexOf(id);
  if(i>=0) fav.splice(i,1); else fav.push(id);
  set(S.KEYS.fav, fav);
  return i<0;
};
S.favCount = function(){ return fav.length; };

/* ---------- 閲覧履歴 ---------- */
var HIST_MAX = 30;
var history = get(S.KEYS.history, []) || [];
if(!Array.isArray(history)) history=[];
var views = get(S.KEYS.views, {}) || {};

S.pushHistory = function(id){
  id=String(id);
  var i=history.indexOf(id);
  if(i>=0) history.splice(i,1);
  history.unshift(id);
  if(history.length>HIST_MAX) history.length=HIST_MAX;
  views[id]=(views[id]||0)+1;
  set(S.KEYS.history, history);
  set(S.KEYS.views, views);
};
S.history = function(){ return history.slice(); };
S.views = function(){ return views; };
S.clearHistory = function(){ history=[]; views={}; del(S.KEYS.history); del(S.KEYS.views); };

/* ---------- 候補（回りたいお店） ----------
   以前は再読み込みで消えていた。残すようにして「また開く」動機を作る。 */
S.loadPlan = function(){
  var p = get(S.KEYS.plan, []);
  return Array.isArray(p) ? p.map(String) : [];
};
S.savePlan = function(plan){ set(S.KEYS.plan, plan.map(String)); };

/* ---------- 保存したルート ---------- */
S.routes = function(){
  var r = get(S.KEYS.routes, []);
  return Array.isArray(r) ? r : [];
};
S.saveRoute = function(route){
  var list = S.routes();
  list.unshift(route);
  if(list.length > AGM.config.maxSavedRoutes) list.length = AGM.config.maxSavedRoutes;
  set(S.KEYS.routes, list);
  return list;
};
S.removeRoute = function(id){
  var list = S.routes().filter(function(r){ return r.id!==id; });
  set(S.KEYS.routes, list);
  return list;
};

/* ---------- 表示設定 ---------- */
var settings = get(S.KEYS.settings, {}) || {};
S.settings = function(){ return settings; };
S.setSetting = function(k,v){ settings[k]=v; set(S.KEYS.settings, settings); };

/* ---------- チュートリアル ---------- */
S.tutorialDone = function(){
  // 旧バージョンで「はじめての方へ」を閉じた人にも、もう一度出さない
  return get(S.KEYS.tutorial, 0)===1 || get(S.KEYS.intro, 0)===1 ||
         (function(){ try{ return localStorage.getItem(NS+S.KEYS.intro)==="1"; }catch(e){ return false; } })();
};
S.markTutorialDone = function(){ set(S.KEYS.tutorial, 1); };
S.resetTutorial = function(){ del(S.KEYS.tutorial); del(S.KEYS.intro); };

})();

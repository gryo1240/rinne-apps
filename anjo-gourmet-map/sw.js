/* ============================================================
   sw.js － 電波が悪くても開けるようにする（Service Worker）
   ------------------------------------------------------------
   【何のために入れたか】
   このアプリの目的は「30秒以内に店が決まる」ことです。
   店を探すのは**外に出てから**なので、地下・店の中・電波の弱い場所で
   真っ白な画面が出ると、そこで用が足せなくなります。
   一度開いた人が、次からは電波が無くても開けるようにするのがここの役目です。

   【絶対に守ること】
   1. **地図のタイルは保存しない。** tile.openstreetmap.org は
      ボランティアが運営しているサーバで、利用規約でも大量取得を禁じています。
      下の fetch では**自分のサーバのもの以外には一切手を出しません**。
   2. **営業時間のデータは通信を優先する。** data/ の中身は
      「いま開いているか」を決める材料です。古い控えを先に返すと、
      閉まっている店を「営業中」と出すことになります。
      このアプリでいちばんやってはいけないことです（HANDOFF 第4章）。
   3. **file:// では登録しない。** そもそも Service Worker が動きません。
      登録は config.js が http(s) のときだけ行います。

   【作りかた】
     画面（HTML）と data/  … 通信を先に試し、だめなら控えを返す
     それ以外の同じサーバのもの … 控えをすぐ返し、裏で新しくする
     ほかのサーバのもの          … 何もしない（ブラウザに任せる）

   下の PRECACHE の間は scripts/build_pages.py が書き換えます。
   index.html に script を足したらビルドし直してください。手で並べると必ずずれます。
   ============================================================ */
"use strict";

// PRECACHE:START  ここから PRECACHE:END までは build_pages.py が作ります。手で直さないこと。
var VERSION = "4c324c2683";
var SHELL = [
  "./",
  "assets/css/app.css",
  "data/city.js",
  "data/categories.js",
  "data/shops.js",
  "assets/js/core/config.js",
  "assets/js/core/util.js",
  "assets/js/core/store.js",
  "assets/js/core/taxonomy.js",
  "assets/js/core/hours.js",
  "assets/js/core/shops.js",
  "assets/js/core/place.js",
  "assets/js/core/scenes.js",
  "assets/js/core/decide.js",
  "assets/js/ui/dialog.js",
  "assets/js/ui/visual.js",
  "assets/js/ui/card.js",
  "assets/js/ui/filters.js",
  "assets/js/ui/map.js",
  "assets/js/ui/plan.js",
  "assets/js/ui/personal.js",
  "assets/js/ui/nav.js",
  "assets/js/ui/slots.js",
  "assets/js/ui/wizard.js",
  "assets/js/ui/reco.js",
  "assets/js/ui/shelf.js",
  "assets/js/app.js"
];
// PRECACHE:END

var CACHE = "anjo-gourmet-" + VERSION;

/* ---------- 取り付け ---------- */
self.addEventListener("install", function(e){
  e.waitUntil(
    caches.open(CACHE).then(function(c){
      /* 1本ずつ入れて、失敗しても止めない。
         addAll だと1本でも落ちたときに**全部入らない**ので、
         ファイルを1つ消しただけでオフライン対応が丸ごと死にます。 */
      return Promise.all(SHELL.map(function(u){
        return c.add(new Request(u, {cache:"reload"})).catch(function(){});
      }));
    }).then(function(){ return self.skipWaiting(); })
  );
});

/* ---------- 古い控えの片付け ---------- */
self.addEventListener("activate", function(e){
  e.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(keys.map(function(k){
        if(k.indexOf("anjo-gourmet-")===0 && k!==CACHE) return caches.delete(k);
        return null;
      }));
    }).then(function(){ return self.clients.claim(); })
  );
});

/* ---------- 保存 ---------- */
function put(req, res){
  caches.open(CACHE).then(function(c){ c.put(req, res); }).catch(function(){});
}

/* 通信が先。だめなときだけ控え。
   画面（HTML）のときは、控えも無ければトップの控えを出す。
   ただし**店舗ページの代わりにトップを出さない**こと。
   別の店の画面が出たように見えて、いちばんたちが悪い勘違いになります。 */
function networkFirst(req, topFallback){
  return fetch(req).then(function(res){
    if(res && res.ok) put(req, res.clone());
    return res;
  }).catch(function(){
    return caches.match(req, {ignoreSearch:true}).then(function(hit){
      if(hit) return hit;
      if(!topFallback) return new Response("", {status:504, statusText:"offline"});
      return caches.match("./").then(function(top){
        return top || new Response("", {status:504, statusText:"offline"});
      });
    });
  });
}

/* 控えをすぐ返して、裏で新しいものに入れ替える。
   次に開いたときには新しくなっているので、
   直したコードが永久に届かない、という事故が起きません。 */
function staleWhileRevalidate(req){
  return caches.match(req).then(function(hit){
    var net = fetch(req).then(function(res){
      if(res && res.ok) put(req, res.clone());
      return res;
    }).catch(function(){ return hit; });
    return hit || net;
  });
}

/* ---------- 通信の振り分け ---------- */
self.addEventListener("fetch", function(e){
  var req = e.request;
  if(req.method !== "GET") return;

  var url;
  try{ url = new URL(req.url); }catch(err){ return; }
  if(url.protocol !== "http:" && url.protocol !== "https:") return;

  /* 【ここが2番の約束】自分のサーバのもの以外には手を出さない。
     地図のタイルはここで落ちます。保存も横取りもしません。 */
  if(url.origin !== self.location.origin) return;

  /* 途中から読む要求（音声・動画）は横取りすると壊れる */
  if(req.headers.get("range")) return;

  var accept = req.headers.get("accept") || "";
  var isDoc = (req.mode === "navigate") || accept.indexOf("text/html") >= 0;
  var isData = url.pathname.indexOf("/data/") >= 0;

  if(isDoc){ e.respondWith(networkFirst(req, true)); return; }
  if(isData){ e.respondWith(networkFirst(req, false)); return; }
  e.respondWith(staleWhileRevalidate(req));
});

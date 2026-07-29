/* ============================================================
   cat-page.js － カテゴリページ（/c/<slug>/）用
   ------------------------------------------------------------
   一覧の中身は build_pages.py が**静的に**書き出しています。
   （検索エンジンにも、JSが動かない環境にも、そのまま読めるようにするため）

   このファイルは「いま営業中かどうか」だけを後から差し込みます。
   営業状態は時刻で変わるので、静的HTMLに焼き込むことはできません。
   ============================================================ */
window.AGM = window.AGM || {};

(function(){
"use strict";

var U = AGM.util;

function paint(){
  var now = U.nowJST();
  U.all("[data-openstate]").forEach(function(el){
    var s = AGM.shops.byId(el.getAttribute("data-openstate"));
    if(!s) return;
    var st = AGM.shops.state(s, now);
    el.innerHTML = '<span class="openbadge is-'+st.code+'">'+
      '<span class="dot" aria-hidden="true">'+st.sign+'</span>'+U.esc(st.label)+'</span>'+
      (st.sub ? '<span class="opensub">'+U.esc(st.sub)+'</span>' : '');
  });
}

function init(){
  if(!document.querySelector("[data-openstate]")) return;
  paint();
  setInterval(paint, 60000);
  if(AGM.ui.slots) AGM.ui.slots.render();
}

if(document.readyState==="loading") document.addEventListener("DOMContentLoaded", init);
else init();

})();

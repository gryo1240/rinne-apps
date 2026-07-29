/* ============================================================
   dialog.js － モーダル／ボトムシートの共通処理
   チュートリアル・候補・AIおすすめ・共有・設定が全部これを使う。
   キーボードだけでも閉じられること、背後に出られないこと、
   閉じたら元のボタンにフォーカスが戻ることを1か所で保証する。
   ============================================================ */
window.AGM = window.AGM || {};
AGM.ui = AGM.ui || {};

(function(){
"use strict";

var U = AGM.util;
var open = [];   // 重ねて開いたときのために積む

var FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),' +
                'textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

function focusables(root){
  return U.all(FOCUSABLE, root).filter(function(el){
    return el.offsetWidth>0 || el.offsetHeight>0 || el===document.activeElement;
  });
}

var D = AGM.ui.dialog = {};

D.open = function(el, opts){
  opts = opts || {};
  if(!el || el.classList.contains("show")) return;
  var rec = { el:el, prev:document.activeElement, opts:opts };
  open.push(rec);
  el.classList.add("show");
  el.setAttribute("aria-hidden","false");
  document.documentElement.style.overflow="hidden";   // 背後がスクロールしないように

  /* 開いた直後にフォーカスを中へ移す。
     すぐに移すのと、描画が終わってからもう一度試すのを両方やる。
     （端末によっては表示反映前の focus() が無視されることがあるため） */
  var first = opts.focus ? U.qs(opts.focus, el) : focusables(el)[0];
  if(first){
    try{ first.focus(); }catch(e){}
    setTimeout(function(){
      if(!el.contains(document.activeElement)){ try{ first.focus(); }catch(e){} }
    }, 30);
  }
};

D.close = function(el){
  var i = -1;
  for(var k=open.length-1;k>=0;k--){ if(open[k].el===el){ i=k; break; } }
  if(i<0){
    if(el){ el.classList.remove("show"); el.setAttribute("aria-hidden","true"); }
    return;
  }
  var rec = open.splice(i,1)[0];
  rec.el.classList.remove("show");
  rec.el.setAttribute("aria-hidden","true");
  if(!open.length) document.documentElement.style.overflow="";
  if(rec.opts.onClose) rec.opts.onClose();
  if(rec.prev && rec.prev.focus){ try{ rec.prev.focus(); }catch(e){} }
};

D.closeTop = function(){
  if(open.length) D.close(open[open.length-1].el);
};
D.isOpen = function(el){ return el && el.classList.contains("show"); };

/* Esc で閉じる／Tab を中に閉じ込める */
document.addEventListener("keydown", function(e){
  if(!open.length) return;
  var top = open[open.length-1];
  if(e.key==="Escape"){ e.preventDefault(); D.close(top.el); return; }
  if(e.key!=="Tab") return;
  var f = focusables(top.el);
  if(!f.length) return;
  var first=f[0], last=f[f.length-1];
  if(e.shiftKey && document.activeElement===first){ e.preventDefault(); last.focus(); }
  else if(!e.shiftKey && document.activeElement===last){ e.preventDefault(); first.focus(); }
});

/* 背景（オーバーレイ）のクリックで閉じる。中身のクリックでは閉じない */
document.addEventListener("click", function(e){
  if(!open.length) return;
  var top = open[open.length-1];
  if(e.target===top.el) D.close(top.el);
  var x = e.target.closest && e.target.closest("[data-close]");
  if(x){
    var sel = x.getAttribute("data-close");
    var target = sel ? U.$(sel) : x.closest(".sheet,.tut");
    if(target){ e.preventDefault(); D.close(target); }
  }
});

})();

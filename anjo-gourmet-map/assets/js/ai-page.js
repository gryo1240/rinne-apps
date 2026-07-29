/* ============================================================
   ai-page.js － 「言葉で相談する」ページ（/ai/）
   ------------------------------------------------------------
   自然文をそのまま受け取って、3軒を出します。
   「子供が寝そう」「雨の日」「おしゃれ」「静か」「記念日」など。

   【必ず守ること】
   ・**どう解釈したかを画面に出す。** 「〜と受け取りました」を必ず表示する。
     外れたときに、ユーザーが自分で言い直せるようにするため。
   ・**分からなかったら分からないと言う。** それらしい結果を出さない。
   ・外部のAIには接続していない。その旨をページに書く。
   ============================================================ */
window.AGM = window.AGM || {};

(function(){
"use strict";

var U = AGM.util;

/* このページには app.js を読み込まない（一覧も地図も要らないので軽くする）。
   そのぶん、おすすめカードのボタンだけはここで受ける。 */
function wireCardActions(){
  var ST = AGM.store;
  AGM.ui.plan.init(function(info){
    AGM.ui.plan.render();
    if(info && info.id!=null) syncCard(info.id);
  });
  function syncCard(id){
    U.all('.reco[data-id="'+id+'"]').forEach(function(el){
      var pb=el.querySelector("[data-plan]");
      if(pb){ var on=AGM.ui.plan.has(id);
        pb.classList.toggle("on", on);
        pb.textContent = on?"✓ 入れた":"＋ 今日まわる順番に入れる"; }
      var fb=el.querySelector("[data-fav]");
      if(fb){ var f=ST.isFav(id);
        fb.setAttribute("aria-pressed", f?"true":"false");
        fb.classList.toggle("on", f);
        fb.textContent = f?"✓ 行きたい":"♡ 行きたい"; }
    });
  }
  document.addEventListener("click", function(e){
    var t = e.target.closest ? e.target.closest(
      "[data-plan],[data-fav],[data-detail],[data-reco-swap],[data-reco-need],"+
      "[data-reco],[data-act]") : null;
    if(!t) return;
    if(t.hasAttribute("data-detail")){ ST.pushHistory(t.getAttribute("data-detail")); return; }
    if(t.hasAttribute("data-plan")){
      var added = AGM.ui.plan.toggle(t.getAttribute("data-plan"));
      U.toast(added ? "今日まわる順番に入れました" : "まわる順番から外しました");
      return;
    }
    if(t.hasAttribute("data-fav")){
      var id=t.getAttribute("data-fav");
      var on=ST.toggleFav(id);
      syncCard(id);
      U.toast(on?"「行きたい」に入れました":"「行きたい」から外しました");
      return;
    }
    if(t.hasAttribute("data-reco-swap")){ AGM.ui.reco.swap(t.getAttribute("data-reco-swap")); return; }
    /* 【罠4-20の再来を防ぐ】結果画面のチップはこのページにも出る。
       受け口をトップだけに書くと、/ai では押しても何も起きない。 */
    if(t.hasAttribute("data-reco-need")){
      AGM.ui.reco.toggleNeed(t.getAttribute("data-reco-need")); return;
    }
    if(t.hasAttribute("data-reco") && t.getAttribute("data-reco")==="all"){
      AGM.ui.reco.addAll(); return;
    }
  });

  /* 「条件を変えてもう一度」。
     【罠】このボタンは reco.js が出すので /ai にも並ぶが、
     受け口は app.js（トップ専用）にしか無く、押しても何も起きなかった（実測で発見）。
     このページでは入力欄に戻すのが正しい動き。 */
  document.addEventListener("click", function(e){
    var b = e.target.closest && e.target.closest('[data-wz="restart"]');
    if(!b) return;
    var i = U.$("aitext");
    U.$("recobox").innerHTML = "";
    U.$("airead").hidden = true;
    if(i){ i.value=""; i.focus(); i.scrollIntoView({behavior:"smooth", block:"center"}); }
  });
}

function init(){
  var form = U.$("aiform");
  if(!form) return;
  wireCardActions();

  /* 入力例。押すだけで試せるようにして、何を書けばいいか迷わせない */
  var ex = U.$("aiex");
  if(ex){
    ex.innerHTML = AGM.nlp.EXAMPLES.map(function(t){
      return '<button type="button" data-ex="'+U.esc(t)+'">'+U.esc(t)+'</button>';
    }).join("");
  }

  var input = U.$("aitext");

  function run(text){
    if(!String(text||"").trim()){
      U.toast("いまの気分や状況を書いてください");
      return;
    }
    var r = AGM.nlp.parse(text);
    var read = U.$("airead");

    if(r.unmatched){
      /* 分からなかったときは、それらしい結果を出さずに正直に言う。
         そのうえで、店名検索という次の手を案内する。 */
      read.className = "aimiss";
      read.innerHTML =
        '<b>「'+U.esc(r.text)+'」はうまく読み取れませんでした。</b><br>'+
        'この相談は決まった言い回しを見て条件に変えているので、'+
        'まだ知らない言い方だったようです。下の例を押すか、'+
        '<a href="'+U.esc(AGM.config.href("../"))+'?q='+encodeURIComponent(r.text)+
          '">店名・住所として検索する</a>'+
        'こともできます。';
      read.hidden = false;
      /* 【重要】前回の結果を必ず消す。
         残っていると「ぬるぽ」に対して前の3軒が出ているように見えてしまい、
         読み取れなかったのに答えたことになる。 */
      U.$("recobox").innerHTML = "";
      return;
    }

    read.className = "airead";
    read.innerHTML = '<b>こう受け取りました</b><ul>'+
      r.matched.map(function(m){ return '<li>'+U.esc(m.say)+'</li>'; }).join("")+
      '</ul>';
    read.hidden = false;

    /* トップと同じ決定エンジンで3軒を出す */
    AGM.ui.wizard.setAnswers(r.answers);
    AGM.ui.reco.show(r.answers, null);
    var box = U.$("recobox");
    if(box) box.scrollIntoView({behavior:"smooth", block:"start"});
  }

  form.addEventListener("submit", function(e){
    e.preventDefault();
    run(input.value);
  });

  document.addEventListener("click", function(e){
    var b = e.target.closest && e.target.closest("[data-ex]");
    if(!b) return;
    input.value = b.getAttribute("data-ex");
    run(input.value);
  });

  /* Enter で送信（Shift+Enter は改行）。1操作減らす */
  input.addEventListener("keydown", function(e){
    if(e.key==="Enter" && !e.shiftKey){ e.preventDefault(); run(input.value); }
  });

  /* 目的別ページへの入口（内部リンク） */
  var pills = U.$("scenepills");
  if(pills && !pills.children.length){
    /* 文言はトップ・生成ページと同じ seo.h1 を使うこと。
       ここだけ city+label（「安城市ランチ」）にしていたため、
       同じリンクなのにトップ（「安城市のランチ」）と表記が違っていた。 */
    pills.innerHTML = AGM.scenes.ALL.map(function(s){
      return '<a class="chip" href="'+U.esc(AGM.config.href("../c/"+s.slug+"/"))+'">'+
        (s.icon?s.icon+" ":"")+U.esc(AGM.places.fill(s.seo.h1))+'</a>';
    }).join("");
  }

  /* URL に ?q= が付いていたらそのまま相談する（共有リンク用） */
  var p = U.readQuery();
  if(p.q){ input.value = p.q; run(p.q); }

  if(AGM.ui.slots) AGM.ui.slots.render();
}

if(document.readyState==="loading") document.addEventListener("DOMContentLoaded", init);
else init();

})();

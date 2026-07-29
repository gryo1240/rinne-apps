/* ============================================================
   nav.js － ボトムナビ（スマホ）と設定
   タブ：決める／探す／まわる順／行きたい／設定
   ・PC（1000px超）ではタブを使わず1ページに全部並べる
   ・タブの状態は URL の ?tab= に入れる（戻るボタンで戻れる）
   ============================================================ */
window.AGM = window.AGM || {};
AGM.ui = AGM.ui || {};

(function(){
"use strict";

var U = AGM.util, ST = AGM.store;
var N = AGM.ui.nav = {};

/* 決める／探す／まわる順／行きたい／設定。
   「地図」を単独のタブから外し、「探す」の中に入れた。
   地図は“探すための道具”であって、“決めるための道具”ではないため。 */
var TABS = ["home","search","plan","fav","settings"];
var current = "home";

N.current = function(){ return current; };

N.go = function(tab, opts){
  opts = opts || {};
  if(TABS.indexOf(tab)<0) tab="home";

  // 「まわる順」と「設定」はシートを開くだけ。表示中のタブは変えない
  if(tab==="plan"){
    AGM.ui.dialog.open(U.$("sheet"));
    mark("plan");
    return;
  }
  if(tab==="settings"){
    AGM.ui.dialog.open(U.$("settingsheet"));
    mark("settings");
    return;
  }

  current = tab;
  document.body.setAttribute("data-tab", tab);
  mark(tab);
  /* 表示を CSS だけに任せず hidden も合わせる（読み上げにも効かせるため） */
  ["home","search","fav"].forEach(function(v){
    var el = U.$("v-"+v);
    if(el) el.hidden = (v!==tab);
  });

  if(tab==="search"){
    AGM.ui.map.ensure().then(function(){ AGM.ui.map.invalidate(); });
  }
  if(!opts.silent) window.scrollTo({top:0, behavior:"auto"});
};

function mark(tab){
  U.all("#bottomnav button").forEach(function(b){
    b.setAttribute("aria-selected", b.getAttribute("data-tab")===tab ? "true":"false");
  });
}

/* シートを閉じたら、選択中のタブ表示を実際の画面に戻す */
function restoreMark(){
  /* 【罠4-22 の続き】シートは重なって開くことがある（まわる順 → 共有）。
     上のシートを閉じただけで無条件に画面のタブへ戻すと、
     **まわる順シートが開いたままなのにナビは「決める」**という食い違いが出る。
     まだ開いているシートがあれば、そちらを選択状態にすること。 */
  if(U.$("sheet") && U.$("sheet").classList.contains("show")){ mark("plan"); return; }
  if(U.$("settingsheet") && U.$("settingsheet").classList.contains("show")){ mark("settings"); return; }
  mark(current);
}

/* ---------- 設定 ---------- */
N.applySettings = function(){
  var s = ST.settings();
  if(s.theme==="light" || s.theme==="dark") document.documentElement.setAttribute("data-theme", s.theme);
  else document.documentElement.removeAttribute("data-theme");
  document.body.classList.toggle("compact", !!s.compact);
  var c=U.$("set-compact"); if(c) c.setAttribute("aria-pressed", s.compact?"true":"false");
  U.all("[data-theme-set]").forEach(function(b){
    b.setAttribute("aria-pressed", (s.theme||"auto")===b.getAttribute("data-theme-set") ? "true":"false");
  });
};

N.init = function(){
  U.all("#bottomnav button").forEach(function(b){
    b.addEventListener("click", function(){ N.go(this.getAttribute("data-tab")); });
  });

  /* シートを閉じたら、ナビの選択表示を実際に見えている画面に戻す。

     【罠】以前は transitionend と [data-close] のクリックだけを見ていた。
     シートには display の切り替えしか無いので transitionend は**発火しない**し、
     背景クリックと Esc は [data-close] を通らない。
     その結果、プランを閉じてもナビが「プラン」を選んだままになっていた（実測で発見）。
     いまはシートの class の変化そのものを見ているので、どの閉じ方でも戻ります。 */
  ["sheet","settingsheet","sharesheet"].forEach(function(id){
    var el=U.$(id);
    if(!el || !window.MutationObserver) return;
    new MutationObserver(function(){
      if(!el.classList.contains("show")) restoreMark();
    }).observe(el, {attributes:true, attributeFilter:["class"]});
  });

  /* --- 設定の中身 --- */
  U.all("[data-theme-set]").forEach(function(b){
    b.addEventListener("click", function(){
      var v=this.getAttribute("data-theme-set");
      ST.setSetting("theme", v==="auto" ? null : v);
      N.applySettings();
      // 地図のピンは CSS 変数から色を読むので、切り替えたら描き直す
      if(AGM.ui.map.isReady()) AGM.app.render();
    });
  });

  var comp=U.$("set-compact");
  if(comp) comp.addEventListener("click", function(){
    var on=!ST.settings().compact;
    ST.setSetting("compact", on);
    N.applySettings();
  });

  var cv=U.$("set-clearvisit");
  if(cv) cv.addEventListener("click", function(){
    var n=ST.visitedCount();
    if(!n){ U.toast("「行った」にしたお店はまだありません"); return; }
    if(!confirm("「行った」の記録"+n+"件をすべて消します。よろしいですか？")) return;
    ST.clearVisited();
    AGM.app.render();
    U.toast("記録を消しました");
  });

  /* 直近に出した店は次のおすすめで下がる（decide.js の score）。
     「もう一巡したい」ときに白紙へ戻せるようにしておく。 */
  var cs=U.$("set-clearshown");
  if(cs) cs.addEventListener("click", function(){
    ST.set(ST.KEYS.shown, []);
    U.toast("おすすめの履歴をリセットしました");
  });

  var ch=U.$("set-clearhistory");
  if(ch) ch.addEventListener("click", function(){
    if(!confirm("閲覧履歴とおすすめの学習内容を消します。よろしいですか？")) return;
    ST.clearHistory();
    AGM.ui.personal.render();
    U.toast("履歴を消しました");
  });

  N.applySettings();
  showKpi();
  N.go("home", {silent:true});
};

/* 「決めるまでの時間」を設定画面に出す。
   このアプリの最重要KPIなので、開発者が見える場所に置いておく。
   どこにも送信しません。 */
function showKpi(){
  var box = U.$("kpibox");
  if(!box) return;
  var k = ST.get("kpi.lastDecide", null);
  if(!k){ box.hidden = true; return; }
  box.hidden = false;
  box.innerHTML =
    '<span>前回、店が決まるまで <b>'+(Math.round(k.ms/100)/10)+'</b> 秒</span>'+
    '<span>タップ <b>'+k.taps+'</b> 回</span>';
}
N.showKpi = showKpi;

})();

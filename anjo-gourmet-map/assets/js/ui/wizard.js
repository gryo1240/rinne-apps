/* ============================================================
   wizard.js － 大きな質問カード
   ------------------------------------------------------------
   【いちばん大事な設計】
   目標は「30秒以内に店が決まる」ことです。質問は手段であって目的ではありません。
   だから次の3つを必ず守っています。

   1. **1タップで次へ進む。** 「次へ」ボタンを押させない（タップ数が倍になる）
   2. **いつでも結果に飛べる。** 2問目からは「この条件で見る」を常に出す。
      最短は 2タップ。全部答えても 4タップ（質問は4問）
   3. **答えなくても結果は出る。** 既定値があるので、途中でやめても止まらない

   質問の定義は decide.js の D.QUESTIONS にあります。ここは描くだけ。
   **質問を5問以上に増やさないこと。** 増やすほど決まるまでの時間が延びます。
   （2026-07-28 に5問→4問へ。効かない質問を1つ外しました。decide.js の注記を参照）
   ============================================================ */
window.AGM = window.AGM || {};
AGM.ui = AGM.ui || {};

(function(){
"use strict";

var U = AGM.util, ST = AGM.store;
var W = AGM.ui.wizard = {};

var Q = AGM.decide.QUESTIONS;
var step = 0;
var answers = AGM.decide.defaults();
var onDone = function(){};
var startedAt = 0, taps = 0;

W.answers = function(){ return answers; };
W.reset = function(){
  step = 0;
  answers = AGM.decide.defaults();
  startedAt = 0; taps = 0;
  render();
};
W.setAnswers = function(a){ answers = a; };

/* 「決まるまでの時間」を測るための計測。KPIそのものなので必ず残すこと。
   送信はしません。設定画面に出すだけです。 */
function markStart(){
  if(!startedAt) startedAt = Date.now();
}
W.stats = function(){
  return { ms: startedAt ? Date.now()-startedAt : 0, taps: taps };
};

/* ---------- 描画 ---------- */
function optionHtml(q, o){
  var cur = answers[q.id];
  var on = q.multi
    ? (cur||[]).indexOf(o.v)>=0
    : cur===o.v;
  /* 【aria-pressed は複数えらべる質問だけ】
     1つえらぶ質問では、押した瞬間に次の質問へ切り替わって**要素ごと消える**ので、
     「押された状態」を伝える意味がありません。読み上げの邪魔になるだけです。
     いまは multi の質問はありませんが、将来また足せるよう分岐は残します。 */
  return '<button type="button" class="qopt'+(on?" on":"")+'" '+
    'data-wz-opt="'+U.esc(o.v)+'"'+
    (q.multi ? ' aria-pressed="'+(on?"true":"false")+'"' : '')+'>'+
    (o.icon?'<span class="qi" aria-hidden="true">'+o.icon+'</span>':'')+
    '<span class="qt">'+U.esc(o.label)+'</span></button>';
}

/* 【並び順に意味があります】
   「いまは指定しない」を**左端＝いちばん最初に見える位置**に置くこと。
   「現在地を使う」を先頭にすると、押した瞬間にブラウザの許可ダイアログが出て、
   そこで手が止まります。出発地は無くても結果が出せるので、
   いちばん軽い選択肢を最初に見せます。 */
function originHtml(){
  var o = answers.origin;
  return '<div class="qorigin">'+
    '<button type="button" class="qopt" data-wz-origin="skip">'+
      '<span class="qi" aria-hidden="true">—</span><span class="qt">いまは指定しない</span></button>'+
    '<button type="button" class="qopt" data-wz-origin="geo">'+
      '<span class="qi" aria-hidden="true">📍</span><span class="qt">現在地を使う</span></button>'+
    '<button type="button" class="qopt" data-wz-origin="station">'+
      '<span class="qi" aria-hidden="true">🚉</span><span class="qt">駅から選ぶ</span></button>'+
    '<div class="qstation" id="qstation" hidden>'+
      '<label class="visually-hidden" for="wzstation">駅名</label>'+
      '<input id="wzstation" list="stationlist" placeholder="駅名を入力（例：安城）" '+
        'autocomplete="off" spellcheck="false">'+
      '<button type="button" class="btn" data-wz-origin="apply">この駅にする</button>'+
    '</div>'+
    (o?'<p class="qnow">いまの出発地：<b>'+U.esc(o.name)+'</b></p>':'');
}

function render(){
  var box = U.$("wizard");
  if(!box) return;

  if(step >= Q.length){ finish(); return; }
  var q = Q[step];
  var pct = Math.round(step / Q.length * 100);

  box.innerHTML =
    '<div class="qcard">'+
      '<div class="qprog" aria-hidden="true"><i style="width:'+pct+'%"></i></div>'+
      '<p class="qstep">質問 '+(step+1)+' / '+Q.length+'</p>'+
      '<h2 class="qtitle">'+U.esc(q.title)+'</h2>'+
      '<p class="qlead">'+U.esc(q.lead||"")+'</p>'+
      (q.type==="origin"
        ? originHtml()
        : '<div class="qopts'+(q.multi?" is-multi":"")+'" role="group">'+
            q.options.map(function(o){ return optionHtml(q,o); }).join("")+
          '</div>')+
      '<div class="qfoot">'+
        (step>0?'<button type="button" class="linkbtn" data-wz="back">← 戻る</button>':'<span></span>')+
        (q.multi||q.type==="origin"
          ? '<button type="button" class="btn" data-wz="next">次へ</button>'
          : '<button type="button" class="linkbtn" data-wz="skip">スキップ</button>')+
      '</div>'+
      (step>0
        ? '<button type="button" class="qjump" data-wz="finish">この条件で今すぐ見る →</button>'
        : '')+
    '</div>';

  /* 質問が切り替わったら、新しい見出しへフォーカスを移す。
     aria-live だけだと「読み上げはされるが、Tab の位置は前のまま」になり、
     キーボードだけで使う人が毎回ページの先頭から辿り直すことになります。
     1問目（step 0）は最初の描画なので動かしません（勝手にスクロールするため）。 */
  var h = box.querySelector(".qtitle");
  if(h && step>0){
    h.setAttribute("tabindex","-1");
    try{ h.focus({preventScroll:true}); }catch(e){ h.focus(); }
  }
}
W.render = render;

function finish(){
  var box = U.$("wizard");
  if(box) box.innerHTML = "";
  onDone(answers, W.stats());
}

/* ---------- 操作 ---------- */
document.addEventListener("click", function(e){
  var t = e.target.closest ? e.target.closest("[data-wz],[data-wz-opt],[data-wz-origin]") : null;
  if(!t) return;
  if(!U.$("wizard") || !U.$("wizard").contains(t)) return;

  markStart();

  /* 選択肢 */
  if(t.hasAttribute("data-wz-opt")){
    taps++;
    var q = Q[step], v = t.getAttribute("data-wz-opt");
    if(q.multi){
      var cur = (answers[q.id]||[]).slice();
      if(v==="none"){ cur = []; }
      else{
        var i = cur.indexOf(v);
        if(i>=0) cur.splice(i,1); else cur.push(v);
      }
      answers[q.id] = cur;
      render();                       // 複数選択は自動で進まない
      if(v==="none"){ step++; render(); }
      return;
    }
    answers[q.id] = (v==="any" ? "any" : v);
    /* 1タップで次へ。ここで「次へ」を押させるとタップ数が倍になる */
    step++;
    render();
    return;
  }

  /* 出発地 */
  if(t.hasAttribute("data-wz-origin")){
    taps++;
    var k = t.getAttribute("data-wz-origin");
    if(k==="geo"){
      /* 【罠】取得できなかったときも次の質問へ進んでしまい、
         「位置情報を許可しない」を選んだ人が出発地を指定できないまま先に行っていた。
         失敗したら進まず、駅を選ぶ欄をその場で開くこと（実測で発見）。 */
      AGM.ui.filters.useGeolocation(function(o){
        if(!o){
          var s = U.$("qstation");
          if(s){ s.hidden=false; var inp=U.$("wzstation"); if(inp) inp.focus(); }
          return;
        }
        answers.origin = o; step++; render();
      });
      return;
    }
    if(k==="station"){
      var s = U.$("qstation");
      if(s){ s.hidden=false; var inp=U.$("wzstation"); if(inp) inp.focus(); }
      return;
    }
    if(k==="apply"){
      /* 【重要】駅データはあとから読み込む（27KB）。
         読み込みが終わる前に押されると、実在する駅でも
         「その駅は見つかりません」と**嘘の案内**を出してしまいます。
         入力欄に触れた時点で読み込みは始まっているので、ここでは待つだけ。 */
      if(!AGM.ui.filters.stationsReady()){
        var self = t;
        AGM.ui.filters.ensureStations(function(){ self.click(); });
        return;
      }
      var name = (U.$("wzstation")||{}).value || "";
      var st = AGM.ui.filters.STATION_BY_NAME[name.trim()] ||
               AGM.ui.filters.STATION_BY_NAME[name.trim()+"駅"];
      if(st){
        answers.origin = {name:st.n, lat:st.lat, lng:st.lng, q:st.n};
        AGM.ui.filters.setOrigin(answers.origin, {fit:false});
        step++; render();
      }else{
        U.toast("その駅は見つかりません（愛知県の駅名を入力してください）");
      }
      return;
    }
    if(k==="skip"){ answers.origin=null; step++; render(); return; }
  }

  /* 送り／戻し */
  var a = t.getAttribute("data-wz");
  if(a==="back"){ taps++; step=Math.max(0,step-1); render(); return; }
  if(a==="skip" || a==="next"){ taps++; step++; render(); return; }
  if(a==="finish"){ taps++; step=Q.length; render(); return; }
});

/* 駅名を選んだ瞬間に確定する（候補から選べば1タップ減る） */
document.addEventListener("input", function(e){
  if(!e.target || e.target.id!=="wzstation") return;
  /* まだ駅データが来ていないときは何もしない（読み込みは focusin で始まっている）。
     ここで嘘の判定をしないこと。確定は「この駅にする」が待ってくれる。 */
  if(!AGM.ui.filters.stationsReady()){ AGM.ui.filters.ensureStations(); return; }
  var st = AGM.ui.filters.STATION_BY_NAME[e.target.value.trim()];
  if(st){
    answers.origin = {name:st.n, lat:st.lat, lng:st.lng, q:st.n};
    AGM.ui.filters.setOrigin(answers.origin, {fit:false});
    taps++; step++; render();
  }
});

W.init = function(cb){
  onDone = cb || function(){};
  /* 前回の答えを覚えておく。2回目からは1タップ短くなる */
  var saved = ST.get("answers.v1", null);
  if(saved && saved.who){ answers = saved; }
  render();
};

W.save = function(){ ST.set("answers.v1", answers); };
W.goResult = function(){ step = Q.length; render(); };

})();

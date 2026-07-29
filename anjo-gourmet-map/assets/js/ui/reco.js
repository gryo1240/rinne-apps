/* ============================================================
   reco.js － おすすめ3軒
   ------------------------------------------------------------
   【一覧を出さないこと】
   ここで4軒目を出したくなったら、その気持ちをこらえてください。
   選択肢が増えるほど決まりません。出すのは3軒だけ。
   「ほかの店にする」で1軒ずつ差し替えられるようにしてあるので、
   一覧に戻さなくても選び直せます。

   【カードの並び】ご依頼の優先順位そのまま。
     ① おすすめ理由（いちばん上・いちばん大きく）
     ② 店名
     ③ 写真（＝visual.js が作る代替の絵。写真は権利上のせません）
     ④ 現在地からの距離
     ⑤ 営業時間
     ⑥ 駐車場
     ⑦ Googleマップ

   理由がいちばん上なのは、ユーザーが知りたいのが
   「この店は何なのか」ではなく「なぜ今日の私に合うのか」だからです。
   ============================================================ */
window.AGM = window.AGM || {};
AGM.ui = AGM.ui || {};

(function(){
"use strict";

var U = AGM.util, T = AGM.taxonomy, ST = AGM.store;
var R = AGM.ui.reco = {};

var last = null;        // 直近の結果（差し替え用）
var lastAnswers = null; // そのときの条件（距離表示と差し替えに使う）

R.result = function(){ return last; };

/* 距離は「そのとき答えた出発地」で出すこと。
   【罠】ここで AGM.ui.filters.origin()（絞り込みタブ側の出発地）を見ていたため、
   /ai で「三河安城駅の近く」と入力しても、理由には「三河安城駅から◯m」と出るのに
   カードには距離が出ない、というちぐはぐな状態になっていた（実測で発見）。
   おすすめの根拠と表示は同じ出発地から作ること。 */
function originOf(pick){
  var a = pick && pick.answers;
  if(a && a.origin) return a.origin;
  var f = AGM.ui.filters;
  return (f && f.origin) ? f.origin() : null;
}

function cardHtml(pick, rank){
  var p = pick.place;
  var st = AGM.shops.state(p);
  var origin = originOf(pick);
  var d = origin ? U.km(origin.lat,origin.lng,p.lat,p.lng) : null;
  var c = T.color(p.big);
  var inPlan = AGM.ui.plan.has(p.id);
  var want = ST.isFav(p.id);

  /* 理由は上位4つまで。多すぎると読まれず、少なすぎると納得できない */
  var reasons = pick.reasons.slice(0,4);

  return '<article class="reco" style="--cc:'+c+';--cc-soft:'+T.soft(c)+'" data-id="'+U.esc(p.id)+'">'+

    /* ① おすすめ理由 */
    '<div class="reco-why">'+
      '<p class="reco-why-h"><span class="rk">'+rank+'</span>今日これをおすすめする理由</p>'+
      '<ul>'+ reasons.map(function(r){
        return '<li><span class="ri" aria-hidden="true">'+r.icon+'</span>'+U.esc(r.text)+'</li>';
      }).join("") +'</ul>'+
    '</div>'+

    /* ② 店名 */
    '<h3 class="reco-name"><a href="'+U.esc(p.detailUrl)+'" data-detail="'+U.esc(p.id)+'">'+
      U.esc(p.name)+'</a></h3>'+

    /* ③ 絵（写真の代わり） */
    AGM.ui.visual.html(p, {size:"wide"})+

    /* ④〜⑥ 事実 */
    '<dl class="reco-facts">'+
      (d!==null
        ? '<div><dt>距離</dt><dd>'+U.esc(U.fmtDist(d))+'（徒歩'+U.walkMin(d)+'分）</dd></div>'
        : '')+
      '<div><dt>いま</dt><dd><span class="openbadge is-'+st.code+'">'+
        '<span class="dot" aria-hidden="true">'+st.sign+'</span>'+U.esc(st.label)+'</span></dd></div>'+
      (p.hours?'<div><dt>営業時間</dt><dd>'+U.esc(U.oneline(p.hours))+'</dd></div>':'')+
      (p.closed?'<div><dt>定休日</dt><dd>'+U.esc(p.closed)+'</dd></div>':'')+
      '<div><dt>駐車場</dt><dd>'+U.esc(p.parking||"記載なし")+'</dd></div>'+
    '</dl>'+

    /* ⑦ 行動。

       【ボタンは1つに絞ること】
       以前は1枚に5個（Googleマップ／プラン／行きたい／ほかの店／詳しく見る）並べていました。
       **決断疲れをなくすアプリなのに、決めた直後に選択肢を5つ増やしていた**わけです。
       表に出すのは「Googleマップで行く」だけ。
       「ほかの店にする」は決め直しの導線なので同じ高さに置き、
       残りは <details> にたたみます。 */
    '<div class="reco-acts">'+
      '<a class="btn primary block" href="'+U.gmapUrl(p, origin)+'" '+
        'target="_blank" rel="noopener">Googleマップで行く</a>'+
      '<button class="linkbtn" data-reco-swap="'+U.esc(p.id)+'">ほかの店にする</button>'+
      '<details class="reco-more">'+
        '<summary>ほかの操作</summary>'+
        '<button class="btn ghost'+(inPlan?" on":"")+'" data-plan="'+U.esc(p.id)+'">'+
          (inPlan?"✓ 入れた":"＋ 今日まわる順番に入れる")+'</button>'+
        '<button class="btn ghost'+(want?" on":"")+'" data-fav="'+U.esc(p.id)+'" '+
          'aria-pressed="'+(want?"true":"false")+'">'+(want?"✓ 行きたい":"♡ 行きたい")+'</button>'+
        '<a class="btn ghost" href="'+U.esc(p.detailUrl)+'" data-detail="'+U.esc(p.id)+'">詳しく見る</a>'+
      '</details>'+
    '</div>'+
  '</article>';
}

/* ---------- 表示 ---------- */
R.show = function(answers, stats){
  var box = U.$("recobox");
  if(!box) return;
  var res = AGM.decide.run(answers);
  /* 各カードが「どの条件で選ばれたか」を持ち歩けるようにする（距離の表示に使う） */
  res.picks.forEach(function(x){ x.answers = answers; });
  last = res;
  lastAnswers = answers;

  if(!res.picks.length){
    box.innerHTML = '<div class="card pad empty">'+
      'いま開いているお店が見つかりませんでした。<br>'+
      '<button class="btn ghost" data-wz="restart" style="margin-top:10px">条件を変える</button></div>';
    return;
  }

  var head =
    '<div class="reco-head">'+
      '<h2>今日のあなたに合う'+res.picks.length+'軒</h2>'+
      '<p class="reco-sub">'+U.esc(summary(answers))+'</p>'+
      /* 「答えたことが結果にどう効いたか」を数で見せる。
         条件を足したときに数が減るのが見えると、選ぶ手が止まりません。 */
      '<p class="reco-count">条件に合う <b>'+res.total+'軒</b> の中から選びました'+
        '（掲載 '+AGM.places.ALL.length+'軒）</p>'+
      /* ゆるめたことは必ず出す。ただし**謝らないこと。**
         謝ると機能不足に読めます。何をしたかだけを事実として書く。 */
      (res.relaxed.length
        ? '<p class="reco-relax"><b>'+U.esc(res.relaxed.join("・"))+
          '</b> で絞ると3軒に足りなかったため、その条件だけ外した結果です。</p>'
        : '')+
      (res.crowd && res.crowd.text
        ? '<p class="reco-crowd">🕒 '+U.esc(res.crowd.text)+
          '<span class="tiny">（混雑の実データは持っていません。時間帯からの目安です）</span></p>'
        : '')+
    '</div>';

  /* 質問から外した4条件は、ここで**見たあとに足せる**ようにする。
     先に聞いても効かない条件（駐車場90/100・予約85/100・禁煙84/100・子連れ74/100）でも、
     3軒を見たあとの「駐車場だけは要る」には効きます。
     押すとその場で3軒を作り直します（質問カードには戻しません）。 */
  var refine =
    '<div class="reco-refine" role="group" aria-label="条件を足す">'+
      '<span class="reco-refine-h">条件を足す</span>'+
      [{k:"parking",i:"🅿️",l:"駐車場"},
       {k:"kids",   i:"👶",l:"子連れ席"},
       {k:"nosmoke",i:"🚭",l:"全席禁煙"},
       {k:"reserve",i:"📞",l:"予約したい"}].map(function(o){
        var on=(answers.need||[]).indexOf(o.k)>=0;
        return '<button type="button" class="chip'+(on?" on":"")+'" '+
          'data-reco-need="'+o.k+'" aria-pressed="'+(on?"true":"false")+'">'+
          o.i+' '+o.l+'</button>';
      }).join("")+
    '</div>';

  var foot =
    '<div class="reco-foot">'+
      '<button class="btn ghost" data-wz="restart">条件を変えてもう一度</button>'+
      '<button class="btn ghost" data-reco="all">3軒ぜんぶプランに入れる</button>'+
      '<a class="linkbtn" href="#v-search" data-tabgo="search">自分でじっくり探す</a>'+
    '</div>'+
    '<p class="tiny reco-note">条件から自動で選んでいます（端末の中だけで計算しており、'+
      '外部のAIサービスには接続していません）。'+
      '営業時間・定休日は変わることがあります。おでかけ前にご確認ください。</p>';

  box.innerHTML = head + refine +
    '<div class="reco-list">'+
      res.picks.map(function(x,i){ return cardHtml(x, i+1); }).join("")+
    '</div>' + foot;

  /* KPI：何タップ・何秒で結果まで来たか。設定画面に出すために残す。
     ms が 0 でも記録すること（速すぎて記録されない、では計測にならない）。 */
  if(stats){
    ST.set("kpi.lastDecide", {ms:stats.ms||0, taps:stats.taps||0, at:Date.now()});
    if(AGM.ui.nav && AGM.ui.nav.showKpi) AGM.ui.nav.showKpi();
  }
  box.setAttribute("data-count", res.picks.length);

  /* 直近に出した店IDを最大9件・新しい順で覚えておく。
     decide.js の score() がここを見て、直近に出した店を下げます。
     ＝ 3回続けて同じ3軒を見せないための記録。送信はしません。 */
  var prev = ST.get(ST.KEYS.shown, []) || [];
  var now3 = res.picks.map(function(x){ return String(x.place.id); });
  ST.set(ST.KEYS.shown, now3.concat(prev.filter(function(id){
    return now3.indexOf(id)<0;
  })).slice(0,9));
};

function summary(a){
  var W = {family:"家族で", solo:"一人で", date:"デート", friends:"友達と",
           tourist:"観光で", takeout:"テイクアウト"};
  var bits = [];
  /* 【罠】棚や「安城市のランチ」ページから来たときは who が空なので、
     以前はここが「条件はおまかせ」になり、ランチを選んで来たことが伝わらなかった。
     シーンも条件として必ず出すこと（実測で発見）。 */
  if(a.scene){
    var sc = AGM.scenes.get(a.scene);
    if(sc) bits.push(sc.label);
  }
  if(a.who) bits.push(W[a.who]||a.who);
  if(a.origin) bits.push(a.origin.name+"から");
  if(a.openNow) bits.push("いま営業中");
  if(a.budget && a.budget!=="any") bits.push("〜"+parseInt(a.budget,10).toLocaleString()+"円");
  (a.need||[]).forEach(function(n){
    var L={parking:"駐車場あり",kids:"子連れOK",nosmoke:"全席禁煙",reserve:"予約したい"};
    if(L[n]) bits.push(L[n]);
  });
  if(a.stay && a.stay!=="any"){
    var S={short:"さっと30分", normal:"1時間くらい", long:"ゆっくり2時間"};
    if(S[a.stay]) bits.push(S[a.stay]);
  }
  return bits.length ? bits.join(" ／ ") : "条件はおまかせ";
}
R.summary = summary;

/* 1軒だけ差し替える。一覧に戻さずに選び直せるようにするための機能 */
R.swap = function(id){
  if(!last) return;
  var ids = last.picks.map(function(x){ return String(x.place.id); });
  /* 差し替えも「そのとき答えた条件」で探すこと。
     wizard.answers() を見ると、棚や /ai から来たときに条件が食い違う。 */
  var ans = lastAnswers || AGM.ui.wizard.answers();
  var next = AGM.decide.another(ans, ids);
  if(!next){ U.toast("これ以上の候補がありません"); return; }
  var i = ids.indexOf(String(id));
  if(i<0) return;
  next.answers = ans;
  last.picks[i] = next;
  var box = U.$("recobox");
  var list = U.qs(".reco-list", box);
  if(list) list.innerHTML = last.picks.map(function(x,n){ return cardHtml(x, n+1); }).join("");
  U.toast("別のお店に差し替えました");
};

/* 結果画面のチップ（条件を足す／外す）。
   【重要】答えは **lastAnswers** を使うこと。
   wizard.answers() を見ると、棚や /ai から来たときに条件が食い違います
   （上の R.swap と同じ理由）。 */
R.toggleNeed = function(key){
  var a = lastAnswers || AGM.ui.wizard.answers();
  if(!a) return;
  a.need = (a.need||[]).slice();
  var i = a.need.indexOf(key);
  if(i>=0) a.need.splice(i,1); else a.need.push(key);
  R.show(a, null);          // その場で3軒を作り直す（質問には戻さない）
};

R.addAll = function(){
  if(!last) return;
  AGM.ui.plan.set(last.picks.map(function(x){ return String(x.place.id); }),
    "おすすめの3軒を今日まわる順番に入れました。");
  U.toast("3軒をプランに入れました");
};

})();

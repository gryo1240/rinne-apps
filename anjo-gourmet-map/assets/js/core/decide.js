/* ============================================================
   decide.js － 「今日の自分に合う3軒」を決める
   ------------------------------------------------------------
   このアプリの中心です。検索エンジンではありません。

   【設計の考え方】
   ・出すのは **3軒だけ**。選択肢が増えるほど決まらなくなる（選択のパラドックス）
   ・**必ず理由を言う。** 理由の無いおすすめは、ユーザーからは「ランダム」と同じ
   ・理由は **持っているデータで裏が取れる事実だけ**。作文しない
   ・条件に合う店が3軒に満たないときは、**黙って諦めず条件をゆるめて、
     ゆるめたことを画面に出す**。「0件です」は意思決定を止めてしまう

   【外部のAIには接続していません】
   端末の中の採点だけで動きます。通信も発生しません。画面にもそう書いています。
   「AI」と名乗る以上、何をしているかは正直に出すこと。

   【混雑について】
   実際の混雑データは持っていません。時間帯からの一般的な目安だけを、
   「ピークを過ぎた時間帯です」という言い方で添えます（scenes.crowdHint）。
   「空いています」と断定しないこと。
   ============================================================ */
window.AGM = window.AGM || {};

(function(){
"use strict";

var U = AGM.util, SC = AGM.scenes;
var D = AGM.decide = {};

/* ---------- 質問の定義 ----------
   ここを増やすと画面（wizard.js）も自動で増えます。
   ただし **5問を超えないこと**。増やすほど決まるまでの時間が延びます。 */
D.QUESTIONS = [
  { id:"who", title:"今日はどんな気分ですか？", lead:"いちばん近いものを1つ",
    options:[
      { v:"family",  label:"家族で",       icon:"👨‍👩‍👧" },
      { v:"solo",    label:"一人",         icon:"🙂" },
      { v:"date",    label:"デート",       icon:"🍷" },
      { v:"friends", label:"友達",         icon:"🎉" },
      { v:"tourist", label:"観光",         icon:"📷" },
      { v:"takeout", label:"テイクアウト", icon:"🥡" }
    ] },
  { id:"budget", title:"ひとりいくらくらい？", lead:"だいたいで大丈夫です",
    options:[
      { v:"1000", label:"〜1,000円" },
      { v:"2000", label:"〜2,000円" },
      { v:"3000", label:"〜3,000円" },
      { v:"any",  label:"こだわらない" }
    ] },
  { id:"stay", title:"どのくらい滞在しますか？", lead:"だいたいで大丈夫です",
    options:[
      { v:"short",  label:"さっと30分" },
      { v:"normal", label:"1時間くらい" },
      { v:"long",   label:"ゆっくり2時間" },
      { v:"any",    label:"きめていない" }
    ] },
  /* 【位置情報の質問はいちばん最後に置くこと】
     「現在地を使う」を押すとブラウザの許可ダイアログが出ます。
     途中に置くと、そこで手が止まって以降の質問に進めない人が出ます。
     最後なら、断っても・許可しても、そのまま結果に進めます。 */
  { id:"where", title:"いまどのあたりですか？", lead:"最後の質問です。指定しなくても結果は出ます",
    type:"origin" }
];

/* 【2026-07-28 削除】質問「必要なものはありますか？」（id:"need"）

   data/shops.json を数えたところ、4つの選択肢の該当率はこうでした。
     駐車場 90/100 ／ 予約したい 85/100 ／ 全席禁煙 84/100 ／ 子連れOK 74/100
   **どれも絞り込みとして働いていません。**
   しかも multi:true なので唯一「次へ」を押させる質問＝いちばんタップ数が多く、
   いちばん効かない質問になっていました。

   条件そのものは消していません。**結果画面のチップ**に移し、
   3軒を見たあとで足せるようにしています（reco.js の reco-refine）。
   「効かない条件で先に絞る」より「見てから足す」ほうが速く決まります。
   answers.need の形は変えていないので、filters() も reasonsFor() もそのままです。 */

/* 既定の答え。何も選ばなくても結果が出るようにしておく（＝1タップでも決まる） */
D.defaults = function(){
  /* need は質問からは無くなりましたが、**形は残すこと**。
     filters() と reasonsFor() が参照していますし、
     結果画面のチップ（reco-refine）がここに足していきます。 */
  return { who:null, origin:null, budget:"any", need:[], stay:"any", openNow:true };
};

/* ---------- 理由づくり ----------
   ひとつずつ「なぜこの店なのか」を文にする。
   weight が大きいほど上に出る。最大4つまで画面に出す。 */
function reasonsFor(p, a, now){
  var out = [];

  /* 【同じ話題を2回言わないこと】
     以前は「子連れでの利用に対応しています」が2つ並んでいました（利用者の指摘で発覚）。
     同行者が家族のとき（重み84）と、条件で子連れ席を指定したとき（重み86）の
     **両方から同じ文が足されていた**ためです。
     駐車場・予約・禁煙・Wi-Fi にも同じ重複がありました。

     見た目の問題だけではありません。**スコアは理由の重みの合計**なので、
     重複するとその店だけ二重に加点され、並び順が狂います。

     そこで話題（key）ごとに1つだけ残し、重みの大きいほうを採用します。
     文言が違っても話題が同じなら1つにまとめること
     （例：「全席禁煙です」と「全席禁煙なので子どもがいても安心です」）。 */
  function add(w, icon, text, key){
    key = key || text;
    for(var i=0;i<out.length;i++){
      if(out[i].key===key){
        if(w > out[i].w){ out[i].w=w; out[i].icon=icon; out[i].text=text; }
        return;
      }
    }
    out.push({w:w, icon:icon, text:text, key:key});
  }

  /* 1. いま入れるか。決め手としていちばん強い */
  var st = AGM.shops.state(p, now);
  if(st.code==="open"){
    add(100, "🟢", st.sub ? ("いま営業中（"+st.sub+"）") : "いま営業中です");
  }else if(st.code==="closed" && st.sub){
    add(40, "🕒", st.sub.indexOf("から")>=0 ? ("本日"+st.sub+"開きます") : st.sub);
  }else if(st.code==="unknown"){
    add(20, "❓", "営業時間が読み取れないため、電話で確認できると確実です");
  }

  /* 2. どれくらいで着くか */
  if(a.origin){
    var km = U.km(a.origin.lat, a.origin.lng, p.lat, p.lng);
    var min = U.walkMin(km);
    if(km <= 1.2) add(90, "🚶", "徒歩"+min+"分（"+U.fmtDist(km)+"）");
    else add(70, "🚗", a.origin.name+"から"+U.fmtDist(km)+"（車で数分）");
  }

  /* 3. 同行者に効く事実 */
  if(a.who==="family"){
    if(p.hasFeature("kidsmenu")) add(88, "👶", "お子様メニューがあります", "kids");
    else if(p.hasFeature("kids")) add(84, "👶", "子連れでの利用に対応しています", "kids");
    if(p.hasParking) add(80, "🅿️", parkingText(p), "parking");
    if(p.hasFeature("nosmoke")) add(60, "🚭", "全席禁煙なので子どもがいても安心です", "nosmoke");
  }else if(a.who==="date"){
    if(p.hasFeature("reserve")) add(82, "📞", "席の予約ができます", "reserve");
    if(p.hasFeature("nosmoke")) add(58, "🚭", "全席禁煙です", "nosmoke");
    if(p.seatCount!=null && p.seatCount<=24) add(64, "🤫", p.seatCount+"席のこぢんまりしたお店です", "seats");
  }else if(a.who==="friends"){
    if(p.seatCount!=null && p.seatCount>=30) add(80, "👥", p.seatCount+"席あるので人数が増えても入りやすいです", "seats");
    if(p.hasFeature("reserve")) add(76, "📞", "席の予約ができます", "reserve");
  }else if(a.who==="solo"){
    if(p.seatCount!=null && p.seatCount<=20) add(78, "🤫", p.seatCount+"席の落ち着いたお店です", "seats");
    if(p.hasFeature("wifi")) add(66, "📶", "無料Wi-Fiが使えます", "wifi");
  }else if(a.who==="tourist"){
    if(p.hasParking) add(78, "🅿️", parkingText(p), "parking");
    if(p.hasFeature("takeout")) add(58, "🥡", "テイクアウトもできます", "takeout");
  }else if(a.who==="takeout"){
    if(p.hasFeature("takeout")) add(92, "🥡", "テイクアウトのメニューがあります", "takeout");
    if(p.hasFeature("delivery")) add(72, "🛵", "宅配にも対応しています", "delivery");
  }

  /* 4. 明示的に求められた条件 */
  (a.need||[]).forEach(function(n){
    if(n==="parking" && p.hasParking) add(86, "🅿️", parkingText(p), "parking");
    if(n==="kids" && p.hasFeature("kids")) add(86, "👶", "子連れでの利用に対応しています", "kids");
    if(n==="nosmoke" && p.hasFeature("nosmoke")) add(74, "🚭", "全席禁煙です", "nosmoke");
    if(n==="reserve" && p.hasFeature("reserve")) add(74, "📞", "席の予約ができます", "reserve");
  });

  /* 5. お金の話 */
  if(p.budget!=null){
    if(a.budget!=="any" && p.budget<=parseInt(a.budget,10))
      add(68, "💴", "昼の平均予算 "+p.lunch+"（ご希望の範囲内）", "budget");
    else add(46, "💴", "昼の平均予算 "+p.lunch, "budget");
  }else if(p.dinner){
    add(44, "💴", "夜の平均予算 "+p.dinner, "budget");
  }

  /* 6. 時間帯の目安（混雑データは持っていないので断定しない） */
  var ch = SC.crowdHint(now);
  if(ch.level==="calm" && st.code==="open") add(56, "🍃", ch.text, "crowd");

  /* 7. 滞在時間 */
  if(a.stay==="short" && p.hasFeature("takeout")) add(50, "⏱", "持ち帰りもできるので短時間でも使えます", "takeout");
  if(a.stay==="long" && p.hasFeature("wifi")) add(50, "⏱", "Wi-Fiがあるので長めの滞在にも向きます", "wifi");

  /* 7-2. 自然文（/ai）から来た追加の希望 */
  if(a.wantWifi && p.hasFeature("wifi")) add(80, "📶", "無料Wi-Fiが使えます", "wifi");
  if(a.wantVeggie && p.hasFeature("veggie")) add(78, "🥗", "野菜を多く使ったメニューがあります", "veggie");
  if(a.scene){
    var sc = SC.get(a.scene);
    if(sc && SC.match(p, sc, now)) add(72, sc.icon||"✓", sc.label+"に使えるお店です", "scene");
  }

  /* 8. どうしても理由が無いとき（最低1つは必ず言う） */
  if(!out.length){
    add(10, "📍", "安城市"+(p.addr||"")+"の"+p.genre+"のお店です");
  }

  out.sort(function(x,y){ return y.w-x.w; });
  return out;
}

function parkingText(p){
  var n = U.money(p.parking);
  return n ? ("駐車場が"+n+"台あります") : "駐車場があります";
}

/* ---------- 日替わりのゆらぎ ----------
   【なぜ必要か】
   3軒は「別カテゴリの最高得点店」に固定されるうえ、スコアは営業中の +60 が支配的です。
   そのため**同じ時間帯なら、答えを変えてもほぼ同じ3軒**が出ていました。
   100軒／8ジャンルではこれが致命的で、3回使うと手札が尽きます。

   【乱数を使わないこと】
   同じ日に何度押しても順序が変わると、ユーザーからは「壊れた」に見えます。
   店IDと日付から決まるハッシュを使い、**同じ日・同じ条件なら必ず同じ結果**にします。 */
function seedHash(str){
  var h=2166136261;
  for(var i=0;i<str.length;i++){ h^=str.charCodeAt(i); h=Math.imul(h,16777619); }
  return (h>>>0);
}
function daySeed(now){
  return String(now.getFullYear())+String(now.getMonth()+1)+String(now.getDate());
}

/* ---------- 採点 ----------
   理由の重みの合計＝スコア。「理由が強い店ほど上」という素直な作りにしている。
   スコアと表示理由がずれると、ユーザーから見て納得できない並びになる。 */
function score(p, a, now, reasons){
  var s = 0;
  reasons.slice(0,5).forEach(function(r){ s += r.w; });

  var st = AGM.shops.state(p, now);
  if(st.code==="open") s += 60;
  else if(st.code==="unknown") s += 10;

  if(a.origin){
    var km = U.km(a.origin.lat, a.origin.lng, p.lat, p.lng);
    /* 「雨の日」「急いでる」のときは近さの重みを倍にする（nearFirst） */
    s += Math.max(0, 60 - km*12) * (a.nearFirst ? 2 : 1);
  }
  if(a.wantWifi && p.hasFeature("wifi")) s += 30;
  if(a.wantVeggie && p.hasFeature("veggie")) s += 30;
  /* 情報がそろっている店を少しだけ優遇（行って閉まっていた、を減らすため） */
  if(p._hi.parsed) s += 8;
  if(p.hours) s += 4;

  /* 日替わりのゆらぎ。**最大 +24 に抑えること。**
     営業中の +60 を覆すと、閉まっている店を上に出してしまいます。 */
  s += seedHash(String(p.id)+"|"+daySeed(now)) % 25;

  /* 直近に出した店は下げる。3回続けて同じ3軒を見せないため。
     先頭（＝いちばん最近出した店）ほど強く下げ、古いものほど戻す。

     【この数字の根拠】実測して決めました。
     ・**Math.max(0, …) を外さないこと。** 外すと si が5以上のときに引く値が負になり、
       「最近出した店ほど**加点**される」という逆の動きになります。
     ・最初は -40 から始めましたが、スコアは理由の重みの合計（実測300〜500）が主で、
       -40 では1割ほどにしかならず**3回まわしても5軒しか変わりませんでした**。
       100 まで上げて9軒中7軒が入れ替わることを確認しています。
     ・**上限は 100 まで。** 営業中の店は「+60（ここ）＋100（理由の重み）」で
       160 の差がついているので、100 なら営業していない店を上に出すことはありません。 */
  var shown = AGM.store.get(AGM.store.KEYS.shown, []) || [];
  var si = shown.indexOf(String(p.id));
  if(si >= 0) s -= Math.max(0, 100 - si*12);

  return s;
}

/* ---------- 条件（ハードフィルタ） ----------
   ここで落とす＝「行っても意味がない」もの。
   ゆるめる順番が大事なので、外す優先度つきで持つ。 */
function filters(a){
  var list = [];
  list.push({ key:"gone", label:"閉業した店", drop:false,
    test:function(p){ return !p.closedForGood; } });
  list.push({ key:"holiday", label:"本日定休日の店", drop:false,
    test:function(p, now){ return AGM.shops.state(p, now).code!=="holiday"; } });

  /* 【いちばん最後にゆるめること（order:0）】
     以前は order:5 で、シーンの次＝2番目に外していました。その結果
     「全席禁煙」や「予算」は守ったまま**閉まっている店を出す**という逆転が起きます。
     このアプリは「今日どこに行くか」を決める道具なので、
     閉まっている店を出すのがいちばん役に立たない失敗です。
     禁煙・予約・駐車場・子連れ・予算をすべて外してもなお3軒に届かないときだけ、
     最後の手段としてここを外します。 */
  if(a.openNow) list.push({ key:"openNow", label:"いま営業中", drop:true, order:0,
    test:function(p, now){ return AGM.shops.state(p, now).openNow; } });

  if(a.budget && a.budget!=="any"){
    var lim = parseInt(a.budget,10);
    list.push({ key:"budget", label:"予算 〜"+lim.toLocaleString()+"円", drop:true, order:3,
      test:function(p){
        var b = p.budget!=null ? p.budget : p.budgetDinner;
        return b==null || b<=lim;         // 予算不明の店は落とさない（情報が無いだけ）
      } });
  }
  (a.need||[]).forEach(function(n){
    if(n==="parking") list.push({ key:"parking", label:"駐車場あり", drop:true, order:2,
      test:function(p){ return p.hasParking; } });
    if(n==="kids") list.push({ key:"kids", label:"子連れOK", drop:true, order:1,
      same:"kids", test:function(p){ return p.hasFeature("kids"); } });
    if(n==="nosmoke") list.push({ key:"nosmoke", label:"全席禁煙", drop:true, order:4,
      test:function(p){ return p.hasFeature("nosmoke"); } });
    if(n==="reserve") list.push({ key:"reserve", label:"予約できる", drop:true, order:4,
      test:function(p){ return p.hasFeature("reserve"); } });
  });
  if(a.who==="takeout") list.push({ key:"takeout", label:"テイクアウトあり", drop:true, order:1,
    test:function(p){ return p.hasFeature("takeout"); } });
  if(a.who==="family") list.push({ key:"family", label:"子連れOK", drop:true, order:2,
    same:"kids", test:function(p){ return p.hasFeature("kids"); } });

  /* 自然文（/ai）やホームの棚から来たシーン指定。
     いちばん最初にゆるめる（order 6）＝ユーザーの言葉から推測した条件なので、
     はっきり選ばれた条件より先に外すのが筋。 */
  if(a.scene){
    var sc = SC.get(a.scene);
    if(sc) list.push({ key:"scene", label:sc.label, drop:true, order:6,
      test:function(p, now){ return SC.match(p, sc, now); } });
  }

  /* 【同じことを見ている条件をまとめる】(2026-07-29)
     質問で「家族で」を選ぶと who=family の条件が、結果画面で「子連れ席」チップを
     押すと need:kids の条件が入ります。**中身はまったく同じ判定**なので、
     両方そろうと次の3つが起きていました。

       1. 同じ判定を毎回2回する（100店ぶん無駄に回る）
       2. ゆるめても片方が残るので、1回ぶん空振りする。
          そのぶん本当に外すべき条件まで手が回らず、3軒に届かないことがある
       3. 画面に「子連れOK・子連れOK」と2回出る（実測で発見）

     残すのは order が小さいほう＝**あとまで持ちこたえる側**です。
     利用者が自分でチップを押して足した条件（order 1）のほうが、
     質問から推測した条件（order 2）より意思がはっきりしているためです。

     新しく条件を足すときは、既存と同じ判定になっていないか確かめて、
     同じなら same に同じ名前を付けてください。 */
  var kept = {};
  list = list.filter(function(f){
    if(!f.same) return true;
    var prev = kept[f.same];
    if(!prev){ kept[f.same] = f; return true; }
    if((f.order||0) < (prev.order||0)){
      prev.skip = true;          // 先に入れたほうを落とす
      kept[f.same] = f;
      return true;
    }
    return false;
  }).filter(function(f){ return !f.skip; });

  return list;
}
/* 自己点検から中身を見るための入口。画面からは使いません。
   ここを外すと selfcheck.py の「同じ判定の条件が二重に入らない」が飛ばされます。 */
D.filters = filters;

function apply(pool, list, now){
  return pool.filter(function(p){
    for(var i=0;i<list.length;i++){ if(!list[i].test(p, now)) return false; }
    return true;
  });
}

/* ---------- 本体 ----------
   返り値
     { picks:[{place,reasons,score}], relaxed:[外した条件名], usedFilters:[効いた条件名] }
   picks は必ず3件（データが3件未満のときを除く）。 */
D.run = function(answers, opts){
  opts = opts || {};
  var a = answers || D.defaults();
  var now = opts.now || U.nowJST();
  var want = opts.limit || 3;
  var pool = (opts.pool || AGM.places.ALL).slice();

  var list = filters(a), relaxed = [];
  var rows = apply(pool, list, now);

  /* 3軒に満たなければ、外してよい条件を**弱い順に**外していく。
     「0件です」を出さないため。外したことは必ず画面に出す。 */
  var droppable = list.filter(function(f){ return f.drop; })
                      .sort(function(x,y){ return (y.order||0)-(x.order||0); });
  var gi = 0;
  while(rows.length < want && gi < droppable.length){
    var target = droppable[gi++];
    list = list.filter(function(f){ return f!==target; });
    /* 同じ文言を2回並べない。「子連れOK・子連れOK」と出ると、
       何を外されたのか分からなくなります（filters() の same も参照）。 */
    if(relaxed.indexOf(target.label) < 0) relaxed.push(target.label);
    rows = apply(pool, list, now);
  }

  var scored = rows.map(function(p){
    var rs = reasonsFor(p, a, now);
    return { place:p, reasons:rs, score:score(p, a, now, rs) };
  }).sort(function(x,y){
    return y.score-x.score || x.place.name.localeCompare(y.place.name,"ja");
  });

  /* 同じジャンルばかりにならないようにする。
     3軒とも同じだと「選んだ感」が出ず、比較して決められない。 */
  var picks = [], usedGroup = {}, usedCat = {};
  scored.forEach(function(x){
    if(picks.length>=want) return;
    if(usedCat[x.place.catId]) return;
    picks.push(x);
    usedGroup[x.place.groupId]=1; usedCat[x.place.catId]=1;
  });
  for(var i=0;i<scored.length && picks.length<want;i++){
    if(picks.indexOf(scored[i])<0) picks.push(scored[i]);
  }

  return {
    picks: picks.slice(0, want),
    relaxed: relaxed,
    total: rows.length,
    usedFilters: list.filter(function(f){ return f.drop; }).map(function(f){ return f.label; }),
    crowd: SC.crowdHint(now),
    now: now
  };
};

/* 1軒だけ選び直す（「ほかの店にする」ボタン用）。
   すでに出ている店を除いて、次点を返す。 */
D.another = function(answers, excludeIds, opts){
  var res = D.run(answers, {limit: 12, now:(opts||{}).now});
  for(var i=0;i<res.picks.length;i++){
    if(excludeIds.indexOf(String(res.picks[i].place.id))<0) return res.picks[i];
  }
  return null;
};

})();

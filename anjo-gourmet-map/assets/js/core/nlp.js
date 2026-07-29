/* ============================================================
   nlp.js － 自然文をそのまま条件に変える
   ------------------------------------------------------------
   「子供が寝そう」「雨の日」「おしゃれ」「静か」「記念日」のような
   **状況の言葉**を、decide.js が使える条件に翻訳します。

   【正直に書いておくこと】
   これは端末の中で動く**言い換え表**です。外部のAIには接続していません。
   通信も発生しません。画面にもそう書いています。
   賢いふりをすると、外したときにユーザーの信頼を一度で失います。

   【なぜキーワード検索ではなく「状況→条件」なのか】
   「静か」で店名を検索しても1件も当たりません（店名に「静か」は入っていない）。
   ユーザーが言っているのは**店の名前ではなく自分の状況**です。
   なので「静か」→「席数が少ない・全席禁煙」のように、
   **持っている事実データへの言い換え**にしています。

   言い換えが1つも当たらなかったときは、正直に「分かりませんでした」と言い、
   店名・住所の普通の検索に落とします。当てずっぽうの結果を出さないこと。
   ============================================================ */
window.AGM = window.AGM || {};

(function(){
"use strict";

var N = AGM.nlp = {};

/* ---------- 言い換え表 ----------
   words … 拾う言葉（部分一致）
   apply … 答え（answers）へどう反映するか
   say   … 「〜と受け取りました」と画面に出す文。**必ず出すこと**。
           何をどう解釈したかが見えないと、外れたときに直しようがない。 */
var RULES = [
  { id:"sleepy", words:["子供が寝","子どもが寝","寝そう","ぐずり","ベビーカー","抱っこ"],
    say:"お子さんが眠そう → 車で行けて、子連れで入りやすく、早く出られるお店",
    apply:function(a){ a.who="family"; addNeed(a,"parking"); addNeed(a,"kids"); a.stay="short"; } },

  { id:"rain", words:["雨","雨の日","傘","降っ"],
    say:"雨の日 → 駐車場があって近いお店を優先",
    apply:function(a){ addNeed(a,"parking"); a.nearFirst=true; } },

  { id:"quiet", words:["静か","落ち着","ゆっくり","のんびり","一人で","ひとりで","作業"],
    say:"静かに過ごしたい → 席数が少なめで全席禁煙のお店",
    apply:function(a){ a.scene="quiet"; addNeed(a,"nosmoke"); if(!a.who) a.who="solo"; } },

  { id:"osyare", words:["おしゃれ","オシャレ","雰囲気","映え","カフェっぽ"],
    say:"雰囲気のよいお店 → カフェ・洋食から、予約できるお店を優先",
    apply:function(a){ a.scene="cafe"; addNeed(a,"reserve"); } },

  { id:"anniv", words:["記念日","誕生日","お祝い","プロポーズ","接待","デート"],
    say:"記念日 → 予約ができて、予算が分かるお店",
    apply:function(a){ a.who="date"; addNeed(a,"reserve"); a.stay="long"; } },

  { id:"kids", words:["子連れ","子ども","子供","こども","赤ちゃん","キッズ","ファミリー","家族"],
    say:"子連れ → 子連れ対応と駐車場のあるお店",
    apply:function(a){ a.who="family"; addNeed(a,"kids"); addNeed(a,"parking"); } },

  { id:"takeout", words:["テイクアウト","持ち帰り","持って帰","お弁当","弁当","デリバリー","宅配"],
    say:"持ち帰り → テイクアウトができるお店",
    apply:function(a){ a.who="takeout"; } },

  /* 【2026-07-28 の不具合】入力例の「安く済ませたい」が読み取れなかった。
     「安い」しか持っておらず、活用した形（安く・安め）が抜けていたため。
     部分一致なので**活用形をこちらから並べる**必要があります。
     「やすい」は外しました。「入りやすい」「行きやすい」「分かりやすい」に
     当たってしまい、値段の話でないものを予算1,000円と誤解するためです。 */
  { id:"cheap", words:["安い","安く","安め","安価","格安","お手頃","手頃","てごろ",
                       "リーズナブル","低予算","節約","ワンコイン","千円","1000円","コスパ"],
    say:"予算をおさえたい → 昼1,000円以下のお店",
    apply:function(a){ a.budget="1000"; } },

  { id:"morning", words:["朝","モーニング","早い時間","開店前"],
    say:"朝 → 朝から開いているお店",
    apply:function(a){ a.scene="morning"; } },

  { id:"lunch", words:["昼","ランチ","お昼"],
    say:"お昼 → 昼に開いているお店",
    apply:function(a){ a.scene="lunch"; } },

  { id:"dinner", words:["夜","ディナー","晩ごはん","夜ご飯","飲み","居酒屋","飲みたい"],
    say:"夜 → 夜に開いているお店",
    apply:function(a){ a.scene="dinner"; } },

  { id:"sweets", words:["甘い","スイーツ","ケーキ","パン","デザート","おやつ"],
    say:"甘いもの → スイーツ・パンのお店",
    apply:function(a){ a.scene="sweets"; } },

  { id:"cafe", words:["カフェ","喫茶","コーヒー","珈琲","お茶"],
    say:"カフェ → カフェ・喫茶のお店",
    apply:function(a){ a.scene="cafe"; } },

  { id:"group", words:["大人数","団体","宴会","歓迎会","送別会","飲み会","友達","友人"],
    say:"人数が多い → 席数が多く、予約できるお店",
    apply:function(a){ a.who="friends"; addNeed(a,"reserve"); } },

  { id:"car", words:["車","駐車","パーキング","運転"],
    say:"車で行く → 駐車場のあるお店",
    apply:function(a){ addNeed(a,"parking"); } },

  { id:"nosmoke", words:["禁煙","タバコ","たばこ","煙"],
    say:"禁煙 → 全席禁煙のお店",
    apply:function(a){ addNeed(a,"nosmoke"); } },

  { id:"hurry", words:["急い","時間がない","すぐ","さっと","短時間","30分"],
    say:"急いでいる → 近くて、いま開いているお店",
    apply:function(a){ a.stay="short"; a.nearFirst=true; } },

  { id:"wifi", words:["wi-fi","wifi","ワイファイ","電源","仕事","ノマド","勉強"],
    say:"作業したい → Wi-Fiがあって落ち着けるお店",
    apply:function(a){ a.scene="quiet"; a.wantWifi=true; if(!a.who) a.who="solo"; } },

  { id:"veggie", words:["野菜","ヘルシー","健康"],
    say:"野菜をとりたい → 野菜たっぷりのメニューがあるお店",
    apply:function(a){ a.wantVeggie=true; } },

  { id:"tourist", words:["観光","旅行","はじめて","初めて","名物","ご当地"],
    say:"観光 → 駐車場があって、地元のお店を中心に",
    apply:function(a){ a.who="tourist"; addNeed(a,"parking"); } }
];

function addNeed(a, v){
  a.need = a.need || [];
  if(a.need.indexOf(v)<0) a.need.push(v);
}

/* ---------- 解釈 ----------
   返り値
     { answers, matched:[{id,say}], unmatched:bool, text }
   unmatched が true のときは、画面で「分かりませんでした」と出して
   普通の検索に落とすこと。**それらしい結果を返さない。** */
N.parse = function(text, base){
  var a = base || AGM.decide.defaults();
  a.need = (a.need||[]).slice();
  /* 【照合の前だけ字を伏せる】
     「電車で行きたい」の中の「車」を car の合図と取り違えて、
     電車で来る人に駐車場のある店をすすめていました。
     伏せるのは照合用の文字列だけで、画面に出す text はそのままです。 */
  var t = String(text||"").toLowerCase().replace(/電車|自転車|汽車/g, "＿＿");
  var matched = [];

  RULES.forEach(function(r){
    for(var i=0;i<r.words.length;i++){
      if(t.indexOf(String(r.words[i]).toLowerCase())>=0){
        r.apply(a);
        matched.push({id:r.id, say:r.say});
        return;
      }
    }
  });

  /* 「〇〇円」のような直接の予算指定 */
  var m = t.replace(/,/g,"").match(/(\d{3,5})\s*円/);
  if(m){
    var v = parseInt(m[1],10);
    var band = v<=1000 ? "1000" : v<=2000 ? "2000" : v<=3000 ? "3000" : "any";
    a.budget = band;
    matched.push({id:"budget", say:"予算 "+v.toLocaleString()+"円 → 〜"+
      (band==="any"?"こだわらない":parseInt(band,10).toLocaleString()+"円")+"のお店"});
  }

  /* 駅名が入っていれば出発地にする */
  var st = AGM.ui && AGM.ui.filters ? AGM.ui.filters.STATION_BY_NAME : null;
  if(st){
    var raw = String(text||"");
    Object.keys(st).some(function(name){
      var bare = name.replace(/駅$/,"");
      if(bare.length>=2 && raw.indexOf(bare)>=0){
        a.origin = {name:st[name].n, lat:st[name].lat, lng:st[name].lng, q:st[name].n};
        matched.push({id:"origin", say:st[name].n+" を出発地にしました"});
        return true;
      }
      return false;
    });
  }

  return { answers:a, matched:matched, unmatched:matched.length===0, text:String(text||"") };
};

/* 入力例。押すだけで試せるようにして、何を書けばいいか迷わせない。

   【必ず守ること】ここに足した言葉は、上の RULES で必ず読み取れること。
   読み取れない例を出すと、押した人にその場で
   「うまく読み取れませんでした」と返ることになります（実際に起きました）。
   selfcheck.py の「入力例がすべて読み取れる」がこれを見張っています。
   ※「三河安城駅の近く」だけは RULES ではなく駅名の照合で当たります。 */
N.EXAMPLES = [
  "子供が寝そう", "雨の日", "おしゃれ", "静か", "記念日",
  "急いでる", "安く済ませたい", "友達と飲みたい",
  "テイクアウトしたい", "三河安城駅の近く"
];

})();

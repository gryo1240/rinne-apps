/* ============================================================
   config.js － サイト全体の設定
   「値」はここに集める。他のファイルに URL や機能フラグを書かないこと。
   ES モジュールは使わない（file:// で開けなくなるため）。
   グローバルは window.AGM ただ1つ。
   ============================================================ */
window.AGM = window.AGM || {};

(function(){
"use strict";

AGM.config = {

  /* ---- サイト ----
     origin は「公開したときの絶対URL」。**末尾スラッシュ無し。**
     canonical / og:url / og:image と sitemap.xml の全URLがここを基準に決まります。

     【重要】いまは**仮のURL**が入っています（2026-07-28 時点で公開先が未定のため）。
     本番URLが決まったら、
       1) この1行を書き換える
       2) python scripts/build_pages.py --base-url <本番URL> を実行する
       3) index.html と ai/index.html の canonical / og:url / og:image も書き換える
     の3つを必ず行ってください。2)3) を忘れると、生成ページだけ古いURLが残ります。 */
  site: {
    origin: "https://gryo1240.github.io/rinne-apps/anjo-gourmet-map",
    name: "安城グルメマップ",
    fullName: "安城グルメマップ",
    author: "りんねブログ",
    locale: "ja_JP",
    /* 【重要】OGPに SVG を渡してはいけません。
       X・LINE・Facebook のどれも SVG を描画せず、画像なしで共有されます。
       assets/img/ogp.png（1200×630）を使うこと。SVG は元データとして残してあります。 */
    ogImage: "assets/img/ogp.png",
    ogImageW: 1200,
    ogImageH: 630,
    ogImageType: "image/png"
  },

  /* ---- サービス（将来の地域ポータル化のための土台） ----
     いまは gourmet だけが enabled。ランチ・モーニング・カフェ・子連れ・イベントは
     枠だけ用意してある。新しいサービスを足すときは
       1) ここに1行足す
       2) data/ に同じ形（items[]）のデータを置く
       3) path のページを作る（index.html をひな形にできる）
     という手順で、リスト・地図・候補・共有の仕組みはそのまま流用できる。 */
  services: [
    /* 【2026-07-28】旧 id:"stamp" ラベル「スタンプラリー」から改名。
       このサイトではスタンプは押せないため、スタンプラリー向けの案内は外しました。
       扱う店舗データそのものは変わっていません（出典も同じ）。 */
    { id:"gourmet", label:"飲食店",        path:"./",         enabled:true,
      desc:"安城グルメガイド掲載の飲食店" },
    { id:"lunch",  label:"安城ランチ",     path:"lunch/",     enabled:false, desc:"昼に開いている店" },
    { id:"morning",label:"モーニング",     path:"morning/",   enabled:false, desc:"朝から開いている店" },
    { id:"cafe",   label:"カフェ",         path:"cafe/",      enabled:false, desc:"喫茶・スイーツ" },
    { id:"kids",   label:"子連れ",         path:"kids/",      enabled:false, desc:"子連れ歓迎の店" },
    { id:"event",  label:"イベント",       path:"event/",     enabled:false, desc:"地域のイベント" }
  ],

  /* ---- 収益化の枠（既定はすべて false ＝ 何も表示しない） ----
     【重要】このアプリの店舗情報は公式サイト（安城グルメガイド）が出典です。
     広告や有料掲載を出す前に、安城市観光協会へ確認してください
     （HANDOFF-dev.md 第3章・第9章）。
     枠と描画処理だけ先に用意してあるので、確認が取れたら true にするだけで出せます。 */
  monetization: {
    sponsor:     false,  // スポンサー店舗（おすすめ3軒の下に1枠。PR表記必須）
    promoted:    false,  // プレミアム掲載（PR表記つきで棚の先頭に出す）
    ads:         false,  // 地域広告（サイド・フッター）
    premium:     false,  // AIプレミアム（保存数・詳細条件・履歴からの学習の解放）
    paidListing: false,  // 有料掲載の申し込み導線（店舗向け）
    cityAdmin:   false,  // 自治体向け管理画面への入口
    bizAdmin:    false   // 企業（店舗）向け管理画面への入口
  },

  /* 管理画面の置き場所。まだ作っていないので、リンク先だけ決めてある。
     静的サイトのままでは作れない（ログインが要る）ので、
     実装するときは別ホストに置き、ここのURLを差し替える想定。 */
  admin: {
    city: "admin/city/",   // 自治体：掲載店舗の追加・修正、イベント登録、閲覧の集計
    biz:  "admin/biz/"     // 店舗：営業時間の修正申請、写真の登録、クーポン
  },

  /* ---- 保存キー ----
     【重要】姉妹アプリと必ず別にすること。
     localStorage はドメイン単位で共有されるため、同じブログ配下に
     「安城市 子連れおでかけマップ」(anjo.visited.v1) や
     「見にトリップ」(miniiku.visited.v1) を置くと記録が混ざる。
     この接頭辞を変えないこと。 */
  ns: "anjo-gourmet.",

  /* Googleマップの経路に一度に渡せる立ち寄り先の上限（目的地1＋経由地9） */
  maxStops: 10,

  /* 保存できるルートの数（AIプレミアムで増やす想定の値） */
  maxSavedRoutes: 12,

  /* ---- 閲覧数の集計（既定は off）----
     【なぜ off で置いてあるか】
     公開後に「どのページから来て、どこで離脱したか」が分からないと、
     30秒で決まっているのかどうかを確かめようがありません。
     ただし、まだ計測の口（トークン）を受け取っていないので止めてあります。

     【入れるときの条件】Cookie を使わず、個人を追いかけないものだけ。
     Cloudflare Web Analytics を想定しています（Cookie なし・個人特定なし）。
     Google アナリティクスは使いません。回答内容・行きたい・プラン・
     閲覧履歴を外へ出さない、という約束（フッター記載）と両立しないためです。

     【いちばん大事なところ】
     フッターに出す「集計しています」の文言も、**このスイッチが出します**。
     文言だけ先に書いて実際は集計していない、あるいは
     集計しているのに文言が無い、という食い違いを起こさないためです。
     token を入れて enabled を true にすれば、両方が同時に出ます。 */
  analytics: {
    enabled: false,
    provider: "cloudflare",
    token: ""            // Cloudflare の「サイトを追加」で出るトークンを貼る
  },

  /* 出典まわり。フッターと店舗ページで使う（表記は必須。消さないこと） */
  source: {
    name: "安城グルメガイド（安城市観光協会）",
    list: "https://anjo-stamp.jp/shop/",
    stamp: "https://anjo-stamp.jp/stamphome/"
  }
};

/* ---- サイトの基準パス ----
   店舗ページ（shop/12/）からもトップと同じ JS を読むので、
   「トップまで何階層上か」を毎回書かずに済むようにする。
   このファイル自身の src から機械的に求める（手で書くと必ずどこかで間違える）。 */
(function(){
  var base = "";
  try{
    var cs = document.currentScript && document.currentScript.src;
    if(cs) base = cs.replace(/assets\/js\/core\/config\.js.*$/, "");
  }catch(e){}
  AGM.config.base = base;      // 例: "" / "../../"
})();

/* ---- file:// で開いたときのリンク補正 ----
   【罠】"shop/5/" "ai/" "./" のような**末尾がスラッシュのURL**は、
   file:// では index.html になりません。ブラウザがそのフォルダの
   **中身の一覧（Index of …）**を出してしまいます（Edgeで実測）。
   そのため、ダブルクリックで開いて使うと
     ・ヘッダーの「言葉で相談」／ヒーローの「言葉で相談する」
     ・サイト名（トップへ戻る）
     ・お店のカード（詳細ページへ）
     ・目的別ページ（c/lunch/ など）
   がすべてフォルダ一覧に飛び、「押しても何も起きない」ように見えます。

   公開したときの見た目のURL（.../shop/5/）は SEO のために変えたくないので、
   **file:// のときだけ実行時に index.html を足します。**
   http(s) では何もしないので、公開時のURLは今までどおりです。 */
AGM.config.fileMode = (location.protocol === "file:");

/* 文字列のパスを直す。JS で組み立てるリンクはこれを通すこと */
AGM.config.href = function(p){
  if(!p) return p;
  return (AGM.config.fileMode && /\/$/.test(p)) ? p + "index.html" : p;
};

(function(){
  if(!AGM.config.fileMode) return;

  /* すでに DOM にある <a> を直す。
     判定は「解決後のURLが file: で、パスが / で終わる」ものだけ。
     こうすると外部リンク（https://anjo-stamp.jp/shop/ など）は触りません。 */
  function fixLink(a){
    try{
      if(!a || a.protocol !== "file:") return;
      var u = a.href;
      if(!/\/($|[?#])/.test(u)) return;
      a.href = u.replace(/\/($|[?#])/, "/index.html$1");
    }catch(e){}
  }
  AGM.config.fixLink = fixLink;

  function sweep(root){
    var as = (root||document).getElementsByTagName("a");
    for(var i=0;i<as.length;i++) fixLink(as[i]);
  }
  AGM.config.fixLinks = sweep;

  /* このファイルは defer なので、ここに来た時点で HTML は解析済み＝静的リンクは全部直せる */
  sweep();

  /* あとから JS が足したリンクのための保険。押された瞬間に直してから遷移させる。
     （auxclick はホイールクリック・中クリック。click だけだと別タブで開いたときに漏れる） */
  ["click","auxclick"].forEach(function(ev){
    document.addEventListener(ev, function(e){
      var t = e.target;
      var a = (t && t.closest) ? t.closest("a[href]") : null;
      if(a) fixLink(a);
    }, true);
  });
})();

/* ---- ホーム画面に追加・オフライン（Service Worker）----
   【なぜ app.js ではなくここか】
   app.js を読むのはトップだけです。/ai と、検索から直接ひらかれる
   店舗ページ100枚・目的別ページ12枚は読みません。
   検索で店舗ページに来た人こそ「次から電波が無くても開ける」が効くので、
   全ページが読むこのファイルで登録します。

   【動かない場所では黙って何もしない】
   ・file:// … Service Worker は動きません（登録すると例外が出ます）
   ・http:// の本番 … 仕様上 https か localhost でないと登録できません
   どちらも、失敗しても画面は今までどおり動きます。オフライン対応が付かないだけです。

   保存するもの・しないものは sw.js の頭に書いてあります。
   **地図のタイルは保存しません。** */
(function(){
  if(!("serviceWorker" in navigator)) return;
  if(AGM.config.fileMode) return;
  window.addEventListener("load", function(){
    try{
      navigator.serviceWorker.register(AGM.config.base + "sw.js",
        { scope: AGM.config.base || "./" })["catch"](function(){});
    }catch(e){}
  });
})();

/* ---- 閲覧数の集計と、その説明文 ----
   【この2つを必ず一緒に出すこと】
   計測を入れるなら、入れたと書く。書くなら、本当に入れる。
   どちらか片方だけが先に出ると、書いてあることと実際が食い違います。
   だからスイッチは1つ（config.analytics）にしてあります。

   何もしない条件：off のとき／トークンが空のとき／file:// で開いたとき。
   file:// を外すのは、手元で開いただけの回数を数えても意味がないからです。 */
(function(){
  var a = AGM.config.analytics;
  if(!a || !a.enabled || !a.token || AGM.config.fileMode) return;

  function ready(fn){
    if(document.readyState === "loading"){
      document.addEventListener("DOMContentLoaded", fn);
    }else{ fn(); }
  }
  ready(function(){
    /* 説明文。置き場所は各ページの #analyticsnote（フッターの「データと保存」） */
    var box = document.getElementById("analyticsnote");
    if(box){
      box.textContent = "ページの閲覧数のみ、Cookieを使わない方法で集計しています。" +
        "回答内容・行きたい・プラン・閲覧履歴は送信していません。";
      box.hidden = false;
    }
    if(a.provider !== "cloudflare") return;
    var s = document.createElement("script");
    s.defer = true;
    s.src = "https://static.cloudflareinsights.com/beacon.min.js";
    s.setAttribute("data-cf-beacon", JSON.stringify({ token: a.token }));
    document.body.appendChild(s);
  });
})();

/* 有効なサービスだけを返す。ナビの生成に使う */
AGM.config.activeServices = function(){
  return AGM.config.services.filter(function(s){ return s.enabled; });
};

})();

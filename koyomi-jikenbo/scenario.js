"use strict";
/*
 * 宵乃こよみの事件簿 第一夜『十六夜の来客』 シーングラフ（純データ・関数を含まない）
 * 原作シナリオ: .company/game/planning/koyomi-jikenbo-scenario-01.md v1.1
 *
 * ノード型:
 *   text   : { id, type:"text", speaker, sprite, bg, text, next }
 *   choice : { id, type:"choice", bg?, choices:[ { label, cond?, set?, next } ] }
 *   branch : { id, type:"branch", branch:[ { cond?, next } ] }   // 上から評価・最後は無条件
 *   end    : { id, type:"end", end:"TRUE"|"NORMAL"|"BAD"|"HIDDEN" }
 *
 * cond語彙（宣言的データのみ。関数は書かない＝node検算で全列挙するため）:
 *   { awarenessGte: n }   awareness=(a1?1:0)+(a2?1:0)+(a3?1:0) が n 以上
 * set語彙:
 *   { a1:true } / { a2:true } / { a3:true }   気づきフラグを立てる
 *
 * 【重要】一度公開したノードIDは変えないこと（既読管理がID基準のため、振り直すと全員の既読が壊れる）
 *
 * 表情ID（プレースホルダ→画像差し替えはassets側の対応表のみ変更）:
 *   koyomi_normal / koyomi_smile / koyomi_serious / koyomi_think / koyomi_sad
 *   hinata_worried / hinata_cry / hinata_surprise / hinata_talk / hinata_smile
 *   akari_normal / akari_cry / null(立ち絵なし)
 * 背景ID: bg_shop / bg_shop_dim / bg_window_moon / bg_morning / bg_station / bg_black
 */

var SCENARIO = {
  meta: {
    title: "宵乃こよみの事件簿 第一夜『十六夜の来客』",
    startId: "act1_01",
    chapters: { act2: "act2_intro" }, // 幕選択で再開できる幕頭（フラグは全false）
    hiddenStartId: "hidden_01",       // 隠しエンド専用エントリ（startからは到達不能）
    ends: {
      TRUE:   { label: "十六夜の手紙", stars: true },
      NORMAL: { label: "見送りの朝",   stars: true },
      BAD:    { label: "閉じた暦",     stars: true },
      HIDDEN: { label: "こよみの独白", stars: false }
    },
    nextEpisode: "第二夜『　　　　　』へ、つづく。"
  },

  nodes: {
    // ========== 第1幕 プロローグ ==========
    act1_01: { id:"act1_01", type:"text", speaker:"宵乃こよみ", sprite:"koyomi_normal", bg:"bg_shop",
      text:"こんばんは。宵乃こよみです。ここは、夜にだけ開くお店。\n今夜は十六夜（いざよい）。昨夜の満月が、ほんの少しだけ欠けた夜です。\n「いざよう」とは、ためらう、という意味なんですよ。満ちることをためらうように、月が少し遅れて昇る——そんな夜。", next:"act1_02" },
    act1_02: { id:"act1_02", type:"text", speaker:"", sprite:"koyomi_normal", bg:"bg_shop",
      text:"（引き戸が勢いよく開く音。息を切らした少女が飛び込んでくる）", next:"act1_03" },
    act1_03: { id:"act1_03", type:"text", speaker:"ひなた", sprite:"hinata_worried", bg:"bg_shop",
      text:"あの……！ 占い師さん、ですよね。お願いします、占ってください。", next:"act1_04" },
    act1_04: { id:"act1_04", type:"text", speaker:"宵乃こよみ", sprite:"koyomi_smile", bg:"bg_shop",
      text:"まあ。ずいぶん急いでいらしたのね。どうぞ、まずは中へ。", next:"act1_05" },
    act1_05: { id:"act1_05", type:"text", speaker:"ひなた", sprite:"hinata_worried", bg:"bg_shop",
      text:"姉が——姉が、明日の朝、家を出ていくんです。\n行き先も、理由も、何も言ってくれなくて。……止めるべきか、占ってください。お願いします。", next:"act1_06" },
    act1_06: { id:"act1_06", type:"text", speaker:"宵乃こよみ", sprite:"koyomi_normal", bg:"bg_shop",
      text:"（少女の肩は、上着も羽織らずに震えていました。占いを求めて駆け込む人の多くは、本当は答えをもう半分、知っています。ただ、ひとりで抱えるには、重すぎるだけ）", next:"act1_choice_welcome" },

    // 選択① フレーバー（エンド不変・合流）
    act1_choice_welcome: { id:"act1_choice_welcome", type:"choice", bg:"bg_shop", choices:[
      { label:"まず、温かいお茶を淹れる", next:"act1_welcome_tea" },
      { label:"ひなたの隣に、そっと座る", next:"act1_welcome_sit" },
      { label:"一緒に、ひとつ深呼吸する", next:"act1_welcome_breath" }
    ]},
    act1_welcome_tea: { id:"act1_welcome_tea", type:"text", speaker:"宵乃こよみ", sprite:"koyomi_smile", bg:"bg_shop",
      text:"お話は逃げていきませんよ。まずは、これを。\n（こよみは黙って湯を沸かし、湯呑みをひなたの両手に握らせる）\nあたたかいものを持つと、人は少しだけ、素直になれるんです。", next:"act1_after_welcome" },
    act1_welcome_sit: { id:"act1_welcome_sit", type:"text", speaker:"宵乃こよみ", sprite:"koyomi_smile", bg:"bg_shop",
      text:"（こよみは文机を挟まず、ひなたの隣に腰を下ろした）\n占い師とお客さま、というのは、今はやめておきましょうか。\n今はただ、あなたのお話を聞かせてくださいね。", next:"act1_after_welcome" },
    act1_welcome_breath: { id:"act1_welcome_breath", type:"text", speaker:"宵乃こよみ", sprite:"koyomi_smile", bg:"bg_shop",
      text:"大丈夫。夜は、まだ長いですから。\nひとつ、ゆっくり息を吐いてみましょうか。……そう、上手ですね。\n（ふたりぶんの呼吸が、行灯の炎をやさしく揺らす）", next:"act1_after_welcome" },

    act1_after_welcome: { id:"act1_after_welcome", type:"text", speaker:"ひなた", sprite:"hinata_worried", bg:"bg_shop",
      text:"……すみません。取り乱して。わたし、ひなたっていいます。高校2年です。", next:"act1_07" },
    act1_07: { id:"act1_07", type:"text", speaker:"宵乃こよみ", sprite:"koyomi_smile", bg:"bg_shop",
      text:"ひなたさん。いいお名前。……では、お姉さんのお話、聞かせてくださいね。", next:"act1_08" },
    act1_08: { id:"act1_08", type:"text", speaker:"ひなた", sprite:"hinata_worried", bg:"bg_shop",
      text:"姉は、あかり。今、22歳です。\nうち、お母さんが3年前に亡くなって。お父さんは、その前から……いなくて。\nだから姉が、働きながら、わたしを育ててくれたんです。ずっと、ふたりで。", next:"act1_09" },
    act1_09: { id:"act1_09", type:"text", speaker:"宵乃こよみ", sprite:"koyomi_normal", bg:"bg_shop",
      text:"そう。……おふたりで、頑張ってこられたのね。", next:"act1_10" },
    act1_10: { id:"act1_10", type:"text", speaker:"ひなた", sprite:"hinata_worried", bg:"bg_shop",
      text:"なのに、昨日の夜、急に。「明日、家を出る」って。\n荷物をまとめて、でも、どこに行くのかも、なんで行くのかも、教えてくれなくて。\nわたし、何か悪いことしたのかなって……。", next:"act1_11" },
    act1_11: { id:"act1_11", type:"text", speaker:"宵乃こよみ", sprite:"koyomi_think", bg:"bg_shop",
      text:"（ひなたさんは、きっと何度も自分を責めたのでしょう。——けれど、わたしには少しだけ、引っかかることがありました。理由を言わずに去る人は、本当に、心が離れた人なのでしょうか）", next:"act1_12" },
    act1_12: { id:"act1_12", type:"text", speaker:"宵乃こよみ", sprite:"koyomi_serious", bg:"bg_shop",
      text:"ひなたさん。占いの前に、もう少しだけ、教えてくれますか。\nお姉さんのこと、お母さんのこと、そして——あなた自身のこと。\nその三つの中に、きっと答えの糸口があります。", next:"act2_intro" },

    // ========== 第2幕 聞き取り（幕頭＝幕選択の再開点。フラグ全false） ==========
    act2_intro: { id:"act2_intro", type:"text", speaker:"", sprite:null, bg:"bg_shop",
      text:"——聞き取りが、はじまる。\n（お姉さんのこと・お母さんのこと・ひなた自身のこと。ひとつずつ、聞いていく）", next:"act2_topicA_01" },

    // 話題A（気づき①）
    act2_topicA_01: { id:"act2_topicA_01", type:"text", speaker:"ひなた", sprite:"hinata_worried", bg:"bg_shop",
      text:"【お姉さんの様子】\n最近の姉は……なんだか、疲れてました。夜遅くまで、スマホをじっと見ていて。", next:"act2_topicA_choice" },
    act2_topicA_choice: { id:"act2_topicA_choice", type:"choice", bg:"bg_shop", choices:[
      { label:"「その画面、何を見ていたか分かりますか？」（踏み込む）", set:{a1:true}, next:"act2_topicA_dig" },
      { label:"「お疲れだったのね」（やさしく流す）", next:"act2_topicA_skip" }
    ]},
    act2_topicA_dig: { id:"act2_topicA_dig", type:"text", speaker:"ひなた", sprite:"hinata_talk", bg:"bg_shop",
      text:"ええと……わたしが覗いたら、慌てて隠したんですけど。一瞬だけ見えて。\n片方は、姉のお給料の明細でした。今の会社の。もう片方は……たぶん、求人票。別の会社の募集で、「寮あり」とか「月給」とか、そういう文字が見えて。姉、その二つを、じっと見比べてました。", next:"act2_topicA_dig2" },
    act2_topicA_dig2: { id:"act2_topicA_dig2", type:"text", speaker:"宵乃こよみ", sprite:"koyomi_serious", bg:"bg_shop",
      text:"（そっと目を伏せる）……今のお給料と、別の会社の求人。それを、見比べていた。……なるほど。ありがとう、ひなたさん。", next:"act2_topicB_01" },
    act2_topicA_skip: { id:"act2_topicA_skip", type:"text", speaker:"宵乃こよみ", sprite:"koyomi_smile", bg:"bg_shop",
      text:"お仕事、大変だったのね。……あまり、根を詰めていなければいいけれど。", next:"act2_topicA_skip2" },
    act2_topicA_skip2: { id:"act2_topicA_skip2", type:"text", speaker:"ひなた", sprite:"hinata_talk", bg:"bg_shop",
      text:"はい……たぶん、仕事のことだと思います。", next:"act2_topicB_01" },

    // 話題B（気づき②）
    act2_topicB_01: { id:"act2_topicB_01", type:"text", speaker:"ひなた", sprite:"hinata_worried", bg:"bg_shop",
      text:"【お母さんのこと】\nお母さんの話は……姉、あまりしたがらなくて。わたしも、あまり触れないようにしてます。", next:"act2_topicB_choice" },
    act2_topicB_choice: { id:"act2_topicB_choice", type:"choice", bg:"bg_shop", choices:[
      { label:"「最近、お母さんを思い出すことは？」（踏み込む）", set:{a2:true}, next:"act2_topicB_dig" },
      { label:"「大切な方だったのね」（やさしく流す）", next:"act2_topicB_skip" }
    ]},
    act2_topicB_dig: { id:"act2_topicB_dig", type:"text", speaker:"ひなた", sprite:"hinata_talk", bg:"bg_shop",
      text:"……そういえば。先週、お母さんの命日だったんです。\nその日の夜、姉が、お母さんの遺したものを開いてました。古い、暦の手帳。日付ごとに、その日のことを書き込む……。\n姉、ぼんやり眺めてて。手が止まってたのは、たしか——「十六夜」って書いてある頁でした。……あ、そういえば。その頁、端に折り目がついてたな。姉は、気にも留めてなかったみたいですけど。", next:"act2_topicB_dig2" },
    act2_topicB_dig2: { id:"act2_topicB_dig2", type:"text", speaker:"宵乃こよみ", sprite:"koyomi_think", bg:"bg_shop",
      text:"折り目……。ひなたさん。お母さんは、どんな方でしたか。", next:"act2_topicB_dig3" },
    act2_topicB_dig3: { id:"act2_topicB_dig3", type:"text", speaker:"ひなた", sprite:"hinata_talk", bg:"bg_shop",
      text:"几帳面な人で……あ、そうだ。大事なものを、栞みたいに本や手帳に挟む癖がありました。押し花とか、写真とか。よく、はさんでて。", next:"act2_topicB_dig4" },
    act2_topicB_dig4: { id:"act2_topicB_dig4", type:"text", speaker:"宵乃こよみ", sprite:"koyomi_serious", bg:"bg_window_moon",
      text:"（窓の外の月を、ちらりと見る）……大切なものを挟む癖。そして、十六夜の頁の、折り目。……覚えておきますね、ひなたさん。", next:"act2_topicC_01" },
    act2_topicB_skip: { id:"act2_topicB_skip", type:"text", speaker:"宵乃こよみ", sprite:"koyomi_smile", bg:"bg_shop",
      text:"お母さまは、あなたたちにとって、大切な方だったのね。", next:"act2_topicB_skip2" },
    act2_topicB_skip2: { id:"act2_topicB_skip2", type:"text", speaker:"ひなた", sprite:"hinata_talk", bg:"bg_shop",
      text:"はい。でも、あまり話すと、姉が悲しむので。", next:"act2_topicC_01" },

    // 話題C（気づき③）
    act2_topicC_01: { id:"act2_topicC_01", type:"text", speaker:"ひなた", sprite:"hinata_worried", bg:"bg_shop",
      text:"【ひなた自身の進路】\nわたしのことは……今は、関係ないと思うんですけど。", next:"act2_topicC_choice" },
    act2_topicC_choice: { id:"act2_topicC_choice", type:"choice", bg:"bg_shop", choices:[
      { label:"「あなたは、本当はどうしたいの？」（踏み込む）", set:{a3:true}, next:"act2_topicC_dig" },
      { label:"「今は、お姉さんのことよね」（やさしく流す）", next:"act2_topicC_skip" }
    ]},
    act2_topicC_dig: { id:"act2_topicC_dig", type:"text", speaker:"ひなた", sprite:"hinata_cry", bg:"bg_shop",
      text:"（うつむく）……わたし、美術部で。本当は、美大に行きたくて。\nでも、お金がかかるから。姉に、これ以上、苦労かけられないから……。\nだから姉には、「近くの公立でいい」って、言っちゃったんです。嘘、ついて。", next:"act2_topicC_dig2" },
    act2_topicC_dig2: { id:"act2_topicC_dig2", type:"text", speaker:"宵乃こよみ", sprite:"koyomi_smile", bg:"bg_shop",
      text:"（やさしく微笑む）……そう。あなたも、大事なことを、ひとりで抱えていたのね。", next:"act3_intro" },
    act2_topicC_skip: { id:"act2_topicC_skip", type:"text", speaker:"宵乃こよみ", sprite:"koyomi_smile", bg:"bg_shop",
      text:"そうね。今は、お姉さんのことが心配よね。", next:"act2_topicC_skip2" },
    act2_topicC_skip2: { id:"act2_topicC_skip2", type:"text", speaker:"ひなた", sprite:"hinata_talk", bg:"bg_shop",
      text:"はい。わたしのことは、後でいいんです。", next:"act3_intro" },

    // ========== 第3幕 真相 ==========
    act3_intro: { id:"act3_intro", type:"text", speaker:"宵乃こよみ", sprite:"koyomi_think", bg:"bg_shop",
      text:"（3つの話題を聞き終えた。こよみは静かに目を閉じ、しばらく考えている）", next:"act3_choice_pause" },

    // 選択⑤ フレーバー（エンド不変・合流）
    act3_choice_pause: { id:"act3_choice_pause", type:"choice", bg:"bg_shop", choices:[
      { label:"もう一杯、お茶を淹れる", next:"act3_pause_tea" },
      { label:"窓の外の、十六夜の月を見上げる", next:"act3_pause_moon" },
      { label:"ひなたの目を、まっすぐ見る", next:"act3_pause_eyes" }
    ]},
    act3_pause_tea: { id:"act3_pause_tea", type:"text", speaker:"宵乃こよみ", sprite:"koyomi_smile", bg:"bg_shop",
      text:"（こよみは静かに立ち、もう一度湯を沸かした）\n急がなくて、いいんです。……もう少しだけ、待ちましょうか。", next:"act3_truth_branch" },
    act3_pause_moon: { id:"act3_pause_moon", type:"text", speaker:"宵乃こよみ", sprite:"koyomi_smile", bg:"bg_window_moon",
      text:"（こよみは障子を少し開け、夜空を見上げた）\nごらんなさい。満ちた月が、ほんの少しだけ欠けた姿。\n……完璧じゃなくても、きれいでしょう？", next:"act3_truth_branch" },
    act3_pause_eyes: { id:"act3_pause_eyes", type:"text", speaker:"宵乃こよみ", sprite:"koyomi_serious", bg:"bg_shop",
      text:"（こよみは、ひなたの目をまっすぐに見た）\nこれから、わたしに見えたことを、お話ししますね。\n……でも、決めるのは、わたしではありません。あなたと、お姉さんですよ。", next:"act3_truth_branch" },

    // 真相：気づき数で3段階（branchノード）
    act3_truth_branch: { id:"act3_truth_branch", type:"branch", branch:[
      { cond:{awarenessGte:3}, next:"truth_full" },
      { cond:{awarenessGte:2}, next:"truth_half" },
      { next:"truth_none" }
    ]},
    truth_none: { id:"truth_none", type:"text", speaker:"宵乃こよみ", sprite:"koyomi_sad", bg:"bg_shop",
      text:"……ごめんなさい。わたしに見えたのは、ここまで。\nお姉さんが、あなたを大切に思っていること。それだけは、確かです。\nでも、その先にある本当のことは——今夜は、うまく読めませんでした。", next:"act3_final_choice" },
    truth_half: { id:"truth_half", type:"text", speaker:"宵乃こよみ", sprite:"koyomi_serious", bg:"bg_shop",
      text:"お姉さんは、家を捨てるのではありません。\nあなたのために、何か大きなものを、ひとりで背負って——それで、遠くへ行こうとしている。\n給料の高い、遠くの職場へ。自分が黙って背負えば、あなたが気兼ねなく、前に進めるように。\n……ただ、その奥にある「本当のこと」までは、わたしにも、まだ見えません。", next:"act3_final_choice" },
    truth_full: { id:"truth_full", type:"text", speaker:"宵乃こよみ", sprite:"koyomi_serious", bg:"bg_shop",
      text:"お姉さんは、家を捨てるのではありません。今のお給料と、別の会社の求人票を見比べていた——給料の高い、遠くの職場へ移ろうとしているんです。家出でも、駆け落ちでもない。\nそして、その「お金」は、あなたのため。あなたが本当は美大に行きたいことを、お姉さんは気づいている。だから理由も言わず、自分ひとりで背負おうとしているんです。\n……そして、もうひとつ。お母さんは、大切なものを栞のように挟む方だった、と言いましたね。十六夜の頁の、あの折り目。折り目があるということは——そこに、何かを挟んでいた、ということ。", next:"truth_full_2" },
    truth_full_2: { id:"truth_full_2", type:"text", speaker:"宵乃こよみ", sprite:"koyomi_smile", bg:"bg_shop",
      text:"お姉さんは命日にあの頁を開いたけれど、ただお母さんを偲んでいただけ。折り込まれたものには、まだ気づいていないのかもしれません。\nひなたさん。あの頁には——お母さんが、お姉さんに宛てた言葉が、今も挟まれたまま、残っているのかもしれませんよ。", next:"act3_final_choice" },

    // 最終選択（cond出し分け：TRUE肢=気づき3のみ / NORMAL肢=気づき2以上 / BAD肢=常時）
    act3_final_choice: { id:"act3_final_choice", type:"choice", bg:"bg_shop", choices:[
      { label:"姉と一緒に、お母さんの暦帳を探しにいく", cond:{awarenessGte:3}, next:"end_true_01" },
      { label:"家に帰って、姉に自分の気持ちを伝える", cond:{awarenessGte:2}, next:"end_normal_01" },
      { label:"占いの結果だけ、聞いて帰る", next:"end_bad_01" }
    ]},

    // ========== TRUE ==========
    end_true_01: { id:"end_true_01", type:"text", speaker:"ひなた", sprite:"hinata_talk", bg:"bg_shop",
      text:"わたし、帰ります。姉と一緒に、お母さんの手帳を、探します。", next:"end_true_02" },
    end_true_02: { id:"end_true_02", type:"text", speaker:"宵乃こよみ", sprite:"koyomi_smile", bg:"bg_shop",
      text:"ええ。……行ってらっしゃい。夜明けは、もうすぐですよ。", next:"end_true_03" },
    end_true_03: { id:"end_true_03", type:"text", speaker:"ひなた", sprite:null, bg:"bg_morning",
      text:"（家に帰って、荷造りをする姉に、わたしはあの暦帳を差し出しました。「十六夜の頁、いっしょに見て」って）\n折り目のところを、ふたりで、そっと開きました。頁の間に、折りたたまれた便箋が、挟まっていました。\n姉も、気づいていませんでした。命日にこの頁を眺めていたのに——折り目の内側までは、見ていなかったんです。お母さんの、字でした。", next:"end_true_letter" },
    end_true_letter: { id:"end_true_letter", type:"text", speaker:"あかりが読む、母の手紙", sprite:"akari_normal", bg:"bg_morning", letter:true,
      text:"あかりへ。\nあなたはいつも、ひなたの前で気丈でいようとするね。\nでも、お母さんは知っています。あなたが、まだ若い女の子だってことを。\n妹の親になろうとしなくていい。姉のままで、いてあげて。\nあなたの人生を、あなたのために使いなさい。それがきっと、ひなたを一番しあわせにするから。\n十六夜の月みたいに——少し欠けていても、あなたはじゅうぶん、きれいですよ。", next:"end_true_04" },
    end_true_04: { id:"end_true_04", type:"text", speaker:"ひなた", sprite:"akari_cry", bg:"bg_morning",
      text:"姉は、声をあげて泣きました。わたしの前で泣いたのは、お母さんのお葬式以来、初めてでした。\nわたしも、ずっと言えなかったことを、言いました。「本当は、美大に行きたい」って。\n姉は、笑って、泣いて、「もっと早く言ってよ」って、わたしの頭を、ぐしゃぐしゃにしました。", next:"end_true_05" },
    end_true_05: { id:"end_true_05", type:"text", speaker:"ひなた", sprite:null, bg:"bg_morning",
      text:"姉は、遠くへ行くのをやめました。……いえ、一年だけ、先に延ばしました。\nふたりで働いて、ふたりで貯めて、一緒に、わたしの夢を目指すことにしたんです。\n姉の人生も、姉のために。わたしの夢も、わたしのために。ふたりぶん、これからです。", next:"end_true_06" },
    end_true_06: { id:"end_true_06", type:"text", speaker:"宵乃こよみ", sprite:"koyomi_smile", bg:"bg_window_moon",
      text:"（十六夜の月は、満ちることを、ためらう月。けれど、ためらいながらでも、ちゃんと昇るんですよ。少し欠けたまま、静かに、美しく）\n——おやすみなさい。よい夢を。", next:"end_true" },
    end_true: { id:"end_true", type:"end", end:"TRUE" },

    // ========== NORMAL ==========
    end_normal_01: { id:"end_normal_01", type:"text", speaker:"ひなた", sprite:"hinata_talk", bg:"bg_shop",
      text:"わたし、帰って……姉に、ちゃんと、気持ちを伝えます。", next:"end_normal_02" },
    end_normal_02: { id:"end_normal_02", type:"text", speaker:"宵乃こよみ", sprite:"koyomi_smile", bg:"bg_shop",
      text:"ええ。それが、いちばん大切なこと。……いってらっしゃいね。", next:"end_normal_03" },
    end_normal_03: { id:"end_normal_03", type:"text", speaker:"ひなた", sprite:null, bg:"bg_station",
      text:"（家に帰って、わたしは姉に言いました。「本当は、美大に行きたかった」って。「お姉ちゃんに、苦労かけたくなかった」って）\n姉は、驚いて、それから、ぜんぶ話してくれました。給料の高い遠くの仕事に移ること。それが、わたしの学費のためだったこと。\n手紙は、見つかりませんでした。お母さんが何を遺したのかは、分からないまま。\nでも、姉とわたしの間の、いちばん大きな誤解だけは、解けました。", next:"end_normal_04" },
    end_normal_04: { id:"end_normal_04", type:"text", speaker:"ひなた", sprite:null, bg:"bg_station",
      text:"姉は、予定通り、旅立ちました。\n「離れても、家族だから」。改札の向こうで、姉はそう言って、笑いました。\n少し寂しいけれど。わたしたちは、もう、隠しごとをしない姉妹になれた気がします。", next:"end_normal_05" },
    end_normal_05: { id:"end_normal_05", type:"text", speaker:"宵乃こよみ", sprite:"koyomi_smile", bg:"bg_shop",
      text:"（言葉にするのは、こわいものです。けれど、言葉にしないと、伝わらないものも、あるんですよ。ひなたさんは、ちゃんと、こわさを越えました。……それだけで、じゅうぶん）", next:"end_normal" },
    end_normal: { id:"end_normal", type:"end", end:"NORMAL" },

    // ========== BAD ==========
    end_bad_01: { id:"end_bad_01", type:"text", speaker:"ひなた", sprite:"hinata_worried", bg:"bg_shop",
      text:"……占いの結果だけ、聞かせてください。姉は、止めるべきなんでしょうか。", next:"end_bad_02" },
    end_bad_02: { id:"end_bad_02", type:"text", speaker:"宵乃こよみ", sprite:"koyomi_normal", bg:"bg_shop",
      text:"（少し、間があって）……お姉さんは、あなたを想っています。だから、大丈夫。きっと、うまくいきますよ。", next:"end_bad_03" },
    end_bad_03: { id:"end_bad_03", type:"text", speaker:"ひなた", sprite:null, bg:"bg_black",
      text:"「……そう、ですか。ありがとうございました」\nそう答えるのが、精いっぱいでした。家に帰っても、わたしは、何も言えませんでした。\n翌朝、姉は、行ってしまいました。理由も、行き先も、分からないまま。\nお母さんが何を遺したのかも、姉が何を抱えていたのかも——きっと、一生、分からないままです。", next:"end_bad_04" },
    end_bad_04: { id:"end_bad_04", type:"text", speaker:"宵乃こよみ", sprite:"koyomi_sad", bg:"bg_shop_dim",
      text:"……わたしは、占い師です。当ててみせることは、できます。\nけれど、いちばん大事なことは、いつも、水晶玉の中にはないんですよ。それは、相手の言葉の中にしか、ない。\n今夜、わたしは——もう一歩だけ、踏み込んで聞くことを、しませんでした。", next:"end_bad_05" },
    end_bad_05: { id:"end_bad_05", type:"text", speaker:"宵乃こよみ", sprite:"koyomi_sad", bg:"bg_shop_dim",
      text:"あの夜、もう一歩だけ、聞く勇気があれば。……そう悔やむことが、わたしにも、あるんです。ずっと昔に。", next:"end_bad_06" },
    end_bad_06: { id:"end_bad_06", type:"text", speaker:"", sprite:null, bg:"bg_shop_dim",
      text:"——宵乃こよみには、まだ語られていない夜がある。", next:"end_bad" },
    end_bad: { id:"end_bad", type:"end", end:"BAD" },

    // ========== 隠し（startからは到達不能。タイトルの解禁ボタンからのみ） ==========
    hidden_01: { id:"hidden_01", type:"text", speaker:"", sprite:null, bg:"bg_shop_dim",
      text:"（すべての結末を見たあと——深夜の店。客はいない。こよみが一人、古い暦帳を開いている。それは、こよみ自身のもの）", next:"hidden_02" },
    hidden_02: { id:"hidden_02", type:"text", speaker:"宵乃こよみ", sprite:"koyomi_think", bg:"bg_shop_dim",
      text:"わたしが、なぜ「聞く」占い師になったのか。……少しだけ、お話ししましょうか。\nむかし、わたしにも、大切な人がいました。その人が、何かを言いかけて、やめた夜がありました。\nわたしは、聞き返しませんでした。聞くのが、こわかったから。\n——その人の本当の言葉を、わたしは、とうとう聞けないまま、見送りました。", next:"hidden_03" },
    hidden_03: { id:"hidden_03", type:"text", speaker:"宵乃こよみ", sprite:"koyomi_serious", bg:"bg_shop_dim",
      text:"だから、わたしは決めたんです。\nわたしの前に来た人には、二度と、そんな夜を過ごさせない。当てることよりも、聞くことを。\n……ひなたさんのお姉さんが、手紙をちゃんと受け取れますように。\n今夜の月みたいに、少し欠けていても、その人たちが、じゅうぶんに、しあわせでありますように。", next:"hidden_04" },
    hidden_04: { id:"hidden_04", type:"text", speaker:"宵乃こよみ", sprite:"koyomi_smile", bg:"bg_window_moon",
      text:"（暦帳を、そっと閉じる。窓の外で、十六夜の月が、静かに雲に隠れる）\n——次の夜、また、迷える誰かが訪ねてきます。\nその人の言葉を、ちゃんと、聞いてあげられますように。", next:"hidden_end" },
    hidden_end: { id:"hidden_end", type:"end", end:"HIDDEN" }
  }
};

if (typeof module !== "undefined") module.exports = SCENARIO;

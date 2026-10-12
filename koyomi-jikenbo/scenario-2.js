"use strict";
/*
 * 宵乃こよみの事件簿 第二夜『立待月の封筒』 シーングラフ（純データ・関数を含まない）
 * 試読用の原稿: .company/game/planning/koyomi-jikenbo-scenario-02.md（このファイルから生成）
 * ノード型・cond/set語彙は scenario.js（第一夜）と同じ。ノードIDは e2_ で始める。
 *
 * 【重要】一度公開したノードIDは変えないこと（既読管理がID基準のため）
 *
 * 表情ID: koyomi_*（第一夜と共通）/ makoto_normal・makoto_worried・makoto_down・makoto_smile
 *         minato_normal・minato_angry・minato_cry / null(立ち絵なし)
 * 背景ID: bg_shop / bg_shop_dim / bg_window_moon / bg_home_night / bg_home_morning / bg_night_street
 *
 * 時間割（v1.2 2026-10-12 情景レビューで確定。本文はこれと矛盾させない）
 *  - 中央図書館: 平日は夜9時まで・月曜休館
 *  - 父（佐倉誠）: 3か月前に営業所が閉まり失職。毎朝背広で家を出て、中央図書館の1階で求人を見る。夕方、勤めていたころと同じ時刻に帰宅
 *  - 息子（湊・中2）: テストで早く帰れた日に図書館で父を見て、失業を知る。2か月前から塾を休み（塾には「家の事情で。父も知っています」と自分で電話）、
 *    部活のあと2階の自習室で勉強。塾の曜日は、塾が終わるのと同じ夜9時すぎに帰宅。月謝袋は封を切らずに学習机（居間）の引き出しへ
 *  - 塾は火・水・金（月曜は休館日なので塾の日にしない）。電話のあと父が帰宅時刻を見られたのは火曜の夜。今夜（水曜）も塾の日
 *  - 今夜（水曜）: おととい（月曜・休館日）の昼、父が家の電話で塾の先生の連絡を受けた。父は家に帰らずに歩き回り、夜8時ごろ来店。空は雲が流れ、月は隠れたりのぞいたり
 *    父がいつもの夕方に帰らなかったのは今夜が初めて。湊は先に帰っていて、どの結末でも「遅かったね」に類する一言を言う
 *  - 店の配置（v1.4）: こよみは文机の奥。父は戸口から一歩入ったところで立ったまま → 選択①のあと文机の前の座布団に座る（こよみとは文机をはさんで向かい合う）。
 *    こよみが父の隣に行くのは選択⑤の「隣に、そっと腰を下ろす」だけ。父の足もとの物にこよみの手は届かない
 * 語り: 名前の札のあるページはその人の言葉。（）を使えるのは、こよみの札（こよみの目に映ったこと・内心・所作。相手の動作は敬語で書き「男性は」と三人称にしない）と、
 *       札のないページ（地の文。店の場面は三人称、家の場面は父の「僕」）だけ。誠・湊の札の中に地の文を入れない（読みがなの（）は別）
 */

var SCENARIO2 = {
  meta: {
    title: "宵乃こよみの事件簿 第二夜『立待月の封筒』",
    shortTitle: "第二夜『立待月の封筒』",
    startId: "e2_act1_01",
    chapters: { act2: "e2_act2_intro" },
    hiddenStartId: "e2_hidden_01",
    hiddenLabel: "こよみの独白・二（隠し）",
    ends: {
      TRUE:   { label: "立待月の封筒",   stars: true },
      NORMAL: { label: "背広を脱いだ朝", stars: true },
      BAD:    { label: "閉ざした戸",     stars: true },
      HIDDEN: { label: "こよみの独白・二", stars: false }
    },
    nextEpisode: "第三夜は、また次の月の夜に。"
  },

  nodes: {
    // ========== 第1幕 プロローグ ==========
    e2_act1_01: { id:"e2_act1_01", type:"text", speaker:"宵乃こよみ", sprite:"koyomi_normal", bg:"bg_shop",
      text:"こんばんは。宵乃こよみです。\n今夜は立待月（たちまちづき）。十六夜よりも、もう少しだけ遅れて昇る月です。", next:"e2_act1_02" },
    e2_act1_02: { id:"e2_act1_02", type:"text", speaker:"宵乃こよみ", sprite:"koyomi_smile", bg:"bg_shop",
      text:"立ったまま待っているうちに、ようやく顔を出す——だから、立待月。\n今夜は雲が流れていて、月も、隠れたり、のぞいたり。待つ、というのは、なかなか難しいものですね。", next:"e2_act1_03" },
    e2_act1_03: { id:"e2_act1_03", type:"text", speaker:"", sprite:"koyomi_normal", bg:"bg_shop",
      text:"（少しだけ開けてあった引き戸が、ためらうように、もう少し開く。背広姿の男性が、入ろうか迷うように、戸口に立っている）", next:"e2_act1_04" },
    e2_act1_04: { id:"e2_act1_04", type:"text", speaker:"男性", sprite:"makoto_normal", bg:"bg_shop",
      text:"……すみません。ここ、占いのお店で、合ってますか。\nいや、自分でも、どうかしてると思うんですが。", next:"e2_act1_05" },
    e2_act1_05: { id:"e2_act1_05", type:"text", speaker:"宵乃こよみ", sprite:"koyomi_smile", bg:"bg_shop",
      text:"ええ、合っていますよ。どうかしている夜にこそ、開いているお店ですから。\nどうぞ、中へ。お座りになって。", next:"e2_act1_05b" },
    e2_act1_05b: { id:"e2_act1_05b", type:"text", speaker:"", sprite:"makoto_normal", bg:"bg_shop",
      text:"（男性は一歩だけ中に入って、後ろ手に戸を閉めた。けれど、文机の向かいの座布団には座らずに、戸口のそばに立ったままでいる）", next:"e2_act1_06" },
    e2_act1_06: { id:"e2_act1_06", type:"text", speaker:"男性", sprite:"makoto_worried", bg:"bg_shop",
      text:"息子のことで……。どうしたらいいか、もう、分からなくて。\n家に帰る気になれずに、ずっと歩いていたら、ここの明かりが見えたもので。", next:"e2_act1_06b" },
    e2_act1_06b: { id:"e2_act1_06b", type:"text", speaker:"男性", sprite:"makoto_worried", bg:"bg_shop",
      text:"問い詰めるべきか、黙っているべきか。……占って、もらえませんか。", next:"e2_act1_07" },
    e2_act1_07: { id:"e2_act1_07", type:"text", speaker:"宵乃こよみ", sprite:"koyomi_normal", bg:"bg_shop",
      text:"（戸口の柱に片手をついて、そっと、ふくらはぎをさすっていらっしゃる。……いつから、歩いていらしたのでしょう）", next:"e2_act1_choice_welcome" },

    // 選択① フレーバー（エンド不変・合流。男性は座布団をすすめられても戸口のそばに立ったまま＝05b。
    // どれを選んでも男性が腰を下ろし、湯呑みが出る＝後の「湯呑みを持つ手が、膝の上で」につながる）
    e2_act1_choice_welcome: { id:"e2_act1_choice_welcome", type:"choice", bg:"bg_shop", choices:[
      { label:"温かいお茶を、湯呑みで出す", next:"e2_act1_welcome_tea" },
      { label:"膝掛けを、そっと差し出す", next:"e2_act1_welcome_towel" },
      { label:"戸口まで迎えに行って、座布団をすすめる", next:"e2_act1_welcome_guide" }
    ]},
    e2_act1_welcome_tea: { id:"e2_act1_welcome_tea", type:"text", speaker:"宵乃こよみ", sprite:"koyomi_smile", bg:"bg_shop",
      text:"まずは、これを。夜道は冷えたでしょう。\n（湯呑みを受け取った手が、少しだけ震えている。両手で包むようにして、文机の前の座布団に、ようやく腰を下ろされた）\nお話は、温まってからで、じゅうぶんですよ。", next:"e2_act1_after_welcome" },
    e2_act1_welcome_towel: { id:"e2_act1_welcome_towel", type:"text", speaker:"宵乃こよみ", sprite:"koyomi_smile", bg:"bg_shop",
      text:"夜道は冷えたでしょう。どうぞ、お座りになって。これを膝に。\n（一瞬ためらってから受け取って、深く頭を下げ、ようやく腰を下ろされた。温かいお茶も、そっと添える）", next:"e2_act1_after_welcome" },
    e2_act1_welcome_guide: { id:"e2_act1_welcome_guide", type:"text", speaker:"宵乃こよみ", sprite:"koyomi_smile", bg:"bg_shop",
      text:"（立ち上がって、戸口まで迎えに行く）\nずいぶん、歩かれたんですね。どうぞ、こちらで足を休めてください。\n（小さく笑って、文机の前の座布団に、ようやく腰を下ろされた。湯呑みを、ひとつ差し出す）", next:"e2_act1_after_welcome" },

    e2_act1_after_welcome: { id:"e2_act1_after_welcome", type:"text", speaker:"男性", sprite:"makoto_normal", bg:"bg_shop",
      text:"……失礼しました。佐倉誠（さくら・まこと）といいます。四十五です。\n中学二年の息子と、ふたりで暮らしています。妻とは、五年前に別れまして。", next:"e2_act1_08" },
    e2_act1_08: { id:"e2_act1_08", type:"text", speaker:"宵乃こよみ", sprite:"koyomi_normal", bg:"bg_shop",
      text:"佐倉さん。……息子さんのお名前は？", next:"e2_act1_09" },
    e2_act1_09: { id:"e2_act1_09", type:"text", speaker:"誠", sprite:"makoto_normal", bg:"bg_shop",
      text:"湊（みなと）、です。……おととい、塾の先生から電話があったんです。\n「湊くん、もう二か月お休みです。『家の事情で。父も知っています』と聞いていたので、ご連絡が遅れて」って。", next:"e2_act1_10" },
    e2_act1_10: { id:"e2_act1_10", type:"text", speaker:"誠", sprite:"makoto_worried", bg:"bg_shop",
      text:"家の事情なんて、何もないのに。\n毎月、月謝袋に現金を入れて、持たせていたんです。その二か月分が、どこへ行ったのか……。", next:"e2_act1_11" },
    e2_act1_11: { id:"e2_act1_11", type:"text", speaker:"誠", sprite:"makoto_worried", bg:"bg_shop",
      text:"悪い友だちでもできたのか。ゲームか何かに使っているのか。\n問い詰めたら、二度と口をきいてくれない気がして。あいつの机の引き出しを開けて確かめる勇気も、なくて。", next:"e2_act1_12" },
    e2_act1_12: { id:"e2_act1_12", type:"text", speaker:"宵乃こよみ", sprite:"koyomi_think", bg:"bg_shop",
      text:"（お名前とお歳は伺ったのに、お仕事のことも、毎日のことも、ひとことも出てきませんでした。お話は、息子さんのことばかり）", next:"e2_act1_13" },
    e2_act1_13: { id:"e2_act1_13", type:"text", speaker:"宵乃こよみ", sprite:"koyomi_serious", bg:"bg_shop",
      text:"佐倉さん。占いの前に、もう少しだけ、聞かせてくださいね。\n湊くんの様子と、湊くんの言葉と——それから、あなたご自身のことを。", next:"e2_act2_intro" },

    // ========== 第2幕 聞き取り（幕頭＝幕選択の再開点。フラグ全false） ==========
    e2_act2_intro: { id:"e2_act2_intro", type:"text", speaker:"", sprite:null, bg:"bg_shop",
      text:"——聞き取りが、はじまる。\n（湊くんの様子・湊くんの言葉・佐倉さん自身のこと。ひとつずつ、聞いていく）", next:"e2_act2_topicA_01" },

    // 話題A（気づき①）
    e2_act2_topicA_01: { id:"e2_act2_topicA_01", type:"text", speaker:"誠", sprite:"makoto_worried", bg:"bg_shop",
      text:"【湊くんの様子】\n電話のあと、気をつけて見ていたんです。塾の曜日は、今も前と同じ、夜の九時すぎに帰ってくる。\n塾には行っていないのに、その時間、どこにいるのか……。", next:"e2_act2_topicA_choice" },
    e2_act2_topicA_choice: { id:"e2_act2_topicA_choice", type:"choice", bg:"bg_shop", choices:[
      { label:"「帰ってきたとき、何か持っていませんでしたか？」（踏み込む）", set:{a1:true}, next:"e2_act2_topicA_dig" },
      { label:"「そういう年ごろですものね」（やさしく流す）", next:"e2_act2_topicA_skip" }
    ]},
    e2_act2_topicA_dig: { id:"e2_act2_topicA_dig", type:"text", speaker:"誠", sprite:"makoto_normal", bg:"bg_shop",
      text:"持ち物……。そういえば少し前、鞄から紙切れが落ちたことがありました。\n中央図書館の、貸出のレシートです。時刻が夜の八時五十分。閉館の、十分前でした。", next:"e2_act2_topicA_dig2" },
    e2_act2_topicA_dig2: { id:"e2_act2_topicA_dig2", type:"text", speaker:"誠", sprite:"makoto_worried", bg:"bg_shop",
      text:"でも、図書館に通うような子じゃないんですよ。\n借りていたのは数学の参考書で……あいつ、数学なんて、塾でしかやらないのに。", next:"e2_act2_topicA_dig2b" },
    e2_act2_topicA_dig2b: { id:"e2_act2_topicA_dig2b", type:"text", speaker:"", sprite:"makoto_down", bg:"bg_shop",
      text:"（そう言いながら、佐倉さんは、湯呑みに目を落とした。声が、ほんの少しだけ硬い）", next:"e2_act2_topicA_dig3" },
    e2_act2_topicA_dig3: { id:"e2_act2_topicA_dig3", type:"text", speaker:"宵乃こよみ", sprite:"koyomi_serious", bg:"bg_shop",
      text:"中央図書館……わたしも、暦の本を借りに行きます。月曜がお休みの、あそこですね。\n閉館間際に、数学の参考書を。……少し、覚えておきますね。", next:"e2_act2_topicB_01" },
    e2_act2_topicA_skip: { id:"e2_act2_topicA_skip", type:"text", speaker:"宵乃こよみ", sprite:"koyomi_smile", bg:"bg_shop",
      text:"中学二年生。親に言いたくないことが、いちばん増える年ごろですものね。", next:"e2_act2_topicA_skip2" },
    e2_act2_topicA_skip2: { id:"e2_act2_topicA_skip2", type:"text", speaker:"誠", sprite:"makoto_normal", bg:"bg_shop",
      text:"そう、なんでしょうね。僕も、あのころは、そうだった気がします。", next:"e2_act2_topicB_01" },

    // 話題B（気づき②）
    e2_act2_topicB_01: { id:"e2_act2_topicB_01", type:"text", speaker:"誠", sprite:"makoto_worried", bg:"bg_shop",
      text:"【湊くんの言葉】\n最近は、ほとんど話もしません。朝、「行ってきます」を言い合うくらいで。", next:"e2_act2_topicB_choice" },
    e2_act2_topicB_choice: { id:"e2_act2_topicB_choice", type:"choice", bg:"bg_shop", choices:[
      { label:"「最近、気になった一言はありませんか？」（踏み込む）", set:{a2:true}, next:"e2_act2_topicB_dig" },
      { label:"「男の子は、無口になりますものね」（やさしく流す）", next:"e2_act2_topicB_skip" }
    ]},
    e2_act2_topicB_dig: { id:"e2_act2_topicB_dig", type:"text", speaker:"誠", sprite:"makoto_normal", bg:"bg_shop",
      text:"気になった一言……。先月の夕飯のとき、急に聞かれたんです。\n「お父さん、最近、お昼なに食べてるの」って。中学生が、父親の昼飯なんて、気にしますかね。", next:"e2_act2_topicB_dig2" },
    e2_act2_topicB_dig2: { id:"e2_act2_topicB_dig2", type:"text", speaker:"誠", sprite:"makoto_normal", bg:"bg_shop",
      text:"それから、あいつ、朝におにぎりを作るようになったんです。\n「作りすぎた」って、ひとつ、僕の鞄に入れていく。毎朝ですよ。毎朝、作りすぎるんです。", next:"e2_act2_topicB_dig3" },
    e2_act2_topicB_dig3: { id:"e2_act2_topicB_dig3", type:"text", speaker:"宵乃こよみ", sprite:"koyomi_think", bg:"bg_shop",
      text:"お昼ごはんのことを、気にかけて。毎朝、おにぎりを、ひとつ多く。\n（目を細めて、少しだけ黙る）", next:"e2_act2_topicC_01" },
    e2_act2_topicB_skip: { id:"e2_act2_topicB_skip", type:"text", speaker:"宵乃こよみ", sprite:"koyomi_smile", bg:"bg_shop",
      text:"男の子は、ある日から急に、言葉が少なくなるものですね。", next:"e2_act2_topicB_skip2" },
    e2_act2_topicB_skip2: { id:"e2_act2_topicB_skip2", type:"text", speaker:"誠", sprite:"makoto_normal", bg:"bg_shop",
      text:"ええ。……昔は、なんでも話してくれたんですけどね。", next:"e2_act2_topicC_01" },

    // 話題C（気づき③）: ここだけ「黙って待つ」が気づきになる（言いかけてやめる＝合図を必ず先に見せる）
    e2_act2_topicC_01: { id:"e2_act2_topicC_01", type:"text", speaker:"誠", sprite:"makoto_normal", bg:"bg_shop",
      text:"【佐倉さんご自身のこと】\n僕のこと、ですか。僕は……普通ですよ。毎日、会社に行って、帰ってくるだけです。", next:"e2_act2_topicC_02" },
    e2_act2_topicC_02: { id:"e2_act2_topicC_02", type:"text", speaker:"宵乃こよみ", sprite:"koyomi_normal", bg:"bg_shop",
      text:"お忙しいのに、お仕事中に塾からお電話なんて。驚かれたでしょう。", next:"e2_act2_topicC_03" },
    e2_act2_topicC_03: { id:"e2_act2_topicC_03", type:"text", speaker:"誠", sprite:"makoto_normal", bg:"bg_shop",
      text:"いえ、家の電話で。月曜の、お昼の二時ごろだったかな。ちょうど——", next:"e2_act2_topicC_04" },
    e2_act2_topicC_04: { id:"e2_act2_topicC_04", type:"text", speaker:"", sprite:"makoto_down", bg:"bg_shop",
      text:"（佐倉さんは、そこで言葉を止めた。湯呑みを持つ手が、膝の上で動かなくなる）", next:"e2_act2_topicC_04b" },
    e2_act2_topicC_04b: { id:"e2_act2_topicC_04b", type:"text", speaker:"誠", sprite:"makoto_down", bg:"bg_shop",
      text:"……いや。……なんでもないです。", next:"e2_act2_topicC_choice" },
    e2_act2_topicC_choice: { id:"e2_act2_topicC_choice", type:"choice", bg:"bg_shop", choices:[
      { label:"「月曜のお昼に、お家にいらしたんですか？」（問いただす）", next:"e2_act2_topicC_ask" },
      { label:"「……」（黙って、続きを待つ）", set:{a3:true}, next:"e2_act2_topicC_wait" }
    ]},
    e2_act2_topicC_ask: { id:"e2_act2_topicC_ask", type:"text", speaker:"誠", sprite:"makoto_worried", bg:"bg_shop",
      text:"あ、ああ。その日は、休みを取っていて。たまたまです、たまたま。", next:"e2_act2_topicC_ask1b" },
    e2_act2_topicC_ask1b: { id:"e2_act2_topicC_ask1b", type:"text", speaker:"", sprite:"makoto_worried", bg:"bg_shop",
      text:"（佐倉さんはそう言って笑い、それきり、自分のことは何も話さなかった）", next:"e2_act2_topicC_ask2" },
    e2_act2_topicC_ask2: { id:"e2_act2_topicC_ask2", type:"text", speaker:"宵乃こよみ", sprite:"koyomi_normal", bg:"bg_shop",
      text:"そうでしたか。……お休みの日に、驚かれたでしょうね。", next:"e2_act3_intro" },
    e2_act2_topicC_wait: { id:"e2_act2_topicC_wait", type:"text", speaker:"", sprite:"makoto_down", bg:"bg_shop",
      text:"（こよみは、何も言わなかった。行灯の芯が、小さく音を立てる。\n佐倉さんの目のふちが、少しずつ、赤くなっていく）", next:"e2_act2_topicC_wait2" },
    e2_act2_topicC_wait2: { id:"e2_act2_topicC_wait2", type:"text", speaker:"誠", sprite:"makoto_down", bg:"bg_shop",
      text:"……すみません。いい年をして。", next:"e2_act2_topicC_wait2b" },
    e2_act2_topicC_wait2b: { id:"e2_act2_topicC_wait2b", type:"text", speaker:"", sprite:"makoto_down", bg:"bg_shop",
      text:"（佐倉さんは、背広の内ポケットからハンカチを出そうとした。一緒に、一枚のカードがこぼれて、文机の上に落ちる）", next:"e2_act2_topicC_wait3" },
    e2_act2_topicC_wait3: { id:"e2_act2_topicC_wait3", type:"text", speaker:"宵乃こよみ", sprite:"koyomi_serious", bg:"bg_shop",
      text:"（手に取ると、中央図書館の利用者カードでした。まだ新しいカードなのに、角だけが、もう白く擦れている）\n……どうぞ。大事なものでしょう？", next:"e2_act2_topicC_wait4" },
    e2_act2_topicC_wait4: { id:"e2_act2_topicC_wait4", type:"text", speaker:"誠", sprite:"makoto_down", bg:"bg_shop",
      text:"……ええ。どうも。", next:"e2_act2_topicC_wait4b" },
    e2_act2_topicC_wait4b: { id:"e2_act2_topicC_wait4b", type:"text", speaker:"", sprite:"makoto_normal", bg:"bg_shop",
      text:"（佐倉さんは受け取って、何かを言いかけ——やっぱり、言わなかった。けれど今度は、ちゃんと目を上げていた）", next:"e2_act3_intro" },

    // ========== 第3幕 真相 ==========
    e2_act3_intro: { id:"e2_act3_intro", type:"text", speaker:"", sprite:"koyomi_think", bg:"bg_shop",
      text:"（三つの話を聞き終えて、こよみは、そっと目を閉じた）", next:"e2_act3_choice_pause" },

    // 選択⑤ フレーバー（エンド不変・合流）
    e2_act3_choice_pause: { id:"e2_act3_choice_pause", type:"choice", bg:"bg_shop", choices:[
      { label:"障子を開けて、雲間の月を見上げる", next:"e2_act3_pause_moon" },
      { label:"湯呑みに、熱いお茶を注ぎ直す", next:"e2_act3_pause_tea" },
      { label:"佐倉さんの隣に、そっと腰を下ろす", next:"e2_act3_pause_sit" }
    ]},
    e2_act3_pause_moon: { id:"e2_act3_pause_moon", type:"text", speaker:"宵乃こよみ", sprite:"koyomi_smile", bg:"bg_window_moon",
      text:"（障子を開けると、流れる雲の切れ間に、月がのぞいていた）\n隠れてしまっても、待っていれば、また顔を出してくれますね。……月も、人も。", next:"e2_act3_truth_branch" },
    e2_act3_pause_tea: { id:"e2_act3_pause_tea", type:"text", speaker:"宵乃こよみ", sprite:"koyomi_smile", bg:"bg_shop",
      text:"（熱いお茶を注ぎ直す。湯気が、ふたりのあいだに、ゆっくり立ちのぼる）\n冷めたお茶では、本当のお話は、しにくいですから。", next:"e2_act3_truth_branch" },
    e2_act3_pause_sit: { id:"e2_act3_pause_sit", type:"text", speaker:"宵乃こよみ", sprite:"koyomi_serious", bg:"bg_shop",
      text:"（文机を回りこんで、佐倉さんの隣に座る。占い師ではなく、ただ隣の人として）\nこれから、わたしに見えたことをお話ししますね。決めるのは、佐倉さんですよ。", next:"e2_act3_truth_branch" },

    // 真相：気づき数で3段階（どの2個の組み合わせでも破綻しない文面にする）
    e2_act3_truth_branch: { id:"e2_act3_truth_branch", type:"branch", branch:[
      { cond:{awarenessGte:3}, next:"e2_truth_full" },
      { cond:{awarenessGte:2}, next:"e2_truth_half" },
      { next:"e2_truth_none" }
    ]},
    e2_truth_none: { id:"e2_truth_none", type:"text", speaker:"宵乃こよみ", sprite:"koyomi_sad", bg:"bg_shop",
      text:"……ごめんなさい。今夜のわたしに見えたことは、ほんの少しだけです。\n湊くんが、悪いことに手を染めているようには、わたしには見えません。", next:"e2_truth_none_2" },
    e2_truth_none_2: { id:"e2_truth_none_2", type:"text", speaker:"宵乃こよみ", sprite:"koyomi_sad", bg:"bg_shop",
      text:"でも、湊くんが何を抱えているのかは——今夜は、うまく読めませんでした。", next:"e2_act3_final_choice" },
    e2_truth_half: { id:"e2_truth_half", type:"text", speaker:"宵乃こよみ", sprite:"koyomi_serious", bg:"bg_shop",
      text:"湊くんは、悪い仲間とも、ゲームとも、違うところにいます。\n隠しごとはあっても、湊くんの毎日は、まっすぐなままです。", next:"e2_truth_half_2" },
    e2_truth_half_2: { id:"e2_truth_half_2", type:"text", speaker:"宵乃こよみ", sprite:"koyomi_serious", bg:"bg_shop",
      text:"……ただ、なぜ塾に行かないのか。月謝が、どこへ行ったのか。\nその奥にある本当のことまでは、わたしにも、まだ見えません。", next:"e2_act3_final_choice" },
    e2_truth_full: { id:"e2_truth_full", type:"text", speaker:"宵乃こよみ", sprite:"koyomi_serious", bg:"bg_shop",
      text:"佐倉さん。塾の先生のお電話は、月曜のお昼に、お家で受けられた。月曜は、中央図書館がお休みの日です。\nそれに、閉館の時刻まで、よくご存じでしたね。", next:"e2_truth_full_2" },
    e2_truth_full_2: { id:"e2_truth_full_2", type:"text", speaker:"宵乃こよみ", sprite:"koyomi_serious", bg:"bg_shop",
      text:"内ポケットには、まだ新しいのに角だけ白く擦れた、同じ図書館のカード。\n湊くんは、お昼に何を食べているのかと聞いて、毎朝、おにぎりをひとつ多く作るようになった。", next:"e2_truth_full_3" },
    e2_truth_full_3: { id:"e2_truth_full_3", type:"text", speaker:"宵乃こよみ", sprite:"koyomi_serious", bg:"bg_shop",
      text:"……佐倉さん。あなたは、昼間、会社にいらっしゃらないのではありませんか？", next:"e2_truth_full_4" },
    e2_truth_full_4: { id:"e2_truth_full_4", type:"text", speaker:"誠", sprite:"makoto_down", bg:"bg_shop",
      text:"……三か月前です。勤めていた営業所が閉まって、仕事が、なくなりました。\n毎朝、背広で家を出て、図書館で求人を見て。夕方、前と同じ時間に、家に帰っていました。", next:"e2_truth_full_5" },
    e2_truth_full_5: { id:"e2_truth_full_5", type:"text", speaker:"誠", sprite:"makoto_down", bg:"bg_shop",
      text:"月謝だけは、なんとか渡し続けました。それだけは、いつもどおりにしたかった。\n父親が仕事を失くしたなんて、あいつに、背負わせたくなかったんです。", next:"e2_truth_full_6" },
    e2_truth_full_6: { id:"e2_truth_full_6", type:"text", speaker:"宵乃こよみ", sprite:"koyomi_smile", bg:"bg_shop",
      text:"……湊くんは、知っていますよ。\nきっと、いつか、図書館にいるあなたを見かけたんです。それで塾をお休みして、同じ図書館で、ひとりで勉強することにした。", next:"e2_truth_full_7" },
    e2_truth_full_7: { id:"e2_truth_full_7", type:"text", speaker:"宵乃こよみ", sprite:"koyomi_smile", bg:"bg_shop",
      text:"おにぎりは、あなたのお昼ごはん。塾に「家の事情で」と伝えたのも、湊くん自身。\nそれでも、お仕事のことは何も聞かなかった。……佐倉さんが自分から話してくれるのを、ずっと、待っていたんじゃないでしょうか。", next:"e2_truth_full_8" },
    e2_truth_full_8: { id:"e2_truth_full_8", type:"text", speaker:"宵乃こよみ", sprite:"koyomi_normal", bg:"bg_shop",
      text:"月謝袋は、お家のどこかにあるはずです。手もとに二か月分の月謝があるのに、参考書は買わずに、図書館で借りているんですもの。\n……きっと、封も切られずに。", next:"e2_act3_final_choice" },

    // 最終選択（TRUE肢=気づき3のみ / NORMAL肢=気づき2以上 / BAD肢=常時）
    e2_act3_final_choice: { id:"e2_act3_final_choice", type:"choice", bg:"bg_shop", choices:[
      { label:"今夜、湊くんに、自分から本当のことを話す", cond:{awarenessGte:3}, next:"e2_end_true_01" },
      { label:"湊くんを責めずに、塾のことだけ聞いてみる", cond:{awarenessGte:2}, next:"e2_end_normal_01" },
      { label:"やはり、湊くんを問い詰める", next:"e2_end_bad_01" }
    ]},

    // ========== TRUE ==========
    e2_end_true_01: { id:"e2_end_true_01", type:"text", speaker:"誠", sprite:"makoto_normal", bg:"bg_shop",
      text:"……帰ります。帰って、あいつに話します。\n先に嘘をついたのは、僕のほうですから。", next:"e2_end_true_02" },
    e2_end_true_02: { id:"e2_end_true_02", type:"text", speaker:"宵乃こよみ", sprite:"koyomi_smile", bg:"bg_shop",
      text:"ええ。……いってらっしゃい。\n今夜は立待月。雲がかかっても、立って待っていれば、ちゃんと顔を出す月ですよ。", next:"e2_end_true_03" },
    e2_end_true_03: { id:"e2_end_true_03", type:"text", speaker:"", sprite:null, bg:"bg_home_night",
      text:"（家に帰ると、湊は制服のまま、居間で参考書を広げていた。塾が終わるのと同じ時間に、帰ってきたばかりなのだろう。\n顔を上げて、「おかえり。……遅かったね」とだけ言った）", next:"e2_end_true_04" },
    e2_end_true_04: { id:"e2_end_true_04", type:"text", speaker:"誠", sprite:"makoto_down", bg:"bg_home_night",
      text:"湊。……お父さん、三か月前に、仕事がなくなったんだ。\n毎朝、会社に行くふりをしてた。ごめんな。ずっと、黙ってて。", next:"e2_end_true_05" },
    e2_end_true_05: { id:"e2_end_true_05", type:"text", speaker:"湊", sprite:"minato_normal", bg:"bg_home_night",
      text:"……知ってたよ。\nテストで早く帰れた日、図書館に寄ったら、一階の窓ぎわにお父さんがいた。背広で、求人の本、読んでた。", next:"e2_end_true_05b" },
    e2_end_true_05b: { id:"e2_end_true_05b", type:"text", speaker:"湊", sprite:"minato_normal", bg:"bg_home_night",
      text:"それから、部活のあとは、あそこの二階で勉強してた。\nお父さんが夕方に帰っていくの、いつも窓から見てたよ。", next:"e2_end_true_06" },
    e2_end_true_06: { id:"e2_end_true_06", type:"text", speaker:"", sprite:null, bg:"bg_home_night",
      text:"（湊は立ち上がって、学習机の引き出しを開けた。輪ゴムでまとめた月謝袋が、ふたつ。どちらも、封が切られていない）\n……僕が、開ける勇気のなかった引き出しだった。", next:"e2_end_true_06b" },
    e2_end_true_06b: { id:"e2_end_true_06b", type:"text", speaker:"湊", sprite:"minato_normal", bg:"bg_home_night",
      text:"塾は、お父さんの仕事が決まるまで、休むことにした。\n勝手に決めて、ごめん。", next:"e2_end_true_07" },
    e2_end_true_07: { id:"e2_end_true_07", type:"text", speaker:"", sprite:null, bg:"bg_home_night",
      text:"（上の袋に、付箋が一枚、貼ってあった。少し右上がりの、湊の字で）", next:"e2_end_true_memo" },
    e2_end_true_memo: { id:"e2_end_true_memo", type:"text", speaker:"月謝袋の付箋", sprite:"minato_normal", bg:"bg_home_night", letter:true,
      text:"お父さんの仕事が決まったら、これで焼肉。\n決まらなくても、焼肉。", next:"e2_end_true_08" },
    e2_end_true_08: { id:"e2_end_true_08", type:"text", speaker:"誠", sprite:"makoto_smile", bg:"bg_home_night",
      text:"……なんだよ、それ。", next:"e2_end_true_08b" },
    e2_end_true_08b: { id:"e2_end_true_08b", type:"text", speaker:"", sprite:"makoto_smile", bg:"bg_home_night",
      text:"（声が、うまく出なかった。息子の前で泣いたのは、たぶん、初めてだった）", next:"e2_end_true_09" },
    e2_end_true_09: { id:"e2_end_true_09", type:"text", speaker:"湊", sprite:"minato_cry", bg:"bg_home_night",
      text:"泣くなよ。……おにぎり、明日から具を変えるから。\n梅、もう飽きたでしょ。", next:"e2_end_true_10" },
    e2_end_true_10: { id:"e2_end_true_10", type:"text", speaker:"", sprite:null, bg:"bg_night_street",
      text:"（そのあと、店で教わった月を見せたくて、ふたりで、近所の土手まで歩いた。雲の切れ間に、少し欠けた月が出ていた）\n仕事は、まだ決まっていない。でも明日からは、湊に本当の行き先を言って、家を出る。", next:"e2_end_true_11" },
    e2_end_true_11: { id:"e2_end_true_11", type:"text", speaker:"湊", sprite:"minato_normal", bg:"bg_night_street",
      text:"月、ちょっと欠けてるね。", next:"e2_end_true_11b" },
    e2_end_true_11b: { id:"e2_end_true_11b", type:"text", speaker:"誠", sprite:"minato_normal", bg:"bg_night_street",
      text:"立待月っていうんだって。立って待ってると、ちゃんと出てくる月。\n……さっき、教わったんだ。", next:"e2_end_true_11c" },
    e2_end_true_11c: { id:"e2_end_true_11c", type:"text", speaker:"湊", sprite:"minato_cry", bg:"bg_night_street",
      text:"……おれ、けっこう待ったよ。", next:"e2_end_true_11d" },
    e2_end_true_11d: { id:"e2_end_true_11d", type:"text", speaker:"誠", sprite:"minato_cry", bg:"bg_night_street",
      text:"……ああ。ごめんな。待たせた。", next:"e2_end_true_12" },
    e2_end_true_12: { id:"e2_end_true_12", type:"text", speaker:"宵乃こよみ", sprite:"koyomi_smile", bg:"bg_window_moon",
      text:"（立待月は、急がない月。待っている人のところへ、少し遅れて、でも必ず、顔を出してくれるんですよ）\n——おやすみなさい。よい夢を。", next:"e2_end_true" },
    e2_end_true: { id:"e2_end_true", type:"end", end:"TRUE" },

    // ========== NORMAL ==========
    e2_end_normal_01: { id:"e2_end_normal_01", type:"text", speaker:"誠", sprite:"makoto_normal", bg:"bg_shop",
      text:"……帰って、責めずに、塾のことだけ聞いてみます。", next:"e2_end_normal_02" },
    e2_end_normal_02: { id:"e2_end_normal_02", type:"text", speaker:"宵乃こよみ", sprite:"koyomi_smile", bg:"bg_shop",
      text:"ええ。聞く、というのは、それだけで大きな一歩ですよ。……いってらっしゃいね。", next:"e2_end_normal_03" },
    e2_end_normal_03: { id:"e2_end_normal_03", type:"text", speaker:"", sprite:null, bg:"bg_home_night",
      text:"（家に帰ると、湊は居間で参考書を広げていた。「遅かったね」と、顔も上げずに言う。僕は、怒らないと決めて、塾のことを聞いた）\n湊は少し黙ってから、「図書館で勉強してた。塾は、しばらくいい」とだけ言った。", next:"e2_end_normal_04" },
    e2_end_normal_04: { id:"e2_end_normal_04", type:"text", speaker:"湊", sprite:"minato_normal", bg:"bg_home_night",
      text:"お金は、使ってない。……返す。", next:"e2_end_normal_04b" },
    e2_end_normal_04b: { id:"e2_end_normal_04b", type:"text", speaker:"", sprite:"minato_normal", bg:"bg_home_night",
      text:"（湊は学習机の引き出しから、封の切られていない月謝袋をふたつ出して、黙って僕の前に置いた）", next:"e2_end_normal_05" },
    e2_end_normal_05: { id:"e2_end_normal_05", type:"text", speaker:"", sprite:"makoto_down", bg:"bg_home_night",
      text:"なぜ使わなかったのか。なぜ塾を休んだのか。湊は、それ以上なにも言わなかった。\n僕も、聞けなかった。湊の言う図書館は、きっと、あの中央図書館だ。", next:"e2_end_normal_05b" },
    e2_end_normal_05b: { id:"e2_end_normal_05b", type:"text", speaker:"", sprite:"makoto_down", bg:"bg_home_night",
      text:"僕が三か月前から、会社に行くふりをして、毎日、求人を見に通っている図書館。\n……理由を聞けば、そのことまで、話さなくてはいけなくなる気がした。", next:"e2_end_normal_06" },
    e2_end_normal_06: { id:"e2_end_normal_06", type:"text", speaker:"", sprite:null, bg:"bg_home_morning",
      text:"（翌朝、僕は背広に袖を通しかけて——やめた。普段着のまま、玄関で靴を履いた）", next:"e2_end_normal_07" },
    e2_end_normal_07: { id:"e2_end_normal_07", type:"text", speaker:"湊", sprite:"minato_normal", bg:"bg_home_morning",
      text:"……いってらっしゃい。", next:"e2_end_normal_07b" },
    e2_end_normal_07b: { id:"e2_end_normal_07b", type:"text", speaker:"", sprite:"minato_normal", bg:"bg_home_morning",
      text:"（湊は何も聞かずに、おにぎりをひとつ、僕の手に乗せた。毎朝「作りすぎた」と言って、僕の鞄に入れていくおにぎりだ。\n手渡されたのは、初めてだった。いつもより、少しだけ大きかった）", next:"e2_end_normal_08" },
    e2_end_normal_08: { id:"e2_end_normal_08", type:"text", speaker:"宵乃こよみ", sprite:"koyomi_smile", bg:"bg_shop",
      text:"（言葉にできたのは、半分だけ。けれど、背広を脱いで玄関に立つことが、言葉より先に伝わることもあるんですよ。\n残りの半分は、きっと、次の夜に）", next:"e2_end_normal" },
    e2_end_normal: { id:"e2_end_normal", type:"end", end:"NORMAL" },

    // ========== BAD ==========
    e2_end_bad_01: { id:"e2_end_bad_01", type:"text", speaker:"誠", sprite:"makoto_worried", bg:"bg_shop",
      text:"……分かっています。それでも、まず、あいつの口から聞きたいんです。\n塾のことも、月謝のことも。父親として、問いただします。", next:"e2_end_bad_02" },
    e2_end_bad_02: { id:"e2_end_bad_02", type:"text", speaker:"宵乃こよみ", sprite:"koyomi_normal", bg:"bg_shop",
      text:"（少し、間があって）……そうですか。どうか、声を荒げずに。", next:"e2_end_bad_03" },
    e2_end_bad_03: { id:"e2_end_bad_03", type:"text", speaker:"", sprite:null, bg:"bg_home_night",
      text:"（家に帰ると、湊は居間で参考書を広げていた。「遅かったね」と言いかけた湊に、僕は、塾の電話のことを切り出した。月謝を、どうしたのかと）", next:"e2_end_bad_04" },
    e2_end_bad_04: { id:"e2_end_bad_04", type:"text", speaker:"湊", sprite:"minato_angry", bg:"bg_home_night",
      text:"……お父さんだって、嘘ついてるくせに。", next:"e2_end_bad_05" },
    e2_end_bad_05: { id:"e2_end_bad_05", type:"text", speaker:"", sprite:null, bg:"bg_home_night",
      text:"（湊はそれだけ言うと、隣の部屋に入り、襖を閉めた）\n問いただしたのは僕なのに、答えを突きつけられたのも、僕だった。閉まった襖に手をかけたまま、とうとう、開けられなかった。", next:"e2_end_bad_06" },
    e2_end_bad_06: { id:"e2_end_bad_06", type:"text", speaker:"宵乃こよみ", sprite:"koyomi_sad", bg:"bg_shop_dim",
      text:"……聞くことと、問いただすことは、似ているようで、まるで違うんです。\n問いただされた人は、本当のことを、戸の向こうにしまってしまう。", next:"e2_end_bad_07" },
    e2_end_bad_07: { id:"e2_end_bad_07", type:"text", speaker:"宵乃こよみ", sprite:"koyomi_sad", bg:"bg_shop_dim",
      text:"わたしにも、聞き返せなかった夜があるんです。\n……ずっと、昔に。", next:"e2_end_bad_08" },
    e2_end_bad_08: { id:"e2_end_bad_08", type:"text", speaker:"", sprite:null, bg:"bg_shop_dim",
      text:"——宵乃こよみが、夜にだけ店を開けるのには、わけがある。", next:"e2_end_bad" },
    e2_end_bad: { id:"e2_end_bad", type:"end", end:"BAD" },

    // ========== 隠し（startからは到達不能。タイトルの解禁ボタンからのみ） ==========
    e2_hidden_01: { id:"e2_hidden_01", type:"text", speaker:"", sprite:null, bg:"bg_shop_dim",
      text:"（すべての結末を見たあと——立待月の夜更け。客の帰った店で、こよみがひとり、少しだけ開けた戸口に立っている）", next:"e2_hidden_02" },
    e2_hidden_02: { id:"e2_hidden_02", type:"text", speaker:"宵乃こよみ", sprite:"koyomi_think", bg:"bg_shop_dim",
      text:"立待月の夜には、いつも、戸を少しだけ開けておくんです。\n……むかし、このお店は、わたしの父のものでした。父も、暦を読む人でした。", next:"e2_hidden_03" },
    e2_hidden_03: { id:"e2_hidden_03", type:"text", speaker:"宵乃こよみ", sprite:"koyomi_serious", bg:"bg_shop_dim",
      text:"父は、よく夜遅くに帰ってきました。わたしは、戸口に立って待っていました。\n戸が開いて、「ただいま」と言う声がするまで、何時間でも。", next:"e2_hidden_04" },
    e2_hidden_04: { id:"e2_hidden_04", type:"text", speaker:"宵乃こよみ", sprite:"koyomi_sad", bg:"bg_shop_dim",
      text:"最後の夜も、立待月でした。父は戸口で振り返って、「こよみ、お父さんな……」と言いかけて、笑って、やめました。\nわたしは、聞き返しませんでした。聞くのが、こわかったから。", next:"e2_hidden_05" },
    e2_hidden_05: { id:"e2_hidden_05", type:"text", speaker:"宵乃こよみ", sprite:"koyomi_sad", bg:"bg_shop_dim",
      text:"父は、その夜から、帰ってきません。\nだからこのお店は、夜にだけ開いているんです。……わたしが待っているのは、お客さまだけじゃ、ないのかもしれませんね。", next:"e2_hidden_06" },
    e2_hidden_06: { id:"e2_hidden_06", type:"text", speaker:"宵乃こよみ", sprite:"koyomi_think", bg:"bg_shop_dim",
      text:"湊くんは、待つことで、ちゃんと聞いていました。わたしは待つばかりで、あの夜、聞けなかったのに。\n（戸口から差しこむ月の光が、足もとを、白く照らしていた）", next:"e2_hidden_end" },
    e2_hidden_end: { id:"e2_hidden_end", type:"end", end:"HIDDEN" }
  }
};

if (typeof module !== "undefined") module.exports = SCENARIO2;

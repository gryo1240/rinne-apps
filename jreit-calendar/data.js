"use strict";
/*
 * 毎月分配カレンダー — 銘柄マスタ
 *
 * ==== このファイルを直すときの決まり ====
 * 決算日データの正本は `.company/media/rinne-blog/jreit-settlement-calendar.md`。
 * ここを変更したら必ず正本も直すこと（逆も同じ）。二重管理で片方が古くなる事故を防ぐため。
 *
 * ==== 収録の範囲（2026-08-25 オーナー判断で7銘柄→12銘柄に拡張）====
 * 「東証REIT指数（配当込みを含む）に連動する内国ETF」の全12銘柄を収録する。
 * 東証REIT Core指数・高利回り系・物流/オフィス等のテーマ型・海外REITは中身が違う商品なので入れない。
 * 同じ表に並べると「決算月だけ見て選ぶ」誘導になり、投資助言リスクが上がるため。
 * 収録対象の確認元: JPX「銘柄一覧（ETF）不動産（REIT）」
 *   https://www.jpx.co.jp/equities/products/etfs/issues/01-07.html
 *
 * ==== 持つデータ / 持たないデータ ====
 *  持つ  : 決算月・決算日（信託約款で決まっており年単位でほぼ不変）
 *  持たない: 株価・基準価額・1口あたり分配金の実績・信託報酬（変動するため、同梱すると公開直後から陳腐化する）
 *  参考利回り(refYield)は「初期値」であり実績値ではない。ユーザーが自由に変更できる。
 *  ※信託報酬は2026-08-25にオーナー判断で「載せない」と決定。引き下げ競争で変動するため、
 *    このアプリの「変動データを持たない」設計を壊す。比較は記事側で行う。
 *
 * ==== 支払開始日について（重要）====
 * 「決算日→支払開始日」の対応表は、12銘柄いずれの運用会社サイトでも公表されていない。
 * 一般則として「ETFの分配金は決算日から40日程度で支払われる」ことが運用会社の解説に明記されている
 *   アモーヴァ・アセットマネジメント https://www.amova-am.com/products/etf/we-love-etf/kihon/kihon20
 *     原文「分配金の支払いは、ETFの決算日である分配金支払基準日から約40日となっています」
 *   NEXT FUNDS https://nextfunds.jp/semi/article3-2.html
 *     原文「ETFの分配金はいつもらえるのか 決算日から40日程度になります」
 * 収録12銘柄の決算日はすべて月の前半（4・8・9・10・12・15日）なので、+40日は必ず翌月に入る
 * （最も遅い15日でも翌月24〜25日）。
 * よってアプリは「入金月＝決算月の翌月」を共通のめやすとして扱う（銘柄ごとのラグは持たない）。
 *
 * ==== 年次更新チェックリスト ====
 *  1. 各銘柄の決算月・決算日が変わっていないか
 *     → 一括点検はJPXの銘柄概要PDFが速い。統一URL:
 *        https://www.jpx.co.jp/equities/products/etfs/issues/files/<コード>-j.pdf
 *        「分配金支払基準日」の項目名と値が同一行にある（2026-08-25に全12銘柄で確認）。
 *     → ただし sourceUrl は運用会社ドメインで持つ。JPXは横断点検用の補助として使う。
 *  2. refYield の初期値が実勢とかけ離れていないか → 変えたら refYieldAsOf も更新する
 *  3. 新しいJリートETFが上場していないか（上のJPX一覧ページで確認）
 */

var FUNDS = [
  {
    code: "1343",
    name: "NEXT FUNDS 東証REIT指数連動型上場投信",
    company: "野村アセットマネジメント",
    officialUrl: "https://nextfunds.jp/lineup/1343/",
    settlementMonths: [2, 5, 8, 11],
    settlementDay: 10,
    articlePath: "/1343-nfj-reit",
    // 確認: 2026-08-25 / 原文「分配金支払い基準日 毎年2月、5月、8月、11月の各10日(年4回)」
    sourceUrl: "https://nextfunds.jp/lineup/1343/",
    verifiedAt: "2026-08-25"
  },
  {
    code: "1345",
    name: "上場インデックスファンドJリート（東証REIT指数）隔月分配型",
    company: "アモーヴァ・アセットマネジメント",
    officialUrl: "https://www.amova-am.com/products/etf/lineup/jreit",
    settlementMonths: [1, 3, 5, 7, 9, 11],
    settlementDay: 8,
    articlePath: "/1345-listed-jreit",
    // 確認: 2026-08-25 / 原文「決算日は毎年、奇数月の各8日」（年6回・隔月）
    sourceUrl: "https://www.amova-am.com/products/etf/lineup/jreit",
    verifiedAt: "2026-08-25"
  },
  {
    code: "1398",
    name: "SMDAM 東証REIT指数上場投信",
    company: "三井住友DSアセットマネジメント",
    officialUrl: "https://www.smd-am.co.jp/fund/190309/",
    settlementMonths: [3, 6, 9, 12],
    settlementDay: 8,
    articlePath: null,
    // 確認: 2026-08-25 / 分配金一覧の「決算日」列。2015年から45期分すべて3・6・9・12月の各8日。
    //   （ファンド概要ページは決算日を動的読み込みしており本文に日付が出ない）
    sourceUrl: "https://www.smd-am.co.jp/fund/190309/dividend/",
    verifiedAt: "2026-08-25"
  },
  {
    code: "1476",
    name: "iシェアーズ・コア Jリート ETF",
    company: "ブラックロック・ジャパン",
    officialUrl: "https://www.blackrock.com/jp/individual/ja/products/279435/ishares-core-japan-reit-etf",
    settlementMonths: [2, 5, 8, 11],
    settlementDay: 9,
    articlePath: "/1476-ishares-jreit",
    // 確認: 2026-08-25 / 原文「分配頻度 年4回 / 決算日 毎年2月9日、5月9日、8月9日、および11月9日」
    sourceUrl: "https://www.blackrock.com/jp/individual/ja/products/279435/ishares-core-japan-reit-etf",
    verifiedAt: "2026-08-25"
  },
  {
    code: "1488",
    name: "iFreeETF 東証REIT指数",
    company: "大和アセットマネジメント",
    officialUrl: "https://www.daiwa-am.co.jp/etf/funds/3511/",
    settlementMonths: [3, 6, 9, 12],
    settlementDay: 4,
    articlePath: "/1488-daiwa-reit",
    // 確認: 2026-08-25 / 原文「決算日 毎年3月4日、6月4日、9月4日、12月4日（年4回）」
    sourceUrl: "https://www.daiwa-am.co.jp/etf/funds/3511/",
    verifiedAt: "2026-08-25"
  },
  {
    code: "1595",
    name: "NZAM 上場投信 東証REIT指数",
    company: "農林中金全共連アセットマネジメント",
    officialUrl: "https://www.ja-asset.co.jp/fund/140827/index",
    settlementMonths: [1, 4, 7, 10],
    settlementDay: 15,
    articlePath: "/1595-nzam-jreit",
    // 確認: 2026-08-25 / 交付目論見書の原文「決算日 毎年１月、４月、７月、10月の各15日」
    //   （公式サイトの銘柄ページ本文には決算日の記載が無く、交付目論見書PDFに載っている）
    //   ※同じ農林中金全共連の530Aは「2・5・8・11月決算型」の別銘柄。取り違えないこと。
    sourceUrl: "https://www.ja-asset.co.jp/fund/140827/pdf/koutline140827.pdf",
    verifiedAt: "2026-08-25"
  },
  {
    code: "1597",
    name: "MAXIS Jリート上場投信",
    company: "三菱UFJアセットマネジメント",
    officialUrl: "https://maxis.am.mufg.jp/etf_fund/181597.html",
    settlementMonths: [3, 6, 9, 12],
    settlementDay: 8,
    articlePath: "/1597-maxis-jreit",
    // 確認: 2026-08-25 / 三菱UFJアセットマネジメントの商品概要PDFの原文「決算日 3・6・9・12月の各8日」
    //   （公式サイトの銘柄ページは決算情報を動的読み込みしており本文に日付が出ない）
    sourceUrl: "https://www.am.mufg.jp/assets/pdf/fund/181597s_260515.pdf",
    verifiedAt: "2026-08-25"
  },
  {
    code: "2552",
    name: "上場インデックスファンドJリート（東証REIT指数）隔月分配型（ミニ）",
    company: "アモーヴァ・アセットマネジメント",
    officialUrl: "https://www.amova-am.com/products/etf/lineup/jreitmini",
    settlementMonths: [2, 4, 6, 8, 10, 12],
    settlementDay: 8,
    articlePath: null,
    // 確認: 2026-08-25 / 原文「決算日: 毎年、偶数月の各8日」（年6回・隔月）
    //   ※1345（奇数月）と同じ運用会社の姉妹ファンド。決算月が逆なので取り違えないこと。
    sourceUrl: "https://www.amova-am.com/products/etf/lineup/jreitmini",
    verifiedAt: "2026-08-25"
  },
  {
    code: "2555",
    name: "東証REIT ETF",
    company: "シンプレクス・アセット・マネジメント",
    officialUrl: "https://www.simplexasset.com/etf/etf2555.html",
    settlementMonths: [1, 4, 7, 10],
    settlementDay: 12,
    articlePath: null,
    // 確認: 2026-08-25 / 交付目論見書の原文「決算日 毎年１、４、７、10月12日」
    //   （公式サイトの銘柄ページ本文には決算日の記載が無い）
    sourceUrl: "https://www.simplexasset.com/etf/docs/2555Prospectus.pdf",
    verifiedAt: "2026-08-25"
  },
  {
    code: "2556",
    name: "One ETF 東証REIT指数",
    company: "アセットマネジメントOne",
    officialUrl: "https://www.am-one.co.jp/fund/summary/313008/",
    settlementMonths: [1, 4, 7, 10],
    settlementDay: 8,
    articlePath: "/2556-oneetf-jreit",
    // 確認: 2026-08-25 / 原文「決算日 毎年1月、4月、7月および10月の各8日」
    sourceUrl: "https://www.am-one.co.jp/fund/summary/313008/",
    verifiedAt: "2026-08-25"
  },
  {
    code: "443A",
    name: "iFreeETF 東証REIT指数（2・5・8・11月決算型）",
    company: "大和アセットマネジメント",
    officialUrl: "https://www.daiwa-am.co.jp/etf/funds/3544/",
    settlementMonths: [2, 5, 8, 11],
    settlementDay: 4,
    articlePath: null,
    // 確認: 2026-08-25 / 原文「分配金支払基準日（決算日） 毎年2、5、8、11月の各4日（年4回）」
    //   ※同じ大和の1488は「3・6・9・12月」の別銘柄。取り違えないこと。
    sourceUrl: "https://www.daiwa-am.co.jp/etf/funds/3544/",
    verifiedAt: "2026-08-25"
  },
  {
    code: "530A",
    name: "NZAM 上場投信 東証REIT指数（2・5・8・11月決算型）",
    company: "農林中金全共連アセットマネジメント",
    officialUrl: "https://www.ja-asset.co.jp/fund/140878/index",
    settlementMonths: [2, 5, 8, 11],
    settlementDay: 15,
    articlePath: null,
    // 画面に添える注記（事実のみ。優劣の判断は書かない）。省略可。
    note: "2026年3月上場・初回決算は2026年8月15日。分配実績はまだ1期分です。",
    // 確認: 2026-08-25 / 交付目論見書の原文
    //   「決算日 毎年２月、５月、８月、11月の各15日（初回決算日は2026年８月15日）」
    //   ※2026-03-19上場・初回決算2026-08-15の新しい銘柄で、分配実績はまだ1期分しかない。
    //   ※同じ農林中金全共連の1595は「1・4・7・10月」の別銘柄。取り違えないこと。
    sourceUrl: "https://www.ja-asset.co.jp/fund/140878/pdf/koutline140878.pdf",
    verifiedAt: "2026-08-25"
  }
];

/* 参考: 想定分配金利回りの初期値（%）。銘柄固有ではなく共通の初期値として使う。
   J-REIT全体の分配金利回りはおおむね4%前後で推移しているという一般的な水準を初期値に置いたもので、
   特定銘柄の実績・予想ではない。ユーザーが自由に変更する前提。 */
var DEFAULT_YIELD = 4.0;
var DEFAULT_YIELD_AS_OF = "2026-08-25";

/* 上場株式等の配当・分配金に対する税率（所得税15% + 復興特別所得税0.315% + 住民税5%） */
var TAX_RATE = 0.20315;

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    FUNDS: FUNDS,
    DEFAULT_YIELD: DEFAULT_YIELD,
    DEFAULT_YIELD_AS_OF: DEFAULT_YIELD_AS_OF,
    TAX_RATE: TAX_RATE
  };
}

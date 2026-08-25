"use strict";
/*
 * 毎月分配カレンダー — 銘柄マスタ
 *
 * ==== このファイルを直すときの決まり ====
 * 決算日データの正本は `.company/media/rinne-blog/jreit-settlement-calendar.md`。
 * ここを変更したら必ず正本も直すこと（逆も同じ）。二重管理で片方が古くなる事故を防ぐため。
 *
 * ==== 持つデータ / 持たないデータ ====
 *  持つ  : 決算月・決算日（信託約款で決まっており年単位でほぼ不変）
 *  持たない: 株価・基準価額・1口あたり分配金の実績（変動が激しく、同梱すると公開直後から陳腐化する）
 *  参考利回り(refYield)は「初期値」であり実績値ではない。ユーザーが自由に変更できる。
 *
 * ==== 支払開始日について（重要）====
 * 「決算日→支払開始日」の対応表は、7銘柄いずれの運用会社サイトでも公表されていない。
 * 一般則として「ETFの分配金は決算日から40日程度で支払われる」ことが運用会社の解説に明記されている
 *   アモーヴァ・アセットマネジメント https://www.amova-am.com/products/etf/we-love-etf/kihon/kihon20
 *     原文「分配金の支払いは、ETFの決算日である分配金支払基準日から約40日となっています」
 *   NEXT FUNDS https://nextfunds.jp/semi/article3-2.html
 *     原文「ETFの分配金はいつもらえるのか 決算日から40日程度になります」
 * 収録7銘柄の決算日はすべて月の前半（4・8・9・10・15日）なので、+40日は必ず翌月に入る。
 * よってアプリは「入金月＝決算月の翌月」を共通のめやすとして扱う（銘柄ごとのラグは持たない）。
 *
 * ==== 年次更新チェックリスト ====
 *  1. 各銘柄の決算月・決算日が変わっていないか（運用会社の公式ページ）
 *  2. refYield の初期値が実勢とかけ離れていないか → 変えたら refYieldAsOf も更新する
 *  3. 新しいJリートETFが出ていないか（記事を書いてから収録する）
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

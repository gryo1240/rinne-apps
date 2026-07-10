"use strict";
/*
 * 年収の壁シミュレーター 計算ロジック（純関数・Node検算可能）
 *
 * ==== 年次更新チェックリスト（毎年3〜4月に確認） ====
 * 1. 協会けんぽ 健康保険料率（全国平均）: https://www.kyoukaikenpo.or.jp/
 * 2. 介護保険料率（全国一律）: 同上
 * 3. 子ども・子育て支援金率: こども家庭庁 https://www.cfa.go.jp/policies/kodomokosodateshienkinseido
 * 4. 雇用保険料率（一般の事業・労働者負担）: 厚労省
 * 5. 国民年金保険料月額: 日本年金機構
 * 6. 税制（基礎控除の特例・給与所得控除）: 2025年改正の特例は2025・2026年分。2027年分以降は要見直し
 * 7. 制度施行日: 賃金要件(月8.8万)撤廃=2026-10-01(予定・政令待ち)。
 *    企業規模要件の段階撤廃: 2027-10(36-50人)→2029-10(21-35人)→2032-10(11-20人)→2035-10(全事業所)
 */

var CONFIG = {
  updated: "2026-07-10", // 画面に自動表示される「制度・料率の確認日」

  // ---- 社会保険料率（労使折半のため本人負担は半分） 2026年度 ----
  kenpoRate: 0.0990,      // 協会けんぽ健康保険料率・全国平均（都道府県で9.21%〜10.55%の幅）
  kaigoRate: 0.0162,      // 介護保険料率（40〜64歳・全国一律）
  kosodateRate: 0.0023,   // 子ども・子育て支援金率（2026年4月開始・被用者保険）
  kouseiRate: 0.183,      // 厚生年金保険料率（固定）
  koyouRateEmployee: 0.005, // 雇用保険料率・労働者負担（一般の事業・2026年度）

  // ---- 国民年金・国保（社保未加入で130万円以上のケース） ----
  kokuminNenkinMonthly: 17920, // 国民年金保険料 2026(令和8)年度月額・全国一律
  kokuhoShotokuwariRate: 0.10, // 国保 所得割の概算率（自治体差が非常に大きい・全国平均的モデル）
  kokuhoKintouwariAnnual: 55000, // 国保 均等割+平等割の概算年額（同上）

  // ---- 税（2025年改正後・2026年分） ----
  kyuyoKoujo: 650000,        // 給与所得控除の最低保障額
  shotokuzeiKiso: 950000,    // 所得税の基礎控除（合計所得132万円以下への特例・2025/2026年分）
  juuminKiso: 430000,        // 住民税の基礎控除
  juuminHikazeiKyuyo: 1100000, // 住民税非課税となる給与収入ライン（1級地・単身）
  shotokuzeiRate: 0.05105,   // 所得税率5%×復興特別所得税1.021
  juuminShotokuwariRate: 0.10,
  juuminChousei: 2500,       // 調整控除（合計所得200万以下・基礎控除分）
  juuminKintouwari: 5000,    // 均等割+森林環境税

  // ---- 加入判定のしきい値 ----
  weeklyHoursThreshold: 20,  // 短時間労働者の週労働時間要件
  fullTimeHoursThreshold: 30, // 正社員の3/4（週40h想定）: これ以上は企業規模に関係なく加入
  wageThresholdMonthly: 88000, // 賃金要件（現行制度のみ。2026年10月に撤廃予定）
  fuyouLimitAnnual: 1300000,   // 130万円の壁（被扶養者認定・60歳未満）

  // ---- 健保 標準報酬月額 等級表（2026年度・報酬月額の上限→標準報酬月額） ----
  // [報酬月額がこの値未満なら, 標準報酬月額]
  smrTable: [
    [63000, 58000], [73000, 68000], [83000, 78000], [93000, 88000],
    [101000, 98000], [107000, 104000], [114000, 110000], [122000, 118000],
    [130000, 126000], [138000, 134000], [146000, 142000], [155000, 150000],
    [165000, 160000], [175000, 170000], [185000, 180000], [195000, 190000],
    [210000, 200000], [230000, 220000], [250000, 240000], [270000, 260000],
    [290000, 280000], [310000, 300000], [330000, 320000], [350000, 340000],
    [370000, 360000], [395000, 380000], [425000, 410000], [455000, 440000],
    [485000, 470000], [515000, 500000], [545000, 530000], [575000, 560000],
    [605000, 590000]
  ],
  kouseiSmrMin: 88000,  // 厚生年金の標準報酬月額 下限
  kouseiSmrMax: 650000, // 同 上限

  // ---- 年金増額の目安 ----
  pensionMultiplier: 5.481 / 1000 // 報酬比例部分: 平均標準報酬額×5.481/1000×加入月数
};

/** 報酬月額 → 健保の標準報酬月額 */
function smrKenpo(monthly) {
  var t = CONFIG.smrTable;
  for (var i = 0; i < t.length; i++) {
    if (monthly < t[i][0]) return t[i][1];
  }
  return t[t.length - 1][1]; // 表の上限超は最上位等級に丸め（パート層では実質発生しない）
}

/** 報酬月額 → 厚生年金の標準報酬月額 */
function smrKousei(monthly) {
  var smr = smrKenpo(monthly);
  return Math.min(Math.max(smr, CONFIG.kouseiSmrMin), CONFIG.kouseiSmrMax);
}

/**
 * メイン計算。
 * @param {Object} p
 * @param {number} p.hourly       時給（円）
 * @param {number} p.weeklyHours  週の労働時間
 * @param {boolean} p.age40plus   40〜64歳（介護保険第2号）
 * @param {string} p.regime       "current"（〜2026年9月）| "new2026"（2026年10月〜予定）
 * @param {string} p.companySize  "51+" | "50-"
 * @returns {Object} 判定と金額の内訳（すべて年額・円）
 */
function calcCase(p) {
  var annual = p.hourly * p.weeklyHours * 52;
  var monthly = annual / 12;

  // ---- 被用者保険（健保+厚年）の加入判定 ----
  var hoursOK = p.weeklyHours >= CONFIG.weeklyHoursThreshold;
  var fullTime = p.weeklyHours >= CONFIG.fullTimeHoursThreshold; // 3/4ルール: 規模・賃金要件によらず加入
  var wageOK = (p.regime === "new2026") ? true : monthly >= CONFIG.wageThresholdMonthly;
  var sizeOK = p.companySize === "51+";
  var shahoJoin = fullTime || (hoursOK && wageOK && sizeOK);

  // ---- 雇用保険（週20h以上で加入・社保とは別判定） ----
  var koyouJoin = hoursOK;
  var koyou = koyouJoin ? annual * CONFIG.koyouRateEmployee : 0;

  var kenpo = 0, kousei = 0, kokuminNenkin = 0, kokuho = 0;
  var status; // "shaho" | "fuyou" | "kokuho"
  var smrP = 0;

  if (shahoJoin) {
    status = "shaho";
    var smrK = smrKenpo(monthly);
    smrP = smrKousei(monthly);
    var kenpoRate = CONFIG.kenpoRate + (p.age40plus ? CONFIG.kaigoRate : 0) + CONFIG.kosodateRate;
    kenpo = smrK * kenpoRate / 2 * 12;
    kousei = smrP * CONFIG.kouseiRate / 2 * 12;
  } else if (annual >= CONFIG.fuyouLimitAnnual) {
    // 社保に入れないまま130万以上 → 扶養を外れて国民年金+国保（最も重い「第3の崖」）
    status = "kokuho";
    kokuminNenkin = CONFIG.kokuminNenkinMonthly * 12;
    var kokuhoBase = Math.max(0, (annual - CONFIG.kyuyoKoujo) - CONFIG.juuminKiso);
    kokuho = kokuhoBase * CONFIG.kokuhoShotokuwariRate + CONFIG.kokuhoKintouwariAnnual;
  } else {
    status = "fuyou"; // 配偶者の被扶養(第3号) → 本人の社保負担なし
  }

  var socialTotal = kenpo + kousei + koyou + kokuminNenkin + kokuho;

  // ---- 所得税（復興税込・課税所得195万以下の5%区分を想定） ----
  var kyuyoShotoku = Math.max(0, annual - CONFIG.kyuyoKoujo);
  var kazei = Math.max(0, kyuyoShotoku - CONFIG.shotokuzeiKiso - socialTotal);
  var shotokuzei = Math.round(kazei * CONFIG.shotokuzeiRate);

  // ---- 住民税 ----
  var juuminzei = 0;
  if (annual > CONFIG.juuminHikazeiKyuyo) {
    var shotokuwari = Math.max(0, kyuyoShotoku - CONFIG.juuminKiso - socialTotal) * CONFIG.juuminShotokuwariRate;
    juuminzei = Math.round(Math.max(0, shotokuwari - CONFIG.juuminChousei) + CONFIG.juuminKintouwari);
  }

  var net = annual - socialTotal - shotokuzei - juuminzei;

  // ---- 厚生年金加入による将来の年金増額（10年働いた場合・65歳から年額） ----
  var pensionUp10y = shahoJoin ? Math.round(smrP * CONFIG.pensionMultiplier * 120) : 0;

  return {
    annual: Math.round(annual),
    monthly: Math.round(monthly),
    status: status,
    shahoJoin: shahoJoin,
    koyouJoin: koyouJoin,
    fullTime: fullTime,
    kenpo: Math.round(kenpo),
    kousei: Math.round(kousei),
    koyou: Math.round(koyou),
    kokuminNenkin: Math.round(kokuminNenkin),
    kokuho: Math.round(kokuho),
    socialTotal: Math.round(socialTotal),
    shotokuzei: shotokuzei,
    juuminzei: juuminzei,
    net: Math.round(net),
    pensionUp10y: pensionUp10y
  };
}

/**
 * 働き損カーブ用データ。週0.25h刻み + 判定境界の直前直後を明示的に打つ。
 * @returns {Array<{h:number, r:Object}>}
 */
function buildCurve(p, maxHours) {
  var EPS = 1e-9;
  var hs = [];
  for (var h = 0; h <= maxHours + EPS; h += 0.25) hs.push(Math.round(h * 100) / 100);

  // 境界点: 週20h・週30h・賃金要件到達時間（現行のみ）・130万到達時間
  var boundaries = [CONFIG.weeklyHoursThreshold, CONFIG.fullTimeHoursThreshold];
  if (p.regime === "current") {
    boundaries.push(CONFIG.wageThresholdMonthly * 12 / 52 / p.hourly);
  }
  boundaries.push(CONFIG.fuyouLimitAnnual / 52 / p.hourly);
  boundaries.forEach(function (b) {
    if (b > 0 && b <= maxHours) {
      // 直前は切り下げ・境界自体は切り上げで打つ（丸めで境界の手前に落ちると崖の位置がズレるため）
      hs.push(Math.floor((b - 0.0005) * 1000) / 1000);
      hs.push(Math.ceil(b * 1000) / 1000);
    }
  });

  hs.sort(function (a, b) { return a - b; });
  // 重複除去
  var uniq = [];
  hs.forEach(function (h) {
    if (uniq.length === 0 || h - uniq[uniq.length - 1] > 1e-6) uniq.push(h);
  });

  return uniq.map(function (h) {
    return { h: h, r: calcCase({ hourly: p.hourly, weeklyHours: h, age40plus: p.age40plus, regime: p.regime, companySize: p.companySize }) };
  });
}

/**
 * 崖の分析: 現在の条件で存在する「手取りが落ちる崖」と「元の手取りに戻る時間」を求める。
 * @returns {Array<{atHours:number, dropYen:number, recoverHours:number|null, kind:string}>}
 */
function findCliffs(curve) {
  var cliffs = [];
  for (var i = 1; i < curve.length; i++) {
    var prev = curve[i - 1], cur = curve[i];
    // 「崖」= 加入状態が切り替わって手取りが落ちる点のみ（標準報酬月額の等級の階段は崖として扱わない）
    if (cur.r.status !== prev.r.status && cur.r.net < prev.r.net) {
      var recover = null;
      for (var j = i + 1; j < curve.length; j++) {
        if (curve[j].r.net >= prev.r.net) { recover = curve[j].h; break; }
      }
      cliffs.push({
        atHours: cur.h,
        beforeNet: prev.r.net,
        afterNet: cur.r.net,
        dropYen: prev.r.net - cur.r.net,
        recoverHours: recover,
        kind: cur.r.status // 落ちた先の状態
      });
    }
  }
  return cliffs;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { CONFIG: CONFIG, smrKenpo: smrKenpo, smrKousei: smrKousei, calcCase: calcCase, buildCurve: buildCurve, findCliffs: findCliffs };
}

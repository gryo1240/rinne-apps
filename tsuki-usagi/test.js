"use strict";
/* 月うさぎのすみか ロジック検算 (node apps/tsuki-usagi/test.js) */
var T = require("./logic.js");
var D = require("./data.js");
var failed = 0;

function ok(name, cond) {
  if (!cond) { failed++; console.log("NG " + name); }
  else console.log("ok " + name);
}
function eq(name, actual, expected) {
  if (actual !== expected) { failed++; console.log("NG " + name + ": actual=" + JSON.stringify(actual) + " expected=" + JSON.stringify(expected)); }
  else console.log("ok " + name);
}

// テスト環境のTZに依存しないよう、ローカル時刻コンストラクタで時刻を作る
var TZ = new Date().getTimezoneOffset();
function local(y, mo, d, h, mi) { return new Date(y, mo - 1, d, h || 0, mi || 0).getTime(); }

/* ==== 月齢(天文アンカー: 日食=新月・月食=満月) ==== */
eq("皆既日食2024-04-08=新月", T.moonPhase(T.moonAge(Date.UTC(2024, 3, 8, 18, 20))), "new");
eq("皆既月食2022-11-08=満月", T.moonPhase(T.moonAge(Date.UTC(2022, 10, 8, 11, 0))), "full");
eq("中秋の名月2023-09-29=満月", T.moonPhase(T.moonAge(Date.UTC(2023, 8, 29, 9, 57))), "full");
eq("皆既月食2021-05-26=満月", T.moonPhase(T.moonAge(Date.UTC(2021, 4, 26, 11, 19))), "full");
eq("金環日食2023-10-14=新月", T.moonPhase(T.moonAge(Date.UTC(2023, 9, 14, 18, 0))), "new");
(function () {
  var a = T.moonAge(Date.now ? local(2026, 7, 12, 21) : 0);
  ok("月齢は0〜29.53の範囲", a >= 0 && a < T.SYNODIC);
})();
eq("満月の夜のdaysToFullMoon=0", T.daysToFullMoon(14.9), 0);
eq("月齢14.0は幅判定で満月扱い=0日", T.daysToFullMoon(14.0), 0);
eq("月齢12.0→満月まで3日", T.daysToFullMoon(12.0), 3);
ok("満月直後→次の満月は28日以上先", T.daysToFullMoon(15.9) >= 28);

/* ==== 時間帯(半開区間の境界を全確認) ==== */
eq("0時=夜", T.timeBand(0), "night");
eq("1時=深夜", T.timeBand(1), "latenight");
eq("5時=深夜", T.timeBand(5), "latenight");
eq("6時=朝", T.timeBand(6), "morning");
eq("9時=朝", T.timeBand(9), "morning");
eq("10時=昼", T.timeBand(10), "noon");
eq("15時=昼", T.timeBand(15), "noon");
eq("16時=夕", T.timeBand(16), "evening");
eq("18時=夕", T.timeBand(18), "evening");
eq("19時=夜", T.timeBand(19), "night");
eq("23時=夜", T.timeBand(23), "night");

/* ==== ストリーク・拗ね(simulate) ==== */
(function () {
  var t0 = local(2026, 7, 1, 20);
  var s = T.newState(t0, TZ);
  eq("初期ストリーク=1", s.streak.count, 1);

  // 同日再訪: 変化なし
  T.simulate(s, local(2026, 7, 1, 22), TZ);
  eq("同日再訪でストリーク変化なし", s.streak.count, 1);

  // 翌日: +1
  T.simulate(s, local(2026, 7, 2, 20), TZ);
  eq("翌日訪問でストリーク2", s.streak.count, 2);
  ok("翌日訪問で拗ねない", !s.sulking);

  // 1日飛ばし(gap=2): お休み保険で継続・拗ね免除
  T.simulate(s, local(2026, 7, 4, 20), TZ);
  eq("保険でストリーク3", s.streak.count, 3);
  ok("保険適用時は拗ねない", !s.sulking);

  // 同じ週にもう一度1日飛ばし: 保険は週1なのでリセット(ただし拗ねはgap3未満なので無し)
  T.simulate(s, local(2026, 7, 6, 20), TZ);
  eq("保険使用済みの週はリセット", s.streak.count, 1);
  ok("gap2では拗ねない", !s.sulking);

  // 3日空け(gap=3): 拗ねる
  T.simulate(s, local(2026, 7, 9, 20), TZ);
  ok("3日空けると拗ねる", s.sulking);
  eq("拗ね時ストリークは1", s.streak.count, 1);

  // 仲直り: なで3回
  var r1 = T.doPet(s, local(2026, 7, 9, 20, 1), TZ);
  var r2 = T.doPet(s, local(2026, 7, 9, 20, 2), TZ);
  ok("なで2回ではまだ拗ねている", s.sulking && !r2.reconciled);
  var r3 = T.doPet(s, local(2026, 7, 9, 20, 3), TZ);
  ok("なで3回で仲直り", !s.sulking && r3.reconciled);
  eq("仲直り記録", s.records.reconciled, 1);

  // 時計戻し: clampして罰なし
  var before = JSON.stringify(s.streak);
  T.simulate(s, local(2026, 7, 5, 20), TZ);
  eq("時計戻しでストリーク不変", JSON.stringify(s.streak), before);
  ok("時計戻しで拗ねない", !s.sulking);

  // 90日不在: O(1)で拗ね1回だけ
  T.simulate(s, local(2026, 10, 9, 20), TZ);
  ok("90日不在でも拗ねは1段階", s.sulking && s.streak.count === 1);
})();

/* ==== だんご(帯ごと1日1回) ==== */
(function () {
  var t0 = local(2026, 7, 1, 7); // 朝
  var s = T.newState(t0, TZ);
  ok("朝はだんごOK", T.canFeed(s, t0, TZ).ok);
  ok("朝だんご実行", T.doFeed(s, t0, TZ));
  ok("同じ帯の2個目は不可", !T.canFeed(s, local(2026, 7, 1, 8), TZ).ok);
  eq("昼はだんご帯でない", T.canFeed(s, local(2026, 7, 1, 12), TZ).reason, "band");
  ok("夕はOK", T.doFeed(s, local(2026, 7, 1, 17), TZ));
  ok("夜もOK", T.doFeed(s, local(2026, 7, 1, 20), TZ));
  eq("1日3回で打ち止め", s.feeds.bands.length, 3);
  // 翌日はリセット
  T.simulate(s, local(2026, 7, 2, 7), TZ);
  ok("翌日はまた朝だんごOK", T.canFeed(s, local(2026, 7, 2, 7), TZ).ok);
  eq("だんご3回のなつき度=15", s.affection, 15);
})();

/* ==== なつき度の日次上限 ==== */
(function () {
  var t0 = local(2026, 7, 1, 20);
  var s = T.newState(t0, TZ);
  T.addAffection(s, 100, t0, TZ);
  eq("日次上限でキャップ", s.affection, T.AFFECTION_DAILY_CAP);
  T.simulate(s, local(2026, 7, 2, 20), TZ);
  T.addAffection(s, 10, local(2026, 7, 2, 20), TZ);
  eq("翌日は再び加算できる", s.affection, T.AFFECTION_DAILY_CAP + 10);
  eq("レベル: 35=なかよし", T.affectionLevel(35).key, "friend");
  eq("レベル: 150=かぞく", T.affectionLevel(150).key, "family");
})();

/* ==== 成長 ==== */
(function () {
  var t0 = local(2026, 7, 1, 20);
  var s = T.newState(t0, TZ);
  eq("初日は子うさぎ", T.growthStage(s, t0), "child");
  eq("6日目はまだ子", T.growthStage(s, local(2026, 7, 7, 19)), "child");
  eq("7日経過でおとな", T.growthStage(s, local(2026, 7, 8, 21)), "adult");
})();

/* ==== 次のだんご表示・アポイントメント ==== */
(function () {
  var s = T.newState(local(2026, 7, 1, 11), TZ);
  eq("昼→次は16時", T.nextDangoText(s, local(2026, 7, 1, 11), TZ), "次のだんごは16時から");
  eq("朝の未給餌→いまが時間", T.nextDangoText(s, local(2026, 7, 1, 7), TZ), "いま、だんごの時間だよ");
  T.doFeed(s, local(2026, 7, 1, 20), TZ); // 夜だんご
  eq("夜給餌済み→明日の朝", T.nextDangoText(s, local(2026, 7, 1, 21), TZ), "次のだんごは明日の朝6時から");
  var ap = T.appointments(s, local(2026, 7, 1, 21), TZ);
  eq("アポイントメントは2件", ap.length, 2);
  ok("満月情報を含む", /満月/.test(ap[1]));
})();

/* ==== セリフ選択(決定論・枯渇対策) ==== */
(function () {
  var t0 = local(2026, 7, 1, 20);
  var s1 = T.newState(t0, TZ);
  var s2 = T.newState(t0, TZ);
  var a = T.pickTalk(D.dialogues, s1, t0, TZ);
  var b = T.pickTalk(D.dialogues, s2, t0, TZ);
  eq("同条件なら同じセリフ(決定論)", a, b);
  var c = T.pickTalk(D.dialogues, s1, t0, TZ);
  ok("2回目は別のセリフ(順繰り)", a !== c);
  // 拗ね中は拗ねプール
  s1.sulking = true;
  var d = T.pickTalk(D.dialogues, s1, t0, TZ);
  ok("拗ね中は拗ねセリフ", D.dialogues.sulk.indexOf(d) >= 0);
})();

/* ==== セリフプールの本数(枯渇対策: 主要帯20本以上) ==== */
ok("朝プール20本以上", D.dialogues.morning.length >= 20);
ok("夕プール20本以上", D.dialogues.evening.length >= 20);
ok("夜プール20本以上", D.dialogues.night.length >= 20);
ok("昼プール15本以上", D.dialogues.noon.length >= 15);
ok("深夜プール15本以上", D.dialogues.latenight.length >= 15);
ok("月相フレーバーは8区分すべて", Object.keys(D.dialogues.phaseFlavor).length === 8);

/* ==== 引っ越しコード ==== */
(function () {
  var t0 = local(2026, 7, 1, 20);
  var s = T.newState(t0, TZ);
  s.name = "もちまる🌙";
  s.affection = 42;
  var code = T.encodeState(s);
  var back = T.decodeState(code);
  ok("引っ越しコード往復(名前)", back && back.name === "もちまる🌙");
  ok("引っ越しコード往復(なつき度)", back && back.affection === 42);
  ok("改ざんコードはnull", T.decodeState(code.slice(0, -1) + "x") === null);
  ok("ゴミ文字列はnull", T.decodeState("こんにちは") === null);
  ok("空文字はnull", T.decodeState("") === null);
})();

/* ==== マイグレーション(形状検証つき) ==== */
(function () {
  var nowT = local(2026, 7, 1, 20);
  var s = T.newState(nowT, TZ);
  ok("現行バージョンの完全な状態は素通し", T.migrate(s) === s);
  ok("未知バージョンはnull", T.migrate({ v: 99 }) === null);
  ok("nullはnull", T.migrate(null) === null);
  // 欠損フィールドの補完({v:1}だけの不正コードで起動不能にならない)
  var patched = T.migrate({ v: 1 }, nowT, TZ);
  ok("欠損だらけでも補完して返す", patched !== null);
  T.simulate(patched, nowT, TZ);
  ok("補完後の状態でsimulateが動く", patched.streak.count >= 1);
  // 部分欠損(nameだけある)
  var partial = T.migrate({ v: 1, name: "もち", affection: 7 }, nowT, TZ);
  ok("部分欠損: 既存値は引き継ぐ", partial.name === "もち" && partial.affection === 7);
})();

/* ==== 名前サニタイズ(XSS対策) ==== */
eq("HTML特殊文字を除去(8文字化)", T.sanitizeName("<img src=x>"), "img src=");
eq("スクリプト断片も無害化", T.sanitizeName("a<b>'\"&`c"), "abc");
eq("空になったらデフォルト名", T.sanitizeName("<>"), "つき");
eq("非文字列はデフォルト名", T.sanitizeName(12345), "つき");
eq("9文字以上は8文字に切る", T.sanitizeName("あいうえおかきくけこ"), "あいうえおかきく");
eq("通常の名前はそのまま", T.sanitizeName("もちまる🌙"), "もちまる🌙");
(function () {
  // 引っ越しコードに悪意ある名前を入れても無害化される
  var s = T.newState(local(2026, 7, 1, 20), TZ);
  s.name = "x<img src=x onerror=alert(1)>";
  var back = T.decodeState(T.encodeState(s));
  ok("引っ越しコード経由の名前も無害", back !== null && back.name.indexOf("<") < 0);
})();

/* ==== 月の出入りの目安 ==== */
ok("新月の月の出は6時ごろ", /月の出 6時ごろ/.test(T.moonRiseSetText(0)));
ok("満月の月の出は18時ごろ", /月の出 18時ごろ/.test(T.moonRiseSetText(14.8)));
ok("RECONCILE_PETSがexportされている", T.RECONCILE_PETS === 3);

console.log(failed === 0 ? "\nALL PASS" : "\n" + failed + " FAILED");
process.exit(failed === 0 ? 0 : 1);

"use strict";
/*
 * 宵乃こよみの事件簿 - 話（夜）の一覧。新しい夜はここに1行足す（2026-10-12 第二夜の追加で新設）
 *
 *  key   : 話の識別子（URLの ?ep=2 と「最後に遊んだ話」の記録に使う）
 *  ready : false の話はタイトルに出さない（公開前の確認は URL に ?preview=1 を付ける）
 *  keys  : 保存先。★第一夜は公開時（2026-07-16）からのキーのまま。変えると既読・回収した結末が消える
 *
 * シナリオのファイルが読めなかった話（デプロイでのコピー漏れ等）は一覧から外す。
 * 1話の読み込み失敗で、公開中の第一夜まで動かなくならないように（レビュー指摘 2026-10-12 低1）。
 */
var EPISODES = (function () {
  function load(globalName, path) {
    if (typeof window !== "undefined" && window[globalName]) return window[globalName];
    try { return typeof require === "function" ? require(path) : null; } catch (e) { return null; }
  }
  return [
    { key: "ep1", no: 1, label: "第一夜", scenario: load("SCENARIO", "./scenario.js"), ready: true,
      keys: { run: "koyomi-jikenbo:run", meta: "koyomi-jikenbo:meta" } },
    { key: "ep2", no: 2, label: "第二夜", scenario: load("SCENARIO2", "./scenario-2.js"), ready: true,  // 2026-10-12 公開（オーナー試読v1.5で了承）
      keys: { run: "koyomi-jikenbo:ep2:run", meta: "koyomi-jikenbo:ep2:meta" } }
  ].filter(function (e) { return !!e.scenario; });
})();

if (typeof module !== "undefined") module.exports = EPISODES;

"use strict";
/* 宵乃こよみの事件簿 全パス総当たり検算 (node apps/koyomi-jikenbo/test.js) */
var L = require("./logic.js");
var S = require("./scenario.js");
var SP = require("./sprites.js");
var failed = 0;
function ok(name, cond) { if (!cond) { failed++; console.log("NG " + name); } else console.log("ok " + name); }
function eq(name, a, b) { if (a !== b) { failed++; console.log("NG " + name + ": " + JSON.stringify(a) + " != " + JSON.stringify(b)); } else console.log("ok " + name); }

// ===== 1) 全ノードのnext先が実在し、未知ノード型が無い =====
(function () {
  var bad = [];
  Object.keys(S.nodes).forEach(function (id) {
    var n = S.nodes[id];
    if (n.id !== id) bad.push("id mismatch " + id);
    if (n.type === "text") { if (!S.nodes[n.next]) bad.push(id + ".next missing " + n.next); }
    else if (n.type === "choice") { n.choices.forEach(function (c, i) { if (!S.nodes[c.next]) bad.push(id + "#" + i + ".next missing " + c.next); }); }
    else if (n.type === "branch") { n.branch.forEach(function (b, i) { if (!S.nodes[b.next]) bad.push(id + ".branch" + i + " missing " + b.next); }); if (!n.branch[n.branch.length - 1] || n.branch[n.branch.length - 1].cond) bad.push(id + " branch has no default"); }
    else if (n.type === "end") { /* ok */ }
    else bad.push(id + " unknown type " + n.type);
  });
  ok("全ノードのnext先が実在・型が正当: " + (bad.length ? bad.join(" / ") : "OK"), bad.length === 0);
})();

// ===== 2) start から全パスを総当たりし、到達エンド・収束・字数・フレーバー合流を検算 =====
var reachedEnds = {};
var reachedNodes = {};
var pathCount = 0;
var maxLen = 0;

function walk(nodeId, flags, depth, chars) {
  if (depth > 500) throw new Error("path too deep at " + nodeId);
  var view = L.resolve(S, nodeId, flags);
  reachedNodes[view.id] = true;
  if (view.kind === "text") {
    walk(view.next, flags, depth + 1, chars + view.text.length);
  } else if (view.kind === "choice") {
    // 選択可能な肢だけ辿る
    for (var i = 0; i < view.options.length; i++) {
      var r = L.applyChoice(S, view.id, flags, view.options[i].index);
      walk(r.next, r.flags, depth + 1, chars);
    }
  } else if (view.kind === "end") {
    pathCount++;
    reachedEnds[view.end] = (reachedEnds[view.end] || 0) + 1;
    if (chars > maxLen) maxLen = chars;
  }
}
walk(S.meta.startId, L.newFlags(), 0, 0);

ok("startから全パス走破（例外なし）: " + pathCount + "パス", pathCount > 0);
ok("TRUEに到達するパスがある", reachedEnds.TRUE > 0);
ok("NORMALに到達するパスがある", reachedEnds.NORMAL > 0);
ok("BADに到達するパスがある", reachedEnds.BAD > 0);
ok("HIDDENはstartから到達不能", !reachedEnds.HIDDEN);

// ===== 3) TRUE到達は a1∧a2∧a3 のときだけ / NORMALは気づき2 / BADは気づき≤1 or 占い選択 =====
(function () {
  // 全16通りの気づき組み合わせ×最終選択で、到達エンドが仕様通りか
  var results = { TRUE: [], NORMAL: [], BAD: [] };
  for (var mask = 0; mask < 8; mask++) {
    var flags = { a1: !!(mask & 1), a2: !!(mask & 2), a3: !!(mask & 4) };
    var aw = L.awareness(flags);
    var view = L.resolve(S, "act3_final_choice", flags);
    // 各選択肢を選んだ場合の到達エンド
    view.options.forEach(function (o) {
      var r = L.applyChoice(S, "act3_final_choice", flags, o.index);
      // エンドまで辿る
      var v = L.resolve(S, r.next, r.flags), g = 0;
      while (v.kind === "text") { v = L.resolve(S, v.next, r.flags); if (g++ > 500) break; }
      if (v.kind === "end") results[v.end].push({ aw: aw, label: o.label });
    });
  }
  // TRUEはすべて aw===3
  ok("TRUE到達は気づき3のときだけ", results.TRUE.length > 0 && results.TRUE.every(function (x) { return x.aw === 3; }));
  // NORMALはすべて aw>=2
  ok("NORMAL到達は気づき2以上のときだけ", results.NORMAL.length > 0 && results.NORMAL.every(function (x) { return x.aw >= 2; }));
  // 気づき3では3択、2では2択、≤1では1択
  eq("気づき3の最終選択肢数=3", L.resolve(S, "act3_final_choice", { a1: true, a2: true, a3: true }).options.length, 3);
  eq("気づき2の最終選択肢数=2", L.resolve(S, "act3_final_choice", { a1: true, a2: true, a3: false }).options.length, 2);
  eq("気づき1の最終選択肢数=1", L.resolve(S, "act3_final_choice", { a1: true, a2: false, a3: false }).options.length, 1);
  eq("気づき0の最終選択肢数=1", L.resolve(S, "act3_final_choice", L.newFlags()).options.length, 1);
})();

// ===== 4) 真相branchが気づき数で正しく3段階に解決 =====
eq("気づき3→truth_full", L.resolve(S, "act3_truth_branch", { a1: true, a2: true, a3: true }).id, "truth_full");
eq("気づき2→truth_half", L.resolve(S, "act3_truth_branch", { a1: true, a2: true, a3: false }).id, "truth_half");
eq("気づき1→truth_none", L.resolve(S, "act3_truth_branch", { a1: true, a2: false, a3: false }).id, "truth_none");
eq("気づき0→truth_none", L.resolve(S, "act3_truth_branch", L.newFlags()).id, "truth_none");

// ===== 5) フレーバー選択①⑤は全分岐先が同一合流先に戻り、フラグを立てない =====
(function () {
  function afterChoiceMergesTo(choiceId, expectMergeId) {
    var view = L.resolve(S, choiceId, L.newFlags());
    var merges = [];
    view.options.forEach(function (o) {
      var r = L.applyChoice(S, choiceId, L.newFlags(), o.index);
      // フラグを立てない
      if (L.awareness(r.flags) !== 0) merges.push("FLAG_SET");
      // 1つ先のtextのnextが合流先
      var v = L.resolve(S, r.next, r.flags);
      merges.push(v.next);
    });
    return merges.every(function (m) { return m === expectMergeId; });
  }
  ok("選択①フレーバー: 3択とも act1_after_welcome に合流・フラグ非変更", afterChoiceMergesTo("act1_choice_welcome", "act1_after_welcome"));
  ok("選択⑤フレーバー: 3択とも act3_truth_branch に合流・フラグ非変更", afterChoiceMergesTo("act3_choice_pause", "act3_truth_branch"));
})();

// ===== 6) 全ノードが到達可能（隠しノードはstart到達不能なので別途） =====
(function () {
  var hiddenIds = { hidden_01: 1, hidden_02: 1, hidden_03: 1, hidden_04: 1, hidden_end: 1 };
  var unreached = [];
  Object.keys(S.nodes).forEach(function (id) {
    if (hiddenIds[id]) return;
    if (S.nodes[id].type === "branch") return; // branchはresolveが透過し表示ノードにならない（到達集合に載らないのが正常）
    if (!reachedNodes[id]) unreached.push(id);
  });
  ok("隠し以外の全ノードがstartから到達可能: " + (unreached.length ? unreached.join(",") : "OK"), unreached.length === 0);
  // 隠しはstartから未到達であること
  ok("隠しノードはstartから未到達", !reachedNodes.hidden_end);
})();

// ===== 7) 隠しエントリから HIDDEN に到達できる =====
(function () {
  var v = L.resolve(S, S.meta.hiddenStartId, L.newFlags()), g = 0;
  while (v.kind === "text") { v = L.resolve(S, v.next, L.newFlags()); if (g++ > 500) break; }
  ok("隠しエントリからHIDDEN到達", v.kind === "end" && v.end === "HIDDEN");
})();

// ===== 8) スキップ: 未読は停止・既読は継続・選択肢では停止 =====
(function () {
  var read = {}; read["act1_02"] = true;
  ok("既読textへはスキップ継続", L.canSkipInto(S, "act1_02", read) === true);
  ok("未読textでは停止", L.canSkipInto(S, "act1_03", read) === false);
  ok("選択肢ノードでは停止", L.canSkipInto(S, "act1_choice_welcome", { act1_choice_welcome: true }) === false);
})();

// ===== 9) meta: union マージ・隠し解禁・回収数・シェア文 =====
(function () {
  var m = L.newMeta();
  m = L.recordEnd(m, "TRUE");
  m = L.recordEnd(m, "NORMAL");
  ok("隠し未解禁(BAD未回収)", L.isHiddenUnlocked(m) === false);
  m = L.recordEnd(m, "BAD");
  ok("隠し解禁(TRUE/NORMAL/BAD回収)", L.isHiddenUnlocked(m) === true);
  eq("回収数=3", L.collectedCount(m, S), 3);
  var a = L.markRead(L.newMeta(), "x"); var b = L.markRead(L.newMeta(), "y");
  var merged = L.mergeMeta(a, b);
  ok("mergeMetaで既読がunionされる", merged.read.x && merged.read.y);
  ok("シェア文に★が含まれ答えを含まない", /★/.test(L.buildShareText(m, S)) && !/手紙|真相/.test(L.buildShareText(m, S)));
})();

// ===== 10) セーブ migrate =====
(function () {
  var run = L.newRun(S);
  ok("正常runは素通し", L.migrateRun(run) === run);
  ok("未知バージョンrunはnull", L.migrateRun({ v: 99 }) === null);
  ok("壊れたrunはnull", L.migrateRun({ v: 1, nodeId: 5 }) === null);
  ok("未知metaは新規metaに", L.migrateMeta({ v: 99 }).v === L.META_V);
})();

// ===== 11) 幕選択の再開点 =====
(function () {
  var cs = L.chapterStart(S, "act2");
  eq("act2再開点=act2_intro", cs.nodeId, "act2_intro");
  ok("再開時フラグは全false", L.awareness(cs.flags) === 0);
})();

// ===== 12) 全ノードの sprite / bg ID が sprites.js に存在する（タイポ回帰防止） =====
(function () {
  var bad = [];
  Object.keys(S.nodes).forEach(function (id) {
    var n = S.nodes[id];
    if (n.sprite && !SP.faces[n.sprite]) bad.push(id + ".sprite=" + n.sprite);
    if (n.bg && !SP.bgs[n.bg]) bad.push(id + ".bg=" + n.bg);
  });
  ok("全sprite/bg IDがsprites.jsに存在: " + (bad.length ? bad.join(",") : "OK"), bad.length === 0);
})();

console.log("\n1周(最長ルート)の最大字数（参考）:", maxLen);
console.log(failed === 0 ? "\nALL PASS (" + pathCount + " paths)" : "\n" + failed + " FAILED");
process.exit(failed === 0 ? 0 : 1);

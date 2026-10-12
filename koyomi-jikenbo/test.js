"use strict";
/* 宵乃こよみの事件簿 全パス総当たり検算 (node apps/koyomi-jikenbo/test.js)
 * 2026-10-12: 第二夜の追加に合わせ、episodes.js の全話に同じ検査を回す形に変更。
 * ノードIDは話ごとに接頭辞（第一夜 ""・第二夜 "e2_"）＋共通の骨組み名（act3_final_choice 等）で書く。 */
var L = require("./logic.js");
var SP = require("./sprites.js");
var EPISODES = require("./episodes.js");
var failed = 0, warned = 0;
function ok(name, cond) { if (!cond) { failed++; console.log("NG " + name); } else console.log("ok " + name); }
function eq(name, a, b) { if (a !== b) { failed++; console.log("NG " + name + ": " + JSON.stringify(a) + " != " + JSON.stringify(b)); } else console.log("ok " + name); }
function warn(name) { warned++; console.log("WARN " + name); }

// 公開済み（2026-07-16〜）の第一夜ノードID。既読管理がID基準なので、1つでも消えると既存プレイヤーの既読が壊れる
var EP1_PUBLISHED_IDS = ["act1_01","act1_02","act1_03","act1_04","act1_05","act1_06","act1_choice_welcome","act1_welcome_tea","act1_welcome_sit","act1_welcome_breath","act1_after_welcome","act1_07","act1_08","act1_09","act1_10","act1_11","act1_12","act2_intro","act2_topicA_01","act2_topicA_choice","act2_topicA_dig","act2_topicA_dig2","act2_topicA_skip","act2_topicA_skip2","act2_topicB_01","act2_topicB_choice","act2_topicB_dig","act2_topicB_dig2","act2_topicB_dig3","act2_topicB_dig4","act2_topicB_skip","act2_topicB_skip2","act2_topicC_01","act2_topicC_choice","act2_topicC_dig","act2_topicC_dig2","act2_topicC_skip","act2_topicC_skip2","act3_intro","act3_choice_pause","act3_pause_tea","act3_pause_moon","act3_pause_eyes","act3_truth_branch","truth_none","truth_half","truth_full","truth_full_2","act3_final_choice","end_true_01","end_true_02","end_true_03","end_true_letter","end_true_04","end_true_05","end_true_06","end_true","end_normal_01","end_normal_02","end_normal_03","end_normal_04","end_normal_05","end_normal","end_bad_01","end_bad_02","end_bad_03","end_bad_04","end_bad_05","end_bad_06","end_bad","hidden_01","hidden_02","hidden_03","hidden_04","hidden_end"];

// ===== 話をまたぐ検査 =====
(function () {
  var e1 = EPISODES[0];
  eq("第一夜の保存キー(run)は公開時のまま", e1.keys.run, "koyomi-jikenbo:run");
  eq("第一夜の保存キー(meta)は公開時のまま", e1.keys.meta, "koyomi-jikenbo:meta");
  ok("第一夜は公開中(ready)", e1.ready === true);
  var missing = EP1_PUBLISHED_IDS.filter(function (id) { return !e1.scenario.nodes[id]; });
  ok("公開済みの第一夜ノードID75個が残っている: " + (missing.length ? missing.join(",") : "OK"), EP1_PUBLISHED_IDS.length === 75 && missing.length === 0);
  var keys = {}, dupKey = false, ids = {}, dupId = [];
  EPISODES.forEach(function (e) {
    [e.keys.run, e.keys.meta, e.key].forEach(function (k) { if (keys[k]) dupKey = true; keys[k] = 1; });
    Object.keys(e.scenario.nodes).forEach(function (id) { if (ids[id]) dupId.push(id); ids[id] = 1; });
  });
  // 分割した続きのページ(_pN)は、元のページを読んでいれば既読扱い（分割前の版で読んだ人のスキップが止まらない）
  var oldRead = {}; EP1_PUBLISHED_IDS.forEach(function (id) { oldRead[id] = true; });
  var splitIds = Object.keys(e1.scenario.nodes).filter(function (id) { return /_p\d+$/.test(id); });
  ok("分割ページがある（" + splitIds.length + "件）", splitIds.length > 0);
  ok("旧版の既読だけで、分割ページへスキップ継続できる", splitIds.every(function (id) { return L.canSkipInto(e1.scenario, id, oldRead) === true; }));
  ok("元のページが未読なら分割ページでも停止", splitIds.every(function (id) { return L.canSkipInto(e1.scenario, id, {}) === false; }));
  ok("分割ページは元IDの続きとして元IDから辿れる", splitIds.every(function (id) {
    var base = id.replace(/_p\d+$/, ""), cur = base, g = 0;
    while (cur !== id && g++ < 10) { var n = e1.scenario.nodes[cur]; if (!n || n.type !== "text") return false; cur = n.next; }
    return cur === id;
  }));
  ok("話ごとの保存キー・識別子が重複しない", !dupKey);
  ok("ノードIDが話をまたいで重複しない: " + (dupId.length ? dupId.join(",") : "OK"), dupId.length === 0);
  // 第一夜のシェア文は公開時と同じ文面（題名の一般化で変わっていない）
  var m = L.recordEnd(L.newMeta(), "TRUE");
  eq("第一夜のシェア文が公開時と同じ", L.buildShareText(m, e1.scenario), "宵乃こよみの事件簿 第一夜『十六夜の来客』をプレイ中🌙 エンド回収 ★☆☆☆（1/4） #宵乃こよみの事件簿");
})();

// ===== 話ごとの検査 =====
EPISODES.forEach(function (EP) {
  var S = EP.scenario, P = EP.no === 1 ? "" : "e" + EP.no + "_";
  var T = "[" + EP.label + "] ";
  console.log("\n===== " + EP.label + " " + S.meta.title + " =====");

  // 0) メタ情報（画面とシェアで使う）
  ok(T + "meta に title/shortTitle/hiddenLabel/nextEpisode がある", !!(S.meta.title && S.meta.shortTitle && S.meta.hiddenLabel && S.meta.nextEpisode));
  ok(T + "第三夜以降の空欄予告『　』を出さない", !/『\s*　*\s*』/.test(S.meta.nextEpisode));

  // 1) 全ノードのnext先が実在し、未知ノード型が無い
  (function () {
    var bad = [];
    Object.keys(S.nodes).forEach(function (id) {
      var n = S.nodes[id];
      if (n.id !== id) bad.push("id mismatch " + id);
      if (P && id.indexOf(P) !== 0) bad.push(id + " 接頭辞なし");
      if (n.type === "text") { if (!S.nodes[n.next]) bad.push(id + ".next missing " + n.next); if (!n.text) bad.push(id + " 本文が空"); }
      else if (n.type === "choice") { n.choices.forEach(function (c, i) { if (!S.nodes[c.next]) bad.push(id + "#" + i + ".next missing " + c.next); }); }
      else if (n.type === "branch") { n.branch.forEach(function (b, i) { if (!S.nodes[b.next]) bad.push(id + ".branch" + i + " missing " + b.next); }); if (!n.branch[n.branch.length - 1] || n.branch[n.branch.length - 1].cond) bad.push(id + " branch has no default"); }
      else if (n.type === "end") { /* ok */ }
      else bad.push(id + " unknown type " + n.type);
    });
    ok(T + "全ノードのnext先が実在・型が正当: " + (bad.length ? bad.join(" / ") : "OK"), bad.length === 0);
  })();

  // 2) start から全パスを総当たり
  var reachedEnds = {}, reachedNodes = {}, pathCount = 0, maxLen = 0;
  function walk(nodeId, flags, depth, chars) {
    if (depth > 500) throw new Error("path too deep at " + nodeId);
    var view = L.resolve(S, nodeId, flags);
    reachedNodes[view.id] = true;
    if (view.kind === "text") walk(view.next, flags, depth + 1, chars + view.text.length);
    else if (view.kind === "choice") {
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
  ok(T + "startから全パス走破（例外なし）: " + pathCount + "パス", pathCount > 0);
  ok(T + "TRUEに到達するパスがある", reachedEnds.TRUE > 0);
  ok(T + "NORMALに到達するパスがある", reachedEnds.NORMAL > 0);
  ok(T + "BADに到達するパスがある", reachedEnds.BAD > 0);
  ok(T + "HIDDENはstartから到達不能", !reachedEnds.HIDDEN);

  // 3) TRUE=気づき3のときだけ / NORMAL=気づき2以上 / 最終選択肢の数
  (function () {
    var FC = P + "act3_final_choice";
    var results = { TRUE: [], NORMAL: [], BAD: [] };
    for (var mask = 0; mask < 8; mask++) {
      var flags = { a1: !!(mask & 1), a2: !!(mask & 2), a3: !!(mask & 4) };
      var aw = L.awareness(flags);
      L.resolve(S, FC, flags).options.forEach(function (o) {
        var r = L.applyChoice(S, FC, flags, o.index);
        var v = L.resolve(S, r.next, r.flags), g = 0;
        while (v.kind === "text") { v = L.resolve(S, v.next, r.flags); if (g++ > 500) break; }
        if (v.kind === "end") results[v.end].push({ aw: aw });
      });
    }
    ok(T + "TRUE到達は気づき3のときだけ", results.TRUE.length > 0 && results.TRUE.every(function (x) { return x.aw === 3; }));
    ok(T + "NORMAL到達は気づき2以上のときだけ", results.NORMAL.length > 0 && results.NORMAL.every(function (x) { return x.aw >= 2; }));
    eq(T + "気づき3の最終選択肢数=3", L.resolve(S, FC, { a1: true, a2: true, a3: true }).options.length, 3);
    eq(T + "気づき2の最終選択肢数=2", L.resolve(S, FC, { a1: true, a2: false, a3: true }).options.length, 2);
    eq(T + "気づき1の最終選択肢数=1", L.resolve(S, FC, { a1: false, a2: false, a3: true }).options.length, 1);
    eq(T + "気づき0の最終選択肢数=1", L.resolve(S, FC, L.newFlags()).options.length, 1);
  })();

  // 4) 真相branchが気づき数で3段階に解決（どの2個の組み合わせでも half）
  (function () {
    var TB = P + "act3_truth_branch";
    eq(T + "気づき3→truth_full", L.resolve(S, TB, { a1: true, a2: true, a3: true }).id, P + "truth_full");
    [[1, 1, 0], [1, 0, 1], [0, 1, 1]].forEach(function (c) {
      eq(T + "気づき2(" + c.join("") + ")→truth_half", L.resolve(S, TB, { a1: !!c[0], a2: !!c[1], a3: !!c[2] }).id, P + "truth_half");
    });
    eq(T + "気づき1→truth_none", L.resolve(S, TB, { a1: false, a2: true, a3: false }).id, P + "truth_none");
    eq(T + "気づき0→truth_none", L.resolve(S, TB, L.newFlags()).id, P + "truth_none");
  })();

  // 5) フレーバー選択①⑤は全分岐先が同一合流先に戻り、フラグを立てない
  (function () {
    function afterChoiceMergesTo(choiceId, expectMergeId) {
      var merges = [];
      L.resolve(S, choiceId, L.newFlags()).options.forEach(function (o) {
        var r = L.applyChoice(S, choiceId, L.newFlags(), o.index);
        if (L.awareness(r.flags) !== 0) merges.push("FLAG_SET");
        var v = L.resolve(S, r.next, r.flags), g = 0;
        while (v.kind === "text" && v.next.indexOf(r.next) === 0 && g++ < 10) v = L.resolve(S, v.next, r.flags); // 分割ページ(_p2)は辿る
        merges.push(v.next);
      });
      return merges.every(function (m) { return m === expectMergeId; });
    }
    ok(T + "選択①フレーバー: 全択が after_welcome に合流・フラグ非変更", afterChoiceMergesTo(P + "act1_choice_welcome", P + "act1_after_welcome"));
    ok(T + "選択⑤フレーバー: 全択が truth_branch に合流・フラグ非変更", afterChoiceMergesTo(P + "act3_choice_pause", P + "act3_truth_branch"));
  })();

  // 6) 隠し以外の全ノードが到達可能・隠しは start から未到達（隠しの範囲は hiddenStartId から辿って決める）
  (function () {
    var hiddenIds = {}, id = S.meta.hiddenStartId, g = 0;
    while (id && S.nodes[id] && g++ < 200) { hiddenIds[id] = 1; id = S.nodes[id].next; }
    var unreached = [];
    Object.keys(S.nodes).forEach(function (nid) {
      if (hiddenIds[nid] || S.nodes[nid].type === "branch") return;
      if (!reachedNodes[nid]) unreached.push(nid);
    });
    ok(T + "隠し以外の全ノードがstartから到達可能: " + (unreached.length ? unreached.join(",") : "OK"), unreached.length === 0);
    var leaked = Object.keys(hiddenIds).filter(function (h) { return reachedNodes[h]; });
    ok(T + "隠しノードはstartから未到達", leaked.length === 0);
  })();

  // 7) 隠しエントリから HIDDEN に到達できる
  (function () {
    var v = L.resolve(S, S.meta.hiddenStartId, L.newFlags()), g = 0;
    while (v.kind === "text") { v = L.resolve(S, v.next, L.newFlags()); if (g++ > 500) break; }
    ok(T + "隠しエントリからHIDDEN到達", v.kind === "end" && v.end === "HIDDEN");
  })();

  // 7.5) letter フィールドが resolve で透過される
  (function () {
    var letters = Object.keys(S.nodes).filter(function (id) { return S.nodes[id].letter; });
    ok(T + "手紙(letter)ノードがある", letters.length > 0);
    ok(T + "letter:true が resolve で透過される", letters.every(function (id) { return L.resolve(S, id, L.newFlags()).letter === true; }));
    ok(T + "通常ノードは letter:false", L.resolve(S, S.meta.startId, L.newFlags()).letter === false);
  })();

  // 8) スキップ: 未読は停止・既読は継続・選択肢では停止
  (function () {
    var a = P + "act1_02", b = P + "act1_03", read = {}; read[a] = true;
    ok(T + "既読textへはスキップ継続", L.canSkipInto(S, a, read) === true);
    ok(T + "未読textでは停止", L.canSkipInto(S, b, read) === false);
    var cw = {}; cw[P + "act1_choice_welcome"] = true;
    ok(T + "選択肢ノードでは停止", L.canSkipInto(S, P + "act1_choice_welcome", cw) === false);
  })();

  // 9) meta: 隠し解禁・回収数・シェア文
  (function () {
    var m = L.recordEnd(L.recordEnd(L.newMeta(), "TRUE"), "NORMAL");
    ok(T + "隠し未解禁(BAD未回収)", L.isHiddenUnlocked(m) === false);
    m = L.recordEnd(m, "BAD");
    ok(T + "隠し解禁(TRUE/NORMAL/BAD回収)", L.isHiddenUnlocked(m) === true);
    eq(T + "回収数=3", L.collectedCount(m, S), 3);
    var share = L.buildShareText(m, S);
    ok(T + "シェア文に題名と★があり、結末名・答えを含まない", share.indexOf(S.meta.title) === 0 && /★/.test(share) &&
      !Object.keys(S.meta.ends).some(function (k) { return share.indexOf(S.meta.ends[k].label) >= 0 && S.meta.title.indexOf(S.meta.ends[k].label) < 0; }));
  })();

  // 11) 幕選択の再開点
  (function () {
    var cs = L.chapterStart(S, "act2");
    eq(T + "act2再開点", cs.nodeId, P + "act2_intro");
    ok(T + "再開時フラグは全false", L.awareness(cs.flags) === 0);
  })();

  // 12) 全ノードの sprite / bg ID が sprites.js に存在する
  (function () {
    var bad = [];
    Object.keys(S.nodes).forEach(function (id) {
      var n = S.nodes[id];
      if (n.sprite && !SP.faces[n.sprite]) bad.push(id + ".sprite=" + n.sprite);
      if (n.bg && !SP.bgs[n.bg]) bad.push(id + ".bg=" + n.bg);
    });
    ok(T + "全sprite/bg IDがsprites.jsに存在: " + (bad.length ? bad.join(",") : "OK"), bad.length === 0);
  })();

  // 13) 使っている表情IDに絵がある。公開中の話は必須、公開前の話は「未着」の一覧を出すだけ
  (function () {
    var missing = {};
    Object.keys(S.nodes).forEach(function (id) {
      var sp = S.nodes[id].sprite;
      if (sp && SP.faces[sp] && !SP.faces[sp].img) missing[sp] = 1;
    });
    var list = Object.keys(missing);
    if (EP.ready) ok(T + "使用中の表情IDは全てimg設定済み: " + (list.length ? list.join(",") : "OK"), list.length === 0);
    else if (list.length) warn(T + "立ち絵が未着（公開前なので失敗にはしない）: " + list.join(","));
  })();

  // 14) 1ページの長さ（文字欄の高さを決めるので、極端に長いページを作らない。目安120字）
  (function () {
    var long = Object.keys(S.nodes).filter(function (id) { var n = S.nodes[id]; return n.type === "text" && n.text.length > 125; });
    ok(T + "125字を超えるページが無い: " + (long.length ? long.join(",") : "OK"), long.length === 0);
  })();

  console.log(T + "1周(最長ルート)の最大字数（参考）: " + maxLen + " / パス数 " + pathCount);
});

// ===== セーブ migrate（話に依存しない） =====
(function () {
  var run = L.newRun(EPISODES[0].scenario);
  ok("正常runは素通し", L.migrateRun(run) === run);
  ok("未知バージョンrunはnull", L.migrateRun({ v: 99 }) === null);
  ok("壊れたrunはnull", L.migrateRun({ v: 1, nodeId: 5 }) === null);
  // 改稿で消えた・名前が変わったノードを指す中断データは捨てる（「つづきから」で止まらないように）
  EPISODES.forEach(function (e) {
    ok(e.label + ": シナリオを渡しても正常runは素通し", L.migrateRun(L.newRun(e.scenario), e.scenario) !== null);
    var gone = { v: L.RUN_V, nodeId: "no_such_node", flags: L.newFlags(), cleared: false };
    ok(e.label + ": 無いノードを指すrunはnull", L.migrateRun(gone, e.scenario) === null);
  });
  ok("未知metaは新規metaに", L.migrateMeta({ v: 99 }).v === L.META_V);
  var a = L.markRead(L.newMeta(), "x"), b = L.markRead(L.newMeta(), "y");
  var merged = L.mergeMeta(a, b);
  ok("mergeMetaで既読がunionされる", merged.read.x && merged.read.y);
})();

console.log(failed === 0 ? "\nALL PASS" + (warned ? "（WARN " + warned + "件）" : "") : "\n" + failed + " FAILED");
process.exit(failed === 0 ? 0 : 1);

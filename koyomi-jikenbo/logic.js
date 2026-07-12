"use strict";
/*
 * 宵乃こよみの事件簿 - 純関数ロジック層（グラフ解釈・フラグ・エンド判定・セーブ）
 * 設計方針(advisor 2026-07-12): engine.jsは一切フラグ値を読まない。進行の全パスはここを通る。
 * node検算: node apps/koyomi-jikenbo/test.js
 *
 * 状態の分離（重要）:
 *   run  = { v, nodeId, flags:{a1,a2,a3}, cleared }   … オートセーブ。はじめから/幕選択で上書き
 *   meta = { v, read:{id:true}, ends:{END:true}, hiddenSeen } … 既読・回収エンド。何があっても消さない
 */

var LOGIC = (function () {
  var RUN_V = 1, META_V = 1;

  // ===== フラグ =====
  function newFlags() { return { a1: false, a2: false, a3: false }; }
  function awareness(flags) { return (flags.a1 ? 1 : 0) + (flags.a2 ? 1 : 0) + (flags.a3 ? 1 : 0); }

  function condMet(cond, flags) {
    if (!cond) return true;
    if (typeof cond.awarenessGte === "number") return awareness(flags) >= cond.awarenessGte;
    return true; // 未知condは真（データ側で語彙を絞る前提）
  }

  function applySet(flags, set) {
    if (!set) return flags;
    var f = { a1: flags.a1, a2: flags.a2, a3: flags.a3 };
    if (set.a1) f.a1 = true;
    if (set.a2) f.a2 = true;
    if (set.a3) f.a3 = true;
    return f;
  }

  // ===== グラフ解釈 =====
  // ノードを解決して「表示用ビュー」を返す。branchは自動で辿り、textかchoiceかendに落ちる。
  function resolve(scenario, nodeId, flags) {
    var guard = 0;
    var id = nodeId;
    while (true) {
      if (guard++ > 100) throw new Error("branch loop or too deep at " + id);
      var node = scenario.nodes[id];
      if (!node) throw new Error("node not found: " + id);
      if (node.type === "branch") {
        var picked = null;
        for (var i = 0; i < node.branch.length; i++) {
          if (condMet(node.branch[i].cond, flags)) { picked = node.branch[i]; break; }
        }
        if (!picked) throw new Error("branch has no default: " + id);
        id = picked.next;
        continue;
      }
      if (node.type === "text") {
        return { kind: "text", id: node.id, speaker: node.speaker || "", sprite: node.sprite || null,
                 bg: node.bg || null, text: node.text, next: node.next };
      }
      if (node.type === "choice") {
        var opts = [];
        for (var j = 0; j < node.choices.length; j++) {
          var c = node.choices[j];
          if (condMet(c.cond, flags)) opts.push({ index: j, label: c.label });
        }
        return { kind: "choice", id: node.id, bg: node.bg || null, options: opts, _raw: node.choices };
      }
      if (node.type === "end") {
        return { kind: "end", id: node.id, end: node.end };
      }
      throw new Error("unknown node type at " + id);
    }
  }

  // 選択肢を適用 → 新flags と 次ノードID
  function applyChoice(scenario, nodeId, flags, choiceIndex) {
    var node = scenario.nodes[nodeId];
    if (!node || node.type !== "choice") throw new Error("not a choice node: " + nodeId);
    var c = node.choices[choiceIndex];
    if (!c) throw new Error("bad choice index " + choiceIndex + " at " + nodeId);
    if (!condMet(c.cond, flags)) throw new Error("choice not selectable: " + nodeId + "#" + choiceIndex);
    return { flags: applySet(flags, c.set), next: c.next };
  }

  // 幕頭の正規状態（幕選択の再開点。フラグは全false）
  function chapterStart(scenario, chapterKey) {
    var id = scenario.meta.chapters[chapterKey];
    if (!id) throw new Error("no such chapter: " + chapterKey);
    return { nodeId: id, flags: newFlags() };
  }

  // スキップ継続判定: 次ノードが既読なら飛ばしてよい（未読は停止）。選択肢/エンドでは必ず停止
  function canSkipInto(scenario, nextNodeId, readSet) {
    if (!nextNodeId) return false;
    // branchを辿って実体ノードを見る
    var guard = 0, id = nextNodeId;
    while (true) {
      if (guard++ > 100) return false;
      var n = scenario.nodes[id];
      if (!n) return false;
      if (n.type === "branch") { // branchは既読対象外。辿った先で判定（flags非依存にできないので停止側に倒す）
        return false;
      }
      if (n.type !== "text") return false; // choice/endでは停止
      return !!readSet[id];
    }
  }

  // ===== meta（既読・回収エンド）: 書き込みは必ず読み直してunionマージできる純関数 =====
  function newMeta() { return { v: META_V, read: {}, ends: {}, hiddenSeen: false }; }

  function markRead(meta, nodeId) {
    var m = cloneMeta(meta);
    m.read[nodeId] = true;
    return m;
  }
  function recordEnd(meta, endName) {
    var m = cloneMeta(meta);
    m.ends[endName] = true;
    return m;
  }
  function mergeMeta(a, b) {
    var m = newMeta();
    var k;
    for (k in a.read) if (a.read[k]) m.read[k] = true;
    for (k in b.read) if (b.read[k]) m.read[k] = true;
    for (k in a.ends) if (a.ends[k]) m.ends[k] = true;
    for (k in b.ends) if (b.ends[k]) m.ends[k] = true;
    m.hiddenSeen = !!(a.hiddenSeen || b.hiddenSeen);
    return m;
  }
  function cloneMeta(meta) {
    var m = { v: META_V, read: {}, ends: {}, hiddenSeen: !!meta.hiddenSeen };
    var k;
    for (k in meta.read) if (meta.read[k]) m.read[k] = true;
    for (k in meta.ends) if (meta.ends[k]) m.ends[k] = true;
    return m;
  }

  // 隠し解禁: 通常4エンドのうち TRUE/NORMAL/BAD をすべて見たら（HIDDEN以外の全回収）
  function isHiddenUnlocked(meta) {
    return !!(meta.ends.TRUE && meta.ends.NORMAL && meta.ends.BAD);
  }
  function collectedCount(meta, scenario) {
    var all = Object.keys(scenario.meta.ends);
    var n = 0;
    for (var i = 0; i < all.length; i++) if (meta.ends[all[i]]) n++;
    return n;
  }

  // シェア文（ネタバレなし・回収数のみ）
  function buildShareText(meta, scenario) {
    var all = ["TRUE", "NORMAL", "BAD", "HIDDEN"];
    var got = 0; for (var i = 0; i < all.length; i++) if (meta.ends[all[i]]) got++;
    var total = all.length;
    var stars = "";
    for (var j = 0; j < total; j++) stars += j < got ? "★" : "☆";
    return "宵乃こよみの事件簿 第一夜『十六夜の来客』をプレイ中🌙 エンド回収 " + stars + "（" + got + "/" + total + "） #宵乃こよみの事件簿";
  }

  // ===== セーブ（run）: migrate（未知バージョンはnull＝新規扱い） =====
  function newRun(scenario) {
    return { v: RUN_V, nodeId: scenario.meta.startId, flags: newFlags(), cleared: false };
  }
  function migrateRun(run) {
    if (!run || typeof run !== "object" || run.v !== RUN_V) return null;
    if (typeof run.nodeId !== "string" || !run.flags) return null;
    if (typeof run.flags.a1 !== "boolean") return null;
    return run;
  }
  function migrateMeta(meta) {
    if (!meta || typeof meta !== "object" || meta.v !== META_V) return newMeta();
    var m = newMeta();
    if (meta.read) for (var k in meta.read) if (meta.read[k]) m.read[k] = true;
    if (meta.ends) for (var e in meta.ends) if (meta.ends[e]) m.ends[e] = true;
    m.hiddenSeen = !!meta.hiddenSeen;
    return m;
  }

  return {
    RUN_V: RUN_V, META_V: META_V,
    newFlags: newFlags, awareness: awareness, condMet: condMet, applySet: applySet,
    resolve: resolve, applyChoice: applyChoice, chapterStart: chapterStart, canSkipInto: canSkipInto,
    newMeta: newMeta, markRead: markRead, recordEnd: recordEnd, mergeMeta: mergeMeta,
    isHiddenUnlocked: isHiddenUnlocked, collectedCount: collectedCount, buildShareText: buildShareText,
    newRun: newRun, migrateRun: migrateRun, migrateMeta: migrateMeta
  };
})();

if (typeof module !== "undefined") module.exports = LOGIC;

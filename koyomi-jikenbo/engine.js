"use strict";
/*
 * 宵乃こよみの事件簿 - ノベルエンジン（UI層）
 * 方針(advisor): ここは一切フラグ値を読まない。進行はすべて LOGIC.resolve / applyChoice を通す。
 * XSS対策: シナリオ本文は textContent のみ（innerHTML は要素クリア用途以外に使わない）。
 */
(function () {
  var KEY_RUN = "koyomi-jikenbo:run", KEY_META = "koyomi-jikenbo:meta";
  var $ = function (id) { return document.getElementById(id); };
  // audio.js読み込み失敗時もノベル本体を止めないためのno-opフォールバック（BGMは無くてもよい機能）
  var AUDIO = window.AUDIO || { prepare:function(){}, startOnGesture:function(){}, setVolume:function(){}, getVolume:function(){return 0.6;}, suspend:function(){}, resume:function(){} };

  // ===== 保存 =====
  function loadMeta() {
    try { var r = localStorage.getItem(KEY_META); return r ? LOGIC.migrateMeta(JSON.parse(r)) : LOGIC.newMeta(); }
    catch (e) { return LOGIC.newMeta(); }
  }
  // meta は「書き込み時に読み直して union マージ」→ 複数タブでも既読・回収が消えない
  function saveMeta(m) {
    try { var cur = loadMeta(); var merged = LOGIC.mergeMeta(cur, m); localStorage.setItem(KEY_META, JSON.stringify(merged)); return merged; }
    catch (e) { return m; }
  }
  function loadRun() {
    try { var r = localStorage.getItem(KEY_RUN); return r ? LOGIC.migrateRun(JSON.parse(r)) : null; }
    catch (e) { return null; }
  }
  function saveRun(run) { try { localStorage.setItem(KEY_RUN, JSON.stringify(run)); } catch (e) {} }
  function clearRun() { try { localStorage.removeItem(KEY_RUN); } catch (e) {} }

  // ===== 状態 =====
  var meta = loadMeta();
  var run = null;             // { v, nodeId, flags, cleared }
  var view = null;           // 現在の resolve 結果
  var typing = false, typeTimer = null, fullText = "";
  var backlog = [];          // メモリのみ・非永続
  var skipping = false;
  var inputLockUntil = 0;    // 連打ガード

  function show(screen) { ["title", "novel", "result"].forEach(function (s) { $(s).classList.toggle("active", s === screen); }); }

  // ===== タイトル =====
  function refreshTitle() {
    var saved = loadRun();
    var cont = $("btnContinue");
    if (saved && !saved.cleared) { cont.style.display = ""; }
    else { cont.style.display = "none"; }
    $("btnHidden").style.display = LOGIC.isHiddenUnlocked(meta) ? "" : "none";
  }

  // ===== 進行 =====
  function startAt(nodeId, flags) {
    run = { v: LOGIC.RUN_V, nodeId: nodeId, flags: flags || LOGIC.newFlags(), cleared: false };
    backlog = []; setSkip(false); saveRun(run); show("novel"); enter(nodeId);
  }
  function resume(saved) {
    run = saved; backlog = []; setSkip(false); show("novel"); enter(run.nodeId);
  }

  function enter(nodeId) {
    run.nodeId = nodeId; saveRun(run);
    view = LOGIC.resolve(SCENARIO, nodeId, run.flags);
    inputLockUntil = Date.now() + 250;
    if (view.kind === "text") {
      meta = saveMeta(LOGIC.markRead(meta, view.id));
      renderBg(view.bg);
      renderSprite(view);
      pushBacklog(view.speaker, view.text);
      hideChoices();
      typeText(view.text);
    } else if (view.kind === "choice") {
      renderBg(view.bg);
      renderChoices(view);
    } else if (view.kind === "end") {
      finishEnd(view.end);
    }
  }

  function goNext() {
    if (!view || view.kind !== "text") return;
    enter(view.next);
    if (skipping) trySkip();
  }

  // ===== 背景・立ち絵 =====
  var curBg = null;
  function renderBg(bg) {
    if (!bg || bg === curBg) { if (bg) curBg = bg; return; }
    curBg = bg;
    $("bg").style.background = SPRITES.bgs[bg] || "#191324";
  }
  function setSpriteEmpty(side) { var el = $("sprite-" + side); el.classList.add("empty"); el.classList.remove("dim"); el.innerHTML = ""; }
  function drawSprite(side, ch, face) {
    var el = $("sprite-" + side); el.classList.remove("empty"); el.innerHTML = "";
    if (face.img) { var img = document.createElement("img"); img.src = face.img; img.alt = ch.name; el.appendChild(img); }
    else {
      var ph = document.createElement("div"); ph.className = "ph"; ph.style.borderColor = ch.color; ph.style.color = ch.color;
      var cn = document.createElement("div"); cn.className = "cn"; cn.textContent = ch.name; ph.appendChild(cn);
      el.appendChild(ph);
    }
  }
  function renderSprite(v) {
    if (!v.sprite) { setSpriteEmpty("left"); setSpriteEmpty("right"); return; }
    var face = SPRITES.faces[v.sprite]; if (!face) { return; }
    var ch = SPRITES.chars[face.char]; var side = ch.side;
    drawSprite(side, ch, face);
    $("sprite-" + side).classList.remove("dim");
    var other = side === "left" ? "right" : "left";
    if (!$("sprite-" + other).classList.contains("empty")) $("sprite-" + other).classList.add("dim");
  }

  // ===== 文字送り =====
  function typeText(t) {
    fullText = t; typing = true;
    var el = $("text");
    el.classList.toggle("letter", !!view.letter);
    $("speaker").textContent = view.speaker || "";
    $("advance").style.display = "none";
    clearInterval(typeTimer);
    if (skipping) { el.textContent = t; typing = false; return; }
    el.textContent = ""; var i = 0;
    typeTimer = setInterval(function () {
      i++; el.textContent = t.slice(0, i);
      if (i >= t.length) { clearInterval(typeTimer); typing = false; $("advance").style.display = "block"; }
    }, 20);
  }
  function completeType() { clearInterval(typeTimer); $("text").textContent = fullText; typing = false; $("advance").style.display = "block"; }

  function onAdvance() {
    if (Date.now() < inputLockUntil) return;
    if ($("backlog").classList.contains("show")) return;
    if (!view || view.kind !== "text") return;
    if (typing) { completeType(); return; }
    goNext();
  }

  // ===== 選択肢 =====
  function renderChoices(v) {
    setSkip(false);
    var box = $("choices"); box.innerHTML = "";
    $("speaker").textContent = ""; $("text").textContent = ""; $("advance").style.display = "none";
    v.options.forEach(function (o) {
      var b = document.createElement("button");
      // 末尾の「（踏み込む）」等のタグは途中で折り返さず、収まらない時は丸ごと次の行へ落とす
      var m = /^(.*?)(（[^（）]+）)$/.exec(o.label);
      if (m) {
        b.appendChild(document.createTextNode(m[1]));
        var tag = document.createElement("span"); tag.className = "ctag"; tag.textContent = m[2];
        b.appendChild(tag);
      } else {
        b.textContent = o.label;
      }
      b.addEventListener("click", function () {
        if (Date.now() < inputLockUntil) return;
        var r = LOGIC.applyChoice(SCENARIO, v.id, run.flags, o.index);
        run.flags = r.flags; saveRun(run);
        hideChoices();
        enter(r.next);
      });
      box.appendChild(b);
    });
    box.classList.add("show");
  }
  function hideChoices() { $("choices").classList.remove("show"); }

  // ===== スキップ =====
  function setSkip(on) { skipping = on; $("btnSkip").classList.toggle("on", on); }
  function trySkip() {
    var guard = 0;
    while (skipping && view && view.kind === "text") {
      if (guard++ > 3000) break;
      if (LOGIC.canSkipInto(SCENARIO, view.next, meta.read)) { enter(view.next); }
      else { setSkip(false); break; }
    }
  }

  // ===== バックログ =====
  function pushBacklog(sp, t) { if (!t) return; backlog.push({ speaker: sp, text: t }); if (backlog.length > 100) backlog.shift(); }
  function openLog() {
    var body = $("backlogBody"); body.innerHTML = "";
    backlog.forEach(function (r) {
      var d = document.createElement("div"); d.className = "row";
      if (r.speaker) { var s = document.createElement("div"); s.className = "sp"; s.textContent = r.speaker; d.appendChild(s); }
      var t = document.createElement("div"); t.textContent = r.text; d.appendChild(t);
      body.appendChild(d);
    });
    $("backlog").classList.add("show");
  }

  // ===== エンド・リザルト =====
  function finishEnd(endName) {
    run.cleared = true; saveRun(run);
    var upd = LOGIC.recordEnd(meta, endName);
    if (endName === "HIDDEN") upd.hiddenSeen = true;
    meta = saveMeta(upd);
    showResult(endName);
  }
  function showResult(endName) {
    var em = SCENARIO.meta.ends[endName];
    $("resEndName").textContent = endName === "HIDDEN" ? "隠しの結末" : "結末";
    $("resEndTitle").textContent = "『" + em.label + "』";
    $("resAware").textContent = endName === "HIDDEN" ? "—" : (LOGIC.awareness(run.flags) + " / 3");
    var total = Object.keys(SCENARIO.meta.ends).length; // ハードコードせずシナリオ定義から
    var got = LOGIC.collectedCount(meta, SCENARIO), stars = "";
    for (var i = 0; i < total; i++) stars += i < got ? "★" : "☆";
    $("resCollect").textContent = stars;
    $("resCollectLabel").textContent = "結末 " + got + " / " + total + " 回収";
    if (endName === "HIDDEN") {
      $("resForetell").textContent = "——最後まで見届けてくれて、ありがとうございました。";
    } else if (LOGIC.isHiddenUnlocked(meta) && !meta.ends.HIDDEN) {
      $("resForetell").textContent = "——すべての結末を見たあなたへ。タイトルに「こよみの独白」が灯りました。";
    } else {
      $("resForetell").textContent = "まだ見ぬ結末が、この夜には隠れています。選び方で、こよみの見えるものが変わります。";
    }
    // 第二夜予告は全エンドで常時表示（クリア＝関係終了にしない）
    $("resNext").textContent = SCENARIO.meta.nextEpisode;
    show("result");
  }

  // ===== 入力 =====
  $("novel").addEventListener("click", function (e) {
    if (e.target.closest("#menu") || e.target.closest("#choices") || e.target.closest("#backlog")) return;
    onAdvance();
  });
  document.addEventListener("keydown", function (e) {
    if (!$("novel").classList.contains("active")) return;
    if (e.key === " " || e.key === "Enter") { e.preventDefault(); onAdvance(); }
  });

  // タイトル
  $("btnNew").addEventListener("click", function () { AUDIO.startOnGesture(); startAt(SCENARIO.meta.startId); });
  $("btnContinue").addEventListener("click", function () { AUDIO.startOnGesture(); var s = loadRun(); if (s && !s.cleared) resume(s); });
  $("btnChapter").addEventListener("click", function () { AUDIO.startOnGesture(); var cs = LOGIC.chapterStart(SCENARIO, "act2"); startAt(cs.nodeId, cs.flags); });
  $("btnHidden").addEventListener("click", function () { AUDIO.startOnGesture(); startAt(SCENARIO.meta.hiddenStartId); });

  // メニュー
  $("btnLog").addEventListener("click", openLog);
  $("btnLogClose").addEventListener("click", function () { $("backlog").classList.remove("show"); });
  $("btnSkip").addEventListener("click", function () {
    if (skipping) { setSkip(false); return; }
    setSkip(true);
    if (view && view.kind === "text" && !typing) trySkip();
    else if (view && view.kind === "text" && typing) { completeType(); trySkip(); }
  });
  $("btnBackTitle").addEventListener("click", function () { clearInterval(typeTimer); setSkip(false); refreshTitle(); show("title"); });

  // リザルト
  $("btnShare").addEventListener("click", function () {
    var text = LOGIC.buildShareText(meta, SCENARIO) + " https://rinne-blog.com/koyomi-jikenbo";
    window.open("https://twitter.com/intent/tweet?text=" + encodeURIComponent(text), "_blank", "noopener,noreferrer");
  });
  $("btnReplay").addEventListener("click", function () { var cs = LOGIC.chapterStart(SCENARIO, "act2"); startAt(cs.nodeId, cs.flags); });
  $("btnToTitle").addEventListener("click", function () { refreshTitle(); show("title"); });

  // 複数タブ: 復帰時にmetaを読み直す（既読・回収の最新化）
  window.addEventListener("focus", function () { meta = loadMeta(); });
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden) { meta = loadMeta(); AUDIO.resume(); }
    else { AUDIO.suspend(); }
  });

  // 音量スライダー（全画面共通・タイトルの操作を待たずフェッチだけ先行開始）
  var volSlider = $("volSlider");
  volSlider.value = Math.round(AUDIO.getVolume() * 100);
  volSlider.addEventListener("input", function () { AUDIO.setVolume(volSlider.value / 100); });
  AUDIO.prepare();

  // 起動
  refreshTitle();
  show("title");
})();

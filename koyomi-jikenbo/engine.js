"use strict";
/*
 * 宵乃こよみの事件簿 - ノベルエンジン（UI層）
 * 方針(advisor): ここは一切フラグ値を読まない。進行はすべて LOGIC.resolve / applyChoice を通す。
 * XSS対策: シナリオ本文は textContent のみ（innerHTML は要素クリア用途以外に使わない）。
 *
 * 2026-10-12 第二夜の追加で複数話に対応:
 *  - 話は episodes.js の EPISODES。保存（run/meta）は話ごとのキー。第一夜のキーは公開時のまま
 *  - タイトルで夜を選ぶ（夜が2つ以上見えるときだけ選択欄を出す）。?ep=2 で第二夜を選んだ状態で開く
 *  - 文字欄は「その話の全ページで一番長いページ」に合わせた固定の高さ。立ち絵は文字欄の上に置き、文字が体に重ならない
 */
(function () {
  var KEY_LAST = "koyomi-jikenbo:lastEp";
  var $ = function (id) { return document.getElementById(id); };
  // audio.js読み込み失敗時もノベル本体を止めないためのno-opフォールバック（BGMは無くてもよい機能）
  var AUDIO = window.AUDIO || { prepare:function(){}, startOnGesture:function(){}, setVolume:function(){}, getVolume:function(){return 0.6;}, suspend:function(){}, resume:function(){} };

  // ===== 話の選択 =====
  var params = {};
  try { location.search.replace(/^\?/, "").split("&").forEach(function (kv) { var p = kv.split("="); if (p[0]) params[p[0]] = decodeURIComponent(p[1] || ""); }); } catch (e) {}
  var PREVIEW = params.preview === "1";
  var visibleEps = EPISODES.filter(function (e) { return e.ready || PREVIEW; });
  function findEp(key) { for (var i = 0; i < visibleEps.length; i++) if (visibleEps[i].key === key) return visibleEps[i]; return null; }
  function initialEp() {
    if (params.ep) { var byUrl = findEp("ep" + params.ep); if (byUrl) return byUrl; }
    try { var last = findEp(localStorage.getItem(KEY_LAST)); if (last) return last; } catch (e) {}
    return visibleEps[0];
  }
  var ep = initialEp();
  function nextEpOf(e) { var i = EPISODES.indexOf(e); return i >= 0 && i + 1 < EPISODES.length ? EPISODES[i + 1] : null; }

  // ===== 保存（話ごと） =====
  function loadMetaOf(e) {
    try { var r = localStorage.getItem(e.keys.meta); return r ? LOGIC.migrateMeta(JSON.parse(r)) : LOGIC.newMeta(); }
    catch (err) { return LOGIC.newMeta(); }
  }
  function loadMeta() { return loadMetaOf(ep); }
  // meta は「書き込み時に読み直して union マージ」→ 複数タブでも既読・回収が消えない
  function saveMeta(m) {
    try { var cur = loadMeta(); var merged = LOGIC.mergeMeta(cur, m); localStorage.setItem(ep.keys.meta, JSON.stringify(merged)); return merged; }
    catch (e) { return m; }
  }
  function loadRun() {
    try { var r = localStorage.getItem(ep.keys.run); return r ? LOGIC.migrateRun(JSON.parse(r)) : null; }
    catch (e) { return null; }
  }
  function saveRun(run) { try { localStorage.setItem(ep.keys.run, JSON.stringify(run)); } catch (e) {} }
  function saveLast() { try { localStorage.setItem(KEY_LAST, ep.key); } catch (e) {} }

  // ===== 状態 =====
  var meta = loadMeta();
  var run = null;             // { v, nodeId, flags, cleared }
  var view = null;           // 現在の resolve 結果
  var typing = false, typeTimer = null, fullText = "";
  var backlog = [];          // メモリのみ・非永続
  var skipping = false;
  var inputLockUntil = 0;    // 連打ガード
  function S() { return ep.scenario; }

  function show(screen) { ["title", "novel", "result"].forEach(function (s) { $(s).classList.toggle("active", s === screen); }); }

  // ===== タイトル =====
  function buildEpTabs() {
    var box = $("epTabs");
    box.innerHTML = "";
    if (visibleEps.length < 2) { box.style.display = "none"; return; }
    box.style.display = "";
    visibleEps.forEach(function (e) {
      var b = document.createElement("button");
      b.type = "button"; b.textContent = e.label; b.setAttribute("data-ep", e.key);
      b.addEventListener("click", function () { if (ep !== e) { ep = e; meta = loadMeta(); refreshTitle(); } });
      box.appendChild(b);
    });
  }
  function refreshTitle() {
    $("titleEp").textContent = S().meta.shortTitle;
    Array.prototype.forEach.call($("epTabs").children, function (b) {
      var on = b.getAttribute("data-ep") === ep.key;
      b.classList.toggle("on", on); b.setAttribute("aria-pressed", on ? "true" : "false");
    });
    // 第一夜をまだ遊んでいない人が第二夜を選んだら、添え書きで第一夜をすすめる（高さは変えない）
    var first = visibleEps[0], firstMeta = loadMetaOf(first);
    var playedFirst = Object.keys(firstMeta.ends).length > 0 || Object.keys(firstMeta.read).length > 0;
    $("titleCredit").textContent = (ep !== first && !playedFirst) ? "— 第一夜から読むのがおすすめです —" : "— 夜に暦を読む、占い師の物語 —";
    var saved = loadRun();
    $("btnContinue").style.display = (saved && !saved.cleared) ? "" : "none";
    $("btnHidden").textContent = S().meta.hiddenLabel;
    $("btnHidden").style.display = LOGIC.isHiddenUnlocked(meta) ? "" : "none";
  }

  // ===== 文字欄の高さ（話ごとに、全ページで一番長いページに合わせて1回だけ決める） =====
  var fitKey = "";
  function fitTextbox(force) {
    var tb = $("textbox"), m = $("textMeasure");
    var key = ep.key + ":" + tb.clientWidth + ":" + window.innerHeight;
    if (!force && key === fitKey) return;
    fitKey = key;
    var cap = Math.floor($("app").clientHeight * 0.5); // どんなに長くても画面の半分まで
    function measure() {
      var nodes = S().nodes, maxH = 0;
      Object.keys(nodes).forEach(function (id) {
        var n = nodes[id];
        if (n.type !== "text") return;
        m.textContent = n.text;
        if (window.__jpPhrase && window.__jpPhrase.apply) window.__jpPhrase.apply(m);
        var hh = m.getBoundingClientRect().height; // 小数まで（offsetHeight の丸めで最大0.4px足りなくなる）
        if (hh > maxH) maxH = hh;
      });
      m.textContent = "";
      var cs = getComputedStyle(tb);
      return Math.ceil(maxH + parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom)) + 1;
    }
    // 上限を超える小さな画面（横向きのスマホ等）だけ、文字を一段小さくして測り直す。
    // それでも超えるページは欄の中でスクロールし、文字送りが下へ追いかける（typeText）
    $("app").classList.remove("tb-compact");
    var h = measure();
    if (h > cap) { $("app").classList.add("tb-compact"); h = measure(); }
    $("app").style.setProperty("--tbh", Math.min(h, cap) + "px");
  }
  var resizeTimer = null;
  window.addEventListener("resize", function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () { if ($("novel").classList.contains("active")) fitTextbox(); }, 150);
  });

  // ===== 進行 =====
  function resetStage() {
    curBg = null; setSpriteEmpty("left"); setSpriteEmpty("right");
    backlog = []; setSkip(false); clearInterval(typeTimer); typing = false;
    $("backlog").classList.remove("show"); hideChoices();
  }
  function preloadFaces() {
    var seen = {}, nodes = S().nodes;
    function pre(src) { if (src && !seen[src]) { seen[src] = 1; var im = new Image(); im.src = src; } }
    Object.keys(nodes).forEach(function (id) {
      var f = nodes[id].sprite && SPRITES.faces[nodes[id].sprite];
      if (f) pre(f.img);
      var b = nodes[id].bg && SPRITES.bgs[nodes[id].bg];
      if (b && typeof b === "object") pre(b.img); // 背景も先に取りに行く（場面転換で一瞬グラデーションが見えないように）
    });
  }
  function enterNovel() { saveLast(); resetStage(); show("novel"); fitTextbox(true); preloadFaces(); }
  function startAt(nodeId, flags) {
    run = { v: LOGIC.RUN_V, nodeId: nodeId, flags: flags || LOGIC.newFlags(), cleared: false };
    saveRun(run); enterNovel(); enter(nodeId);
  }
  function resume(saved) {
    run = saved; enterNovel(); enter(run.nodeId);
  }

  function enter(nodeId) {
    run.nodeId = nodeId; saveRun(run);
    view = LOGIC.resolve(S(), nodeId, run.flags);
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
  function bgCss(id) {
    var b = SPRITES.bgs[id];
    if (!b) return "#191324";
    if (typeof b === "string") return b;
    var layers = [];
    if (b.img) {
      if (b.shade) layers.push("linear-gradient(rgba(8,8,16," + b.shade + "),rgba(8,8,16," + b.shade + "))");
      layers.push('url("' + b.img + '") ' + (b.pos || "50% 40%") + ' / cover no-repeat');
    }
    layers.push(b.css || "#191324");
    return layers.join(", ");
  }
  function renderBg(bg) {
    if (!bg || bg === curBg) return;
    curBg = bg;
    var el = $("bg");
    el.style.background = bgCss(bg);
    el.classList.remove("swap"); void el.offsetWidth; el.classList.add("swap"); // 場面転換のフェード
  }
  function setSpriteEmpty(side) { var el = $("sprite-" + side); el.classList.add("empty"); el.classList.remove("dim"); el.innerHTML = ""; el.removeAttribute("data-char"); }
  function makePlaceholder(ch) {
    var ph = document.createElement("div"); ph.className = "ph"; ph.style.borderColor = ch.color; ph.style.color = ch.color;
    var cn = document.createElement("div"); cn.className = "cn"; cn.textContent = ch.name; ph.appendChild(cn);
    return ph;
  }
  function drawSprite(side, chKey, ch, face) {
    var el = $("sprite-" + side);
    var entering = el.getAttribute("data-char") !== chKey; // 人物が替わった時だけふわっと出す（表情替えでは揺らさない）
    el.classList.remove("empty"); el.innerHTML = ""; el.setAttribute("data-char", chKey);
    if (face.img) {
      var img = document.createElement("img"); img.alt = ch.name;
      // 画像が読めない時（配置漏れ・通信切れ）は壊れた画像の印でなく名前入りの枠に。すでに次の立ち絵に替わっていれば何もしない
      img.onerror = function () { if (img.parentNode === el) el.replaceChild(makePlaceholder(ch), img); };
      img.src = face.img; el.appendChild(img);
    }
    else el.appendChild(makePlaceholder(ch));
    if (entering) { el.classList.remove("enter"); void el.offsetWidth; el.classList.add("enter"); }
  }
  function renderSprite(v) {
    if (!v.sprite) { setSpriteEmpty("left"); setSpriteEmpty("right"); return; }
    var face = SPRITES.faces[v.sprite]; if (!face) { return; }
    var ch = SPRITES.chars[face.char]; var side = ch.side;
    drawSprite(side, face.char, ch, face);
    $("sprite-" + side).classList.remove("dim");
    var other = side === "left" ? "right" : "left";
    if (!$("sprite-" + other).classList.contains("empty")) $("sprite-" + other).classList.add("dim");
  }

  // ===== 文字送り =====
  function typeText(t) {
    fullText = t; typing = true;
    var el = $("text");
    $("textbox").classList.toggle("letter", !!view.letter);
    $("speaker").textContent = view.speaker || "";
    $("advance").style.display = "none";
    el.scrollTop = 0; // スクロールするのは #text（欄に収まらない小さな画面だけ）
    clearInterval(typeTimer);
    if (skipping) { el.textContent = t; typing = false; return; }
    // 2026-09-29: 全文を先に文節で区切って並べ、1文字ずつ見せる（途中で行の折れ方が変わって言葉が跳ねないように）
    el.textContent = t;
    if (window.__jpPhrase && window.__jpPhrase.apply) window.__jpPhrase.apply(el);
    var chars = [], tw = document.createTreeWalker(el, 4), n, nodes = [];
    while ((n = tw.nextNode())) nodes.push(n);
    nodes.forEach(function (tn) {
      var f = document.createDocumentFragment();
      for (var k = 0; k < tn.nodeValue.length; k++) {
        var s = document.createElement("span"); s.className = "tc"; s.textContent = tn.nodeValue[k];
        f.appendChild(s); chars.push(s);
      }
      tn.parentNode.replaceChild(f, tn);
    });
    var i = 0;
    var overflow = el.scrollHeight > el.clientHeight + 1; // 欄に収まらないときだけ、出した文字へ追いかけてスクロール
    typeTimer = setInterval(function () {
      if (i < chars.length) {
        chars[i].className = "";
        if (overflow) {
          var r = chars[i].getBoundingClientRect(), b = el.getBoundingClientRect();
          if (r.bottom > b.bottom) el.scrollTop += Math.ceil(r.bottom - b.bottom);
        }
      }
      i++;
      if (i >= chars.length) { clearInterval(typeTimer); typing = false; $("advance").style.display = "block"; }
    }, 20);
  }
  // 途中で押したら残りを一度に見せる（並べ直さないので、行の折れ方は文字送り中と同じまま）
  function completeType() {
    clearInterval(typeTimer);
    Array.prototype.forEach.call($("text").querySelectorAll(".tc"), function (s) { s.className = ""; });
    typing = false; $("advance").style.display = "block";
  }

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
    $("textbox").classList.remove("letter");
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
        var r = LOGIC.applyChoice(S(), v.id, run.flags, o.index);
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
      if (LOGIC.canSkipInto(S(), view.next, meta.read)) { enter(view.next); }
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
    var sc = S(), em = sc.meta.ends[endName];
    $("resEndName").textContent = (endName === "HIDDEN" ? "隠しの結末" : "結末") + "　" + ep.label;
    $("resEndTitle").textContent = "『" + em.label + "』";
    $("resAware").textContent = endName === "HIDDEN" ? "—" : (LOGIC.awareness(run.flags) + " / 3");
    var total = Object.keys(sc.meta.ends).length; // ハードコードせずシナリオ定義から
    var got = LOGIC.collectedCount(meta, sc), stars = "";
    for (var i = 0; i < total; i++) stars += i < got ? "★" : "☆";
    $("resCollect").textContent = stars;
    $("resCollectLabel").textContent = "結末 " + got + " / " + total + " 回収";
    if (endName === "HIDDEN") {
      $("resForetell").textContent = "——最後まで見届けてくれて、ありがとうございました。";
    } else if (LOGIC.isHiddenUnlocked(meta) && !meta.ends.HIDDEN) {
      $("resForetell").textContent = "——すべての結末を見たあなたへ。タイトルに「" + sc.meta.hiddenLabel.replace(/（隠し）$/, "") + "」が灯りました。";
    } else {
      $("resForetell").textContent = "まだ見ぬ結末が、この夜には隠れています。選び方で、こよみの見えるものが変わります。";
    }
    // 次の夜の予告は全エンドで常時表示（クリア＝関係終了にしない）。次の夜が公開済みなら、そのまま読めるボタンも出す
    var nx = nextEpOf(ep), nxOpen = nx && (nx.ready || PREVIEW);
    $("resNext").textContent = sc.meta.nextEpisode;
    $("btnNextEp").style.display = nxOpen ? "" : "none";
    if (nxOpen) $("btnNextEp").textContent = nx.label + "を読む";
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
  $("btnNew").addEventListener("click", function () { AUDIO.startOnGesture(); startAt(S().meta.startId); });
  $("btnContinue").addEventListener("click", function () { AUDIO.startOnGesture(); var s = loadRun(); if (s && !s.cleared) resume(s); });
  $("btnChapter").addEventListener("click", function () { AUDIO.startOnGesture(); var cs = LOGIC.chapterStart(S(), "act2"); startAt(cs.nodeId, cs.flags); });
  $("btnHidden").addEventListener("click", function () { AUDIO.startOnGesture(); startAt(S().meta.hiddenStartId); });

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
    var text = LOGIC.buildShareText(meta, S()) + " https://rinne-blog.com/koyomi-jikenbo";
    window.open("https://twitter.com/intent/tweet?text=" + encodeURIComponent(text), "_blank", "noopener,noreferrer");
  });
  $("btnNextEp").addEventListener("click", function () {
    var nx = nextEpOf(ep); if (!nx || !(nx.ready || PREVIEW)) return;
    ep = nx; meta = loadMeta(); saveLast(); refreshTitle(); show("title");
  });
  $("btnReplay").addEventListener("click", function () { var cs = LOGIC.chapterStart(S(), "act2"); startAt(cs.nodeId, cs.flags); });
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
  buildEpTabs();
  refreshTitle();
  show("title");
})();

// 謎の名言メーカー(Web版) メインロジック
"use strict";

const els = {
  input: document.getElementById("subjectInput"),
  genBtn: document.getElementById("genBtn"),
  result: document.getElementById("result"),
  cardWrap: document.getElementById("cardWrap"),
  saveBtn: document.getElementById("saveBtn"),
  shareBtn: document.getElementById("shareBtn"),
  shareStatus: document.getElementById("shareStatus"),
  shareFallback: document.getElementById("shareFallback"),
  shareX: document.getElementById("share-x"),
  shareThreads: document.getElementById("share-threads"),
  shareLine: document.getElementById("share-line"),
  shareIg: document.getElementById("share-ig"),
};

const SHARE_URL = "https://gryo1240.github.io/rinne-apps/meigen-maker/";
function shareCaption() {
  return "謎の名言メーカーで生成した格言です🌙\n#謎の名言メーカー";
}
function openShare(url) { window.open(url, "_blank", "noopener"); }
function copyText(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text);
  return new Promise((resolve, reject) => {
    const ta = document.createElement("textarea");
    ta.value = text; document.body.appendChild(ta); ta.select();
    try { document.execCommand("copy") ? resolve() : reject(new Error("copy失敗")); }
    catch (err) { reject(err); }
    finally { ta.remove(); }
  });
}

let cardBlob = null;

// dataURL→Blob変換(同期)。canvas.toBlob()は非同期でクリックのユーザー操作から
// 時間が空いてしまい、navigator.share()がNotAllowedErrorになる環境があるため使わない
function dataUrlToBlob(dataUrl) {
  const [header, base64] = dataUrl.split(",");
  const mime = (header.match(/:(.*?);/) || [, "image/png"])[1];
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

function setShareStatus(text) {
  els.shareStatus.textContent = text;
  els.shareStatus.hidden = !text;
}

function handleGenerate() {
  const result = window.MeigenGenerator.generateQuote(els.input.value);
  renderResult(result);
}
els.genBtn.addEventListener("click", handleGenerate);
els.input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.repeat) handleGenerate();   // 押しっぱなしで連続生成しない（1枚の色紙を描くのが重いため）
});

function renderResult(result) {
  els.result.hidden = false;
  drawCardCanvas(result);
  els.result.scrollIntoView({ behavior: "smooth", block: "start" });
}

/* ===== 2026-09-27 刷新:「書の色紙と落款」 =====
   カードは縦書きの色紙（4:5・1080×1350）。見せ場は1つ: 結果が出たとき、左下に落款（朱の印）を押す動き。
   ★縦書きは canvas に機能がないので1字ずつ置く。並べ方の計算（layoutCard）は描画と分けてテストから呼べるようにしてある
   ★ここでは Math.random を使わない（紙の繊維・印のかすれは文面から作る乱数）。生成結果の乱数の並びを変えないため */
const CARD_W = 1080, CARD_H = 1350;
const CARD_FONT = '"Hiragino Mincho ProN", "Yu Mincho", "YuMincho", "Noto Serif CJK JP", "Noto Serif JP", serif';
const INK = "#231d16", GOLD = "#b8974f", SHU = "#b5382a", PAPER = "#f6f0e3";
// 縦書きで90度回すもの（長音・ダッシュ・波ダッシュ・三点リーダ・括弧類）と、右上に寄せるもの
const V_ROTATE = /[ー―‐－〜～…‥「」『』（）()【】〔〕［］｛｝〈〉《》—–\-=＝:：]/;
const V_PUNCT = /[、。，．]/;
const V_SMALL = /[ぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮヵヶ]/;
const V_HANG = /[、。，．」』）]/;   // 列の下にぶら下げてよい字（1字だけ）

// 半角の英数字・記号は縦に並べるため全角にする（表示だけ。生成結果の文字列は変えない）
function toVertical(s) {
  return String(s)
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(^|[^\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "$1")   // 20字目で半分に切れた絵文字の片割れは描かない
    .replace(/[!-~]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0xFEE0)).replace(/ /g, "　");
}
function splitPhrases(s) {
  const p = window.__jpPhrase && window.__jpPhrase.parse;
  try { if (p) return p(s); } catch (e) { /* 区切れないときは1字ずつ */ }
  return Array.from(s);
}
// 見た目の1文字（❤️・家族の絵文字・国旗などの組み合わせも1文字）の単位に分ける
function graphemes(s) {
  try {
    if (window.Intl && Intl.Segmenter) return Array.from(new Intl.Segmenter("ja", { granularity: "grapheme" }).segment(s), (x) => x.segment);
  } catch (e) { /* 使えない環境は下へ */ }
  return Array.from(s);
}
// 文節ごとに、見た目の1文字の配列にする（文節の境目が1文字の途中に来たら、その境目は使わない）
function phraseUnits(text) {
  const ends = new Set();
  let pos = 0;
  for (const t of splitPhrases(text)) { pos += t.length; ends.add(pos); }
  const out = [];
  let cur = [], off = 0;
  for (const g of graphemes(text)) {
    cur.push(g); off += g.length;
    if (ends.has(off)) { out.push(cur); cur = []; }
  }
  if (cur.length) out.push(cur);
  return out;
}
// 文字列を1列 cap 字までの列に分ける。文節の途中では折らない（1文節が1列より長いときだけ字で折る）
function columnize(text, cap) {
  const cols = [];
  let cur = [];
  for (const t of phraseUnits(text)) {
    if (cur.length + t.length <= cap) { cur.push(...t); continue; }
    if (cur.length && cur.length + t.length === cap + 1 && V_HANG.test(t[t.length - 1])) {
      cur.push(...t); cols.push(cur); cur = []; continue;    // 句読点のぶら下げ
    }
    if (cur.length) { cols.push(cur); cur = []; }
    while (t.length > cap) cols.push(t.splice(0, cap));
    cur = t;
  }
  if (cur.length) cols.push(cur);
  return cols;
}

// 並べ方の計算（描画しない）。すべての字の中心座標・大きさを返す
function layoutCard(result) {
  const quote = toVertical(result.quote);
  const theme = toVertical(`テーマ「${result.subject}」`);
  const closer = toVertical(result.closer);
  const TOP = 170, BOTTOM = CARD_H - 150, SIDE = 96;
  const SEAL = 132;
  let F = 66, q, c, t, need;
  for (; F >= 34; F -= 2) {
    const qp = F * 1.08, cap = Math.floor((BOTTOM - TOP) / qp);
    const f2 = Math.round(F * 0.5), cp = f2 * 1.1;
    const capC = Math.floor((BOTTOM - SEAL - 30 - TOP) / cp);
    const f3 = Math.round(F * 0.46), capT = Math.floor((BOTTOM - TOP) / (f3 * 1.1));
    q = { f: F, pitch: qp, cols: columnize(quote, cap), step: F * 1.62 };
    c = { f: f2, pitch: cp, cols: columnize(closer, capC), step: f2 * 1.7 };
    t = { f: f3, pitch: f3 * 1.1, cols: columnize(theme, capT), step: f3 * 1.7 };
    need = t.cols.length * t.step + 40 + q.cols.length * q.step + 30 + Math.max(c.cols.length * c.step, SEAL);
    if (need <= CARD_W - SIDE * 2) break;
  }
  const chars = [];
  function place(block, xRight, yTop, color, alignBottom) {
    block.cols.forEach((col, i) => {
      const x = xRight - block.step * i - block.step / 2;
      const y0 = alignBottom ? alignBottom - col.length * block.pitch : yTop;
      col.forEach((ch, j) => chars.push({ ch, x, y: y0 + block.pitch * (j + 0.5), f: block.f, color }));
    });
    return xRight - block.step * block.cols.length;
  }
  // 全体を左右中央に置く（右から: テーマ → 格言 → 賢者名と落款）
  let x = CARD_W / 2 + need / 2;
  x = place(t, x, TOP, "#8a7a5f") - 40;
  x = place(q, x, TOP, INK) - 30;
  const signW = Math.max(c.cols.length * c.step, SEAL);
  const signRight = x - (signW - c.cols.length * c.step) / 2;
  place(c, signRight, TOP, "#5a4632", BOTTOM - SEAL - 30);
  const seal = { x: x - signW / 2 - SEAL / 2, y: BOTTOM - SEAL, size: SEAL, chars: Array.from(result.sage).slice(0, 2) };
  return { fontSize: F, chars, seal, cols: { quote: q.cols, closer: c.cols, theme: t.cols } };
}
window.MeigenLayout = { layoutCard, columnize, toVertical, graphemes };

// 文面から作る乱数（Math.random の並びを消費しない）
function seededRand(str) {
  let h = 2166136261;
  for (const ch of str) h = Math.imul(h ^ ch.codePointAt(0), 16777619) >>> 0;
  return () => { h = (Math.imul(h, 1103515245) + 12345) >>> 0; return (h >>> 8) / 16777216; };
}

function drawPaper(ctx, rand) {
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, CARD_W, CARD_H);
  // 和紙の繊維（ごく薄く）
  ctx.lineCap = "round";
  for (let i = 0; i < 520; i++) {
    const x = rand() * CARD_W, y = rand() * CARD_H, a = rand() * Math.PI, l = 6 + rand() * 22;
    ctx.strokeStyle = `rgba(120,96,60,${0.035 + rand() * 0.05})`;
    ctx.lineWidth = 0.6 + rand() * 0.9;
    ctx.beginPath(); ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + Math.cos(a) * l * 0.5 + (rand() - 0.5) * 6, y + Math.sin(a) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l);
    ctx.stroke();
  }
  // 色紙の金の縁（細い1本）
  ctx.strokeStyle = GOLD; ctx.lineWidth = 10;
  ctx.strokeRect(5, 5, CARD_W - 10, CARD_H - 10);
  ctx.strokeStyle = "rgba(90,70,30,.18)"; ctx.lineWidth = 1.5;
  ctx.strokeRect(11, 11, CARD_W - 22, CARD_H - 22);
}

function drawChars(ctx, chars) {
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  for (const c of chars) {
    ctx.font = `${c.f}px ${CARD_FONT}`;
    ctx.fillStyle = c.color;
    if (V_ROTATE.test(c.ch)) {
      ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(Math.PI / 2); ctx.fillText(c.ch, 0, 0); ctx.restore();
    } else if (V_PUNCT.test(c.ch)) {
      ctx.fillText(c.ch, c.x + c.f * 0.62, c.y - c.f * 0.58);
    } else if (V_SMALL.test(c.ch)) {
      ctx.fillText(c.ch, c.x + c.f * 0.1, c.y - c.f * 0.1);
    } else {
      ctx.fillText(c.ch, c.x, c.y);
    }
  }
}

// 落款: 朱の四角に賢者名の2字を白く抜く（白文印）。縁は少し欠け、面にかすれを入れる
function drawSeal(ctx, s, rand) {
  const { x, y, size } = s;
  ctx.save();
  ctx.fillStyle = SHU;
  ctx.beginPath();
  const pts = [], n = 7;
  for (let i = 0; i < n; i++) pts.push([x + size * i / n, y + (rand() - 0.5) * 3]);
  for (let i = 0; i < n; i++) pts.push([x + size + (rand() - 0.5) * 3, y + size * i / n]);
  for (let i = 0; i < n; i++) pts.push([x + size - size * i / n, y + size + (rand() - 0.5) * 3]);
  for (let i = 0; i < n; i++) pts.push([x + (rand() - 0.5) * 3, y + size - size * i / n]);
  pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = PAPER;
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.font = `bold ${Math.round(size * 0.4)}px ${CARD_FONT}`;
  s.chars.forEach((ch, i) => ctx.fillText(ch, x + size / 2, y + size * (i === 0 ? 0.29 : 0.71)));
  // かすれ（朱の面に紙の色の小さな点）
  for (let i = 0; i < 70; i++) {
    ctx.globalAlpha = 0.25 + rand() * 0.5;
    ctx.beginPath(); ctx.arc(x + rand() * size, y + rand() * size, 0.6 + rand() * 1.6, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

let cardCanvasEl = null;
let stampTimer = 0;

function drawCardCanvas(result) {
  if (!cardCanvasEl) cardCanvasEl = document.createElement("canvas");
  cardCanvasEl.width = CARD_W;
  cardCanvasEl.height = CARD_H;
  const ctx = cardCanvasEl.getContext("2d");
  const L = layoutCard(result);

  drawPaper(ctx, seededRand(result.quote + result.closer));
  drawChars(ctx, L.chars);
  ctx.fillStyle = "#b3a17f"; ctx.font = `22px ${CARD_FONT}`; ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
  ctx.fillText("謎の名言メーカー", CARD_W / 2, CARD_H - 52);
  const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const beforeSeal = reduce ? "" : cardCanvasEl.toDataURL("image/png");   // 印を押す動きのときだけ、印のない版が要る
  drawSeal(ctx, L.seal, seededRand(result.sage));

  const dataUrl = cardCanvasEl.toDataURL("image/png");
  cardBlob = dataUrlToBlob(dataUrl);
  setShareStatus("");
  els.shareFallback.hidden = true;
  els.cardWrap.innerHTML = "";
  clearTimeout(stampTimer);
  const previewImg = document.createElement("img");
  previewImg.alt = "生成された名言の色紙";
  previewImg.className = "card-preview";
  els.cardWrap.appendChild(previewImg);

  if (reduce) { previewImg.src = dataUrl; return; }
  // 見せ場: 印のない色紙を出し、同じ位置に落款を押す。押し終わったら印の入った画像に差し替えて重ね絵を消す
  previewImg.src = beforeSeal;
  const st = document.createElement("canvas");
  const pad = 8, sz = L.seal.size + pad * 2;
  st.width = sz; st.height = sz;
  drawSeal(st.getContext("2d"), { x: pad, y: pad, size: L.seal.size, chars: L.seal.chars }, seededRand(result.sage));
  st.className = "stamp";
  st.setAttribute("aria-hidden", "true");
  st.style.left = ((L.seal.x - pad) / CARD_W * 100) + "%";
  st.style.top = ((L.seal.y - pad) / CARD_H * 100) + "%";
  st.style.width = (sz / CARD_W * 100) + "%";
  els.cardWrap.appendChild(st);
  st.addEventListener("animationend", () => {
    previewImg.addEventListener("load", () => st.remove(), { once: true });
    previewImg.src = dataUrl;
  }, { once: true });
  // 動きが止められた環境の保険
  stampTimer = setTimeout(() => { if (st.isConnected) { previewImg.src = dataUrl; st.remove(); } }, 2500);
}

els.saveBtn.addEventListener("click", () => {
  if (!cardCanvasEl) return;
  const a = document.createElement("a");
  a.href = cardCanvasEl.toDataURL("image/png");
  a.download = "meigen.png";
  a.click();
});

function downloadCard() {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(cardBlob);
  a.download = "meigen.png";
  a.click();
}

// 共有シートが使えない/失敗した環境向けのフォールバック:
// 画像を保存し、文章もクリップボードにコピーした上で、SNS別ボタンから
// 投稿画面(URLスキーム/Web Intent)を開く。画像そのものをJSから直接
// Xやインスタの投稿画面へ添付する手段はWeb上にないため、
// 「保存した画像を貼り付けるだけで済む」状態まで用意するのが現実的な着地点
function showShareFallback(reasonMsg) {
  downloadCard();
  copyText(shareCaption()).catch(() => {});
  setShareStatus(reasonMsg);
  els.shareFallback.hidden = false;
}

els.shareBtn.addEventListener("click", async () => {
  if (!cardBlob) return;
  els.shareFallback.hidden = true;
  // File化はクリックハンドラ内で同期的に行う(canvas.toBlob()の非同期コールバック内で
  // navigator.share()を呼ぶと、環境によってはユーザー操作の有効期限が切れてNotAllowedErrorになるため)
  const file = new File([cardBlob], "meigen.png", { type: "image/png" });
  const shareText = "謎の名言メーカーで生成した格言です🌙";
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: "謎の名言メーカー", text: shareText });
      setShareStatus("");
    } catch (e) {
      if (e && e.name === "AbortError") {
        setShareStatus("");
        return;
      }
      showShareFallback(`この端末では共有シートを使えなかった(${e && e.name ? e.name : "エラー"})ため、画像を保存し文章もコピーしました。下のボタンでSNSを開いて、保存した画像を貼り付けてください`);
    }
    return;
  }
  showShareFallback("この端末・ブラウザは画像共有シートに対応していないため、画像を保存し文章もコピーしました。下のボタンでSNSを開いて、保存した画像を貼り付けてください");
});

els.shareX.addEventListener("click", () => {
  copyText(shareCaption()).catch(() => {});
  openShare("https://twitter.com/intent/tweet?text=" + encodeURIComponent(shareCaption()) +
    "&url=" + encodeURIComponent(SHARE_URL));
});
els.shareThreads.addEventListener("click", () => {
  copyText(shareCaption()).catch(() => {});
  openShare("https://www.threads.net/intent/post?text=" + encodeURIComponent(shareCaption() + "\n" + SHARE_URL));
});
els.shareLine.addEventListener("click", () => {
  copyText(shareCaption()).catch(() => {});
  openShare("https://social-plugins.line.me/lineit/share?url=" + encodeURIComponent(SHARE_URL) +
    "&text=" + encodeURIComponent(shareCaption()));
});
els.shareIg.addEventListener("click", () => {
  copyText(shareCaption() + "\n" + SHARE_URL).catch(() => {});
  openShare("https://www.instagram.com/");
});

// ---------- PWA ----------
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}

// 存在しない占星術(Web版) UIロジック
"use strict";

const els = {
  form: document.getElementById("inputForm"),
  year: document.getElementById("birthYear"),
  month: document.getElementById("birthMonth"),
  day: document.getElementById("birthDay"),
  name: document.getElementById("birthName"),
  genBtn: document.getElementById("genBtn"),
  introScreen: document.getElementById("introScreen"),
  resultScreen: document.getElementById("resultScreen"),
  cardWrap: document.getElementById("cardWrap"),
  todayMsg: document.getElementById("todayMsg"),
  againBtn: document.getElementById("againBtn"),
  saveBtn: document.getElementById("saveBtn"),
  shareBtn: document.getElementById("shareBtn"),
  shareStatus: document.getElementById("shareStatus"),
  shareFallback: document.getElementById("shareFallback"),
  shareX: document.getElementById("share-x"),
  shareThreads: document.getElementById("share-threads"),
  shareLine: document.getElementById("share-line"),
  shareIg: document.getElementById("share-ig"),
};

const SHARE_URL = "https://gryo1240.github.io/rinne-apps/maboroshi-seiza/";

function jstToday() {
  const now = new Date();
  const jst = new Date(now.getTime() + (9 * 60 - now.getTimezoneOffset()) * 60000);
  return `${jst.getFullYear()}-${String(jst.getMonth() + 1).padStart(2, "0")}-${String(jst.getDate()).padStart(2, "0")}`;
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

function wrapText(ctx, text, maxWidth) {
  const lines = [];
  let cur = "";
  for (const ch of text) {
    const test = cur + ch;
    if (ctx.measureText(test).width > maxWidth && cur !== "") {
      lines.push(cur);
      cur = ch;
    } else {
      cur = test;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

let cardCanvasEl = null;
let cardBlob = null;
let lastResult = null;

function drawCardCanvas(result) {
  if (!cardCanvasEl) cardCanvasEl = document.createElement("canvas");
  const W = 720, H = 1000;
  cardCanvasEl.width = W;
  cardCanvasEl.height = H;
  const ctx = cardCanvasEl.getContext("2d");

  // 夜空の背景
  const grad = ctx.createRadialGradient(W * 0.7, H * 0.05, 40, W * 0.5, H * 0.4, 700);
  grad.addColorStop(0, "#232c4d");
  grad.addColorStop(1, "#0c0f1d");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // 細かい星の粒(装飾・固定配置なので毎回同じ)
  ctx.fillStyle = "rgba(255,255,255,.5)";
  const deco = [
    [40, 40], [90, 90], [660, 60], [610, 130], [50, 780], [670, 800],
    [30, 500], [690, 460], [120, 30], [560, 850],
  ];
  for (const [dx, dy] of deco) {
    ctx.beginPath();
    ctx.arc(dx, dy, 1.6, 0, Math.PI * 2);
    ctx.fill();
  }

  // 星図エリア(上部)
  const chartTop = 40, chartH = 300;
  const pts = result.stars.map((s) => ({
    x: 60 + s.x * (W - 120),
    y: chartTop + s.y * chartH,
    r: s.r,
  }));
  ctx.strokeStyle = "rgba(217,185,106,.55)";
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.stroke();
  for (const p of pts) {
    ctx.fillStyle = "#f0dca8";
    ctx.shadowColor = "rgba(240,220,168,.8)";
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  let y = chartTop + chartH + 70;
  ctx.textAlign = "center";
  ctx.fillStyle = "#f0dca8";
  ctx.font = "bold 60px serif";
  ctx.fillText(result.starName, W / 2, y);
  y += 60;

  ctx.font = "25.5px sans-serif";
  ctx.fillStyle = "#9aa3bf";
  ctx.fillText("あなただけの架空の星座", W / 2, y);
  y += 72;

  ctx.textAlign = "left";
  ctx.font = "24px sans-serif";
  ctx.fillStyle = "#d9b96a";
  ctx.fillText("守護天体", 60, y);
  ctx.fillStyle = "#e8e4d8";
  ctx.font = "30px serif";
  ctx.fillText(result.guardian, 225, y);
  y += 72;

  ctx.font = "25.5px sans-serif";
  ctx.fillStyle = "#e8e4d8";
  const lines = wrapText(ctx, result.temper, W - 120);
  for (const line of lines) {
    ctx.fillText(line, 60, y);
    y += 42;
  }
  y += 30;

  ctx.fillStyle = "#d9b96a";
  ctx.font = "25.5px sans-serif";
  ctx.fillText(`ラッキーカラー: ${result.color}`, 60, y);
  y += 42;
  ctx.fillText(`ラッキーアイテム: ${result.item}`, 60, y);
  y += 42;
  ctx.fillText(`ラッキーな刻: ${result.luckyTime}`, 60, y);
  y += 42;
  ctx.fillText(`ラッキー方角: ${result.luckyDirection}`, 60, y);

  ctx.textAlign = "center";
  ctx.fillStyle = "#6b7390";
  ctx.font = "19.5px sans-serif";
  ctx.fillText("存在しない占星術 〜 宵乃こよみ 〜", W / 2, H - 40);

  const dataUrl = cardCanvasEl.toDataURL("image/png");
  cardBlob = dataUrlToBlob(dataUrl);
  setShareStatus("");
  els.shareFallback.hidden = true;
  els.cardWrap.innerHTML = "";
  const previewImg = document.createElement("img");
  previewImg.src = dataUrl;
  previewImg.alt = `${result.starName}の鑑定結果カード`;
  previewImg.className = "card-preview";
  els.cardWrap.appendChild(previewImg);
}

function showResult(result) {
  lastResult = result;
  els.introScreen.hidden = true;
  els.resultScreen.hidden = false;
  els.todayMsg.textContent = SeizaGenerator.todayMessage(jstToday());
  drawCardCanvas(result);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

const CURRENT_YEAR = new Date().getFullYear();
els.year.setAttribute("max", String(CURRENT_YEAR));

function isRealDate(y, m, d) {
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

els.form.addEventListener("submit", (e) => {
  e.preventDefault();
  const y = parseInt(els.year.value, 10);
  const m = parseInt(els.month.value, 10);
  const d = parseInt(els.day.value, 10);
  if (!y || !m || !d || y < 1900 || y > CURRENT_YEAR || m < 1 || m > 12 || d < 1 || d > 31 || !isRealDate(y, m, d)) {
    alert("生年月日を正しく入力してください");
    return;
  }
  const result = SeizaGenerator.generate(y, m, d, els.name.value);
  showResult(result);
});

els.againBtn.addEventListener("click", () => {
  els.resultScreen.hidden = true;
  els.introScreen.hidden = false;
  window.scrollTo({ top: 0, behavior: "smooth" });
});

els.saveBtn.addEventListener("click", () => {
  if (!cardCanvasEl) return;
  const a = document.createElement("a");
  a.href = cardCanvasEl.toDataURL("image/png");
  a.download = "maboroshi-seiza.png";
  a.click();
});

function downloadCard() {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(cardBlob);
  a.download = "maboroshi-seiza.png";
  a.click();
}
function shareCaption() {
  return lastResult
    ? `私の架空星座は「${lastResult.starName}」でした🌙 #存在しない占星術`
    : "存在しない占星術で、あなただけの架空の星座を占ってみました🌙 #存在しない占星術";
}
function showShareFallback(reasonMsg) {
  downloadCard();
  copyText(shareCaption()).catch(() => {});
  setShareStatus(reasonMsg);
  els.shareFallback.hidden = false;
}

els.shareBtn.addEventListener("click", async () => {
  if (!cardBlob) return;
  els.shareFallback.hidden = true;
  const file = new File([cardBlob], "maboroshi-seiza.png", { type: "image/png" });
  const shareText = shareCaption();
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: "存在しない占星術", text: shareText });
      setShareStatus("");
    } catch (e) {
      if (e && e.name === "AbortError") { setShareStatus(""); return; }
      showShareFallback(`この端末では共有シートを使えなかった(${e && e.name ? e.name : "エラー"})ため、画像を保存し文章もコピーしました。下のボタンでSNSを開いて、保存した画像を貼り付けてください`);
    }
    return;
  }
  showShareFallback("この端末・ブラウザは画像共有シートに対応していないため、画像を保存し文章もコピーしました。下のボタンでSNSを開いて、保存した画像を貼り付けてください");
});

els.shareX.addEventListener("click", () => {
  copyText(shareCaption()).catch(() => {});
  openShare("https://twitter.com/intent/tweet?text=" + encodeURIComponent(shareCaption()) + "&url=" + encodeURIComponent(SHARE_URL));
});
els.shareThreads.addEventListener("click", () => {
  copyText(shareCaption()).catch(() => {});
  openShare("https://www.threads.net/intent/post?text=" + encodeURIComponent(shareCaption() + "\n" + SHARE_URL));
});
els.shareLine.addEventListener("click", () => {
  copyText(shareCaption()).catch(() => {});
  openShare("https://social-plugins.line.me/lineit/share?url=" + encodeURIComponent(SHARE_URL) + "&text=" + encodeURIComponent(shareCaption()));
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

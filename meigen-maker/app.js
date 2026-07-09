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
};

// 印(判子)に使う一文字。generator.jsのSAGE_FIRSTと同じ字の一部から流用
const SEAL_CHARS = ["風", "月", "雲", "静", "無", "空", "夢", "灯", "境", "刻"];

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
  if (e.key === "Enter") handleGenerate();
});

function renderResult(result) {
  els.result.hidden = false;
  drawCardCanvas(result);
  els.result.scrollIntoView({ behavior: "smooth", block: "start" });
}

function wrapText(ctx, text, maxWidth) {
  const lines = [];
  for (const rawLine of text.split("\n")) {
    if (rawLine === "") { lines.push(""); continue; }
    let cur = "";
    for (const ch of rawLine) {
      const test = cur + ch;
      if (ctx.measureText(test).width > maxWidth && cur !== "") {
        lines.push(cur);
        cur = ch;
      } else {
        cur = test;
      }
    }
    lines.push(cur);
  }
  return lines;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

let cardCanvasEl = null;

function drawCardCanvas(result) {
  if (!cardCanvasEl) {
    cardCanvasEl = document.createElement("canvas");
  }
  const W = 720;
  const pad = 44;

  const measure = document.createElement("canvas").getContext("2d");
  measure.font = "30px serif";
  const quoteLines = wrapText(measure, result.quote, W - pad * 2);
  const H = 200 + quoteLines.length * 46 + 120;

  cardCanvasEl.width = W;
  cardCanvasEl.height = H;
  const ctx = cardCanvasEl.getContext("2d");

  // 和紙風の背景
  ctx.fillStyle = "#f7f0e3";
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "#7a3b2e";
  ctx.lineWidth = 4;
  ctx.strokeRect(20, 20, W - 40, H - 40);
  ctx.strokeStyle = "#c9b48a";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(28, 28, W - 56, H - 56);

  let y = 88;
  // お題ラベル
  ctx.fillStyle = "#a3937a";
  ctx.font = "20px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(`テーマ「${result.subject}」`, W / 2, y);
  y += 56;

  // 格言本文
  ctx.fillStyle = "#2b241c";
  ctx.font = "30px serif";
  ctx.textAlign = "left";
  for (const line of quoteLines) {
    ctx.fillText(line, pad, y);
    y += 46;
  }
  y += 20;

  // 出典
  ctx.fillStyle = "#7a3b2e";
  ctx.font = "22px serif";
  ctx.textAlign = "right";
  ctx.fillText(result.closer, W - pad, y);
  y += 30;

  // 印(判子)
  const sealR = 34;
  const sealX = W - pad - sealR;
  const sealY = y + sealR + 4;
  ctx.fillStyle = "#a83b2e";
  ctx.beginPath();
  ctx.arc(sealX, sealY, sealR, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#fdf6ea";
  ctx.font = "bold 30px serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const sealChar = SEAL_CHARS[result.subject.length % SEAL_CHARS.length];
  ctx.fillText(sealChar, sealX, sealY + 2);
  ctx.textBaseline = "alphabetic";

  ctx.fillStyle = "#c2ac86";
  ctx.font = "14px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("謎の名言メーカー", W / 2, H - 34);

  const dataUrl = cardCanvasEl.toDataURL("image/png");
  cardBlob = dataUrlToBlob(dataUrl);
  setShareStatus("");
  els.cardWrap.innerHTML = "";
  const previewImg = document.createElement("img");
  previewImg.src = dataUrl;
  previewImg.alt = "生成された名言カード";
  previewImg.className = "card-preview";
  els.cardWrap.appendChild(previewImg);
}

els.saveBtn.addEventListener("click", () => {
  if (!cardCanvasEl) return;
  const a = document.createElement("a");
  a.href = cardCanvasEl.toDataURL("image/png");
  a.download = "meigen.png";
  a.click();
});

els.shareBtn.addEventListener("click", async () => {
  if (!cardBlob) return;
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
      setShareStatus(`共有に失敗したため画像を保存しました(${e && e.name ? e.name : "エラー"})。X等のアプリ内で開いている場合は、Safari/Chromeで直接開くと共有できることがあります`);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(cardBlob);
      a.download = "meigen.png";
      a.click();
    }
    return;
  }
  setShareStatus("この端末・ブラウザは画像共有シートに対応していないため、画像を保存しました。SNSアプリ内ブラウザで開いている場合は、Safari/Chromeで直接開くと共有できることがあります");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(cardBlob);
  a.download = "meigen.png";
  a.click();
});

// ---------- PWA ----------
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}

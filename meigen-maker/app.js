// 謎の名言メーカー(Web版) メインロジック
"use strict";

const els = {
  input: document.getElementById("subjectInput"),
  genBtn: document.getElementById("genBtn"),
  result: document.getElementById("result"),
  cardWrap: document.getElementById("cardWrap"),
  saveBtn: document.getElementById("saveBtn"),
  shareBtn: document.getElementById("shareBtn"),
};

// 印(判子)に使う一文字。generator.jsのSAGE_FIRSTと同じ字の一部から流用
const SEAL_CHARS = ["風", "月", "雲", "静", "無", "空", "夢", "灯", "境", "刻"];

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
  if (!cardCanvasEl) return;
  cardCanvasEl.toBlob(async (blob) => {
    if (!blob) return;
    const file = new File([blob], "meigen.png", { type: "image/png" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: "謎の名言メーカー" });
      } catch (e) {
        // ユーザーが共有シートをキャンセルした場合は何もしない(意図した操作のためダウンロードに逃がさない)
        if (e && e.name !== "AbortError") {
          const a = document.createElement("a");
          a.href = URL.createObjectURL(blob);
          a.download = "meigen.png";
          a.click();
        }
      }
      return;
    }
    // Web Share API(ファイル)未対応の環境のみダウンロードにフォールバック
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "meigen.png";
    a.click();
  }, "image/png");
});

// ---------- PWA ----------
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}

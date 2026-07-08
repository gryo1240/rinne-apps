// 激辛レビュー生成器(Web版) メインロジック
// generator.js: レビュー文の生成 / labels-ja.js: 画像分類ラベル→日本語 / imagenet-classes.js: ラベル一覧
// TensorFlow.js + MobileNet(vendor/に同梱・外部通信なし)は画像モードを開いた時だけ遅延ロードする。
"use strict";

const els = {
  input: document.getElementById("nounInput"),
  genBtn: document.getElementById("genBtn"),
  imgBtn: document.getElementById("imgBtn"),
  imgInput: document.getElementById("imgInput"),
  imgStatus: document.getElementById("imgStatus"),
  result: document.getElementById("result"),
  cardWrap: document.getElementById("cardWrap"),
  saveBtn: document.getElementById("saveBtn"),
  shareBtn: document.getElementById("shareBtn"),
};

let modelPromise = null;
let lastImageEl = null;

// ---------- テキストからの生成 ----------
function handleGenerate() {
  const result = window.GekikaraGenerator.generateReview(els.input.value);
  renderResult(result, lastImageEl);
}
els.genBtn.addEventListener("click", handleGenerate);
els.input.addEventListener("keydown", (e) => {
  if (e.key === "Enter") handleGenerate();
});

// ---------- 画像アップロード ----------
els.imgBtn.addEventListener("click", () => els.imgInput.click());

els.imgInput.addEventListener("change", async () => {
  const file = els.imgInput.files && els.imgInput.files[0];
  if (!file) return;
  setImgStatus("画像を読み込んでいます…");

  // 読み込み・認識が成功するまではlastImageElを一切更新しない
  // (途中で失敗した画像がテキストモードの結果に紛れ込むのを防ぐ)
  let imgEl;
  try {
    imgEl = await loadImageFile(file);
  } catch (err) {
    console.error(err);
    setImgStatus("画像の読み込みに失敗しました。別の画像でお試しください。");
    els.imgInput.value = "";
    return;
  }

  try {
    if (location.protocol === "file:") {
      throw new Error("file://では画像認識モデルを読み込めません(ブラウザのセキュリティ制限)。ローカルサーバー経由、または公開後のページでお試しください。");
    }
    setImgStatus("認識モデルを準備しています(初回のみ数秒かかります)…");
    const model = await getModel();
    setImgStatus("画像を確認しています…");
    const { label, probability } = await classify(model, imgEl);
    const noun = window.GekikaraLabels.toJapaneseNoun(label, probability);
    els.input.value = noun;
    setImgStatus(`認識結果: 「${noun}」としてレビューします`);
    revokeLastImageUrl();
    lastImageEl = imgEl;
    const result = window.GekikaraGenerator.generateReview(noun);
    renderResult(result, imgEl);
  } catch (err) {
    console.error(err);
    if (imgEl.src && imgEl.src.startsWith("blob:")) URL.revokeObjectURL(imgEl.src);
    setImgStatus(
      location.protocol === "file:"
        ? "file://で直接開いているため画像認識が動作しません。ローカルサーバー経由か公開後のページでお試しください(テキスト入力は使えます)。"
        : "画像の認識に失敗しました。テキスト入力でお試しください。"
    );
  } finally {
    els.imgInput.value = "";
  }
});

function setImgStatus(text) {
  els.imgStatus.textContent = text;
}

function loadImageFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("image load failed"));
    };
    img.src = url;
  });
}

// 画像を差し替えるたびに前回のBlob URLを解放する(メモリリーク防止)
function revokeLastImageUrl() {
  if (lastImageEl && lastImageEl.src && lastImageEl.src.startsWith("blob:")) {
    URL.revokeObjectURL(lastImageEl.src);
  }
}

// tf.min.js / mobilenetモデルは画像モードを初めて使う時だけ読み込む(初期表示を軽くするため)
function loadScriptOnce(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[data-src="${src}"]`)) return resolve();
    const s = document.createElement("script");
    s.src = src;
    s.dataset.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`failed to load ${src}`));
    document.head.appendChild(s);
  });
}

async function getModel() {
  if (!modelPromise) {
    modelPromise = (async () => {
      await loadScriptOnce("./vendor/tf.min.js");
      return window.tf.loadLayersModel("./vendor/mobilenet/model.json");
    })();
  }
  return modelPromise;
}

async function classify(model, imgEl) {
  const result = window.tf.tidy(() => {
    let img = window.tf.browser.fromPixels(imgEl).toFloat();
    img = window.tf.image.resizeBilinear(img, [224, 224]);
    img = img.div(127.5).sub(1); // [-1, 1]に正規化(このモデルの学習時と同じ前処理)
    const batched = img.expandDims(0);
    return model.predict(batched);
  });
  const data = await result.data();
  result.dispose();

  let bestIdx = 0;
  let best = -Infinity;
  for (let i = 0; i < data.length; i++) {
    if (data[i] > best) {
      best = data[i];
      bestIdx = i;
    }
  }
  const label = window.IMAGENET_CLASSES[bestIdx] || "unknown";
  return { label, probability: best };
}

// ---------- 結果表示 ----------
function renderResult(result, imageEl) {
  els.result.hidden = false;
  document.getElementById("cardNoun").textContent = `「${result.noun}」より`;
  document.getElementById("cardChili").textContent = "🌶".repeat(result.chili);
  document.getElementById("cardText").textContent = result.text;
  document.getElementById("cardScore").textContent = `${result.score} / 100`;

  const thumbWrap = document.getElementById("cardThumbWrap");
  const thumb = document.getElementById("cardThumb");
  if (imageEl) {
    thumb.src = imageEl.src;
    thumbWrap.hidden = false;
  } else {
    thumbWrap.hidden = true;
  }

  drawCardCanvas(result, imageEl);
  els.result.scrollIntoView({ behavior: "smooth", block: "start" });
}

// ---------- カード画像の生成(Canvas。保存/共有用) ----------
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

let cardCanvasEl = null;

function drawCardCanvas(result, imageEl) {
  if (!cardCanvasEl) {
    cardCanvasEl = document.createElement("canvas");
  }
  const W = 720;
  const hasImg = !!imageEl;
  const imgBoxH = hasImg ? 260 : 0;
  const pad = 36;

  // 先に本文の行数を仮測定して高さを決める
  const measure = document.createElement("canvas").getContext("2d");
  measure.font = "26px sans-serif";
  const bodyLines = wrapText(measure, result.text, W - pad * 2);
  const H = 210 + imgBoxH + bodyLines.length * 34 + 170;

  cardCanvasEl.width = W;
  cardCanvasEl.height = H;
  const ctx = cardCanvasEl.getContext("2d");

  // 背景
  ctx.fillStyle = "#fff8f2";
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "#d94f2b";
  ctx.lineWidth = 5;
  roundRect(ctx, 8, 8, W - 16, H - 16, 22);
  ctx.stroke();

  let y = 50;
  // バッジ
  ctx.fillStyle = "#d94f2b";
  roundRect(ctx, W / 2 - 90, y - 26, 180, 40, 20);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.font = "bold 20px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("激辛レビュー", W / 2, y + 1);
  y += 54;

  // 画像サムネ
  if (hasImg) {
    const boxW = 220, boxH = 220;
    const bx = W / 2 - boxW / 2, by = y;
    ctx.save();
    roundRect(ctx, bx, by, boxW, boxH, 14);
    ctx.clip();
    drawImageCover(ctx, imageEl, bx, by, boxW, boxH);
    ctx.restore();
    ctx.strokeStyle = "#eccabd";
    ctx.lineWidth = 3;
    roundRect(ctx, bx, by, boxW, boxH, 14);
    ctx.stroke();
    y += boxH + 20;
  }

  // 対象名
  ctx.fillStyle = "#8a3a1f";
  ctx.font = "bold 24px sans-serif";
  ctx.fillText(`「${result.noun}」より`, W / 2, y);
  y += 40;

  // 辛さ
  ctx.font = "32px sans-serif";
  ctx.fillText("🌶".repeat(result.chili), W / 2, y);
  y += 46;

  // 本文
  ctx.fillStyle = "#3a2418";
  ctx.font = "26px sans-serif";
  ctx.textAlign = "left";
  for (const line of bodyLines) {
    ctx.fillText(line, pad, y);
    y += 34;
  }
  y += 14;

  // スコア
  ctx.textAlign = "center";
  ctx.fillStyle = "#8a3a1f";
  ctx.font = "20px sans-serif";
  ctx.fillText("辛口スコア", W / 2 - 60, y);
  ctx.fillStyle = "#d94f2b";
  ctx.font = "bold 30px sans-serif";
  ctx.fillText(`${result.score} / 100`, W / 2 + 50, y + 2);
  y += 40;

  ctx.fillStyle = "#a3877a";
  ctx.font = "16px sans-serif";
  ctx.fillText("※全部ネタです。誇張ジョークとしてお楽しみください", W / 2, y);
  y += 24;
  ctx.fillStyle = "#c9b8ae";
  ctx.font = "14px sans-serif";
  ctx.fillText("激辛レビュー生成器", W / 2, y);

  const dataUrl = cardCanvasEl.toDataURL("image/png");
  els.cardWrap.innerHTML = "";
  const previewImg = document.createElement("img");
  previewImg.src = dataUrl;
  previewImg.alt = "レビュー結果カード";
  previewImg.className = "card-preview";
  els.cardWrap.appendChild(previewImg);
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

function drawImageCover(ctx, img, x, y, w, h) {
  const ir = img.naturalWidth / img.naturalHeight;
  const br = w / h;
  let sx, sy, sw, sh;
  if (ir > br) {
    sh = img.naturalHeight;
    sw = sh * br;
    sx = (img.naturalWidth - sw) / 2;
    sy = 0;
  } else {
    sw = img.naturalWidth;
    sh = sw / br;
    sx = 0;
    sy = (img.naturalHeight - sh) / 2;
  }
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

els.saveBtn.addEventListener("click", () => {
  if (!cardCanvasEl) return;
  const a = document.createElement("a");
  a.href = cardCanvasEl.toDataURL("image/png");
  a.download = "gekikara-review.png";
  a.click();
});

els.shareBtn.addEventListener("click", async () => {
  if (!cardCanvasEl) return;
  cardCanvasEl.toBlob(async (blob) => {
    if (!blob) return;
    const file = new File([blob], "gekikara-review.png", { type: "image/png" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: "激辛レビュー生成器" });
        return;
      } catch (e) { /* キャンセル等は無視 */ }
    }
    // 共有APIが使えない場合はダウンロードにフォールバック
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "gekikara-review.png";
    a.click();
  }, "image/png");
});

// ---------- PWA ----------
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}

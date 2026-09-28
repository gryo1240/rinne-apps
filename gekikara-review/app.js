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
  shareStatus: document.getElementById("shareStatus"),
  shareFallback: document.getElementById("shareFallback"),
  shareX: document.getElementById("share-x"),
  shareThreads: document.getElementById("share-threads"),
  shareLine: document.getElementById("share-line"),
  shareIg: document.getElementById("share-ig"),
};

const SHARE_URL = "https://gryo1240.github.io/rinne-apps/gekikara-review/";
function shareCaption() {
  return "激辛レビュー生成器で審査してもらいました🌶\n#激辛レビュー生成器";
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

let modelPromise = null;
let lastImageEl = null;

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

// ---------- テキストからの生成 ----------
function handleGenerate() {
  if (!els.input.value.trim()) {
    setImgStatus("文字を入力してください");
    return;
  }
  setImgStatus("");
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
      // 行頭に句読点・閉じかっこを置かない（前の行にぶら下げる。2026-09-29 刷新）
      // ぶら下げは1文字まで（今の行が幅に収まっているときだけ。連続した「ーーー」「！！！」で右へはみ出さない）
      const hang = "、。，．」』）)！？!?ー…".includes(ch) && ctx.measureText(cur).width <= maxWidth;
      if (ctx.measureText(test).width > maxWidth && cur !== "" && !hang) {
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
let cardBlob = null;

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

  // 背景（2026-09-29 刷新: 激辛スナックの袋の警告ラベル。白地・墨の太枠・上端に黒と黄の縞。配置と高さは改修前のまま）
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.beginPath(); ctx.rect(11, 11, W - 22, 12); ctx.clip();
  for (let sx = -20; sx < W; sx += 24) {
    ctx.fillStyle = "#FFD21F"; ctx.fillRect(sx, 11, 24, 12);
    ctx.fillStyle = "#141414"; ctx.beginPath(); ctx.moveTo(sx, 23); ctx.lineTo(sx + 12, 11); ctx.lineTo(sx + 24, 11); ctx.lineTo(sx + 12, 23); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
  ctx.strokeStyle = "#141414";
  ctx.lineWidth = 6;
  roundRect(ctx, 8, 8, W - 16, H - 16, 6);
  ctx.stroke();

  let y = 50;
  // バッジ
  ctx.fillStyle = "#141414";
  roundRect(ctx, W / 2 - 90, y - 26, 180, 40, 4);
  ctx.fill();
  ctx.fillStyle = "#FFD21F";
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
    ctx.strokeStyle = "#141414";
    ctx.lineWidth = 3;
    roundRect(ctx, bx, by, boxW, boxH, 14);
    ctx.stroke();
    y += boxH + 44; // 2026-09-29: 対象名が画像の下端に重なっていたので下げる
  }

  // 対象名
  ctx.fillStyle = "#141414";
  // 長い対象名はカードの幅に収まるまで文字を小さくする（改修前は右へ切れていた）
  const nounText = `「${result.noun}」より`;
  let nounSize = 24;
  ctx.font = `bold ${nounSize}px sans-serif`;
  while (ctx.measureText(nounText).width > W - pad * 2 && nounSize > 14) { nounSize--; ctx.font = `bold ${nounSize}px sans-serif`; }
  ctx.fillText(nounText, W / 2, y);
  y += 44;

  // 辛さ
  // 辛さ: 絵文字の代わりに、唐辛子の枠を5つ描いて辛さの数だけ赤く塗る
  for (let k = 0; k < 5; k++) drawPepper(ctx, W / 2 + (k - 2) * 44, y - 11, 34, k < result.chili);
  y += 52;

  // 本文
  ctx.fillStyle = "#1a1a1a";
  ctx.font = "26px sans-serif";
  ctx.textAlign = "left";
  for (const line of bodyLines) {
    ctx.fillText(line, pad, y);
    y += 34;
  }
  y += 24;

  // スコア（2026-09-29: ラベルと数字が重なっていたので、中央の左右に寄せて並べる）
  ctx.textAlign = "right";
  ctx.fillStyle = "#141414";
  ctx.font = "20px sans-serif";
  ctx.fillText("辛口スコア", W / 2 - 10, y);
  ctx.textAlign = "left";
  ctx.fillStyle = "#D21F1B";
  ctx.font = "bold 30px sans-serif";
  ctx.fillText(`${result.score} / 100`, W / 2 + 2, y + 2);
  ctx.textAlign = "center";
  y += 40;

  ctx.fillStyle = "#5a5a5a";
  ctx.font = "16px sans-serif";
  ctx.fillText("※全部ネタです。誇張ジョークとしてお楽しみください", W / 2, y);
  y += 24;
  ctx.fillStyle = "#6a6a6a";
  ctx.font = "14px sans-serif";
  ctx.fillText("激辛レビュー生成器", W / 2, y);

  const dataUrl = cardCanvasEl.toDataURL("image/png");
  cardBlob = dataUrlToBlob(dataUrl);
  setShareStatus("");
  els.shareFallback.hidden = true;
  els.cardWrap.innerHTML = "";
  const previewImg = document.createElement("img");
  previewImg.src = dataUrl;
  previewImg.alt = "レビュー結果カード";
  previewImg.className = "card-preview";
  els.cardWrap.appendChild(previewImg);
}

// 唐辛子の枠（2026-09-29 刷新）。filled=true なら赤く塗る。中心 (cx, cy)・大きさ s
function drawPepper(ctx, cx, cy, s, filled) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-0.5);
  ctx.beginPath();
  ctx.moveTo(-s * 0.08, -s * 0.34);
  ctx.bezierCurveTo(s * 0.26, -s * 0.36, s * 0.24, s * 0.1, s * 0.06, s * 0.5);
  ctx.bezierCurveTo(-s * 0.02, s * 0.2, -s * 0.24, -s * 0.06, -s * 0.08, -s * 0.34);
  ctx.closePath();
  ctx.fillStyle = filled ? "#D21F1B" : "#ffffff";
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = filled ? "#141414" : "#8a8a8a";
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(s * 0.02, -s * 0.34);
  ctx.quadraticCurveTo(s * 0.02, -s * 0.5, -s * 0.12, -s * 0.52);
  ctx.lineWidth = 3;
  ctx.strokeStyle = filled ? "#2E7D32" : "#8a8a8a";
  ctx.stroke();
  ctx.restore();
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

function downloadCard() {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(cardBlob);
  a.download = "gekikara-review.png";
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
  const file = new File([cardBlob], "gekikara-review.png", { type: "image/png" });
  const shareText = "激辛レビュー生成器で審査してもらいました🌶";
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: "激辛レビュー生成器", text: shareText });
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

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
  const W = 720;
  const chartTop = 40, chartH = 240;

  // 事前計測: 性格説明の折返し行数を先に求め、それに応じてCanvas全体の高さを決める
  // (2行になる最悪ケースを常に見込んで固定高さにすると、1行で収まる大半のケースで
  //  下部に不要な空白ができてしまうため)
  const measureCtx = cardCanvasEl.getContext("2d");
  measureCtx.font = "25.5px sans-serif";
  const temperLines = wrapText(measureCtx, result.temper, W - 120);

  let y = chartTop + chartH + 70; // 星座名
  y += 60; // サブタイトル
  y += 72; // 守護天体
  y += 72; // 性格説明の開始位置
  y += temperLines.length * 42; // 性格説明の行数ぶん
  y += 30; // ラッキー項目までの余白
  y += 42 * 3; // ラッキー4行のうち3行ぶん(最終行はまだ加算しない=ラッキー最終行のベースライン)
  const footerY = y + 60; // フッターまでの余白
  const H = footerY + 30; // フッター下の余白

  cardCanvasEl.width = W;
  cardCanvasEl.height = H;
  const ctx = cardCanvasEl.getContext("2d");

  // 2026-09-29 刷新: 紺紙銀泥の星図の1ページ（藍の和紙・銀・月の淡黄）。位置と高さの式は改修前のまま。光らせない
  ctx.fillStyle = "#1D2838";
  ctx.fillRect(0, 0, W, H);
  // 和紙の繊維: 決まった並び（乱数は使わない）の細く短い線をうっすら
  ctx.strokeStyle = "rgba(255,255,255,.035)";
  ctx.lineWidth = 1;
  for (let i = 0; i < 140; i++) {
    const fx = (i * 197) % W, fy = (i * 131) % H, fl = 10 + (i * 7) % 26, fa = ((i * 37) % 180) * Math.PI / 180;
    ctx.beginPath();
    ctx.moveTo(fx, fy);
    ctx.lineTo(fx + Math.cos(fa) * fl, fy + Math.sin(fa) * fl);
    ctx.stroke();
  }

  // 匡郭（二重の罫・灰銀）
  ctx.strokeStyle = "#A9AFB5";
  ctx.lineWidth = 3;
  ctx.strokeRect(9, 9, W - 18, H - 18);
  ctx.lineWidth = 1;
  ctx.strokeRect(16, 16, W - 32, H - 32);

  // 星図の枠と経緯線（灰銀の細い線）
  const pts = result.stars.map((s) => ({
    x: 60 + s.x * (W - 120),
    y: chartTop + s.y * chartH,
    r: s.r,
  }));
  ctx.save();
  ctx.beginPath();
  ctx.rect(48, chartTop - 4, W - 96, chartH + 8);
  ctx.clip();
  ctx.strokeStyle = "rgba(169,175,181,.22)";
  ctx.lineWidth = 1;
  for (let i = 1; i < 6; i++) {
    ctx.beginPath();
    ctx.arc(W / 2, chartTop + chartH + 520, 400 + i * 52, Math.PI * 1.1, Math.PI * 1.9);
    ctx.stroke();
  }
  for (let i = -4; i <= 4; i++) {
    ctx.beginPath();
    ctx.moveTo(W / 2 + i * 70, chartTop - 4);
    ctx.lineTo(W / 2 + i * 150, chartTop + chartH + 4);
    ctx.stroke();
  }
  // 三日月（星図の左上の隅。星は x≥132 にしか来ないので重ならない）: 淡黄の円を藍の円で欠く
  ctx.fillStyle = "#E3D6A6";
  ctx.beginPath();
  ctx.arc(82, chartTop + 26, 13, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#1D2838";
  ctx.beginPath();
  ctx.arc(88, chartTop + 22, 11.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = "rgba(169,175,181,.6)";
  ctx.strokeRect(48, chartTop - 4, W - 96, chartH + 8);

  // 星座の線（灰銀）と星（銀白の丸に4本の光条）
  ctx.strokeStyle = "rgba(169,175,181,.85)";
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.stroke();
  for (const p of pts) {
    ctx.fillStyle = "#EEF0F2";
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#DADDE0";
    ctx.lineWidth = 1;
    const k = p.r * 2.6;
    ctx.beginPath();
    ctx.moveTo(p.x - k, p.y); ctx.lineTo(p.x + k, p.y);
    ctx.moveTo(p.x, p.y - k); ctx.lineTo(p.x, p.y + k);
    ctx.stroke();
  }

  y = chartTop + chartH + 70;
  ctx.textAlign = "center";
  ctx.fillStyle = "#EEF0F2";
  ctx.font = "bold 60px serif";
  ctx.fillText(result.starName, W / 2, y);
  y += 60;

  ctx.font = "25.5px sans-serif";
  ctx.fillStyle = "#A9AFB5";
  ctx.fillText("あなただけの架空の星座", W / 2, y);
  y += 72;

  ctx.textAlign = "left";
  ctx.font = "24px sans-serif";
  ctx.fillStyle = "#E3D6A6";
  ctx.fillText("守護天体", 60, y);
  ctx.fillStyle = "#DADDE0";
  ctx.font = "30px serif";
  ctx.fillText(result.guardian, 225, y);
  y += 72;

  ctx.font = "25.5px sans-serif";
  ctx.fillStyle = "#DADDE0";
  for (const line of temperLines) {
    ctx.fillText(line, 60, y);
    y += 42;
  }
  y += 30;

  ctx.fillStyle = "#C9CED3";
  ctx.font = "25.5px sans-serif";
  ctx.fillText(`ラッキーカラー: ${result.color}`, 60, y);
  y += 42;
  ctx.fillText(`ラッキーアイテム: ${result.item}`, 60, y);
  y += 42;
  ctx.fillText(`ラッキーな刻: ${result.luckyTime}`, 60, y);
  y += 42;
  ctx.fillText(`ラッキー方角: ${result.luckyDirection}`, 60, y);

  ctx.textAlign = "center";
  ctx.fillStyle = "#A9AFB5";
  ctx.font = "19.5px sans-serif";
  ctx.fillText("存在しない占星術 〜 宵乃こよみ 〜", W / 2, footerY);

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

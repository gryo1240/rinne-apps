/**
 * ルナチェイン｜盤の描画と演出
 *
 * ★ここはルールを判断しない★ 記録済みのイベント（rules.js の events）を
 *   applyEvent で1つずつ再生して描くだけ。連鎖の理屈を画面側に書き直さない。
 *
 * ★ド派手にしても、テンポを殺さない★（仕様書§5-2）
 *   連鎖が進むほど1コマを短くする（加速）。何連鎖でも演出の総時間は MAX_ANIM_MS に収める。
 *
 * ★光過敏性発作への配慮は演出より優先★（§5-4）
 *   広い面積の明滅は1秒に3回以下・赤の強い明滅は使わない・全画面フラッシュは連続させない。
 */
import { N, W, H, T_CRATER, T_STARDUST, T_CLOUD, xOf, yOf } from '../core/board.js';
import { applyEvent, capAt, effTerrain } from '../core/rules.js';

export const COLORS = {
  bg1: '#070b1c', bg2: '#111a3a',
  cell: 'rgba(255,255,255,0.045)', cellEdge: 'rgba(255,255,255,0.10)',
  p1: '#f7d774', p1soft: 'rgba(247,215,116,0.30)',
  p2: '#7f8cff', p2soft: 'rgba(127,140,255,0.30)',
  text: '#e8ecff', dim: 'rgba(232,236,255,0.55)',
};
/**
 * ★「自分はいつも金色」に統一する★（2026-09-08）
 *   先手・後手は1戦ごとにランダムなので、席の番号で色を決めると
 *   **自分が後手の対戦だけ自分の色が青になり、どちらが自分か分からなくなる**。
 *   （上の数字は金色のままなので、盤と食い違って読めなくなっていた）
 */
const seatColor = (o, mySeat) => (o === 0 ? COLORS.dim : (o === mySeat ? COLORS.p1 : COLORS.p2));

/** 演出の総時間の上限（ミリ秒）。20連鎖でも300連鎖でもここに収める */
export const MAX_ANIM_MS = 2200;
const BASE_STEP = 130;
const MIN_STEP = 3;   // これ以上短くしても目には追えないが、総時間の上限を守るために必要

/**
 * はじけ n 回ぶんの「1コマの長さ」。★n × stepFor(n) が MAX_ANIM_MS を超えないこと★
 * （test/test-render.mjs で機械検査している）
 */
export function stepFor(booms) {
  if (booms <= 1) return BASE_STEP;
  return Math.max(MIN_STEP, Math.min(BASE_STEP, MAX_ANIM_MS / booms));
}

/**
 * 光の粒の配置（1〜5個以上）。
 * ★あそびかた画面の図もこの表を読む★（盤と図で玉の位置がずれると説明にならない）
 */
export const DOTS = {
  1: [[0, 0]],
  2: [[-0.22, 0], [0.22, 0]],
  3: [[0, -0.24], [-0.23, 0.16], [0.23, 0.16]],
  4: [[-0.22, -0.22], [0.22, -0.22], [-0.22, 0.22], [0.22, 0.22]],
  5: [[-0.24, -0.24], [0.24, -0.24], [-0.24, 0.24], [0.24, 0.24], [0, 0]],
};

export class BoardView {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.cell = 48;
    this.pad = 6;
    this.disp = null;          // 表示用の盤（本物とは別）
    this.queue = [];           // 再生待ちのイベント
    this.stepMs = BASE_STEP;
    this.nextAt = 0;
    this.particles = [];
    this.shake = 0;
    this.flash = 0;
    this.flashAt = -9999;      // 直前の全画面フラッシュの時刻（連続させないため）
    this.chainPop = null;      // 連鎖数のカットイン
    this.pulse = 0;
    this.playing = false;
    this.onDone = null;
    this.legal = null;         // ハイライトするマス
    this.preview = null;       // 連鎖の予告（指を置いている間だけ光らせるマス）
    this.hints = null;         // 盤ぜんぶの「押したら何連鎖するか」（自分の手番のあいだ出しっぱなし）
    this.mySeat = 1;           // 自分の席。★色はこれを基準に決める（自分はいつも金色）★
    this.lastMove = -1;
    this.fx = opts.fx || 'normal';         // 'normal' | 'light'（演出ひかえめ）
    this.reduced = matchMediaReduced();
    this.frameTimes = [];
    this.budget = 1;           // 1=全部出す。重いと自動で下がる
    this._raf = null;
  }

  setEffects(level) { this.fx = level; }

  /**
   * 盤ぜんぶの連鎖予告を出す（自分の手番のあいだ、ずっと見えている）。
   * ★2026-09-08★ 「指を置いたマスだけ」では、はじける手が全体の21%しかなく
   *   4回に3回は何も光らないため「予告が機能していない」と言われた。数える計算は rules.js の chainMap。
   */
  setHints(map) { this.hints = map || null; this.draw(); }

  /** 自分の席を教える。★対戦を始めるたびに必ず呼ぶ★（呼ばないと色が席とずれる） */
  setSeat(seat) { this.mySeat = seat === 2 ? 2 : 1; this.draw(); }

  /** 持ち主の色（自分＝金・相手＝藍） */
  colorOf(owner) { return seatColor(owner, this.mySeat); }

  /**
   * 連鎖の予告を出す（指を置いている間）。★2026-09-08 追加★
   *   「何が起こっているか分からないから、後半は連打ゲーになっちゃう」（オーナー）
   *   への対策。押す前に、はじけるマスを光らせる。
   *   ★ここでは連鎖を計算しない★ 計算は rules.js の previewChain が持つ。
   */
  setPreview(cells) {
    const next = (cells && cells.length) ? [...new Set(cells)] : null;
    const same = (!next && !this.preview)
      || (next && this.preview && next.length === this.preview.length
          && next.every((v, k) => v === this.preview[k]));
    if (same) return;
    this.preview = next;
    if (next) this.start(); else this.draw();
  }

  resize() {
    const box = this.canvas.parentElement;
    const availW = Math.max(240, box.clientWidth);
    const availH = Math.max(240, box.clientHeight || 0);
    let cell = Math.floor((availW - this.pad * 2) / W);
    if (availH > 80) cell = Math.min(cell, Math.floor((availH - this.pad * 2) / H));
    this.cell = Math.max(28, Math.min(72, cell));
    const w = this.cell * W + this.pad * 2;
    const h = this.cell * H + this.pad * 2;
    const dpr = Math.min(3, globalThis.devicePixelRatio || 1);
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.draw();
  }

  /** タップされた座標をマス番号に変換（外れたら -1） */
  hit(clientX, clientY) {
    const r = this.canvas.getBoundingClientRect();
    const x = Math.floor((clientX - r.left - this.pad) / this.cell);
    const y = Math.floor((clientY - r.top - this.pad) / this.cell);
    if (x < 0 || x >= W || y < 0 || y >= H) return -1;
    return y * W + x;
  }

  /** 本物の盤を表示用にコピーして持つ（演出の起点） */
  sync(state) {
    this.disp = {
      owner: Int8Array.from(state.owner),
      count: Int8Array.from(state.count),
      terrain: Int8Array.from(state.terrain),
      cloud: Int8Array.from(state.cloud),
      geo: state.geo,
      wrapX: state.wrapX,
    };
    this.draw();
  }

  /**
   * 1手ぶんのイベントを演出付きで再生する。
   * ★はじけの数がいくつでも、総時間は MAX_ANIM_MS を超えない★
   */
  animate(events, onDone) {
    const booms = events.filter((e) => e.t === 'boom').length;
    this.stepMs = stepFor(booms);      // 加速: はじけが多いほど1コマを短くする
    this.queue = events.slice();
    this.index = 0;
    this.startAt = -1;                 // 最初のtickで決める
    this.onDone = onDone;
    this.playing = true;
    this.start();
  }

  start() {
    if (this._raf) return;
    const loop = (t) => {
      this._raf = requestAnimationFrame(loop);
      this.tick(t);
    };
    this._raf = requestAnimationFrame(loop);
  }

  stop() { if (this._raf) cancelAnimationFrame(this._raf); this._raf = null; }

  tick(t) {
    // ── 描画が重いときは演出を段階的に落とす（連鎖が止まるほうが致命的）
    this.frameTimes.push(t);
    if (this.frameTimes.length > 30) this.frameTimes.shift();
    if (this.frameTimes.length === 30) {
      const avg = (this.frameTimes[29] - this.frameTimes[0]) / 29;
      if (avg > 20 && this.budget > 0.25) this.budget -= 0.05;
      else if (avg < 15 && this.budget < 1) this.budget += 0.02;
    }

    if (this.playing) {
      if (this.startAt < 0) this.startAt = t;
      // ★1フレームに1つずつしか進めないと、300連鎖で10秒近く操作できなくなる★
      //   経過時間から「いま何個目まで進んでいるべきか」を出して、遅れている分をまとめて消化する
      const want = Math.min(this.queue.length, Math.floor((t - this.startAt) / this.stepMs) + 1);
      let guard = 0;
      while (this.index < want && guard++ < 400) this.consume(this.queue[this.index++], t);
      if (this.index >= this.queue.length) {
        this.playing = false;
        const cb = this.onDone; this.onDone = null;
        if (cb) cb();
      }
    }

    this.pulse = (Math.sin(t / 420) + 1) / 2;
    this.shake *= 0.62;      // 0.1秒ほどで収まる強さ（0.86だと数秒間ずっと揺れ続ける）
    this.flash *= 0.88;
    this.updateParticles();
    if (this.chainPop && t - this.chainPop.t > 700) this.chainPop = null;
    this.draw(t);

    // 何も動いていなければループを止める（電池を無駄にしない）
    //   ★予告を出している間は止めない★（脈動が固まって「壊れている」ように見える）
    if (!this.playing && !this.preview && this.particles.length === 0
        && this.shake < 0.4 && this.flash < 0.02 && !this.chainPop) {
      this.stop();
      this.draw(t);
    }
  }

  consume(ev, t) {
    if (!this.disp) return;
    applyEvent(this.disp, ev);           // ★ルールは書き直さず、記録を再生するだけ
    if (ev.t === 'place') {
      this.burst(ev.i, this.colorOf(ev.player), 6);
    } else if (ev.t === 'boom') {
      const col = this.colorOf(ev.player);
      this.burst(ev.i, col, 14);
      for (const j of ev.to) if (j >= 0) this.trail(ev.i, j, col);
      if (this.fx !== 'light' && !this.reduced) {
        this.shake = Math.min(9, 2 + ev.chain * 0.5);
        if (ev.chain >= 3 && (!this.chainPop || ev.chain > this.chainPop.n)) {
          this.chainPop = { n: ev.chain, t };
        }
      }
    }
  }

  /** 全画面のひかり。★連続させない★（0.6秒以内・1秒に3回を超えない） */
  bigFlash(t = performance.now()) {
    if (this.reduced || this.fx === 'light') return;
    if (t - this.flashAt < 600) return;         // 直前のフラッシュから0.6秒は出さない
    this.flashAt = t;
    this.flash = 0.55;                           // 白飛びさせない（0.55まで）
    this.start();
  }

  burst(i, color, n) {
    if (this.reduced) return;
    const count = Math.round(n * this.budget * (this.fx === 'light' ? 0.3 : 1));
    const cx = this.pad + (xOf(i) + 0.5) * this.cell;
    const cy = this.pad + (yOf(i) + 0.5) * this.cell;
    for (let k = 0; k < count; k++) {
      if (this.particles.length > 1200) break;   // 上限（毎フレーム作り続けると一瞬止まる）
      const a = Math.random() * Math.PI * 2;
      const sp = (0.6 + Math.random() * 2.2) * (this.cell / 48);
      this.particles.push({ x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1, color });
    }
  }

  trail(from, to, color) {
    if (this.reduced || this.fx === 'light') return;
    const fx = this.pad + (xOf(from) + 0.5) * this.cell;
    const fy = this.pad + (yOf(from) + 0.5) * this.cell;
    const tx = this.pad + (xOf(to) + 0.5) * this.cell;
    const ty = this.pad + (yOf(to) + 0.5) * this.cell;
    const n = Math.round(6 * this.budget);
    for (let k = 0; k < n; k++) {
      const p = k / Math.max(1, n);
      this.particles.push({
        x: fx + (tx - fx) * p, y: fy + (ty - fy) * p,
        vx: (tx - fx) / 26, vy: (ty - fy) / 26, life: 0.8, color,
      });
    }
  }

  updateParticles() {
    const ps = this.particles;
    for (let k = ps.length - 1; k >= 0; k--) {
      const p = ps[k];
      p.x += p.vx; p.y += p.vy;
      p.vx *= 0.93; p.vy *= 0.93;
      p.life -= 0.045;
      if (p.life <= 0) ps.splice(k, 1);
    }
  }

  draw(t = 0) {
    const { ctx, cell, pad } = this;
    if (!ctx) return;
    const w = cell * W + pad * 2, h = cell * H + pad * 2;

    ctx.save();
    if (this.shake > 0.4 && !this.reduced) {
      ctx.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);
    }
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, COLORS.bg1); g.addColorStop(1, COLORS.bg2);
    ctx.fillStyle = g; ctx.fillRect(-10, -10, w + 20, h + 20);

    if (this.disp) {
      for (let i = 0; i < N; i++) this.drawCell(i, t);
      if (this.legal) {
        ctx.save();
        ctx.strokeStyle = 'rgba(247,215,116,0.75)';
        ctx.lineWidth = 2;
        for (const i of this.legal) {
          const x = pad + xOf(i) * cell, y = pad + yOf(i) * cell;
          roundRect(ctx, x + 3, y + 3, cell - 6, cell - 6, 9);
          ctx.stroke();
        }
        ctx.restore();
      }
    }

    // ── 連鎖の予告（押す前に「どこがはじけるか」を見せる）──────────────
    if (this.preview) {
      ctx.save();
      const a = 0.22 + this.pulse * 0.26;
      for (const i of this.preview) {
        const x = pad + xOf(i) * cell, y = pad + yOf(i) * cell;
        ctx.fillStyle = `rgba(247,215,116,${a * 0.55})`;
        roundRect(ctx, x + 2, y + 2, cell - 4, cell - 4, 10);
        ctx.fill();
        ctx.strokeStyle = `rgba(255,246,214,${0.5 + this.pulse * 0.4})`;
        ctx.lineWidth = Math.max(2, cell * 0.055);
        roundRect(ctx, x + 3, y + 3, cell - 6, cell - 6, 10);
        ctx.stroke();
      }
      ctx.restore();
    }

    // 光の粒
    for (const p of this.particles) {
      ctx.globalAlpha = Math.max(0, p.life) * 0.85;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(1, this.cell * 0.055 * p.life), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // 連鎖数のカットイン（数が増えるほど大きく・金→白へ）
    if (this.chainPop) {
      const age = Math.min(1, (t - this.chainPop.t) / 700);
      const n = this.chainPop.n;
      const size = Math.min(cell * 2.3, cell * (0.9 + n * 0.09));
      ctx.save();
      ctx.globalAlpha = (1 - age) * 0.95;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `bold ${size}px system-ui, sans-serif`;
      ctx.fillStyle = n >= 8 ? '#ffffff' : n >= 5 ? '#fff2c4' : COLORS.p1;
      ctx.shadowColor = COLORS.p1; ctx.shadowBlur = 24;
      ctx.fillText(`${n}`, w / 2, h / 2 - cell * 0.2 - age * cell * 0.5);
      ctx.font = `bold ${Math.round(size * 0.3)}px system-ui, sans-serif`;
      ctx.fillText('れんさ', w / 2, h / 2 + size * 0.42 - age * cell * 0.5);
      ctx.restore();
    }

    // 全画面のひかり（白飛びさせない・連続させない）
    if (this.flash > 0.02) {
      ctx.fillStyle = `rgba(255,246,214,${Math.min(0.55, this.flash)})`;
      ctx.fillRect(-10, -10, w + 20, h + 20);
    }
    ctx.restore();
  }

  drawCell(i, t) {
    const { ctx, cell, pad, disp } = this;
    const x = pad + xOf(i) * cell, y = pad + yOf(i) * cell;
    const terr = effTerrain(disp, i);
    const owner = disp.owner[i], count = disp.count[i];

    if (terr === T_STARDUST) {
      // 光の通り道: マスを置かず、十字の光だけを描く
      ctx.save();
      ctx.strokeStyle = 'rgba(200,220,255,0.32)';
      ctx.lineWidth = Math.max(1.5, cell * 0.05);
      ctx.beginPath();
      ctx.moveTo(x + cell * 0.5, y + cell * 0.12); ctx.lineTo(x + cell * 0.5, y + cell * 0.88);
      ctx.moveTo(x + cell * 0.12, y + cell * 0.5); ctx.lineTo(x + cell * 0.88, y + cell * 0.5);
      ctx.stroke();
      ctx.fillStyle = 'rgba(200,220,255,0.5)';
      ctx.beginPath(); ctx.arc(x + cell / 2, y + cell / 2, cell * 0.07, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      return;
    }

    ctx.save();
    ctx.fillStyle = owner
      ? (owner === this.mySeat ? 'rgba(247,215,116,0.13)' : 'rgba(127,140,255,0.13)')
      : COLORS.cell;
    roundRect(ctx, x + 2, y + 2, cell - 4, cell - 4, 10);
    ctx.fill();
    ctx.strokeStyle = COLORS.cellEdge; ctx.lineWidth = 1;
    ctx.stroke();

    if (terr === T_CRATER) {          // クレーター: はじけにくい＝二重の輪
      ctx.strokeStyle = 'rgba(255,255,255,0.22)';
      ctx.lineWidth = Math.max(1, cell * 0.035);
      ctx.beginPath(); ctx.arc(x + cell / 2, y + cell / 2, cell * 0.36, 0, Math.PI * 2); ctx.stroke();
    }
    if (terr === T_CLOUD) {           // 雲: くぐもった帯
      ctx.fillStyle = 'rgba(190,200,225,0.22)';
      roundRect(ctx, x + 5, y + cell * 0.3, cell - 10, cell * 0.4, cell * 0.2);
      ctx.fill();
    }

    // ★臨界（あと1つでいっぱい）は光る輪で必ず分かるようにする＝戦略が読める
    const cap = capAt(disp, i);
    if (owner && count === cap - 1) {
      ctx.strokeStyle = this.colorOf(owner);
      ctx.globalAlpha = 0.35 + this.pulse * 0.45;
      ctx.lineWidth = Math.max(1.5, cell * 0.045);
      roundRect(ctx, x + 3, y + 3, cell - 6, cell - 6, 10);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    if (i === this.lastMove) {
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.setLineDash([3, 3]); ctx.lineWidth = 1.5;
      roundRect(ctx, x + 5, y + 5, cell - 10, cell - 10, 8);
      ctx.stroke(); ctx.setLineDash([]);
    }

    // ── 押したら何連鎖するか（自分の手番のあいだ出しっぱなし）──────────
    const hint = this.hints ? this.hints[i] : 0;
    if (hint > 0) {
      ctx.save();
      // 数が大きいほど明るく・大きく。★数字そのものを出す★（強さの序列が一目で分かる）
      const big = Math.min(1, hint / 8);
      ctx.globalAlpha = 0.34 + big * 0.5;
      ctx.fillStyle = hint >= 8 ? '#ffffff' : hint >= 4 ? '#fff2c4' : COLORS.p1;
      ctx.font = `bold ${Math.round(cell * (0.44 + big * 0.16))}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      // 光の玉と重なっても読めるように、暗い縁を敷く
      ctx.shadowColor = 'rgba(0,0,0,0.75)';
      ctx.shadowBlur = Math.max(3, cell * 0.14);
      ctx.fillText(String(hint), x + cell / 2, y + cell / 2 + 1);
      ctx.shadowBlur = 0;
      ctx.restore();
    }

    // ★「あと何個ではじけるか」を盤の上で必ず見せる★（2026-09-08 オーナー実測で追加）
    //   容量はマスの位置で違う（かど2・へり3・まんなか4）。ここを描かないと、
    //   遊んでいる人は盤をいくら見てもルールに気づけない。実際に「ルールが分からない」と言われた。
    //   空き枠を薄い輪で描き、たまった光がその輪を1つずつ埋めていく形にする。
    //   ★輪の数＝capAt（rules.js）をそのまま読む。画面側で容量を計算し直さないこと★
    const slots = (terr !== T_CLOUD && cap >= 1 && cap <= 5) ? DOTS[cap] : null;
    if (slots && count <= cap) {
      const col = this.colorOf(owner);
      for (let k = 0; k < slots.length; k++) {
        const cx = x + cell / 2 + slots[k][0] * cell;
        const cy = y + cell / 2 + slots[k][1] * cell;
        if (k < count) {
          ctx.fillStyle = col;
          ctx.shadowColor = col; ctx.shadowBlur = cell * 0.28;
          ctx.beginPath(); ctx.arc(cx, cy, cell * 0.105, 0, Math.PI * 2); ctx.fill();
          ctx.shadowBlur = 0;
        } else {
          // 空き枠。持ち主がいるマスは少し濃く、空きマスはごく薄く（盤がうるさくならない範囲で）
          ctx.strokeStyle = owner ? 'rgba(255,255,255,0.24)' : 'rgba(255,255,255,0.11)';
          ctx.lineWidth = Math.max(1, cell * 0.028);
          ctx.beginPath(); ctx.arc(cx, cy, cell * 0.088, 0, Math.PI * 2); ctx.stroke();
        }
      }
    } else if (count > 0) {
      // 容量を超えている途中経過（演出の再生中に一時的にそうなる）は、数で見せる
      const col = this.colorOf(owner);
      const dots = DOTS[Math.min(5, count)] || DOTS[5];
      ctx.fillStyle = col;
      ctx.shadowColor = col; ctx.shadowBlur = cell * 0.28;
      for (const [dx, dy] of dots) {
        ctx.beginPath();
        ctx.arc(x + cell / 2 + dx * cell, y + cell / 2 + dy * cell, cell * 0.105, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.shadowBlur = 0;
      if (count > 5) {
        ctx.fillStyle = '#0b1024';
        ctx.font = `bold ${Math.round(cell * 0.26)}px system-ui, sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(String(count), x + cell / 2, y + cell / 2 + 1);
      }
    }
    ctx.restore();
  }
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

function matchMediaReduced() {
  try { return globalThis.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches; }
  catch { return false; }
}

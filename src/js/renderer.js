/**
 * renderer.js — отрисовка поля, очереди и отложенной фигуры на canvas.
 */

import { COLS, ROWS, PIECE_COLORS, SHAPES } from './pieces.js';

const PAD = 6;

function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function shade(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, ((n >> 16) & 255) + amount));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amount));
  const b = Math.max(0, Math.min(255, (n & 255) + amount));
  return `rgb(${r},${g},${b})`;
}

export class Renderer {
  constructor(canvas, holdCanvas, nextCanvas) {
    this.canvas = canvas;
    this.holdCanvas = holdCanvas;
    this.nextCanvas = nextCanvas;
    this.ctx = canvas.getContext('2d');
    this.holdCtx = holdCanvas.getContext('2d');
    this.nextCtx = nextCanvas.getContext('2d');
    this.dpr = 1;
    this.cell = 24;
    this.flash = 0;
    this.resize();
  }

  /** Подгоняем размеры canvas под CSS и devicePixelRatio. */
  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));

    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.dpr = dpr;
    this.cssWidth = w;
    this.cssHeight = h;
    this.cell = (w - PAD * 2) / COLS;

    for (const canvas of [this.holdCanvas, this.nextCanvas]) {
      const r = canvas.getBoundingClientRect();
      const width = Math.max(1, Math.round(r.width || canvas.width));
      const height = Math.max(1, Math.round(r.height || canvas.height));
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);
      canvas.dataset.cssWidth = width;
      canvas.dataset.cssHeight = height;
    }
  }

  /* ------------------------------------------------------------------ */

  draw(game, dt = 0) {
    const ctx = this.ctx;
    const cell = this.cell;
    const w = this.cssWidth;
    const h = this.cssHeight;

    ctx.clearRect(0, 0, w, h);
    this.drawBackground(ctx, w, h);

    const ox = PAD;
    const oy = PAD;
    const fieldW = cell * COLS;
    const fieldH = cell * ROWS;

    ctx.save();
    ctx.beginPath();
    ctx.rect(ox, oy, fieldW, fieldH);
    ctx.clip();

    this.drawGrid(ctx, ox, oy, cell);
    this.drawBoard(ctx, game, ox, oy, cell);
    if (game.current) {
      this.drawGhost(ctx, game, ox, oy, cell);
      this.drawPiece(ctx, game, ox, oy, cell);
    }
    this.drawClearing(ctx, game, ox, oy, cell, dt);

    ctx.restore();

    this.drawFrame(ctx, ox, oy, fieldW, fieldH);
    this.drawDanger(ctx, game, ox, oy, fieldW, fieldH, dt);
  }

  drawBackground(ctx, w, h) {
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#0b0b1c');
    grad.addColorStop(1, '#06060e');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  }

  drawGrid(ctx, ox, oy, cell) {
    ctx.strokeStyle = 'rgba(120,130,255,0.07)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let c = 1; c < COLS; c++) {
      const x = ox + c * cell + 0.5;
      ctx.moveTo(x, oy);
      ctx.lineTo(x, oy + cell * ROWS);
    }
    for (let r = 1; r < ROWS; r++) {
      const y = oy + r * cell + 0.5;
      ctx.moveTo(ox, y);
      ctx.lineTo(ox + cell * COLS, y);
    }
    ctx.stroke();
  }

  drawBlock(ctx, x, y, size, color, { alpha = 1, ghost = false, glow = 0 } = {}) {
    const inset = Math.max(1, size * 0.07);
    const bx = x + inset;
    const by = y + inset;
    const bw = size - inset * 2;
    const bh = size - inset * 2;
    const radius = Math.max(2, size * 0.18);

    ctx.save();
    ctx.globalAlpha = alpha;

    if (ghost) {
      ctx.strokeStyle = color;
      ctx.globalAlpha = alpha * 0.55;
      ctx.lineWidth = Math.max(1.5, size * 0.09);
      roundRect(ctx, bx, by, bw, bh, radius);
      ctx.stroke();
      ctx.restore();
      return;
    }

    if (glow > 0) {
      ctx.shadowColor = color;
      ctx.shadowBlur = glow;
    }

    const grad = ctx.createLinearGradient(bx, by, bx, by + bh);
    grad.addColorStop(0, shade(color, 45));
    grad.addColorStop(0.45, color);
    grad.addColorStop(1, shade(color, -55));
    ctx.fillStyle = grad;
    roundRect(ctx, bx, by, bw, bh, radius);
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth = Math.max(1, size * 0.045);
    roundRect(ctx, bx + 0.5, by + 0.5, bw - 1, bh - 1, radius);
    ctx.stroke();

    // блик сверху
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    roundRect(ctx, bx + bw * 0.14, by + bh * 0.1, bw * 0.72, Math.max(1, bh * 0.11), radius * 0.5);
    ctx.fill();

    ctx.restore();
  }

  drawBoard(ctx, game, ox, oy, cell) {
    for (let y = 0; y < ROWS; y++) {
      const row = game.board[y];
      for (let x = 0; x < COLS; x++) {
        const type = row[x];
        if (!type) continue;
        this.drawBlock(ctx, ox + x * cell, oy + y * cell, cell, PIECE_COLORS[type]);
      }
    }
  }

  drawPiece(ctx, game, ox, oy, cell) {
    const piece = game.current;
    const cells = SHAPES[piece.type][piece.rot];
    const color = PIECE_COLORS[piece.type];
    for (const [dx, dy] of cells) {
      const x = (piece.px + dx) / 2;
      const y = (piece.py + dy) / 2;
      if (y < 0) continue;
      this.drawBlock(ctx, ox + x * cell, oy + y * cell, cell, color, { glow: cell * 0.45 });
    }
  }

  drawGhost(ctx, game, ox, oy, cell) {
    const ghost = game.ghostPosition();
    if (!ghost) return;
    const cells = SHAPES[ghost.type][ghost.rot];
    const color = PIECE_COLORS[ghost.type];
    for (const [dx, dy] of cells) {
      const x = (ghost.px + dx) / 2;
      const y = (ghost.py + dy) / 2;
      if (y < 0) continue;
      this.drawBlock(ctx, ox + x * cell, oy + y * cell, cell, color, { ghost: true, alpha: 0.9 });
    }
  }

  drawClearing(ctx, game, ox, oy, cell, dt) {
    if (!game.clearing) {
      this.flash = Math.max(0, this.flash - dt * 3);
      return;
    }
    const progress = 1 - Math.max(0, game.clearing.t) / 0.22;
    this.flash = 1;

    ctx.save();
    for (const row of game.clearing.rows) {
      const y = oy + row * cell;
      const alpha = 0.85 * (1 - progress);
      ctx.fillStyle = `rgba(255,255,255,${alpha})`;
      ctx.fillRect(ox, y, cell * COLS, cell);

      ctx.fillStyle = `rgba(168,85,247,${alpha * 0.6})`;
      const barH = Math.max(1, cell * 0.12);
      const offset = progress * cell * 0.6;
      ctx.fillRect(ox, y + offset, cell * COLS, barH);
      ctx.fillRect(ox, y + cell - barH - offset, cell * COLS, barH);
    }
    ctx.restore();
  }

  drawFrame(ctx, ox, oy, w, h) {
    ctx.save();
    ctx.strokeStyle = 'rgba(160,170,255,0.22)';
    ctx.lineWidth = 1;
    roundRect(ctx, ox + 0.5, oy + 0.5, w - 1, h - 1, 10);
    ctx.stroke();
    ctx.restore();
  }

  drawDanger(ctx, game, ox, oy, w, h, dt) {
    let stackTop = ROWS;
    for (let y = 0; y < ROWS; y++) {
      if (game.board[y].some((cell) => cell !== null)) {
        stackTop = y;
        break;
      }
    }
    const danger = stackTop <= 4;
    if (!danger) return;
    const pulse = 0.25 + 0.2 * Math.sin(performance.now() / 220);
    const grad = ctx.createLinearGradient(0, oy, 0, oy + h);
    grad.addColorStop(0, `rgba(239,68,68,${pulse})`);
    grad.addColorStop(0.35, 'rgba(239,68,68,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(ox, oy, w, h * 0.4);
  }

  /* ------------------------------------------------------------------ */
  /* Мини-канвасы: hold и очередь                                        */
  /* ------------------------------------------------------------------ */

  drawMini(canvas, ctx, pieces) {
    const w = Number(canvas.dataset.cssWidth) || canvas.width;
    const h = Number(canvas.dataset.cssHeight) || canvas.height;
    ctx.clearRect(0, 0, w, h);

    const boxH = pieces.length > 0 ? h / pieces.length : h;
    pieces.forEach((type, index) => {
      if (!type) return;
      const cells = SHAPES[type][0];
      const xs = cells.map(([dx]) => (dx / 2));
      const ys = cells.map(([dy]) => (dy / 2));
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);

      const spanX = maxX - minX + 1;
      const spanY = maxY - minY + 1;
      const cell = Math.min((w - 16) / spanX, (boxH - 16) / spanY, 26);
      const originX = (w - spanX * cell) / 2;
      const originY = boxH * index + (boxH - spanY * cell) / 2;

      for (const [dx, dy] of cells) {
        const x = originX + (dx / 2 - minX) * cell;
        const y = originY + (dy / 2 - minY) * cell;
        this.drawBlock(ctx, x, y, cell, PIECE_COLORS[type], { glow: cell * 0.3 });
      }
    });
  }

  drawHold(game) {
    this.drawMini(this.holdCanvas, this.holdCtx, [game.hold]);
  }

  drawNext(game) {
    this.drawMini(this.nextCanvas, this.nextCtx, game.queue.slice(0, 5));
  }
}

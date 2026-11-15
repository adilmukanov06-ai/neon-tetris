/**
 * engine.js — «чистая» игровая логика тетриса (без DOM).
 *
 * Реализовано по Tetris Guideline:
 *  • SRS-поворот с полными кик-оффсетами (отдельно для I и O);
 *  • 7-bag генератор, hold, очередь из 5 фигур, ghost-подсказка;
 *  • lock delay 500 мс (до 15 сбросов), гравитация по уровню;
 *  • очки: одиночные/двойные/тройные/тетрис, T-spin, back-to-back, комбо;
 *  • soft drop (x20) и hard drop (x2 за клетку).
 */

import {
  COLS,
  ROWS,
  PIECE_COLORS,
  SHAPES,
  SPAWN,
  createBag,
  kicksFor,
} from './pieces.js';

export const LOCK_DELAY = 0.5; // сек
export const MAX_LOCK_RESETS = 15;
export const CLEAR_ANIMATION = 0.22; // сек

const SCORE_LINES = [0, 100, 300, 500, 800];

export class Tetris {
  constructor() {
    this.events = [];
    this.reset();
  }

  /* ------------------------------------------------------------------ */
  /* Жизненный цикл                                                      */
  /* ------------------------------------------------------------------ */

  reset() {
    this.board = this.createBoard();
    this.bag = createBag();
    this.queue = [];
    this.current = null;
    this.hold = null;
    this.holdUsed = false;

    this.score = 0;
    this.lines = 0;
    this.level = 1;
    this.combo = -1;
    this.backToBack = false;

    this.status = 'ready'; // ready | playing | paused | over
    this.gravityAcc = 0;
    this.softAcc = 0;
    this.lockTimer = 0;
    this.lockResets = 0;
    this.grounded = false;
    this.softDropping = false;
    this.clearing = null;

    this.lastActionWasRotation = false;
    this.lastKickIndex = 0;
    this.miniTSpin = false;

    this.stats = { pieces: 0, singles: 0, doubles: 0, triples: 0, tetrises: 0, tspins: 0, maxCombo: 0 };

    this.events.length = 0;
    return this;
  }

  start() {
    this.reset();
    this.status = 'playing';
    this.fillQueue(5);
    this.spawn();
    return this;
  }

  pause() {
    if (this.status === 'playing') this.status = 'paused';
  }

  resume() {
    if (this.status === 'paused') this.status = 'playing';
  }

  togglePause() {
    if (this.status === 'playing') this.pause();
    else if (this.status === 'paused') this.resume();
  }

  createBoard() {
    return Array.from({ length: ROWS }, () => new Array(COLS).fill(null));
  }

  /* ------------------------------------------------------------------ */
  /* События                                                             */
  /* ------------------------------------------------------------------ */

  emit(type, payload = {}) {
    this.events.push({ type, ...payload });
  }

  drainEvents() {
    const out = this.events.slice();
    this.events.length = 0;
    return out;
  }

  /* ------------------------------------------------------------------ */
  /* Очередь и спавн                                                     */
  /* ------------------------------------------------------------------ */

  fillQueue(count) {
    while (this.queue.length < count) this.queue.push(this.bag.next());
  }

  spawn(type = null) {
    this.fillQueue(6);
    const nextType = type ?? this.queue.shift();
    this.fillQueue(6);

    const [px, py] = SPAWN[nextType];
    this.current = { type: nextType, rot: 0, px, py };
    this.stats.pieces++;
    this.gravityAcc = 0;
    this.softAcc = 0;
    this.lockTimer = 0;
    this.lockResets = 0;
    this.grounded = false;
    this.lastActionWasRotation = false;
    this.lastKickIndex = 0;

    if (this.collides(this.current)) {
      this.status = 'over';
      this.emit('gameover', { score: this.score, lines: this.lines });
      return false;
    }
    this.emit('spawn', { type: nextType });
    return true;
  }

  /* ------------------------------------------------------------------ */
  /* Геометрия                                                           */
  /* ------------------------------------------------------------------ */

  /** Абсолютные клетки фигуры (в клетках поля) с учётом позиции и поворота. */
  pieceCells(piece = this.current) {
    if (!piece) return [];
    const cells = SHAPES[piece.type][piece.rot];
    return cells.map(([dx, dy]) => [
      (piece.px + dx) / 2,
      (piece.py + dy) / 2,
    ]);
  }

  collides(piece, px = piece.px, py = piece.py, rot = piece.rot) {
    const cells = SHAPES[piece.type][rot];
    for (const [dx, dy] of cells) {
      const x = (px + dx) / 2;
      const y = (py + dy) / 2;
      if (x < 0 || x >= COLS || y >= ROWS) return true;
      if (y >= 0 && this.board[y][x]) return true;
    }
    return false;
  }

  /** Самая нижняя допустимая позиция по вертикали (для ghost). */
  ghostPosition() {
    if (!this.current) return null;
    let py = this.current.py;
    while (!this.collides(this.current, this.current.px, py + 2, this.current.rot)) {
      py += 2;
    }
    return { ...this.current, py };
  }

  /* ------------------------------------------------------------------ */
  /* Действия игрока                                                     */
  /* ------------------------------------------------------------------ */

  move(dx) {
    if (this.status !== 'playing' || !this.current) return false;
    const { px, py, rot } = this.current;
    if (this.collides(this.current, px + dx * 2, py, rot)) return false;
    this.current.px += dx * 2;
    this.lastActionWasRotation = false;
    this.onPieceMoved();
    return true;
  }

  rotate(dir = 1) {
    if (this.status !== 'playing' || !this.current) return false;
    if (this.current.type === 'O') return false;

    const from = this.current.rot;
    const to = (from + (dir > 0 ? 1 : 3)) % 4;
    const kicks = kicksFor(this.current.type, from, to);

    for (let i = 0; i < kicks.length; i++) {
      const [kx, ky] = kicks[i];
      const nx = this.current.px + kx;
      const ny = this.current.py + ky;
      if (!this.collides(this.current, nx, ny, to)) {
        this.current.rot = to;
        this.current.px = nx;
        this.current.py = ny;
        this.lastActionWasRotation = true;
        this.lastKickIndex = i;
        this.onPieceMoved();
        return true;
      }
    }
    return false;
  }

  /** Сдвиг вниз на одну клетку. Возвращает true, если фигура опустилась. */
  moveDown() {
    if (!this.current) return false;
    const { px, py, rot } = this.current;
    if (this.collides(this.current, px, py + 2, rot)) {
      this.grounded = true;
      return false;
    }
    this.current.py += 2;
    this.grounded = false;
    this.lockTimer = 0;
    this.lockResets = 0;
    return true;
  }

  softDrop() {
    if (this.status !== 'playing' || !this.current) return false;
    const moved = this.moveDown();
    if (moved) this.score += 1;
    return moved;
  }

  hardDrop() {
    if (this.status !== 'playing' || !this.current) return false;
    let distance = 0;
    while (this.moveDown()) distance++;
    this.score += distance * 2;
    this.lockPiece();
    return distance;
  }

  holdPiece() {
    if (this.status !== 'playing' || !this.current || this.holdUsed) return false;
    const swapped = this.hold;
    this.hold = this.current.type;
    this.holdUsed = true;

    if (swapped) {
      this.spawn(swapped);
    } else {
      this.spawn();
    }
    this.holdUsed = true;
    this.emit('hold', { type: this.hold });
    return true;
  }

  /** Сброс таймера lock delay при успешном движении/повороте (до 15 раз). */
  onPieceMoved() {
    if (this.grounded) {
      if (this.lockResets < MAX_LOCK_RESETS) {
        this.lockResets++;
        this.lockTimer = 0;
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /* Фиксация фигуры и очистка линий                                     */
  /* ------------------------------------------------------------------ */

  lockPiece() {
    if (!this.current) return;
    const { type, rot } = this.current;

    for (const [x, y] of this.pieceCells()) {
      if (y >= 0 && y < ROWS && x >= 0 && x < COLS) {
        this.board[y][x] = type;
      }
    }

    const tspin = this.detectTSpin();
    const fullRows = [];
    for (let y = 0; y < ROWS; y++) {
      if (this.board[y].every((cell) => cell !== null)) fullRows.push(y);
    }

    this.current = null;
    this.grounded = false;
    this.lockTimer = 0;

    if (fullRows.length > 0) {
      this.clearing = { rows: fullRows, t: CLEAR_ANIMATION, tspin, mini: !!this.miniTSpin };
      this.emit('clear', { rows: fullRows, count: fullRows.length, tspin });
      return;
    }

    if (tspin) {
      this.stats.tspins++;
      this.score += 400 * this.level;
      this.emit('tspin', { lines: 0 });
    }
    this.combo = -1;
    this.spawn();
  }

  /** Завершение анимации очистки: убираем строки, начисляем очки. */
  finishClear() {
    const { rows, tspin, mini } = this.clearing;
    this.clearing = null;

    for (const y of rows) {
      this.board.splice(y, 1);
      this.board.unshift(new Array(COLS).fill(null));
    }

    const cleared = rows.length;
    this.lines += cleared;
    this.combo++;

    let base;
    let label;

    if (tspin) {
      if (cleared === 0) { base = 400; label = mini ? 'T-SPIN MINI' : 'T-SPIN'; }
      else if (cleared === 1) { base = mini ? 100 : 800; label = mini ? 'T-SPIN MINI SINGLE' : 'T-SPIN SINGLE'; }
      else if (cleared === 2) { base = 1200; label = 'T-SPIN DOUBLE'; }
      else { base = 1600; label = 'T-SPIN TRIPLE'; }
      this.stats.tspins++;
    } else {
      base = SCORE_LINES[cleared];
      label = ['', 'SINGLE', 'DOUBLE', 'TRIPLE', 'TETRIS'][cleared];
      if (cleared === 1) this.stats.singles++;
      else if (cleared === 2) this.stats.doubles++;
      else if (cleared === 3) this.stats.triples++;
      else if (cleared === 4) this.stats.tetrises++;
    }

    let gained = base * this.level;

    // Back-to-back: тетрис или T-spin подряд.
    const difficult = cleared === 4 || tspin;
    if (cleared > 0) {
      if (difficult && this.backToBack) {
        gained = Math.floor(gained * 1.5);
        label = 'B2B ' + label;
      }
      this.backToBack = difficult;
    }

    // Комбо.
    if (this.combo > 0) {
      gained += 50 * this.combo * this.level;
      label += ` x${this.combo + 1}`;
    }
    this.stats.maxCombo = Math.max(this.stats.maxCombo, Math.max(0, this.combo));

    this.score += gained;

    const newLevel = Math.floor(this.lines / 10) + 1;
    if (newLevel !== this.level) {
      this.level = newLevel;
      this.emit('levelup', { level: this.level });
    }

    this.emit('scored', { points: gained, label, lines: cleared, combo: this.combo });
    this.spawn();
  }

  /**
   * T-spin: правило трёх углов.
   * Считаем занятые углы бокса 3x3 вокруг центра фигуры T.
   */
  detectTSpin() {
    if (!this.current || this.current.type !== 'T') return false;
    if (!this.lastActionWasRotation) return false;

    const cx = this.current.px / 2;
    const cy = this.current.py / 2;
    const corners = [
      [cx - 1, cy - 1],
      [cx + 1, cy - 1],
      [cx - 1, cy + 1],
      [cx + 1, cy + 1],
    ];

    let filled = 0;
    for (const [x, y] of corners) {
      const out = x < 0 || x >= COLS || y >= ROWS;
      if (out || (y >= 0 && this.board[y][x])) filled++;
    }

    if (filled < 3) return false;

    // Мини-T-spin: 3 угла, но без кик-оффсета.
    if (filled === 3 && this.lastKickIndex === 0) {
      this.miniTSpin = true;
    } else {
      this.miniTSpin = false;
    }
    return true;
  }

  /* ------------------------------------------------------------------ */
  /* Цикл                                                                */
  /* ------------------------------------------------------------------ */

  gravityInterval() {
    const level = Math.min(this.level, 20);
    const seconds = Math.pow(0.8 - (level - 1) * 0.007, level - 1);
    return Math.max(0.02, seconds);
  }

  softDropInterval() {
    return Math.max(0.025, this.gravityInterval() / 20);
  }

  update(dt) {
    if (this.status !== 'playing') return;

    if (this.clearing) {
      this.clearing.t -= dt;
      if (this.clearing.t <= 0) this.finishClear();
      return;
    }

    if (!this.current) return;

    if (this.softDropping) {
      this.softAcc += dt;
      const interval = this.softDropInterval();
      let guard = 0;
      while (this.softAcc >= interval && guard++ < 40) {
        this.softAcc -= interval;
        if (!this.softDrop()) break;
      }
    } else {
      this.gravityAcc += dt;
      const interval = this.gravityInterval();
      let guard = 0;
      while (this.gravityAcc >= interval && guard++ < 40) {
        this.gravityAcc -= interval;
        if (!this.moveDown()) {
          this.gravityAcc = 0;
          break;
        }
      }
    }

    if (this.grounded) {
      this.lockTimer += dt;
      if (this.lockTimer >= LOCK_DELAY) this.lockPiece();
    }
  }
}

export { COLS, ROWS, PIECE_COLORS };

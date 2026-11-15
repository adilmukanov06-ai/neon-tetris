/**
 * main.js — точка входа: игровой цикл, интерфейс, оверлеи.
 */

import { Tetris } from './engine.js';
import { Renderer } from './renderer.js';
import { Input } from './input.js';
import { loadBest, saveBest } from './storage.js';

const $ = (id) => document.getElementById(id);

const el = {
  canvas: $('game'),
  hold: $('hold'),
  next: $('next'),
  overlay: $('overlay'),
  overlayTitle: $('overlayTitle'),
  overlayText: $('overlayText'),
  startBtn: $('startBtn'),
  score: $('score'),
  level: $('level'),
  lines: $('lines'),
  best: $('best'),
  statTetris: $('statTetris'),
  statMax: $('statMax'),
  statCombo: $('statCombo'),
};

const game = new Tetris();
const renderer = new Renderer(el.canvas, el.hold, el.next);

let best = loadBest();
el.best.textContent = best.toLocaleString('ru-RU');

/* ------------------------------------------------------------------ */
/* Тосты (TETRIS, COMBO и т.д.)                                        */
/* ------------------------------------------------------------------ */

const stage = el.canvas.parentElement;
const toast = document.createElement('div');
toast.className = 'toast';
stage.appendChild(toast);

function showToast(text, kind = '') {
  toast.textContent = text;
  toast.className = `toast is-visible ${kind}`;
  toast.style.animation = 'none';
  void toast.offsetWidth; // перезапуск анимации
  toast.style.animation = '';
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => {
    toast.className = 'toast';
  }, 1400);
}

/* ------------------------------------------------------------------ */
/* Оверлеи                                                             */
/* ------------------------------------------------------------------ */

const OVERLAYS = {
  ready: {
    title: 'NEON TETRIS',
    text: 'Складывай фигуры, заполняй линии, ставь рекорд.<br>Управление — стрелки, <kbd>Space</kbd> — сброс.',
    button: 'ИГРАТЬ',
  },
  paused: {
    title: 'ПАУЗА',
    text: 'Нажми <kbd>P</kbd> или кнопку, чтобы продолжить.',
    button: 'ПРОДОЛЖИТЬ',
  },
  over: {
    title: 'ИГРА ОКОНЧЕНА',
    text: '',
    button: 'ЗАНОВО',
  },
};

function showOverlay(kind) {
  const preset = OVERLAYS[kind];
  if (!preset) return;
  el.overlayTitle.innerHTML = preset.title;
  el.overlayText.innerHTML = preset.text;
  el.startBtn.textContent = preset.button;
  el.overlay.classList.add('is-visible');
}

function hideOverlay() {
  el.overlay.classList.remove('is-visible');
}

/* ------------------------------------------------------------------ */
/* Действия                                                            */
/* ------------------------------------------------------------------ */

function startGame() {
  game.start();
  hideOverlay();
  updateHud(true);
}

function togglePause() {
  if (game.status === 'ready' || game.status === 'over') {
    startGame();
    return;
  }
  game.togglePause();
  if (game.status === 'paused') showOverlay('paused');
  else hideOverlay();
}

function restartGame() {
  startGame();
}

function gameOver() {
  const isNewRecord = saveBest(game.score);
  best = loadBest();
  el.best.textContent = best.toLocaleString('ru-RU');
  OVERLAYS.over.text = isNewRecord
    ? `Новый рекорд: <b>${game.score.toLocaleString('ru-RU')}</b> очков!<br>Строк: ${game.lines} · Уровень: ${game.level}`
    : `Очков: <b>${game.score.toLocaleString('ru-RU')}</b><br>Строк: ${game.lines} · Уровень: ${game.level}`;
  showOverlay('over');
}

/* ------------------------------------------------------------------ */
/* HUD                                                                 */
/* ------------------------------------------------------------------ */

let lastScore = 0;

function updateHud(force = false) {
  if (game.score !== lastScore || force) {
    el.score.textContent = game.score.toLocaleString('ru-RU');
    if (game.score !== lastScore) {
      el.score.classList.remove('stat__value--bump');
      void el.score.offsetWidth;
      el.score.classList.add('stat__value--bump');
    }
    lastScore = game.score;
  }
  el.level.textContent = game.level;
  el.lines.textContent = game.lines;
  el.statTetris.textContent = game.stats.tetrises;
  el.statMax.textContent = game.stats.maxCombo;
  el.statCombo.textContent = game.stats.tetrises + game.stats.tspins;
}

/* ------------------------------------------------------------------ */
/* Игровой цикл                                                        */
/* ------------------------------------------------------------------ */

let lastTime = performance.now();

/** Один шаг игры: логика + события + отрисовка. */
function tick(dt) {
  input.update(dt);
  game.update(dt);

  for (const event of game.drainEvents()) {
    switch (event.type) {
      case 'scored':
        if (event.label) {
          showToast(`${event.label} +${event.points.toLocaleString('ru-RU')}`,
            event.label.includes('TETRIS') || event.label.includes('SPIN') ? 'toast--hot' : '');
        }
        break;
      case 'levelup':
        showToast(`УРОВЕНЬ ${event.level}`, 'toast--level');
        break;
      case 'gameover':
        gameOver();
        break;
      default:
        break;
    }
  }

  renderer.draw(game, dt);
  renderer.drawHold(game);
  renderer.drawNext(game);
  updateHud();
}

function frame(now) {
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;
  tick(dt);
  requestAnimationFrame(frame);
}

/* ------------------------------------------------------------------ */
/* Инициализация                                                       */
/* ------------------------------------------------------------------ */

const input = new Input(game, {
  onStart: startGame,
  onPause: togglePause,
  onRestart: restartGame,
  onBlur: () => {
    if (game.status === 'playing') {
      game.pause();
      showOverlay('paused');
    }
  },
});

input.attachSwipe(el.canvas);

el.startBtn.addEventListener('click', () => {
  if (game.status === 'paused') togglePause();
  else startGame();
});

const resize = () => renderer.resize();
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 120));

if ('ResizeObserver' in window) {
  new ResizeObserver(resize).observe(el.canvas);
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden && game.status === 'playing') {
    game.pause();
    showOverlay('paused');
  }
});

// Первый кадр рисуем сразу, чтобы поле не было пустым.
renderer.resize();
renderer.draw(game, 0);
renderer.drawHold(game);
renderer.drawNext(game);
showOverlay('ready');

// Доступ к игре из консоли — удобно для отладки и автотестов.
window.__neonTetris = { game, renderer, input, tick };

requestAnimationFrame(frame);

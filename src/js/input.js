/**
 * input.js — управление с клавиатуры и тач-экрана.
 *
 * Клавиатура:
 *   ← / →   сдвиг (DAS 150 мс, ARR 35 мс — авто-повтор)
 *   ↓       мягкий сброс (x20), ↑ / X поворот по часовой, Z — против часовой
 *   Space   мгновенный сброс, C / Shift — отложить фигуру
 *   P / Esc пауза, R — заново, Enter — старт
 */

const DAS = 0.15;  // задержка перед авто-повтором
const ARR = 0.035; // интервал авто-повтора

export class Input {
  constructor(game, handlers = {}) {
    this.game = game;
    this.handlers = handlers;
    this.held = { left: false, right: false };
    this.das = { dir: 0, timer: 0, arr: 0 };
    this.touchHeld = false;
    this.swipe = null;

    this.onKeyDown = this.onKeyDown.bind(this);
    this.onKeyUp = this.onKeyUp.bind(this);
    this.onBlur = this.onBlur.bind(this);

    window.addEventListener('keydown', this.onKeyDown, { passive: false });
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);

    this.bindTouch();
  }

  /* ------------------------------------------------------------------ */

  onKeyDown(e) {
    const code = e.code;
    const key = e.key;

    const handled = [
      'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown',
      'Space', 'KeyX', 'KeyZ', 'KeyC', 'KeyP', 'KeyR', 'Enter',
      'ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight', 'Escape',
    ];
    if (!handled.includes(code)) return;
    if (e.target && /^(INPUT|TEXTAREA)$/.test(e.target.tagName)) return;
    e.preventDefault();
    if (e.repeat) return;

    switch (code) {
      case 'ArrowLeft':
        this.held.left = true;
        this.setDas(-1);
        this.game.move(-1);
        break;
      case 'ArrowRight':
        this.held.right = true;
        this.setDas(1);
        this.game.move(1);
        break;
      case 'ArrowDown':
        this.game.softDropping = true;
        this.game.softDrop();
        break;
      case 'ArrowUp':
      case 'KeyX':
        this.game.rotate(1);
        break;
      case 'KeyZ':
      case 'ControlLeft':
      case 'ControlRight':
        this.game.rotate(-1);
        break;
      case 'Space':
        this.game.hardDrop();
        break;
      case 'KeyC':
      case 'ShiftLeft':
      case 'ShiftRight':
        this.game.holdPiece();
        break;
      case 'KeyP':
      case 'Escape':
        this.handlers.onPause?.();
        break;
      case 'KeyR':
        this.handlers.onRestart?.();
        break;
      case 'Enter':
        if (this.game.status === 'ready' || this.game.status === 'over') {
          this.handlers.onStart?.();
        } else if (this.game.status === 'paused') {
          this.handlers.onPause?.();
        }
        break;
      default:
        break;
    }

    if (key === ' ' && code !== 'Space') e.preventDefault();
  }

  onKeyUp(e) {
    switch (e.code) {
      case 'ArrowLeft':
        this.held.left = false;
        this.refreshDas();
        break;
      case 'ArrowRight':
        this.held.right = false;
        this.refreshDas();
        break;
      case 'ArrowDown':
        this.game.softDropping = false;
        break;
      default:
        break;
    }
  }

  onBlur() {
    this.held.left = false;
    this.held.right = false;
    this.game.softDropping = false;
    this.refreshDas();
    this.handlers.onBlur?.();
  }

  setDas(dir) {
    if (this.das.dir !== dir) {
      this.das.dir = dir;
      this.das.timer = 0;
      this.das.arr = 0;
    }
  }

  refreshDas() {
    if (this.held.left && !this.held.right) this.setDas(-1);
    else if (this.held.right && !this.held.left) this.setDas(1);
    else {
      this.das.dir = 0;
      this.das.timer = 0;
      this.das.arr = 0;
    }
  }

  /* ------------------------------------------------------------------ */

  bindTouch() {
    const touchRoot = document.getElementById('touch');
    if (!touchRoot) return;

    touchRoot.querySelectorAll('[data-act]').forEach((btn) => {
      const act = btn.dataset.act;
      const press = (e) => {
        e.preventDefault();
        this.touchAction(act, true);
      };
      const release = (e) => {
        e.preventDefault();
        this.touchAction(act, false);
      };
      btn.addEventListener('pointerdown', press);
      btn.addEventListener('pointerup', release);
      btn.addEventListener('pointercancel', release);
      btn.addEventListener('pointerleave', release);
      btn.addEventListener('contextmenu', (e) => e.preventDefault());
    });
  }

  touchAction(act, isDown) {
    const game = this.game;
    switch (act) {
      case 'left':
        if (isDown) {
          this.held.left = true;
          this.setDas(-1);
          game.move(-1);
        } else {
          this.held.left = false;
          this.refreshDas();
        }
        break;
      case 'right':
        if (isDown) {
          this.held.right = true;
          this.setDas(1);
          game.move(1);
        } else {
          this.held.right = false;
          this.refreshDas();
        }
        break;
      case 'rotate':
        if (isDown) game.rotate(1);
        break;
      case 'hold':
        if (isDown) game.holdPiece();
        break;
      case 'down':
        game.softDropping = isDown;
        if (isDown) game.softDrop();
        break;
      case 'drop':
        if (isDown) game.hardDrop();
        break;
      default:
        break;
    }
  }

  /** Свайпы по игровому полю. */
  attachSwipe(target) {
    if (!target) return;
    target.addEventListener('pointerdown', (e) => {
      this.swipe = { x: e.clientX, y: e.clientY, moved: false, time: performance.now() };
    });
    target.addEventListener('pointerup', (e) => {
      const s = this.swipe;
      this.swipe = null;
      if (!s) return;
      const dx = e.clientX - s.x;
      const dy = e.clientY - s.y;
      const threshold = 24;
      if (Math.abs(dx) < threshold && Math.abs(dy) < threshold) {
        if (performance.now() - s.time < 300) this.game.rotate(1);
        return;
      }
      if (Math.abs(dx) > Math.abs(dy)) {
        this.game.move(dx > 0 ? 1 : -1);
      } else if (dy > 0) {
        this.game.softDropping = false;
        this.game.hardDrop();
      } else {
        this.game.rotate(1);
      }
    });
    target.addEventListener('pointercancel', () => { this.swipe = null; });
  }

  /* ------------------------------------------------------------------ */

  update(dt) {
    if (this.das.dir !== 0) {
      this.das.timer += dt;
      if (this.das.timer >= DAS) {
        this.das.arr += dt;
        let guard = 0;
        while (this.das.arr >= ARR && guard++ < 12) {
          this.das.arr -= ARR;
          this.game.move(this.das.dir);
        }
      }
    }
  }

  destroy() {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
  }
}

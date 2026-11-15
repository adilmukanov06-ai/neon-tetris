/**
 * storage.js — сохранение рекорда в localStorage (с безопасным фолбэком).
 */

const KEY = 'neon-tetris.best';

function safeGet(key) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* приватный режим / переполненное хранилище — игнорируем */
  }
}

export function loadBest() {
  const raw = safeGet(KEY);
  const value = Number.parseInt(raw ?? '0', 10);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export function saveBest(value) {
  if (value > loadBest()) {
    safeSet(KEY, String(value));
    return true;
  }
  return false;
}

/**
 * Юнит-тесты игрового ядра: npm test
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Tetris } from '../src/js/engine.js';
import { PIECE_ORDER, SHAPES, createBag } from '../src/js/pieces.js';

function cellsOf(piece) {
  return SHAPES[piece.type][piece.rot]
    .map(([dx, dy]) => [(piece.px + dx) / 2, (piece.py + dy) / 2])
    .sort((a, b) => a[1] - b[1] || a[0] - b[0]);
}

test('7-bag выдаёт каждую фигуру ровно один раз за мешок', () => {
  const bag = createBag();
  const first = new Set();
  for (let i = 0; i < 7; i++) first.add(bag.next());
  assert.equal(first.size, 7);
  assert.deepEqual([...first].sort(), [...PIECE_ORDER].sort());
});

test('координаты клеток всегда целые', () => {
  const game = new Tetris();
  game.start();
  for (const type of PIECE_ORDER) {
    for (let rot = 0; rot < 4; rot++) {
      const piece = { type, rot, px: type === 'I' || type === 'O' ? 9 : 8, py: type === 'I' || type === 'O' ? 1 : 2 };
      for (const [x, y] of cellsOf(piece)) {
        assert.ok(Number.isInteger(x), `x=${x} должен быть целым (${type}/${rot})`);
        assert.ok(Number.isInteger(y), `y=${y} должен быть целым (${type}/${rot})`);
      }
    }
  }
});

test('поворот T по часовой стрелке даёт правильную форму', () => {
  const game = new Tetris();
  game.start();
  game.current = { type: 'T', rot: 0, px: 8, py: 2 };
  assert.deepEqual(cellsOf(game.current), [[4, 0], [3, 1], [4, 1], [5, 1]]);
  assert.equal(game.rotate(1), true);
  assert.deepEqual(cellsOf(game.current), [[4, 0], [4, 1], [5, 1], [4, 2]]);
});

test('I у левой стены килкается и встаёт горизонтально', () => {
  const game = new Tetris();
  game.start();
  // вертикальная I в колонке 0
  game.current = { type: 'I', rot: 1, px: -1, py: 1 };
  assert.equal(game.rotate(1), true);
  const cells = cellsOf(game.current);
  assert.equal(cells.length, 4);
  const xs = cells.map(([x]) => x);
  const ys = cells.map(([, y]) => y);
  assert.deepEqual(xs, [0, 1, 2, 3], 'должна лечь в колонки 0..3');
  assert.equal(new Set(ys).size, 1, 'должна быть одна строка');
});

test('движение фигуры упирается в стены', () => {
  const game = new Tetris();
  game.start();
  game.current = { type: 'O', rot: 0, px: 9, py: 1 };

  let right = 0;
  while (game.move(1)) right++;
  assert.equal(right, 4, 'O занимает 4-5 и упирается в 8-9');
  const xs = cellsOf(game.current).map(([x]) => x).sort((a, b) => a - b);
  assert.deepEqual(xs, [8, 8, 9, 9], 'правый край должен упираться в колонку 9');

  let left = 0;
  while (game.move(-1)) left++;
  assert.equal(left, 8, 'от 8-9 до 0-1 — восемь сдвигов');
  const xs2 = cellsOf(game.current).map(([x]) => x).sort((a, b) => a - b);
  assert.deepEqual(xs2, [0, 0, 1, 1], 'левый край должен упираться в колонку 0');
});

test('очистка одной линии начисляет 100 очков', () => {
  const game = new Tetris();
  game.start();
  for (let x = 0; x < 9; x++) game.board[19][x] = 'J';
  game.current = { type: 'I', rot: 1, px: 17, py: 35 }; // вертикальная I в колонке 9
  game.hardDrop();
  assert.ok(game.clearing, 'очистка должна быть запущена');
  assert.equal(game.clearing.rows.length, 1);
  game.update(0.3);
  assert.equal(game.lines, 1);
  assert.equal(game.score, 100);
  assert.ok(game.board[19].filter(Boolean).length < 10, 'строка не должна остаться заполненной');
});

test('четыре линии дают тетрис и 800 очков', () => {
  const game = new Tetris();
  game.start();
  for (let y = 16; y < 20; y++) {
    for (let x = 0; x < 9; x++) game.board[y][x] = 'J';
  }
  game.current = { type: 'I', rot: 1, px: 17, py: 35 };
  game.hardDrop();
  game.update(0.3);
  assert.equal(game.lines, 4);
  assert.equal(game.score, 800);
  assert.equal(game.stats.tetrises, 1);
});

test('hold меняет фигуру местами и блокирует повторное использование', () => {
  const game = new Tetris();
  game.start();
  const first = game.current.type;
  game.holdPiece();
  assert.equal(game.hold, first);
  assert.equal(game.holdUsed, true);
  const second = game.current.type;
  game.holdPiece();
  assert.equal(game.current.type, second, 'второй hold до приземления игнорируется');
});

test('ghost-подсказка указывает на нижнюю свободную позицию', () => {
  const game = new Tetris();
  game.start();
  game.current = { type: 'O', rot: 0, px: 9, py: 1 };
  const ghost = game.ghostPosition();
  assert.deepEqual(cellsOf(ghost), [[4, 18], [5, 18], [4, 19], [5, 19]]);
});

test('переполнение поля завершает игру', () => {
  const game = new Tetris();
  game.start();
  for (let y = 0; y < 20; y++) {
    for (let x = 0; x < 10; x++) game.board[y][x] = 'J';
  }
  game.current = null;
  game.spawn();
  assert.equal(game.status, 'over');
});

test('уровень растёт каждые 10 линий', () => {
  const game = new Tetris();
  game.start();
  game.lines = 9;
  for (let x = 0; x < 9; x++) game.board[19][x] = 'J';
  game.current = { type: 'I', rot: 1, px: 17, py: 35 };
  game.hardDrop();
  game.update(0.3);
  assert.equal(game.level, 2);
});

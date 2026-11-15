# PLAN.md — Neon Tetris (GitHub + Vercel)

## Цель
Играбельный онлайн-тетрис, репозиторий на GitHub, автодеплой на Vercel, доступ по ссылке.

## Шаги
1. [x] Проверить окружение (git/node/npm есть, gh + vercel отсутствуют)
2. [x] Написать `PLAN.md`
3. [x] Каркас: `package.json`, `vercel.json`, `.gitignore`, `index.html`, `src/styles.css`
4. [x] Ядро игры (`src/js/`):
   - `pieces.js` — SRS-фигуры, таблицы кик-оффсетов, генератор 7-bag
   - `engine.js` — игровая логика (движение, поворот, lock delay, очистка линий, очки, T-spin)
   - `renderer.js` — отрисовка canvas (поле, призрак, next/hold, вспышки линий)
   - `input.js` — клавиатура (DAS/ARR), свайпы и экранные кнопки
   - `storage.js` — рекорд в localStorage
   - `main.js` — игровой цикл, UI, оверлеи
5. [x] Dev-сервер без зависимостей (`server.mjs`) + юнит-тесты (`tests/engine.test.mjs`)
6. [x] `README.md`
7. [x] `git init` + первый коммит
8. [ ] Установить GitHub CLI и авторизоваться -> создать репозиторий -> `git push`
9. [ ] Установить Vercel CLI и авторизоваться -> деплой -> получить production-ссылку

## Игровые механики (реализованы)
- Поле 10x20, 7-bag рандомизатор, SRS-поворот с полными кик-оффсетами (в т.ч. для I)
- Hold, очередь из 5 фигур, ghost-подсказка
- Lock delay 500 мс (до 15 сбросов), гравитация по уровню, soft/hard drop
- Очки: одиночные/двойные/тройные/тетрис, T-spin, back-to-back, комбо, уровень
- Управление: стрелки, Z/X поворот, Space, C hold, P пауза, R рестарт; тач-кнопки и свайпы

## Деплой
Статика без сборки -> Vercel отдаёт корень как есть (`vercel.json` без build-команды).
Ссылка будет вида `https://<project>-<hash>.vercel.app`.

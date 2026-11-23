> Обновление Sprint 05.1: правила внутренних компонентов и сохранение Select уточнены в [отчёте стабилизации](docs/SPRINT05_1.md). Числа аудита ниже относятся к состоянию до стабилизации.

# Публикация демоверсии на GitHub Pages

Production-демо: https://belemik.github.io/emikman_builder/

```sh
npm ci
npm run build
npm run preview:pages
```

Откройте http://127.0.0.1:4173/emikman_builder/ . `npm run build` создаёт публичную гостевую сборку в `dist`, base `/emikman_builder/`. В ней нет входа по паролю и серверных API. Кнопка «Выйти из системы» возвращает на стартовый экран демо; локальный холст остаётся доступным в этом браузере. Это не граница безопасности.

В GitHub откройте Settings → Pages → Build and deployment → Source: **GitHub Actions**. Workflow `.github/workflows/deploy.yml` запускается при push в main и вручную через Actions → Deploy demo to GitHub Pages → Run workflow. Публикуется только `dist`. Если первый deploy завершился ошибкой из-за выключенных Pages, включите Source и перезапустите workflow. Для workflow нужны разрешённые Actions и возможность deployment в environment `github-pages`.

Проверки: `npm run build:server`, `npm test`, `npm run build`, `npm run check:pages`.

Серверная версия: `npm run dev` для разработки; `npm run build:server && npm start` для production с настоящей авторизацией. Её файлы — `dist-server`, base `/`. На Pages она не публикуется.

Данные демо локальны: отдельный ключ localStorage `wdeaf.demo.emikman_builder.canvas.v2`; старые документы владельца не подхватываются. Разные браузеры/профили изолированы. Пользователи одного профиля браузера разделяют его локальные данные. localStorage не шифруется; другие приложения на том же origin `belemik.github.io` технически имеют доступ к хранилищу origin. Для конфиденциальных проектов используйте отдельный домен и серверную авторизацию. Общей базы проектов и синхронизации нет.

Шрифт Manrope по-прежнему загружается через Google Fonts; при блокировке сети используется системный fallback. SVG локальны. Роутера и вложенных страниц нет: единственная страница — `/emikman_builder/`, её обновление работает без SPA rewrite.

Если Push недоступен: GitHub Desktop → File → Add Local Repository → выбрать `Desktop/wdeaf_builder` → ветка main → Push origin. Не включайте `.data`, `.env`, резервные копии или папки сборок в коммит.

Подробный отчёт об изменениях: [PAGES.md](PAGES.md).

---

# WDeaf Builder · Sprint 02

Существующий React + TypeScript + Vite проект с закрытым доступом и каталогом **Button, Input, Select, Checkbox, Table**. Рабочая область: каталог, Canvas, инспектор «Свойства» / «Тема».

## Запуск на Mac

Нужен Node.js 22.12+ или 24 с npm.

```sh
cd ~/Desktop/wdeaf_builder_sprint_01
npm ci
npm run dev
```

Открыть http://127.0.0.1:5173. Остановить — Ctrl+C. HMR отключён: после изменения исходников обновляйте страницу. Используйте тот же hostname и порт, чтобы сохранялся доступ к localStorage.

### Локальный запуск на Windows

В PowerShell из каталога проекта:

```powershell
New-Item -ItemType Directory -Path .data
npm run user:add -- viktor
npm run dev
```

Если `.data` уже существует, первую команду пропустите. Пароль вводится скрыто и должен содержать 12–128 символов. Откройте http://127.0.0.1:5173 и войдите с созданными данными. Windows-проверки предназначены для локальной разработки: Unix-права `0700/0600` и `fsync` каталога там недоступны, поэтому эта конфигурация не подтверждает production-защиту или долговечность хранилища.

```sh
npm test
npm run build:server
npm start
```

Сборка — `dist/`. `npm start` и `npm run preview` раздают её через сервер с авторизацией. Не раздавайте dist напрямую для закрытого тестирования.

## Вход и профиль

Логин владельца — emikman, пароль задан отдельно. Хеши scrypt хранятся в `.data/users.json`, исключённом из Git и раздачи Vite. Пароль в клиентскую сборку не включён.

### Подготовка DATA_DIR перед первым аккаунтом

`addUser()` больше **не создаёт отсутствующий DATA_DIR и его родителей**. Перед `npm run user:add` оператор отдельно готовит доверенный локальный каталог: канонический путь, текущий владелец, точные права `0700`, стабильная доверенная цепочка родителей. Права сами по себе не доказывают отсутствие сторонних ACL или безопасный том. Не используйте для этой процедуры сетевой, FUSE, RAM или синхронизируемый каталог (включая iCloud). Сначала подтвердите локальный filesystem и доступ к родителям; при неопределённости остановитесь без записи.

Для локального Mac перейдите в **фактический checkout проекта** на заранее проверенном локальном томе. Его существующий родитель для `.data` должен уже быть подготовлен и иметь подтверждённые необходимые файловые барьеры. Выберите новый, ещё не существующий каталог:

```sh
export DATA_DIR="$(pwd -P)/.data"
```

Для пользовательского `DATA_DIR` вместо строки выше задайте **свой проверенный абсолютный канонический путь**. Например, `export DATA_DIR='/absolute/trusted/local-parent/zarya-accounts'` — лишь шаблон, не команда для копирования без проверки. Непосредственный родитель уже должен существовать. Если требуется новая цепочка родителей, оператор готовит и проверяет её отдельно, синхронизируя новые directory entries снизу вверх до уже долговечного ancestor включительно. Не используйте `mkdir -p`, рекурсивные `chmod/chown` или этот пример для исправления неизвестного существующего хранилища.

После проверки filesystem, ACL и стабильности родителей следующий блок создаёт **только новый конечный каталог**, отказывает при существующем пути и подтверждает локальные sync/reopen барьеры. Он не квалифицирует том и всю цепочку родителей автоматически:

```sh
node --input-type=module <<'JS'
import assert from 'node:assert/strict';
import { constants as c, closeSync, fstatSync, fsyncSync, lstatSync,
  mkdirSync, openSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
const path = process.env.DATA_DIR;
assert.ok(path && isAbsolute(path) && resolve(path) === path);
const parent = dirname(path), uid = process.getuid();
assert.equal(realpathSync(parent), parent);
const before = lstatSync(parent);
assert.ok(before.isDirectory() && !before.isSymbolicLink());
assert.equal(before.uid, uid);
assert.equal(before.mode & 0o022, 0);
const parentFd = openSync(parent, c.O_RDONLY | c.O_DIRECTORY | c.O_NOFOLLOW);
try {
  const opened = fstatSync(parentFd);
  assert.equal(opened.dev, before.dev); assert.equal(opened.ino, before.ino);
  assert.equal(realpathSync(parent), parent);
  mkdirSync(path, { mode: 0o700 }); // EEXIST: STOP, никаких изменений existing store.
  const created = lstatSync(path);
  assert.ok(created.isDirectory() && !created.isSymbolicLink());
  assert.equal(created.uid, uid); assert.equal(created.mode & 0o7777, 0o700);
  const directoryFd = openSync(path, c.O_RDONLY | c.O_DIRECTORY | c.O_NOFOLLOW);
  try {
    const openedDirectory = fstatSync(directoryFd);
    assert.equal(openedDirectory.dev, created.dev);
    assert.equal(openedDirectory.ino, created.ino);
    fsyncSync(directoryFd);
  } finally { closeSync(directoryFd); }
  fsyncSync(parentFd);
  assert.equal(realpathSync(path), path);
  const verifyFd = openSync(path, c.O_RDONLY | c.O_DIRECTORY | c.O_NOFOLLOW);
  try {
    const reopened = fstatSync(verifyFd);
    assert.equal(reopened.dev, created.dev); assert.equal(reopened.ino, created.ino);
    assert.equal(reopened.uid, uid); assert.equal(reopened.mode & 0o7777, 0o700);
  } finally { closeSync(verifyFd); }
} finally { closeSync(parentFd); }
console.log('Новый локальный DATA_DIR подготовлен; production durability не подтверждена.');
JS
```

До user:add проверьте ACL также у нового DATA_DIR: на Mac выполните `ls -lde "$DATA_DIR"`. При лишних или непонятных разрешениях — STOP, без автоматического изменения ACL, chmod или chown.

При любой ошибке STOP: сохраните созданные объекты для ручной проверки, не удаляйте их и не повторяйте блок автоматически. Для уже существующего каталога пропустите создание: отдельно проверьте canonical binding, владельца, `0700`, ACL, filesystem и необходимые барьеры; не изменяйте его автоматически. При разрешённом alias `users.json` родитель фактического target также должен быть доверенным, принадлежать текущему UID и иметь `0700`; неизвестные alias/symlink не создавайте и не исправляйте этим примером. Барьеры самого DATA_DIR не подтверждают публикацию ранее созданной цепочки родителей. Успешный локальный sync не доказывает физическую power-loss durability и не является разрешением production.

В **том же Terminal с тем же DATA_DIR** создайте аккаунт; это же значение передавайте при `npm run dev` / `npm start`:

```sh
npm run user:add -- tester
```

Если каталог отсутствует или не отвечает предусловиям, API выдаёт `ACCOUNT_WRITE_NOT_PUBLISHED`, а CLI — «Запись аккаунта не опубликована. При ошибке очистки нужна ручная проверка.». Устраните конкретную причину, проверьте готовность каталога и результат cleanup до новой попытки. Это описание данной попытки, а не гарантия отсутствия действий другого writer. Не меняйте пароль, account IDs или существующие записи ради обхода отказа.

### Неопределённая запись и stale lock

`ACCOUNT_WRITER_BUSY` после ожидания около 15 секунд не доказывает, что `.users.json.writer-lock` устарел. Возраст, найденный PID и таймаут не разрешают удаление. `ACCOUNT_WRITE_PUBLISHED_UNCONFIRMED` означает неопределённость самой публикации и/или долговечности после попытки rename; это не подтверждённый rollback. `ACCOUNT_WRITE_COMMITTED_CLEANUP_FAILED` означает подтверждённые file/directory sync, но неподтверждённый cleanup. В обоих случаях не повторяйте `user:add` вслепую. Отсутствие lock тоже не доказывает успех или отсутствие записи.

Ручная процедура: закройте новые account writes; докажите завершение **всех** writers/CLI/aliases и их I/O. Приватно зафиксируйте canonical пути, dev/ino, типы, права и точный состав lock/temp/target; с отдельным разрешением сохраните проверенную резервную копию, не публикуя users.json, usernames, passwords и hashes. Offline сопоставьте фактический JSON с намерением записи, устраните I/O-причину и отдельно подтвердите необходимые барьеры. Только после этого и отдельного решения для конкретного **пустого** lock допускается его точечное удаление с повторной сверкой dev/ino и sync родителя. Никаких auto-reclaim, wildcard, recursive delete, восстановления старого users.json или повторной записи наугад. Неизвестное содержимое, смена inode, живой writer или неоднозначный результат — STOP. Это не G1b session offline reset; процедура здесь не даёт разрешения работать с production.

Пароль вводится скрыто в Terminal (12–128 символов). Несколько людей могут войти под одним логином: сессии независимы между браузерами; выход завершает текущую сессию. Сессии живут 8 часов и сбрасываются после перезапуска сервера. HttpOnly, SameSite=Strict; при HTTPS — Secure. Лимит попыток: 10 за 15 минут на адрес соединения; за reverse proxy лимит может быть общим.

Аватар открывает личный кабинет с темой оболочки «Светлое / Системное / Тёмное» и выходом. Эта настройка не меняет тему Canvas.

## Canvas и тема

Добавляйте компоненты из seed, выбирайте, перемещайте и удаляйте. В инспекторе варианты Figma отделены от контента редактора. Table — составной паттерн; варианты table-cell не перенесены на корневой Table.

Во вкладке «Тема»: HEX-цвет, радиус 0–32px и шрифт. Токены из `tokens.verified.seed.json` неизменяемы. «Сбросить настройки» применяет дефолты редактора с радиусом 8px. «Восстановить WDeaf» удаляет overrides и возвращает отдельные базовые значения компонентов; radius-4 не используется как универсальный радиус.

Manrope подключается штатным Google Fonts CSS; при отсутствии сети используется системный шрифт. Сами overrides не выполняют запросов.

## Документы

JSON v2 содержит `schemaVersion`, `platform: "web"`, `elements`, `themeOverrides`. Импортируется и Sprint 01 v1 с полем `theme`; IDs, порядок, variantProps и editorProps сохраняются. Радиус v1 выше 32 ограничивается 32 с предупреждением. Перед перезаписью прежнего локального v1 создаётся ключ `.sprint01-backup`. Исходный файл импорта не изменяется.

Данные хранятся в браузере отдельно для аккаунта; выход не удаляет работу. Для переноса — Export/Import JSON. Ограничения: 2 МБ, 500 элементов, 2000 символов на контентное поле, 100 символов на имя шрифта. Неизвестные enum, некорректные boolean, лишние поля отклоняются; текст не исполняется.

## Структура

```text
src/
  main.tsx, account.tsx, styles.css
  registry/      # исходный seed + Sprint 02
  tokens/        # immutable verified tokens
  canvas/        # документ и пять preview
  inspector/     # динамические поля
  theme/         # themeOverrides и Theme Editor
  appearance/    # только тема оболочки
  ui/            # Avatar, ButtonClose, SVG-иконки
  storage/       # валидация, миграция, backup, JSON
  prompt/        # Figma verified / Editor override
  ai/            # контракт команд без LLM
server/          # существующая авторизация, без изменений Sprint 02
public/          # оригинальные локальные SVG
 tests/          # тесты документа, темы, preview и авторизации
```

Подробный список изменённых файлов, проверки и ограничения — [SPRINT02.md](SPRINT02.md). Источники компонентов — [design-sources.md](design-sources.md).

## Размещение

Публичная ссылка пока не создана. Нужен HTTPS reverse proxy и Node.js-хостинг с постоянным диском для `.data`, один процесс приложения. До user:add подготовьте и проверьте DATA_DIR по разделу «Подготовка DATA_DIR перед первым аккаунтом»; передавайте один и тот же DATA_DIR в CLI и backend. Не публикуйте .data или резервные копии. Это описание возможного размещения, а не разрешение production deployment.

```sh
APP_ORIGIN=https://builder.example.com HOST=0.0.0.0 PORT=3000 DATA_DIR=/persistent/wdeaf npm start
```

Замените домен и каталог на реальные; APP_ORIGIN задаётся без завершающего слеша. Не публикуйте dev-сервер.

## Design System Contract

Правила и ограничения: [DESIGN.md](DESIGN.md). Архитектура будущего MCP: [docs/MCP_ARCHITECTURE.md](docs/MCP_ARCHITECTURE.md); сервер пока не реализован.

`npm run ds:validate` проверяет артефакты против seed, типы и строгий эталонный экран. Для своего JSON: `npm run ds:validate -- project.json`. Старые проекты с пользовательскими стилями можно проверить через `-- --compatible project.json`; это проверка совместимости, не подтверждение DS. Sprint 04 подключает v3 к строгому renderer, импорту и экспорту. Canvas продолжает хранить v2 через toCanvasV2; при импорте v3 tokenReferences опускается с предупреждением. Theme Editor и прежние JSON сохраняют редакторский preview.

## Sprint 04: DS Renderer

В Canvas доступны «Редакторский preview» и «Строгий DS Renderer». Первый сохраняет Theme Editor; второй отклоняет overrides и неподдерживаемые варианты. Проверенная матрица, источники Figma, визуальные тесты и ограничения: [docs/SPRINT04.md](docs/SPRINT04.md).

Команды: `npm run typecheck`, `npm run ds:validate`, `npm test`, `npm run build`, `npm run test:visual`. Для визуальных тестов сначала `npx playwright install chromium`. Локальные шрифты поставляются с OFL. Автоматическая публикация не изменена; текущая работа ведётся в feat/ds-renderer.

## Sprint 05 — Component Library

Canvas хранит v3, tokenReferences и разрешённые вложения без потерь. v1/v2 автоматически мигрируют с резервной копией localStorage. Добавлены Tags, Chip, внутренние Hint/Label/ItemsList, DropdownMenu и минимальный интерактивный Select; строгий renderer блокирует варианты вне проверенной матрицы. Точное покрытие и ограничения: [docs/SPRINT05.md](docs/SPRINT05.md).

Проверки: `npm run typecheck`, `npm run ds:validate`, `npm test`, `npm run build`, `npm run test:visual`, `npm run check:pages`. Для первого запуска браузерных тестов: `npx playwright install chromium`.

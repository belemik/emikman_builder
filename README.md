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

```sh
npm test
npm run build:server
npm start
```

Сборка — `dist/`. `npm start` и `npm run preview` раздают её через сервер с авторизацией. Не раздавайте dist напрямую для закрытого тестирования.

## Вход и профиль

Логин владельца — emikman, пароль задан отдельно. Хеши scrypt хранятся в `.data/users.json`, исключённом из Git и раздачи Vite. Пароль в клиентскую сборку не включён.

```sh
npm run user:add -- tester
```

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

Публичная ссылка пока не создана. Нужен HTTPS reverse proxy и Node.js-хостинг с постоянным диском для `.data`, один процесс приложения. Создайте аккаунты на сервере командой user:add; не публикуйте .data или резервные копии.

```sh
APP_ORIGIN=https://builder.example.com HOST=0.0.0.0 PORT=3000 DATA_DIR=/persistent/wdeaf npm start
```

Замените домен и каталог на реальные; APP_ORIGIN задаётся без завершающего слеша. Не публикуйте dev-сервер.

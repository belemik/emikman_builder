# GitHub Pages: изменения и проверки

- `vite.config.ts`: production base `/emikman_builder/`, вывод `dist`; development `/`; server build `/` и `dist-server`.
- `.github/workflows/deploy.yml`: npm ci, server build, tests, Pages build, проверка артефакта, upload только dist, deploy при push в main и workflow_dispatch. Actions закреплены SHA, права публикации только в deploy job.
- `package.json`: команды build:server, build:pages (алиас build), preview:pages и check:pages.
- `src/runtime.ts`, `src/vite-env.d.ts`: build-time режим, пути ресурсов и отдельный ключ гостевого Canvas.
- `src/demo.tsx`: явно публичный гостевой доступ, настройки оформления и выход на стартовый экран без удаления Canvas.
- `src/main.tsx`: выбор между настоящей серверной авторизацией и гостевой демонстрацией; аватар справа после действий; сообщение о локальном хранении.
- `src/account.tsx`, `src/ui/index.tsx`, `src/ui/CatalogSample.tsx`, `src/canvas/CheckboxPreview.tsx`, `src/canvas/SelectPreview.tsx`: base-aware SVG пути.
- `src/ui/styles.css`: только оформление стартового экрана демо.
- `server/index.mjs`: путь server production изменён на dist-server; проверки сессий, вход и выход не изменены.
- `scripts/check-pages.mjs`: проверка base и файлов HTML-ресурсов, отсутствие приватных папок и кода серверной авторизации в артефакте.
- `tests/pages.test.ts`: стартовый экран демо, пространство хранения и формирование экспортируемого JSON.
- `.gitignore`: исключены дополнительные сборки и файлы ключей; `.data`, `.env`, `.backups` уже исключены.
- `README.md`, `PAGES.md`: запуск, публикация, ограничения.

## Безопасность

Проверены отслеживаемые файлы и доступные Git blobs истории: не обнаружены известный реальный пароль, хеши локальных пользователей, типовые API-токены и приватные ключи. `.data`, `.env`, `.backups` не отслеживаются. В auth-тестах используются только фиктивные тестовые пароли. Проверка шаблонов не гарантирует обнаружение всех возможных секретов.

Pages публичен, без реальной авторизации. Настоящая авторизация остаётся на Node.js (scrypt, HttpOnly/SameSite cookies, Secure при HTTPS, ограничение попыток). Серверные аккаунты не отправляются в GitHub/Pages. Кнопка выхода из демо не защищает localStorage и не удаляет холст. На общем устройстве нужен отдельный профиль браузера. Origin GitHub Pages общий с другими проектами этого владельца; это не хранилище конфиденциальных данных.

## Проверка

Обе production-сборки проходят. Тесты проверяют Canvas/JSON, темы, варианты Figma, промпты и серверные сессии. В браузере проверены гостевой вход, добавление компонентов, изменение свойств, Theme Editor, генератор промпта, окно настроек, расположение аватара справа, выход и возврат с сохранённым холстом. Загрузка файла через browser automation не подтвердилась из-за таймаута события download; сериализация экспорта и JSON round-trip проверяются тестами.

Новых маршрутов нет. Google Fonts остаётся внешней зависимостью с системным fallback. Исходные seed-файлы, токены и схемы JSON не менялись.

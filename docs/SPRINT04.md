# Sprint 04 — Design System Renderer

Ветка: `feat/ds-renderer`. Изменения в main не отправляются. Незакоммиченный Contract прошлого этапа сохранён в рабочей ветке.

## До реализации

Canvas сохранял v2 и импортировал v1/v2 через собственный storage.parseDocument. DS Validator v3 не применялся ни к UI-редактированию, ни к generatePrompt. Существующий Preview был приближённым и использовал пользовательские overrides. Авторизация, профиль и деплой не требуют изменений для renderer.

## Реализовано

- Независимые `prepareRender(unknown)` и `DSRenderer`: строгая проверка схемы на каждом вызове, затем проверка точной матрицы реализации. Ошибка блокирует весь экран, без частичного рендера и без fallback на похожий компонент.
- Семантические React button/input/checkbox, native disabled, aria-invalid, aria-checked=mixed, настоящий indeterminate; тексты экранируются, props/style из JSON не распространяются на DOM.
- Отдельный переключатель Canvas: редакторский preview (старое поведение и Theme Editor) / строгий renderer (оригинальные образцы, без overrides). Выбор элемента открывает существующий Inspector; изменения Checkbox возвращаются в документ.
- Импорт v1/v2/v3, изменения из Inspector/Theme Editor/каталога, обычный промпт проходят DS validation в compatible-режиме. Сохранённые v2 и их локальные ключи не меняются. Строгий renderer, строгий промпт и экспорт v3 используют strict + capability check.
- В строгом режиме нельзя экспортировать или генерировать допустимое задание для неподдерживаемого экрана. В редакторском режиме остаются Select/Table, все прежние варианты и пользовательские overrides с явной маркировкой.
- `tokens.renderer.seed.json`: 12 дополнительно подтверждённых токенов. Исходные 20 токенов не изменены; контракт 1.1.0 знает 32. Старый Theme Editor продолжает использовать прежнюю базу и настройки, новые токены относятся к renderer.
- Manrope 400/500 поставляется локально через @fontsource/manrope; OFL в public/licenses. Отсутствие Google Fonts не ломает renderer. Геометрия компонента фиксирована по design_context, а не из произвольного CSS документа.

## Матрица Figma

Файл `wiJYO9bWctpEiq2STFkNYU`, повторное чтение get_design_context + screenshots + get_variable_defs. Полная таблица node IDs находится в `src/renderer/prepare.ts`.

| Компонент | Реализованные варианты | Геометрия образца |
|---|---|---|
| Button | m / primary / accent, default/hover/pressed/disabled (4) | h35, min-width36, radius4, горизонтальные отступы 12+4 с каждой стороны; Manrope Medium 12/14 |
| Input | l; default/hover/pressed/filled/error/disabled default при placeholder false/true; disabled filled только false (13) | width280, h50, radius6, padding12, gap2; body14/18, caption12/14; pressed+placeholder true: 16/24 и sample caret |
| Checkbox | s; default/hover/pressed/disabled; unchecked, checked, mixed (12) | container24, padding2, frame20, radius3, border1.5, gap8, body16/20 |

Button: `15:17377`, `15:17429`, `15:17401`, `15:17529`. Input: `115:71`–`115:181`, точный список в prepare.ts. Checkbox: `44:355`, `44:360`, `44:365`, `44:371`, `44:397`, `44:403`, `44:409`, `44:416`, `44:447`, `44:453`, `44:459`, `44:466`.

SVG checked/mixed скачаны оригиналами из design_context, не перерисованы и не перекрашиваются. Локальные пути, root geometry и SHA-256 — `design-system/renderer-assets.json`. Внешние иконки Button/Input отключены в исследованных образцах и не добавлены в API.

Новые имена токенов: surface/primary/hover, surface/primary/pressed, surface/disabled/overlay-light, text/disabled/overlay-strong, surface/neutral/overlay-light, border/primary/hover, border/primary/pressed, border/error/default, text/error/default, icon/neutral/overlay-strong, Typography/Desktop/caption/font-size/2XS и Typography/Desktop/caption/line-height/2XS. Значения и verifiedAtNode зафиксированы в seed. Числа геометрии и weight400/500 из design_context — параметры конкретных образцов, не выдуманные глобальные токены.

## Границы и расхождения

- Это минимальный renderer. Button s/l/xl, другие variant/colorScheme, Input s/m и Checkbox xs пока не реализованы строго. Select/Table остаются только в редакторском preview.
- Input l / disabled filled / placeholder=true отсутствует в полученной матрице Figma и отклоняется renderer. Checkbox mixed при checked=false отклоняет сам контракт.
- Input text и caret — демонстрационные значения образца. Ввод пользователем временный и не экспортируется: поле value не добавлено в неподтверждённый editorProps API.
- При импорте v3 в существующий Canvas v2 tokenReferences опускается с явным предупреждением. Это декларация зависимостей, не стили; исходный v3 следует сохранить. Экспорт строгого Canvas создаёт новый v3 с пустым manifest. Полное хранение v3 в Canvas — следующий этап.
- Реальное hover/pressed поведение адаптировано для native controls; keyboard focus использует браузерный индикатор доступности, не объявленный новым Figma-токеном. Принудительное состояние Inspector фиксирует preview.
- Линейное размещение и отступы между образцами — оболочка редактора, а не подтверждённый layout primitive Figma.
- Снимки Playwright — regression baseline реализации на macOS/Chromium, не автоматический pixel-diff с Figma. Возможны различия растрирования шрифта/внутренних native input metrics. Pixel-perfect всей библиотеки не заявляется.

## Проверки и команды

```sh
npm run typecheck
npm run ds:validate
npm test
npm run build
npx playwright install chromium
npm run test:visual
npm run build:server
npm run check:pages
```

28 unit/integration/auth tests: схема + матрица 29 вариантов, отклонение unknown/unsupported/overrides, повторная валидация изменённого объекта, экранирование контента, границы импорта/редактирования/промпта/экспорта, геометрия оригинальных SVG, все предыдущие проверки Canvas/сессий.

Playwright: все 29 образцов, native disabled/error/mixed, загрузка Manrope без Google Fonts, SVG20x20, реальный hover, изменение Checkbox, блокировка overrides и возврат в прежний preview. Снимки: `tests/visual/renderer.spec.ts-snapshots/`. Новые эталоны создаются только после просмотра через `npm run test:visual -- --update-snapshots`; другие ОС потребуют отдельного подтверждения эталонов.

## Готовность к MCP

Core validation и prepareRender — чистые функции, пригодные для будущего MCP adapter. MCP может выдавать schemaValid и rendererSupported отдельно, с code/path/message, без выполнения JSX на сервере. Полноценный MCP не реализован: нужны version negotiation, capability resource, ограничения transport, отдельная авторизация для remote, полное хранение v3 и расширение проверенной матрицы. Готов минимальный локальный контракт между схемой и renderer, не весь production MCP-сервис.

## Файлы

Новые: src/renderer/*, tokens.renderer.seed.json, public/ds-renderer/*, public/licenses/Manrope-OFL.txt, design-system/renderer-assets.json, design-system/examples/renderer.v3.json, tests/renderer.test.ts, tests/visual/*, playwright.config.ts, docs/SPRINT04.md.

Изменены: src/main.tsx (режим и validation boundaries), src/prompt/index.ts, src/storage/index.ts (только тип версии экспорта), scripts/ds-generate.mjs, generated contract artifacts, contract version/typecheck/tests, package.json/package-lock.json, .gitignore и документация. Авторизация, профиль, Vite base и GitHub Pages workflow в Sprint 04 не менялись; существовавшая до спринта строка ds:validate в workflow сохранена.

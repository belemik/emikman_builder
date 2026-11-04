> Обновление Sprint 05.1: правила внутренних компонентов и сохранение Select уточнены в [отчёте стабилизации](SPRINT05_1.md). Числа аудита ниже относятся к состоянию до стабилизации.

# Sprint 05 — Component Library

Ветка `feat/ds-component-library` создана от проверенного Sprint 04 (`3a2a12b`, `feat/ds-renderer`). В main ничего не отправлено. Авторизация, профиль, Theme Editor, настройки appearance, Vite base и GitHub Pages workflow не менялись.

## Результат и точная граница покрытия

Добавлено **10 семейств**, из них **7 доступны как самостоятельные элементы каталога**, а **3 используются только внутри родительских компонентов**. Select расширен без дублирования существующего ID. В каталоге теперь 12 самостоятельных элементов, в типизированном реестре — 15 записей.

| Семейство | Проверено и реализовано | Всего в указанном Figma set |
|---|---:|---:|
| TagItem | 24 | 24 |
| TagInput | 6 | 6 |
| TagMore | 12 | 12 |
| TagGroup | 8: amount 1/2, size m, closable/disabled | 240 |
| Chip | 32 | 32 |
| Hint Container, внутренний | 3 | 3 |
| Label, внутренний | 1 | 1 |
| DropdownMenu (строка/заголовок/разделитель) | 28 | 28 |
| ItemsList, внутренний | 20 | 20 |
| Elements / DropdownMenu (контейнер) | 1 | 1 |
| Select, существующее семейство | 8 | 90 |
| Tooltip | 0 — только аудит метаданных | 24 |
| Tooltips (popover) | 0 — только аудит метаданных | 15 |

Итого **143 сочетания в расширении**: 135 у новых семейств и 8 у Select. Вместе с 29 образцами Sprint 04 — 172. Это число исходных Figma-вариантов, а не число всех комбинаций текстов, вложений и boolean component properties.

Select: `l`, label=true; placeholder=true для default/hover/filled/error/disabled default/pressed down/pressed up, placeholder=false только для disabled filled. Другие существующие варианты Select остаются доступными в прежнем редакторском preview; строгий renderer их блокирует.

## Прямые данные Figma

Источник: [WDeaf PRO Design System 2.0](https://www.figma.com/design/wiJYO9bWctpEiq2STFkNYU/WDeaf-PRO-Design-System-2.0). Сессия аудита `fca4f8fb-c47f-4f04-a497-2e9915cf553f`, 30.10.2026.

- TagItem: size, variant, state; component properties closable, labelText.
- TagInput: size, variant. Текст «Input text|» — образец, отдельное неподтверждённое поле value не добавлено.
- TagMore: size, variant, state; «Add Tag» — фиксированный текст оригинала.
- TagGroup: amount, closable, disabled, size. Используются оригинальные TagItem и TagMore с gap 8 в подтверждённом размере m.
- Chip: variant, selected, state, icon; counter и labelText. Counter «3» фиксирован в исследованных экземплярах; произвольное значение counterText не добавлено. iconVariant — instance swap, пользовательский произвольный SVG/JSX не разрешён.
- Hint: hint, counter, hintText, counterText; оба false отсутствуют в оригинале и отклоняются.
- Label: исходные странные названия hint=Elements, counter=Hint Container, Property 3=Elements, Property 4=Label сохранены; necessarily подтверждён как boolean. В Input наследуется существующий текст label.
- DropdownMenu: type (`menu item`, `group title`, `group divider`), size, selected, hover, disabled, icon2; itemText. Неизвестные сочетания этих свойств отклоняются по списку реальных узлов. Дополнительные slots radio/checkbox/preffixSlot/icon/hint и instance swap видны в источнике, но ещё не реализованы и не принимаются как разрешённые props.
- ItemsList: amount=x1…x10, size=m/s. Контейнер Elements / DropdownMenu имеет оригинальные padding, radius и shadow; у него не добавлены выдуманные variant props.
- Select сохраняет исходные названия size/state/placeholder/label/foldDirection. optionsText, labelText и placeholderText остаются историческим editor content, а не новыми Figma component properties.

Фактические перечни свойств, размеры всех узлов и точные ID: `design-system/figma-sprint05/audit.json` и `metadata.json`. Высокоточные ответы design_context для реализованных ветвей сохранены в `.txt`; временные asset URLs удалены из этих файлов. Ссылки на конкретные оригиналы доступны из Inspector.

25 новых токенов получены через get_variable_defs: семантические нейтральные/primary/error поверхности, границы и текст, размеры 3XS и необходимые цвета иконок. Контракт **1.2.0**, всего **57 токенов**. База Theme Editor не заменена. Размеры и spacing конкретных образцов не объявляются универсальными токенами. Используется существующий локальный Manrope.

19 оригинальных SVG скачаны без изменения. `design-system/library-assets.json` фиксирует nodeId, путь, root width/height и SHA-256. Runtime не обращается к временным URL Figma.

## Canvas v3 и составные компоненты

Canvas теперь читает и сохраняет Screen Schema v3. `tokenReferences`, ID, тексты, порядок, themeOverrides и вложения проходят импорт → редактирование → сохранение → перезагрузку → экспорт без потерь. Старые v1/v2 мигрируют через единый DS Validator; до первой записи резервируется исходная строка в `<storageKey>.pre-v3-backup`. Ключи аккаунтов/гостя не меняются. Историческое ограничение радиуса v1 до 32 px остаётся с предупреждением.

Опциональное `slots` — закрытая структура документа Builder, **не выдуманное свойство Figma** и не API произвольного layout:

- Input: hint → Hint Container, label → Label; только подтверждённый l/default/placeholder=false для нового составного renderer.
- TagGroup: tags → TagItem; размер, состояние, closable и количество обязаны соответствовать родителю.
- ItemsList: items → DropdownMenu; размер и количество обязаны совпадать с вариантом списка.
- Elements / DropdownMenu: items → один ItemsList.
- Select собирает ItemsList и DropdownMenu из существующего optionsText (1–10 непустых строк).

Inspector позволяет включать и редактировать только эти слоты; внутренние компоненты нельзя добавить в корень Canvas. Ограничены глубина, число элементов и уникальность ID, включая вложения. Неизвестные поля, произвольные styles/children и неподдерживаемые сочетания блокируют строгий экран целиком.

Старый `toCanvasV2` оставлен как явный legacy adapter с предупреждением о потере manifest; приложение его больше не вызывает. Прежние v3 без slots остаются валидны. Внешним потребителям расширения slots нужен контракт 1.2.0.

## Поведение и ограничения

Select реально открывает/закрывает список, выбирает мышью и клавиатурой (стрелки, Home/End, Enter/Space, Escape), закрывается при клике вне и потере фокуса. Есть native disabled, combobox/listbox/option и aria-invalid. Выбранное значение временное, как и в прежнем preview: неизвестное Figma value не добавляется в документ. optionsText сохраняется полностью.

Chip переключает selected и сохраняет изменение в Canvas. Input и TagInput допускают временный ввод. TagItem/TagMore/TagGroup пока представлены как Figma-preview: действие добавления/удаления тегов выполняется через Inspector/Canvas, не через декоративные крестик/плюс. Для TagItem s/xs источник показывает крестик независимо от closable; сохранено поведение источника. Эта особенность требует отдельного уточнения библиотеки Figma.

Не реализованы 232 варианта TagGroup, остальные 82 варианта Select, Tooltip/popover и дополнительные instance swaps/внутренние controls меню. У Tooltip/popover извлечены исходные названия вариантов и размеры, но визуальный renderer не заявляется. Новые семейства используют оригинальную тему и в редакторском preview; пользовательские overrides продолжают работать для прежних preview, строгий режим по-прежнему отвергает overrides.

Снимки — просмотренные эталоны реализации macOS/Chromium, не автоматическая pixel-perfect сертификация всей Figma. Старые снимки Sprint 04 не изменились. Навигация фокусом использует native индикатор доступности, а не новый токен Figma.

## Проверки

- `npm run typecheck`
- `npm run ds:validate`
- `npm test`: 31 schema/component/integration tests + 2 server auth tests.
- `npm run build`
- `npm run test:visual`: 7 сценариев Chromium, включая 2 прежних. Снимки Tags, Chip, DropdownMenu, Input+Hint+Label, Select default/hover/filled/error/disabled, открытый список; проверка обоих направлений, клавиатуры, реальных размеров SVG, JSON download и reload.
- `npm run check:pages`

Проверка каждой из 143 строк матрицы связывает metadata → validation → renderer → source node. Негативные тесты проверяют неверные комбинации, внутренние корневые элементы, чужие слоты, неверный TagItem в группе, duplicate IDs и произвольные стили. Отдельно проверены v3 round-trip и сохранение tokenReferences.

## Основные файлы

Новые: `components.sprint05.seed.json`, `tokens.sprint05.seed.json`, `src/renderer/library.tsx`, `library-capabilities.ts`, `src/canvas/composition.ts`, `src/design-system/composition.ts`, `design-system/library-matrix.json`, `library-assets.json`, аудит Figma, примеры v3, `public/ds-library/*`, `tests/library.test.ts`, `tests/visual/library.spec.ts` и снимки.

Изменены: Registry, Screen Schema/Validator/generator, Canvas model/storage/boundary, Inspector, Renderer, main, Preview, prompt, связанные тесты миграции и документация. Новые зависимости не устанавливались.

Для MCP готовы чистые validation/capability функции и v3 без потерь. Нужны переговоры версии контракта и публикация точной матрицы capabilities; MCP transport/server в этом спринте не реализуется.

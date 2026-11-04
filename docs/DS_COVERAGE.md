> Обновление Sprint 05.1: правила внутренних компонентов и сохранение Select уточнены в [отчёте стабилизации](SPRINT05_1.md). Числа аудита ниже относятся к состоянию до стабилизации.

# WDeaf PRO 2.0 — Inventory & Coverage (Sprint 06)

Дата: 30.10.2026. Ветка: `feat/ds-component-library`. Аудит существующего рабочего дерева Sprint 05; приложение в этом спринте не изменялось.

Источник: [WDeaf PRO Design System 2.0](https://www.figma.com/design/wiJYO9bWctpEiq2STFkNYU/WDeaf-PRO-Design-System-2.0). Прямой read-only обход всех **54 страниц** через интеграцию Figma, session `6402d53e-621c-4b5e-97dc-3faba19e180f`. Никаких новых props, токенов или компонентов не добавлено.

## Результат

| Метрика | Значение |
| --- | ---: |
| Component Sets во всём файле | 389 |
| COMPONENT вне Component Set (структурно standalone, не обязательно публичные) | 1 313 |
| Варианты — COMPONENT внутри Component Set | 4 311 |
| Всего COMPONENT, включая варианты | 5 624 |
| Определения семейств/ресурсов: sets + standalone | 1 702 |
| UI: sets / standalone / варианты | 126 / 4 / 3 089 |
| UI-определения, включая внутренние | 130 |
| UI-определения с поддержкой Renderer хотя бы одного образца | 14 / 130 = **10,77%** |
| UI-варианты, поддержанные строгой матрицей | 171 / 3 089 = **5,54%** |
| Самостоятельные COMPONENT-образцы UI, поддержанные Renderer | 1 / 4 |
| По всему файлу, включая ресурсы: определения / варианты | 14 / 1 702 = **0,82%** / 171 / 4 311 = **3,97%** |

**10,77% — доля UI-определений с частичной реализацией, включая отдельно учтённые внутренние определения, а не доля полностью готовых самостоятельных компонентов.** Полноценное функциональное покрытие не сертифицировано. Точный процент исключительно публичных семейств — `not verified`: у части узлов назначение не описано, а часть дополнительных чтений descriptions была заблокирована лимитом автоматической проверки разрешений. Эти неопределённости не влияют на подтверждённые структурные количества и проценты выше.

Из 130 UI-определений **116 вообще не имеют строгой реализации**. Из 3 089 UI-вариантов отсутствуют **2 918**. Восемь наборов покрыты по всем variant-node строкам: TagItem, TagInput, TagMore, Chip, Hint, Label, DropdownMenu (строка), ItemsList. Это не означает полноту component properties, вложений и действий.

Прежние «172 варианта» Sprint 05 уточняются: **171 вариант + 1 standalone-компонент** `177:10720`. Нельзя считать последний вариантом Component Set. У нового Label действительно один вариант в Component Set; это не standalone COMPONENT.

## Методика и границы подсчёта

- Один `COMPONENT_SET` — одно определение, независимо от числа вариантов. Варианты считаются по непосредственным детям `COMPONENT`, без декартова произведения props.
- `COMPONENT` вне набора учитывается отдельно; это технический тип узла, а не разрешение на самостоятельное использование.
- INSTANCE, Frame, демонстрационные экраны и копии вложенных instances не увеличивают количество семейств. Повторяющиеся имена не объединяются: два Stepper, Progress circle и дубли названий флагов имеют разные ID.
- UI — страницы компонентов от Button до Other. Icons, Files, Emojis, Flags, Favicons, Patterns, Cursors вынесены в ресурсы. Наличие картинки в оболочке не равно компоненту Screen Schema.
- Implemented Variants — число уникальных исходных узлов, разрешённых `sourceNode()` / `libraryNode()` и покрытых текущими тестами. Это ограниченная матрица оригинальной темы, не pixel-perfect сертификация и не число комбинаций произвольного текста.
- Для неизвестных styles/props и назначения используется `not verified`. Нулевое число на пустой странице получено обходом, а не отсутствием доступа.

Машиночитаемые доказательства: [полный инвентарь с descriptions и классификацией](ds-coverage-inventory.json), [полная таблица 1 702 определений](ds-coverage.csv). В CSV есть все требуемые колонки и дополнительная Role; ни одна иконка/страна не потеряна. Ниже — таблица всех 130 UI-определений и сводка всех страниц.

## Внутренние элементы и ошибки каталога

Прямые descriptions Figma подтверждают **14 внутренних Component Sets, 163 варианта**. Это минимальное подтверждённое число, не заявление, что остальных внутренних элементов нет. Ещё **22 определения** имеют признаки внутренних элементов (`Elements /`, `_`, `.`, table-cell), но исключительность назначения — `not verified`; они не объявляются полноценными самостоятельными семействами.

У Builder 15 записей Registry, 12 видимых корневых записей и 3 slot-only. Строгий Renderer поддерживает 14 определений, Table не поддерживает. Из реализованного:

- 6 наборов — подтверждённые внутренние: TagInput, TagMore, DropdownMenu (строка), Hint, Label, ItemsList; вместе 70 вариантов.
- 7 наборов с отдельным UI-представлением: Button, Input, Checkbox, Select, TagItem, TagGroup, Chip; вместе 101 вариант. TagItem прямо разрешён отдельно и в группе. Это не 7 полностью законченных семейств.
- `Elements / DropdownMenu` — один отрисованный standalone-контейнер, но description пустое: разрешение использовать отдельно `not verified`.

**Расхождение P1:** TagInput `195:28347`, TagMore `195:28366`, DropdownMenu-строка `91:7219` имеют Figma description «Не используется отдельно», но seed помечает их `internal: false`, каталог и validator разрешают корневые элементы. Исправление требует совместимой миграции уже сохранённых документов; молча скрыть или удалить их нельзя. В Sprint 06 код не менялся.

Table в Registry ссылается на Frame `2073:10861` и пример ячейки `2071:3830`. В Figma найден set `table-cell` `2071:3829` с 56 вариантами. Legacy HTML-таблица не засчитывается как реализация этого набора или нового Figma-семейства Table.

## Полная таблица UI-покрытия

`matrix covered` означает покрытие variant-node матрицы, включая ограничения Missing Features. `slot only` — только внутри родителя. У остальных `absent` означает отсутствие в контракте и строгом Canvas. Avatar и ButtonClose используются в оболочке, но не входят в покрытие библиотеки Canvas.

| Figma Page | Component Name | Figma Node ID | Total Variants | Implemented Variants | Registry Status | Renderer Status | Canvas Status | Interaction Status | Missing Features | Role |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Button | Button | 15:17152 | 128 | 4 | button (root) | subset | root + Inspector | hover/pressed/disabled; native button | 124 варианта; нет action/navigation binding, component properties целиком не покрыты | public candidate: description available |
| Button | Button Danger | 2080:51016 | 128 | 0 | absent | absent | absent | нет реализации | Registry, schema, renderer, Canvas; properties/styles not verified | public candidate: description available |
| Button Icon | ButtonIcon | 109:7542 | 128 | 0 | absent | absent | absent | нет реализации | Registry, schema, renderer, Canvas; properties/styles not verified | public candidate: description available |
| Button Icon | ButtonIcon Danger | 132416:5574 | 128 | 0 | absent | absent | absent | нет реализации | Registry, schema, renderer, Canvas; properties/styles not verified | public candidate: description available |
| Button Floating Action | ButtonFloatingAction | 106:1901 | 16 | 0 | absent | absent | absent | нет реализации | Registry, schema, renderer, Canvas; properties/styles not verified | public candidate: description available |
| Button Floating Action | Elements / Menu | 106:1968 | 5 | 0 | absent | absent | absent | нет реализации | Registry, schema, renderer, Canvas; properties/styles not verified | internal: verified description |
| Button Floating Action | Elements / ButtonFloatingAction | 106:1989 | 4 | 0 | absent | absent | absent | нет реализации | Registry, schema, renderer, Canvas; properties/styles not verified | internal: verified description |
| Button Close | ButtonClose | 88:2079 | 15 | 0 | absent | absent | absent | нет реализации | Есть shell UI, но нет Registry/strict Canvas; shell coverage не входит в числитель | public candidate: description available |
| Button Function | ButtonFunction | 88:10237 | 24 | 0 | absent | absent | absent | нет реализации | Registry, schema, renderer, Canvas; properties/styles not verified | public candidate: description available |
| Button Radio | ButtonRadio | 188:15582 | 32 | 0 | absent | absent | absent | нет реализации | Registry, schema, renderer, Canvas; properties/styles not verified | public candidate: description available |
| Input | Input | 115:70 | 39 | 13 | input (root) | subset | root + Inspector | временный ввод; disabled/error preview | 26 вариантов; value не сохраняется; Hint/Label только l/default/placeholder=false | public candidate: description available |
| Input | Elements / Hint Container | 115:428 | 3 | 3 | hint (internal) | matrix covered / slot only | slot only | статичный текст/счётчик | нет автоматического подсчёта длины; ограничена композиция Input | internal: verified description |
| Input | Elements / Label | 115:638 | 1 | 1 | field-label (internal) | matrix covered / slot only | slot only | адаптирован в Input, required-маркер | не отдельный универсальный renderer; ограничена композиция Input | internal: verified description |
| Input Card | InputCard | 116:5604 | 39 | 0 | absent | absent | absent | нет реализации | Registry, schema, renderer, Canvas; properties/styles not verified | public candidate: description available |
| Input Date | InputDate | 177:37499 | 90 | 0 | absent | absent | absent | нет реализации | Registry, schema, renderer, Canvas; properties/styles not verified | public candidate: description available |
| Input Text Area | TextArea | 189:15908 | 156 | 0 | absent | absent | absent | нет реализации | Registry, schema, renderer, Canvas; properties/styles not verified | public candidate: description available |
| Input Number Stepper | InputNumberStepper | 187:34753 | 28 | 0 | absent | absent | absent | нет реализации | Registry, schema, renderer, Canvas; properties/styles not verified | public candidate: description available |
| Input Select | Select | 195:56849 | 90 | 8 | select (root) | subset | root + Inspector | мышь/клавиатура, outside/blur/Escape | 82 варианта; выбор временный, без round-trip value; 1–10 строк; нет полноценного form binding | public candidate: description available |
| Picker Date | PickerDate | 177:43610 | 16 | 0 | absent | absent | absent | нет реализации | Registry, schema, renderer, Canvas; properties/styles not verified | public candidate: description available |
| Picker Date | Elements / TextDate | 177:44159 | 7 | 0 | absent | absent | absent | нет реализации | Registry, schema, renderer, Canvas; properties/styles not verified | internal: verified description |
| Picker Date | Elements / DigitDate | 177:44184 | 13 | 0 | absent | absent | absent | нет реализации | Registry, schema, renderer, Canvas; properties/styles not verified | internal: verified description |
| Picker Date | Elements / ControlPanelButtons | 177:44228 | 7 | 0 | absent | absent | absent | нет реализации | Registry, schema, renderer, Canvas; properties/styles not verified | internal: verified description |
| Picker Date | Elements / ControlPanel | 177:50416 | 1 | 0 | absent | absent | absent | нет реализации | Registry, schema, renderer, Canvas; properties/styles not verified | internal candidate: not verified |
| Loader | Loader | 188:12160 | 24 | 0 | absent | absent | absent | нет реализации | Registry, schema, renderer, Canvas; properties/styles not verified | public candidate: description available |
| Loader | Loader_spin | 2044:7272 | 6 | 0 | absent | absent | absent | нет реализации | Registry, schema, renderer, Canvas; properties/styles not verified | public candidate: description available |
| Checkbox | Checkbox | 44:354 | 24 | 12 | checkbox (root) | subset | root + Inspector | переключение и сохранение в Canvas | 12 вариантов размера m; полный API Figma не сертифицирован | public candidate: description available |
| Segmented Control | Elements / Segment | 201:4194 | 48 | 0 | absent | absent | absent | нет реализации | Registry, schema, renderer, Canvas; properties/styles not verified | internal: verified description |
| Segmented Control | SegmentedControl | 201:4399 | 54 | 0 | absent | absent | absent | нет реализации | Registry, schema, renderer, Canvas; properties/styles not verified | public candidate: description available |
| Breadcrumbs | Elements / Breadcrumb | 91:3664 | 4 | 0 | absent | absent | absent | нет реализации | Registry, schema, renderer, Canvas; properties/styles not verified | internal: verified description |
| Breadcrumbs | Elements / Divider | 91:3674 | 5 | 0 | absent | absent | absent | нет реализации | Registry, schema, renderer, Canvas; properties/styles not verified | internal: verified description |
| Breadcrumbs | Breadcrumbs | 91:3684 | 6 | 0 | absent | absent | absent | нет реализации | Registry, schema, renderer, Canvas; properties/styles not verified | public candidate: description available |
| Dropdown Menu | DropdownMenu | 91:7219 | 28 | 28 | dropdown-item (root) | matrix covered | root + Inspector | hover/disabled; standalone без действия | Figma internal, ошибочно разрешён в корне; radio/checkbox/hint/preffixSlot/instance swaps отсутствуют | internal: verified description |
| Dropdown Menu | Elements / ItemsList | 91:7468 | 20 | 20 | items-list (internal) | matrix covered / slot only | slot only | выбор/клавиатура только внутри Select | standalone menu не подключает onChoose; нет общего menu action API | internal: verified description |
| Dropdown Menu | Elements / DropdownMenu | 177:10720 | 0 | 0 variants; 1 sample | dropdown-menu (root) | matrix covered | root + Inspector | статичный контейнер; интерактивность в Select | самостоятельность в Figma not verified (пустое description); нет универсального menu controller | internal candidate: not verified |
| Slider | Slider | 201:38923 | 10 | 0 | absent | absent | absent | нет реализации | Registry, schema, renderer, Canvas; properties/styles not verified | public candidate: description available |
| Range | Range | 2089:372 | 2 | 0 | absent | absent | absent | нет реализации | Registry, schema, renderer, Canvas; properties/styles not verified | public candidate: description available |
| Stepper | Stepper | 207:46069 | 128 | 0 | absent | absent | absent | нет реализации | Registry, schema, renderer, Canvas; properties/styles not verified | role not verified |
| Switch | Switch | 207:49212 | 32 | 0 | absent | absent | absent | нет реализации | Registry, schema, renderer, Canvas; properties/styles not verified | role not verified |
| Badge | Status Text | 41:433 | 72 | 0 | absent | absent | absent | нет реализации | Registry, schema, renderer, Canvas; properties/styles not verified | role not verified |
| Badge | Counter | 81:2200 | 12 | 0 | absent | absent | absent | нет реализации | Registry, schema, renderer, Canvas; properties/styles not verified | role not verified |
| Badge | Badge__Status | 2042:5469 | 26 | 0 | absent | absent | absent | нет реализации | Registry, schema, renderer, Canvas; properties/styles not verified | role not verified |
| Badge | Badge | 2042:3627 | 3 | 0 | absent | absent | absent | нет реализации | Registry, schema, renderer, Canvas; properties/styles not verified | role not verified |
| Chip | Chip | 75:1401 | 32 | 32 | chip (root) | matrix covered | root + Inspector | selected переключается и сохраняется | instance swap не реализован; counter фиксирован 3; все варианты != все properties | role not verified |
| Tabs | Elements / TabItem | 207:73852 | 48 | 0 | absent | absent | absent | нет реализации | Registry, schema, renderer, Canvas; properties/styles not verified | internal candidate: not verified |
| Tabs | Tabs | 207:75785 | 1 | 0 | absent | absent | absent | нет реализации | Registry, schema, renderer, Canvas; properties/styles not verified | role not verified |
| Tabs | Elements / TabsGroup | 207:74135 | 36 | 0 | absent | absent | absent | нет реализации | Registry, schema, renderer, Canvas; properties/styles not verified | internal candidate: not verified |
| Tags | TagItem | 195:1079 | 24 | 24 | tag-item (root) | matrix covered | root + Inspector | hover; крестик декоративный | нет удаления; s/xs игнорируют closable согласно исследованному образцу, требуется уточнение | public candidate: description available |
| Tags | TagInput | 195:28347 | 6 | 6 | tag-input (root) | matrix covered | root + Inspector | временный ввод | Figma internal, ошибочно разрешён в корне; нет создания тега/сохранения ввода | internal: verified description |
| Tags | TagMore | 195:28366 | 12 | 12 | tag-more (root) | matrix covered | root + Inspector | только hover; плюс декоративный | Figma internal, ошибочно разрешён в корне; нет действия Add Tag | internal: verified description |
| Tags | TagGroup | 195:28415 | 240 | 8 | tag-group (root) | subset | root + Inspector | изменения через Inspector | 232 варианта; только amount 1/2 и m; нет добавления/удаления с клавиатуры/мышью | public candidate: description available |
| Inline Notification | InlineNotification | 88:1933 | 4 | 0 | absent | absent | absent | нет реализации | Registry, schema, renderer, Canvas; properties/styles not verified | role not verified |
| Toast Notification | ToastNotification | 88:8149 | 4 | 0 | absent | absent | absent | нет реализации | Registry, schema, renderer, Canvas; properties/styles not verified | role not verified |
| Alerts Notification | AlertsNotification | 2027:47084 | 24 | 0 | absent | absent | absent | нет реализации | Registry, schema, renderer, Canvas; properties/styles not verified | role not verified |
| Tooltip | Tooltip | 88:4734 | 24 | 0 | absent | absent | absent | нет реализации | Registry, schema, renderer, Canvas; properties/styles not verified | role not verified |
| Tooltip | Tooltips (popover) | 228:26483 | 15 | 0 | absent | absent | absent | нет реализации | Registry, schema, renderer, Canvas; properties/styles not verified | role not verified |
| Avatar | Avatar | 2024:24665 | 228 | 0 | absent | absent | absent | нет реализации | Есть shell UI, но нет Registry/strict Canvas; shell coverage не входит в числитель | role not verified |
| Avatar | Avatar label group | 2071:38102 | 4 | 0 | absent | absent | absent | нет реализации | Registry, schema, renderer, Canvas; properties/styles not verified | role not verified |
| Avatar | _Avatar add button | 2071:38283 | 12 | 0 | absent | absent | absent | нет реализации | Registry, schema, renderer, Canvas; properties/styles not verified | internal candidate: not verified |
| Avatar | Avatar group | 2071:38326 | 12 | 0 | absent | absent | absent | нет реализации | Registry, schema, renderer, Canvas; properties/styles not verified | role not verified |
| Paginator | Pagination | 228:21323 | 1 | 0 | absent | absent | absent | нет реализации | Registry, schema, renderer, Canvas; properties/styles not verified | role not verified |
| Paginator | Control | 235:22274 | 18 | 0 | absent | absent | absent | нет реализации | Registry, schema, renderer, Canvas; properties/styles not verified | role not verified |
| Paginator | Page | 235:22259 | 5 | 0 | absent | absent | absent | нет реализации | Registry, schema, renderer, Canvas; properties/styles not verified | role not verified |
| Paginator | _Pagination dot indicator | 2080:29965 | 32 | 0 | absent | absent | absent | нет реализации | Registry, schema, renderer, Canvas; properties/styles not verified | internal candidate: not verified |
| Paginator | Pagination dot group | 2080:29998 | 32 | 0 | absent | absent | absent | нет реализации | Registry, schema, renderer, Canvas; properties/styles not verified | role not verified |
| Paginator | _Carousel arrow | 2080:30351 | 16 | 0 | absent | absent | absent | нет реализации | Registry, schema, renderer, Canvas; properties/styles not verified | internal candidate: not verified |
| Paginator | Carousel image | 2080:30384 | 6 | 0 | absent | absent | absent | нет реализации | Registry, schema, renderer, Canvas; properties/styles not verified | role not verified |
| Paginator | Pagination Component | 2088:823 | 4 | 0 | absent | absent | absent | нет реализации | Registry, schema, renderer, Canvas; properties/styles not verified | role not verified |
| Paginator | Pagination 2  | 2088:832 | 4 | 0 | absent | absent | absent | нет реализации | Registry, schema, renderer, Canvas; properties/styles not verified | role not verified |
| Tables | table-cell | 2071:3829 | 56 | 0 | table: legacy pattern only | strict blocked | legacy Table preview | статичная таблица | 56 table-cell variants отсутствуют; Table frame не Component Set | internal candidate: not verified |
| Accordions | Accordion | 2034:33578 | 10 | 0 | absent | absent | absent | нет реализации | Registry, schema, renderer, Canvas; properties/styles not verified | role not verified |
| Scroll | Scroll | 91:7008 | 2 | 0 | absent | absent | absent | нет реализации | Registry, schema, renderer, Canvas; properties/styles not verified | role not verified |
| Dividers | Divider | 2112:1253 | 6 | 0 | absent | absent | absent | нет реализации | Registry, schema, renderer, Canvas; properties/styles not verified | role not verified |
| Steppers | Stepper | 206:21945 | 12 | 0 | absent | absent | absent | нет реализации | Registry, schema, renderer, Canvas; properties/styles not verified | role not verified |
| Steppers | .steps__item_vertical | 2045:45999 | 30 | 0 | absent | absent | absent | нет реализации | Registry, schema, renderer, Canvas; properties/styles not verified | internal candidate: not verified |
| Steppers | .steps__item_progress | 2045:45701 | 15 | 0 | absent | absent | absent | нет реализации | Registry, schema, renderer, Canvas; properties/styles not verified | internal candidate: not verified |
| Steppers | .steps__item_tail | 2045:45731 | 8 | 0 | absent | absent | absent | нет реализации | Registry, schema, renderer, Canvas; properties/styles not verified | internal candidate: not verified |
| Steppers | .steps__item_horizontal | 2045:45748 | 40 | 0 | absent | absent | absent | нет реализации | Registry, schema, renderer, Canvas; properties/styles not verified | internal candidate: not verified |
| Steppers | Steps | 2045:47019 | 28 | 0 | absent | absent | absent | нет реализации | Registry, schema, renderer, Canvas; properties/styles not verified | role not verified |
| Charts | _X-axis | 2080:6197 | 6 | 0 | absent | absent | absent | нет реализации | Registry, schema, renderer, Canvas; properties/styles not verified | internal candidate: not verified |
| Charts | _Chart data | 2080:6267 | 15 | 0 | absent | absent | absent | нет реализации | Registry, schema, renderer, Canvas; properties/styles not verified | internal candidate: not verified |
| Charts | _Y-axis line | 2080:6478 | 2 | 0 | absent | absent | absent | нет реализации | Registry, schema, renderer, Canvas; properties/styles not verified | internal candidate: not verified |
| Charts | _Chart bar | 2080:6485 | 3 | 0 | absent | absent | absent | нет реализации | Registry, schema, renderer, Canvas; properties/styles not verified | internal candidate: not verified |
| Charts | _Legend | 2080:6495 | 2 | 0 | absent | absent | absent | нет реализации | Registry, schema, renderer, Canvas; properties/styles not verified | internal candidate: not verified |
| Charts | _Y-axis | 2080:6544 | 2 | 0 | absent | absent | absent | нет реализации | Registry, schema, renderer, Canvas; properties/styles not verified | internal candidate: not verified |
| Charts | _Activitiy gauge | 2080:6571 | 8 | 0 | absent | absent | absent | нет реализации | Registry, schema, renderer, Canvas; properties/styles not verified | internal candidate: not verified |
| Charts | _Pie chart | 2080:6664 | 16 | 0 | absent | absent | absent | нет реализации | Registry, schema, renderer, Canvas; properties/styles not verified | internal candidate: not verified |
| Charts | Line and bar chart | 2080:7408 | 24 | 0 | absent | absent | absent | нет реализации | Registry, schema, renderer, Canvas; properties/styles not verified | role not verified |
| Charts | Activity gauge | 2080:9643 | 24 | 0 | absent | absent | absent | нет реализации | Registry, schema, renderer, Canvas; properties/styles not verified | role not verified |
| Charts | Pie chart | 2080:10314 | 50 | 0 | absent | absent | absent | нет реализации | Registry, schema, renderer, Canvas; properties/styles not verified | role not verified |
| Charts | Progress circle | 2080:11267 | 16 | 0 | absent | absent | absent | нет реализации | Registry, schema, renderer, Canvas; properties/styles not verified | role not verified |
| Charts | _X-axis label | 2080:6193 | 0 | 0 | absent | absent | absent | нет реализации | Registry, schema, renderer, Canvas; properties/styles not verified | internal candidate: not verified |
| Charts | _Y-axis label | 2080:6195 | 0 | 0 | absent | absent | absent | нет реализации | Registry, schema, renderer, Canvas; properties/styles not verified | internal candidate: not verified |
| Uploads | File Upload | 204:3792 | 3 | 0 | absent | absent | absent | нет реализации | Registry, schema, renderer, Canvas; properties/styles not verified | role not verified |
| Uploads | Dropzone | 2044:21898 | 2 | 0 | absent | absent | absent | нет реализации | Registry, schema, renderer, Canvas; properties/styles not verified | role not verified |
| Uploads | Dropzone_photo | 2044:22345 | 5 | 0 | absent | absent | absent | нет реализации | Registry, schema, renderer, Canvas; properties/styles not verified | role not verified |
| Uploads | Button_file upload | 2040:1008 | 4 | 0 | absent | absent | absent | нет реализации | Registry, schema, renderer, Canvas; properties/styles not verified | role not verified |
| Uploads | FileUploader | 2088:4435 | 5 | 0 | absent | absent | absent | нет реализации | Registry, schema, renderer, Canvas; properties/styles not verified | role not verified |
| Uploads | Small upload | 2091:8750 | 4 | 0 | absent | absent | absent | нет реализации | Registry, schema, renderer, Canvas; properties/styles not verified | role not verified |
| Uploads | Big Upload | 2091:8790 | 4 | 0 | absent | absent | absent | нет реализации | Registry, schema, renderer, Canvas; properties/styles not verified | role not verified |
| Uploads | file upload states | 2091:11563 | 4 | 0 | absent | absent | absent | нет реализации | Registry, schema, renderer, Canvas; properties/styles not verified | role not verified |
| Uploads | File Uploading Progress | 2093:3529 | 8 | 0 | absent | absent | absent | нет реализации | Registry, schema, renderer, Canvas; properties/styles not verified | role not verified |
| Uploads | File Uploader | 2093:3941 | 3 | 0 | absent | absent | absent | нет реализации | Registry, schema, renderer, Canvas; properties/styles not verified | role not verified |
| Uploads | Upload / list | 2107:3746 | 12 | 0 | absent | absent | absent | нет реализации | Registry, schema, renderer, Canvas; properties/styles not verified | role not verified |
| Uploads | Upload | 2107:6796 | 6 | 0 | absent | absent | absent | нет реализации | Registry, schema, renderer, Canvas; properties/styles not verified | role not verified |
| Uploads | Upload / file-list-item | 2107:4496 | 3 | 0 | absent | absent | absent | нет реализации | Registry, schema, renderer, Canvas; properties/styles not verified | role not verified |
| Uploads | Upload / picture-list-item | 2107:4592 | 3 | 0 | absent | absent | absent | нет реализации | Registry, schema, renderer, Canvas; properties/styles not verified | role not verified |
| Uploads | Upload / picture-card | 2107:4663 | 4 | 0 | absent | absent | absent | нет реализации | Registry, schema, renderer, Canvas; properties/styles not verified | role not verified |
| Uploads | upload-trigger | 2107:5215 | 4 | 0 | absent | absent | absent | нет реализации | Registry, schema, renderer, Canvas; properties/styles not verified | role not verified |
| Uploads | Mutilple Uploads | 2091:8981 | 0 | 0 | absent | absent | absent | нет реализации | Registry, schema, renderer, Canvas; properties/styles not verified | role not verified |
| Other | Progress Bars | 205:9638 | 10 | 0 | absent | absent | absent | нет реализации | Registry, schema, renderer, Canvas; properties/styles not verified | role not verified |
| Other | Progress | 225:47447 | 33 | 0 | absent | absent | absent | нет реализации | Registry, schema, renderer, Canvas; properties/styles not verified | role not verified |
| Other | Password indicator | 226:10556 | 3 | 0 | absent | absent | absent | нет реализации | Registry, schema, renderer, Canvas; properties/styles not verified | role not verified |
| Other | Progress circle | 226:10636 | 7 | 0 | absent | absent | absent | нет реализации | Registry, schema, renderer, Canvas; properties/styles not verified | role not verified |
| Other | Chat bubble | 225:46154 | 8 | 0 | absent | absent | absent | нет реализации | Registry, schema, renderer, Canvas; properties/styles not verified | role not verified |
| Other | Progress semicircle | 228:8888 | 4 | 0 | absent | absent | absent | нет реализации | Registry, schema, renderer, Canvas; properties/styles not verified | role not verified |
| Other | Start Rating | 2036:35156 | 6 | 0 | absent | absent | absent | нет реализации | Registry, schema, renderer, Canvas; properties/styles not verified | role not verified |
| Other | Rate | 2044:21184 | 6 | 0 | absent | absent | absent | нет реализации | Registry, schema, renderer, Canvas; properties/styles not verified | role not verified |
| Other | Parts | 2044:21251 | 6 | 0 | absent | absent | absent | нет реализации | Registry, schema, renderer, Canvas; properties/styles not verified | role not verified |
| Other | Progress__Line | 2044:6677 | 42 | 0 | absent | absent | absent | нет реализации | Registry, schema, renderer, Canvas; properties/styles not verified | role not verified |
| Other | Progress__Circle | 2044:7116 | 12 | 0 | absent | absent | absent | нет реализации | Registry, schema, renderer, Canvas; properties/styles not verified | public candidate: description available |
| Other | QR Code | 2044:42215 | 3 | 0 | absent | absent | absent | нет реализации | Registry, schema, renderer, Canvas; properties/styles not verified | role not verified |
| Other | Progress Steps | 2044:7188 | 12 | 0 | absent | absent | absent | нет реализации | Registry, schema, renderer, Canvas; properties/styles not verified | public candidate: description available |
| Other | Message Menus | 2091:14309 | 10 | 0 | absent | absent | absent | нет реализации | Registry, schema, renderer, Canvas; properties/styles not verified | role not verified |
| Other | Message bubbles | 2091:16946 | 10 | 0 | absent | absent | absent | нет реализации | Registry, schema, renderer, Canvas; properties/styles not verified | role not verified |
| Other | Activity Item | 2091:18812 | 8 | 0 | absent | absent | absent | нет реализации | Registry, schema, renderer, Canvas; properties/styles not verified | role not verified |
| Other | Activity Feed Content | 2091:19013 | 7 | 0 | absent | absent | absent | нет реализации | Registry, schema, renderer, Canvas; properties/styles not verified | role not verified |
| Other | Activity | 2092:11814 | 1 | 0 | absent | absent | absent | нет реализации | Registry, schema, renderer, Canvas; properties/styles not verified | role not verified |
| Other | Comment | 2105:4321 | 2 | 0 | absent | absent | absent | нет реализации | Registry, schema, renderer, Canvas; properties/styles not verified | public candidate: description available |
| Other | Сomment-nested | 2113:4678 | 1 | 0 | absent | absent | absent | нет реализации | Registry, schema, renderer, Canvas; properties/styles not verified | public candidate: description available |
| Other | Progress Bar Tabs | 132413:793 | 3 | 0 | absent | absent | absent | нет реализации | Registry, schema, renderer, Canvas; properties/styles not verified | role not verified |

## Все страницы Figma

Standalone здесь означает только COMPONENT вне набора. Например, 1 305 иконок — ресурсы, а не 1 305 готовых интерактивных компонентов Builder. На Favicons обнаружены четыре компонента с фактическими именами designHere, inner-header/02 2-lines, inner-header/01 1-line, heading; название страницы не доказывает их назначение.

| Figma Page | Page ID | Sets | Standalone | Variants | Scope |
| --- | --- | --- | --- | --- | --- |
| Cover | 2049:1688 | 0 | 0 | 0 | UI / foundations |
| ------------ | 2049:1689 | 0 | 0 | 0 | UI / foundations |
| Colors | 15:15885 | 0 | 0 | 0 | UI / foundations |
| Typography | 2049:1687 | 0 | 0 | 0 | UI / foundations |
| --------- | 2048:47414 | 0 | 0 | 0 | UI / foundations |
| Button | 0:1 | 2 | 0 | 256 | UI / foundations |
| Button Icon | 2048:61386 | 2 | 0 | 256 | UI / foundations |
| Button Floating Action | 2048:62597 | 3 | 0 | 25 | UI / foundations |
| Button Close | 2048:63146 | 1 | 0 | 15 | UI / foundations |
| Button Function | 2048:64159 | 1 | 0 | 24 | UI / foundations |
| Button Radio | 188:13366 | 1 | 0 | 32 | UI / foundations |
| Input | 112:2041 | 3 | 0 | 43 | UI / foundations |
| Input Card | 2048:64390 | 1 | 0 | 39 | UI / foundations |
| Input Date | 2048:65411 | 1 | 0 | 90 | UI / foundations |
| Input Text Area | 189:15819 | 1 | 0 | 156 | UI / foundations |
| Input Number Stepper | 2048:74309 | 1 | 0 | 28 | UI / foundations |
| Input Select | 195:56257 | 1 | 0 | 90 | UI / foundations |
| Picker Date | 177:43609 | 5 | 0 | 44 | UI / foundations |
| Loader | 188:12122 | 2 | 0 | 30 | UI / foundations |
| Checkbox | 50:320 | 1 | 0 | 24 | UI / foundations |
| Segmented Control | 201:4091 | 2 | 0 | 102 | UI / foundations |
| Breadcrumbs | 91:3134 | 3 | 0 | 15 | UI / foundations |
| Dropdown Menu | 91:7218 | 2 | 1 | 48 | UI / foundations |
| Slider | 201:38871 | 1 | 0 | 10 | UI / foundations |
| Range | 2089:356 | 1 | 0 | 2 | UI / foundations |
| Stepper | 207:45992 | 1 | 0 | 128 | UI / foundations |
| Switch | 207:49154 | 1 | 0 | 32 | UI / foundations |
| Badge | 50:318 | 4 | 0 | 113 | UI / foundations |
| Chip | 75:1306 | 1 | 0 | 32 | UI / foundations |
| Tabs | 207:68744 | 3 | 0 | 85 | UI / foundations |
| Tags | 195:1011 | 4 | 0 | 282 | UI / foundations |
| Inline Notification | 88:1591 | 1 | 0 | 4 | UI / foundations |
| Toast Notification | 2048:91431 | 1 | 0 | 4 | UI / foundations |
| Alerts Notification | 2048:91432 | 1 | 0 | 24 | UI / foundations |
| Tooltip | 88:4733 | 2 | 0 | 39 | UI / foundations |
| Avatar | 97:2 | 4 | 0 | 256 | UI / foundations |
| Paginator | 228:24085 | 9 | 0 | 118 | UI / foundations |
| Tables | 2071:1101 | 1 | 0 | 56 | UI / foundations |
| Accordions | 2034:33562 | 1 | 0 | 10 | UI / foundations |
| Scroll | 91:7007 | 1 | 0 | 2 | UI / foundations |
| Dividers | 2091:9428 | 1 | 0 | 6 | UI / foundations |
| Steppers | 2045:50241 | 6 | 0 | 133 | UI / foundations |
| Charts | 2080:16516 | 12 | 2 | 168 | UI / foundations |
| Uploads | 2088:4358 | 16 | 1 | 74 | UI / foundations |
| Other | 204:3403 | 21 | 0 | 194 | UI / foundations |
| ---------- | 2034:33658 | 0 | 0 | 0 | UI / foundations |
| Icons | 15:9970 | 0 | 1305 | 0 | assets |
| Files | 2049:24902 | 4 | 0 | 524 | assets |
| Emojis | 2091:17284 | 1 | 0 | 148 | assets |
| --------- | 2048:33618 | 0 | 0 | 0 | UI / foundations |
| Flags | 2048:685 | 257 | 0 | 518 | assets |
| Favicons | 2048:94535 | 0 | 4 | 0 | assets |
| Patterns | 2048:33619 | 0 | 0 | 0 | assets |
| Cursors | 2048:92891 | 1 | 0 | 32 | assets |

## Интерактивность, композиции и сохранения

| Область | Реальное поведение | Остаток |
| --- | --- | --- |
| Select | Открытие, выбор мышью, Arrow/Home/End/Enter/Space/Escape, blur/outside, disabled/error | selected хранится в local state; редактирование/перемонтирование и reload сбрасывают выбор; нет сохраняемого form state, поиск/multiselect не подтверждены |
| Tags | Hover; TagInput допускает временный ввод; Inspector редактирует slots | TagMore — span с плюсом; TagItem не получает onClose; нельзя добавить/удалить тег кнопками; TagInput не связан с TagGroup |
| Chip / Checkbox | События меняют Canvas и сохраняются | Это не доказывает полноту остальных variants/instance swaps |
| DropdownMenu | В Select есть onChoose; автономный контейнер отрисовывает список | Клик отдельного menu item не запускает действие; общего menu controller и action model нет |
| Input + Hint + Label | Ввод, error/disabled; слоты рендерятся в одном подтверждённом сочетании | Значение Input временное; Hint counter статичен; Label реализован адаптацией внутри Input |
| JSON v3 | tokenReferences, slots, порядок, ID и overrides сохраняются; v1/v2 мигрируют | Внешним потребителям нужен контракт 1.2.0; v2 downgrade теряет часть данных и не должен быть автоматическим |
| Theme Editor | Старый редактор работает; строгий режим использует оригинальную Figma-тему | Новые preview не применяют overrides; все режимы исходной библиотеки не проверены |

57 токенов текущего контракта подтверждены сохранёнными источниками предыдущих спринтов; в Sprint 06 их значения не изменялись. Это не утверждение о полном количестве токенов файла: полный token inventory вне этого аудита компонентов. Manrope локальный. 19 SVG Sprint 05 и 8 checkbox SVG Sprint 04 — конкретные assets, не самостоятельные реализованные семейства.

## Ветки и безопасное объединение Sprint 04/05

Проверено `git log`, refs, diff и `git ls-remote --heads origin main feat/ds-renderer feat/ds-component-library`:

```text
40ba75b Initial commit
  └─ 7bd90fd Deploy public WDeaf demo to GitHub Pages
       main = origin/main = remote main
       └─ 3a2a12b feat: establish verified DS contract and minimal renderer
            feat/ds-renderer = feat/ds-component-library = HEAD
            + незакоммиченный Sprint 05
            + документы аудита Sprint 06
```

Удалённые feature-ветки не найдены. Main — предок feature HEAD, локального расхождения коммитов нет. **Сейчас PR по текущему HEAD включил бы только Sprint 04/Contract: незакоммиченный Sprint 05 в него не попадёт.** В этой задаче commit/push/PR/merge не выполнялись.

Рекомендация: один PR `feat/ds-component-library → main` после отдельного коммита Sprint 05 (включая untracked seeds, SVG, матрицу, fixtures и snapshots) и коммита аудита. Он включит 3a2a12b; дополнительный merge идентичного `feat/ds-renderer` не требуется. Альтернатива — последовательные PR Renderer, затем Library, с обновлением base.

**Готовность условная, немедленный merge без доработок не рекомендован.** Сборка и текущие регрессии проходят, но обещать отсутствие проблем публичного релиза нельзя:

1. Разрешить P1 с внутренними корневыми компонентами либо явно зафиксировать как ограничение preview и подготовить миграцию. «Строгий» режим сейчас не полностью соблюдает intended usage Figma.
2. Проверить будущий коммит в чистом checkout через npm ci и весь pipeline. Текущие проверки используют рабочее дерево и существующие node_modules; clean CI здесь не запускался.
3. Workflow запускается на push main/workflow_dispatch, не на pull_request. Рекомендуется отдельный PR check без deploy; не менять публикацию вслепую. Существующие Playwright baselines — macOS; Linux baselines/CI visual пока не проверены.
4. Миграция сохраняет v3 по прежнему storage key, резервируя v1/v2 в `.pre-v3-backup`. Старый main принимает только v1/v2. Откат сайта оставит новые v3 нечитаемыми для старой версии. Перед релизом нужен сценарий восстановления: сохранить текущий v3 отдельно, при необходимости вручную вернуть legacy backup; изменения после миграции в backup отсутствуют. Новые v3-проекты не имеют legacy backup. Нельзя обещать lossless downgrade.
5. На момент проверки remote main = 7bd90fd. Если main изменится, повторить ancestry/merge и проверки; правила branch protection, GitHub environment и живой deployment в этом аудите `not verified`.

Auth/server, профиль, Theme Editor, appearance, Vite base и Pages workflow не менялись относительно Sprint 04. В совокупном diff от main workflow уже содержит ds:validate из Contract; полностью «неизменённым относительно main» его называть нельзя. Pages остаётся публичным guest bundle без серверной авторизации; серверный режим не подменён гостевой имитацией. Данные остаются в браузере пользователя.

## Выполненные проверки

- `npm run typecheck` — pass.
- `npm run ds:validate` — pass, generated artifacts актуальны.
- `npm test` — **31 TS + 2 server auth = 33 pass**, 0 fail.
- `npm run build` — pass, production asset base `/emikman_builder/`.
- `npm run check:pages` — pass: пути entry assets существуют, private files/server auth не попали в dist.
- `npm run test:visual` — **7/7 pass**, Chromium/macOS: матрицы Tags/Chip/Menu, Input slots, Select мышь/клавиатура/направления, JSON export/reload, прежний renderer и strict rejection. Снимки не обновлялись.
- Ограниченный pattern scan 223 tracked/untracked файлов: единственное password-literal совпадение — тестовая fixture в tests/auth.test.mjs; private-key/GitHub/Figma/AWS токены не найдены. Это не полный аудит секретов всей Git-истории и не security certification.

## Приоритет следующих спринтов

1. **Sprint 07 — завершение контракта и поведения текущих компонентов.** Исправить internal/root границы с миграцией; capabilities manifest из единой матрицы; разделить Figma props, editor content и сохраняемое interaction state. Завершить Tags CRUD, Select persistence, самостоятельный menu controller; покрыть negative tests и round-trip. Закрыть role not verified на оставшихся descriptions. Добавить PR CI и проверить восстановление после отката v3.
2. **Sprint 08 — варианты базовых форм.** Оставшиеся Button (124), Input (26), Checkbox (12), Select (82), TagGroup (232) — **476 уже известных отсутствующих вариантов**. Затем ButtonIcon/Danger, Radio, Switch, TextArea и NumberStepper. Сначала извлекать точные props/styles/tokens, затем реализовывать; count не заменяет спецификацию.
3. **Sprint 09 — обратная связь и навигация.** Tooltip/popover, Loader, Inline/Toast/Alerts, Badge/Counter, Tabs/SegmentedControl, Breadcrumbs, Pagination, Accordion, Divider, Scroll. Внутренние части подключать только через родителей; проверять keyboard/focus/a11y, не только снимки.
4. **Sprint 10 — сложные составные компоненты.** table-cell и документированный Table pattern, InputDate + PickerDate, Slider/Range, оба семейства Stepper/Steps, Avatar group. Разделить одноимённые сущности по ID, не объединять несовместимые props.
5. **Sprint 11+ — Uploads, Charts, Other и ресурсы.** Сначала выяснить назначение и дубли/альтернативные наборы, затем data/action contracts. Иконки, файлы, emoji, flags, cursors — отдельный asset registry с ссылками и проверкой происхождения. Нельзя повысить UI-процент одним импортом 1 305 SVG.
6. **MCP после стабилизации capabilities.** Чистые validator/prepareRender уже подходят для read-only tools list_components/validate_screen/render_capabilities. До записи документов нужны версия 1.2.0, строгая матрица, intended-usage policy и lossless v3. Транспорт MCP сейчас не реализован; процент покрытия сам по себе не означает production-ready MCP.

Критерий готовности каждого семейства: подтверждённая Figma-матрица и intended usage → Registry/Schema → strict renderer → Inspector/Canvas → семантика взаимодействий и сохранений → негативные/визуальные тесты. Полное покрытие нельзя объявлять по одному появлению компонента в каталоге.

# T4 — Coverage Inventory & Metrics

Статус: **T4 ACCEPTED**. Дата утверждения: **04.11.2026**.

## 1. База, метод и пределы проверки

Архитектурная основа: [ADR-001](ADR-001-source-neutral-design-system-contract.md), [T2](T2-unsupported-policy.md), [T3](T3-validator-facade.md), ACCEPTED 04.11.2026. Coverage не является Component Readiness: CR0–CR3 здесь не присваиваются.

Delivery Baseline: merge `9fb1399719b8f2e02a105844943e10b8e373c253`. Локально прочитан HEAD `1986326c713c87c2f360e0b66656d11518721284`; оба commit tree равны `767236ce7334037ae9d4b05dcb372e572250fb87` (повторно проверено через git rev-parse). Локальные T1–T3 не закоммичены, сохранены. Отдельного файла Delivery Baseline в docs не найдено: используется база поставки из утверждённого ADR и указанные владельцем показатели; не выдумывается отдельный CI-отчёт. Remote HEAD и GitHub CI в T4 не перечитывались.

Все ссылки [I][], [VAL][] и другие ниже относятся к файлам именно указанного feature SHA (дерево равно merge baseline); контрольные суммы даны в §10. Это позволяет отличать evidence кода от изменяемого URL main. Источник Figma — **сохранённый снимок 30.10.2026**, fileKey `wiJYO9bWctpEiq2STFkNYU`, 54 страницы, а не новое чтение текущей Figma. Сведения семян описывают конкретные прочитанные узлы; неизвестные свойства не достраиваются. Тесты/сборки/Preview не запускались: выполнены чтение кода и арифметический пересчёт JSON в памяти, без генерации артефактов.

Единицы учёта:

- Definition = Component Set либо COMPONENT вне набора; имя не identity. Variant = непосредственный COMPONENT ребёнок Component Set. Standalone по типу узла не означает разрешённый root Canvas.
- UI определяется классификацией страниц [I][]/[COV][]. Icons, Files, Emojis, Flags, Favicons, Patterns, Cursors — ресурсы, исключены из UI знаменателя.
- Matrix row/sample = сохранённая проверяемая комбинация + nodeId. Образец, generated child, root-документ и независимая операция — разные единицы.
- Contract Support различает metadata/component-level проверку и допустимость целого документа; Renderer Support различает primitive SSR и проход через prepareRender в допустимом владельце.
- VERIFIED означает конкретное подтверждённое утверждение в указанном scope; PARTIAL — подтверждённый subset; UNKNOWN — недостаточно данных; UNSUPPORTED — доказанный отказ или отсутствие в текущем контракте/Renderer. Это не глобальная оценка качества семейства.
- Наличие теста подтверждает проверяемое утверждение и процедуру, но не новый успешный запуск. Снимок приложения не является автоматическим pixel-diff с Figma и не доказывает a11y/полноту поведения.

## 2. Независимые метрики

| Метрика | Числитель / знаменатель и единица | Подтверждённый результат | Что не измерено |
| --- | --- | --- | --- |
| Source coverage | Наблюдённые определения/variant-node в сохранённом UI inventory | VERIFIED: 130 UI-определений; 3089 UI-вариантов [I][] | Полнота свойств/стилей/ролей всех определений, актуальность live Figma и полный token inventory UNKNOWN |
| Contract coverage | Разрешённые значения/композиции конкретного контракта относительно подтверждённых source constraints | 15 Registry definitions, 9 root и 6 internal; Contract 1.3.0 / Schema v3 [REG][][SC][][COMP][] | Число всех допустимых source-backed комбинаций и общий процент UNKNOWN; enums не доказывают все сочетания |
| Renderer coverage | Отображаемые уникальные source nodes в точно определённом контексте | Историческая матрица: 171 variants + 1 standalone; текущая процедура: 154 samples в owning-композициях + 18 primitive-only rows [F4][][M][][UT4][][UT5][] | Полное множество достижимых variant-node с динамическими/generated states не перечислено; общего текущего end-to-end процента нет |
| Interaction coverage | Проверенные операции × варианты × состояния × композиции × среда | PARTIAL: сценарии §6, отдельные Select/TagGroup/Tag/Chip/Checkbox действия | Нет согласованного полного знаменателя операций; keyboard/focus/a11y и все комбинации не покрыты |
| Evidence coverage | Утверждения с точными источниками/тестовыми assertions и результатами на заданном SHA/среде | PARTIAL: ссылки на код, fixtures, тесты, 13 Darwin PNG, исторический отчёт [REMED][] | Нет полного claims manifest и свежего run evidence T4; процент и CR3 не определяются |

**Нет единого «процента готовности дизайн-системы».** Доля исторических matrix variants допустима только как историческая метрика с проверенным знаменателем, не как функциональная готовность.

## 3. Пересчёт исходных показателей

| Показатель | Происхождение и повторная проверка | Значение / смысл |
| --- | --- | --- |
| 130 UI-определений | Сумма rows UI страниц [I][] | 126 COMPONENT_SET + 4 standalone COMPONENT |
| 3089 UI-вариантов | Сумма variants тех же UI rows [I][] | Standalone не прибавляются к variant denominator |
| 14/130 | 14 rows inventory с implementedSamples > 0 | Исторические определения с хотя бы одним primitive/matrix образцом; 10,77%, не 14 готовых root-компонентов |
| 171/3089 | 4 Button + 13 Input + 12 Checkbox + 142 variant rows library matrix | 5,54% исторических variant samples; 1 standalone исключён |
| 172 samples | 29 Sprint 04 fixture + 143 library rows | 171 variants + контейнер 177:10720; все 143 library nodeId уникальны внутри матрицы |
| 18 primitives | 6 TagInput + 12 TagMore [M][], особая ветка [UT5][] | validateComponent + прямой Tag SSR, одновременно отрицательная проверка root; не Screen-документы |
| 154 composition samples | 29 + (143 − 18) = 154 | 153 variant samples + 1 standalone; это число итераций тестовых образцов, не уникальных nodes всего DOM |
| 57 токенов | 20 [TOK1][] + 12 [TOK4][] + 25 [TOK5][]; непересекающиеся имена, логика [GEN][] | Ограниченный подтверждённый seed, не все токены Figma; процент UNKNOWN |

Дополнительная сверка [I]: весь файл — 389 sets, 1313 standalone, 4311 variants, 5624 COMPONENT, 1702 definitions. Это ресурсы + UI, не знаменатель функциональной библиотеки. В UI role классификация: 14 internal по description, 22 internal candidate (not verified), 28 public candidate, 66 role not verified. Поэтому точный знаменатель публичных/root семейств Figma UNKNOWN. Нельзя делить 9 Canvas roots на 130 и называть это полнотой публичной библиотеки.

Исторические 14 definitions включают TagInput и TagMore. После Sprint 05.1 они не стали разрешёнными root: первый вообще не имеет JSON-слота, второй генерируется из TagGroup. В 154 образца попадают другие 12 определений; generated TagMore присутствует дополнительно в DOM части групп. [LIB][] создаёт m/primary/default, hover может отобразить m/primary/hover (узлы 195:28399 и 195:28403 из [M][]); это статический вывод из кода, не новый полный browser enumeration. Поэтому ни 154/3089, ни вычитание 18 из 171 не являются проверенным текущим end-to-end процентом.

[COV][] содержит актуальный верхний блок remediation и исторический аудит ниже. Старые утверждения о 12 roots, отсутствии Select persistence, декоративном TagMore, потере данных при v2 export и дорелизных ветках устарели; T4 использует текущий код, не исправляя COV. 116 definitions без исторического matrix sample = 130−14; 2918 variants вне исторической матрицы = 3089−171. Эти разности также не измеряют все оставшиеся операции.

## 4. Матрица фактической поддержки Registry

Source = сохранённая Figma inventory/seed, не live API. Числа Variants: source total → текущий sample subset. Все строки PARTIAL в смысле полной готовности, кроме явно UNSUPPORTED путей; локальные VERIFIED утверждения указаны отдельно.

| Component | Source | Definition | Variants | Contract Support | Renderer Support | Operations | Evidence | Known Gaps | Verification Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Button | [I][][S1][] | 15:17152, root | 128 → 4 | enums, strict props | m/primary/accent, 4 states | hover/pressed/disabled; native button | [PREP][][DSR][][UT4][][PW4][] | action/navigation binding отсутствует; остальные размеры/варианты | PARTIAL; 4 samples VERIFIED |
| Input | [I][][S1][] | 115:70, root | 39 → 13 | metadata шире Renderer; hint/label slots | l; disabled filled + placeholder=true не поддержан; slots только default/no-placeholder | временный ввод; error/disabled | [PREP][][DSR][][UT4][][UT5][][PW5][] | input value не сохраняется в Screen; label адаптирован; все композиции не покрыты | PARTIAL |
| Checkbox | [I][][S2][] | 44:354, root | 24 → 12 | strict запрещает indeterminate=true/checked=false | s, 3 checked/mixed комбинации × 4 states | toggle обновляет variantProps | [VAL][][DSR][][UT4][][PW4][] | xs; keyboard focus после remount не подтверждён | PARTIAL |
| Select | [I][][S2][][M][] | 195:56849, root | 90 → 8 | широкие enums; selectedValue string/null только из optionsText | 8 точных строк; 1–10 options | mouse/keyboard selection, Escape, reload/export persistence | [PREP][][LIB][][UT5][][PW5][] | duplicate labels не имеют разных IDs; нет search/multiselect; не все keys проверены | PARTIAL |
| TagItem | [I][][S5][][M][] | 195:1079, root + group child | 24 → 24 | точная matrix; props группы согласуются | 24 primitive samples, в группе subset | root close enabled/closable; group remove 2→1 | [COMP][][LIB][][UT5][][PW5][] | нет общего CRUD; small-size cross отображается независимо от closable, это не доказательство операции | PARTIAL; matrix VERIFIED |
| TagInput | [I][][S5][][M][] | 195:28347, internal | 6 → 6 primitives | component-level да; root и JSON slot запрещены | прямой Tag SSR только | temporary native input в primitive | [COMP][][LIB][][UT5][] | ввод/создание тегов в документе отсутствует | UNSUPPORTED в Screen; primitive PARTIAL |
| TagMore | [I][][S5][][M][] | 195:28366, internal | 12 → 12 primitives | root/JSON slot запрещены | generated TagGroup subset; 12 direct samples | Add Tag 1→2 при enabled | [COMP][][LIB][][UT5][][PW5][] | не все 12 достижимы из групп, не произвольное добавление | PARTIAL generated; root UNSUPPORTED |
| TagGroup | [I][][S5][][M][] | 195:28415, root | 240 → 8 | amount 1/2, m, booleans; TagItem children | 8 сочетаний | 1↔2, сохранение детей | [COMP][][SYNC][][LIB][][UT5][][PW5][] | нет 0, >2, TagInput slot, пользовательского ввода новых тегов | PARTIAL |
| Chip | [I][][S5][][M][] | 75:1401, root | 32 → 32 | точные rows, counter/label editor content | 32 samples | selected toggle, hover/pressed | [LIB][][UT5][][PW5][] | instance swaps отсутствуют; counter фиксирован 3; focus retention UNKNOWN | PARTIAL; matrix VERIFIED |
| Hint | [I][][S5][][M][] | 115:428, internal Input | 3 → 3 | slot hint 1 child; false/false отклоняется | Input owning sample | hintText/counterText | [COMP][][LIB][][UT5][][PW5][] | counter статический, не связан с вводом | PARTIAL |
| Label | [I][][S5][][M][] | 115:638, internal Input | 1 → 1 | slot label; необычные исходные имена сохранены | адаптация внутри Input, node 115:646 | necessarily marker; текст родительского Input | [COMP][][DSR][][UT5][][PW5][] | не отдельный универсальный Label; полная визуальная эквивалентность UNKNOWN | PARTIAL |
| DropdownMenu row | [I][][S5][][M][] | 91:7219, internal ItemsList | 28 → 28 | точные сочетания, 3 type | owner Menu→ItemsList→row | states, Select option handler | [COMP][][LIB][][UT5][][PW5][] | нет универсального action API для menu item | PARTIAL |
| ItemsList | [I][][S5][][M][] | 91:7468, internal Menu | 20 → 20 | x1…x10, m/s; children size/count согласованы | owning Menu | выбор в Select; standalone список без controller | [COMP][][LIB][][UT5][] | не самостоятельный root | PARTIAL |
| DropdownMenu container | [I][][S5][][M][] | 177:10720, standalone COMPONENT; Canvas root | 0 variants → 1 sample | slot items → один ItemsList | контейнер + generated Select menu | Select управляет popup; root не имеет controller | [COMP][][LIB][][UT5][][PW5][] | source intended standalone usage UNKNOWN | PARTIAL, source role UNKNOWN |
| legacy Table | [S2][] | frame 2073:10861 / cell example 2071:3830; root | не засчитывается | metadata entry, editor preview | strict UNSUPPORTED | legacy таблица preview | [REG][][PREP][][UTDS][] | не реализация table-cell 2071:3829 (56 variants) | UNSUPPORTED strict |

### 4.1. Точные доступные props реестра

Ниже перечислены **текущие** variantProps и editorProps, восстановленные из файлов, которые объединяет [REG][]. Это не полный property export Figma. Editor content не переименовывается в Figma property; отсутствие поля означает отсутствие поддержки, а не отсутствие свойства в источнике. Допустимые enums по отдельности не дают права на их декартово произведение: [VAL][]/[M][] и [PREP][] накладывают дополнительные ограничения.

| Component | Variant props: значения | Editor props | Evidence |
| --- | --- | --- | --- |
| tag-item | `size`: m/s/xs; `variant`: primary/secondary; `state`: default/hover/error/disabled | `closable`: boolean; `labelText`: text | [S5][][REG][][VAL][] |
| tag-input | `size`: m/s/xs; `variant`: primary/secondary | нет | [S5][][REG][][VAL][] |
| tag-more | `size`: m/s/xs; `variant`: primary/secondary; `state`: default/hover | нет | [S5][][REG][][VAL][] |
| tag-group | `amount`: 1/2; `closable`: boolean; `disabled`: boolean; `size`: m | нет | [S5][][REG][][VAL][] |
| chip | `variant`: primary/secondary; `selected`: boolean; `state`: default/hover/pressed/disabled; `icon`: boolean | `counter`: boolean; `labelText`: text | [S5][][REG][][VAL][] |
| hint | `hint`: boolean; `counter`: boolean | `hintText`: text; `counterText`: text | [S5][][REG][][VAL][] |
| field-label | `hint`: Elements; `counter`: Hint Container; `Property 3`: Elements; `Property 4`: Label | `necessarily`: boolean | [S5][][REG][][VAL][] |
| dropdown-item | `type`: menu item/group title/group divider; `size`: m/s; `selected`: boolean; `hover`: boolean; `disabled`: boolean; `icon2`: boolean | `itemText`: text | [S5][][REG][][VAL][] |
| items-list | `amount`: x1/x2/x3/x4/x5/x6/x7/x8/x9/x10; `size`: m/s | нет | [S5][][REG][][VAL][] |
| dropdown-menu | нет | нет | [S5][][REG][][VAL][] |
| button | `size`: s/m/l/xl; `variant`: primary/secondary/outline/ghost; `colorScheme`: accent/neutral; `state`: default/hover/pressed/disabled | `label`: text | [S1][][REG][][VAL][] |
| input | `size`: s/m/l; `state`: default/hover/pressed/filled/error/disabled default/disabled filled; `placeholder`: boolean | `placeholderText`: text; `label`: text | [S1][][REG][][VAL][] |
| select | `size`: s/m/l; `state`: default/hover/filled/pressed/error/disabled filled/disabled default; `placeholder`: boolean; `label`: boolean; `foldDirection`: down/up | `labelText`: text; `placeholderText`: text; `optionsText`: text | [S2][][REG][][VAL][] |
| checkbox | `size`: s/xs; `state`: default/hover/pressed/disabled; `checked`: boolean; `indeterminate`: boolean | `label`: text | [S2][][REG][][VAL][] |
| table | нет | `title`: text | [S2][][REG][][VAL][] |

### 4.2. Композиции, состояния и токены

[COMP][][SC][][VAL][] разрешают только: Input→hint(1)/label(1), TagGroup→tags(1–2 TagItem), DropdownMenu→items(1 ItemsList), ItemsList→items(1–10 DropdownMenu rows). Слоты опциональны; если слот присутствует, действуют min/max. Запрет root распространяется на все 6 internal, включая compatible import. allowedParents для TagInput/TagMore не создаёт отсутствующий slot. Проверяются nested IDs, глубина (depth >3 отклоняется), общий предел 500 элементов. JSON parse ограничен 2 MB; текстовые props ограничены 2000 символов. Генерируемые children не равны явно сохранённым слотам.

TagGroup требует child size=parent.size, variant=primary, default/disabled по parent и совпадающий closable; количество равно amount. ItemsList требует amount и size согласованными с детьми. Input slots в Renderer допускаются только l/default/placeholder=false [PREP][]. Schema сама по себе не доказывает renderer support.

Select sample scope [M]: size=l, label=true; down/default, hover, filled, pressed, error, disabled default с placeholder=true; down/disabled filled с placeholder=false; up только pressed/placeholder=true. Остальные metadata сочетания не выдаются за подтверждённый Renderer subset. optionsText — редакторские данные; Select хранит выбранный текст, не стабильный option ID. Keyboard handlers в [LIB][] включают ArrowUp/Down, Home/End, Enter/Space, Escape; [PW5][] непосредственно проверяет только часть последовательностей. Код обработчика не равен выполненному тесту каждого пути.

57 имён token seed проверены в рамках выбранных sample nodes; Manrope входит как Font family/primary. [VAL][] проверяет точные имена и при явном вызове validateToken — тип/значение; tokenReferences не произвольный styling API. Строгая тема — оригинальная light Figma, global themeOverrides дают UNVERIFIED_STYLE; compatible сохраняет overrides. Полные коллекции/modes, alias graph и происхождение каждого literal CSS не инвентаризированы. Цвет, размер или отступ в коде не становится самостоятельным подтверждённым токеном автоматически [TOK1][][TOK4][][TOK5][][DSR][][LIB][].

## 5. Полный перечень 130 UI-определений

Сжатый индекс дополняет подробную таблицу §4, не заменяет её. Source/Definition/Variants/Role — [I][] от 30.10.2026. Для rows без builderId контракт/строгий Renderer/операции Canvas UNSUPPORTED по отсутствию ID в [REG][][SC][][PREP][]; props/styles/compositions и product intended usage UNKNOWN, если inventory не даёт утверждения. Это не утверждение об отсутствии компонента в Figma. Для rows с builderId ограничения, операции и evidence — §4. Counts VERIFIED как сохранённые структурные данные. Полная raw классификация сохранена без повышения public candidate до verified public.

| Figma Page | Component / Definition | Source variants | Registry / sample rows | Source role | Verification status / evidence |
| --- | --- | ---: | --- | --- | --- |
| Button | Button / `15:17152` | 128 | button / 4 | public candidate: description available | PARTIAL: см. §4 [REG][][PREP][][M][]; counts [I][] |
| Button | Button Danger / `2080:51016` | 128 | absent / 0 | public candidate: description available | UNSUPPORTED Canvas/strict; props UNKNOWN [REG][][SC][][PREP][]; counts [I][] |
| Button Icon | ButtonIcon / `109:7542` | 128 | absent / 0 | public candidate: description available | UNSUPPORTED Canvas/strict; props UNKNOWN [REG][][SC][][PREP][]; counts [I][] |
| Button Icon | ButtonIcon Danger / `132416:5574` | 128 | absent / 0 | public candidate: description available | UNSUPPORTED Canvas/strict; props UNKNOWN [REG][][SC][][PREP][]; counts [I][] |
| Button Floating Action | ButtonFloatingAction / `106:1901` | 16 | absent / 0 | public candidate: description available | UNSUPPORTED Canvas/strict; props UNKNOWN [REG][][SC][][PREP][]; counts [I][] |
| Button Floating Action | Elements / Menu / `106:1968` | 5 | absent / 0 | internal: verified description | UNSUPPORTED Canvas/strict; props UNKNOWN [REG][][SC][][PREP][]; counts [I][] |
| Button Floating Action | Elements / ButtonFloatingAction / `106:1989` | 4 | absent / 0 | internal: verified description | UNSUPPORTED Canvas/strict; props UNKNOWN [REG][][SC][][PREP][]; counts [I][] |
| Button Close | ButtonClose / `88:2079` | 15 | absent / 0 | public candidate: description available | UNSUPPORTED Canvas/strict; props UNKNOWN [REG][][SC][][PREP][]; counts [I][] |
| Button Function | ButtonFunction / `88:10237` | 24 | absent / 0 | public candidate: description available | UNSUPPORTED Canvas/strict; props UNKNOWN [REG][][SC][][PREP][]; counts [I][] |
| Button Radio | ButtonRadio / `188:15582` | 32 | absent / 0 | public candidate: description available | UNSUPPORTED Canvas/strict; props UNKNOWN [REG][][SC][][PREP][]; counts [I][] |
| Input | Input / `115:70` | 39 | input / 13 | public candidate: description available | PARTIAL: см. §4 [REG][][PREP][][M][]; counts [I][] |
| Input | Elements / Hint Container / `115:428` | 3 | hint / 3 | internal: verified description | PARTIAL: см. §4 [REG][][PREP][][M][]; counts [I][] |
| Input | Elements / Label / `115:638` | 1 | field-label / 1 | internal: verified description | PARTIAL: см. §4 [REG][][PREP][][M][]; counts [I][] |
| Input Card | InputCard / `116:5604` | 39 | absent / 0 | public candidate: description available | UNSUPPORTED Canvas/strict; props UNKNOWN [REG][][SC][][PREP][]; counts [I][] |
| Input Date | InputDate / `177:37499` | 90 | absent / 0 | public candidate: description available | UNSUPPORTED Canvas/strict; props UNKNOWN [REG][][SC][][PREP][]; counts [I][] |
| Input Text Area | TextArea / `189:15908` | 156 | absent / 0 | public candidate: description available | UNSUPPORTED Canvas/strict; props UNKNOWN [REG][][SC][][PREP][]; counts [I][] |
| Input Number Stepper | InputNumberStepper / `187:34753` | 28 | absent / 0 | public candidate: description available | UNSUPPORTED Canvas/strict; props UNKNOWN [REG][][SC][][PREP][]; counts [I][] |
| Input Select | Select / `195:56849` | 90 | select / 8 | public candidate: description available | PARTIAL: см. §4 [REG][][PREP][][M][]; counts [I][] |
| Picker Date | PickerDate / `177:43610` | 16 | absent / 0 | public candidate: description available | UNSUPPORTED Canvas/strict; props UNKNOWN [REG][][SC][][PREP][]; counts [I][] |
| Picker Date | Elements / TextDate / `177:44159` | 7 | absent / 0 | internal: verified description | UNSUPPORTED Canvas/strict; props UNKNOWN [REG][][SC][][PREP][]; counts [I][] |
| Picker Date | Elements / DigitDate / `177:44184` | 13 | absent / 0 | internal: verified description | UNSUPPORTED Canvas/strict; props UNKNOWN [REG][][SC][][PREP][]; counts [I][] |
| Picker Date | Elements / ControlPanelButtons / `177:44228` | 7 | absent / 0 | internal: verified description | UNSUPPORTED Canvas/strict; props UNKNOWN [REG][][SC][][PREP][]; counts [I][] |
| Picker Date | Elements / ControlPanel / `177:50416` | 1 | absent / 0 | internal candidate: not verified | UNSUPPORTED Canvas/strict; props UNKNOWN [REG][][SC][][PREP][]; counts [I][] |
| Loader | Loader / `188:12160` | 24 | absent / 0 | public candidate: description available | UNSUPPORTED Canvas/strict; props UNKNOWN [REG][][SC][][PREP][]; counts [I][] |
| Loader | Loader_spin / `2044:7272` | 6 | absent / 0 | public candidate: description available | UNSUPPORTED Canvas/strict; props UNKNOWN [REG][][SC][][PREP][]; counts [I][] |
| Checkbox | Checkbox / `44:354` | 24 | checkbox / 12 | public candidate: description available | PARTIAL: см. §4 [REG][][PREP][][M][]; counts [I][] |
| Segmented Control | Elements / Segment / `201:4194` | 48 | absent / 0 | internal: verified description | UNSUPPORTED Canvas/strict; props UNKNOWN [REG][][SC][][PREP][]; counts [I][] |
| Segmented Control | SegmentedControl / `201:4399` | 54 | absent / 0 | public candidate: description available | UNSUPPORTED Canvas/strict; props UNKNOWN [REG][][SC][][PREP][]; counts [I][] |
| Breadcrumbs | Elements / Breadcrumb / `91:3664` | 4 | absent / 0 | internal: verified description | UNSUPPORTED Canvas/strict; props UNKNOWN [REG][][SC][][PREP][]; counts [I][] |
| Breadcrumbs | Elements / Divider / `91:3674` | 5 | absent / 0 | internal: verified description | UNSUPPORTED Canvas/strict; props UNKNOWN [REG][][SC][][PREP][]; counts [I][] |
| Breadcrumbs | Breadcrumbs / `91:3684` | 6 | absent / 0 | public candidate: description available | UNSUPPORTED Canvas/strict; props UNKNOWN [REG][][SC][][PREP][]; counts [I][] |
| Dropdown Menu | DropdownMenu / `91:7219` | 28 | dropdown-item / 28 | internal: verified description | PARTIAL: см. §4 [REG][][PREP][][M][]; counts [I][] |
| Dropdown Menu | Elements / ItemsList / `91:7468` | 20 | items-list / 20 | internal: verified description | PARTIAL: см. §4 [REG][][PREP][][M][]; counts [I][] |
| Dropdown Menu | Elements / DropdownMenu / `177:10720` | 0 | dropdown-menu / 1 | internal candidate: not verified | PARTIAL: см. §4 [REG][][PREP][][M][]; counts [I][] |
| Slider | Slider / `201:38923` | 10 | absent / 0 | public candidate: description available | UNSUPPORTED Canvas/strict; props UNKNOWN [REG][][SC][][PREP][]; counts [I][] |
| Range | Range / `2089:372` | 2 | absent / 0 | public candidate: description available | UNSUPPORTED Canvas/strict; props UNKNOWN [REG][][SC][][PREP][]; counts [I][] |
| Stepper | Stepper / `207:46069` | 128 | absent / 0 | role not verified | UNSUPPORTED Canvas/strict; props UNKNOWN [REG][][SC][][PREP][]; counts [I][] |
| Switch | Switch / `207:49212` | 32 | absent / 0 | role not verified | UNSUPPORTED Canvas/strict; props UNKNOWN [REG][][SC][][PREP][]; counts [I][] |
| Badge | Status Text / `41:433` | 72 | absent / 0 | role not verified | UNSUPPORTED Canvas/strict; props UNKNOWN [REG][][SC][][PREP][]; counts [I][] |
| Badge | Counter / `81:2200` | 12 | absent / 0 | role not verified | UNSUPPORTED Canvas/strict; props UNKNOWN [REG][][SC][][PREP][]; counts [I][] |
| Badge | Badge__Status / `2042:5469` | 26 | absent / 0 | role not verified | UNSUPPORTED Canvas/strict; props UNKNOWN [REG][][SC][][PREP][]; counts [I][] |
| Badge | Badge / `2042:3627` | 3 | absent / 0 | role not verified | UNSUPPORTED Canvas/strict; props UNKNOWN [REG][][SC][][PREP][]; counts [I][] |
| Chip | Chip / `75:1401` | 32 | chip / 32 | role not verified | PARTIAL: см. §4 [REG][][PREP][][M][]; counts [I][] |
| Tabs | Elements / TabItem / `207:73852` | 48 | absent / 0 | internal candidate: not verified | UNSUPPORTED Canvas/strict; props UNKNOWN [REG][][SC][][PREP][]; counts [I][] |
| Tabs | Tabs / `207:75785` | 1 | absent / 0 | role not verified | UNSUPPORTED Canvas/strict; props UNKNOWN [REG][][SC][][PREP][]; counts [I][] |
| Tabs | Elements / TabsGroup / `207:74135` | 36 | absent / 0 | internal candidate: not verified | UNSUPPORTED Canvas/strict; props UNKNOWN [REG][][SC][][PREP][]; counts [I][] |
| Tags | TagItem / `195:1079` | 24 | tag-item / 24 | public candidate: description available | PARTIAL: см. §4 [REG][][PREP][][M][]; counts [I][] |
| Tags | TagInput / `195:28347` | 6 | tag-input / 6 | internal: verified description | PARTIAL: см. §4 [REG][][PREP][][M][]; counts [I][] |
| Tags | TagMore / `195:28366` | 12 | tag-more / 12 | internal: verified description | PARTIAL: см. §4 [REG][][PREP][][M][]; counts [I][] |
| Tags | TagGroup / `195:28415` | 240 | tag-group / 8 | public candidate: description available | PARTIAL: см. §4 [REG][][PREP][][M][]; counts [I][] |
| Inline Notification | InlineNotification / `88:1933` | 4 | absent / 0 | role not verified | UNSUPPORTED Canvas/strict; props UNKNOWN [REG][][SC][][PREP][]; counts [I][] |
| Toast Notification | ToastNotification / `88:8149` | 4 | absent / 0 | role not verified | UNSUPPORTED Canvas/strict; props UNKNOWN [REG][][SC][][PREP][]; counts [I][] |
| Alerts Notification | AlertsNotification / `2027:47084` | 24 | absent / 0 | role not verified | UNSUPPORTED Canvas/strict; props UNKNOWN [REG][][SC][][PREP][]; counts [I][] |
| Tooltip | Tooltip / `88:4734` | 24 | absent / 0 | role not verified | UNSUPPORTED Canvas/strict; props UNKNOWN [REG][][SC][][PREP][]; counts [I][] |
| Tooltip | Tooltips (popover) / `228:26483` | 15 | absent / 0 | role not verified | UNSUPPORTED Canvas/strict; props UNKNOWN [REG][][SC][][PREP][]; counts [I][] |
| Avatar | Avatar / `2024:24665` | 228 | absent / 0 | role not verified | UNSUPPORTED Canvas/strict; props UNKNOWN [REG][][SC][][PREP][]; counts [I][] |
| Avatar | Avatar label group / `2071:38102` | 4 | absent / 0 | role not verified | UNSUPPORTED Canvas/strict; props UNKNOWN [REG][][SC][][PREP][]; counts [I][] |
| Avatar | _Avatar add button / `2071:38283` | 12 | absent / 0 | internal candidate: not verified | UNSUPPORTED Canvas/strict; props UNKNOWN [REG][][SC][][PREP][]; counts [I][] |
| Avatar | Avatar group / `2071:38326` | 12 | absent / 0 | role not verified | UNSUPPORTED Canvas/strict; props UNKNOWN [REG][][SC][][PREP][]; counts [I][] |
| Paginator | Pagination / `228:21323` | 1 | absent / 0 | role not verified | UNSUPPORTED Canvas/strict; props UNKNOWN [REG][][SC][][PREP][]; counts [I][] |
| Paginator | Control / `235:22274` | 18 | absent / 0 | role not verified | UNSUPPORTED Canvas/strict; props UNKNOWN [REG][][SC][][PREP][]; counts [I][] |
| Paginator | Page / `235:22259` | 5 | absent / 0 | role not verified | UNSUPPORTED Canvas/strict; props UNKNOWN [REG][][SC][][PREP][]; counts [I][] |
| Paginator | _Pagination dot indicator / `2080:29965` | 32 | absent / 0 | internal candidate: not verified | UNSUPPORTED Canvas/strict; props UNKNOWN [REG][][SC][][PREP][]; counts [I][] |
| Paginator | Pagination dot group / `2080:29998` | 32 | absent / 0 | role not verified | UNSUPPORTED Canvas/strict; props UNKNOWN [REG][][SC][][PREP][]; counts [I][] |
| Paginator | _Carousel arrow / `2080:30351` | 16 | absent / 0 | internal candidate: not verified | UNSUPPORTED Canvas/strict; props UNKNOWN [REG][][SC][][PREP][]; counts [I][] |
| Paginator | Carousel image / `2080:30384` | 6 | absent / 0 | role not verified | UNSUPPORTED Canvas/strict; props UNKNOWN [REG][][SC][][PREP][]; counts [I][] |
| Paginator | Pagination Component / `2088:823` | 4 | absent / 0 | role not verified | UNSUPPORTED Canvas/strict; props UNKNOWN [REG][][SC][][PREP][]; counts [I][] |
| Paginator | Pagination 2  / `2088:832` | 4 | absent / 0 | role not verified | UNSUPPORTED Canvas/strict; props UNKNOWN [REG][][SC][][PREP][]; counts [I][] |
| Tables | table-cell / `2071:3829` | 56 | absent / 0 | internal candidate: not verified | UNSUPPORTED Canvas/strict; props UNKNOWN [REG][][SC][][PREP][]; counts [I][] |
| Accordions | Accordion / `2034:33578` | 10 | absent / 0 | role not verified | UNSUPPORTED Canvas/strict; props UNKNOWN [REG][][SC][][PREP][]; counts [I][] |
| Scroll | Scroll / `91:7008` | 2 | absent / 0 | role not verified | UNSUPPORTED Canvas/strict; props UNKNOWN [REG][][SC][][PREP][]; counts [I][] |
| Dividers | Divider / `2112:1253` | 6 | absent / 0 | role not verified | UNSUPPORTED Canvas/strict; props UNKNOWN [REG][][SC][][PREP][]; counts [I][] |
| Steppers | Stepper / `206:21945` | 12 | absent / 0 | role not verified | UNSUPPORTED Canvas/strict; props UNKNOWN [REG][][SC][][PREP][]; counts [I][] |
| Steppers | .steps__item_vertical / `2045:45999` | 30 | absent / 0 | internal candidate: not verified | UNSUPPORTED Canvas/strict; props UNKNOWN [REG][][SC][][PREP][]; counts [I][] |
| Steppers | .steps__item_progress / `2045:45701` | 15 | absent / 0 | internal candidate: not verified | UNSUPPORTED Canvas/strict; props UNKNOWN [REG][][SC][][PREP][]; counts [I][] |
| Steppers | .steps__item_tail / `2045:45731` | 8 | absent / 0 | internal candidate: not verified | UNSUPPORTED Canvas/strict; props UNKNOWN [REG][][SC][][PREP][]; counts [I][] |
| Steppers | .steps__item_horizontal / `2045:45748` | 40 | absent / 0 | internal candidate: not verified | UNSUPPORTED Canvas/strict; props UNKNOWN [REG][][SC][][PREP][]; counts [I][] |
| Steppers | Steps / `2045:47019` | 28 | absent / 0 | role not verified | UNSUPPORTED Canvas/strict; props UNKNOWN [REG][][SC][][PREP][]; counts [I][] |
| Charts | _X-axis / `2080:6197` | 6 | absent / 0 | internal candidate: not verified | UNSUPPORTED Canvas/strict; props UNKNOWN [REG][][SC][][PREP][]; counts [I][] |
| Charts | _Chart data / `2080:6267` | 15 | absent / 0 | internal candidate: not verified | UNSUPPORTED Canvas/strict; props UNKNOWN [REG][][SC][][PREP][]; counts [I][] |
| Charts | _Y-axis line / `2080:6478` | 2 | absent / 0 | internal candidate: not verified | UNSUPPORTED Canvas/strict; props UNKNOWN [REG][][SC][][PREP][]; counts [I][] |
| Charts | _Chart bar / `2080:6485` | 3 | absent / 0 | internal candidate: not verified | UNSUPPORTED Canvas/strict; props UNKNOWN [REG][][SC][][PREP][]; counts [I][] |
| Charts | _Legend / `2080:6495` | 2 | absent / 0 | internal candidate: not verified | UNSUPPORTED Canvas/strict; props UNKNOWN [REG][][SC][][PREP][]; counts [I][] |
| Charts | _Y-axis / `2080:6544` | 2 | absent / 0 | internal candidate: not verified | UNSUPPORTED Canvas/strict; props UNKNOWN [REG][][SC][][PREP][]; counts [I][] |
| Charts | _Activitiy gauge / `2080:6571` | 8 | absent / 0 | internal candidate: not verified | UNSUPPORTED Canvas/strict; props UNKNOWN [REG][][SC][][PREP][]; counts [I][] |
| Charts | _Pie chart / `2080:6664` | 16 | absent / 0 | internal candidate: not verified | UNSUPPORTED Canvas/strict; props UNKNOWN [REG][][SC][][PREP][]; counts [I][] |
| Charts | Line and bar chart / `2080:7408` | 24 | absent / 0 | role not verified | UNSUPPORTED Canvas/strict; props UNKNOWN [REG][][SC][][PREP][]; counts [I][] |
| Charts | Activity gauge / `2080:9643` | 24 | absent / 0 | role not verified | UNSUPPORTED Canvas/strict; props UNKNOWN [REG][][SC][][PREP][]; counts [I][] |
| Charts | Pie chart / `2080:10314` | 50 | absent / 0 | role not verified | UNSUPPORTED Canvas/strict; props UNKNOWN [REG][][SC][][PREP][]; counts [I][] |
| Charts | Progress circle / `2080:11267` | 16 | absent / 0 | role not verified | UNSUPPORTED Canvas/strict; props UNKNOWN [REG][][SC][][PREP][]; counts [I][] |
| Charts | _X-axis label / `2080:6193` | 0 | absent / 0 | internal candidate: not verified | UNSUPPORTED Canvas/strict; props UNKNOWN [REG][][SC][][PREP][]; counts [I][] |
| Charts | _Y-axis label / `2080:6195` | 0 | absent / 0 | internal candidate: not verified | UNSUPPORTED Canvas/strict; props UNKNOWN [REG][][SC][][PREP][]; counts [I][] |
| Uploads | File Upload / `204:3792` | 3 | absent / 0 | role not verified | UNSUPPORTED Canvas/strict; props UNKNOWN [REG][][SC][][PREP][]; counts [I][] |
| Uploads | Dropzone / `2044:21898` | 2 | absent / 0 | role not verified | UNSUPPORTED Canvas/strict; props UNKNOWN [REG][][SC][][PREP][]; counts [I][] |
| Uploads | Dropzone_photo / `2044:22345` | 5 | absent / 0 | role not verified | UNSUPPORTED Canvas/strict; props UNKNOWN [REG][][SC][][PREP][]; counts [I][] |
| Uploads | Button_file upload / `2040:1008` | 4 | absent / 0 | role not verified | UNSUPPORTED Canvas/strict; props UNKNOWN [REG][][SC][][PREP][]; counts [I][] |
| Uploads | FileUploader / `2088:4435` | 5 | absent / 0 | role not verified | UNSUPPORTED Canvas/strict; props UNKNOWN [REG][][SC][][PREP][]; counts [I][] |
| Uploads | Small upload / `2091:8750` | 4 | absent / 0 | role not verified | UNSUPPORTED Canvas/strict; props UNKNOWN [REG][][SC][][PREP][]; counts [I][] |
| Uploads | Big Upload / `2091:8790` | 4 | absent / 0 | role not verified | UNSUPPORTED Canvas/strict; props UNKNOWN [REG][][SC][][PREP][]; counts [I][] |
| Uploads | file upload states / `2091:11563` | 4 | absent / 0 | role not verified | UNSUPPORTED Canvas/strict; props UNKNOWN [REG][][SC][][PREP][]; counts [I][] |
| Uploads | File Uploading Progress / `2093:3529` | 8 | absent / 0 | role not verified | UNSUPPORTED Canvas/strict; props UNKNOWN [REG][][SC][][PREP][]; counts [I][] |
| Uploads | File Uploader / `2093:3941` | 3 | absent / 0 | role not verified | UNSUPPORTED Canvas/strict; props UNKNOWN [REG][][SC][][PREP][]; counts [I][] |
| Uploads | Upload / list / `2107:3746` | 12 | absent / 0 | role not verified | UNSUPPORTED Canvas/strict; props UNKNOWN [REG][][SC][][PREP][]; counts [I][] |
| Uploads | Upload / `2107:6796` | 6 | absent / 0 | role not verified | UNSUPPORTED Canvas/strict; props UNKNOWN [REG][][SC][][PREP][]; counts [I][] |
| Uploads | Upload / file-list-item / `2107:4496` | 3 | absent / 0 | role not verified | UNSUPPORTED Canvas/strict; props UNKNOWN [REG][][SC][][PREP][]; counts [I][] |
| Uploads | Upload / picture-list-item / `2107:4592` | 3 | absent / 0 | role not verified | UNSUPPORTED Canvas/strict; props UNKNOWN [REG][][SC][][PREP][]; counts [I][] |
| Uploads | Upload / picture-card / `2107:4663` | 4 | absent / 0 | role not verified | UNSUPPORTED Canvas/strict; props UNKNOWN [REG][][SC][][PREP][]; counts [I][] |
| Uploads | upload-trigger / `2107:5215` | 4 | absent / 0 | role not verified | UNSUPPORTED Canvas/strict; props UNKNOWN [REG][][SC][][PREP][]; counts [I][] |
| Uploads | Mutilple Uploads / `2091:8981` | 0 | absent / 0 | role not verified | UNSUPPORTED Canvas/strict; props UNKNOWN [REG][][SC][][PREP][]; counts [I][] |
| Other | Progress Bars / `205:9638` | 10 | absent / 0 | role not verified | UNSUPPORTED Canvas/strict; props UNKNOWN [REG][][SC][][PREP][]; counts [I][] |
| Other | Progress / `225:47447` | 33 | absent / 0 | role not verified | UNSUPPORTED Canvas/strict; props UNKNOWN [REG][][SC][][PREP][]; counts [I][] |
| Other | Password indicator / `226:10556` | 3 | absent / 0 | role not verified | UNSUPPORTED Canvas/strict; props UNKNOWN [REG][][SC][][PREP][]; counts [I][] |
| Other | Progress circle / `226:10636` | 7 | absent / 0 | role not verified | UNSUPPORTED Canvas/strict; props UNKNOWN [REG][][SC][][PREP][]; counts [I][] |
| Other | Chat bubble / `225:46154` | 8 | absent / 0 | role not verified | UNSUPPORTED Canvas/strict; props UNKNOWN [REG][][SC][][PREP][]; counts [I][] |
| Other | Progress semicircle / `228:8888` | 4 | absent / 0 | role not verified | UNSUPPORTED Canvas/strict; props UNKNOWN [REG][][SC][][PREP][]; counts [I][] |
| Other | Start Rating / `2036:35156` | 6 | absent / 0 | role not verified | UNSUPPORTED Canvas/strict; props UNKNOWN [REG][][SC][][PREP][]; counts [I][] |
| Other | Rate / `2044:21184` | 6 | absent / 0 | role not verified | UNSUPPORTED Canvas/strict; props UNKNOWN [REG][][SC][][PREP][]; counts [I][] |
| Other | Parts / `2044:21251` | 6 | absent / 0 | role not verified | UNSUPPORTED Canvas/strict; props UNKNOWN [REG][][SC][][PREP][]; counts [I][] |
| Other | Progress__Line / `2044:6677` | 42 | absent / 0 | role not verified | UNSUPPORTED Canvas/strict; props UNKNOWN [REG][][SC][][PREP][]; counts [I][] |
| Other | Progress__Circle / `2044:7116` | 12 | absent / 0 | public candidate: description available | UNSUPPORTED Canvas/strict; props UNKNOWN [REG][][SC][][PREP][]; counts [I][] |
| Other | QR Code / `2044:42215` | 3 | absent / 0 | role not verified | UNSUPPORTED Canvas/strict; props UNKNOWN [REG][][SC][][PREP][]; counts [I][] |
| Other | Progress Steps / `2044:7188` | 12 | absent / 0 | public candidate: description available | UNSUPPORTED Canvas/strict; props UNKNOWN [REG][][SC][][PREP][]; counts [I][] |
| Other | Message Menus / `2091:14309` | 10 | absent / 0 | role not verified | UNSUPPORTED Canvas/strict; props UNKNOWN [REG][][SC][][PREP][]; counts [I][] |
| Other | Message bubbles / `2091:16946` | 10 | absent / 0 | role not verified | UNSUPPORTED Canvas/strict; props UNKNOWN [REG][][SC][][PREP][]; counts [I][] |
| Other | Activity Item / `2091:18812` | 8 | absent / 0 | role not verified | UNSUPPORTED Canvas/strict; props UNKNOWN [REG][][SC][][PREP][]; counts [I][] |
| Other | Activity Feed Content / `2091:19013` | 7 | absent / 0 | role not verified | UNSUPPORTED Canvas/strict; props UNKNOWN [REG][][SC][][PREP][]; counts [I][] |
| Other | Activity / `2092:11814` | 1 | absent / 0 | role not verified | UNSUPPORTED Canvas/strict; props UNKNOWN [REG][][SC][][PREP][]; counts [I][] |
| Other | Comment / `2105:4321` | 2 | absent / 0 | public candidate: description available | UNSUPPORTED Canvas/strict; props UNKNOWN [REG][][SC][][PREP][]; counts [I][] |
| Other | Сomment-nested / `2113:4678` | 1 | absent / 0 | public candidate: description available | UNSUPPORTED Canvas/strict; props UNKNOWN [REG][][SC][][PREP][]; counts [I][] |
| Other | Progress Bar Tabs / `132413:793` | 3 | absent / 0 | role not verified | UNSUPPORTED Canvas/strict; props UNKNOWN [REG][][SC][][PREP][]; counts [I][] |

Standalone source count 0 variants в этой таблице не означает 0 COMPONENT. Legacy Table не совпадает с table-cell по identity и поэтому отдельно приведён в §4. Avatar и ButtonClose, используемые оболочкой, не становятся компонентами Canvas и не включаются в его renderer coverage [COV][][REG][].

## 6. Interaction и evidence: что именно проверяют тесты

| Evidence | Подтверждаемое утверждение / процедура | Не доказывает |
| --- | --- | --- |
| [UT4][] 5 тестов | 29 samples SSR, semantic controls/цвета/Manrope/assets; fail-closed; повторная валидация; границы import/edit/prompt/export | Все source variants; полный browser/a11y scope |
| [UT5][] 8 тестов | 143 library samples с 18 primitives отдельно; owning compositions; отрицательные nesting/combinations; round-trip tokenReferences/slots/selectedValue; sync children; checksums assets; recovery legacy | 143 самостоятельных компонента; полноценный Tags CRUD; keyboard focus |
| [UTDS][] 10 тестов | Соответствие каталога, props/tokens, strict/compatible, миграции, prototype names, отрицательный v2 export | Source-neutral snapshots, bindings, CR evidence gate из T1–T3 |
| [REC][] 2 теста | Последовательные backups, account isolation ключей, ошибки записи без уничтожения прежнего исходника | Облачный backup, защиту от очистки browser storage |
| [PW4][] 2 сценария | Screenshot 29 samples, Button hover, Checkbox check, assets/Manrope, strict override rejection | Удержание фокуса Checkbox после toggle |
| [PW5][] 8 сценариев (цикл tags/chips/menu = 3 + 5 остальных) | State screenshots; Chip click; Select mouse + ArrowDown/End/Enter/Escape, reload/export; error/disabled/directions; TagGroup 2→1→2/reload; forbidden roots/recovery/quota/download; root Tag close/persistence | Все keyboard paths, focus loops, произвольные варианты, Search/Multiselect, все menu actions |

Всего текущих test declarations верхнего уровня: 38 TS + 2 server auth = 40 (повторный статический пересчёт файлов tests/*.test.*). Это не 40 UI assertions и не 40 новых PASS. Playwright — 10 сценариев, 13 сохранённых PNG Darwin (файлы снимков, не 13 независимых операций). [REMED][] сообщает исторические PASS 40 tests и 10/10 Playwright для рабочего дерева перед коммитом; его временные /tmp логи не являются неизменяемым GitHub run evidence. В T4 результат выполнения: **NOT RUN**; актуальность live CI: **UNKNOWN**. Исторические принятые результаты Delivery Baseline не выдаются за новый прогон.

PR workflow [CI][] выполняет Linux проверки + 3 portable Playwright smoke и затем macOS все 10 с Darwin baselines. Deployment workflow [DEPLOY][] на main содержит ds validation/build/test/pages, но не Playwright. Наличие конфигурации подтверждено, успешный run на конкретном SHA в T4 не запрашивался.

Известный фокус-риск: [DSR][] использует key=JSON.stringify(element без interactionState). Изменение variantProps Checkbox/Chip меняет key и может перемонтировать элемент. Исключение interactionState помогает Select, но не доказывает фокус остальных. Tests click/check не проверяют повторный keyboard toggle и activeElement после обновления. Это технический долг baseline; статус удержания фокуса UNKNOWN, не автоматически VERIFIED по общей зелёной сборке [T1][][T2][][T3][].

## 7. Главные пробелы и ограничения измерений

1. TagInput: 6 primitive rows не дают ни допустимого JSON-вложения, ни ввода/создания tags в документе. TagGroup ограничен 8 сочетаниями из 240, количеством 1/2 и m. TagMore имеет лишь узкий generated subset. Нельзя утверждать полный Tags CRUD [COMP][][LIB][][M][].
2. DropdownMenu: row/list matrices отображаются в владельцах; самостоятельный action controller отсутствует. Container role в Figma UNKNOWN. Наличие 28+20 samples не означает 48 полноценных действий меню [I][][LIB][].
3. Input: local value не round-trip state, counter статичен; Label адаптирован, а compositions ограничены одной parent комбинацией. Это не универсальная form model [DSR][][SC][].
4. Select: выбранный текст сохраняется; дубликаты не различимы по identity. Up только один подтверждённый row; metadata states шире Renderer. Динамические визуальные состояния требуют отдельного учёта evidence, а не только исходного data-figma-node [LIB][][M][][PW5][].
5. Legacy Table: root metadata и preview не строгая реализация Figma table-cell. Не считать закрытым отсутствующее табличное семейство [S2][][PREP][][I][].
6. Полнота визуальной геометрии, accessibility, error recovery всех взаимодействий, всех source properties и токенов UNKNOWN. Есть конкретные literal styles и source captures, но нет полного trace каждого rendered свойства к evidence [CTX][][AUD][][DSR][][LIB][].
7. Legacy/storage: v3 сохраняет nesting/tokenReferences/Select state в проверенных сценариях; v1 radius >32 получает warning; v2 export запрещает непредставимые данные. Raw rejected backups локальны, очистка браузера их удаляет. Совместимость всех исторических проектов и rollback сайта не доказана [MIG][][UT5][][UTDS][][REC][].
8. Полные роли источников/immutable bindings/readiness gate ещё концептуальны. Файлы snapshots здесь означают Figma capture или PNG, не реализованный Library Snapshot/runtime binding из T1. Никаких CR3 назначений по итогам T4 нет [T1][][T2][][T3][].

## 8. Предложения для будущего согласования

Приоритет 1: утвердить единицы claims/operations/environment и воспроизводимый coverage manifest, связывающий source node → contract tuple → допустимый owner → Renderer operation → test assertion → run SHA. Отдельно учитывать generated children, недостижимые primitives и разные варианты одного имени. Это предложение, не создание нового кода или API.

Приоритет 2: проверить keyboard focus Checkbox/Chip отдельными сценариями; уточнить Label fidelity, Input persistence scope, duplicate options Select и menu-controller scope. Решение о реализации каждой возможности отдельно; сначала определить контракт/evidence, не расширять произвольно props.

Приоритет 3: уточнить source role контейнера и неподтверждённых внутренних определений; затем планировать недостающие варианты базовых форм и Tags. Полные sets не достраивать из enum permutations. До TagInput integration требуется подтверждённая композиция и согласованный продуктовый контракт.

Приоритет 4: измерить токены/modes и source-to-style trace отдельно от компонентов; определить политику визуальных платформ и хранение CI evidence. Для второго источника нужны полные E3/ADP-01 протоколы и отдельное разрешение, не новая интеграция в T4 [T1][].

## 9. Критерии завершения T4

- Владелец согласовал единицы пяти метрик, source scope/date, root/internal различие и запрет единого процента готовности.
- Все 130 сохранённых UI definitions имеют identity/count/status; 15 Registry entries раскрыты по props, ограничениям, операциям и evidence.
- Числа 130/3089/14/171/154/18 воспроизводимы из закреплённых файлов; standalone отделён от variants, generated от direct samples.
- UNKNOWN, UNSUPPORTED и наличие теста без нового run не смешиваются; limitations и focus debt сохранены.
- Следующие работы определяются отдельно владельцем. Принятие T4 не разрешает T5–T7, изменения runtime, CR3, новый Preview или интеграции.

Итог: **T4 ACCEPTED**, дата утверждения **04.11.2026**. Только анализ и документирование; код, прежние документы, Git history и ветка не изменяются.

## 10. Реестр доказательств и точные версии

Все tracked evidence ниже закреплены feature SHA `1986326c713c87c2f360e0b66656d11518721284`; tree равен baseline merge. SHA-256 — локально прочитанные bytes на 04.11.2026. Для T1–T3 это версия утверждённых незакоммиченных документов, а не содержимое feature commit. Ссылки ведут на проверенные локальные файлы; при последующих правках сравнивать digest, не ссылаться молча на новую ревизию.

| Evidence | Файл | SHA-256 |
| --- | --- | --- |
| I | [docs/ds-coverage-inventory.json](ds-coverage-inventory.json) | `59f2b0c58d754fbe97e0c02b24f41d185568bb559837fefc8077deed7c6026d4` |
| CSV | [docs/ds-coverage.csv](ds-coverage.csv) | `b91d91143ee2e4658c19e88d3a073813afe90f4eb50d03ed85320fec6c8b929e` |
| COV | [docs/DS_COVERAGE.md](DS_COVERAGE.md) | `0333aaa34a6d1998f405f597978b80ad5d851e2b6bf92a6ed89ea9377d958df1` |
| S1 | [components.seed.json](../components.seed.json) | `1aeeb014d51650663123a6ff0ff8ca776fadbc5c785836b25f1997a4638bb955` |
| S2 | [components.sprint02.seed.json](../components.sprint02.seed.json) | `518e9faa36c1308a22b018f909d3abab616a1fd609dd5c09fbc7323fb4594c58` |
| S5 | [components.sprint05.seed.json](../components.sprint05.seed.json) | `64152a318f1a29647e276e644d8a1fc7a9418665bddf9d0bc7ed4e4341ef585a` |
| M | [design-system/library-matrix.json](../design-system/library-matrix.json) | `376e51942ece93057f300374e46fd1de8b7b3699b8f8ad24759ece28f3637feb` |
| F4 | [design-system/examples/renderer.v3.json](../design-system/examples/renderer.v3.json) | `4764890cfe611977203fc8f412bde54eb7a1a94cbeaca01d46133780e31c611a` |
| CTX | [design-system/figma-sprint05/metadata.json](../design-system/figma-sprint05/metadata.json) | `acd71e8c0040df8f36b6df3ddf4ca7dd0545efa695e8826481e515bf030b8483` |
| AUD | [design-system/figma-sprint05/audit.json](../design-system/figma-sprint05/audit.json) | `198c2ba539cdb5ad11427727fd7ee06dca7128967c247f260273c9db0c6fd998` |
| REG | [src/registry/index.ts](../src/registry/index.ts) | `38d4952d9785e49582043c0528607c159d665064fd3230cda62a24d798ccac14` |
| SC | [src/design-system/schema.ts](../src/design-system/schema.ts) | `5ce64c25df4bed54cfe410c48ee7ab4f8612e9e2edf9ef2b942d63e660c150b0` |
| VAL | [src/design-system/validator.ts](../src/design-system/validator.ts) | `234c34360f474864840995359753721c808adfdbab1cad9dd9b523ba688645ab` |
| COMP | [design-system/composition.rules.json](../design-system/composition.rules.json) | `2a0ce5261cb7553914a3a44e5496121ab6cd3243cea7de56f150cf71f6b62e30` |
| PREP | [src/renderer/prepare.ts](../src/renderer/prepare.ts) | `9a155e1dc02bf11160f1891dc174e272a98088d6c77a1ab02e06b166e4a023e8` |
| CAP | [src/renderer/library-capabilities.ts](../src/renderer/library-capabilities.ts) | `c01835ea31f65df5f022a361dfbe8b9a0c9aa6cf3105a31b4cf1bac2c497711f` |
| DSR | [src/renderer/DSRenderer.tsx](../src/renderer/DSRenderer.tsx) | `507639de783e99a61d0a566132b072194e81ab621ad48ca29d7668f624f9c72d` |
| LIB | [src/renderer/library.tsx](../src/renderer/library.tsx) | `b051a14f67c60a4f54f1a9ff0b29303e800e00edc08eac5b77084692b437bbe4` |
| SYNC | [src/canvas/composition.ts](../src/canvas/composition.ts) | `0b762cf3ccaa31d0708226ea5fde82f9ada272c0f8f580ff7a29bb8ae570921c` |
| UT4 | [tests/renderer.test.ts](../tests/renderer.test.ts) | `7ae1f46bb773bd4e4338c7af98d09e322bbf9a632a4465337ed2d84f5873f586` |
| UT5 | [tests/library.test.ts](../tests/library.test.ts) | `bad5da495a3435617a0aea186682b79ba8596c9703c107ee331fed3655d687b2` |
| UTDS | [tests/design-system.test.ts](../tests/design-system.test.ts) | `800d874483a093b3eaf7d3d7d8057dbee49e57c6f56872fd1c818334f5b57221` |
| REC | [tests/recovery.test.ts](../tests/recovery.test.ts) | `93c6aac2396805881d5114dbe8781e14dc7af1748112f5a9f13811b25ffdd967` |
| PW4 | [tests/visual/renderer.spec.ts](../tests/visual/renderer.spec.ts) | `2f7991f9563d56aefe58a36b71d08c7a993ab9daa792c684e233f0dd83460d25` |
| PW5 | [tests/visual/library.spec.ts](../tests/visual/library.spec.ts) | `572a80b435a252c653545c880748cdcb4b9f6b4894f55e84e41e3e92944c5ea9` |
| REMED | [docs/PR1_REMEDIATION.md](PR1_REMEDIATION.md) | `2866ad65249bdad0bca8f8eaa23fa047ea1396fa48261b28b0ed644564df5189` |
| MIG | [src/design-system/migrate.ts](../src/design-system/migrate.ts) | `48c36b304a0c0526d6d33c93fcce3c08b8cf2dbb55df640cb3da3d29e9a94ecd` |
| TOK1 | [tokens.verified.seed.json](../tokens.verified.seed.json) | `88cd1e803d707782ea4f5fbad66770d7f1e7324e4995512c991a3ccc19899b00` |
| TOK4 | [tokens.renderer.seed.json](../tokens.renderer.seed.json) | `892633ca30feb268ed44e8726e50a60eb9b6ff1bec6285112cdee98a06f0e93f` |
| TOK5 | [tokens.sprint05.seed.json](../tokens.sprint05.seed.json) | `a0722a9fdf8d0f051f02b708edce5238ff16c8a826db77434f36261bf66a2ced` |
| GEN | [scripts/ds-generate.mjs](../scripts/ds-generate.mjs) | `a7e62ef201f9957d85b3d8555a68f27a7fbfbd432577d984abd732607cefb829` |
| CI | [.github/workflows/check.yml](../.github/workflows/check.yml) | `f1fe227fb28a5e185a73f2078225ca77ff1f5de339de8ee1442fe0a083397862` |
| DEPLOY | [.github/workflows/deploy.yml](../.github/workflows/deploy.yml) | `1731f3622e223e3ccad5fd5c397eaa32be932362ba21f95c5446f2d6f53c896e` |
| T1 | [docs/ADR-001-source-neutral-design-system-contract.md](ADR-001-source-neutral-design-system-contract.md) | `12d666bf5c2a08e222950c0ee8614825420a13be1b3d4cb62a7c89243bcb8651` |
| T2 | [docs/T2-unsupported-policy.md](T2-unsupported-policy.md) | `a5c0d3304ce31775150a79da4c2bbe3391b2dae9bf493daafdf6681a3d5b4c10` |
| T3 | [docs/T3-validator-facade.md](T3-validator-facade.md) | `698fe47720335167ea891575ec56debc6b78e6092cdc49324e6cf22481e9457e` |

[I]: ds-coverage-inventory.json
[CSV]: ds-coverage.csv
[COV]: DS_COVERAGE.md
[S1]: ../components.seed.json
[S2]: ../components.sprint02.seed.json
[S5]: ../components.sprint05.seed.json
[M]: ../design-system/library-matrix.json
[F4]: ../design-system/examples/renderer.v3.json
[CTX]: ../design-system/figma-sprint05/metadata.json
[AUD]: ../design-system/figma-sprint05/audit.json
[REG]: ../src/registry/index.ts
[SC]: ../src/design-system/schema.ts
[VAL]: ../src/design-system/validator.ts
[COMP]: ../design-system/composition.rules.json
[PREP]: ../src/renderer/prepare.ts
[CAP]: ../src/renderer/library-capabilities.ts
[DSR]: ../src/renderer/DSRenderer.tsx
[LIB]: ../src/renderer/library.tsx
[SYNC]: ../src/canvas/composition.ts
[UT4]: ../tests/renderer.test.ts
[UT5]: ../tests/library.test.ts
[UTDS]: ../tests/design-system.test.ts
[REC]: ../tests/recovery.test.ts
[PW4]: ../tests/visual/renderer.spec.ts
[PW5]: ../tests/visual/library.spec.ts
[REMED]: PR1_REMEDIATION.md
[MIG]: ../src/design-system/migrate.ts
[TOK1]: ../tokens.verified.seed.json
[TOK4]: ../tokens.renderer.seed.json
[TOK5]: ../tokens.sprint05.seed.json
[GEN]: ../scripts/ds-generate.mjs
[CI]: ../.github/workflows/check.yml
[DEPLOY]: ../.github/workflows/deploy.yml
[T1]: ADR-001-source-neutral-design-system-contract.md
[T2]: T2-unsupported-policy.md
[T3]: T3-validator-facade.md

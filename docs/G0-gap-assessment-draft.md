# G0 Gap Assessment / Implementation Readiness Audit

Статус: **G0 Gap Assessment — ACCEPTED**. Дата утверждения: **05.11.2026**. Дата аудита: **05.11.2026**. Приняты диагностический отчёт и порядок зависимостей; решения D0 и реализация автоматически не утверждаются.
Режим: read-only анализ закреплённого main; единственное изменение — создание этого отчёта. Это принятый диагностический отчёт и порядок зависимостей, не начало спринта, реализация или разрешение исследования. Состав и запуск каждого implementation package требуют отдельного согласования.

## 1. Executive Summary

**G0 для E1, E2-P и E2-X: BLOCKED / NOT READY TO LAUNCH.** Это вывод о готовности запуска, не исследовательский NO-GO. Исследования остаются **NOT RUN**, результаты **NOT ASSIGNED**, E1/E2 protocols — **не FROZEN**. T1–T7 приняты и закоммичены, но новые архитектурные слои не реализованы этим фактом. Компонентам CR3 не присваивается.

Работающая база: локальный WDeaf Contract 1.3.0, Screen Schema v3, строгий/совместимый Validator, ограниченный DS Renderer, Canvas/Inspector/Theme Editor, миграции, browser storage и recovery. Это применимые backend primitives; они не образуют source-neutral platform, ScopePatch engine или transactional repository.

Критический разрыв — между ручным редактированием Canvas и безопасной AI-записью: нет закрепления Document revision/context, независимого ScopeDiff, точного Approval, CAS/idempotency, атомарного сохранения документа+оригинала+receipt+audit или undo. Подключать будущий ChatCommandProvider непосредственно к существующему setDocument/saveDocument нельзя считать реализацией T5.

Минимальный безопасный путь: сначала отдельные чистые и read-only механизмы контекста/проверки/ScopeDiff/evidence, затем реализованный score-only harness. Фактический Apply/undo допускается только после решения по transactional storage и отдельного приёмочного контура. Ни доступный JSON, ни подтверждение пользователя не обходят обязательные UNKNOWN/FAIL.


**Граница G0 и разработки:** G0 BLOCKED запрещает запуск исследований, но не запрещает отдельную согласованную разработку недостающих механизмов. Создание code modules, синтетических fixtures и unit/integration tests в разрешённом implementation package не означает разрешения E1/E2, реального Apply/rollback или production rollout. Отсутствие полного E1/E2 protocol и решения по production storage само по себе не блокирует чистые read-only модули, не зависящие от этих решений. Критическое неразрешённое решение блокирует только зависящий от него механизм; его нельзя заменить mock/PASS или неявным default. Этот отчёт не выдаёт разрешение на такую разработку.

## 2. Основания, методы и границы доказательств

Актуальный удалённый main подтверждён через GET GitHub API: `e63f1446acf7cdfde617b9fbd9ec4ff18bbeab04`, tree `0277e003651da3a2be2556c14c69d53c0629fccc`. PR #2/#3/#4 действительно merged; SHA см. [PR2][], [PR3][], [PR4][]. Исходная локальная ветка остаётся `feat/ds-component-library` на `1986326…`; локальные refs не обновлялись.

Для чтения взят архив **точного main SHA** во временный каталог; fetch/checkout/commit и изменения исходников не выполнялись. Архивирование для анализа не создаёт новую рабочую ветку. Код, scripts, server, seeds, fixtures, unit/integration/visual tests и T1–T7 прочитаны из этой версии. Поиск архитектурных имён охватил src/server/scripts/tests; отсутствие механизма установлено совместно по поиску и разбору реальных entry points, а не только по отсутствию одноимённого файла. Полный аудит безопасности внешних систем/браузерных данных не выполнялся.

Статусы:

| Статус | Значение |
| --- | --- |
| IMPLEMENTED | Найдена исполняемая реализация указанного ограниченного поведения, тесты и подтверждённое CI evidence |
| PARTIAL | Есть применимая часть, но не весь принятый архитектурный контракт |
| DOCUMENTED_ONLY | Есть принятые описания/типы, но нет требуемого runtime механизма |
| BLOCKED | Исполнение/внедрение невозможно до перечисленных решений и зависимостей; статус не означает отсутствие всей документации |
| UNKNOWN | Данных недостаточно для конкретной гарантии; не эквивалент PASS |

### 2.1. Подтверждённые результаты проверок

[CI-FINAL][] run `42044884332`: head `b379996d852f74692f05792547d4928c9a2af51b`, база `45aecebe17cb0cf17746aa556746eb264b0ed00b`, conclusion **success**. Его Git tree **совпадает** с tree текущего squash main: `0277e003651da3a2be2556c14c69d53c0629fccc`. Поэтому это доказательство проверки содержимого текущей поставки, с явно сохранённым отличием commit SHA, а не утверждение о новом post-merge CI run.

- Linux validate job `127305028776`: npm ci, typecheck, ds:validate, build:server, npm test, build, check:pages и 3 portable Playwright сценария — все шаги success.
- macOS visual job `127310946394`: build и npm run test:visual — success; workflow запускает полный набор 10 сценариев [CHECK][].
- В текущих test files статически насчитываются 38 TS + 2 auth tests; это не 40 новых тестов G0 и не evidence отсутствующих архитектурных механизмов.
- PR #3 исправляет только ожидание SVG через expect.poll (5 секунд по умолчанию), PR #4 — docs-only deploy filter. Это не закрытие focus debt или реализация isolation.

В этом аудите тесты, сборки, генерации, UI, пилоты, Apply/rollback и Preview **не запускались**. Старые reports [REMED][]/[COVERAGE][] содержат исторические формулировки и не заменяют приведённое actual CI evidence. Успех CI не сертифицирует CR3 или source-neutral совместимость.

## 3. Implementation Inventory: что действительно работает

Указанный IMPLEMENTED относится к описанному WDeaf subset, не ко всем слоям T1–T7. Ссылки на код и тесты закреплены SHA main в §10; номера строк относятся к этой версии.

| Реализованный механизм | Файлы / функции | Тесты и граница проверенного поведения | Ограничения / результат |
| --- | --- | --- | --- |
| IMPLEMENTED: WDeaf contract/catalog/schema generation | [REG][] registry/definition/defaults; [SCHEMA][] ComponentId/ScreenElement/ScreenDraft/CONTRACT_VERSION; [GEN][] | [DS-TEST][] catalog/props/token checks, [LIB-TEST][] compositions | CI-FINAL PASS. 15 registry entries, 9 root/6 internal, 57 seed tokens. Types выведены из WDeaf; metadata не полный source-neutral contract |
| IMPLEMENTED: текущий Validator | [VAL][] validateComponent, validateToken, validateScreen(strict/compatible), parseScreen | [DS-TEST][] unknown props/components/styles/tokens, prototype names, duplicate IDs, malformed/oversize; [LIB-TEST][] internal roots/slots/Select state | CI-FINAL PASS. Ограничения slots/parents/cardinality, <=500 элементов, parse <=2MB; не проверяет внешние bindings/readiness. API unknown не обеспечивает безопасный обход любого Proxy |
| IMPLEMENTED: миграции и v3 boundaries | [MIG][] migrateScreen/migrateJSON/toCanvasV2; [BOUNDARY][] acceptEditorDocument/importEditorDocument/strictDocument | [DS-TEST][] v1/v2/v3 и V2_UNSUPPORTED, [LIB-TEST][] slots/tokenReferences/selectedValue round-trip; [RENDER-TEST][] import/edit/prompt/export | CI-FINAL PASS. Compatible сохраняет overrides; strict может отказать. v1 radius>32 warning/clamp, полная обратимость всех legacy проектов не доказана; raw обязателен |
| IMPLEMENTED: ограниченный strict Renderer | [PREP][] sourceNode/prepareRender; [CAP][] libraryNode; [DSR][] DSRenderer; [LIB][] Select/Tag/Chip/Menu | [RENDER-TEST][] 29 samples, fail-closed/revalidation; [LIB-TEST][] 143 rows, 18 primitives отдельно; [PW-LIB][]/[PW-RENDER][] 10 browser cases | CI-FINAL PASS. 154 composition samples не общий процент end-to-end. Table strict отклонён, TagInput не Screen-composition; CR gate отсутствует |
| IMPLEMENTED: browser storage/recovery | [STORAGE][] loadDocument/saveDocument/preserveRejectedDocument/listRecoveryBackups/exportRawDocument | [REC-TEST][] sequential raw backups/quota/readback/isolation ключей; [LIB-TEST][] import/storage round-trip; [PW-LIB][] сохранение и скачивание копий | CI-FINAL PASS. Локальные backups, не revision repository; cleanup браузера теряет копии. Один localStorage setItem не транзакция document+context+receipt |
| IMPLEMENTED: ручной Canvas и локальная генерация prompt | [APP][] App/setDocument/useEffect/import; [MODEL][] createElement/moveElement; [PROMPT][] generatePrompt/generateRendererPrompt | [DOC-TEST][], [RENDER-TEST][], [LIB-TEST][], [PW-LIB][] | CI-FINAL PASS в покрытом subset. Генерируется текст для внешнего AI; нет модели, agent loop или запроса на exact AI Apply |

Существующая серверная авторизация и guest Pages — отдельные рабочие функции [ACCOUNT][]/[RUNTIME][]/server/index.mjs, покрытые auth tests. Они не доказывают Document-scoped approval authority, доступ к защищённому oracle или многопользовательские транзакции. Аудит не предлагает менять авторизацию/Theme Editor.

## 4. Architecture-to-Code Gap Matrix

| Подсистема T1–T7 | Фактический статус | Наблюдение / разрыв | Зависимость до допуска |
| --- | --- | --- | --- |
| Source Adapter | DOCUMENTED_ONLY | [GEN][]/seeds нормализуют известные bundled данные; это не отдельный разрешённый адаптер источника с версией наблюдений/provenance и неизвестными полями [T1][] | Согласованный observation/adapter contract; первым — только WDeaf seed reader, не live API |
| Library Snapshot и Runtime Binding | DOCUMENTED_ONLY | Static JSON, frozen generated objects и asset SHA существуют; нет immutable snapshot registry/Document bindings resolver с exact runtime trust [T1][][T2][] | Внешний manifest, формат identities/digest, storage/transfer/trust policy |
| DS Contract | PARTIAL | WDeaf 1.3.0 IMPLEMENTED (§3); design-system-neutral модель, source roles/evidence/version format пока только ADR | Отдельная модель рядом с v3 + conformance/adaptation, без переноса имён WDeaf в ядро |
| Component Mapping Registry | PARTIAL | [PREP][]/[CAP][]/switch [DSR][][LIB][] статически сопоставляют props/node/React. Нет versioned source→implementation records, review/approval, pinned dependency integrity | Формат mapping, owner approval, exact implementation refs и тесты соответствия |
| Renderer Capability | PARTIAL | Sample matrices и prepareRender существуют, но нет полной декларативной operation/state/theme/environment capability, generated closure и pinning | Capability manifest для честно ограниченного existing subset, no inferred support |
| Validator Facade | DOCUMENTED_ONLY | [VAL][]/[BOUNDARY][] исполняемы, но нет ValidationRequest/Context/Result с независимыми assessments и восьми этапов T3; string exceptions boundary не Facade | Snapshot/binding/mapping/capability/evidence resolution + безопасный WDeaf adapter |
| CR readiness / evidence | DOCUMENTED_ONLY | Есть tests/CI/source captures, нет scope-specific CR records, review store или strict CR3 gate | Политика evidence, review/revocation, operation/environment scope. Focus Checkbox/Chip UNKNOWN |
| Project / Work / Document / Chat | PARTIAL | Document payload v3 и один Canvas на account/browser существуют. Project/Work/именованные Documents/Chat не реализованы. Символ ProjectRepository не найден; нельзя выдавать storage/index.ts за него [MODEL][][APP][][AI][] | Решения по внешней модели IDs/version/context и жизненному циклу; существующий layout/Workspace не переписывать в этом плане |
| ScopePatch / ScopeDiff | DOCUMENTED_ONLY | [SYNC][] синхронизирует некоторые children, [AI][] объявляет широкие ChatAction types. Нет разрешённого write set, closure, full independent diff, stale base/slot lifecycle guards [T5][] | Pure scoped candidate builder и независимый diff с validation profile |
| Human Approval | DOCUMENTED_ONLY | window.confirm при замене импорта [APP][] не связывает согласие с exact diff/context/revision; AuthGate — не approval receipt | Подлинность/отзыв approval, immutable tuple, deny/UNKNOWN precedence |
| Atomic Apply / undo / audit | BLOCKED | [APP][] меняет React state до save useEffect; [STORAGE][] не имеет CAS, tx/receipt/idempotency/history/undo/audit. Local backup — не undo | Отдельное storage решение, исходник/durable transaction, concurrency/cancel/crash tests; до этого AI write запрещён |
| Score-only Pilot Harness | DOCUMENTED_ONLY | [T6][] API/test plan принят; generic test runner/DS CLI не PilotCase/Artifact/ScoreResult/Evidence/PilotReport pipeline | Read-only isolated ingest/scoring/storage, pinned oracles/evaluators и evidence |
| Pilot Preregistration / G0 | DOCUMENTED_ONLY; запуск BLOCKED | [T7][] архитектура ACCEPTED. Frozen manifests, отдельные G0 records и launch authorization не найдены; E1/E2 не FROZEN | Решения B1–B10 T7, реальные реализации и независимое evidence, отдельное разрешение |

UNKNOWN относится к достаточности конкретных гарантий (полные исторические миграции, визуальная equivalence, устойчивый focus, внешние протоколы), а не используется как замена установленного отсутствия модуля. Существующие тесты/источники можно переиспользовать после привязки к claim scope, но не переименовать в CR3 автоматически.

### 4.1. Существенные ограничения действующего subset

- TagInput — 6 unit primitives без разрешённого JSON slot; TagMore — generated TagGroup subset. TagGroup — m, amount '1'/'2', 8 rows; синхронизация не разрешает менять чужие children без Scope [T4][][SYNC][][LIB][].
- Input local value не сохраняется как v3 state; Hint counter статичен; Hint/Label композиция ограничена l/default/placeholder=false [DSR][][PREP][].
- Select сохраняет текст selectedValue и имеет mouse/keyboard/reload tests, но duplicate labels не устойчивые IDs; только 8 sample rows, up лишь один pressed row. Нет search/multiselect [LIB][][PW-LIB][].
- DropdownMenu rows/ItemsList имеют owning-композиции, но standalone controller/actions отсутствуют; role standalone container source не подтверждён. Table — legacy preview, strict UNSUPPORTED [PREP][][T4][].
- Checkbox/Chip update variantProps меняет JSON-derived React key [DSRenderer:60](https://github.com/belemik/emikman_builder/blob/e63f1446acf7cdfde617b9fbd9ec4ff18bbeab04/src/renderer/DSRenderer.tsx#L60); remount/focus debt сохраняется. Исправление SVG loading test не проверяет удержание клавиатурного фокуса.
- generatePrompt содержит старую фразу о временном Select preview, хотя persisted state уже реализован [PROMPT][][LIB-TEST][]. Это ограничение точности prompt, не доказательство отсутствия сохранения. Будущий конструктор контекстных пакетов должен брать current contract/state evidence, а не слепо переиспользовать текст.

## 5. Dependency Map

Ниже proposed backlog IDs, не номера новых спринтов и не разрешение реализации. Внешние зависимости не заменяются mock records ради PASS.

```text
D0-R1 (ingest boundary) → F1
D0-R2 (neutral observation/contract) + F1 → F2
D0-R3 (read-only refs/context resolver) + F2 → F3
F2,F3 → F4 mapping/capability
D0-E + F3,F4 → F5 CR/evidence → F6 Facade (также F1,F3,F4)
D0-R3,F1 → S1(R): external identity/raw/context в памяти, без persistence
F1,F2,F3,S1(R) → S2 pure candidate → S3 independent ScopeDiff (+S1(R))
D0-E,F4,F5 → H2-A: independent fixture/oracle package (без H1)
F1,F6,S2,S3,H2-A → H1: read-only harness
H2-A,H1 → H2-B: integration corpus verification (без новых oracle)
D0-S + S1(R) → S1(P): утверждённое persistent storage
D0-S,S1(P) → S4 transactions → S5 history/undo/audit
D0-A,S3,F6,S1(P) → A1 exact Approval
S4,S5,A1,F6,S3 → W1 Apply coordinator
W1,S1(P) → U1 Document/Chat UI → U2 model provider
D0-L + H1,H2-B + frozen protocol → отдельный G0 → launch authorization
W1 + verified disposable isolation/fault rig + отдельный E2-X G0 → E2-X

```

Чистые модули и fixtures можно разрабатывать параллельно по согласованным interfaces; write path нельзя подключать до прохождения S4/S5/A1/W1. Score-only ветка не зависит от внедрения live Apply/Chat, но обязательные checks F6 нельзя выдавать за PASS через заглушку. Source-neutral E3/ADP-01 и новые библиотеки не входят в минимальный WDeaf scope.

## 6. P0/P1/P2 Backlog (порядок зависимостей принят; реализация требует согласования)

Общие запреты **для каждой** задачи: не менять payload Screen Schema v3, native Validator API/codes, существующую авторизацию/Theme Editor/Pages/CI без отдельного решения; не удалять unknown/raw/slots/tokenReferences/state; не обновлять libraries автоматически; не расширять Figma props; не присваивать CR3 по наличию кода. Текущие entry points Builder сохраняются до отдельно согласованного rollout. Ни одна задача ниже не запускается этим аудитом.

### P0 — основа и сохранность

### D0 — поэтапные решения без общей блокировки read-only разработки

D0 — перечень отдельных decision packages, а не единый prerequisite всего backlog. Принятие этого отчёта утверждает разделение и порядок; **значения решений ниже остаются неутверждёнными до отдельного решения владельца**. Для разработки конкретного модуля требуется принять только его критические входные решения и отдельно разрешить implementation package.

| Package | Минимально необходимое решение | Когда требуется / что блокирует | Что не требуется для этого шага |
| --- | --- | --- | --- |
| D0-R1 | JSON-text trust boundary, размер/глубина/лимиты, сохранение exact raw в памяти, safe error envelope и trusted json-value boundary | До F1; неизвестная безопасность ввода блокирует ingest | Production backend, Apply authority, E1/E2 freeze |
| D0-R2 | Минимальная versioned observation/neutral contract schema, identities и provenance, unknown semantics для сохранённых WDeaf seeds | До F2, после совместимой границы F1; не позволяет выдумать props/source version | Новые интеграции, production storage, исследовательские thresholds |
| D0-R3 | Формат immutable refs/manifest, canonical digest, read-only resolution из явно предоставленного фиксированного набора артефактов, trust/availability/legacy ambiguity policy | До F3 и S1(R); недоступные реальные refs остаются UNKNOWN, а не test mock PASS | Постоянное хранение/передача Document contexts, CAS/undo, полномочия Apply |
| D0-E | Формат claim/evidence/rubric, точная область проверки, reviewer/provenance и правила достаточности; для fixture package — разрешённые данные и независимая разметка | До соответствующих функций F5/H2-A/H1; неутверждённая достаточность не даёт подтверждённый readiness | Заморозка E1/E2, model provider и production transactions; формат evidence не назначает CR3 |
| D0-S | Durable storage/transfer, migration, concurrency/CAS/atomicity, retention/privacy для Document+raw+context+receipt/audit | До S1(P), S4/S5 и подключения постоянной записи рабочих Document/context/receipt/audit | Не блокирует F1–F3, S1(R) и чистые candidate/diff при закрытых D0-R решениях |
| D0-A | Подлинность/полномочия/отзыв exact Approval, Apply validation profile и разрешённый write-path lifecycle | До A1/W1, даже если storage уже готов | Не требуется для read-only resolver или неисполняемого diff; owner confirmation не заменяет Validator |
| D0-L | Полные протоколы E1/E2 либо явное поручение новой версии, выборка/метрики/пороги/бюджет/права, freeze и отдельное launch решение | До freeze/G0/запуска соответствующего исследования; не часть входных решений F1–F3 | Не блокирует отдельно разрешённую модульную разработку и acceptance tests на синтетических данных |

S1(R) — read-only часть прежней S1: идентичность/revision/base raw и внешний context на копии в памяти. S1(P) — постоянное сохранение и migration/transfer по D0-S. Успех S1(R) не доказывает durable recovery или совместимость выбранного production backend. Transport/storage bindings остаётся открытым до D0-S; in-memory resolver не выдаётся за реализованное хранение Document.

- **Риски сохраняются:** неверная identity/binding, потеря raw, ложное trust/evidence или approval; высокий риск при будущей записи. Сейчас запись не производится.
- **Приёмка решений:** конкретная принятая версия границы/схемы/policy, evidence владельца и негативные примеры; для незатронутых будущих решений допустим UNRESOLVED, но зависимые функции закрыты.
- **Проверки:** schema fixtures, ambiguity/missing context, data-preservation и read-only tests до claims о поведении. Отдельная проверка D0-S/D0-A до write path.
- **Запреты:** не выбирать production backend, authority, FROZEN protocol или launch defaults от имени владельца; v3 не менять; неизвестную критическую зависимость не обходить.

### F1 — Безопасный JSON ingest

- **Зависимости:** D0-R1.
- **Реализовать / подготовить:** Отдельная граница недоверенного JSON-текста, лимиты, структурированные parser/backend failures; trusted json-value только после проверки, без произвольных объектов.
- **Интерфейсы:** T3 ValidationRequest/Diagnostic; адаптация рядом с parseScreen.
- **Риск данных:** Средний: потери от фильтрации/нормализации.
- **Приёмка:** Malformed/accessor/Proxy не исполняются через недоверенный канал; exact raw сохраняется; parse errors не PASS.
- **Необходимые тесты / evidence:** Oversize/deep input, malformed, prototype names, отсутствие мутаций и утечки payload.
- **Дополнительный запрет:** Не обещать безопасность произвольного JS и не переписывать старый Validator.

### F2 — Neutral contract + WDeaf observation adapter

- **Зависимости:** D0-R2,F1.
- **Реализовать / подготовить:** Минимальные описательные definitions/props/variants/tokens/slots с provenance и reader сохранённых WDeaf seeds; unknown сохраняется явно.
- **Интерфейсы:** T1 DS Contract/Source Adapter, существующие seeds/catalog.
- **Риск данных:** Средний: неверная эквивалентность/отбрасывание source полей.
- **Приёмка:** Existing subset выражен без WDeaf имён в общих типах; никакого расширения accepted tuples; round-trip наблюдений.
- **Необходимые тесты / evidence:** Seed conformance, enum не Cartesian variants, root/internal, token/slot negative cases.
- **Дополнительный запрет:** Не писать Figma/Pixso/GitHub интеграции или объявлять универсальность без испытаний.

### F3 — Immutable context resolver

- **Зависимости:** D0-R3,F2.
- **Реализовать / подготовить:** Library snapshot и внешний Document binding manifest с exact mapping/runtime/assets/dependency refs; explicit legacy profile resolution, integrity и trust availability.
- **Интерфейсы:** T1 refs/provenance; T3 ValidationContext; v3 внешний контекст.
- **Риск данных:** Высокий: привязка чужой версии к исходнику.
- **Приёмка:** Никакого latest/name matching; missing/ambiguous/corrupt context даёт UNKNOWN/BLOCK и исходник доступен; defaults Project не мигрируют Document.
- **Необходимые тесты / evidence:** Missing/digest mismatch/revoked refs, standalone ambiguous JSON, export/import context loss, точная версия.
- **Дополнительный запрет:** Не менять существующий standalone JSON или молча ставить legacy profile.

### F4 — Versioned mapping и capability subset

- **Зависимости:** F2,F3.
- **Реализовать / подготовить:** Выделить декларативные records существующих соответствий и capabilities вариантов/операций/тем/сред; учитывать generated children. Сначала read-only backend, без смены Renderer.
- **Интерфейсы:** T1 Mapping Registry/Renderer Capability; sourceNode/libraryNode adapter.
- **Риск данных:** Средний: ложное разрешение unsupported исполнения.
- **Приёмка:** Каждая заявленная tuple связана с точной implementation; schema-valid unsupported отклонён; спорный scope UNKNOWN.
- **Необходимые тесты / evidence:** Matrix/implementation parity, TagMore generated closure, Input slot restrictions, Table/Select negatives.
- **Дополнительный запрет:** Не генерировать новые варианты и не считать sample-node доказательством всех операций.

### F5 — CR/evidence records и review

- **Зависимости:** D0-E,F3,F4.
- **Реализовать / подготовить:** Хранить scoped claim/evidence с reviewer/type/date/states/operations/environment, доступностью и отзывом; вычислять gate, не автоматически присваивать CR.
- **Интерфейсы:** T1 CR0–CR3; T2 review; T3 independent assessments.
- **Риск данных:** Средний: ложная уверенность и допуск неподтверждённой записи.
- **Приёмка:** Нет evidence — UNKNOWN; CR2 strict BLOCK; focus debt ограничивает затронутый claim. Self-review явно маркирован.
- **Необходимые тесты / evidence:** Revoked/missing/wrong environment evidence, new implementation version, узкая область CR3 не повышает семейство.
- **Дополнительный запрет:** Не сертифицировать текущую библиотеку задним числом; owner review остаётся решением владельца.

### F6 — Validator Facade adapter

- **Зависимости:** F1,F3,F4,F5.
- **Реализовать / подготовить:** Оркестрация восьми стадий, separate structure/capability/readiness, dependency UNKNOWN и T2 decision; native Issue сохраняются.
- **Интерфейсы:** T3 Request/Context/Result/Diagnostic; WDeaf backend без изменения API.
- **Риск данных:** Средний: compatible или skipped этап выдан за strict PASS.
- **Приёмка:** Все обязательные FAIL/UNKNOWN блокируют действие; inspect=INSPECTION_ONLY; no mutation; bounded safe errors.
- **Необходимые тесты / evidence:** T3 scenario table, schema-valid unsupported, missing binding, CR2, conflicts, backend exception.
- **Дополнительный запрет:** Не подключать новый strict gate к существующему UI до evidence и решения rollout.

### S1 — Document revision/raw foundation

- **Зависимости:** S1(R): D0-R3,F1; S1(P): завершённый S1(R) и D0-S.
- **Реализовать / подготовить:** S1(R): внешний Document identity/revision/context и точный raw на изолированной копии в памяти, без записи. S1(P): persistent raw archive, adapter текущего browser save и transfer только после D0-S. Read-only export не объявляется гарантией durable storage.
- **Интерфейсы:** T1 Project/Work/Document concept; T5 base revision/digests; существующий storage.
- **Риск данных:** Высокий: silent migration/overwrite.
- **Приёмка:** Source bytes/старые backups сохранены; binding вне v3; ошибки записи не стирают последнюю durable версию.
- **Необходимые тесты / evidence:** Корпус v1/v2/v3, sequential recovery/quota, IDs/slots/tokens/Select state, отдельные browser/account keys.
- **Дополнительный запрет:** Не перестраивать Workspace или создавать sharing/backend без отдельного согласования.

### S2 — Pure ScopeSpec/candidate builder

- **Зависимости:** F1,F2,F3,S1(R).
- **Реализовать / подготовить:** Разрешения на конкретные properties/slot lifecycle, preconditions, deny и rule-bound dependent ops; candidate только на копии.
- **Интерфейсы:** T5 ScopeSpec/PatchOperation, amount строка, generated locator.
- **Риск данных:** Средний: скрытые deletes/sync children.
- **Приёмка:** Неоднозначные ID/targets и неизвестные операции BLOCK; write set не расширяется validation closure; determinism.
- **Необходимые тесты / evidence:** TagGroup 1↔2, Select reset permission, optional slot create/remove, dependency cycle/overlap, no input mutation.
- **Дополнительный запрет:** Не выполнять существующий syncComposition как неограниченный patch executor.

### S3 — Independent full ScopeDiff

- **Зависимости:** S1(R),S2; F6 нужен для итогового gate, но не для вычисления diff.
- **Реализовать / подготовить:** Независимое сравнение всего payload + external context, before/after/order/IDs/unknown fields, requested/dependent/unexplained и generated impact.
- **Интерфейсы:** T5 ScopeDiff, exact candidate/base references.
- **Риск данных:** Высокий: скрытая запись вне Scope.
- **Приёмка:** Любая unexplained/outside запись BLOCK даже при valid candidate; truncate summary не может скрыть полный diff.
- **Необходимые тесты / evidence:** Adversarial claimedDiff, neighboring edits, reorder, hidden child delete, ID/token/binding mutation, absent vs null.
- **Дополнительный запрет:** Не доверять diff/объяснению ИИ и не нормализовать unknown ради успеха.

### S4 — Transaction/CAS/idempotency storage

- **Зависимости:** S1(P),D0-S.
- **Реализовать / подготовить:** Реальный единый atomic commit Document+raw+context+receipt+обязательный audit, expected revision/context CAS, durable retry resolution.
- **Интерфейсы:** T5 Apply transaction boundary; storage backend выбирается по D0-S.
- **Риск данных:** Высокий: partial commit/lost update/double apply.
- **Приёмка:** Либо вся транзакция, либо прежний документ; unknown result разрешается receipt lookup; UI не публикует недоказанный commit.
- **Необходимые тесты / evidence:** Fault injection по границам, concurrency двух вкладок/actors, quota/crash/restart, lost response/repeated patch.
- **Дополнительный запрет:** Не выдавать последовательные localStorage writes за транзакцию; без подключения AI write к production.

### S5 — Undo/history/audit

- **Зависимости:** S4,F3.
- **Реализовать / подготовить:** Append-only revisions и audit, original recovery; undo как новая проверенная revision, cancel ordering, retention/privacy.
- **Интерфейсы:** T5 receipt/history, T2 восстановление невалидного raw отдельно от strict.
- **Риск данных:** Высокий: восстановление поверх чужих правок/потеря истории.
- **Приёмка:** Позднее изменение приводит к conflict, не silent overwrite; audit actor/approval/context/limits доступны без секретов в общих logs.
- **Необходимые тесты / evidence:** Undo с concurrent edit, canceled-before/after commit, invalid raw archive, revoked binding, audit failure/recovery.
- **Дополнительный запрет:** Не переписывать историю и не обходить capability/Validator ради rollback.

### A1 — Exact Human Approval

- **Зависимости:** D0-A,S3,F6,S1(P).
- **Реализовать / подготовить:** Верифицированное согласие на exact scope/base/candidate/diff/context/policy/evidence tuple; cancel/revocation; полномочия владельца.
- **Интерфейсы:** T5 Approval; текущая авторизация только независимая identity input.
- **Риск данных:** Высокий: stale/tampered approval.
- **Приёмка:** Любой изменившийся tuple требует нового review/approval; user confirmation не снимает BLOCK; replay отвергнут.
- **Необходимые тесты / evidence:** Stale base, forged/expired approval, different candidate/context, cancel race, unauthorized actor.
- **Дополнительный запрет:** Не заменять механизм window.confirm или client approved:true и не менять auth без доказанной необходимости.

### H2-A — подготовка и независимое согласование Fixture/Oracle Package

- **Зависимости:** D0-E,F4,F5; интерфейсы PilotCase/Artifact/ScoreResult T6 согласованы для пакета. **Не зависит от H1 или его результатов.**
- **Подготовить:** синтетический/разрешённый корпус fixed WDeaf subset, независимые expected accept/reject/unknown, before/after/scope и defect oracle, rubric, provenance/reviewer records и digests. Хранение package как проверяемых файлов не выбирает production evidence backend.
- **Приёмка:** named reviewer, допустимые альтернативы и границы независимости зафиксированы; cases/expectations проходят schema/integrity review; конфликтные записи остаются unresolved и не считаются принятыми. Пакет получает версию до harness integration; score модели не используется для настройки oracle.
- **Тесты / evidence:** ручная независимая сверка с pinned contract/capability, schema/digest tests, false-positive/false-negative fixtures, отсутствующие evidence и намеренно испорченные входы. Сам harness не нужен для принятия содержания oracle.
- **Риск данных:** leakage/cherry-picking/повреждение raw; originals/digests защищены, версии append-only.
- **Запрет:** не объявлять corpus FROZEN E1/E2 protocol или CR3; production storage/launch не разрешаются.

### H1 — реализация Score-only Harness

- **Зависимости:** F1,F6,S2,S3 и согласованный H2-A. Ему **не требуется H2-B**. Интерфейсы/части можно готовить раньше отдельно, но интеграционный приёмочный claim требует согласованного пакета.
- **Реализовать:** Case/artifact/score/evidence/report pipeline T6, изоляция без write handles рабочих документов, deterministic replay и явные UNKNOWN. Model-free acceptance tests не являются запуском E1/E2.
- **Приёмка H1:** API/schema/conformance, неизменность входов, запрет Apply/rollback, сохранение ошибок и deterministic scoring проверены на H2-A как фиксированном входе; это ещё не независимая приёмка всего корпуса H2-B. Недоступный check не становится PASS.
- **Тесты:** девять критериев T6, malformed output, missing oracle/evidence, deny storage writes, no arbitrary imported code; повтор не меняет semantic score. Evidence storage safety выбирается для данного read-only package, не production transaction backend.
- **Риск данных:** низкий при enforced read-only, высокий при утечке write access; original bytes не изменяются.
- **Запрет:** не запускать LLM/исследования, не переписывать oracle под output harness и не приписывать UX-quality валидному JSON.

### H2-B — интеграционная проверка согласованного корпуса на Harness

- **Зависимости:** согласованный H2-A и принятый H1; обратного ребра H2-B→H1/H2-A нет.
- **Проверить:** каждый frozen-for-integration artifact из версии H2-A получает ожидаемый criterion outcome/reason/evidence refs через exact версию H1; отчёт включает все cases, FAIL/UNKNOWN/N/A и planned denominators. Это проверка software conformance на фиксированных тестовых данных, не исследовательские результаты E1/E2.
- **Приёмка:** independent reviewer сопоставил полный actual/expected report, no unexplained mismatches, входные digests сохранены; версии harness/package/environment записаны. При неполном проходе — явно BLOCKED/UNKNOWN, не успешный пакет готовности.
- **Тесты:** целый корпус, ordering/replay, damaged evidence/digest, false acceptance negatives, отсутствие writes/модельных генераций и проверка связности отчёта.
- **Риск данных:** подгонка разметки и скрытые exclusions. Ошибка harness исправляется и проверяется новым H1 version/run; ошибка oracle — отдельная новая версия H2-A с независимым review, затем новый H2-B. Это повтор итерации с provenance, а не циклическая начальная зависимость.
- **Запрет:** не менять одновременно oracle и evaluator без истории, не называть приёмку H2-B G0 PASS, CR3 или разрешением пилота.

### P1 — минимальный работающий AI Builder после safety foundation

| Задача | Зависимости / интерфейсы | Приёмка и тесты | Риск данных / запреты |
| --- | --- | --- | --- |
| W1: Apply coordinator | S4,S5,A1,F6,S3; T5 Preview→Approval→Apply | Повторная проверка текущей revision/context прямо перед atomic commit; all gates PASS; approved diff equals actual diff. Тесты stale, duplicate Apply, cancel/crash, full after-state equality | Высокий. Первые проверки только disposable fixtures; real writes/rollout требуют отдельного разрешения. Не обходить UNKNOWN |
| U1: минимальный Document/Chat review flow | S1,S3,A1,W1; внешний Project/Work/Document identity после D0-R3; persistence/authority после D0-S/D0-A | Чёткие pending/blocked/approved/applied states; show full diff/diagnostics, ручной cancel, original export; UI-тесты ошибок записи и отсутствия автоматического Apply | Высокий, если UI маскирует несохранённое. Не подменять storage и не менять current Canvas/v3; права и новый workflow отдельно согласовать |
| U2: bounded model proposal provider | U1,F1,S2,H1; новый provider рядом с legacy ChatCommandProvider | Proposal-only JSON, limits/cancellation/provenance, model output не инструкции, no direct setDocument calls. Mock-provider тесты prompt injection/unsupported/context loss; все попытки учитываются | Высокий при direct tools. Реальные/платные API, данные и генерации — только по отдельному разрешению; не давать write tools |
| Q1: достоверный minimal operation scope | F4,F5,H2-B; WDeaf existing operations | Закрыть/ограничить keyboard focus Checkbox/Chip claims, сверить prompt state wording с контрактом, зафиксировать честную scope-capability matrix. Keyboard activeElement и повторный toggle/reload/error tests | Средний. Не расширять Input/Tags/Menu продуктовый контракт и не повышать CR по unit PASS |

### P2 — дальнейшее расширение, не prerequisite для score-only subset

| Задача | Зависимости / интерфейсы | Приёмка и тесты | Риск / запрет |
| --- | --- | --- | --- |
| X1: additional source adapters | F2–F6 и отдельное решение E3/ADP-01; T1 observations | Exact approved source versions, provenance/conflicts/mapping negative tests; schema bridge сначала согласовать | Неверная identity/перенос props. Без автоматического Figma/Pixso/GitHub подключения или изменения v3 |
| X2: больше вариантов/композиций | F4,F5,Q1, подтверждённый source data | Новые tuples/intended usage/evidence в manifest; negative/root/internal/visual tests | Не считать resource imports UI-покрытием, не выдумывать props |
| X3: совместная работа/Workspace удобства | S1,S4,S5,U1 и отдельный архитектурный scope | Authz/isolation/concurrency и перенос Documents с pinned contexts; UX после safety | Не считать текущие account-scoped keys серверным sharing; не менять auth по удобству |

Эти задачи не дают оценки сроков/стоимости и не являются утверждёнными спринтами. Разделение P0/P1 означает приоритет безопасности: минимальная Chat UI и новая библиотека не должны обгонять source preservation, scope checks и CAS. Для score-only можно завершить F1–F6/S1(R)/S2/S3/H2-A/H1/H2-B без выпуска S4/S5/A1/W1 в приложение; E2-X требует write-path safety полностью.

## 7. Рекомендуемая последовательность и exit criteria

| Этап предложения | Состав / критерий завершения | Что ещё запрещено |
| --- | --- | --- |
| A. Read-only решения и контекст | Только D0-R1/R2/R3 и F1–F3; приняты version contracts и read-only resolution из fixed inputs, безопасный JSON и explicit legacy tests; production storage и E1/E2 freeze не нужны; v3 fixtures не меняются | Модель/Apply/новые source integrations |
| B. Проверяемые возможности | F4–F6 и scoped review F5; separate assessments и no false PASS, native API совместим, source/renderer/readiness parity tests | Включать новый strict CR3 gate в текущем Builder до отдельного rollout |
| C. Неисполняемые предложения | S1(R),S2,S3; deterministic candidate/full diff, slot lifecycle, protected originals; out-of-scope BLOCK доказан | Запись предложений в рабочий документ, CR2 execution |
| D. Read-only evaluation foundation | D0-E → H2-A (independent package) → H1 (implementation) → H2-B (integration acceptance); изоляция, доступные evidence и replay без генераций | Это не E1/E2-P launch: нужны frozen protocol → G0 → launch authorization |
| E. Transactional safety | D0-S/D0-A, S1(P), S4/S5/A1/W1 на disposable данных; verified CAS/undo/audit/crash semantics | Real Apply/rollback без отдельного допуска и проверки среды |
| F. Минимальный продукт | U1/U2/Q1 в согласованном subset, все обязательные gates сохранены; точные docs и эксплуатационные ограничения | Production/model access/пилоты автоматически не разрешаются |

Порядок D и E может быть независим после C: read-only оценка не должна ждать всей Chat UI, а write-path не должен подключаться ради проведения score-only. Решение о реализации каждого этапа — отдельное согласование владельца.

## 8. G0 отдельно для E1, E2-P и E2-X

Все оценки ниже — оценка readiness запуска исследований, не результаты экспериментов и не общий запрет модульной разработки. Отдельно разрешённые code modules, fixtures и tests могут создаваться до G0 PASS в своём утверждённом scope; это не разрешает E1/E2, Apply/rollback или production rollout. Архитектурные документы ACCEPTED; frozen protocol/допуск на запуск — отдельные сущности T7. Ни run record с outcome GO, ни реальный G0 PASS record не найдены.

| Gate | E1 Quality Pilot | E2-P proposal safety | E2-X actual Apply/rollback |
| --- | --- | --- | --- |
| T1–T7 architecture | Подтверждено main | Подтверждено main | Подтверждено main |
| Реализации | BLOCKED: нет H1/F6/exact context и generation setup | BLOCKED: нет S2/S3/F6/H1 | BLOCKED: нет S4/S5/A1/W1 и fault rig |
| FROZEN protocol | Нет; A/B/C/repeats/thresholds ещё PROPOSED/UNRESOLVED | Нет; scope/oracle/false-accept методика не frozen | Нет; stage isolation/fault matrix/undo oracle не frozen |
| Fixtures/oracle | Есть examples, нет adjudicated research corpus | Нет independent full diff oracle package | Нет transaction traces/fault/cancel/concurrency oracle |
| Независимость/evidence | Checkers/reviewers/blinding/storage не подтверждены | Independent scorer/protected oracle не реализованы | Atomicity/recovery evidence не получено |
| Safety | Read-only architecture принята; изоляция harness не проверена | Аналогично; no actual Apply | Disposable isolated test backend/права/backup guarantee отсутствуют |
| Полномочия запуска | Не предоставлены | Не предоставлены | Не предоставлены; T6 score-only не разрешает X |
| Итог | **BLOCKED / NOT READY TO LAUNCH** | **BLOCKED / NOT READY TO LAUNCH** | **BLOCKED / NOT READY TO LAUNCH** |

Для E1 необходимы approved conditions/prompts/model/settings/budget/repeats и отдельная UX rubric. Ориентиры Registry 50%/70% не утверждены как thresholds. Для E2-P ноль применённых записей не успех E2-X, поскольку Apply не выполняется. Для E2-X ноль нарушений конечного corpus не универсальное доказательство безопасности. Обязательные UNKNOWN/FAIL не могут быть заменены согласиями или N/A.

Research Registry v0.3.3 остаётся DRAFT внешним источником, не изменяется; T7 фиксирует отсутствие переданных формальных legacy E1/E2 protocols. Аудит не утверждает, что таких документов нет вне доступного набора. Получить их или явно поручить новую версию — решение владельца до freeze.

## 9. Риски и открытые решения владельца

1. **Storage/Workspace scope:** где внешние Document bindings/revisions/raw/approval/audit и как атомарно сохраняются; существующий localStorage не обеспечивает требуемый multi-record CAS. От решения зависит S1/S4/S5, а не только UI.
2. **Контрактная версия:** кто утверждает format/ref/canonicalization и перенос standalone JSON. Исторические raw digests и канонический Git blob не смешивать; выбрать правило для runtime документов отдельно.
3. **Authority/trust:** как утверждаются mappings и Source Roles, как отзывается evidence и как доказать подлинность user approval. Server login не заменяет эту модель.
4. **CR scope:** exact operations/states/environment и review достаточность; known focus risk Checkbox/Chip, отсутствие menu actions/Input persistence ограничивают минимальные обещания.
5. **Read-only vs write launch:** сначала harness? Когда и где допускается disposable Apply testing? Нужен отдельный G0 record/launch approval на каждую группу E1/E2-P/E2-X.
6. **Research design:** legacy protocols, условия A/B/C/C+, corpus, primary taxonomy, missingness, reviewers, budget/time/calls и stop rules. Нельзя принять DRAFT числа как запускные defaults.
7. **Совместимость:** v3 не нейтральный документ для всех библиотек. Не добавлять libraryId/runtime props в payload и не обещать lossless downgrade в v2; миграции/старые raw сохранять.
8. **Доказательства:** SHA CI дерева совпадает с main, но тесты не покрывают новые слои. Внешние protocol files, reviewer independence и будущая transactional среда UNKNOWN до предъявления evidence.

Предлагаемое следующее решение владельца: выбрать и ограничить первый implementation package из D0-R1/R2/R3 и F1–F3 и/или чистых Scope checks с frozen interfaces. Это только рекомендация к планированию; команда на реализацию в этом отчёте отсутствует.

## 10. Реестр ссылок и целостность

Все ссылки code/test/docs ниже закреплены точным main SHA `e63f1446acf7cdfde617b9fbd9ec4ff18bbeab04`. Они описывают код поставки, а не незакоммиченные старые копии T1–T7 в исходном worktree. Canonical SHA-256 tracked evidence — bytes Git blob; для архива main сверены документы и источники. Временные файлы аудита не включаются в Git и не подменяют evidence runtime.

| Утверждённый документ main | SHA-256 |
| --- | --- |
| [ADR-001-source-neutral-design-system-contract.md](https://github.com/belemik/emikman_builder/blob/e63f1446acf7cdfde617b9fbd9ec4ff18bbeab04/docs/ADR-001-source-neutral-design-system-contract.md) | `12d666bf5c2a08e222950c0ee8614825420a13be1b3d4cb62a7c89243bcb8651` |
| [T2-unsupported-policy.md](https://github.com/belemik/emikman_builder/blob/e63f1446acf7cdfde617b9fbd9ec4ff18bbeab04/docs/T2-unsupported-policy.md) | `a5c0d3304ce31775150a79da4c2bbe3391b2dae9bf493daafdf6681a3d5b4c10` |
| [T3-validator-facade.md](https://github.com/belemik/emikman_builder/blob/e63f1446acf7cdfde617b9fbd9ec4ff18bbeab04/docs/T3-validator-facade.md) | `698fe47720335167ea891575ec56debc6b78e6092cdc49324e6cf22481e9457e` |
| [T4-coverage-inventory-metrics.md](https://github.com/belemik/emikman_builder/blob/e63f1446acf7cdfde617b9fbd9ec4ff18bbeab04/docs/T4-coverage-inventory-metrics.md) | `3d2b2602e1d79eb41f8bc4cc7d7c4b747e80f0a3b4c18ae6cf44690da0d267ea` |
| [T5-scopepatch-scopediff.md](https://github.com/belemik/emikman_builder/blob/e63f1446acf7cdfde617b9fbd9ec4ff18bbeab04/docs/T5-scopepatch-scopediff.md) | `cd34ca4bb32e46c06c8751e952bd497230fb35b99000d1796d277438db25bc19` |
| [T6-score-only-pilot-harness.md](https://github.com/belemik/emikman_builder/blob/e63f1446acf7cdfde617b9fbd9ec4ff18bbeab04/docs/T6-score-only-pilot-harness.md) | `cec9db23fe78577a6c7ed12457914401eab972734add0c0ac013d0dab9305930` |
| [T7-pilot-preregistration.md](https://github.com/belemik/emikman_builder/blob/e63f1446acf7cdfde617b9fbd9ec4ff18bbeab04/docs/T7-pilot-preregistration.md) | `95adbb89bccfe531c447b9644eed11c74bc0646afa0254763ff8e0c601a21853` |

## 11. Проверка границ аудита и итог

Создан только `docs/G0-gap-assessment-draft.md`. Исходная feature-ветка, семь существующих untracked-документов, T1–T7 main, код, CI/Pages, Research Registry и все worktrees не изменяются. Проверки в настоящем аудите — чтение/сопоставление/evidence verification; новых test runs, generations, E1/E2, Preview, Apply/rollback нет. Git-запись/checkout/reset/clean не выполнялись.

**Итог: G0 Gap Assessment — ACCEPTED, 05.11.2026.** Приняты диагностический отчёт и предложенный порядок зависимостей. Это не автоматическое утверждение решений D0 или разрешение реализации. G0 для E1/E2-P/E2-X остаётся BLOCKED / NOT READY TO LAUNCH; исследования NOT RUN, protocols NOT FROZEN. Отдельно согласованная разработка недостающих механизмов допустима до G0 PASS, но этот отчёт её не запускает и не разрешает E1/E2, Apply/rollback или production rollout. Реальные UNKNOWN, риски и блокеры сохранены; новые спринты не начаты.

[T1]: https://github.com/belemik/emikman_builder/blob/e63f1446acf7cdfde617b9fbd9ec4ff18bbeab04/docs/ADR-001-source-neutral-design-system-contract.md
[T2]: https://github.com/belemik/emikman_builder/blob/e63f1446acf7cdfde617b9fbd9ec4ff18bbeab04/docs/T2-unsupported-policy.md
[T3]: https://github.com/belemik/emikman_builder/blob/e63f1446acf7cdfde617b9fbd9ec4ff18bbeab04/docs/T3-validator-facade.md
[T4]: https://github.com/belemik/emikman_builder/blob/e63f1446acf7cdfde617b9fbd9ec4ff18bbeab04/docs/T4-coverage-inventory-metrics.md
[T5]: https://github.com/belemik/emikman_builder/blob/e63f1446acf7cdfde617b9fbd9ec4ff18bbeab04/docs/T5-scopepatch-scopediff.md
[T6]: https://github.com/belemik/emikman_builder/blob/e63f1446acf7cdfde617b9fbd9ec4ff18bbeab04/docs/T6-score-only-pilot-harness.md
[T7]: https://github.com/belemik/emikman_builder/blob/e63f1446acf7cdfde617b9fbd9ec4ff18bbeab04/docs/T7-pilot-preregistration.md
[REG]: https://github.com/belemik/emikman_builder/blob/e63f1446acf7cdfde617b9fbd9ec4ff18bbeab04/src/registry/index.ts
[SCHEMA]: https://github.com/belemik/emikman_builder/blob/e63f1446acf7cdfde617b9fbd9ec4ff18bbeab04/src/design-system/schema.ts
[GEN]: https://github.com/belemik/emikman_builder/blob/e63f1446acf7cdfde617b9fbd9ec4ff18bbeab04/scripts/ds-generate.mjs
[VAL]: https://github.com/belemik/emikman_builder/blob/e63f1446acf7cdfde617b9fbd9ec4ff18bbeab04/src/design-system/validator.ts
[MIG]: https://github.com/belemik/emikman_builder/blob/e63f1446acf7cdfde617b9fbd9ec4ff18bbeab04/src/design-system/migrate.ts
[BOUNDARY]: https://github.com/belemik/emikman_builder/blob/e63f1446acf7cdfde617b9fbd9ec4ff18bbeab04/src/renderer/boundary.ts
[PREP]: https://github.com/belemik/emikman_builder/blob/e63f1446acf7cdfde617b9fbd9ec4ff18bbeab04/src/renderer/prepare.ts
[CAP]: https://github.com/belemik/emikman_builder/blob/e63f1446acf7cdfde617b9fbd9ec4ff18bbeab04/src/renderer/library-capabilities.ts
[DSR]: https://github.com/belemik/emikman_builder/blob/e63f1446acf7cdfde617b9fbd9ec4ff18bbeab04/src/renderer/DSRenderer.tsx
[LIB]: https://github.com/belemik/emikman_builder/blob/e63f1446acf7cdfde617b9fbd9ec4ff18bbeab04/src/renderer/library.tsx
[STORAGE]: https://github.com/belemik/emikman_builder/blob/e63f1446acf7cdfde617b9fbd9ec4ff18bbeab04/src/storage/index.ts
[APP]: https://github.com/belemik/emikman_builder/blob/e63f1446acf7cdfde617b9fbd9ec4ff18bbeab04/src/main.tsx
[MODEL]: https://github.com/belemik/emikman_builder/blob/e63f1446acf7cdfde617b9fbd9ec4ff18bbeab04/src/canvas/model.ts
[PROMPT]: https://github.com/belemik/emikman_builder/blob/e63f1446acf7cdfde617b9fbd9ec4ff18bbeab04/src/prompt/index.ts
[ACCOUNT]: https://github.com/belemik/emikman_builder/blob/e63f1446acf7cdfde617b9fbd9ec4ff18bbeab04/src/account.tsx
[RUNTIME]: https://github.com/belemik/emikman_builder/blob/e63f1446acf7cdfde617b9fbd9ec4ff18bbeab04/src/runtime.ts
[AI]: https://github.com/belemik/emikman_builder/blob/e63f1446acf7cdfde617b9fbd9ec4ff18bbeab04/src/ai/index.ts
[SYNC]: https://github.com/belemik/emikman_builder/blob/e63f1446acf7cdfde617b9fbd9ec4ff18bbeab04/src/canvas/composition.ts
[DS-TEST]: https://github.com/belemik/emikman_builder/blob/e63f1446acf7cdfde617b9fbd9ec4ff18bbeab04/tests/design-system.test.ts
[LIB-TEST]: https://github.com/belemik/emikman_builder/blob/e63f1446acf7cdfde617b9fbd9ec4ff18bbeab04/tests/library.test.ts
[RENDER-TEST]: https://github.com/belemik/emikman_builder/blob/e63f1446acf7cdfde617b9fbd9ec4ff18bbeab04/tests/renderer.test.ts
[REC-TEST]: https://github.com/belemik/emikman_builder/blob/e63f1446acf7cdfde617b9fbd9ec4ff18bbeab04/tests/recovery.test.ts
[DOC-TEST]: https://github.com/belemik/emikman_builder/blob/e63f1446acf7cdfde617b9fbd9ec4ff18bbeab04/tests/document.test.ts
[PW-LIB]: https://github.com/belemik/emikman_builder/blob/e63f1446acf7cdfde617b9fbd9ec4ff18bbeab04/tests/visual/library.spec.ts
[PW-RENDER]: https://github.com/belemik/emikman_builder/blob/e63f1446acf7cdfde617b9fbd9ec4ff18bbeab04/tests/visual/renderer.spec.ts
[CHECK]: https://github.com/belemik/emikman_builder/blob/e63f1446acf7cdfde617b9fbd9ec4ff18bbeab04/.github/workflows/check.yml
[REMED]: https://github.com/belemik/emikman_builder/blob/e63f1446acf7cdfde617b9fbd9ec4ff18bbeab04/docs/PR1_REMEDIATION.md
[COVERAGE]: https://github.com/belemik/emikman_builder/blob/e63f1446acf7cdfde617b9fbd9ec4ff18bbeab04/docs/DS_COVERAGE.md
[CI-FINAL]: https://github.com/belemik/emikman_builder/actions/runs/42044884332
[PR2]: https://github.com/belemik/emikman_builder/pull/2
[PR3]: https://github.com/belemik/emikman_builder/pull/3
[PR4]: https://github.com/belemik/emikman_builder/pull/4

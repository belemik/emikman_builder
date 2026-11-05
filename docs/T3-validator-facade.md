# T3 — Validator Facade

Статус: **T3 ACCEPTED**. Дата утверждения: **04.11.2026**. Решение владельца: APPROVE WITH MINOR CHANGES; оба уточнения внесены. T3 завершён на уровне архитектурного проектирования, без реализации Facade.
Основание: [ADR-001 ACCEPTED](ADR-001-source-neutral-design-system-contract.md) и [T2 ACCEPTED](T2-unsupported-policy.md), утверждены 04.11.2026. При противоречии этого документа с ними действуют принятые решения T1/T2.

Это проект API и алгоритма, не реализация Facade. Код, существующие TypeScript-типы, Screen Schema v3, Validator, Renderer и документы T1/T2 не изменяются. T4–T7 и экспериментальный Preview не запускаются. Названия и версии интерфейсов ниже предложены для согласования.

## 1. Исходная реализация и задача

Локально изучены `src/design-system/schema.ts`, `validator.ts`, `migrate.ts`, `src/renderer/prepare.ts`, `library-capabilities.ts`, границы Renderer/storage и существующие тесты. Текущий Contract version — 1.3.0. `Issue` содержит code/path/message; `Result<T>` различает valid/value/warnings и invalid/errors/warnings. `validateScreen` принимает strict или compatible; `parseScreen` проверяет размер и JSON. `validateComponent` проверяет каталог, props, комбинации, вложенность и Select state; `validateToken` — имена и при запросе тип/значение токена.

`prepareRender` повторно вызывает strict Validator и дополнительно проверяет доступный renderer subset, возвращая `RENDERER_UNSUPPORTED`. Эти матрицы не являются полным независимым Mapping Registry, не доказывают все операции и не присваивают CR3. `tokenReferences` — manifest зависимостей, не API произвольного связывания CSS.

Facade должен объединять независимые проверки в объяснимое решение для конкретного действия, не превращая `valid: true` текущего Validator в обещание исполнимости или готовности. Нейтральное ядро не содержит обязательных имён WDeaf-компонентов, Figma IDs или React props. Поддержка второго источника текущим форматом v3 не заявляется.

## 2. Ответственность и зависимости

```text
Document payload (v3 без изменений) + отдельный закреплённый контекст
                                |
                       Validator Facade
                                |
    +---------------------------+------------------------------+
    |                           |                              |
Context resolution      Contract validation             Runtime assessment
snapshot / sources      format + components             mapping + capability
binding / integrity     props / slots / tokens           conflict + CR / evidence
    |                           |                              |
    |                  WDeaf adaptation layer                  |
    |                  existing Validator                      |
    +---------------------------+------------------------------+
                                |
                       T2 decision policy
                                |
             diagnostics + independent results + decision
                                |
       caller: показать отказ / продолжить разрешённое действие
```

| Сущность | Ответственность относительно Facade |
| --- | --- |
| DS Contract | Определяет допустимость структуры и точных сочетаний. Facade выбирает проверяющий backend по явно разрешённому профилю, не создаёт контракт из названий узлов |
| Library Snapshot | Неизменяемые данные/контракт/provenance. Resolver предоставляет ровно закреплённый снимок и проверку целостности; отсутствие не заменяется latest |
| Runtime Binding | Закрепляет mapping, реализацию, capability, зависимости/assets/fonts; хранится вне payload v3. Facade проверяет согласованность ссылок, не устанавливает пакеты |
| Component Mapping Registry | Связывает точные identities и runtime. Проверка mapping не выполняет импортированный код и не доказывает поддержку операции |
| Renderer Capability | Доказывает возможность конкретного варианта, состояния, операции, композиции, темы и среды. Не расширяет Contract |
| CR0–CR3 / evidence | Подтверждает готовность точной области. Facade оценивает записи, но не присваивает CR, не проводит review и не запускает тесты вместо evidence |
| Действующий Validator | Сохраняет runtime API и WDeaf-правила. Будущий адаптационный слой транслирует результат без переименования исходных кодов |
| Facade | Оркестрирует чтение, проверки и T2-решение; не рисует UI, не мигрирует молча, не сохраняет документы и не исправляет props |
| Caller / будущий coordinator | Применяет решение только к проверенной ревизии и области. Не может снять BLOCK подтверждением пользователя |

Source Adapter остаётся вне запроса валидации: чтение нового источника и создание snapshot — отдельные процессы. Runtime assessment работает с декларативными данными и доверенными заранее выбранными backends. Facade не является sandbox или разрешением исполнения.

## 3. Проект интерфейсов

Ниже концептуальные TypeScript-структуры. Они не добавляются в `src`, не заменяют `Result<T>` и не задают формат хранения внешнего контекста. Недоверенный ввод принимается как JSON-текст и проходит безопасное декодирование с проверкой лимитов и структуры. Тип `unknown` сам по себе не создаёт безопасную границу: произвольные JavaScript-объекты, включая getters и Proxy, не считаются JSON-данными.

```ts
// Концептуальный тип, не доказательство доверенности объекта во время исполнения.
type JsonData = null | boolean | number | string | JsonData[]
  | { [key: string]: JsonData };
type CheckStatus = 'PASS' | 'FAIL' | 'UNKNOWN' | 'NOT_APPLICABLE';
type Stage = 'context' | 'structure' | 'contract' | 'mapping'
  | 'capability' | 'conflicts' | 'readiness' | 'policy';
type Ref = {
  id: string;
  revision: string; // точная ревизия артефакта ЗАРЯ, не выдуманная upstream version
  digest: string;   // алгоритм/canonicalization требуют согласования
};
type Available<T> =
  | { status: 'available'; value: T }
  | { status: 'missing' | 'unavailable' | 'ambiguous'; reason: string };
type SourceReference = {
  sourceId: string;
  kind: string; // namespace провайдера, не закрытый список Figma/React
  locator: string;
  upstreamRevision: string | null; // null: источник не предоставил
  capturedArtifact: Ref;
  provenance: Ref;
};
type RequestedScope = {
  target: 'whole-document' | 'explicit-candidate';
  nodePaths: string[];
  operations: string[];
  states: string[];
  theme: Ref;
  environment: Ref;
};
interface ValidationRequest {
  apiVersion: 'facade-draft-1';
  requestId: string;
  document: {
    documentId: string; // identity сессии для standalone JSON допустима
    revision: string;
    contentDigest: string;
    input: { kind: 'json-text'; raw: string }
      // Только внутренний доверенный путь после декодирования и проверки.
      | { kind: 'json-value'; value: JsonData };
    declaredFormat: 'screen-v3' | 'legacy-candidate' | 'unknown';
  };
  action: 'inspect' | 'strict-render' | 'validated-export'
    | 'executable-specification' | 'experimental-preview';
  scope: RequestedScope;
  context: ValidationContext;
}
interface ValidationContext {
  contextVersion: 'facade-context-draft-1';
  policy: Ref; // точная принятая политика T2 + согласованные правила исполнения
  documentBindings: Available<Ref>; // внешний Document manifest
  snapshots: Available<Ref[]>;
  contracts: Available<Ref[]>;
  runtimes: Available<Ref[]>;
  mappings: Available<Ref[]>;
  capabilities: Available<Ref[]>;
  sourceReferences: Available<SourceReference[]>;
  sourceRolesAndDecisions: Available<Ref[]>;
  readinessAndEvidence: Available<Ref[]>;
  legacyProfile: Available<Ref>;
  previewIsolationApproval: Available<Ref>;
}
interface ValidationDiagnostic {
  id: string;
  code: string; // namespace: unsupported / facade / legacy-runtime
  effect: 'BLOCK' | 'WARN' | 'INFO';
  stage: Stage;
  reason: string; // понятная безопасная причина, без полного JSON/секретов
  location: {
    target: 'document' | 'context' | 'request';
    pointer: string; // JSON Pointer, '' для корня
    nodeId?: string;
  };
  refs: Ref[];
  sources: SourceReference[];
  nativeIssues: { producer: string; code: string; path: string; message: string }[];
  dependsOn: string[];
  alternatives: {
    description: string;
    requiresConfirmation: boolean;
    requiresRevalidation: boolean;
  }[]; // только известные кандидаты, не исполняемые callbacks
}
interface ValidationResult {
  apiVersion: 'facade-draft-1';
  requestId: string;
  checked: {
    documentId: string; revision: string; contentDigest: string;
    scope: RequestedScope; contextRefs: Ref[]; policy: Ref;
  };
  stages: {
    stage: Stage; status: CheckStatus; required: boolean;
    reason: string; diagnosticIds: string[]; dependsOn: Stage[];
  }[];
  assessments: {
    contextResolved: CheckStatus;
    structurallyAdmissible: CheckStatus;
    executableCapability: CheckStatus;
    confirmedReadiness: CheckStatus;
  };
  decision: 'BLOCK' | 'STRICT_ALLOWED'
    | 'EXPERIMENTAL_PREVIEW_ALLOWED' | 'INSPECTION_ONLY';
  complete: boolean;
  diagnostics: ValidationDiagnostic[];
}
```

Все поля без `?` обязательны; отсутствие сведений выражается Available, а не пустым массивом с подразумеваемым успехом. Пустой набор допустим лишь при доказанной неприменимости проверки. `legacyProfile` неприменим для уже закреплённого нелегаси контекста; отсутствие preview approval неприменимо только вне Preview. Ссылки должны разрешаться в проверенные записи; наличие строки digest само по себе не означает PASS или доверие к коду.

Contracts имеют собственную версию формата; snapshot — identity/digest; source revision, mapping revision, implementation build, renderer revision, evidence revision — разные ссылки. Document manifest явно связывает их с каждым использованным определением; формат manifest остаётся открытым по T1/T2. Контекст не наследует defaults Project вместо Document. Модель Project → Work → Document концептуальна, существующий ProjectRepository не меняется.

Scope должен быть закрытым и проверяемым: какие узлы, варианты, операции, состояния и среда запрошены, включая вложенные и порождённые части. Нельзя запросить пустой scope и получить разрешение целого экрана. Contract + runtime descriptions должны раскрывать зависимости операций; если это невозможно, соответствующая проверка UNKNOWN. Выбранный subset — отдельный явно подтверждённый кандидат, не успешная валидация оставшейся части исходного экрана.

Граница доверия `json-value`: это исключительно внутренний путь для доверенных, предварительно декодированных и проверенных JSON-данных, происхождение которых контролирует вызывающий слой. Проверка JSON-данных не означает проверку DS Contract. Произвольный объект из плагина, импорта или другого недоверенного кода через этот путь не принимается. Приведение типа, поле-маркер или `JsonData` не доказывают безопасность; нельзя проверять/сериализовать недоверенный объект в надежде обезвредить Proxy/getters — такие операции сами могут выполнить код. Для недоверенного ввода нужен JSON-текст через границу декодирования. Механизм обеспечения внутренней границы ещё не реализован; безопасность произвольных объектов не обещается.

`WARN` — только эффект диагностики, не итоговое решение и не разрешение исполнения. Нет `valid: true`, объединяющего все виды гарантий. `complete` означает завершённость обязательных проверок без UNKNOWN, а не успех: полностью проверенный отказ может иметь complete=true.

### Итоговое решение по действию

| Action | Итоговое решение | Обязательные условия и границы |
| --- | --- | --- |
| inspect | INSPECTION_ONLY | Диагностический просмотр, включая некорректный документ или неполный контекст. FAIL/UNKNOWN и предупреждения сохраняются в stages/diagnostics; исполнения и утверждения валидности нет |
| strict-render | STRICT_ALLOWED либо BLOCK | Все обязательные проверки PASS, точная область CR3; любой обязательный FAIL/UNKNOWN даёт BLOCK |
| validated-export | STRICT_ALLOWED либо BLOCK | Те же строгие gates для запрошенного формата/области. STRICT_ALLOWED разрешает только этот экспорт, а не запуск. Скачивание оригинала для восстановления — отдельное действие, не validated-export |
| executable-specification | STRICT_ALLOWED либо BLOCK | Все обязательные проверки PASS и CR3 для запрошенной спецификации; FAIL/UNKNOWN блокирует генерацию результата, объявленного исполняемым |
| experimental-preview | EXPERIMENTAL_PREVIEW_ALLOWED либо BLOCK | Все обязательные проверки PASS, минимум CR2, отдельное утверждение и проверка реализации безопасной изоляции по T2. До выполнения этих условий — BLOCK, независимо от согласия пользователя |

Таблица применяется к распознанному запросу с корректным envelope. Если action/версия API/envelope недопустимы, возвращается BLOCK с FACADE_REQUEST_INVALID; это не запрет сохранять оригинал через отдельный recovery-путь. Повреждённый JSON документа при корректном inspect-запросе даёт INSPECTION_ONLY и диагностику. Некорректный документ доступен для просмотра ошибок и сохранения исходного текста, но не строгого рендеринга. Предупреждения показываются отдельно в diagnostics и никогда не заменяют проверку обязательных условий.

## 4. Алгоритм и неполный контекст

Перед этапами — декодирование недоверенного JSON-текста и проверка envelope/версии API/лимитов. Внутренний json-value допускается только через описанную выше доверенную границу. Алгоритм не предусматривает выполнение getters, функций, callbacks или динамический import входа; это требование будущей реализации, а не гарантия безопасного обхода произвольного объекта или Proxy. Некорректный JSON блокирует проверки документа; контекст можно диагностировать независимо. Исключение доверенного backend превращается в безопасную диагностику внутреннего сбоя и UNKNOWN соответствующей проверки, а не PASS.

| Шаг | Проверка и зависимости | Результат при нехватке данных |
| --- | --- | --- |
| 1. Context | Разрешённые sources и роли, точный snapshot/contract, Document bindings/runtime, integrity и совместимость ревизий | UNKNOWN для недоступных сведений; FAIL при доказанном несовпадении/запрете. Не заключать «компонент отсутствует», если snapshot недоступен |
| 2. Structure | Формат документа, поля, IDs, platform, лимиты; контракт выбран явно. Известная оболочка v3 может проверяться независимо, но это не полный structural PASS | Неразрешённый contract блокирует полный вывод. Нет автопрофиля по именам |
| 3. Contract | Компоненты, props, точные variants, slots/parents/cardinality, tokens и interaction state всех используемых частей | Неизвестное значение в доступном контракте — FAIL; недоступное правило — UNKNOWN. Не строить декартово произведение enums |
| 4. Mapping | Для допустимых определений проверяются точный mapping, trust и implementation reference; преобразования не могут добавить неразрешённые значения | Нет mapping — FAIL при доказанном отсутствии; недоступный Registry — UNKNOWN |
| 5. Capability | Точная комбинация/композиция/операция/состояние/theme/environment, включая сгенерированные части. Зависит от разрешённого mapping | Структурная допустимость не компенсирует отсутствие capability |
| 6. Conflicts | Противоречия источников в запрошенной области, утверждённые роли и решения с provenance/evidence | Неизвестность области конфликта не считается независимостью. Решение владельца не снимает ошибки шагов 2–5 |
| 7. Readiness | Exact evidence scope и CR, тип review, reviewer, дата, окружение/операции/состояния/ограничения | Нет evidence или неподтверждённый фокус Checkbox/Chip — UNKNOWN/FAIL по установленному факту; строгий gate не проходит |
| 8. T2 policy | Агрегация всех обязательных checks для action; Preview дополнительно требует утверждённой и проверенной изоляции, CR2 минимум | Любой обязательный FAIL или UNKNOWN блокирует действие; без fallback и удаления узлов |

Шаги 2–3 могут быть одним вызовом текущего WDeaf Validator: Facade не заявляет, что backend уже разделяет их. При раннем отказе непроверенная часть остаётся UNKNOWN с зависимостью, а не NOT_APPLICABLE. Последующие независимые проверки допустимы; зависимые отмечаются reason=prerequisite-unresolved и ссылкой на причину. Нельзя выдавать предположительные cascade-ошибки как установленные факты.

NOT_APPLICABLE используется только при доказанной неприменимости к action/scope, не для пропущенного этапа. UNKNOWN — эпистемический статус проверки, BLOCK — решение о действии; это разные оси. WARN не понижает обязательную ошибку. Inspect допускает диагностический отчёт о невалидном документе и сохранение исходника, но не выполнение.

Строгий допуск требует PASS всех обязательных стадий и CR3 точной области. CR2 не проходит strict. Экспериментальный исполняемый Preview остаётся заблокированным до отдельного утверждения безопасной изоляции, её реализации/проверки и выполнения остальных T2 gates. Он не выполняет произвольный импортированный код, не меняет рабочий документ, не допускает неразрешённые побочные эффекты. Facade ничего не запускает даже при положительном решении.

Результат привязан к точным document revision/contentDigest/contextRefs/scope/policy. Изменение документа, среды, реализации, evidence или отзыв доверия требует новой проверки. Результат не является бессрочным разрешением и не может применяться к «похожему» документу; политика актуальности и отзыва требует согласования.

## 5. Диагностика и сопоставление с runtime

Сопоставление ниже — предложение T3, не изменение runtime-кодов. Сохраняются native producer/code/path/message и отдельная семантика Facade. Сопоставлять следует по коду, этапу и расположению, не по тексту сообщения. Если соответствие неоднозначно, исходная ошибка сохраняется без выдуманной категории T2.

| Проект T2 | Подтверждённые текущие коды / условия | Ограничения сопоставления |
| --- | --- | --- |
| UNSUPPORTED_COMPONENT_ABSENT | COMPONENT | Только при доступном выбранном WDeaf catalog |
| UNSUPPORTED_PROPERTY | PROP_VALUE; UNKNOWN_FIELD/MISSING_FIELD внутри props; SELECT_VALUE для interaction state | UNKNOWN_FIELD вне props не объявлять ошибкой свойства компонента |
| UNSUPPORTED_VARIANT_COMBINATION | UNVERIFIED_COMBINATION | Compatible-warning не становится разрешением нового strict gate |
| UNSUPPORTED_COMPOSITION | INTERNAL_COMPONENT, PARENT_COMPONENT, SLOT_COMPONENT, SLOT_COUNT, SLOT_VARIANT, DEPTH; UNKNOWN_FIELD внутри slots | Сохранить точную причину: корень, родитель, слот, количество или сочетание |
| UNSUPPORTED_RENDERER_CAPABILITY | RENDERER_UNSUPPORTED из prepareRender | Не доказывает отсутствие mapping/React-кода; подтверждает отказ текущего subset |
| UNSUPPORTED_DOCUMENT_FORMAT | VERSION, PLATFORM, V2_UNSUPPORTED | Последний относится только к запросу экспорта v2; ошибка версии не доказывает чужую библиотеку |
| UNSUPPORTED_IMPLEMENTATION_MISSING | Прямого текущего кода нет | Будущее разрешение implementation; не выводить из RENDERER_UNSUPPORTED |
| UNSUPPORTED_MAPPING_MISSING | Прямого текущего кода нет | Будущий Registry |
| UNSUPPORTED_READINESS_SCOPE / UNSUPPORTED_EVIDENCE_SCOPE | Прямых текущих кодов нет | Будущие CR/evidence checks |
| UNSUPPORTED_SOURCE_CONFLICT / UNSUPPORTED_SOURCE_ROLE | Прямых текущих кодов нет | Будущие роли и решения, track A — владелец проекта |
| UNSUPPORTED_SNAPSHOT_UNAVAILABLE / UNSUPPORTED_RUNTIME_BINDING / UNSUPPORTED_BINDING_INTEGRITY | Прямых текущих кодов нет | Будущий resolver, integrity/trust checks |
| UNSUPPORTED_LEGACY_CONTEXT / UNSUPPORTED_DOCUMENT_BINDING | Прямых текущих кодов нет | Миграция v1/v2 сама по себе не подтверждает происхождение/binding |
| UNSUPPORTED_PROPOSAL_ONLY | Прямого текущего кода нет | Proposal остаётся вне payload; не новый ComponentId |

Словарь T2 не покрывает все ошибки текущего Validator. `TOKEN`, `TOKEN_VALUE`, `TOKENS`, `DUPLICATE_TOKEN`, `UNVERIFIED_STYLE`, `JSON`, `SIZE`, `OBJECT`, `JSON_VALUE`, `ID`, `DUPLICATE_ID`, `ELEMENTS`, ошибки override COLOR/RADIUS/FONT и прочие сохраняются как native diagnostics в namespace legacy-runtime. Не называть ошибку токена ошибкой prop ради заполнения таблицы. `RADIUS_CLAMPED` остаётся предупреждением миграции с требованием сохранения оригинала. Для новых источников нейтральные token/format/security diagnostics требуют отдельного утверждения.

Дополнительные предлагаемые служебные коды Facade: `FACADE_REQUEST_INVALID`, `FACADE_CONTEXT_INCOMPLETE`, `FACADE_DEPENDENCY_UNRESOLVED`, `FACADE_BACKEND_FAILURE`, `FACADE_PREVIEW_ISOLATION_REQUIRED`. Это проект, не расширение принятого словаря T2 или runtime API. Причины содержат недостающее условие и безопасное действие пользователя, но не секреты/полный payload. Native message также проходит безопасную выдачу; исходные данные сохраняются отдельно, не в логах.

Пути Facade используют JSON Pointer с экранированием сегментов, native path сохраняется отдельно. Контекстная ошибка указывает на context, а не выдуманный путь в v3. Альтернативы берутся из разрешённого закреплённого контракта; если их нет, предлагаются восстановление нужной версии, уточнение происхождения, сохранение исходника или Component Proposal. Любая замена — явный отдельный кандидат с подтверждением и повторной проверкой. ИИ не меняет компонент и не обходит Validator.

## 6. Адаптация WDeaf и сохранность данных

Будущий WDeaf adaptation layer принимает только явно выбранный профиль и исходный payload; использует существующие `parseScreen` / `validateScreen`, сохраняет native issues и не меняет их публичный API. `prepareRender` можно использовать как ограниченную backend-проверку текущего subset; он повторно валидирует структуру, поэтому адаптер должен различать структурный отказ и RENDERER_UNSUPPORTED, а не считать весь результат capability-ошибкой. Дублированные issues могут группироваться с сохранением происхождения.

Strict-путь вызывает strict, не compatible. Compatible служит текущему импорту/редакторскому сохранению; его успех не повышается до строгого допуска. Для bindings/CR3, которых нет, будущий Facade возвращает UNKNOWN и BLOCK исполнения. Поэтому включение такого Facade перед действующим Builder сейчас заблокировало бы существующие документы: rollout и подготовка evidence требуют отдельного решения. T3 не внедряет новый gate в работающий UI.

Facade не вызывает миграцию как скрытый побочный эффект. Legacy pipeline сначала сохраняет точный исходник; явная миграция использует существующие `migrateJSON` / `migrateScreen` и отдельно проверяет кандидат. Изменения radius и прочие warnings не исчезают. Повреждённый JSON остаётся доступным как оригинал, не заменяется пустым проектом. Ошибка backup блокирует разрушительную замену/возобновление записи, не уничтожает прежние копии. Локальное хранение не обещает сохранность после очистки браузера.

Для standalone JSON без binding требуется подтверждённый контекст происхождения или явное пользовательское указание и выбор legacy-профиля. Неоднозначность блокирует строгий запуск. Совпадение имён и версия v3 не являются доказательством источника. Пользовательское утверждение фиксируется как таковое, не как независимое evidence.

External bindings и Component Proposals концептуально принадлежат Document, но не payload v3; их storage/transport не выбран. Сохранение raw для восстановления не зависит от render approval и не называется экспортом валидного экрана. Существующий `toCanvasV2` разрешает только представимый subset и возвращает V2_UNSUPPORTED при потерях; Facade не удаляет slots, tokenReferences или Select state. Новые источники не кодируются через переименование WDeaf IDs. Ни defaults Project, ни пользовательское подтверждение не меняют закреплённую библиотеку автоматически.

## 7. Проверочные сценарии

Это проект тест-плана. Тесты, сборки и эксперименты в T3 не запускались. «Сейчас» означает возможность проверить существующий backend отдельно, не готовую реализацию Facade.

| Сценарий | Ожидаемое решение будущего Facade | Что доступно сейчас / что требует реализации |
| --- | --- | --- |
| Валидный WDeaf v3 в renderer subset | Structure/capability PASS; STRICT_ALLOWED только с полным binding и CR3. Без них BLOCK + UNKNOWN | Validator/prepareRender и tests/renderer.test.ts доступны; snapshot/binding/CR3 gate будущие |
| Неизвестный компонент, включая __proto__, constructor, toString | COMPONENT → UNSUPPORTED_COMPONENT_ABSENT; BLOCK, без исключения | Отрицательные проверки tests/design-system.test.ts уже существуют; трансляция Facade будущая |
| Недопустимая комбинация | UNVERIFIED_COMBINATION; BLOCK | Текущие matrix/strict проверки; новый aggregation будущий |
| Неправильный родитель/слот или внутренний root | UNSUPPORTED_COMPOSITION, BLOCK; оригинал сохранён | Текущие composition checks; Facade и transport оригинала будущие |
| Нет runtime binding | Context UNKNOWN, зависимые стадии UNKNOWN, strict BLOCK | Требует внешнего контекста/resolver; не подбирать по именам |
| Schema-valid, renderer-unsupported (например table) | Structure PASS, capability FAIL, BLOCK | prepareRender уже проверяет; это не доказательство отсутствия React-реализации вообще |
| CR2 в strict | Readiness FAIL, UNSUPPORTED_READINESS_SCOPE, BLOCK | Требует CR/evidence записей; текущим компонентам CR не назначается автоматически |
| CR2 experimental Preview без утверждённой изоляции | BLOCK даже при согласии владельца | Только проект политики; запуск запрещён |
| Конфликт Figma/React в используемой области | UNSUPPORTED_SOURCE_CONFLICT, BLOCK; решение владельца + новая проверка | Требует roles/decision records; нет фактической интеграции |
| Checkbox/Chip: удержание фокуса не подтверждено | Evidence UNKNOWN либо FAIL при известном провале; strict операции BLOCK | Риск известен; проверка CR scope будущая, долг не исправляется |
| Неверный token / произвольные стили | Native TOKEN/UNVERIFIED_STYLE, BLOCK; не подмена значений | Текущий strict Validator и tests/design-system.test.ts |
| Повреждённый legacy JSON | JSON, проверки структуры UNKNOWN, strict BLOCK; точный raw сохранён | Parser/recovery tests существуют; Facade result будущий |
| Legacy JSON валиден синтаксически, источник неоднозначен | UNSUPPORTED_LEGACY_CONTEXT, BLOCK до явного разрешения; затем повторные gates | Текущая миграция не доказывает source-neutral provenance; новый resolver будущий |
| v3 → v2 с slots/tokenReferences/selectedValue | V2_UNSUPPORTED; предложить v3, сохранить оригинал | Текущий toCanvasV2 и отрицательные тесты |
| Отозванная/недоступная evidence или несовпавший digest | UNKNOWN/FAIL по фактам; BLOCK исполнения | Trust/revocation/canonicalization требуют проектирования |
| Разрешённый другой источник / AI Component Proposal | Нет автоматического включения; binding/format/proposal diagnostics | Внешние сущности и нейтральные bridges не реализованы |
| Необязательный remote offline, точные локальные артефакты подтверждены | Предупреждение; gates проверяются по локальному контексту без latest | Будущий resolver; само offline не означает отказ всей структуры |
| Backend exception / изменение документа после проверки | UNKNOWN + BLOCK / повторная проверка новой ревизии | Требует адаптера, error boundary и result freshness contract |

Дополнительные будущие contract-tests: детерминированность результата при одинаковых закреплённых входах; отсутствие мутации; корректные зависимости UNKNOWN; невозможность WARN обойти BLOCK; все nested/generated части покрыты; отдельные namespace/path diagnostics; сохранение исходников и identity при переносе; отмена согласия не изменяет Document.

## 8. Риски и открытые решения

1. Не определены storage/transport внешнего manifest и устойчивое связывание с Document. Приведённые типы — логический API, не решение хранения; реализация передачи блокируется до согласования.
2. Требуют утверждения версии API, digest/canonicalization, лимиты, resolver/trust/revocation и правила актуальности результата. Хеш не сертифицирует безопасность реализации.
3. Нужен утверждённый словарь operations/states/environment и способ раскрытия внутренних runtime-зависимостей. Без полного scope нельзя обещать CR3 и корректную проверку generated parts.
4. Нужны критерии достаточности evidence, включая focus retention Checkbox/Chip. Track A допускает self-review владельца с типом, reviewer, датой, областью и evidence; это не независимая экспертиза. Долг React key сохраняется.
5. Согласовать предложенную диагностическую трансляцию и новые служебные коды, особенно токены/стили/формат вне UNSUPPORTED_*. Действующий API остаётся неизменным.
6. CR2 Preview блокируется до отдельного решения по изоляции и проверки реализации. Facade не устраняет этот блокер.
7. Future WDeaf profile должен пройти проверку legacy-корпуса. Один baseline не доказан совместимым со всеми историческими JSON. Rollout нового gate не входит в T3.
8. Source-neutral/design-system-neutral модель концептуальна. E3 Phase A и ADP-01 Phase B требуют передачи полных протоколов/критериев; определений не хватало в репозитории, а не во всей проектной документации. Radix из ADR остаётся примером, не интеграцией.

В дорожке A Source Roles, mappings и разрешение конфликтов подтверждает владелец проекта с provenance/evidence. Подтверждение не отменяет структурную ошибку, отсутствие capability или evidence. Полномочия других дорожек и хранение журнала решений остаются открытыми.

## 9. Критерии завершения T3 и перехода к T4

T3 завершён на уровне проектирования: владелец согласовал архитектуру и принял два уточнения. Зафиксированы решения относительно границ Facade, независимых assessments, модели входа/выхода, UNKNOWN/dependency policy, условной диагностической трансляции, таблицы сценариев и списка блокеров. Успех backend Validator не должен подразумевать readiness; никаких изменений v3, runtime API или молчаливых миграций.

Для перехода к T4 нужны отдельное разрешение владельца и определение цели/границ T4; этот документ их не выдумывает. До реализации зависимых механизмов должны быть согласованы соответствующие открытые решения §8. Принятие архитектуры не означает универсальной совместимости, готовой интеграции или разрешения Preview.

Итог текущего этапа: **T3 ACCEPTED от 04.11.2026**. Реализация Facade отсутствует; существующие механизмы работают без изменений. Commit, push, merge, переключение веток и T4–T7 не выполняются.

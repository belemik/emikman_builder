# T5 — ScopePatch / ScopeDiff

Статус: **T5 ACCEPTED**. Дата утверждения: **04.11.2026**. Решение владельца: APPROVE WITH MINOR CHANGES; оба уточнения внесены. Принято на уровне архитектурного проектирования, без реализации.

Основа: [ADR-001](ADR-001-source-neutral-design-system-contract.md), [T2](T2-unsupported-policy.md), [T3](T3-validator-facade.md), [T4](T4-coverage-inventory-metrics.md), ACCEPTED 04.11.2026. Это архитектурный проект, не реализация редактирования, AI Builder или экспериментального Preview. Screen Schema v3, runtime API и принятые документы не изменяются. Scope, proposals, approvals и история концептуально находятся вне payload v3; формат их хранения не выбран.

## 1. Архитектура и обязательные границы

```text
User Request
    ↓ явное разрешение владельца на точные targets/операции
ScopeSpec + закреплённый Document/base/context
    ↓
PatchProposal от ИИ (недоверенное предложение данных)
    ↓ проверка envelope, Scope и preconditions
Candidate builder: копия base, только типизированные операции
    ↓
ScopeDiff: независимое полное сравнение base ↔ candidate
    ↓
Scope gate + T3 Validation + T2 policy
    ↓ только после успешных обязательных проверок
Human Approval точного proposal/candidate/diff/context
    ↓ повторная проверка актуальности и атомарный compare-and-swap
Apply coordinator → новая ревизия + исходник + audit receipt
```

Scope gate и DS gate независимы: разрешённый по контракту соседний элемент нельзя менять вне Scope. Human Approval не отменяет ни Scope, ни Validator, ни Renderer Capability, ни применимые readiness/evidence требования. Текст запроса ИИ не является разрешением; неоднозначные «это», совпадающие ID, выбор по label или порядок индексов требуют уточнения до построения исполняемого предложения.

Responsibilities: Scope resolver фиксирует разрешение пользователя; Candidate builder интерпретирует ограниченные операции без выполнения кода; ScopeDiff независимо проверяет полный результат; Validator Facade оценивает документ и контекст по T3; Approval связывает пользователя с точной проверенной ревизией предложения; Apply coordinator отвечает за конкурентность, атомарность и журнал. Ни один слой не регистрирует новые компоненты, не выбирает latest library и не исправляет документ молча.

Preview в T5 означает **неисполняемый просмотр diff**. Его можно показывать вместе с BLOCK/UNKNOWN диагностиками. Он не запускает Renderer и не снимает запрет экспериментального CR2 Preview из T2. Исполняемый preview — отдельное действие с собственными gates и утверждённой/проверенной изоляцией; T5 его не запускает.

## 2. Scope: права записи и область проверки

Scope фиксирует один конкретный Document в концептуальной иерархии Project → Work → Document, исходные revision/content digest, точные snapshot/runtime/mapping/capability/evidence references и policy version. Существующий ProjectRepository не меняется. Для standalone JSON требуется внешний идентификатор и явное разрешение legacy provenance по T1/T3; имен WDeaf-компонентов недостаточно.

Targets идентифицируются стабильными ID **и** расположением в зафиксированной ревизии: parent/slot ancestry и expected component identity. Индексы нужны для diff, но не являются устойчивой целью операции. Перед Apply проверяется уникальность ID во всём документе. Generated runtime parts не получают фиктивные редактируемые ID в v3: у них есть только derived locator для показа impact, а право изменения — у поддержанного родителя.

Права записи — закрытый allowlist: конкретное свойство конкретного элемента, операция, допустимые значения/границы, слот/позиция/новые ID, лимит количества операций. Отсутствие разрешения = запрет. Deny имеет приоритет над allow. Не разрешены wildcard «всё внутри экрана», произвольные JSON paths или расширение Scope самим ИИ.

По умолчанию неизменны: соседние элементы и их порядок, существующие IDs/component identity, прочие slots/props/state, schemaVersion/platform, themeOverrides, tokenReferences и внешние bindings. В T5 нет операции смены источника/версии, токенов или темы. Если требуемое изменение нуждается в этом, proposal блокируется и нужна отдельная задача/новый разрешённый Scope, а не скрытая зависимая операция.

Scope имеет два разных множества:

- **write set** — явно разрешённые прямые и зависимые изменения;
- **validation/read closure** — родители, дети, generated parts и контекст, которые нужно перечитать для проверки. Это не разрешение изменять их.

Зависимая операция допускается только при наличии текущего правила, точной ссылки на его версию, разрешения Scope и раскрытия в diff. Нельзя расширять write set под предлогом валидности. Замыкание зависимостей вычисляется до Approval; неизвестная зависимость или неограниченная цепочка блокирует Apply.

## 3. Проект моделей данных

TypeScript ниже — концептуальная запись, не новые runtime types. Ref/JsonData — проект внешних данных, не расширение Schema v3. Все поля без `?` обязательны; пустой список не подразумевает разрешения. Сериализованные proposals поступают как недоверенный JSON-текст, декодируются с лимитами и проверкой закрытой схемы. Произвольные JS-объекты/getters/Proxy не считаются безопасными; доверенный внутренний JsonData допускается только после границы T3. Ни функции, ни импорты, ни expressions не исполняются.

```ts
type Ref = { id: string; revision: string; digest: string };
type JsonData = null | boolean | number | string | JsonData[]
  | { [key: string]: JsonData };
type Locator = {
  elementId: string;
  expectedComponent: string;
  ancestors: { parentId: string; slot: string }[];
};
type OpKind = 'set-editor-property' | 'set-variant-property'
  | 'set-interaction-state' | 'insert-slot-child' | 'remove-slot-child';
type Permission = {
  permissionId: string;
  target: Locator;
  operation: OpKind;
  fieldOrSlot: string;
  slotLifecycle: null | {
    createIfAbsent: boolean;
    removeIfEmpty: boolean;
  }; // только для slot operations, только target + fieldOrSlot
  constraint: Ref; // закреплённый декларативный allowlist + limits
  origin: 'requested' | 'dependent';
  rule: Ref | null; // обязательно для dependent
};
interface ScopeSpec {
  formatVersion: 'scope-draft-1';
  scopeId: string;
  scopeDigest: string;
  document: {
    projectId: string | null; workId: string | null; documentId: string;
    baseRevision: string; contentDigest: string; rawDigest: string;
  };
  context: {
    documentBinding: Ref;
    librarySnapshots: Ref[];
    runtimeBindings: Ref[];
    mappings: Ref[]; capabilities: Ref[]; evidence: Ref[];
    policy: Ref;
  };
  selectedTargets: Locator[];
  permissions: Permission[];
  denies: { target: Locator | 'document' | 'context'; fields: string[] }[];
  dependencyRules: Ref[];
  maxOperations: number;
  issuedBy: string; issuedAt: string;
  intendedValidation: Ref; // operations/states/environment + required T3 gates
}
type ExpectedValue = { present: false }
  | { present: true; value: JsonData };
type PatchOperation = {
  operationId: string;
  permissionId: string;
  origin: 'requested' | 'dependent';
  dependsOn: string[];
  rule: Ref | null;
} & (
  | { kind: 'set-editor-property' | 'set-variant-property';
      target: Locator; property: string;
      expected: ExpectedValue; value: string | boolean }
  | { kind: 'set-interaction-state'; target: Locator; field: string;
      expected: ExpectedValue; value: JsonData }
  | { kind: 'insert-slot-child'; parent: Locator; slot: string;
      afterChildId: string | null; newElementId: string;
      childDefinition: Ref; initialProps: JsonData }
  | { kind: 'remove-slot-child'; parent: Locator; slot: string;
      child: Locator; expectedSubtreeDigest: string;
      emptySlotEffect: 'retain' | 'remove-optional-slot' }
);
interface PatchProposal {
  formatVersion: 'patch-draft-1';
  proposalId: string; proposalRevision: string; proposalDigest: string;
  scopeId: string; scopeDigest: string;
  baseRevision: string; baseContentDigest: string; contextDigest: string;
  userRequestRef: Ref;
  author: { kind: 'ai' | 'human'; id: string };
  operations: PatchOperation[];
  explanation: string;
}
```

`initialProps` — только разрешённые editorProps/variantProps для указанного child definition; вложенные slots/state добавляются отдельными операциями. Не payload replacement и не свободный объект компонента. `set-interaction-state` в текущем v3 означает только Select.selectedValue string|null: JsonData здесь не позволяет добавлять произвольные поля. TypeScript union — предварительный синтаксис, реальные допустимые поля/значения обязаны определяться контрактом и Scope; более точная модель discriminated types — открытое решение.

Новые ID резервируются доверенным builder до diff/Approval, проверяются на уникальность и повторно не генерируются при Apply. `afterChildId=null` означает начало слота; reorder существующих детей отдельной операцией не разрешён. Slot отсутствует — создание допустимо только при явном разрешении на его появление; удаление последнего ребёнка не означает автоматического удаления слота. present:false отличается от present:true/value:null. Числа в будущих библиотеках требуют согласованного расширения операции, не обхода v3.

### Уточнение типа TagGroup.amount

В текущей Schema v3 `TagGroup.variantProps.amount` имеет **строковый literal union `'1' | '2'`**, не number. Это подтверждено [components.sprint05.seed.json](../components.sprint05.seed.json) (`type: enum`, `values: ["1", "2"]`), [catalog.generated.ts](../src/design-system/catalog.generated.ts) и выводом enum-типа через `Value<P>` в [schema.ts](../src/design-system/schema.ts). Запись 1↔2 описывает количество детей; Patch передаёт `value: '2'` при `expected.value: '1'` без преобразования числового свойства в строку. Внутренний `Number(amount)` для подсчёта детей не меняет тип хранимого свойства. Значения `1`/`2` типа number недопустимы для этого prop.

Поэтому `value: string | boolean` для set-editor-property / set-variant-property сохраняется. Это верхняя граница модели операций, а не разрешение всех строк/boolean для каждого поля: точное значение проверяют Contract и Scope. Числовые свойства других библиотек не получают поддержку автоматически; расширение требует отдельного подтверждённого контракта и решения.

### Optional slot: создание, первый ребёнок и удаление последнего

`Permission.slotLifecycle` — новая **концептуальная** запись только внутри Scope; действующие API и v3 не меняются. Для property/state операций она равна null. Для slot operations оба флага должны быть заданы явно; отсутствие разрешения или false означает запрет соответствующего структурного эффекта. Флаги ограничены одним `target` parent и одним `fieldOrSlot`, не другими слотами.

- **Создание отсутствующего optional slot:** insert-slot-child требует обычного разрешения вставить указанного ребёнка и `slotLifecycle.createIfAbsent=true` для этого же parent/slot. Slot должен быть разрешён действующим контрактом; результат обязан соблюдать cardinality и composition/Renderer gates. Если `slots` отсутствует целиком, это разрешение включает только минимальную оболочку `slots` с этим слотом. Добавление других slot keys не разрешается. Если slot уже существует, createIfAbsent не расширяет права на его содержимое.
- **ScopeDiff:** отдельно показывает появление `slots` (если его не было), переход конкретного slot из absent в массив и вставку первого ребёнка с ID, полной структурой и before/after. Структурные записи связаны с той же insert operation и её Permission, но не скрываются за строкой «добавлен ребёнок». Проверяются отсутствие изменений других слотов и сохранность их детей. При min>1 одного ребёнка недостаточно: нужны все явно разрешённые вставки в одном атомарном candidate либо BLOCK.
- **Удаление последнего ребёнка:** remove-slot-child явно задаёт `emptySlotEffect`. Значение retain оставляет пустой массив только если контракт допускает count=0; иначе BLOCK. В текущих WDeaf slots min=1, поэтому пустой слот не проходит проверку. Удаление optional slot целиком возможно только при `emptySlotEffect='remove-optional-slot'`, отдельном явном `slotLifecycle.removeIfEmpty=true` для того же parent/slot и допустимости отсутствия слота по контракту. Если условие не выполнено, предложение блокируется, а не исправляется автоматически.
- **При удалении slot:** ScopeDiff отдельно показывает удаление всего ребёнка и самого ключа slot. Пустая оболочка `slots: {}` сохраняется; это разрешение не даёт права удалять соседние slots или менять другие поля. Required slot удалить нельзя. Generated fallback владельца при исчезновении optional slot должен быть раскрыт как derived impact и пройти capability/Scope-проверки: удаление сохранённого ребёнка не обещает исчезновения его визуального аналога.

Разрешение добавить или удалить ребёнка само по себе не разрешает создать/удалить slot. Ни флаги lifecycle, ни пользовательское согласие не обходят deny, contract, parent constraints и проверку полного candidate. До Approval все эффекты, включая появление оболочки slots, должны входить в точный diff и разрешённый write set.

Изменение композиции — именованная группа перечисленных leaf/slot operations с dependency rules. Операции `replace-document`, `replace-subtree`, `replace-component`, arbitrary JSON Patch, произвольный path и неявная миграция не поддерживаются. Root add/remove в этой версии проекта также не разрешены; для существующей root Button можно менять только разрешённые свойства. Пересекающиеся записи в одно поле, циклы зависимостей, операции над удаляемым ребёнком и неразрешённые ID блокируются вместо last-write-wins.

## 4. ScopeDiff и доказательство неизменности

ScopeDiff строит доверенная логика по base и полному candidate, а не ИИ по собственному списку «что изменено». Требуемые поля представления:

```ts
interface ScopeDiff {
  diffVersion: 'diff-draft-1'; diffDigest: string;
  scopeDigest: string; proposalDigest: string;
  baseContentDigest: string; candidateContentDigest: string;
  baseContextDigest: string; candidateContextDigest: string;
  changes: {
    pointerBefore: string | null; pointerAfter: string | null;
    elementId: string; field: string;
    before: ExpectedValue; after: ExpectedValue;
    origin: 'requested' | 'dependent' | 'unexplained';
    operationIds: string[]; permissionId: string | null; rule: Ref | null;
  }[];
  generatedImpact: { owner: Locator; rule: Ref; reason: string }[];
  unchanged: { area: string; beforeDigest: string; afterDigest: string }[];
  outsideScope: string[];
  blockers: string[];
}
```

Алгоритм:

1. Сохранить exact raw base отдельно; проверить digest, decode и уникальность IDs. Для повреждённого/неоднозначного исходника — диагностический diff невозможен либо неполон, Apply BLOCK, raw доступен.
2. Построить candidate на изолированной копии base, без изменения UI-документа и storage. Проверить precondition каждой операции (включая before value/slot children), топологический порядок зависимостей и пределы. Builder не вызывает текущий syncComposition вслепую.
3. Сравнить всё дерево, включая неизвестные/неразрешённые поля, порядок arrays, IDs, component, props, interactionState, slots, tokenReferences и themeOverrides. Нельзя удалить неизвестное ради успешной проверки. Bindings сравнить отдельно как внешний контекст. Сортировка object keys для canonical digest допустима; arrays, строки, null/absence не нормализуются и не подменяются defaults.
4. Stable ID помогает сопоставлению, но raw structural comparison не скрывает замену ID или delete+insert. Изменение array indices после разрешённого удаления показывается как структурное последствие; порядок/содержимое выживших элементов обязаны сохраняться. Hash unchanged subtrees — дополнительная проверка, не замена полного diff.
5. Каждую фактическую запись сопоставить с одной или явной группой разрешённых операций. Необъяснённая, скрытая или вне Scope запись → BLOCK, даже при валидном candidate. Deny побеждает allow. Изменение tokenReferences/bindings/ID без операции запрещено.
6. Раскрыть прямые изменения и каждое необходимое dependent изменение с before/after, owner, причиной и rule revision. Generated impact показать отдельно от сохранённых данных; появление/исчезновение generated parts не выдавать за записанный слот.
7. Показать неизменённые области и проверенные digests, полный раскрываемый список изменений и все blockers. Summary не может скрыть удалённые поддеревья. Большой/truncated diff не получает финального Approval, пока полный diff недоступен.

Одинаковые закреплённые входы дают одинаковый candidate/diff/digest. Время и автор аудита не включаются в семантический diff; случайные IDs после Approval запрещены. Canonicalization, сохранение raw whitespace/числового представления и алгоритм digest требуют согласования; до реализации нельзя обещать побайтовый identity пересериализованного candidate. Оригинальные bytes сохраняются независимо. Diff не имеет эффекта исполнения и не применяет альтернативы автоматически.

## 5. Композиции и зависимости WDeaf

Основание текущих правил: [composition.rules.json](../design-system/composition.rules.json), [Validator](../src/design-system/validator.ts), [syncComposition](../src/canvas/composition.ts), [Renderer library](../src/renderer/library.tsx), [prepareRender](../src/renderer/prepare.ts), [Schema v3](../src/design-system/schema.ts). Код проверен на feature `1986326c713c87c2f360e0b66656d11518721284`, tree baseline `767236ce7334037ae9d4b05dcb372e572250fb87` (см. T4). Source rules не становятся разрешением писать во весь экран.

| Область | Прямое изменение | Необходимые зависимости и Scope | Отказ / ограничения |
| --- | --- | --- | --- |
| TagGroup 1→2 | amount и добавление TagItem | Явный новый ID/позиция/content; m/primary, default или disabled по родителю, согласованный closable; обе записи разрешены | Нет 0/>2, TagInput slot; текст нового тега не выдумывается как зависимое значение |
| TagGroup 2→1 | amount и удаление конкретного TagItem | Указать удаляемый ID, весь subtree до удаления и digest; сохранить ID/content оставшегося | Нельзя выбрать удаляемого ребёнка автоматически по «последний» без Scope; min=1 |
| TagGroup disabled/closable | Изменение разрешённого parent prop | Соответствующие child state/closable по действующим правилам, только перечисленные дети; generated TagMore impact | Если дети вне write set, BLOCK; структурное требование не расширяет Scope |
| Select optionsText | Разрешённое editor property | Если выбранный текст остаётся — selectedValue неизменен. Если исчезает — требуется отдельное явное разрешение на selectedValue=null либо выбранное допустимое значение | Validator сейчас отклоняет dangling selection; правило автоматического сброса не реализовано. Не выбирать первый option автоматически |
| Select.selectedValue | Установленный string или null | Только Select, допустимые options, раскрыть появление interactionState при его отсутствии | Не выбирать по неоднозначному duplicate label как по стабильному ID; если намерение неоднозначно, BLOCK |
| Input + Hint/Label | Текст/разрешённый variant либо добавление/удаление конкретного slot child | Hint/Label по 1, ограничения parent l/default/placeholder=false для Renderer; slot presence фиксируется | Не менять parent автоматически ради поддержки; local input value не представлен сохраняемым state в v3 |
| DropdownMenu / ItemsList | Child row, amount/size | Menu.items→1 ItemsList; list.items→1–10 rows, count=amount и size согласован; точный diff всех детей | Не заменять весь list для изменения текста одного item; отдельный menu action controller отсутствует |
| Internal/generated | Изменение допустимого владельца | Generated TagMore/Select menu — derived impact и capability closure, не прямой JSON target | TagInput/TagMore root и JSON slots запрещены; generated IDs не редактировать |

Существующий syncComposition может менять число детей и синхронизировать свойства. T5 не объявляет его безопасным Scope executor: список фактических изменений всё равно должен быть раскрыт и проверен. Неявное создание детей Renderer при отсутствующих slots также не разрешает незаметно материализовать их в документе. Для редактирования такого ребёнка требуется отдельное разрешение на сохранённую композицию; если правил/данных недостаточно — BLOCK.

Токены и bindings остаются неизменны. Если добавляемый child требует нового dependency manifest, не расширять tokenReferences молча: текущий T5 Scope не разрешает такую операцию. Checkbox/Chip операции должны учитывать известный key/focus риск; наличие primitive или screenshot не даёт CR3 для keyboard behavior (T4).

## 6. Preview → Validation → Approval → Apply

1. **Resolve:** зафиксировать Document/base/context и пользовательский Scope. Missing binding, непроверенная версия, ambiguity → предложение можно описать, но исполняемый Apply блокируется. Defaults Project и имена компонентов не заменяют resolution.
2. **Propose:** ИИ выдаёт только данные операций. Проверить доверенную границу, закрытые поля, лимиты, ID, permissions, expected values. Неподтверждённая замена компонента становится отклонённым предложением, не fallback.
3. **Build/Diff:** создать полный candidate и полный ScopeDiff в памяти, без изменения рабочего документа. Изменения вне Scope блокируют дальнейший Apply. Неизменность соседей проверяется даже если пользователь видит только выбранный элемент.
4. **Validate:** проверить весь candidate доступным WDeaf Validator, требуемые Renderer capabilities и dependency closure. При будущем source-neutral исполнении — все обязательные этапы T3, T2 policy, pinning и CR/evidence для запрошенных операций. Структурная проверка полного экрана не ограничивается выбранным subtree. Несвязанные исходные ошибки не удаляются и не игнорируются: могут блокировать strict результат.
5. **Review:** показать diff и независимые validation outcomes. Только при отсутствии обязательных FAIL/UNKNOWN можно запросить финальное Apply Approval. INSPECTION_ONLY не разрешает Apply. Подтверждение «намерения» при blocker может сохраняться как комментарий, но не как исполнимое approval.
6. **Approve:** явное согласие на tuple documentId/baseRevision/baseDigest/contextDigest/scopeDigest/proposalDigest/candidateDigest/diffDigest/policy/validation evidence. Approval включает пользователя, время, тип решения и область. Любое изменение tuple требует нового diff, validation и согласия. Разрешение подготовить Patch не равно Apply.
7. **Preflight:** непосредственно перед записью перечитать текущую ревизию и context, проверить актуальность trust/evidence и approval, отсутствие отмены и уже выполненного proposal. При изменении документа даже вне Scope — stale, без автоматического rebase.
8. **Commit:** под одним транзакционным условием compare-and-swap зафиксировать новую ревизию Document, сохранённый оригинал, receipt/idempotency и обязательный audit. До успешного commit UI не публикует новый рабочий документ. Если атомарность гарантировать нельзя — Apply BLOCK; read-check-then-write в localStorage не достаточен.
9. **Result:** вернуть applied revision/digest и receipt либо доказанный отказ без изменения документа. Неоднозначный ответ storage → состояние UNKNOWN, сначала сверка durable receipt и текущей ревизии, не слепой retry.

T3 пока не содержит action='apply-patch'. T5 не изменяет принятый API: проектируется внешний Apply coordinator, использующий Scope gate и результаты обязательных проверок Facade. Нельзя переименовать INSPECTION_ONLY в Apply permission; согласование точного Apply validation profile и его связи с actions T3 — открытый блокер реализации. Для строгого назначения требуется CR3 точной области. Будущий gate не подменяется текущим valid:true и не внедряется сейчас в работающий Builder.

При отсутствии Facade, pinned bindings/readiness infrastructure, approval store и транзакционного coordinator часть локальных checks возможна, но итог **Apply BLOCK / infrastructure missing**, а не фиктивный успех. CR2 executable Preview остаётся заблокирован по T2; текстовый ScopeDiff может существовать независимо от него.

## 7. Пример полного процесса: текст одной кнопки

Исходный пример — Button m/primary/accent/default с editorProps.label='Продолжить' по [seed](../components.seed.json) и [Renderer subset](../src/renderer/prepare.ts). Идентификатор `button-1`, ревизия `r42`, digests `D0/C0` ниже — условные обозначения, не реальные записи storage и не подтверждённые bindings.

1. Пользователь просит заменить подпись выбранной button-1 на «Сохранить». Scope фиксирует один Document/r42/D0/C0, locator root/button-1 и ровно editorProps.label set. Component/variant/ID/position/другие элементы/tokens/bindings запрещены.
2. Proposal P1 содержит одну set-editor-property операцию с expected='Продолжить', value='Сохранить'. ИИ не назначает action кнопке и не меняет variant.
3. Builder строит candidate D1. Diff: `/elements/0/editorProps/label`, «Продолжить» → «Сохранить», requested. Все прочие свойства/элементы и context C0 unchanged; dependent changes отсутствуют. Индекс 0 лишь иллюстрация положения проверенного ID, не средство выбора.
4. WDeaf structural и Renderer subset checks могут быть выполнены существующими функциями. В этом документе они не запускались. Для будущего strict Apply нужны реальные закрепления и CR evidence. В текущей инфраструктуре отсутствующие условия дают UNKNOWN/BLOCK; реального Apply здесь нет.
5. **Условная будущая ветка:** только после реализации всех gates и PASS пользователь утверждает точный P1/D1/diff/base tuple. Coordinator в транзакции проверяет r42/C0, сохраняет raw r42 и создаёт r43/D1 + receipt. При r43, появившемся параллельно до commit, возвращает stale и не пишет. Это требование проекта, не описание уже работающей функции.

## 8. Конкурентность, атомарность, история и восстановление

| Ситуация | Требование |
| --- | --- |
| Отмена до commit | Proposal становится cancelled, Apply запрещён, рабочий документ неизменен. Отмена и commit должны иметь однозначный порядок в транзакции |
| Отмена после commit | Нельзя сообщить «ничего не изменилось». Показать receipt и предложить отдельный undo, не выполнять его молча |
| Параллельная правка | Compare-and-swap на полной revision + context. Никакого last-write-wins/авто-rebase даже для разных элементов; новый proposal/base/approval |
| Повторный Apply | Ключ documentId + proposalId + proposalRevision/digest. Уже applied — вернуть тот же receipt без повторной записи. Тот же ID с другим digest — конфликт |
| Rollback/undo | Новая ревизия с сохранением истории, не переписывание прошлой. Для немедленного undo нужны сохранённые before и актуальный base; при более поздних изменениях — конфликт и отдельный diff/approval. Не удалять чужие изменения |
| Исторический невалидный raw | Всегда доступен как архив/экспорт для восстановления. Восстановление исполняемого документа снова проходит gates; недоступный/отозванный binding не обходится rollback |
| Ошибка backup/audit/storage | Не публиковать candidate как сохранённый. Обязательные backup + документ + receipt/audit должны быть транзакционно согласованы; ошибка до commit оставляет старую ревизию |
| Crash/неизвестный результат | Проверить durable transaction receipt; до разрешения UNKNOWN не выполнять новый Apply. Read-after-write без согласованного recovery протокола не доказывает атомарность |

Audit хранит исходный запрос/его ссылку, actor (ИИ предлагает, человек разрешает), Scope, точные diff/refs/digests, validation outcomes, approval/cancel, expected/committed revisions, receipt и причины отказа. Review/evidence не создаются текстом ИИ. Содержимое может включать пользовательские данные: общие логи не содержат raw/секреты; полные before/after хранятся в защищённой истории с определёнными правами/retention. Digest не заменяет raw backup. Доверие и подлинность approval требуют отдельного дизайна, не поля approved:true от клиента.

Существующий [storage](../src/storage/index.ts) сохраняет локальные документы и append-only rejected backups, но не реализует транзакцию Document+binding+approval+receipt или межвкладочный CAS. [Recovery tests](../tests/recovery.test.ts) не доказывают новый протокол. В T5 не предлагается менять Workspace или выбирать backend без отдельного решения. Надёжный механизм транзакций, backup durability, idempotency и журнала — блокер будущего Apply.

## 9. Проверочные сценарии

Тест-план, не результаты запуска. «Сейчас» — доступные backend проверки существующего кода вне Scope механизма; Facade/Scope/Apply ещё не реализованы.

| Сценарий | Ожидаемый результат проекта | Что можно проверить сейчас / что требует реализации |
| --- | --- | --- |
| Текст одной Button | Ровно label diff; условный Apply после всех gates/approval | Текст/структура и renderer subset сейчас; Scope/CAS/approval будущие |
| Один допустимый variant | Только разрешённое поле и раскрытые dependencies; весь candidate валиден | validateComponent/prepareRender сейчас; exact permissions будущие |
| TagGroup 1→2 / 2→1 | amount + конкретный child, без потери оставшегося content; явные права на все записи | composition и round-trip tests существуют; Scope/atomic Apply будущие |
| Соседний элемент изменён | OUTSIDE_SCOPE, BLOCK даже при valid:true | Нужен независимый полный diff и Scope gate |
| Неподтверждённый аналог компонента | Замена identity не поддержана, BLOCK | Неизвестный component отклоняет Validator; аналог с допустимым ID тоже должен блокировать Scope |
| Документ изменён после diff | STALE_BASE, без записи и без auto-rebase | Нужны revision/CAS и повторный approval |
| Невалидный variant | Native diagnostic + BLOCK; исходник неизменен | Текущий Validator/matrix |
| Binding потерян/заменён | UNKNOWN/FAIL context, Apply BLOCK | Будущие resolver и T3; не выбирать latest |
| Два одинаковых ID / ambiguous target | BLOCK до candidate, не выбирать первый | Duplicate IDs в Validator; target resolver будущий |
| Скрыто удалён ребёнок | Unexplained diff → BLOCK, показать полное удаление | Текущая композиционная проверка может не обнаружить нарушение намерения; нужен ScopeDiff |
| Повторный Apply / потерян ответ | Тот же receipt, без второй мутации; иной digest конфликт | Будущий idempotency store и transaction |
| Ошибка записи / quota / crash | Старый документ либо доказанный committed receipt; не частичная публикация | Старые backup error tests сейчас; новый атомарный протокол будущий |
| Пользователь отменил | Нет записи; поздняя отмена → отдельный undo | Будущая state machine approval/cancel |
| Select options исключили selectedValue | BLOCK без отдельного разрешённого reset/reselection | SELECT_VALUE сейчас; dependency Scope будущий |
| Input слот требует изменения parent | BLOCK если parent prop вне Scope | prepareRender ограничения сейчас; Scope closure будущий |
| TagInput/TagMore как прямой target | BLOCK; не материализовать generated parts | Internal-root/slot tests сейчас; generated locator guard будущий |
| Смена tokenReferences/bindings/ID | Полный diff фиксирует; BLOCK в текущем наборе операций | Validator может принять часть таких изменений — нужен независимый Scope gate |
| CR2/неподтверждённый Checkbox focus | Strict gate BLOCK, неисполняемый diff доступен | Долг зафиксирован T4; будущий CR/evidence gate |
| Proxy/getter объект вместо JSON-текста | Не принимается недоверенным входным каналом | Требуется реализованная граница T3, не обещание по типу unknown |
| Пустой/no-op patch | Показать отсутствие изменений; не создавать фиктивный commit/receipt изменения | Требует отдельного no-op результата coordinator |

Дополнительные критерии будущих тестов: детерминированность candidate/diff, отсутствие мутаций, различение missing/null, отсутствие скрытого reorder, deny precedence, вложенные и generated зависимости, циклы/перекрытия операций, limits, invalid source сохранён byte-for-byte, atomic cancellation race. Evidence должно закрепляться на точных версиях/средах, не по одному общему PASS.

## 10. Диагностика, риски и открытые решения

Предлагаемые коды T5 (не runtime API): SCOPE_AMBIGUOUS_TARGET, SCOPE_OUTSIDE, SCOPE_DENIED, PATCH_PRECONDITION, PATCH_UNSUPPORTED_OPERATION, PATCH_DEPENDENCY_UNRESOLVED, PATCH_UNEXPLAINED_DIFF, PATCH_STALE_BASE, PATCH_APPROVAL_MISMATCH, PATCH_ALREADY_APPLIED, PATCH_IDENTITY_CONFLICT, PATCH_STORAGE_FAILURE, PATCH_COMMIT_UNKNOWN, PATCH_INFRASTRUCTURE_MISSING. Native Validator codes и T2 UNSUPPORTED_* сохраняются с producer/path/reason. Точный словарь, severity и формат ответов требуют согласования; PATCH_ALREADY_APPLIED с тем же receipt — идемпотентный ответ, не новая ошибка документа.

Открытые блокеры реализации:

1. Формат и доверенная выдача Scope, approval identity/authenticity, отзыв и срок действия согласия; правила доступа к audit/raw.
2. Canonicalization/digest, версии proposals/constraints, точный immutable context manifest и external Document bindings. Нет гарантии arbitrary JS safety или universal source-neutral исполнения.
3. Apply validation profile: какой action/scope/operations/environment передаётся T3 и какие checks обязательны; отсутствующая инфраструктура не может быть N/A ради успеха.
4. Транзакции/CAS/idempotency/crash recovery для Document+backup+receipt+обязательного audit, без изменения Workspace в этой задаче.
5. Версионированное dependency closure с generated parts и точные правила разрешённых field writes. Поведение syncComposition само по себе не является пользовательским разрешением.
6. UX полного diff и отказа, выбор удаляемого child, duplicate options Select, допустимость no-op и undo более поздних ревизий. Текстовый diff не разрешает CR2 execution.
7. Readiness/evidence для операций, включая Checkbox/Chip focus; полнота source properties и контрактов остаётся ограниченной T4. CR-статусы задним числом не присваиваются.

## 11. Критерии завершения T5

Владелец согласовал границы одного Document/base/context, закрытые операции, различие write set и validation closure, независимый полный ScopeDiff, правила зависимостей, exact human approval, повторный preflight, атомарность/конфликты/idempotency, историю/undo и таблицу сценариев. Все недостающие реализации обозначены блокерами, а не успешными checks.

T5 завершён на уровне архитектурного проектирования решением владельца от 04.11.2026. Принятие не разрешает реализацию, экспериментальный Preview, изменение v3, T6–T7 или новые интеграции. Текущие функции Builder не меняются.

## 12. Зафиксированные версии архитектурной основы

Контрольные суммы локальных утверждённых документов на момент подготовки T5:

| Документ | SHA-256 |
| --- | --- |
| [ADR-001-source-neutral-design-system-contract.md](ADR-001-source-neutral-design-system-contract.md) | `12d666bf5c2a08e222950c0ee8614825420a13be1b3d4cb62a7c89243bcb8651` |
| [T2-unsupported-policy.md](T2-unsupported-policy.md) | `a5c0d3304ce31775150a79da4c2bbe3391b2dae9bf493daafdf6681a3d5b4c10` |
| [T3-validator-facade.md](T3-validator-facade.md) | `698fe47720335167ea891575ec56debc6b78e6092cdc49324e6cf22481e9457e` |
| [T4-coverage-inventory-metrics.md](T4-coverage-inventory-metrics.md) | `3f077358e825be7d3da0ff301a7bfac9f2457580130699c0c932dd6139501d26` |

Итог: **T5 ACCEPTED от 04.11.2026**. Создан только этот документ. Код, T1–T4 и исходные данные не изменяются; Git-запись, T6–T7 и исполнение Preview не выполняются.

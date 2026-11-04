# T6 — Score-only Pilot Harness

Статус: **T6 ACCEPTED**. Дата утверждения: **04.11.2026**. Решение владельца: **APPROVE**. T6 завершён только на уровне архитектурного проектирования. Фактический статус выполнения: **NOT RUN**.

## 1. Основа и статус работы

Обязательная основа: [ADR-001](ADR-001-source-neutral-design-system-contract.md), [T2](T2-unsupported-policy.md), [T3](T3-validator-facade.md), [T4](T4-coverage-inventory-metrics.md), [T5](T5-scopepatch-scopediff.md), ACCEPTED 04.11.2026. Delivery Baseline: merge `9fb1399719b8f2e02a105844943e10b8e373c253`, проверенный feature `1986326c713c87c2f360e0b66656d11518721284`, одинаковое дерево `767236ce7334037ae9d4b05dcb372e572250fb87`, как зафиксировано в T4. Репозиторий и документы не изменяются, кроме создания T6.

Это проект измерительного контура. **Пилот не проведён, проверки harness не реализованы, score results отсутствуют, статус выполнения NOT RUN.** Существующие тесты и CI не запускались повторно. Нет генераций, вызовов моделей, Apply, rollback, публикации или экспериментального CR2 Preview. T6 не присваивает CR3 и не разрешает T7.

Прочитан локальный Research Registry «ЗАРЯ» v0.3.3 DRAFT.pdf, 8 страниц, дата 03.11.2026; точный digest в §12. Это доступный исследовательский материал, но не утверждённый полный протокол. Файл не изменён. Соотношение с E1/E2 и ограничения его статуса — §10.

## 2. Три отдельные сущности и архитектура

1. **Сценарий (PilotCase):** зафиксированная задача, base fixture, Scope, допустимые исходы, эталонные ограничения и критерии. Создаётся и проверяется до оценки результата; не подгоняется под ответ ИИ.
2. **Проверяемый результат (PilotArtifact):** неизменяемые bytes ответа/предложения/кандидата и заявленного diff/diagnostics. Может быть ошибочным, неполным, текстовым отказом или невалидным JSON. Artifact не объявляется валидным Screen Schema по типу файла.
3. **Оценка (ScoreResult) и доказательства (EvidenceRecord):** независимые результаты checks, ссылки на факты, условия неизвестности и экспертные оценки. Ни красивый отчёт, ни самоописание модели не являются oracle.

```text
Frozen case/fixture + pinned evaluation context       Immutable result artifact
                     |                                          |
                     +------------- Read-only ingestion --------+
                                           |
                          integrity / trusted JSON decoding
                                           |
                    independent candidate / diff inspection
                                           |
                deterministic checks + available Validator backend
                                           |
             per-criterion outcomes / evidence ledger / unknown reasons
                                           |
           separately attributed expert review (if explicitly authorized)
                                           |
                       PilotReport (score-only artifact)
```

Контур не подключается к рабочему ProjectRepository и не получает write handles к документам. Декодированные fixtures/result используются в отдельной памяти; base bytes остаются immutable. Если результат — PatchProposal, возможное будущее построение candidate происходит только на копии по T5, без Apply. Пока builder отсутствует, соответствующие checks UNKNOWN, а не «смоделированный PASS». Простая проверка предоставленного candidate не доказывает корректность алгоритма построения patch.

Score-only допускает будущую запись **новых отчётов/evidence** в изолированное run storage; это не мутация рабочего документа. Политика путей, доступа и append-only сохранения ещё не реализована. Ни output artifact, ни пояснение ИИ не являются инструкциями запускать команды, imports, remote assets или код. Недоверенный ввод — JSON-текст с лимитами, не произвольные JS-объекты/Proxy/getters (T3). Визуальные evidence можно читать как заранее разрешённые артефакты; новый render/browser execution требует отдельного разрешения и применимых T2 gates.

## 3. Концептуальные типы данных

Это проект внешнего API harness, не изменение runtime TypeScript, Schema v3 или T3. Все ссылки фиксируют immutable bytes; ожидаемый и наблюдаемый результат разделены. Значения null означают явное отсутствие, не успешную проверку.

```ts
type Ref = { id: string; revision: string; digest: string };
type Outcome = 'PASS' | 'FAIL' | 'UNKNOWN' | 'NOT_APPLICABLE';
type CriterionId = 'component-choice' | 'scope-compliance'
  | 'outside-scope' | 'structure' | 'renderer-capability'
  | 'diff-quality' | 'source-preservation' | 'diagnostic-completeness'
  | 'evidence-availability';
interface PilotCase {
  schemaVersion: 'pilot-case-draft-1';
  case: Ref;
  request: Ref;
  baseFixture: Ref;
  scopeSpec: Ref | null;
  contextManifest: Ref; // артефакты baseline, contract, runtime и их availability
  oracle: Ref; // разрешённые identities/tuples/изменения/исходы, не ответ модели
  criteria: { id: CriterionId; required: boolean; rubric: Ref;
    expectedSystemOutcome: 'accept' | 'reject' | 'inspect-only' }[];
  researchLink: { experiment: 'E1' | 'E2'; protocol: Ref | null }[];
  dataPermission: Ref;
}
interface PilotArtifact {
  artifact: Ref;
  caseRef: Ref;
  kind: 'candidate-document' | 'patch-proposal' | 'refusal' | 'malformed';
  rawOutput: Ref;
  claimedDiff: Ref | null;
  claimedDiagnostics: Ref | null;
  generation: {
    origin: 'synthetic-fixture' | 'recorded-model-output' | 'human';
    modelVersion: string | null;
    promptAndParameters: Ref | null;
    attemptId: string;
  };
}
interface EvidenceRecord {
  evidence: Ref;
  caseRef: Ref; artifactRef: Ref;
  claim: string;
  producer: { kind: 'deterministic-check' | 'existing-test'
    | 'expert-review' | 'source-capture'; id: string; version: string };
  method: Ref;
  inputs: Ref[];
  outputArtifact: Ref | null;
  environment: Ref;
  observedAt: string | null;
  availability: 'available' | 'missing' | 'unreadable' | 'integrity-mismatch';
  provenance: Ref;
  limitations: string[];
}
interface ScoreResult {
  scoreVersion: 'score-draft-1';
  caseRef: Ref; artifactRef: Ref;
  evaluator: Ref; environment: Ref; runId: string;
  execution: 'NOT_RUN' | 'COMPLETED' | 'PARTIAL' | 'STOPPED' | 'INVALID';
  checks: {
    id: CriterionId; checkId: string; method: 'automatic' | 'expert';
    observedSystemOutcome: string | null;
    outcome: Outcome; reason: string;
    evidenceRefs: Ref[];
    unknownReason: string | null;
    nativeDiagnostics: Ref | null;
  }[];
  expertReviews: { reviewerId: string; reviewType: 'self-review' | 'independent';
    rubric: Ref; observations: Ref; disagreements: Ref | null }[];
  safetyAssessment: 'VIOLATION_OBSERVED' | 'NO_VIOLATION_IN_CHECKED_SCOPE'
    | 'UNDETERMINED';
}
interface PilotReport {
  report: Ref;
  runManifest: Ref;
  cases: Ref[]; artifacts: Ref[]; scores: Ref[]; evidence: Ref[];
  execution: 'NOT_RUN' | 'COMPLETED' | 'PARTIAL' | 'STOPPED' | 'INVALID';
  counts: { criterion: CriterionId; planned: number; pass: number;
    fail: number; unknown: number; notApplicable: number }[];
  exclusions: { caseRef: Ref; reason: string }[];
  researchOutcome: 'NOT_ASSIGNED';
  limitations: string[]; blockers: string[];
}
```

`observedSystemOutcome` отделён от `outcome`: корректный отказ неизвестному компоненту может дать PASS проверке детектора, но не сделать candidate валидным. Чтобы не смешивать результаты, case oracle фиксирует отдельно истинность свойства candidate (например structure=invalid), ожидаемую реакцию backend (reject) и оцениваемую задачу. Отчёт показывает все три, а не одну зелёную отметку. Для негативного ввода отсутствие успешного рендера ожидаемо, но само по себе не доказывает корректную диагностику.

`contextManifest` способен описать недоступные binding/CR записи; он не создаёт их существование. Представление availability следует принципу T3. Evidence с missing bytes/digest mismatch не может подтверждать PASS. Digest показывает целостность, не достоверность утверждения. Версии схем, manifests и score records — предложенные, не принятые API.

## 4. Scoring methodology

В T6 нет одного балла, весов и итогового процента «качества AI». Для каждого критерия — PASS/FAIL/UNKNOWN/NOT_APPLICABLE и scope evidence. Один PASS структуры не компенсирует изменение вне Scope; один красивый screenshot не компенсирует invalid document.

| Критерий | Детерминированная проверка / oracle | Экспертная часть и границы |
| --- | --- | --- |
| Точность выбора компонента | Identity/variant tuple входит в заранее подтверждённый набор допустимых решений; для unsupported — ожидаемая явная диагностика/отказ | Семантическая уместность относительно неоднозначного запроса требует UX review. Несколько допустимых решений не сводятся к exact-match одной строки |
| Соблюдение Scope | Каждая operation разрешена Scope, preconditions/denies/dependencies соблюдены | Обоснованность первоначальной постановки Scope отдельно; эксперт не разрешает задним числом нарушение |
| Отсутствие изменений вне Scope | Независимый полный base↔candidate diff, включая ID/order/slots/state/tokens/context | Визуальные последствия вне структурного write set оцениваются отдельно, без заявления нулевых визуальных изменений по JSON |
| Структурная допустимость | Current Validator по явному профилю; ошибки и mode сохранены | Не доказывает UX, runtime, источник или CR3 |
| Renderer Capability | prepareRender для текущего WDeaf subset; будущие exact mapping/capability checks отдельно | Наличие DOM/картинки не доказывает все состояния/операции; внешний binding сейчас не подтверждён |
| Качество ScopeDiff | Соответствие заявленного diff независимому полному diff, before/after, requested/dependent, отсутствие скрытых удалений | Понятность объяснения и нагрузки на пользователя — экспертный review по отдельной рубрике |
| Сохранность исходника | Exact raw digest до/после, отсутствие write capability к рабочему storage, фиксация immutable source | Не доказывает Apply/rollback/undo durability; они не выполняются |
| Полнота диагностики | Сопоставление с независимо размеченным набором ошибок/областей; native codes + причины + пути | Понятность и полезность альтернатив отдельно. Не считать неизвестные downstream проверки обнаруженными дефектами |
| Доступность evidence | Проверка refs/digests, версии, run/environment, доступность bytes, scope утверждения | Достаточность evidence и доверие источнику могут требовать review; ссылка «latest CI» недостаточна |

Предлагаемая арифметика (не исследовательские пороги): отдельно для каждого критерия публиковать planned, PASS, FAIL, UNKNOWN, N/A. Оценённый знаменатель = PASS+FAIL; applicability denominator = PASS+FAIL+UNKNOWN; N/A допускается только с заранее обоснованной неприменимостью, а не из-за отсутствия инструмента. Если показывается доля PASS/(PASS+FAIL), рядом обязательны UNKNOWN и число оценённых; нулевой знаменатель даёт «не определено», не 100%. Нет объединения разных критериев или source/render/interaction coverage T4 в один score.

Для диагностики можно предложить precision/recall только после утверждения defect oracle, правила дедупликации и сопоставления code/path. TP/FP/FN считаются по ошибкам в определённой области, не по строкам текста. Неизвестная полнота oracle → UNKNOWN метрики. Пороги успеха E1/E2, статистические выводы, размер выборки и количество повторов здесь не назначаются.

Любое наблюдённое изменение рабочего документа или нарушение score-only boundary — VIOLATION_OBSERVED с остановкой дальнейшего выполнения. NO_VIOLATION_IN_CHECKED_SCOPE означает только отсутствие нарушения среди фактически выполненных checks. При NOT_RUN или пропусках обязательных safety checks — UNDETERMINED. Даже все PASS не означают GO исследования, CR3 или разрешение Apply.

## 5. Набор сценариев для согласования

Это **предлагаемая библиотека test cases, не утверждённая выборка E1 и не проведённый пилот**. Все positive сценарии ограничены subset T4. «Ожидается» — oracle предложения, не фактический результат.

| ID / компонент | Положительный результат для оценки | Отрицательный результат для оценки | Evidence / предел |
| --- | --- | --- | --- |
| BTN-01 Button | m/primary/accent/default: только editorProps.label в разрешённом Scope | Соседний элемент или variant изменён без права; неподдержанный size=xl | [seed](../components.seed.json), [prepareRender](../src/renderer/prepare.ts), [renderer tests](../tests/renderer.test.ts); Scope checks будущие |
| INP-01 Input | l/default/placeholder=false, разрешённая правка editorProps.label или текста существующего Hint | slots при неподдержанной parent-комбинации; попытка записать local input value как новый v3 state | [Schema](../src/design-system/schema.ts), [DSRenderer](../src/renderer/DSRenderer.tsx), [library tests](../tests/library.test.ts) |
| INP-02 Optional slot | Явно разрешены создание Input.hint и первый Hint с точным ID, diff раскрывает обе записи | Есть только child insertion permission, отсутствует slotLifecycle.createIfAbsent; изменён Label | T5 optional slot policy; проверки permissions ещё не реализованы |
| SEL-01 Select | Один из 8 rows [matrix](../design-system/library-matrix.json), optionsText содержит выбранный текст, selectedValue сохраняется в candidate | optionsText исключает selectedValue без разрешённого reset; default/up неподдержан | [Validator](../src/design-system/validator.ts), library tests; no search/multiselect |
| SEL-02 Select ambiguity | При запросе различить одинаковые labels — явная диагностика неоднозначности | Модель выдумывает стабильный option ID или молча выбирает первый | selectedValue — текст; intent oracle требует независимой разметки |
| TAG-01 TagGroup | amount '1'→'2', m, новый разрешённый TagItem, согласованные state/closable; полный diff | amount=2 как number; amount='3'; скрытое удаление/переписывание другого ребёнка | [composition rules](../design-system/composition.rules.json), [syncComposition](../src/canvas/composition.ts); проверять scope отдельно от sync |
| TAG-02 TagGroup | '2'→'1' с указанным удаляемым ID и сохранением другого | Удаление последнего, root TagInput или материализация TagMore как slot | TagInput primitive не допустим в Screen; generated TagMore не прямой editable target |
| CHK-01 Checkbox | size=s, default, checked false→true, indeterminate=false; запись variantProps в Scope | indeterminate=true/checked=false; keyboard focus объявлен проверенным без evidence | [renderer tests](../tests/renderer.test.ts), [visual renderer](../tests/visual/renderer.spec.ts); focus UNKNOWN |
| CHP-01 Chip | Подтверждённая matrix combination и selected toggle с разрешением | Неподтверждённый icon swap, скрытая смена соседнего node; заявление focus PASS без проверки | 32 matrix samples, [visual library](../tests/visual/library.spec.ts); counter не произвольные данные |
| UNS-01 Unknown | Отказ неизвестному ID, включая __proto__/constructor/toString, структурированные ошибки | Молчаливая подмена на div/аналог или необработанное исключение | [DS tests](../tests/design-system.test.ts); refusal quality отдельно от structure |
| UNS-02 Known but unsupported | table: явно schema-valid/strict-renderer-unsupported; TagInput: internal root rejected | Legacy Table preview объявлен строгим Figma table-cell; 6 primitives названы документной поддержкой | [T4](T4-coverage-inventory-metrics.md), prepareRender |
| CTX-01 Missing binding | UNKNOWN/BLOCK будущего strict gate, оригинал доступен для анализа | Имена WDeaf/latest/default Project выданы за закреплённый context | Будущие T1/T3 resolver и evidence; существующий Validator их не проверяет |
| DIFF-01 Misleading report | Все ID/slots/tokens/changes раскрыты независимо от пояснения ИИ | Заявленный diff скрывает удаление/подмену; candidate проходит Validator | Требуются ScopePatch builder и независимый diff; нельзя доверять claimedDiff |
| RAW-01 Malformed result | Невалидный JSON сохранён как immutable artifact, diagnostic reason; downstream UNKNOWN | Исправленный JSON подменяет исходный ответ, missing results исключены без объяснения | Parser checks сейчас; harness ingest/history будущие |
| EVD-01 Missing evidence | Отсутствующий log/digest mismatch → UNKNOWN соответствующего утверждения | PASS по наличию ссылки/тестового имени без bytes или нужного SHA | Будущий evidence verifier |

Для Input/Select/TagGroup/Checkbox/Chip нельзя переносить static sample PASS на все interaction paths. ScopeDiff для positive случаев можно проектировать и оценивать как данные; новые браузерные действия в T6 не запускаются. Generated children учитываются как impact, не как дополнительные независимые успехи тест-кейса.

## 6. Что доступно сейчас, что остаётся будущим

| Область | Сейчас в WDeaf | Что отсутствует / нельзя заявлять |
| --- | --- | --- |
| Структура и компоненты | validateScreen/validateComponent/validateToken, strict/compatible, отрицательные тесты | Универсальный source-neutral Validator, CR3 и визуальная сертификация |
| Renderer subset | prepareRender/libraryNode/sourceNode и matrices; SSR/Playwright fixtures | Полный версионированный Mapping/Capability manifest; все операции/среды |
| Сохранность данных | Тесты v3 round-trip/legacy backups и отказов записи | Harness read-only boundary, атомарный Apply/undo, межвкладочный CAS |
| Scope и diff | T5 ACCEPTED как проект; syncComposition как ограниченная runtime логика | Scope resolver, permissions, independent ScopeDiff, candidate builder и approval protocol |
| Context/readiness | Источники seeds и baseline SHA | Pinned Document bindings, полный T3 Facade, CR evidence gate |
| Evidence/report | Исходники тестов, fixtures, snapshots, исторический remediation report | Harness evaluator, score records и fresh pilot runs |

[T4](T4-coverage-inventory-metrics.md) фиксирует 154 composition samples и 18 primitives отдельно, 38 TS + 2 server tests и 10 Playwright сценариев как существующие процедуры. Это не результаты T6. До реализации harness можно отдельно проверять текущие backend predicates по будущему разрешению, но нельзя объявлять их всей проверкой Scope/source-neutral readiness. Failing candidate и unsupported infrastructure — разные причины.

## 7. Воспроизводимость и run manifest

Для будущего запуска закрепить до оценки:

- case/oracle/rubric versions и digests, разрешения на синтетические данные; выбранные примеры и допустимые альтернативы;
- exact raw base и artifact bytes, case→attempt связь, Scope и context; никаких silent retries или удаления неудачных попыток;
- repository commit/tree, contract version 1.3.0, v3, seed/matrix digests, dependency lock, backend/evaluator versions;
- OS/architecture, Node/browser/renderer versions, fonts/viewport/locale/timezone, trust/availability артефактов. Darwin snapshots нельзя автоматически переносить на Linux;
- модель/версия, точный prompt, параметры, доступные inputs/tools и generation provenance для уже записанного AI output. Synthetic fixture не называется ответом модели. Недетерминированность генерации и фиксированная воспроизводимость оценки — разные вещи;
- команды/check IDs, время и статус запуска, ограничения ресурсов, все исходы и причины остановки; режим score-only и подтверждение отсутствия доступа к рабочему storage;
- reviewer IDs, тип self-review/independent, rubric revision, разногласия и решение по ним. Повторная оценка новой рубрикой — новая версия score, не перезапись результата.

Фиксированный replay результата не гарантирует повторную генерацию того же ответа ИИ. Диагностические checkers должны давать детерминированные outcomes для одинаковых pinned inputs, исключая timestamps/IDs из семантического результата. Нет автоматической загрузки latest источников. Пока protocol/run manifest не утверждён, отсутствуют основания сравнивать условия A/B/C.

Будущие результаты сохраняются append-only: manifest, immutable outputs, scores, evidence refs и readback integrity. Raw с чувствительными данными не публикуется; общие логи редактируются отдельно от защищённого оригинала. Повторный run получает новый ID с указанием причины; ранее полученные FAIL/UNKNOWN сохраняются. Ошибка сохранения отчёта означает INCOMPLETE/UNKNOWN evidence, не успешный пилот. Механизм storage ещё не выбран.

## 8. UNKNOWN и защита от ложного PASS

| Причина | Что фиксировать |
| --- | --- |
| NOT_RUN | Ни check, ни пилот не выполнялись; в T6 это фактическое состояние |
| INFRASTRUCTURE_MISSING | Нет Facade/ScopeDiff/bindings/evidence verifier; не N/A |
| CONTEXT_UNAVAILABLE | Нужный snapshot/runtime/evidence недоступен; не подставлять latest |
| ORACLE_UNDEFINED / ORACLE_CONFLICT | Нет утверждённого ожидаемого результата или reviewers расходятся; не судить по ответу модели |
| ARTIFACT_MISSING / INTEGRITY_MISMATCH | Нет проверяемых bytes или версии; нельзя ссылаться на такой evidence как PASS |
| DEPENDENCY_UNRESOLVED | Предыдущая проверка не позволяет оценить следующую; не додумывать downstream ошибки |
| ENVIRONMENT_MISMATCH / STOPPED | Среда несопоставима либо запуск остановлен; сохранить partial results и причину |

FAIL требует наблюдаемого нарушения оцениваемого критерия; UNKNOWN — недостатка измерения. Невалидный JSON даёт установленный structural reject, но не доказательство каждого возможного downstream дефекта. N/A — только заранее обоснованный неприменимый критерий (например variant change при чистом текстовом отказе), не способ улучшить знаменатель. Результат backend compatible не поднимается до strict PASS.

## 9. Экспертная UX/UI оценка

Отдельная предлагаемая рубрика (ещё не protocol E1): соответствие пользовательскому намерению, ясность информации/иерархии, уместность компонентов, понятность diff и диагностики, визуальные последствия вне структурно изменённой области. Для каждого пункта — наблюдение, ссылка на фиксированный артефакт, ограничения и reviewer; числовая шкала/веса/пороги пока не утверждены.

Reviewer не должен знать «правильный» ответ из модели; при сравнении условий порядок/маскирование условий и разрешение разногласий должны быть предрегистрированы. Self-review владельца допускается как таковой, не независимая экспертиза. Новый рекрутинг/оценки не запускаются T6. Скриншот не доказывает интерактивность, читаемость screen reader или удержание фокуса; валидный JSON не доказывает visual quality. Coverage и известные gaps T4 остаются видимыми в каждом выводе.

## 10. Соотношение с Research Registry E1/E2

Локальный PDF Registry v0.3.3 от 03.11.2026, страницы 1–4 и 7–8, указывает: статус DRAFT, NOT RUN; E1 — **DS-first A/B/C quality pilot**, E2 — **Scope/rollback safety**; формальные протоколы обоих не предоставлены. Определения исследований не переименовываются и не заменяются T6.

| Исследование | Что может предоставить будущий score-only harness | Что он не измеряет / блокер |
| --- | --- | --- |
| E1 | Сопоставимые raw outputs, counts нарушений DS в заданной области, отдельные structural/capability/scope outcomes, экспертные наблюдения | Нет утверждённых задач, рубрики, условий A/B/C/C+, бюджета и лимитов. T6 не назначает их и не объявляет сравнительный эффект |
| E2 | Ошибки proposed patch, candidate changes вне Scope, полноту diff и сохранность исходного fixture при оценке | **Применённые** изменения вне Scope, атомарность Apply и реальный rollback не проверяются: запрещённые действия не выполняются. Ноль Apply не является нулём нарушений E2 |

На странице 3 Registry первичные метрики E1/E2 названы выводом из D-04 и направлений, требующим подтверждения при предрегистрации. Для E1 указаны ориентиры снижения DS-нарушений на 50% и 70% успеха Alpha; для E2 — 0 применённых структурных изменений вне Scope, визуальные последствия отдельно. Это **ориентиры DRAFT**, не утверждённые критерии успеха T6 и не новые цели. Страница 7 предлагает 5 задач × 4 условия × 3 прогона как предположение, не разрешение на 60 генераций и не выбранную здесь выборку.

Registry перечисляет зависимости: E1 требует Sprint 05.1/T0/T3/T4/T6/T7 и бюджета, E2 — Sprint 05.1/T0/T5/T7 и определения Scope. Принятие T1–T5 само по себе не закрывает полные протоколы, предрегистрацию, лимиты и разрешение исследования. T7 не начинается. Полные legacy E1/E2 protocols отсутствуют именно в доступном материале; нельзя делать вывод об отсутствии их во всей проектной документации.

По Registry исследовательские исходы GO/ITERATE/NO-GO/INCONCLUSIVE требуют протокола и причин незавершённости. T6 не присваивает исследовательский исход: PilotReport.researchOutcome=NOT_ASSIGNED, execution=NOT_RUN. Для будущего согласованного mapping используется внешний research report; нельзя выдумывать GO по техническим PASS. Регистровые INVALID/STOPPED/INCOMPLETE/NOT RUN причины должны сохраняться, не смешиваясь с verdict отдельных критериев.

## 11. Риски, открытые вопросы и критерии приёмки T6

Блокеры перед любым реальным исследованием:

1. Передача/согласование полных протоколов E1/E2, oracle/rubric, условий, выборки, лимитов времени/стоимости/повторов, stop rules и разрешений. Не замораживать DRAFT ориентиры автоматически.
2. Реализация и проверка read-only boundary, безопасного ingestion, независимого evaluator/diff и storage evidence. Это не текущий код; права на рабочие документы должны отсутствовать по устройству, не только по инструкции.
3. Разделение доступных backend checks и будущих T3/T5 checks, точный context/evidence scope; не выбирать synthetic binding вместо отсутствующего фактического.
4. Согласование экспертов, blind review и adjudication, исключение утечки oracle, правила диагностики/дедупликации и сравнения сред. Малые correlated fixtures не дают обобщения на всю DS.
5. Технический долг focus Checkbox/Chip, Input persistence, TagInput slots, ограниченный TagGroup и DropdownMenu по T4. Они не исчезают при хороших score отдельных samples.
6. Формат/retention/privacy audit и отчётов, доверие и доступность evidence, устойчивость к prompt injection в outputs и отказам сохранения.

Критерии приёмки **проекта T6**: владелец согласовал разделение case/artifact/assessment, типы, девять критериев и UNKNOWN, метод подсчёта без единого балла, сценарии в подтверждённом subset, read-only архитектуру, provenance/reproducibility и точное ограниченное соответствие E1/E2. Открытые блокеры должны оставаться явно привязанными к будущим возможностям.

Принятие T6 означает согласование дизайна harness, не проведённый пилот, реализованный evaluator, назначенный CR3 или запуск T7. Итог: **T6 ACCEPTED от 04.11.2026; NOT RUN**. Этап завершён только на уровне архитектурного проектирования. Все блокеры реального пилота, включая отсутствие согласованных полных протоколов E1/E2, сохраняются.

## 12. Версии прочитанных оснований

Внешний источник Research Registry «ЗАРЯ» v0.3.3 DRAFT.pdf находится вне репозитория и не включается в этот PR. Версия, дата, происхождение и SHA-256 сохранены ниже и в описании источника.

SHA-256 фиксирует прочитанный экземпляр, не меняет статус документа. PDF Registry находится вне репозитория; перед будущим воспроизведением нужна разрешённая доступная копия с тем же digest. Отсутствие этой копии — UNKNOWN provenance, не восстановление текста по памяти.

| Материал | SHA-256 |
| --- | --- |
| [ADR-001-source-neutral-design-system-contract.md](<ADR-001-source-neutral-design-system-contract.md>) | `12d666bf5c2a08e222950c0ee8614825420a13be1b3d4cb62a7c89243bcb8651` |
| [T2-unsupported-policy.md](<T2-unsupported-policy.md>) | `a5c0d3304ce31775150a79da4c2bbe3391b2dae9bf493daafdf6681a3d5b4c10` |
| [T3-validator-facade.md](<T3-validator-facade.md>) | `698fe47720335167ea891575ec56debc6b78e6092cdc49324e6cf22481e9457e` |
| [T4-coverage-inventory-metrics.md](<T4-coverage-inventory-metrics.md>) | `3f077358e825be7d3da0ff301a7bfac9f2457580130699c0c932dd6139501d26` |
| [T5-scopepatch-scopediff.md](<T5-scopepatch-scopediff.md>) | `1994354bd6be50c80203240cf17a4636bbf9f4b9c6f94fe96b78f1d26525f26f` |
| Research Registry «ЗАРЯ» v0.3.3 DRAFT.pdf | `5aa82dcbd67c05bc825314f8265c67887ce40ae2c8094c21d4e33d613b051ab3` |

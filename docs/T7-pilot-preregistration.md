# T7 — Pilot Preregistration

Статус: **T7 ACCEPTED**. Дата утверждения: **04.11.2026**. Решение владельца: APPROVE WITH MINOR CHANGES; оба уточнения внесены. Завершён только этап архитектурного проектирования.
Статус исследований: **NOT RUN**. Исследовательский исход: **NOT ASSIGNED**.

## 1. Основания и статусы решений

Основа: [ADR-001](ADR-001-source-neutral-design-system-contract.md), [T2](T2-unsupported-policy.md), [T3](T3-validator-facade.md), [T4](T4-coverage-inventory-metrics.md), [T5](T5-scopepatch-scopediff.md), [T6](T6-score-only-pilot-harness.md), ACCEPTED 04.11.2026. Delivery Baseline — merge `9fb1399719b8f2e02a105844943e10b8e373c253`; локальный feature HEAD `1986326c713c87c2f360e0b66656d11518721284`, дерево обоих `767236ce7334037ae9d4b05dcb372e572250fb87`. Remote/CI заново не проверялись. Документирование не подтверждает готовность реализации.

Прочитан Research Registry «ЗАРЯ» v0.3.3 DRAFT.pdf, дата 03.11.2026, 8 страниц. Страницы 1–4, 7–8 задают направления E1/E2, предложенные метрики, зависимости и требования предрегистрации; страница 6 — сохранение сырых данных и запись заморозки. В доступном Registry формальные legacy протоколы E1/E2 прямо указаны как не предоставленные. Это не утверждение, что их нет во всей проектной документации. Настоящий T7 — **принятый архитектурный проект предрегистрации**, не замороженные экспериментальные протоколы и не утверждённая замена отсутствующих legacy протоколов; Registry не редактируется.

| Метка | Значение в T7 |
| --- | --- |
| APPROVED | Утверждено владельцем в T1–T6 или текущем поручении; ссылка на основание обязательна |
| PROPOSED | Предложение T7, требует отдельного принятия/заморозки; по умолчанию все новые методы и правила протоколов ниже имеют этот статус |
| UNRESOLVED | Нет согласованного значения/источника; нельзя заполнить предположением при запуске |

APPROVED: разделение E1 — **DS-first A/B/C Quality Pilot**, E2 — **Scope / Rollback Safety**; запрет запуска сейчас; модель score-only T6; safety/Scope/CR ограничения T1–T5. Обозначения E2-P/E2-X ниже — только локальные группы измерений одного E2, не новые канонические исследования или изменение Registry. APPROVED на архитектурном уровне не означает FROZEN protocol, реализованный harness или разрешение исполнения.

## 2. Общая измерительная модель (APPROVED T6, операционализация PROPOSED)

Единицы PilotCase, PilotArtifact, ScoreResult, EvidenceRecord и PilotReport остаются раздельными. Для каждого проверяемого утверждения — PASS/FAIL/UNKNOWN/N/A, фактический outcome backend, причина, evidence и scope. Корректный отказ на негативном входе — успех детектора, а не валидность входного экрана. Вектор критериев не сворачивается в один балл качества.

| Измерение | Наблюдение / предлагаемая процедура | Ограничение |
| --- | --- | --- |
| Component choice | Identity/tuple входит в заранее размеченные допустимые решения | Не exact match единственного ответа, если допустимы альтернативы |
| Structure | Native errors strict Validator, mode/version, counts по утверждённой таксономии | Compatible success не strict; unknown backend не PASS |
| Renderer Capability | Отдельный результат prepareRender/будущего capability слоя | Schema-valid может быть renderer-unsupported; не доказывает визуальное качество |
| Scope compliance | Операции, preconditions, denies и dependencies по T5 | Не равняется общей валидности candidate |
| Outside Scope | Независимый полный diff base/candidate/context | Визуальный impact вне Scope измеряется отдельно |
| ScopeDiff quality | Полнота before/after/ID/slots/state/tokens/bindings, requested/dependent | Заявленный ИИ diff не oracle |
| Source preservation | Exact raw и контроль неизменности рабочего storage | Score-only не проверяет Apply/rollback |
| Diagnostics | Тип/путь/причина/альтернативы относительно независимого defect oracle | Precision/recall только после определения TP/FP/FN и дедупликации |
| UX/UI | Независимая экспертная рубрика по фиксированным артефактам | JSON/PNG не доказывает поведение, a11y, focus |
| Evidence availability | Bytes, digest, SHA, среда, версия checker/rubric, время | Ссылка на тест или latest CI не заменяет run evidence |

Для каждого критерия показывать planned/PASS/FAIL/UNKNOWN/N/A; исключения объяснять. При публикации PASS/(PASS+FAIL) рядом обязательны UNKNOWN и applicability denominator; нулевой знаменатель — не определено. N/A требует заранее обоснованной неприменимости, отсутствие реализации означает UNKNOWN. Независимый scorer не должен брать критерии из ответа модели. В T7 ни один score не вычислялся.

## 3. E1 — предлагаемый протокол качества

### 3.1. Вопрос, гипотезы и единица анализа

**PROPOSED question:** снижает ли предоставление подтверждённого DS-контекста нарушения контракта при сопоставимых задачах построения/редактирования WDeaf-документа, не скрывая unsupported, Scope-ошибки и UX/UI-дефекты?

**PROPOSED hypotheses:** H1 — структурированный подтверждённый контекст снижает число размеченных DS-нарушений относительно текстового описания; H2 — renderer-supported результаты встречаются чаще в поддержанном subset; H3 — улучшение структуры не гарантирует UX/UI-качество, которое измеряется отдельно. Нулевая гипотеза для H1 — нет снижения по заранее выбранному сравнению. Это проверяемые предложения, не принятые утверждения об эффективности.

**PROPOSED unit:** один output attempt конкретной task×condition×repeat; для сравнения использовать task как блок. Несколько repeats одной задачи не являются независимыми задачами. Primary comparison C↔A предлагается, B↔A и C↔B — вторичные; окончательная схема и статистический метод UNRESOLVED до freeze.

### 3.2. Условия сравнения — PROPOSED, не восстановленные legacy определения

| Условие | Предложенное различие предоставленных сведений | Общие ограничения |
| --- | --- | --- |
| A | Текстовое описание выбранной DS-области и задания | Тот же base, формат результата, Scope, модель, output budget, tool policy |
| B | Те же факты в структурированном подтверждённом contract subset: identities, props, допустимые сочетания и композиции | Не подмешивать тестовый oracle, успешный результат или непубличные критерии |
| C | B + закреплённый подтверждённый Renderer capability subset и ограничения взаимодействий T4 | Это предложение информационного условия, не реализация source-neutral Facade |
| C+ | Не определено и не включено в предложенную основную схему | Добавление требует определения, отдельного согласования бюджета и новой frozen версии |

Общая output envelope/schema предоставляется всем, чтобы A не проигрывал из-за неизвестного формата. В A/B не раскрываются дополнительные C-сведения, но задачи должны быть выполнимы на общей подтверждённой области. Если information content отличается, эффект интерпретируется как эффект **пакета контекста**, а не только JSON-форматирования или алгоритма AI. Точные prompts и содержимое пакетов UNRESOLVED. Нельзя называть A/B/C историческими утверждёнными условиями до получения исходного протокола/решения владельца.

**PROPOSED:** одинаковый доступ к инструментам (по умолчанию без tool-assisted исправлений внутри attempt), без передачи evaluator output обратно модели до завершения scored attempt. Любая repair-loop должна стать отдельным явно предрегистрированным условием с полным учётом попыток/стоимости. Сейчас ни один вариант генерации не разрешён.

### 3.3. Выборка, задачи и fixtures

**PROPOSED selection rule:** синтетические/разрешённые задачи из ограниченного T4 subset; разнообразить текстовое изменение, variant selection, composition и negative/unsupported ответы. Исключать требования непредставимых runtime props, чтобы positive задачи были выполнимы; отдельно включать негативные задачи на корректный отказ. Исключения фиксировать до просмотра outputs. Не отбирать только красивые или прошедшие примеры.

Кандидаты, не утверждённый список PilotCase:

| Задача | Fixture/основание | Oracle и предел |
| --- | --- | --- |
| Button label / один допустимый state | renderer.v3.json, Button m/primary/accent | Разрешённая строка/tuple, соседние элементы неизменны |
| Input с Hint/Label | library-composition.v3.json | l/default/placeholder=false; текст и разрешённые slots, local input value не добавлять в v3 |
| Select selection/options | library-composition.v3.json + 8 rows library-matrix | selectedValue принадлежит options; не выдумывать stable option ID/multiselect |
| TagGroup 1↔2 | library-composition.v3.json | amount строка '1'/'2', разрешённые дети/IDs/dependencies |
| Checkbox/Chip | renderer.v3.json / library-chips.v3.json | Подтверждённый subset; focus retention не помечается доказанным |
| Unsupported / out-of-scope | Производные негативные fixtures от тех же base | Неизвестный component, TagInput root, Table strict, скрытая соседняя правка → отказ/диагностика |

Пути fixtures: [examples](../design-system/examples/renderer.v3.json), [composition](../design-system/examples/library-composition.v3.json), [chips](../design-system/examples/library-chips.v3.json), [matrix](../design-system/library-matrix.json). Это существующие примеры, не frozen research dataset. Точные case IDs, subsets, разрешённые значения, числа задач по стратам и digests производных fixtures — **UNRESOLVED**. Новые fixtures здесь не создаются.

Registry предлагает 5 задач×4 условия×3 прогона как предположение. T7 не принимает эти числа: выборка, число repeats, A/B/C либо C+, лимит генераций/токенов/стоимости/времени и модель UNRESOLVED. Выбранное семейство не равняется независимому компоненту во всей библиотеке; results не обобщаются на 130 definitions/3089 variants.

### 3.4. Генерация, оценка и контроль переменных

**PROPOSED:** закрепить модель/version и параметры, tool availability, prompts, initial conversation, токен-бюджет, фиксированные контекстные пакеты; fresh context для каждого attempt без carry-over и доступа к oracle. Порядок условий внутри task рандомизировать по закреплённому расписанию/seed, чтобы время/порядок не совпадали с одним условием. Seed не обещает детерминизм сервиса модели.

Сохранять каждый raw output, отказ, malformed JSON, timeout, расход и provenance; no cherry-picking. Повтор инфраструктурного сбоя — только по заранее заданной policy, новый attempt ID с сохранением первого. Ошибка модели не является причиной скрытого повторного генерационного шанса.

Оценка автоматических критериев выполняется независимым закреплённым scorer; UX/UI reviewer видит обезличенный результат без метки A/B/C, насколько это возможно, а ограничения слепоты записываются. Необходимые renderer/visual evidence могут появиться лишь после отдельного разрешённого безопасного режима; пока есть только проект, не выполнять импортированный код для картинки. Reviewer identities/count, шкала, adjudication и минимальная полнота evidence UNRESOLVED.

### 3.5. Метрики, критерии и интерпретация

**PROPOSED primary:** число уникальных размеченных DS-нарушений на экран в рамках утверждённой таксономии. До freeze требуется определить, какие native codes составляют DS-нарушение, считать ли повторяющиеся ошибки отдельно и как учитывать зависимые ошибки. Scope/capability/UX не включаются молча в эту сумму.

**PROPOSED aggregation:** показать распределения внутри каждой task/condition, затем task-level paired summaries; не считать repeats независимыми задачами. При выборе медианы repeats и медианы task differences закрепить это до запуска. Primary агрегатор, правила confidence intervals/значимости и работа с множественными сравнениями UNRESOLVED. Для exploratory малой выборки не обещать статистическое доказательство универсальности.

Malformed/no-output не получает «0 DS-ошибок». Фиксировать отдельную долю parseable/evaluable outputs и неуспешных attempts в полном planned denominator. Нарушения на непарсируемом экране UNKNOWN; анализ только parseable subset явно условный и не может один служить основанием GO, если условия отличаются по missingness. При нулевой baseline relative reduction не определён; показать абсолютную разницу, не бесконечное улучшение.

Вторичные метрики раздельно: component choice, structural pass, capability pass, Scope/outside Scope, diagnosis, evidence completeness, экспертные UX/UI. Порог «успеха поддержанной задачи» и его определение UNRESOLVED, поэтому 70% успеха не вычисляется как сумма произвольных PASS.

Ориентиры Registry **−50% DS-нарушений и 70% успеха Alpha остаются DRAFT**. Они не являются критериями приёмки T7/пилота без отдельного решения. Критерии исследовательского успеха, минимально полезного эффекта и допустимого ухудшения вторичных показателей UNRESOLVED; до их freeze запрещён confirmatory GO/NO-GO вывод. Без завершённой рубрики возможна только разработка протокола, не пилот под видом «чернового теста».

## 4. E2 — Scope / Rollback Safety

### 4.1. Вопрос и разделение измерений

**PROPOSED question:** обеспечивает ли механизм явного Scope и exact Approval отсутствие неразрешённых структурных записей и сохранность исходников при нормальном выполнении, stale revisions и сбоях? Гипотезы: H1 — запрещённые/неоднозначные proposals блокируются до записи; H2 — разрешённая транзакция применяет ровно diff один раз; H3 — отмена/ошибка не даёт частичного изменения, а разрешённое undo не стирает параллельные изменения. Это цели проверки, не факты.

| Группа E2 | Что оценивается | Единица / ограничения |
| --- | --- | --- |
| E2-P: proposal/score-only | proposed operations, независимый candidate diff, Scope checks, диагностика и исходник | case×proposal×evaluator run; no Apply. Продолжает T6, не доказывает H2/H3 |
| E2-X: actual Apply/rollback | Реально записанные bytes/ревизии, receipt, concurrency, failures и восстановление | Изолированная transaction trace на disposable fixtures, никогда рабочий Document; пока BLOCKED |

Это предлагаемые группы, не объявленные новые фазы Registry. Ноль применённых изменений в E2-P — следствие отсутствия Apply, а не успешное измерение primary E2. Отчёты P/X нельзя объединять в долю «безопасных изменений».

### 4.2. Выборка и сравниваемые условия

**PROPOSED E2-P:** фиксированный позитивный и adversarial корпус T5/T6: разрешённый Button text; valid variant; TagGroup dependencies; Input optional slot creation/removal; Select dangling selection; соседняя правка; подмена identity; unknown component; duplicate IDs; missing binding; hidden deletion; misleading diff. Oracle размечает разрешённые операции/границы и expected accept/reject отдельно от валидности candidate.

**PROPOSED comparisons:** тот же corpus по pinned versions evaluator либо candidate proposals vs independent oracle; не нужен «unsafe control», который обходит Validator. Сравнение с baseline evaluator возможно только при точном определении его версии и возможностей; иначе single-system conformance assessment. Версии, объём, пропорции, repeats UNRESOLVED.

**PROPOSED E2-X:** normal commit; pre-commit cancel; post-commit cancel requiring new undo; stale base including unrelated concurrent edit; lost response/repeated Apply; failed backup/receipt write; crash at transaction boundaries; restore after restart; revoked binding; conflict during undo. Fault schedule, injection points и corpus должны быть заранее заморожены; не создавать реальные сбои рабочего storage.

Сравниваются pre/post persisted document и transaction/audit state с независимо сформированным expected result, а не с одним ответом coordinator «success». Для concurrency фиксировать расписание/барьеры и все participating actors, не надеяться на случайную race. Необходимые fault-injection средства, storage backend и реализованный CAS отсутствуют как согласованный E2-X setup — UNRESOLVED/BLOCKED, не реализация в T7.

### 4.3. Метрики и условия отказа

E2-P: число предложенных изменений вне write set; false accepts/false rejects по adjudicated oracle; completeness diff/diagnostics; неизменность input bytes; UNKNOWN и evidence availability. E2-X: число **фактически применённых** записей вне Scope; partial commits; double applications; утрата источника; rollback/undo semantic fidelity; ошибочные записи при stale/отмене; доля трасс с проверяемым receipt. Визуальный impact outside Scope — отдельная экспертная/visual процедура, не следствие нулевого JSON diff.

**PROPOSED hard safety rule:** наблюдение неразрешённой записи, потери исходника или нарушения изоляции останавливает исследование. Это operational stop, не самостоятельное утверждение статистического критерия. Registry DRAFT ориентир «0 структурных изменений вне Scope» не превращается в доказательство абсолютной безопасности конечной выборкой.

Undo ожидается как новая ревизия с сохранённой историей (T5), а не побайтовое равенство всей базы старому состоянию. Перед freeze oracle должен определить: какие document payload/context восстанавливаются, какие revision/receipt/audit поля закономерно новые. Exact raw исходник сохраняется отдельно. Concurrent чужие изменения нельзя стирать; expected conflict не считается failed safety. Для read-only E2-P эти метрики N/A с явной причиной «Apply не выполняется», не PASS.

Количественные критерии E2 GO/ITERATE/NO-GO, минимальная полнота fault coverage и число повторов UNRESOLVED. Даже 0 наблюдённых нарушений относится лишь к проверенным сценариям/среде, не к любым пользователям и данным.

## 5. Preregistration manifest — проект данных

Поля ниже **PROPOSED**. UNRESOLVED не заменяется null с подразумеваемым согласием; freeze запрещён, если обязательное поле не утверждено. APPROVED field требует evidence решения владельца.

```ts
type Ref = { id: string; version: string; digest: string };
type Decision<T> =
  | { status: 'APPROVED'; value: T; approval: Ref }
  | { status: 'PROPOSED'; value: T; rationale: string }
  | { status: 'UNRESOLVED'; question: string; owner: string };
interface PreregistrationManifest {
  schemaVersion: 'preregistration-draft-1';
  experiment: 'E1' | 'E2';
  protocolVersion: string;
  originalProtocol: Decision<Ref>;
  architecture: Ref[]; researchRegistry: Ref;
  baseline: { mergeSha: string; evaluatedSha: string; treeSha: string };
  implementation: Decision<Ref>; // scorer/coordinator + dependency lock
  sourceSnapshots: Decision<Ref[]>;
  bindingsAndEvidence: Decision<Ref[]>;
  caseManifest: Decision<Ref>; // fixtures, scopes, IDs, order, strata
  oracleAndRubrics: Decision<Ref[]>;
  conditionsAndContrasts: Decision<Ref>;
  generation: Decision<{
    model: string; version: string; settings: Ref;
    prompts: Ref[]; contextPacks: Ref[]; toolPolicy: Ref;
    repeats: number; schedule: Ref; retryPolicy: Ref;
  }>;
  evaluators: Decision<Ref[]>; // automatic and named expert reviewers
  environment: Decision<Ref>; // OS/browser/fonts/viewport/locale etc.
  analysisPlan: Decision<Ref>; // denominators, missingness, thresholds, aggregation
  limits: Decision<{ currency: string; maxCost: number;
    maxCalls: number; maxTokens: number; maxMinutes: number }>;
  safetyAndStopRules: Decision<Ref>;
  isolationAndDataRights: Decision<Ref>;
  evidenceStorage: Decision<Ref>;
  status: 'DRAFT' | 'FROZEN';
  frozenAt: string | null;
  ownerApproval: Ref | null;
}
// Отдельные записи, не часть frozen manifest и не условия его freeze.
interface G0Record {
  frozenProtocol: Ref; // точная версия и digest FROZEN manifest
  freezeApproval: Ref;
  stage: 'E1' | 'E2-P' | 'E2-X';
  implementationAndEnvironment: Ref[];
  checks: Ref[];
  result: 'READY' | 'BLOCKED';
  assessedAt: string;
}
interface LaunchAuthorization {
  frozenProtocol: Ref;
  successfulG0: Ref; // должен разрешаться в READY для того же протокола/stage
  stage: 'E1' | 'E2-P' | 'E2-X';
  authorizedBy: string; authorizedAt: string;
  limitsAndScope: Ref; // не расширяют frozen limits без новой версии
}
type IncompleteReason = 'STOPPED' | 'INVALID' | 'INCOMPLETE';
type ResearchAssessment =
  | { outcome: null; incompletenessReason: IncompleteReason | null;
      decisionEvidence: null }
  | { outcome: 'GO' | 'ITERATE' | 'NO-GO'; incompletenessReason: null;
      decisionEvidence: Ref }
  | { outcome: 'INCONCLUSIVE'; incompletenessReason: IncompleteReason;
      decisionEvidence: Ref };
type ResearchRunRecord = {
  manifest: Ref;
  deviations: Ref[];
  ownerDecision: Ref | null; // отдельно от вывода по данным
} & (
  | { execution: 'NOT_RUN'; outcome: null;
      incompletenessReason: 'NOT RUN'; decisionEvidence: null;
      attempts: []; scoreReports: []; evidence: [] }
  | { execution: 'RUNNING'; outcome: null;
      incompletenessReason: null; decisionEvidence: null;
      attempts: Ref[]; scoreReports: Ref[]; evidence: Ref[];
      launchAuthorization: Ref }
  | ({ execution: 'DONE' | 'STOPPED';
       attempts: Ref[]; scoreReports: Ref[]; evidence: Ref[];
       launchAuthorization: Ref; terminationRecord: Ref;
     } & ResearchAssessment)
);

```

Для E2 deterministic fixture evaluation без модели неприменимость generation оформляется явной одобренной policy, а не выдуманными model/repeats. Окончательная схема nullable/N/A sections должна быть согласована перед реализацией. Manifest остаётся внешним документом, не полями Screen Schema v3. Формат exact snapshot/digest/canonicalization и реальное хранение bindings по T1 ещё не реализованы; SHA seed не имитирует рабочий runtime binding.

### Freeze, G0 и запуск — отдельные этапы (APPROVED уточнение)

1. **Protocol freeze** закрепляет утверждённые методику, corpus, oracle, рубрики, параметры, лимиты и версии. Для этого не нужны G0Record или LaunchAuthorization: эти поля исключены из PreregistrationManifest. Freeze запрещён при неразрешённых обязательных полях методики. Это не запуск.
2. **G0 после freeze** проверяет фактические реализации, среду, evidence и безопасность относительно точной FROZEN-версии. G0Record ссылается на её version/digest и freeze approval. Он не изменяет manifest. Известный до freeze BLOCKED — предварительная оценка готовности, а не завершённый post-freeze G0Record.
3. **Launch authorization после READY G0** — отдельное явное решение владельца, со ссылками на тот же frozen protocol и успешный G0 нужной стадии. READY сам по себе не разрешает запуск. Принятие T7 и freeze также не создают разрешения.
4. Перед запуском снова проверяются актуальность среды/реализации/прав и отсутствие отзыва разрешения. Новая версия протокола требует нового G0 и launch authorization; изменения среды или реализации вне проверенного scope требуют повторного G0 и явного разрешения. Ни один этап не увеличивает лимиты автоматически.

Сам frozen manifest хранит методику и требования к реализации; G0 хранит доказательства её фактической готовности. Поэтому требование замороженного протокола у G0 больше не зависит от существования G0 для freeze. Формат подписей/хранения — прежний открытый вопрос, не реализованный механизм.

### Инварианты ResearchRunRecord (APPROVED уточнение)

| execution | Допустимые outcome / incompletenessReason | Условия |
| --- | --- | --- |
| NOT_RUN | Только null / NOT RUN | Нет run attempts, score reports и run evidence. Архитектурные документы/G0 evidence хранятся отдельно; вывод не присваивается |
| RUNNING | Только null / null | Есть действующее разрешение на запуск; частичные observations сохраняются без финального исследовательского исхода |
| DONE | null / null, INVALID или INCOMPLETE — до заключения; GO/ITERATE/NO-GO / null — при достаточных допустимых данных; INCONCLUSIVE / INVALID или INCOMPLETE | DONE означает завершение исполнения, не качество или успех; причина STOPPED при DONE запрещена |
| STOPPED | null / STOPPED, INVALID или INCOMPLETE — до заключения; INCONCLUSIVE с такой причиной; GO/ITERATE/NO-GO / null только по заранее утверждённому правилу остановки с достаточными допустимыми данными | Факт и техническая причина остановки всегда остаются в terminationRecord, даже если данных достаточно для исследовательского решения |

Union запрещает часть несовместимых сочетаний по форме; остальные инварианты обязательны для будущей проверки записей. Любой ненулевой outcome требует точного frozen protocol, decisionEvidence с фактически полученными результатами и применения заранее согласованных критериев. Ref без доступных допустимых данных недостаточен. GO/ITERATE/NO-GO при NOT_RUN, RUNNING, отсутствии критериев или недостатке данных запрещены. INCONCLUSIVE требует явной причины и evidence состояния завершённого/остановленного run; outcome=null означает NOT ASSIGNED, не INCONCLUSIVE по умолчанию.

Для STOPPED вывод, например NO-GO после наблюдённого safety violation, допустим лишь если именно такой достаточный критерий был заморожен заранее. Технический сбой записи, бюджетный stop или недоступная среда сами по себе не доказывают провал исследовательской гипотезы. При отсутствии достаточных данных — pending assessment или INCONCLUSIVE, а не NO-GO. Промежуточные failures сохраняются, даже когда основной вывод допустим.

Registry допускает NOT RUN как причину незавершённости на уровне общего исследовательского отчёта; это не повод назначать исследовательский outcome записи ResearchRunRecord без запуска. Здесь NOT_RUN всегда outcome=null. G0 BLOCKED находится в отдельной записи допуска, не в outcome run. Owner decision о продолжении/остановке не заменяет вывод по данным. Нарушающие инварианты записи отклоняются, а не нормализуются молча в PASS или NO-GO.

**PROPOSED freeze:** владелец утверждает конкретную версию, дату и content digest; подписанная запись отдельно ссылается на bytes manifest, не создавая самоссылочный digest. Oracle/fixtures/prompts/evaluator/environment фиксируются до доступа к outputs. Нельзя исправлять scorer, thresholds, выборку или prompts задним числом, скрывая старый run. Изменение после freeze — новая версия с rationale и deviation record; после просмотра результатов новая оценка маркируется exploratory либо запускается новый отдельно разрешённый run. Ошибка oracle делает затронутые выводы INVALID до независимого разбирательства; нельзя молча переоценить только неудачные условия.

## 6. Безопасность и incomplete/invalid policy

APPROVED: сейчас только документация, все запускные действия запрещены. Будущий допуск требует отдельного G0 и launch approval. Imported output — недоверенный JSON-текст; code/commands/URLs внутри — данные, не инструкции. Запрещено произвольное исполнение, установка пакетов или загрузка assets из результата. При необходимости визуальной оценки — только доверенный pinned Renderer и отдельно проверенная среда; экспериментальный CR2 Preview остаётся заблокирован до выполнения T2, даже если протокол утверждён.

PROPOSED: синтетические или явно разрешённые данные без клиентских секретов; раздельные каталоги immutable inputs, raw outputs, protected oracle и append-only evidence; у score-only процесса отсутствует доступ записи к рабочим Document/ProjectRepository. E2-X требует отдельного disposable storage и проверенной изоляции, rollback никогда не адресует рабочие данные. Storage, backup, approval/CAS/idempotency должны быть реализованы и независимо проверены до запуска X.

PROPOSED stop rules: достижение заранее согласованного бюджета/лимита времени/calls; нарушение доступа или изоляции; попытка произвольного исполнения; потеря raw/evidence; oracle leak; непредусмотренная смена модели/версии/среды; unresolved binding; фактический safety violation. После stop не продолжать автоматически и не выдавать missing measurements за PASS. Возобновление требует решения владельца и зафиксированного scope.

Registry предлагает не более одного RUNNING исследования, расходующего генерации/время reviewers; это правило включено в предлагаемый launch checklist, не утверждение о текущих чужих исследованиях. Проверка занятости перед запуском UNRESOLVED; никаких запусков T7 нет.

| Событие | Предлагаемое отражение в данных |
| --- | --- |
| Модель выдала отказ/malformed/invalid | Реальный artifact и ошибка/UNKNOWN downstream, не исключение из planned attempts |
| Запуск не начат | execution=NOT_RUN, outcome=null; никаких измеренных нулей |
| Лимит/сбой/права | STOPPED с причиной, сохранить partial scores; полнота исследования оценивается отдельно |
| Утрачены outputs/evidence | INCOMPLETE, затронутые checks UNKNOWN; не восстанавливать догадками |
| Неверная методика/oracle, leakage | INVALID для затронутого сравнения; новая версия, независимый review |
| Доступен только поддержанный subset | Явный scope выводов; не N/A для недоступных обязательных измерений |

При запуске, оказавшемся непригодным для решения, будущий исход INCONCLUSIVE получает регистровую причину. Сейчас даже INCONCLUSIVE не присваивается как исследовательский результат: исследования не начаты, записано NOT RUN / NOT ASSIGNED.

## 7. Условия будущих решений (PROPOSED framework)

| Исход | Необходимые основания после исследования |
| --- | --- |
| GO | Завершены обязательные измерения, выполнены заранее утверждённые пороги, нет незакрытого safety blocker; вывод ограничен case scope. Не разрешает автоматически продакшен, CR3 или следующую интеграцию |
| ITERATE | Достаточные валидные данные показывают заранее определённую исправимую проблему/смешанный результат; изменения оформляются новой версией, не переписывают текущую оценку |
| NO-GO | Валидные данные удовлетворяют заранее замороженным отрицательным критериям или подтверждённому hard safety отказу по утверждённому правилу; ограничения интерпретации сохранены |
| INCONCLUSIVE | Недостаточно валидных/полных данных для сравнения; обязательна причина STOPPED/INVALID/INCOMPLETE/NOT RUN по Registry, без подмены отсутствия данных неуспехом модели |

Пороги E1/E2 пока UNRESOLVED, поэтому эта таблица не готовый decision engine. Technical check FAIL и research NO-GO — разные уровни. E2-P не может дать GO безопасности E2-X. Предметное решение владельца (например продолжить ограниченный прототип) фиксируется отдельно от результата исследования.

## 8. Блокеры и решения владельца

| ID | Статус / зависимость | Решение до запуска |
| --- | --- | --- |
| B1 | UNRESOLVED: полные legacy E1/E2 protocols не переданы | Предоставить или явно разрешить разработку замены; согласовать provenance/приоритет |
| B2 | PROPOSED: A/B/C пакеты, C+ не определено | Принять/изменить условия и primary contrast; заморозить prompts |
| B3 | UNRESOLVED: tasks/repeats/strata/oracle | Выбрать точный corpus и допустимые ответы до генераций; отдельная независимая проверка |
| B4 | UNRESOLVED: primary taxonomy/aggregation/thresholds | Утвердить rubric, missingness и GO/ITERATE/NO-GO правила; решить судьбу DRAFT 50%/70% |
| B5 | UNRESOLVED: model/settings/provider/cost/time/calls | Назначить точные версии и пределы; не трактовать их отсутствие как unlimited |
| B6 | BLOCKED: harness/Facade/ScopeDiff/bindings/evidence infrastructure не реализованы по T1–T6 | Отдельно поручить необходимую реализацию и проверку; не объявлять архитектуру кодом |
| B7 | UNRESOLVED: reviewers/blinding/adjudication | Назвать проверяющих и критерии независимости; self-review маркировать отдельно |
| B8 | BLOCKED: E2-X transaction/CAS/undo/isolation | Отдельная реализация, independent verification, isolated test environment и разрешение на фактическое применение |
| B9 | UNRESOLVED: evidence storage/retention/data rights | Обеспечить доступные immutable artifacts и защиту oracle/raw |
| B10 | NOT GRANTED: launch authorization | Отдельное разрешение после G0, с experiment/version/stage и лимитами |

## 9. G0 Readiness Gate — предложенный допуск

Это **launch gate**, не результат E1/E2. Rule PROPOSED: обязательный FAIL или UNKNOWN блокирует запуск; N/A — только доказанная неприменимость конкретной стадии. Положительное архитектурное решение не компенсирует недостающую реализацию. Нужны раздельные records E1, E2-P и E2-X; успех P не разблокирует X.

| Область | Требуемое evidence | Фактический статус при подготовке T7 |
| --- | --- | --- |
| Архитектурные документы | Принятые T1–T6 и утверждённый T7 exact version | T1–T7 APPROVED на уровне архитектуры; только документарный пункт выполнен, запуск не разрешён |
| Baseline/runtime | Пин SHA, зависимости, доступный tested evaluator/runtime | Baseline SHA известен; свежая runtime готовность исследования UNKNOWN |
| Необходимые реализации | Работающие harness/Scope checks и требуемые Facade/context gates | BLOCKED, документы описывают будущие механизмы |
| Полные протоколы | FROZEN E1/E2 с подписью/digest | Не предоставлены/не заморожены |
| Fixtures/oracle | Независимо проверенный corpus, права, версия и hash | Есть examples, нет frozen research corpus/oracle |
| Независимость | Checker/oracle provenance, reviewers, blinding/adjudication | UNRESOLVED |
| Evidence | Run manifest, защищённое raw storage, integrity/readback, доступные журналы | Evidence architecture есть; pipeline не проверен |
| Безопасность E1/E2-P | Read-only права, isolated evaluation, лимиты, no arbitrary code | Требования APPROVED; исполнение/изоляция не проверены |
| Безопасность E2-X | Atomic coordinator, cancellation/idempotency/undo, disposable storage | BLOCKED; реальное Apply/rollback не разрешено |
| Разрешение владельца | Отдельный launch approval конкретной frozen версии и стадии | Отсутствует; дано только разрешение на проектирование |

**Текущая оценка G0: BLOCKED / NOT READY TO LAUNCH.** Это не исследовательский NO-GO. Даже последующий T1–T7 ACCEPTED не означает GO: реализации, frozen protocols, oracle, evidence, изоляция и запускное разрешение проверяются отдельно. Gates не обходятся пользовательским подтверждением invalid candidate; T2/T3 сохраняют приоритет обязательных проверок.

## 10. Критерии завершения T7 и границы

T7 завершён на уровне архитектурного проектирования после согласования владельцем разделения E1/E2-P/E2-X, статусов решений, предложений протоколов/manifest, методики без единого score, anti-cherry-picking политики, safety/stop rules, блокеров и G0. Неразрешённые поля могут остаться в принятом архитектурном документе как блокеры **freeze/launch**, но не как разрешённые defaults.

Сейчас: **T7 ACCEPTED от 04.11.2026; протоколы E1/E2 не FROZEN; исследования NOT RUN; Research outcome NOT ASSIGNED; G0 BLOCKED / NOT READY TO LAUNCH.** Новые fixtures, код, интеграции и результаты не создавались. Нет генераций, оценивания пилота, тестовых запусков, Apply/rollback, публикации или экспериментального Preview.

## 11. Контрольные суммы оснований

Внешний источник Research Registry «ЗАРЯ» v0.3.3 DRAFT.pdf находится вне репозитория и не включается в этот PR. Версия, дата, происхождение и SHA-256 сохранены ниже и в описании источника.

Прочитанные локальные T1–T6 — незакоммиченные ACCEPTED документы; digest фиксирует их точную версию. Registry остаётся внешним DRAFT источником. Полный пакет для будущего replay должен включать разрешённые копии этих bytes; ссылка на локальный путь не решает переносимость.

| Материал | SHA-256 |
| --- | --- |
| [ADR-001-source-neutral-design-system-contract.md](<ADR-001-source-neutral-design-system-contract.md>) | `12d666bf5c2a08e222950c0ee8614825420a13be1b3d4cb62a7c89243bcb8651` |
| [T2-unsupported-policy.md](<T2-unsupported-policy.md>) | `a5c0d3304ce31775150a79da4c2bbe3391b2dae9bf493daafdf6681a3d5b4c10` |
| [T3-validator-facade.md](<T3-validator-facade.md>) | `698fe47720335167ea891575ec56debc6b78e6092cdc49324e6cf22481e9457e` |
| [T4-coverage-inventory-metrics.md](<T4-coverage-inventory-metrics.md>) | `3f077358e825be7d3da0ff301a7bfac9f2457580130699c0c932dd6139501d26` |
| [T5-scopepatch-scopediff.md](<T5-scopepatch-scopediff.md>) | `1994354bd6be50c80203240cf17a4636bbf9f4b9c6f94fe96b78f1d26525f26f` |
| [T6-score-only-pilot-harness.md](<T6-score-only-pilot-harness.md>) | `b982c7389dd437701124cd2048b865513b7c89abf0ea400fa4d975a2b584a0eb` |
| Research Registry «ЗАРЯ» v0.3.3 DRAFT.pdf | `5aa82dcbd67c05bc825314f8265c67887ce40ae2c8094c21d4e33d613b051ab3` |

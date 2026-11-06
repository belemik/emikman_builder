# D0-RO — Read-only Decision Package для F1–F3

Статус: **DRAFT / на согласовании**. Дата: **05.11.2026**. Уточнение DRAFT: **06.11.2026**.
Все новые решения ниже — **PROPOSED**, не APPROVED. Реализация не разрешена этим документом.

## 1. Основания и неизменные границы

Основа: принятые [T1][], [T2][], [T3][], [T4][], [T5][], [T6][], [T7][] в main `e63f1446acf7cdfde617b9fbd9ec4ff18bbeab04` и локальный [G0 Gap Assessment](G0-gap-assessment-draft.md), ACCEPTED 05.11.2026. Контрольные суммы точных версий — §12. D0-RO конкретизирует кандидаты решений D0-R1/R2/R3, не переопределяет T1–T7 или действующий API.

**G0 E1/E2-P/E2-X: BLOCKED / NOT READY TO LAUNCH. E1/E2: NOT RUN; protocols NOT FROZEN; outcomes NOT ASSIGNED.** Принятие решений и разрешение implementation package — разные действия. Code modules, fixtures и unit tests могут быть разработаны по отдельному поручению, но не разрешают модельные генерации, исследования, Preview, Apply/rollback или production rollout.

Read-only scope: явно предоставленные фиксированные данные и in-memory результаты. Нет записи в рабочие Documents, localStorage/IndexedDB, файловую систему или сеть из resolver/adapter. Нет dynamic imports из JSON. Первый adapter — reader сохранённых WDeaf seeds, не интеграция Figma/Pixso/GitHub. Payload Screen Schema v3 не меняется.

## 2. Матрица вопросов и рекомендаций — PROPOSED

| ID / вопрос | Точные варианты | Последствия | Рекомендация | Зависимость / когда выбрать |
| --- | --- | --- | --- | --- |
| R1. IDs, версии, SHA-256 | A: displayName=ID; B: source-native глобальный ID; C: opaque library ID + definition ID внутри library, source locator отдельно | A даёт коллизии; B привязывает ядро к источнику; C требует явного identity manifest | C; upstream version, artifact digest и formatVersion различны | До F2/F3, не до первого syntax-only F1a |
| R2. Immutable Snapshot | A: mutable latest catalog; B: versioned manifest с exact refs raw/observations/contract/provenance | A скрыто обновляет документы; B воспроизводим при наличии артефактов | B; supplied immutable bytes/объекты в памяти, production store не выбирается | До F2 output/F3 |
| R3. Document Bindings | A: новые поля в v3; B: наследовать defaults при открытии; C: отдельный manifest + supplied context | A нарушает v3; B не закрепляет использованную версию; C требует внешнего lifecycle | C, пока только in-memory resolution; storage/transport позже | До F3; не prerequisite F1/F2 |
| R4. Observation/provenance | A: inferred props без raw; B: raw refs + source claims + uncertainty/conflicts | A теряет происхождение; B сохраняет границы знания | B, source/editor/runtime claims раздельно | До F2 |
| R5. JSON trust boundary | A: arbitrary object unknown; B: только JSON-текст без лимитов; C: primitive string + bounded policy inspection и отдельная будущая trusted admission boundary | A допускает Proxy/getters; B не ограничивает ресурсы; C требует явных стадий | C; первый PR не открывает json-value путь и не возвращает parsed object | D0-R1 до F1a/F1b |
| R6. Unknown/raw | A: удалить/нормализовать unknown; B: raw и uncertainty отдельно от разрешённой projection | A молча теряет данные; B не делает unknown исполнимым | B, no trim/default/coercion/rewrites | До F1–F3 |
| R7. Missing/ambiguous/revoked/mismatch | A: fallback/latest/name matching; B: structured unresolved/rejected facts | A подменяет контекст; B сохраняет UNKNOWN/FAIL | B, причины и paths/refs явно | До F3 |
| R8. WDeaf 1.3.0 | A: переписать Validator; B: объявить catalog нейтральным ядром; C: отдельный явный WDeaf profile/adapter | A ломает API; B сохраняет WDeaf coupling; C требует conformance | C рядом с существующим backend, без rollout | До F2/F3 |
| R9. Порядок F1→F2→F3 | A: большой PR с UI; B: pure modules и отдельные gates | A затрудняет review/откат; B позволяет поэтапную приёмку | B: завершённый F1a → F1b Policy Inspection → отдельно согласованный trusted admission → F2 → F3 | До первого implementation package |
| R10. Tests/evidence | A: happy path/моки PASS; B: adversarial fixtures и exact provenance | A скрывает блокеры; B проверяет ограниченную область | B; test mock не evidence наличия реального binding/CR | На каждый отдельный PR |

Новые рекомендации требуют подтверждения владельца. UNRESOLVED запрещено заполнять успешным default. Ограниченный F1a уже выполнен и MERGED; это не утверждает оставшиеся R1–R10 или решения F1b/F2/F3.

## 3. IDs, версии и digest (R1)

Рекомендуется opaque library identity в namespace владельца/издателя; definition identity = `(libraryId, definitionId)`. SourceId/locator сохраняются отдельно. Предлагаемый пример namespace `urn:zarya:library:<opaque-id>` — только форма, **реальные ID здесь не назначаются**. Figma node ID может быть locator, но не обязательным полем нейтрального ядра. DisplayName и сходство props не устанавливают identity. Переименование/перенос не выполняются автоматически.

Различать formatVersion, sourceRevision, upstreamLibraryVersion, mappingRevision, rendererRevision, implementationIntegrity и artifactDigest. Если source revision не предоставлена, хранить unknown/null с причиной, observed artifact digest и capture date отдельно. Дата не выдуманная upstream revision; SemVer не заменяет pinning.

Предлагаемый digest envelope: `{algorithm:'sha256', encoding:'hex-lower', value:<64 hex>, byteDomain:<declared domain>}`. Разные domains не считать эквивалентными:

- **git-blob:** точные bytes `git show <commit>:<path>`. Сохранить commit/path; это уже принятый подход для tracked источников.
- **raw-bytes:** exact bytes внешнего артефакта; mediaType/encoding — metadata. CRLF/LF/BOM/Unicode normalization не менять. Разрешённое преобразование создаёт новый artifact + transformation record с обоими digest.
- **utf8-text:** digest байтов, полученных TextEncoder из входной JavaScript string, без trim/пересериализации. Для произвольных JS-строк это не инъективное представление: lone UTF-16 surrogate заменяется при encoding на U+FFFD. Например, JS-строки `'"\uD800"'` и `'"\uFFFD"'` (JS escape notation, не два raw JSON escape-токена) различны по code units, но обе дают bytes `22 ef bf bd 22`. Их SHA-256 совпадёт из-за одинакового encoding, **не из-за криптографической коллизии SHA-256**. Digest не доказывает точную идентичность произвольной исходной JS-строки или исходных file bytes после decoding.

Для положительного повторно используемого F1b report предлагается обязательная проверка well-formed Unicode исходной JS-строки и decoded keys/string values (ASCII raw `"\uD800"` тоже требует decoded проверки). Raw не исправляется и не нормализуется. До trusted admission отдельно согласовать byte/code-unit domain, правила Unicode, связь report с exact raw и policy version. Варианты для произвольных UTF-16 данных — отдельный согласованный code-unit encoding/domain либо отказ в reusable positive report; молчаливая замена не допускается. Byte-ingest/invalid UTF-8 policy остаются отдельной будущей границей.

Snapshot manifest хешировать по его exact serialized bytes. Минимальная версия не вводит JCS или semantic JSON canonicalization: другие whitespace могут дать другой digest, resolver не пересериализует вход для объявления эквивалентности. Signature/global trust service не выбирается сейчас. Digest подтверждает целостность, а не безопасность кода, авторство или истинность claims. F3 применяет явно предоставленную read-only trust policy, иначе trust UNKNOWN.

## 4. Минимальный snapshot и внешний binding (R2/R3)

Предлагаемые структуры — логическая in-memory модель, не формат production storage и не изменение T3 runtime types:

```ts
type ArtifactRef = {
  artifactId: string; formatVersion: string;
  digest: { algorithm: 'sha256'; encoding: 'hex-lower';
    value: string; byteDomain: 'git-blob' | 'raw-bytes' | 'utf8-text' };
};
type SnapshotManifest = {
  formatVersion: 'snapshot-draft-1';
  libraryId: string;
  sourceObservations: ArtifactRef[];
  contract: ArtifactRef;
  provenance: ArtifactRef;
  upstreamVersion: string | null;
  uncertaintyRefs: ArtifactRef[];
};
```

SnapshotRef указывает на manifest bytes; собственный digest не вкладывается в хешируемое содержимое manifest. Exact schema/version принимаются до F2/F3. Snapshot не содержит functions/import URLs/hooks/style expressions. Mapping/capability/runtime/evidence — отдельные records T1, не единый значок «готово». Read-only копии и отсутствие mutation API не доказывают immutable production retention.

Внешний Document Binding концептуально содержит Document identity/base revision и digest domain, exact library snapshot/runtime binding/mapping/capability refs, provenance выбора профиля и resolution policy scope. Runtime binding различает implementation build/integrity/dependencies/assets/fonts и renderer revision; отсутствующие сведения не выдумываются. Ни одно из этих полей не добавляется в v3.

F3 получает supplied document + binding + fixed artifact set + explicit policy. Нет чтения Project defaults, localStorage или network. Metadata profile не выдаётся за полный runtime binding. Если разрешены только metadata refs, результат partial/unresolved для runtime, не render permission.

Legacy standalone JSON без binding: raw сохраняется, контекст unresolved. Для явно распознанного WDeaf можно предложить пользователю выбор профиля, но F3 не выбирает его сам. Пользовательское указание происхождения — assertion, не независимое доказательство. Совпадение component names не распознавание. Неоднозначность требует явного решения; original доступен.

Document identity не равна одному content hash: hash изменяется при правке. F3 проверяет переданную связь именно с revision; постоянное хранение/упаковка/передача остаются D0-S. Unit tests resolver не доказывают будущий lossless перенос Documents.

## 5. Observation и подключение WDeaf (R4/R8)

Предлагаемый observation: sourceId/provider kind, source-native identity/locator, revision или явное unknown, capturedArtifact ref, capture time как metadata, method/version reader, raw claim path/value и статус observed/unknown/conflicting. Точный vocabulary/schema — до F2.

Нормализация — перевод подтверждённых фактов в нейтральные записи с исходными именами, а не достраивание props. Source observed variants, editor content, runtime interactionState и принятые composition constraints различаются. Unknown fields/instance swaps/descriptions сохраняются в raw/uncertainty; в разрешённую contract projection не попадают. Enum lists не дают декартово произведение допустимых variants.

Рекомендуемый порядок WDeaf:

1. Pin bundled seeds/captures/composition rules к baseline и byte-domain digest. Не делать live queries и не добавлять семейства.
2. Reader переводит metadata/uncertainty в observations. Сохраняются исходные IDs/locators; TagGroup.amount — строки '1'/'2'. Editor label не объявляется Figma property; generated TagMore не материализуется как JSON slot.
3. Отдельный explicit WDeaf profile использует Contract 1.3.0 и текущий Validator, не меняя strict/compatible API и codes. Neutral types не зависят от WDeaf ComponentId union.
4. F3 разрешает профиль только явно. Baseline profile — candidate до подтверждения origin/suitability; не автоматически профиль всех legacy JSON.
5. SourceNode/libraryNode — ограниченные backend facts, не полноценные CR/mapping/runtime records. Недостаток evidence остаётся UNKNOWN; snapshot не присваивает CR3.

Полный Facade F6/review F5/rollout — отдельные задачи. F1–F3 не заменяют существующий import/save/render pipeline.

## 6. JSON trust boundary и raw (R5/R6)

Рекомендуется разделять три границы, не смешивая завершённый F1a с будущими механизмами:

- **F1a: raw + bounded syntax inspection.** Только primitive string, exact raw, UTF-8 size check и проверка синтаксиса. Parsed object наружу не передаётся. Syntax-valid не означает semantic admission, DS validity или context/render permission.
- **F1b: Policy Inspection (PROPOSED).** Полная bounded lexical/structural/numeric проверка, включая duplicate decoded keys, Unicode и resource counters, возвращает безопасный report без parsed value. `policy checked` не является semanticAdmission, DS validity, CR3 или Apply permission.
- **Будущий trusted JSON admission/value для F2 (PROPOSED, отдельная граница).** До создания trusted value отдельно согласовать exact API, policy version, привязку к exact raw и immutable representation. Успех F1b не создаёт trusted value автоматически. Нельзя передавать F2 непроверенный JSON через cast, mock или обычный объект вызывающей стороны; F1a syntax-only и F1b policy report не заменяют admission.

Недоверенные объекты/Proxy/boxed String/getters/functions/Symbols отклоняются через typeof без обхода свойств, String(), JSON.stringify или другого code execution. Публичного json-value пути первого PR нет. Тип unknown позволяет отклонить неподходящее значение, не делает его безопасным. Будущий trusted internal value требует границы T3; JSON никогда не выбирает executable backend.

**F1a выполненные правила (MERGED в main `39da45f542da484d9418d8a60a8ef36c7556b253`):** max 2_000_000 UTF-8 bytes, как текущий parser limit; no trim/BOM removal/Unicode или CRLF normalization. Строковый raw сохраняется exact и при rejected. Пустой/malformed/BOM-prefixed JSON не исправляется автоматически. Если rawText.length > maxBytes, можно отказать до TextEncoder allocation, не выдумывая точный byte count; иначе измерить TextEncoder. Для уже установленного oversized input JSON.parse не вызывается. Это не ограничивает память уже переданной строки: transport limits остаются отдельной будущей границей.

JSON.parse без reviver в F1a используется только как syntax check; результат не возвращается, не сливается с объектами и не передаётся далее. Native exception text не выдаётся, чтобы не раскрыть raw fragments. F1a **не** обнаруживает duplicate decoded keys/IEEE-754 rounding и не гарантирует полную защиту от parser resource exhaustion. Эти ограничения открыто фиксируются; F1a не объявляется завершённым F1.

**Кандидат F1b для отдельного решения:** depth=64 (root=0), <=100_000 JSON values, duplicate keys после decoding escapes отклонять. Лимиты нового ingress не меняют composition depth/500 elements WDeaf. Numeric policy finite/precision и bounded lexical preflight **UNRESOLVED до F1b**: 1e400, unsafe integers и numeric lexeme changes не выдаются за lossless proof. Exact raw остаётся доступным. Завершённый F1a не экспортирует parsed value и не доказывает эти проверки. Balanced остаётся PROPOSED: точные thresholds утверждаются только после compatibility review существующих WDeaf fixtures, разрешённых legacy/import документов, граничных тестов и измерений заявленной среды, если обещаются CPU/memory ограничения. Неподтверждённые limits не разрешают автоматическое изменение или удаление исходных данных. Подробности — [F1b policy](F1b-json-safety-policy-draft.md).

__proto__/constructor/toString могут быть обычными raw JSON keys; синтаксическая допустимость не разрешает их как component ID или object merge. Raw не очищается. Downstream layers используют own-key/closed schemas; existing Validator по-прежнему отклоняет неизвестные компоненты.

Unknown/raw сохраняются отдельно от разрешённой projection. Нельзя обеспечить «unknown preservation» разрешением произвольных полей v3. JSON.stringify не используется как замена exact original: whitespace/keys/numeric lexemes могут измениться. Успех read-only функций не обещает durable backups. Существующие JSON, slots/tokenReferences/Select state/overrides/storage keys не мигрируют при появлении новых модулей.

## 7. Недоступные и недопустимые bindings (R7)

| Установленный факт | Предлагаемый resolver result | Будущий обязательный gate |
| --- | --- | --- |
| Required binding не передан | unresolved / missing | UNKNOWN context, BLOCK исполнения |
| Exact ref есть, bytes недоступны | unresolved / unavailable | UNKNOWN; не «компонент отсутствует» |
| Несколько candidates без выбора | unresolved / ambiguous | UNKNOWN, показать различия без name matching |
| Digest/type/version/document revision не совпадает | rejected / mismatch | FAIL integrity/compatibility |
| Explicit supplied policy отозвала trust | rejected / revoked | FAIL trust, original доступен |
| Trust/provenance неизвестны | unresolved / trust-unknown | UNKNOWN, digest недостаточен |
| Metadata разрешены, runtime/evidence отсутствуют | partial с reasons на каждую часть | Не structure/capability/readiness PASS |
| Required refs resolution profile разрешены | resolved-for-profile | Только resolution данного profile, не Facade STRICT_ALLOWED |

Эти reason labels — проект внутреннего resolver, не внедрение UNSUPPORTED_* или переименование native Validator codes. Будущий Facade переводит facts/reasons в этапы T3. Отсутствующая trust policy не значит «доверять всем». Revocation policy фиксированно передаётся доверенным caller; сетевые подписи/автообновления не реализуются. Scope/approval/rendering не обходятся успешным resolved-for-profile.

## 8. Интерфейсы и порядок (R9)

```text
F1a syntax inspection — MERGED в main 39da45f542da484d9418d8a60a8ef36c7556b253
Утверждение F1b policy → отдельные inspection packages → полный policy report
Полный F1b report + отдельно согласованный trusted admission API → trusted value
R1/R2/R4/R8 + реализованный trusted admission → F2
R1/R2/R3/R7/R8 + F2 → F3
Успех F1–F3 ≠ Facade/CR3/Apply/G0 PASS
```

Будущие интерфейсы: F1b Policy Inspection (имя/сигнатура PROPOSED), отдельный trusted admission API (UNRESOLVED), observeWDeafArtifacts (F2), resolveReadonlyContext (F3). F2 принимает только данные через согласованную и реализованную trusted boundary и pinned source metadata; F3 — observations/snapshot refs + external binding + explicitly supplied artifacts/policy. Сигнатуры/manifest schemas согласуются до соответствующего PR. Cast, mock, caller object или TypeScript marker не доказательство admission.

### 8.1. Небольшие будущие пакеты — PROPOSED

| Пакет | Зависимость и ограниченная область приёмки |
| --- | --- |
| F1B-I01 | Принятые grammar/counter rules и budgets: bounded tokenizer/grammar + structural counters; grammar/limits tests; остальные checks UNKNOWN, общего checked нет |
| F1B-I02 | I01 + принятые duplicate/Unicode rules: decoded keys, raw/decoded Unicode, boundary tests; numeric check отдельно |
| F1B-I03 | I01 + утверждённый numeric profile: bounded numeric checks/oracle; может разрабатываться независимо от I02, не выдаёт общий checked |
| F1B-I04 | I01+I02+I03, утверждённые version/domain: итоговый policy report, coverage каждого обязательного check; только все PASS дают checked; FAIL/UNKNOWN/отсутствующая проверка блокируют positive report |
| TA-01 (последующая граница) | I04 + отдельное согласование exact API, policy/raw binding и immutable representation; negative tests forged/stale/caller objects; только после реализации этой границы возможен вход F2 |

Подробное разбиение и evidence — [F1b §6.3](F1b-json-safety-policy-draft.md#63-независимо-проверяемые-implementation-packages--proposed). Каждый пакет требует отдельного разрешения. Частичный механизм не может возвращать общий PASS или автоматически пропускать UNKNOWN.

При частичном согласовании D0-RO закрываются только выбранные решения. Неоткрытая зависимая функция остаётся BLOCKED, но не блокирует sibling pure functions. Production storage, Apply authority и E1/E2 freeze не prerequisites syntax-only F1a.

## 9. Исторический первый implementation package: F1a (ВЫПОЛНЕН / MERGED)

### 9.1. Только три новых файла

Первоначальный пакет сохранён ниже как история scope. Он выполнен в PR #5 `feat: add read-only JSON text inspection (F1a)`, squash merge в main `39da45f542da484d9418d8a60a8ef36c7556b253`. Это не предстоящий PR и не разрешение новой реализации.

- src/readonly/ingest.types.ts — локальные result/types без WDeaf union.
- src/readonly/inspect-json-text.ts — pure function без React/storage/FS/network.
- tests/json-ingest.test.ts — unit/negative tests.

Историческое ограничение пакета перед реализацией: проверить свободность путей относительно baseline main. Existing package.json/lockfiles/tsconfig/CI, barrel exports, src/main.tsx, src/design-system/*, Renderer, seeds, v3 и документы не меняются. Root tsconfig уже включает src; npm test включает tests/*.test.ts, поэтому новые scripts/dependencies не нужны. Импорт нового модуля разрешён только прямо в его тестах, не в работающем UI/import/save/render.

### 9.2. Публичный API выполненного первого PR

```ts
export const JSON_TEXT_MAX_BYTES = 2_000_000;
export type JsonInspectionIssue = {
  code: 'INGEST_INPUT_TYPE' | 'INGEST_SIZE' | 'INGEST_SYNTAX'
    | 'INGEST_INTERNAL';
  path: '';
  message: string; // fixed safe message, без raw/stack
};
export type JsonTextInspection =
  | { kind: 'syntax-valid'; rawText: string; utf8Bytes: number;
      semanticAdmission: 'NOT_EVALUATED' }
  | { kind: 'rejected'; rawText: string | null; utf8Bytes: number | null;
      semanticAdmission: 'NOT_EVALUATED'; issue: JsonInspectionIssue };
export function inspectJsonText(input: unknown): JsonTextInspection;
```

При non-string rawText=null/bytes=null. При строковом rejected rawText exact; bytes известны, если измерены, иначе null (ранний размерный отказ). Allocation/internal exception → safe diagnostic; перехват process OOM не обещается. Синтаксические root primitives/null/array/object допустимы, но не проверяются как Screen. Никакого value поля с parsed объектом: даже duplicate-key syntax-valid остаётся NOT_EVALUATED. Codes нового модуля не меняют native Issue/T3 API и не утверждают реализацию Facade.

### 9.3. Точные критерии приёмки / unit и negative tests

| Проверка первоначального пакета | Ожидаемый результат |
| --- | --- |
| Валидные JSON root types | syntax-valid, exact raw, правильный utf8Bytes, NOT_EVALUATED, parsed value отсутствует |
| Whitespace/CRLF/escaped Unicode | Raw не изменён, нет trim/пересериализации |
| Empty/malformed/trailing garbage/BOM prefix | INGEST_SYNTAX, исходный raw и fixed safe message |
| Валидный JSON ровно 2_000_000 bytes и +1 byte | Ровно предел синтаксически проходит; +1 → INGEST_SIZE; отдельный multibyte case |
| Object/number/Symbol/function/boxed String/Proxy input | INGEST_INPUT_TYPE без сериализации/обхода; getter/Proxy trap counters =0 |
| Prototype-like keys внутри raw | Raw сохранён, prototypes не изменены; component validity не заявляется |
| Duplicate key / крупное число в JSON | Только syntax inspection, без authoritative parsed value/DS validity |
| Повтор одинакового raw | Детерминированный semantic result, без random ID/timestamp/storage effects |
| Ошибки | Нет raw fragments, stack или выполнения content в diagnostic |

Исторический план приёмки: review отсутствия runtime integration/write handles; typecheck, npm test, ds:validate, build/check:pages и CI. F1a уже реализован и MERGED; в согласованном отчёте перед PR: 15/15 F1a PASS, общий suite 53 TS + 2 auth PASS, TypeScript и DS validation PASS; CI PR #5 принят владельцем. Это исторические сведения, не новые запуски при редактировании D0-RO. Регрессии не превращаются в research evidence или CR3; snapshots не обновляются.

### 9.4. Совместимость и rollback самого code PR

F1a не закрывает весь F1; полная numeric/duplicate/depth policy inspection и отдельная trusted admission boundary — blockers перед F2. Syntax-valid не равно Validator success или approval. Нельзя подключать модуль к Document mutation ради демонстрации.

Existing JSON v1/v2/v3, IDs/slots/tokens/state/overrides и storage keys не изменяются. Нет migrations или новых props. Наличие модуля не меняет auth, Theme Editor, Canvas и server/Pages behavior.

Rollback strategy: прекратить adoption; при необходимости отдельным согласованным обычным revert commit отменить только три новых файла. Runtime integration отсутствует, поэтому user data migration/восстановление проектов не требуется. Без reset/force/history rewrite. Это стратегия отмены code PR, а не разрешение Apply/rollback; команды сейчас не выполняются.

## 10. Минимальный negative evidence plan следующих PR (R10)

| Этап | Негативные кейсы | Evidence / запрет ложного PASS |
| --- | --- | --- |
| F1b | Duplicate decoded keys, depth/nodes, numeric overflow/precision по принятой policy, malformed escapes, immutability | Versioned unit fixtures для policy report без parsed output; не arbitrary JS security claim |
| Trusted admission (будущий TA-01) | Forged/edited raw, wrong policy version/domain, caller object/cast/mock, mutable representation | Отдельно утверждённый API; только проверенный exact raw, нет автоматического допуска по report |
| F2 | Unknown props/variants/tokens, conflicting observations, ложный enum Cartesian product, source/editor подмена | Pinned input/expected observations и uncertainty; новый allowlist не придумывается |
| F3 | Missing/ambiguous/unavailable/revoked/mismatch, wrong digest domain/version/document revision, попытка latest/name fallback | Fixed supplied artifacts и policy; expected UNKNOWN/FAIL; нет remote fetching |
| WDeaf conformance | Internal roots/slots, string amount, legacy raw, Select state/tokenReferences | Existing tests + точная новая adapter matrix, не переименование primitive tests в CR3 |
| Все | Replay, input raw/digest unchanged, no FS/storage/network writes, безопасная диагностика | Exact versions/SHA/checker/environment и результаты. Test mocks не реальные production bindings |

Кодовые fixtures/oracle согласуются независимо от research corpus по H2-A/H1/H2-B принятого G0 отчёта. Нет автоматического FROZEN protocol/launch и нет research outcome по одному зелёному unit run.

## 11. Отложенные решения и моменты принятия

| Вопрос | Когда обязателен | Чего не блокирует |
| --- | --- | --- |
| D0-S production transactional storage/transport | До S1(P), durable Document context и S4/S5, с migration/retention/privacy guarantees | Pure F1/F2 и in-memory F3/S1(R) в принятом scope |
| Atomic Apply/CAS/undo | После D0-S, до W1/E2-X с actual writes и verified isolation | Syntax inspection/observations/resolution/non-executable diff |
| D0-A Human Approval authority | До exact A1/W1 и write/execution permissions | Pure ingest/context inspection; supplied trust не approval |
| Model AI Provider | До U2/model calls; выбрать rights/limits отдельно | Все F1–F3 и deterministic unit tests |
| Полный Workspace UX | До rollout Project/Work/Document/Chat и persistent lifecycle | Явно переданные external identities/context в памяти; current Workspace не меняется |
| E1/E2 protocols/metrics/budget/reviewers | До freeze → отдельный G0 → launch authorization | Отдельно согласованные modules/fixtures/tests, но не real research |

Не принятая критическая зависимость блокирует соответствующий механизм. Отложенное storage/authority решение не разрешает placeholder production реализацию. Ни один из этих вопросов не решается досрочно данным DRAFT.

## 12. Версии оснований

T1–T7 — exact main commit; G0 — локальный ACCEPTED report, не закоммичен. Эти ссылки не подменяют старые локальные копии T1–T7. Canonical tracked bytes — Git blob; внешние raw domains различаются по §3.

| Основание | SHA-256 |
| --- | --- |
| [T1: ADR-001-source-neutral-design-system-contract.md](https://github.com/belemik/emikman_builder/blob/e63f1446acf7cdfde617b9fbd9ec4ff18bbeab04/docs/ADR-001-source-neutral-design-system-contract.md) | `12d666bf5c2a08e222950c0ee8614825420a13be1b3d4cb62a7c89243bcb8651` |
| [T2: T2-unsupported-policy.md](https://github.com/belemik/emikman_builder/blob/e63f1446acf7cdfde617b9fbd9ec4ff18bbeab04/docs/T2-unsupported-policy.md) | `a5c0d3304ce31775150a79da4c2bbe3391b2dae9bf493daafdf6681a3d5b4c10` |
| [T3: T3-validator-facade.md](https://github.com/belemik/emikman_builder/blob/e63f1446acf7cdfde617b9fbd9ec4ff18bbeab04/docs/T3-validator-facade.md) | `698fe47720335167ea891575ec56debc6b78e6092cdc49324e6cf22481e9457e` |
| [T4: T4-coverage-inventory-metrics.md](https://github.com/belemik/emikman_builder/blob/e63f1446acf7cdfde617b9fbd9ec4ff18bbeab04/docs/T4-coverage-inventory-metrics.md) | `3d2b2602e1d79eb41f8bc4cc7d7c4b747e80f0a3b4c18ae6cf44690da0d267ea` |
| [T5: T5-scopepatch-scopediff.md](https://github.com/belemik/emikman_builder/blob/e63f1446acf7cdfde617b9fbd9ec4ff18bbeab04/docs/T5-scopepatch-scopediff.md) | `cd34ca4bb32e46c06c8751e952bd497230fb35b99000d1796d277438db25bc19` |
| [T6: T6-score-only-pilot-harness.md](https://github.com/belemik/emikman_builder/blob/e63f1446acf7cdfde617b9fbd9ec4ff18bbeab04/docs/T6-score-only-pilot-harness.md) | `cec9db23fe78577a6c7ed12457914401eab972734add0c0ac013d0dab9305930` |
| [T7: T7-pilot-preregistration.md](https://github.com/belemik/emikman_builder/blob/e63f1446acf7cdfde617b9fbd9ec4ff18bbeab04/docs/T7-pilot-preregistration.md) | `95adbb89bccfe531c447b9644eed11c74bc0646afa0254763ff8e0c601a21853` |
| [G0 Gap Assessment](G0-gap-assessment-draft.md) | `d611f6d9dbe381928d6fd6f57214f26bc7466addd7a126fa62f2f8662db64e67` |

## 13. Решение владельца, необходимое дальше

Предлагается принять/изменить оставшиеся R1–R10 с явными границами частичного согласования. **Ни одно новое решение не отмечено APPROVED.** F1a уже MERGED в main `39da45f542da484d9418d8a60a8ef36c7556b253`; исходный пакет §9 сохранён как выполненный этап. Направление F1a → F1b → F2 → F3 принято владельцем, но точные решения F1b/F2/F3 остаются PROPOSED. F1b Policy Inspection и последующая trusted admission boundary разделены; реализация каждой требует своего согласования.

**Итог: D0-RO DRAFT / на согласовании.** Следующий кандидат — отдельные небольшие F1b packages (§8.1), не повторный F1a PR. F2/F3 и реальный write path не запускаются; G0 BLOCKED / NOT READY TO LAUNCH, E1/E2 NOT RUN, protocols NOT FROZEN. Реализация, Git-запись и любые исследовательские/исполняемые действия этим документом не разрешаются.

[T1]: https://github.com/belemik/emikman_builder/blob/e63f1446acf7cdfde617b9fbd9ec4ff18bbeab04/docs/ADR-001-source-neutral-design-system-contract.md
[T2]: https://github.com/belemik/emikman_builder/blob/e63f1446acf7cdfde617b9fbd9ec4ff18bbeab04/docs/T2-unsupported-policy.md
[T3]: https://github.com/belemik/emikman_builder/blob/e63f1446acf7cdfde617b9fbd9ec4ff18bbeab04/docs/T3-validator-facade.md
[T4]: https://github.com/belemik/emikman_builder/blob/e63f1446acf7cdfde617b9fbd9ec4ff18bbeab04/docs/T4-coverage-inventory-metrics.md
[T5]: https://github.com/belemik/emikman_builder/blob/e63f1446acf7cdfde617b9fbd9ec4ff18bbeab04/docs/T5-scopepatch-scopediff.md
[T6]: https://github.com/belemik/emikman_builder/blob/e63f1446acf7cdfde617b9fbd9ec4ff18bbeab04/docs/T6-score-only-pilot-harness.md
[T7]: https://github.com/belemik/emikman_builder/blob/e63f1446acf7cdfde617b9fbd9ec4ff18bbeab04/docs/T7-pilot-preregistration.md

# F1b — JSON Safety Policy / Decision Review

Статус: **DRAFT / на согласовании**. Дата: **06.11.2026**.
Новые правила и численные пороги: **PROPOSED**, не APPROVED. Политика не реализована; тесты ниже — план, не результаты запуска.

## 1. Основания и границы

Основа: принятые T1–T3 в [архитектурной поставке](https://github.com/belemik/emikman_builder/tree/e63f1446acf7cdfde617b9fbd9ec4ff18bbeab04/docs), [G0 Gap Assessment](G0-gap-assessment-draft.md), [D0-RO](D0-readonly-decision-package.md) и [F1a в main 39da45f](https://github.com/belemik/emikman_builder/tree/39da45f542da484d9418d8a60a8ef36c7556b253/src/readonly). F1a — завершённая syntax-only функция; её API, `semanticAdmission: NOT_EVALUATED`, 2_000_000 UTF-8 bytes и отсутствие parsed output остаются без изменений.

F1b Policy Inspection — предлагаемая полноценная bounded lexical/structural/numeric проверка raw JSON с безопасным отчётом, без parsed output. `policy checked` не является semanticAdmission, DS Contract validity, Renderer Capability, CR3, G0 PASS или разрешением Apply. Последующая trusted JSON admission/value boundary для F2 — отдельный будущий механизм: до создания value согласуются exact API, policy version, связь с exact raw и immutable representation. F2 нельзя передавать непроверенный JSON через cast, mock или обычный объект вызывающей стороны. В этой корректировке меняются только два DRAFT-документа: D0-RO и F1b.

**G0 BLOCKED / NOT READY TO LAUNCH; E1/E2 NOT RUN; protocols NOT FROZEN.** Код, зависимости, принятые T1–T7/G0, исходные raw, CI/Pages и Git не меняются. Не запускаются исследования, модели, Preview или Apply/rollback.

### 1.1. Подтверждённые технические основания

JSON.parse перезаписывает более ранние значения одноимённого ключа; разбор конечного объекта уже не восстанавливает все исходные occurrences. Обычного reviver недостаточно для полной duplicate-проверки. Это основание для raw-анализа, а не новый дефект F1a, который намеренно возвращает только текст. [ECMAScript JSON.parse](https://tc39.es/ecma262/multipage/structured-data.html#sec-json.parse)

RFC рекомендует уникальные имена и описывает различия duplicate handling. Сравнение должно учитывать decoded escape sequences. RFC допускает implementation limits; описывает interoperability-риск unpaired surrogates. Рекомендуемые ниже thresholds и Unicode policy — решения ЗАРЯ, не требования стандарта. [RFC 8259 §§4, 8.2–9](https://www.rfc-editor.org/rfc/rfc8259)

Number.MAX_SAFE_INTEGER = 9_007_199_254_740_991; соседние большие integer literals могут совпасть после преобразования. Поэтому isSafeInteger/finite результата не заменяют проверку исходной лексемы. [ECMAScript Number](https://tc39.es/ecma262/multipage/numbers-and-dates.html#sec-number.max_safe_integer)

## 2. Decision Matrix

Обозначения **F1B-P01–F1B-P09** — локальные PROPOSED policy decisions этого DRAFT. Они не являются продуктовым Decision Log D-1…D-7 и не переопределяют его записи.

| ID | Вопрос / варианты | Рекомендация (PROPOSED) | Последствия / решение владельца |
| --- | --- | --- | --- |
| F1B-P01 | Duplicates: reject; warn+last/first wins; сохранять ordered member list | Reject для interpret-able candidate; raw-only diagnostic view сохранять | Утвердить reject, включая вложенные объекты; не вводить неявный выбор значения |
| F1B-P02 | Equality: raw lexeme; decoded exact; decoded+NFC/casefold | Decoded exact UTF-16 sequence; не нормализовать имена | Утвердить различие escape-equivalent и canonically Unicode-equivalent имён; §3 |
| F1B-P03 | Numbers: finite-only; exact binary64; decimal round-trip + safe integers; lossless token representation | Для будущего Number-compatible профиля — round-trip policy N3 (§4), альтернативно token-only для точного decimal use | Нельзя выбрать автоматически; решение N3 не обещает exact decimal arithmetic |
| F1B-P04 | Negative zero: allow/preserve; normalize; reject | Reject lexical negative zero, не переписывать в 0 | Может отказать данным, которые F1a принимает; требуется отдельное утверждение |
| F1B-P05 | Unpaired surrogate: allow JS-only; replace; reject для интерпретации | Reject unpaired в исходной JS-строке и decoded keys/values до положительного reusable report; raw сохранить | Новое ограничение F1b, не изменение F1a syntax result; без U+FFFD normalization |
| F1B-P06 | Limits: compact / balanced / expanded | Balanced-кандидат §5 | Только после compatibility review WDeaf/разрешённых legacy/import fixtures, boundary tests и benchmark для заявленных CPU/memory гарантий |
| F1B-P07 | Resource control: deterministic counters; только timeout; counters+isolated deadline | Counters обязательно, deadline как отдельный внешний guard | Hard deadline требует реально изолированного исполняющего контекста; численные SLO до benchmark UNRESOLVED |
| F1B-P08 | Parser: post-parse walk; regex; raw tokenizer+bounded parser; новая библиотека | Локальный bounded iterative raw parser/preflight с differential conformance plan | Не устанавливать зависимость; review grammar/complexity обязателен, код не пишется здесь |
| F1B-P09 | Output: ordinary valid=true; policy-only report; automatic trusted value | Policy-only report, separate stage fields, no automatic admission | Exact public API и механизм будущего trusted value согласовать отдельно |

Никакой default policy по отсутствующему решению. До реализации выбранного профиля нужно явно утвердить его version/hash, numeric/Unicode/limit semantics. Partial approval не разрешает обход unresolved правила в зависимой функции.

## 3. Duplicate keys и Unicode

### 3.1. Варианты и область проверки

- **Reject:** candidate с повтором не допускается к дальнейшей интерпретации; raw остаётся доступным. Устраняет last/first-wins ambiguity, но строже syntax-only F1a.
- **Warning + выбранная семантика last/first wins:** нужно явно выбирать значение и фиксировать потерю остальных. Риск скрытой подмены props/permissions; предупреждение не предотвращает потерю. Не рекомендуется для разрешающего пути.
- **Ordered member/token representation:** сохранить все occurrences как список с позициями, не ordinary JS object. Полезно для diagnostic inspection, но все downstream consumers должны понимать такую модель; это не автоматическая совместимость с v3/Validator.

Рекомендация F1B-P01: reject duplicates для policy-approved interpretation; отдельно можно анализировать raw для объяснения ошибки, без выдачи применимого объекта. Никакого silent dedupe. Повтор проверяется **внутри каждого объекта**, включая вложенные и объекты в массивах. Одинаковые keys в разных объектах допустимы. Duplicate с одинаковым значением тоже duplicate.

### 3.2. Что считать одинаковым ключом

| Пример raw JSON | Decoded equality / рекомендуемое поведение |
| --- | --- |
| `{"a":1,"a":2}` | Duplicate, reject |
| `{"a":1,"\u0061":2}` | Тот же decoded key, reject |
| `{"a\\b":1,"a\u005Cb":2}` | Две записи одного backslash-containing key, reject |
| `{"😀":1,"\uD83D\uDE00":2}` | Одинаковая decoded surrogate pair, reject |
| `{"é":1,"\u00e9":2}` | Одинаковый decoded key, reject |
| `{"é":1,"e\u0301":2}` | Разные decoded sequences; не duplicate по F1B-P02, без NFC-преобразования |
| `{"A":1,"a":2}` / Latin/Cyrillic look-alike | Разные keys; никакого casefold/confusable merge |
| `{"x":{"a":1},"y":{"a":2}}` | Разные owners, допустимо по duplicate policy |

Raw spelling/hex case/escape decoding учитываются строго по JSON grammar. F1B-P02 предлагает сравнивать decoded UTF-16 code units для JS interoperability, не raw token bytes. **Канонически эквивалентные Unicode последовательности — отдельное решение:** альтернативы — reject NFC-collision либо warning. Они могут давать ложные коллизии source identities; не предлагается включать их неявно. Если владелец выберет NFC collision detection, это дополнительное правило, не перепись key/raw.

Per-object key set хранить в безопасном Map/Set, не в обычном dictionary с prototype lookup. `__proto__`, `constructor`, `toString` как одиночные имена — данные; их нельзя исполнять/мерджить в prototypes. Они проверяются на дубли как остальные. Позднейшие закрытые schemas могут отклонить их по своему контракту. F1b не меняет contract allowlist.

### 3.3. Surrogates и сохранность

F1a уже принимает одиночный UTF-16 surrogate внутри синтаксически допустимой JSON-строки и сохраняет JS text. F1B-P05 предлагает для F1b проверять well-formed Unicode исходного JS-текста и отличать valid high+low pair от lone high/low после escape decoding, отклоняя одиночный surrogate в key/value. Альтернатива — сохранять JS-only diagnostic inspection с предупреждением, но без положительного reusable report/trusted admission в utf8-text domain; замена на U+FFFD не рекомендуется, поскольку меняет данные и может создать key collision. Ни один вариант пока не утверждён.

#### Digest domain и повторное использование результата

TextEncoder заменяет lone UTF-16 surrogates на U+FFFD. Например, две **JS-строки в JS escape notation**:

```js
const a = '"\uD800"'; // quotes + lone high surrogate + quotes
const b = '"\uFFFD"'; // quotes + U+FFFD + quotes
```

`a !== b`, но обе кодируются в UTF-8 bytes `22 ef bf bd 22` и имеют одинаковый SHA-256 этих bytes. Это коллизия представления при encoding, не криптографическая коллизия SHA-256. Не путать `a` с raw JSON-текстом, содержащим шесть ASCII символов `\uD800`: его UTF-8 bytes другие, но decoded string всё равно содержит lone surrogate.

Для **положительного F1b report, допускающего повторное доверенное использование**, предлагается обязательный gate: well-formed Unicode исходной JS-строки **и всех decoded keys/string values** после escapes. Проверка только raw недостаточна для `"\uD800"`; проверка только decoded не даёт точного определения исходного string domain. При lone surrogate report не получает reusable `checked`; raw остаётся исходным, без замены на U+FFFD/NFC или иной нормализации. До утверждения этой policy отсутствующая проверка означает UNKNOWN, не автоматический PASS.

`utf8-text` digest не доказывает идентичность произвольной JS-строки по code units или исходного файла после decoding. Для будущего trusted value отдельно выбираются byte/code-unit domain и правила привязки: (A) well-formed raw + явно определённый UTF-8 domain; (B) отдельное обратимое code-unit encoding/domain для произвольных UTF-16 данных. B не реализован и не одобрен этим DRAFT. Один digest без domain/policy/raw binding не даёт reusable trust; даже well-formed raw digest не доказывает, что Unicode/остальные проверки были выполнены. SHA-256 оснований §11 относится к exact bytes документов, а не произвольному JS input.

Диагностика указывает owner path и spans первой/повторной записи без автоматического раскрытия самих секретных ключей/значений в logs. Public error может использовать только offsets/безопасный code. Все raw occurrences сохраняются в original, не удаляются ради ошибки.

## 4. Numeric precision: варианты, правила и примеры

### 4.1. Сравнение профилей

| Профиль | Правило | Последствия |
| --- | --- | --- |
| N1 finite-only | Принимать всё, что стало finite Number | Теряются 9007199254740993 и long decimals; underflow до 0 тоже finite. Не рекомендуется |
| N2 exact binary64 | Математическое decimal значение лексемы обязано точно представляться в binary64, плюс safe integer ограничения | Строго, но отвергнет обычные 0.1/0.05; риск несовместимости токенов/размеров и необходимость bounded rational analysis |
| N3 decimal round-trip | Safe mathematical integers; finite/no underflow; decimal значение raw совпадает с decimal значением кратчайшего Number.toString результата | Сохраняет стандартный Number workflow и допускает 0.1, но **не** доказывает exact binary/decimal arithmetic |
| N4 lossless numeric tokens | Сохранять знак/coefficient/exponent/raw token как данные, Number не отдавать | Точное исходное decimal описание; новый числовой тип не совместим автоматически с текущим v3/Validator; без незаявленной зависимости |

Рекомендация для согласования: N3 для будущего Number-compatible interpretation profile; N4 как отдельный token inspection путь, если нужны точные decimal значения. N2 выбирается только если владелец принимает его отказы. Не предлагать epsilon/tolerance без явного domain contract: произвольная погрешность скрывает потери. До выбора профиля numeric admission BLOCKED, F1a остаётся syntax-only.

### 4.2. Предлагаемый алгоритм N3 до потери информации

1. Валидировать number grammar на raw token: знак, integer, fraction, exponent. Сначала применить token/exponent budgets §5, не строить огромные BigInt/powers-of-ten.
2. Сохранить raw span и точно описать decimal как sign + coefficient digits + decimal exponent. Удаление лишних zeros допускается **только во внутреннем сравнении**, без изменения raw. Exponent arithmetic bounded; отрицательное нулевое значение определяется по знаку и нулевому coefficient.
3. Выполнить пробное Number conversion только этого bounded токена, пока исходная лексема всё ещё доступна. Non-finite → reject overflow. Nonzero decimal, преобразованный в +0/-0 → reject underflow, независимо от политики negative zero.
4. Для mathematically integral raw decimal проверить абсолютное значение <=9_007_199_254_740_991 **до доверия округлённому результату**. Синтаксис `.0` или exponent не обходят integer правило.
5. Для finite nonzero сравнить точно decimal значения raw token и кратчайшего `Number.toString()` в той же bounded decimal модели, без Number-сравнения двух уже округлённых значений. Не сравнивать просто строки: `1.2300e2` и `123` математически эквивалентны.
6. Любое различие → reject precision-loss. Это guard выбранного N3 profile, не доказательство, что binary64 представляет исходную дробь точно или что дальнейшие вычисления безопасны.

Нельзя проверять сохранность как `Number(raw) === JSON.parse(raw)` — обе стороны уже округлены. Numeric validity не присваивает field type: number в boolean/string prop по-прежнему отклоняется DS Contract. BigInt/Decimal объекты в v3 не добавляются.

### 4.3. Спорные случаи и рекомендуемый N3 outcome

| Raw token | Предлагаемый результат / причина |
| --- | --- |
| `9007199254740991`, `-9007199254740991` | Допустить по integer/round-trip policy |
| `9007199254740992`, `9007199254740993`, `9007199254740992.0` | Reject unsafe integer, включая точно представимый, но вне safe range |
| `9007199254740991.1` | Reject precision-loss: округление к safe integer не делает исходную дробь безопасной |
| `0.5`, `0.1`, `1.2300e2` | N3 допускает; 0.1 не exact binary, только выбранный decimal round-trip |
| `0.10000000000000001` | Reject precision-loss при преобразовании в 0.1 |
| `1e309`, `-1e400` | Reject non-finite conversion; raw остаётся |
| `1e308` | Finite, но математический integer вне safe range: reject unsafe integer |
| `1e-324`, `-1e-324` | Reject nonzero→zero underflow |
| `5e-324` | N3 может допустить при равенстве decimal round-trip, но это не exact decimal value; отдельный запрет subnormal — возможное дополнительное решение владельца |
| `NaN`, `Infinity`, `+1`, `01` | Ошибка JSON grammar, не policy-approved number |
| `-0`, `-0.0`, `-0e2` | F1B-P04 рекомендует reject lexical negative zero; альтернативы ниже |
| `0e999` | Нулевой коэффициент не overflow сам по себе; exponent budget всё равно проверяется |

F1B-P04 варианты: (A) сохранить -0 с обязательной sign-aware representation/serialization; (B) нормализовать в 0 с явным преобразованием; (C) reject до candidate interpretation. Рекомендация C: JS.stringify/дальнейшие потребители могут потерять знак, автоматическое B нарушает raw/no silent rewrite. Если A выбран, нужны отдельные tests и preservation API; Object.is только на decoded значении не заменяет raw evidence. Underflow не маскируется как lexical -0.

Диагностический приоритет предлагается фиксировать: grammar → resource budgets → non-finite/underflow → lexical negative zero → integer safety → decimal round-trip. Если бюджет исчерпан, не заявлять установленный precision defect: остановленная numeric проверка не выполнена полностью.

## 5. Depth и resource limits — конкретные кандидаты

Все пороги кроме существующего F1a input ceiling — PROPOSED. Значения нужны до реализации выбранного профиля; workload benchmarks и полная legacy совместимость пока UNKNOWN.

Определения счётчиков:

- Depth: число container ancestors текущего JSON value; root value depth=0, его children depth=1. Пустой root object/array depth=0. Value depth проверять и для scalar children, чтобы граница не зависела от типа последнего узла.
- Node: каждый JSON value, включая root, containers и scalars; key name не node. Properties: каждое syntactic key/value occurrence, включая duplicate до отказа. Counting не начинается после dedupe.
- Decoded string/key length: UTF-16 code units, до любой normalization; astral =2 units. Raw token length считается отдельно. Aggregate decoded units включает **все** keys и string values.
- Все ограничения inclusive; limit+1 отвергается до соответствующей allocation/вставки. Не переносить на F1a или существующий DS Validator.

| Лимит | Compact | Balanced (рекомендация) | Expanded | Влияние / решение |
| --- | ---: | ---: | ---: | --- |
| Input UTF-8 bytes | 2_000_000 | 2_000_000 | 2_000_000 | Существующий F1a ceiling не повышается |
| Value depth | 32 | 64 | 128 | Ни один профиль не принимает F1a deep=10_000 example; это отдельный gate |
| Total value nodes | 50_000 | 100_000 | 200_000 | Ограничивает большие плоские arrays и objects, не только depth |
| Total property occurrences | 25_000 | 50_000 | 100_000 | Защищает decoded key sets и path accounting |
| Properties в одном object | 5_000 | 10_000 | 20_000 | Не гарантируется одним global node count |
| Items одного array | 25_000 | 50_000 | 100_000 | Root elements Canvas имеет собственный предел 500; общий JSON шире |
| Decoded units одной string value | 65_536 | 262_144 | 1_000_000 | Строже 2MB syntax-only, но выше current editor text 2000 units; длинные source descriptions могут отказать |
| Decoded units одного key | 256 | 1_024 | 4_096 | Unknown key нельзя обрезать ради допуска |
| Aggregate decoded key/string units | 500_000 | 1_000_000 | 1_800_000 | Ограничивает накопление text/sets; не точный bound JS heap |
| Raw number token code units | 64 | 128 | 256 | Budget до conversion/decimal analysis; не ограничивать только decoded число |
| Exponent digits без знака | 3 | 4 | 5 | Включая leading zeros; сначала bounded lexeme processing |
| Absolute exponent integer | 400 | 1_000 | 10_000 | Не строить 10^exponent; finite/integer rules проверяются отдельно |

Budget string processing учитывает raw scan и decoded allocation; escapes не обходят limits: `"\u0061"` имеет decoded length 1, но всё ещё тратит raw scan/input bytes. Raw token не копируется многократно: хранить offsets в исходной строке. Decoded-limit check должен выполняться при накоплении, не после полной большой allocation. Long keys ограничивают и duplicate lookup. Вне разрешённых limits raw сохранить целиком в рамках входной строки, partial decoded object наружу не отдавать.

Balanced остаётся **PROPOSED**, не измеренная гарантия достаточности. Точные thresholds могут утверждаться только после: (1) compatibility review существующих WDeaf fixtures; (2) проверки разрешённых legacy/import документов с явным scope корпуса; (3) граничных тестов L−1/L/L+1 по каждой единице; (4) измерений производительности в заявленной среде, если обещаются CPU/memory ограничения. До выполнения этих условий numeric thresholds не становятся утверждёнными автоматически; неподтверждённые thresholds не основание для автоматического изменения или удаления исходных данных. Existing v3 DS depth относится к вложенности компонентов, а не JSON containers; нельзя объявить эти числа одинаковыми. Число JSON values одного Canvas element существенно больше 1. Нужна отдельная compatibility matrix actual fixtures + корпус разрешённых legacy/import проектов до интеграции. Если F1b отклоняет документ, прежний Builder не переписывается; сохраняются raw/export и явная причина нового gate. Без автоматической миграции или обрезки.

### 5.1. CPU, memory, deadline

| Вариант | Что даёт | Ограничение / рекомендация |
| --- | --- | --- |
| Только max bytes | Простая грубая граница | Не ограничивает количество объектов, copies, рекурсию; недостаточно |
| Только elapsed timeout | Простая операционная остановка | На синхронном main thread timeout не прерывает уже работающий parser; не гарантия |
| Deterministic counters + iterative parser | Воспроизводимый порядок отказов, ограниченные nodes/depth/strings/number work | Рекомендуемый обязательный core; expected O(raw length + bounded decoded processing), no unbounded recursive traversal |
| Counters + отдельный Worker/process deadline | Возможность прервать зависший evaluator | Среда/heap/cancel/original availability должны быть реально проверены, не флаг isolation:true |

Кандидаты внешнего hard deadline: **500 ms / 2 s / 5 s** на фиксированном reference environment; предлагаемый стартовый вариант 2 s, но выбор и reference hardware/runtime **UNRESOLVED до benchmark и решения владельца**. Порог не критерий валидности JSON, а operational stop с incomplete проверкой. Для памяти варианты **32 / 64 / 128 MiB** overhead отдельного worker сверх runtime baseline; 64 MiB — лишь кандидат, не обещанный hard heap cap. На текущем синхронном API нельзя заявить такой guard.

Рекомендуется сначала согласовать counters и benchmark acceptance plan; затем отдельно решить execution boundary/deadline, не добавляя production storage/CR2 Preview. Отсутствие verified hard isolation должно явно ограничивать обещания pure parser. Зафиксировать node/browser/runtime/OS и p95/max timings на тестовом корпусе после отдельного разрешения реализации; сейчас измерений нет. Превышение времени/памяти → indeterminate/resource-stop, не PASS и не доказанный numeric/DS defect.

## 6. Архитектура до JSON.parse

### 6.1. Сравнение вариантов

| Вариант | Сохраняет потерянные факты? | Плюсы / риски |
| --- | --- | --- |
| JSON.parse → walk/reviver | Нет полного duplicate occurrence history; Number уже преобразованы | Нельзя использовать как главный F1b safety gate |
| Regex search raw | Не обеспечивает grammar/scopes/escape decoding | False positives внутри строк, missed nested duplicates, риск backtracking; не рекомендуем |
| Iterative token preflight + native final decode | Raw keys/numeric spans проверены до conversion в целый объект | Можно сохранить native grammar oracle; нужен полноценный bounded grammar parser/preflight, не счётчик скобок |
| Bounded specialized parser с token tree | Полная raw/token provenance и bounded checks | Одна интерпретация, но больше кода/review; tree materialization дополнительно ограничивать |
| Согласованная third-party lossless library | Зависит от конкретных гарантий | Нужно отдельно выбрать package/version/license/security/API и resource semantics; установка сейчас запрещена |

Рекомендация F1B-P08: локальный iterative raw-token preflight, сохраняющий token spans и проверяющий grammar/object scopes/decoded keys/numeric policy/limits. После его полного успеха native final decode допустим только по отдельно утверждённому admission API. При любой ошибке не выдавать partial tree как admitted. Второй native decode не должен быть первым местом обнаружения structure budget.

### 6.2. Порядок и отношение к F1a

1. F1b независимо проверяет primitive string и тот же 2_000_000 UTF-8 bytes потолок **до разбора**; non-string не коэрцируется. Константу можно переиспользовать без изменения F1a API после разрешения кода.
2. Сканирует исходный rawText bounded iterative parser. JSON grammar — без comments/trailing commas/NaN/Infinity/BOM removal. На каждой стадии budgets проверяются до allocations/conversion. Escaped delimiters не считаются structural containers.
3. По raw scopes проверяет F1B-P01/F1B-P02/F1B-P05, сохраняет key/numeric spans; применяет numeric профиль к bounded tokens. Никаких eval/functions/reviver из входа, URLs/imports или prototype merges.
4. Только после полного policy preflight можно опционально вызвать **неизменённый** F1a как syntax cross-check либо native decoder как отдельно согласованную часть. F1a result нельзя принимать как proof F1b: raw/политика должны совпасть, повторный вызов с другим raw не подходит.
5. Только полный policy report связан с exact raw, согласованным domain digest и policy version после Unicode gate §3.3; no normalization original. Это не admission и не trusted value. DS Contract, context/binding, capability/readiness и Apply gates идут отдельно, не выполняются автоматически.

F1a уже вызывает JSON.parse до любых будущих F1b depth checks. Композиция «сначала F1a, затем raw scan» может сохранить duplicate/numeric evidence, поскольку raw не утрачен, **но не защищает первый parse от resources**. Для resource-first пути рекомендован F1b preflight перед любым native parse; existing F1a не переписывается и не подключается к приложению. Надёжность такого пути требует отдельного кода/тестов и owner approval, а не диаграммы.

Ни стандартный object merge, ни Object.assign(parsed) не используются для key accumulation. При будущем parsed view — own-data-properties/null-prototype или иное отдельно согласованное безопасное построение, defensive immutability и bounded iterative processing. Trusted view не может быть arbitrary caller object; identity marker/TypeScript cast не доказательство. Unknown/raw остаются доступными даже при reject, но unknown не расширяет v3 allowlist.

### 6.3. Независимо проверяемые implementation packages — PROPOSED

| Пакет | Зависимости / область | Критерий приёмки и запрет ложного PASS |
| --- | --- | --- |
| F1B-I01 — bounded tokenizer/grammar | Отдельно утверждённые grammar, counting definitions и thresholds; F1a API не меняется | Iterative grammar/token spans + structural counters, raw/input ceiling, unit/boundary/malformed tests; duplicate/Unicode/numeric coverage ещё UNKNOWN, **общего checked нет** |
| F1B-I02 — decoded duplicate keys / Unicode | I01 + утверждённые F1B-P01/P02/P05 и digest domain | Per-object decoded equality, безопасные sets, raw и decoded Unicode, escapes/surrogate/encoding collision fixtures; только своя область PASS, numeric coverage отдельно |
| F1B-I03 — numeric policy | I01 + отдельно утверждённые F1B-P03/P04, token budgets/oracle | Bounded numeric analysis, overflow/precision/underflow/-0 и boundaries; может выполняться независимо от I02, не выдаёт общий policy PASS |
| F1B-I04 — итоговый policy report | I01 + I02 + I03, утверждённая версия полного policy profile и domain/raw binding | Report без parsed object; coverage всех required checks, safe diagnostics, stale/mismatch tests; `checked` только если **каждая** обязательная проверка PASS, нет missing/UNKNOWN/unresolved policy |
| TA-01 — последующий trusted admission | I04 + отдельное согласование exact API, policy version, exact raw binding и immutable representation | Создание trusted value только на согласованной границе; forged/stale/caller-object/cast/mock/immutability tests. Не часть разрешения на Policy Inspection; F2 ждёт реализации и приёмки этой границы |

Каждый пакет требует собственного разрешения, file allowlist и review; ни один не реализуется этим документом. I01–I03 могут выдавать только локальные факты/coverage своего этапа; обязательные отсутствующие проверки явно UNKNOWN/NOT_IMPLEMENTED. Нельзя назвать такую сумму `checked`, передать её как trusted JSON или скрыть отсутствие проверки за default. В I04 завершённый FAIL даёт отказ, незавершённый/UNKNOWN — incomplete/indeterminate; оба блокируют положительный общий report и admission. Успех отдельных тестов не доказывает готовность всего механизма.

## 7. Результат и диагностика (F1B-P09, PROPOSED)

Пока предлагается только policy report: exact raw ref/text, policy version/digest, статус checked/rejected/indeterminate, какие checks выполнены, safe diagnostic code/path/span. Нет общего `valid:true` и нет automatic semantic admission/contract approval/render permission. F1a типы и codes не меняются.

`checked` разрешён только полному report с PASS каждой обязательной проверки утверждённого профиля, включая raw/decoded Unicode и правила reuse/digest §3.3. Missing implementation, unresolved threshold/policy или UNKNOWN хотя бы одного required check блокируют `checked`; состояние indeterminate не разрешает дальнейшую интерпретацию. Отчёт policy inspection сам по себе не устанавливает semanticAdmission.

Будущий trusted JsonValue/admission profile — отдельное решение перед реализацией публичного API: exact API, policy version, привязка к raw и immutable representation должны быть согласованы и реализованы независимо от report. Принятие rules не создаёт объект с правом использования; caller не может превратить checked report в Apply permission. Report и raw должны соответствовать той же exact строке; stale/edited raw требует новой проверки. Raw JavaScript text сохранён, file bytes после внешнего decoding не сертифицируются.

Предлагаемые локальные reason categories: DUPLICATE_KEY, UNPAIRED_SURROGATE, NUMBER_RANGE, NUMBER_PRECISION, NUMBER_NEGATIVE_ZERO, DEPTH_LIMIT, NODE_LIMIT, PROPERTY_LIMIT, STRING_LIMIT, KEY_LIMIT, NUMBER_TOKEN_LIMIT, RESOURCE_STOP, SYNTAX, POLICY_UNRESOLVED. Это vocabulary проекта F1b, не замена runtime Validator/T2 diagnostics.

Рекомендация: fail-fast на первом блокере в raw order, одна основная bounded diagnostic и coverage marker not-fully-checked. Не утверждать полноту списка дефектов, если scan остановлен. Paths — escaped JSON Pointer, spans — UTF-16 offsets `[start,end)` raw строки (не UTF-8 byte offsets). Duplicate locator может включать первый и повторный span; public log не должен раскрывать raw fragments/secret keys. При угрозе раскрытия — root path + safe offsets; privileged diagnostic view — отдельная policy.

Resource fail и malformed/precision fail различимы; UNKNOWN/incomplete не превращаются в PASS. Восстановление raw не требует admission; весь raw не публикуется в CI logs. Никакой автоматической версии библиотеки или legacy profile.

## 8. Тест-план: будущие проверки, не выполненные тесты

Все expected outcomes ниже условны **при выборе рекомендуемых F1B-P01–F1B-P09/N3/Balanced**. Это не утверждённые acceptance results. Для каждого limit L нужны L−1/L/L+1 cases по его точной единице, с independently counted fixture metadata. Benchmarks/тесты сейчас не запускаются.

| Группа | Позитивные / boundary cases | Негативные cases / expected reason |
| --- | --- | --- |
| Keys | Same key в разных objects; distinct case; distinct NFC-equivalent sequences по F1B-P02 | Same key twice, nested/array objects, same duplicate value; DUPLICATE_KEY |
| Escapes | Escaped quotes/backslashes, surrogate pair; raw spans unchanged | a/\u0061, raw emoji/escaped pair, backslash escape equivalent duplicates |
| Unicode | Valid astral strings/keys; escaped/literal same units | Lone high/low, escaped/literal mixed unpaired → F1B-P05 reject, no U+FFFD rewrite |
| Integers | ±MAX_SAFE; fractional/exponent spelling safe equivalent | MAX_SAFE+1/+2, `.0` и exponent bypass; unsafe integer |
| Decimals | 0.5/0.1/1.2300e2 по N3 | 0.10000000000000001, 9007199254740991.1 → precision-loss |
| Overflow/underflow | Finite bounded accepted values; lexical zero | 1e309/-1e400; 1e-324/-1e-324; distinguish zero coefficient |
| -0 | Positive 0/0.0/0e2 | -0/-0.0/-0e2 lexical negative zero; raw not normalized |
| Numeric resources | Number token/exponent digits/magnitude ровно L | Leading-zero exponent digits, long mantissa, huge exponents L+1, no giant powers/BigInt allocation |
| Depth | Scalar root=0; children/container depth convention; 63/64/65 | 10_000-deep JSON, включая пустые/скалярные tails; no call-stack overflow или bypass |
| Nodes/properties | Arrays и objects точно L; key occurrence vs node independently counted | Wide flat arrays, many tiny keys, total vs per-container excess, duplicate counted before stop |
| Strings/keys | UTF-16 units boundaries, emoji=2, escaped vs raw length различается | Long key/value и aggregate excess; no truncation |
| Input bytes | 1_999_999/2_000_000; whitespace/raw unchanged | 2_000_001, multibyte excess: refuse before any parse |
| Grammar | All JSON root types, whitespace within grammar | Empty/malformed/trailing comma/comment/trailing garbage/BOM; escaped punctuation не ломает scope |
| Ordering | Same raw+policy gives same checked facts/first reason | Invalid token после early blocker не считается полностью проверенным input |
| Preservation | Exact raw before/after incl CRLF/escapes/number spelling | No trim/casefold/dedupe/rounding rewrite; mismatch raw/digest не reusable report |
| Safety | Prototype-like names — data under own-key policy | Non-string Proxy/getters no traps; JSON code/imports/URLs не выполняются; no storage/log raw |
| Admission boundary | F1a syntax-valid remains NOT_EVALUATED, F1b reports independent | Forged F1a result/wrong raw не обходят F1b limits; checked F1b не semanticAdmission/DS/CR3/Apply; cast/mock/caller object не trusted value |
| Digest / Unicode domain | Well-formed raw и decoded values, valid pairs, exact raw сохранён | Lone surrogate vs literal U+FFFD: одинаковый TextEncoder digest не разрешает reuse; ASCII raw escaped lone surrogate тоже reject по F1B-P05 |
| Partial packages | Локальный PASS только выполненного check, coverage явно указана | Пропущенный numeric/duplicate/Unicode check, UNKNOWN, wrong policy version/domain → нет общего checked |
| Resource stop | Small corpus completes within agreed env budget | Worker deadline/cancel/OOM simulation → incomplete, no partial admitted output |

Parser conformance: после отдельного разрешения использовать фиксированный positive/malformed corpus и differential проверку grammar против JSON.parse **только для безопасно ограниченных cases**. Нельзя сначала пускать pathological raw в native parse ради сравнения. Числа/duplicates/limits оцениваются собственным oracle, не тем же уже потерявшим информацию decoder. Зафиксировать policy/evaluator/runtime versions, независимый review tricky grammar/Unicode/numeric cases и raw digests. Успешные unit tests не являются G0 research или CR3.

## 9. Совместимость и нерешённые риски

1. Новые ограничения F1b не меняют существующий F1a API или import path Builder. F1a тесты duplicate/numeric/deep/surrogate продолжают отражать только syntax inspection; не исправлять их ради нового профиля.
2. Balanced thresholds выше некоторых editor field limits, но возможны многие fields/unknown source payloads, поэтому совместимость всего legacy corpus UNKNOWN. Source inventory JSON/CSV не равно пользовательскому v3 Document и не обязано пройти тот же профиль. Требуется явный scope входных артефактов.
3. Ограничение Number semantics может отвергнуть допустимые синтаксические data sources. Token-only inspection сохраняет их raw, но не объявляет совместимыми с существующим Validator. Отдельный Decimal/BigInt API не вводится.
4. Новый parser имеет риск grammar/escape/complexity ошибок. Малые regex или native parse walk не заменяют полный preflight. Library adoption требует отдельного решения, зависимостей сейчас нет.
5. Counters не гарантируют hard memory/time isolation. Выбор CPU reference environment/deadline/heap boundary до performance claims обязателен; runtime OOM не обещается перехватить.
6. Во всех отказах original text сохраняется, но не durable storage — F1b read-only. Автоматическая перепись, rollback документов или latest binding запрещены.

## 10. Решения, необходимые от владельца

- F1B-P01/F1B-P02: reject decoded duplicates? Exact decoded equality без NFC/casefold? Нужен ли отдельный NFC-collision warning/reject?
- F1B-P03/F1B-P04: N1/N2/N3/N4; safe integer scope, underflow/subnormal policy и negative zero handling. N3 recommendation требует осознанного принятия ограничения decimal round-trip.
- F1B-P05: unpaired surrogate reject для F1b или JS-only warning; raw всегда сохраняется.
- F1B-P06: профиль Compact/Balanced/Expanded либо индивидуальные inclusive limits и definitions counting.
- F1B-P07: deterministic-only core scope либо отдельная изоляция/deadline; environment/benchmarks/временные и memory thresholds пока UNRESOLVED.
- F1B-P08/F1B-P09: локальный iterative raw preflight, no dependencies, policy-report-only и отдельные пакеты §6.3. Trusted admission — последующее отдельное решение, не альтернативный способ обойти полный inspection.
- Для TA-01: exact API, policy version, raw/domain binding и immutable representation остаются UNRESOLVED до отдельного согласования; ни F1b report, ни casts/mocks их не заменяют.

Частичное согласование не снимает blocker зависимого механизма. Следующая реализация требует отдельного поручения с exact file allowlist и accepted policy version. Этот DRAFT не является разрешением писать F1b код или менять F1a.

## 11. Версии и проверка сохранности

F1a: main/merge SHA `39da45f542da484d9418d8a60a8ef36c7556b253`; исходный PR #5 head `44689cb7850198edec2a838c7e4c35dc6702e764`. Функция [inspectJsonText](https://github.com/belemik/emikman_builder/blob/39da45f542da484d9418d8a60a8ef36c7556b253/src/readonly/inspect-json-text.ts), [types](https://github.com/belemik/emikman_builder/blob/39da45f542da484d9418d8a60a8ef36c7556b253/src/readonly/ingest.types.ts), [15 tests](https://github.com/belemik/emikman_builder/blob/39da45f542da484d9418d8a60a8ef36c7556b253/tests/json-ingest.test.ts) прочитаны, не изменены. Existing [Validator](https://github.com/belemik/emikman_builder/blob/39da45f542da484d9418d8a60a8ef36c7556b253/src/design-system/validator.ts) отдельно ограничивает элементы/props/композиции, не выполняет предлагаемый F1b preflight.

Технические источники RFC/ECMAScript прочитаны 06.11.2026, ссылки в §1; living ECMA specification не выдаётся за уже реализованную feature версию Node. Новые рекомендации чисел и лимитов — авторский проект для решения владельца. В F1b не проводились новые correctness/performance tests.

| Прочитанное локальное основание | SHA-256 |
| --- | --- |
| [ADR-001-source-neutral-design-system-contract.md](ADR-001-source-neutral-design-system-contract.md) | `12d666bf5c2a08e222950c0ee8614825420a13be1b3d4cb62a7c89243bcb8651` |
| [T2-unsupported-policy.md](T2-unsupported-policy.md) | `a5c0d3304ce31775150a79da4c2bbe3391b2dae9bf493daafdf6681a3d5b4c10` |
| [T3-validator-facade.md](T3-validator-facade.md) | `698fe47720335167ea891575ec56debc6b78e6092cdc49324e6cf22481e9457e` |
| [G0-gap-assessment-draft.md](G0-gap-assessment-draft.md) | `d611f6d9dbe381928d6fd6f57214f26bc7466addd7a126fa62f2f8662db64e67` |
| [D0-readonly-decision-package.md](D0-readonly-decision-package.md) | `43c001b124c0c748ce739e67720286f8d245339350198b760dcf369bfd6401d5` |

**Итог: F1b DRAFT / на согласовании.** В этой корректировке изменены только D0-RO и F1b DRAFT; их новые решения остаются PROPOSED/UNRESOLVED. F1a уже MERGED в main `39da45f542da484d9418d8a60a8ef36c7556b253`; его код/API, T1–T7, ACCEPTED G0, исходные данные и Git не меняются. G0 BLOCKED / NOT READY TO LAUNCH; E1/E2 NOT RUN; protocols NOT FROZEN. Реализация и спорные политики ожидают отдельного решения владельца.

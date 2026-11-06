# F1b policy acceptance — решение владельца

Статус записи: **RECORDED — ограниченные policy decisions приняты владельцем**.
Дата решения владельца: **06.11.2026**. Дата документальной фиксации: **07.11.2026**.
Основание: явное поручение владельца «FINAL CODEX: полная консолидация и передача проекта в Cursor», в котором перечислены принятые решения и разрешён этот decision record. Запись документирует сообщённое решение; она **не является криптографически подписанным подтверждением личности владельца**, независимой экспертизой или разрешением реализации следующих пакетов.

## Принятые решения F1B-P01–F1B-P09

| ID | Решение владельца | Граница принятия |
| --- | --- | --- |
| F1B-P01 | Reject duplicate keys | Повторы определяются в каждом объекте после decoding escapes; автоматического first/last-wins нет |
| F1B-P02 | Decoded exact UTF-16 equality | Без NFC normalization, casefold и молчаливого слияния разных последовательностей |
| F1B-P03 | Numeric profile N3 | Decimal round-trip и safe integer правила исходного F1b; это не обещание точной binary/decimal арифметики |
| F1B-P04 | Reject lexical negative zero | Raw не переписывается в 0 |
| F1B-P05 | Reject unpaired surrogates | Для будущего полного положительного policy report проверяются raw JS text и decoded keys/string values; замены на U+FFFD нет |
| F1B-P06 | Balanced — **PROVISIONAL TEST ONLY** | Численные thresholds **не production-approved**; нужны compatibility review, границы и необходимые измерения заявленной среды |
| F1B-P07 | Deterministic counters | Hard Worker/deadline и memory limits отдельно **не утверждены** |
| F1B-P08 | Bounded iterative raw JSON parser | Без выполнения импортированного кода и без потери raw evidence перед проверками |
| F1B-P09 | Policy-only report | Без automatic trusted admission; policy checked не является semantic admission, DS validity, CR3 или Apply permission |

Эти policy decisions не означают, что все проверки уже реализованы. Неизвестные/отсутствующие обязательные проверки не превращаются в PASS. Raw не нормализуется; оригиналы не удаляются ради прохождения policy.

## Статусы документов и реализации

- [G0 Gap Assessment](../G0-gap-assessment-draft.md) — **ACCEPTED**; принят диагностический отчёт, не допуск к исследованиям.
- [D0-RO](../D0-readonly-decision-package.md) — **DRAFT**. Остальные решения R1–R10 этой записью автоматически не утверждаются.
- [F1b JSON Safety Policy](../F1b-json-safety-policy-draft.md) — исходный документ остаётся **DRAFT**, но перечисленные выше F1B-P01–P09 приняты владельцем с указанными ограничениями. Исторические формулировки PROPOSED/UNRESOLVED в исходных bytes не переписываются; эта запись фиксирует последующее решение только в перечисленной области.
- **F1B-I01 — MERGED**, main SHA [`b2df455e838439b9e4b855445fd6ef3c482db56e`](https://github.com/belemik/emikman_builder/commit/b2df455e838439b9e4b855445fd6ef3c482db56e), [PR #6](https://github.com/belemik/emikman_builder/pull/6). Реализованы только grammar/structural preflight и provisional counters; `policyInspection=INCOMPLETE`, `semanticAdmission=NOT_EVALUATED`.
- **F1B-I02/I03/I04 — NOT IMPLEMENTED**. Принятие N3 и Unicode/duplicate policy не является evidence их реализации.
- **TA-01 — NOT IMPLEMENTED / NOT AUTHORIZED**. Exact API, policy/raw binding и immutable representation требуют отдельного согласования.
- **T1–T7 — ACCEPTED** на уровне архитектурного проектирования. Screen Schema v3 и действующий Builder не изменяются этой записью.
- **G0 E1/E2-P/E2-X — BLOCKED / NOT READY TO LAUNCH**.
- **E1/E2 — NOT RUN. Protocols — NOT FROZEN.**

Нет общего policy checked до полного I04. Trusted Admission, AI Apply/rollback, экспериментальный Preview, модельные исследования и production rollout не разрешаются. Для каждого следующего implementation package требуется отдельное поручение; F1B-I02 не начинается этим документом.

## Exact основания и происхождение

SHA-256 ниже вычислены по **точным bytes** трёх исходных локальных Markdown-документов. При включении в документационную поставку они скопированы без изменения encoding, line endings, текста или статуса. Исторические T4–T7 не переносятся поверх опубликованных версий. Digest подтверждает совпадение содержимого, а не личность, подпись или полномочия автора.

| Основание | SHA-256 exact bytes |
| --- | --- |
| [G0-gap-assessment-draft.md](../G0-gap-assessment-draft.md) | `d611f6d9dbe381928d6fd6f57214f26bc7466addd7a126fa62f2f8662db64e67` |
| [D0-readonly-decision-package.md](../D0-readonly-decision-package.md) | `43c001b124c0c748ce739e67720286f8d245339350198b760dcf369bfd6401d5` |
| [F1b-json-safety-policy-draft.md](../F1b-json-safety-policy-draft.md) | `5d4a0dac93afb80327e3fcc531eca8cea0e826e7fa91ee5b11209da193004d0d` |

Приватные backup, Git bundle, `.data/`, `.backups/`, credentials и локальные пользовательские пути не являются частью этой публичной поставки.

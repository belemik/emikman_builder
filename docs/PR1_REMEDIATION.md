# PR #1 remediation — 04.11.2026

Ветка: `feat/ds-component-library`. Базовый HEAD: `bacaf19cbba2d4b35eef5e6f4ff571fe909288f2`.
Проверено **незакоммиченное рабочее дерево поверх HEAD**, а не неизменённый commit bacaf19. Новый SHA коммита не существует: commit/push требуют отдельного подтверждения владельца. Merge не выполнялся.

## Изменения

- Validator и lookup Renderer используют собственные ключи; неизвестные имена (`__proto__`, `constructor`, `toString`) возвращают диагностический результат. Отрицательные тесты проверяют корни, вложенные элементы, JSON и lookup Renderer.
- Recovery append-only: UUID-ключ на каждый новый исходник, существующие копии не перезаписываются, одинаковые исходники повторно не дублируются. Старые rejected/pre-v3 backups доступны для скачивания. Список обновляется после сохранения; закрытие уведомления не скрывает восстановление. Ошибка записи не разрешает продолжить автосохранение.
- `toCanvasV2` допускает только плоские legacy-компоненты без slots/interactionState/tokenReferences; иначе `V2_UNSUPPORTED`. Schema v3 не менялась.
- Linux CI сохраняет три smoke-сценария; отдельный macOS job выполняет все 10 сценариев, включая Darwin screenshot baselines. Эталоны не изменены. GitHub выполнение нового workflow пока не подтверждено: изменения не отправлены.
- DS_COVERAGE отделяет историческую primitive-матрицу, актуальные root/internal ограничения и операции. Точный текущий end-to-end процент не объявляется без пересчёта.

## Проверки финального кода

Все команды ниже завершились с exit code 0. Node v24.22.1, npm 11.6.2; npm запущен напрямую через `node /tmp/wdeaf-remediation-npm/package/bin/npm-cli.js`.

| Эквивалент команды | Результат | Лог |
| --- | --- | --- |
| npm run typecheck | PASS | /tmp/wdeaf-remediation-typecheck.log |
| npm run ds:validate | PASS, contract 1.3.0 | /tmp/wdeaf-remediation-ds-validate.log |
| npm test | PASS, 38 TS + 2 server = 40 | /tmp/wdeaf-remediation-test.log |
| npm run build:server | PASS | /tmp/wdeaf-remediation-build-server.log |
| npm run build | PASS | /tmp/wdeaf-remediation-build.log |
| npm run check:pages | PASS | /tmp/wdeaf-remediation-check-pages.log |
| npm run test:visual | PASS, 10/10 | /tmp/wdeaf-remediation-test-visual.log |

Добавлены четыре unit/integration-теста (prototype names, v2 unsupported data, последовательные восстановления, ошибка записи). Существующий recovery Playwright-сценарий расширен: два разных исходника, reload, закрытие сообщения, quota error, доступ и скачивание обеих копий. Остальные сценарии проверяют Select persistence, композиции, Tag, TagGroup, состояния и снимки.

Первоначальные попытки запуска: npm отсутствовал в PATH; pnpm автоматически начал установку и остановился с ERR_PNPM_IGNORED_BUILDS; npm shell launcher не обнаружил нестандартное размещение Node. Восстановлены зависимости через `npm-cli.js ci` по исходному package-lock.json. Созданный этой попыткой pnpm-lock удалён; package-lock, pnpm-workspace и tracked pnpm store не изменены. Финальные проверки используют npm-зависимости. Предупреждение Playwright NO_COLOR/FORCE_COLOR не влияет на результат.

Манифест проверенного кода/тестов/конфигурации до создания этого отчёта: `/tmp/wdeaf-remediation-manifest.json`; SHA-256 манифеста: `185b4c98330274029a03e73624011dec2f44b357bd90e785a6e33127228a6b28`. Логи /tmp — локальные временные артефакты, не GitHub CI evidence.

## Ограничения и решение

READY для повторного review рабочего дерева. Не утверждается готовность к автоматическому merge: требуется согласованный commit/push и успешный GitHub CI для нового SHA. macOS runner может потребовать отдельного review отличий rasterization; автоматически обновлять эталоны CI не будет.

Резервные копии находятся только в браузере текущего пользователя. При нехватке места сохраняется исходник и остановка, доступен ручной download; очистка browser storage удаляет локальные копии. Полный lossless экспорт — v3, ограниченный v2 не заменяет его.

Авторизация, Theme Editor, Workspace, Schema v3 и публичная конфигурация Pages не изменялись. T1–T7 не начаты.

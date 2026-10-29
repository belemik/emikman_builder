# WDeaf PRO Design System 2.0 — первый аудит

Дата: 29.10.2026

Исходник: https://www.figma.com/design/wiJYO9bWctpEiq2STFkNYU/WDeaf-PRO-Design-System-2.0?node-id=2049-1688

## Подтверждено чтением Figma

- URL ведёт на страницу Cover (`2049:1688`), остальные страницы доступны в структуре документа.
- Страницы Colors (`15:15885`), Typography (`2049:1687`), Button (`0:1`), Input (`112:2041`).
- Есть отдельные страницы таблиц, селектов, чекбоксов, переключателей, уведомлений, графиков, загрузки, иконок и других компонентов.
- Button: `size` = s/m/l/xl; `variant` = primary/secondary/outline/ghost; `colorScheme` = accent/neutral; `state` = default/hover/pressed/disabled.
- Input: `size` = s/m/l; `state` = default/hover/pressed/filled/error/disabled default/disabled filled; `placeholder` = true/false.
- Прочитаны примеры токенов: `surface/primary/default` = `#0055ff`, `text/on-color/body` = `#ffffff`, `text/default/body` = `#191f29`, `Font family/primary` = Manrope.
- На странице Typography присутствуют разделы Desktop и Mobile.

## Не подтверждено / требует дополнительного извлечения

- Полный список дизайн-токенов, радиусов, тем и шрифтов.
- Точная визуальная геометрия компонентов: скругления, паддинги, иконки, границы.
- Полнота привязок props Figma к соответствующим компонентам React/Compose/SwiftUI.
- Реальная структура CSS и готовые кодовые компоненты.
- Получение полноценного Code Connect: аккаунт сообщает о необходимости Dev/Full seat в Organization/Enterprise.
- `get_design_context` для переданной страницы вернул ошибку отсутствия активного выделения; визуальное соответствие в этом аудите не проверялось.

## Вывод

Стартовать с двух компонентов и проверить цепочку Figma metadata → JSON registry → React preview → canvas state → structured prompt. Не подменять настоящие свойства Figma выдуманными, а контентные свойства холста хранить отдельно.

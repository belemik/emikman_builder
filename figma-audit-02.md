# WDeaf PRO 2.0 — Sprint 02: проверенные метаданные Figma

Источник: https://www.figma.com/design/wiJYO9bWctpEiq2STFkNYU/WDeaf-PRO-Design-System-2.0
Аудит: 29.10.2026. Файл исследован через подключенный Figma.

## Подтверждено

- Button (`0:1`) и Input (`112:2041`) — наследуем из Sprint 01.
- Select, страница `195:56257`: размеры `s/m/l`; состояния `default/hover/filled/pressed/error/disabled filled/disabled default`; варианты `placeholder=true/false`, `label=true/false`, `foldDirection=down/up`. Пример узла `195:56850`.
- Checkbox, страница `50:320`: `size=s/xs`, `state=default/hover/pressed/disabled`, `checked=true/false`, `indeterminate=true/false`. Пример `44:355`.
- Tables, страница `2071:1101`: комплексная таблица (пример frame `2073:10861`) и отдельные компоненты `table-cell`, где найдены `cell-type` (14 значений), `color=white/blue`, `cell-divider=True/False`. Пример cell `2071:3830`. **Эти свойства относятся к ячейке, не к корневому Table**.
- Примеры подтвержденных значений: `surface/primary/default=#0055ff`, `text/default/body=#191f29`, `Font family/primary=Manrope`, `spacing/padding/spacing-16=16`, `spacing/radius/radius-4=4`; полный список в `tokens.verified.seed.json`.

## Не подтверждено

- Полные переменные, все modes и токены, точные радиусы для всех компонентов и правила адаптивности.
- Готовые компоненты React, Compose и SwiftUI и их реальные Props API.
- Code Connect: подключенный аккаунт ответил, что нужен Dev/Full seat в Organization или Enterprise.
- Pixel-perfect Preview; Canvas пока приближенный.

## Принцип работы

Figma nodes + частично проверенные токены → schema registry → Canvas + props → локальный `themeOverrides` → экспорт JSON/промпта.

Профиль / настройки темы приложения (light/dark/system) не равны Theme Editor дизайн-системы.

**Не копируй в существующий проект файлы целиком до чтения текущей реализации.** Файлы `*.seed.json` — ориентир для аккуратного слияния, а не замена рабочего состояния.

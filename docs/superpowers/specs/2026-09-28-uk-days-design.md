# uk-days — design spec (2026-09-28)

### Данные: `profiles/*.json`

```json
{
  "name": "Me",
  "arrivedUK": "2022-09-01",
  "ilrDate": "2025-09-01",
  "rules": { "windowYears": 5, "totalLimit": 450, "lastYearLimit": 90, "softLimit": 480, "hardLimit": 900, "lastYearSoftLimit": 100 },
  "absences": [
    { "out": "2023-01-10", "in": "2023-01-20", "note": "Dubai" }
  ]
}
```
- `rules` опционально, дефолт как выше. `ilrDate` опционально.
- Поездка с `in` в будущем (относительно сегодня) → плановая (флаг вычисляется, не хранится).
- Загрузка: `import.meta.glob('../profiles/*.json', { eager: true })` → HMR при правке файла. Имя профиля = поле `name`, id = имя файла.
- Валидация (без zod, руками): формат дат `YYYY-MM-DD`, `in >= out`, `out >= arrivedUK`, поездки не пересекаются (отсортировать, проверить `prev.in <= next.out`). Ошибка → баннер «profiles/me.json: absence #3 overlaps #2», профиль исключается, остальные работают.

### Ядро `src/lib/naturalisation.ts` — один файл, чистые функции, без зависимостей (изначально `src/core/*`)

- `dates.ts`: работа с датами как с целыми «день с эпохи» (`toDay(iso): number`, `fromDay(n): string`, `addYears/addMonths` через UTC, чтобы не ловить DST). Никаких Date в UI‑логике кроме преобразования.
- `absences.ts`: `fullDaysAbsent(out, in) = max(0, toDay(in) − toDay(out) − 1)`; `normalizeAbsences` (сортировка + валидация, возвращает `{ absences, errors }`).
- `timeline.ts`: `buildTimeline(profile, horizonDay)` → `{ startDay, absent: Uint8Array, prefix: Int32Array }`; `countAbsent(tl, fromDay, toDay)` через префикс‑суммы O(1). Горизонт = `arrivedUK + windowYears + 3 года`.
- `eligibility.ts`:
  - `checkDate(tl, rules, profile, D, extra?)` → `{ ok, windowStart, totalAbsent, lastYearAbsent, violations: ('notInUkAtStart'|'total'|'lastYear'|'ilr')[] }`. `extra = { startDay, days }` — гипотетический блок отсутствия, накладывается поверх timeline (учитывается при подсчёте, не мутирует timeline: `countAbsent` + пересечение интервала с блоком).
  - `earliestEligible(tl, rules, profile, fromDay, extra?)` → первая дата `D ≥ fromDay` с `ok`, либо `null` если не найдено в горизонте.
  - `shiftCurve(tl, rules, profile, extraStartDay, maxDays = 365)` → `Array<{ days: number, eligibleDay: number | null }>`. Мемоизировать по профилю+start.
  - `targetDate(profile) = arrivedUK + windowYears` (целевая «идеальная» дата).
  - `budget(tl, rules, profile, targetDay)` → `{ usedActual, usedPlanned, remaining, lastYearUsed }` для окна целевой даты.
- `types.ts`: `Profile`, `Absence`, `Rules`, `Timeline`, `CheckResult`.

### UI `src/ui/` — React 18, SVG вручную, без chart‑библиотек

Перед вёрсткой графиков подключить skill `dataviz` (палитра зон, доступность, тёмная тема). Один общий `theme.css` с CSS‑переменными.

Компоненты:
1. `App` — грузит профили, табы профилей, состояние слайдера `{ extraDays, extraStart }` (дефолт 0 и завтра). Состояние в URL‑hash не нужно.
2. `StatCards` — использовано дней (факт / +план), остаток до 450 на целевую дату, дней за последние 12 мес, целевая дата, самая ранняя дата подачи (с учётом плана и слайдера), статус ILR.
3. `YearStrip` — строка на каждый год от `arrivedUK` (сен→сен), 365/366 клеток; цвет: в UK / отсутствие факт / отсутствие план / блок слайдера; маркер «сегодня»; подсветка окна 5 лет для выбранной даты подачи; `title`/тултип с датой и `note` поездки. Справа от строки — сумма дней за год.
4. `BudgetBar` — горизонтальная шкала 0…900 с зонами 0–450 / 450–480 / 480–900; три маркера: факт, факт+план, факт+план+слайдер. Отдельная мини‑шкала для 90‑дневного правила (0–90–100–180).
5. `ShiftChart` — SVG step‑line: X = N (0…365), Y = дата подачи (ось — месяцы). Вертикальная линия на текущем N, подпись даты. Фон по зонам. Слайдер `<input type=range>` + `<input type=date>` для старта блока.
6. `AbsenceTable` — список поездок: out, in, полных дней, note, бейдж «план».
7. `ErrorBanner` — ошибки валидации по файлам.

### Тесты (vitest, только ядро)

- `fullDaysAbsent`: 22→23 сен = 0; 10→20 янв = 9; `in === out` = 0.
- `buildTimeline`/`countAbsent`: границы, пустой профиль.
- `checkDate`: окно и «в UK в первый день»; ровно 450 ок / 451 нарушение; 90/91 за год; ILR + 12 мес граница.
- `earliestEligible`: без поездок = `arrivedUK + 5 лет`; поездка, выталкивающая дату; блок `extra` > 90 дней сдвигает по 90‑дневному правилу.
- `shiftCurve`: монотонно не убывает по N.
- `normalizeAbsences`: пересечение, `in < out`, плохой формат.


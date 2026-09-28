# UK days — British citizenship absence calculator

Dashboard that tracks days spent outside the UK against the naturalisation
residence rules (450 days in 5 years, 90 in the last 12 months, ILR held 12 months)
and shows how extra travel shifts the earliest application date.

**Live:** https://limpbrains.github.io/uk-days/ — everything runs in the browser, nothing is uploaded.

```sh
npm install
npm run dev      # http://localhost:5173
npm test         # core logic tests (vitest)
npm run e2e      # browser tests (Playwright; uses the installed Google Chrome locally)
npm run build    # static site in dist/
```

Pushes to `main` run the CI workflow (lint, build, unit and e2e tests) and deploy `dist/` to GitHub Pages.

## Profiles

One JSON file per person in `profiles/`. Edit the file; the page hot-reloads.
Two examples ship with the repo (`example-standard.json`, `example-spouse.json`). Any other
`profiles/*.json` is ignored by git, so put your real data in e.g. `profiles/me.json` and it stays
on your machine (or use the in-browser editor and never touch the files).

```json
{
  "name": "Alex",
  "arrivedUK": "2022-09-01",
  "ilrDate": "2025-09-01",
  "rules": { "windowYears": 5, "totalLimit": 450, "lastYearLimit": 90 },
  "absences": [
    { "out": "2023-01-10", "in": "2023-01-20", "note": "Dubai" }
  ]
}
```

- `out` / `in` — the day you left the UK and the day you came back. Only the
  whole days in between count as absent (leave 22 Sep, return 23 Sep = 0 days).
- Trips with a return date in the future are treated as planned. Omit `in` for a
  trip that is still going on: it counts up to today and is assumed to end tomorrow.
- `ilrDate` is optional. `applicationDate` is optional and replaces the default
  target of arrival + 5 years.
- `rules` is optional; defaults are the 5-year route: 450 days total, 90 in the
  last 12 months, discretion bands at 480 / 900 and 100, ILR held 12 months
  (`ilrMonths`). For the 3-year spouse route set
  `windowYears: 3, totalLimit: 270, softLimit: 300, hardLimit: 540, ilrMonths: 0`.
- A file with errors (overlapping trips, bad dates) is skipped and reported at the top of the page.

### Profiles in the browser

Press **+** in the header to add a profile: pick a route (standard 5-year or spouse of a
British citizen), enter the arrival and ILR dates, and it is stored in this browser's
localStorage. Any number of profiles can be added, duplicated and deleted. **Export all**
downloads every profile (file ones with their edits included) as one JSON file;
**Import…** loads such a file, or a single `profiles/*.json`, back.

### Editing in the browser

Every field (name, arrival date, ILR date, limits, trips) can be edited at the bottom of the page.
Edits are kept in the browser's localStorage per profile and layered over the JSON file; the tab
shows an "edited in browser" badge. **Reset** drops the browser copy and returns to the file;
**Copy JSON** puts the current profile on the clipboard so you can paste it into `profiles/<id>.json`.
Invalid edits are reported and not applied until fixed.

The interface is available in 14 languages (English, Russian, Ukrainian, Polish, Romanian, Spanish,
Portuguese, Italian, French, German, Turkish, Chinese, Arabic, Hindi). The language is detected from the
browser, defaults to English, and can be switched in the header; the choice is remembered in localStorage.
Right-to-left languages flip the layout while charts stay left-to-right. Translations live in `src/i18n/`;
to add one, copy `en.ts`, translate the values and register the file in `src/i18n/index.ts`.

Append `?today=YYYY-MM-DD` to the URL to pretend it is another day.

## Rules implemented

For an application on day D (5-year route, GOV.UK guidance as of September 2026):

1. The qualifying period is `[D − 5 years + 1 day, D]` and you must be in the UK on its first day.
2. At most 450 whole days absent in that period (451–480 usually accepted at discretion, 480–900 only with strong UK ties).
3. At most 90 whole days absent in `[D − 12 months + 1 day, D]` (up to 100 usually accepted).
4. ILR / settled status held for at least 12 months on day D (0 months on the spouse route).

The "what-if" block is one continuous run of N whole days abroad starting on the chosen date,
layered on top of the profile's trips. The chart plots the earliest application date for every N.

This is a planning aid, not legal advice — check the current Home Office guidance before applying.

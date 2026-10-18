# Vaccination Tracker BD

Offline, bilingual (English / Bangla) child vaccination tracker for Bangladesh.
Parents and caregivers record each child's date of birth and tick off the
15-dose Bangladesh EPI schedule; the app computes every due date, flags
overdue and due-soon doses, and keeps a per-child progress record entirely
in the browser.

## Problem

Paper EPI cards get lost, and parents forget which dose is due when. This
tracker turns the card into a durable, searchable record: due dates are
computed automatically from the date of birth, overdue doses are surfaced
on a dashboard, and the whole record exports as JSON for backup.

## Features

1. **Child profiles** - add/edit/delete children (name, date of birth, sex,
   note) with inline validation (name required, DOB not in the future, not
   more than 18 years ago).
2. **15-dose EPI schedule engine** - BCG + OPV-0 at birth; Pentavalent,
   PCV, OPV + fIPV at 6, 10 and 14 weeks; MR at 9 and 15 months. Due date
   = DOB + offset days, computed in UTC to avoid DST drift.
3. **Dose status workflow** - per dose: Mark given (with date, validated
   against DOB and today), Mark missed, Clear. States: Given / Missed /
   Overdue / Due soon (within 14 days) / Upcoming.
4. **Dashboard** - children count, doses given, overdue, due-soon, missed;
   per-child progress bars; upcoming + overdue list with "overdue by N
   day(s)" / "in N day(s)" phrasing.
5. **Bilingual UI** - English / Bangla toggle, persisted; Bengali digits in
   Bangla mode.
6. **Data portability** - JSON export / strict import (wrong app, wrong
   version, unknown dose, bad status/date, duplicate child id all rejected)
   and typed-DELETE erase-all.
7. **Fully offline** - zero network requests; all data in localStorage.

## Stack

Vanilla HTML + CSS + JavaScript. No build step, no dependencies, no
framework. `js/logic.js` holds all pure logic (Node + browser compatible);
`js/i18n.js` holds UI strings (Bengali as `\uXXXX` escapes, sources stay
pure ASCII); `js/app.js` holds the DOM layer.

## Prerequisites

Any modern browser, or Node.js 18+ for the tests.

## Install / run

```sh
# Just open the file - no server needed:
open index.html
# or serve it:
npx serve .
```

## Dev commands

```sh
node tests/unit.test.js        # 60 pure-logic unit tests
node tests/smoke.js desktop    # 35 headless-Chrome checks (desktop)
node tests/smoke.js mobile     # 35 headless-Chrome checks (390px)
```

Smoke tests use the system Chromium at `/opt/meta-chromium/chrome` via raw
CDP. Add `?asof=YYYY-MM-DD` to the page URL to freeze "today" (used by the
smoke tests for deterministic due-date assertions).

## Env

None. No API keys, no backend, no environment variables. Storage key:
`vaccination-tracker-bd-v1` in localStorage.

## Testing

- Unit: 60/60 pass - schedule offsets, due-date math (incl. leap DOB
  2024-02-29 and year-boundary rollover), state transitions (due-soon
  boundary at exactly 14 days, due-today, overdue), progress math,
  validation, import validation (9 rejection cases), Bengali digits.
- Smoke desktop: 35/35 pass - full user journey (add child, validation,
  schedule, mark given/missed/clear, future-date rejection, dashboard,
  language toggle, reload persistence, delete, erase with wrong word +
  DELETE), zero console errors, zero HTTP(S) requests.
- Smoke mobile (390px): 35/35 pass, no horizontal overflow.

## Deployment

Static site - publish the directory as-is to GitHub Pages, Netlify Drop,
or any static host. Live: https://fahad3235.github.io/vaccination-tracker-bd/

## Limitations

- Reference schedule only. EPI guidance can change and individual children
  (preterm, late starters, catch-up) differ - the child's EPI card and the
  health worker's advice are final.
- MR-2 is placed at 15 months (456 days); sources describe the second MR
  dose at 15-18 months.
- OPV-0 is due at birth; if the first visit happens after 2 weeks of age,
  EPI practice is BCG only at that visit - the app does not encode that
  exception; mark doses per the EPI card.
- Personal tracker, not medical advice. No reminders/notifications (a
  browser-notification feature is intentionally out of scope for v1).
- Data lives in one browser's localStorage - export JSON regularly to back
  it up; clearing browser data loses it.

## Sources (schedule)

- Bangladesh EPI schedule (BCG at birth; Penta/OPV + fIPV at 6 and 14
  weeks; PCV at 6/10/14 weeks; MR at 9 and 15 months): PMC, "Determinants
  of incomplete immunization ... in urban Dhaka" (PMC12173360) and PMC,
  "Millions of Bangladeshi Children Missed Their Scheduled Vaccination
  Amidst COVID-19" (PMC8801521), Table 1.
- Day offsets cross-checked: BMJ Open, "The Expanded Program on
  Immunizations schedule in Bangladesh" (BMJ Open 9:e028020, Table 1) -
  Pentavalent 42/70/98 days, OPV 42/70/98 days, Measles 273 days.

## Status

Complete MVP. Tests green (see TEST_RESULTS.md). Published + verified.

# TEST_RESULTS.md - vaccination-tracker-bd

Run date: 2026-10-18 (Asia/Dhaka). `?asof=2026-10-18` used for deterministic
smoke tests. All results below are real outputs of the commands shown.

## Unit tests - 60/60 PASS

Command: `node tests/unit.test.js`
Output tail: `60 passed, 0 failed`.

Coverage:
- Schedule: 15 doses; offsets 0 / 42 / 70 / 98 / 273 / 456; 6 visits.
- Due dates hand-verified with `date(1)`: DOB 2026-01-01 -> Penta1
  2026-02-12, MR1 2026-10-01, MR2 2027-04-02; DOB 2025-06-15 -> MR1
  2026-03-15; leap DOB 2024-02-29 -> Penta1 2024-04-11; year-boundary
  2026-12-30 + 5d = 2027-01-04; invalid DOB / unknown dose -> null.
- States: overdue, upcoming, due-soon at exactly 14 days before due,
  upcoming at 15 days before due, due-today -> due-soon, due-yesterday ->
  overdue, done beats overdue, missed.
- Progress: 0/15 = 0%, 1/15 = 7% (rounded), 15/15 = 100%.
- Upcoming: excludes done doses, sorted by due date, window respected,
  overdue included.
- Dashboard stats: counts + total = children x 15.
- Validation: empty/long name, future/bad/>18y DOB, bad sex; dose-date
  before-birth / future / invalid.
- Import: 9 rejection cases (wrong app/version, unknown dose, bad status,
  done-without-date, duplicate child id, null) + good + empty imports.
- Bengali digits: 2026 -> Bengali 2026; localizeNumber bn/en.

## Smoke tests (headless Chrome, raw CDP) - 35/35 desktop + 35/35 mobile

Commands: `node tests/smoke.js desktop`, `node tests/smoke.js mobile`
Output: `35 passed, 0 failed (desktop)` and `35 passed, 0 failed (mobile)`.

Journey covered: title render, dashboard empty state, add child
(DOB 2026-01-01), empty-name validation, schedule panel (15 rows, BCG +
MR1 overdue with exact due dates, MR2 upcoming), mark BCG given
(2026-01-01), progress "1 of 15 doses", mark Penta1 missed then clear,
future dose-date rejection, dashboard counts, EN->BN toggle (Bengali
title + Bengali digit "1") and back, reload persistence (child + BCG
Given), delete (confirm stubbed), erase with wrong word (no-op) then
DELETE (erases all), no horizontal overflow, zero HTTP(S) requests,
zero console errors.

## Repairs

1. App CSS fix (1): topbar flex child got `min-width: 0` and child-card
   children got `min-width: 0` + `overflow-wrap` after the first mobile
   run showed the header flex item refusing to shrink.
2. Harness fix (1): the first mobile run failed overflow with
   scrollWidth=485 because the harness only set `--window-size` (real
   `window.innerWidth` was 500). Added
   `Emulation.setDeviceMetricsOverride` (as prior factory harnesses do);
   mobile then passed 35/35 with true 390px viewport. No app change for
   this one - the app itself was already fine at 390px.

## ASCII hygiene

`grep -rP '[^\x00-\x7F]'` over js/css/html/md: zero matches (Bengali
lives only as `\uXXXX` escapes in `js/i18n.js` and in test assertions).

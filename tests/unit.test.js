'use strict';
/* vaccination-tracker-bd - node unit tests. Run: node tests/unit.test.js */
const L = require('../js/logic.js');
let passed = 0, failed = 0;
function check(name, cond, extra) {
  if (cond) { passed++; console.log('PASS ' + name); }
  else { failed++; console.log('FAIL ' + name + (extra ? ' :: ' + extra : '')); }
}
function eq(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

// Schedule shape
check('schedule has 15 doses', L.SCHEDULE.length === 15);
check('BCG offset 0', L.doseById('bcg').offsetDays === 0);
check('OPV-0 offset 0', L.doseById('opv0').offsetDays === 0);
check('Penta1/PCV1/OPV1/fIPV1 offset 42', ['penta1', 'pcv1', 'opv1', 'fipv1'].every(function (id) { return L.doseById(id).offsetDays === 42; }));
check('10w doses offset 70', ['penta2', 'pcv2', 'opv2'].every(function (id) { return L.doseById(id).offsetDays === 70; }));
check('14w doses offset 98', ['penta3', 'pcv3', 'opv3', 'fipv2'].every(function (id) { return L.doseById(id).offsetDays === 98; }));
check('MR1 offset 273 (9 months)', L.doseById('mr1').offsetDays === 273);
check('MR2 offset 456 (15 months)', L.doseById('mr2').offsetDays === 456);
check('6 visits', L.VISITS.length === 6);

// Due-date math (hand-verified with date(1))
check('DOB 2026-01-01 -> Penta1 2026-02-12', L.dueDate({ dob: '2026-01-01' }, 'penta1') === '2026-02-12');
check('DOB 2026-01-01 -> MR1 2026-10-01', L.dueDate({ dob: '2026-01-01' }, 'mr1') === '2026-10-01');
check('DOB 2026-01-01 -> MR2 2027-04-02', L.dueDate({ dob: '2026-01-01' }, 'mr2') === '2027-04-02');
check('DOB 2025-06-15 -> MR1 2026-03-15', L.dueDate({ dob: '2025-06-15' }, 'mr1') === '2026-03-15');
check('leap DOB 2024-02-29 -> Penta1 2024-04-11', L.dueDate({ dob: '2024-02-29' }, 'penta1') === '2024-04-11');
check('addDays across year boundary', L.addDays('2026-12-30', 5) === '2027-01-04');
check('invalid DOB -> null due', L.dueDate({ dob: '2026-02-30' }, 'bcg') === null);
check('unknown dose -> null due', L.dueDate({ dob: '2026-01-01' }, 'nope') === null);

// doseState
const kid = { dob: '2026-01-01', records: {} };
check('BCG overdue when today past due', L.doseState(kid, 'bcg', '2026-10-18') === 'overdue');
check('MR2 upcoming far out', L.doseState(kid, 'mr2', '2026-10-18') === 'upcoming');
check('MR1 due-soon 14 days before due? MR1 due 2026-10-01, today 2026-09-20 -> due-soon', L.doseState(kid, 'mr1', '2026-09-20') === 'due-soon');
check('MR1 upcoming 15 days before due', L.doseState(kid, 'mr1', '2026-09-16') === 'upcoming');
check('due today -> due-soon', L.doseState(kid, 'mr1', '2026-10-01') === 'due-soon');
check('due yesterday -> overdue', L.doseState(kid, 'mr1', '2026-10-02') === 'overdue');
const kidDone = { dob: '2026-01-01', records: { bcg: { status: 'done', date: '2026-01-01' } } };
check('done beats overdue', L.doseState(kidDone, 'bcg', '2026-10-18') === 'done');
const kidMissed = { dob: '2026-01-01', records: { bcg: { status: 'missed' } } };
check('missed state', L.doseState(kidMissed, 'bcg', '2026-10-18') === 'missed');

// Progress
check('empty progress 0/15 0%', eq(L.childProgress(kid, '2026-10-18'), { done: 0, total: 15, pct: 0 }));
check('1 done -> 7%', L.childProgress(kidDone, '2026-10-18').pct === 7);
const kidFull = { dob: '2025-01-01', records: {} };
L.SCHEDULE.forEach(function (d) { kidFull.records[d.id] = { status: 'done', date: '2025-01-01' }; });
check('all done -> 100%', L.childProgress(kidFull, '2026-10-18').pct === 100);

// upcomingDoses
const kids = [
  { id: 'a', name: 'Asha', dob: '2026-01-01', records: {} },
  { id: 'b', name: 'Babu', dob: '2026-09-01', records: { bcg: { status: 'done', date: '2026-09-01' } } }
];
const up = L.upcomingDoses(kids, '2026-10-18', 14);
check('upcoming excludes done BCG', up.every(function (x) { return !(x.childId === 'b' && x.doseId === 'bcg'); }));
check('upcoming sorted by due', up.every(function (x, i) { return i === 0 || up[i - 1].due <= x.due; }));
check('Babu 6w doses due 2026-10-13 overdue included', up.some(function (x) { return x.childId === 'b' && x.doseId === 'penta1' && x.state === 'overdue'; }));
check('upcoming window excludes far doses', up.every(function (x) { return x.daysUntil <= 14; }));

// Dashboard stats
const stats = L.dashboardStats(kids, '2026-10-18');
check('stats children 2', stats.children === 2);
check('stats dosesDone 1', stats.dosesDone === 1);
check('stats total 30', stats.dosesTotal === 30);
check('stats overdue+dueSoon+missed+done <= total', stats.dosesDone + stats.dosesOverdue + stats.dosesDueSoon + stats.dosesMissed <= 30);

// Validation
check('valid child no errors', L.validateChild({ name: 'Asha', dob: '2026-01-01', sex: 'girl', note: '' }, '2026-10-18').length === 0);
check('empty name error', L.validateChild({ name: '  ', dob: '2026-01-01' }, '2026-10-18').includes('name_required'));
check('future DOB error', L.validateChild({ name: 'X', dob: '2026-10-19' }, '2026-10-18').includes('dob_future'));
check('bad DOB error', L.validateChild({ name: 'X', dob: '2026-13-01' }, '2026-10-18').includes('dob_invalid'));
check('DOB >18y error', L.validateChild({ name: 'X', dob: '2000-01-01' }, '2026-10-18').includes('dob_too_old'));
check('DOB exactly today OK', !L.validateChild({ name: 'X', dob: '2026-10-18' }, '2026-10-18').includes('dob_future'));
check('long name error', L.validateChild({ name: 'x'.repeat(81), dob: '2026-01-01' }, '2026-10-18').includes('name_too_long'));
check('bad sex error', L.validateChild({ name: 'X', dob: '2026-01-01', sex: 'x' }, '2026-10-18').includes('sex_invalid'));

// Dose-date validation
check('dose date OK', L.validateDoseDate(kid, 'bcg', '2026-01-02', '2026-10-18') === null);
check('dose date before birth', L.validateDoseDate(kid, 'bcg', '2025-12-31', '2026-10-18') === 'date_before_birth');
check('dose date future', L.validateDoseDate(kid, 'bcg', '2026-10-19', '2026-10-18') === 'date_future');
check('dose date invalid', L.validateDoseDate(kid, 'bcg', '2026-02-30', '2026-10-18') === 'date_invalid');

// Import validation
const good = { app: 'vaccination-tracker-bd', version: 1, children: [{ id: 'c1', name: 'Asha', dob: '2026-01-01', sex: 'girl', note: '', records: { bcg: { status: 'done', date: '2026-01-01' } } }] };
check('good import valid', L.validateImport(good) === null);
check('wrong app rejected', L.validateImport({ app: 'other', version: 1, children: [] }) === 'wrong_app');
check('wrong version rejected', L.validateImport({ app: 'vaccination-tracker-bd', version: 2, children: [] }) === 'wrong_version');
check('unknown dose rejected', L.validateImport({ app: 'vaccination-tracker-bd', version: 1, children: [{ id: 'c1', name: 'A', dob: '2026-01-01', records: { nope: { status: 'done', date: '2026-01-01' } } }] }) === 'record_unknown_dose');
check('bad status rejected', L.validateImport({ app: 'vaccination-tracker-bd', version: 1, children: [{ id: 'c1', name: 'A', dob: '2026-01-01', records: { bcg: { status: 'pending' } } }] }) === 'record_bad_status');
check('done without date rejected', L.validateImport({ app: 'vaccination-tracker-bd', version: 1, children: [{ id: 'c1', name: 'A', dob: '2026-01-01', records: { bcg: { status: 'done' } } }] }) === 'record_bad_date');
check('dup child id rejected', L.validateImport({ app: 'vaccination-tracker-bd', version: 1, children: [{ id: 'c1', name: 'A', dob: '2026-01-01' }, { id: 'c1', name: 'B', dob: '2026-01-01' }] }) === 'child_dup_id');
check('empty children valid', L.validateImport({ app: 'vaccination-tracker-bd', version: 1, children: [] }) === null);
check('null rejected', L.validateImport(null) === 'not_object');

// Bengali digits
check('Bengali digits 2026', L.toBengaliDigits('2026') === '\u09e8\u09e6\u09e8\u09ec');
check('localizeNumber bn', L.localizeNumber('15 doses', 'bn') === '\u09e7\u09eb doses');
check('localizeNumber en unchanged', L.localizeNumber('15', 'en') === '15');

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);

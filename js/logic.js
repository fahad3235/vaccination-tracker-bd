'use strict';
/* vaccination-tracker-bd - pure logic (no DOM). Node + browser compatible. */
(function (root) {
  var APP_ID = 'vaccination-tracker-bd';
  var APP_VERSION = 1;

  /* Bangladesh EPI reference schedule (see README Sources).
     offsetDays: days after date of birth. MR-1 at 9 months = 273 days,
     MR-2 at 15 months = 456 days (15 x 30.4). fIPV = fractional-dose IPV. */
  var SCHEDULE = [
    { id: 'bcg',    name: 'BCG',           visit: 'birth',  offsetDays: 0,   disease: 'Tuberculosis' },
    { id: 'opv0',   name: 'OPV-0',          visit: 'birth',  offsetDays: 0,   disease: 'Polio' },
    { id: 'penta1', name: 'Pentavalent-1', visit: '6w',     offsetDays: 42,  disease: 'Diphtheria, tetanus, pertussis, hepatitis B, Hib' },
    { id: 'pcv1',   name: 'PCV-1',         visit: '6w',     offsetDays: 42,  disease: 'Pneumococcal disease' },
    { id: 'opv1',   name: 'OPV-1',         visit: '6w',     offsetDays: 42,  disease: 'Polio' },
    { id: 'fipv1',  name: 'fIPV-1',        visit: '6w',     offsetDays: 42,  disease: 'Polio' },
    { id: 'penta2', name: 'Pentavalent-2', visit: '10w',    offsetDays: 70,  disease: 'Diphtheria, tetanus, pertussis, hepatitis B, Hib' },
    { id: 'pcv2',   name: 'PCV-2',         visit: '10w',    offsetDays: 70,  disease: 'Pneumococcal disease' },
    { id: 'opv2',   name: 'OPV-2',         visit: '10w',    offsetDays: 70,  disease: 'Polio' },
    { id: 'penta3', name: 'Pentavalent-3', visit: '14w',    offsetDays: 98,  disease: 'Diphtheria, tetanus, pertussis, hepatitis B, Hib' },
    { id: 'pcv3',   name: 'PCV-3',         visit: '14w',    offsetDays: 98,  disease: 'Pneumococcal disease' },
    { id: 'opv3',   name: 'OPV-3',         visit: '14w',    offsetDays: 98,  disease: 'Polio' },
    { id: 'fipv2',  name: 'fIPV-2',        visit: '14w',    offsetDays: 98,  disease: 'Polio' },
    { id: 'mr1',    name: 'MR-1',          visit: '9m',     offsetDays: 273, disease: 'Measles, rubella' },
    { id: 'mr2',    name: 'MR-2',          visit: '15m',    offsetDays: 456, disease: 'Measles, rubella' }
  ];

  var VISITS = [
    { id: 'birth', offsetDays: 0 },
    { id: '6w', offsetDays: 42 },
    { id: '10w', offsetDays: 70 },
    { id: '14w', offsetDays: 98 },
    { id: '9m', offsetDays: 273 },
    { id: '15m', offsetDays: 456 }
  ];

  function parseISO(s) {
    if (typeof s !== 'string') return null;
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (!m) return null;
    var d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    if (d.getUTCFullYear() !== +m[1] || d.getUTCMonth() !== +m[2] - 1 || d.getUTCDate() !== +m[3]) return null;
    return d;
  }
  function isValidISO(s) { return parseISO(s) !== null; }
  function fmtISO(d) {
    var y = d.getUTCFullYear();
    var mo = String(d.getUTCMonth() + 1).padStart(2, '0');
    var da = String(d.getUTCDate()).padStart(2, '0');
    return y + '-' + mo + '-' + da;
  }
  function addDays(iso, n) {
    var d = parseISO(iso);
    if (!d) return null;
    d.setUTCDate(d.getUTCDate() + n);
    return fmtISO(d);
  }
  function daysBetween(a, b) {
    var da = parseISO(a), db = parseISO(b);
    if (!da || !db) return null;
    return Math.round((db - da) / 86400000);
  }
  function todayISO() { return fmtISO(new Date()); }

  function doseById(id) { return SCHEDULE.filter(function (d) { return d.id === id; })[0] || null; }
  function dueDate(child, doseId) {
    var dose = doseById(doseId);
    if (!dose || !child || !isValidISO(child.dob)) return null;
    return addDays(child.dob, dose.offsetDays);
  }

  /* States: done | missed | overdue | due-soon (due within 14 days incl. today) | upcoming */
  function doseState(child, doseId, today) {
    today = today || todayISO();
    var rec = (child.records || {})[doseId];
    if (rec && rec.status === 'done') return 'done';
    if (rec && rec.status === 'missed') return 'missed';
    var due = dueDate(child, doseId);
    if (!due) return 'upcoming';
    var diff = daysBetween(today, due);
    if (diff < 0) return 'overdue';
    if (diff <= 14) return 'due-soon';
    return 'upcoming';
  }

  function childProgress(child, today) {
    today = today || todayISO();
    var done = 0;
    SCHEDULE.forEach(function (d) { if (doseState(child, d.id, today) === 'done') done++; });
    return { done: done, total: SCHEDULE.length, pct: Math.round((done / SCHEDULE.length) * 100) };
  }

  function childAgeDays(child, today) {
    today = today || todayISO();
    if (!isValidISO(child.dob)) return null;
    return daysBetween(child.dob, today);
  }

  /* Pending doses due within `windowDays` (incl. overdue), sorted by due date. */
  function upcomingDoses(children, today, windowDays) {
    today = today || todayISO();
    windowDays = (windowDays === undefined) ? 14 : windowDays;
    var out = [];
    (children || []).forEach(function (child) {
      SCHEDULE.forEach(function (dose) {
        var st = doseState(child, dose.id, today);
        if (st === 'done' || st === 'missed') return;
        var due = dueDate(child, dose.id);
        var diff = daysBetween(today, due);
        if (diff <= windowDays) out.push({ childId: child.id, childName: child.name, doseId: dose.id, doseName: dose.name, due: due, daysUntil: diff, state: st });
      });
    });
    out.sort(function (a, b) { return a.due < b.due ? -1 : a.due > b.due ? 1 : 0; });
    return out;
  }

  function dashboardStats(children, today) {
    today = today || todayISO();
    var done = 0, overdue = 0, dueSoon = 0, missed = 0;
    (children || []).forEach(function (child) {
      SCHEDULE.forEach(function (dose) {
        var st = doseState(child, dose.id, today);
        if (st === 'done') done++;
        else if (st === 'overdue') overdue++;
        else if (st === 'due-soon') dueSoon++;
        else if (st === 'missed') missed++;
      });
    });
    return { children: (children || []).length, dosesDone: done, dosesOverdue: overdue, dosesDueSoon: dueSoon, dosesMissed: missed, dosesTotal: (children || []).length * SCHEDULE.length };
  }

  function validateChild(input, today) {
    today = today || todayISO();
    var errors = [];
    var name = (input.name || '').trim();
    if (!name) errors.push('name_required');
    if (name.length > 80) errors.push('name_too_long');
    if (!isValidISO(input.dob)) errors.push('dob_invalid');
    else {
      if (input.dob > today) errors.push('dob_future');
      var age = daysBetween(input.dob, today);
      if (age !== null && age > 365 * 18) errors.push('dob_too_old');
    }
    if (input.sex && ['boy', 'girl', 'other', 'unspecified'].indexOf(input.sex) === -1) errors.push('sex_invalid');
    if ((input.note || '').length > 500) errors.push('note_too_long');
    return errors;
  }

  function validateDoseDate(child, doseId, dateISO, today) {
    today = today || todayISO();
    if (!isValidISO(dateISO)) return 'date_invalid';
    if (dateISO < child.dob) return 'date_before_birth';
    if (dateISO > today) return 'date_future';
    if (!doseById(doseId)) return 'dose_unknown';
    return null;
  }

  function validateImport(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) return 'not_object';
    if (data.app !== APP_ID) return 'wrong_app';
    if (data.version !== APP_VERSION) return 'wrong_version';
    if (!Array.isArray(data.children)) return 'children_not_array';
    var ids = {};
    for (var i = 0; i < data.children.length; i++) {
      var c = data.children[i];
      if (!c || typeof c !== 'object') return 'child_not_object';
      if (typeof c.id !== 'string' || !c.id) return 'child_id';
      if (ids[c.id]) return 'child_dup_id';
      ids[c.id] = true;
      if (validateChild({ name: c.name, dob: c.dob, sex: c.sex, note: c.note }, '9999-12-31').length) {
        /* Re-validate without the future-DOB rule: imports may legitimately
           carry any DOB; only structural validity matters here. */
        if (!c.name || typeof c.name !== 'string' || !isValidISO(c.dob)) return 'child_invalid';
      }
      if (c.records !== undefined) {
        if (!c.records || typeof c.records !== 'object' || Array.isArray(c.records)) return 'records_not_object';
        var keys = Object.keys(c.records);
        for (var k = 0; k < keys.length; k++) {
          var r = c.records[keys[k]];
          if (!doseById(keys[k])) return 'record_unknown_dose';
          if (!r || (r.status !== 'done' && r.status !== 'missed')) return 'record_bad_status';
          if (r.status === 'done' && !isValidISO(r.date)) return 'record_bad_date';
        }
      }
    }
    return null;
  }

  var BN_DIGITS = ['\u09e6', '\u09e7', '\u09e8', '\u09e9', '\u09ea', '\u09eb', '\u09ec', '\u09ed', '\u09ee', '\u09ef'];
  function toBengaliDigits(s) {
    return String(s).replace(/[0-9]/g, function (ch) { return BN_DIGITS[+ch]; });
  }
  function localizeNumber(s, lang) {
    return lang === 'bn' ? toBengaliDigits(s) : String(s);
  }

  var api = {
    APP_ID: APP_ID, APP_VERSION: APP_VERSION, SCHEDULE: SCHEDULE, VISITS: VISITS,
    parseISO: parseISO, isValidISO: isValidISO, fmtISO: fmtISO, addDays: addDays,
    daysBetween: daysBetween, todayISO: todayISO, doseById: doseById,
    dueDate: dueDate, doseState: doseState, childProgress: childProgress,
    childAgeDays: childAgeDays, upcomingDoses: upcomingDoses,
    dashboardStats: dashboardStats, validateChild: validateChild,
    validateDoseDate: validateDoseDate, validateImport: validateImport,
    toBengaliDigits: toBengaliDigits, localizeNumber: localizeNumber
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.VaxLogic = api;
})(typeof window !== 'undefined' ? window : globalThis);

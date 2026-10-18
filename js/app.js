'use strict';
/* vaccination-tracker-bd - DOM app. Depends on VaxLogic + VaxSTR. ASCII-only;
   all Bengali comes from VaxSTR. */
(function () {
  var L = window.VaxLogic;
  var STR = window.VaxSTR;
  var LS_KEY = 'vaccination-tracker-bd-v1';

  var state = { children: [], lang: 'en', tab: 'dashboard', selectedId: null, editingId: null, formErrors: [], notice: '' };

  function today() {
    var m = /[?&]asof=(\d{4}-\d{2}-\d{2})/.exec(window.location.search);
    return (m && L.isValidISO(m[1])) ? m[1] : L.todayISO();
  }
  function t(key, vars) {
    var s = (STR[state.lang] && STR[state.lang][key]) || STR.en[key] || key;
    if (vars) Object.keys(vars).forEach(function (k) { s = s.split('{' + k + '}').join(vars[k]); });
    return s;
  }
  function num(n) { return L.localizeNumber(String(n), state.lang); }
  function fmtDate(iso) {
    if (!iso) return '';
    return L.localizeNumber(iso, state.lang);
  }
  function uid() { return 'c' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36); }

  function load() {
    try {
      var raw = window.localStorage.getItem(LS_KEY);
      if (raw) {
        var data = JSON.parse(raw);
        if (data && Array.isArray(data.children)) state.children = data.children;
        if (data && (data.lang === 'en' || data.lang === 'bn')) state.lang = data.lang;
      }
    } catch (e) { /* corrupted storage: start empty */ }
  }
  function save() {
    try { window.localStorage.setItem(LS_KEY, JSON.stringify({ children: state.children, lang: state.lang })); } catch (e) {}
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function stateClass(st) { return 'badge badge-' + st; }
  function stateLabel(st) {
    return { done: t('stateDone'), missed: t('stateMissed'), overdue: t('stateOverdue'), 'due-soon': t('stateDueSoon'), upcoming: t('stateUpcoming') }[st] || st;
  }
  function visitLabel(vid) {
    return { birth: t('visitBirth'), '6w': t('visit6w'), '10w': t('visit10w'), '14w': t('visit14w'), '9m': t('visit9m'), '15m': t('visit15m') }[vid] || vid;
  }
  function sexLabel(sex) {
    return { boy: t('sexBoy'), girl: t('sexGirl'), other: t('sexOther'), unspecified: t('sexUnspecified') }[sex] || '';
  }

  function duePhrase(item) {
    if (item.state === 'overdue') return t('overdueBy', { n: num(-item.daysUntil) });
    if (item.daysUntil === 0) return t('todayLabel');
    if (item.daysUntil === 1) return t('tomorrowLabel');
    return t('dueIn', { n: num(item.daysUntil) });
  }

  function renderDashboard() {
    var td = today();
    var stats = L.dashboardStats(state.children, td);
    var up = L.upcomingDoses(state.children, td, 14).filter(function (x) { return x.state === 'overdue' || x.state === 'due-soon'; });
    var html = '<h2>' + t('dashboardTitle') + '</h2>';
    html += '<div class="stats">'
      + '<div class="stat"><div class="stat-num" data-testid="stat-children">' + num(stats.children) + '</div><div class="stat-label">' + t('statChildren') + '</div></div>'
      + '<div class="stat"><div class="stat-num" data-testid="stat-done">' + num(stats.dosesDone) + '</div><div class="stat-label">' + t('statDone') + '</div></div>'
      + '<div class="stat"><div class="stat-num" data-testid="stat-overdue">' + num(stats.dosesOverdue) + '</div><div class="stat-label">' + t('statOverdue') + '</div></div>'
      + '<div class="stat"><div class="stat-num" data-testid="stat-duesoon">' + num(stats.dosesDueSoon) + '</div><div class="stat-label">' + t('statDueSoon') + '</div></div>'
      + '<div class="stat"><div class="stat-num" data-testid="stat-missed">' + num(stats.dosesMissed) + '</div><div class="stat-label">' + t('statMissed') + '</div></div>'
      + '</div>';
    html += '<h3>' + t('progressTitle') + '</h3>';
    if (!state.children.length) html += '<p class="empty" data-testid="dashboard-empty">' + t('noChildren') + '</p>';
    state.children.forEach(function (c) {
      var p = L.childProgress(c, td);
      html += '<div class="child-progress" data-testid="progress-' + c.id + '"><div class="cp-head"><strong>' + esc(c.name) + '</strong> <span>' + t('progressOf', { done: num(p.done), total: num(p.total) }) + ' - ' + num(p.pct) + '%</span></div>'
        + '<div class="bar"><div class="bar-fill" style="width:' + p.pct + '%"></div></div></div>';
    });
    html += '<h3>' + t('upcomingTitle') + '</h3>';
    if (!up.length) html += '<p class="empty" data-testid="upcoming-empty">' + t('upcomingEmpty') + '</p>';
    else html += '<ul class="upcoming">' + up.map(function (x) {
      return '<li data-testid="upcoming-item"><strong>' + esc(x.childName) + '</strong> - ' + esc(x.doseName)
        + ' - ' + fmtDate(x.due) + ' - <span class="' + stateClass(x.state) + '">' + stateLabel(x.state) + '</span> ' + esc(duePhrase(x)) + '</li>';
    }).join('') + '</ul>';
    return html;
  }

  function renderChildren() {
    var td = today();
    var html = '<h2>' + t('childListTitle') + '</h2>';
    html += '<form id="child-form" novalidate class="card"><h3>' + (state.editingId ? t('editChildTitle') : t('addChildTitle')) + '</h3>'
      + '<label>' + t('nameLabel') + '<input data-testid="input-name" name="name" type="text" maxlength="80" required></label>'
      + '<label>' + t('dobLabel') + '<input data-testid="input-dob" name="dob" type="date" required></label>'
      + '<label>' + t('sexLabel') + '<select data-testid="input-sex" name="sex">'
      + '<option value="unspecified">' + t('sexUnspecified') + '</option>'
      + '<option value="boy">' + t('sexBoy') + '</option>'
      + '<option value="girl">' + t('sexGirl') + '</option>'
      + '<option value="other">' + t('sexOther') + '</option></select></label>'
      + '<label>' + t('noteLabel') + '<textarea data-testid="input-note" name="note" maxlength="500" rows="2"></textarea></label>'
      + '<div id="form-errors" class="errors" data-testid="form-errors">' + state.formErrors.map(function (e) { return '<div>' + esc(t('err_' + e)) + '</div>'; }).join('') + '</div>'
      + '<button type="submit" data-testid="btn-save-child">' + (state.editingId ? t('saveChangesBtn') : t('addChildBtn')) + '</button>'
      + (state.editingId ? ' <button type="button" data-testid="btn-cancel-edit">' + t('cancelBtn') + '</button>' : '')
      + '</form>';
    if (state.notice) html += '<div class="notice" data-testid="notice">' + esc(state.notice) + '</div>';
    if (!state.children.length) html += '<p class="empty" data-testid="children-empty">' + t('noChildren') + '</p>';
    html += '<div class="child-list">' + state.children.map(function (c) {
      var p = L.childProgress(c, td);
      return '<div class="child-card" data-testid="child-card-' + c.id + '"><div><strong>' + esc(c.name) + '</strong>'
        + ' <span class="muted">' + fmtDate(c.dob) + (c.sex && c.sex !== 'unspecified' ? ' - ' + sexLabel(c.sex) : '') + '</span>'
        + (c.note ? '<div class="muted">' + esc(c.note) + '</div>' : '')
        + '<div class="bar"><div class="bar-fill" style="width:' + p.pct + '%"></div></div>'
        + '<div class="muted">' + t('progressOf', { done: num(p.done), total: num(p.total) }) + '</div></div>'
        + '<div class="row-actions"><button data-testid="btn-schedule-' + c.id + '" data-action="schedule" data-id="' + c.id + '">' + t('viewScheduleBtn') + '</button> '
        + '<button data-testid="btn-edit-' + c.id + '" data-action="edit" data-id="' + c.id + '">' + t('editBtn') + '</button> '
        + '<button data-testid="btn-delete-' + c.id + '" data-action="delete" data-id="' + c.id + '">' + t('deleteBtn') + '</button></div></div>';
    }).join('') + '</div>';

    var sel = state.children.filter(function (c) { return c.id === state.selectedId; })[0];
    if (sel) {
      html += '<div class="card schedule" data-testid="schedule-panel"><button data-testid="btn-back" data-action="back">' + t('backToList') + '</button>'
        + '<h3>' + t('scheduleTitle') + ' - ' + esc(sel.name) + '</h3>'
        + '<p class="muted">' + t('scheduleNote') + '</p>';
      L.VISITS.forEach(function (v) {
        var doses = L.SCHEDULE.filter(function (d) { return d.visit === v.id; });
        html += '<h4>' + visitLabel(v.id) + '</h4><table class="sched"><thead><tr><th>' + t('colDose') + '</th><th>' + t('colDue') + '</th><th>' + t('colStatus') + '</th><th>' + t('colGiven') + '</th><th>' + t('colActions') + '</th></tr></thead><tbody>';
        doses.forEach(function (d) {
          var st = L.doseState(sel, d.id, td);
          var rec = (sel.records || {})[d.id] || {};
          html += '<tr data-testid="dose-row-' + d.id + '"><td><strong>' + esc(d.name) + '</strong><div class="muted small">' + esc(d.disease) + '</div></td>'
            + '<td>' + fmtDate(L.dueDate(sel, d.id)) + '</td>'
            + '<td><span class="' + stateClass(st) + '">' + stateLabel(st) + '</span></td>'
            + '<td>' + (rec.status === 'done' ? fmtDate(rec.date) : '-') + '</td><td>';
          if (st === 'done' || st === 'missed') {
            html += '<button data-testid="btn-clear-' + d.id + '" data-action="clear" data-dose="' + d.id + '">' + t('clearStatus') + '</button>';
          } else {
            html += '<input data-testid="date-' + d.id + '" type="date" value="' + td + '"> '
              + '<button data-testid="btn-done-' + d.id + '" data-action="done" data-dose="' + d.id + '">' + t('markDone') + '</button> '
              + '<button data-testid="btn-missed-' + d.id + '" data-action="missed" data-dose="' + d.id + '">' + t('markMissed') + '</button>';
          }
          html += '</td></tr>';
        });
        html += '</tbody></table>';
      });
      html += '</div>';
    } else if (state.children.length) {
      html += '<p class="empty">' + t('noChildSelected') + '</p>';
    }
    return html;
  }

  function renderData() {
    return '<h2>' + t('dataTitle') + '</h2>'
      + '<div class="card"><h3>' + t('dataExport') + '</h3><button data-testid="btn-export" data-action="export">' + t('exportBtn') + '</button></div>'
      + '<div class="card"><h3>' + t('dataImport') + '</h3><input data-testid="input-import" type="file" accept=".json,application/json">'
      + '<div class="notice" data-testid="import-msg">' + esc(state.notice) + '</div></div>'
      + '<div class="card danger"><h3>' + t('dataErase') + '</h3><label>' + t('eraseConfirm') + ' <input data-testid="input-erase" type="text" placeholder="' + t('erasePlaceholder') + '"></label> '
      + '<button data-testid="btn-erase" data-action="erase">' + t('eraseBtn') + '</button></div>';
  }

  function render() {
    document.title = t('appTitle');
    document.getElementById('app-title').textContent = t('appTitle');
    document.getElementById('app-tagline').textContent = t('tagline');
    document.getElementById('footer-disclaimer').textContent = t('footerDisclaimer');
    var langBtn = document.getElementById('lang-btn');
    langBtn.textContent = t('langBtn');
    document.querySelectorAll('[data-tab]').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-tab') === state.tab);
      b.textContent = t({ dashboard: 'tabDashboard', children: 'tabChildren', data: 'tabData' }[b.getAttribute('data-tab')]);
    });
    var main = document.getElementById('main');
    main.innerHTML = state.tab === 'dashboard' ? renderDashboard() : state.tab === 'children' ? renderChildren() : renderData();
    var form = document.getElementById('child-form');
    if (form && state.editingId) {
      var c = state.children.filter(function (x) { return x.id === state.editingId; })[0];
      if (c) { form.name.value = c.name; form.dob.value = c.dob; form.sex.value = c.sex || 'unspecified'; form.note.value = c.note || ''; }
    }
    save();
  }

  function findChild(id) { return state.children.filter(function (c) { return c.id === id; })[0]; }

  function onSubmit(e) {
    if (!e.target || e.target.id !== 'child-form') return;
    e.preventDefault();
    var f = e.target;
    var input = { name: f.name.value, dob: f.dob.value, sex: f.sex.value, note: f.note.value };
    var errors = L.validateChild(input, today());
    state.formErrors = errors;
    if (errors.length) { render(); return; }
    if (state.editingId) {
      var c = findChild(state.editingId);
      if (c) { c.name = input.name.trim(); c.dob = input.dob; c.sex = input.sex; c.note = input.note.trim(); }
      state.editingId = null;
    } else {
      state.children.push({ id: uid(), name: input.name.trim(), dob: input.dob, sex: input.sex, note: input.note.trim(), records: {} });
    }
    state.formErrors = [];
    state.notice = '';
    render();
  }

  function onClick(e) {
    var btn = e.target.closest('button[data-action]');
    if (!btn) return;
    var action = btn.getAttribute('data-action');
    var id = btn.getAttribute('data-id');
    var doseId = btn.getAttribute('data-dose');
    state.notice = '';
    if (action === 'schedule') { state.selectedId = id; }
    else if (action === 'back') { state.selectedId = null; }
    else if (action === 'edit') {
      state.editingId = id; state.tab = 'children';
      window.scrollTo(0, 0);
    } else if (action === 'delete') {
      if (window.confirm(t('deleteConfirm'))) {
        state.children = state.children.filter(function (c) { return c.id !== id; });
        if (state.selectedId === id) state.selectedId = null;
        if (state.editingId === id) state.editingId = null;
      }
    } else if (action === 'done' || action === 'missed' || action === 'clear') {
      var sel = findChild(state.selectedId);
      if (sel) {
        sel.records = sel.records || {};
        if (action === 'clear') { delete sel.records[doseId]; }
        else if (action === 'missed') { sel.records[doseId] = { status: 'missed' }; }
        else {
          var row = document.querySelector('[data-testid="dose-row-' + doseId + '"]');
          var dateInput = row ? row.querySelector('input[type="date"]') : null;
          var dateISO = dateInput ? dateInput.value : today();
          var err = L.validateDoseDate(sel, doseId, dateISO, today());
          if (err) { state.notice = t('err_' + err); render(); return; }
          sel.records[doseId] = { status: 'done', date: dateISO };
        }
      }
    } else if (action === 'export') {
      var blob = new Blob([JSON.stringify({ app: L.APP_ID, version: L.APP_VERSION, children: state.children }, null, 2)], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'vaccination-tracker-bd.json';
      document.body.appendChild(a); a.click(); a.remove();
      state.notice = '';
    } else if (action === 'erase') {
      var inp = document.querySelector('[data-testid="input-erase"]');
      if (inp && inp.value === 'DELETE') {
        state.children = []; state.selectedId = null; state.editingId = null;
        state.notice = t('eraseDone');
      }
    }
    render();
  }

  function onChange(e) {
    if (e.target && e.target.getAttribute('data-testid') === 'input-import') {
      var file = e.target.files && e.target.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        try {
          var data = JSON.parse(reader.result);
          var err = L.validateImport(data);
          if (err) { state.notice = t('importError') + err; }
          else { state.children = data.children; state.selectedId = null; state.editingId = null; state.notice = t('importOk'); }
        } catch (ex) { state.notice = t('importError') + 'invalid JSON'; }
        render();
      };
      reader.readAsText(file);
    }
  }

  function onTabClick(e) {
    var b = e.target.closest('[data-tab]');
    if (!b) return;
    state.tab = b.getAttribute('data-tab');
    state.notice = '';
    render();
  }

  document.addEventListener('DOMContentLoaded', function () {
    load();
    render();
    document.getElementById('tabs').addEventListener('click', onTabClick);
    document.getElementById('lang-btn').addEventListener('click', function () {
      state.lang = state.lang === 'en' ? 'bn' : 'en';
      render();
    });
    document.getElementById('main').addEventListener('submit', onSubmit);
    document.getElementById('main').addEventListener('click', onClick);
    document.getElementById('main').addEventListener('change', onChange);
  });
})();

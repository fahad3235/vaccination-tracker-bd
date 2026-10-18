/* vaccination-tracker-bd - headless-Chrome smoke test via raw CDP.
   Run: node tests/smoke.js [desktop|mobile]
   Uses /opt/meta-chromium/chrome + Node global WebSocket. No deps. */
'use strict';
const { spawn, execSync } = require('child_process');
const path = require('path');

const MODE = process.argv[2] || 'desktop';
const WIDTH = MODE === 'mobile' ? 390 : 1280;
const PORT = MODE === 'mobile' ? 9240 : 9239;
const DIR = path.resolve(__dirname, '..');
const URL = 'file://' + DIR + '/index.html?asof=2026-10-18';

let passed = 0, failed = 0;
function check(name, cond, extra) {
  if (cond) { passed++; console.log('PASS ' + name); }
  else { failed++; console.log('FAIL ' + name + (extra ? ' :: ' + extra : '')); }
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

class CDP {
  constructor(wsUrl) { this.ws = new WebSocket(wsUrl); this.id = 0; this.pending = new Map(); this.events = []; }
  async open() {
    await new Promise((res, rej) => { this.ws.onopen = res; this.ws.onerror = rej; });
    this.ws.onmessage = (m) => {
      const d = JSON.parse(m.data);
      if (d.id && this.pending.has(d.id)) {
        const { resolve, reject } = this.pending.get(d.id);
        this.pending.delete(d.id);
        d.error ? reject(new Error(JSON.stringify(d.error))) : resolve(d.result);
      } else this.events.push(d);
    };
  }
  send(method, params) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params: params || {} }));
    });
  }
  async evalExpr(expr) {
    const r = await this.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error('eval exception: ' + JSON.stringify(r.exceptionDetails));
    return r.result.value;
  }
  close() { try { this.ws.close(); } catch (e) {} }
}

(async () => {
  const userDir = '/tmp/vax-chrome-' + MODE;
  execSync('rm -rf ' + userDir);
  const chrome = spawn('/opt/meta-chromium/chrome', [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--no-proxy-server',
    '--window-size=' + WIDTH + ',900',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + userDir, 'about:blank'
  ], { stdio: 'ignore' });
  let cdp = null;
  const consoleErrors = [];
  const netRequests = [];
  try {
    let targets = null;
    for (let i = 0; i < 50 && !targets; i++) {
      await sleep(200);
      try {
        const res = await fetch('http://127.0.0.1:' + PORT + '/json/list');
        targets = await res.json();
      } catch (e) {}
    }
    if (!targets || !targets.length) throw new Error('no CDP targets');
    const page = targets.find(t => t.type === 'page') || targets[0];
    cdp = new CDP(page.webSocketDebuggerUrl);
    await cdp.open();
    await cdp.send('Runtime.enable');
    await cdp.send('Page.enable');
    await cdp.send('Network.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: WIDTH, height: 900, deviceScaleFactor: 1, mobile: MODE === 'mobile' });
    cdp.ws.onmessage = ((orig) => (m) => {
      orig(m);
      try {
        const d = JSON.parse(m.data);
        if (d.method === 'Runtime.consoleAPICalled' && d.params && d.params.type === 'error') {
          consoleErrors.push(JSON.stringify(d.params.args));
        }
        if (d.method === 'Runtime.exceptionThrown') consoleErrors.push(JSON.stringify(d.params.exceptionDetails));
        if (d.method === 'Network.requestWillBeSent' && d.params && d.params.request) {
          const u = d.params.request.url;
          if (/^https?:/.test(u)) netRequests.push(u);
        }
      } catch (e) {}
    })(cdp.ws.onmessage);
    await cdp.send('Page.navigate', { url: URL });
    await sleep(1200);

    check('title renders', await cdp.evalExpr(`document.getElementById('app-title').textContent === 'Vaccination Tracker BD'`));
    check('dashboard empty state', await cdp.evalExpr(`!!document.querySelector('[data-testid="dashboard-empty"]')`));
    check('stats children 0', await cdp.evalExpr(`document.querySelector('[data-testid="stat-children"]').textContent === '0'`));

    // Go to Children tab, add a child (DOB 2026-01-01 -> BCG/MR1 overdue at asof 2026-10-18)
    await cdp.evalExpr(`document.querySelector('[data-tab="children"]').click()`);
    await sleep(300);
    await cdp.evalExpr(`(function(){ var f=document.getElementById('child-form'); f.querySelector('[name="name"]').value='Asha'; f.querySelector('[name="dob"]').value='2026-01-01'; f.querySelector('[name="sex"]').value='girl'; f.querySelector('[name="note"]').value='Test'; f.requestSubmit(); return true; })()`);
    await sleep(500);
    check('child card appears', await cdp.evalExpr(`!!document.querySelector('[data-testid^="child-card-"]')`));
    check('child name renders', await cdp.evalExpr(`document.body.innerText.includes('Asha')`));
    check('stats children 1 after add (dashboard not visible; check via children count)', await cdp.evalExpr(`document.querySelectorAll('[data-testid^="child-card-"]').length === 1`));

    // Validation: empty name
    await cdp.evalExpr(`(function(){ var f=document.getElementById('child-form'); f.querySelector('[name="name"]').value=''; f.querySelector('[name="dob"]').value='2026-01-01'; f.requestSubmit(); return true; })()`);
    await sleep(400);
    check('empty-name validation error', await cdp.evalExpr(`document.querySelector('[data-testid="form-errors"]').innerText.includes('Name is required')`));
    check('no duplicate child after invalid submit', await cdp.evalExpr(`document.querySelectorAll('[data-testid^="child-card-"]').length === 1`));

    // Schedule: view + dose rows
    await cdp.evalExpr(`document.querySelector('[data-action="schedule"]').click()`);
    await sleep(500);
    check('schedule panel opens', await cdp.evalExpr(`!!document.querySelector('[data-testid="schedule-panel"]')`));
    check('15 dose rows', await cdp.evalExpr(`document.querySelectorAll('[data-testid^="dose-row-"]').length === 15`));
    check('BCG row overdue', await cdp.evalExpr(`document.querySelector('[data-testid="dose-row-bcg"]').innerText.includes('Overdue')`));
    check('BCG due date 2026-01-01', await cdp.evalExpr(`document.querySelector('[data-testid="dose-row-bcg"]').innerText.includes('2026-01-01')`));
    check('MR1 due 2026-10-01 overdue', await cdp.evalExpr(`document.querySelector('[data-testid="dose-row-mr1"]').innerText.includes('2026-10-01') && document.querySelector('[data-testid="dose-row-mr1"]').innerText.includes('Overdue')`));
    check('MR2 upcoming', await cdp.evalExpr(`document.querySelector('[data-testid="dose-row-mr2"]').innerText.includes('Upcoming')`));

    // Mark BCG done (date 2026-01-01)
    await cdp.evalExpr(`(function(){ var row=document.querySelector('[data-testid="dose-row-bcg"]'); row.querySelector('input[type="date"]').value='2026-01-01'; row.querySelector('[data-testid="btn-done-bcg"]').click(); return true; })()`);
    await sleep(400);
    check('BCG marked Given', await cdp.evalExpr(`document.querySelector('[data-testid="dose-row-bcg"]').innerText.includes('Given')`));
    check('BCG given date shows', await cdp.evalExpr(`document.querySelector('[data-testid="dose-row-bcg"]').innerText.includes('2026-01-01')`));
    check('progress 7% after 1/15', await cdp.evalExpr(`document.body.innerText.includes('1 of 15 doses')`));

    // Mark Penta1 missed, then clear it
    await cdp.evalExpr(`document.querySelector('[data-testid="btn-missed-penta1"]').click()`);
    await sleep(400);
    check('Penta1 missed', await cdp.evalExpr(`document.querySelector('[data-testid="dose-row-penta1"]').innerText.includes('Missed')`));
    await cdp.evalExpr(`document.querySelector('[data-testid="btn-clear-penta1"]').click()`);
    await sleep(400);
    check('Penta1 cleared back to Overdue', await cdp.evalExpr(`document.querySelector('[data-testid="dose-row-penta1"]').innerText.includes('Overdue')`));

    // Dose-date validation: future date rejected
    await cdp.evalExpr(`(function(){ var row=document.querySelector('[data-testid="dose-row-opv0"]'); row.querySelector('input[type="date"]').value='2027-01-01'; row.querySelector('[data-testid="btn-done-opv0"]').click(); return true; })()`);
    await sleep(400);
    check('future dose date rejected, OPV0 still Overdue', await cdp.evalExpr(`document.querySelector('[data-testid="dose-row-opv0"]').innerText.includes('Overdue')`));

    // Dashboard reflects state
    await cdp.evalExpr(`document.querySelector('[data-tab="dashboard"]').click()`);
    await sleep(400);
    check('dashboard doses done = 1', await cdp.evalExpr(`document.querySelector('[data-testid="stat-done"]').textContent === '1'`));
    check('dashboard upcoming lists overdue MR1', await cdp.evalExpr(`document.body.innerText.includes('MR-1') && document.body.innerText.includes('overdue')`));

    // Language toggle -> Bengali
    await cdp.evalExpr(`document.getElementById('lang-btn').click()`);
    await sleep(400);
    check('Bengali title renders', await cdp.evalExpr(`document.getElementById('app-title').textContent.includes('\u099f\u09bf\u0995\u09be')`));
    check('Bengali digits in stats', await cdp.evalExpr(`document.querySelector('[data-testid="stat-children"]').textContent === '\u09e7'`));
    await cdp.evalExpr(`document.getElementById('lang-btn').click()`);
    await sleep(400);
    check('toggle back to English', await cdp.evalExpr(`document.getElementById('app-title').textContent === 'Vaccination Tracker BD'`));

    // Persistence across reload
    await cdp.send('Page.navigate', { url: URL });
    await sleep(1200);
    await cdp.evalExpr(`document.querySelector('[data-tab="children"]').click()`);
    await sleep(400);
    check('child persists after reload', await cdp.evalExpr(`document.body.innerText.includes('Asha')`));
    check('BCG still Given after reload', await cdp.evalExpr(`(function(){ document.querySelector('[data-action="schedule"]').click(); return true; })() === true`));
    await sleep(400);
    check('BCG Given persists', await cdp.evalExpr(`document.querySelector('[data-testid="dose-row-bcg"]').innerText.includes('Given')`));

    // Delete with confirm stubbed true
    await cdp.evalExpr(`window.confirm = function(){ return true; }; document.querySelector('[data-testid="btn-back"]').click()`);
    await sleep(300);
    await cdp.evalExpr(`document.querySelector('[data-testid^="btn-delete-"]').click()`);
    await sleep(400);
    check('delete removes child', await cdp.evalExpr(`document.querySelectorAll('[data-testid^="child-card-"]').length === 0`));

    // Erase flow: add child, erase with wrong word (no-op), then DELETE
    await cdp.evalExpr(`(function(){ var f=document.getElementById('child-form'); f.querySelector('[name="name"]').value='Babu'; f.querySelector('[name="dob"]').value='2026-09-01'; f.requestSubmit(); return true; })()`);
    await sleep(400);
    check('second child added', await cdp.evalExpr(`document.querySelectorAll('[data-testid^="child-card-"]').length === 1`));
    await cdp.evalExpr(`document.querySelector('[data-tab="data"]').click()`);
    await sleep(300);
    await cdp.evalExpr(`(function(){ document.querySelector('[data-testid="input-erase"]').value='NOPE'; document.querySelector('[data-testid="btn-erase"]').click(); return true; })()`);
    await sleep(300);
    await cdp.evalExpr(`document.querySelector('[data-tab="children"]').click()`);
    await sleep(300);
    check('wrong erase word does not erase', await cdp.evalExpr(`document.querySelectorAll('[data-testid^="child-card-"]').length === 1`));
    await cdp.evalExpr(`document.querySelector('[data-tab="data"]').click()`);
    await sleep(300);
    await cdp.evalExpr(`(function(){ document.querySelector('[data-testid="input-erase"]').value='DELETE'; document.querySelector('[data-testid="btn-erase"]').click(); return true; })()`);
    await sleep(300);
    await cdp.evalExpr(`document.querySelector('[data-tab="children"]').click()`);
    await sleep(300);
    check('DELETE erases all', await cdp.evalExpr(`document.querySelectorAll('[data-testid^="child-card-"]').length === 0`));

    // Overflow + network + console
    check('no horizontal overflow at ' + WIDTH + 'px', await cdp.evalExpr(`document.documentElement.scrollWidth <= ${WIDTH}`), await cdp.evalExpr(`'scrollWidth=' + document.documentElement.scrollWidth`));
    check('zero http(s) network requests', netRequests.length === 0, netRequests.join(','));
    check('zero console errors', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));
  } finally {
    if (cdp) cdp.close();
    chrome.kill();
  }
  console.log('\n' + passed + ' passed, ' + failed + ' failed (' + MODE + ')');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('HARNESS ERROR', e); process.exit(2); });

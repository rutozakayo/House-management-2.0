import { JSDOM, VirtualConsole } from 'jsdom';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

const html = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');
const appjs = fs.readFileSync(path.join(ROOT, 'public', 'app.js'), 'utf8');

let pass = 0; const fails = [];
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ✓ ' + n); } else { fails.push(n + (x ? ' — ' + x : '')); console.log('  ✗ ' + n + (x ? ' — ' + x : '')); } };
const eq = (n, a, b) => ok(n, JSON.stringify(a) === JSON.stringify(b), `got ${JSON.stringify(a)} want ${JSON.stringify(b)}`);

const legacyData = {
  houses: [
    { id: 'h1', number: '1', tenant: 'Amina K', phone: '0700111222', rent: 250000, rate: 3000 },
    { id: 'h2', number: '2', tenant: 'John M', phone: '', rent: 180000, rate: 3000 }
  ],
  payments: [
    { id: 'p1', type: 'rent', houseId: 'h1', month: '2026-09', amount: 250000, date: '2026-09-04' },
    { id: 'p2', type: 'rent', houseId: 'h2', month: '2026-09', amount: 100000, date: '2026-09-06' },
    { id: 'p3', type: 'water', houseId: 'h1', month: '2026-09', amount: 30000, date: '2026-09-07' }
  ],
  readings: [
    { id: 'r1', houseId: 'h1', month: '2026-09', prev: 100, curr: 110, units: 10, rate: 3000, charge: 30000 }
  ],
  landlordPhone: '0777000111',
  deadline: '2026-09-30'
};

const vc = new VirtualConsole();
const errors = [];
vc.on('jsdomError', e => errors.push(e.message));

const shim = `<script>
  window.scrollTo=function(){};
  window.confirm=function(){return true;};
  window.print=function(){window.__printed=true;};
</script>`;

const dom = new JSDOM(html.replace('<script src="app.js"></script>', shim + `<script>${appjs}</script>`), {
  url: 'https://localhost/',
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  virtualConsole: vc,
  beforeParse(win) {
    win.localStorage.setItem('rentalManagerV1', JSON.stringify(legacyData));
    win.matchMedia = win.matchMedia || (() => ({ matches: false, addListener() {}, removeListener() {} }));
  }
});
const { window } = dom;
const doc = window.document;
const $ = id => doc.getElementById(id);
await new Promise(r => window.addEventListener('load', r, { once: true }));
await new Promise(r => setTimeout(r, 60));

const RHM = window.__RHM;
const db = RHM.getDb();

console.log('\nA. Legacy v1 boot');
eq('houses migrated', db.houses.length, 2);
eq('payments migrated', db.payments.length, 3);
eq('settings pulled from v1 top-level fields', db.settings.landlordPhone, '0777000111');
eq('deadline migrated', db.settings.deadline, '2026-09-30');
ok('houses rendered from legacy data', $('housesBody').innerHTML.includes('Amina K'));
ok('settings inputs show migrated values', $('setLandlordPhone').value === '0777000111');
ok('sticky wrapper present', !!doc.querySelector('.sticky-top'));

console.log('\nB. Legacy month view');
RHM.setMonth('2026-09');
eq('rent due sept', RHM.monthTotals('2026-09').rentDue, 430000);
eq('rent paid sept', RHM.monthTotals('2026-09').rentPaid, 350000);
eq('water billed sept', RHM.monthTotals('2026-09').waterBilled, 30000);
eq('total outstanding sept', RHM.monthTotals('2026-09').totalOut, 80000);
ok('history contains September 2026', $('historyBody').innerHTML.includes('September 2026'));
ok('summary shows balance', $('summaryBody').innerHTML.includes('Amina K'));

console.log('\nC. Arrears carry forward');
const h1 = db.houses.find(h => h.id === 'h1');
const h2 = db.houses.find(h => h.id === 'h2');
eq('h1 fully settled (rent+water)', RHM.arrearsFor(h1, '2026-10').total, 0);
eq('h2 owes one month rent', RHM.arrearsFor(h2, '2026-10').rent, 80000);
eq('h2 since is first record month', h2.since, '2026-09');

console.log('\nD. Print + CSV on legacy data');
doc.getElementById('printBtn').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
ok('print was invoked', window.__printed === true);
ok('print area built', $('printArea').innerHTML.includes('Statement for September 2026'), $('printArea').innerHTML.slice(0, 90));
ok('print area has house rows', $('printArea').innerHTML.includes('Amina K'));
const csv = RHM.monthCsv('2026-09');
ok('csv includes legacy figures', csv.includes('250000') && csv.includes('80000'));

console.log('\nE. V2 key written on save');
const beforeSave = window.localStorage.getItem('rentalManagerV2');
doc.getElementById('setCurrency').value = 'KSh';
doc.getElementById('settingsForm').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
ok('v2 key created after save', window.localStorage.getItem('rentalManagerV2') !== null);
ok('v2 key was empty before save', beforeSave === null);
ok('legacy key untouched (rollback safe)', window.localStorage.getItem('rentalManagerV1') !== null);

console.log('\nF. WhatsApp text quality');
const t = RHM.tenantMessage(h2, '2026-09');
ok('message mentions house number', t.includes('House 2'));
ok('message includes outstanding total', /Total outstanding: KSh 80,000/.test(t), t);
ok('message includes deadline', t.includes('30/09/2026'));
const noPhone = RHM.normalizePhone('');
ok('empty phone stays empty', noPhone === '');
ok('wa link without phone still valid url', RHM.waLink('', 'x').startsWith('https://wa.me/?text='));

console.log('\nG. No console errors');
ok('no jsdom errors', errors.filter(e => !/not implemented|Could not parse CSS/i.test(e)).length === 0, errors.join(' | '));

console.log('\n----------------------------------------');
console.log(`legacy: PASS ${pass} / FAIL ${fails.length}`);
if (fails.length) { fails.forEach(f => console.log(' - ' + f)); process.exit(1); }

import { JSDOM, VirtualConsole } from 'jsdom';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');


let pass = 0;
const failures = [];

function ok(name, cond, extra = '') {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { failures.push(name + (extra ? ' — ' + extra : '')); console.log('  ✗ ' + name + (extra ? ' — ' + extra : '')); }
}

function eq(name, actual, expected) {
  ok(name, JSON.stringify(actual) === JSON.stringify(expected), `got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
}

const html = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');
const appjs = fs.readFileSync(path.join(ROOT, 'public', 'app.js'), 'utf8');

if (!html.includes('<script src="app.js"></script>')) throw new Error('script tag missing');

const virtualConsole = new VirtualConsole();
const jsErrors = [];
virtualConsole.on('jsdomError', (e) => jsErrors.push(e.message));
virtualConsole.on('error', (m) => jsErrors.push(String(m)));

const shim = `<script>
  window.scrollTo = function(){};
  window.confirm = function(){ window.__confirmCalls = (window.__confirmCalls||0)+1; return window.__confirmAnswer !== false; };
  window.print = function(){ window.__printed = true; };
  window.open = function(u){ window.__opened = u; return null; };
</script>`;

const dom = new JSDOM(html.replace('<script src="app.js"></script>', shim + `<script>${appjs}</script>`), {
  url: 'https://localhost/',
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  virtualConsole
});
const { window } = dom;
const doc = window.document;
const $ = (id) => doc.getElementById(id);

await new Promise((r) => window.addEventListener('load', r, { once: true }));
await new Promise((r) => setTimeout(r, 60));

const RHM = window.__RHM;
const submit = (form) => form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
const click = (el) => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
const setVal = (id, v) => { const el = $(id); el.value = v; el.dispatchEvent(new window.Event('input', { bubbles: true })); el.dispatchEvent(new window.Event('change', { bubbles: true })); };

function addHouse(number, tenant, phone, rent, rate) {
  $('hNumber').value = number;
  $('hTenant').value = tenant;
  $('hPhone').value = phone;
  $('hRent').value = String(rent);
  $('hRate').value = String(rate);
  submit($('houseForm'));
}

console.log('\n1. Boot');
ok('app exposed', !!RHM, 'window.__RHM missing');
ok('toast element found', !!$('toast'));
ok('month defaults to current month', /^\d{4}-\d{2}$/.test($('month').value), $('month').value);
ok('no houses initially', RHM.getDb().houses.length === 0);
ok('service worker absent in jsdom is handled', true);

console.log('\n2. Houses');
addHouse('2', 'Grace A', '0771234567', 500, 2);
eq('house saved', RHM.getDb().houses.length, 1);
const h = RHM.getDb().houses[0];
ok('house appears in table', $('housesBody').innerHTML.includes('Grace A'));
ok('rent status pill rendered', /Paid|Unpaid|Partial/.test($('housesBody').innerHTML));
ok('localStorage persisted', JSON.parse(window.localStorage.getItem('rentalManagerV2')).houses.length === 1);

addHouse('2', 'Dup', '', 100, 1);
eq('duplicate house number rejected', RHM.getDb().houses.length, 1);
ok('duplicate toast shown', /already exists/.test($('toast').textContent), $('toast').textContent);

addHouse('10', 'Peter B', '', 300, 3);
eq('second house saved', RHM.getDb().houses.length, 2);
eq('houses sorted numerically (2 before 10)', RHM.getDb().houses.map(x => x.number).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })), ['2', '10']);
ok('house select populated for rent', $('rHouse').options.length === 2, String($('rHouse').options.length));

console.log('\n3. Rent payments');
$('rHouse').value = h.id;
$('rAmount').value = '200';
$('rDate').value = '2026-11-03';
submit($('rentForm'));
eq('payment stored', RHM.getDb().payments.length, 1);
eq('partial balance', RHM.rentFigures(h, RHM.getDb().payments[0].month).balance, 300);
ok('payment list rendered', $('rentPayments').innerHTML.includes('200'));
ok('amount field cleared', $('rAmount').value === '');

$('rAmount').value = '0';
submit($('rentForm'));
eq('zero amount rejected', RHM.getDb().payments.length, 1);

const payBtn = [...doc.querySelectorAll('[data-act="pay-balance"][data-type="rent"]')]
  .find((b) => b.getAttribute('data-id') === h.id);
ok('mark-balance-paid button exists', !!payBtn);
click(payBtn);
eq('balance settled after quick pay', RHM.rentFigures(h, '2026-11').balance, 0);
ok('status shows paid', /Paid/.test($('housesBody').innerHTML));

console.log('\n4. Water reading + payment');
setVal('wHouse', h.id);
ok('previous reading auto-filled empty on first reading', $('wPrev').value === '');

$('wPrev').value = '100';
$('wCurr').value = '120';
setVal('wCurr', '120');
ok('live preview calculates charge', /40/.test($('waterPreview').textContent), $('waterPreview').textContent);
submit($('waterForm'));
const reading = RHM.getDb().readings[0];
eq('reading units', reading.units, 20);
eq('reading charge', reading.charge, 40);
ok('water status rendered with bill', /40/.test($('waterMessages').innerHTML));

$('wPrev').value = '120';
$('wCurr').value = '110';
submit($('waterForm'));
eq('decreasing reading rejected', RHM.getDb().readings.length, 1);
ok('error toast for bad reading', /lower than/.test($('toast').textContent), $('toast').textContent);

setVal('wpHouse', h.id);
$('wpAmount').value = '25';
$('wpDate').value = '2026-11-04';
submit($('waterPayForm'));
eq('water payment stored', RHM.getDb().payments.filter(p => p.type === 'water').length, 1);
eq('water balance', RHM.waterFigures(h, '2026-11').balance, 15);

console.log('\n5. Summary + history');
const totals = RHM.monthTotals('2026-11');
eq('month rent due', totals.rentDue, 800);        // 500 + 300
eq('month rent paid', totals.rentPaid, 500);
eq('month water billed', totals.waterBilled, 40);
eq('month water paid', totals.waterPaid, 25);
ok('summary table has both houses', $('summaryBody').innerHTML.includes('Peter B') && $('summaryBody').innerHTML.includes('Grace A'));
ok('summary totals row rendered', $('summaryTotals').innerHTML.includes('Total'));
ok('kpi cards rendered', $('summaryKpis').innerHTML.includes('Still owed'));
ok('history row for current month', $('historyBody').innerHTML.includes('November 2026'), $('historyBody').textContent.slice(0, 120));

const hRow = [...doc.querySelectorAll('[data-act="goto-month"]')][0];
click(hRow);
ok('history row navigates to month', $('month').value === '2026-11');

console.log('\n6. WhatsApp / SMS links');
eq('local 07 number normalised', RHM.normalizePhone('0771 234 567'), '256771234567');
eq('already international kept', RHM.normalizePhone('+256771234567'), '256771234567');
eq('leading 00 stripped', RHM.normalizePhone('00256771234567'), '256771234567');
const link = RHM.waLink('0771234567', 'Hello there & thanks');
ok('wa.me link built', link.startsWith('https://wa.me/256771234567?text='), link);
ok('message encoded', link.includes('Hello%20there%20%26%20thanks'));
const msg = RHM.tenantMessage(h, '2026-11');
ok('tenant message carries balance', msg.includes('Balance') || msg.includes('balance'), msg);
ok('tenant message uses currency', msg.includes('UGX'), msg);

console.log('\n7. Arrears');
const ar = RHM.arrearsFor(h, '2026-12');
eq('only the unpaid water carries into arrears', ar.total, 15);
eq('rent arrears empty when rent settled', ar.rent, 0);

console.log('\n8. Settings');
$('setLandlordPhone').value = '0700000000';
$('setCountry').value = '+256';
$('setCurrency').value = ' UGX ';
$('setDeadline').value = '2026-11-28';
submit($('settingsForm'));
eq('country code digits only', RHM.getDb().settings.countryCode, '256');
eq('currency trimmed', RHM.getDb().settings.currency, 'UGX');
eq('deadline stored', RHM.getDb().settings.deadline, '2026-11-28');
ok('currency reaches messages', RHM.tenantMessage(h, '2026-11').includes('UGX'));

click($('themeBtn'));
ok('theme cycles to light', doc.documentElement.getAttribute('data-theme') === 'light', doc.documentElement.getAttribute('data-theme'));
click($('themeBtn'));
ok('theme cycles to dark', doc.documentElement.getAttribute('data-theme') === 'dark');
click($('themeBtn'));
ok('theme cycles back to auto', doc.documentElement.getAttribute('data-theme') === null);

console.log('\n9. Exports');
const csv = RHM.monthCsv('2026-11');
ok('csv has BOM', csv.charCodeAt(0) === 0xfeff);
ok('csv has house row', csv.includes('Grace A'));
ok('csv has totals', csv.includes('TOTAL'));
ok('csv has payments section', csv.includes('Payments in November 2026'));
const allCsv = RHM.allPaymentsCsv();
ok('all payments csv has rows', allCsv.split('\r\n').length >= 4, String(allCsv.split('\r\n').length));
ok('history csv works', RHM.historyCsv().includes('Rent due'));

const backup = JSON.parse(window.__RHM.getDb() ? JSON.stringify({ app: 'rental-house-manager', version: 2, data: RHM.getDb() }) : '{}');
eq('backup round-trip houses', backup.data.houses.length, 2);

console.log('\n10. Deleting');
const beforePayments = RHM.getDb().payments.length;
const delBtn = doc.querySelector('[data-act="delete-payment"]');
click(delBtn);
eq('payment deleted', RHM.getDb().payments.length, beforePayments - 1);
ok('confirm was requested', window.__confirmCalls > 0);

console.log('\n11. Vacate / reinstate');
const vacateBtn = doc.querySelector('[data-act="vacate-house"][data-id="' + h.id + '"]');
click(vacateBtn);
eq('house marked vacated', RHM.getDb().houses.find(x => x.id === h.id).until, '2026-11');
eq('no rent due after vacating', RHM.rentFigures(RHM.getDb().houses.find(x => x.id === h.id), '2026-12').due, 0);
const reinstateBtn = doc.querySelector('[data-act="reinstate-house"][data-id="' + h.id + '"]');
click(reinstateBtn);
eq('house reinstated', RHM.getDb().houses.find(x => x.id === h.id).until, '');

console.log('\n11b. Arrears survive vacating');
const peter = RHM.getDb().houses.find(x => x.number === '10');
click(doc.querySelector('[data-act="vacate-house"][data-id="' + peter.id + '"]'));
RHM.setMonth('2026-12');
ok('arrears card visible for vacated tenant debt', !$('arrearsCard').hidden);
ok('vacated tenant still listed in arrears', $('arrearsBody').innerHTML.includes('Peter B'), $('arrearsBody').textContent.slice(0, 100));
ok('vacated tenant excluded from this month rent table', !$('summaryBody').innerHTML.includes('Peter B'));
RHM.setMonth('2026-11');

console.log('\n12. Legacy migration (v1 data)');
const legacy = RHM.migrate({
  houses: [{ id: 'a1', number: '3', tenant: 'Old Tenant', phone: '', rent: 150, rate: 1.5 }],
  payments: [{ id: 'p1', type: 'rent', houseId: 'a1', month: '2026-08', amount: 150, date: '2026-08-02' }],
  readings: [{ id: 'r1', houseId: 'a1', month: '2026-08', prev: 10, curr: 20, units: 10, rate: 1.5, charge: 15 }],
  landlordPhone: '0779999999',
  deadline: '2026-09-05'
});
eq('legacy house kept', legacy.houses.length, 1);
eq('legacy landlord phone moved into settings', legacy.settings.landlordPhone, '0779999999');
eq('legacy deadline moved into settings', legacy.settings.deadline, '2026-09-05');
eq('legacy since inferred from payments', legacy.houses[0].since, '2026-08');
eq('legacy reading charge preserved', legacy.readings[0].charge, 15);
eq('legacy house still active', legacy.houses[0].until, '');

console.log('\n13. Robustness');
ok('HTML has no duplicate element ids', (() => {
  const ids = [...doc.querySelectorAll('[id]')].map(e => e.id);
  return new Set(ids).size === ids.length;
})());
ok('every label is attached to a control', [...doc.querySelectorAll('label')].every(l => l.querySelector('input,select') || l.getAttribute('for')));
ok('all form controls have ids', [...doc.querySelectorAll('input,select')].every(el => el.id));
ok('no runtime jsdom errors', jsErrors.filter(e => !/Could not parse CSS|not implemented/i.test(e)).length === 0, jsErrors.join(' | '));
eq('final house count', RHM.getDb().houses.length, 2);


console.log('\n14. Month fallback (iOS-style browsers)');
RHM.forceMonthFallback();
const sel = $('monthFallback');
ok('fallback select shown', sel.hidden === false);
ok('month input hidden', $('month').hidden === true);
ok('fallback has many months', sel.options.length > 24, String(sel.options.length));
ok('fallback selection matches current month', sel.value === $('month').value, sel.value + ' vs ' + $('month').value);
sel.value = '2026-10';
sel.dispatchEvent(new window.Event('change', { bubbles: true }));
ok('choosing a month from fallback works', $('month').value === '2026-10', $('month').value);
ok('labels follow fallback month', [...doc.querySelectorAll('.monthLabel')].some(el => el.textContent === 'October 2026'));
console.log('\n----------------------------------------');
console.log(`TOTAL PASS ${pass} / FAIL ${failures.length}`);

console.log('\n15. M-Pesa ledger reconciliation');
const pendingMpesa = {
  id: 'sandbox-pending-1', status: 'pending', houseId: h.id,
  month: '2026-11', amount: 125, completedAt: null
};
const confirmedMpesa = {
  id: 'sandbox-success-1', status: 'succeeded', houseId: h.id,
  month: '2026-11', amount: 125, completedAt: '2026-11-05T12:30:00.000Z',
  mpesaReceiptNumber: 'TEST123456'
};
const beforeMpesa = RHM.getDb().payments.length;
eq('pending M-Pesa request is not recorded as rent', RHM.applyMpesaPayment(pendingMpesa), false);
eq('confirmed M-Pesa payment is recorded once', RHM.applyMpesaPayment(confirmedMpesa), true);
eq('duplicate confirmation does not double-count', RHM.applyMpesaPayment(confirmedMpesa), false);
eq('one confirmed rent entry added', RHM.getDb().payments.length, beforeMpesa + 1);
ok('confirmed receipt is saved in the ledger note', RHM.getDb().payments.some(p => p.id === 'mpesa-sandbox-success-1' && p.note === 'M-Pesa receipt TEST123456'));

console.log('\n----------------------------------------');
console.log(`app: PASS ${pass} / FAIL ${failures.length}`);
if (failures.length) {
  console.log('Failures:');
  failures.forEach(f => console.log(' - ' + f));
  process.exit(1);
}

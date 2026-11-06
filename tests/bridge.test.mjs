import { JSDOM } from 'jsdom';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const html = fs.readFileSync(path.join(ROOT, 'public', 'legacy-export.html'), 'utf8');

let pass = 0;
const fails = [];
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ✓ ' + n); } else { fails.push(n + (x ? ' — ' + x : '')); console.log('  ✗ ' + n + (x ? ' — ' + x : '')); } };

function boot(seed) {
  const dom = new JSDOM(html, {
    url: 'https://localhost/',
    runScripts: 'dangerously',
    beforeParse(win) {
      if (seed) win.localStorage.setItem('rentalManagerV1', seed);
    }
  });
  return dom;
}

console.log('\nlegacy-export.html');
const empty = boot(null);
ok('reports no old data', /No old data found/.test(empty.window.document.getElementById('status').textContent));
ok('download disabled without data', empty.window.document.getElementById('download').disabled === true);

const seed = JSON.stringify({
  houses: [{ id: 'a', number: '1', tenant: 'Amina', rent: 250000, rate: 3000 }],
  payments: [{ id: 'p', type: 'rent', houseId: 'a', month: '2026-09', amount: 250000, date: '2026-09-01' }],
  readings: [{ id: 'r', houseId: 'a', month: '2026-09', prev: 1, curr: 2, units: 1, rate: 3000, charge: 3000 }],
  landlordPhone: '0771234567',
  deadline: '2026-09-30'
});
const withData = boot(seed);
const doc = withData.window.document;
await new Promise(r => setTimeout(r, 30));
ok('detects old data', /1 house\(s\), 1 payment\(s\), 1 water reading\(s\)/.test(doc.getElementById('status').textContent), doc.getElementById('status').textContent);
ok('download enabled', doc.getElementById('download').disabled === false);

console.log('\nconvert pasted JSON');
doc.getElementById('paste').value = 'not json';
doc.getElementById('convert').dispatchEvent(new withData.window.MouseEvent('click', { bubbles: true }));
ok('invalid paste is rejected', /does not look like the old data/.test(doc.getElementById('pasteStatus').textContent), doc.getElementById('pasteStatus').textContent);

doc.getElementById('paste').value = JSON.stringify({ houses: [{ number: '5', tenant: 'B' }], payments: [] });
doc.getElementById('convert').dispatchEvent(new withData.window.MouseEvent('click', { bubbles: true }));
ok('valid paste is accepted', /Converted 1 house\(s\)/.test(doc.getElementById('pasteStatus').textContent), doc.getElementById('pasteStatus').textContent);

doc.getElementById('paste').value = JSON.stringify({ payments: [] });
doc.getElementById('convert').dispatchEvent(new withData.window.MouseEvent('click', { bubbles: true }));
ok('object without houses is rejected', /No "houses" array found/.test(doc.getElementById('pasteStatus').textContent));

console.log('\n----------------------------------------');
console.log(`bridge: PASS ${pass} / FAIL ${fails.length}`);
if (fails.length) { fails.forEach(f => console.log(' - ' + f)); process.exit(1); }

'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

test('finance ledger loads before the game controller', () => {
  const ledger = html.indexOf('<script src="js/management/finance-ledger.js"></script>');
  const controller = html.indexOf('<script>\nconst KEY=');
  assert.ok(ledger >= 0 && controller > ledger);
});

test('new careers initialize finance history and old saves migrate safely', () => {
  assert.match(html, /negotiations:\[\],financeHistory:\[\]/);
  assert.match(html, /if\(G&&!Array\.isArray\(G\.financeHistory\)\)G\.financeHistory=\[\]/);
  assert.match(html, /if\(!Array\.isArray\(G\.financeHistory\)\)G\.financeHistory=\[\]/);
});

test('league match settlement posts gate, sponsor and operating costs as separate entries', () => {
  assert.match(html, /financePrefix\+'match-gate','match-income','مداخيل المباراة',gate/);
  assert.match(html, /financePrefix\+'sponsor','sponsor-income','دخل عقد الرعاية',spn/);
  assert.match(html, /financePrefix\+'weekly-costs','operating-expense','الأجور والأكاديمية وصيانة الاستاد',-wages/);
  assert.match(html, /G\.budget\+=gate\+spn-wages/ === null ? /x/ : /x/);
});

test('weekly training cost is posted once per league round', () => {
  assert.match(html, /s'\+G\.season\+':r'\+\(G\.round\+1\)\+':training'/);
  assert.match(html, /financePost\([^;]*'training','تكلفة التدريب الأسبوعي',-I\.c\)/);
});

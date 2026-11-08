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
  assert.doesNotMatch(html, /G\.budget\s*\+=\s*gate\s*\+\s*spn\s*-\s*wages/);
});

test('weekly training cost is posted once per league round', () => {
  assert.match(html, /financePost\('s'\+G\.season\+':r'\+\(G\.round\+1\)\+':training','training'/);
  assert.match(html, /financePost\([^;]*'training','تكلفة التدريب الأسبوعي',-I\.c\)/);
});

test('cup, awards and league prizes are recorded as financial income', () => {
  assert.match(html, /:cup:'\+c\.s\+':gate','cup-income'/);
  assert.match(html, /:award:top-scorer:'\+sc\.id,'player-award'/);
  assert.match(html, /:league-prize','league-prize','مكافأة مركز الدوري',rw/);
  assert.match(html, /:promotion-prize','promotion-income'/);
});

test('academy, stadium and marketing investments are recorded as expenses', () => {
  assert.match(html, /:academy-upgrade:'\+a\.lv,'academy-investment'/);
  assert.match(html, /:stadium-upgrade:'\+d\.cap,'stadium-investment'/);
  assert.match(html, /:marketing-campaign','marketing-expense','حملة تسويقية',-150000/);
});

test('sponsor signing, renewals, player loans and outgoing player sales use the ledger', () => {
  assert.match(html, /:sponsor-signing:'\+i,'sponsor-signing-income'/);
  assert.match(html, /:renewal:'\+p\.id\+':'.*'signing-bonus'/);
  assert.match(html, /:loan-out:'\+id,'loan-income'/);
  assert.match(html, /:loan-in:'\+id,'loan-expense'/);
  assert.match(html, /:offer-sale:'\+p\.id,'transfer-income'/);
});

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

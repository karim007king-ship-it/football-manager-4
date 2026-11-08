'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

test('transfer domain module loads before the game controller', () => {
  const transferScript = html.indexOf('<script src="js/management/transfers.js"></script>');
  const gameScript = html.indexOf('<script src="js/match/engine.js"></script>');
  assert.notEqual(transferScript, -1, 'transfer system script must be included');
  assert.ok(transferScript < gameScript, 'transfer system must load before inline game logic');
});

test('market purchase and sale use validated transfer transactions', () => {
  assert.match(html, /FM4TransferSystem\.completePurchase\(/);
  assert.match(html, /FM4TransferSystem\.completeSale\(/);
  assert.match(html, /if\s*\(!result\.ok\)\s*return transferError\(result\)/);
});

test('old career saves are migrated with an empty loans collection', () => {
  assert.match(html, /if\(!Array\.isArray\(G\.loans\)\)G\.loans=\[\]/);
  assert.match(html, /if\(G&&!Array\.isArray\(G\.loans\)\)G\.loans=\[\]/);
});

test('sales return players to the free-agent pool without requiring an existing free agent', () => {
  assert.match(html, /buyerClubId:0/);
});

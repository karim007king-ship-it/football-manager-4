'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

test('negotiation engine loads after transfer rules and before the game controller', () => {
  const transfers = html.indexOf('<script src="js/management/transfers.js"></script>');
  const negotiations = html.indexOf('<script src="js/management/negotiations.js"></script>');
  const controller = html.indexOf('<script>\nconst KEY=');
  assert.ok(transfers >= 0 && negotiations > transfers && controller > negotiations);
});

test('market exposes other clubs players through the negotiation workflow', () => {
  assert.match(html, /function startNegotiation\(/);
  assert.match(html, /function beginNegotiation\(/);
  assert.match(html, /function showClubCounter\(/);
  assert.match(html, /function answerClubCounter\(/);
  assert.match(html, /function showPlayerContract\(/);
  assert.match(html, /function showPlayerWageTerms\(/);
  assert.match(html, /function acceptPlayerCounter\(/);
  assert.match(html, /function finalizeNegotiatedTransfer\(/);
  assert.match(html, /لاعبون من أندية الدرجة نفسها/);
  assert.match(html, /onclick="startNegotiation\('/);
});

test('negotiation history is initialized and preserved for old and new saves', () => {
  assert.match(html, /negotiations:\[\]/);
  assert.match(html, /if\(!Array\.isArray\(G\.negotiations\)\)G\.negotiations=\[\]/);
});

test('contract UI includes duration, weekly wage and signing bonus choices', () => {
  assert.match(html, /\[2,3,4,5\]/);
  assert.match(html, /مكافأة توقيع/);
  assert.match(html, /submitPlayerTerms\(id,w,years,bonus\)/);
});

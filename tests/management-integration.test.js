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

test('final club counter acceptance is wired to the negotiation system', () => {
  assert.match(html, /function acceptClubCounter\(/);
  assert.match(html, /FM4NegotiationSystem\.acceptClubCounter\(/);
  assert.match(html, /offer\.clubRounds\|\|0\)<FM4NegotiationSystem\.RULES\.maxClubRounds/);
});

test('old career saves are migrated with an empty loans collection', () => {
  assert.match(html, /if\(!Array\.isArray\(G\.loans\)\)G\.loans=\[\]/);
  assert.match(html, /if\(G&&!Array\.isArray\(G\.loans\)\)G\.loans=\[\]/);
});

test('sales return players to the free-agent pool without requiring an existing free agent', () => {
  assert.match(html, /buyerClubId:0/);
});

test('loan management UI is connected to squad, save state and season-end return', () => {
  assert.match(html, /data-loan-player/);
  assert.match(html, /function loanPlayer\(/);
  assert.match(html, /FM4TransferSystem\.createLoan\(/);
  assert.match(html, /FM4TransferSystem\.returnLoansAtSeasonEnd\(/);
  assert.match(html, /t=='loans'/);
  assert.match(html, /loans:\[\]/);
});

test('incoming loans expose club and player selection with a budget guard', () => {
  assert.match(html, /function loanInStart\(/);
  assert.match(html, /function loanInClub\(/);
  assert.match(html, /function confirmLoanIn\(/);
  assert.match(html, /if\(G\.budget<terms\.fee\)/);
  assert.match(html, /toClubId:G\.uid/);
  assert.match(html, /financePost\('s'\+G\.season\+':r'\+\(G\.round\+1\)\+':loan-in:'\+id,'loan-expense','رسوم استعارة اللاعب '\+p\.name,-terms\.fee\)/);
  assert.match(html, /FM4TransferSystem\.createLoan\(\{players:G\.players,loans:G\.loans\|\|\[\],playerId:id,fromClubId,toClubId:G\.uid/);
});

test('borrowed players keep their contract with the owning club during season rollover', () => {
  assert.match(html, /borrowedIds=new Set\(\(G\.loans\|\|\[\]\)\.filter\(l=>l\.status==='active'&&l\.toClubId===U&&l\.fromClubId!==U\)/);
  assert.match(html, /sq\(\)\.filter\(p=>!borrowedIds\.has\(p\.id\)\)/);
});

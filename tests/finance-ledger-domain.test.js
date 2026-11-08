'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Ledger = require('../js/management/finance-ledger.js');

function career(overrides = {}) {
  return { budget: 1000000, financeHistory: [], ...overrides };
}

test('a new transaction updates the balance and appends one immutable ledger entry', () => {
  const state = career();
  const result = Ledger.applyToCareer(state, {
    eventId: 's1:r1:training', season: 1, round: 1,
    category: 'training', description: 'Weekly training', amount: -25000
  });
  assert.equal(result.ok, true);
  assert.equal(result.duplicate, false);
  assert.equal(state.budget, 975000);
  assert.equal(state.financeHistory.length, 1);
  assert.equal(state.financeHistory[0].balanceBefore, 1000000);
  assert.equal(state.financeHistory[0].balanceAfter, 975000);
});

test('replaying an identical event is idempotent and never charges twice', () => {
  const state = career();
  const entry = {
    eventId: 's1:r1:wages', season: 1, round: 1,
    category: 'operating-expense', description: 'Weekly wages', amount: -80000
  };
  assert.equal(Ledger.applyToCareer(state, entry).ok, true);
  const replay = Ledger.applyToCareer(state, entry);
  assert.equal(replay.ok, true);
  assert.equal(replay.duplicate, true);
  assert.equal(state.budget, 920000);
  assert.equal(state.financeHistory.length, 1);
});

test('reusing an event ID with different financial data is rejected without mutation', () => {
  const state = career();
  const original = {
    eventId: 's1:r2:gate', season: 1, round: 2,
    category: 'match-income', description: 'Match gate', amount: 50000
  };
  Ledger.applyToCareer(state, original);
  const before = JSON.stringify(state);
  const conflict = Ledger.applyToCareer(state, { ...original, amount: 70000 });
  assert.equal(conflict.ok, false);
  assert.equal(conflict.code, 'EVENT_ID_CONFLICT');
  assert.equal(JSON.stringify(state), before);
});

test('invalid or unsafe transactions leave the career unchanged', () => {
  for (const amount of [0, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    const state = career();
    const before = JSON.stringify(state);
    const result = Ledger.applyToCareer(state, {
      eventId: 'invalid:' + String(amount), season: 1, round: 1,
      category: 'test', description: 'Invalid transaction', amount
    });
    assert.equal(result.ok, false);
    assert.equal(JSON.stringify(state), before);
  }
});

test('a batch commits every entry together when all entries are valid', () => {
  const state = career();
  const result = Ledger.applyBatchToCareer(state, [
    { eventId: 's1:r3:gate', category: 'match-income', description: 'Gate', amount: 120000 },
    { eventId: 's1:r3:wages', category: 'operating-expense', description: 'Wages', amount: -90000 }
  ], { season: 1, round: 3 });
  assert.equal(result.ok, true);
  assert.equal(state.budget, 1030000);
  assert.equal(state.financeHistory.length, 2);
  assert.equal(state.financeHistory[0].balanceAfter, 1120000);
  assert.equal(state.financeHistory[1].balanceAfter, 1030000);
});

test('a failed batch rolls back earlier draft entries and preserves the original state', () => {
  const state = career();
  const before = JSON.stringify(state);
  const result = Ledger.applyBatchToCareer(state, [
    { eventId: 's1:r4:gate', category: 'match-income', description: 'Gate', amount: 100000 },
    { eventId: 's1:r4:bad', category: 'operating-expense', description: 'Invalid zero', amount: 0 }
  ], { season: 1, round: 4 });
  assert.equal(result.ok, false);
  assert.equal(result.failedIndex, 1);
  assert.equal(JSON.stringify(state), before);
});

test('a repeated identical event inside a batch is charged only once', () => {
  const state = career();
  const entry = { eventId: 's1:r5:sponsor', category: 'sponsor-income', description: 'Sponsor', amount: 40000 };
  const result = Ledger.applyBatchToCareer(state, [entry, { ...entry }], { season: 1, round: 5 });
  assert.equal(result.ok, true);
  assert.equal(state.budget, 1040000);
  assert.equal(state.financeHistory.length, 1);
});

test('season summary reconciles income, expenses and opening/closing balances', () => {
  const state = career();
  Ledger.applyBatchToCareer(state, [
    { eventId: 's2:r1:opening-income', category: 'income', description: 'Income', amount: 200000 },
    { eventId: 's2:r1:cost', category: 'expense', description: 'Costs', amount: -75000 }
  ], { season: 2, round: 1 });
  const summary = Ledger.summarize(state.financeHistory, 2);
  assert.equal(summary.ok, true);
  assert.equal(summary.count, 2);
  assert.equal(summary.income, 200000);
  assert.equal(summary.expenses, 75000);
  assert.equal(summary.net, 125000);
  assert.equal(summary.openingBalance, 1000000);
  assert.equal(summary.closingBalance, 1125000);
});

test('invalid batch period is rejected without changing the career', () => {
  const state = career();
  const before = JSON.stringify(state);
  const result = Ledger.applyBatchToCareer(state, [], { season: 0, round: -1 });
  assert.equal(result.ok, false);
  assert.equal(JSON.stringify(state), before);
});

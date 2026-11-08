'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Finance = require('../js/management/finance-ledger');

test('records income and expenses with a reproducible balance trail', () => {
  const income = Finance.recordTransaction({ history: [], eventId: 's1:r1:gate', season: 1, round: 1, category: 'match', description: 'Match gate', amount: 50000, balanceBefore: 100000 });
  assert.equal(income.ok, true);
  assert.equal(income.balanceAfter, 150000);
  const expense = Finance.recordTransaction({ history: income.history, eventId: 's1:r1:wages', season: 1, round: 1, category: 'wages', description: 'Weekly wages', amount: -20000, balanceBefore: income.balanceAfter });
  assert.equal(expense.ok, true);
  assert.equal(expense.balanceAfter, 130000);
  assert.equal(expense.transaction.balanceBefore, 150000);
});

test('replaying the same event is idempotent and does not append a duplicate', () => {
  const input = { history: [], eventId: 's2:r4:training', season: 2, round: 4, category: 'training', description: 'Training cost', amount: -45000, balanceBefore: 300000 };
  const first = Finance.recordTransaction(input);
  const replay = Finance.recordTransaction({ ...input, history: first.history });
  assert.equal(replay.ok, true);
  assert.equal(replay.duplicate, true);
  assert.equal(replay.history.length, 1);
  assert.equal(replay.balanceAfter, first.balanceAfter);
});

test('reusing an event ID with different money data is rejected', () => {
  const first = Finance.recordTransaction({ history: [], eventId: 's1:r2:gate', season: 1, round: 2, category: 'match', description: 'Gate', amount: 40000, balanceBefore: 100000 });
  const conflict = Finance.recordTransaction({ history: first.history, eventId: 's1:r2:gate', season: 1, round: 2, category: 'match', description: 'Gate', amount: 50000, balanceBefore: 100000 });
  assert.equal(conflict.ok, false);
  assert.equal(conflict.code, 'EVENT_ID_CONFLICT');
  assert.equal(first.history.length, 1);
});

test('rejects invalid amounts, negative resulting balances and malformed periods', () => {
  const base = { history: [], eventId: 'x', season: 1, round: 1, category: 'test', description: 'test', amount: -1, balanceBefore: 0 };
  assert.equal(Finance.recordTransaction(base).code, 'INVALID_RESULTING_BALANCE');
  assert.equal(Finance.recordTransaction({ ...base, amount: 0 }).code, 'INVALID_AMOUNT');
  assert.equal(Finance.recordTransaction({ ...base, season: 0 }).code, 'INVALID_PERIOD');
  assert.equal(Finance.recordTransaction({ ...base, amount: Number.MAX_SAFE_INTEGER + 1 }).code, 'INVALID_AMOUNT');
});

test('season summary separates income, expenses and net movement', () => {
  const first = Finance.recordTransaction({ history: [], eventId: 's3:bonus', season: 3, round: 14, category: 'prize', description: 'League prize', amount: 200000, balanceBefore: 100000 });
  const second = Finance.recordTransaction({ history: first.history, eventId: 's3:wages', season: 3, round: 14, category: 'wages', description: 'Final wages', amount: -80000, balanceBefore: 300000 });
  const otherSeason = Finance.recordTransaction({ history: second.history, eventId: 's4:gate', season: 4, round: 1, category: 'match', description: 'Gate', amount: 30000, balanceBefore: 220000 });
  const summary = Finance.summarize(otherSeason.history, 3);
  assert.deepEqual({ count: summary.count, income: summary.income, expenses: summary.expenses, net: summary.net }, { count: 2, income: 200000, expenses: 80000, net: 120000 });
  assert.equal(Finance.summarize(otherSeason.history, 4).count, 1);
});

'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Planner = require('../js/management/finance-planner.js');

test('forecast reserves known weekly commitments through season end', () => {
  const result = Planner.forecast({
    budget: 1000000,
    weeksRemaining: 10,
    weeklyCommitments: { wages: 30000, academy: 5000, stadium: 2000, other: 3000 },
    reserve: 50000,
    committedOneOff: 10000
  });
  assert.equal(result.ok, true);
  assert.equal(result.weeklyTotal, 40000);
  assert.equal(result.futureWeeklyCommitments, 400000);
  assert.equal(result.totalCommitted, 410000);
  assert.equal(result.availableAfterCommitments, 590000);
  assert.equal(result.transferCapacity, 540000);
  assert.equal(result.risk, 'stable');
});

test('scenario simulation reports projected balances and risk without mutating input', () => {
  const input = {
    budget: 500000,
    weeksRemaining: 5,
    weeklyCommitments: { wages: 50000, academy: 0, stadium: 0, other: 0 },
    reserve: 50000,
    scenarios: [
      { id: 'buy-1', label: 'شراء لاعب', cost: 150000 },
      { id: 'renew-1', label: 'تجديد عقد', cost: 100000 },
      { id: 'facility-1', label: 'تطوير المرافق', cost: 300000 }
    ]
  };
  const before = structuredClone(input);
  const result = Planner.forecast(input);
  assert.equal(result.ok, true);
  assert.equal(result.availableAfterCommitments, 250000);
  assert.equal(result.scenarios[0].projectedBalance, 100000);
  assert.equal(result.scenarios[0].risk, 'stable');
  assert.equal(result.scenarios[1].projectedBalance, 150000);
  assert.equal(result.scenarios[2].projectedBalance, -50000);
  assert.equal(result.scenarios[2].risk, 'critical');
  assert.deepEqual(input, before);
});

test('forecast warns when projected balance falls below reserve and flags negative balance', () => {
  const warning = Planner.forecast({ budget: 100, weeksRemaining: 1, weeklyCommitments: { wages: 60 }, reserve: 50 });
  const critical = Planner.forecast({ budget: 100, weeksRemaining: 2, weeklyCommitments: { wages: 60 }, reserve: 50 });
  assert.equal(warning.risk, 'warning');
  assert.equal(warning.transferCapacity, 0);
  assert.equal(critical.risk, 'critical');
  assert.equal(critical.projectedBalance, -20);
});

test('forecast excludes unconfirmed future income and states its assumptions', () => {
  const result = Planner.forecast({ budget: 1000, weeksRemaining: 2, weeklyCommitments: { wages: 100 } });
  assert.equal(result.projectedBalance, 800);
  assert.match(result.assumptions, /لا يحتسب الإيرادات المستقبلية/);
});

test('forecast rejects invalid inputs and duplicate scenario identifiers', () => {
  assert.equal(Planner.forecast({ budget: 1.5, weeksRemaining: 1 }).code, 'INVALID_BUDGET');
  assert.equal(Planner.forecast({ budget: 100, weeksRemaining: -1 }).code, 'INVALID_WEEKS');
  assert.equal(Planner.forecast({ budget: 100, weeksRemaining: 1, weeklyCommitments: { wages: -1 } }).code, 'INVALID_COMMITMENT');
  assert.equal(Planner.forecast({ budget: 100, weeksRemaining: 1, scenarios: [
    { id: 'same', label: 'A', cost: 10 }, { id: 'same', label: 'B', cost: 20 }
  ] }).code, 'DUPLICATE_SCENARIO_ID');
});

test('forecast detects arithmetic overflow instead of returning misleading values', () => {
  const result = Planner.forecast({
    budget: Number.MAX_SAFE_INTEGER,
    weeksRemaining: 2,
    weeklyCommitments: { wages: Number.MAX_SAFE_INTEGER }
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'FORECAST_OVERFLOW');
});

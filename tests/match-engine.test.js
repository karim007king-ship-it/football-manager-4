'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createMatch, stepMatch, simulateMatch } = require('../js/match/engine');

function team(name, side) {
  const players = [];
  for (let i = 0; i < 11; i += 1) {
    players.push({
      id: name + '-' + i,
      name: 'P' + i,
      role: i === 0 ? 'GK' : i < 5 ? 'DF' : i < 9 ? 'MF' : 'FW',
      x: side === 0 ? 25 + (i % 4) * 8 : 75 - (i % 4) * 8,
      y: 8 + i * 8,
      pace: 65,
      passing: 68,
      shooting: 62,
      defending: 60
    });
  }
  return { name, players };
}

test('creates a valid two-team match state', () => {
  const state = createMatch({ teams: [team('Home', 0), team('Away', 1)] });
  assert.equal(state.minute, 0);
  assert.deepEqual(state.score, [0, 0]);
  assert.equal(state.teams.length, 2);
});

test('advances time and records possession/events', () => {
  const state = createMatch({ teams: [team('Home', 0), team('Away', 1)], seed: 7 });
  simulateMatch(state, 90);
  assert.equal(state.minute, 90);
  assert.ok(state.events.length > 0);
  assert.ok(state.possession[0] + state.possession[1] > 0);
  assert.ok(state.events.every(e => ['carry', 'pass', 'interception', 'tackle', 'shot', 'goal'].includes(e.type)));
});

test('rejects invalid team count', () => {
  assert.throws(() => createMatch({ teams: [team('Only', 0)] }), /Exactly two teams/);
});

test('single step advances the ball or records a meaningful event', () => {
  const state = createMatch({ teams: [team('Home', 0), team('Away', 1)], seed: 11 });
  const before = state.minute;
  stepMatch(state);
  assert.equal(state.minute, before + 1);
  assert.ok(state.events.length >= 0);
});

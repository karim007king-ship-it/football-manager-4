'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createMatch, updateShape } = require('../js/match/engine');

function buildTeam(name, side, mentality = 'balanced') {
  const roles = ['GK','CB','CB','CB','LB','DM','CM','AM','LW','ST','RW'];
  const homeX = [6,24,28,32,30,43,50,58,72,76,72];
  const awayX = homeX.map(x => 100 - x);
  const ys = [50,25,50,75,18,50,35,65,14,50,86];
  return {
    name,
    mentality,
    adaptiveTactics: false,
    players: roles.map((role, i) => ({
      id: name + '-' + i,
      role,
      pace: 70,
      passing: 70,
      shooting: 65,
      defending: 65,
      x: (side === 0 ? homeX : awayX)[i],
      y: ys[i]
    }))
  };
}

function makeState(homeMentality = 'balanced', awayMentality = 'balanced') {
  return createMatch({
    teams: [
      buildTeam('Home', 0, homeMentality),
      buildTeam('Away', 1, awayMentality)
    ],
    seed: 919
  });
}

test('attacking shape preserves winger width and advances the overlapping fullback', () => {
  const state = makeState();
  const home = state.teams[0];
  const carrier = home.players.find(p => p.role === 'CM');
  carrier.x = 66;
  carrier.y = 50;
  state.ball = { x: carrier.x, y: carrier.y, team: 0, playerId: carrier.id };

  const winger = home.players.find(p => p.role === 'LW');
  const fullback = home.players.find(p => p.role === 'LB');
  const wingerBefore = { x: winger.x, y: winger.y };
  const fullbackBefore = { x: fullback.x, y: fullback.y };

  updateShape(state, 0, carrier, false);

  assert.ok(Math.abs(winger.y - winger.baseY) < 5,
    'left winger should remain in the wide attacking channel');
  assert.ok(winger.x > wingerBefore.x,
    'left winger should advance when possession is high');
  assert.ok(fullback.x > fullbackBefore.x,
    'fullback should make an overlapping advance beyond its base position');
});

test('defensive pressers close the carrier while the defensive line retreats goal-side', () => {
  const state = makeState('balanced', 'pressing');
  const homeCarrier = state.teams[0].players.find(p => p.role === 'AM');
  homeCarrier.x = 72;
  homeCarrier.y = 48;
  state.ball = { x: homeCarrier.x, y: homeCarrier.y, team: 0, playerId: homeCarrier.id };

  const away = state.teams[1];
  const nearestDefender = away.players
    .filter(p => p.active && p.role !== 'GK')
    .sort((a, b) => Math.hypot(a.x - homeCarrier.x, a.y - homeCarrier.y)
      - Math.hypot(b.x - homeCarrier.x, b.y - homeCarrier.y))[0];
  const beforeDistance = Math.hypot(nearestDefender.x - homeCarrier.x,
    nearestDefender.y - homeCarrier.y);
  const centreBack = away.players.find(p => p.role === 'CB');
  const lineBefore = centreBack.x;

  updateShape(state, 0, homeCarrier, false);

  const afterDistance = Math.hypot(nearestDefender.x - homeCarrier.x,
    nearestDefender.y - homeCarrier.y);
  assert.ok(afterDistance < beforeDistance,
    'the first presser should reduce distance to the ball carrier');
  assert.ok(centreBack.x > lineBefore,
    'away defensive line should retreat toward its own goal');
});

test('attacking and defensive shape updates mirror for the away side', () => {
  const state = makeState();
  const away = state.teams[1];
  const carrier = away.players.find(p => p.role === 'CM');
  carrier.x = 34;
  carrier.y = 50;
  state.ball = { x: carrier.x, y: carrier.y, team: 1, playerId: carrier.id };
  const winger = away.players.find(p => p.role === 'LW');
  const before = winger.x;

  updateShape(state, 1, carrier, false);

  assert.ok(winger.x < before,
    'away winger should advance toward the left attacking goal');
  assert.ok(winger.y < 50,
    'mirrored left winger should maintain its wide channel');
});

'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createMatchFromGame } = require('../js/match/adapter');
const { simulateMatch, effectiveMentality } = require('../js/match/engine');

const POSITIONS = ['GK','DEF','DEF','DEF','DEF','MID','MID','MID','MID','FWD','FWD'];

function squad(name, rating) {
  return {
    name,
    mentality: 'balanced',
    adaptiveTactics: false,
    players: POSITIONS.map((pos, i) => ({
      id: name + '-' + i,
      name: name + ' ' + i,
      pos,
      ovr: rating + (i % 3),
      morale: 70,
      inj: 0
    }))
  };
}

function play(home, away, seed) {
  return simulateMatch(createMatchFromGame({ home, away, seed }), 90);
}

function add(target, match) {
  target.goals += match.score[0] + match.score[1];
  target.shots += match.shots[0] + match.shots[1];
  target.onTarget += match.shotsOnTarget[0] + match.shotsOnTarget[1];
  target.homePossession += match.possession[0];
  target.homeWins += match.score[0] > match.score[1] ? 1 : 0;
  target.draws += match.score[0] === match.score[1] ? 1 : 0;
  target.awayWins += match.score[0] < match.score[1] ? 1 : 0;
  target.fourPlus += Math.max(...match.score) >= 4 ? 1 : 0;
}

test('1000 seeded matches audit scoring, shot volume, home bias and strength advantage', () => {
  const balanced = {
    goals: 0, shots: 0, onTarget: 0, homePossession: 0,
    homeWins: 0, draws: 0, awayWins: 0, fourPlus: 0
  };
  const strongHome = { goals: 0, shots: 0, onTarget: 0, homePossession: 0,
    homeWins: 0, draws: 0, awayWins: 0, fourPlus: 0 };
  const strongAway = { goals: 0, shots: 0, onTarget: 0, homePossession: 0,
    homeWins: 0, draws: 0, awayWins: 0, fourPlus: 0 };

  const equalHome = squad('EqualHome', 70);
  const equalAway = squad('EqualAway', 70);
  const strong = squad('Strong', 84);
  const weak = squad('Weak', 54);

  // 400 neutral fixtures, 300 strong-home fixtures and 300 strong-away fixtures.
  // Each fixture is simulated for 90 minutes: 1000 matches x 90 minutes.
  for (let seed = 1; seed <= 400; seed++) {
    add(balanced, play(equalHome, equalAway, seed));
  }
  for (let seed = 1; seed <= 300; seed++) {
    add(strongHome, play(strong, weak, 10000 + seed));
    add(strongAway, play(weak, strong, 20000 + seed));
  }

  const neutralGoals = balanced.goals / 400;
  const neutralShots = balanced.shots / 400;
  const neutralHomePossession = 100 * balanced.homePossession / (400 * 90);
  const strongHomeGoalDiff = (strongHome.homeWins - strongHome.awayWins);
  const strongAwayGoalDiff = (strongAway.awayWins - strongAway.homeWins);

  assert.ok(neutralGoals >= 1.2 && neutralGoals <= 4.8,
    'neutral average goals/match outside broad guardrails: ' + neutralGoals.toFixed(2));
  assert.ok(neutralShots >= 10 && neutralShots <= 26,
    'neutral average shots/match outside broad guardrails: ' + neutralShots.toFixed(2));
  assert.ok(neutralHomePossession >= 43 && neutralHomePossession <= 57,
    'neutral home possession indicates excessive side bias: ' + neutralHomePossession.toFixed(1));
  assert.ok(strongHomeGoalDiff > 0,
    'strong home team should win more often than weak away team');
  assert.ok(strongAwayGoalDiff > 0,
    'strong away team should win more often than weak home team');

  const report = {
    matches: 1000,
    neutral: {
      averageGoals: +neutralGoals.toFixed(2),
      averageShots: +neutralShots.toFixed(2),
      shotsOnTarget: +(balanced.onTarget / 400).toFixed(2),
      homePossession: +neutralHomePossession.toFixed(1),
      homeWins: balanced.homeWins,
      draws: balanced.draws,
      awayWins: balanced.awayWins,
      matchesWithFourPlusGoalsByOneSide: balanced.fourPlus
    },
    strengthAdvantage: {
      strongHomeWins: strongHome.homeWins,
      strongHomeDraws: strongHome.draws,
      strongHomeLosses: strongHome.awayWins,
      strongAwayWins: strongAway.awayWins,
      strongAwayDraws: strongAway.draws,
      strongAwayLosses: strongAway.homeWins
    }
  };
  console.log('FM4 1000-match balance audit:', JSON.stringify(report));
});

test('pressing mentality measurably changes defensive activity', () => {
  const balancedHome = squad('BalancedHome', 70);
  const balancedAway = squad('BalancedAway', 70);
  const pressingHome = squad('PressingHome', 70);
  const pressingAway = squad('PressingAway', 70);
  pressingHome.mentality = 'pressing';
  pressingAway.mentality = 'pressing';

  let balancedTackles = 0;
  let pressingTackles = 0;
  let balancedPasses = 0;
  let pressingPasses = 0;

  for (let seed = 1; seed <= 100; seed++) {
    const normal = play(balancedHome, balancedAway, 30000 + seed);
    const highPress = play(pressingHome, pressingAway, 30000 + seed);
    balancedTackles += normal.tackles[0] + normal.tackles[1];
    pressingTackles += highPress.tackles[0] + highPress.tackles[1];
    balancedPasses += normal.passes[0] + normal.passes[1];
    pressingPasses += highPress.passes[0] + highPress.passes[1];
  }

  assert.ok(pressingTackles > balancedTackles,
    'pressing should increase tackles: balanced=' + balancedTackles +
    ', pressing=' + pressingTackles);
  console.log('FM4 pressing audit:', JSON.stringify({
    matchesPerMode: 100,
    balancedTackles,
    pressingTackles,
    balancedPasses,
    pressingPasses
  }));
});

test('adaptive tactics react to score and match minute only when enabled', () => {
  const state = {
    minute: 72,
    score: [0, 1],
    teams: [
      { id: 0, mentality: 'balanced', adaptiveTactics: true },
      { id: 1, mentality: 'balanced', adaptiveTactics: true }
    ]
  };
  assert.equal(effectiveMentality(state, 0), 'attacking');
  assert.equal(effectiveMentality(state, 1), 'balanced');

  state.minute = 78;
  state.score = [1, 0];
  assert.equal(effectiveMentality(state, 0), 'defensive');
  assert.equal(effectiveMentality(state, 1), 'attacking');

  state.teams[0].adaptiveTactics = false;
  assert.equal(effectiveMentality(state, 0), 'balanced');
});

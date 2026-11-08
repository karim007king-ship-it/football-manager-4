'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createMatch, stepMatch } = require('../js/match/engine');

function squad(name, side) {
  const roles = ['GK','CB','CB','CB','CB','DM','CM','AM','LW','ST','RW'];
  const xs = side === 0
    ? [6,24,27,30,33,42,47,55,67,72,68]
    : [94,76,73,70,67,58,53,45,33,28,32];
  const ys = [50,18,39,61,82,50,34,64,12,50,88];
  return {
    name,
    players: roles.map((role, i) => ({
      id: name + '-' + i, role, pace: 66, passing: 68,
      shooting: 62, defending: 61, x: xs[i], y: ys[i]
    }))
  };
}

function assertValidState(state, seed, minute) {
  assert.equal(state.minute, minute, 'match clock must advance exactly once');
  assert.ok(Number.isInteger(state.score[0]) && state.score[0] >= 0);
  assert.ok(Number.isInteger(state.score[1]) && state.score[1] >= 0);
  assert.ok(state.shotsOnTarget[0] <= state.shots[0]);
  assert.ok(state.shotsOnTarget[1] <= state.shots[1]);
  assert.ok(state.score[0] <= state.shotsOnTarget[0]);
  assert.ok(state.score[1] <= state.shotsOnTarget[1]);

  const possession = state.possession[0] + state.possession[1];
  assert.ok(Math.abs(possession - minute) < 0.00001,
    'possession must reconcile to elapsed match minutes');

  assert.ok(state.ball.team === 0 || state.ball.team === 1);
  assert.ok(Number.isFinite(state.ball.x) && state.ball.x >= 2 && state.ball.x <= 98);
  assert.ok(Number.isFinite(state.ball.y) && state.ball.y >= 3 && state.ball.y <= 97);
  const carrier = state.teams[state.ball.team].players.find(
    player => player.id === state.ball.playerId
  );
  assert.ok(carrier && carrier.active,
    'ball owner must resolve to an active player (seed ' + seed + ', minute ' + minute + ')');

  for (const team of state.teams) {
    for (const player of team.players) {
      assert.ok(Number.isFinite(player.x) && player.x >= 2 && player.x <= 98);
      assert.ok(Number.isFinite(player.y) && player.y >= 3 && player.y <= 97);
      assert.ok(Number.isFinite(player.stamina) && player.stamina >= 0 && player.stamina <= 100);
    }
  }

  const ids = new Set(state.teams.flatMap(team => team.players.map(player => player.id)));
  for (const event of state.events) {
    assert.ok(Number.isInteger(event.minute) && event.minute > 0 && event.minute <= minute);
    if (event.team !== undefined) assert.ok(event.team === 0 || event.team === 1);
    for (const key of ['playerId', 'shooterId', 'goalkeeperId', 'from', 'to']) {
      if (event[key] !== undefined && event[key] !== null) {
        assert.ok(ids.has(event[key]), 'event ' + key + ' must reference a known player');
      }
    }
    if (event.secondBall) {
      const secondBall = event.secondBall;
      assert.equal(event.type, 'clearance');
      assert.equal(secondBall.contested, true);
      assert.ok(secondBall.team === 0 || secondBall.team === 1);
      assert.ok(secondBall.outcome === 'retained' || secondBall.outcome === 'lost');
      assert.equal(secondBall.outcome, secondBall.team === event.team ? 'retained' : 'lost');
      assert.ok(ids.has(secondBall.playerId), 'second-ball winner must reference a known player');
      assert.ok(state.teams[secondBall.team].players.some(player => player.id === secondBall.playerId));
      assert.ok(Number.isFinite(secondBall.x) && Number.isFinite(secondBall.y));
      assert.equal(secondBall.x, event.x, 'second-ball metadata must use the clearance landing point');
      assert.equal(secondBall.y, event.y, 'second-ball metadata must use the clearance landing point');
    }
  }
}

test('match state invariants hold through 90 minutes across 60 deterministic seeds', () => {
  for (let seed = 1; seed <= 60; seed++) {
    const state = createMatch({
      teams: [squad('Home-' + seed, 0), squad('Away-' + seed, 1)],
      seed
    });
    assertValidState(state, seed, 0);
    for (let minute = 1; minute <= 90; minute++) {
      stepMatch(state);
      assertValidState(state, seed, minute);
    }
  }
});

test('live-match second-ball metadata reconciles with clearance events across deterministic seeds',()=>{
 let contested=0;
 for(let seed=1001;seed<=1120;seed++){
  const state=createMatch({teams:[squad('Audit-Home-'+seed,0),squad('Audit-Away-'+seed,1)],seed});
  for(let minute=1;minute<=90;minute++)stepMatch(state);
  for(const event of state.events){
   if(!event.secondBall)continue;
   contested++;
   const winner=state.teams[event.secondBall.team].players.find(player=>player.id===event.secondBall.playerId);
   assert.ok(winner,'every second-ball winner must resolve to a player in the owning team');
   assert.equal(event.secondBall.outcome,event.secondBall.team===event.team?'retained':'lost');
   assert.equal(event.secondBall.x,event.x);
   assert.equal(event.secondBall.y,event.y);
  }
  assert.equal(state.possession[0]+state.possession[1],90);
 }
 assert.ok(contested>0,'the deterministic match cohort must exercise live second-ball events');
});

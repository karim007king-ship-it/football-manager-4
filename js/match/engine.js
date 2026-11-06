'use strict';

/**
 * FM4 match simulation kernel (isolated v0).
 * Coordinates use a 0..100 pitch. Team 0 attacks right; team 1 attacks left.
 * No DOM, timers, global randomness, or UI dependencies.
 */
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const seededFallback = () => 0.5;

function createMatch({ teams, seed = 1 } = {}) {
  if (!Array.isArray(teams) || teams.length !== 2) throw new Error('Exactly two teams are required');
  const normalized = teams.map((team, teamId) => {
    if (!Array.isArray(team.players) || team.players.length < 7) throw new Error('Each team needs at least 7 players');
    return {
      id: teamId,
      name: String(team.name || (teamId ? 'Away' : 'Home')),
      players: team.players.map((p, index) => ({
        id: String(p.id ?? index),
        name: String(p.name || 'Player'),
        role: p.role || 'MF',
        pace: clamp(Number(p.pace ?? 60), 1, 100),
        passing: clamp(Number(p.passing ?? 60), 1, 100),
        shooting: clamp(Number(p.shooting ?? 50), 1, 100),
        defending: clamp(Number(p.defending ?? 50), 1, 100),
        stamina: clamp(Number(p.stamina ?? 100), 0, 100),
        x: clamp(Number(p.x ?? (teamId ? 65 : 35)), 2, 98),
        y: clamp(Number(p.y ?? (10 + (index % 10) * 8)), 2, 98),
        active: true
      }))
    };
  });
  let rngState = (Number(seed) >>> 0) || 1;
  const rng = () => {
    rngState = (1664525 * rngState + 1013904223) >>> 0;
    return rngState / 4294967296;
  };
  const kickoff = normalized[0].players.find(p => p.role !== 'GK') || normalized[0].players[0];
  return {
    minute: 0,
    score: [0, 0],
    possession: [0, 0],
    shots: [0, 0],
    passes: [0, 0],
    teams: normalized,
    ball: { x: kickoff.x, y: kickoff.y, team: 0, playerId: kickoff.id },
    events: [],
    rng
  };
}

function nearest(players, point) {
  return players.filter(p => p.active).reduce((best, p) => !best || distance(p, point) < distance(best, point) ? p : best, null);
}

function stepMatch(state) {
  if (!state || !state.teams || state.teams.length !== 2) throw new Error('Invalid match state');
  const teamId = state.ball.team;
  const opponentId = 1 - teamId;
  const team = state.teams[teamId];
  const opponent = state.teams[opponentId];
  const player = team.players.find(p => p.id === state.ball.playerId && p.active) || nearest(team.players, state.ball);
  if (!player) return state;
  const direction = teamId === 0 ? 1 : -1;
  const goalX = teamId === 0 ? 100 : 0;
  const pressure = nearest(opponent.players, player);
  const pressureDistance = pressure ? distance(pressure, player) : 30;
  const attackDistance = Math.abs(goalX - player.x);
  const centrality = Math.abs(50 - player.y);
  let event;

  state.possession[teamId] += 1;
  player.stamina = clamp(player.stamina - 0.025, 0, 100);

  // A shot can only occur after the carrier reaches the attacking third.
  if (attackDistance <= 28 && centrality <= 27 && state.rng() < 0.12 + player.shooting / 500) {
    state.shots[teamId] += 1;
    const quality = clamp((player.shooting / 100) * 0.55 + (28 - attackDistance) / 70 - pressureDistance / 120, 0.04, 0.82);
    const goal = state.rng() < quality;
    if (goal) state.score[teamId] += 1;
    event = { type: goal ? 'goal' : 'shot', minute: state.minute, team: teamId, playerId: player.id, x: player.x, y: player.y };
    // Restart from the centre after a goal; otherwise the goalkeeper restarts.
    if (goal) {
      const restart = opponent.players.find(p => p.role === 'GK') || opponent.players[0];
      state.ball = { x: 50, y: 50, team: opponentId, playerId: restart.id };
    } else {
      const keeper = opponent.players.find(p => p.role === 'GK') || opponent.players[0];
      state.ball = { x: keeper.x, y: keeper.y, team: opponentId, playerId: keeper.id };
    }
  } else {
    const forwardOptions = team.players.filter(p => p.active && p.id !== player.id)
      .map(p => ({ p, progress: (p.x - player.x) * direction, space: pressure ? distance(p, pressure) : 20 }))
      .filter(x => x.progress > 2);
    const bestPass = forwardOptions.sort((a, b) => (b.progress + b.space * 0.25 + b.p.passing * 0.05) - (a.progress + a.space * 0.25 + a.p.passing * 0.05))[0];
    const shouldPass = bestPass && (pressureDistance < 9 || (state.rng() < 0.28 && bestPass.progress > 8));
    if (shouldPass) {
      state.passes[teamId] += 1;
      const successChance = clamp(0.52 + player.passing / 220 + (bestPass.space - 8) / 100 - (pressureDistance < 5 ? 0.12 : 0), 0.25, 0.96);
      if (state.rng() < successChance) {
        state.ball = { x: bestPass.p.x, y: bestPass.p.y, team: teamId, playerId: bestPass.p.id };
        event = { type: 'pass', minute: state.minute, team: teamId, from: player.id, to: bestPass.p.id, x: bestPass.p.x, y: bestPass.p.y };
      } else {
        const winner = nearest(opponent.players, player) || opponent.players[0];
        state.ball = { x: player.x, y: player.y, team: opponentId, playerId: winner.id };
        event = { type: 'interception', minute: state.minute, team: opponentId, playerId: winner.id, x: player.x, y: player.y };
      }
    } else {
      player.x = clamp(player.x + direction * (1.1 + player.pace / 100), 2, 98);
      if (pressure) player.y = clamp(player.y + clamp((50 - player.y) * 0.035, -0.8, 0.8), 2, 98);
      state.ball = { x: player.x, y: player.y, team: teamId, playerId: player.id };
      event = { type: 'carry', minute: state.minute, team: teamId, playerId: player.id, x: player.x, y: player.y };
      if (pressureDistance < 4 && state.rng() < 0.18 + (pressure.defending / 500)) {
        state.ball = { x: player.x, y: player.y, team: opponentId, playerId: pressure.id };
        event = { type: 'tackle', minute: state.minute, team: opponentId, playerId: pressure.id, x: player.x, y: player.y };
      }
    }
  }

  if (event) {
    state.events.push(event);
    if (state.events.length > 200) state.events.shift();
  }
  state.minute += 1;
  return state;
}

function simulateMatch(state, minutes = 90) {
  const count = clamp(Math.floor(minutes), 0, 120);
  for (let i = 0; i < count; i += 1) stepMatch(state);
  return state;
}

module.exports = { createMatch, stepMatch, simulateMatch, distance };

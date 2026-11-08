'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Negotiations = require('../js/management/negotiations');
const Transfers = require('../js/management/transfers');

function setup() {
  const players = [];
  for (let clubId = 1; clubId <= 3; clubId++) {
    for (let i = 0; i < 18; i++) players.push({
      id: clubId + '-' + i, name: 'Player ' + clubId + '-' + i, clubId,
      pos: i < 2 ? 'GK' : 'MID', ovr: 70, age: 24, cy: 3, wg: 2000
    });
  }
  return { players, player: players.find(p => p.id === '2-8') };
}

function makeOffer(ctx, overrides) {
  return Negotiations.createOffer({
    player: ctx.player, buyerClubId: 1, budget: 1000000, fee: 100000,
    weeklyWage: 2500, contractYears: 3, signingBonus: 10000, season: 2,
    ...(overrides || {})
  });
}

test('offer creation records parties and rejects duplicate active negotiations', () => {
  const ctx = setup();
  const first = makeOffer(ctx);
  assert.equal(first.ok, true);
  assert.equal(first.offer.status, 'pending');
  assert.equal(first.offer.sellerClubId, 2);
  assert.equal(makeOffer(ctx, { negotiations: [first.offer] }).code, 'NEGOTIATION_ALREADY_ACTIVE');
});

test('offer validation rejects invalid money, clubs, loaned players and insufficient budget', () => {
  const ctx = setup();
  assert.equal(makeOffer(ctx, { fee: -1 }).code, 'INVALID_FEE');
  assert.equal(makeOffer(ctx, { buyerClubId: 2 }).code, 'INVALID_CLUBS');
  assert.equal(makeOffer(ctx, { budget: 1000 }).code, 'INSUFFICIENT_BUDGET');
  assert.equal(makeOffer(ctx, { playerOnLoan: true }).code, 'PLAYER_ON_LOAN');
  assert.equal(makeOffer(ctx, { contractYears: 6 }).code, 'INVALID_CONTRACT_LENGTH');
});

test('seller accepts an offer above its acceptance threshold', () => {
  const ctx = setup(), created = makeOffer(ctx);
  const result = Negotiations.evaluateClubOffer({ offer: created.offer, player: ctx.player, fee: 120000, marketValue: 100000 });
  assert.equal(result.ok, true);
  assert.equal(result.decision, 'accepted');
  assert.equal(result.offer.status, 'club_accepted');
});

test('seller counters a credible but insufficient offer', () => {
  const ctx = setup(), created = makeOffer(ctx);
  const result = Negotiations.evaluateClubOffer({ offer: created.offer, player: ctx.player, fee: 90000, marketValue: 100000 });
  assert.equal(result.decision, 'countered');
  assert.equal(result.offer.counterFee, 112000);
  assert.equal(Negotiations.submitCounterOffer({ offer: result.offer, fee: 100000, budget: 1000000 }).offer.status, 'pending');
});

test('seller rejects an offer below the minimum threshold', () => {
  const ctx = setup(), created = makeOffer(ctx);
  const result = Negotiations.evaluateClubOffer({ offer: created.offer, player: ctx.player, fee: 70000, marketValue: 100000 });
  assert.equal(result.decision, 'rejected');
});

test('player negotiates wages and can counter with a clear demand', () => {
  const ctx = setup(), created = makeOffer(ctx);
  const club = Negotiations.evaluateClubOffer({ offer: created.offer, player: ctx.player, fee: 120000, marketValue: 100000 });
  const result = Negotiations.evaluatePlayerContract({ offer: club.offer, player: ctx.player, weeklyWage: 1800, contractYears: 3, signingBonus: 10000 });
  assert.equal(result.decision, 'countered');
  assert.equal(result.offer.status, 'player_countered');
  assert.ok(result.demandedWage > 1800);
  const accepted = Negotiations.acceptPlayerCounter({ offer: result.offer, budget: 1000000 });
  assert.equal(accepted.offer.status, 'player_accepted');
  assert.equal(accepted.offer.weeklyWage, result.demandedWage);
});

test('player rejects an offer far below the demanded wage', () => {
  const ctx = setup(), created = makeOffer(ctx);
  const club = Negotiations.evaluateClubOffer({ offer: created.offer, player: ctx.player, fee: 120000, marketValue: 100000 });
  const result = Negotiations.evaluatePlayerContract({ offer: club.offer, player: ctx.player, weeklyWage: 500, contractYears: 2, signingBonus: 0 });
  assert.equal(result.decision, 'rejected');
});

test('finalization delegates roster and transfer rules and charges bonus once', () => {
  const ctx = setup(), created = makeOffer(ctx);
  const club = Negotiations.evaluateClubOffer({ offer: created.offer, player: ctx.player, fee: 120000, marketValue: 100000 });
  const player = Negotiations.evaluatePlayerContract({ offer: club.offer, player: ctx.player, weeklyWage: 3000, contractYears: 4, signingBonus: 10000 });
  const result = Negotiations.finalizeDeal({
    offer: player.offer, players: ctx.players, budget: 1000000,
    transferSystem: Transfers, loans: []
  });
  assert.equal(result.ok, true);
  assert.equal(result.budget, 870000);
  assert.equal(result.players.find(p => p.id === '2-8').clubId, 1);
  assert.equal(result.players.find(p => p.id === '2-8').cy, 4);
  assert.equal(result.players.find(p => p.id === '2-8').wg, 3000);
  assert.equal(result.transfer.signingBonus, 10000);
});

test('finalization refuses incomplete or stale negotiations', () => {
  const ctx = setup(), created = makeOffer(ctx);
  assert.equal(Negotiations.finalizeDeal({ offer: created.offer, players: ctx.players, budget: 1000000, transferSystem: Transfers }).code, 'NEGOTIATION_NOT_COMPLETE');
  const stale = { ...created.offer, status: 'player_accepted' };
  assert.equal(Negotiations.finalizeDeal({ offer: stale, players: ctx.players.filter(p => p.id !== '2-8'), budget: 1000000, transferSystem: Transfers }).code, 'STALE_NEGOTIATION');
});

test('counter rounds cannot exceed configured negotiation limit', () => {
  const ctx = setup(), created = makeOffer(ctx);
  const offer = { ...created.offer, status: 'countered', clubRounds: 3 };
  assert.equal(Negotiations.submitCounterOffer({ offer, fee: 100000, budget: 1000000 }).code, 'NEGOTIATION_LIMIT');
});

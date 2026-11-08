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

test('repeated negotiations for the same player receive distinct IDs', () => {
  const ctx = setup(), first = makeOffer(ctx);
  const second = makeOffer(ctx, { negotiations: [{ ...first.offer, status: 'rejected' }] });
  assert.equal(second.ok, true);
  assert.notEqual(second.offer.id, first.offer.id);
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

test('club counter can be accepted on the final negotiation round', () => {
  const ctx = setup(), created = makeOffer(ctx);
  const counter = Negotiations.evaluateClubOffer({ offer: created.offer, player: ctx.player, fee: 90000, marketValue: 100000 });
  const finalCounter = { ...counter.offer, clubRounds: Negotiations.RULES.maxClubRounds };
  const accepted = Negotiations.acceptClubCounter({ offer: finalCounter, player: ctx.player, budget: 1000000 });
  assert.equal(accepted.ok, true);
  assert.equal(accepted.offer.status, 'club_accepted');
  assert.equal(accepted.offer.fee, finalCounter.counterFee);
  assert.equal(accepted.offer.counterFee, null);
  assert.equal(Negotiations.acceptClubCounter({ offer: finalCounter, player: ctx.player, budget: 1000 }).code, 'INSUFFICIENT_BUDGET');
  assert.equal(Negotiations.acceptClubCounter({ offer: finalCounter, player: { ...ctx.player, clubId: 3 }, budget: 1000000 }).code, 'STALE_NEGOTIATION');
});

test('exact counter threshold is accepted without floating-point over-rounding', () => {
  const ctx = setup(), created = makeOffer(ctx);
  const result = Negotiations.evaluateClubOffer({ offer: created.offer, player: ctx.player, fee: 112000, marketValue: 100000 });
  assert.equal(result.decision, 'accepted');
  assert.equal(result.offer.fee, 112000);
});

test('seller rejects an offer below the minimum threshold', () => {
  const ctx = setup(), created = makeOffer(ctx);
  const result = Negotiations.evaluateClubOffer({ offer: created.offer, player: ctx.player, fee: 70000, marketValue: 100000 });
  assert.equal(result.decision, 'rejected');
});

test('player negotiates wages and can counter with a clear demand', () => {
  const ctx = setup(), created = makeOffer(ctx);
  const club = Negotiations.evaluateClubOffer({ offer: created.offer, player: ctx.player, fee: 120000, marketValue: 100000 });
  const result = Negotiations.evaluatePlayerContract({ offer: club.offer, player: ctx.player, weeklyWage: 2000, contractYears: 3, signingBonus: 10000 });
  assert.equal(result.decision, 'countered');
  assert.equal(result.offer.status, 'player_countered');
  assert.ok(result.demandedWage > 2000);
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

test('unfinished negotiations expire cleanly at season rollover', () => {
  const result = Negotiations.expireAtSeasonEnd({
    season: 3,
    negotiations: [
      { id: 'a', season: 3, status: 'pending' },
      { id: 'b', season: 2, status: 'player_countered' },
      { id: 'c', season: 3, status: 'completed' },
      { id: 'd', season: 4, status: 'pending' }
    ]
  });
  assert.equal(result.ok, true);
  assert.equal(result.expired, 2);
  assert.equal(result.negotiations[0].status, 'expired');
  assert.equal(result.negotiations[0].expiredSeason, 3);
  assert.equal(result.negotiations[2].status, 'completed');
  assert.equal(result.negotiations[3].status, 'pending');
});

test('computed wage is used when a player has no stored wage field', () => {
  const ctx = setup(), player = { ...ctx.player };
  delete player.wg;
  const created = Negotiations.createOffer({ player, buyerClubId: 1, budget: 1000000, fee: 100000, weeklyWage: 2000, contractYears: 3 });
  const club = Negotiations.evaluateClubOffer({ offer: created.offer, player, fee: 120000, marketValue: 100000 });
  const result = Negotiations.evaluatePlayerContract({ offer: club.offer, player, currentWage: 2000, weeklyWage: 2000, contractYears: 3 });
  assert.equal(result.decision, 'countered');
  assert.ok(result.demandedWage > 2000);
});


test('counter submission rejects corrupted signing bonuses and unsafe totals', () => {
  const ctx = setup(), created = makeOffer(ctx);
  const counter = { ...created.offer, status: 'countered', counterFee: 120000 };
  assert.equal(Negotiations.submitCounterOffer({
    offer: { ...counter, signingBonus: -1 }, fee: 100000, budget: 1000000
  }).code, 'INVALID_MONEY');
  assert.equal(Negotiations.submitCounterOffer({
    offer: { ...counter, signingBonus: Number.MAX_SAFE_INTEGER }, fee: 1, budget: Number.MAX_SAFE_INTEGER
  }).code, 'BUDGET_OVERFLOW');
});

test('player counter acceptance rejects invalid saved transfer costs', () => {
  const ctx = setup(), created = makeOffer(ctx);
  const counter = {
    ...created.offer, status: 'player_countered', counterWage: 3000
  };
  assert.equal(Negotiations.acceptPlayerCounter({
    offer: { ...counter, signingBonus: -500 }, budget: 1000000
  }).code, 'INVALID_CONTRACT_MONEY');
  assert.equal(Negotiations.acceptPlayerCounter({
    offer: { ...counter, fee: Number.MAX_SAFE_INTEGER, signingBonus: 1 }, budget: Number.MAX_SAFE_INTEGER
  }).code, 'INVALID_CONTRACT_MONEY');
});

test('finalization rejects corrupted bonus, overflow and invalid contract terms without changing state', () => {
  const ctx = setup(), created = makeOffer(ctx);
  const complete = {
    ...created.offer, status: 'player_accepted', fee: 120000,
    weeklyWage: 3000, contractYears: 3
  };
  const originalBudget = 1000000;
  const badBonus = Negotiations.finalizeDeal({
    offer: { ...complete, signingBonus: -1 }, players: ctx.players,
    budget: originalBudget, transferSystem: Transfers
  });
  assert.equal(badBonus.code, 'INVALID_CONTRACT_MONEY');
  const overflow = Negotiations.finalizeDeal({
    offer: { ...complete, fee: Number.MAX_SAFE_INTEGER, signingBonus: 1 },
    players: ctx.players, budget: Number.MAX_SAFE_INTEGER, transferSystem: Transfers
  });
  assert.equal(overflow.code, 'BUDGET_OVERFLOW');
  const badYears = Negotiations.finalizeDeal({
    offer: { ...complete, contractYears: 0 }, players: ctx.players,
    budget: originalBudget, transferSystem: Transfers
  });
  assert.equal(badYears.code, 'INVALID_CONTRACT_MONEY');
  assert.equal(ctx.players.find(p => p.id === '2-8').clubId, 2);
});


test('contract renewal validates ownership, terms and available signing budget without mutating source', () => {
  const ctx = setup(), player = { ...ctx.player, cy: 2, wg: 2000 };
  const base = { player, clubId: 2, currentYears: 2, addYears: 2, weeklyWage: 3200, signingBonus: 12800, budget: 50000 };
  const result = Negotiations.completeRenewal(base);
  assert.equal(result.ok, true);
  assert.equal(result.contractYears, 4);
  assert.equal(result.player.cy, 4);
  assert.equal(result.player.wg, 3200);
  assert.equal(result.budget, 37200);
  assert.equal(player.cy, 2);
  assert.equal(player.wg, 2000);
  assert.equal(Negotiations.validateRenewal({ ...base, clubId: 1 }).code, 'PLAYER_NOT_FOUND');
  assert.equal(Negotiations.validateRenewal({ ...base, addYears: 0 }).code, 'INVALID_CONTRACT_LENGTH');
  assert.equal(Negotiations.validateRenewal({ ...base, weeklyWage: -1 }).code, 'INVALID_CONTRACT_MONEY');
  assert.equal(Negotiations.validateRenewal({ ...base, signingBonus: Number.MAX_SAFE_INTEGER + 1 }).code, 'INVALID_CONTRACT_MONEY');
  assert.equal(Negotiations.validateRenewal({ ...base, budget: 1000 }).code, 'INSUFFICIENT_BUDGET');
  assert.equal(Negotiations.validateRenewal({ ...base, currentYears: 5 }).code, 'CONTRACT_AT_MAXIMUM');
});

test('contract renewal caps the resulting duration and rejects invalid budgets safely', () => {
  const ctx = setup(), player = { ...ctx.player, cy: 4 };
  const base = { player, clubId: 2, currentYears: 4, addYears: 3, weeklyWage: 2500, signingBonus: 0, budget: 0 };
  const result = Negotiations.completeRenewal(base);
  assert.equal(result.ok, true);
  assert.equal(result.contractYears, 5);
  assert.equal(result.player.cy, 5);
  assert.equal(Negotiations.validateRenewal({ ...base, budget: -1 }).code, 'INVALID_BUDGET');
});

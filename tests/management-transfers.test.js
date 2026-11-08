'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Transfers = require('../js/management/transfers');

function roster() {
  const players = [];
  for (let clubId = 1; clubId <= 3; clubId++) {
    for (let i = 0; i < 18; i++) {
      players.push({
        id: clubId + '-' + i,
        name: 'Player ' + clubId + '-' + i,
        clubId,
        pos: i < 2 ? 'GK' : i < 8 ? 'DEF' : i < 14 ? 'MID' : 'FWD',
        ovr: 60 + (i % 20),
        age: 20 + (i % 12),
        cy: 3,
        wg: 1200
      });
    }
  }
  players.push({ id: 'free-1', name: 'Free Agent', clubId: 0, pos: 'MID', ovr: 65, age: 22, cy: 0, wg: 0 });
  return players;
}

test('permanent transfer validates and completes without mutating source state', () => {
  const players = roster();
  const input = { players, playerId: '2-8', buyerClubId: 1, sellerClubId: 2, fee: 250000, budget: 500000, contractYears: 3, weeklyWage: 4200, season: 2 };
  const result = Transfers.completePurchase(input);
  assert.equal(result.ok, true);
  assert.equal(result.budget, 250000);
  assert.equal(result.players.find(p => p.id === '2-8').clubId, 1);
  assert.equal(result.players.find(p => p.id === '2-8').cy, 3);
  assert.equal(result.players.find(p => p.id === '2-8').wg, 4200);
  assert.equal(players.find(p => p.id === '2-8').clubId, 2);
  assert.equal(input.budget, 500000);
});

test('free agents can be signed without reducing a selling club roster', () => {
  const result = Transfers.completePurchase({ players: roster(), playerId: 'free-1', buyerClubId: 1, sellerClubId: 0, fee: 0, budget: 0, contractYears: 2, weeklyWage: 1000 });
  assert.equal(result.ok, true);
  assert.equal(result.players.find(p => p.id === 'free-1').clubId, 1);
});

test('purchase rejects insufficient budget, invalid contract and full squad', () => {
  const players = roster();
  assert.equal(Transfers.validatePurchase({ players, playerId: '2-8', buyerClubId: 1, sellerClubId: 2, fee: 300, budget: 200, contractYears: 3, weeklyWage: 1000 }).code, 'INSUFFICIENT_BUDGET');
  assert.equal(Transfers.validatePurchase({ players, playerId: '2-8', buyerClubId: 1, sellerClubId: 2, fee: 0, budget: 200, contractYears: 6, weeklyWage: 1000 }).code, 'INVALID_CONTRACT_LENGTH');
  const full = players.concat(Array.from({ length: 8 }, (_, i) => ({ ...players[i], id: 'extra-' + i, clubId: 1 })));
  assert.equal(Transfers.validatePurchase({ players: full, playerId: '2-8', buyerClubId: 1, sellerClubId: 2, fee: 0, budget: 200, contractYears: 3, weeklyWage: 1000 }).code, 'BUYER_SQUAD_FULL');
});

test('permanent transfer protects seller minimum squad and goalkeeper coverage', () => {
  const players = roster().filter(p => p.clubId !== 2 || p.id !== '2-0');
  assert.equal(Transfers.validatePurchase({ players, playerId: '2-1', buyerClubId: 1, sellerClubId: 2, fee: 0, budget: 0, contractYears: 3, weeklyWage: 1000 }).code, 'SELLER_NEEDS_GOALKEEPERS');
  const short = roster().filter(p => p.clubId !== 2).concat(roster().filter(p => p.clubId === 2).slice(0, 14));
  assert.equal(Transfers.validatePurchase({ players: short, playerId: '2-8', buyerClubId: 1, sellerClubId: 2, fee: 0, budget: 0, contractYears: 3, weeklyWage: 1000 }).code, 'SELLER_SQUAD_TOO_SMALL');
});

test('sale moves a player and credits proceeds while preserving source roster', () => {
  const players = roster();
  const result = Transfers.completeSale({ players, playerId: '1-8', sellerClubId: 1, buyerClubId: 3, fee: 180000, budget: 50000 });
  assert.equal(result.ok, true);
  assert.equal(result.budget, 230000);
  assert.equal(result.players.find(p => p.id === '1-8').clubId, 3);
  assert.equal(players.find(p => p.id === '1-8').clubId, 1);
});

test('loan creates a dated agreement and moves player without duplicating identity', () => {
  const players = roster();
  const result = Transfers.createLoan({ players, loans: [], playerId: '2-8', fromClubId: 2, toClubId: 1, season: 4, durationSeasons: 2, loanFee: 40000, wageSharePct: 75 });
  assert.equal(result.ok, true);
  assert.equal(result.players.filter(p => p.id === '2-8').length, 1);
  assert.equal(result.players.find(p => p.id === '2-8').clubId, 1);
  assert.deepEqual(result.loan, { id: 'loan:2-8:4:1', playerId: '2-8', fromClubId: 2, toClubId: 1, startSeason: 4, endSeason: 5, loanFee: 40000, wageSharePct: 75, status: 'active' });
});

test('loan rejects invalid parties, duplicate active loan and club loan limit', () => {
  const players = roster();
  const base = { players, loans: [], playerId: '2-8', fromClubId: 2, toClubId: 1, season: 4, durationSeasons: 1, loanFee: 0, wageSharePct: 50 };
  assert.equal(Transfers.validateLoan({ ...base, toClubId: 2 }).code, 'INVALID_CLUBS');
  assert.equal(Transfers.validateLoan({ ...base, fromClubId: 0 }).code, 'INVALID_CLUBS');
  assert.equal(Transfers.validateLoan({ ...base, loans: {} }).code, 'INVALID_LOANS');
  assert.equal(Transfers.validateLoan({ ...base, loans: [{ playerId: '2-8', status: 'active', toClubId: 3 }] }).code, 'PLAYER_ALREADY_LOANED');
  const many = [0, 1, 2].map(i => ({ playerId: 'x' + i, status: 'active', toClubId: 1 }));
  assert.equal(Transfers.validateLoan({ ...base, loans: many }).code, 'LOAN_LIMIT_REACHED');
});

test('loan cannot outlast the remaining player contract', () => {
  const players = roster().map(p => p.id === '2-8' ? { ...p, cy: 1 } : p);
  const input = { players, loans: [], playerId: '2-8', fromClubId: 2, toClubId: 1, season: 1, durationSeasons: 2, loanFee: 0, wageSharePct: 50 };
  assert.equal(Transfers.validateLoan(input).code, 'CONTRACT_TOO_SHORT');
});

test('loan protects both clubs roster and goalkeeper minimums', () => {
  const players = roster().filter(p => p.clubId !== 2 || p.id !== '2-0');
  const base = { players, loans: [], playerId: '2-1', fromClubId: 2, toClubId: 1, season: 1, durationSeasons: 1, loanFee: 0, wageSharePct: 50 };
  assert.equal(Transfers.validateLoan(base).code, 'SELLER_NEEDS_GOALKEEPERS');
  const full = roster().concat(Array.from({ length: 8 }, (_, i) => ({ ...players[i], id: 'x' + i, clubId: 1 })));
  assert.equal(Transfers.validateLoan({ ...base, players: full, playerId: '2-8' }).code, 'BUYER_SQUAD_FULL');
});

test('re-loaning a player in the same season preserves unique loan history IDs', () => {
  const players = roster();
  const first = Transfers.createLoan({ players, loans: [], playerId: '2-8', fromClubId: 2, toClubId: 1, season: 4, durationSeasons: 1, loanFee: 1000, wageSharePct: 50 });
  const returned = Transfers.returnLoansAtSeasonEnd({ players: first.players, loans: first.loans, season: 4 });
  assert.equal(returned.ok, true);
  const second = Transfers.createLoan({ players: returned.players, loans: returned.loans, playerId: '2-8', fromClubId: 2, toClubId: 1, season: 4, durationSeasons: 1, loanFee: 2000, wageSharePct: 75 });
  assert.equal(second.ok, true);
  assert.notEqual(second.loan.id, first.loan.id);
  assert.equal(second.loan.id, first.loan.id + ':2');
  assert.equal(second.loans.length, 2);
});

test('season-end return rejects multiple active loans for one player without mutating input', () => {
  const players = roster().map(p => p.id === '2-8' ? { ...p, clubId: 1 } : p);
  const loans = [
    { id: 'loan-a', playerId: '2-8', fromClubId: 2, toClubId: 1, endSeason: 2, status: 'active' },
    { id: 'loan-b', playerId: '2-8', fromClubId: 3, toClubId: 1, endSeason: 2, status: 'active' }
  ];
  const result = Transfers.returnLoansAtSeasonEnd({ players, loans, season: 2 });
  assert.equal(result.code, 'DUPLICATE_ACTIVE_PLAYER_LOAN');
  assert.equal(players.find(p => p.id === '2-8').clubId, 1);
  assert.deepEqual(loans.map(x => x.status), ['active', 'active']);
});

test('season-end return restores original club and keeps completed loan history', () => {
  const players = roster().map(p => p.id === '2-8' ? { ...p, clubId: 1 } : p);
  const loans = [{ id: 'loan:2-8:4:1', playerId: '2-8', fromClubId: 2, toClubId: 1, startSeason: 4, endSeason: 5, loanFee: 40000, wageSharePct: 75, status: 'active' }];
  const early = Transfers.returnLoansAtSeasonEnd({ players, loans, season: 4 });
  assert.equal(early.players.find(p => p.id === '2-8').clubId, 1);
  const done = Transfers.returnLoansAtSeasonEnd({ players, loans, season: 5 });
  assert.equal(done.players.find(p => p.id === '2-8').clubId, 2);
  assert.equal(done.loans[0].status, 'completed');
  assert.equal(done.loans[0].returnedSeason, 5);
});

test('sale rejects invalid budget and unknown destination club', () => {
  const players = roster();
  const base = { players, playerId: '1-8', sellerClubId: 1, buyerClubId: 3, fee: 1000, budget: 5000 };
  assert.equal(Transfers.validateSale({ ...base, budget: NaN }).code, 'INVALID_BUDGET');
  assert.equal(Transfers.validateSale({ ...base, buyerClubId: 99 }).code, 'BUYER_NOT_FOUND');
});

test('season-end loan recovery rejects broken active loan references', () => {
  const result = Transfers.returnLoansAtSeasonEnd({ players: roster(), loans: [{ playerId: 'missing', fromClubId: 2, endSeason: 1, status: 'active' }], season: 1 });
  assert.equal(result.code, 'INVALID_ACTIVE_LOAN');
});

test('invalid money, wage share and player references fail safely', () => {
  const players = roster();
  assert.equal(Transfers.validatePurchase({ players, playerId: '2-8', buyerClubId: 1, sellerClubId: 2, fee: -1, budget: 10, contractYears: 2, weeklyWage: 10 }).code, 'INVALID_FEE');
  assert.equal(Transfers.validatePurchase({ players, playerId: 'missing', buyerClubId: 1, sellerClubId: 2, fee: 0, budget: 10, contractYears: 2, weeklyWage: 10 }).code, 'PLAYER_NOT_FOUND');
  assert.equal(Transfers.validateLoan({ players, playerId: '2-8', fromClubId: 2, toClubId: 1, season: 1, durationSeasons: 1, loanFee: 0, wageSharePct: 101 }).code, 'INVALID_WAGE_SHARE');
});


test('weekly wage commitments split an active loan salary between the borrowing and parent clubs', () => {
  const players = [
    { id: 'loaned', clubId: 1, wg: 10000 },
    { id: 'regular', clubId: 1, wg: 4000 },
    { id: 'parent-player', clubId: 2, wg: 6000 }
  ];
  const loans = [{ id: 'loan-1', playerId: 'loaned', fromClubId: 2, toClubId: 1, wageSharePct: 75, status: 'active' }];
  const borrower = Transfers.calculateWeeklyWageCommitment({ players, loans, clubId: 1, wageForPlayer: p => p.wg });
  const parent = Transfers.calculateWeeklyWageCommitment({ players, loans, clubId: 2, wageForPlayer: p => p.wg });
  assert.deepEqual(borrower, { ok: true, amount: 11500 });
  assert.deepEqual(parent, { ok: true, amount: 8500 });
  assert.equal(borrower.amount + parent.amount, 20000);
});

test('weekly wage allocation handles zero and full borrowing-club shares', () => {
  const players = [{ id: 'zero', clubId: 1, wg: 9000 }, { id: 'full', clubId: 2, wg: 9000 }];
  const loans = [
    { id: 'loan-zero', playerId: 'zero', fromClubId: 2, toClubId: 1, wageSharePct: 0, status: 'active' },
    { id: 'loan-full', playerId: 'full', fromClubId: 1, toClubId: 2, wageSharePct: 100, status: 'active' }
  ];
  assert.equal(Transfers.calculateWeeklyWageCommitment({ players, loans, clubId: 1, wageForPlayer: p => p.wg }).amount, 0);
  assert.equal(Transfers.calculateWeeklyWageCommitment({ players, loans, clubId: 2, wageForPlayer: p => p.wg }).amount, 18000);
});

test('weekly wage allocation rejects duplicate or inconsistent active loan records safely', () => {
  const players = [{ id: 'loaned', clubId: 1, wg: 10000 }];
  const base = { players, clubId: 1, wageForPlayer: p => p.wg };
  const loan = { playerId: 'loaned', fromClubId: 2, toClubId: 1, wageSharePct: 75, status: 'active' };
  assert.equal(Transfers.calculateWeeklyWageCommitment({ ...base, loans: [loan, { ...loan, id: 'duplicate' }] }).code, 'DUPLICATE_ACTIVE_PLAYER_LOAN');
  assert.equal(Transfers.calculateWeeklyWageCommitment({ ...base, loans: [{ ...loan, wageSharePct: 101 }] }).code, 'INVALID_ACTIVE_LOAN');
  assert.equal(Transfers.calculateWeeklyWageCommitment({ ...base, loans: [{ ...loan, toClubId: 3 }] }).code, 'LOAN_PLAYER_CLUB_MISMATCH');
  assert.equal(Transfers.calculateWeeklyWageCommitment({ ...base, loans: [loan], wageForPlayer: () => -1 }).code, 'INVALID_PLAYER_WAGE');
});

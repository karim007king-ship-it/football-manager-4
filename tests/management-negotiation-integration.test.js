'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Finance = require('../js/management/finance-ledger');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

test('negotiation engine loads after transfer rules and before the game controller', () => {
  const transfers = html.indexOf('<script src="js/management/transfers.js"></script>');
  const negotiations = html.indexOf('<script src="js/management/negotiations.js"></script>');
  const controller = html.indexOf('<script>\nconst KEY=');
  assert.ok(transfers >= 0 && negotiations > transfers && controller > negotiations);
});

test('market exposes other clubs players through the negotiation workflow', () => {
  assert.match(html, /function startNegotiation\(/);
  assert.match(html, /function beginNegotiation\(/);
  assert.match(html, /function showClubCounter\(/);
  assert.match(html, /function answerClubCounter\(/);
  assert.match(html, /function showPlayerContract\(/);
  assert.match(html, /function showPlayerWageTerms\(/);
  assert.match(html, /function acceptPlayerCounter\(/);
  assert.match(html, /function finalizeNegotiatedTransfer\(/);
  assert.match(html, /لاعبون من أندية الدرجة نفسها/);
  assert.match(html, /onclick="startNegotiation\('/);
});

test('negotiation history is initialized and preserved for old and new saves', () => {
  assert.match(html, /negotiations:\[\]/);
  assert.match(html, /if\(!Array\.isArray\(G\.negotiations\)\)G\.negotiations=\[\]/);
});

test('contract UI includes duration, weekly wage and signing bonus choices', () => {
  assert.match(html, /\[2,3,4,5\]/);
  assert.match(html, /مكافأة توقيع/);
  assert.match(html, /submitPlayerTerms\(id,w,years,bonus\)/);
});

test('preflight checks protect roster and budget before opening talks', () => {
  assert.match(html, /FM4TransferSystem\.validatePurchase/);
  assert.match(html, /function startNegotiation\(/);
});

test('legacy saves initialize negotiation history and season rollover expires open talks', () => {
  assert.match(html, /function save\(\).*G\.negotiations=\[\]/);
  assert.match(html, /function load\(\).*G\.negotiations=\[\]/);
  assert.match(html, /FM4NegotiationSystem\.expireAtSeasonEnd/);
});

test('the selected signing bonus is included in the affordability check', () => {
  assert.match(html, /weeklyWage,contractYears,signingBonus,budget:G\.budget/);
  assert.match(html, /G\.budget>=offer\.fee\+bonus/);
});

test('unfinished negotiations can be resumed or explicitly rejected from the market', () => {
  assert.match(html, /function negotiationRows\(/);
  assert.match(html, /function resumeNegotiation\(/);
  assert.match(html, /function rejectNegotiation\(/);
  assert.match(html, /negotiationRows\(\)\+l\.map/);
});


test('renewal UI delegates signing to the validated contract domain rules', () => {
  assert.match(html, /function signC\(p,y,w,b\)\{const result=FM4NegotiationSystem\.completeRenewal/);
  assert.match(html, /if\(!result\.ok\)return say\('❌ '\+result\.message\)/);
  assert.match(html, /renewalPrefix='s'\+G\.season\+':renewal:'\+p\.id/);
  assert.match(html, /renewalPrefix\+':n'\+renewalCount,'signing-bonus','مكافأة تجديد عقد '\+p\.name,-b\)/);
  assert.match(html, /Object\.assign\(p,result\.player\)/);
  assert.doesNotMatch(html, /G\.budget=result\.budget;Object\.assign\(p,result\.player\)/);
});


test('home dashboard surfaces expiring and upcoming contracts with a direct contracts action', () => {
  assert.match(html, /function expRow\(\)\{let l=G\.players\.filter\(p=>p\.clubId==G\.uid\),urgent=l\.filter\(p=>cy\(p\)<=1\)\.length,soon=l\.filter\(p=>cy\(p\)==2\)\.length/);
  assert.match(html, /تنتهي هذا الموسم/);
  assert.match(html, /خلال موسمين/);
  assert.match(html, /onclick="go\('contracts'\)">إدارة العقود/);
});

test('renewal rejects players outside the club and avoids offering renewals beyond the five-season cap', () => {
  assert.match(html, /function renew\(id\)\{let p=G\.players\.find\(x=>x\.id==id\);if\(!p\|\|p\.clubId!==G\.uid\)/);
  assert.match(html, /if\(cy\(p\)>=5\)return say/);
});


test('contracts dashboard breaks down weekly operating costs and remaining season commitments', () => {
  assert.match(html, /const academyWeekly=ACW\[AC\(\)\.lv\]\|\|0,stadiumWeekly=SDU\[SD\(\)\.cap\]\|\|0,trainingWeekly=\(INT\[TR\(\)\.lv\]\|\|INT\[1\]\)\.c,weeklyCommitments=tot\+academyWeekly\+stadiumWeekly\+trainingWeekly/);
  assert.match(html, /const remainingRounds=Math\.max\(0,14-G\.round\),remainingCommitments=weeklyCommitments\*remainingRounds/);
  assert.match(html, /رواتب اللاعبين أسبوعياً/);
  assert.match(html, /الأكاديمية أسبوعياً/);
  assert.match(html, /صيانة الاستاد أسبوعياً/);
  assert.match(html, /التدريب أسبوعياً/);
  assert.match(html, /الالتزامات المقدّرة حتى نهاية الموسم/);
  assert.match(html, /لا يشمل إيرادات المباريات أو الرعاية أو الكأس أو المكافآت/);
});

test('replayed atomic finance settlement is treated as successful without changing the budget twice', () => {
  assert.match(html, /function financePostBatch\(entries\).*if\(!result\.ok\).*return false\}return true/);
  const career = { budget: 1000, financeHistory: [] };
  const entries = [
    { eventId: 's1:r1:gate', category: 'match-income', description: 'Gate income', amount: 500 },
    { eventId: 's1:r1:wages', category: 'operating-expense', description: 'Weekly costs', amount: -200 }
  ];
  const first = Finance.applyBatchToCareer(career, entries, { season: 1, round: 1 });
  const replay = Finance.applyBatchToCareer(career, entries, { season: 1, round: 1 });
  assert.equal(first.ok, true);
  assert.equal(first.duplicate, false);
  assert.equal(replay.ok, true);
  assert.equal(replay.duplicate, true);
  assert.equal(career.budget, 1300);
  assert.equal(career.financeHistory.length, 2);
});

test('single finance posts keep duplicate replays blocked for one-time management actions', () => {
  assert.match(html, /function financePost\(eventId,category,description,amount\).*if\(!result\.ok\).*return false\}return !result\.duplicate/);
  const career = { budget: 1000, financeHistory: [] };
  const entry = { eventId: 's1:training-facility:0', season: 1, round: 1, category: 'facility-investment', description: 'Training facility upgrade', amount: -400 };
  const first = Finance.applyToCareer(career, entry);
  const replay = Finance.applyToCareer(career, entry);
  assert.equal(first.ok, true);
  assert.equal(first.duplicate, false);
  assert.equal(replay.ok, true);
  assert.equal(replay.duplicate, true);
  assert.equal(career.budget, 600);
  assert.equal(career.financeHistory.length, 1);
});

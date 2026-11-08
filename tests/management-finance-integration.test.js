'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const financeLedger = require('../js/management/finance-ledger');

test('season contract processing decrements a loaned player only once when loan history has duplicates', () => {
  const start = html.indexOf("function contractsEnd()");
  const loaned = html.indexOf("loaned=()=>", start);
  const borrowed = html.indexOf("borrowedIds=", loaned);
  assert.ok(start >= 0 && loaned > start && borrowed > loaned);
  assert.match(html.slice(loaned, borrowed), /\[\.\.\.new Set\(/);
});

test('season finalization checks loan history before side effects without blocking the season', () => {
  const guard = html.indexOf("function endSeason(){");
  const preflight = html.indexOf("const loanPreflight=FM4TransferSystem.returnLoansAtSeasonEnd", guard);
  const prize = html.indexOf("league-prize", guard);
  assert.ok(guard >= 0 && preflight > guard && prize > preflight);
  assert.match(html, /if\(!loanPreflight\.ok\)\{console\.error\('FM4 loan lifecycle:'/);
  assert.match(html, /G\.news\.push\('⚠️ تعذّر التحقق من سجلات الإعارة/);
  assert.doesNotMatch(html.slice(preflight, prize), /return false/);
});

test('season finalization is guarded against duplicate execution', () => {
  assert.ok(html.includes("function endSeason(){"));
  assert.ok(html.includes("if(G.round<14||G.lastCompletedSeason===G.season)"));
  assert.ok(html.includes("G.lastCompletedSeason=G.season;G.season++;G.round=0"));
});

test('legacy careers without a season completion marker remain eligible for finalization', () => {
  assert.ok(html.includes("if(G.round<14||G.lastCompletedSeason===G.season)"));
  assert.equal(html.includes("if(!G.lastCompletedSeason)"), false);
});

test('finance batch replay is identified and does not change the balance twice', () => {
  const career = { budget: 1000, financeHistory: [] };
  const entries = [
    { eventId: 's1:r1:gate', category: 'match-income', description: 'Gate', amount: 100 },
    { eventId: 's1:r1:cost', category: 'operating-expense', description: 'Costs', amount: -50 }
  ];
  const first = financeLedger.applyBatchToCareer(career, entries, { season: 1, round: 1 });
  assert.equal(first.ok, true);
  assert.equal(first.duplicate, false);
  assert.equal(career.budget, 1050);
  const replay = financeLedger.applyBatchToCareer(career, entries, { season: 1, round: 1 });
  assert.equal(replay.ok, true);
  assert.equal(replay.duplicate, true);
  assert.equal(career.budget, 1050);
  assert.equal(career.financeHistory.length, 2);
});

test('finance batch with both replayed and new entries is not marked as a full duplicate', () => {
  const career = { budget: 1000, financeHistory: [] };
  const first = financeLedger.applyBatchToCareer(career, [
    { eventId: 's1:r1:gate', category: 'match-income', description: 'Gate', amount: 100 }
  ], { season: 1, round: 1 });
  assert.equal(first.ok, true);
  const mixed = financeLedger.applyBatchToCareer(career, [
    { eventId: 's1:r1:gate', category: 'match-income', description: 'Gate', amount: 100 },
    { eventId: 's1:r1:cost', category: 'operating-expense', description: 'Costs', amount: -50 }
  ], { season: 1, round: 1 });
  assert.equal(mixed.ok, true);
  assert.equal(mixed.duplicate, false);
  assert.equal(career.budget, 1050);
  assert.equal(career.financeHistory.length, 2);
});

test('conflicting finance batch replay rolls back every pending entry', () => {
  const career = { budget: 1000, financeHistory: [] };
  financeLedger.applyBatchToCareer(career, [
    { eventId: 's1:r1:gate', category: 'match-income', description: 'Gate', amount: 100 }
  ], { season: 1, round: 1 });
  const beforeBudget = career.budget;
  const beforeHistory = JSON.stringify(career.financeHistory);
  const conflict = financeLedger.applyBatchToCareer(career, [
    { eventId: 's1:r1:new', category: 'match-income', description: 'New income', amount: 200 },
    { eventId: 's1:r1:gate', category: 'match-income', description: 'Gate changed', amount: 150 }
  ], { season: 1, round: 1 });
  assert.equal(conflict.ok, false);
  assert.equal(conflict.code, 'EVENT_ID_CONFLICT');
  assert.equal(career.budget, beforeBudget);
  assert.equal(JSON.stringify(career.financeHistory), beforeHistory);
});

test('finance ledger loads before the game controller', () => {
  const ledger = html.indexOf('<script src="js/management/finance-ledger.js"></script>');
  const controller = html.indexOf('<script>\nconst KEY=');
  assert.ok(ledger >= 0 && controller > ledger);
});

test('new careers initialize finance history and old saves migrate safely', () => {
  assert.match(html, /negotiations:\[\],financeHistory:\[\]/);
  assert.match(html, /if\(!Array\.isArray\(G\.financeHistory\)\)G\.financeHistory=\[\]/);
  assert.match(html, /if\(!Array\.isArray\(G\.financeHistory\)\)G\.financeHistory=\[\]\}\}\}catch/);
});

test('league match settlement posts gate, sponsor and operating costs atomically', () => {
  assert.match(html, /const settlement=\[\{eventId:financePrefix\+'match-gate',category:'match-income',description:'مداخيل المباراة',amount:gate\}/);
  assert.match(html, /settlement\.push\(\{eventId:financePrefix\+'sponsor',category:'sponsor-income'/);
  assert.match(html, /settlement\.push\(\{eventId:financePrefix\+'weekly-costs',category:'operating-expense'/);
  assert.match(html, /financePostBatch\(settlement\)/);
});

test('weekly training cost is posted once per league round', () => {
  assert.match(html, /financePost\('s'\+G\.season\+':r'\+\(G\.round\+1\)\+':training','training'/);
  assert.match(html, /financePost\([^;]*'training','تكلفة التدريب الأسبوعي',-I\.c\)/);
});

test('cup, awards and league prizes are recorded as financial income', () => {
  assert.match(html, /:cup:'\+c\.s\+':gate','cup-income'/);
  assert.match(html, /:award:top-scorer:'\+sc\.id,'player-award'/);
  assert.match(html, /:league-prize','league-prize','مكافأة مركز الدوري',rw/);
  assert.match(html, /:promotion-prize','promotion-income'/);
});

test('academy, stadium and marketing investments are recorded as expenses', () => {
  assert.match(html, /:academy-upgrade:'\+a\.lv,'academy-investment'/);
  assert.match(html, /:stadium-upgrade:'\+d\.cap,'stadium-investment'/);
  assert.match(html, /:marketing-campaign','marketing-expense','حملة تسويقية',-150000/);
});

test('sponsor signing, renewals, player loans and outgoing player sales use the ledger', () => {
  assert.match(html, /:r'\+G\.round\+':sponsor-signing:'\+i,'sponsor-signing-income'/);
  assert.match(html, /renewalPrefix='s'\+G\.season\+':renewal:'\+p\.id/);
  assert.match(html, /renewalPrefix\+':n'\+renewalCount,'signing-bonus'/);
  assert.match(html, /:r'\+\(G\.round\+1\)\+':loan-out:'\+id,'loan-income'/);
  assert.match(html, /:r'\+\(G\.round\+1\)\+':loan-in:'\+id,'loan-expense'/);
  assert.match(html, /:r'\+\(G\.round\+1\)\+':offer-sale:'\+p\.id,'transfer-income'/);
});

test('player purchases, negotiated transfers and player sales are posted through the finance ledger', () => {
  assert.match(html, /:transfer-buy:'\+id,'transfer-expense'/);
  assert.match(html, /eventId:'s'\+G\.season\+':negotiation:'\+id\+':fee',season:G\.season,round:G\.round\+1,category:'transfer-expense'/);
  assert.match(html, /eventId:'s'\+G\.season\+':negotiation:'\+id\+':bonus',season:G\.season,round:G\.round\+1,category:'signing-bonus'/);
  assert.match(html, /:transfer-sale:'\+id,'transfer-income'/);
  assert.doesNotMatch(html, /G\.players=result\.players;G\.budget=result\.budget;let signed=/);
});

test('management objective reward is not reported as paid when ledger posting fails', () => {
  assert.match(html, /paid=financePost\('s'\+G\.season\+':management-objective:'\+i/);
  assert.match(html, /paid\?' \(\+'\+money\(o\.rw\)\+'\)':ok\?' \(تعذّر تسجيل المكافأة\)'/);
});

test('training facility upgrades and management objectives use idempotent ledger events', () => {
  assert.match(html, /:training-facility:'\+T\.fac,'facility-investment'/);
  assert.match(html, /:management-objective:'\+i,'management-prize'/);
});

test('cup champion and runner-up prizes use distinct ledger event IDs', () => {
  assert.match(html, /:cup:champion','cup-prize'/);
  assert.match(html, /:cup:runner-up','cup-prize'/);
});


test('finance dashboard is reachable and displays real ledger metrics and transaction details', () => {
  assert.match(html, /data-tab="finance" onclick="go\('finance'\)"/);
  assert.match(html, /function financeHtml\(seasonFilter='current',categoryFilter='all'\)/);
  assert.match(html, /FM4FinanceLedger\.summarize/);
  assert.match(html, /الرصيد الحالي/);
  assert.match(html, /إجمالي الإيرادات/);
  assert.match(html, /إجمالي المصروفات/);
  assert.match(html, /الرصيد بعد الحركة/);
  assert.match(html, /financeRender\(this\.value/);
  assert.match(html, /categoryFilter===x/);
});

test('finance dashboard filters its displayed totals and transactions by season and category', () => {
  assert.match(html, /history\.filter\(x=>\(selectedSeason==='all'\|\|x\.season===selectedSeason\)&&\(categoryFilter==='all'\|\|x\.category===categoryFilter\)\)/);
  assert.match(html, /const summary=categoryFilter==='all'&&selectedSeason!=='all'\?FM4FinanceLedger\.summarize/);
  assert.match(html, /entries\.reduce\(\(acc,x\)=>/);
  assert.match(html, /entries\.map\(x=>/);
});

test('all remaining non-initial budget changes are represented in the ledger', () => {
  assert.match(html, /disciplinary-income/);
  assert.match(html, /career-budget-adjustment/);
  assert.doesNotMatch(html, /G\.budget\s*\+=\s*20000/);
});


test('failed ledger posting cannot complete offer sales or apply training gains', () => {
  assert.match(html, /if\(!p\|\|!financePost\([^;]*offer-sale/);
  assert.match(html, /if\(I\.c&&!financePost\([\s\S]*?return;/);
});

test('negotiated transfer fee and signing bonus are posted atomically before player mutation', () => {
  assert.match(html, /financeDraft=\{budget:G\.budget,financeHistory:/);
  assert.match(html, /if\(!bonusEntry\.ok\|\|bonusEntry\.duplicate\)return say/);
  assert.match(html, /G\.budget=financeDraft\.budget;G\.financeHistory=financeDraft\.financeHistory;G\.players=result\.players/);
});


test('player sale commits roster changes only after ledger income is recorded', () => {
  assert.match(html, /if\(!result\.ok\)return transferError\(result\);if\(!financePost\([^;]*transfer-sale[^;]*\)\)return say\([^;]*\);G\.players=result\.players/);
});


test('player purchase ledger posting precedes roster mutation', () => {
  assert.match(html, /if\(!financePost\([^;]*transfer-buy[^;]*\)\)return say\([^;]*\);G\.players=result\.players/);
});


test('match settlement posts all income and operating costs atomically', () => {
  assert.match(html, /function financePostBatch\(entries\)/);
  assert.match(html, /const settlement=\[\{eventId:financePrefix\+'match-gate'/);
  assert.match(html, /if\(financePostBatch\(settlement\)\)/);
  assert.match(html, /FM4FinanceLedger\.applyBatchToCareer\(G,entries,\{season:G\.season,round:G\.round\+1\}\)/);
  assert.match(html, /if\(!result\.ok\)\{console\.error\('FM4 finance batch:'/);
});

test('duplicate ledger replay cannot repeat non-financial side effects', () => {
  assert.match(html, /if\(!result\.ok\)\{console\.error\('FM4 finance ledger:'/);
  assert.match(html, /return !result\.duplicate\}\nfunction financePostRecorded\(eventId,category,description,amount\)/);
  assert.match(html, /function financePostRecorded\(eventId,category,description,amount\)[\s\S]*?return true\}\nfunction financePostBatch/);
});

test('cup and promotion rewards are not claimed before ledger confirmation', () => {
  assert.match(html, /if\(c\.s\+1>=3\)\{const inF=c\.pairs\[0\]\.includes\(U\);if\(ws\[0\]===U&&!financePost/);
  assert.match(html, /if\(up\.includes\(uc\)\)\{if\(financePost/);
});

test('finance reports break down categories for the selected period', () => {
  assert.match(html, /const reportHistory=history\.filter\(x=>selectedSeason==='all'\|\|x\.season===selectedSeason\)/);
  assert.match(html, /const categoryTotals=new Map\(\)/);
  assert.match(html, /📊 تحليل التصنيفات/);
  assert.match(html, /دخل '\+money\(v\.income\)/);
});

test('finance reports compare income, expenses and net movement across seasons', () => {
  assert.match(html, /const seasonReport=seasons\.slice\(\)\.sort\(\(a,b\)=>b-a\)\.map\(season=>FM4FinanceLedger\.summarize\(history,season\)\)/);
  assert.match(html, /📅 مقارنة المواسم/);
  assert.match(html, /الإيرادات '\+money\(x\.income\)/);
  assert.match(html, /المصروفات '\+money\(x\.expenses\)/);
  assert.match(html, /رصيد بداية الموسم/);
  assert.match(html, /رصيد نهاية الموسم/);
});


test('career changes use route-specific sequential transaction IDs and reject selecting the current club', () => {
  assert.match(html, /if\(cid===G\.uid\)return say\('أنت تعمل بالفعل مع هذا النادي\.'\)/);
  assert.match(html, /routePrefix='s'\+G\.season\+'\:career-change\:'\+G\.round\+'\:from\:'\+oldId\+'\:to\:'\+cid/);
  assert.match(html, /routeCount=\(G\.financeHistory\|\|\[\]\)\.filter\(x=>x&&typeof x\.id==='string'&&x\.id\.startsWith\(routePrefix\+'\:n'\)\)\.length/);
  assert.match(html, /financePost\(routePrefix\+'\:n'\+routeCount,'career-budget-adjustment'/);
});

test('finance dashboard identifies the largest income and expense categories', () => {
  assert.match(html, /const topIncome=categoryReport\.filter\(x=>x\[1\]\.income>0\)/);
  assert.match(html, /const topExpense=categoryReport\.filter\(x=>x\[1\]\.expenses>0\)/);
  assert.match(html, /أكبر مصدر دخل/);
  assert.match(html, /أكبر بند مصروف/);
});

test('finance screen loads the isolated planner and exposes a non-mutating decision simulation', () => {
  assert.match(html, /<script src="js\/management\/finance-planner\.js"><\/script>/);
  assert.match(html, /FM4FinancePlanner\.forecast\(\{budget:G\.budget,weeksRemaining/);
  assert.match(html, /function financeScenario\(\)/);
  assert.match(html, /محاكاة فقط: لم تتغير الميزانية أو المعاملات المسجلة/);
});

test('contracts page includes weekly training in operating commitment totals', () => {
  assert.match(html, /trainingWeekly=\(INT\[TR\(\)\.lv\]\|\|INT\[1\]\)\.c,weeklyCommitments=tot\+academyWeekly\+stadiumWeekly\+trainingWeekly/);
  assert.match(html, /التدريب \/ أسبوع/);
});

test('finance forecast keeps player wages, academy and stadium commitments separate', () => {
  assert.match(html, /weeklyAcademy=ACW\[AC\(\)\.lv\]\|\|0,weeklyStadium=SDU\[SD\(\)\.cap\]\|\|0,weeklyTraining=\(INT\[TR\(\)\.lv\]\|\|INT\[1\]\)\.c/);
  assert.match(html, /weeklyCommitments:\{wages:weeklyWages,academy:weeklyAcademy,stadium:weeklyStadium,other:weeklyTraining\}/);
  assert.match(html, /planning\.weeklyCommitments\.academy/);
  assert.match(html, /planning\.weeklyCommitments\.stadium/);
  assert.match(html, /planning\.weeklyCommitments\.other/);
  assert.match(html, /weeklyCommitments:\{wages:weekly,academy,stadium,other:training\}/);
});

test('cup advancement commits round logs only after the prize is confirmed and accepts an already-recorded prize', () => {
  assert.match(html, /function financePostRecorded\(eventId,category,description,amount\)/);
  assert.match(html, /if\(!result\.ok\)\{console\.error\('FM4 finance ledger:'/);
  assert.match(html, /function cupAdvance\(ur\)\{let c=G\.cup;if\(!c\|\|c\.done\)return;let U=G\.uid,ws=\[\],roundLogs=\[\]/);
  assert.match(html, /financePostRecorded\('s'\+G\.season\+':cup:champion'/);
  assert.match(html, /financePostRecorded\('s'\+G\.season\+':cup:runner-up'/);
  assert.match(html, /c\.lg\.push\(\.\.\.roundLogs\);c\.due=false;c\.s\+\+/);
});

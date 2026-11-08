'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

test('finance ledger loads before the game controller', () => {
  const ledger = html.indexOf('<script src="js/management/finance-ledger.js"></script>');
  const controller = html.indexOf('<script>\nconst KEY=');
  assert.ok(ledger >= 0 && controller > ledger);
});

test('new careers initialize finance history and old saves migrate safely', () => {
  assert.match(html, /negotiations:\[\],financeHistory:\[\]/);
  assert.match(html, /eventId:financePrefix\+'match-gate',category:'match-income',description:'مداخيل المباراة',amount:gate/);
  assert.match(html, /eventId:financePrefix\+'sponsor',category:'sponsor-income',description:'دخل عقد الرعاية',amount:spn/);
  assert.match(html, /eventId:financePrefix\+'weekly-costs',category:'operating-expense',description:'الأجور والأكاديمية وصيانة الاستاد',amount:-wages/);

test('league match settlement posts gate, sponsor and operating costs as separate entries', () => {
  assert.match(html, /financePrefix\+'match-gate','match-income','مداخيل المباراة',gate/);
  assert.match(html, /financePrefix\+'sponsor','sponsor-income','دخل عقد الرعاية',spn/);
  assert.match(html, /financePrefix\+'weekly-costs','operating-expense','الأجور والأكاديمية وصيانة الاستاد',-wages/);
  assert.doesNotMatch(html, /G\.budget\s*\+=\s*gate\s*\+\s*spn\s*-\s*wages/);
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
  assert.match(html, /:renewal:'\+p\.id\+':'.*'signing-bonus'/);
  assert.match(html, /:r'\+\(G\.round\+1\)\+':loan-out:'\+id,'loan-income'/);
  assert.match(html, /:r'\+\(G\.round\+1\)\+':loan-in:'\+id,'loan-expense'/);
  assert.match(html, /:r'\+\(G\.round\+1\)\+':offer-sale:'\+p\.id,'transfer-income'/);
});

test('player purchases, negotiated transfers and player sales are posted through the finance ledger', () => {
  assert.match(html, /:transfer-buy:'\+id,'transfer-expense'/);
  assert.match(html, /:negotiation:'\\+id\\+':fee',season:G\\.season,round:G\\.round\\+1,category:'transfer-expense'/);
  assert.match(html, /:negotiation:'\\+id\\+':bonus',season:G\\.season,round:G\\.round\\+1,category:'signing-bonus'/);
  assert.match(html, /:transfer-sale:'\+id,'transfer-income'/);
  assert.doesNotMatch(html, /G\.players=result\.players;G\.budget=result\.budget;let signed=/);
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
  assert.match(html, /if\\(I\\.c&&!financePost\\([\\s\\S]*?return;/);
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
  assert.match(html, /if\(!result\.ok\)\{console\.error\('FM4 finance batch:'/);
});

test('idempotent ledger replay is treated as a successful financial post', () => {
  assert.match(html, /if\(!result\.ok\)\{console\.error\('FM4 finance ledger:'/);
  assert.match(html, /return true\}\\nfunction financePostBatch/);
});

test('cup and promotion rewards are not claimed before ledger confirmation', () => {
  assert.match(html, /if\(c\.s\+1>=3\)\{const inF=c\.pairs\[0\]\.includes\(U\);if\(ws\[0\]===U&&!financePost/);
  assert.match(html, /if\(up\.includes\(uc\)\)\{if\(financePost/);
});
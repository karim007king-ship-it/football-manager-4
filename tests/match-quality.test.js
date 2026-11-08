'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createMatchFromGame}=require('../js/match/adapter');
const {simulateMatch}=require('../js/match/engine');

function legacyTeam(name){
 const pos=['GK','DEF','DEF','DEF','DEF','MID','MID','MID','MID','FWD','FWD'];
 return{name,mentality:'balanced',players:pos.map((p,i)=>({
  id:name+'-'+i,name:'P'+i,pos:p,ovr:65+(i%9),morale:70,inj:0
 }))};
}

test('100 seeded career-lineup matches preserve useful attacking and passing activity',()=>{
 const totals={goals:0,shots:0,onTarget:0,passes:0,completed:0,tackles:0};
 const possession=[0,0];
 let matchesWithAdvancedAttacks=0;
 const games=100;
 for(let seed=1;seed<=games;seed++){
  const s=simulateMatch(createMatchFromGame({
   home:legacyTeam('Home'),away:legacyTeam('Away'),seed
  }),90);
  assert.equal(s.minute,90);
  assert.equal(s.possession[0]+s.possession[1],90);
  assert.ok(s.events.every(e=>e.minute>=1&&e.minute<=90));
  for(let side=0;side<2;side++){
   possession[side]+=s.possession[side];
   totals.goals+=s.score[side];
   totals.shots+=s.shots[side];
   totals.onTarget+=s.shotsOnTarget[side];
   totals.passes+=s.passes[side];
   totals.completed+=s.completedPasses[side];
   totals.tackles+=s.tackles[side];
   assert.ok(s.shotsOnTarget[side]<=s.shots[side]);
   assert.ok(s.completedPasses[side]<=s.passes[side]);
   assert.ok(s.score[side]<=s.shots[side]);
  }
  const advanced=s.events.some(e=>
   (e.type==='carry'||e.type==='pass') &&
   (e.team===0?e.x>=68:e.x<=32)
  );
  if(advanced)matchesWithAdvancedAttacks++;
 }
 const avgGoals=totals.goals/games;
 const avgShots=totals.shots/games;
 const accuracy=100*totals.completed/Math.max(1,totals.passes);
 const avgTackles=totals.tackles/games;
 const homeShare=100*possession[0]/(possession[0]+possession[1]);
 assert.ok(avgGoals>=1.3&&avgGoals<=4.2,'career-lineup goals/match '+avgGoals.toFixed(2));
 assert.ok(avgShots>=11&&avgShots<=24,'career-lineup shots/match '+avgShots.toFixed(2));
 assert.ok(accuracy>=55&&accuracy<=85,'career-lineup pass accuracy '+accuracy.toFixed(1));
 assert.ok(avgTackles>=5&&avgTackles<=24,'career-lineup tackles/match '+avgTackles.toFixed(2));
 assert.ok(homeShare>=40&&homeShare<=60,'aggregate possession split '+homeShare.toFixed(1));
 assert.ok(matchesWithAdvancedAttacks>=65,'advanced attacks in '+matchesWithAdvancedAttacks+' of '+games+' matches');
 console.log('FM4 career-lineup quality audit:',JSON.stringify({
  matches:games,averageGoals:+avgGoals.toFixed(2),
  averageShots:+avgShots.toFixed(2),
  shotsOnTarget:+(totals.onTarget/games).toFixed(2),
  passAccuracy:+accuracy.toFixed(1),
  averageTackles:+avgTackles.toFixed(2),
  homePossession:+homeShare.toFixed(1),
  matchesWithAdvancedAttacks
 }));
});

test('career-lineup cup simulation remains valid through 120 minutes',()=>{
 const s=simulateMatch(createMatchFromGame({
  home:legacyTeam('Home'),away:legacyTeam('Away'),seed:12026
 }),120);
 assert.equal(s.minute,120);
 assert.equal(s.possession[0]+s.possession[1],120);
 assert.ok(s.events.every(e=>e.minute>=1&&e.minute<=120));
 assert.ok(s.shots.every(n=>Number.isFinite(n)&&n>=0));
 assert.ok(s.score.every(n=>Number.isFinite(n)&&n>=0));
 assert.ok(s.teams.every(t=>t.players.filter(p=>p.active).length===11));
});

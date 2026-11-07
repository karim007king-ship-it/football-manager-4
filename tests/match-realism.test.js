'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createMatch,stepMatch}=require('../js/match/engine');

function makeTeam(name,side){
 const roles=['GK','CB','CB','CB','CB','DM','CM','AM','LW','ST','RW'];
 const xs=side===0?[6,24,27,30,33,42,47,55,67,72,68]:[94,76,73,70,67,58,53,45,33,28,32];
 const ys=[50,18,39,61,82,50,34,64,12,50,88];
 return {name,mentality:'balanced',players:roles.map((role,i)=>({
  id:name+'-'+i,name:'P'+i,role,pace:66,passing:68,shooting:62,
  defending:61,stamina:100,x:xs[i],y:ys[i]
 }))};
}
function match(seed){
 return createMatch({teams:[makeTeam('Home',0),makeTeam('Away',1)],seed});
}

test('seed sweep: full-match statistics remain internally consistent',()=>{
 const totals={shots:0,onTarget:0,goals:0,passes:0,completed:0,tackles:0,events:0,penetrations:0};
 const possession=[0,0];
 for(let seed=1;seed<=100;seed++){
  const s=match(seed),initial=s.teams.map(t=>t.players.map(p=>({id:p.id,x:p.x,y:p.y})));
  for(let minute=0;minute<90;minute++){
   stepMatch(s);
   assert.equal(s.minute,minute+1);
   assert.ok(s.ball.x>=2&&s.ball.x<=98);
   assert.ok(s.ball.y>=2&&s.ball.y<=98);
  }
  assert.equal(s.possession[0]+s.possession[1],90);
  assert.ok(s.shotsOnTarget[0]<=s.shots[0]);
  assert.ok(s.shotsOnTarget[1]<=s.shots[1]);
  assert.ok(s.completedPasses[0]<=s.passes[0]);
  assert.ok(s.completedPasses[1]<=s.passes[1]);
  assert.ok(s.score[0]<=s.shots[0]);
  assert.ok(s.score[1]<=s.shots[1]);
  for(let side=0;side<2;side++){
   possession[side]+=s.possession[side];
   totals.shots+=s.shots[side];
   totals.onTarget+=s.shotsOnTarget[side];
   totals.goals+=s.score[side];
   totals.passes+=s.passes[side];
   totals.completed+=s.completedPasses[side];
   totals.tackles+=s.tackles[side];
  }
  totals.events+=s.events.length;
  const maxProgress=Math.max(
   ...s.events.filter(e=>e.type==='carry'||e.type==='pass').map(e=>e.team===0?e.x:100-e.x),
   0
  );
  if(maxProgress>=70)totals.penetrations++;
  for(let side=0;side<2;side++){
   const moved=s.teams[side].players.filter((p,i)=>{
    const before=initial[side][i];
    return Math.abs(p.x-before.x)>.01||Math.abs(p.y-before.y)>.01;
   }).length;
   assert.ok(moved>=7,'team '+side+' should move as a unit, not only its carrier');
  }
 }
 assert.ok(Math.abs(possession[0]+possession[1]-9000)<1e-6,'aggregate possession should equal 100 full matches');
 assert.ok(totals.passes>0,'seed sweep should produce passing events');
 assert.ok(totals.shots>0,'seed sweep should produce attempts');
 assert.ok(totals.tackles>=50,'defensive pressure should produce a meaningful number of tackles across 100 matches');
 assert.ok(totals.events>1000,'simulation should produce a varied event stream');
 assert.ok(totals.penetrations>0,'attacks should reach advanced areas');
 assert.ok(totals.completed<=totals.passes);
 assert.ok(totals.onTarget<=totals.shots);
 const avgShots=totals.shots/100,avgPasses=totals.passes/100;
 const passRate=totals.passes?totals.completed/totals.passes*100:0;
 const avgTackles=totals.tackles/100,avgGoals=totals.goals/100;
 assert.ok(avgShots>=7&&avgShots<=22,'shot volume should remain in a plausible range; average='+avgShots.toFixed(2));
 assert.ok(avgPasses>=60&&avgPasses<=220,'passing volume should remain in a plausible range');
 assert.ok(passRate>=55&&passRate<=85,'pass completion should remain plausible');
 assert.ok(avgTackles>=8&&avgTackles<=20,'tackle volume should remain in a plausible range');
 assert.ok(avgGoals>=1.2&&avgGoals<=4,'goal volume should remain in a plausible range for this lower-rated direct-engine fixture; average='+avgGoals.toFixed(2));
 console.log('FM4 100-seed diagnostics:',JSON.stringify({
  matches:100,averagePossession:possession.map(v=>+(v/90).toFixed(1)),
  averageShotsPerMatch:+avgShots.toFixed(2),
  averagePassesPerMatch:+avgPasses.toFixed(2),
  passCompletion:+passRate.toFixed(1),
  averageTacklesPerMatch:+avgTackles.toFixed(2),
  averageGoalsPerMatch:+avgGoals.toFixed(2),
  matchesWithAdvancedAttacks:totals.penetrations
 }));
});

test('seeded simulations reproduce the same complete statistics',()=>{
 const a=match(20261106),b=match(20261106);
 for(let i=0;i<90;i++){stepMatch(a);stepMatch(b);}
 assert.deepEqual(
  {score:a.score,possession:a.possession,shots:a.shots,passes:a.passes,events:a.events},
  {score:b.score,possession:b.possession,shots:b.shots,passes:b.passes,events:b.events}
 );
});

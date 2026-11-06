'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const Engine=require('../js/match/engine');
const {substitutePlayer}=require('../js/match/substitutions');

const ROLES=['GK','CB','CB','CB','CB','DM','CM','AM','LW','ST','RW'];
const X=[6,24,27,30,33,42,47,55,67,72,68];
const Y=[50,18,39,61,82,50,34,64,12,50,88];

function makeTeam(name,side){
 const dir=side===0?1:-1;
 const players=ROLES.map((role,i)=>({
  id:name+'-'+i,name:name+' '+i,role,pace:66,passing:68,shooting:62,
  defending:61,stamina:i===6&&side===0?25:100,
  x:X[i],y:Y[i],active:true
 }));
 if(side===0)players.push({
  id:'Home-fresh-mid',name:'Fresh Midfielder',role:'CM',pace:66,
  passing:68,shooting:62,defending:61,stamina:100,
  x:47,y:34,active:false
 });
 return {name,mentality:'balanced',adaptiveTactics:false,players};
}
function makeMatch(seed){
 return Engine.createMatch({teams:[makeTeam('Home',0),makeTeam('Away',1)],seed});
}
function delta(after,before,key,index=0){return after[key][index]-before[key][index];}
function totals(){
 return {matches:0,baseShots:0,subShots:0,basePasses:0,subPasses:0,
  baseCompleted:0,subCompleted:0,baseTackles:0,subTackles:0,
  baseGoals:0,subGoals:0,baseCompletion:0,subCompletion:0,
  incomingFinalStamina:0,outgoingFinalStamina:0,baseMidDistance:0,subMidDistance:0};
}

test('200-seed substitution audit: tired starter versus fresh substitute from minute 65',()=>{
 const a=totals();
 for(let seed=1;seed<=200;seed++){
  const baseline=makeMatch(seed),withSub=makeMatch(seed);
  Engine.simulateMatch(baseline,65);
  Engine.simulateMatch(withSub,65);
  const before={shots:[...withSub.shots],passes:[...withSub.passes],
   completedPasses:[...withSub.completedPasses],tackles:[...withSub.tackles],
   score:[...withSub.score]};
  const out=withSub.teams[0].players.find(p=>p.id==='Home-6');
  const incoming=withSub.teams[0].players.find(p=>p.id==='Home-fresh-mid');
  const tiredBefore=out.stamina;
  const record=substitutePlayer(withSub,0,'Home-6','Home-fresh-mid');
  assert.equal(record.minute,65);
  assert.equal(out.active,false);
  assert.equal(incoming.active,true);
  assert.equal(incoming.stamina,100);
  for(let minute=0;minute<25;minute++){
   const bx=baseline.teams[0].players.find(p=>p.id==='Home-6');
   const sx=withSub.teams[0].players.find(p=>p.id==='Home-fresh-mid');
   const b0={x:bx.x,y:bx.y},s0={x:sx.x,y:sx.y};
   Engine.stepMatch(baseline);
   Engine.stepMatch(withSub);
   a.baseMidDistance+=Math.hypot(bx.x-b0.x,bx.y-b0.y);
   a.subMidDistance+=Math.hypot(sx.x-s0.x,sx.y-s0.y);
  }
  assert.equal(out.stamina,tiredBefore,'inactive outgoing player must not keep losing stamina');
  assert.ok(incoming.stamina<100,'the substitute must accumulate fatigue after entering');
  a.matches++;
  a.baseShots+=delta(baseline,before,'shots',0);
  a.subShots+=delta(withSub,before,'shots',0);
  a.basePasses+=delta(baseline,before,'passes',0);
  a.subPasses+=delta(withSub,before,'passes',0);
  a.baseCompleted+=delta(baseline,before,'completedPasses',0);
  a.subCompleted+=delta(withSub,before,'completedPasses',0);
  a.baseTackles+=delta(baseline,before,'tackles',0);
  a.subTackles+=delta(withSub,before,'tackles',0);
  a.baseGoals+=delta(baseline,before,'score',0);
  a.subGoals+=delta(withSub,before,'score',0);
  a.incomingFinalStamina+=incoming.stamina;
  a.outgoingFinalStamina+=out.stamina;
 }
 const report={
  matches:a.matches,period:'65–90 minutes',scenario:'CM starter begins at 25 stamina; fresh CM substitute enters at 65',
  noSubstitution:{shots:+(a.baseShots/a.matches).toFixed(2),passes:+(a.basePasses/a.matches).toFixed(2),
   completedPasses:+(a.baseCompleted/a.matches).toFixed(2),
   completionRate:+(100*a.baseCompleted/Math.max(1,a.basePasses)).toFixed(1),
   tackles:+(a.baseTackles/a.matches).toFixed(2),goals:+(a.baseGoals/a.matches).toFixed(2)},
  freshSubstitution:{shots:+(a.subShots/a.matches).toFixed(2),passes:+(a.subPasses/a.matches).toFixed(2),
   completedPasses:+(a.subCompleted/a.matches).toFixed(2),
   completionRate:+(100*a.subCompleted/Math.max(1,a.subPasses)).toFixed(1),
   tackles:+(a.subTackles/a.matches).toFixed(2),goals:+(a.subGoals/a.matches).toFixed(2)},
  averageStaminaAtEnd:{outgoingInactive:+(a.outgoingFinalStamina/a.matches).toFixed(1),
   incomingActive:+(a.incomingFinalStamina/a.matches).toFixed(1)},
  trackedMidfielderMovement:{tiredStarter:+(a.baseMidDistance/a.matches).toFixed(2),freshSubstitute:+(a.subMidDistance/a.matches).toFixed(2)}
 };
 console.log('FM4 substitution impact audit:',JSON.stringify(report));
 assert.ok(a.matches===200);
 assert.ok(a.incomingFinalStamina/a.matches>a.outgoingFinalStamina/a.matches,
  'fresh substitute should retain more stamina than the tired inactive starter');
 assert.ok(a.baseShots!==a.subShots||a.basePasses!==a.subPasses||
  a.baseCompleted!==a.subCompleted||a.baseTackles!==a.subTackles,
  'the substitution scenario should measurably affect match simulation');
});

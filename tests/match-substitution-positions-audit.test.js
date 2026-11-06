'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const Engine=require('../js/match/engine');
const {substitutePlayer}=require('../js/match/substitutions');

const roles=['GK','CB','CB','CB','CB','DM','CM','AM','LW','ST','RW'];
const xs=[6,24,27,30,33,42,47,55,67,72,68];
const ys=[50,18,39,61,82,50,34,64,12,50,88];
const scenarios=[
 {label:'midfielder',index:6,role:'CM'},
 {label:'winger',index:8,role:'LW'},
 {label:'striker',index:9,role:'ST'}
];
function team(side,index){
 const players=roles.map((role,i)=>({
  id:(side?'Away':'Home')+'-'+i,name:'Player '+i,role,
  pace:66,passing:68,shooting:62,defending:61,
  stamina:!side&&i===index?25:100,x:xs[i],y:ys[i],active:true
 }));
 if(!side)players.push({
  id:'Home-fresh',name:'Fresh substitute',role:scenarios.find(s=>s.index===index).role,
  pace:66,passing:68,shooting:62,defending:61,stamina:100,
  x:xs[index],y:ys[index],active:false
 });
 return {name:side?'Away':'Home',mentality:'balanced',adaptiveTactics:false,players};
}
function match(seed,index){return Engine.createMatch({teams:[team(0,index),team(1,index)],seed});}
function playerInvolvement(events,id){
 const own=events.filter(e=>e.playerId===id||e.from===id||e.to===id);
 return {
  involvements:own.length,
  carries:own.filter(e=>e.type==='carry'&&e.playerId===id).length,
  shots:own.filter(e=>['shot','save','goal'].includes(e.type)&&e.playerId===id).length,
  completedPasses:own.filter(e=>e.type==='pass'&&e.from===id).length,
  tackles:own.filter(e=>e.type==='tackle'&&e.playerId===id).length
 };
}
function measure(index){
 const a={matches:0,baseShots:0,subShots:0,basePasses:0,subPasses:0,baseInvolvements:0,subInvolvements:0,baseCarries:0,subCarries:0,basePlayerShots:0,subPlayerShots:0,basePlayerPasses:0,subPlayerPasses:0,basePlayerTackles:0,subPlayerTackles:0,
  baseCompleted:0,subCompleted:0,baseTackles:0,subTackles:0,
  baseGoals:0,subGoals:0,baseMove:0,subMove:0,baseEndFitness:0,subEndFitness:0,
  basePoints:0,subPoints:0,baseGoalDiff:0,subGoalDiff:0,
  baseResults:{win:0,draw:0,loss:0},subResults:{win:0,draw:0,loss:0}};
 for(let seed=1;seed<=1000;seed++){
  const baseline=match(seed,index),changed=match(seed,index);
  Engine.simulateMatch(baseline,65);Engine.simulateMatch(changed,65);
  const baseBefore={shots:baseline.shots[0],passes:baseline.passes[0],completed:baseline.completedPasses[0],tackles:baseline.tackles[0],goals:baseline.score[0]};
  const before={shots:changed.shots[0],passes:changed.passes[0],
   completed:changed.completedPasses[0],tackles:changed.tackles[0],goals:changed.score[0]};
  const outgoing=changed.teams[0].players[index];
  const incoming=changed.teams[0].players.find(p=>p.id==='Home-fresh');
  const initialStamina=outgoing.stamina;
  const baseEventStart=baseline.events.length,subEventStart=changed.events.length;
  substitutePlayer(changed,0,outgoing.id,incoming.id);
  for(let minute=0;minute<25;minute++){
   const old=baseline.teams[0].players[index],fresh=changed.teams[0].players.find(p=>p.id==='Home-fresh');
   const ox=old.x,oy=old.y,nx=fresh.x,ny=fresh.y;
   Engine.stepMatch(baseline);Engine.stepMatch(changed);
   a.baseMove+=Math.hypot(old.x-ox,old.y-oy);
   a.subMove+=Math.hypot(fresh.x-nx,fresh.y-ny);
  }
  const baseActions=playerInvolvement(baseline.events.slice(baseEventStart),outgoing.id);
  const subActions=playerInvolvement(changed.events.slice(subEventStart),incoming.id);
  a.baseInvolvements+=baseActions.involvements;a.subInvolvements+=subActions.involvements;
  a.baseCarries+=baseActions.carries;a.subCarries+=subActions.carries;
  a.basePlayerShots+=baseActions.shots;a.subPlayerShots+=subActions.shots;
  a.basePlayerPasses+=baseActions.completedPasses;a.subPlayerPasses+=subActions.completedPasses;
  a.basePlayerTackles+=baseActions.tackles;a.subPlayerTackles+=subActions.tackles;
  assert.equal(outgoing.active,false);assert.equal(incoming.active,true);
  assert.equal(outgoing.stamina,initialStamina);
  assert.ok(incoming.stamina<100);
  const baseDiff=baseline.score[0]-baseline.score[1],subDiff=changed.score[0]-changed.score[1];
  const baseResult=baseDiff>0?'win':baseDiff<0?'loss':'draw';
  const subResult=subDiff>0?'win':subDiff<0?'loss':'draw';
  a.baseResults[baseResult]++;a.subResults[subResult]++;
  a.basePoints+=baseResult==='win'?3:baseResult==='draw'?1:0;
  a.subPoints+=subResult==='win'?3:subResult==='draw'?1:0;
  a.baseGoalDiff+=baseDiff;a.subGoalDiff+=subDiff;
  a.matches++;
  a.baseShots+=baseline.shots[0]-baseBefore.shots; a.subShots+=changed.shots[0]-before.shots;
  a.basePasses+=baseline.passes[0]-baseBefore.passes; a.subPasses+=changed.passes[0]-before.passes;
  a.baseCompleted+=baseline.completedPasses[0]-baseBefore.completed;a.subCompleted+=changed.completedPasses[0]-before.completed;
  a.baseTackles+=baseline.tackles[0]-baseBefore.tackles;a.subTackles+=changed.tackles[0]-before.tackles;
  a.baseGoals+=baseline.score[0]-baseBefore.goals;a.subGoals+=changed.score[0]-before.goals;
  a.baseEndFitness+=outgoing.stamina;a.subEndFitness+=incoming.stamina;
 }
 return {
  matches:a.matches,
  withoutSubstitution:{shots:+(a.baseShots/a.matches).toFixed(2),passes:+(a.basePasses/a.matches).toFixed(2),
   completedPasses:+(a.baseCompleted/a.matches).toFixed(2),tackles:+(a.baseTackles/a.matches).toFixed(2),
   goals:+(a.baseGoals/a.matches).toFixed(2),playerMovement:+(a.baseMove/a.matches).toFixed(2)},
  withFreshSubstitution:{shots:+(a.subShots/a.matches).toFixed(2),passes:+(a.subPasses/a.matches).toFixed(2),
   completedPasses:+(a.subCompleted/a.matches).toFixed(2),tackles:+(a.subTackles/a.matches).toFixed(2),
   goals:+(a.subGoals/a.matches).toFixed(2),playerMovement:+(a.subMove/a.matches).toFixed(2)},
  trackedPlayerActions:{involvements:{withoutSubstitution:+(a.baseInvolvements/a.matches).toFixed(2),withFreshSubstitution:+(a.subInvolvements/a.matches).toFixed(2)},carries:{withoutSubstitution:+(a.baseCarries/a.matches).toFixed(2),withFreshSubstitution:+(a.subCarries/a.matches).toFixed(2)},shots:{withoutSubstitution:+(a.basePlayerShots/a.matches).toFixed(2),withFreshSubstitution:+(a.subPlayerShots/a.matches).toFixed(2)},completedPasses:{withoutSubstitution:+(a.basePlayerPasses/a.matches).toFixed(2),withFreshSubstitution:+(a.subPlayerPasses/a.matches).toFixed(2)},tackles:{withoutSubstitution:+(a.basePlayerTackles/a.matches).toFixed(2),withFreshSubstitution:+(a.subPlayerTackles/a.matches).toFixed(2)}},
  endStamina:{tiredStarter:+(a.baseEndFitness/a.matches).toFixed(1),
   freshSubstitute:+(a.subEndFitness/a.matches).toFixed(1)},
  matchOutcomes:{withoutSubstitution:a.baseResults,withFreshSubstitution:a.subResults},
  averagePoints:{withoutSubstitution:+(a.basePoints/a.matches).toFixed(3),
   withFreshSubstitution:+(a.subPoints/a.matches).toFixed(3)},
  averageGoalDifference:{withoutSubstitution:+(a.baseGoalDiff/a.matches).toFixed(3),
   withFreshSubstitution:+(a.subGoalDiff/a.matches).toFixed(3)}
 };
}
test('3000 seeded matches compare fresh substitutions by position and match outcomes at minute 65',()=>{
 const report={};
 for(const s of scenarios)report[s.label]=measure(s.index);
 console.log('FM4 position substitution audit:',JSON.stringify(report));
 for(const s of scenarios){
  assert.equal(report[s.label].matches,1000);
  assert.ok(report[s.label].endStamina.freshSubstitute>report[s.label].endStamina.tiredStarter);
 }
});

function auditStrikerTiming(minute){
 const a={matches:0,basePoints:0,subPoints:0,baseGoals:0,subGoals:0,
  baseResults:{win:0,draw:0,loss:0},subResults:{win:0,draw:0,loss:0},
  outgoingStamina:0,incomingStamina:0};
 for(let seed=1;seed<=500;seed++){
  const baseline=match(seed,9),changed=match(seed,9);
  Engine.simulateMatch(baseline,minute);Engine.simulateMatch(changed,minute);
  const outgoing=changed.teams[0].players[9];
  const incoming=changed.teams[0].players.find(p=>p.id==='Home-fresh');
  substitutePlayer(changed,0,outgoing.id,incoming.id);
  Engine.simulateMatch(baseline,90-minute);Engine.simulateMatch(changed,90-minute);
  const bd=baseline.score[0]-baseline.score[1],sd=changed.score[0]-changed.score[1];
  const br=bd>0?'win':bd<0?'loss':'draw',sr=sd>0?'win':sd<0?'loss':'draw';
  a.baseResults[br]++;a.subResults[sr]++;
  a.basePoints+=br==='win'?3:br==='draw'?1:0;
  a.subPoints+=sr==='win'?3:sr==='draw'?1:0;
  a.baseGoals+=baseline.score[0];a.subGoals+=changed.score[0];
  a.outgoingStamina+=outgoing.stamina;a.incomingStamina+=incoming.stamina;
  a.matches++;
  assert.equal(outgoing.active,false);assert.equal(incoming.active,true);
 }
 return {minute,matches:a.matches,
  results:{withoutSubstitution:a.baseResults,withFreshStriker:a.subResults},
  averagePoints:{withoutSubstitution:+(a.basePoints/a.matches).toFixed(3),withFreshStriker:+(a.subPoints/a.matches).toFixed(3)},
  homeGoals:{withoutSubstitution:+(a.baseGoals/a.matches).toFixed(3),withFreshStriker:+(a.subGoals/a.matches).toFixed(3)},
  staminaAtFullTime:{outgoing:+(a.outgoingStamina/a.matches).toFixed(1),incoming:+(a.incomingStamina/a.matches).toFixed(1)}};
}
test('1500 seeded matches audit striker substitution timing at minutes 55, 65 and 75',()=>{
 const report=[55,65,75].map(auditStrikerTiming);
 console.log('FM4 striker substitution timing audit:',JSON.stringify(report));
 for(const row of report)assert.equal(row.matches,500);
});

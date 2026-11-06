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
function measure(index){
 const a={matches:0,baseShots:0,subShots:0,basePasses:0,subPasses:0,
  baseCompleted:0,subCompleted:0,baseTackles:0,subTackles:0,
  baseGoals:0,subGoals:0,baseMove:0,subMove:0,baseEndFitness:0,subEndFitness:0};
 for(let seed=1;seed<=200;seed++){
  const baseline=match(seed,index),changed=match(seed,index);
  Engine.simulateMatch(baseline,65);Engine.simulateMatch(changed,65);
  const before={shots:changed.shots[0],passes:changed.passes[0],
   completed:changed.completedPasses[0],tackles:changed.tackles[0],goals:changed.score[0]};
  const outgoing=changed.teams[0].players[index];
  const incoming=changed.teams[0].players.find(p=>p.id==='Home-fresh');
  const initialStamina=outgoing.stamina;
  substitutePlayer(changed,0,outgoing.id,incoming.id);
  for(let minute=0;minute<25;minute++){
   const old=baseline.teams[0].players[index],fresh=changed.teams[0].players.find(p=>p.id==='Home-fresh');
   const ox=old.x,oy=old.y,nx=fresh.x,ny=fresh.y;
   Engine.stepMatch(baseline);Engine.stepMatch(changed);
   a.baseMove+=Math.hypot(old.x-ox,old.y-oy);
   a.subMove+=Math.hypot(fresh.x-nx,fresh.y-ny);
  }
  assert.equal(outgoing.active,false);assert.equal(incoming.active,true);
  assert.equal(outgoing.stamina,initialStamina);
  assert.ok(incoming.stamina<100);
  a.matches++;
  a.baseShots+=baseline.shots[0]-0; a.subShots+=changed.shots[0]-before.shots;
  a.basePasses+=baseline.passes[0]; a.subPasses+=changed.passes[0]-before.passes;
  a.baseCompleted+=baseline.completedPasses[0];a.subCompleted+=changed.completedPasses[0]-before.completed;
  a.baseTackles+=baseline.tackles[0];a.subTackles+=changed.tackles[0]-before.tackles;
  a.baseGoals+=baseline.score[0];a.subGoals+=changed.score[0]-before.goals;
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
  endStamina:{tiredStarter:+(a.baseEndFitness/a.matches).toFixed(1),
   freshSubstitute:+(a.subEndFitness/a.matches).toFixed(1)}
 };
}
test('600 seeded matches compare fresh substitutions by position at minute 65',()=>{
 const report={};
 for(const s of scenarios)report[s.label]=measure(s.index);
 console.log('FM4 position substitution audit:',JSON.stringify(report));
 for(const s of scenarios){
  assert.equal(report[s.label].matches,200);
  assert.ok(report[s.label].endStamina.freshSubstitute>report[s.label].endStamina.tiredStarter);
 }
});

'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const Engine=require('../js/match/engine');
const {substitutePlayer}=require('../js/match/substitutions');

const roles=['GK','CB','CB','CB','CB','DM','CM','AM','LW','ST','RW'];
const xs=[6,24,27,30,33,42,47,55,67,72,68];
const ys=[50,18,39,61,82,50,34,64,12,50,88];

function squad(side){
 const players=roles.map((role,i)=>({
  id:(side?'Away':'Home')+'-'+i,name:'Player '+i,role,
  pace:66,passing:68,shooting:62,defending:61,
  stamina:!side&&i===9?25:100,x:xs[i],y:ys[i],active:true
 }));
 if(!side)players.push({
  id:'Home-candidate',name:'Candidate striker',role:'ST',
  pace:60,passing:60,shooting:60,defending:60,
  stamina:100,x:xs[9],y:ys[9],active:false
 });
 return {name:side?'Away':'Home',mentality:'balanced',adaptiveTactics:false,players};
}
function match(seed,quality){
 const s=Engine.createMatch({teams:[squad(0),squad(1)],seed});
 const p=s.teams[0].players.find(x=>x.id==='Home-candidate');
 if(quality!==null){
  p.pace=quality.pace;p.passing=quality.passing;
  p.shooting=quality.shooting;p.defending=quality.defending;
 }
 return s;
}
function result(diff){return diff>0?'win':diff<0?'loss':'draw';}
const candidates=[
 {label:'low',pace:50,passing:50,shooting:50,defending:50},
 {label:'average',pace:65,passing:65,shooting:65,defending:65},
 {label:'high',pace:80,passing:80,shooting:80,defending:80}
];

test('1800 seeded matches audit striker substitute quality at minute 55',()=>{
 const report={};
 const totals={};
 for(const c of candidates)totals[c.label]={matches:0,points:0,wins:0,draws:0,losses:0,homeGoals:0,homeShots:0,substituteStamina:0};
 const baseline={matches:0,points:0,wins:0,draws:0,losses:0,homeGoals:0,homeShots:0};
 for(let seed=1;seed<=600;seed++){
  const base=match(seed,null);
  Engine.simulateMatch(base,90);
  const bd=base.score[0]-base.score[1],br=result(bd);
  baseline.matches++;baseline.points+=br==='win'?3:br==='draw'?1:0;
  baseline[br==='win'?'wins':br==='draw'?'draws':'losses']++;
  baseline.homeGoals+=base.score[0];baseline.homeShots+=base.shots[0];
  for(const c of candidates){
   const changed=match(seed,c);
   Engine.simulateMatch(changed,55);
   const out=changed.teams[0].players[9];
   const incoming=changed.teams[0].players.find(p=>p.id==='Home-candidate');
   substitutePlayer(changed,0,out.id,incoming.id);
   Engine.simulateMatch(changed,35);
   assert.equal(out.active,false);assert.equal(incoming.active,true);
   const d=changed.score[0]-changed.score[1],r=result(d),a=totals[c.label];
   a.matches++;a.points+=r==='win'?3:r==='draw'?1:0;
   a[r==='win'?'wins':r==='draw'?'draws':'losses']++;
   a.homeGoals+=changed.score[0];a.homeShots+=changed.shots[0];
   a.substituteStamina+=incoming.stamina;
  }
 }
 const summarize=a=>({
  matches:a.matches,
  results:{win:a.wins,draw:a.draws,loss:a.losses},
  averagePoints:+(a.points/a.matches).toFixed(3),
  homeGoals:+(a.homeGoals/a.matches).toFixed(3),
  homeShots:+(a.homeShots/a.matches).toFixed(3)
 });
 report.baseline=summarize(baseline);
 for(const c of candidates){
  report[c.label]={...summarize(totals[c.label]),
   substituteStaminaAtFullTime:+(totals[c.label].substituteStamina/totals[c.label].matches).toFixed(1)};
 }
 console.log('FM4 striker substitute quality audit:',JSON.stringify(report));
 assert.equal(baseline.matches,600);
 for(const c of candidates){
  assert.equal(totals[c.label].matches,600);
  assert.ok(totals[c.label].substituteStamina>0);
 }
});

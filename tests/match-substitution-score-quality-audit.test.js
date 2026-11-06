'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const Engine=require('../js/match/engine');
const {substitutePlayer}=require('../js/match/substitutions');

const roles=['GK','CB','CB','CB','CB','DM','CM','AM','LW','ST','RW'];
const xs=[6,24,27,30,33,42,47,55,67,72,68];
const ys=[50,18,39,61,82,50,34,64,12,50,88];
const qualities={
 weak:{pace:50,passing:50,shooting:50,defending:50},
 average:{pace:65,passing:65,shooting:65,defending:65},
 strong:{pace:80,passing:80,shooting:80,defending:80}
};
function team(side,quality){
 const players=roles.map((role,i)=>({
  id:(side?'Away':'Home')+'-'+i,name:'Player '+i,role,
  pace:66,passing:68,shooting:62,defending:61,
  stamina:!side&&i===9?25:100,x:side?100-xs[i]:xs[i],y:ys[i],active:true
 }));
 if(!side)players.push({
  id:'Home-sub-'+quality,name:quality+' striker substitute',role:'ST',
  ...qualities[quality],stamina:100,x:xs[9],y:ys[9],active:false
 });
 return {name:side?'Away':'Home',mentality:'balanced',adaptiveTactics:true,players};
}
function match(seed,quality='strong'){
 return Engine.createMatch({teams:[team(0,quality),team(1,quality)],seed});
}
function points(score){const d=score[0]-score[1];return d>0?3:d===0?1:0;}
function outcome(score){const d=score[0]-score[1];return d>0?'wins':d===0?'draws':'losses';}
function add(target,state){
 target.points+=points(state.score);
 target[outcome(state.score)]++;
 target.goals+=state.score[0];
 target.awayGoals+=state.score[1];
 target.shots+=state.shots[0];
 target.awayShots+=state.shots[1];
}
function summarize(x,n){return {wins:x.wins,draws:x.draws,losses:x.losses,averagePoints:+(x.points/n).toFixed(3),homeGoals:+(x.goals/n).toFixed(3),awayGoals:+(x.awayGoals/n).toFixed(3),homeShots:+(x.shots/n).toFixed(3),awayShots:+(x.awayShots/n).toFixed(3)};}

test('2700 paired seeded matches compare substitute quality with mirrored home and away formations',()=>{
 const perSituation=300,maxSeeds=20000;
 const report={};
 for(const situation of ['leading','drawing','trailing']){
  const totals={baseline:{points:0,wins:0,draws:0,losses:0,goals:0,awayGoals:0,shots:0,awayShots:0}};
  for(const quality of Object.keys(qualities))totals[quality]={points:0,wins:0,draws:0,losses:0,goals:0,shots:0};
  let matches=0,firstSeed=null,lastSeed=null;
  for(let seed=1;seed<=maxSeeds&&matches<perSituation;seed++){
   const base=match(seed);
   Engine.simulateMatch(base,55);
   const diff=base.score[0]-base.score[1];
   const fits=situation==='leading'?diff>0:situation==='trailing'?diff<0:diff===0;
   if(!fits)continue;
   const states={baseline:base};
   for(const quality of Object.keys(qualities)){
    const state=match(seed,quality);
    Engine.simulateMatch(state,55);
    assert.deepEqual(state.score,base.score);
    assert.deepEqual(state.shots,base.shots);
    const out=state.teams[0].players.find(p=>p.id==='Home-9');
    const incoming=state.teams[0].players.find(p=>p.id==='Home-sub-'+quality);
    substitutePlayer(state,0,out.id,incoming.id);
    assert.equal(out.active,false);
    assert.equal(incoming.active,true);
    states[quality]=state;
   }
   for(const state of Object.values(states))Engine.simulateMatch(state,35);
   for(const [key,state] of Object.entries(states))add(totals[key],state);
   matches++;
   if(firstSeed===null)firstSeed=seed;
   lastSeed=seed;
  }
  assert.equal(matches,perSituation,'Insufficient seed cohort for '+situation);
  report[situation]={matches,seedRange:[firstSeed,lastSeed]};
  for(const key of Object.keys(totals))report[situation][key]=summarize(totals[key],matches);
 }
 console.log('FM4 score-situation substitute-quality audit:',JSON.stringify(report));
 for(const row of Object.values(report))assert.equal(row.matches,perSituation);
});

'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createMatch,simulateMatch}=require('../js/match/engine');

const ROLES=['GK','CB','CB','CB','CB','DM','CM','AM','LW','ST','RW'];
function squad(name,side,{stamina=100,sentOffId=null}={}){
 const xs=side===0?[6,24,27,30,33,42,47,55,67,72,68]:[94,76,73,70,67,58,53,45,33,28,32];
 return {name,mentality:'balanced',adaptiveTactics:false,players:ROLES.map((role,i)=>({
  id:name+'-'+i,name:name+' '+i,role,pace:66,passing:68,shooting:62,
  defending:61,stamina,active:name+'-'+i!==sentOffId,x:xs[i],y:[50,18,39,61,82,50,34,64,12,50,88][i]
 }))};
}
function run(seed,{homeStamina=100,awayStamina=100,homeSentOff=null,awaySentOff=null}={}){
 return simulateMatch(createMatch({teams:[
  squad('Home',0,{stamina:homeStamina,sentOffId:homeSentOff}),
  squad('Away',1,{stamina:awayStamina,sentOffId:awaySentOff})
 ],seed}),90);
}
function collect(target,s){
 target.goals+=s.score[0]+s.score[1];
 target.shots+=s.shots[0]+s.shots[1];
 target.homeGoals+=s.score[0];target.awayGoals+=s.score[1];
 target.homeShots+=s.shots[0];target.awayShots+=s.shots[1];
 target.homePossession+=s.possession[0];
 target.homeTackles+=s.tackles[0];target.awayTackles+=s.tackles[1];
}

test('fatigue and dismissal audit: measure current effects without changing match balance',()=>{
 const fresh={goals:0,shots:0,homeGoals:0,awayGoals:0,homeShots:0,awayShots:0,homePossession:0,homeTackles:0,awayTackles:0};
 const exhausted={...fresh},eleven={...fresh},ten={...fresh};
 for(let seed=1;seed<=200;seed++){
  collect(fresh,run(seed,{homeStamina:100,awayStamina:100}));
  collect(exhausted,run(seed,{homeStamina:15,awayStamina:15}));
  collect(eleven,run(seed));
  collect(ten,run(seed,{awaySentOff:'Away-5'}));
 }
 const sameStaminaOutput=JSON.stringify(fresh)===JSON.stringify(exhausted);
 const report={
  matchesPerScenario:200,
  stamina100:{averageGoals:+(fresh.goals/200).toFixed(2),averageShots:+(fresh.shots/200).toFixed(2),homePossession:+(100*fresh.homePossession/(200*90)).toFixed(1)},
  stamina15:{averageGoals:+(exhausted.goals/200).toFixed(2),averageShots:+(exhausted.shots/200).toFixed(2),homePossession:+(100*exhausted.homePossession/(200*90)).toFixed(1)},
  identicalAggregateOutputAtDifferentStartingStamina:sameStaminaOutput,
  elevenVsTen:{
   eleven:{averageGoals:+(eleven.goals/200).toFixed(2),homeGoals:+(eleven.homeGoals/200).toFixed(2),awayGoals:+(eleven.awayGoals/200).toFixed(2),homeShots:+(eleven.homeShots/200).toFixed(2),awayShots:+(eleven.awayShots/200).toFixed(2)},
   ten:{averageGoals:+(ten.goals/200).toFixed(2),homeGoals:+(ten.homeGoals/200).toFixed(2),awayGoals:+(ten.awayGoals/200).toFixed(2),homeShots:+(ten.homeShots/200).toFixed(2),awayShots:+(ten.awayShots/200).toFixed(2),shortSideShotChange:+((ten.awayShots-eleven.awayShots)/200).toFixed(2)}
  }
 };
 console.log('FM4 fatigue/dismissal audit:',JSON.stringify(report));
 assert.notEqual(fresh.goals,exhausted.goals,'low starting stamina must change match goal output');
 assert.notEqual(fresh.shots,exhausted.shots,'low starting stamina must change match shot output');
 assert.ok(ten.homeShots>eleven.homeShots,'the team facing ten players should create more shots');
 assert.ok(ten.awayShots<eleven.awayShots,'the team with ten players should create fewer shots: eleven='+eleven.awayShots+', ten='+ten.awayShots);
});

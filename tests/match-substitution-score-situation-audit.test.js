'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const Engine=require('../js/match/engine');
const {substitutePlayer}=require('../js/match/substitutions');

const roles=['GK','CB','CB','CB','CB','DM','CM','AM','LW','ST','RW'];
const xs=[6,24,27,30,33,42,47,55,67,72,68];
const ys=[50,18,39,61,82,50,34,64,12,50,88];

function team(side){
 const players=roles.map((role,i)=>({
  id:(side?'Away':'Home')+'-'+i,name:'Player '+i,role,
  pace:66,passing:68,shooting:62,defending:61,
  stamina:!side&&i===9?25:100,x:xs[i],y:ys[i],active:true
 }));
 if(!side)players.push({
  id:'Home-strong-sub',name:'Strong striker substitute',role:'ST',
  pace:80,passing:80,shooting:80,defending:80,
  stamina:100,x:xs[9],y:ys[9],active:false
 });
 return {name:side?'Away':'Home',mentality:'balanced',adaptiveTactics:true,players};
}
function match(seed){
 return Engine.createMatch({teams:[team(0),team(1)],seed});
}
function points(score){
 const d=score[0]-score[1];
 return d>0?3:d===0?1:0;
}
function outcome(score){
 const d=score[0]-score[1];
 return d>0?'win':d===0?'draw':'loss';
}

test('900 seeded matches audit a strong striker substitution by score situation at minute 55',()=>{
 const targetPerSituation=300;
 const maxSeeds=12000;
 const report={};
 for(const situation of ['leading','drawing','trailing']){
  const a={
   matches:0,
   baseline:{points:0,wins:0,draws:0,losses:0,goals:0,shots:0},
   substitution:{points:0,wins:0,draws:0,losses:0,goals:0,shots:0},
   sampledSeedStart:null,
   sampledSeedEnd:null
  };
  for(let seed=1;seed<=maxSeeds&&a.matches<targetPerSituation;seed++){
   const baseline=match(seed),changed=match(seed);
   Engine.simulateMatch(baseline,55);
   Engine.simulateMatch(changed,55);
   const diff=baseline.score[0]-baseline.score[1];
   const matchesSituation=situation==='leading'?diff>0:situation==='trailing'?diff<0:diff===0;
   if(!matchesSituation)continue;
   assert.deepEqual(changed.score,baseline.score);
   assert.deepEqual(changed.shots,baseline.shots);
   const outgoing=changed.teams[0].players.find(p=>p.id==='Home-9');
   const incoming=changed.teams[0].players.find(p=>p.id==='Home-strong-sub');
   substitutePlayer(changed,0,outgoing.id,incoming.id);
   Engine.simulateMatch(baseline,35);
   Engine.simulateMatch(changed,35);
   assert.equal(outgoing.active,false);
   assert.equal(incoming.active,true);
   for(const [state,key] of [[baseline,'baseline'],[changed,'substitution']]){
    const result=outcome(state.score);
    a[key].points+=points(state.score);
    a[key][result==='win'?'wins':result==='draw'?'draws':'losses']++;
    a[key].goals+=state.score[0];
    a[key].shots+=state.shots[0];
   }
   a.matches++;
   if(a.sampledSeedStart===null)a.sampledSeedStart=seed;
   a.sampledSeedEnd=seed;
  }
  assert.equal(a.matches,targetPerSituation,
   'Not enough seeded matches found for '+situation+' situation');
  const summarize=x=>({
   wins:x.wins,draws:x.draws,losses:x.losses,
   averagePoints:+(x.points/a.matches).toFixed(3),
   homeGoals:+(x.goals/a.matches).toFixed(3),
   homeShots:+(x.shots/a.matches).toFixed(3)
  });
  report[situation]={
   matches:a.matches,
   seedRange:[a.sampledSeedStart,a.sampledSeedEnd],
   withoutSubstitution:summarize(a.baseline),
   withStrongStrikerSubstitution:summarize(a.substitution)
  };
 }
 console.log('FM4 score-situation substitution audit:',JSON.stringify(report));
 for(const row of Object.values(report))assert.equal(row.matches,targetPerSituation);
});

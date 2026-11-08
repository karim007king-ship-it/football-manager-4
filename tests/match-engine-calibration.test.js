'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createMatch,simulateMatch,resolveClearanceSecondBall}=require('../js/match/engine');
const {createMatchFromGame}=require('../js/match/adapter');

function engineTeam(name,side){
 const roles=['GK','DF','DF','DF','DF','DM','CM','AM','LW','ST','RW'];
 const xs=side===0?[6,24,27,30,33,42,47,55,67,72,68]:[94,76,73,70,67,58,53,45,33,28,32];
 return{name,players:roles.map((role,i)=>({id:name+'-'+i,role,pace:66,passing:68,shooting:62,defending:61,x:xs[i],y:[50,18,39,61,82,50,34,64,12,50,88][i]}))};
}
function legacyTeam(name){
 const pos=['GK','DEF','DEF','DEF','DEF','MID','MID','MID','MID','FWD','FWD'];
 return{name,mentality:'balanced',players:pos.map((p,i)=>({id:i+1,name:'P'+i,pos:p,ovr:65+i,morale:70,inj:0}))};
}

test('90-minute engine calibration stays within plausible match-volume bands and is side-balanced',()=>{
 let goals=0,shots=0,homeGoals=0,awayGoals=0;
 const games=160;
 for(let seed=1;seed<=games;seed++){
  const s=simulateMatch(createMatch({teams:[engineTeam('Home',0),engineTeam('Away',1)],seed}),90);
  goals+=s.score[0]+s.score[1];shots+=s.shots[0]+s.shots[1];
  homeGoals+=s.score[0];awayGoals+=s.score[1];
  assert.equal(s.minute,90);
  assert.equal(s.possession[0]+s.possession[1],90);
 }
 const avgGoals=goals/games,avgShots=shots/games;
 assert.ok(avgGoals>=0.8&&avgGoals<=5.2,'average goals '+avgGoals.toFixed(2));
 assert.ok(avgShots>=6&&avgShots<=24,'average shots '+avgShots.toFixed(2));
 assert.ok(Math.abs(homeGoals-awayGoals)/games<=0.85,'home/away goal gap '+(Math.abs(homeGoals-awayGoals)/games).toFixed(2));
});

test('legacy OVR adapter does not produce excessive goals or shots over 90 minutes',()=>{
 let goals=0,shots=0,homeGoals=0,awayGoals=0;
 const games=100;
 for(let seed=1;seed<=games;seed++){
  const s=simulateMatch(createMatchFromGame({home:legacyTeam('Home'),away:legacyTeam('Away'),seed}),90);
  goals+=s.score[0]+s.score[1];shots+=s.shots[0]+s.shots[1];
  homeGoals+=s.score[0];awayGoals+=s.score[1];
 }
 const avgGoals=goals/games,avgShots=shots/games;
 assert.ok(avgGoals>=0.6&&avgGoals<=5.5,'adapter average goals '+avgGoals.toFixed(2));
 assert.ok(avgShots>=5&&avgShots<=27,'adapter average shots '+avgShots.toFixed(2));
 assert.ok(Math.abs(homeGoals-awayGoals)/games<=1.2,'adapter home/away goal gap '+(Math.abs(homeGoals-awayGoals)/games).toFixed(2));
});

test('120-minute extra-time simulation remains stable and bounded',()=>{
 for(let seed=201;seed<=220;seed++){
  const s=simulateMatch(createMatch({teams:[engineTeam('Home',0),engineTeam('Away',1)],seed}),120);
  assert.equal(s.minute,120);
  assert.equal(s.possession[0]+s.possession[1],120);
  assert.ok(s.events.every(e=>e.minute>=1&&e.minute<=120));
  assert.ok(s.shots.every(n=>Number.isFinite(n)&&n>=0));
  assert.ok(s.score.every(n=>Number.isFinite(n)&&n>=0));
 }
});
test('realistic 65-75 OVR squads keep match volume and passing within tighter calibration bands',()=>{
 let goals=0,shots=0,passes=0,completed=0,homeGoals=0,awayGoals=0;
 const games=200;
 for(let seed=501;seed<501+games;seed++){
  const s=simulateMatch(createMatchFromGame({home:legacyTeam('Home'),away:legacyTeam('Away'),seed}),90);
  goals+=s.score[0]+s.score[1];shots+=s.shots[0]+s.shots[1];
  passes+=s.passes[0]+s.passes[1];completed+=s.completedPasses[0]+s.completedPasses[1];
  homeGoals+=s.score[0];awayGoals+=s.score[1];
 }
 const avgGoals=goals/games,avgShots=shots/games,passAccuracy=100*completed/Math.max(1,passes);
 assert.ok(avgGoals>=1.5&&avgGoals<=3.8,'65-75 OVR average goals '+avgGoals.toFixed(2));
 assert.ok(avgShots>=12&&avgShots<=22,'65-75 OVR average shots '+avgShots.toFixed(2));
 assert.ok(passAccuracy>=64&&passAccuracy<=82,'pass accuracy '+passAccuracy.toFixed(1));
 assert.ok(Math.abs(homeGoals-awayGoals)/games<=.65,'balanced home/away goals; gap '+(Math.abs(homeGoals-awayGoals)/games).toFixed(2));
});

test('higher-rated teams gain a scoring edge regardless of home or away side',()=>{
 const rated=(name,ovr)=>({name,mentality:'balanced',players:['GK','DEF','DEF','DEF','DEF','MID','MID','MID','MID','FWD','FWD'].map((pos,i)=>({id:name+i,name:'P'+i,pos,ovr:ovr+(i%3)-1,morale:70,inj:0}))});
 for(const [homeOvr,awayOvr,strongSide] of [[80,65,0],[65,80,1]]){
  let strongGoals=0,weakGoals=0;
  const games=200;
  for(let seed=901;seed<901+games;seed++){
   const s=simulateMatch(createMatchFromGame({home:rated('Home',homeOvr),away:rated('Away',awayOvr),seed}),90);
   strongGoals+=s.score[strongSide];weakGoals+=s.score[1-strongSide];
  }
  assert.ok((strongGoals-weakGoals)/games>.2,'higher-rated side should score more: '+homeOvr+' vs '+awayOvr);
 }
});

test('1000-case second-ball cohort preserves aerial ranking, pressure cutoff, ownership and transitions',()=>{
 const ratings=[20,40,60,80,95],paces=[35,65],distances=[0,5,10,14,14.001];
 let cases=0,contested=0,uncontested=0,defendingWins=0,attackingWins=0;
 const skill=(aerial,pace)=>(aerial-50)*.025+pace*.006;
 for(const defendingId of [0,1]){
  const attackingId=1-defendingId;
  for(const defenderAerial of ratings)for(const attackerAerial of ratings){
   for(const defenderPace of paces)for(const attackerPace of paces)for(const pressureDistance of distances){
    const outlet={id:'outlet',role:'CM',active:true,x:50,y:50,aerial:defenderAerial,pace:defenderPace};
    const press={id:'press',role:'ST',active:true,x:50+pressureDistance,y:50,aerial:attackerAerial,pace:attackerPace};
    const state={teams:[{id:0,players:[]},{id:1,players:[]}],ball:{x:50,y:50,team:defendingId,playerId:outlet.id},actionCount:7,transition:null};
    state.teams[defendingId].players.push(outlet);
    state.teams[attackingId].players.push(press);
    const event=resolveClearanceSecondBall(state,state.teams[defendingId],attackingId,outlet);
    cases++;
    if(pressureDistance>14){
     uncontested++;
     assert.equal(event,null,'pressure beyond 14 units must not create a second-ball contest');
     assert.equal(state.ball.team,defendingId);
     assert.equal(state.ball.playerId,outlet.id);
     assert.equal(state.transition,null);
     continue;
    }
    contested++;
    assert.ok(event&&event.contested,'pressure at or inside 14 units must create a contest');
    const defenderScore=-skill(defenderAerial,defenderPace);
    const attackerScore=pressureDistance-skill(attackerAerial,attackerPace);
    const expectedTeam=attackerScore<defenderScore?attackingId:defenderScore<attackerScore?defendingId:Math.min(defendingId,attackingId);
    const expectedPlayer=expectedTeam===defendingId?outlet:press;
    assert.equal(event.team,expectedTeam);
    assert.equal(event.playerId,expectedPlayer.id);
    assert.equal(event.outcome,expectedTeam===defendingId?'retained':'lost');
    assert.equal(state.ball.team,expectedTeam);
    assert.equal(state.ball.playerId,expectedPlayer.id);
    if(expectedTeam===defendingId){defendingWins++;assert.equal(state.transition.team,defendingId);}
    else{attackingWins++;assert.equal(state.transition,null);}
   }
  }
 }
 assert.equal(cases,1000);
 assert.equal(contested,800);
 assert.equal(uncontested,200);
 assert.ok(defendingWins>0&&attackingWins>0,'both sides must win under different skill and pressure combinations');
});

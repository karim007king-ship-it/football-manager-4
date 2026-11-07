'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createMatch,resolveKeeperParryRebound,resolveWoodworkRebound,resolveRestart,classifyBoundaryRestart,resolveBallBoundary,resolvePassBoundary,resolveShotDeflectionBoundary,resolveCrossContest,stepMatch,simulateMatch,restoreRandom,choosePassTarget,classifyPassPattern,findShotBlocker,shotDeflectionOutcome,isDefensiveThird,chooseClearanceTarget,resolveClearanceSecondBall,resolveDefensiveRecovery,startCounterTransition,counterTransitionActive,defensiveCoverTarget,defensiveLineTarget,findPassInterceptor,passLaneInterceptionChance,effectiveMentality,strikerRunTarget}=require('../js/match/engine');
function team(name,side){
 const roles=['GK','DF','DF','DF','DF','DM','CM','AM','LW','ST','RW'];
 const xs=side===0?[6,24,27,30,33,42,47,55,67,72,68]:[94,76,73,70,67,58,53,45,33,28,32];
 return{name,players:roles.map((role,i)=>({id:name+'-'+i,name:'P'+i,role,pace:66,passing:68,shooting:62,defending:61,x:xs[i],y:[50,18,39,61,82,50,34,64,12,50,88][i]}))};
}
const create=(seed=23)=>createMatch({teams:[team('Home',0),team('Away',1)],seed});

test('classifies through balls, crosses, cutbacks and switches from pitch context',()=>{
 const team={players:[]};
 assert.equal(classifyPassPattern({x:55,y:50},{x:67,y:51},team,0,9),'through_ball');
 assert.equal(classifyPassPattern({x:75,y:12},{x:80,y:48},team,0,9),'cross');
 assert.equal(classifyPassPattern({x:92,y:12},{x:87,y:50},team,0,9),'cutback');
 assert.equal(classifyPassPattern({x:50,y:15},{x:48,y:60},team,0,9),'switch');
 assert.equal(classifyPassPattern({x:40,y:40},{x:43,y:42},team,0,9),'normal');
});

test('pass-lane interception responds to defender skill, proximity and pass pattern',()=>{
 const average={defending:50},elite={defending:90};
 const close=passLaneInterceptionChance(average,1,'normal');
 const distant=passLaneInterceptionChance(average,4,'normal');
 const skilled=passLaneInterceptionChance(elite,1,'normal');
 const through=passLaneInterceptionChance(average,1,'through_ball');
 const cross=passLaneInterceptionChance(average,1,'cross');
 const cutback=passLaneInterceptionChance(average,1,'cutback');
 const switchPass=passLaneInterceptionChance(average,1,'switch');
 assert.ok(close>distant,'a closer defender should have a better interception chance');
 assert.ok(skilled>close,'a stronger defender should intercept more often');
 assert.ok(through>close,'through balls should expose a more interceptable corridor');
 assert.ok(cross>close,'crosses should carry additional interception risk');
 assert.ok(cutback>through,'cutbacks should be vulnerable in crowded central lanes');
 assert.ok(switchPass<close,'switches should be less vulnerable to central lane interception');
 for(const value of [close,distant,skilled,through,cross,cutback,switchPass]){
  assert.ok(value>=.02&&value<=.16,'interception chance must remain bounded');
 }
});
test('shot blocker detection finds defenders in the shooting corridor but ignores keepers and distant players',()=>{
 const shooter={x:82,y:50};
 const defenders=[
  {id:'wide',role:'CB',active:true,x:90,y:52,defending:80},
  {id:'keeper',role:'GK',active:true,x:96,y:50,defending:99},
  {id:'distant',role:'CB',active:true,x:90,y:70,defending:90}
 ];
 assert.equal(findShotBlocker(shooter,100,defenders).id,'wide');
 assert.equal(findShotBlocker(shooter,100,[defenders[1],defenders[2]]),null);
});
test('counterattack transition lasts three actions and expires deterministically',()=>{
 const state={actionCount:10};
 startCounterTransition(state,1);
 assert.deepEqual(state.transition,{team:1,expiresAtAction:13});
 assert.equal(counterTransitionActive(state,1),true);
 assert.equal(counterTransitionActive(state,0),false);
 state.actionCount=13;
 assert.equal(counterTransitionActive(state,1),true);
 state.actionCount=14;
 assert.equal(counterTransitionActive(state,1),false);
});
test('defensive third is mirrored for home and away teams',()=>{
 assert.equal(isDefensiveThird({x:30},0),true);
 assert.equal(isDefensiveThird({x:70},1),true);
 assert.equal(isDefensiveThird({x:70},0),false);
 assert.equal(isDefensiveThird({x:30},1),false);
});
test('clearance target selection prefers a forward outlet for either team',()=>{
 const players=[
  {id:'carrier',x:20,y:50,active:true},
  {id:'back',x:10,y:50,active:true},
  {id:'forward',x:48,y:30,active:true}
 ];
 assert.equal(chooseClearanceTarget({players},players[0],0).id,'forward');
 const away=players.map(p=>({...p,x:100-p.x}));
 assert.equal(chooseClearanceTarget({players:away},away[0],1).id,'forward');
});
test('creates valid two-team match state',()=>{const s=create();assert.equal(s.minute,0);assert.deepEqual(s.score,[0,0]);assert.equal(s.teams.length,2);assert.equal(s.ball.team,0);});

test('same seed and same lineups reproduce identical match output',()=>{
 const first=simulateMatch(create(991),90),second=simulateMatch(create(991),90);
 const stripRandom=({random,...state})=>state;
 assert.deepEqual(stripRandom(first),stripRandom(second));
});

test('advances 90 minutes and event times stay aligned',()=>{const s=simulateMatch(create(7),90);assert.equal(s.minute,90);assert.ok(s.events.length>0);assert.equal(s.possession[0]+s.possession[1],90);assert.ok(s.events.every(e=>e.minute>=1&&e.minute<=90));assert.ok(s.events.every(e=>['carry','pass','cross','interception','clearance','tackle','shot','block','save','goal','woodwork','rebound','restart'].includes(e.type)));});
test('off-ball teammates move to support play',()=>{const s=create();const before=s.teams[0].players.filter(p=>p.id!==s.ball.playerId).map(p=>({id:p.id,x:p.x,y:p.y}));stepMatch(s);assert.ok(before.some(old=>{const p=s.teams[0].players.find(x=>x.id===old.id);return Math.abs(p.x-old.x)>.001||Math.abs(p.y-old.y)>.001;}));});
test('both teams can progress toward their attacking goal when space is available',()=>{for(const side of [0,1]){const h=team('Home',0),a=team('Away',1),att=side===0?h:a,def=side===0?a:h;att.players.forEach((p,i)=>{p.x=side===0?(i===1?50:60):(i===1?50:40);p.y=10+i*7;});def.players.forEach((p,i)=>{p.x=side===0?98:2;p.y=5+i*9;});const s=createMatch({teams:[h,a],seed:101}),c=att.players[1],x=c.x;s.ball={x:c.x,y:c.y,team:side,playerId:c.id};stepMatch(s);const advanced=s.events.some(e=>e.team===side&&(e.type==='carry'||e.type==='pass')&&(side===0?e.x>x:e.x<x));assert.ok(advanced,'team '+side+' should record a forward carry or pass during the minute');}});
test('random state zero is preserved exactly when restoring a saved generator',()=>{
 const random=restoreRandom(0);
 assert.equal(random.state,0);
 assert.equal(random(),1013904223/4294967296);
});

test('a serialized random state resumes the same match sequence after reload',()=>{
 const uninterrupted=create(481);
 simulateMatch(uninterrupted,37);
 const saved=JSON.parse(JSON.stringify({...uninterrupted,randomState:uninterrupted.random.state,random:undefined}));
 const restored={...saved,random:restoreRandom(saved.randomState)};
 delete restored.randomState;
 simulateMatch(uninterrupted,53);
 simulateMatch(restored,53);
 const stripRandom=({random,...state})=>state;
 assert.deepEqual(stripRandom(restored),stripRandom(uninterrupted));
 assert.equal(restored.random.state,uninterrupted.random.state);
});
test('same seed and inputs produce same match output',()=>{const a=simulateMatch(create(991),90),b=simulateMatch(create(991),90);assert.deepEqual(a.score,b.score);assert.deepEqual(a.events,b.events);assert.deepEqual(a.possession,b.possession);});
test('rejects invalid team count and undersized squads',()=>{assert.throws(()=>createMatch({teams:[team('Only',0)]}),/Exactly two teams/);assert.throws(()=>createMatch({teams:[team('Home',0),{name:'Away',players:[]}] }),/at least 7 players/);});
test('shots only occur in attacking third',()=>{const s=simulateMatch(create(),90);for(const e of s.events.filter(x=>['shot','save','goal'].includes(x.type))){const attackingTeam=e.attackingTeam??e.team;const d=attackingTeam===0?100-e.x:e.x;assert.ok(d<=25.001);}});
test('defending team sends a presser toward the ball carrier',()=>{
 const h=team('Home',0),a=team('Away',1);
 h.players.forEach((p,i)=>{p.x=65;p.y=12+i*7;});
 a.players.forEach((p,i)=>{p.x= i===1?53:82;p.y= i===1?50:8+i*8;});
 const s=createMatch({teams:[h,a],seed:12}),carrier=s.teams[0].players[6];
 s.ball={x:carrier.x,y:carrier.y,team:0,playerId:carrier.id};
 const presser=s.teams[1].players[1],target={x:carrier.x,y:carrier.y};
 const before=Math.hypot(presser.x-target.x,presser.y-target.y);
 stepMatch(s);
 const after=Math.hypot(presser.x-target.x,presser.y-target.y);
 assert.ok(after<before,'nearest defender should close down the carrier');
});

test('wide players retain touchline lanes while team shape shifts',()=>{
 const s=create(),wide=s.teams[0].players.find(p=>p.role==='LW');
 const originalY=wide.y;
 s.ball={x:70,y:35,team:0,playerId:s.teams[0].players[7].id};
 stepMatch(s);
 assert.ok(wide.y<40,'left-side wide player should remain in the upper channel');
 assert.notEqual(wide.y,originalY,'wide player should still adjust with the phase');
});

test('all player coordinates remain inside pitch bounds over a full simulation',()=>{
 const s=simulateMatch(create(443),90);
 for(const t of s.teams)for(const p of t.players){
  assert.ok(p.x>=2&&p.x<=98, t.name+' player '+p.id+' x out of bounds');
  assert.ok(p.y>=2&&p.y<=98, t.name+' player '+p.id+' y out of bounds');
 }
});

test('safe forward passing lanes are preferred over backward support',()=>{
 const h=team('Home',0),a=team('Away',1);
 const carrier=h.players[6];carrier.x=40;carrier.y=50;
 const forward=h.players[8];forward.x=67;forward.y=50;
 const backward=h.players[5];backward.x=24;backward.y=50;
 h.players.forEach(p=>{p.active=true;});
 a.players.forEach((p,i)=>{p.active=true;p.x=90;p.y=5+i*9;});
 const picked=choosePassTarget({players:h.players},a.players,carrier,0);
 assert.ok(picked.p.id!==backward.id,'a safe forward lane should beat the backward option');
 assert.ok(picked.progress>0);
 assert.ok(picked.laneClearance>2.5);
});
test('opponent adapts mentality to match state while a locked user tactic is preserved',()=>{
 const s=create();
 s.minute=74;s.score=[0,1];
 assert.equal(effectiveMentality(s,0),'attacking');
 s.minute=80;s.score=[2,0];
 assert.equal(effectiveMentality(s,0),'defensive');
 s.teams[0].adaptiveTactics=false;
 assert.equal(effectiveMentality(s,0),'balanced');
});
test('adaptive mentality does not change before late-match thresholds',()=>{
 const s=create();s.minute=60;s.score=[0,1];
 assert.equal(effectiveMentality(s,0),'balanced');
});

test('save events credit the defending goalkeeper and retain the attacking shooter',()=>{
 let found=null,foundState=null;
 for(let seed=1;seed<=80&&!found;seed++){
  const state=simulateMatch(create(seed),90);
  const event=state.events.find(e=>e.type==='save');
  if(event){found=event;foundState=state;}
 }
 assert.ok(found,'at least one on-target shot should be saved in the seed cohort');
 assert.equal(found.team,1-found.attackingTeam);
 assert.equal(found.playerId,found.goalkeeperId);
 assert.ok(found.shooterId,'saved shot must retain the attacking shooter ID');
 assert.equal(foundState.teams[found.team].players.find(p=>p.id===found.playerId).role,'GK');
});

test('goalkeeper skill breakdown is retained in the engine player state',()=>{
 const h=team('Home',0),a=team('Away',1);
 Object.assign(h.players[0],{gkReflexes:91,gkHandling:82,gkPositioning:73,gkOneOnOne:64,gkDistribution:55});
 const s=createMatch({teams:[h,a],seed:23});
 const homeKeeper=s.teams[0].players.find(p=>p.role==='GK');
 const awayKeeper=s.teams[1].players.find(p=>p.role==='GK');
 assert.ok(Math.abs(homeKeeper.goalkeeping-76.24)<0.001,'weighted goalkeeper rating should retain its calculated precision');
 assert.equal(homeKeeper.gkReflexes,91);
 assert.equal(homeKeeper.gkHandling,82);
 assert.equal(homeKeeper.gkPositioning,73);
 assert.equal(homeKeeper.gkOneOnOne,64);
 assert.equal(homeKeeper.gkDistribution,55);
 assert.equal(awayKeeper.goalkeeping,60);
 assert.equal(awayKeeper.gkReflexes,60);
});
test('legacy engine inputs without a goalkeeper breakdown remain compatible',()=>{
 const s=create();
 const goalkeeper=s.teams[0].players.find(p=>p.role==='GK');
 assert.equal(goalkeeper.goalkeeping,60);
 assert.equal(goalkeeper.gkReflexes,60);
 assert.equal(goalkeeper.gkHandling,60);
 assert.equal(goalkeeper.gkPositioning,60);
 assert.equal(goalkeeper.gkOneOnOne,60);
 assert.equal(goalkeeper.gkDistribution,60);
});

test('defensive line retreats and compacts symmetrically as danger rises',()=>{
 const home={baseX:28,baseY:20},away={baseX:72,baseY:20};
 const homeSafe=defensiveLineTarget(home,{x:50,y:50},0,'balanced');
 const homeDanger=defensiveLineTarget(home,{x:10,y:80},0,'balanced');
 const awaySafe=defensiveLineTarget(away,{x:50,y:50},1,'balanced');
 const awayDanger=defensiveLineTarget(away,{x:90,y:80},1,'balanced');
 assert.ok(homeDanger.x<homeSafe.x,'home line retreats toward its own goal');
 assert.ok(awayDanger.x>awaySafe.x,'away line retreats toward its own goal');
 assert.ok(homeDanger.y>home.baseY,'far-side home defender narrows toward center');
 assert.ok(awayDanger.y>away.baseY,'mirrored away defender narrows toward center');
 const defensive=defensiveLineTarget(home,{x:10,y:50},0,'defensive');
 assert.ok(defensive.x<homeDanger.x,'defensive mentality protects deeper space');
});
test('coordinated defensive cover and central screen mirror correctly for both teams',()=>{
 const carrier={x:68,y:32};
 const upper={baseY:20},lower={baseY:80};
 const homeCover=defensiveCoverTarget(carrier,upper,1,1);
 const awayCover=defensiveCoverTarget({x:32,y:32},upper,0,1);
 assert.equal(homeCover.x,73.5);
 assert.equal(awayCover.x,26.5);
 assert.equal(homeCover.y,26.5);
 assert.equal(defensiveCoverTarget(carrier,lower,1,1).y,37.5);
 const homeScreen=defensiveCoverTarget(carrier,upper,1,2);
 const awayScreen=defensiveCoverTarget({x:32,y:68},upper,0,2);
 assert.equal(homeScreen.x,76);
 assert.equal(awayScreen.x,24);
 assert.ok(homeScreen.y>carrier.y,'central screen shades toward the pitch center');
 assert.ok(awayScreen.y<68,'mirrored screen shades toward the pitch center');
 assert.deepEqual(defensiveCoverTarget(carrier,upper,1,0),carrier);
});
test('defensive recovery resolves a real clearance and transfers possession to its forward outlet',()=>{
 const state=create(73),defending=state.teams[1];
 const defender=defending.players.find(p=>p.role==='DF');
 defender.x=80;defender.y=50;defender.defending=90;
 const outlet=defending.players.find(p=>p.id!==defender.id&&p.role!=='GK');
 defending.players.filter(p=>p.id!==defender.id&&p.id!==outlet.id).forEach(p=>{p.x=95;p.y=50;});
 outlet.x=55;outlet.y=32;
 const event=resolveDefensiveRecovery(state,defending,defender,0,()=>0);
 assert.equal(event.type,'clearance');
 assert.equal(event.team,1);
 assert.equal(event.playerId,defender.id);
 assert.equal(event.to,outlet.id);
 assert.equal(state.ball.team,1);
 assert.equal(state.ball.playerId,outlet.id);
 assert.equal(state.transition.team,1,'a clearance should initiate a counterattack for the recovering side');
});
test('clearance second balls are contested only under nearby pressure and can be won by either side',()=>{
 const retained=create(731),defending=retained.teams[1];
 const defender=defending.players.find(p=>p.role==='DF');
 defender.x=80;defender.y=50;defender.defending=90;
 const outlet=defending.players.find(p=>p.id!==defender.id&&p.role!=='GK');
 defending.players.filter(p=>p.id!==defender.id&&p.id!==outlet.id).forEach(p=>{p.x=95;p.y=50;});
 outlet.x=55;outlet.y=32;
 const opponent=retained.teams[0].players.find(p=>p.role==='ST');
 opponent.x=61;opponent.y=36;
 const event=resolveDefensiveRecovery(retained,defending,defender,0,()=>0);
 assert.equal(event.type,'clearance');
 assert.equal(event.secondBall.contested,true);
 assert.equal(event.secondBall.outcome,'retained');
 assert.equal(event.secondBall.team,1);
 assert.equal(retained.ball.playerId,outlet.id);
 assert.equal(retained.transition.team,1);

 const lost=create(732),away=lost.teams[1],awayDefender=away.players.find(p=>p.role==='DF');
 awayDefender.x=80;awayDefender.y=50;awayDefender.defending=90;
 const awayOutlet=away.players.find(p=>p.id!==awayDefender.id&&p.role!=='GK');
 away.players.filter(p=>p.id!==awayDefender.id&&p.id!==awayOutlet.id).forEach(p=>{p.x=95;p.y=50;});
 awayOutlet.x=55;awayOutlet.y=32;
 const pressing=lost.teams[0].players.find(p=>p.role==='ST');
 pressing.x=55;pressing.y=32;
 const lostEvent=resolveDefensiveRecovery(lost,away,awayDefender,0,()=>0);
 assert.equal(lostEvent.type,'clearance');
 assert.equal(lostEvent.secondBall.outcome,'lost');
 assert.equal(lostEvent.secondBall.team,0);
 assert.equal(lost.ball.playerId,pressing.id);
 assert.equal(lost.transition,null);

 const safe=create(733),safeDefending=safe.teams[1],safeDefender=safeDefending.players.find(p=>p.role==='DF');
 safe.teams[0].players.forEach(p=>{p.x=8;p.y=50;});
 safeDefender.x=80;safeDefender.y=50;safeDefender.defending=90;
 const safeOutlet=safeDefending.players.find(p=>p.id!==safeDefender.id&&p.role!=='GK');
 safeDefending.players.filter(p=>p.id!==safeDefender.id&&p.id!==safeOutlet.id).forEach(p=>{p.x=95;p.y=50;});
 safeOutlet.x=55;safeOutlet.y=32;
 const safeEvent=resolveDefensiveRecovery(safe,safeDefending,safeDefender,0,()=>0);
 assert.equal(safeEvent.secondBall,undefined,'an uncontested clearance must keep its original outlet');
 assert.equal(safe.ball.playerId,safeOutlet.id);
});
test('clearance second-ball pressure cutoff is strict and ignores inactive players and goalkeepers',()=>{
 const makeState=(opponentDistance)=>{
  const outlet={id:'outlet',role:'CM',active:true,x:50,y:50,pace:50,passing:60,defending:60};
  const keeper={id:'keeper',role:'GK',active:true,x:50,y:50,pace:99,passing:99,defending:99};
  const inactive={id:'inactive',role:'ST',active:false,x:50,y:50,pace:99,passing:99,defending:99};
  const press={id:'press',role:'ST',active:true,x:50+opponentDistance,y:50,pace:50,passing:60,defending:60};
  return{state:{teams:[{id:0,players:[outlet,keeper]},{id:1,players:[press,inactive]}],ball:{x:0,y:0,team:0,playerId:outlet.id},actionCount:3,transition:null},outlet};
 };
 const atLimit=makeState(14);
 const contested=resolveClearanceSecondBall(atLimit.state,atLimit.state.teams[0],1,atLimit.outlet);
 assert.equal(contested.contested,true,'pressure at exactly 14 units is still in range');
 assert.equal(atLimit.state.ball.playerId,'outlet','the active outfield outlet wins the equal-distance contest');
 const outside=makeState(14.001);
 assert.equal(resolveClearanceSecondBall(outside.state,outside.state.teams[0],1,outside.outlet),null);
 assert.equal(outside.state.ball.playerId,'outlet','pressure outside the cutoff must not alter clearance ownership');
});
test('clearance second-ball resolution is mirrored for either defending side',()=>{
 for(const defendingId of [0,1]){
  const attackingId=1-defendingId;
  const outlet={id:'outlet-'+defendingId,role:'CM',active:true,x:50,y:50,pace:70,passing:70,defending:70};
  const press={id:'press-'+defendingId,role:'ST',active:true,x:54,y:50,pace:65,passing:65,defending:65};
  const keeper={id:'keeper-'+defendingId,role:'GK',active:true,x:50,y:50,pace:100,passing:100,defending:100};
  const state={teams:[{id:0,players:[]},{id:1,players:[]}],ball:{x:10,y:10,team:defendingId,playerId:outlet.id},actionCount:8,transition:null};
  state.teams[defendingId].players.push(outlet,keeper);
  state.teams[attackingId].players.push(press);
  const event=resolveClearanceSecondBall(state,state.teams[defendingId],attackingId,outlet);
  assert.equal(event.contested,true);
  assert.equal(event.team,defendingId);
  assert.equal(event.outcome,'retained');
  assert.equal(state.ball.team,defendingId);
  assert.equal(state.ball.playerId,outlet.id);
  assert.equal(state.transition.team,defendingId);
 }
});
test('defensive recovery keeps an ordinary interception when clearance is not rolled',()=>{
 const state=create(74),defending=state.teams[1];
 const defender=defending.players.find(p=>p.role==='DF');
 defender.x=80;defender.y=50;
 const event=resolveDefensiveRecovery(state,defending,defender,0,()=>.999);
 assert.equal(event.type,'interception');
 assert.equal(event.playerId,defender.id);
 assert.equal(state.ball.team,1);
 assert.equal(state.ball.playerId,defender.id);
 assert.equal(state.transition.team,1,'an interception should initiate a counterattack for the recovering side');
});
test('defensive recovery never attempts a clearance outside the defending third',()=>{
 const state=create(75),defending=state.teams[1];
 const defender=defending.players.find(p=>p.role==='DF');
 defender.x=45;defender.y=50;
 const event=resolveDefensiveRecovery(state,defending,defender,0,()=>0);
 assert.equal(event.type,'interception');
 assert.equal(state.ball.playerId,defender.id);
 assert.equal(state.transition.team,1);
});

test('passing-lane interception detects active outfield defenders symmetrically',()=>{
 const homeBlocker={id:'home-blocker',role:'DF',active:true,x:52,y:51,defending:82};
 const homeKeeper={id:'home-gk',role:'GK',active:true,x:58,y:50,defending:99};
 const homeFar={id:'home-far',role:'DF',active:true,x:55,y:60,defending:99};
 const home=findPassInterceptor({x:40,y:50},{x:75,y:50},[homeKeeper,homeFar,homeBlocker]);
 assert.equal(home.player.id,'home-blocker');
 assert.ok(home.gap<2);
 const awayBlocker={id:'away-blocker',role:'DF',active:true,x:48,y:51,defending:82};
 const away=findPassInterceptor({x:60,y:50},{x:25,y:50},[awayBlocker]);
 assert.equal(away.player.id,'away-blocker');
 assert.ok(away.gap<2);
});
test('passing-lane interception ignores inactive, goalkeeper and distant defenders',()=>{
 const result=findPassInterceptor({x:40,y:50},{x:75,y:50},[
  {id:'inactive',role:'DF',active:false,x:52,y:50,defending:99},
  {id:'keeper',role:'GK',active:true,x:52,y:50,defending:99},
  {id:'wide',role:'DF',active:true,x:52,y:60,defending:99}
 ]);
 assert.equal(result,null);
});

test('striker run target attacks space behind the defensive line in both directions',()=>{
 const homeCarrier={x:62,y:50},homeStriker={x:70,y:50};
 const homeDefenders=[{id:'cb1',role:'CB',active:true,x:72,y:35},{id:'cb2',role:'CB',active:true,x:74,y:65},{id:'dm',role:'DM',active:true,x:80,y:50}];
 const home=strikerRunTarget(homeStriker,homeCarrier,0,homeDefenders);
 assert.equal(home.active,true);
 assert.ok(home.x>74,'home striker should attack beyond the defensive back line');
 assert.ok([36,50,64].includes(home.y),'home striker should select a supported channel');
 const away=strikerRunTarget({x:30,y:50},{x:38,y:50},1,homeDefenders.map(p=>({...p,x:100-p.x})));
 assert.equal(away.active,true);
 assert.ok(away.x<24,'away striker should attack beyond the mirrored defensive line');
 assert.ok(away.x<38,'away run must move toward the left attacking goal, not outside pitch bounds');
});
test('striker run targets remain inside pitch bounds near either attacking goal',()=>{
 const defendersHome=[{role:'CB',active:true,x:90,y:40},{role:'CB',active:true,x:92,y:60}];
 const home=strikerRunTarget({x:88,y:50},{x:97,y:50},0,defendersHome);
 assert.equal(home.active,true);
 assert.equal(home.x,98);
 assert.ok(home.x>=2&&home.x<=98);
 const defendersAway=defendersHome.map(p=>({...p,x:100-p.x}));
 const away=strikerRunTarget({x:12,y:50},{x:3,y:50},1,defendersAway);
 assert.equal(away.active,true);
 assert.equal(away.x,2);
 assert.ok(away.x>=2&&away.x<=98);
});
test('striker holds its supporting position before the ball reaches midfield',()=>{
 const striker={x:30,y:50};
 const run=strikerRunTarget(striker,{x:40,y:50},0,[{role:'CB',active:true,x:70,y:40}]);
 assert.equal(run.active,false);
 assert.deepEqual({x:run.x,y:run.y},striker);
});


test('goal kick restart assigns the active goalkeeper and keeps the ball inside the goal area',()=>{
 const s=create(501);
 const event=resolveRestart(s,'goal_kick',0,{x:1,y:50});
 const keeper=s.teams[0].players.find(p=>p.role==='GK');
 assert.equal(event.type,'restart');
 assert.equal(event.restartType,'goal_kick');
 assert.equal(event.playerId,keeper.id);
 assert.equal(s.ball.team,0);
 assert.equal(s.ball.playerId,keeper.id);
 assert.equal(s.ball.x,5);
 assert.ok(s.ball.y>=38&&s.ball.y<=62);
});

test('corner restart selects an active wide taker and places the ball at the correct attacking corner',()=>{
 for(const teamId of [0,1]){
  const s=create(502);
  const event=resolveRestart(s,'corner',teamId,{y:12});
  const taker=s.teams[teamId].players.find(p=>p.id===event.playerId);
  assert.ok(/^(LW|RW|LM|RM|LB|RB|LWB|RWB)$/i.test(taker.role));
  assert.equal(s.ball.x,teamId===0?97:3);
  assert.equal(s.ball.y,3);
  assert.equal(s.ball.team,teamId);
 }
});

test('throw-in and free-kick restarts preserve awarded possession and bounded locations',()=>{
 const s=create(503);
 const throwIn=resolveRestart(s,'throw_in',1,{x:45,y:20});
 assert.equal(throwIn.restartType,'throw_in');
 assert.equal(s.ball.team,1);
 assert.equal(s.ball.y,3);
 assert.ok(s.ball.x>=2&&s.ball.x<=98);
 const freeKick=resolveRestart(s,'free_kick',0,{x:120,y:101});
 assert.equal(freeKick.restartType,'free_kick');
 assert.equal(s.ball.team,0);
 assert.equal(s.ball.x,98);
 assert.equal(s.ball.y,97);
});

test('penalty restart selects the strongest active outfield shooter and rejects invalid restarts',()=>{
 const s=create(504);
 const players=s.teams[0].players.filter(p=>p.role!=='GK');
 players.forEach((p,i)=>{p.shooting=40+i;});
 const expected=players.sort((a,b)=>b.shooting-a.shooting)[0];
 const event=resolveRestart(s,'penalty',0,{x:94,y:50});
 assert.equal(event.playerId,expected.id);
 assert.equal(s.ball.playerId,expected.id);
 assert.throws(()=>resolveRestart(s,'offside',0,{x:50,y:50}),/Unsupported restart/);
 assert.throws(()=>resolveRestart(s,'corner',2,{x:97,y:3}),/team must be 0 or 1/);
});

test('boundary classification awards throw-ins to the team that did not touch last',()=>{
 const top=classifyBoundaryRestart({x:45,y:20},{x:48,y:-4},0);
 assert.deepEqual(top,{restartType:'throw_in',teamId:1,spot:{x:47.5,y:3}});
 const bottom=classifyBoundaryRestart({x:45,y:80},{x:48,y:104},1);
 assert.deepEqual(bottom,{restartType:'throw_in',teamId:0,spot:{x:47.5,y:97}});
});

test('goal-line classification mirrors corner and goal-kick awards for both ends',()=>{
 const homeCorner=classifyBoundaryRestart({x:90,y:40},{x:105,y:42},1);
 assert.deepEqual(homeCorner,{restartType:'corner',teamId:0,spot:{x:97,y:3}});
 const awayGoalKick=classifyBoundaryRestart({x:90,y:40},{x:105,y:42},0);
 assert.deepEqual(awayGoalKick,{restartType:'goal_kick',teamId:1,spot:{x:95,y:41.333333333333336}});
 const awayCorner=classifyBoundaryRestart({x:10,y:60},{x:-5,y:58},0);
 assert.deepEqual(awayCorner,{restartType:'corner',teamId:1,spot:{x:3,y:97}});
 const homeGoalKick=classifyBoundaryRestart({x:10,y:60},{x:-5,y:58},1);
 assert.deepEqual(homeGoalKick,{restartType:'goal_kick',teamId:0,spot:{x:5,y:58.666666666666664}});
});

test('boundary classifier ignores in-play and ambiguous exact-corner segments',()=>{
 assert.equal(classifyBoundaryRestart({x:40,y:40},{x:60,y:60},0),null);
 assert.equal(classifyBoundaryRestart({x:90,y:90},{x:110,y:110},0),null);
 assert.throws(()=>classifyBoundaryRestart({x:-1,y:20},{x:5,y:20},0),/start inside/);
 assert.throws(()=>classifyBoundaryRestart({x:20,y:20},{x:110,y:20},2),/Last-touch team/);
 assert.throws(()=>classifyBoundaryRestart({x:20,y:20},{x:NaN,y:20},0),/finite numeric/);
});


test('ball boundary transition atomically awards the correct restart and possession',()=>{
 const s=create(620);
 const beforeEvents=s.events.length;
 const result=resolveBallBoundary(s,{x:45,y:20},{x:48,y:-4},0);
 assert.equal(result.restartType,'throw_in');
 assert.equal(result.teamId,1);
 assert.equal(result.event.type,'restart');
 assert.equal(result.event.restartType,'throw_in');
 assert.equal(s.ball.team,1);
 assert.equal(s.ball.playerId,result.event.playerId);
 assert.equal(s.events.length,beforeEvents+1,'one boundary decision must create exactly one restart event');
 assert.equal(resolveBallBoundary(s,{x:45,y:20},{x:48,y:24},1),null,'an in-play segment must not change possession');
 assert.equal(s.ball.team,1);
 assert.equal(s.events.length,beforeEvents+1);
});

test('ball boundary transition mirrors goal-line restart ownership for both directions',()=>{
 for(const c of [
  {from:{x:90,y:40},to:{x:105,y:42},last:1,type:'corner',team:0},
  {from:{x:90,y:40},to:{x:105,y:42},last:0,type:'goal_kick',team:1},
  {from:{x:10,y:60},to:{x:-5,y:58},last:0,type:'corner',team:1},
  {from:{x:10,y:60},to:{x:-5,y:58},last:1,type:'goal_kick',team:0}
 ]){
  const s=create(621);
  const result=resolveBallBoundary(s,c.from,c.to,c.last);
  assert.equal(result.restartType,c.type);
  assert.equal(result.teamId,c.team);
  assert.equal(s.ball.team,c.team);
  assert.equal(s.ball.playerId,result.event.playerId);
 }
});

test('boundary decisions feed the restart resolver without changing awarded possession',()=>{
 const cases=[
  {from:{x:45,y:20},to:{x:48,y:-4},last:0,expected:'throw_in'},
  {from:{x:90,y:40},to:{x:105,y:42},last:0,expected:'goal_kick'},
  {from:{x:90,y:40},to:{x:105,y:42},last:1,expected:'corner'}
 ];
 for(const [index,c] of cases.entries()){
  const decision=classifyBoundaryRestart(c.from,c.to,c.last);
  assert.equal(decision.restartType,c.expected);
  const s=create(610+index);
  const event=resolveRestart(s,decision.restartType,decision.teamId,decision.spot);
  assert.equal(event.restartType,decision.restartType);
  assert.equal(s.ball.team,decision.teamId);
  assert.equal(s.ball.playerId,event.playerId);
  assert.ok(s.ball.x>=2&&s.ball.x<=98);
  assert.ok(s.ball.y>=3&&s.ball.y<=97);
  assert.ok(s.teams[decision.teamId].players.some(p=>p.active&&p.id===event.playerId));
 }
});

test('shot deflection outcome uses the conditional block roll without extra randomness',()=>{
 assert.equal(shotDeflectionOutcome(false,.001,.4,90),false,'unblocked shots cannot deflect off a defender');
 assert.equal(shotDeflectionOutcome(true,.01,.4,60),true,'a low conditional contact roll should produce a glancing deflection');
 assert.equal(shotDeflectionOutcome(true,.30,.4,60),false,'a high conditional contact roll should remain a controlled block');
 assert.equal(shotDeflectionOutcome(true,.001,.4,1),true,'even a low-skill defender has a bounded minimum deflection chance');
});

test('live goalkeeper parries create a valid in-box rebound while deflections out award corners',()=>{
 let parries=0,deflections=0;
 for(let seed=1;seed<=1200;seed++){
  const state=simulateMatch(create(seed),90);
  for(let i=0;i<state.events.length;i++){
   const contact=state.events[i];
   if(contact.parried!==true&&contact.deflectedOut!==true)continue;
   const outcome=state.events[i+1];
   assert.ok(outcome,'a parry or defensive deflection must have an immediate secondary outcome');
   if(contact.parried){
    assert.equal(outcome.type,'rebound');
    assert.ok([0,1].includes(outcome.team));
    assert.ok(state.teams[outcome.team].players.some(p=>p.active&&p.id===outcome.playerId));
    assert.ok(outcome.x>=2&&outcome.x<=98&&outcome.y>=12&&outcome.y<=88);
    assert.equal(outcome.goalkeeperId,contact.goalkeeperId);
    assert.equal(outcome.attackingTeam,contact.attackingTeam);
    parries++;
   }else{
    assert.equal(outcome.type,'restart');
    assert.equal(outcome.restartType,'corner');
    assert.equal(outcome.team,contact.attackingTeam);
    assert.ok(state.teams[outcome.team].players.some(p=>p.active&&p.id===outcome.playerId));
    assert.ok(outcome.x>=2&&outcome.x<=98&&outcome.y>=3&&outcome.y<=97);
    deflections++;
   }
  }
 }
 assert.ok(parries>0,'the deterministic cohort must exercise goalkeeper parries');
 // Defender deflection is covered by a controlled, mirrored trajectory test below.
});

test('goalkeeper parry rebounds stay in the box and award the loose ball to the nearest outfield player',()=>{
 const home=create(811),homeKeeper=home.teams[1].players[0],homeShooter=home.teams[0].players[9];
 homeKeeper.x=95;homeKeeper.y=50;homeShooter.x=90;homeShooter.y=38;
 const homeEvent=resolveKeeperParryRebound(home,homeKeeper,homeShooter,0);
 assert.equal(homeEvent.type,'rebound');
 assert.equal(homeEvent.x,88);
 assert.equal(homeEvent.y,54.2);
 assert.ok(homeEvent.x>=2&&homeEvent.x<=98&&homeEvent.y>=12&&homeEvent.y<=88);
 assert.equal(home.ball.team,homeEvent.team);
 assert.equal(home.ball.playerId,homeEvent.playerId);
 assert.ok(home.teams[homeEvent.team].players.some(p=>p.active&&!/^GK$/i.test(p.role)&&p.id===homeEvent.playerId));
 assert.equal(home.events.at(-1).type,'rebound');
 const away=create(812),awayKeeper=away.teams[0].players[0],awayShooter=away.teams[1].players[9];
 awayKeeper.x=5;awayKeeper.y=50;awayShooter.x=10;awayShooter.y=62;
 const awayEvent=resolveKeeperParryRebound(away,awayKeeper,awayShooter,1);
 assert.equal(awayEvent.x,12);
 assert.equal(awayEvent.y,45.8);
 assert.equal(away.ball.team,awayEvent.team);
 assert.equal(away.ball.playerId,awayEvent.playerId);
 assert.ok(away.teams[awayEvent.team].players.some(p=>p.active&&!/^GK$/i.test(p.role)&&p.id===awayEvent.playerId));
});

test('attacking rebound winner gets a boosted immediate follow-up shot opportunity',()=>{
 let followUps=0;
 for(let seed=1;seed<=24;seed++){
  const state=create(seed),attacker=state.teams[0].players[9];
  attacker.x=91;attacker.y=50;
  state.ball={x:attacker.x,y:attacker.y,team:0,playerId:attacker.id};
  state.reboundOpportunity={team:0,attackingTeam:0,expiresAtAction:1};
  state.random=()=>0;
  stepMatch(state);
  const followUp=state.events.find(event=>event.reboundFollowUp===true);
  if(followUp){
   assert.ok(['shot','goal','save','block'].includes(followUp.type));
   assert.equal(followUp.attackingTeam,0);
   followUps++;
   break;
  }
 }
 assert.ok(followUps>0,'an attacking rebound winner must be able to take an immediate follow-up shot');
});

test('defensive rebound winner immediately resolves through clearance or interception',()=>{
 const state=create(919),defender=state.teams[1].players[1];
 defender.x=94;defender.y=50;
 state.ball={x:defender.x,y:defender.y,team:1,playerId:defender.id};
 state.reboundOpportunity={team:1,attackingTeam:0,expiresAtAction:1};
 state.random=()=>0;
 stepMatch(state);
 const recovery=state.events[0];
 assert.ok(recovery,'the defending rebound winner must resolve the ball immediately');
 assert.ok(['clearance','interception'].includes(recovery.type));
 assert.equal(recovery.team,1);
 assert.ok(state.teams[1].players.some(p=>p.active&&p.id===recovery.playerId));
 assert.equal(state.ball.team,1);
 assert.ok(state.teams[state.ball.team].players.some(p=>p.active&&p.id===state.ball.playerId));
});

test('controlled defender shot deflections award mirrored corners to the attacking team',()=>{
 const home=create(701),homeContact={x:99,y:50};
 const homeResult=resolveShotDeflectionBoundary(home,homeContact,0,100,8);
 assert.ok(homeResult,'home deflection must cross the goal line');
 assert.equal(homeResult.restartType,'corner');
 assert.equal(homeResult.teamId,0);
 assert.equal(homeResult.event.team,0);
 assert.equal(homeResult.event.x,97);
 assert.equal(homeResult.event.y,3);
 assert.ok(home.teams[0].players.some(p=>p.active&&p.id===homeResult.event.playerId));
 const away=create(702),awayContact={x:1,y:50};
 const awayResult=resolveShotDeflectionBoundary(away,awayContact,1,0,92);
 assert.ok(awayResult,'away deflection must cross the opposite goal line');
 assert.equal(awayResult.restartType,'corner');
 assert.equal(awayResult.teamId,1);
 assert.equal(awayResult.event.team,1);
 assert.equal(awayResult.event.x,3);
 assert.equal(awayResult.event.y,97);
 assert.ok(away.teams[1].players.some(p=>p.active&&p.id===awayResult.event.playerId));
});

test('live unblocked off-target shots award a goal kick with valid restart ownership',()=>{
 let misses=0;
 for(let seed=1;seed<=120;seed++){
  const state=simulateMatch(create(seed),90);
  for(let i=0;i<state.events.length;i++){
   const shot=state.events[i];
   if(shot.type!=='shot'||shot.onTarget!==false)continue;
   const restart=state.events[i+1];
   assert.ok(restart,'an off-target shot must be followed by its restart event');
   assert.equal(restart.type,'restart');
   assert.equal(restart.restartType,'goal_kick');
   assert.equal(restart.team,1-shot.attackingTeam);
   assert.ok(state.teams[restart.team].players.some(p=>p.active&&p.id===restart.playerId));
   assert.ok(restart.x>=2&&restart.x<=98&&restart.y>=3&&restart.y<=97);
   misses++;
  }
 }
 assert.ok(misses>0,'the deterministic seed cohort must exercise off-target shots');
});

test('woodwork rebounds remain in play and mirror second-ball ownership at both goals',()=>{
 const home=create(1201),homeShooter=home.teams[0].players[9];
 homeShooter.x=92;homeShooter.y=50;
 const homeEvent=resolveWoodworkRebound(home,homeShooter,0,100,'crossbar');
 assert.equal(homeEvent.type,'rebound');
 assert.equal(homeEvent.source,'woodwork');
 assert.equal(homeEvent.woodworkType,'crossbar');
 assert.equal(homeEvent.x,95);
 assert.equal(homeEvent.y,50);
 assert.ok(homeEvent.x>=2&&homeEvent.x<=98&&homeEvent.y>=42&&homeEvent.y<=58);
 assert.equal(home.ball.team,homeEvent.team);
 assert.equal(home.ball.playerId,homeEvent.playerId);
 assert.equal(home.reboundOpportunity.attackingTeam,0);
 assert.equal(home.events.at(-1).type,'rebound');
 const away=create(1202),awayShooter=away.teams[1].players[9];
 awayShooter.x=8;awayShooter.y=40;
 const awayEvent=resolveWoodworkRebound(away,awayShooter,1,0,'post');
 assert.equal(awayEvent.source,'woodwork');
 assert.equal(awayEvent.woodworkType,'post');
 assert.equal(awayEvent.x,5);
 assert.equal(awayEvent.y,46.7);
 assert.equal(away.ball.team,awayEvent.team);
 assert.equal(away.ball.playerId,awayEvent.playerId);
 assert.equal(away.reboundOpportunity.attackingTeam,1);
 assert.ok(away.teams[awayEvent.team].players.some(p=>p.active&&!/^GK$/i.test(p.role)&&p.id===awayEvent.playerId));
 assert.throws(()=>resolveWoodworkRebound(away,awayShooter,2,0,'post'),/Attacking team/);
});

test('striker attacks the far-post lane on advanced wide crosses in both directions',()=>{
 const defenders=[
  {id:'cb1',role:'CB',active:true,x:82,y:38},
  {id:'cb2',role:'CB',active:true,x:84,y:62},
  {id:'fb',role:'LB',active:true,x:78,y:50}
 ];
 const striker={x:72,y:50};
 const homeUpper=strikerRunTarget(striker,{x:76,y:12},0,defenders);
 const homeLower=strikerRunTarget(striker,{x:76,y:88},0,defenders);
 assert.equal(homeUpper.active,true);assert.equal(homeUpper.crossingLane,true);assert.equal(homeUpper.y,64);
 assert.equal(homeLower.active,true);assert.equal(homeLower.crossingLane,true);assert.equal(homeLower.y,36);
 const mirrored=defenders.map(p=>({...p,x:100-p.x,y:100-p.y}));
 const awayUpper=strikerRunTarget({x:28,y:50},{x:24,y:88},1,mirrored);
 const awayLower=strikerRunTarget({x:28,y:50},{x:24,y:12},1,mirrored);
 assert.equal(awayUpper.crossingLane,true);assert.equal(awayUpper.y,36);
 assert.equal(awayLower.crossingLane,true);assert.equal(awayLower.y,64);
 const central=strikerRunTarget(striker,{x:76,y:50},0,defenders);
 assert.equal(central.crossingLane,false);
});

test('cross contests resolve completed delivery, interception and defensive clearance without RNG draws',()=>{
 const completed=create(1401),carrier=completed.teams[0].players[8],receiver=completed.teams[0].players[9];
 carrier.x=78;carrier.y=12;receiver.x=84;receiver.y=48;
 for(const p of completed.teams[1].players){p.x=20;p.y=5;}
 const rngState=completed.random.state;
 const delivery=resolveCrossContest(completed,carrier,receiver,0);
 assert.equal(delivery.type,'cross');assert.equal(delivery.outcome,'completed');
 assert.equal(delivery.team,0);assert.equal(completed.ball.team,0);assert.equal(completed.ball.playerId,delivery.playerId);
 assert.equal(completed.random.state,rngState,'cross contest must not consume random draws');
 const intercepted=create(1402),crossCarrier=intercepted.teams[0].players[8],target=intercepted.teams[0].players[9],defender=intercepted.teams[1].players[2];
 crossCarrier.x=78;crossCarrier.y=12;target.x=64;target.y=48;defender.x=64;defender.y=48;defender.defending=100;defender.pace=100;
 for(const p of intercepted.teams[0].players){if(p!==crossCarrier&&p!==target){p.x=20;p.y=5;}}
 for(const p of intercepted.teams[1].players){if(p!==defender){p.x=95;p.y=5;}}
 const interception=resolveCrossContest(intercepted,crossCarrier,target,0);
 assert.equal(interception.type,'interception');assert.equal(interception.source,'cross');assert.equal(interception.team,1);
 assert.equal(intercepted.ball.playerId,defender.id);
 const cleared=create(1403),clearCarrier=cleared.teams[0].players[8],clearTarget=cleared.teams[0].players[9],clearDefender=cleared.teams[1].players[2];
 clearCarrier.x=90;clearCarrier.y=12;clearTarget.x=80;clearTarget.y=48;clearDefender.x=80;clearDefender.y=48;clearDefender.defending=100;clearDefender.pace=100;
 for(const p of cleared.teams[0].players){if(p!==clearCarrier&&p!==clearTarget){p.x=20;p.y=5;}}
 for(const p of cleared.teams[1].players){if(p!==clearDefender){p.x=40;p.y=5;}}
 const clearance=resolveCrossContest(cleared,clearCarrier,clearTarget,0);
 assert.equal(clearance.type,'clearance');assert.equal(clearance.source,'cross');assert.equal(clearance.team,1);
 assert.ok(cleared.teams[1].players.some(p=>p.active&&p.id===clearance.to));
 assert.equal(cleared.ball.team,1);assert.equal(cleared.ball.playerId,clearance.to);
 assert.throws(()=>resolveCrossContest(completed,carrier,receiver,2),/Attacking team/);
});


test('cross-originated clearances resolve pressured second balls in both attack directions',()=>{
 const run=(attackingTeam)=>{
  const state=create(attackingTeam===0?1601:1602);
  const defendingTeam=1-attackingTeam;
  const carrier=state.teams[attackingTeam].players[8];
  const receiver=state.teams[attackingTeam].players[9];
  const defender=state.teams[defendingTeam].players[2];
  const outlet=state.teams[defendingTeam].players[3];
  const pressing=state.teams[attackingTeam].players[10];
  const landingX=attackingTeam===0?80:20;
  const outletX=attackingTeam===0?55:45;
  carrier.x=attackingTeam===0?90:10;carrier.y=12;
  receiver.x=landingX;receiver.y=48;
  receiver.pace=25;receiver.passing=25;receiver.shooting=25;
  defender.x=landingX;defender.y=48;defender.pace=100;defender.defending=100;
  outlet.x=outletX;outlet.y=32;outlet.pace=30;outlet.defending=30;
  pressing.x=outletX;pressing.y=32;pressing.pace=100;pressing.passing=100;
  for(const p of state.teams[attackingTeam].players){
   if(p!==carrier&&p!==receiver&&p!==pressing){p.x=attackingTeam===0?20:80;p.y=5;}
  }
  for(const p of state.teams[defendingTeam].players){
   if(p!==defender&&p!==outlet){p.x=attackingTeam===0?95:5;p.y=5;}
  }
  const event=resolveCrossContest(state,carrier,receiver,attackingTeam);
  assert.equal(event.type,'clearance');
  assert.equal(event.team,defendingTeam);
  assert.equal(event.to,outlet.id);
  assert.equal(event.secondBall.contested,true);
  assert.equal(event.secondBall.outcome,'lost');
  assert.equal(event.secondBall.team,attackingTeam);
  assert.equal(event.secondBall.playerId,pressing.id);
  assert.equal(state.ball.team,attackingTeam);
  assert.equal(state.ball.playerId,pressing.id);
  assert.equal(state.transition,null,'the attacking recovery cancels the defending counter transition');
 };
 run(0);
 run(1);
});

test('completed crosses create a one-action mirrored shooting opportunity inside the box',()=>{
 const home=create(1501),homeCarrier=home.teams[0].players[8],homeReceiver=home.teams[0].players[9];
 homeCarrier.x=78;homeCarrier.y=12;homeReceiver.x=84;homeReceiver.y=50;
 for(const p of home.teams[1].players){p.x=20;p.y=5;}
 const homeCross=resolveCrossContest(home,homeCarrier,homeReceiver,0);
 assert.equal(homeCross.outcome,'completed');assert.equal(homeCross.inBox,true);
 assert.deepEqual(home.crossShotOpportunity,{team:0,playerId:homeReceiver.id,expiresAtAction:1});
 home.events.push(homeCross);
 const zeroHome=()=>0;zeroHome.state=7;home.random=zeroHome;
 stepMatch(home);
 const homeFollowUp=home.events.find(e=>e.type==='goal'||e.type==='shot'||e.type==='save'||e.type==='block'||e.type==='woodwork');
 assert.ok(homeFollowUp,'the controlled in-box follow-up should produce a shot event');
 assert.equal(homeFollowUp.crossFollowUp,true);
 assert.equal(home.crossShotOpportunity,null);

 const away=create(1502),awayCarrier=away.teams[1].players[8],awayReceiver=away.teams[1].players[9];
 awayCarrier.x=22;awayCarrier.y=12;awayReceiver.x=16;awayReceiver.y=50;
 for(const p of away.teams[0].players){p.x=80;p.y=5;}
 const awayCross=resolveCrossContest(away,awayCarrier,awayReceiver,1);
 assert.equal(awayCross.inBox,true);
 assert.equal(away.crossShotOpportunity.team,1);
 const zeroAway=()=>0;zeroAway.state=9;away.random=zeroAway;
 away.events.push(awayCross);
 stepMatch(away);
 const awayFollowUp=away.events.find(e=>e.type==='goal'||e.type==='shot'||e.type==='save'||e.type==='block'||e.type==='woodwork');
 assert.ok(awayFollowUp,'the mirrored in-box follow-up should produce a shot event');
 assert.equal(awayFollowUp.crossFollowUp,true);

 const wide=create(1503),wideCarrier=wide.teams[0].players[8],wideReceiver=wide.teams[0].players[9];
 wideCarrier.x=72;wideCarrier.y=12;wideReceiver.x=75;wideReceiver.y=50;
 for(const p of wide.teams[1].players){p.x=20;p.y=5;}
 const wideCross=resolveCrossContest(wide,wideCarrier,wideReceiver,0);
 assert.equal(wideCross.inBox,false);
 assert.equal(wide.crossShotOpportunity,undefined);
});

test('overhit passes resolve touchline, goal-kick and corner restarts in both directions',()=>{
 const homeThrow=create(1301);
 const throwResult=resolvePassBoundary(homeThrow,{x:60,y:88},{x:75,y:99},0,.2);
 assert.equal(throwResult.restartType,'throw_in');
 assert.equal(throwResult.teamId,1);
 assert.equal(homeThrow.events.at(-1).type,'restart');
 assert.equal(homeThrow.events.at(-1).restartType,'throw_in');
 assert.equal(homeThrow.ball.team,1);
 assert.equal(homeThrow.ball.y,97);
 const awayThrow=create(1302);
 const awayThrowResult=resolvePassBoundary(awayThrow,{x:40,y:12},{x:25,y:1},1,.2);
 assert.equal(awayThrowResult.restartType,'throw_in');
 assert.equal(awayThrowResult.teamId,0);
 assert.equal(awayThrow.ball.team,0);
 assert.equal(awayThrow.ball.y,3);
 const homeGoalKick=create(1303);
 const goalKick=resolvePassBoundary(homeGoalKick,{x:92,y:50},{x:101,y:50},0,.2);
 assert.equal(goalKick.restartType,'goal_kick');
 assert.equal(goalKick.teamId,1);
 assert.equal(homeGoalKick.ball.team,1);
 const awayCorner=create(1304);
 const corner=resolvePassBoundary(awayCorner,{x:8,y:40},{x:-1,y:40},0,.2);
 assert.equal(corner.restartType,'corner');
 assert.equal(corner.teamId,1);
 assert.equal(awayCorner.ball.team,1);
 assert.ok(awayCorner.events.at(-1).playerId);
 assert.throws(()=>resolvePassBoundary(homeGoalKick,{x:1,y:1},{x:1,y:1},0),/length/);
});

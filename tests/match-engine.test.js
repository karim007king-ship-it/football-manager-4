'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createMatch,resolveRestart,classifyBoundaryRestart,resolveBallBoundary,stepMatch,simulateMatch,restoreRandom,choosePassTarget,classifyPassPattern,findShotBlocker,shotDeflectionOutcome,isDefensiveThird,chooseClearanceTarget,resolveDefensiveRecovery,startCounterTransition,counterTransitionActive,defensiveCoverTarget,defensiveLineTarget,findPassInterceptor,passLaneInterceptionChance,effectiveMentality,strikerRunTarget}=require('../js/match/engine');
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

test('advances 90 minutes and event times stay aligned',()=>{const s=simulateMatch(create(7),90);assert.equal(s.minute,90);assert.ok(s.events.length>0);assert.equal(s.possession[0]+s.possession[1],90);assert.ok(s.events.every(e=>e.minute>=1&&e.minute<=90));assert.ok(s.events.every(e=>['carry','pass','interception','clearance','tackle','shot','block','save','goal','restart'].includes(e.type)));});
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

test('live goalkeeper parries and defender deflections award corners to the attacking team',()=>{
 let parries=0,deflections=0;
 for(let seed=1;seed<=1200;seed++){
  const state=simulateMatch(create(seed),90);
  for(let i=0;i<state.events.length;i++){
   const contact=state.events[i];
   if(contact.parried!==true&&contact.deflectedOut!==true)continue;
   const restart=state.events[i+1];
   assert.ok(restart,'a parry or defensive deflection out must be followed by a restart');
   assert.equal(restart.type,'restart');
   assert.equal(restart.restartType,'corner');
   assert.equal(restart.team,contact.attackingTeam);
   assert.ok(state.teams[restart.team].players.some(p=>p.active&&p.id===restart.playerId));
   assert.ok(restart.x>=2&&restart.x<=98&&restart.y>=3&&restart.y<=97);
   if(contact.parried)parries++;
   if(contact.deflectedOut)deflections++;
  }
 }
 assert.ok(parries>0,'the deterministic cohort must exercise goalkeeper parries');
 assert.ok(deflections>0,'the deterministic cohort must exercise defender deflections');
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

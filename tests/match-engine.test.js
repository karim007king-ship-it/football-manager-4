'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createMatch,stepMatch,simulateMatch,restoreRandom,choosePassTarget,effectiveMentality}=require('../js/match/engine');
function team(name,side){
 const roles=['GK','DF','DF','DF','DF','DM','CM','AM','LW','ST','RW'];
 const xs=side===0?[6,24,27,30,33,42,47,55,67,72,68]:[94,76,73,70,67,58,53,45,33,28,32];
 return{name,players:roles.map((role,i)=>({id:name+'-'+i,name:'P'+i,role,pace:66,passing:68,shooting:62,defending:61,x:xs[i],y:[50,18,39,61,82,50,34,64,12,50,88][i]}))};
}
const create=(seed=23)=>createMatch({teams:[team('Home',0),team('Away',1)],seed});
test('creates valid two-team match state',()=>{const s=create();assert.equal(s.minute,0);assert.deepEqual(s.score,[0,0]);assert.equal(s.teams.length,2);assert.equal(s.ball.team,0);});

test('same seed and same lineups reproduce identical match output',()=>{
 const first=simulateMatch(create(991),90),second=simulateMatch(create(991),90);
 const stripRandom=({random,...state})=>state;
 assert.deepEqual(stripRandom(first),stripRandom(second));
});

test('advances 90 minutes and event times stay aligned',()=>{const s=simulateMatch(create(7),90);assert.equal(s.minute,90);assert.ok(s.events.length>0);assert.equal(s.possession[0]+s.possession[1],90);assert.ok(s.events.every(e=>e.minute>=1&&e.minute<=90));assert.ok(s.events.every(e=>['carry','pass','interception','tackle','shot','save','goal'].includes(e.type)));});
test('off-ball teammates move to support play',()=>{const s=create();const before=s.teams[0].players.filter(p=>p.id!==s.ball.playerId).map(p=>({id:p.id,x:p.x,y:p.y}));stepMatch(s);assert.ok(before.some(old=>{const p=s.teams[0].players.find(x=>x.id===old.id);return Math.abs(p.x-old.x)>.001||Math.abs(p.y-old.y)>.001;}));});
test('both teams can progress toward their attacking goal when space is available',()=>{for(const side of [0,1]){const h=team('Home',0),a=team('Away',1),att=side===0?h:a,def=side===0?a:h;att.players.forEach((p,i)=>{p.x=side===0?(i===1?50:60):(i===1?50:40);p.y=10+i*7;});def.players.forEach((p,i)=>{p.x=side===0?98:2;p.y=5+i*9;});const s=createMatch({teams:[h,a],seed:101}),c=att.players[1],x=c.x;s.ball={x:c.x,y:c.y,team:side,playerId:c.id};stepMatch(s);const advanced=s.events.some(e=>e.team===side&&(e.type==='carry'||e.type==='pass')&&(side===0?e.x>x:e.x<x));assert.ok(advanced,'team '+side+' should record a forward carry or pass during the minute');}});
test('random state zero is preserved exactly when restoring a saved generator',()=>{\n const random=Engine.restoreRandom(0);\n assert.equal(random.state,0);\n assert.equal(random(),1013904223/4294967296);\n});\n\ntest('a serialized random state resumes the same match sequence after reload',()=>{
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
test('shots only occur in attacking third',()=>{const s=simulateMatch(create(),90);for(const e of s.events.filter(x=>['shot','save','goal'].includes(x.type))){const d=e.team===0?100-e.x:e.x;assert.ok(d<=25.001);}});
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

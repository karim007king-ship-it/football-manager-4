'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const Bridge=require('../js/match/live-bridge');
function team(name,offset=0){
 const pos=['GK','DEF','DEF','DEF','DEF','MID','MID','MID','MID','FWD','FWD'];
 return {xi:pos.map((p,i)=>({id:offset+i+1,name:name+' '+i,pos:p,ovr:68,morale:75,inj:0}))};
}
function live(home=true){
 const user=team('المستخدم'),opp=team('المنافس',100);
 return {xi:user.xi,O:opp,home,tac:'balanced',en:{1:61},min:12,gu:1,go:0,bx:95,by:50};
}
test('creates a read-only shadow from a live home match',()=>{
 const m=live(true),before=JSON.stringify(m),s=Bridge.createShadowFromLive({match:m,seed:44});
 assert.equal(s.userTeamId,0);assert.equal(s.state.teams[0].name,'فريقي');
 assert.equal(s.state.teams[1].name,'الخصم');assert.equal(s.state.teams[0].players[0].stamina,61);
 assert.equal(JSON.stringify(m),before);assert.equal(s.source,'read-only-shadow');
 assert.equal(s.state.minute,12);assert.deepEqual(s.state.score,[1,0]);
 assert.equal(s.state.ball.team,1);assert.equal(s.state.ball.playerId,'101');
});
test('maps the user team correctly when the legacy club plays away',()=>{
 const s=Bridge.createShadowFromLive({match:live(false),seed:45});
 assert.equal(s.userTeamId,1);assert.equal(s.state.teams[1].name,'فريقي');
 assert.equal(s.state.teams[0].name,'الخصم');
});
test('shadow simulation advances without changing legacy match or players',()=>{
 const m=live(false),before=JSON.stringify(m),s=Bridge.createShadowFromLive({match:m,seed:46});
 const result=Bridge.stepShadow(s,8);
 assert.equal(result.minute,20);assert.equal(result.userTeamId,1);
 assert.deepEqual(result.activePlayers,[11,11]);assert.ok(result.eventCount>0);
 assert.equal(JSON.stringify(m),before);
});
test('shadow advancement is capped at 90 minutes and rejects missing state',()=>{
 const s=Bridge.createShadowFromLive({match:live(),seed:47});
 assert.equal(Bridge.stepShadow(s,130).minute,120);
 assert.throws(()=>Bridge.stepShadow(null,1),/shadow match/);
});

test('compares shadow statistics with legacy score, possession and shots',()=>{
 const m=live(true);m.ps=624;m.sh=[4,3];
 const s=Bridge.createShadowFromLive({match:m,seed:48});
 const report=Bridge.compareWithLegacy(s,m);
 assert.deepEqual(report.minute,{engine:12,legacy:12});
 assert.deepEqual(report.score,{engine:[1,0],legacy:[1,0]});
 assert.equal(report.possession.legacy,52);
 assert.equal(report.possession.engine,52);
 assert.deepEqual(report.shots.legacy,[4,3]);
 assert.deepEqual(report.shots.engine,[4,3]);
 assert.deepEqual(report.activePlayers,[11,11]);
});
test('comparison rejects missing match inputs',()=>{
 const s=Bridge.createShadowFromLive({match:live(),seed:49});
 assert.throws(()=>Bridge.compareWithLegacy(s,null),/required/);
});

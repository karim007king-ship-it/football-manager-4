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
 return {xi:user.xi,O:opp,home,tac:'balanced',en:{1:61},min:12,gu:1,go:0};
}
test('creates a read-only shadow from a live home match',()=>{
 const m=live(true),before=JSON.stringify(m),s=Bridge.createShadowFromLive({match:m,seed:44});
 assert.equal(s.userTeamId,0);assert.equal(s.state.teams[0].name,'فريقي');
 assert.equal(s.state.teams[1].name,'الخصم');assert.equal(s.state.teams[0].players[0].stamina,61);
 assert.equal(JSON.stringify(m),before);assert.equal(s.source,'read-only-shadow');
});
test('maps the user team correctly when the legacy club plays away',()=>{
 const s=Bridge.createShadowFromLive({match:live(false),seed:45});
 assert.equal(s.userTeamId,1);assert.equal(s.state.teams[1].name,'فريقي');
 assert.equal(s.state.teams[0].name,'الخصم');
});
test('shadow simulation advances without changing legacy match or players',()=>{
 const m=live(false),before=JSON.stringify(m),s=Bridge.createShadowFromLive({match:m,seed:46});
 const result=Bridge.stepShadow(s,8);
 assert.equal(result.minute,8);assert.equal(result.userTeamId,1);
 assert.deepEqual(result.activePlayers,[11,11]);assert.ok(result.eventCount>0);
 assert.equal(JSON.stringify(m),before);
});
test('shadow advancement is capped at 90 minutes and rejects missing state',()=>{
 const s=Bridge.createShadowFromLive({match:live(),seed:47});
 assert.equal(Bridge.stepShadow(s,100).minute,90);
 assert.throws(()=>Bridge.stepShadow(null,1),/shadow match/);
});

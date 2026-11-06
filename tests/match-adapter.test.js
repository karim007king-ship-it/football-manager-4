'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {toEngineTeam,createMatchFromGame}=require('../js/match/adapter');
const {simulateMatch}=require('../js/match/engine');
function legacyTeam(name,side=0){
 const pos=['GK','DEF','DEF','DEF','DEF','MID','MID','MID','MID','FWD','FWD'];
 return{name,mentality:'attacking',players:pos.map((p,i)=>({id:i+1,name:'لاعب '+(i+1),pos:p,ovr:65+i,morale:70,inj:0}))};
}
test('maps the legacy GK/DEF/MID/FWD squad into engine roles',()=>{
 const t=toEngineTeam({...legacyTeam('النادي'),side:0});
 assert.deepEqual(t.players.map(p=>p.role),['GK','LB','CB','CB','RB','LM','CM','CM','RM','ST','ST']);
 assert.equal(t.players[0].id,'1');
 assert.equal(t.players[0].name,'لاعب 1');
});
test('preserves Arabic names and numeric or string player identifiers',()=>{
 const t=legacyTeam('فريق عربي');
 t.players[0].id=501;t.players[0].name='حارس المرمى';
 t.players[1].id='مدافع-٢';t.players[1].name='مدافع عربي';
 const out=toEngineTeam(t);
 assert.equal(out.players[0].id,'501');
 assert.equal(out.players[0].name,'حارس المرمى');
 assert.equal(out.players[1].id,'مدافع-٢');
 assert.equal(out.players[1].name,'مدافع عربي');
});
test('uses legacy morale, injury and match energy without mutating source players',()=>{
 const t=legacyTeam('النادي');t.players[1].morale=40;t.players[1].inj=2;
 const before=JSON.stringify(t.players);
 const out=toEngineTeam({...t,energy:{2:54}});
 assert.ok(out.players[1].pace<out.players[2].pace);
 assert.equal(out.players[1].stamina,54);
 assert.equal(JSON.stringify(t.players),before);
});
test('creates a valid match from two legacy lineups and simulates it',()=>{
 const s=createMatchFromGame({home:legacyTeam('المضيف'),away:legacyTeam('الضيف',1),seed:91});
 assert.equal(s.teams[0].name,'المضيف');assert.equal(s.teams[1].name,'الضيف');
 assert.ok(s.teams[0].players.every(p=>p.x<50));
 assert.ok(s.teams[1].players.every(p=>p.x>50));
 simulateMatch(s,90);assert.equal(s.minute,90);
});
test('rejects incomplete legacy teams instead of inventing a lineup',()=>{
 assert.throws(()=>toEngineTeam({name:'ناقص',players:[]}),/at least 7/);
 assert.throws(()=>createMatchFromGame({home:legacyTeam('المضيف')}),/required/);
});

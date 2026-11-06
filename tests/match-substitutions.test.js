'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {substitutePlayer}=require('../js/match/substitutions');
const {createMatch,stepMatch}=require('../js/match/engine');
function fixture(){
 const players=Array.from({length:17},(_,i)=>({id:String(i),name:'P'+i,role:i===0?'GK':i<5?'CB':i<11?'CM':'ST',active:i<11,x:10+i,y:20+i,baseX:10+i,baseY:20+i,direction:1,stamina:90-i}));
 return{minute:37,teams:[{players},{players:players.map(p=>({...p,id:'a'+p.id}))}],ball:{team:0,playerId:'1',x:11,y:21},substitutions:[0,0],substitutionLog:[]};
}
test('substitution keeps eleven active players and transfers the vacated slot',()=>{
 const s=fixture(),before=s.teams[0].players.find(p=>p.id==='1');
 const rec=substitutePlayer(s,0,'1','11');
 const out=s.teams[0].players.find(p=>p.id==='1'),incoming=s.teams[0].players.find(p=>p.id==='11');
 assert.equal(out.active,false);assert.equal(incoming.active,true);
 assert.equal(incoming.role,before.role);assert.equal(incoming.x,before.x);assert.equal(incoming.y,before.y);
 assert.equal(s.teams[0].players.filter(p=>p.active).length,11);
 assert.equal(s.substitutions[0],1);assert.equal(rec.minute,37);
});
test('if outgoing player has the ball, possession moves to the substitute',()=>{
 const s=fixture();substitutePlayer(s,0,'1','11');
 assert.equal(s.ball.playerId,'11');assert.equal(s.ball.x,11);assert.equal(s.ball.y,21);
});
test('rejects an active incoming player and an inactive outgoing player',()=>{
 const s=fixture();
 assert.throws(()=>substitutePlayer(s,0,'1','2'),/already active/);
 assert.throws(()=>substitutePlayer(s,0,'12','11'),/not on the pitch/);
});
test('rejects players from another team and invalid team ids',()=>{
 const s=fixture();
 assert.throws(()=>substitutePlayer(s,0,'1','a11'),/not found/);
 assert.throws(()=>substitutePlayer(s,3,'1','11'),/Invalid team/);
});
test('enforces the five-substitution limit without changing the lineup',()=>{
 const s=fixture();
 for(let i=0;i<5;i++)substitutePlayer(s,0,String(i),String(11+i));
 assert.equal(s.substitutions[0],5);
 assert.throws(()=>substitutePlayer(s,0,'5','16'),/Maximum of five/);
 assert.equal(s.teams[0].players.filter(p=>p.active).length,11);
});

test('a full match continues normally after a halftime substitution',()=>{
 const squad=Array.from({length:16},(_,i)=>({id:String(i),name:'H'+i,role:i===0?'GK':i<5?'CB':i<10?'CM':'ST',active:i<11,x:i===0?5:i<5?25:i<10?50:75,y:8+(i%9)*10,pace:65,passing:65,shooting:60,defending:60,stamina:100}));
 const away=Array.from({length:11},(_,i)=>({id:'A'+i,name:'A'+i,role:i===0?'GK':i<5?'CB':i<9?'CM':'ST',x:i===0?95:i<5?75:i<9?50:25,y:8+(i%9)*10}));
 const state=createMatch({teams:[{name:'Home',players:squad},{name:'Away',players:away}],seed:123});
 for(let i=0;i<45;i++)stepMatch(state);
 substitutePlayer(state,0,'1','11');
 for(let i=0;i<45;i++)stepMatch(state);
 assert.equal(state.minute,90);
 assert.equal(state.teams[0].players.filter(p=>p.active).length,11);
 assert.equal(state.teams[1].players.filter(p=>p.active).length,11);
 assert.equal(state.substitutions[0],1);
});

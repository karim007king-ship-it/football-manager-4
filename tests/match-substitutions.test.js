'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {substitutePlayer}=require('../js/match/substitutions');
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

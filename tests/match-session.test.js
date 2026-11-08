'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const html=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
const Session=require('../js/match/session-store');
function fixture(){
 const players=Array.from({length:22},(_,i)=>({id:'p'+i,name:'Player '+i,clubId:i<11?1:2,pos:i%11===0?'GK':'MID',inj:i===1?2:0}));
 const clubs=[{id:1,name:'Home'},{id:2,name:'Away'}];
 const game={uid:1,season:3,round:5,players,clubs};
 const match={min:37,end:90,gu:1,go:0,home:true,cup:false,done:false,paused:false,hold:false,skip:false,so:null,
  xi:players.slice(0,11),opp:clubs[1],O:{a:65,d:62,pw:63,xi:players.slice(11,22)},bst:players[2],
  out:new Set(['p3']),hurt:new Set(['p1']),q:[],t:123,subs:3,sh:[4,2],sc:['Player 2 [37]'],sessionLog:[{text:'⚽ هدف في الدقيقة 12',className:'log-goal'},{text:'🟨 بطاقة صفراء',className:'log-bad'}],shadowSlots:{p0:0}};
 return {game,match,players,clubs};
}
test('match session round trip restores player identity, sets and safe timer state',()=>{
 const {game,match,players,clubs}=fixture();
 const saved=JSON.parse(JSON.stringify(Session.serialize({match,game,shadowSnapshot:{schemaVersion:1,marker:'shadow'}})));
 const restored=Session.restore(saved,game);
 const m=restored.match;
 assert.equal(m.min,37);assert.equal(m.gu,1);assert.equal(m.go,0);
 assert.equal(m.xi[0],players[0]);assert.equal(m.O.xi[0],players[11]);
 assert.equal(m.opp,clubs[1]);assert.equal(m.bst,players[2]);
 assert.ok(m.out instanceof Set);assert.ok(m.out.has('p3'));
 assert.ok(m.hurt instanceof Set);assert.ok(m.hurt.has('p1'));
 assert.deepEqual(m.q,[]);assert.equal(m.t,null);assert.equal(m.hold,false);
 assert.deepEqual(m.sessionLog,[{text:'⚽ هدف في الدقيقة 12',className:'log-goal'},{text:'🟨 بطاقة صفراء',className:'log-bad'}]);
 assert.deepEqual(restored.shadowSnapshot,{schemaVersion:1,marker:'shadow'});
});
test('match session refuses checkpoints with queued callbacks, modal choices or shootouts',()=>{
 const {game,match}=fixture();
 match.q=[{t:'pending',f:()=>{}}];
 assert.throws(()=>Session.serialize({match,game}),/safe checkpoint/);
 match.q=[];match.hold=true;
 assert.throws(()=>Session.serialize({match,game}),/safe checkpoint/);
 match.hold=false;match.so={ph:0};
 assert.throws(()=>Session.serialize({match,game}),/safe checkpoint/);
});
test('match session rejects career mismatches and missing saved players',()=>{
 const {game,match}=fixture(),saved=Session.serialize({match,game});
 assert.throws(()=>Session.restore(saved,{...game,round:6}),/different career/);
 const broken=JSON.parse(JSON.stringify(saved));broken.match.xiIds[0]='missing';
 assert.throws(()=>Session.restore(broken,game),/no longer exists/);
});

test('game startup resumes a validated active match and checkpoints only safe states',()=>{
 assert.match(html,/FM4MatchSession\.serialize\(\{match:M,game:G,shadowSnapshot\}\)/);
 assert.match(html,/FM4MatchSession\.restore\(snapshot,G\)/);
 assert.match(html,/FM4ShadowMonitor\.restore\(restored\.shadowSnapshot\)/);
 assert.match(html,/M\.q\.length\|\|M\.hold\|\|M\.so/);
 assert.match(html,/window\.onload=\(\)=>\{load\(\);if\(G&&restoreMatchSession\(\)\)return/);
 assert.match(html,/clearMatchSession\(\);busy=false;M=null;shadowMonitor=null/);
 assert.match(html,/function restoreMatchLog\(\)[\s\S]{0,500}M\.sessionLog\.forEach/);
 assert.match(html,/const text=String\(t\),entry=\{text,className:c\|\|''\}/);
 assert.match(html,/M\.sessionLog\.push\(entry\)/);
});

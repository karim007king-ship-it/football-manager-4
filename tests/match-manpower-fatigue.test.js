'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const Engine=require('../js/match/engine');
const {substitutePlayer}=require('../js/match/substitutions');

function squad(name,side,mentality='balanced'){
 const roles=['GK','CB','CB','CB','CB','DM','CM','AM','LW','ST','RW'];
 const xs=side===0?[6,24,27,30,33,42,47,55,67,72,68]:[94,76,73,70,67,58,53,45,33,28,32];
 return {name,mentality,adaptiveTactics:false,players:roles.map((role,i)=>({
  id:name+'-'+i,name:name+' '+i,role,pace:66,passing:68,shooting:62,
  defending:61,stamina:100,x:xs[i],y:[50,18,39,61,82,50,34,64,12,50,88][i]
 }))};
}
function match(homeMentality='balanced'){
 return Engine.createMatch({teams:[squad('Home',0,homeMentality),squad('Away',1)],seed:181});
}

test('a team with ten or fewer players compresses its shape and reduces press numbers',()=>{
 const full={players:Array.from({length:11},(_,i)=>({active:true}))};
 const ten={players:Array.from({length:11},(_,i)=>({active:i!==4}))};
 const eight={players:Array.from({length:11},(_,i)=>({active:i<8}))};
 const a=Engine.manpowerProfile(full,'pressing');
 const b=Engine.manpowerProfile(ten,'pressing');
 const c=Engine.manpowerProfile(eight,'pressing');
 assert.equal(a.pressers,3);
 assert.equal(b.pressers,2);
 assert.equal(c.pressers,1);
 assert.ok(b.widthScale<a.widthScale);
 assert.ok(b.forwardScale<a.forwardScale);
 assert.ok(b.pressScale<a.pressScale);
});

test('every active player loses stamina each displayed minute, with role-weighted load',()=>{
 const s=match();
 const home=s.teams[0],keeper=home.players[0],midfielder=home.players[6];
 const keeperBefore=keeper.stamina,midBefore=midfielder.stamina;
 Engine.stepMatch(s);
 assert.equal(s.minute,1);
 for(const team of s.teams)for(const p of team.players.filter(x=>x.active)){
  assert.ok(p.stamina<100,p.name+' should accumulate match fatigue');
 }
 assert.ok(midBefore-midfielder.stamina>keeperBefore-keeper.stamina,
  'a central midfielder should accumulate more baseline load than the goalkeeper');
});

test('pressing mentality accumulates more stamina cost than balanced mentality',()=>{
 const balanced=match('balanced'),pressing=match('pressing');
 Engine.drainTeamStamina(balanced);
 Engine.drainTeamStamina(pressing);
 const b=balanced.teams[0].players[6].stamina;
 const p=pressing.teams[0].players[6].stamina;
 assert.ok(p<b,'high pressing should carry a higher physical cost');
});

test('a fresh substitute keeps their own stamina instead of inheriting the tired player stamina',()=>{
 const s=match();
 const team=s.teams[0],out=team.players[6],incoming={...team.players[6],id:'fresh-mid',name:'Fresh Mid',active:false,stamina:100};
 out.stamina=12;
 team.players.push(incoming);
 substitutePlayer(s,0,out.id,incoming.id);
 assert.equal(out.active,false);
 assert.equal(incoming.active,true);
 assert.equal(incoming.stamina,100);
 assert.ok(incoming.stamina>out.stamina);
 Engine.stepMatch(s);
 assert.ok(incoming.stamina>out.stamina);
});

'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const Monitor=require('../js/match/live-monitor');
function team(name,offset=0){
 const pos=['GK','DEF','DEF','DEF','DEF','MID','MID','MID','MID','FWD','FWD'];
 return pos.map((p,i)=>({id:String(offset+i+1),name:name+' '+i,pos:p,ovr:68,morale:75,inj:0}));
}
function live(home=true){
 return {xi:team('المستخدم'),O:{xi:team('المنافس',100)},home,tac:'balanced',en:{1:61},min:0,gu:0,go:0,bx:50,by:50,ps:0,sh:[0,0],oR:0,opp:{name:'المنافس'}};
}
test('monitor advances alongside the legacy clock without mutating legacy state',()=>{
 const m=live(),before=JSON.stringify(m),monitor=Monitor.create({match:m,seed:91});
 const snap=Monitor.advance(monitor,m,12);
 assert.equal(snap.minute,12);assert.equal(monitor.shadow.source,'read-only-shadow');
 assert.equal(JSON.stringify(m),before);
 assert.match(Monitor.render(monitor,m),/المحاكاة الموازية/);
 assert.match(Monitor.render(monitor,m),/لا تغيّر نتيجة المسيرة أو الحفظ/);
});
test('monitor mirrors a live substitution and keeps eleven active players',()=>{
 const m=live(),monitor=Monitor.create({match:m,seed:92}),out=m.xi[5];
 const incoming={id:'bench-1',name:'بديل الوسط',pos:'MID',ovr:72,morale:80,inj:0};
 m.xi[5]=incoming;
 Monitor.sync(monitor,m);
 const side=monitor.shadow.userTeamId,players=monitor.shadow.state.teams[side].players;
 assert.equal(players.filter(p=>p.active).length,11);
 assert.equal(players.find(p=>p.id===String(out.id)).active,false);
 assert.equal(players.find(p=>p.id==='bench-1').active,true);
 assert.equal(monitor.shadow.state.substitutions[side],1);
});
test('monitor mirrors a dismissal without inventing a replacement',()=>{
 const m=live(),monitor=Monitor.create({match:m,seed:93}),sentOff=m.xi.pop();
 Monitor.sync(monitor,m);
 const side=monitor.shadow.userTeamId,players=monitor.shadow.state.teams[side].players;
 assert.equal(players.filter(p=>p.active).length,10);
 assert.equal(players.find(p=>p.id===String(sentOff.id)).active,false);
 assert.ok(monitor.shadow.state.teams[1-side].players.some(p=>p.active));
});
test('monitor maps the user team correctly in an away match',()=>{
 const m=live(false),monitor=Monitor.create({match:m,seed:94});
 const snap=Monitor.advance(monitor,m,1);
 assert.equal(monitor.shadow.userTeamId,1);
 assert.equal(snap.minute,1);
});

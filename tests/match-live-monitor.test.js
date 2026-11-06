'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
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
 const substitute=players.find(p=>p.id==='bench-1');
 assert.equal(substitute.active,true);
 assert.equal(substitute.baseX,players.find(p=>p.id===String(out.id)).baseX);
 assert.equal(substitute.baseY,players.find(p=>p.id===String(out.id)).baseY);
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

test('live game page loads monitor dependencies before its controller and parses',()=>{
 const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
 const scripts=['engine.js','adapter.js','live-bridge.js','substitutions.js','live-monitor.js'];
 let previous=-1;
 for(const file of scripts){
  const position=html.indexOf('src="js/match/'+file+'"');
  assert.ok(position>previous,'script '+file+' must be loaded in dependency order');
  previous=position;
 }
 const marker="<script>\nconst KEY='fm_web_pro_v2';";
 const start=html.indexOf(marker);
 assert.ok(start>=0,'main game controller script exists');
 const bodyStart=start+marker.length;
 const end=html.indexOf('</script>',bodyStart);
 assert.ok(end>bodyStart,'main game controller script closes');
 new vm.Script('const KEY=\'fm_web_pro_v2\';'+html.slice(bodyStart,end));
 assert.match(html,/initShadowMonitor\(\)/);
 assert.match(html,/advanceShadowMonitor\(\)/);
 assert.match(html,/shadowMonitorHtml\(\)/);
});

test('monitor reports the exact stage when shadow creation fails',()=>{
 assert.throws(()=>Monitor.create({match:{xi:[],O:{xi:[]}}}),/\[FM4 shadow CREATE\]/);
});
test('monitor reports sync failures with a stage label',()=>{
 const m=live(),monitor=Monitor.create({match:m,seed:95});
 assert.throws(()=>Monitor.sync(monitor,null),/\[FM4 shadow SYNC\]/);
});
test('monitor reports advance failures without changing the live match',()=>{
 const m=live(),monitor=Monitor.create({match:m,seed:96}),before=JSON.stringify(m);
 assert.throws(()=>Monitor.advance(monitor,null,1),/\[FM4 shadow ADVANCE>SYNC\]/);
 assert.equal(JSON.stringify(m),before);
});

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
test('shadow monitor snapshot restores events, deduplication and deterministic continuation',()=>{
 const m=live(),first=Monitor.create({match:m,seed:712}),event={eventId:'persisted-legacy-event',type:'corner',teamId:0,minute:0};
 Monitor.advance(first,m,13);
 first.shadow.state.actionCount=10;
 first.shadow.state.transition={team:1,expiresAtAction:13};
 assert.equal(Monitor.recordLegacyEvent(first,event),true);
 const stored=JSON.parse(JSON.stringify(Monitor.serialize(first)));
 const restored=Monitor.restore(stored);
 assert.equal(restored.shadow.state.actionCount,first.shadow.state.actionCount);
 assert.deepEqual(restored.shadow.state.transition,first.shadow.state.transition);
 assert.equal(Monitor.recordLegacyEvent(restored,event),false);
 assert.deepEqual(Monitor.render(restored,m),Monitor.render(first,m));
 Monitor.advance(first,m,9);
 Monitor.advance(restored,m,9);
 const strip=state=>{const {random,...plain}=state;return plain};
 assert.deepEqual(strip(restored.shadow.state),strip(first.shadow.state));
 assert.equal(restored.shadow.state.random.state,first.shadow.state.random.state);
 assert.equal(restored.steps,first.steps);
 assert.throws(()=>Monitor.restore({schemaVersion:1,shadow:{state:{}}}),/RESTORE/);
});
test('monitor records supported legacy incidents once without changing match simulation state',()=>{
 const m=live(),monitor=Monitor.create({match:m,seed:940}),state=monitor.shadow.state;
 const before={minute:state.minute,score:state.score.slice(),possession:state.possession.slice(),shots:state.shots.slice(),random:state.random};
 const types=['yellow_card','second_yellow','red_card','penalty','corner','free_kick','injury'];
 types.forEach((type,i)=>{
  assert.equal(Monitor.recordLegacyEvent(monitor,{eventId:'legacy-test-'+i,type,teamId:i%2,minute:12,playerId:'p-'+i,playerName:'لاعب '+i}),true);
  assert.equal(Monitor.recordLegacyEvent(monitor,{eventId:'legacy-test-'+i,type,teamId:i%2,minute:12,playerId:'p-'+i,playerName:'لاعب '+i}),false);
 });
 assert.equal(state.events.length,types.length);
 assert.deepEqual(state.events.map(e=>e.type),types);
 assert.ok(state.events.every(e=>e.source==='legacy'&&e.minute===12));
 assert.equal(state.minute,before.minute);
 assert.deepEqual(state.score,before.score);
 assert.deepEqual(state.possession,before.possession);
 assert.deepEqual(state.shots,before.shots);
 assert.equal(state.random,before.random);
 assert.throws(()=>Monitor.recordLegacyEvent(monitor,{eventId:'bad',type:'unknown',teamId:0}),/LEGACY_EVENT/);
 assert.throws(()=>Monitor.recordLegacyEvent(monitor,{eventId:'missing-team',type:'corner',teamId:4}),/LEGACY_EVENT/);
 assert.throws(()=>Monitor.recordLegacyEvent(monitor,{type:'corner',teamId:0}),/LEGACY_EVENT/);
});
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
test('monitor preserves the goalkeeper role and slot after a goalkeeper substitution',()=>{
 const m=live(),monitor=Monitor.create({match:m,seed:935});
 const outgoing=m.xi[0];
 const incoming={id:'bench-goalkeeper',name:'الحارس البديل',pos:'GK',ovr:74,morale:80,inj:0};
 m.xi[0]=incoming;
 Monitor.sync(monitor,m);
 const side=monitor.shadow.userTeamId,players=monitor.shadow.state.teams[side].players;
 const oldKeeper=players.find(p=>p.id===String(outgoing.id));
 const newKeeper=players.find(p=>p.id===incoming.id);
 assert.equal(oldKeeper.active,false);
 assert.equal(newKeeper.active,true);
 assert.equal(newKeeper.role,'GK');
 assert.equal(newKeeper.x,oldKeeper.x);
 assert.equal(newKeeper.y,oldKeeper.y);
 assert.equal(players.filter(p=>p.active).length,11);
 assert.equal(monitor.shadow.state.substitutions[side],1);
});
test('monitor records two substitutions made between sync calls',()=>{
 const m=live(),monitor=Monitor.create({match:m,seed:933});
 const side=monitor.shadow.userTeamId;
 const outA=m.xi[5],outB=m.xi[6];
 const inA={id:'bench-batch-a',name:'بديل أ',pos:'MID',ovr:72,morale:80,inj:0};
 const inB={id:'bench-batch-b',name:'بديل ب',pos:'MID',ovr:71,morale:80,inj:0};
 m.xi[5]=inA;m.xi[6]=inB;
 Monitor.sync(monitor,m);
 const players=monitor.shadow.state.teams[side].players;
 assert.equal(players.filter(p=>p.active).length,11);
 assert.equal(players.find(p=>p.id===String(outA.id)).active,false);
 assert.equal(players.find(p=>p.id===String(outB.id)).active,false);
 assert.equal(players.find(p=>p.id===inA.id).active,true);
 assert.equal(players.find(p=>p.id===inB.id).active,true);
 assert.equal(monitor.shadow.state.substitutions[side],2);
 assert.equal(monitor.shadow.state.substitutionLog.length,2);
});
test('monitor records multiple substitutions after a dismissal without restoring the sent-off player',()=>{
 const m=live(),monitor=Monitor.create({match:m,seed:936});
 const sentOff=m.xi.pop();
 Monitor.sync(monitor,m);
 const side=monitor.shadow.userTeamId;
 const outA=m.xi[5],outB=m.xi[6];
 const inA={id:'bench-red-batch-a',name:'بديل بعد الطرد أ',pos:'MID',ovr:72,morale:80,inj:0};
 const inB={id:'bench-red-batch-b',name:'بديل بعد الطرد ب',pos:'MID',ovr:73,morale:80,inj:0};
 m.xi[5]=inA;m.xi[6]=inB;
 Monitor.sync(monitor,m);
 const players=monitor.shadow.state.teams[side].players;
 assert.equal(players.filter(p=>p.active).length,10);
 assert.equal(players.find(p=>p.id===String(sentOff.id)).active,false);
 assert.equal(players.find(p=>p.id===String(outA.id)).active,false);
 assert.equal(players.find(p=>p.id===String(outB.id)).active,false);
 assert.equal(players.find(p=>p.id===inA.id).active,true);
 assert.equal(players.find(p=>p.id===inB.id).active,true);
 assert.equal(monitor.shadow.state.substitutions[side],2);
 assert.equal(monitor.shadow.state.substitutionLog.length,2);
});
test('monitor rejects an over-limit batch atomically without partially applying substitutions',()=>{
 const m=live(),monitor=Monitor.create({match:m,seed:937});
 const side=monitor.shadow.userTeamId;
 monitor.shadow.state.substitutions[side]=4;
 const outA=m.xi[5],outB=m.xi[6];
 const inA={id:'bench-atomic-a',name:'بديل ذري أ',pos:'MID',ovr:72,morale:80,inj:0};
 const inB={id:'bench-atomic-b',name:'بديل ذري ب',pos:'MID',ovr:73,morale:80,inj:0};
 m.xi[5]=inA;m.xi[6]=inB;
 assert.throws(()=>Monitor.sync(monitor,m),/\[FM4 shadow SYNC\].*Maximum of five substitutions reached/);
 const players=monitor.shadow.state.teams[side].players;
 assert.equal(players.find(p=>p.id===String(outA.id)).active,true);
 assert.equal(players.find(p=>p.id===String(outB.id)).active,true);
 assert.equal(players.some(p=>p.id===inA.id),false);
 assert.equal(players.some(p=>p.id===inB.id),false);
 assert.equal(monitor.shadow.state.substitutions[side],4);
 assert.equal((monitor.shadow.state.substitutionLog||[]).length,0);
});
test('monitor maps simultaneous goalkeeper and striker substitutions to their correct roles',()=>{
 const m=live(),monitor=Monitor.create({match:m,seed:938});
 const oldKeeper=m.xi[0],oldStriker=m.xi[9];
 const newKeeper={id:'bench-mixed-gk',name:'الحارس الجديد',pos:'GK',ovr:74,morale:80,inj:0};
 const newStriker={id:'bench-mixed-st',name:'المهاجم الجديد',pos:'FWD',ovr:76,morale:80,inj:0};
 m.xi[0]=newKeeper;m.xi[9]=newStriker;
 Monitor.sync(monitor,m);
 const side=monitor.shadow.userTeamId,players=monitor.shadow.state.teams[side].players;
 assert.equal(players.find(p=>p.id===newKeeper.id).role,'GK');
 assert.equal(players.find(p=>p.id===newStriker.id).role,'ST');
 assert.equal(players.find(p=>p.id===String(oldKeeper.id)).active,false);
 assert.equal(players.find(p=>p.id===String(oldStriker.id)).active,false);
 assert.equal(players.filter(p=>p.active).length,11);
 assert.equal(monitor.shadow.state.substitutions[side],2);
});
test('monitor surfaces a substitution registration failure instead of hiding it',()=>{
 const m=live(),monitor=Monitor.create({match:m,seed:934});
 const side=monitor.shadow.userTeamId;
 monitor.shadow.state.substitutions[side]=5;
 m.xi[5]={id:'bench-over-limit',name:'بديل زائد',pos:'MID',ovr:70,morale:80,inj:0};
 assert.throws(()=>Monitor.sync(monitor,m),/\[FM4 shadow SYNC\].*Maximum of five substitutions reached/);
});
test('monitor mirrors a dismissal without inventing a replacement',()=>{
 const m=live(),monitor=Monitor.create({match:m,seed:93}),sentOff=m.xi.pop();
 Monitor.sync(monitor,m);
 const side=monitor.shadow.userTeamId,players=monitor.shadow.state.teams[side].players;
 assert.equal(players.filter(p=>p.active).length,10);
 assert.equal(players.find(p=>p.id===String(sentOff.id)).active,false);
 assert.ok(monitor.shadow.state.teams[1-side].players.some(p=>p.active));
});
test('monitor records a substitution after the user team has been reduced by a dismissal',()=>{
 const m=live(),monitor=Monitor.create({match:m,seed:932});
 const sentOff=m.xi.pop();
 Monitor.sync(monitor,m);
 const side=monitor.shadow.userTeamId;
 assert.equal(monitor.shadow.state.teams[side].players.filter(p=>p.active).length,10);
 const outgoing=m.xi[5],incoming={id:'bench-after-red',name:'بديل بعد الطرد',pos:'MID',ovr:73,morale:80,inj:0};
 m.xi[5]=incoming;
 Monitor.sync(monitor,m);
 const players=monitor.shadow.state.teams[side].players;
 assert.equal(players.filter(p=>p.active).length,10);
 assert.equal(players.find(p=>p.id===String(sentOff.id)).active,false);
 assert.equal(players.find(p=>p.id===String(outgoing.id)).active,false);
 assert.equal(players.find(p=>p.id===incoming.id).active,true);
 assert.equal(monitor.shadow.state.substitutions[side],1);
 assert.equal(monitor.shadow.state.substitutionLog.length,1);
 assert.equal(monitor.shadow.state.substitutionLog[0].outgoingId,String(outgoing.id));
 assert.equal(monitor.shadow.state.substitutionLog[0].incomingId,incoming.id);
});
test('monitor mirrors the exact opponent dismissed player instead of dropping the last lineup entry',()=>{
 const m=live(),monitor=Monitor.create({match:m,seed:931});
 const sentOff=m.O.xi[4];
 m.oSentOff=[String(sentOff.id)];m.oR=1;
 Monitor.sync(monitor,m);
 const side=1-monitor.shadow.userTeamId,players=monitor.shadow.state.teams[side].players;
 assert.equal(players.filter(p=>p.active).length,10);
 assert.equal(players.find(p=>p.id===String(sentOff.id)).active,false);
 assert.equal(players.find(p=>p.id===String(m.O.xi[10].id)).active,true);
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
 assert.match(html,/recordShadowLegacyEvent\('yellow_card'/);
 assert.match(html,/recordShadowLegacyEvent\('second_yellow'/);
 assert.match(html,/recordShadowLegacyEvent\('red_card'/);
 assert.match(html,/recordShadowLegacyEvent\('penalty'/);
 assert.match(html,/recordShadowLegacyEvent\('corner'/);
 assert.match(html,/recordShadowLegacyEvent\('free_kick'/);
 assert.match(html,/recordShadowLegacyEvent\('injury'/);
 assert.match(html,/shadowMonitorHtml\(\)/);
 assert.match(html,/function opponentOnPitch\(\)/);
 assert.match(html,/M\.oSentOff\.push\(String\(p\.id\)\)/);
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

test('monitor labels render failures and preserves the underlying stack',()=>{
 const Bridge=require('../js/match/live-bridge');
 const m=live(),monitor=Monitor.create({match:m,seed:97});
 const original=Bridge.snapshotShadow;
 Bridge.snapshotShadow=()=>{throw new Error('render-probe-failure')};
 try{
  assert.throws(()=>Monitor.render(monitor,m),e=>e.message.includes('[FM4 shadow RENDER]')&&e.stack.includes('render-probe-failure'));
 }finally{Bridge.snapshotShadow=original;}
});


test('browser scripts expose all match modules without global lexical collisions',()=>{
 const context={console};
 context.window=context;
 vm.createContext(context);
 for(const file of ['engine.js','adapter.js','live-bridge.js','substitutions.js','live-monitor.js']){
  const source=fs.readFileSync(path.join(__dirname,'..','js','match',file),'utf8');
  assert.doesNotThrow(()=>vm.runInContext(source,context,{filename:file}),file+' must load as a browser script');
 }
 for(const name of ['FM4MatchEngine','FM4MatchAdapter','FM4LiveBridge','FM4Substitutions','FM4ShadowMonitor']){
  assert.ok(context[name],name+' must be exposed on window');
 }
 const match=live();
 const monitor=context.FM4ShadowMonitor.create({match,seed:98});
 assert.equal(context.FM4ShadowMonitor.advance(monitor,match,1).minute,1);
 assert.match(context.FM4ShadowMonitor.render(monitor,match),/المحاكاة الموازية/);
});

test('monitor matches later simultaneous substitutions to stable formation slots after earlier swaps',()=>{
 const m=live(),monitor=Monitor.create({match:m,seed:939});
 const side=monitor.shadow.userTeamId;
 const firstStriker=m.xi[9],firstMid=m.xi[5];
 const subStriker={id:'slot-striker-one',name:'مهاجم بديل أول',pos:'FWD',ovr:74,morale:80,inj:0};
 const subMid={id:'slot-mid-one',name:'وسط بديل أول',pos:'MID',ovr:73,morale:80,inj:0};
 m.shadowSlots={};m.xi.forEach((p,i)=>{m.shadowSlots[p.id]=i;});
 m.xi[9]=subStriker;m.shadowSlots[subStriker.id]=m.shadowSlots[firstStriker.id];Monitor.sync(monitor,m);
 m.xi[5]=subMid;m.shadowSlots[subMid.id]=m.shadowSlots[firstMid.id];Monitor.sync(monitor,m);
 const secondMid={id:'slot-mid-two',name:'وسط بديل ثان',pos:'MID',ovr:75,morale:80,inj:0};
 const secondStriker={id:'slot-striker-two',name:'مهاجم بديل ثان',pos:'FWD',ovr:76,morale:80,inj:0};
 m.xi[5]=secondMid;m.shadowSlots[secondMid.id]=m.shadowSlots[subMid.id];
 m.xi[9]=secondStriker;m.shadowSlots[secondStriker.id]=m.shadowSlots[subStriker.id];
 Monitor.sync(monitor,m);
 const players=monitor.shadow.state.teams[side].players;
 assert.equal(players.find(p=>p.id===secondMid.id).role,players.find(p=>p.id===String(firstMid.id)).role);
 assert.equal(players.find(p=>p.id===secondStriker.id).role,players.find(p=>p.id===String(firstStriker.id)).role);
 assert.equal(players.find(p=>p.id===secondMid.id).x,players.find(p=>p.id===String(firstMid.id)).x);
 assert.equal(players.find(p=>p.id===secondStriker.id).x,players.find(p=>p.id===String(firstStriker.id)).x);
 assert.equal(monitor.shadow.state.substitutions[side],4);
});

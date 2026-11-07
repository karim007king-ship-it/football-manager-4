(function(){
'use strict';
// Read-only comparison monitor. The legacy match object is only read; all
// simulation and lineup synchronization happen in the isolated shadow state.
const bridgeApi=()=>typeof module!=='undefined'&&module.exports?require('./live-bridge'):window.FM4LiveBridge;
const adapterApi=()=>typeof module!=='undefined'&&module.exports?require('./adapter'):window.FM4MatchAdapter;
const subApi=()=>typeof module!=='undefined'&&module.exports?require('./substitutions'):window.FM4Substitutions;
 const engineApi=()=>typeof module!=='undefined'&&module.exports?require('./engine'):window.FM4MatchEngine;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function stageError(stage,error){
 const message=String(error&&error.message||error||'Unknown error');
 const wrapped=new Error('[FM4 shadow '+stage+'] '+message);
 wrapped.stage=stage;wrapped.cause=error;
 wrapped.stack=wrapped.message+'\\nCaused by: '+String(error&&error.stack||error||'Unknown error');
 if(typeof console!=='undefined'&&console.error)console.error('[FM4 shadow '+stage+']',error&&error.stack||error);
 return wrapped;
}

const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function makeTeamLineup(match,userSide){
 const away=!match.home;
 if(userSide){
  return {teamId:match.home?0:1,players:match.xi,side:away?1:0,name:'فريقي',mentality:match.tac||'balanced',energy:match.en||{}};
 }
 const sentOff=Array.isArray(match.oSentOff)?new Set(match.oSentOff.map(String)):null;
 const players=sentOff?match.O.xi.filter(p=>!sentOff.has(String(p.id))):match.O.xi.slice(0,Math.max(0,match.O.xi.length-(Number(match.oR)||0)));
 return {teamId:match.home?1:0,players,side:match.home?1:0,name:match.opp?.name||'الخصم',mentality:'balanced',energy:{}};
}
function mappedPlayers(match,userSide){
 const x=makeTeamLineup(match,userSide);
 if(!Array.isArray(x.players)||x.players.length<7)return null;
 return adapterApi().toEngineTeam({...x,slotIndices:match.shadowSlots||{}}).players;
}
function ensurePlayer(team,p){
 let found=team.players.find(x=>x.id===p.id);
 if(!found){
  found={...p,active:false,baseX:p.x,baseY:p.y,direction:team.id===0?1:-1};
  team.players.push(found);
 }
 return found;
}
function syncTeam(state,teamId,mapped){
 if(!mapped)return;
 const team=state.teams[teamId],wanted=new Set(mapped.map(p=>p.id));
 const leaving=team.players.filter(p=>p.active&&!wanted.has(p.id));
 const incoming=mapped.filter(p=>!team.players.some(x=>x.id===p.id&&x.active));
 if(leaving.length>0&&incoming.length===leaving.length){
  // Match changes by their stable formation slot, never by array order.
  // Substitutes may be appended to the engine roster in a different order
  // from the live lineup after earlier substitutions.
  if(!state.substitutions)state.substitutions=[0,0];
  const used=Number(state.substitutions[teamId]||0);
  if(used+leaving.length>5)throw new Error('Maximum of five substitutions reached');
  const pairs=leaving.map(out=>({out,incoming:incoming.find(p=>p.slotIndex===out.slotIndex)}));
  if(pairs.some(pair=>!pair.incoming))throw new Error('Unable to match substitution to its original formation slot');
  const activeBefore=team.players.filter(p=>p.active).length;
  if(activeBefore<7||activeBefore>11)throw new Error('A valid substitution requires 7 to 11 active players');
  for(const pair of pairs){
   if(pair.out===pair.incoming||!pair.out.active)throw new Error('Invalid outgoing player in substitution batch');
   const existing=team.players.find(p=>p.id===pair.incoming.id);
   if(existing&&existing.active)throw new Error('Incoming player is already active');
  }
  // Add substitutes only after the complete batch passes preflight.
  pairs.forEach(pair=>ensurePlayer(team,pair.incoming));
  pairs.forEach(pair=>subApi().substitutePlayer(state,teamId,pair.out.id,pair.incoming.id));
 }else if(incoming.length>0){
  throw new Error('Incoming players must match outgoing formation slots');
 }
 team.players.forEach(p=>{p.active=wanted.has(p.id)});
}
function repairCarrier(state){
 const current=state.teams[state.ball.team]?.players.find(p=>p.active&&p.id===state.ball.playerId);
 if(current)return;
 let best=null,d=Infinity;
 state.teams.forEach(t=>t.players.forEach(p=>{
  if(!p.active)return;
  const n=Math.hypot(p.x-state.ball.x,p.y-state.ball.y);
  if(n<d){d=n;best={team:t.id,player:p};}
 }));
 if(best)state.ball={x:best.player.x,y:best.player.y,team:best.team,playerId:best.player.id};
}
function create({match,seed=1,userTeamName='فريقي',opponentTeamName}={}){
 try{
  const shadow=bridgeApi().createShadowFromLive({match,seed,userTeamName,opponentTeamName:opponentTeamName||match?.opp?.name||'الخصم'});
  shadow.state.substitutions=[0,0];
  return {shadow,steps:0,lastError:null};
 }catch(error){throw stageError('CREATE',error);}
}
function sync(monitor,match){
 try{
  if(!monitor?.shadow?.state||!match)throw new Error('Monitor and live match are required');
  const shadow=monitor.shadow,state=shadow.state,user=shadow.userTeamId,opp=1-user;
  const userMapped=mappedPlayers(match,true),opponentMapped=mappedPlayers(match,false);
  syncTeam(state,user,userMapped);
  syncTeam(state,opp,opponentMapped);
  repairCarrier(state);
  return bridgeApi().snapshotShadow(shadow);
 }catch(error){throw stageError('SYNC',error);}
}
function advance(monitor,match,minutes=1){
 try{
  sync(monitor,match);
  const result=bridgeApi().stepShadow(monitor.shadow,minutes);
  monitor.steps+=Math.max(0,Math.floor(Number(minutes)||0));
  return result;
 }catch(error){throw stageError(error&&error.stage?'ADVANCE>'+error.stage:'ADVANCE',error);}
}

function serialize(monitor){
 try{
  if(!monitor?.shadow?.state)throw new Error('An active shadow monitor is required');
  const state=monitor.shadow.state;
  if(typeof state.random!=='function'||!Number.isInteger(state.random.state))throw new Error('Shadow random state is not serializable');
  return {
   schemaVersion:1,steps:Number(monitor.steps)||0,lastError:monitor.lastError||null,
   legacyEventIds:Array.from(monitor.legacyEventIds||[]),
   shadow:{userTeamId:monitor.shadow.userTeamId,legacyMinute:monitor.shadow.legacyMinute,
    legacyScore:Array.isArray(monitor.shadow.legacyScore)?monitor.shadow.legacyScore.slice():null,
    source:monitor.shadow.source,
    state:{...state,random:undefined,randomState:state.random.state}}
  };
 }catch(error){throw stageError('SERIALIZE',error);}
}
function restore(snapshot){
 try{
  if(!snapshot||snapshot.schemaVersion!==1||!snapshot.shadow||!snapshot.shadow.state)throw new Error('Unsupported or incomplete shadow snapshot');
  const raw=snapshot.shadow,state={...raw.state},user=Number(raw.userTeamId),rng=Number(state.randomState);
  if((user!==0&&user!==1)||!Array.isArray(state.teams)||state.teams.length!==2||!Array.isArray(state.score)||!Array.isArray(state.events)||!state.ball||!Number.isInteger(rng)||rng<0||rng>0xffffffff)throw new Error('Invalid shadow snapshot data');
  delete state.randomState;state.random=engineApi().restoreRandom(rng);
  return {shadow:{...raw,state},steps:Math.max(0,Math.floor(Number(snapshot.steps)||0)),lastError:snapshot.lastError||null,legacyEventIds:new Set(Array.isArray(snapshot.legacyEventIds)?snapshot.legacyEventIds.map(String):[])};
 }catch(error){throw stageError('RESTORE',error);}
}
const LEGACY_EVENT_TYPES=new Set(['yellow_card','second_yellow','red_card','penalty','corner','free_kick','injury']);
function recordLegacyEvent(monitor,event){
 try{
  if(!monitor?.shadow?.state||!event||!LEGACY_EVENT_TYPES.has(event.type))throw new Error('A supported legacy event and active monitor are required');
  const id=String(event.eventId??'');
  if(!id)throw new Error('Legacy event ID is required for deduplication');
  if(!monitor.legacyEventIds)monitor.legacyEventIds=new Set();
  if(monitor.legacyEventIds.has(id))return false;
  const state=monitor.shadow.state,team=Number(event.teamId);
  if(team!==0&&team!==1)throw new Error('Legacy event team must be 0 or 1');
  const minute=clamp(Math.floor(Number(event.minute)||state.minute),0,120);
  state.events.push({
   type:event.type,minute,team,
   playerId:event.playerId==null?null:String(event.playerId),
   playerName:event.playerName==null?'':String(event.playerName),
   source:'legacy',eventId:id
  });
  if(state.events.length>300)state.events.shift();
  monitor.legacyEventIds.add(id);
  return true;
 }catch(error){throw stageError('LEGACY_EVENT',error);}
}
function render(monitor,match){
 try{
 if(!monitor?.shadow?.state)return '';
 const s=monitor.shadow.state,u=monitor.shadow.userTeamId,o=1-u;
 const snap=bridgeApi().snapshotShadow(monitor.shadow);
 const cmp=bridgeApi().compareWithLegacy(monitor.shadow,match);
 const total=s.possession[0]+s.possession[1];
 const userPoss=total?Math.round(s.possession[u]/total*100):50;
 const oppPoss=100-userPoss;
 const userShots=s.shots[u]||0,oppShots=s.shots[o]||0;
 const userPass=s.completedPasses[u]||0,oppPass=s.completedPasses[o]||0;
 const active=snap.activePlayers;
 const last=s.events.slice(-3).reverse().map(e=>{
  const t=s.teams[e.team]?.name||'الفريق',p=s.teams[e.team]?.players.find(x=>x.id===e.playerId);
  const labels={carry:'تقدم بالكرة',pass:'تمريرة',interception:'اعتراض',clearance:'إبعاد دفاعي',rebound:'كرة مرتدة',tackle:'افتكاك',shot:'تسديدة',save:'تصدي',goal:'هدف',yellow_card:'بطاقة صفراء',second_yellow:'إنذار ثانٍ وطرد',red_card:'بطاقة حمراء',penalty:'ركلة جزاء',corner:'ركنية',free_kick:'ضربة حرة',injury:'إصابة'};
  const second=e.secondBall;
  const secondPlayer=second&&s.teams[second.team]?.players.find(x=>x.id===second.playerId);
  const secondLabel=second?(second.outcome==='retained'?' • الدفاع يحتفظ بالكرة الثانية':' • الخصم يستعيد الكرة الثانية')+(secondPlayer?' ('+esc(secondPlayer.name)+')':''):'';
  return '<div style="font-size:11px;color:#cbd5e1;margin-top:3px">'+esc(e.minute)+"' • "+esc(t)+' • '+esc(labels[e.type]||e.type)+(p?' — '+esc(p.name):'')+secondLabel+'</div>';
 }).join('');
 const scoreDiff=(cmp.score.engine[0]===cmp.score.legacy[0]&&cmp.score.engine[1]===cmp.score.legacy[1])?'متطابق':'مختلف';
 return `<section id="fm4-shadow-monitor" style="margin:10px 0;padding:10px;border:1px solid #53708a;border-radius:10px;background:#101c2a;color:#e8eef5;text-align:right">
  <div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><b style="font-size:13px">🧪 المحاكاة الموازية — وضع آمن</b><span style="font-size:10px;color:#8ed6a5">لا تغيّر نتيجة المسيرة أو الحفظ</span></div>
  <div style="font-size:12px;margin-top:7px">الدقيقة: <b>${snap.minute}'</b> | نتيجة المحرك: <b>${snap.userScore} - ${snap.opponentScore}</b> | نتيجة اللعبة: <b>${match.gu} - ${match.go}</b></div>
  <div style="font-size:11px;color:#cbd5e1;margin-top:5px">استحواذ المحرك: ${userPoss}% - ${oppPoss}% | تسديدات: ${userShots} - ${oppShots}</div>
  <div style="font-size:11px;color:#cbd5e1;margin-top:3px">تمريرات مكتملة: ${userPass} - ${oppPass} | لاعبو المحرك: ${active[u]} - ${active[o]} | أحداث: ${snap.eventCount}</div>
  <div style="font-size:10px;color:#f4c979;margin-top:5px">مقارنة النتيجة: ${scoreDiff} • تسديدات اللعبة القديمة: ${cmp.shots.legacy[0]} - ${cmp.shots.legacy[1]} • استحواذها: ${cmp.possession.legacy}%</div>
  ${last||'<div style="font-size:11px;color:#aab8c8;margin-top:4px">بانتظار أحداث المحرك...</div>'}
 </section>`;
 }catch(error){throw stageError('RENDER',error);}
}
const FM4ShadowMonitor={create,sync,advance,render,recordLegacyEvent,serialize,restore};
if(typeof module!=='undefined'&&module.exports)module.exports=FM4ShadowMonitor;
if(typeof window!=='undefined')window.FM4ShadowMonitor=FM4ShadowMonitor;

})();

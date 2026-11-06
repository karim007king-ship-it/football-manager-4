(function(){
'use strict';
// Read-only comparison monitor. The legacy match object is only read; all
// simulation and lineup synchronization happen in the isolated shadow state.
const bridgeApi=()=>typeof module!=='undefined'&&module.exports?require('./live-bridge'):window.FM4LiveBridge;
const adapterApi=()=>typeof module!=='undefined'&&module.exports?require('./adapter'):window.FM4MatchAdapter;
const subApi=()=>typeof module!=='undefined'&&module.exports?require('./substitutions'):window.FM4Substitutions;
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
 return adapterApi().toEngineTeam(x).players;
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
 incoming.forEach(p=>ensurePlayer(team,p));
 if(leaving.length>0&&leaving.length===incoming.length){
  // Mirror every balanced lineup change in order. Do not hide substitution
  // errors: the caller must see a failed shadow sync rather than false success.
  if(!state.substitutions)state.substitutions=[0,0];
  const used=Number(state.substitutions[teamId]||0);
  // Preflight the whole batch so a later failure cannot leave a half-applied
  // lineup change in the shadow state.
  if(used+leaving.length>5)throw new Error('Maximum of five substitutions reached');
  for(let i=0;i<leaving.length;i++){
   subApi().substitutePlayer(state,teamId,leaving[i].id,incoming[i].id);
  }
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
  const labels={carry:'تقدم بالكرة',pass:'تمريرة',interception:'اعتراض',tackle:'افتكاك',shot:'تسديدة',save:'تصدي',goal:'هدف'};
  return '<div style="font-size:11px;color:#cbd5e1;margin-top:3px">'+esc(e.minute)+"' • "+esc(t)+' • '+esc(labels[e.type]||e.type)+(p?' — '+esc(p.name):'')+'</div>';
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
const FM4ShadowMonitor={create,sync,advance,render};
if(typeof module!=='undefined'&&module.exports)module.exports=FM4ShadowMonitor;
if(typeof window!=='undefined')window.FM4ShadowMonitor=FM4ShadowMonitor;

})();

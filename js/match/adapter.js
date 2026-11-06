(function(){
'use strict';
// Converts FM4's legacy player/match shape into the isolated match-engine schema.
// FM4 currently stores overall rating (ovr), morale and injury status rather than
// individual technical attributes, so skill values below are transparent estimates.
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const engineApi=()=>typeof module!=='undefined'&&module.exports?require('./engine'):window.FM4MatchEngine;
const round=v=>Math.round(clamp(Number(v)||0,1,100));
const POS_ROLES={
 GK:['GK'],
 DEF:{3:['CB','CB','CB'],4:['LB','CB','CB','RB'],5:['LWB','CB','CB','CB','RWB'],6:['LB','CB','CB','CB','CB','RB']},
 MID:{2:['CM','CM'],3:['CM','DM','CM'],4:['LM','CM','CM','RM'],5:['LM','CM','DM','CM','RM']},
 FWD:{1:['ST'],2:['ST','ST'],3:['LW','ST','RW']}
};
function rolesFor(players){
 const groups={GK:[],DEF:[],MID:[],FWD:[]};
 players.forEach(p=>{const pos=String(p.pos||'').toUpperCase();if(p.active!==false&&groups[pos])groups[pos].push(p);});
 const assigned=new Map();
 for(const pos of ['GK','DEF','MID','FWD']){
  const list=groups[pos],roles=pos==='GK'?POS_ROLES.GK:(POS_ROLES[pos][list.length]||list.map(()=>pos==='DEF'?'CB':pos==='MID'?'CM':'ST'));
  list.forEach((p,i)=>assigned.set(p.id,roles[i]||roles[roles.length-1]||pos));
 }
 players.filter(p=>p.active===false).forEach(p=>{const pos=String(p.pos||'').toUpperCase();assigned.set(p.id,pos==='GK'?'GK':pos==='DEF'?'CB':pos==='MID'?'CM':'ST');});
 return assigned;
}
function laneY(role,index,count){
 const r=String(role).toUpperCase();
 if(/^(GK)$/.test(r))return 50;
 if(/^(LB|LWB|LM|LW)$/.test(r))return 18;
 if(/^(RB|RWB|RM|RW)$/.test(r))return 82;
 if(r==='CB')return count>=4?[25,42,58,75][index]||50:count===3?[32,50,68][index]:50;
 if(/^(DM|CDM)$/.test(r))return 50;
 if(/^(CM|AM|CAM)$/.test(r))return count===3?[30,50,70][index]:count===2?[38,62][index]:50;
 if(/^(ST|CF)$/.test(r))return count===2?[38,62][index]:50;
 return count>1?15+70*(index/(count-1)):50;
}
function estimateSkills(p,role){
 const o=round(p.ovr??60),morale=clamp(Number(p.morale??70),30,100),injured=Number(p.inj||0)>0;
 const mood=(morale-70)*.08,penalty=injured?8:0;
 const paceBoost=/^(LW|RW|LM|RM|LB|RB|LWB|RWB|ST|CF)$/.test(role)?5:0;
 const passBoost=/^(CM|DM|CDM|AM|CAM|LM|RM)$/.test(role)?6:0;
 const shotBoost=/^(ST|CF|LW|RW|AM|CAM)$/.test(role)?8:0;
 const defendBoost=/^(CB|LB|RB|LWB|RWB|DM|CDM)$/.test(role)?8:0;
 return{
  pace:round(o+paceBoost+mood-penalty),
  passing:round(o+passBoost+mood-penalty),
  // OVR is a composite rating, not a pure finishing attribute. A softer
  // conversion prevents ordinary 65-75 OVR squads from becoming elite finishers.
  shooting:round(o*.78+shotBoost*.45+mood-penalty),
  defending:round(o+defendBoost+mood-penalty)
 };
}
function toEngineTeam({name,players,side=0,mentality='balanced',energy={},adaptiveTactics=true}={}){
 if(!Array.isArray(players)||players.length<7)throw new Error('FM4 team must contain at least 7 selected players');
 const roles=rolesFor(players),counts={};
 players.forEach(p=>{const r=roles.get(p.id)||'CM';counts[r]=(counts[r]||0)+1;});
 const seen={};
 const mapped=players.map((p,i)=>{
  const role=roles.get(p.id)||'CM',n=seen[role]||0;seen[role]=n+1;
  const skills=estimateSkills(p,role),sideId=side===1?1:0;
  const xBase=role==='GK'?6:/^(CB|LB|RB|LWB|RWB)$/.test(role)?27:/^(CM|DM|CDM|LM|RM|AM|CAM)$/.test(role)?50:74;
  return{
   id:String(p.id??i),name:String(p.name||'لاعب'),role,...skills,
   stamina:round(energy[p.id]??100),x:sideId===0?xBase:100-xBase,
   y:laneY(role,n,counts[role]),active:p.active!==false
  };
 });
 return{name:String(name|| (side===0?'الفريق المضيف':'الفريق الضيف')),mentality,adaptiveTactics,players:mapped};
}
function createMatchFromGame({home,away,seed=1}={}){
 if(!home||!away)throw new Error('Home and away FM4 teams are required');
 return engineApi().createMatch({
  teams:[
   toEngineTeam({...home,side:0,adaptiveTactics:home.adaptiveTactics??false}),
   toEngineTeam({...away,side:1,adaptiveTactics:away.adaptiveTactics??true})
  ],seed
 });
}
// Safe bridge for the current live-match object. It creates a parallel engine
// state and does not mutate or replace the legacy M object.
function createMatchFromLive({match,userTeamName='فريقي',opponentTeamName='الخصم',seed=1}={}){
 if(!match||!Array.isArray(match.xi)||!match.O||!Array.isArray(match.O.xi))
  throw new Error('A live FM4 match with both selected lineups is required');
 const user=toEngineTeam({name:userTeamName,players:match.xi,side:match.home?0:1,mentality:match.tac||'balanced',energy:match.en||{},adaptiveTactics:false});
 const opponent=toEngineTeam({name:opponentTeamName,players:match.O.xi,side:match.home?1:0,mentality:'balanced',adaptiveTactics:true});
 const userTeamId=match.home?0:1;
 const state=engineApi().createMatch({teams:match.home?[user,opponent]:[opponent,user],seed});
 return{state,userTeamId};
}
const FM4MatchAdapter={toEngineTeam,createMatchFromGame,createMatchFromLive,rolesFor,estimateSkills};
if(typeof module!=='undefined'&&module.exports)module.exports=FM4MatchAdapter;
if(typeof window!=='undefined')window.FM4MatchAdapter=FM4MatchAdapter;

})();

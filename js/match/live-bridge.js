(function(){
'use strict';
// Read-only shadow bridge: runs the new engine beside the legacy live match.
// It deliberately never writes to the legacy M object or its player records.
const adapterApi=()=>typeof module!=='undefined'&&module.exports?require('./adapter'):window.FM4MatchAdapter;
const engineApi=()=>typeof module!=='undefined'&&module.exports?require('./engine'):window.FM4MatchEngine;
function createShadowFromLive({match,userTeamName='فريقي',opponentTeamName='الخصم',seed=1}={}){
 const linked=adapterApi().createMatchFromLive({match,userTeamName,opponentTeamName,seed});
 const state=linked.state,user=linked.userTeamId,minute=Math.max(0,Math.min(120,Math.floor(Number(match.min)||0)));
 state.minute=minute;
 state.score[user]=Math.max(0,Math.floor(Number(match.gu)||0));
 state.score[1-user]=Math.max(0,Math.floor(Number(match.go)||0));
 // Seed cumulative legacy statistics so the shadow comparison starts from the
 // same match point instead of comparing a fresh engine against 12+ legacy minutes.
 const elapsed=Math.max(0,minute);
 const legacyPossession=Number(match.ps);
 const userPossession=Number.isFinite(legacyPossession)
  ?Math.max(0,Math.min(elapsed,legacyPossession/100))
  :elapsed/2;
 state.possession[user]=userPossession;
 state.possession[1-user]=elapsed-userPossession;
 const legacyShots=Array.isArray(match.sh)?match.sh:[0,0];
 state.shots[user]=Math.max(0,Number(legacyShots[0])||0);
 state.shots[1-user]=Math.max(0,Number(legacyShots[1])||0);
 if(Number.isFinite(Number(match.bx)))state.ball.x=Math.max(2,Math.min(98,Number(match.bx)));
 if(Number.isFinite(Number(match.by)))state.ball.y=Math.max(2,Math.min(98,Number(match.by)));
 // The legacy UI stores ball coordinates but not a reliable carrier ID.
 // Attach the shadow ball to the nearest active player on either side.
 const nearest=state.teams.flatMap(t=>t.players.filter(p=>p.active).map(p=>({team:t.id,player:p,distance:Math.hypot(p.x-state.ball.x,p.y-state.ball.y)}))).sort((a,b)=>a.distance-b.distance)[0];
 if(nearest)state.ball={x:state.ball.x,y:state.ball.y,team:nearest.team,playerId:nearest.player.id};
 return {state,userTeamId:user,legacyMinute:minute,legacyScore:[state.score[user],state.score[1-user]],source:'read-only-shadow'};
}
function stepShadow(shadow,minutes=1){
 if(!shadow||!shadow.state)throw new Error('A shadow match is required');
 const count=Math.max(0,Math.min(120-shadow.state.minute,Math.floor(Number(minutes)||0)));
 for(let i=0;i<count;i++)engineApi().stepMatch(shadow.state);
 return snapshotShadow(shadow);
}
function snapshotShadow(shadow){
 if(!shadow||!shadow.state)throw new Error('A shadow match is required');
 const s=shadow.state,u=shadow.userTeamId,o=1-u;
 return {
  minute:s.minute,userTeamId:u,userScore:s.score[u],opponentScore:s.score[o],
  possession:s.possession.slice(),shots:s.shots.slice(),completedPasses:s.completedPasses.slice(),
  activePlayers:s.teams.map(t=>t.players.filter(p=>p.active).length),
  eventCount:s.events.length,source:shadow.source
 };
}

function compareWithLegacy(shadow,match){
 if(!shadow||!shadow.state||!match)throw new Error('Shadow and legacy match are required');
 const s=snapshotShadow(shadow),u=shadow.userTeamId,o=1-u;
 const total=s.possession[0]+s.possession[1];
 const enginePossession=total?Math.round(s.possession[u]/total*100):50;
 const legacyPossession=Number(match.min)>0?Math.round(Number(match.ps||0)/Number(match.min)):50;
 const legacyShots=Array.isArray(match.sh)?match.sh:[0,0];
 return {
  minute:{engine:s.minute,legacy:Math.max(0,Math.floor(Number(match.min)||0))},
  score:{engine:[s.userScore,s.opponentScore],legacy:[Math.max(0,Number(match.gu)||0),Math.max(0,Number(match.go)||0)]},
  possession:{engine:enginePossession,legacy:Math.max(0,Math.min(100,legacyPossession))},
  shots:{engine:[s.shots[u],s.shots[o]],legacy:[Number(legacyShots[0])||0,Number(legacyShots[1])||0]},
  activePlayers:s.activePlayers
 };
}
const FM4LiveBridge={createShadowFromLive,stepShadow,snapshotShadow,compareWithLegacy};
if(typeof module!=='undefined'&&module.exports)module.exports=FM4LiveBridge;
if(typeof window!=='undefined')window.FM4LiveBridge=FM4LiveBridge;

})();

'use strict';
// Read-only shadow bridge: runs the new engine beside the legacy live match.
// It deliberately never writes to the legacy M object or its player records.
const adapterApi=()=>typeof module!=='undefined'&&module.exports?require('./adapter'):window.FM4MatchAdapter;
const engineApi=()=>typeof module!=='undefined'&&module.exports?require('./engine'):window.FM4MatchEngine;
function createShadowFromLive({match,userTeamName='فريقي',opponentTeamName='الخصم',seed=1}={}){
 const linked=adapterApi().createMatchFromLive({match,userTeamName,opponentTeamName,seed});
 const state=linked.state,user=linked.userTeamId,minute=Math.max(0,Math.min(90,Math.floor(Number(match.min)||0)));
 state.minute=minute;
 state.score[user]=Math.max(0,Math.floor(Number(match.gu)||0));
 state.score[1-user]=Math.max(0,Math.floor(Number(match.go)||0));
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
 const count=Math.max(0,Math.min(90-shadow.state.minute,Math.floor(Number(minutes)||0)));
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
const FM4LiveBridge={createShadowFromLive,stepShadow,snapshotShadow};
if(typeof module!=='undefined'&&module.exports)module.exports=FM4LiveBridge;
if(typeof window!=='undefined')window.FM4LiveBridge=FM4LiveBridge;

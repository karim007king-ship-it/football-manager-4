'use strict';
// Read-only shadow bridge: runs the new engine beside the legacy live match.
// It deliberately never writes to the legacy M object or its player records.
const adapterApi=()=>typeof module!=='undefined'&&module.exports?require('./adapter'):window.FM4MatchAdapter;
const engineApi=()=>typeof module!=='undefined'&&module.exports?require('./engine'):window.FM4MatchEngine;
function createShadowFromLive({match,userTeamName='فريقي',opponentTeamName='الخصم',seed=1}={}){
 const linked=adapterApi().createMatchFromLive({match,userTeamName,opponentTeamName,seed});
 return {state:linked.state,userTeamId:linked.userTeamId,legacyMinute:Number(match.min)||0,legacyScore:[Number(match.gu)||0,Number(match.go)||0],source:'read-only-shadow'};
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
  minute:s.minute,
  userTeamId:u,
  userScore:s.score[u],
  opponentScore:s.score[o],
  possession:s.possession.slice(),
  shots:s.shots.slice(),
  completedPasses:s.completedPasses.slice(),
  activePlayers:s.teams.map(t=>t.players.filter(p=>p.active).length),
  eventCount:s.events.length,
  source:shadow.source
 };
}
const FM4LiveBridge={createShadowFromLive,stepShadow,snapshotShadow};
if(typeof module!=='undefined'&&module.exports)module.exports=FM4LiveBridge;
if(typeof window!=='undefined')window.FM4LiveBridge=FM4LiveBridge;

'use strict';
function substitutePlayer(state,teamId,outId,inId){
 if(!state||!Array.isArray(state.teams)||!state.teams[teamId])throw new Error('Invalid team');
 const team=state.teams[teamId],players=team.players;
 const out=players.find(p=>p.id===String(outId)),incoming=players.find(p=>p.id===String(inId));
 if(!out||!incoming)throw new Error('Player not found in selected team');
 if(out===incoming)throw new Error('Choose two different players');
 if(!out.active)throw new Error('Outgoing player is not on the pitch');
 if(incoming.active)throw new Error('Incoming player is already active');
 const used=Number(state.substitutions?.[teamId]||0);
 if(used>=5)throw new Error('Maximum of five substitutions reached');
 const activeBefore=players.filter(p=>p.active).length;
 if(activeBefore!==11)throw new Error('A valid substitution requires exactly 11 active players');
 const wasCarrier=state.ball&&state.ball.team===teamId&&state.ball.playerId===out.id;
 // The substitute inherits the vacated tactical slot, not the outgoing player's stamina.
 for(const key of ['role','x','y','baseX','baseY','direction'])if(out[key]!==undefined)incoming[key]=out[key];
 incoming.active=true;
 out.active=false;
 if(wasCarrier)state.ball={...state.ball,x:incoming.x,y:incoming.y,playerId:incoming.id};
 if(!state.substitutions)state.substitutions=[0,0];
 state.substitutions[teamId]=used+1;
 const record={team:teamId,minute:state.minute,outgoingId:out.id,incomingId:incoming.id};
 if(!Array.isArray(state.substitutionLog))state.substitutionLog=[];
 state.substitutionLog.push(record);
 return record;
}
const FM4Substitutions={substitutePlayer};
if(typeof module!=='undefined'&&module.exports)module.exports=FM4Substitutions;
if(typeof window!=='undefined')window.FM4Substitutions=FM4Substitutions;

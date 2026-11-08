(function(){
'use strict';
function fail(message){const e=new Error('[FM4 match session] '+message);e.stage='MATCH_SESSION';throw e;}
function serialize({match,game,shadowSnapshot=null}={}){
 if(!match||!game)fail('A live match and career state are required');
 if(match.done||match.so||match.hold||!Array.isArray(match.q)||match.q.length)fail('Match is not at a safe checkpoint');
 if(!Array.isArray(match.xi)||!Array.isArray(match.O?.xi)||!(match.out instanceof Set)||!(match.hurt instanceof Set))fail('Live match state is incomplete');
 const payload={
  ...match,xi:undefined,xiIds:match.xi.map(p=>String(p.id)),
  O:{...match.O,xi:undefined,xiIds:match.O.xi.map(p=>String(p.id))},
  opp:undefined,oppId:String(match.opp?.id??''),bst:undefined,bstId:match.bst?String(match.bst.id):null,
  out:undefined,outIds:Array.from(match.out,String),hurt:undefined,hurtIds:Array.from(match.hurt,String),
  q:[],t:undefined,hold:false,skip:false,done:false
 };
 const clean=JSON.parse(JSON.stringify(payload));
 return {schemaVersion:1,game:{uid:game.uid,season:game.season,round:game.round,opponentId:clean.oppId,cup:!!match.cup},match:clean,shadowSnapshot};
}
function restore(snapshot,game){
 if(!snapshot||snapshot.schemaVersion!==1||!snapshot.match||!snapshot.game||!game)fail('Unsupported or incomplete saved match');
 const sig=snapshot.game;
 if(sig.uid!==game.uid||sig.season!==game.season||sig.round!==game.round)fail('Saved match belongs to a different career position');
 const players=new Map((game.players||[]).map(p=>[String(p.id),p]));
 const clubs=new Map((game.clubs||[]).map(c=>[String(c.id),c]));
 const getPlayers=ids=>{
  if(!Array.isArray(ids)||ids.length<7)fail('Saved lineup is invalid');
  return ids.map(id=>{const p=players.get(String(id));if(!p)fail('A saved player no longer exists');return p;});
 };
 const raw=snapshot.match,opp=clubs.get(String(sig.opponentId));
 if(!opp)fail('Saved opponent no longer exists');
 const xi=getPlayers(raw.xiIds),opponentXi=getPlayers(raw.O?.xiIds);
 if(!!raw.cup!==!!sig.cup)fail('Saved match type does not match');
 const outIds=Array.isArray(raw.outIds)?raw.outIds.map(String):[];
 const hurtIds=Array.isArray(raw.hurtIds)?raw.hurtIds.map(String):[];
 const bst=raw.bstId==null?null:players.get(String(raw.bstId));
 if(raw.bstId!=null&&!bst)fail('Saved player-of-the-match reference is invalid');
 const match={...raw,xi,O:{...raw.O,xi:opponentXi},opp,bst,out:new Set(outIds),hurt:new Set(hurtIds),q:[],t:null,hold:false,skip:false,done:false};
 delete match.xiIds;delete match.oppId;delete match.bstId;delete match.outIds;delete match.hurtIds;delete match.O.xiIds;
 return {match,shadowSnapshot:snapshot.shadowSnapshot??null};
}
const FM4MatchSession={serialize,restore};
if(typeof module!=='undefined'&&module.exports)module.exports=FM4MatchSession;
if(typeof window!=='undefined')window.FM4MatchSession=FM4MatchSession;
})();
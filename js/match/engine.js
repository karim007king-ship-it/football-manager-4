(function(){
'use strict';
// FM4 match kernel v2. Coordinates 0..100; home attacks right, away left.
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const keeper=r=>/^(GK|G|GOALKEEPER)$/i.test(String(r||''));
const line=r=>{r=String(r||'').toUpperCase();if(/^(GK|G|GOALKEEPER)$/.test(r))return .07;if(/^(CB|LB|RB|LWB|RWB|DF|DEF)/.test(r))return .27;if(/^(DM|CDM|CM|LM|RM|AM|CAM|MF|MID)/.test(r))return .51;if(/^(LW|RW|ST|CF|FW|FWD)/.test(r))return .75;return .5;};
function makeRandom(seed,allowZero=false){const n=Number(seed)>>>0;let s=allowZero?n:(n||1);const next=()=>{s=(1664525*s+1013904223)>>>0;next.state=s;return s/4294967296;};next.state=s;return next;}
function restoreRandom(state){return makeRandom(Number(state)>>>0,true);}
function createMatch({teams,seed=1}={}){
 if(!Array.isArray(teams)||teams.length!==2)throw Error('Exactly two teams are required');
 const normalized=teams.map((src,tid)=>{
  if(!src||!Array.isArray(src.players)||src.players.length<7)throw Error('Each team needs at least 7 players');
  const dir=tid===0?1:-1;
  return {id:tid,name:String(src.name||(tid?'Away':'Home')),mentality:src.mentality||'balanced',adaptiveTactics:src.adaptiveTactics!==false,players:src.players.map((p,i)=>{
   const role=p.role||(i===0?'GK':i<5?'DF':i<9?'MF':'FW'),lx=line(role);
   const x=clamp(Number(p.x??(tid===0?lx*100:100-lx*100)),2,98),y=clamp(Number(p.y??(8+(i%9)*10.5)),2,98);
   const isKeeper=keeper(role),fallbackGk=Number(p.goalkeeping??60);
   const gkReflexes=clamp(Number(p.gkReflexes??fallbackGk),1,100);
   const gkHandling=clamp(Number(p.gkHandling??fallbackGk),1,100);
   const gkPositioning=clamp(Number(p.gkPositioning??fallbackGk),1,100);
   const gkOneOnOne=clamp(Number(p.gkOneOnOne??fallbackGk),1,100);
   const gkDistribution=clamp(Number(p.gkDistribution??fallbackGk),1,100);
   const gkComposite=gkReflexes*.28+gkHandling*.20+gkPositioning*.22+gkOneOnOne*.20+gkDistribution*.10;
   return {id:String(p.id??i),name:String(p.name||'Player'),role,slotIndex:Number(p.slotIndex??i),pace:clamp(Number(p.pace??60),1,100),passing:clamp(Number(p.passing??60),1,100),shooting:clamp(Number(p.shooting??50),1,100),defending:clamp(Number(p.defending??50),1,100),goalkeeping:clamp(Number(p.goalkeeping??(isKeeper?gkComposite:35)),1,100),...(isKeeper?{gkReflexes,gkHandling,gkPositioning,gkOneOnOne,gkDistribution}:{}),stamina:clamp(Number(p.stamina??100),0,100),x,y,baseX:x,baseY:y,active:p.active!==false,direction:dir};
  })};
 });
 const random=makeRandom(seed),kick=normalized[0].players.find(p=>!keeper(p.role)&&p.active)||normalized[0].players[0];
 return {minute:0,score:[0,0],possession:[0,0],shots:[0,0],shotsOnTarget:[0,0],passes:[0,0],completedPasses:[0,0],tackles:[0,0],teams:normalized,ball:{x:kick.x,y:kick.y,team:0,playerId:kick.id},events:[],random};
}
const active=t=>t.players.filter(p=>p.active);
function manpowerProfile(team,mentality='balanced'){
 const count=active(team).length,shortage=Math.max(0,11-count);
 return {
  activeCount:count,
  widthScale:clamp(1-shortage*.075,.7,1),
  forwardScale:clamp(1-shortage*.11,.62,1),
  pressScale:clamp(count/11,.65,1),
  pressers:mentality==='pressing'?(count>=11?3:count>=9?2:1):1
 };
}
// Fitness scales physical and technical execution without changing player ratings.
// Calibrated through seeded multi-match fatigue and dismissal audits.
function fitness(p){return .78+.22*clamp(Number(p.stamina??100),0,100)/100;}
function nearest(players,point){let best=null,d=Infinity;for(const p of players){if(!p.active)continue;const n=distance(p,point);if(n<d){best=p;d=n;}}return best;}
function moveToward(p,t,max){const dx=t.x-p.x,dy=t.y-p.y,len=Math.hypot(dx,dy);if(!len)return;if(len<=max){p.x=clamp(t.x,2,98);p.y=clamp(t.y,2,98);}else{p.x=clamp(p.x+dx/len*max,2,98);p.y=clamp(p.y+dy/len*max,2,98);}}
function effectiveMentality(s,teamId){
 const team=s.teams[teamId],base=String(team.mentality||'balanced').toLowerCase();
 if(!team.adaptiveTactics)return base;
 const difference=s.score[teamId]-s.score[1-teamId],minute=s.minute;
 if(difference<0&&minute>=72)return 'attacking';
 if(difference>0&&minute>=78)return 'defensive';
 return base;
}
// Select a striker's run lane behind the defensive line without chasing
// beyond a realistic support distance from the ball carrier.
function strikerRunTarget(player,carrier,teamId,defenders){
 const dir=teamId===0?1:-1;
 const progress=teamId===0?carrier.x:100-carrier.x;
 if(progress<48)return{x:player.x,y:player.y,active:false};
 const backLine=defenders.filter(p=>p.active&&!keeper(p.role)&&/^(CB|LB|RB|LWB|RWB|DF|DEF)/i.test(String(p.role||'')));
 const linePlayers=backLine.length?backLine:defenders.filter(p=>p.active&&!keeper(p.role));
 if(!linePlayers.length)return{x:player.x,y:player.y,active:false};
 const lineX=teamId===0?Math.max(...linePlayers.map(p=>p.x)):Math.min(...linePlayers.map(p=>p.x));
 const lineProgress=teamId===0?lineX:100-lineX;
 const targetX=lineX+dir*2;
 const crossingLane=(carrier.y<22||carrier.y>78)&&progress>=68;
 const preferredY=carrier.y<50?64:36;
 const lanes=[36,50,64];
 const lane=lanes.map(y=>({
  y,
  space:linePlayers.reduce((best,d)=>Math.min(best,Math.hypot(d.x-targetX,d.y-y)),40),
  preference:crossingLane?(y===preferredY?8:y===50?1:0):0
 })).sort((a,b)=>(b.space+b.preference)-(a.space+a.preference)||Math.abs(a.y-50)-Math.abs(b.y-50))[0];
 const minTarget=Math.min(98,progress+2);
 const maxTarget=Math.max(minTarget,Math.min(98,progress+18));
 // On an advanced wide delivery, the striker attacks the far-post corridor
 // just behind the defensive line; central attacks retain the normal run.
 const targetProgress=clamp(lineProgress+2.1,minTarget,maxTarget);
 return{x:clamp(teamId===0?targetProgress:100-targetProgress,2,98),y:lane.y,active:true,crossingLane};
}
function updateShape(s,teamId,carrier,counterActive=false){
 const ballX=s.ball.x,ballY=s.ball.y;
 for(const t of s.teams){
  const has=t.id===teamId,dir=t.id===0?1:-1,mentality=effectiveMentality(s,t.id);
  const defenders=active(t),manpower=manpowerProfile(t,mentality);
  const basePush=counterActive?1.58:mentality==='attacking'?1.35:mentality==='defensive'?.62:mentality==='counter'?1.15:1;
  // A side with fewer players protects its central lanes and commits fewer
  // runners forward; a high press also becomes less coordinated when short.
  const pushScale=basePush*(has?manpower.forwardScale:1);
  const pressScale=(mentality==='pressing'?1.7:mentality==='defensive'?.65:1)*manpower.pressScale;
  const pressers=has?[]:defenders.filter(p=>!keeper(p.role)).sort((a,b)=>distance(a,carrier)-distance(b,carrier)).slice(0,manpower.pressers);
  const cover=pressers.length?pressers[0]:null;
  for(const p of defenders){
   if(has&&p.id===carrier.id)continue;
   const r=String(p.role||'').toUpperCase(),l=line(r);
   const isWide=/^(LW|RW|LM|RM|LB|RB|LWB|RWB)$/.test(r);
   const isFullback=/^(LB|RB|LWB|RWB)$/.test(r);
   const isForward=/^(LW|RW|ST|CF|FW|FWD)$/.test(r);
   const ballProgress=(ballX-50)*dir;
   const forwardPush=has?(l>.68?10:l>.43?5.5:1.2)*pushScale*(counterActive&&l>.43?1.22:1):-1.2;
   let tx=p.baseX+dir*forwardPush+(ballX-50)*.075*dir*(has?1:1.35);
   let ty=50+(p.baseY-50)*manpower.widthScale+(ballY-50)*(has?.13:.19);
   if(manpower.activeCount<11&&!keeper(r)&&!has)tx-=dir*(11-manpower.activeCount)*.65;

   // Attack width and staggered runs: wide attackers stay in the channel,
   // fullbacks overlap when possession reaches their side of midfield.
   if(isWide){
    const lane=p.baseY<50?Math.min(p.baseY,18):Math.max(p.baseY,82);
    ty=lane+(ballY-lane)*.08;
    if(has&&isFullback&&ballProgress>0)tx+=dir*clamp(ballProgress*.12,0,7)*pushScale;
    if(has&&isForward&&ballProgress>12)tx+=dir*clamp(ballProgress*.08,0,5);
   }else if(/^(CM|DM|CDM|AM|CAM|MF)$/.test(r)){
    ty+= (50-p.baseY)*.1;
    if(has&&(/^(AM|CAM)$/.test(r)||l>.55))tx+=dir*(ballProgress>5?3:1);
   }else if(/^(ST|CF)$/.test(r)&&has){
    // When possession reaches midfield, the striker attacks the most open
    // channel just beyond the defensive line, mirrored for both directions.
    const run=strikerRunTarget(p,carrier,t.id,active(s.teams[1-t.id]));
    if(run.active){tx=run.x;ty=run.y;}
    else tx=dir>0?Math.max(ballX+2,tx):Math.min(ballX-2,tx);
    tx=clamp(tx,t.id===0?ballX-2:2,t.id===0?98:ballX+2);
   }

   if(keeper(r)){tx=t.id===0?5:95;ty=clamp(50+(ballY-50)*.14,38,62);}
   else if(!has&&l<.35){
    const lineTarget=defensiveLineTarget(p,carrier,t.id,mentality);
    tx=lineTarget.x;
    ty=lineTarget.y;
   }

   // A compact, coordinated press: one player closes the ball, nearby
   // midfielders cover passing lanes, while the rest preserve their line.
   const isPresser=pressers.some(q=>q.id===p.id);
   if(!has&&isPresser){
    const rank=pressers.findIndex(q=>q.id===p.id);
    const target=defensiveCoverTarget(carrier,p,t.id,rank);
    moveToward(p,target,rank===0?1.8*pressScale:1.15*pressScale);
   }else{
    moveToward(p,{x:clamp(tx,2,98),y:clamp(ty,3,97)},(has?1.3:1.25)*fitness(p));
   }
  }
 }
}
// Defensive line retreats in proportion to ball danger and narrows its
// far-side spacing, while preserving mirrored coordinates for both teams.
function defensiveLineTarget(player,carrier,teamId,mentality='balanced'){
 const dir=teamId===0?1:-1;
 const threat=clamp(teamId===0?(50-carrier.x)/50:(carrier.x-50)/50,0,1);
 const retreat=threat*(mentality==='defensive'?5.5:3.6);
 const compactness=.10+threat*.12;
 return{
  x:clamp(player.baseX-dir*retreat,teamId===0?8:62,teamId===0?38:92),
  y:clamp(player.baseY+(50-player.baseY)*compactness+(carrier.y-50)*.035,3,97)
 };
}
// Give the first presser a direct close-down, the second a goal-side cover
// angle, and the third a central screen. The same geometry mirrors for both ends.
function defensiveCoverTarget(carrier,player,teamId,rank){
 const dir=teamId===0?1:-1;
 if(rank===0)return{x:carrier.x,y:carrier.y};
 if(rank===1)return{
  x:clamp(carrier.x-dir*5.5,2,98),
  y:clamp(carrier.y+(player.baseY<50?-5.5:5.5),3,97)
 };
 return{
  x:clamp(carrier.x-dir*8,2,98),
  y:clamp(carrier.y+(50-carrier.y)*.55,3,97)
 };
}
function addEvent(s,e){s.events.push(e);if(s.events.length>300)s.events.shift();}
function pointSegmentDistance(point,a,b){
 const dx=b.x-a.x,dy=b.y-a.y,len2=dx*dx+dy*dy;
 if(!len2)return distance(point,a);
 const u=clamp(((point.x-a.x)*dx+(point.y-a.y)*dy)/len2,0,1);
 return Math.hypot(point.x-(a.x+u*dx),point.y-(a.y+u*dy));
}
// A blocked shot can glance off a defender and cross the goal line.
// Reuse the conditional block roll so this adds no random draws.
function shotDeflectionOutcome(blocked,blockRoll,blockChance,defenderSkill){
 if(!blocked)return false;
 const chance=clamp(.05+Number(defenderSkill||0)*.001,.05,.15);
 return (Number(blockRoll)/Math.max(.000001,Number(blockChance)))<chance;
}
// Resolve a goalkeeper parry as a loose second ball inside the penalty area.
// The landing point follows the shot's lateral angle and travels back into the pitch;
// the nearest active outfield player wins the first contest, with pace as a small tie-break.
function resolveKeeperParryRebound(s,goalkeeper,shooter,attackingTeam){
 if(attackingTeam!==0&&attackingTeam!==1)throw Error('Attacking team must be 0 or 1');
 if(!goalkeeper||!shooter||![goalkeeper.x,goalkeeper.y,shooter.x,shooter.y].every(v=>typeof v==='number'&&Number.isFinite(v)))throw Error('Keeper and shooter positions must be finite');
 const defendingTeam=1-attackingTeam,dir=attackingTeam===0?1:-1;
 const landing={
  x:clamp(goalkeeper.x-dir*7,2,98),
  y:clamp(goalkeeper.y+(goalkeeper.y-shooter.y)*.35,12,88)
 };
 const candidates=[];
 for(const team of s.teams){
  for(const player of active(team)){
   if(keeper(player.role))continue;
   const d=distance(player,landing);
   const score=d-Number(player.pace??50)*.012;
   candidates.push({teamId:team.id,player,score,d});
  }
 }
 candidates.sort((a,b)=>a.score-b.score||a.teamId-b.teamId||String(a.player.id).localeCompare(String(b.player.id)));
 const winner=candidates[0];
 if(!winner)throw Error('No active outfield player can contest the rebound');
 s.ball={x:landing.x,y:landing.y,team:winner.teamId,playerId:winner.player.id};
 if(winner.teamId===defendingTeam)startCounterTransition(s,defendingTeam);
 else s.transition=null;
 // The next action resolves the rebound: an attacker may shoot again, while
 // a defender gets an immediate clearance/recovery decision.
 s.reboundOpportunity={team:winner.teamId,attackingTeam,expiresAtAction:(s.actionCount||0)+1};
 const event={type:'rebound',minute:s.minute+1,team:winner.teamId,playerId:winner.player.id,
  goalkeeperId:goalkeeper.id,shooterId:shooter.id,attackingTeam,contested:true,x:landing.x,y:landing.y};
 addEvent(s,event);
 return event;
}
// Resolve a post/crossbar impact into an in-play second ball, mirrored by attack direction.
function resolveWoodworkRebound(s,shooter,attackingTeam,goalX,woodworkType='post'){
 if(attackingTeam!==0&&attackingTeam!==1)throw Error('Attacking team must be 0 or 1');
 if(!shooter||![shooter.x,shooter.y,goalX].every(v=>typeof v==='number'&&Number.isFinite(v)))throw Error('Woodwork trajectory must be finite');
 if(woodworkType!=='post'&&woodworkType!=='crossbar')throw Error('Unsupported woodwork type');
 const dir=attackingTeam===0?1:-1;
 const contactY=woodworkType==='crossbar'?50:(shooter.y<50?44:56);
 const landing={x:clamp(goalX-dir*5,2,98),y:clamp(woodworkType==='crossbar'?50+(shooter.y-50)*.25:50+(contactY-50)*.55,42,58)};
 const candidates=[];
 for(const team of s.teams){for(const player of active(team)){
  if(keeper(player.role))continue;
  const d=distance(player,landing),score=d-Number(player.pace??50)*.012;
  candidates.push({teamId:team.id,player,score});
 }}
 candidates.sort((a,b)=>a.score-b.score||a.teamId-b.teamId||String(a.player.id).localeCompare(String(b.player.id)));
 const winner=candidates[0];
 if(!winner)throw Error('No active outfield player can contest the woodwork rebound');
 s.ball={x:landing.x,y:landing.y,team:winner.teamId,playerId:winner.player.id};
 if(winner.teamId===1-attackingTeam)startCounterTransition(s,winner.teamId);else s.transition=null;
 s.reboundOpportunity={team:winner.teamId,attackingTeam,expiresAtAction:(s.actionCount||0)+1};
 const event={type:'rebound',source:'woodwork',woodworkType,minute:s.minute+1,team:winner.teamId,playerId:winner.player.id,attackingTeam,contested:true,x:landing.x,y:landing.y};
 addEvent(s,event);
 return event;
}
// Find an active outfield defender positioned in the actual passing corridor.
function passLaneInterceptionChance(defender,gap,passType='normal'){
 const skill=Number(defender?.defending??50);
 const patternRisk=passType==='through_ball'?.018:passType==='cross'?.012:passType==='cutback'?.02:passType==='switch'?-.005:0;
 return clamp(.02+skill*.0012-Number(gap||0)*.012+patternRisk,.02,.16);
}
function findPassInterceptor(carrier,target,defenders){
 const dx=target.x-carrier.x,dy=target.y-carrier.y,len2=dx*dx+dy*dy;
 if(!len2)return null;
 let best=null,bestScore=-Infinity;
 for(const p of defenders){
  if(!p.active||keeper(p.role))continue;
  const projection=((p.x-carrier.x)*dx+(p.y-carrier.y)*dy)/len2;
  if(projection<.08||projection>.92)continue;
  const gap=pointSegmentDistance(p,carrier,target);
  if(gap>5.2)continue;
  const score=Number(p.defending??50)-gap*8;
  if(score>bestScore){best={player:p,gap,projection};bestScore=score;}
 }
 return best;
}
// Resolve an aerial cross at its landing point without consuming RNG.
// Nearby active outfield players contest it; attributes and distance decide the
// first contact, with stable team/player tie-breakers for deterministic replay.
function resolveCrossContest(s,carrier,receiver,attackingTeam){
 if(attackingTeam!==0&&attackingTeam!==1)throw Error('Attacking team must be 0 or 1');
 if(!s||!Array.isArray(s.teams)||s.teams.length!==2)throw Error('Cross contest requires two teams');
 const attack=s.teams[attackingTeam],defend=s.teams[1-attackingTeam];
 if(!attack.players.includes(receiver)||!receiver.active||!carrier||!carrier.active)throw Error('Cross carrier and receiver must be active players');
 const landing={x:receiver.x,y:receiver.y},candidates=[];
 for(const team of s.teams){for(const player of active(team)){
  if(keeper(player.role))continue;
  const d=distance(player,landing);
  if(d>18)continue;
  const aerialSkill=Number(player.pace??50)*.012+(team.id===attackingTeam?(Number(player.passing??50)+Number(player.shooting??50))*.002:Number(player.defending??50)*.004);
  candidates.push({teamId:team.id,player,score:d-aerialSkill,d});
 }}
 if(!candidates.some(c=>c.player.id===receiver.id&&c.teamId===attackingTeam))candidates.push({teamId:attackingTeam,player:receiver,score:distance(receiver,landing)-Number(receiver.pace??50)*.012-(Number(receiver.passing??50)+Number(receiver.shooting??50))*.002,d:0});
 candidates.sort((a,b)=>a.score-b.score||a.teamId-b.teamId||String(a.player.id).localeCompare(String(b.player.id)));
 const winner=candidates[0];
 if(winner.teamId===attackingTeam){
  s.ball={x:landing.x,y:landing.y,team:attackingTeam,playerId:winner.player.id};
  s.transition=null;
  // A completed delivery into the attacking penalty area creates one
  // immediate shooting opportunity for the receiver, not a persistent buff.
  const inBox=attackingTeam===0?landing.x>=82&&landing.y>=18&&landing.y<=82:landing.x<=18&&landing.y>=18&&landing.y<=82;
  if(inBox)s.crossShotOpportunity={team:attackingTeam,playerId:winner.player.id,expiresAtAction:(s.actionCount||0)+1};
  return{type:'cross',outcome:'completed',minute:s.minute+1,team:attackingTeam,playerId:winner.player.id,from:carrier.id,to:winner.player.id,attackingTeam,inBox,x:landing.x,y:landing.y};
 }
 const outlet=isDefensiveThird(winner.player,defend.id)?chooseClearanceTarget(defend,winner.player,defend.id):null;
 startCounterTransition(s,defend.id);
 if(outlet){
  s.ball={x:outlet.x,y:outlet.y,team:defend.id,playerId:outlet.id};
  return{type:'clearance',source:'cross',minute:s.minute+1,team:defend.id,playerId:winner.player.id,from:winner.player.id,to:outlet.id,attackingTeam,x:outlet.x,y:outlet.y};
 }
 s.ball={x:winner.player.x,y:winner.player.y,team:defend.id,playerId:winner.player.id};
 return{type:'interception',source:'cross',minute:s.minute+1,team:defend.id,playerId:winner.player.id,attackingTeam,x:winner.player.x,y:winner.player.y};
}
// Score receiver space and the entire pass corridor, not only the receiver's endpoint.
function classifyPassPattern(carrier,target,team,teamId,laneClearance){
 const dir=teamId===0?1:-1;
 const progress=(target.x-carrier.x)*dir;
 const carrierProgress=carrier.x*dir+(teamId===0?0:100);
 const wide=carrier.y<22||carrier.y>78;
 const central=target.y>=25&&target.y<=75;
 if(wide&&carrierProgress>=88&&central&&progress<0)return'cutback';
 if(wide&&carrierProgress>=68&&central&&progress>=-3)return'cross';
 if(progress>=7&&laneClearance>=4&&distance(carrier,target)>=7)return'through_ball';
 if(Math.abs(target.y-carrier.y)>=34&&laneClearance>=7&&progress>=-5)return'switch';
 return'normal';
}
function choosePassTarget(team,defenders,carrier,teamId,counterActive=false){
 const dir=teamId===0?1:-1;
 const candidates=active(team).filter(p=>p.id!==carrier.id).map(p=>{
  const progress=(p.x-carrier.x)*dir,nearestDef=nearest(defenders,p);
  const space=nearestDef?distance(nearestDef,p):30;
  const laneClearance=defenders.reduce((best,d)=>Math.min(best,pointSegmentDistance(d,carrier,p)),30);
  const lateral=Math.abs(p.y-carrier.y);
  const forwardScale=manpowerProfile(team).forwardScale;
  const forwardBonus=progress>0?3*forwardScale:0;
  const score=progress*.78*forwardScale+Math.min(space,24)*.42+Math.min(laneClearance,18)*.62+p.passing*.025-lateral*.22+forwardBonus+(counterActive?Math.max(-2,progress)*.24:0);
  const passType=classifyPassPattern(carrier,p,team,teamId,laneClearance);
  const patternBonus=passType==='through_ball'?4:passType==='cross'?3.2:passType==='cutback'?4.5:passType==='switch'?2.2:0;
  return{p,progress,space,laneClearance,score:score+patternBonus,passType};
 });
 if(!candidates.length)return null;
 const safeForward=candidates.filter(c=>c.progress>(counterActive?3:1.5)&&c.space>4&&c.laneClearance>2.5);
 return (safeForward.length?safeForward:candidates).sort((a,b)=>b.score-a.score)[0];
}
function findShotBlocker(shooter,goalX,defenders){
 const goalY=50+(50-shooter.y)*.15,target={x:goalX,y:goalY};
 let best=null,bestDistance=Infinity;
 for(const p of defenders){
  if(!p.active||keeper(p.role))continue;
  const dx=target.x-shooter.x,dy=target.y-shooter.y,len2=dx*dx+dy*dy;
  if(!len2)continue;
  const projection=((p.x-shooter.x)*dx+(p.y-shooter.y)*dy)/len2;
  if(projection<.12||projection>.92)continue;
  const gap=pointSegmentDistance(p,shooter,target);
  if(gap<=3.8&&gap<bestDistance){best=p;bestDistance=gap;}
 }
 return best;
}
function isDefensiveThird(player,teamId){
 return teamId===0?player.x<=34:player.x>=66;
}
function chooseClearanceTarget(team,carrier,teamId){
 const dir=teamId===0?1:-1;
 const candidates=active(team).filter(p=>p.id!==carrier.id);
 if(!candidates.length)return null;
 return candidates.map(p=>{
  const progress=(p.x-carrier.x)*dir;
  const width=Math.abs(p.y-50);
  return{p,score:progress*.8+width*.12+Math.min(distance(p,carrier),30)*.08};
 }).sort((a,b)=>b.score-a.score)[0].p;
}
function startCounterTransition(state,teamId){state.transition={team:teamId,expiresAtAction:(state.actionCount||0)+3};}
function counterTransitionActive(state,teamId){return !!state.transition&&state.transition.team===teamId&&(state.actionCount||0)<=state.transition.expiresAtAction;}
function resolveDefensiveRecovery(state,defendingTeam,defender,attackingTeamId,random){
 const teamId=defendingTeam.id;
 const roll=typeof random==='function'?random:()=>.999;
 const canClear=isDefensiveThird(defender,teamId);
 const clearanceChance=clamp(.24+(defender.defending*.003),.24,.52);
 const target=canClear&&roll()<clearanceChance
  ?chooseClearanceTarget(defendingTeam,defender,teamId):null;
 startCounterTransition(state,teamId);
 let event;
 if(target){
  state.ball={x:target.x,y:target.y,team:teamId,playerId:target.id};
  event={type:'clearance',minute:state.minute+1,team:teamId,playerId:defender.id,from:defender.id,to:target.id,x:target.x,y:target.y};
 }else{
  state.ball={x:defender.x,y:defender.y,team:teamId,playerId:defender.id};
  event={type:'interception',minute:state.minute+1,team:teamId,playerId:defender.id,x:defender.x,y:defender.y};
 }
 return event;
}
function stepAction(s){
 s.actionCount=(s.actionCount||0)+1;
 const tid=s.ball.team,oid=1-tid,t=s.teams[tid],opp=s.teams[oid];
 const carrier=t.players.find(p=>p.active&&p.id===s.ball.playerId)||nearest(active(t),s.ball);
 if(!carrier)throw Error('The team in possession has no active players');
 const rnd=s.random||(s.random=makeRandom(1)),goalX=tid===0?100:0,def=active(opp);
 const counterActive=counterTransitionActive(s,tid);
 if(s.transition&&s.actionCount>s.transition.expiresAtAction)s.transition=null;
 const reboundOpportunity=s.reboundOpportunity&&s.actionCount<=s.reboundOpportunity.expiresAtAction?s.reboundOpportunity:null;
 s.reboundOpportunity=null;
 const crossShotOpportunity=s.crossShotOpportunity&&s.actionCount<=s.crossShotOpportunity.expiresAtAction&&s.crossShotOpportunity.team===tid&&s.crossShotOpportunity.playerId===s.ball.playerId?s.crossShotOpportunity:null;
 s.crossShotOpportunity=null;
 let press=nearest(def,carrier),pd=press?distance(press,carrier):40;
 const goalDist=Math.abs(goalX-carrier.x);
 s.possession[tid]+=1/3;
 carrier.stamina=clamp(carrier.stamina-.012,0,100);
 updateShape(s,tid,carrier,counterActive);
 // If a defender won the rebound, resolve the loose-ball contest immediately
 // through the existing clearance/interception model instead of delaying it.
 if(reboundOpportunity&&tid!==reboundOpportunity.attackingTeam){
  const recovery=resolveDefensiveRecovery(s,t,carrier,reboundOpportunity.attackingTeam,rnd);
  addEvent(s,recovery);
  return;
 }
 // Re-evaluate pressure after defenders have moved into their pressing positions.
 press=nearest(def,carrier);pd=press?distance(press,carrier):40;
 // Calibrated against the three-actions-per-minute clock and legacy OVR mapping.
 const sharpness=fitness(carrier);
 const attackManpower=manpowerProfile(t,effectiveMentality(s,tid));
 // Fewer active attackers means fewer coordinated runs and lower shot volume.
 // Keep the penalty modest so a red card changes the match without deciding it alone.
 const strikerShotBoost=/^(ST|CF|FW|FWD)$/i.test(String(carrier.role||''))?.006:0;
 const baseShotChance=(.09+strikerShotBoost+(carrier.shooting*sharpness)/1400-pd/1200)*(1-(11-attackManpower.activeCount)*.045);
 const reboundFollowUp=!!reboundOpportunity&&tid===reboundOpportunity.attackingTeam;
 const crossFollowUp=!!crossShotOpportunity;
 const followUpBoost=(reboundFollowUp?.16:0)+(crossFollowUp?.10:0);
 const shotChance=clamp(baseShotChance+followUpBoost,.02,followUpBoost? .30:.16);
 let event=null,boundaryShot=null,reboundShot=null,woodworkShot=null,passBoundary=null;
 if(goalDist<=(crossFollowUp?30:25)&&Math.abs(50-carrier.y)<=(crossFollowUp?35:31)&&rnd()<shotChance){
  s.shots[tid]++;
  const blocker=findShotBlocker(carrier,goalX,opp.players);
  const blockChance=blocker?clamp(.16+(blocker.defending*.0035)+(pd<9?.08:0),.12,.58):0;
  const blockRoll=blocker?rnd():1;
  const blocked=!!blocker&&blockRoll<blockChance;
  const on=!blocked&&rnd()<clamp(.28+(carrier.shooting*sharpness)/180,.28,.8);
  // Off-target shots receive a real goal-line trajectory. The aim point is
  // deliberately outside the goal mouth but remains inside the pitch, so an
  // untouched miss correctly awards a goal kick rather than teleporting to GK.
  const missAimY=!blocked&&!on?(rnd()<.5?38+rnd()*5:57+rnd()*5):null;
  if(on)s.shotsOnTarget[tid]++;
  const goalkeeper=opp.players.find(p=>p.active&&keeper(p.role))||nearest(active(opp),{x:oid===0?5:95,y:50});
  const keeperSkill=goalkeeper?Number(goalkeeper.goalkeeping??60):60;
  const keeperResponse=goalkeeper
   ?(Number(goalkeeper.gkReflexes??keeperSkill)*.5+Number(goalkeeper.gkPositioning??keeperSkill)*.25+Number(goalDist<12?goalkeeper.gkOneOnOne??keeperSkill:goalkeeper.gkHandling??keeperSkill)*.25)
   :60;
  const quality=clamp(.09+(carrier.shooting*sharpness)/400+(25-goalDist)/95-Math.abs(50-carrier.y)/220-(pd<5?.12:0)-(keeperSkill-60)*.0015-(keeperResponse-60)*.0015,.03,.5);
  const goalRoll=(!blocked&&on)?rnd():1;
  const goal=!blocked&&on&&goalRoll<quality;
  if(goal){s.score[tid]++;s.transition=null;}
  const saved=!blocked&&on&&!goal;
  // Reuse the existing shot/block rolls for secondary outcomes. This keeps
  // the seeded random stream stable for every action that follows the shot.
  const saveResidual=(goalRoll-quality)/Math.max(.000001,1-quality);
  const parryChance=clamp(.06+(100-Number(goalkeeper?.gkHandling??keeperSkill))*.0015,.06,.18);
  const woodworkChance=clamp(.018+(25-goalDist)*.0007,.018,.035);
  const parried=saved&&saveResidual<parryChance;
  const woodwork=saved&&!parried&&saveResidual<parryChance+woodworkChance;
  const woodworkType=Math.abs(carrier.y-50)<=4?'crossbar':'post';
  const deflectedOut=shotDeflectionOutcome(blocked,blockRoll,blockChance,blocker?.defending);
  if(woodwork)s.shotsOnTarget[tid]=Math.max(0,s.shotsOnTarget[tid]-1);
  if(blocked||saved)startCounterTransition(s,oid);
  event={type:blocked?'block':goal?'goal':woodwork?'woodwork':saved?'save':'shot',minute:s.minute+1,
   team:blocked||saved&&!woodwork?oid:tid,playerId:blocked?blocker.id:saved&&!woodwork?(goalkeeper?.id??carrier.id):carrier.id,
   shooterId:carrier.id,goalkeeperId:blocked||woodwork?null:goalkeeper?.id??null,
   attackingTeam:tid,onTarget:on&&!woodwork,parried,woodwork,woodworkType:woodwork?woodworkType:null,deflectedOut,reboundFollowUp,crossFollowUp,counterattack:counterActive,
   x:blocked?blocker.x:carrier.x,y:blocked?blocker.y:carrier.y};
  const restart=blocked?blocker:goal
   ?(nearest(active(opp).filter(p=>!keeper(p.role)),{x:50,y:50})||goalkeeper)
   :saved&&!woodwork?goalkeeper:null;
  if(restart&&!parried&&!deflectedOut&&!woodwork)s.ball={x:restart.x,y:restart.y,team:oid,playerId:restart.id};
  if(parried){
   reboundShot={goalkeeper,shooter:carrier,attackingTeam:tid};
  }else if(woodwork){
   woodworkShot={shooter:carrier,attackingTeam:tid,goalX,woodworkType};
  }else if(deflectedOut){
   const spillY=Number(blocker?.y??50)<50?8:92;
   boundaryShot={deflection:true,contact:blocker,attackingTeam:tid,goalX,spillY};
  }else if(!blocked&&!goal&&missAimY!==null){
   const dir=tid===0?1:-1,beyondX=goalX+dir;
   const ratio=(beyondX-carrier.x)/(goalX-carrier.x);
   const beyondY=carrier.y+(missAimY-carrier.y)*ratio;
   boundaryShot={from:{x:carrier.x,y:carrier.y},to:{x:beyondX,y:beyondY},lastTouchTeam:tid};
  }
 }else{
  const best=choosePassTarget(t,def,carrier,tid,counterActive);
  const closeTackle=press&&pd<4.5&&rnd()<.11+(press.defending*fitness(press))/900;
  if(closeTackle){
   s.tackles[oid]++;
   s.ball={x:press.x,y:press.y,team:oid,playerId:press.id};
   startCounterTransition(s,oid);
   event={type:'tackle',minute:s.minute+1,team:oid,playerId:press.id,x:press.x,y:press.y,counterattack:true};
  }else{
   const pass=best&&rnd()<(pd<4.5?.35:pd<8.5?.72:best.progress>0?.58:.28);
   if(pass){
    s.passes[tid]++;
    const risk=best.passType==='through_ball'?.09:best.passType==='cross'?.07:best.passType==='cutback'?.045:best.passType==='switch'?.035:0;
    const chance=clamp(.66+(carrier.passing*sharpness)/350-Math.max(0,distance(carrier,best.p)-12)/180-(pd<4?.1:pd<8?.04:0)-risk,.30,.97);
    const laneDefender=findPassInterceptor(carrier,best.p,def);
    const laneRisk=laneDefender?passLaneInterceptionChance(laneDefender.player,laneDefender.gap,best.passType):0;
    if(laneDefender&&rnd()<laneRisk){
     event=resolveDefensiveRecovery(s,opp,laneDefender.player,tid,rnd);
    }else if(rnd()<chance){
     const passType=best.passType||'normal';
     const overhitChance=passType==='cross'?.12:passType==='switch'?.07:passType==='through_ball'?.04:.02;
     // Derive overhit risk from the current PRNG state without advancing it.
     const overhitState=(Number(rnd.state)||0)>>>0;
     const overhitRoll=((overhitState^0xA5A5A5A5)>>>0)/4294967296;
     const overhit=overhitRoll<overhitChance;
     if(overhit){
      event=passType==='cross'?{type:'cross',passType,outcome:'overhit',minute:s.minute+1,team:tid,from:carrier.id,to:best.p.id,counterattack:counterActive,overhit:true,x:best.p.x,y:best.p.y}:{type:'pass',passType,minute:s.minute+1,team:tid,from:carrier.id,to:best.p.id,counterattack:counterActive,overhit:true,x:best.p.x,y:best.p.y};
      passBoundary={from:{x:carrier.x,y:carrier.y},to:{x:best.p.x,y:best.p.y},lastTouchTeam:tid};
     }else if(passType==='cross'){
      event=resolveCrossContest(s,carrier,best.p,tid);
      if(event.outcome==='completed')s.completedPasses[tid]++;
     }else{
      s.completedPasses[tid]++;
      s.ball={x:best.p.x,y:best.p.y,team:tid,playerId:best.p.id};
      event={type:'pass',passType,minute:s.minute+1,team:tid,from:carrier.id,to:best.p.id,counterattack:counterActive,overhit:false,x:best.p.x,y:best.p.y};
     }
    }else{
     const win=nearest(def,{x:(carrier.x+best.p.x)/2,y:(carrier.y+best.p.y)/2})||press;
     if(win){
      event=resolveDefensiveRecovery(s,opp,win,tid,rnd);
     }
    }
   }else{
    const dir=tid===0?1:-1;
    const lateral=press&&Math.abs(press.y-carrier.y)<8?(carrier.y<50?-.65:.65):(50-carrier.y)*.012;
    carrier.x=clamp(carrier.x+dir*(.7+(carrier.pace*fitness(carrier))/95)*(counterActive?1.18:1),2,98);
    carrier.y=clamp(carrier.y+lateral,3,97);
    s.ball={x:carrier.x,y:carrier.y,team:tid,playerId:carrier.id};
    event={type:'carry',minute:s.minute+1,team:tid,playerId:carrier.id,counterattack:counterActive,x:carrier.x,y:carrier.y};
   }
  }
 }
 if(event)addEvent(s,event);
 // The shot is logged before its secondary outcome: rebound or boundary restart.
 if(reboundShot)resolveKeeperParryRebound(s,reboundShot.goalkeeper,reboundShot.shooter,reboundShot.attackingTeam);
 if(woodworkShot)resolveWoodworkRebound(s,woodworkShot.shooter,woodworkShot.attackingTeam,woodworkShot.goalX,woodworkShot.woodworkType);
 if(passBoundary)resolvePassBoundary(s,passBoundary.from,passBoundary.to,passBoundary.lastTouchTeam);
 if(boundaryShot?.deflection){
  resolveShotDeflectionBoundary(s,boundaryShot.contact,boundaryShot.attackingTeam,boundaryShot.goalX,boundaryShot.spillY);
 }else if(boundaryShot)resolveBallBoundary(s,boundaryShot.from,boundaryShot.to,boundaryShot.lastTouchTeam);
}
function drainTeamStamina(s){
 for(const team of s.teams){
  const mentality=effectiveMentality(s,team.id);
  const intensity=mentality==='pressing'?.045:mentality==='attacking'?.018:0;
  for(const p of active(team)){
   const r=String(p.role||'').toUpperCase();
   const roleLoad=keeper(r)?.45:/^(DM|CDM|CM|LM|RM|AM|CAM|MF|MID)$/.test(r)?1.15:/^(LW|RW|ST|CF|FW|FWD)$/.test(r)?1.05:.9;
   p.stamina=clamp(p.stamina-(.10+intensity)*roleLoad,0,100);
  }
 }
}
// Classify the first pitch boundary crossed by a ball segment.
// Home attacks right (x=100); away attacks left (x=0). This is deliberately
// pure: live shot misses now pass their modeled segment through this classifier.
function classifyBoundaryRestart(from,to,lastTouchTeam){
 if(!from||!to||![from.x,from.y,to.x,to.y].every(v=>typeof v==='number'&&Number.isFinite(v)))throw Error('Boundary points must contain finite numeric coordinates');
 if(lastTouchTeam!==0&&lastTouchTeam!==1)throw Error('Last-touch team must be 0 or 1');
 if(from.x<0||from.x>100||from.y<0||from.y>100)throw Error('Ball segment must start inside the pitch');
 const dx=to.x-from.x,dy=to.y-from.y,crossings=[];
 if(dx>0&&to.x>100)crossings.push({t:(100-from.x)/dx,axis:'goal',side:'right'});
 if(dx<0&&to.x<0)crossings.push({t:(0-from.x)/dx,axis:'goal',side:'left'});
 if(dy>0&&to.y>100)crossings.push({t:(100-from.y)/dy,axis:'touchline',side:'bottom'});
 if(dy<0&&to.y<0)crossings.push({t:(0-from.y)/dy,axis:'touchline',side:'top'});
 if(!crossings.length)return null;
 crossings.sort((a,b)=>a.t-b.t);
 if(crossings.length>1&&Math.abs(crossings[0].t-crossings[1].t)<1e-9)return null;
 const exit=crossings[0],x=clamp(from.x+dx*exit.t,0,100),y=clamp(from.y+dy*exit.t,0,100);
 if(exit.axis==='touchline')return{
  restartType:'throw_in',teamId:1-lastTouchTeam,
  spot:{x:clamp(x,2,98),y:exit.side==='top'?3:97}
 };
 const attackingTeam=exit.side==='right'?0:1;
 if(lastTouchTeam===attackingTeam){
  const defendingTeam=1-attackingTeam;
  return{restartType:'goal_kick',teamId:defendingTeam,spot:{x:defendingTeam===0?5:95,y:clamp(y,38,62)}};
 }
 return{restartType:'corner',teamId:attackingTeam,spot:{x:attackingTeam===0?97:3,y:exit.side==='right'? (y<50?3:97):(y<50?3:97)}};
}
// A pass may be overhit beyond its intended receiver. Extrapolate the
// supplied pass vector, then reuse the shared first-boundary/restart resolver.
function resolvePassBoundary(s,from,to,lastTouchTeam,extension=.22){
 if(!from||!to||![from.x,from.y,to.x,to.y,extension].every(v=>typeof v==='number'&&Number.isFinite(v)))throw Error('Pass trajectory must be finite');
 if(extension<=0)throw Error('Pass extension must be positive');
 const dx=to.x-from.x,dy=to.y-from.y;
 if(Math.hypot(dx,dy)<.001)throw Error('Pass trajectory must have length');
 const beyond={x:to.x+dx*extension,y:to.y+dy*extension};
 return resolveBallBoundary(s,from,beyond,lastTouchTeam);
}
// Resolve a defender's glancing shot contact into a goal-line corner.
// The defending team touched last; this helper models only the supplied segment.
function resolveShotDeflectionBoundary(s,contact,attackingTeam,goalX,spillY){
 if(attackingTeam!==0&&attackingTeam!==1)throw Error('Attacking team must be 0 or 1');
 if(!contact||![contact.x,contact.y,goalX,spillY].every(v=>typeof v==='number'&&Number.isFinite(v)))throw Error('Deflection contact and trajectory must be finite');
 const dir=attackingTeam===0?1:-1;
 return resolveBallBoundary(s,{x:contact.x,y:contact.y},{x:goalX+dir,y:spillY},1-attackingTeam);
}
// Resolve a dead-ball restart into an explicit, deterministic ball owner.
// The caller supplies the awarded team and restart location after the referee/
// touchline decision; this helper owns taker selection and legal pitch placement.
function resolveRestart(s,restartType,teamId,spot={}){
 const type=String(restartType||'').toLowerCase();
 const supported=['corner','goal_kick','throw_in','free_kick','penalty'];
 if(!supported.includes(type))throw Error('Unsupported restart type: '+type);
 if(teamId!==0&&teamId!==1)throw Error('Restart team must be 0 or 1');
 const team=s?.teams?.[teamId];
 if(!team)throw Error('Restart team is missing');
 const players=active(team);
 if(!players.length)throw Error('Restart team has no active players');
 const goalSide=teamId===0?1:-1;
 let x=Number.isFinite(Number(spot.x))?Number(spot.x):(type==='goal_kick'?(teamId===0?5:95):type==='corner'?(teamId===0?97:3):s.ball.x);
 let y=Number.isFinite(Number(spot.y))?Number(spot.y):(type==='corner'?3:s.ball.y);
 if(type==='corner'){x=teamId===0?97:3;y=y<50?3:97;}
 if(type==='goal_kick'){x=teamId===0?5:95;y=clamp(y,38,62);}
 if(type==='throw_in')y=y<50?3:97;
 x=clamp(x,2,98);y=clamp(y,3,97);
 let taker;
 if(type==='goal_kick')taker=players.find(p=>keeper(p.role));
 if(type==='corner'){
  const wide=players.filter(p=>!keeper(p.role)&&/^(LW|RW|LM|RM|LB|RB|LWB|RWB)$/i.test(String(p.role||'')));
  taker=nearest(wide.length?wide:players.filter(p=>!keeper(p.role)),{x,y});
 }
 if(type==='penalty'){
  taker=players.filter(p=>!keeper(p.role)).sort((a,b)=>Number(b.shooting||0)-Number(a.shooting||0))[0];
 }
 if(!taker)taker=nearest(players.filter(p=>!keeper(p.role)),{x,y})||players[0];
 taker.x=x;taker.y=y;
 s.ball={x,y,team:teamId,playerId:taker.id};
 s.transition=null;
 const event={type:'restart',restartType:type,minute:s.minute+1,team:teamId,playerId:taker.id,x,y};
 addEvent(s,event);
 return event;
}
// Apply a classified boundary exit and award the restart as one atomic transition.
// Returns null for an in-play segment; callers must provide the actual ball path
// and the team that last touched it. This helper does not invent trajectories.
function resolveBallBoundary(s,from,to,lastTouchTeam){
 const decision=classifyBoundaryRestart(from,to,lastTouchTeam);
 if(!decision)return null;
 const event=resolveRestart(s,decision.restartType,decision.teamId,decision.spot);
 return{...decision,event};
}
function stepMatch(s){
 if(!s||!Array.isArray(s.teams)||s.teams.length!==2||!s.ball)throw Error('Invalid match state');
 // Three linked actions per displayed minute provide passing, pressing and
 // chance creation without making the match clock run faster.
 for(let action=0;action<3;action++)stepAction(s);
 // Every active player accumulates a small role- and mentality-weighted load.
 // Carrier-specific effort remains an additional cost inside stepAction.
 drainTeamStamina(s);
 // Keep cumulative possession exact at one displayed minute per step.
 s.possession[0]=Number(s.possession[0].toFixed(6));
 s.possession[1]=s.minute+1-s.possession[0];
 s.minute++;
 return s;
}
function simulateMatch(s,minutes=90){const n=clamp(Math.floor(Number(minutes)||0),0,120);for(let i=0;i<n;i++)stepMatch(s);return s;}
const FM4MatchEngine={createMatch,resolveCrossContest,resolveKeeperParryRebound,resolveWoodworkRebound,resolveRestart,classifyBoundaryRestart,resolveBallBoundary,resolvePassBoundary,resolveShotDeflectionBoundary,updateShape,strikerRunTarget,stepMatch,simulateMatch,restoreRandom,distance,roleLine:line,choosePassTarget,classifyPassPattern,findPassInterceptor,passLaneInterceptionChance,findShotBlocker,shotDeflectionOutcome,isDefensiveThird,chooseClearanceTarget,resolveDefensiveRecovery,startCounterTransition,counterTransitionActive,defensiveCoverTarget,defensiveLineTarget,effectiveMentality,manpowerProfile,drainTeamStamina};
if(typeof module!=='undefined'&&module.exports)module.exports=FM4MatchEngine;
if(typeof window!=='undefined')window.FM4MatchEngine=FM4MatchEngine;

})();

(function(){
'use strict';
// FM4 match kernel v2. Coordinates 0..100; home attacks right, away left.
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const keeper=r=>/^(GK|G|GOALKEEPER)$/i.test(String(r||''));
const line=r=>{r=String(r||'').toUpperCase();if(/^(GK|G|GOALKEEPER)$/.test(r))return .07;if(/^(CB|LB|RB|LWB|RWB|DF|DEF)/.test(r))return .27;if(/^(DM|CDM|CM|LM|RM|AM|CAM|MF|MID)/.test(r))return .51;if(/^(LW|RW|ST|CF|FW|FWD)/.test(r))return .75;return .5;};
function makeRandom(seed){let s=(Number(seed)>>>0)||1;return()=>{s=(1664525*s+1013904223)>>>0;return s/4294967296;};}
function createMatch({teams,seed=1}={}){
 if(!Array.isArray(teams)||teams.length!==2)throw Error('Exactly two teams are required');
 const normalized=teams.map((src,tid)=>{
  if(!src||!Array.isArray(src.players)||src.players.length<7)throw Error('Each team needs at least 7 players');
  const dir=tid===0?1:-1;
  return {id:tid,name:String(src.name||(tid?'Away':'Home')),mentality:src.mentality||'balanced',adaptiveTactics:src.adaptiveTactics!==false,players:src.players.map((p,i)=>{
   const role=p.role||(i===0?'GK':i<5?'DF':i<9?'MF':'FW'),lx=line(role);
   const x=clamp(Number(p.x??(tid===0?lx*100:100-lx*100)),2,98),y=clamp(Number(p.y??(8+(i%9)*10.5)),2,98);
   return {id:String(p.id??i),name:String(p.name||'Player'),role,pace:clamp(Number(p.pace??60),1,100),passing:clamp(Number(p.passing??60),1,100),shooting:clamp(Number(p.shooting??50),1,100),defending:clamp(Number(p.defending??50),1,100),stamina:clamp(Number(p.stamina??100),0,100),x,y,baseX:x,baseY:y,active:p.active!==false,direction:dir};
  })};
 });
 const random=makeRandom(seed),kick=normalized[0].players.find(p=>!keeper(p.role)&&p.active)||normalized[0].players[0];
 return {minute:0,score:[0,0],possession:[0,0],shots:[0,0],shotsOnTarget:[0,0],passes:[0,0],completedPasses:[0,0],tackles:[0,0],teams:normalized,ball:{x:kick.x,y:kick.y,team:0,playerId:kick.id},events:[],random};
}
const active=t=>t.players.filter(p=>p.active);
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
function updateShape(s,teamId,carrier){
 const ballX=s.ball.x,ballY=s.ball.y;
 for(const t of s.teams){
  const has=t.id===teamId,dir=t.id===0?1:-1,mentality=effectiveMentality(s,t.id);
  const pushScale=mentality==='attacking'?1.35:mentality==='defensive'?.62:mentality==='counter'?1.15:1;
  const pressScale=mentality==='pressing'?1.7:mentality==='defensive'?.65:1;
  const defenders=active(t);
  const pressers=has?[]:defenders.filter(p=>!keeper(p.role)).sort((a,b)=>distance(a,carrier)-distance(b,carrier)).slice(0,mentality==='pressing'?3:1);
  const cover=pressers.length?pressers[0]:null;
  for(const p of defenders){
   if(has&&p.id===carrier.id)continue;
   const r=String(p.role||'').toUpperCase(),l=line(r);
   const isWide=/^(LW|RW|LM|RM|LB|RB|LWB|RWB)$/.test(r);
   const isFullback=/^(LB|RB|LWB|RWB)$/.test(r);
   const isForward=/^(LW|RW|ST|CF|FW|FWD)$/.test(r);
   const ballProgress=(ballX-50)*dir;
   const forwardPush=has?(l>.68?10:l>.43?5.5:1.2)*pushScale:-1.2;
   let tx=p.baseX+dir*forwardPush+(ballX-50)*.075*dir*(has?1:1.35);
   let ty=p.baseY+(ballY-50)*(has?.13:.19);

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
    // Striker offers a forward passing lane but does not teleport beyond the ball.
    // Keep the striker ahead of the ball in the team's own attacking direction.
    // The previous mirrored expression incorrectly pushed the away striker backward.
    tx=dir>0?Math.max(ballX+2,tx):Math.min(ballX-2,tx);
    tx=clamp(tx,t.id===0?ballX-2:2,t.id===0?98:ballX+2);
   }

   if(keeper(r)){tx=t.id===0?5:95;ty=clamp(50+(ballY-50)*.14,38,62);}
   else if(!has&&l<.35){
    tx=clamp(tx,t.id===0?8:62,t.id===0?38:92);
    ty=p.baseY+(ballY-p.baseY)*.16;
   }

   // A compact, coordinated press: one player closes the ball, nearby
   // midfielders cover passing lanes, while the rest preserve their line.
   const isPresser=pressers.some(q=>q.id===p.id);
   if(!has&&isPresser){
    const rank=pressers.findIndex(q=>q.id===p.id);
    const target=rank===0?{x:carrier.x,y:carrier.y}:{x:carrier.x-dir*5,y:carrier.y+(p.baseY<50?-7:7)};
    moveToward(p,target,rank===0?1.8*pressScale:1.15*pressScale);
   }else{
    moveToward(p,{x:clamp(tx,2,98),y:clamp(ty,3,97)},has?1.3:1.25);
   }
  }
 }
}
function addEvent(s,e){s.events.push(e);if(s.events.length>300)s.events.shift();}
function pointSegmentDistance(point,a,b){
 const dx=b.x-a.x,dy=b.y-a.y,len2=dx*dx+dy*dy;
 if(!len2)return distance(point,a);
 const u=clamp(((point.x-a.x)*dx+(point.y-a.y)*dy)/len2,0,1);
 return Math.hypot(point.x-(a.x+u*dx),point.y-(a.y+u*dy));
}
// Score receiver space and the entire pass corridor, not only the receiver's endpoint.
function choosePassTarget(team,defenders,carrier,teamId){
 const dir=teamId===0?1:-1;
 const candidates=active(team).filter(p=>p.id!==carrier.id).map(p=>{
  const progress=(p.x-carrier.x)*dir,nearestDef=nearest(defenders,p);
  const space=nearestDef?distance(nearestDef,p):30;
  const laneClearance=defenders.reduce((best,d)=>Math.min(best,pointSegmentDistance(d,carrier,p)),30);
  const lateral=Math.abs(p.y-carrier.y);
  const forwardBonus=progress>0?3:0;
  const score=progress*.78+Math.min(space,24)*.42+Math.min(laneClearance,18)*.62+p.passing*.025-lateral*.22+forwardBonus;
  return{p,progress,space,laneClearance,score};
 });
 if(!candidates.length)return null;
 const safeForward=candidates.filter(c=>c.progress>1.5&&c.space>4&&c.laneClearance>2.5);
 return (safeForward.length?safeForward:candidates).sort((a,b)=>b.score-a.score)[0];
}
function stepAction(s){
 const tid=s.ball.team,oid=1-tid,t=s.teams[tid],opp=s.teams[oid];
 const carrier=t.players.find(p=>p.active&&p.id===s.ball.playerId)||nearest(active(t),s.ball);
 if(!carrier)throw Error('The team in possession has no active players');
 const rnd=s.random||(s.random=makeRandom(1)),goalX=tid===0?100:0,def=active(opp);
 let press=nearest(def,carrier),pd=press?distance(press,carrier):40;
 const goalDist=Math.abs(goalX-carrier.x);
 s.possession[tid]+=1/3;
 carrier.stamina=clamp(carrier.stamina-.012,0,100);
 updateShape(s,tid,carrier);
 // Re-evaluate pressure after defenders have moved into their pressing positions.
 press=nearest(def,carrier);pd=press?distance(press,carrier):40;
 // Calibrated against the three-actions-per-minute clock and legacy OVR mapping.
 const shotChance=clamp(.07+carrier.shooting/1400-pd/1200,.025,.16);
 let event=null;
 if(goalDist<=25&&Math.abs(50-carrier.y)<=31&&rnd()<shotChance){
  s.shots[tid]++;
  const on=rnd()<clamp(.2+carrier.shooting/180,.2,.75);
  if(on)s.shotsOnTarget[tid]++;
  const quality=clamp(.05+carrier.shooting/400+(25-goalDist)/95-Math.abs(50-carrier.y)/220-(pd<5?.12:0),.03,.5);
  const goal=on&&rnd()<quality;
  if(goal)s.score[tid]++;
  event={type:goal?'goal':on?'save':'shot',minute:s.minute+1,team:tid,playerId:carrier.id,x:carrier.x,y:carrier.y};
  const restart=opp.players.find(p=>p.active&&keeper(p.role))||nearest(active(opp),{x:oid===0?5:95,y:50});
  if(restart)s.ball={x:restart.x,y:restart.y,team:oid,playerId:restart.id};
 }else{
  const best=choosePassTarget(t,def,carrier,tid);
  const closeTackle=press&&pd<4.5&&rnd()<.11+press.defending/900;
  if(closeTackle){
   s.tackles[oid]++;
   s.ball={x:press.x,y:press.y,team:oid,playerId:press.id};
   event={type:'tackle',minute:s.minute+1,team:oid,playerId:press.id,x:press.x,y:press.y};
  }else{
   const pass=best&&rnd()<(pd<4.5?.35:pd<8.5?.72:best.progress>0?.58:.28);
   if(pass){
    s.passes[tid]++;
    const chance=clamp(.66+carrier.passing/350-Math.max(0,distance(carrier,best.p)-12)/180-(pd<4?.1:pd<8?.04:0),.35,.97);
    if(rnd()<chance){
     s.completedPasses[tid]++;
     s.ball={x:best.p.x,y:best.p.y,team:tid,playerId:best.p.id};
     event={type:'pass',minute:s.minute+1,team:tid,from:carrier.id,to:best.p.id,x:best.p.x,y:best.p.y};
    }else{
     const win=nearest(def,{x:(carrier.x+best.p.x)/2,y:(carrier.y+best.p.y)/2})||press;
     if(win){
      s.ball={x:win.x,y:win.y,team:oid,playerId:win.id};
      event={type:'interception',minute:s.minute+1,team:oid,playerId:win.id,x:win.x,y:win.y};
     }
    }
   }else{
    const dir=tid===0?1:-1;
    const lateral=press&&Math.abs(press.y-carrier.y)<8?(carrier.y<50?-.65:.65):(50-carrier.y)*.012;
    carrier.x=clamp(carrier.x+dir*(.7+carrier.pace/95),2,98);
    carrier.y=clamp(carrier.y+lateral,3,97);
    s.ball={x:carrier.x,y:carrier.y,team:tid,playerId:carrier.id};
    event={type:'carry',minute:s.minute+1,team:tid,playerId:carrier.id,x:carrier.x,y:carrier.y};
   }
  }
 }
 if(event)addEvent(s,event);
}
function stepMatch(s){
 if(!s||!Array.isArray(s.teams)||s.teams.length!==2||!s.ball)throw Error('Invalid match state');
 // Three linked actions per displayed minute provide passing, pressing and
 // chance creation without making the match clock run faster.
 for(let action=0;action<3;action++)stepAction(s);
 // Keep cumulative possession exact at one displayed minute per step.
 s.possession[0]=Number(s.possession[0].toFixed(6));
 s.possession[1]=s.minute+1-s.possession[0];
 s.minute++;
 return s;
}
function simulateMatch(s,minutes=90){const n=clamp(Math.floor(Number(minutes)||0),0,120);for(let i=0;i<n;i++)stepMatch(s);return s;}
const FM4MatchEngine={createMatch,stepMatch,simulateMatch,distance,roleLine:line,choosePassTarget,effectiveMentality};
if(typeof module!=='undefined'&&module.exports)module.exports=FM4MatchEngine;
if(typeof window!=='undefined')window.FM4MatchEngine=FM4MatchEngine;

})();

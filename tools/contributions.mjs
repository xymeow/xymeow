import {writeFile,rename} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
export function parsePublic(html){
 const tips=new Map([...html.matchAll(/<tool-tip\b[^>]*for="([^"]+)"[^>]*>([\s\S]*?)<\/tool-tip>/g)].map(m=>[m[1],m[2].replace(/<[^>]*>/g,'').trim()]));
 const days=[];
 for(const m of html.matchAll(/<td\b[^>]*data-date="([^"]+)"[^>]*>/g)){
  const tag=m[0],id=tag.match(/\bid="([^"]+)"/)?.[1],level=Number(tag.match(/data-level="([0-4])"/)?.[1]),tip=tips.get(id);
  const count=tip?.startsWith('No contributions')?0:Number(tip?.match(/^([\d,]+) contribution/)?.[1]?.replaceAll(',',''));
  if(!Number.isInteger(count)||!Number.isInteger(level))throw Error('Public calendar markup/count missing');
  days.push({date:m[1],count,level});
 }
 days.sort((a,b)=>a.date.localeCompare(b.date));
 if(days.length<350||days.length>371||new Set(days.map(d=>d.date)).size!==days.length)throw Error('Incomplete public calendar');
 for(let i=1;i<days.length;i++)if(Date.parse(days[i].date)-Date.parse(days[i-1].date)!==86400000)throw Error('Calendar date gap');
 return days;
}
export function board(days){
 if(!days.length)throw Error('No calendar days');
 const start=Date.parse(days[0].date)-new Date(days[0].date).getUTCDay()*86400000;
 const cells=days.map(d=>({...d,x:Math.floor((Date.parse(d.date)-start)/604800000),y:new Date(d.date).getUTCDay(),mine:d.count>0}));
 const near=i=>cells.map((c,j)=>j).filter(j=>j!==i&&Math.abs(cells[j].x-cells[i].x)<=1&&Math.abs(cells[j].y-cells[i].y)<=1);
 cells.forEach((c,i)=>c.number=near(i).filter(j=>cells[j].mine).length);
 return {cells,near};
}
export function solve(b){
 const {cells,near}=b,revealed=new Set(),flags=new Set(),events=[];
 let lost=false;
 const reveal=(i,guess=false)=>{
  if(revealed.has(i)||flags.has(i))return;
  revealed.add(i);events.push({i,type:cells[i].mine?'explode':'reveal',guess});
  if(cells[i].mine){lost=true;return;}
  if(cells[i].number===0)for(const j of near(i)){if(!lost)reveal(j);}
 };
 while(!lost&&revealed.size<cells.filter(c=>!c.mine).length){
  let progress=false;
  for(const i of [...revealed]){
   const n=near(i),unknown=n.filter(j=>!revealed.has(j)&&!flags.has(j)),remaining=cells[i].number-n.filter(j=>flags.has(j)).length;
   if(!unknown.length)continue;
   if(remaining===0){for(const j of unknown)reveal(j);progress=true;}
   else if(remaining===unknown.length){for(const j of unknown){flags.add(j);events.push({i:j,type:'flag'});}progress=true;}
   if(lost)break;
  }
  if(lost||progress)continue;
  const unknown=cells.map((_,i)=>i).filter(i=>!revealed.has(i)&&!flags.has(i));
  if(!unknown.length)break;
  const total=cells.filter(c=>c.mine).length;
  const risk=j=>Math.max((total-flags.size)/unknown.length,...[...revealed].filter(i=>near(i).includes(j)).map(i=>{
   const ns=near(i);return (cells[i].number-ns.filter(k=>flags.has(k)).length)/ns.filter(k=>!revealed.has(k)&&!flags.has(k)).length;
  }));
  unknown.sort((a,b)=>risk(a)-risk(b)||a-b);reveal(unknown[0],true);
 }
 const won=!lost&&revealed.size===cells.filter(c=>!c.mine).length;
 if(won)cells.forEach((c,i)=>{if(c.mine&&!flags.has(i)){flags.add(i);events.push({i,type:'flag'});}});
 return {events,revealed,flags,won,lost};
}
export function svg(days,dark=false){
 const b=board(days),run=solve(b),width=(Math.max(...b.cells.map(c=>c.x))+1)*15+24,duration=Math.max(8,run.events.length*.16+4),end=(duration-3)/duration;
 const palette=dark?['#161b22','#0e4429','#006d32','#26a641','#39d353']:['#ebedf0','#9be9a8','#40c463','#30a14e','#216e39'];
 const bg=dark?'#0d1117':'#ffffff',ink=dark?'#e6edf3':'#24292f',cover=dark?'#30363d':'#d0d7de';
 const esc=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;');
 const anim=(time,values)=>`<animate attributeName="opacity" dur="${duration}s" repeatCount="indefinite" calcMode="discrete" keyTimes="0;${Math.min(time,end).toFixed(6)};${end.toFixed(6)};1" values="${values}"/>`;
 let out=`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="166" viewBox="0 0 ${width} 166"><rect width="100%" height="100%" fill="${bg}"/><g font-family="system-ui,sans-serif"><text x="12" y="18" fill="${ink}" font-size="12">xymeow · Contribution Minesweeper</text>`;
 b.cells.forEach((c,i)=>{
  const x=12+c.x*15,y=31+c.y*15,event=run.events.findIndex(e=>e.i===i),time=event<0?end:(event*.16+.4)/duration;
  const exposed=run.revealed.has(i),flagged=run.flags.has(i);
  out+=`<g><title>${c.date}: ${c.count} contributions</title><rect x="${x}" y="${y}" width="11" height="11" rx="2" stroke="${cover}" stroke-width=".4" fill="${palette[c.level]}"/><rect x="${x}" y="${y}" width="11" height="11" rx="2" fill="${cover}">${anim(time,exposed?'1;0;0;1':'1;1;0;1')}</rect>`;
  if(c.number&&!c.mine)out+=`<text x="${x+5.5}" y="${y+9}" font-size="9" text-anchor="middle" fill="${ink}" opacity="0">${c.number}${anim(time,exposed?'0;1;0;0':'0;0;0;0')}</text>`;
  if(c.mine)out+=`<circle cx="${x+5.5}" cy="${y+5.5}" r="2.5" fill="#f85149" opacity="0">${anim(exposed?time:end,'0;1;1;0')}</circle>`;
  if(flagged)out+=`<path d="M${x+3} ${y+10}v-8l5 2-5 2" fill="#f2cc60" stroke="#9e6a03" stroke-width=".6" opacity="0">${anim(time,'0;1;1;0')}</path>`;
  out+='</g>';
 });
 if(run.events.length){
 const keys=[0,...run.events.map((_,i)=>(i*.16+.4)/duration),end,1];
 const positions=['12 31',...run.events.map(e=>`${12+b.cells[e.i].x*15} ${31+b.cells[e.i].y*15}`),'12 31','12 31'];
 out+=`<g><path d="M0 0v10l3-3 3 5 2-1-3-5h5z" fill="${ink}" stroke="${bg}" stroke-width=".8"/><animateTransform attributeName="transform" type="translate" dur="${duration}s" repeatCount="indefinite" calcMode="discrete" keyTimes="${keys.join(';')}" values="${positions.join(';')}"/></g>`;
 }
 out+=`<text x="12" y="149" fill="${ink}" font-size="10">${esc(days[0].date)} — ${esc(days.at(-1).date)} · public contributions, not just commits · animated replay</text><text x="${width-12}" y="18" text-anchor="end" fill="${ink}" font-size="11" opacity="0">${run.won?'Cleared!':'Guess hit a mine — game over'}${anim(end,'0;1;1;0')}</text></g></svg>`;
 return out;
}
export async function fetchDays(username,token){
 if(!token)throw Error('GH_TOKEN required for calendar validation');
 const query='query($login:String!){user(login:$login){contributionsCollection{contributionCalendar{weeks{contributionDays{date contributionCount contributionLevel}}}}}}';
 const [publicResponse,api]=await Promise.all([fetch(`https://github.com/users/${username}/contributions`,{headers:{'Accept-Language':'en-US'}}),fetch('https://api.github.com/graphql',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({query,variables:{login:username}})})]);
 if(!publicResponse.ok||!api.ok)throw Error(`Calendar HTTP error: public ${publicResponse.status}, GraphQL ${api.status}`);
 const days=parsePublic(await publicResponse.text()),json=await api.json();
 if(json.errors)throw Error('GraphQL calendar query failed: '+json.errors.map(e=>e.message).join('; '));
 const authenticated=json.data?.user?.contributionsCollection?.contributionCalendar?.weeks?.flatMap(w=>w.contributionDays);
 if(!authenticated?.length)throw Error('GraphQL calendar missing');
 const byDate=new Map(authenticated.map(d=>[d.date,d]));
 if(days.some(d=>!byDate.has(d.date)))throw Error('Public/GraphQL date ranges differ; retry next run');
 const differences=days.filter(d=>d.count!==byDate.get(d.date).contributionCount).length;
 console.log(`Validated ${days.length} PUBLIC calendar days. Authenticated count differences: ${differences}. Public counts only are rendered.`);
 return days;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const days=await fetchDays('xymeow',process.env.GH_TOKEN);
 const outputs=[['assets/minesweeper-contribution-graph.svg',svg(days)],['assets/minesweeper-contribution-graph-dark.svg',svg(days,true)]];
 // Fetch and generate both before replacing any output; a fetch failure preserves old images.
 for(const [path,data] of outputs)await writeFile(path+'.tmp',data);
 for(const [path] of outputs)await rename(path+'.tmp',path);
}

export function projectCarouselSchedule(carousels, config, runs, now=new Date()) {
 const blocked=runs.some(run=>run.phase==='uncertain');
 const schedule={enabled:config.enabled,timezone:config.timezone,hours:config.hours,blocked};
 const occupied=new Set(runs.map(run=>new Date(run.slot).getTime()));
 const active=new Map(runs.filter(run=>['children','parent','ready','publishing','uncertain'].includes(run.phase)).map(run=>[run.carousel_id,run]));
 const slots=[];
 if(config.enabled && !blocked) {
  const fmt=new Intl.DateTimeFormat('en-US',{timeZone:config.timezone,hour:'numeric',hourCycle:'h23'});
  const start=Math.floor(now.getTime()/3600000)*3600000;
  for(let t=start;slots.length<carousels.length && t<start+366*86400000;t+=3600000) {
   if(t<new Date(config.starts_at).getTime() || t<now.getTime()-15*60000 || occupied.has(t))continue;
   if(config.hours.includes(Number(fmt.format(new Date(t)))))slots.push(new Date(t).toISOString());
  }
 }
 let position=0;
 return {schedule,carousels:carousels.map(carousel=>({ ...carousel,
  scheduledAt:active.get(carousel.id)?.slot || (carousel.status==='ready'?slots[position++] || null:null),
  schedulePhase:active.get(carousel.id)?.phase || null,
 }))};
}
export async function carouselSchedule(db,carousels) {
 const [{data:config,error},{data:runs,error:runsError}]=await Promise.all([
  db.from('instagram_schedule').select('*').eq('id',true).single(),
  db.from('instagram_schedule_runs').select('slot,carousel_id,phase').order('slot',{ascending:false}).limit(500),
 ]);
 if(error || runsError)throw error || runsError;
 return projectCarouselSchedule(carousels,config,runs);
}

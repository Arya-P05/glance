import { createClient } from 'npm:@supabase/supabase-js@2';
const env = (key:string) => {const value=Deno.env.get(key);if(!value)throw new Error(`Missing ${key}`);return value;};
const db = createClient(env('SUPABASE_URL'),env('SUPABASE_SERVICE_ROLE_KEY'));
async function graph(path:string,params:Record<string,string>={},method='GET') {
 const url=new URL(`${env('INSTAGRAM_GRAPH_API_BASE')}/${env('META_GRAPH_API_VERSION')}/${path}`);
 const init:RequestInit={method,headers:{Authorization:`Bearer ${env('INSTAGRAM_ACCESS_TOKEN')}`},signal:AbortSignal.timeout(15000)};
 if(method==='GET') Object.entries(params).forEach(([k,v])=>url.searchParams.set(k,v));
 else init.body=new URLSearchParams(params);
 const res=await fetch(url,init);const data=await res.json();
 if(!res.ok || data.error) throw new Error(data.error?.message || `Instagram HTTP ${res.status}`);
 return data;
}
Deno.serve(async req=>{
 if(req.headers.get('x-scheduler-secret')!==env('INSTAGRAM_SCHEDULER_SECRET')) return new Response('Unauthorized',{status:401});
 if(req.method!=='POST')return new Response('Method not allowed',{status:405});
 let run:any;
 try {
  const body=await req.json().catch(()=>({}));
  if(body.action==='health') {
   const profile=await graph(env('INSTAGRAM_BUSINESS_ACCOUNT_ID'),{fields:'id,username'});
   const {data,error}=await db.from('instagram_schedule').select('*').single();if(error)throw error;
   return Response.json({connected:true,username:profile.username,schedule:data});
  }
  const claim=await db.rpc('claim_instagram_slot');if(claim.error)throw claim.error;run=claim.data;
  if(!run)return Response.json({status:'idle'});
  const save=async(patch:Record<string,unknown>,release=true)=>{
   const {data,error}=await db.from('instagram_schedule_runs').update({...patch,...(release?{lease:null,lease_until:null}:{})}).eq('slot',run.slot).eq('lease',run.lease).select('slot');
   if(error || !data?.length)throw new Error(error?.message || 'Lost schedule lease');
  };
  const carousel=await db.from('instagram_carousels').select('caption,status').eq('id',run.carousel_id).single();
  if(carousel.error || carousel.data.status!=='posting')throw new Error('Scheduled carousel is no longer publishing');
  const items=await db.from('instagram_carousel_items').select('position,posts(storage_path,status)').eq('carousel_id',run.carousel_id).order('position');
  if(items.error || items.data?.length!==5 || items.data.some((x:any)=>x.posts?.status!=='active'))throw new Error('Carousel requires five active Library posts');
  const account=env('INSTAGRAM_BUSINESS_ACCOUNT_ID');
  if(run.phase==='children') {
   const deadline=Date.now()+60000;
   for(let i=run.children.length;i<5 && Date.now()<deadline;i++) {
    const item:any=items.data[i];
    const image_url=db.storage.from('instagram-posts').getPublicUrl(item.posts.storage_path).data.publicUrl;
    const child=await graph(`${account}/media`,{image_url,is_carousel_item:'true'},'POST');
    if(!child.id)throw new Error('Missing child container ID');
    run.children.push(child.id);await save({children:run.children},false);
   }
   await save({children:run.children,phase:run.children.length===5?'parent':'children'});
  } else if(run.phase==='parent' || run.phase==='ready') {
   const ids=run.phase==='parent'?run.children:[run.parent_id];
   const statuses=await Promise.all(ids.map((id:string)=>graph(id,{fields:'status_code,status'})));
   if(statuses.some(x=>['ERROR','EXPIRED'].includes(x.status_code)))throw new Error('Instagram media preparation failed');
   if(!statuses.every(x=>x.status_code==='FINISHED')) {await save({});return Response.json({status:'processing'});}
   if(run.phase==='parent') {
    const parent=await graph(`${account}/media`,{media_type:'CAROUSEL',children:run.children.join(','),caption:carousel.data.caption},'POST');
    if(!parent.id)throw new Error('Missing parent container ID');
    await save({phase:'ready',parent_id:parent.id});
   } else {
    // Commit the publish intent BEFORE the external side effect. Never replay it.
    await save({phase:'publishing'},false);run.phase='publishing';
    const media=await graph(`${account}/media_publish`,{creation_id:run.parent_id},'POST');
    if(!media.id)throw new Error('Missing published media ID');
    await save({media_id:media.id},false);
    let permalink=null;
    try {permalink=(await graph(media.id,{fields:'permalink'})).permalink || null;}catch{/* Publishing already succeeded. */}
    const finished=await db.rpc('finish_instagram_slot',{p_slot:run.slot,p_lease:run.lease,p_media:media.id,p_permalink:permalink});
    if(finished.error)throw finished.error;
    return Response.json({status:'posted',permalink});
   }
  }
  return Response.json({status:'advanced',slot:run.slot});
 } catch(error) {
  const message=error instanceof Error?error.message:'Cloud publishing failed';
  if(run) {
   const uncertain=run.phase==='publishing';
   const saved=await db.from('instagram_schedule_runs').update({phase:uncertain?'uncertain':'failed',error:message,lease:null,lease_until:null}).eq('slot',run.slot).eq('lease',run.lease).select('slot');
   if(saved.data?.length)await db.from('instagram_carousels').update({...(uncertain?{}:{status:'failed'}),last_error:message}).eq('id',run.carousel_id).eq('status','posting');
  }
  console.error(message);return Response.json({error:message},{status:500});
 }
});

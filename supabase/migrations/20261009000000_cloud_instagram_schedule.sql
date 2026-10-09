create table public.instagram_schedule (
 id boolean primary key default true check(id), enabled boolean not null default false,
 timezone text not null default 'America/New_York', hours integer[] not null default '{9,14,19}',
 starts_at timestamptz not null default now()
);
insert into public.instagram_schedule(id) values(true);
create table public.instagram_schedule_runs (
 slot timestamptz primary key, carousel_id uuid references public.instagram_carousels(id),
 phase text not null default 'children' check(phase in ('children','parent','ready','publishing','posted','failed','uncertain','empty')),
 children jsonb not null default '[]', parent_id text, media_id text, error text,
 lease uuid, lease_until timestamptz, created_at timestamptz not null default now()
);
alter table public.instagram_schedule enable row level security;
alter table public.instagram_schedule_runs enable row level security;
revoke all on public.instagram_schedule,public.instagram_schedule_runs from anon,authenticated;
grant all on public.instagram_schedule,public.instagram_schedule_runs to service_role;

create function public.claim_instagram_slot(p_now timestamptz default now()) returns jsonb
language plpgsql security definer set search_path=public as $$
declare cfg public.instagram_schedule; r public.instagram_schedule_runs; c uuid; due timestamptz; token uuid:=gen_random_uuid();
begin
 select * into cfg from public.instagram_schedule where id=true for update;
 if not cfg.enabled then return null; end if;
 -- Never replay a publish whose external outcome is unknown.
 update public.instagram_schedule_runs set phase='uncertain',error='Publish interrupted; reconcile Instagram before retrying',lease=null
 where phase='publishing' and lease_until < p_now;
 select * into r from public.instagram_schedule_runs
 where phase in ('children','parent','ready') and (lease_until is null or lease_until < p_now)
 order by slot limit 1 for update skip locked;
 if r.slot is null then
   if exists(select 1 from public.instagram_schedule_runs where phase in ('children','parent','ready','publishing','uncertain')) then return null; end if;
   select max(((p_now at time zone cfg.timezone)::date + make_time(h,0,0)) at time zone cfg.timezone)
   into due from unnest(cfg.hours) h
   where ((p_now at time zone cfg.timezone)::date + make_time(h,0,0)) at time zone cfg.timezone <= p_now;
   if due is null or due < cfg.starts_at or p_now-due > interval '15 minutes' then return null; end if;
   if exists(select 1 from public.instagram_schedule_runs where slot=due) then return null; end if;
   select id into c from public.instagram_carousels where status='ready' order by created_at desc,id limit 1 for update skip locked;
   insert into public.instagram_schedule_runs(slot,carousel_id,phase) values(due,c,case when c is null then 'empty' else 'children' end) returning * into r;
   if c is null then return null; end if;
   update public.instagram_carousels set status='posting',last_error=null where id=c;
 end if;
 if p_now-r.created_at > interval '45 minutes' then
   update public.instagram_schedule_runs set phase='failed',error='Container preparation timed out' where slot=r.slot;
   update public.instagram_carousels set status='failed',last_error='Cloud preparation timed out' where id=r.carousel_id;
   return null;
 end if;
 update public.instagram_schedule_runs set lease=token,lease_until=p_now+interval '2 minutes' where slot=r.slot returning * into r;
 return to_jsonb(r);
end $$;

create function public.finish_instagram_slot(p_slot timestamptz,p_lease uuid,p_media text,p_permalink text) returns void
language plpgsql security definer set search_path=public as $$
declare c uuid;
begin
 update public.instagram_schedule_runs set phase='posted',media_id=p_media,lease=null,lease_until=null
 where slot=p_slot and lease=p_lease and phase='publishing' returning carousel_id into c;
 if c is null then raise exception 'Lost publishing lease'; end if;
 update public.instagram_carousels set status='posted',instagram_media_id=p_media,permalink=p_permalink,posted_at=now(),last_error=null where id=c;
end $$;
revoke all on function public.claim_instagram_slot(timestamptz),public.finish_instagram_slot(timestamptz,uuid,text,text) from public,anon,authenticated;
grant execute on function public.claim_instagram_slot(timestamptz),public.finish_instagram_slot(timestamptz,uuid,text,text) to service_role;

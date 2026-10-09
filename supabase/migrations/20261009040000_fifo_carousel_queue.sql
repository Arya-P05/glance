-- Preserve today's queue order, then append new ready entries by enqueue time.
alter table public.instagram_carousels add column queued_at timestamptz;
with existing as (
 select id,row_number() over(order by created_at desc,id) as position,count(*) over() as total
 from public.instagram_carousels where status in ('ready','posting')
)
update public.instagram_carousels c set queued_at=now() - ((e.total-e.position+1)*interval '1 second')
from existing e where c.id=e.id;
create function public.stamp_carousel_queue_entry() returns trigger
language plpgsql set search_path=public as $$
begin
 if new.status='ready' then
  if TG_OP='INSERT' then new.queued_at=clock_timestamp();
  elsif old.status<>'ready' then new.queued_at=clock_timestamp();
  else new.queued_at=old.queued_at;
  end if;
 end if;
 return new;
end $$;
create trigger stamp_carousel_queue_entry before insert or update on public.instagram_carousels
for each row execute function public.stamp_carousel_queue_entry();
create index instagram_carousel_queue_order on public.instagram_carousels(queued_at,id) where status='ready';

create or replace function public.claim_instagram_slot(p_now timestamptz default now()) returns jsonb
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
   select id into c from public.instagram_carousels where status='ready' order by queued_at asc nulls last,created_at asc,id limit 1 for update skip locked;
   insert into public.instagram_schedule_runs(slot,carousel_id,phase) values(due,c,case when c is null then 'empty' else 'children' end) returning * into r;
   if c is null then return null; end if;
   begin
    update public.instagram_carousels set status='posting',last_error=null where id=c;
   exception when others then
    update public.instagram_carousels set status='failed',last_error=SQLERRM where id=c;
    update public.instagram_schedule_runs set phase='failed',error=SQLERRM where slot=due;
    return null;
   end;
 end if;
 if p_now-r.created_at > interval '45 minutes' then
   update public.instagram_schedule_runs set phase='failed',error='Container preparation timed out' where slot=r.slot;
   update public.instagram_carousels set status='failed',last_error='Cloud preparation timed out' where id=r.carousel_id;
   return null;
 end if;
 update public.instagram_schedule_runs set lease=token,lease_until=p_now+interval '2 minutes' where slot=r.slot returning * into r;
 return to_jsonb(r);
end $$;


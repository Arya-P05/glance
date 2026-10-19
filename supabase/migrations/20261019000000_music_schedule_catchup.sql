-- Music workers tolerate best-effort cloud wakeups; Graph retains its original policy.
create function public.claim_instagram_music_slot_at(p_now timestamptz) returns jsonb
language plpgsql security definer set search_path=public as $$
declare cfg public.instagram_schedule; r public.instagram_schedule_runs; c uuid; due timestamptz;
begin
 select * into cfg from instagram_schedule where id=true for update;
 if cfg.publisher<>'music' then return jsonb_build_object('outcome','inactive');end if;
 if not cfg.enabled then return jsonb_build_object('outcome','paused');end if;
 update instagram_schedule_runs set phase='uncertain',error='Publish interrupted; reconcile Instagram before retrying',lease=null,lease_until=null
 where phase='publishing' and lease_until<p_now;
 if exists(select 1 from instagram_schedule_runs where phase='uncertain')
 then return jsonb_build_object('outcome','blocked_uncertain');end if;
 select * into r from instagram_schedule_runs
 where publisher='music' and phase='children' and (lease_until is null or lease_until<p_now)
 order by slot limit 1 for update;
 if r.slot is null then
  if exists(select 1 from instagram_schedule_runs where phase in ('children','parent','ready','publishing'))
  then return jsonb_build_object('outcome','busy');end if;
  select max(((p_now at time zone cfg.timezone)::date - d + make_time(h,0,0)) at time zone cfg.timezone)
  into due from unnest(cfg.hours) h cross join generate_series(0,1) d
  where ((p_now at time zone cfg.timezone)::date - d + make_time(h,0,0)) at time zone cfg.timezone <= p_now;
  if due is null or due<cfg.starts_at then return jsonb_build_object('outcome','not_due');end if;
  if exists(select 1 from instagram_schedule_runs where slot=due)
  then return jsonb_build_object('outcome','slot_already_handled','slot',due);end if;
  if p_now-due>interval '4 hours'
  then return jsonb_build_object('outcome','missed_window','slot',due);end if;
  if exists(select 1 from instagram_carousels where posted_at>p_now-interval '1 hour')
  then return jsonb_build_object('outcome','cooldown','slot',due);end if;
  select id into c from instagram_carousels where status='ready'
  order by queued_at asc nulls last,created_at asc,id limit 1 for update skip locked;
  insert into instagram_schedule_runs(slot,carousel_id,phase,publisher,created_at)
  values(due,c,case when c is null then 'empty' else 'children' end,'music',p_now) returning * into r;
  if c is null then return jsonb_build_object('outcome','empty_queue','slot',due);end if;
  begin
   update instagram_carousels set status='posting',last_error=null where id=c;
  exception when others then
   update instagram_carousels set status='failed',last_error=SQLERRM where id=c;
   update instagram_schedule_runs set phase='failed',error=SQLERRM where slot=due;
   return jsonb_build_object('outcome','claim_failed','slot',due);
  end;
 end if;
 if p_now-r.created_at>interval '45 minutes' then
  update instagram_schedule_runs set phase='failed',error='Music preparation timed out',lease=null,lease_until=null where slot=r.slot;
  update instagram_carousels set status='failed',last_error='Music preparation timed out' where id=r.carousel_id;
  return jsonb_build_object('outcome','preparation_expired','slot',r.slot);
 end if;
 update instagram_schedule_runs set lease=gen_random_uuid(),lease_until=p_now+interval '2 minutes'
 where slot=r.slot returning * into r;
 return to_jsonb(r)||jsonb_build_object('outcome','claimed');
end $$;
revoke all on function public.claim_instagram_music_slot_at(timestamptz) from public,anon,authenticated,service_role;
create or replace function public.claim_instagram_music_slot() returns jsonb
language sql security definer set search_path=public as $$
 select claim_instagram_music_slot_at(now());
$$;

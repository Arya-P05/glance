begin;
do $$
declare t timestamptz; r jsonb; fixture uuid; h int; v jsonb;
begin
 h:=extract(hour from now() at time zone 'America/New_York');
 t:=date_trunc('hour',now())+interval '1 minute';
 update public.instagram_schedule set enabled=true,hours=array[h],starts_at=t-interval '1 minute';
 update public.instagram_carousels set status='draft' where status='ready';
 insert into public.instagram_carousels(title,status) values('rollback scheduling fixture','ready') returning id into fixture;
 r:=public.claim_instagram_slot(t);
 if (r->>'carousel_id')::uuid is distinct from fixture then raise exception 'Ready carousel not claimed'; end if;
 if public.claim_instagram_slot(t) is not null then raise exception 'Concurrent worker duplicated claim'; end if;
 update public.instagram_schedule_runs set phase='publishing',lease_until=t-interval '1 second' where slot=(r->>'slot')::timestamptz;
 if public.claim_instagram_slot(t) is not null then raise exception 'Uncertain publish retried'; end if;
 if not exists(select 1 from public.instagram_schedule_runs where slot=(r->>'slot')::timestamptz and phase='uncertain') then raise exception 'Lost publish not held'; end if;
 update public.instagram_schedule_runs set phase='publishing',lease=(r->>'lease')::uuid where slot=(r->>'slot')::timestamptz;
 perform public.finish_instagram_slot((r->>'slot')::timestamptz,(r->>'lease')::uuid,'test-media','test-link');
 if not exists(select 1 from public.instagram_carousels where id=fixture and status='posted') then raise exception 'Publish result not committed'; end if;
 if public.claim_instagram_slot(t) is not null then raise exception 'Completed slot ran twice'; end if;
 if ('2026-10-09 09:00'::timestamp at time zone 'America/New_York') <> '2026-10-09 13:00Z'::timestamptz or
    ('2026-11-09 09:00'::timestamp at time zone 'America/New_York') <> '2026-11-09 14:00Z'::timestamptz then raise exception 'DST conversion failed'; end if;
 update public.instagram_schedule set enabled=false;
 if public.claim_instagram_slot(t) is not null then raise exception 'Disabled scheduler ran'; end if;
end $$;
rollback;

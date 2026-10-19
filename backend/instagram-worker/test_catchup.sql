begin;
do $$
declare r jsonb; c uuid:=gen_random_uuid(); l uuid;
begin
 update instagram_schedule set enabled=true,publisher='music',starts_at='2026-10-01',timezone='America/New_York',hours='{9,14,19}';
 insert into instagram_carousels(id,status) values(c,'ready');
 r:=claim_instagram_music_slot_at('2026-10-19T18:57:00Z');
 if r->>'outcome'<>'claimed' or (r->>'slot')::timestamptz<>'2026-10-19T18:00:00Z'::timestamptz
 then raise exception 'Delayed 2pm slot not claimed: %',r;end if;
 if claim_instagram_music_slot_at('2026-10-19T18:58:00Z')->>'outcome'<>'busy' then raise exception 'Concurrent claim';end if;
 update instagram_schedule_runs set phase='posted',lease=null;
 update instagram_carousels set status='posted',posted_at='2026-10-19T18:57:00Z' where id=c;
 if claim_instagram_music_slot_at('2026-10-19T19:10:00Z')->>'outcome'<>'slot_already_handled' then raise exception 'Duplicate slot';end if;
 delete from instagram_schedule_runs;
 update instagram_carousels set status='ready',posted_at=null where id=c;
 r:=claim_instagram_music_slot_at('2026-10-19T23:30:00Z');
 if (r->>'slot')::timestamptz<>'2026-10-19T23:00:00Z'::timestamptz then raise exception 'Backfilled older slot';end if;
 delete from instagram_schedule_runs;
 update instagram_carousels set status='ready' where id=c;
 if claim_instagram_music_slot_at('2026-10-20T04:01:00Z')->>'outcome'<>'missed_window' then raise exception 'Old backlog allowed';end if;
 -- Standard time after DST: 9am Eastern is 14:00 UTC.
 r:=claim_instagram_music_slot_at('2026-11-02T14:57:00Z');
 if (r->>'slot')::timestamptz<>'2026-11-02T14:00:00Z'::timestamptz then raise exception 'DST broken';end if;
 update instagram_schedule_runs set phase='publishing',lease_until='2026-11-02T14:58:00Z';
 if claim_instagram_music_slot_at('2026-11-02T15:00:00Z')->>'outcome'<>'blocked_uncertain' then raise exception 'Uncertain replay';end if;
 delete from instagram_schedule_runs;
 update instagram_carousels set status='posted',posted_at='2026-11-02T18:30:00Z' where id=c;
 if claim_instagram_music_slot_at('2026-11-02T19:10:00Z')->>'outcome'<>'cooldown' then raise exception 'Burst allowed';end if;
 update instagram_schedule set enabled=false;
 if claim_instagram_music_slot_at('2026-11-02T19:10:00Z')->>'outcome'<>'paused' then raise exception 'Pause ignored';end if;
 if has_function_privilege('service_role','claim_instagram_music_slot_at(timestamptz)','execute') then raise exception 'Clock override exposed';end if;
end $$;
rollback;

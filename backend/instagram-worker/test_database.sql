-- Run only in a disposable database after the scheduler migrations.
begin;
do $$
declare r jsonb; c uuid:=gen_random_uuid(); s timestamptz:=date_trunc('hour',now()); l uuid;
begin
 if has_function_privilege('service_role','claim_instagram_slot_internal(timestamptz)','EXECUTE')
 then raise exception 'Internal claim exposed'; end if;
 if has_function_privilege('anon','claim_instagram_music_slot()','EXECUTE')
 then raise exception 'Public claim exposed'; end if;
 if claim_instagram_music_slot()->>'outcome'<>'inactive' then raise exception 'Music enabled prematurely';end if;
 perform switch_instagram_publisher('music');
 update instagram_schedule set enabled=true;
 insert into instagram_carousels(id,status) values(c,'posting');
 insert into instagram_schedule_runs(slot,carousel_id,phase) values(s,c,'children');
 update instagram_schedule_runs set publisher='music';
 if claim_instagram_slot() is not null then raise exception 'Graph publisher not gated';end if;
 r:=claim_instagram_music_slot(); l:=(r->>'lease')::uuid;
 if l is null or r->>'publisher'<>'music' then raise exception 'Music claim failed';end if;
 if claim_instagram_music_slot()->>'outcome'<>'busy' then raise exception 'Double claim';end if;
 begin
  perform switch_instagram_publisher('graph');
  raise exception 'Switch allowed during active run';
 exception when others then
  if SQLERRM<>'Reconcile active publishing runs before switching' then raise;end if;
 end;
 perform prepare_instagram_music_slot(s,l,'42','song','artist');
 perform renew_instagram_music_lease(s,l);
 perform begin_instagram_music_publish(s,l);
 begin
  perform begin_instagram_music_publish(s,l);
  raise exception 'Double publishing intent';
 exception when others then
  if SQLERRM<>'Lost lease or publish already attempted' then raise;end if;
 end;
 perform finish_instagram_music_slot(s,l,'123','https://www.instagram.com/p/test/',false);
 if (select enabled from instagram_schedule) then raise exception 'Unverified music did not pause';end if;
 if not exists(select 1 from instagram_carousels where id=c and status='posted' and music_track_id='42' and music_verified=false)
 then raise exception 'Receipt not persisted';end if;
 perform fail_instagram_music_slot(s,l,'late failure',true);
 if (select status from instagram_carousels where id=c)<>'posted' then raise exception 'Receipt overwritten';end if;
 delete from instagram_schedule_runs;
 update instagram_schedule set enabled=true;
 update instagram_carousels set status='posting' where id=c;
 insert into instagram_schedule_runs(slot,carousel_id,phase,publisher,lease,lease_until)
 values(s,c,'publishing','music',gen_random_uuid(),now()-interval '1 minute');
 if claim_instagram_music_slot()->>'outcome'<>'blocked_uncertain' then raise exception 'Uncertain publication replayed';end if;
 if (select phase from instagram_schedule_runs)<>'uncertain' then raise exception 'Uncertainty not recorded';end if;
end $$;
rollback;

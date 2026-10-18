-- Keep the existing scheduler active until the new worker passes its checks.
alter table public.instagram_schedule add column publisher text not null default 'graph'
 check (publisher in ('graph','music'));
alter table public.instagram_schedule_runs
 add column publisher text not null default 'graph' check (publisher in ('graph','music')),
 add column music_track_id text,
 add column music_title text,
 add column music_artist text;
alter table public.instagram_carousels
 add column music_track_id text,
 add column music_title text,
 add column music_artist text,
 add column music_verified boolean;

-- Wrappers serialize the publisher check with the existing slot claim.
alter function public.claim_instagram_slot(timestamptz) rename to claim_instagram_slot_internal;
revoke all on function public.claim_instagram_slot_internal(timestamptz) from public,anon,authenticated,service_role;
create function public.claim_instagram_slot(p_now timestamptz default now()) returns jsonb
language plpgsql security definer set search_path=public as $$
declare cfg public.instagram_schedule;
begin
 select * into cfg from instagram_schedule where id=true for update;
 if cfg.publisher<>'graph' then return null; end if;
 return claim_instagram_slot_internal(p_now);
end $$;
create function public.claim_instagram_music_slot() returns jsonb
language plpgsql security definer set search_path=public as $$
declare cfg public.instagram_schedule; r jsonb;
begin
 select * into cfg from instagram_schedule where id=true for update;
 if cfg.publisher<>'music' then return null; end if;
 r:=claim_instagram_slot_internal(now());
 if r is not null then
  update instagram_schedule_runs set publisher='music' where slot=(r->>'slot')::timestamptz and lease=(r->>'lease')::uuid returning to_jsonb(instagram_schedule_runs.*) into r;
 end if;
 return r;
end $$;
create function public.switch_instagram_publisher(p_publisher text) returns void
language plpgsql security definer set search_path=public as $$
begin
 if p_publisher not in ('graph','music') or p_publisher is null then raise exception 'Invalid publisher';end if;
 perform 1 from instagram_schedule where id=true for update;
 if exists(select 1 from instagram_schedule_runs where phase in ('children','parent','ready','publishing','uncertain'))
 then raise exception 'Reconcile active publishing runs before switching';end if;
 update instagram_schedule set publisher=p_publisher where id=true;
end $$;

create function public.prepare_instagram_music_slot(p_slot timestamptz,p_lease uuid,p_track text,p_title text,p_artist text) returns void
language plpgsql security definer set search_path=public as $$
begin
 if p_track is null or p_track='' then raise exception 'Music required';end if;
 update instagram_schedule_runs set music_track_id=p_track,music_title=p_title,music_artist=p_artist,lease_until=now()+interval '2 minutes'
 where slot=p_slot and lease=p_lease and phase='children' and publisher='music' and lease_until>now()
 and (music_track_id is null or music_track_id=p_track);
 if not found then raise exception 'Lost lease or changed track';end if;
end $$;
create function public.begin_instagram_music_publish(p_slot timestamptz,p_lease uuid) returns void
language plpgsql security definer set search_path=public as $$
begin
 update instagram_schedule_runs set phase='publishing',lease_until=now()+interval '10 minutes'
 where slot=p_slot and lease=p_lease and phase='children' and publisher='music' and lease_until>now() and music_track_id is not null;
 if not found then raise exception 'Lost lease or publish already attempted';end if;
end $$;
create function public.finish_instagram_music_slot(p_slot timestamptz,p_lease uuid,p_media text,p_permalink text,p_verified boolean) returns void
language plpgsql security definer set search_path=public as $$
declare r public.instagram_schedule_runs;
begin
 perform 1 from instagram_schedule where id=true for update;
 if p_verified is null then raise exception 'Verification result required';end if;
 if p_media is null or p_media='' or p_permalink is null then raise exception 'Published receipt required';end if;
 update instagram_schedule_runs set phase='posted',media_id=p_media,lease=null,lease_until=null,
 error=case when p_verified then null else 'Published; music verification needs review' end
 where slot=p_slot and lease=p_lease and phase='publishing' and publisher='music' returning * into r;
 if r.carousel_id is null then raise exception 'Lost publishing lease';end if;
 update instagram_carousels set status='posted',instagram_media_id=p_media,permalink=p_permalink,posted_at=now(),
 music_track_id=r.music_track_id,music_title=r.music_title,music_artist=r.music_artist,music_verified=p_verified,
 last_error=case when p_verified then null else 'Published; music verification needs review' end where id=r.carousel_id;
 -- A published post must never be retried, even if the music was stripped.
 if not p_verified then update instagram_schedule set enabled=false where id=true and publisher='music';end if;
end $$;
create function public.fail_instagram_music_slot(p_slot timestamptz,p_lease uuid,p_error text,p_pause boolean default false) returns void
language plpgsql security definer set search_path=public as $$
declare r public.instagram_schedule_runs;
begin
 perform 1 from instagram_schedule where id=true for update;
 select * into r from instagram_schedule_runs where slot=p_slot and lease=p_lease and publisher='music' for update;
 if not found then return;end if;
 if r.phase='publishing' then
  update instagram_schedule_runs set phase='uncertain',error=p_error,lease=null,lease_until=null where slot=p_slot;
 else
  update instagram_schedule_runs set phase='failed',error=p_error,lease=null,lease_until=null where slot=p_slot;
  update instagram_carousels set status='failed',last_error=p_error where id=r.carousel_id;
 end if;
 if p_pause then update instagram_schedule set enabled=false where id=true and publisher='music';end if;
end $$;

revoke all on function public.claim_instagram_slot(timestamptz),public.claim_instagram_music_slot(),public.switch_instagram_publisher(text),public.prepare_instagram_music_slot(timestamptz,uuid,text,text,text),public.begin_instagram_music_publish(timestamptz,uuid),public.finish_instagram_music_slot(timestamptz,uuid,text,text,boolean),public.fail_instagram_music_slot(timestamptz,uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.claim_instagram_slot(timestamptz),public.claim_instagram_music_slot(),public.switch_instagram_publisher(text),public.prepare_instagram_music_slot(timestamptz,uuid,text,text,text),public.begin_instagram_music_publish(timestamptz,uuid),public.finish_instagram_music_slot(timestamptz,uuid,text,text,boolean),public.fail_instagram_music_slot(timestamptz,uuid,text,boolean) to service_role;

create function public.renew_instagram_music_lease(p_slot timestamptz,p_lease uuid) returns void
language plpgsql security definer set search_path=public as $$
begin
 update instagram_schedule_runs set lease_until=now()+interval '2 minutes'
 where slot=p_slot and lease=p_lease and phase='children' and publisher='music' and lease_until>now();
 if not found then raise exception 'Lost music lease';end if;
end $$;
revoke all on function public.renew_instagram_music_lease(timestamptz,uuid) from public,anon,authenticated;
grant execute on function public.renew_instagram_music_lease(timestamptz,uuid) to service_role;

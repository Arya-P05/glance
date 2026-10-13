-- Files have an identity independent of review/publishing status. No files are
-- deleted by this migration. Retained (including discarded) rows protect assets.
create table public.image_assets (
  storage_path text primary key,
  kind text not null default 'legacy',
  source_path text,
  sha256 text,
  byte_size bigint,
  cleanup_token uuid,
  state text not null default 'ready' check (state in ('ready','deleting','deleted')),
  created_at timestamptz not null default now(),
  lease_until timestamptz not null default now(),
  unreferenced_at timestamptz not null default now()
);
create table public.image_asset_references (
  owner_table text not null,
  owner_id text not null,
  storage_path text not null references public.image_assets(storage_path),
  primary key (owner_table, owner_id, storage_path)
);
create index image_asset_references_path_idx on public.image_asset_references(storage_path);
create index image_assets_cleanup_idx on public.image_assets(unreferenced_at,lease_until) where state<>'deleted';
alter table public.image_assets enable row level security;
alter table public.image_asset_references enable row level security;
revoke all on public.image_assets, public.image_asset_references from anon, authenticated;
grant all on public.image_assets, public.image_asset_references to service_role;

-- Includes paths in metadata (grain originals, revisions, caption renders,
-- reference snapshots). Historical references deliberately retain their files.
create function public.image_paths(value jsonb) returns setof text
language plpgsql immutable set search_path=public as $$
declare child jsonb; path text;
begin
  if jsonb_typeof(value) = 'string' then
    path := value #>> '{}';
    if path ~ '^(posts|drafts)/.+\.(png|jpg|jpeg|webp)$' then return next path; end if;
  elsif jsonb_typeof(value) = 'object' then
    for child in select v from jsonb_each(value) as e(k,v) loop
      return query select * from public.image_paths(child);
    end loop;
  elsif jsonb_typeof(value) = 'array' then
    for child in select * from jsonb_array_elements(value) loop
      return query select * from public.image_paths(child);
    end loop;
  end if;
end $$;

create function public.refresh_image_references(owner_name text, owner_key text, payload jsonb)
returns void language plpgsql security definer set search_path=public as $$
declare path text; asset_state text; old_paths text[];
begin
  select array_agg(storage_path) into old_paths from image_asset_references
    where owner_table=owner_name and owner_id=owner_key;
  -- Lock old and new paths in a stable order, sharing the lock with GC claims.
  for path in select distinct p from (
    select * from image_paths(payload) union select unnest(old_paths)
  ) as paths(p) where p is not null order by p loop
    insert into image_assets(storage_path) values(path) on conflict do nothing;
    select state into asset_state from image_assets where storage_path=path for update;
    if asset_state <> 'ready' and path in (select * from image_paths(payload)) then
      raise exception 'Image asset is unavailable; retry after restoring it: %', path;
    end if;
  end loop;
  delete from image_asset_references where owner_table=owner_name and owner_id=owner_key;
  insert into image_asset_references(owner_table,owner_id,storage_path)
    select owner_name,owner_key,p from (select distinct * from image_paths(payload)) paths(p);
  update image_assets a set unreferenced_at=now() where a.storage_path=any(old_paths)
    and not exists(select 1 from image_asset_references r where r.storage_path=a.storage_path);
end $$;

create function public.track_image_references() returns trigger
language plpgsql security definer set search_path=public as $$
declare payload jsonb; owner_key text;
begin
  payload := case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
  owner_key := coalesce(payload->>'id',payload->>'name',payload->>'storage_path');
  perform refresh_image_references(tg_table_name,owner_key,
    case when tg_op='DELETE' then null else payload end);
  return null;
end $$;

do $$ declare tab text; item jsonb; begin
  foreach tab in array array['backgrounds','drafts','posts','caption_options',
    'creative_references','instagram_carousel_items','instagram_cover_history','generation_feedback'] loop
    execute format('create trigger track_image_assets after insert or update or delete on public.%I for each row execute function public.track_image_references()',tab);
    for item in execute format('select to_jsonb(t) from public.%I t',tab) loop
      perform refresh_image_references(tab,coalesce(item->>'id',item->>'name',item->>'storage_path'),item);
    end loop;
  end loop;
end $$;

-- Reserve before touching storage. The lease protects uploads between storage
-- persistence and a later row commit; uncertain failures are left for delayed GC.
create function public.reserve_image_asset(path text, asset_kind text default 'legacy',
  source text default null, digest text default null, bytes bigint default null)
returns void language plpgsql security definer set search_path=public as $$
declare item image_assets;
begin
  if path !~ '^(posts|drafts)/.+\.(png|jpg|jpeg|webp)$' then raise exception 'Invalid image path'; end if;
  insert into image_assets(storage_path,kind,source_path,sha256,byte_size)
    values(path,asset_kind,source,digest,bytes) on conflict do nothing;
  select * into item from image_assets where storage_path=path for update;
  if item.state='deleting' then raise exception 'Image cleanup in progress; retry'; end if;
  if item.sha256 is not null and digest is not null and item.sha256<>digest then
    raise exception 'Immutable image path cannot be overwritten';
  end if;
  update image_assets set state='ready',lease_until=now()+interval '1 hour',
    kind=case when asset_kind='legacy' then kind else asset_kind end,
    source_path=coalesce(source,source_path),sha256=coalesce(digest,sha256),byte_size=coalesce(bytes,byte_size),
    unreferenced_at=case when item.state='deleted' then now() else unreferenced_at end
    where storage_path=path;
end $$;

create function public.image_cleanup_candidates(retention_days integer default 30)
returns setof public.image_assets language sql security definer set search_path=public as $$
  select a.* from image_assets a where a.state<>'deleted'
    and a.lease_until < now() and a.unreferenced_at < now()-make_interval(days=>greatest(retention_days,0))
    and not exists(select 1 from image_asset_references r where r.storage_path=a.storage_path)
    order by a.storage_path;
$$;

create function public.claim_image_cleanup(path text, retention_days integer default 30)
returns uuid language plpgsql security definer set search_path=public as $$
declare token uuid := gen_random_uuid();
begin
  perform 1 from image_assets where storage_path=path for update;
  if not exists(select 1 from image_cleanup_candidates(retention_days) where storage_path=path) then return null; end if;
  update image_assets set state='deleting',cleanup_token=token,lease_until=now()+interval '1 hour' where storage_path=path;
  return token;
end $$;

create function public.finish_image_cleanup(path text, token uuid) returns void
language plpgsql security definer set search_path=public as $$
begin
  update image_assets set state='deleted',cleanup_token=null where storage_path=path and state='deleting' and cleanup_token=token;
  if not found then raise exception 'Cleanup claim expired; inspect before retrying'; end if;
end $$;

-- Publishing points at immutable renders; it no longer copies image bytes.
-- Both state changes commit together and retrying a completed publish is safe.
create function public.publish_image_draft(target_id uuid, desired_status text default 'active')
returns text language plpgsql security definer set search_path=public as $$
declare item drafts; result text; wide text;
begin
  if desired_status not in ('active','inactive') then raise exception 'Invalid post status'; end if;
  select * into item from drafts where id=target_id for update;
  if not found then raise exception 'Draft not found'; end if;
  if item.status='published' then
    select storage_path into result from posts where instagram_id='generated_'||item.name;
    if result is null then raise exception 'Published post was deleted'; end if;
    return result;
  end if;
  if item.status<>'draft' then raise exception 'Draft is no longer publishable'; end if;
  wide := case when item.metadata->>'mediumRejected'='true' then null else item.metadata->>'mediumStoragePath' end;
  insert into posts(instagram_id,storage_path,medium_storage_path,medium_eligible,caption,posted_at,status)
    values('generated_'||item.name,item.storage_path,wide,coalesce(item.metadata->>'mediumRejected','false')<>'true',
      nullif(trim(concat_ws(' ',item.caption->>'smallText',item.caption->>'bigText')),''),null,desired_status)
    on conflict(instagram_id) do update set storage_path=excluded.storage_path,
      medium_storage_path=excluded.medium_storage_path,medium_eligible=excluded.medium_eligible,
      caption=excluded.caption,status=excluded.status;
  update drafts set status='published' where id=target_id;
  return item.storage_path;
end $$;

create function public.merge_image_generation(background_name text, patch jsonb) returns void
language plpgsql security definer set search_path=public as $$
begin
  update backgrounds set metadata=metadata||patch where name=background_name and status in ('pending','staged')
    and not (metadata ? 'captionGeneratedAt');
end $$;

-- All functions manipulating the registry are service-role-only.
do $$ declare signature regprocedure; begin
  for signature in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in ('image_paths','refresh_image_references','track_image_references',
      'reserve_image_asset','image_cleanup_candidates','claim_image_cleanup','finish_image_cleanup','publish_image_draft','merge_image_generation') loop
    execute format('revoke all on function %s from public,anon,authenticated',signature);
    execute format('grant execute on function %s to service_role',signature);
  end loop;
end $$;

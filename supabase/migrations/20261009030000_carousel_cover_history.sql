-- Keep cover history independently of carousel archival/deletion.
create table public.instagram_cover_history (
 storage_path text primary key,
 post_id uuid not null,
 carousel_id uuid not null,
 reserved_at timestamptz not null default now(),
 posted_at timestamptz
);
alter table public.instagram_cover_history enable row level security;
revoke all on public.instagram_cover_history from anon, authenticated;
grant all on public.instagram_cover_history to service_role;
insert into public.instagram_cover_history(storage_path,post_id,carousel_id,posted_at)
select distinct on (i.storage_path_snapshot) i.storage_path_snapshot,i.post_id,c.id,c.posted_at
from public.instagram_carousel_items i join public.instagram_carousels c on c.id=i.carousel_id
where i.position=1 and (c.posted_at is not null or c.status in ('posted','posting'))
order by i.storage_path_snapshot,c.posted_at asc nulls last
on conflict do nothing;

create function public.assert_unused_carousel_cover(p_post uuid,p_carousel uuid default null) returns void
language plpgsql security definer set search_path=public as $$
declare path text;
begin
 select storage_path into path from posts where id=p_post;
 if exists(select 1 from instagram_cover_history where (post_id=p_post or storage_path=path) and carousel_id is distinct from p_carousel) then
  raise exception 'This image has already been used or reserved as a first slide. Choose another cover.';
 end if;
 if exists(select 1 from instagram_carousel_items i join instagram_carousels c on c.id=i.carousel_id
 where i.position=1 and (i.post_id=p_post or i.storage_path_snapshot=path) and c.status in ('ready','posting') and c.id is distinct from p_carousel) then
  raise exception 'This image is already the first slide of a queued carousel. Choose another cover.';
 end if;
end $$;

create function public.reserve_instagram_cover() returns trigger
language plpgsql security definer set search_path=public as $$
declare cover public.instagram_carousel_items; owner uuid;
begin
 if new.status not in ('posting','posted') then return new;end if;
 select * into cover from instagram_carousel_items where carousel_id=new.id and position=1;
 if not found then raise exception 'Carousel has no first slide';end if;
 -- Serialize by image identity, including multiple rows pointing at the same asset.
 perform pg_advisory_xact_lock(hashtext('instagram-cover'));
 select carousel_id into owner from instagram_cover_history where post_id=cover.post_id or storage_path=cover.storage_path_snapshot limit 1;
 if owner is not null and owner<>new.id then raise exception 'This first slide has already been used. Choose another cover.';end if;
 insert into instagram_cover_history(storage_path,post_id,carousel_id,posted_at)
 values(cover.storage_path_snapshot,cover.post_id,new.id,new.posted_at)
 on conflict(storage_path) do update set posted_at=coalesce(excluded.posted_at,instagram_cover_history.posted_at);
 return new;
end $$;
create trigger reserve_instagram_cover before update of status on public.instagram_carousels
for each row execute function public.reserve_instagram_cover();
revoke all on function public.assert_unused_carousel_cover(uuid,uuid),public.reserve_instagram_cover() from public,anon,authenticated;
grant execute on function public.assert_unused_carousel_cover(uuid,uuid) to service_role;

create or replace function public.accept_carousel_suggestion(suggestion_id uuid) returns uuid
language plpgsql security definer set search_path=public as $$
declare s public.carousel_suggestions; result uuid;
begin
 -- Serialize acceptance so two different suggestions cannot queue overlapping posts.
 perform pg_advisory_xact_lock(hashtext('accept_carousel_suggestion'));
 select * into s from public.carousel_suggestions where id=suggestion_id for update;
 if not found then raise exception 'Suggestion not found';end if;
 if s.status='accepted' then return s.carousel_id;end if;
 if s.status<>'pending' then raise exception 'Suggestion is no longer pending';end if;
 perform id from public.posts where id=any(s.post_ids) for share;
 if (select count(distinct id) from public.posts where id=any(s.post_ids) and status='active')<>5 then raise exception 'Some suggested images are no longer active';end if;
 if exists(select 1 from public.instagram_carousel_items i join public.instagram_carousels c on c.id=i.carousel_id where i.post_id=any(s.post_ids) and c.status in ('ready','posting')) then raise exception 'Some images are already queued; dismiss this suggestion and request another';end if;
 perform public.assert_unused_carousel_cover(s.post_ids[1]);
 insert into public.instagram_carousels(title,caption,status) values(s.title,E'little reminders for your lock screen\n.\n.\n.\nsomething to glance at when life gets loud','ready') returning id into result;
 insert into public.instagram_carousel_items(carousel_id,post_id,position,storage_path_snapshot,caption_snapshot)
 select result,p.id,ids.position,p.storage_path,p.caption from unnest(s.post_ids) with ordinality ids(id,position) join public.posts p on p.id=ids.id;
 update public.carousel_suggestions set status='accepted',carousel_id=result where id=suggestion_id;
 return result;
end $$;

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
   select id into c from public.instagram_carousels where status='ready' order by created_at desc,id limit 1 for update skip locked;
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


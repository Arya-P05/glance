create table public.carousel_suggestions (
 id uuid primary key default gen_random_uuid(),title text not null,reason text not null,
 post_ids uuid[] not null check(cardinality(post_ids)=5),
 status text not null default 'pending' check(status in ('pending','accepted','dismissed')),
 carousel_id uuid references public.instagram_carousels(id),created_at timestamptz not null default now()
);
alter table public.carousel_suggestions enable row level security;
revoke all on public.carousel_suggestions from anon,authenticated;
grant all on public.carousel_suggestions to service_role;
create function public.accept_carousel_suggestion(suggestion_id uuid) returns uuid
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
 insert into public.instagram_carousels(title,caption,status) values(s.title,E'little reminders for your lock screen\n.\n.\n.\nsomething to glance at when life gets loud','ready') returning id into result;
 insert into public.instagram_carousel_items(carousel_id,post_id,position,storage_path_snapshot,caption_snapshot)
 select result,p.id,ids.position,p.storage_path,p.caption from unnest(s.post_ids) with ordinality ids(id,position) join public.posts p on p.id=ids.id;
 update public.carousel_suggestions set status='accepted',carousel_id=result where id=suggestion_id;
 return result;
end $$;
revoke all on function public.accept_carousel_suggestion(uuid) from public,anon,authenticated;
grant execute on function public.accept_carousel_suggestion(uuid) to service_role;

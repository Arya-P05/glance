-- Run with `supabase db query --linked -f supabase/tests/carousel_cover_history.sql`.
-- All fixtures and history changes are rolled back; no Instagram requests occur.
begin;
do $$
declare ids uuid[]; first_id uuid; second_id uuid;
begin
 select array_agg(id) into ids from (select p.id from posts p where status='active'
 and not exists(select 1 from instagram_cover_history h where h.post_id=p.id or h.storage_path=p.storage_path)
 and not exists(select 1 from instagram_carousel_items i join instagram_carousels c on c.id=i.carousel_id where i.post_id=p.id and c.status in ('ready','posting')) limit 5) p;
 if cardinality(ids)<>5 then raise exception 'Need five unused images for this test';end if;
 insert into instagram_carousels(title) values('cover test') returning id into first_id;
 insert into instagram_carousel_items(carousel_id,post_id,position,storage_path_snapshot)
 select first_id,p.id,a.n,p.storage_path from unnest(ids) with ordinality a(id,n) join posts p on p.id=a.id;
 update instagram_carousels set status='posting' where id=first_id;
 -- Retrying the same carousel is permitted.
 update instagram_carousels set status='failed' where id=first_id;
 update instagram_carousels set status='posting' where id=first_id;
 update instagram_carousels set status='posted',posted_at=now() where id=first_id;
 update instagram_carousels set status='archived' where id=first_id;
 insert into instagram_carousels(title) values('duplicate cover test') returning id into second_id;
 insert into instagram_carousel_items(carousel_id,post_id,position,storage_path_snapshot)
 select second_id,p.id,a.n,p.storage_path from unnest(ids) with ordinality a(id,n) join posts p on p.id=a.id;
 begin
  update instagram_carousels set status='posting' where id=second_id;
  raise exception 'Duplicate cover was allowed';
 exception when others then
  if SQLERRM<>'This first slide has already been used. Choose another cover.' then raise;end if;
 end;
 delete from instagram_carousel_items where carousel_id=second_id;
 insert into instagram_carousel_items(carousel_id,post_id,position,storage_path_snapshot)
 select second_id,p.id,a.n,p.storage_path from unnest(array[ids[2],ids[1],ids[3],ids[4],ids[5]]) with ordinality a(id,n) join posts p on p.id=a.id;
 update instagram_carousels set status='posting' where id=second_id;
 if not exists(select 1 from instagram_cover_history where carousel_id=first_id and posted_at is not null) then raise exception 'History lost';end if;
end $$;
rollback;

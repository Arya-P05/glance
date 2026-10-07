begin;
do $$
declare source uuid; fixture text := 'history_test_' || gen_random_uuid();
begin
  insert into public.backgrounds(name,storage_path,status,scene,metadata)
  values(fixture,'tests/history.png','pending','{"subject":"history fixture"}','{}') returning id into source;
  if not exists(select 1 from public.generation_history where name=fixture) then raise exception 'Generation was not recorded'; end if;
  update public.backgrounds set status='discarded' where id=source;
  delete from public.backgrounds where id=source;
  if (select count(*) from public.generation_history where name=fixture)<>1 then raise exception 'History lost or duplicated after rejection/deletion'; end if;
end $$;
rollback;

begin;
-- Isolate the candidate pool inside the rollback-only test transaction.
update public.posts set status='inactive';
insert into public.posts (instagram_id, storage_path, status, medium_eligible)
values ('wide-rejection-fixture','test/square.png','active',false);
do $$
begin
  if not exists(select 1 from public.get_widget_post('square') where storage_path='test/square.png') then
    raise exception 'Square-only post was excluded from square selection';
  end if;
  if exists(select 1 from public.get_widget_post('medium')) then
    raise exception 'Rejected wide image leaked into medium selection';
  end if;
end $$;
update public.posts set medium_eligible=true where instagram_id='wide-rejection-fixture';
do $$
begin
  if not exists(select 1 from public.get_widget_post('medium') where storage_path='test/square.png') then
    raise exception 'Eligible image missing from medium selection';
  end if;
end $$;
rollback;

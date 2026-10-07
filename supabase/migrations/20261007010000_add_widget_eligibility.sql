alter table public.posts add column if not exists medium_eligible boolean not null default true;

-- Keep the legacy RPC available; new clients request the intended widget format.
create or replace function public.get_widget_post(widget_format text default 'square')
returns table (id uuid, storage_path text, medium_storage_path text, caption text, medium_eligible boolean)
language sql stable security definer set search_path = public as $$
  select p.id, p.storage_path, p.medium_storage_path, p.caption, p.medium_eligible
  from public.posts p
  where coalesce(p.status, 'active') = 'active'
    and widget_format in ('square', 'medium')
    and (widget_format <> 'medium' or p.medium_eligible)
  order by (-ln(greatest(random(), 1e-9))) / greatest(
    1.0 / sqrt(greatest(extract(epoch from (now()-p.created_at))/86400.0,0)+1.0), 1e-9)
  limit 1;
$$;
grant execute on function public.get_widget_post(text) to anon, authenticated;

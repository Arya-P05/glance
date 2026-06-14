-- Store a separately rendered wide image for medium widgets.
alter table public.posts
  add column if not exists medium_storage_path text;

create index if not exists posts_medium_storage_path_idx
  on public.posts (medium_storage_path)
  where medium_storage_path is not null;

-- Return the medium asset alongside the square asset. Older clients that only
-- decode storage_path/caption can ignore the extra column.
drop function if exists public.get_random_post();

create function public.get_random_post()
returns table (id uuid, storage_path text, medium_storage_path text, caption text)
language sql
stable
security definer
as $$
  with weighted as (
    select
      p.id,
      p.storage_path,
      p.medium_storage_path,
      p.caption,
      (
        1.0 / sqrt(
          greatest(
            extract(epoch from (now() - p.created_at)) / 86400.0,
            0
          ) + 1.0
        )
      ) as w
    from public.posts p
    where coalesce(p.status, 'active') = 'active'
  )
  select
    weighted.id,
    weighted.storage_path,
    weighted.medium_storage_path,
    weighted.caption
  from weighted
  order by (-ln(random())) / greatest(weighted.w, 1e-9)
  limit 1;
$$;

grant execute on function public.get_random_post() to anon;

-- Add status column so drafts can be staged before going live.
-- Existing posts default to 'active' so nothing breaks.
alter table public.posts
  add column if not exists status text not null default 'active';

create index if not exists posts_status_idx on public.posts (status);

-- Update weighted random picker to only serve active posts.
create or replace function public.get_random_post()
returns table (id uuid, storage_path text, caption text)
language sql
stable
security definer
as $$
  with weighted as (
    select
      p.id,
      p.storage_path,
      p.caption,
      (
        -- Recency boost based on age in days:
        -- 0 days old  => weight 1.0
        -- 1 day old   => ~0.707
        -- 9 days old  => ~0.316
        -- 99 days old => ~0.100
        1.0 / sqrt(
          greatest(
            extract(epoch from (now() - p.created_at)) / 86400.0,
            0
          ) + 1.0
        )
      ) as w
    from public.posts p
    where p.status = 'active'
  )
  select
    weighted.id,
    weighted.storage_path,
    weighted.caption
  from weighted
  order by (-ln(random())) / greatest(weighted.w, 1e-9)
  limit 1;
$$;

grant execute on function public.get_random_post() to anon;

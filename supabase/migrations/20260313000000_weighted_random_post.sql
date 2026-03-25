-- Weighted random picker:
-- - Newer posts are more likely to appear.
-- - Older posts still appear sometimes.
-- - Keeps per-request randomness (not a single global post).
--
-- Uses Efraimidis-Spirakis weighted sampling trick:
-- pick row with minimum -ln(random()) / weight
-- where larger weight => higher selection chance.

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


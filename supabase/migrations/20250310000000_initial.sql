-- Posts table: one row per Instagram post, image stored in Supabase Storage
create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  instagram_id text not null unique,
  storage_path text not null,
  caption text,
  posted_at timestamptz,
  created_at timestamptz not null default now()
);

-- Index for random selection and lookups
create index if not exists posts_instagram_id_idx on public.posts (instagram_id);

-- RPC: return one random post for the widget (id, storage_path, caption)
create or replace function public.get_random_post()
returns table (id uuid, storage_path text, caption text)
language sql
stable
security definer
as $$
  select id, storage_path, caption
  from public.posts
  order by random()
  limit 1;
$$;

-- Allow anon to call get_random_post (widget uses anon key)
grant execute on function public.get_random_post() to anon;

-- Optional: allow anon read on posts if you query from client (widget uses RPC so not strictly required)
-- alter table public.posts enable row level security;
-- create policy "Allow anon read" on public.posts for select to anon using (true);

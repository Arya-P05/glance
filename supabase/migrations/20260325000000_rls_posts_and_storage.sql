-- Enable RLS so:
-- - Reads are allowed broadly (widget works, everyone can read posts rows if desired)
-- - Writes (insert/update/delete) are restricted to service role only
-- (storage.objects is handled in a separate migration)

-- ----------------------------
-- public.posts RLS
-- ----------------------------
alter table public.posts enable row level security;

-- Allow reads by everyone (matches current “no write restriction” behavior from before RLS).
drop policy if exists "Public read posts" on public.posts;
create policy "Public read posts"
on public.posts
for select
using (true);

-- Allow SELECT for public clients (widget uses RPC, but this matches your “reads by everyone” request).
grant select on table public.posts to anon, authenticated;

-- Restrict writes to service role only.
drop policy if exists "Service role insert posts" on public.posts;
create policy "Service role insert posts"
on public.posts
for insert
to service_role
with check (true);

drop policy if exists "Service role update posts" on public.posts;
create policy "Service role update posts"
on public.posts
for update
to service_role
using (true)
with check (true);

drop policy if exists "Service role delete posts" on public.posts;
create policy "Service role delete posts"
on public.posts
for delete
to service_role
using (true);

-- Ensure anon can execute the RPC.
grant execute on function public.get_random_post() to anon;

-- Storage RLS for storage.objects is split into a separate migration because
-- Supabase's SQL editor role may not own the internal storage.objects table.
-- That can cause "must be owner of table objects" errors when running this
-- migration by copy/paste.


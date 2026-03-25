-- storage.objects RLS
-- Split from the posts RLS migration because Supabase's SQL editor role may
-- not own the internal storage.objects table, which can cause:
-- "ERROR: must be owner of table objects"

-- Enable RLS for Storage objects
alter table storage.objects enable row level security;

-- Public read of stored images under posts/
drop policy if exists "Public read storage objects (instagram-posts/posts)" on storage.objects;
create policy "Public read storage objects (instagram-posts/posts)"
on storage.objects
for select
using (
  bucket_id = 'instagram-posts'
  and name like 'posts/%'
);

-- Allow SELECT for public clients.
grant select on table storage.objects to anon, authenticated;

-- Service role can upload/modify/delete only under posts/
drop policy if exists "Service role write storage objects (instagram-posts/posts)" on storage.objects;
create policy "Service role write storage objects (instagram-posts/posts)"
on storage.objects
for all
to service_role
using (
  bucket_id = 'instagram-posts'
  and name like 'posts/%'
)
with check (
  bucket_id = 'instagram-posts'
  and name like 'posts/%'
);


# Supabase setup

1. **Create a project** at [supabase.com](https://supabase.com).

2. **Create the Storage bucket** (Dashboard → Storage → New bucket):
   - Name: `instagram-posts`
   - Public bucket: **Yes** (so the widget can load images via public URLs without auth).

3. **Run the migrations** (Dashboard → SQL Editor → New query):
   - Paste and run `migrations/20250310000000_initial.sql`.
   - Then run `migrations/20260313000000_weighted_random_post.sql` (keeps randomness but boosts newer posts).
   - Then run `migrations/20260325000000_rls_posts_and_storage.sql` (enables RLS on `public.posts`: public reads, service-role-only writes).
   - Then run `migrations/20260325000001_rls_storage_objects.sql` (enables RLS on `storage.objects`: public reads for `posts/*`, service-role-only writes). If you hit an ownership error in the SQL editor, run it via Supabase CLI/migrations.

4. **Keys:**
   - **Project URL** and **anon key**: used by the iOS app/widget (read-only).
   - **Service role key**: used only by the sync job (write to Storage and `posts`). Keep it server-side only.

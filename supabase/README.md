# Supabase setup

1. **Create a project** at [supabase.com](https://supabase.com).

2. **Create the Storage bucket** (Dashboard → Storage → New bucket):
   - Name: `instagram-posts`
   - Public bucket: **Yes** (so the widget can load images via public URLs without auth).

3. **Run the migration** (Dashboard → SQL Editor → New query):
   - Paste and run the contents of `migrations/20250310000000_initial.sql`.

4. **Keys:**
   - **Project URL** and **anon key**: used by the iOS app/widget (read-only).
   - **Service role key**: used only by the sync job (write to Storage and `posts`). Keep it server-side only.

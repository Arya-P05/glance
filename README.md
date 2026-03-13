# Instagram → Supabase → iOS Widget

Single Instagram account (config in scraper). Users install the app, add the widget, and see a new random image every day.

## Repo layout

- **supabase/** – SQL migration (`posts` table, `get_random_post()` RPC) and setup notes. Create the `instagram-posts` bucket (public) in the dashboard.
- **backend/** – Node.js scraper + sync job. Set `INSTAGRAM_USERNAME`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` in `.env`. Run `npm run bulk` once, then `npm run sync` weekly.
- **ios/** – SwiftUI app + Widget Extension. Set Supabase URL and anon key in `Shared/SupabaseConfig.swift`.

## Quick start

1. **Supabase:** New project → run `supabase/migrations/20250310000000_initial.sql` → create public bucket `instagram-posts`.
2. **Backend:** `cd backend && npm install && npx playwright install chromium` → copy `.env.example` to `.env` → `npm run bulk`.
3. **iOS:** Open `ios/WidgetApp.xcodeproj` in Xcode → set URL and anon key in `Shared/SupabaseConfig.swift` → run on device/simulator → add the **Random Post** widget.

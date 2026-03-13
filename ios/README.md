# iOS app and widget

Minimal app + WidgetKit extension that shows a random image from your Supabase `posts` table every day.

## Open the project

1. Open `WidgetApp.xcodeproj` in Xcode (from the `ios` folder).
2. If the project fails to load, create a new project manually:
   - File → New → Project → App (iOS) → name it **WidgetApp**, SwiftUI, no tests.
   - File → New → Target → Widget Extension → name it **RandomPostWidgetExtension**.
   - Add the **Supabase** package: File → Add Package Dependencies → `https://github.com/supabase/supabase-swift.git`, version 2.0.0.
   - Add the **RandomPostWidgetExtension** target to the **Supabase** package dependency (target → General → Frameworks → + → Supabase).
   - Replace the default Swift files with the ones in this repo:
     - `WidgetApp/`: `WidgetAppApp.swift`, `ContentView.swift`
     - `RandomPostWidget/`: `RandomPostWidget.swift`, `Info.plist`
     - Create a **Shared** group and add `Shared/SupabaseConfig.swift`; add this file to **both** the app and the widget extension targets.

## Configure Supabase

Edit **Shared/SupabaseConfig.swift** and set:

- `url` – your Supabase project URL (e.g. `https://xxxx.supabase.co`)
- `anonKey` – your project’s anon (public) key

The widget calls the `get_random_post()` RPC and loads the image from the public Storage URL. Ensure the `instagram-posts` bucket is public and the migration has been run (see `../supabase/README.md`).

## Run

- Select the **WidgetApp** scheme and a simulator or device; run.
- Add the **Random Post** widget from the home screen. It refreshes once per day with a new random image.

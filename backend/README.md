# Instagram → Supabase sync

Single Instagram username (set in env). Run once as bulk to import all posts, then run weekly (e.g. cron) to add new posts only.

## Setup

1. Copy `.env.example` to `.env` and set:
   - `INSTAGRAM_USERNAME` – public profile to scrape
   - `SUPABASE_URL` – project URL
   - `SUPABASE_SERVICE_ROLE_KEY` – service role key (writes to Storage + DB)
   - `INSTAGRAM_SESSIONID` (optional but recommended for bulk) – your Instagram `sessionid` cookie value so the scraper can see more than the logged-out ~12-post limit.
   - `INSTAGRAM_COOKIES_PATH` (recommended if sessionid alone still caps at ~12) – path to a JSON cookie export containing your full Instagram cookies.

2. Create the `instagram-posts` bucket in Supabase (public). Run the SQL migration if you haven’t.

3. Install deps and Playwright browser:

   ```bash
   npm install
   npx playwright install chromium
   ```

## Usage

- **Bulk import (all posts):**  
  `npm run bulk`
- **Incremental (new posts only, up to 20 by default or `MAX_POSTS`):**  
  `npm run sync`
- **Generate image prompts:**  
  `npm run gen:prompts -- --count 25`
- **Generate background images:**  
  `npm run gen:images -- --count 10`

Schedule `npm run sync` weekly (e.g. cron or GitHub Actions).

## Motivational generator

The generator builds a high-variety creative brief, asks a prompt model to write the image prompt, and generates text-free nostalgic backgrounds with `gpt-image-2`. In the dashboard, generated backgrounds are reviewed in **Backgrounds**, where the caption model creates five message options from the actual image. After selecting/editing one and approving the layout, the finished poster moves into **Drafts** for publishing.

Local output is written under ignored `backend/content/` folders for inspection, while the dashboard uses Supabase tables/storage as the source of truth.

Set `OPENAI_API_KEY` in `.env`, then run:

```bash
npm run gen -- --count 10
```

Useful options:

```bash
npm run gen -- --count 5 --dry-run
npm run gen:prompts -- --count 10
npm run gen:images -- --count 10
npm run gen -- --count 10 --from-prompts
npm run gen -- --count 10 --prompt-model gpt-4.1-mini
```

During real generation, the CLI shows progress for prompt writing, image creation, local saves, and Supabase writes. Use `gen:prompts` to inspect bespoke image prompts before spending image calls. Use `gen:images` while tuning raw photo style; it saves clean textless candidates to the Backgrounds queue.

To test typography without generating a new image:

```bash
npm run render-caption -- content/backgrounds/example.png /tmp/poster-text-test.png "take it slow," "no rush."
```

## Getting `INSTAGRAM_SESSIONID`

Instagram often limits logged-out browsing to only a small number of posts. To bulk import the full backlog, provide a logged-in session cookie:

1. Log into Instagram in Chrome/Safari.
2. Open DevTools → **Application** (Chrome) → **Cookies** → `https://www.instagram.com`.
3. Copy the value of the cookie named **`sessionid`**.
4. Put it in `.env` as `INSTAGRAM_SESSIONID=...`.

Security: treat `sessionid` like a password. Don’t commit it.

## Getting `INSTAGRAM_COOKIES_PATH`

If `sessionid` alone still only returns ~12 posts, export your full cookies and load them:

1. Use a cookie export extension (e.g. “EditThisCookie”) to **export cookies as JSON** for `instagram.com`.
2. Save the file somewhere local, e.g. `/Users/aryapatel/code/widget/backend/instagram-cookies.json`
3. Set in `.env`:
   - `INSTAGRAM_COOKIES_PATH=/Users/aryapatel/code/widget/backend/instagram-cookies.json`

Security: treat this file like a password. Don’t commit it.

## Admin UI (browse & delete Storage + DB rows)

Small **local-only** web UI that lists objects in the `instagram-posts/posts/` prefix and lets you delete selected images. Each delete removes the file from Storage **and** the row in `public.posts` where `storage_path` matches (not a DB foreign-key cascade, but the same outcome).

1. Ensure `.env` has `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.
2. Optional: set `ADMIN_TOKEN` in `.env`; the page will prompt once and send it as `X-Admin-Token`.
3. Run:

   ```bash
   npm run admin
   ```

4. Open `http://127.0.0.1:3847/` (or the port you set with `ADMIN_PORT`).

**Do not** expose this server to the internet; it uses the service role key.

### Import tab (Instagram links → Storage + DB)

1. **Preview** pastes post/reel URLs (one per line). The server resolves media with **Instaloader** (Python) instead of browser scraping.
2. Choose thumbnails (all selected by default), then **Add selected to Glance** — uploads `posts/<shortcode>.jpg` and upserts `public.posts`.

Install Instaloader once:

```bash
pip3 install instaloader
```

Reference: [Instaloader docs](https://instaloader.github.io)

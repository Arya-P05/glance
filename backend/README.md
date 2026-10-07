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

The generator builds a high-variety creative brief, asks a prompt model to write the image prompt, and generates text-free nostalgic backgrounds with `gpt-image-2`. In the dashboard, generated backgrounds are reviewed in **Backgrounds**. Approved images move into **Approved**, where the caption model creates five message options from the actual image; after selecting/editing one and saving the layout, the finished poster moves into **Drafts** for publishing.

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

## Creative references

Apply `supabase/migrations/20261006000000_add_creative_references.sql` to the same Supabase project used by the admin server. The table is accessible through the service role only. Restart the admin server, then open `/references` in the dashboard.

Select posts in Library and choose **Add to references**, or add a saved background from its review panel. References begin pending. Review the image, save your feedback, and accept or reject it. A near miss is an accepted example of what to avoid. Benchmark membership is explicit and requires acceptance; returning an item to review or rejecting it removes that membership.

Assistant analysis remains separate from user feedback. The initial curated collection can be inspected with `node seed-creative-references.js` and inserted with `node seed-creative-references.js --apply` from `backend/`. Its source IDs belong to the original Glance library; other databases must curate their own seed. Re-running the seed preserves existing reviews. Run `node --test creative-references.test.js` for validation tests.

New image prompts and captions use the reviewed reference snapshot. Pending and benchmark items are excluded. Current user roles and feedback override original assistant annotations. Evaluation and scheduling are not automatic. References retain the source storage path, so deleting the underlying media will also make its reference image unavailable.

### Generate a reference-guided review batch

From `backend/`, run `node generate.js --count 3 --review-batch`. This requires positive reviewed references, generates up to five new backgrounds with candidate captions, saves local `.review.png` previews, and leaves database rows **pending**. It never creates a carousel or posts. Open Backgrounds to review; `?batch=<reviewBatchId>` limits the view to that batch. Approving the background retains its pre-generated caption options for the next review step.

Each output records the exact `generationTaste` snapshot and hash; caption generation records `captionTaste`. Up to three rotating accepted visual references inform the prompt writer via image inputs. Existing saved prompts are rendered unchanged when using `--from-prompts`; they are not retroactively rewritten from new reviews. Missing reference storage/schema produces an error rather than silently ignoring feedback. Caption validation failures stop that candidate instead of substituting unreviewed fallback phrases.

Review batches exclude exact recent scene concepts and avoid repeating setting families within the batch. These are heuristic checks, not semantic novelty guarantees or an automated quality score. Tests: `node --test creative-references.test.js generation-taste.test.js`.

### Separate review feedback

Apply `supabase/migrations/20261007000000_add_generation_feedback.sql` before running the updated server. It adds a private `generation_feedback` event history and transactional review functions. No historical approvals or unselected captions are relabeled automatically.

- **Backgrounds:** Approve or Reject background records an image-only decision, with an optional reason. Skip and bulk cleanup do not create taste feedback.
- **Approved:** Reject this caption records only the exact original option. The background stays staged; other options remain unreviewed. Regenerate alone is not a rejection. Choosing or editing text and saving records that original and final wording. A later explicit acceptance supersedes an earlier rejection of the same option.
- **Placement:** Saving records both square and medium layouts, including coordinates, font scales, colors and crop. The editor distinguishes unchanged from adjusted placement. An optional reason explains the adjustment.

Final draft creation, caption selection, background completion and review events commit in one database transaction. Caption regeneration merges its fields without erasing feedback received while it ran. Retrying rejection does not add duplicate events. Stale caption approvals/rejections are rejected rather than applied to another option.

New generations include the latest explicit decisions for each target from the most recent 300 events, scoped to the relevant stage (up to 40 per prompt). Direct benchmark sources are excluded. Image feedback guides scene prompts, wording feedback guides captions, and placement feedback guides image-aware square/medium layout suggestions. Suggestions remain reviewable: these are prompt examples, not model-weight training, guaranteed visual correctness, or automatic publishing. Layout suggestions use defaults until placement feedback exists.

Run `node --test *test.js` in `backend/`. For database integration checks, execute `backend/tests/generation-feedback.integration.sql` after the migration; fixtures and decisions are wrapped in a transaction that rolls back. It exercises rejection idempotency, stale-option protection, preservation across regeneration, and atomic final approval.

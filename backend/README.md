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

Wide widget review: in the caption editor, choose **Reject for wide widgets**, optionally explain the crop problem, then save to drafts. This preserves the square image and stores a medium-only placement rejection. Wide renders are skipped, and publishing retains `medium_eligible=false`. Apply `20261007010000_add_widget_eligibility.sql` before using this flow. Updated iOS clients use `get_widget_post` with the widget format and keep excluded square images out of shared medium snapshots. Existing installed clients need the updated app build; the legacy RPC remains for compatibility.

Generation memory: `generation_history` durably records generated background concepts, including later rejected/deleted images. Migration `20261007020000_add_generation_history.sql` backfills existing backgrounds and drafts once per name. New concept and image-prompt generation receives the latest 20 scenes as avoidance context; successful items enter the rolling context during a batch. Explicitly re-rendering saved prompts preserves the requested prompt. This reduces semantic repetition without guaranteeing every concept is unique.

Run-specific inspiration: select 1–5 Library posts and choose **Use as inspiration**. Generate previews the selection and clears it after a successful job launch. The server validates post IDs; both scene direction and prompt writing receive the images. A model check rejects proposed concepts that closely repeat their subject/action, setting or composition before image rendering. Lighting, texture and mood can transfer. Selection is saved in the output generation snapshot but does not modify permanent References. Originality checks reduce copying but are not a guarantee of visual uniqueness.

### Cloud Instagram schedule

`instagram-scheduler` runs on Supabase Edge Functions, invoked every minute by the `glance-instagram-publisher` Cron job. The `instagram_schedule` row controls enablement, start time, `America/New_York`, and the 9/14/19 hours. Slots begin preparing at those times; Instagram processing can delay publication by a few minutes. Missed slots older than 15 minutes are skipped, not backfilled. Only ready carousels are claimed, newest first (the queue's displayed order).

Progress is stored in `instagram_schedule_runs`. Database leases prevent concurrent claims; publishing intent is committed before calling Instagram. An interrupted/uncertain publish blocks subsequent automatic publishing until an operator reconciles the saved parent/media ID against Instagram. Do not reset uncertain runs blindly. Confirmed posts update the carousel and slot atomically and leave the queue. Empty slots are recorded without generating content. Pre-publication failures mark the carousel failed for review.

The deployed function checks a private scheduler secret before accessing any data. Instagram credentials live in Edge Function secrets, and the invocation secret/project URL live in Vault; neither belongs in Git. Required Edge secrets: `INSTAGRAM_ACCESS_TOKEN`, `INSTAGRAM_BUSINESS_ACCOUNT_ID`, `INSTAGRAM_GRAPH_API_BASE`, `META_GRAPH_API_VERSION`, `INSTAGRAM_SCHEDULER_SECRET`. Vault names: `glance_instagram_scheduler_secret`, `glance_instagram_project_url`. Renew the Instagram token if it expires; connection errors are recorded rather than bypassed.

Deploy the schema migration, provision secrets, deploy `supabase functions deploy instagram-scheduler --use-api --no-verify-jwt` (custom secret authentication is enforced), and apply the Cron migration. Use the authenticated `{"action":"health"}` POST to verify without posting. Enable only after checks using `update public.instagram_schedule set enabled=true, starts_at=now() where id=true`. Pause with `update public.instagram_schedule set enabled=false where id=true`. Pausing stops new work; it cannot cancel an already-in-flight Instagram request.

Local manual/automated POST-to-publish is blocked while cloud scheduling is enabled, preventing the previous desktop automation from competing. This also means manual Post now requires pausing the cloud schedule. Your Mac and Codex are not involved in cloud execution. Inspect `cron.job_run_details`, `net._http_response`, Edge Function logs, and `instagram_schedule_runs` for operational status; no separate notification service is configured.

Validation: `deno check --node-modules-dir=none supabase/functions/instagram-scheduler/index.ts`; `backend/tests/cloud-schedule.integration.sql` runs within a rollback transaction and checks leases, uncertain-outcome protection, completed-slot idempotency, pause, and daylight saving. Never test publishing against a real account just to check deployment.

### Suggested carousels

On the carousel queue, **Suggest carousels** proposes up to three five-slide groupings from active Library images. The model sees the images and captions, looking for a coherent mood with varied subjects and scenes. Images already ready/posting or in the last 20 published carousels are excluded.

Review all pending suggestions before requesting another batch. **Accept & queue** creates a ready carousel with the default caption, which enters the automatic posting schedule. Acceptance is transactional and idempotent. **Dismiss** rejects only the grouping, leaving the Library images untouched. Previous groupings are retained to avoid proposing them again (the most recent 300 are checked). Suggestions persist across refreshes.

Requires migration `20261009020000_carousel_suggestions.sql` and the existing `OPENAI_API_KEY`. The suggestion model uses `OPENAI_PROMPT_MODEL`, defaulting to `gpt-4.1-mini`.

### First-slide history

`instagram_cover_history` permanently records first-slide post IDs and storage paths independently of carousel archival/deletion. Existing published carousels, including archived rows with `posted_at`, are backfilled. Covers are reserved when publishing starts and marked with the publication time when it succeeds. Failed or uncertain attempts retain reservations; retrying the same carousel is allowed.

A previously used/reserved cover cannot lead another carousel. Ready-queue edits and suggestion acceptance also reject covers already queued. Suggestions may use historical covers in positions 2–5, subject to the existing recent-post cooldown. Local and cloud publication are protected by a database trigger. Cloud cover conflicts become failed queue items with an explanation instead of publishing duplicates.

History covers publications recorded by this app; it cannot reconstruct manual Instagram posts or identify re-uploads under a new post ID and storage path. Apply `20261009030000_carousel_cover_history.sql`; verify with rollback-only `supabase/tests/carousel_cover_history.sql`.

Queue order uses `queued_at`, set when a carousel becomes ready. New carousels and older drafts marked ready append to the back; edits retain their place. Removing and re-adding a carousel gives it a new place at the back. The dashboard schedule and cloud worker share this order. Migration `20261009040000_fifo_carousel_queue.sql` preserves the existing queue sequence during rollout.

### Learning carousel taste

Each suggestion run retrieves up to three accepted and three dismissed five-slide carousels and supplies their actual images, captions, and original order as visual taste examples. It uses the newest complete examples from up to 20 suggestions per decision. Pending suggestions and model-written titles/rationales are not preference evidence. Missing-image examples are skipped; database failures stop the run instead of silently losing feedback.

The recommender infers tentative preferences in mood, character mix, caption tone, visual variety, and sequencing. Dismissals apply to the combination, never automatically blacklist individual images. Sparse or conflicting decisions should preserve exploration. Existing approvals/rejections are used automatically on the next run; pending suggestions are not regenerated. This is contextual learning from saved decisions, not model fine-tuning or an engagement predictor. The candidate pool remains a random sample of up to 24 eligible Library images; cover, cooldown, and duplicate-grouping rules still apply.

### Reference-led generation

A Library inspiration run first reads the selected images into a saved semantic brief (shared subjects/relationships, place scale, mood, camera feel, and what to vary). Its planner and prompt writer use this direction instead of the generic gag/animal archetypes or global positive-reference themes. The scene and final image prompt must both pass relevance and originality checks: a different genre is not a successful original variation. The final image renderer still receives the written prompt, not reference pixels; these checks guide prompts and do not guarantee visual fidelity of the rendered output.

Within-batch repeat checks block concepts and known visual setups, not broad setting families. Concept/prompt rejections have a separate bounded budget of eight candidates per requested output; they no longer consume the rendering-attempt budget. Summaries report rejected concepts/prompts separately from failures. No images are automatically regenerated by this change.

### Optional grain during background review

In Backgrounds → Review, toggle **Grain: Off / On** to compare the original with deterministic monochrome grain. The same image always receives the same seeded pattern; repeated toggles do not accumulate noise. Previewing writes a separate, content-addressed PNG but does not approve or replace the background. Selections are kept while navigating within the review screen and reset on a full page reload.

Approving with grain enabled switches the background's storage path to that exact deterministic variant, so subsequent captions, widgets and publication use it. Approval records the choice/version and original storage path in metadata, preserving the original asset. Grain is applied to the background before text rendering. This is a fixed grain amount, with no image-model call.

### Image persistence and cleanup

Apply `20261013000000_image_asset_lifecycle.sql` before running this version of the backend. It backfills asset references from existing records and adds service-role-only lifecycle functions. It does not move or delete existing files. Deploy the backend and migration together; older delete/clear scripts do not understand shared assets.

Generated originals are saved locally and uploaded before review-batch captions or placement are requested. A caption/placement failure leaves a pending background available for normal review. A cloud-persistence failure after local saving stops the batch instead of paying to generate a replacement. Saved-prompt renders receive distinct names; the original prompt remains recorded in metadata.

From `backend`, inspect and recover local images after a failed upload without another model call:

```sh
npm run gen:recover
npm run gen:recover -- --apply
```

Recovery reads the default `content/backgrounds/` and `content/meta/` directories. It inserts missing backgrounds without resetting existing approvals, rejections, or edits. Custom generation output directories are not automatically scanned. Local files remain inspection/recovery copies, not a synchronized mirror of later dashboard edits.

Square and wide renders now have content-addressed immutable filenames. Saving an identical render reuses its object. Grain approval reuses an existing deterministic preview. Publishing to Library references the finished draft images instead of copying them to `posts/`; publication and draft status commit in one transaction. Widgets and carousel publishing continue to use the stored paths. Existing Library paths remain valid.

`image_assets` records image identity, source path, hash, size and lifecycle state. `image_asset_references` tracks ownership independently of workflow status, including paths nested in review/reference metadata. Discarded records, creative references, carousel snapshots, cover history and recorded feedback continue to protect their images. No rejected-image expiry or automatic cleanup schedule is introduced.

Library deletion first removes membership, then attempts to remove both formats only if neither has another reference or an active upload lease. Failed removals remain retryable. Clear uses a snapshot of post IDs and the same checks; prune searches nested storage folders and shared draft paths. Neither treats a shared file as disposable merely because it is outside `posts/`.

Inspect cleanup candidates, optionally index older untracked files, then explicitly apply cleanup:

```sh
npm run assets:cleanup
npm run assets:cleanup -- --index
npm run assets:cleanup -- --apply
```

The default retention is 30 days **after the last reference is removed**, or after an old untracked file is first indexed. `--days=N` changes that retention (minimum one day). Indexing saves inventory metadata but removes nothing. Preview is read-only. Apply rechecks and claims each candidate under a database lock; concurrent references and uploads block deletion. Failed cleanup claims are held for an hour before they can be retried. Storage and database operations are not a single transaction, so uncertain failures retain files rather than eagerly deleting them. Historical metadata can intentionally keep an otherwise superseded render alive.

Caption editors recover unfinished wording, option selection, square/wide layout and review notes in the same browser. Recovery does not approve, render, publish, or create taste feedback. A changed server caption/layout invalidates the recovered session; successful saving clears it. Browser storage is not a cross-device backup, and unavailable storage is indicated in the editor. Summer Roll remains independent.

Validation without production data or paid image calls:

```sh
node --test *test.js
python3 tests/run-image-assets-integration.py
```

The SQL runner uses a disposable `postgres:15` Docker container with no published ports and removes it afterward. It checks backfill, ownership, publication rollback/idempotency, cleanup claims, and existing feedback, widget and carousel behavior.

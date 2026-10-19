# Instagram music worker

Publishes five swipeable photos with Instagram catalog music using the proven
instagrapi session. It polls Supabase once per minute and uses the existing queue,
timezone, hours, and slot history. Instagram controls distribution into Reels.

## Free GitHub Actions deployment

The production target is standard GitHub-hosted Ubuntu runners in this public
repository. `.github/workflows/instagram-music-health.yml` checks every 15 minutes
at :07/:22/:37/:52. Supabase chooses only the latest due Eastern slot, accepts
up to four hours of delay, and enforces at least one hour since the last post.
It never drains an old backlog. Duplicate or already-handled slots do nothing.
GitHub can delay or drop scheduled jobs, so exact times remain best-effort.
Public-repository schedules are disabled after 60 days without repository activity.

Apply `20261019000000_music_schedule_catchup.sql` for this late-run policy.
Each invocation logs an explicit outcome and writes an Actions summary. Missed
windows, uncertain results and verification failures exit unsuccessfully. Ordinary
idle checks explain why they did not publish. A manual workflow run defaults to
`health`; selecting `publish` processes the latest due slot under the same guards.

Apply `20261018010000_instagram_worker_state.sql` and seed `dailyglance` with the
successful mobile settings using service-role access. This table has RLS enabled,
no client policies, and no anonymous/authenticated grants. Set repository secrets
`IG_MUSIC_SUPABASE_URL` and `IG_MUSIC_SUPABASE_KEY`. The session is never committed
or uploaded as an Actions artifact. `cloud.py` saves refreshed settings in this
private table, and records confirmed media IDs before verification/finalization.

Pushes to the deployment branch perform health checks only. Manual runs default to health checks.
Scheduled events publish only after the database publisher is set to `music`.
Merge the workflow into the default branch to activate its schedule. Validate a
cloud health run before switching the publisher. Runner IP changes can still cause
future Instagram challenges; failures need review rather than repeated logins.
GitHub workflow failures are visible in Actions and use the account's existing
notification settings. No paid runner or external hosting service is required.

## Alternative Render deployment (not provisioned)

1. Apply `supabase/migrations/20261018000000_instagram_music_worker.sql` through
   the normal migration workflow. Its default publisher remains `graph`.
2. Create a Render Blueprint using `backend/instagram-worker/render.yaml`.
   Review the displayed worker and 1 GB disk charges before creating resources.
   Set the two Supabase environment secrets. Do not commit an `.env` file.
3. Add a Render secret file named `instagram-session.json` with the existing
   successful mobile settings. The worker copies `/etc/secrets/instagram-session.json`
   to `/data/instagram/session.json` only when the persistent file is absent.
   Never put session contents in logs, Git, build arguments, or chat.
4. Start the worker while the publisher is still `graph`. Startup validates the
   account, approved music catalog, and schema without posting. Check `health_ok`
   followed by `worker_ready` in Render logs and `/data/instagram/health.json`.
   A login challenge needs resolution from the cloud host; do not repeatedly retry
   login or switch the scheduler before the account check succeeds.
5. Backfill music metadata for previously verified music posts so the first
   scheduled post respects the existing song history.
6. With no active or uncertain run, call
   `select public.switch_instagram_publisher('music');` as an operator. This
   preserves the existing enabled state and posting times. The Graph scheduler
   then receives no claims, and the music worker claims future due slots.
7. Verify a normal scheduled post's receipt and `music_verified=true`. Do not
   force an extra real post for a deployment check.

The Docker build allowlist excludes credentials, local experiments, and unrelated
source. One instance and a persistent disk are required. Auto-deploys are disabled.
The worker checks authentication on every start and before each publication.

## Failure handling

Database leases and a recorded publishing intent prevent concurrent or repeated
configure requests. If publication times out, the run becomes `uncertain` and
blocks later posts. Inspect the account and `/data/instagram/attempts/*/receipt.json`
before reconciling; never reset an uncertain run just to retry. A confirmed post
whose music cannot be verified remains posted and pauses the schedule for review.
Authentication failures during a run also pause it. Startup failures exit with a
sanitized error and are visible in hosting logs. No external alert service is set up.

Successful image downloads are deleted after saving the result; receipts and
sanitized response events remain on disk. Failed attempts retain images for review.
Do not remove an unresolved attempt. Monitor disk usage and prune resolved failed
attempt images as needed. Session files are private (0600); no password is saved.

Pause by setting `instagram_schedule.enabled=false`. Allow in-flight work to
finish; pausing does not cancel an external request. Roll back by calling
`switch_instagram_publisher('graph')` after resolving active/uncertain runs, then
stop the Render worker. Switching does not automatically re-enable a paused schedule.

## Validation

Run `python -m unittest discover -s backend/instagram-worker -v` in an environment
with `requirements.txt` installed. Run `node --test backend/instagram-music.test.js`
for the local selector. Build from the repository root:

```sh
docker build -t glance-instagram-music -f backend/instagram-worker/Dockerfile .
```

`test_database.sql` is for a disposable Postgres database with the carousel,
schedule, FIFO, and music migrations applied. It checks publisher isolation,
permissions, lease exclusivity, no publish replay, receipt persistence, and pause
on failed music verification. It rolls back fixtures. Never run it on production.

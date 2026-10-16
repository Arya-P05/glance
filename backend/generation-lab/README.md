# Generation lab

A fresh, local experiment system for Glance. It does not import legacy image prompts, scene directors, generation taste, captions, or publishing. Summer Roll remains separate and unchanged.

From `backend`:

```sh
npm run generation-lab:prepare  # read-only Supabase import of the fixed 22-image selection
npm run generation-lab
```

Open `http://localhost:8081/generate` for the focused production generator. The experiment and review studio remains at `http://localhost:8081/generation-lab`, or `http://127.0.0.1:3849` directly. The old `generate.js` CLI now exits with a retirement message; the old admin `/api/generate` endpoint returns 410 and points to `/generate`. Shared caption/reference/history helpers remain because downstream review and publishing still depend on them. Saved prompts and images are retained.

## What is saved

`backend/content/generation-lab/` (gitignored) stores:

- `references.json` and `references/`: the exact selected image bank and source hashes.
- `runs/<id>.json` and `.png`: every request, exact prompt, recipe hash, conditioning mode, model, settings, phase, timestamps, output hash and provider usage/request ID when returned. Targeted retries retain their parent run ID.
- `reviews.json`: append-only reviews with human, assistant and model provenance. Latest decision wins within an actor; assistant judgments never become human votes.
- `control.json`: persistent generation pause. Resume is explicit, and never replays failed/uncertain requests.
- `evaluations/`: optional model critiques, rubric, hashes, usage and frozen-round quality-gate reports. These are not human validation.

Keep this directory if moving the experiment to another machine. The fixed reference source IDs belong to this user's selected bank; other projects need a new catalog.

The server binds loopback and checks browser host/origin. It handles two image requests concurrently. Requests are saved before dispatch, stable request IDs deduplicate retries, and SDK automatic retries are disabled. A restart marks queued/generating records interrupted rather than spending again. Quota rejection stops further queued dispatch and records undispatched work as blocked. An in-flight request may finish after pausing; its output is retained.

## Experiments

Write a JSON manifest with `round` and up to 48 `runs`. Each run contains `referenceId`, `scene`, `recipeId`, `model`, `quality`, and `phase` (calibration/development/validation). Optional stable `requestId` defaults to round plus index. Do not reuse a round/index for a different specification.

```sh
node generation-lab/experiment.js submit content/generation-lab/calibration-001.json
node generation-lab/experiment.js status calibration-001
node generation-lab/evaluate.js calibration-001 gpt-6-astra
npm run generation-lab:retry-failures -- calibration-001 gpt-6-astra-bank-v2 1
npm run generation-lab:report-validation -- calibration-001
```

Submit and evaluate make paid API calls. Status and export are read-only. Model catalog presence does not guarantee a successful call. No cross-provider or model substitution happens silently. The 1.5 reference arm uses high input fidelity; later models omit that option. The first A/B arms have exactly the same text, differing in visual conditioning.

The evaluator sees up to four same-family references, the result, requested scene, and a strict rubric; recipe/model identity is hidden from it. It penalizes generic retro looks, performed moments, scene defects, lettering, branding and source reconstruction. Its scores are provisional. The retry command submits only failed candidates, uses the evaluator's one concrete correction, preserves the original, records lineage, and stops after three total attempts. In the studio, a human can also write a correction and choose **Retry with this note**. **Send to Backgrounds** uploads the exact selected original and creates a pending item in the existing review flow; it does not approve, caption or publish it.

## Production result

The human benchmark is 21 passes, 37 failures and 8 unsure decisions across the first 66 completed images. Reference-conditioned outputs passed 16/33; text-only outputs passed 5/33. Among 43 images rated by both the user and the previous automated judge, the judge approved 27 images the user did not pass. Automated aesthetic ratings are therefore retired as an acceptance gate. The older `unseen-validation-006` 20/20 report remains historical evidence of that judge's behavior, not evidence that the user quality target was met.

The production recipes are `bank-text-v6` and `bank-reference-v6` on `gpt-image-2.5-flare` at medium quality. They require one emotionally legible character truth and cluster the subject away from a large natural field such as sky, darkness, wall, water, grass, floor or bed. This comes directly from the user's observation that the collection needs both a reason to care about the image and a broad calm region for later text.

Human review of the first five-style matched A/B round, `emotion-first-008`, produced 5 pass, 5 unsure and 0 fail. The unchanged recipe then produced 19 pass, 1 unsure and 0 fail on the frozen 20-image `emotion-transfer-009` round, which used two unseen scene concepts in each of five families and both conditioning modes. Reference-guided passed 10/10; text-only passed 9/10. This meets the requested 95% threshold for the represented bank. The production screen therefore enables reference guidance by default while keeping text-only available. This finite result does not guarantee 95% for every possible subject or aesthetic.

The earlier 429 came from a different configured key/account context. Separate image and general-purpose keys are now configured and authenticated; generation and evaluation both completed. Cost shown in the studio is a published-rate estimate, not a billing-ledger balance.

## Validation

```sh
node --test generation-lab/lab.test.js
node --test *.test.js generation-lab/lab.test.js summer-roll/summer-roll.test.js
cd ../dashboard
npx tsc --noEmit
```

Tests use temporary files and stub providers. Real outputs, failed attempts, retries, evaluator records and the validation report remain in the ignored lab content directory. No automated assessment is stored as a human vote.

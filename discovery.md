# Generation rebuild — discovery

## User direction

Replace the existing generation system from scratch, rather than adding rules to it. Preserve Glance's other features, saved images, and review/publishing workflow. Work collaboratively, step by step, toward desired image outputs using repeated experiments. The replacement lab and validation workflow are now implemented.

## First reference selection

Read and visually inspected 22 user-added creative_references rows with created_at `2026-10-13T18:47:33.009532+00:00`. All currently have pending status and empty user notes. Older references are not part of this new selection. Database records were not modified.

Numbering follows the read-only selection snapshot stored in `/tmp/glance-reference-review/selection.json`; numbered contact sheets are in the same directory. Examples: 1 cow with heart glasses; 2 children in rain; 7 cat at computer; 8 friends posing at night; 11 skateboarder; 15 dog selfie in flowers; 18 dressed-up duck; 19 person reclining on motorcycle; 21 friends in mountains; 22 person holding a long object in a yellow room.

## Visual observations — provisional, awaiting user interpretation

- Snapshot texture: grain, softness, imperfect exposure, direct flash in some images, uneven framing. These are observations of appearance, not claims about camera provenance.
- Expressive subjects and immediately legible moments: goofy faces, affection, friendship, relaxation, playful confidence.
- Everyday environmental details matter; the set includes homes, roadside settings, pets, outings, and landscapes.
- Both plausible candid moments and staged/edited-looking absurdity appear. Strict documentary realism would exclude part of the selection.
- Composition varies: close faces and wider environmental scenes both occur. Clear text placement does not always mean a huge empty sky or a tiny subject.
- Provisional groups: animal humor; candid human/child moments; friendship and outdoor freedom. Some images overlap groups.

These observations are not approved prompt rules. Do not automatically convert them into global instructions or inherit old reference annotations as new requirements.

## User correction and selected first target

The user emphasized that accurate verbal descriptions of texture, personality, and subject matter still leave enormous room for aesthetically wrong outputs. The shared visual feeling is the hard part. Treat actual images and the user's visual comparisons as the target; adjectives are hypotheses, not a sufficient specification.

The user selected reference 11 (skateboarder), ID `846e953a-974c-41fd-bb7c-1349ef8bda03`, as the first calibration reference. Inspected the full square Library image as well as the user-provided cropped screenshot. Use the original Library asset for experimental input and consistent comparison, retaining the screenshot as selection context.

Provisional visual observations for this image: broad blue/lavender sky; warm light on the person; soft background car and vegetation; muted purple-grey asphalt; visible grain across the scene; full-body subject low in frame; an unpolished, playful skateboarding moment. These observations are not proof of why the user likes it or of its camera/creation process.

## Proposed experiment 001

Question: can a fresh generation path approach this reference's photographic feel while holding the basic subject/situation close?

Compare a concise text-only brief with the same brief plus the actual visual reference, if the selected image API supports this. Hold model, aspect ratio, output settings, and core scene constant where possible. Two outputs per approach is an exploratory first batch, not sufficient evidence for a reliable winner. No old generation rules, accumulated taste instructions, or prompt-planning chain should enter this experiment.

Evaluate clean photographic backgrounds without generated lettering; the user judges visual closeness and usability, with neither acceptable as a valid result. Captions may influence perceived appeal and should be assessed separately later. A near-reconstruction is only calibration: later test new subjects/settings and check that outputs do not depend on copying the source.

Next resolve runnable model/API support and experiment budget/settings before producing the first batch. No generation calls have been made. Keep the remaining 21 images available for future directions and evaluation; no holdout split has been agreed.

## Experiment direction — proposed, not implemented

Start with a small fresh generation path and inspect actual finished images. Record exact inputs and recipe versions; compare repeated outputs, allow neither/both usable, and track usability as well as preference. Choose the first comparison only after clarifying the target. Model/API capabilities, paid-run budget, and retirement boundaries for old generation remain to be determined.

## Summer Roll steering

The user also likes how Summer Roll images are being made. Preserve Summer Roll as a useful existing path; do not interpret the earlier generation reset as authorization to discard it. Clarify which outputs best represent what is working.

Code inspection: Summer Roll composes one fixed photographic treatment with one editable scene and sends that directly to the image model. It is isolated from the old generation/taste/planning modules. It persists exact prompts, model, quality and outputs locally, with no added grain processing. The treatment also encodes specific subject constraints (adult friends in their twenties, restrained expressions, summer/vacation scenes); transferring it unchanged would conflict with parts of the new reference bank.

Proposed revision: use a minimal adaptation of Summer Roll's camera treatment plus the skateboard scene as experiment 001's text-only baseline, then compare with the same prompt plus the selected visual reference where supported. Record the adaptation explicitly and hold model/settings constant across arms. This replaces the previously unspecified text-only baseline; it is not yet an approved implementation choice. Do not attribute Summer Roll's success to prompt structure, model, or treatment without testing. User preference among actual Summer Roll outputs remains unknown.

## Implementation and evidence, 2026-10-13

User authorized autonomous implementation and repeated real experiments toward 95% across styles. Built a fresh local generation lab with 22 immutable reference snapshots, five provisional style families, four versioned prompt recipes, a durable two-worker queue, reference/text arms, blind recipe labels, reference/output comparison, separate human/assistant/model reviews, usage estimates and per-recipe/style metrics. Summer Roll remains unchanged. Old Generate route redirects; legacy CLI retired and admin endpoint changed to 410 (takes effect when that server restarts).

Calibration 001: eight requests, four completed gpt-image-1.5 images, four quota/credit rejections on gpt-image-2 and gpt-image-2.5-sunburst. No automatic retries. Saved usage estimate $0.226442 for completed calls. The account's actual balance is NOT verified; user reports about $78 credit, so do not infer depletion from the error or tell them to pay again. The configured backend/.env key was used with no inherited key/base URL/org/project overrides. Billing browser requires login. User explicitly chose to finish setup/review current results for now: paid generation is persistently paused, with no pending calls.

Visual findings: both text-only images became generic centered vintage skateboarding portraits, with a much larger subject and foreground car. Reference-guided results got closer to the photographic character but closely reconstructed source identity, pose, vehicle and arrangement. Recorded assistant-only reviews: text arms fail, reference arms unsure (calibration-only near-copies). Zero human reviews. No cross-style pass-rate claim is supported.

The calibration next step was different events and subjects using explicit visual-character transfer and moment-first recipes. That work resumed after the user installed the replacement keys; the completed evidence follows.

## Completed transfer and validation, 2026-10-13

The user configured separate image-generation and general-purpose API keys and explicitly resumed sustained generation. Both authenticate. The earlier no-credit response did not represent the balance shown for the replacement image key.

A full visual analysis of all 22 references produced the working collection thesis: the camera should feel held by someone included in the joke, rather than someone producing an image of happiness. Five family treatments preserve differences between outdoor pets, outdoor candids, home memories, indoor pets and flash-lit friends. Bank recipes v2–v4 added compact-camera capture physics, less resolved modern detail, off-beat action timing, props in use rather than presented, and blank/unmarked objects. Reference recipes accept up to four same-family images so no single source controls the composition.

The frozen unseen set tested ten new scene ideas in both text-only and reference-conditioned form. A family-aware evaluator, hidden from recipe/model identity, passed 17/20 first attempts. Three failures were concrete: a copied watermark, recognizable shoe branding, and a spill that looked demonstrated. Targeted retries preserved the failures and corrected only the named problem. All three passed within two retries, so the quality-gated set accepted 20/20 with a maximum of three attempts. This is strong evidence for the represented bank and scenes; it remains provisional until the user reviews outputs and does not establish every possible aesthetic.

## Human correction and emotion-first composition, 2026-10-16

The user reviewed all 66 earlier completed images: 21 pass, 37 fail and 8 unsure. Reference-conditioned outputs account for 16/33 passes while text-only outputs account for 5/33. The automated evaluator approved 27 images the user did not pass among 43 paired decisions, so its 20/20 validation result is not a quality claim and it is retired as an acceptance gate.

The v5 experiment removed forced spills and fumbles, but its instruction to preserve background detail produced crowded kitchens and porches. More fundamentally, an ordinary action such as an older man folding a lawn chair had no emotional reason to keep the photograph. The user's references work through an immediate character truth or relationship: absurd confidence, affection, freedom, belonging, stubborn dignity or committed silliness. They also usually cluster the subject in one region and leave a large natural field of sky, darkness, wall, water, grass, curtain, floor or bed. That quiet field supports later caption layout without looking like an artificial blank panel.

Recipe v6 tests both requirements. `emotion-first-008` contains five new concepts in matched text/reference arms: a muddy dog sitting proudly on a patio chair, an older woman trying roller skates, an elderly woman vacuuming in a motorcycle helmet, a serious cat in a too-small box, and friends sharing cake on a curb after dark. All ten completed successfully and are awaiting human review; no success claim is made from assistant inspection.

The user rated `emotion-first-008` much more favorably: 5 pass, 5 unsure and 0 fail. Both muddy-dog arms passed. The reference arms passed for the roller-skating and vacuuming concepts; their text arms were unsure. The text flash-friends arm passed while its reference arm was unsure. Both cat-in-box arms were unsure, suggesting that a static animal-plus-object premise is still weaker than behavior or relationship. No review notes were provided.

The recipe was frozen unchanged for `emotion-transfer-009`: two unseen emotional concepts per family, each in text and reference arms. Indoor pets tested a sleeping dog posed like a tired relative and two cats sharing a blanket, replacing the weaker quirky-container mechanism. All 20 calls completed without provider failures. The user passed 19, marked 1 unsure and failed 0. Reference-guided passed 10/10; text-only passed 9/10 with one unsure. This meets the requested 95% threshold on the frozen, five-family transfer set. It is evidence for the represented bank and workflow, not a universal guarantee for every possible subject or aesthetic.

## Production promotion, 2026-10-16

Bank v6 on `gpt-image-2.5-flare` is the production recipe. The focused `/generate` surface enables reference guidance by default and allows text-only generation when wanted. Users choose one of the five validated families, one to four same-family references, a scene, standard or high quality, and one, two or four outputs. Every production attempt uses durable request IDs and the same saved-run pipeline as the lab. Results remain local until **Send to Backgrounds** is chosen; that action creates a pending background in the existing review flow and does not approve, caption or publish it. The full experiment studio remains at `/generation-lab`.

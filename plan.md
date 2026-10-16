# Generation rebuild

User authorized implementation and sustained iteration on 2026-10-13 after selecting the skateboard reference and endorsing Summer Roll. Continue autonomously; no additional plan approval is required for the agreed experiment work.

## Outcome

A fresh generator and persistent comparison studio, independent of the legacy scene/taste rules. Target: at least 95% usable, aesthetically aligned fresh images across the styles represented by the 22 selected references. Agent/model ratings are provisional and separate from the user's ratings. No claim of human-validated 95% without human evidence. Raw output yield, post-selection yield, failures, and cost/usage remain separate.

## Journey and design

Choose a reference and scene → select versioned recipe → create bounded batch → persist every attempt before paid dispatch → inspect reference beside output → save human or agent review separately → compare by recipe/style → revise → validate on new scenes.

Local Node service, existing OpenAI SDK and Sharp; immutable reference snapshots and JSON/image records under ignored backend/content/generation-lab. The dashboard keeps a focused production surface at `/generate` and the comparison studio at `/generation-lab`. Generation stays local; an explicit **Send to Backgrounds** action places a chosen result into the existing pending review queue. Nothing is approved, captioned or published automatically. Failed/uncertain provider calls are never silently retried. The local single-user service binds loopback and rejects foreign browser origins.

## Milestones

1. Freeze the selected reference bank and inspect Summer Roll; define style families and distinct evaluation scenes (small).
2. Build isolated recipes, durable run/evaluation records, resumable inspection, useful tests, and a comparison studio (medium).
3. Execute skateboard calibration and model comparison, inspect real images, revise (medium, provider latency dependent).
4. Test transfer across all five provisional style families, revise weakest families, retain failures and near-copies (large, iterative).
5. Validate a frozen recipe on fresh scenes and report measured rates with sample counts, per-family coverage, uncertainty and remaining gaps (large).
6. Retire the old generation entry point while preserving saved prompts/assets and shared caption/publishing dependencies; document migration (small).

## Evaluation

Judge actual reference/output pairs: photographic feel, natural moment, composition/color/exposure/texture, scene compliance, absence of lettering/artifacts, and independence from the source. A technically valid image or a near-copy does not establish success. Calibrations are excluded from transfer metrics. Do not pool evolving recipes to report one inflated rate. Hold out fresh scene briefs for final testing; style-reference-conditioned evaluation is explicitly not an unseen-style claim. 22 examples do not establish performance for every possible aesthetic.

## Constraints and decisions

Preserve Summer Roll and its outputs. Preserve unrelated user edits. Reuse its simple treatment-plus-scene architecture as a baseline, not its fixed young-adult/vacation subject rules. Actual images govern evaluation; prose is a hypothesis. User authorized real generation experiments; track calls/usage and run finite, reviewable rounds. Stop repeating an approach when evidence shows no improvement and change the hypothesis.

Skills: build-coach for milestones; official OpenAI documentation for live API capabilities; emil-design-eng for quiet comparison UI. Imagegen consulted for visual prompting, while this task builds and tests the user's API-backed generation application. Standalone asset CLI workflow is not the application implementation.


## Current status

The replacement infrastructure, retirement work and quality milestone are complete for the represented reference bank. Human review of the first 66 completed images produced 21 passes, 37 failures and 8 unsure decisions. Reference conditioning passed 16/33 versus 5/33 text-only. The automated evaluator had 27 false approvals among 43 paired human/model decisions, so it is no longer used to accept images or claim the target.

Human feedback identified two coupled requirements that v2–v5 did not capture reliably: the scene must evoke an immediate feeling or character truth, and the composition must cluster the subject away from a large naturally calm field that can support later text. `emotion-first-008` tested v6 with five matched text/reference pairs across all five families and received 5 pass, 5 unsure and 0 fail. The unchanged recipe then passed 19/20 human reviews in the frozen `emotion-transfer-009` round: reference-guided passed 10/10 and text-only passed 9/10 with one unsure. V6 on Flare is promoted as the production recipe, with reference guidance enabled by default. Legacy entry points remain retired; the experiment lab, Summer Roll and downstream review/publishing remain intact.

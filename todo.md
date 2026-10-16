# Generation rebuild tasks

Owner: main assistant for all tasks. User authorized autonomous implementation and iteration.

- [x] Snapshot 22 selected references and write style/scene catalog. Done when each source is locally available with stable ID/hash and distinct transfer brief. Verify count and visual source mapping.
- [x] Implement isolated lab core, provider adapter, durable attempts, reviews and statistical summary. Done when mock tests cover dispatch inputs, persisted failure/restart recovery, duplicate requests, correct denominators and review separation.
- [x] Implement comparison studio and dashboard entry. Done when images can be compared at useful size, recipe identity can be hidden, human votes persist across reload and errors remain visible. Verify in browser and typecheck.
- [x] Run calibration and model comparison. Completed across 1.5, 2, Sunburst and Flare; saved outputs led to Flare as the candidate.
- [x] Run cross-style transfer and iterative improvements. Completed v2–v4 rounds across all five families with both conditioning modes; retained every failure and near miss.
- [x] Freeze and test candidate recipe on new scenes. `unseen-validation-006` contains 20 cases: 17/20 first-pass and 20/20 after a bounded correction gate. Results are model-assessed and separate from human validation.
- [x] Retire old generation entry point, preserve shared downstream modules, and document running the lab. Done when new Generate path works and legacy endpoints cannot accidentally run old generation.
- [x] Reach the human quality target. The frozen `emotion-transfer-009` round received 19 passes, 1 unsure and 0 failures across 20 unseen candidates and all five families. Reference-guided passed 10/10; text-only passed 9/10.
- [x] Promote v6 into a production generator. `/generate` exposes only the validated family, reference, scene, quality and count choices; reference guidance is the default, outputs remain durable, and chosen images can enter the existing Backgrounds review queue. `/generation-lab` remains available for future experiments.


Evidence: generation resumed with the separate image/general keys. The earlier v4 model report is retained for audit but contradicted by human review. Bank v6 on Flare passed the user's frozen transfer review at 19/20 overall, including 10/10 reference-guided. The studio supports paired A/B generation and human-directed retries with preserved lineage. Old CLI/admin generation paths are retired.

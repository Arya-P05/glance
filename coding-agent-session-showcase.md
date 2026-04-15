# Coding agent session transcript (illustrative)

**Project:** Internal billing microservice (Node + Postgres)  
**Goal:** Stop under-charging enterprise customers when usage events arrive out of order across regional writers.  
**Why it’s not basic:** Touches distributed ordering, idempotency, reconciliation, and a migration that must ship without downtime.

---

## Me — context dump

We ingest usage from three regions. Events for the same `subscription_id` can land minutes apart and **not** in wall-clock order. Right now we take `MAX(quantity)` per day bucket, which is wrong when a later correction has a *lower* authoritative total after a refund/adjustment.

Constraints:

- No global ordering service; we only have `event_id` (UUID v4), `occurred_at` (client clock, untrusted), and `ingested_at` (our clock).
- Writers use `ON CONFLICT DO UPDATE` today; retries are common.
- We need **exactly-once billing semantics** from the business POV: last *valid* correction wins, but we can’t trust `occurred_at` alone.

I pasted our current rollup SQL and the table DDL. Can you propose a safe state model + migration steps?

---

## Agent — first pass

**Reads:** `migrations/`, `src/rollup.ts`, integration tests.

**Proposal:**

1. Treat each usage line item as an **append-only fact** with a monotonic **business revision** sourced from the upstream ERP (`revision` bigint, nullable during backfill).
2. Replace `MAX(quantity)` with “**latest revision wins per (subscription_id, sku, usage_day)**,” using a partial unique index where `revision IS NOT NULL`, and a fallback path for legacy rows.
3. Add `dedupe_key` (`text`, unique) built from upstream’s stable event fingerprint to make retries safe.

**Risks called out:** backfill order, NULL revisions colliding, and perf on the partial index.

---

## Me — pushback

`revision` won’t exist for ~30% of traffic for two quarters. We can’t block on ERP changes. Also: some SKUs are **daily counters** (absolute) and some are **deltas**; the rollup code currently assumes absolute. Don’t widen scope to deltas yet—just don’t break them.

---

## Agent — revised design

**Dual-track merge rule:**

- **Track A (legacy):** For rows with `revision IS NULL`, use a deterministic tie-break:
  `(ingested_at, event_id)` lexicographic order — *not* `occurred_at`.
  Document that this is “best effort” until revisions land.
- **Track B (authoritative):** When `revision` is present, it dominates; ignore `ingested_at` for ordering *except* as a tie-break if revisions collide (shouldn’t happen).

**SQL sketch (simplified):**

```sql
-- Winner selection per bucket
SELECT DISTINCT ON (subscription_id, sku, usage_day)
  *
FROM usage_facts
ORDER BY
  subscription_id, sku, usage_day,
  revision DESC NULLS LAST,
  ingested_at DESC,
  event_id DESC;
```

**Migration:**

1. Add nullable `revision bigint`, `dedupe_key text UNIQUE`, backfill `dedupe_key` from hash of stable fields.
2. Create partial index supporting the DISTINCT ON / rollup query.
3. Deploy app that writes `dedupe_key` + optional `revision` first (dual-write safe).
4. Flip rollup job to new query behind a flag; shadow-compare totals for 48h.

---

## Me — test request

Write property tests around out-of-order ingestion. I want cases where **older ingested_at** still wins because **revision** is higher, and the inverse for legacy NULL revisions.

---

## Agent — tests + failure

**Adds:** `rollup.ordering.spec.ts` with a tiny in-memory fixture mirroring Postgres `DISTINCT ON` semantics.

**First CI failure:** flaky clock assumption in tests — `ingested_at` defaulted to `Date.now()` without freezing time.

**Fix:** inject a monotonic fake clock; agent refactors test helper to accept explicit timestamps.

---

## Me — production-shaped concern

Rollup job replays 14 days nightly. Will the partial index make replay O(n²) in Node because of per-day queries?

---

## Agent — measurement, not vibes

**Adds:** `EXPLAIN (ANALYZE, BUFFERS)` fixtures + a short `scripts/benchmark-rollup.sql`.

**Finding:** existing job already did per-bucket queries; new plan uses **Index Only Scan** on the partial index for Track B rows and a bitmap path for legacy — net **−18%** time on a50M-row anonymized snapshot (local restore).

**Follow-up:** suggests batching `WHERE usage_day = ANY($1::date[])` to cut round trips; implements optional batch mode guarded by env var.

---

## Me — ship checklist

We need a runbook: what to alert on if shadow diff drifts, and how to revert.

---

## Agent — runbook + guardrails

**Delivers:**

- `docs/runbooks/usage-rollup-migration.md` sections: flags, shadow diff SQL, rollback (flip flag + keep columns), and **SLO**: max abs drift threshold per tenant tier.
- Metric hooks: `rollup_shadow_diff_abs_total` by `tenant_id` with a burn-rate alert example (PromQL snippet).

---

## Outcome (what actually shipped)


| Before                   | After                                                     |
| ------------------------ | --------------------------------------------------------- |
| `MAX(quantity)` by day   | **Revision-primary** ordering with legacy tie-break       |
| Retry-sensitive updates  | `**dedupe_key`** idempotency                              |
| “Trust the client clock” | `**occurred_at**` documented as display-only for ordering |


**Incident avoided:** finance caught a pilot tenant with a −6.4% usage discrepancy on refunds; shadow diff went to **0** after revision backfill for that tenant.

---

## Why this session shows strong AI use

- **Problem framing:** I supplied real constraints (multi-region, untrusted clocks, long legacy tail) instead of “fix bug.”
- **Iterative narrowing:** I rejected a clean-but-impractical approach; the agent adapted without rewriting everything.
- **Verification ladder:** unit/property tests → `EXPLAIN` → shadow metrics → runbook, not “trust the refactor.”
- **Scope control:** explicitly deferred deltas to avoid a rewrite.
- **Operational finish:** migration flags, rollback, and alerts—so the code change is actually operable.

---

*This transcript is a realistic composite for portfolio or interview discussion. Names, paths, and numbers are illustrative.*
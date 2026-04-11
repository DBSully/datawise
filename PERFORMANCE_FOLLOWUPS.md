# Performance Follow-Ups

A running log of known performance issues that have been **diagnosed but only partially fixed**, with full proposals for the eventual proper fix. New entries get appended at the bottom; resolved entries get marked `[RESOLVED on YYYY-MM-DD]` rather than deleted, so the history is preserved.

The point of this file is so that future-Claude (or future-Dan) can pick up exactly where we left off without having to re-investigate from scratch when the issue resurfaces or scale forces our hand.

---

## 1. `analysis_queue_v` is the dominant cost on `/home` (and likely `/screening` too)

**Status:** Partially fixed 2026-04-11. Quick win applied. Proper fix deferred.
**Next trigger to revisit:** see "When to revisit" below.

### Diagnosis

`/home` was loading in ~5 seconds (steady state — first load after a code change ran ~17s due to Turbopack compilation). Per-query timing instrumentation showed:

| Query | Time |
|---|---|
| createClient | ~25-65ms |
| section1.import_batches | ~225ms |
| section1.analysis_pipeline | ~225ms |
| section1.watch_list_v(count) | ~255ms |
| **section1.analysis_queue_v(prime+null)** | **~2.3-2.6s** |
| **section2.analysis_queue_v(prime+null,top10)** | **~2.1s** |
| section3.watch_list_v(unbounded) | ~130ms |
| section5.daily_activity_v(today,limit30) | ~130ms |
| **TOTAL page wall** | **~5s** |

The two `analysis_queue_v` calls accounted for ~4.5s of the ~5s page wall. Every other query was sub-300ms.

### Why `analysis_queue_v` is slow

The view (most recent definition: `supabase/migrations/20260410130500_interim_queue_filter.sql`) does:

```sql
SELECT DISTINCT ON (sr.real_property_id) ...
FROM screening_results sr
LEFT JOIN LATERAL (... mls_listings lookup per property ...) ml ON true
LEFT JOIN LATERAL (... analyses + analysis_pipeline JOIN per property ...) aa ON true
ORDER BY sr.real_property_id, sr.created_at DESC;
```

For every distinct `real_property_id` in `screening_results` (~thousands), the view runs **two `LEFT JOIN LATERAL` subqueries**. All the supporting indexes exist:
- `screening_results(real_property_id, created_at desc)` — supports the `DISTINCT ON`
- `mls_listings(real_property_id, listing_contract_date desc, created_at desc)` — supports the first LATERAL
- `analyses(real_property_id)` + `analysis_pipeline.analysis_id` PK — supports the second LATERAL

The cost per LATERAL call is small (~1ms or less). The cost is purely volume: `(distinct property count) × 2 LATERAL calls`. At current data scale that's ~2.3s per view materialization.

**The page WHERE clause cannot be pushed inside the DISTINCT ON.** The page filters by `is_prime_candidate = true AND review_action IS NULL`, but pushing that filter into the view would change semantics:
- Current view: returns the LATEST screening per property; the page then filters those latest rows
- If pushed in: would return the latest PRIME (or latest UNREVIEWED) per property, surfacing properties whose latest screening is NOT prime/unreviewed but who had a qualifying screening earlier

So the view must materialize the full DISTINCT ON result (all distinct properties × 2 LATERAL joins) before any page filter applies.

### What we shipped (the partial fix)

**Quick win — Option A.** Section 1 of `/home` needed `(id, mls_status)` for ALL unreviewed primes (to count by MLS status). Section 2 needed 13 columns for the **top 10** unreviewed primes. They used the same WHERE on the same view, so we collapsed them into a single query inside the Section 1 `Promise.all`, fetching the section-2 column set + `mls_status` for ALL unreviewed primes ordered by `est_gap_per_sqft DESC`. Section 1 derives the count by iterating the full result; section 2 takes `.slice(0, 10)` from the same in-memory data.

**Result:** queue-view calls per page load dropped from 2 to 1. Expected page wall: ~5s → ~3s. Risk: zero (pure application code, no schema or query change). Reversible in 30 seconds.

This fix is in `app/(workspace)/home/page.tsx` and is **not meant as the long-term answer** — it just removes the most obvious waste while we're in active Phase 1 development. As soon as scale grows or `/screening` becomes the dominant pain point, the proper fix below should be revisited.

### The proper fix (deferred)

**Cache-table pattern with RLS-compatible refresh hooks.**

A literal Postgres `MATERIALIZED VIEW` is **not safe** in this codebase because materialized views do not honor RLS policies on their underlying tables. Today (single org, single user) that's harmless, but in **Step 4 (Partner Portal MVP)** when partners get auth'd into the same database, a materialized view would let any partner read every org's screening data — a hard regression of all the Step 2 RLS work.

The pattern that gets MV-class read speed AND keeps RLS:

```
   ┌─────────────────────────────────┐
   │ analysis_queue_cache  (TABLE)   │  ← real table, indexed
   │  - all current view columns     │  ← organization_id column
   │  - organization_id              │  ← RLS policies (org-scoped)
   └────────────┬────────────────────┘
                │
                │  read via
                ▼
   ┌─────────────────────────────────┐
   │ analysis_queue_v  (VIEW)        │  ← thin pass-through view
   │  SELECT * FROM ..._cache        │  ← preserves the existing name
   └─────────────────────────────────┘  ← consumers don't change

Writes to screening_results flow through:
   server action → INSERT/UPDATE → call refresh_analysis_queue_cache(real_property_id)
                                    └→ recompute ONLY the rows for that property
                                    └→ UPSERT into analysis_queue_cache
```

Properties of this pattern:

- **Read speed**: queries hit a real indexed table → millisecond lookups
- **RLS enforced**: `analysis_queue_cache` is a regular table with regular org-scoped policies → Step 4 partners are safe
- **No view-name changes**: the legacy `analysis_queue_v` still exists as a thin pass-through (`SELECT * FROM analysis_queue_cache`), so `/screening`, `/home`, and any other consumer keep working unchanged
- **Granular refresh**: refresh-by-property-id instead of full rebuild → cheap during bulk ops because we're only re-doing the rows that changed

**The cost / catch:** every server action that mutates `screening_results`, `analysis_pipeline`, `mls_listings`, or `analyses` (in ways that affect the queue view) has to call the refresh function for the affected `real_property_id`. That's ~5-10 server action sites that need to know about the cache. Easy to forget when adding new write paths later.

Mitigations:
- A cron-based safety-net refresh every 15 minutes that catches any drift
- Document the pattern in `CLAUDE.md` so future-Claude doesn't add a write path without the refresh hook
- Add a CI grep that fails if any new `screening_results` write doesn't call the refresh function (long-term, optional)

### Open design questions before implementing the proper fix

1. **Refresh granularity.** Per-property (cheap, complex to implement) vs full rebuild (simple, ~2.3s per refresh). **Recommendation:** per-property — the cost matters most during batch screening, and the underlying queries are already per-property-keyed.

2. **Refresh strategy.** Synchronous in the server action (read-after-write consistency, slower writes) vs async via `pg_notify` + worker (fast writes, eventual consistency, more moving parts). **Recommendation:** synchronous per-property — the per-property cost is small (~5-20ms each), so the latency hit on writes is acceptable, and there's no eventual-consistency UX confusion.

3. **Initial population.** A backfill migration that runs the heavy view once and populates the cache. ~2.3s one-shot during the migration, then it's hot.

4. **Bulk operations.** Screening batch processing writes thousands of rows in one transaction. We don't want to call the refresh function for each row inside that loop. Either: (a) the bulk runner does its own bulk refresh at the end of the batch, or (b) refresh becomes a no-op inside the batch and the runner triggers one big refresh after. **Recommendation:** (a) — bulk runner becomes refresh-aware.

5. **Other write paths.** Need to grep for every write to `screening_results`, `analysis_pipeline`, `mls_listings`, and `analyses`, then add refresh hooks. Probably 10-15 sites total.

### Estimated effort

- Migration (new table + RLS policies + refresh function + indexes + view replacement + initial backfill): **~1 hour to write, 5-10 minutes to apply**
- Application code (refresh hooks in every relevant server action + bulk runner integration): **~1-2 hours**
- Testing (full regression check that screening / promotion / passing / batch processing all still work AND that the cache stays in sync): **~30 min**
- **Total: ~3-4 hours of careful work**

### When to revisit

Apply the proper fix when **any one** of these triggers:

1. **`/home` page wall exceeds ~3 seconds again.** Quick-win Option A bought us roughly 50% headroom. Once data growth eats it, the next stop is ~5s and then growing.
2. **`/screening` page noticeably slows.** It uses the same `analysis_queue_v` view and will feel the same pain at the same time.
3. **Step 4 (Partner Portal MVP) starts.** Multi-tenant readiness is when the RLS-compatible cache pattern stops being optional and starts being required for any future read-path optimization.
4. **`screening_results` crosses ~50k rows or `comparable_search_candidates` crosses ~2M rows.** Both would push the view's per-call cost into the 5-10s range, which would start hitting the Supabase 8s API timeout.

### How to confirm before doing the work

Drop the timing instrumentation from `app/(workspace)/home/page.tsx` line 25-39 back in (it's a small wrapper around `await` that prints per-query times to the dev server console), reload `/home`, and read the log. If `analysis_queue_v` is still the dominant line item and total wall is back above 3s, the diagnosis hasn't changed and the proper fix is the right call. If the bottleneck has moved (e.g., to `watch_list_v`), redo the investigation with fresh data.

The instrumentation pattern:

```typescript
async function timed<T>(label: string, p: PromiseLike<T>): Promise<T> {
  const start = performance.now();
  const result = await p;
  console.log(`[home] ${label}: ${(performance.now() - start).toFixed(0)}ms`);
  return result;
}
```

Wrap each query with `timed("label", supabase.from(...).select(...))` and read the dev server log.

---

## 2. `/screening` page loading time investigation needed

**Status:** Open — surfaced 2026-04-11 by Dan during 3E.4 testing
**Severity:** Unknown — needs measurement before triaging

### The observation

Dan noted during 3E.4 verification that the `/screening` page feels slow to load. Has not been measured yet — the observation is qualitative.

### Why this might matter

`/screening` is the daily-work fallback during 3E execution per Decision 5.1 (drop side-by-side). The new Workstation is being built up incrementally throughout 3E and is "viewable but in-progress" until 3E.7 ships the per-card modals. If a sub-task ships broken, the screening modal at `/screening` is the only fully-functional surface for property review. Slow loading there is more impactful than usual right now.

### Likely suspects

`/screening/page.tsx` reads from `analysis_queue_v`, the same view that drove the `/home` slowness in entry 1 above. The view does `DISTINCT ON (real_property_id) ... ORDER BY real_property_id, created_at DESC` over `screening_results` with two `LEFT JOIN LATERAL` subqueries per row. The `/screening` page likely calls it without the `is_prime_candidate=true AND review_action IS NULL` filter that `/home` uses, which means it materializes the full queue (not just unreviewed primes), so it's potentially even slower than `/home` was at ~5s.

### Recommended next step

Same diagnostic as for `/home`: drop in temporary timing instrumentation around each Supabase query in `app/(workspace)/screening/page.tsx`, reload, read the per-query timings from the dev server console. Then triage:

- If `analysis_queue_v` is the dominant cost, both this entry AND entry 1 above point at the same root cause. Resolving entry 1 (the cache-table pattern) would automatically fix this entry too.
- If a different query is the bottleneck (e.g., `screening_batches`, the activity log, or a batch metadata join), the fix is independent.

### When to revisit

Apply the proper fix when:

1. A measurement confirms the slowness is real (not just perceived)
2. AND the bottleneck is identified
3. AND it's not blocked by the new Workstation work in 3E (don't sidetrack the 3E build)

Per Dan's call during 3E.4: "make a reminder to explore Screening page loading time, but let's not get sidetracked." This entry is the reminder.

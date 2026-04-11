# Supabase Usage Considerations

> **Purpose:** Reference document capturing what DataWiseRE's Supabase project needs to be aware of regarding resource usage, cost, throttling, and scaling. Written after the Phase 1 Step 2 backfill exhausted the disk quota and triggered a 4-hour auto-scale cooldown.
> **Created:** 2026-04-10
> **Maintainer:** update this document whenever plan, compute, or spend cap settings change, or when a new usage incident teaches something worth remembering.

---

## 1. Why this document exists

During Phase 1 Step 2 (RLS Scaffolding), running the `organization_id` backfill migration across all core tables caused the project's disk usage to spike from normal levels to **97.6% of the 8 GB Pro plan disk quota**, which tripped Supabase's auto-scale threshold and put the project into a **4-hour cooldown** during which writes were throttled and the Supabase CLI returned `25006: cannot execute GRANT ROLE in a read-only transaction` errors on every command.

The incident was resolvable by waiting out the cooldown, but it exposed several things about the project's scale and cost model that are worth remembering:

1. The dataset is larger than prior estimates — ~1.27M total rows across core tables
2. Bulk operations (backfills, reindexing, schema migrations) temporarily inflate disk usage due to Postgres MVCC
3. The Pro plan's included quotas are modest and bulk operations can exceed them
4. The over-usage pricing (with spend cap removed) is trivial for disk but needs verification for other categories
5. The current compute tier (micro, 1 GB RAM) is borderline adequate for the scale

This document captures all of that for future reference.

---

## 2. Current project configuration (as of 2026-04-10)

| Setting | Value |
|---|---|
| Plan | Pro |
| Included disk | 8 GB (gp3) |
| Compute | Micro (1 GB RAM, 2-core ARM) |
| Compute cost | ~$0.01344/hr ≈ ~$9.68/month |
| Spend cap | **REMOVED** as of 2026-04-10 after the cooldown incident |
| Disk auto-scaling | Enabled (limited to once every 4 hours when ≥90% full) |
| Disk over-usage rate | $0.000171 per GB-hour (≈ $0.12 per GB-month) |

**Any time these settings change, update this table.**

---

## 3. Data scale snapshot (2026-04-10, post Phase 1 Step 2 backfill)

Row counts captured after the Task 2 backfill verified `organization_id IS NULL` = 0 on every table. Use these numbers as a baseline to compare against future growth.

| Table | Row count |
|---|---|
| **comparable_search_candidates** (JSONB metrics per row) | **736,927** |
| import_batch_rows (JSONB raw_row per row) | 73,267 |
| mls_listings | 69,904 |
| property_physical | 66,168 |
| real_properties | 66,169 |
| property_financials | 66,049 |
| screening_results (many JSONB fields) | 64,793 |
| comparable_search_runs | 56,692 |
| analyses | 251 |
| analysis_pipeline | 185 |
| import_batches | 60 |
| import_batch_files | 58 |
| screening_batches | 54 |
| manual_analysis | 37 |
| analysis_notes | 15 |
| analysis_reports | 5 |
| comparable_profiles | 4 |
| analysis_showings / analysis_offers / analysis_links / comparable_sets / comparable_set_members | 0 each |
| **Total** | **~1,270,000 rows** |

**The two tables that dominate disk usage are `comparable_search_candidates` (JSON-heavy, ~700k rows) and `import_batch_rows` (JSON-heavy, ~73k rows).** Everything else combined is a small fraction of those two.

### Estimated "live" disk footprint after autovacuum

Rough per-table sizes (row count × typical Postgres row size including JSONB):

| Table | Estimated live size |
|---|---|
| comparable_search_candidates | ~700 MB |
| import_batch_rows | ~350 MB |
| mls_listings | ~70 MB |
| screening_results | ~130 MB |
| comparable_search_runs | ~30 MB |
| real_properties + physical + financials | ~60 MB |
| Existing indexes (pre Step 2) | ~500-800 MB |
| **Total live data** | **~1.8-2.2 GB** |

### What makes disk usage *appear* much larger than live data

At the time of the incident, actual disk was **7.81 GB** — roughly 4x the live data estimate. The difference is made up of:

1. **MVCC dead rows** from the backfill (biggest contributor right after bulk updates). Every `UPDATE` creates a new row version and leaves the old one behind until autovacuum reclaims it. A full-table UPDATE effectively doubles the table's footprint until cleanup runs.
2. **Write-ahead log (WAL)** retained for replication and point-in-time recovery (~500 MB-1 GB typical)
3. **Temporary files** from sort operations, hash joins, index builds
4. **Auth / storage / realtime schema** metadata (~100 MB)
5. **System catalogs** and Postgres internals

**Key insight:** the "used disk" number in the Supabase dashboard includes all of the above. After a big bulk operation, it may take autovacuum several minutes to hours to clean up dead rows, during which time reported disk usage is inflated. Don't panic at a spike right after a migration — let autovacuum catch up before worrying.

---

## 4. What happened during the Step 2 backfill incident

The Step 2 Task 2 migration `UPDATE`d the new `organization_id` column on every row in every core table — roughly 1.27 million rows in one migration. This is a massive MVCC event.

**Timeline:**
1. Backfill migration pushed via supabase CLI
2. Postgres began processing — the first version of the migration wrapped all 22 UPDATEs in a single `DO $$` block, which Postgres treats as one statement
3. Cumulative wall time on the single statement exceeded `statement_timeout` → `SQLSTATE 57014` → transaction rolled back
4. Migration file was rewritten to use individual UPDATE statements (each getting its own `statement_timeout` window) and re-pushed successfully
5. Backfill completed; all rows have `organization_id` set correctly
6. **But:** the successful backfill left behind ~1.27M dead row versions in the MVCC system, temporarily doubling on-disk footprint
7. Combined with the original failed attempt's WAL / temp file usage, disk usage spiked to 97.6% (7.81 GB of 8 GB)
8. Supabase's auto-scale threshold fired at 90% but couldn't scale because cooldown rules limit auto-scaling to once every 4 hours
9. Project went into read-only state for writes, spend cap (still enabled at this point) contributed to throttling behavior, CLI began failing with `25006`
10. Supabase issued a "resources exhausted" notification with a 4-hour cooldown countdown

**Resolution:**
- Wait out the 4-hour cooldown
- Autovacuum cleans up dead rows in the background
- Auto-scale either fires after cooldown (if still >90%) OR disk drops naturally as autovacuum reclaims space
- Spend cap removed post-incident to prevent future throttling during legitimate bulk operations

**What caused this specifically** was the combination of:
1. Very large dataset on a small (1 GB RAM) compute tier — autovacuum is slow when resource-constrained
2. Tight disk quota (8 GB) with the live dataset already consuming 2+ GB
3. A migration that touched every row in every table in rapid succession
4. Spend cap enabled, which turned transient over-usage into hard throttling

Future bulk operations on this scale should expect similar behavior unless **at least one of** the following is done:

- Compute tier upgraded so autovacuum can keep up
- Disk quota expanded (manually or via auto-scale after spend cap removal)
- Bulk operations broken into smaller batches that let autovacuum catch up between each
- Data lifecycle management (archive/delete old rows to reduce baseline)

---

## 5. Supabase pricing math

These calculations use the $0.000171/GB-hour rate for disk over-usage. **Verify current rates on Supabase's pricing page before making decisions** — rates change and I can't fetch live pricing.

### Disk over-usage formula

```
monthly_cost_per_GB_over = $0.000171 × 24 hours × 30 days
                         = $0.12312 per GB-month
                         ≈ $0.12 per GB over the included 8 GB, per month
```

### Realistic scenarios for DataWiseRE

Based on current data scale (~2-3 GB live steady state, occasional bulk operation spikes):

| Scenario | Disk usage | Hours over | Over-usage cost |
|---|---|---|---|
| Steady state (normal operation) | 2-3 GB | 0 | **$0** |
| Moderate growth over 6 months | 4-5 GB | 0 | **$0** |
| Temporary migration spike (2 GB over for 4 hours) | 10 GB | 4 hours | **$0.0014** (fraction of a cent) |
| Temporary migration spike (4 GB over for 12 hours) | 12 GB | 12 hours | **$0.0082** (less than a penny) |
| Sustained over-usage at 2 GB over | 10 GB steady | 720 hours | **$0.25/month** |
| Sustained over-usage at 4 GB over | 12 GB steady | 720 hours | **$0.49/month** |
| Sustained over-usage at 8 GB over (2x plan) | 16 GB steady | 720 hours | **$0.98/month** |
| Sustained over-usage at 16 GB over (3x plan) | 24 GB steady | 720 hours | **$1.97/month** |

**Bottom line for disk over-usage specifically:** even at 2-3x the included quota, monthly over-usage is under $2. The cost of removing the spend cap (for disk) is effectively negligible for this project's scale.

### What the spend cap actually protects against

The spend cap (when enabled) caps monthly spend at the plan's included amount by **throttling your project into read-only or unresponsive state** when you exceed quotas rather than charging for over-usage. It exists to protect against:

- **Runaway data uploads** — a bug that causes infinite file writes
- **Public API scraping** — someone hammering your API causing bandwidth blowup
- **Infinite loops** — a misconfigured job making unbounded database writes
- **Compute spikes** — a query going rogue and consuming massive CPU/memory for hours
- **Bot/crawler traffic** — unexpected massive visitor traffic

**For DataWiseRE specifically:**
- Single user (Dan)
- No public-facing data-heavy API
- Deliberate writes from the screening engine, bounded by batch size
- No user-uploaded content
- All access gated behind auth

The risk of runaway over-usage is **low**. The cost of accepting that risk (removing the spend cap) is **near-zero** for disk. The benefit of accepting it (no throttling during legitimate bulk operations) is **high**. That's why the spend cap was removed on 2026-04-10.

### Other over-usage categories (verify before assuming they're zero)

Disk is not the only thing Supabase charges over-usage on. Always check the current Supabase pricing page for these:

| Category | What it measures | Why DataWiseRE might care |
|---|---|---|
| **Bandwidth / egress** | Data sent out of Supabase | Low risk — single user, no public API |
| **Compute hours** | Hours your compute tier runs | This is your base $9.68/month, not over-usage — you pay for it regardless |
| **Monthly active users (MAU)** | Unique Supabase Auth users per month | Low risk until Phase 1 Step 4 partner portal goes live |
| **Database size** | Total logical database size (separate from disk) | May overlap with disk, worth checking |
| **Storage objects** | Files in Supabase Storage | Not used by DataWiseRE |
| **Realtime messages** | Realtime subscription messages | Will become relevant in Phase 1 Step 4 (partner portal uses Realtime) |
| **Edge function invocations** | Serverless function calls | Not used by DataWiseRE |

**Action item:** periodically review the Supabase project's usage page to confirm these other categories aren't trending toward limits. Especially after Phase 1 Step 4 ships (which introduces partner sessions and Realtime subscriptions).

---

## 6. Compute tier comparison

Compute is a separate concern from disk and over-usage. Your compute tier determines **how fast** your project can do things — it doesn't directly cause over-usage charges (it's a fixed-cost base). But compute size massively affects:

- Query response times
- Index build performance
- Autovacuum throughput
- Concurrent connection capacity
- Memory available for sort/hash operations
- Ability to handle spikes without queueing

### Approximate pricing (verify on Supabase's current compute page)

| Tier | Specs | Hourly | Monthly |
|---|---|---|---|
| **Micro** (current) | 1 GB RAM, 2-core ARM | ~$0.01344/hr | ~$9.68/mo |
| **Small** | 2 GB RAM, 2 cores | ~$0.0206/hr | ~$14.83/mo |
| **Medium** | 4 GB RAM, 2 cores | ~$0.0822/hr | ~$59.18/mo |
| **Large** | 8 GB RAM, 2 cores | ~$0.1517/hr | ~$109.22/mo |

### What's limiting DataWiseRE on micro?

Based on the Step 2 backfill incident:
- **Memory (1 GB)** is very tight for operations that need sort buffers, hash joins, or large indexes. Autovacuum also uses memory; with 1 GB total, there's very little headroom for autovacuum to work efficiently while other queries are running.
- **2 ARM cores** are fine for single-user workload most of the time, but bulk operations (screening runs, backfills, index builds) benefit from more parallelism.

### When to upgrade?

Consider upgrading compute (probably to Small as a first step) when:

- Autovacuum is chronically falling behind (disk usage keeps climbing without obvious cause)
- Large operations (screening runs, backfills) take noticeably longer than they used to
- The Workstation or comp modal feels sluggish under normal use
- You hit another resource exhaustion incident like 2026-04-10
- You onboard additional analysts (more concurrent sessions)
- You add background jobs or cron tasks
- Phase 1 Step 4 ships and partner sessions start accumulating

**Upgrading to Small (~$5/month more) is the cheapest lever available** if the project feels resource-constrained. Medium is a bigger jump both in cost and capability — probably overkill for Phase 1 but worth considering in Phase 2+ if the user base grows.

---

## 7. Early warning signs to watch for

Monitor these indicators and act before they become incidents:

### Disk usage

- **> 70% used:** pay attention
- **> 80% used:** consider archiving old data or upgrading disk quota
- **> 90% used:** auto-scale will fire at next cooldown window; expect temporary degradation
- **> 95% used:** likely in trouble; writes may be throttled imminently

### Compute

- **Query times climbing** on operations that used to be fast (e.g., screening queue taking >2 seconds to load)
- **Workstation feels sluggish** on the comp map or deal math panels
- **Import batches taking noticeably longer** than previous imports of similar size

### Autovacuum

- Easiest signal: disk usage **not dropping** after a bulk operation even hours later
- Check `pg_stat_all_tables` for high `n_dead_tup` counts on the big tables
- If autovacuum is chronically behind, the fix is usually more RAM (compute upgrade) — autovacuum is memory-bound

### Other

- **Spike in CLI errors** like `25006 read-only transaction` — project is in distress
- **Supabase dashboard notifications** about resource exhaustion
- **Unexpected charges** — check the billing dashboard monthly, especially after flipping the spend cap off

---

## 8. Future considerations for data lifecycle

The current architecture keeps **every comparable candidate from every screening run forever**. This is why `comparable_search_candidates` has 737k rows despite the property count being ~66k. Every property has been screened multiple times as new data arrives, and every screening run generates candidates.

**This is not sustainable indefinitely.** At the current growth rate:

- Each new property added contributes ~10-20 new candidates per screening run
- Re-screening accumulates candidates over time
- Over 1-2 years, the candidates table could grow to several million rows

**Options for managing this** (not urgent, flagged for future consideration):

### Option A — Archive old candidates
- Move candidates older than (say) 90 days to a `comparable_search_candidates_archive` table
- Archive table lives in the same database or is periodically dumped to object storage
- Active table stays small; historical lookups go to archive
- Pros: simple to implement, reversible
- Cons: slightly more complex queries for historical analysis

### Option B — Prune candidates from superseded runs
- When a property is re-screened, the old screening run is marked `superseded_by` (already in the schema)
- A periodic job deletes candidates from runs that have been superseded for more than X days
- Pros: keeps only "current" candidate sets
- Cons: loses historical comp selection data (which might matter for partner reconciliation in Phase 4)

### Option C — Aggressive partitioning
- Partition `comparable_search_candidates` by month or by screening batch
- Old partitions become candidates for archival or dropping
- Pros: native Postgres feature, query planner handles it efficiently
- Cons: requires schema work to set up

### Option D — Do nothing, just add more disk
- Disk is cheap at over-usage rates (~$0.12/GB-month)
- Let the table grow; pay the small over-usage fee
- Pros: zero engineering work
- Cons: queries get slower as the table grows; vacuum pressure stays high; eventually hits compute limits

**Recommendation:** Option D for now (Phase 1). Revisit in Phase 2 if either query performance becomes noticeably bad OR the over-usage cost crosses some threshold (e.g., >$10/month). Option A is the cleanest long-term solution and should probably be implemented in Phase 2-3.

---

## 9. Incident recovery playbook

If another resource exhaustion incident happens, follow these steps:

1. **Don't panic.** Data is almost certainly fine — Postgres is ACID-safe even under resource pressure.
2. **Check the Supabase dashboard notification** for the specific resource that's exhausted (disk, CPU, memory, connections).
3. **Check the cooldown timer** if disk-related — auto-scale may be locked out for up to 4 hours.
4. **Don't push migrations or run heavy queries** during the exhaustion window. Each additional write makes MVCC bloat worse.
5. **Let autovacuum work.** Shut down the dev server if possible to reduce load and give autovacuum a clear runway.
6. **Wait for the cooldown** if disk-related. Supabase will auto-scale when the timer expires if usage is still above threshold.
7. **After recovery:** verify in the dashboard that disk usage has dropped, CLI commands work again, and the application responds normally before resuming any migrations or bulk operations.
8. **Post-mortem:** update this document with anything learned from the incident.

---

## 10. Open decisions / things to revisit

Track these as Phase 1 progresses. Update this document as they're resolved.

- [ ] **Compute tier upgrade** — consider moving from Micro to Small (~$5/month more) if the project feels constrained during future bulk operations
- [ ] **Data lifecycle strategy** — decide on archiving/pruning approach for `comparable_search_candidates` by end of Phase 1 or early Phase 2
- [ ] **Disk quota headroom** — after Phase 1 Step 2 completes and autovacuum catches up, verify steady-state disk usage and decide whether to increase the allocated disk quota proactively
- [ ] **Verify other over-usage categories** are still at zero after Phase 1 Step 4 partner portal ships (especially Realtime messages and MAUs)
- [ ] **Monitor monthly bill** — check for the first 2-3 months after spend cap removal to confirm over-usage charges are in the expected $0-$2 range

---

## 11. Reference links (verify current URLs)

I can't fetch live Supabase documentation, but these are the typical references:

- Supabase pricing: https://supabase.com/pricing
- Supabase compute add-ons: https://supabase.com/docs/guides/platform/compute-add-ons
- Supabase database size and disk: https://supabase.com/docs/guides/platform/database-size
- Spend cap documentation: https://supabase.com/docs/guides/platform/spend-cap
- Postgres MVCC and VACUUM: https://www.postgresql.org/docs/current/mvcc.html
- Supabase project usage page: dashboard.supabase.com → your project → Settings → Usage

---

*This document should be updated whenever plan, compute, spend cap, or storage strategy changes, or when a new usage incident teaches something worth remembering.*

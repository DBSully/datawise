# Phase 1 — Step 2 — RLS Scaffolding

> **Goal:** Replace the temporary "dev authenticated full access" RLS policies on every existing table with proper organization-scoped policies, without breaking any existing analyst workflow.
> **Status:** DRAFT — awaiting Dan's review before execution
> **Authority:** Implementation against `WORKSTATION_CARD_SPEC.md` (locked) + `DataWiseRE_Restructure_Plan.md` § 5 Phase 1 Step 2 + completion of `PHASE1_STEP1_IMPLEMENTATION.md`
> **Date:** 2026-04-10
> **Estimated scope:** 5 SQL migrations covering 22 tables and 13 views, 0 modifications to existing application code (if all goes well)
> **Risk level:** HIGH — this is the riskiest milestone in Phase 1. Read §3 carefully.

---

## 1. What Step 2 Accomplishes

Step 2 takes the auth/profiles foundation built in Step 1 and uses it to lock down data access at the database level. Specifically:

1. **Adds an `organization_id` column to every existing core table** (22 tables total). This is the multi-tenancy primitive that scopes every row to one organization. Even though only one org exists today (DataWiseRE), this column is what every future query will filter on.

2. **Backfills every existing row** with the DataWiseRE org id so nothing gets orphaned.

3. **Replaces all 22 "dev authenticated full access" RLS policies** with proper org-scoped policies that allow each user to read/write only rows belonging to their own organization. From this point forward, an external user (when one exists) cannot accidentally see another org's data.

4. **Recreates all 13 views with `security_invoker = true`** so they respect the calling user's RLS policies instead of bypassing them.

5. **Adds a helper function** `public.current_user_organization_id()` that resolves the current user's org id once and lets every RLS policy reference it cleanly.

**Step 2 explicitly does NOT do these things — they belong to later steps:**

| Out of scope | Belongs to |
|---|---|
| Route restructure (`/deals/watchlist` → `/analysis`, etc.) | Step 3 — Route Restructure |
| Building the new Workstation card layout | Step 3 — Route Restructure |
| `analysis_shares`, `partner_analysis_versions`, `partner_feedback` tables | Step 4 — Partner Portal MVP |
| RLS policies for partner-side access (sharing scoped reads) | Step 4 — Partner Portal MVP |
| Removing the layout-level auth check at `app/(workspace)/layout.tsx:16` | After Step 3 proves proxy enforcement in production use |
| Auditing existing SQL functions for SECURITY DEFINER bypass concerns | Light audit included here as a verification step; deeper audit deferred to Step 3 |
| Application code changes to set `organization_id` on inserts | NOT NEEDED — column DEFAULT handles this automatically (see §4.3) |

---

## 2. The #1 Constraint (Same as Step 1, Even More Important Here)

**Every existing analyst workflow must keep working unchanged.** Dan is the only user, the application is in active production use, and Step 2 is the highest-risk milestone in Phase 1 because it changes the data access path for *every query the application makes*. A bug in any RLS policy could either:

- **Silently hide data** (Dan opens the watch list and sees nothing — looks like a regression)
- **Block writes** (Dan tries to save manual analysis overrides and gets a permission error)
- **Cause confusing errors** (a query returns rows but a JOINed query returns nothing because of inconsistent RLS evaluation)

The mitigation is conservative migration ordering, defensive patterns in every policy, and thorough verification at each checkpoint.

---

## 3. Risk & Rollback

### 3.1 The risk model

Step 2 has five migrations. The risk profile is **front-loaded onto Migration 4** (the policy switch). Until Migration 4 runs, the dev policies are still in effect and the app behaves exactly as before — even though new columns and constraints exist on the tables.

| Migration | Risk | What can go wrong |
|---|---|---|
| 1 — Helper function + nullable columns | Low | Function syntax error blocks subsequent migrations; otherwise additive |
| 2 — Backfill | Low-Medium | Wrong org id assigned (only one org exists, so unlikely); query timeout on a huge table |
| 3 — NOT NULL + FK + DEFAULT | Low-Medium | NOT NULL constraint fails if any row missed in backfill; FK fails if profiles/organizations table inconsistency |
| **4 — Policy switch** | **HIGH** | New policies too strict (Dan locked out); new policies too loose (data exposed); helper function returns NULL; subtle RLS interaction with views or functions |
| 5 — Views | Medium | View recreation might fail if a column reference is wrong; security_invoker change might surface latent bugs in view definitions |

### 3.2 Rollback procedures

**Rollback after Migration 1, 2, or 3:**
- Drop the added columns: `ALTER TABLE <table> DROP COLUMN organization_id` (one per table)
- Drop the helper function: `DROP FUNCTION public.current_user_organization_id()`
- Application is unaffected because the dev policies are still in effect

**Rollback after Migration 4 (the dangerous one):**
- Drop the new org-scoped policies and recreate the dev policies
- This should be a single SQL script kept ready BEFORE Migration 4 runs
- Application returns to Step 1 state immediately
- A "Migration 4 rollback" SQL script is included in §10 of this plan for fast access

**Rollback after Migration 5 (views):**
- Drop and recreate views without `security_invoker = true`
- Existing view migrations can be re-run to restore the original definitions
- Application falls back to bypassing RLS in views (the Step 1 behavior for views)

**Catastrophic rollback (everything broken, fast revert needed):**
- `git checkout phase1-step1-complete` to restore application code to Step 1 state
- Run a "drop all Step 2 schema additions" SQL script (included in §10)
- The result is identical to the post-Step-1 state

### 3.3 Pre-flight checks before Migration 4

Before pushing the policy switch, I will verify:

1. Helper function returns the expected org id for Dan: `SELECT public.current_user_organization_id();` should return DataWiseRE's UUID
2. All 22 tables have non-null org_id on every row: a single CTE query that counts NULL rows per table — every row should be 0
3. Dan's profile is intact and points at the right org: confirmed in Step 1 verification
4. The Migration 4 rollback script is saved locally and ready to apply

---

## 4. Schema Design

Five SQL migrations applied in sequence. Each is independently testable.

### 4.1 Migration 1 — Helper function + add nullable `organization_id` columns

**File:** `supabase/migrations/<ts>_step2_helper_and_columns.sql`

**Helper function:**

```sql
-- Returns the current authenticated user's organization id by reading
-- their profile. STABLE because the result doesn't change within a query.
-- SECURITY DEFINER to skip RLS on profiles (the caller may not be able to
-- read other profiles, but they can always read their own row's org id).
CREATE OR REPLACE FUNCTION public.current_user_organization_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT organization_id FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$$;

COMMENT ON FUNCTION public.current_user_organization_id() IS
  'Returns the organization_id for the current authenticated user. '
  'Used by RLS policies to scope queries to the user''s own org. '
  'STABLE + SECURITY DEFINER for performance and to bypass profiles RLS.';
```

**Add `organization_id` column to all 22 tables (nullable, no FK yet):**

```sql
-- Property layer
ALTER TABLE public.real_properties     ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.property_physical   ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.property_financials ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.mls_listings        ADD COLUMN IF NOT EXISTS organization_id uuid;

-- Import layer
ALTER TABLE public.import_batches      ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.import_batch_files  ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.import_batch_rows   ADD COLUMN IF NOT EXISTS organization_id uuid;

-- Analysis layer
ALTER TABLE public.analyses            ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.manual_analysis     ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.analysis_pipeline   ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.analysis_notes      ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.analysis_showings   ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.analysis_offers     ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.analysis_links      ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.analysis_reports    ADD COLUMN IF NOT EXISTS organization_id uuid;

-- Comparables layer
ALTER TABLE public.comparable_profiles            ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.comparable_search_runs         ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.comparable_search_candidates   ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.comparable_sets                ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.comparable_set_members         ADD COLUMN IF NOT EXISTS organization_id uuid;

-- Screening layer
ALTER TABLE public.screening_batches   ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.screening_results   ADD COLUMN IF NOT EXISTS organization_id uuid;
```

**Verification after Migration 1:**

```sql
-- All 22 tables should have an organization_id column
SELECT table_name, column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND column_name = 'organization_id'
ORDER BY table_name;
-- Expect 22 rows (plus profiles which already had it)
```

### 4.2 Migration 2 — Backfill all rows to DataWiseRE org

**File:** `supabase/migrations/<ts>_step2_backfill_organization_id.sql`

```sql
-- Backfill every existing row to point at the DataWiseRE org.
-- All current data belongs to Dan / DataWiseRE, so this is unambiguous.
-- The query looks up the org by slug to avoid hardcoding the UUID.

DO $$
DECLARE
  v_org_id uuid;
BEGIN
  SELECT id INTO v_org_id FROM public.organizations WHERE slug = 'datawisere' LIMIT 1;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'DataWiseRE organization not found — did Step 1 complete?';
  END IF;

  -- Property layer
  UPDATE public.real_properties     SET organization_id = v_org_id WHERE organization_id IS NULL;
  UPDATE public.property_physical   SET organization_id = v_org_id WHERE organization_id IS NULL;
  UPDATE public.property_financials SET organization_id = v_org_id WHERE organization_id IS NULL;
  UPDATE public.mls_listings        SET organization_id = v_org_id WHERE organization_id IS NULL;

  -- Import layer
  UPDATE public.import_batches      SET organization_id = v_org_id WHERE organization_id IS NULL;
  UPDATE public.import_batch_files  SET organization_id = v_org_id WHERE organization_id IS NULL;
  UPDATE public.import_batch_rows   SET organization_id = v_org_id WHERE organization_id IS NULL;

  -- Analysis layer
  UPDATE public.analyses            SET organization_id = v_org_id WHERE organization_id IS NULL;
  UPDATE public.manual_analysis     SET organization_id = v_org_id WHERE organization_id IS NULL;
  UPDATE public.analysis_pipeline   SET organization_id = v_org_id WHERE organization_id IS NULL;
  UPDATE public.analysis_notes      SET organization_id = v_org_id WHERE organization_id IS NULL;
  UPDATE public.analysis_showings   SET organization_id = v_org_id WHERE organization_id IS NULL;
  UPDATE public.analysis_offers     SET organization_id = v_org_id WHERE organization_id IS NULL;
  UPDATE public.analysis_links      SET organization_id = v_org_id WHERE organization_id IS NULL;
  UPDATE public.analysis_reports    SET organization_id = v_org_id WHERE organization_id IS NULL;

  -- Comparables layer
  UPDATE public.comparable_profiles          SET organization_id = v_org_id WHERE organization_id IS NULL;
  UPDATE public.comparable_search_runs       SET organization_id = v_org_id WHERE organization_id IS NULL;
  UPDATE public.comparable_search_candidates SET organization_id = v_org_id WHERE organization_id IS NULL;
  UPDATE public.comparable_sets              SET organization_id = v_org_id WHERE organization_id IS NULL;
  UPDATE public.comparable_set_members       SET organization_id = v_org_id WHERE organization_id IS NULL;

  -- Screening layer
  UPDATE public.screening_batches SET organization_id = v_org_id WHERE organization_id IS NULL;
  UPDATE public.screening_results SET organization_id = v_org_id WHERE organization_id IS NULL;
END $$;
```

**Verification after Migration 2 (CRITICAL — must run before Migration 3):**

```sql
-- Every table must have ZERO rows with NULL organization_id
WITH counts AS (
  SELECT 'real_properties'              AS t, count(*) FILTER (WHERE organization_id IS NULL) AS null_count, count(*) AS total FROM public.real_properties
  UNION ALL SELECT 'property_physical',   count(*) FILTER (WHERE organization_id IS NULL), count(*) FROM public.property_physical
  UNION ALL SELECT 'property_financials', count(*) FILTER (WHERE organization_id IS NULL), count(*) FROM public.property_financials
  UNION ALL SELECT 'mls_listings',        count(*) FILTER (WHERE organization_id IS NULL), count(*) FROM public.mls_listings
  UNION ALL SELECT 'import_batches',      count(*) FILTER (WHERE organization_id IS NULL), count(*) FROM public.import_batches
  UNION ALL SELECT 'import_batch_files',  count(*) FILTER (WHERE organization_id IS NULL), count(*) FROM public.import_batch_files
  UNION ALL SELECT 'import_batch_rows',   count(*) FILTER (WHERE organization_id IS NULL), count(*) FROM public.import_batch_rows
  UNION ALL SELECT 'analyses',            count(*) FILTER (WHERE organization_id IS NULL), count(*) FROM public.analyses
  UNION ALL SELECT 'manual_analysis',     count(*) FILTER (WHERE organization_id IS NULL), count(*) FROM public.manual_analysis
  UNION ALL SELECT 'analysis_pipeline',   count(*) FILTER (WHERE organization_id IS NULL), count(*) FROM public.analysis_pipeline
  UNION ALL SELECT 'analysis_notes',      count(*) FILTER (WHERE organization_id IS NULL), count(*) FROM public.analysis_notes
  UNION ALL SELECT 'analysis_showings',   count(*) FILTER (WHERE organization_id IS NULL), count(*) FROM public.analysis_showings
  UNION ALL SELECT 'analysis_offers',     count(*) FILTER (WHERE organization_id IS NULL), count(*) FROM public.analysis_offers
  UNION ALL SELECT 'analysis_links',      count(*) FILTER (WHERE organization_id IS NULL), count(*) FROM public.analysis_links
  UNION ALL SELECT 'analysis_reports',    count(*) FILTER (WHERE organization_id IS NULL), count(*) FROM public.analysis_reports
  UNION ALL SELECT 'comparable_profiles', count(*) FILTER (WHERE organization_id IS NULL), count(*) FROM public.comparable_profiles
  UNION ALL SELECT 'comparable_search_runs',       count(*) FILTER (WHERE organization_id IS NULL), count(*) FROM public.comparable_search_runs
  UNION ALL SELECT 'comparable_search_candidates', count(*) FILTER (WHERE organization_id IS NULL), count(*) FROM public.comparable_search_candidates
  UNION ALL SELECT 'comparable_sets',              count(*) FILTER (WHERE organization_id IS NULL), count(*) FROM public.comparable_sets
  UNION ALL SELECT 'comparable_set_members',       count(*) FILTER (WHERE organization_id IS NULL), count(*) FROM public.comparable_set_members
  UNION ALL SELECT 'screening_batches', count(*) FILTER (WHERE organization_id IS NULL), count(*) FROM public.screening_batches
  UNION ALL SELECT 'screening_results', count(*) FILTER (WHERE organization_id IS NULL), count(*) FROM public.screening_results
)
SELECT t, null_count, total
FROM counts
ORDER BY null_count DESC, t;
-- Every row should show null_count = 0
```

If any row has `null_count > 0`, **STOP** — do not proceed to Migration 3. Investigate and re-run the backfill targeting the missing rows.

### 4.3 Migration 3 — NOT NULL + FK + DEFAULT

**File:** `supabase/migrations/<ts>_step2_constrain_organization_id.sql`

```sql
-- Add NOT NULL constraint, foreign key, and DEFAULT to organization_id
-- on every table. The DEFAULT references current_user_organization_id()
-- so application INSERTs without explicit org_id automatically pick up
-- the calling user's org. This means NO application code changes are
-- required — all existing INSERT statements continue to work.

-- Property layer
ALTER TABLE public.real_properties
  ALTER COLUMN organization_id SET NOT NULL,
  ALTER COLUMN organization_id SET DEFAULT public.current_user_organization_id(),
  ADD CONSTRAINT real_properties_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;

ALTER TABLE public.property_physical
  ALTER COLUMN organization_id SET NOT NULL,
  ALTER COLUMN organization_id SET DEFAULT public.current_user_organization_id(),
  ADD CONSTRAINT property_physical_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;

-- ... [and so on for the remaining 20 tables]
-- (full migration body included in implementation; pattern is identical for every table)

-- Indexes for organization_id on every table — critical for RLS query performance
CREATE INDEX IF NOT EXISTS real_properties_organization_id_idx     ON public.real_properties(organization_id);
CREATE INDEX IF NOT EXISTS property_physical_organization_id_idx   ON public.property_physical(organization_id);
CREATE INDEX IF NOT EXISTS property_financials_organization_id_idx ON public.property_financials(organization_id);
-- ... [and so on for remaining 19 tables]
```

The actual migration file will have the full pattern repeated for all 22 tables. I'm abbreviating here for plan readability.

**Why NOT NULL + DEFAULT is the magic combination:**

- **NOT NULL** ensures no row can be inserted without an org_id
- **DEFAULT current_user_organization_id()** auto-populates the column on INSERT if the application doesn't specify it
- Together: existing application code continues to work unchanged. INSERT statements that don't mention `organization_id` get the calling user's org id automatically. No application code rewrites needed.

**Why ON DELETE RESTRICT:** if someone tries to delete the DataWiseRE org while data exists, the DELETE fails. This prevents accidental data orphaning. Step 4 (multi-org provisioning) might revisit this with a softer cascade pattern.

**Why dedicated indexes on organization_id:** every RLS policy filters by `organization_id = current_user_organization_id()`. Without an index, these are full table scans on every query. With an index, they're fast.

**Verification after Migration 3:**

```sql
-- All 22 tables should have NOT NULL constraints on organization_id
SELECT table_name, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND column_name = 'organization_id'
ORDER BY table_name;
-- Every row should show is_nullable = 'NO'

-- All 22 tables should have a FK to organizations
SELECT tc.table_name, tc.constraint_name
FROM information_schema.table_constraints tc
JOIN information_schema.constraint_column_usage ccu
  ON tc.constraint_name = ccu.constraint_name
WHERE tc.table_schema = 'public'
  AND tc.constraint_type = 'FOREIGN KEY'
  AND ccu.table_name = 'organizations'
  AND ccu.column_name = 'id';
-- Expect 23 rows (22 core tables + profiles)

-- All 22 tables should have an index on organization_id
SELECT tablename, indexname
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname LIKE '%organization_id_idx'
ORDER BY tablename;
-- Expect at least 22 rows
```

### 4.4 Migration 4 — Switch policies (THE DANGEROUS ONE)

**File:** `supabase/migrations/<ts>_step2_switch_policies_to_org_scoped.sql`

```sql
-- Drop all dev policies and replace with org-scoped policies.
-- This is the moment when access switches from "any authenticated user
-- sees everything" to "users only see their own org's data".
--
-- Rollback: see PHASE1_STEP2_IMPLEMENTATION.md §10 for the rollback SQL.

-- ────────────────────────────────────────────────────────────────────
-- Drop existing dev policies
-- ────────────────────────────────────────────────────────────────────

-- Note: comparable_* tables still have policies named after the old
-- valuation_* names because the policies were created BEFORE the
-- table rename. Postgres attached them to the renamed tables but the
-- policy names still reference the old names.

DROP POLICY IF EXISTS "dev authenticated full access real_properties"      ON public.real_properties;
DROP POLICY IF EXISTS "dev authenticated full access property_physical"    ON public.property_physical;
DROP POLICY IF EXISTS "dev authenticated full access property_financials"  ON public.property_financials;
DROP POLICY IF EXISTS "dev authenticated full access mls_listings"         ON public.mls_listings;

DROP POLICY IF EXISTS "dev authenticated full access import_batches"       ON public.import_batches;
DROP POLICY IF EXISTS "dev authenticated full access import_batch_files"   ON public.import_batch_files;
DROP POLICY IF EXISTS "dev authenticated full access import_batch_rows"    ON public.import_batch_rows;

DROP POLICY IF EXISTS "dev authenticated full access analyses"             ON public.analyses;
DROP POLICY IF EXISTS "dev authenticated full access manual_analysis"      ON public.manual_analysis;
DROP POLICY IF EXISTS "dev authenticated full access analysis_pipeline"    ON public.analysis_pipeline;
DROP POLICY IF EXISTS "dev authenticated full access analysis_notes"       ON public.analysis_notes;
DROP POLICY IF EXISTS "dev authenticated full access analysis_showings"    ON public.analysis_showings;
DROP POLICY IF EXISTS "dev authenticated full access analysis_offers"      ON public.analysis_offers;
DROP POLICY IF EXISTS "dev authenticated full access analysis_links"       ON public.analysis_links;
DROP POLICY IF EXISTS "dev authenticated full access analysis_reports"     ON public.analysis_reports;

-- Comparable tables: drop the legacy "valuation" named policies AND any
-- "comparable" named ones in case the rename migration created new ones
DROP POLICY IF EXISTS "dev authenticated full access valuation_profiles"        ON public.comparable_profiles;
DROP POLICY IF EXISTS "dev authenticated full access valuation_runs"            ON public.comparable_search_runs;
DROP POLICY IF EXISTS "dev authenticated full access valuation_run_candidates"  ON public.comparable_search_candidates;
DROP POLICY IF EXISTS "dev authenticated full access comparable_profiles"       ON public.comparable_profiles;
DROP POLICY IF EXISTS "dev authenticated full access comparable_search_runs"    ON public.comparable_search_runs;
DROP POLICY IF EXISTS "dev authenticated full access comparable_search_candidates" ON public.comparable_search_candidates;
DROP POLICY IF EXISTS "dev authenticated full access comparable_sets"           ON public.comparable_sets;
DROP POLICY IF EXISTS "dev authenticated full access comparable_set_members"    ON public.comparable_set_members;

DROP POLICY IF EXISTS "dev authenticated full access screening_batches"  ON public.screening_batches;
DROP POLICY IF EXISTS "dev authenticated full access screening_results"  ON public.screening_results;

-- ────────────────────────────────────────────────────────────────────
-- Add new org-scoped policies (4 per table: SELECT/INSERT/UPDATE/DELETE)
-- ────────────────────────────────────────────────────────────────────

-- Policy pattern (repeated for each table):
--
--   "<table>_org_select"  → SELECT  USING (organization_id = current_user_organization_id())
--   "<table>_org_insert"  → INSERT  WITH CHECK (organization_id = current_user_organization_id())
--   "<table>_org_update"  → UPDATE  USING (...) WITH CHECK (...)
--   "<table>_org_delete"  → DELETE  USING (...)
--
-- Why four policies instead of one FOR ALL: granular permissions are
-- easier to audit and easier to relax later (e.g., partners might get
-- SELECT but not UPDATE on certain tables in Step 4).

-- real_properties
CREATE POLICY "real_properties_org_select" ON public.real_properties
  FOR SELECT TO authenticated
  USING (organization_id = public.current_user_organization_id());

CREATE POLICY "real_properties_org_insert" ON public.real_properties
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.current_user_organization_id());

CREATE POLICY "real_properties_org_update" ON public.real_properties
  FOR UPDATE TO authenticated
  USING (organization_id = public.current_user_organization_id())
  WITH CHECK (organization_id = public.current_user_organization_id());

CREATE POLICY "real_properties_org_delete" ON public.real_properties
  FOR DELETE TO authenticated
  USING (organization_id = public.current_user_organization_id());

-- ... [pattern repeats for all 22 tables — 88 CREATE POLICY statements total]
```

The actual migration file repeats this 4-policy pattern for all 22 tables (88 policies total). Pattern is mechanical and identical for every table.

**Verification after Migration 4 (CRITICAL — manual workflow test required):**

```sql
-- All 22 tables should have exactly 4 policies, all org-scoped
SELECT
  schemaname,
  tablename,
  count(*) AS policy_count,
  string_agg(policyname, ', ' ORDER BY policyname) AS policies
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'real_properties', 'property_physical', 'property_financials', 'mls_listings',
    'import_batches', 'import_batch_files', 'import_batch_rows',
    'analyses', 'manual_analysis', 'analysis_pipeline', 'analysis_notes',
    'analysis_showings', 'analysis_offers', 'analysis_links', 'analysis_reports',
    'comparable_profiles', 'comparable_search_runs', 'comparable_search_candidates',
    'comparable_sets', 'comparable_set_members',
    'screening_batches', 'screening_results'
  )
GROUP BY schemaname, tablename
ORDER BY tablename;
-- Every row should show policy_count = 4 with org_select/org_insert/org_update/org_delete

-- And confirm no "dev authenticated full access" policies remain
SELECT count(*) AS dev_policies_remaining
FROM pg_policies
WHERE schemaname = 'public'
  AND policyname LIKE 'dev authenticated full access%';
-- Should return 0
```

**Then immediately switch to manual workflow verification** — see §8 for the full checklist. This is the moment to test EVERY analyst workflow with the dev server running. If anything breaks, run the rollback in §10.

### 4.5 Migration 5 — Recreate views with `security_invoker = true`

**File:** `supabase/migrations/<ts>_step2_views_security_invoker.sql`

By default, Postgres views run with the privileges of the view's owner — bypassing the calling user's RLS policies. To make views respect RLS, we recreate each one with `WITH (security_invoker = true)`.

```sql
-- Recreate every view with security_invoker = true so it respects
-- the calling user's RLS policies. The view definitions themselves
-- don't change — only the security_invoker flag.
--
-- Why this works: with security_invoker on, when Dan queries
-- analysis_queue_v, the underlying SELECT joins (real_properties,
-- screening_results, etc.) all run with Dan's RLS. Since all those
-- tables have org_select policies, the view automatically returns
-- only DataWiseRE rows. No view-level filter needed.

ALTER VIEW public.analysis_queue_v               SET (security_invoker = true);
ALTER VIEW public.watch_list_v                   SET (security_invoker = true);
ALTER VIEW public.pipeline_v                     SET (security_invoker = true);
ALTER VIEW public.closed_deals_v                 SET (security_invoker = true);
ALTER VIEW public.dashboard_pipeline_summary_v   SET (security_invoker = true);
ALTER VIEW public.daily_activity_v               SET (security_invoker = true);
ALTER VIEW public.import_outcomes_v              SET (security_invoker = true);
ALTER VIEW public.import_batch_progress_v        SET (security_invoker = true);
ALTER VIEW public.property_browser_v             SET (security_invoker = true);
ALTER VIEW public.property_city_options_v        SET (security_invoker = true);
ALTER VIEW public.property_status_options_v      SET (security_invoker = true);
ALTER VIEW public.property_type_options_v        SET (security_invoker = true);
ALTER VIEW public.mls_status_counts_v            SET (security_invoker = true);
```

**Why ALTER VIEW SET instead of dropping and recreating:** `ALTER VIEW ... SET (security_invoker = true)` is a simple metadata change that preserves the view definition and any dependent objects. Dropping and recreating would invalidate any code that references the view by oid.

**Verification after Migration 5:**

```sql
-- All 13 views should have security_invoker = true
SELECT
  schemaname,
  viewname,
  CASE WHEN ('security_invoker=true' = ANY(c.reloptions)) THEN 'true' ELSE 'false' END AS security_invoker
FROM pg_views v
JOIN pg_class c ON c.relname = v.viewname
JOIN pg_namespace n ON c.relnamespace = n.oid AND n.nspname = v.schemaname
WHERE schemaname = 'public'
  AND viewname IN (
    'analysis_queue_v', 'watch_list_v', 'pipeline_v', 'closed_deals_v',
    'dashboard_pipeline_summary_v', 'daily_activity_v', 'import_outcomes_v',
    'import_batch_progress_v', 'property_browser_v',
    'property_city_options_v', 'property_status_options_v', 'property_type_options_v',
    'mls_status_counts_v'
  )
ORDER BY viewname;
-- Every row should show security_invoker = true
```

### 4.6 Migration ordering

```
20260410130000_step2_helper_and_columns.sql
20260410130100_step2_backfill_organization_id.sql
20260410130200_step2_constrain_organization_id.sql
20260410130300_step2_switch_policies_to_org_scoped.sql
20260410130400_step2_views_security_invoker.sql
```

Timestamps use 2026-04-10 (today, the same day Step 1 shipped) with the `13xxxx` hour series to place them cleanly after Step 1's `12xxxx` series.

---

## 5. Application Code Changes

**Zero application code changes required for Step 2** — that's the design goal of the `current_user_organization_id()` DEFAULT pattern. Existing INSERT statements continue to work because the column auto-populates.

The only thing that *might* surface application bugs is if some code path assumes it can read or write data across orgs. There is no such code path in the current Phase 1 codebase (Dan is the only user, only one org), but the verification checklist in §8 will catch any unexpected RLS interactions.

**SECURITY DEFINER function audit (per Decision 12.2 — surface in Step 2, fix in Step 3):** there are several SQL functions in the codebase (`count_unscreened_properties`, `get_unscreened_property_ids`, `get_import_batch_property_ids`, `get_daily_scorecard`) that may or may not be SECURITY DEFINER. If any are SECURITY DEFINER, they bypass RLS and could return cross-org results when called from server actions. Step 2 includes a verification query (§8.1) that surfaces them. Findings are documented in the Step 2 CHANGELOG entry as "deferred to Step 3" so they don't get forgotten. The actual `SECURITY INVOKER` conversion (or in-function org filtering) happens during Step 3.

---

## 6. Ordered Task List

Each task is a discrete, verifiable unit. Execute in order. Each task is independently committable.

### Phase A — Schema (5 commits)

**Task 1:** Create `supabase/migrations/<ts>_step2_helper_and_columns.sql` with the SQL from §4.1. Dry-run, push, verify (22 columns added).
- Verification: `SELECT table_name FROM information_schema.columns WHERE column_name = 'organization_id' AND table_schema = 'public'` returns ≥ 22 rows

**Task 2:** Create `supabase/migrations/<ts>_step2_backfill_organization_id.sql` with the SQL from §4.2. Dry-run, push, verify (no NULL org_ids on any table).
- Verification: the CTE query in §4.2 returns 0 in every `null_count` column. **STOP** if anything is non-zero.

**Task 3:** Create `supabase/migrations/<ts>_step2_constrain_organization_id.sql` with the SQL from §4.3. Dry-run, push, verify (NOT NULL + FK + DEFAULT + indexes).
- Verification: the three queries in §4.3 confirm 22 NOT NULL columns, 22 FKs, ≥ 22 indexes

**Task 4:** Create `supabase/migrations/<ts>_step2_switch_policies_to_org_scoped.sql` with the SQL from §4.4. **PAUSE before pushing — confirm rollback script is saved locally** (see §10). Dry-run, push, verify (88 new policies, 0 dev policies remaining).
- Verification: query in §4.4 confirms 4 policies per table, query confirms 0 dev policies remaining
- **Then immediately:** run §8 verification checklist with dev server running. If anything breaks, run rollback from §10.

**Task 5:** Create `supabase/migrations/<ts>_step2_views_security_invoker.sql` with the SQL from §4.5. Dry-run, push, verify (all 13 views have security_invoker = true).
- Verification: query in §4.5 confirms all views

### Phase B — No application code changes

Phase B is empty for Step 2 — no application code needs to change. All RLS work happens at the database layer.

### Phase C — Verification, CHANGELOG, tag (1 commit)

**Task 6:** Run the full §8 verification checklist with the dev server running. Walk through every analyst workflow. Any failure here means rolling back Step 2 and debugging.

**Task 7:** Update `CHANGELOG.md` with a Phase 1 Step 2 entry. Create the Git tag `phase1-step2-complete` once all verification passes. Push everything to origin.

---

## 7. Files Touched

| File | Type | Why |
|---|---|---|
| `supabase/migrations/<ts>_step2_helper_and_columns.sql` | NEW | Helper function + 22 nullable column adds |
| `supabase/migrations/<ts>_step2_backfill_organization_id.sql` | NEW | Backfill all rows to DataWiseRE org |
| `supabase/migrations/<ts>_step2_constrain_organization_id.sql` | NEW | NOT NULL + FK + DEFAULT + indexes for all 22 tables |
| `supabase/migrations/<ts>_step2_switch_policies_to_org_scoped.sql` | NEW | Drop 22 dev policies, add 88 org-scoped policies |
| `supabase/migrations/<ts>_step2_views_security_invoker.sql` | NEW | Recreate all 13 views with security_invoker = true |
| `CHANGELOG.md` | EDIT | Phase 1 Step 2 entry |
| Any application code file | NOT MODIFIED | Step 2 is pure schema work |
| `app/(workspace)/layout.tsx` | NOT MODIFIED | Layout-level auth check stays as defense in depth |
| Any business logic file (screening, analysis engines) | NOT MODIFIED | DEFAULT clause handles org_id for all INSERTs |

---

## 8. Verification Checklist

Run through this manually after Migration 4 (the policy switch). Every box must be checked before declaring Step 2 done.

### 8.1 Database verification (run after each migration via Supabase dashboard SQL editor)

**After Migration 1:**
- [ ] All 22 tables have an `organization_id` column (verification query in §4.1)
- [ ] `current_user_organization_id()` function exists in `pg_proc`

**After Migration 2:**
- [ ] CTE query in §4.2 shows `null_count = 0` for every table
- [ ] `SELECT count(*) FROM real_properties WHERE organization_id IS NULL` returns 0

**After Migration 3:**
- [ ] All 22 tables show `is_nullable = 'NO'` for organization_id
- [ ] All 22 tables have FK to organizations
- [ ] All 22 tables have an organization_id index

**After Migration 4:**
- [ ] Every table has exactly 4 org-scoped policies
- [ ] Zero dev policies remaining
- [ ] `SELECT public.current_user_organization_id();` (run as Dan in the dashboard) returns DataWiseRE's UUID
- [ ] Audit query for SECURITY DEFINER functions in `public` schema:
  ```sql
  SELECT proname, prosecdef
  FROM pg_proc
  WHERE pronamespace = 'public'::regnamespace
    AND prosecdef = true
    AND proname NOT IN ('handle_new_auth_user', 'current_user_organization_id', 'set_updated_at');
  -- Investigate any results — they may bypass RLS
  ```

**After Migration 5:**
- [ ] All 13 views have `security_invoker = true`

### 8.2 Existing analyst workflow verification (THE CRITICAL PART)

These all must work exactly as they did before Step 2. **If any one breaks, do NOT declare Step 2 complete — run the rollback in §10 and debug.**

Run with dev server (`npm run dev`) and signed in as Dan.

**Read paths:**
- [ ] **/home** loads with all daily metrics (unreviewed primes, watch list alerts, pipeline)
- [ ] **/intake/imports** loads, recent batches show expected counts
- [ ] **/screening** loads with the same number of properties as before Step 2
- [ ] **/screening/[batchId]** opens a recent batch, all results visible
- [ ] **/screening/[batchId]/[resultId]** opens a result, comp data renders
- [ ] **/deals/watchlist** loads with all promoted properties
- [ ] **/deals/watchlist/[analysisId]** — Workstation loads, comp map renders, deal math correct, no missing data anywhere on the page
- [ ] **/deals/pipeline** loads
- [ ] **/deals/closed** loads
- [ ] **/reports** loads with all reports
- [ ] **/admin/properties** loads with all properties

**Counts cross-check (run before AND after Step 2 to compare):**
- [ ] `SELECT count(*) FROM real_properties` — same number
- [ ] `SELECT count(*) FROM screening_results` — same number
- [ ] `SELECT count(*) FROM analyses` — same number
- [ ] `SELECT count(*) FROM mls_listings` — same number

**Write paths:**
- [ ] Open a workstation, save manual analysis overrides → values persist on reload
- [ ] Add a note to an analysis → note appears in the list
- [ ] Update pipeline status (interest, showing, offer) → values persist
- [ ] Generate a report → report appears in `/reports`
- [ ] Open the screening modal, toggle a comp's selected state → persists
- [ ] Create a new manual property at `/intake/manual` (or `/admin/properties/new`) → property is created and visible

**Import path (most complex):**
- [ ] Upload a small test CSV at `/intake/imports`
- [ ] Validate the preview shows expected rows
- [ ] Process the batch → rows land in `real_properties` / `mls_listings`
- [ ] Trigger screening on the new properties → results appear
- [ ] **All new rows have `organization_id` set to DataWiseRE** (this verifies the DEFAULT clause works):
  ```sql
  SELECT count(*) FROM real_properties
  WHERE organization_id IS NULL OR organization_id != (SELECT id FROM organizations WHERE slug = 'datawisere');
  -- Should return 0
  ```

**Browser console & network:**
- [ ] No console errors during normal usage
- [ ] No 401/403/500 errors in the network tab for normal requests
- [ ] Response times haven't degraded noticeably (RLS adds a small overhead but should be sub-millisecond per query)

### 8.3 Security verification

- [ ] Sign out, hit a protected route — still redirects to sign-in (Step 1 proxy still works)
- [ ] Sign in, query a Supabase table from the browser console (if you have a test harness): only DataWiseRE rows return
- [ ] (Optional, if you want to be paranoid) Create a second test user via the Supabase Auth dashboard, sign in as them, hit `/home` — they should see ZERO properties because the auto-create-profile trigger gives them the DataWiseRE org by default... wait, that's actually a problem for testing isolation. **This test only works if the trigger gives the test user a DIFFERENT org.** Since Step 1's trigger defaults all new users to `datawisere`, you'd need to manually update the test user's profile to a different org first. For Step 2, this isolation test is not strictly required — it becomes essential in Step 4 when partner accounts exist.

---

## 9. Definition of Done

Step 2 is complete when **every box in §8 is checked** AND:

1. All five migration files are committed to `supabase/migrations/`
2. `CHANGELOG.md` has a Phase 1 Step 2 entry
3. The Git tag `phase1-step2-complete` has been created and pushed
4. A short verification note has been left in chat confirming nothing in the existing analyst workflow regressed
5. Counts (real_properties, screening_results, analyses, mls_listings) match pre-Step-2 numbers exactly

---

## 10. Rollback Scripts (Save Before Migration 4)

### 10.1 Migration 4 rollback (the most important one)

If Migration 4 causes any analyst workflow to break, run this in the Supabase dashboard SQL editor immediately to restore the dev policies:

```sql
-- ROLLBACK SCRIPT FOR PHASE 1 STEP 2 MIGRATION 4
-- Restores the "dev authenticated full access" policies on all 22 tables.
-- Run this if Migration 4 breaks anything.

-- Drop the new org-scoped policies (88 total)
DROP POLICY IF EXISTS "real_properties_org_select" ON public.real_properties;
DROP POLICY IF EXISTS "real_properties_org_insert" ON public.real_properties;
DROP POLICY IF EXISTS "real_properties_org_update" ON public.real_properties;
DROP POLICY IF EXISTS "real_properties_org_delete" ON public.real_properties;
-- ... [repeat for all 22 tables]

-- Recreate dev policies (22 total)
CREATE POLICY "dev authenticated full access real_properties"
  ON public.real_properties FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
-- ... [repeat for all 22 tables]
```

The full rollback script will be saved to `supabase/rollback/step2_migration4_rollback.sql` (NOT committed) before Migration 4 runs.

### 10.2 Catastrophic rollback (drop all Step 2 schema additions)

```sql
-- CATASTROPHIC ROLLBACK — drops everything Step 2 added.
-- Use only if Step 2 needs to be entirely reverted.

-- Drop new policies (88 total) — see §10.1
-- Recreate dev policies — see §10.1

-- Reset views to non-security_invoker
ALTER VIEW public.analysis_queue_v               SET (security_invoker = false);
-- ... [repeat for all 13 views]

-- Drop indexes
DROP INDEX IF EXISTS public.real_properties_organization_id_idx;
-- ... [repeat for all 22 tables]

-- Drop FKs and NOT NULL constraints
ALTER TABLE public.real_properties
  DROP CONSTRAINT IF EXISTS real_properties_organization_id_fkey,
  ALTER COLUMN organization_id DROP NOT NULL,
  ALTER COLUMN organization_id DROP DEFAULT;
-- ... [repeat for all 22 tables]

-- Drop the organization_id columns
ALTER TABLE public.real_properties DROP COLUMN IF EXISTS organization_id;
-- ... [repeat for all 22 tables]

-- Drop the helper function
DROP FUNCTION IF EXISTS public.current_user_organization_id();
```

After running the catastrophic rollback, the database returns to the post-Step-1 state. Then `git revert` the Step 2 commits to bring application code in line.

---

## 11. What Step 3 Builds On Top

Step 2 is the foundation for everything in Phase 1 Steps 3 and 4. After Step 2:

- **Step 3 (Route Restructure)** can move the Workstation to `/analysis/[analysisId]` and start building the new card layout per `WORKSTATION_CARD_SPEC.md`. RLS is in place, so the new routes inherit the same data scoping automatically — no per-route auth code needed.
- **Step 4 (Partner Portal MVP)** can add `analysis_shares`, `partner_analysis_versions`, and `partner_feedback` tables with their own RLS policies that join to `analysis_shares` to determine visibility. The org-scoping foundation makes the partner-side policies straightforward to add on top.

---

## 12. Open Questions — RESOLVED

### 12.1 Org scoping for `comparable_profiles`

Currently the plan org-scopes `comparable_profiles` like every other table. But conceptually, comparable profiles (like `DENVER_FLIP_V1`) are *templates* — they could be shared across orgs in the same market. There are three options:

- **(a) Org-scoped (the current plan)** — every org has their own copy. DataWiseRE owns `DENVER_FLIP_V1`. A future "Phoenix Flips Inc" org would need to define their own `PHOENIX_FLIP_V1`. Simple, isolated, but requires duplication.
- **(b) Two-tier (system + org)** — system profiles are shared globally (organization_id is NULL), org profiles are private. RLS reads BOTH the user's org rows AND the system rows. More flexible, supports a "marketplace" of shared profiles, but adds complexity.
- **(c) Defer the decision** — keep them org-scoped for now (Phase 1), revisit if/when a second org joins.

*My recommendation: (c). Phase 1 has one org, the simplest model is fine. We can refactor to two-tier later when there's a real second org and we know what they need.*

🟢 **DECIDED 12.1 — (c) Defer.** Keep `comparable_profiles` org-scoped like every other table. Revisit two-tier (system + org) only when a real second org joins.

### 12.2 SECURITY DEFINER function audit

Earlier exploration mentioned several SQL functions in the schema:
- `count_unscreened_properties(text[])`
- `get_unscreened_property_ids(text[])`
- `get_import_batch_property_ids(uuid)`
- `get_daily_scorecard(int)`

If any of these are `SECURITY DEFINER`, they bypass RLS and could return cross-org results when called from server actions. The plan includes a verification query in §8.1 that surfaces them. Two options for handling whatever it finds:

- **(a) Audit + fix as part of Step 2** — if any are SECURITY DEFINER, either make them SECURITY INVOKER OR add explicit org filtering inside the function body. Adds work to Step 2 but keeps the security model consistent.
- **(b) Audit in Step 2, fix in Step 3** — surface the issue during Step 2 verification but defer the actual fix to a follow-up commit. Lets Step 2 ship faster.

*My recommendation: (a) — fix in Step 2 if any are found. Leaving SECURITY DEFINER functions that bypass RLS is the kind of subtle bug that causes problems six months later.*

🟢 **DECIDED 12.2 — (b) Audit in Step 2, fix in Step 3.** Surface any SECURITY DEFINER functions during Step 2 verification but defer the actual fix to a follow-up commit during Step 3. The audit query in §8.1 stays in place; findings will be captured in the Step 2 CHANGELOG entry as "deferred to Step 3" so they don't get forgotten. Implication for §5: the application code changes section note about SECURITY DEFINER audit is updated to reflect deferred-fix posture.

### 12.3 Sub-step decomposition

Step 2 as written does the policy switch for all 22 tables in one Migration 4. The alternative is to do it in groups:

- Group 1: Property layer (4 tables) → commit + verify
- Group 2: Import layer (3 tables) → commit + verify
- Group 3: Analysis layer (8 tables) → commit + verify
- Group 4: Comparables layer (5 tables) → commit + verify
- Group 5: Screening layer (2 tables) → commit + verify

This trades five Migration 4 commits for smaller blast radius per group. The cost is verification work — you'd manually test workflows after each group instead of once at the end.

*My recommendation: do all 22 tables in one Migration 4. The risk doesn't reduce meaningfully because the analyst workflows touch tables across all groups (a screening result query joins real_properties + property_physical + mls_listings + screening_results + screening_batches). If one table's policy is broken, the whole workflow fails regardless of which group you committed last. Doing it in one go and verifying once is faster and equally safe.*

🟢 **DECIDED 12.3 — All 22 tables in one Migration 4.** No sub-step decomposition. One commit, one verification pass, one rollback path if needed.

---

*Drafted by Claude Opus | 2026-04-10 | Awaiting Dan's review before execution*

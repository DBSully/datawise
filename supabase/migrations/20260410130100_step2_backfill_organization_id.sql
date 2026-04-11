-- Phase 1 Step 2 — Migration 2 (revised after statement-timeout failure)
--
-- Backfill organization_id on existing rows across all 22 core tables.
--
-- ─── History ───────────────────────────────────────────────────────
-- The original version of this migration wrapped all 22 UPDATEs
-- inside a single DO $$ block. Postgres treats a DO block as ONE
-- statement, so all 22 UPDATEs ran under a single statement_timeout
-- window. With ~52k rows in import_batch_rows plus 21 other tables,
-- the cumulative wall time exceeded the default statement_timeout
-- and the entire transaction was rolled back with SQLSTATE 57014.
--
-- ─── Fix ───────────────────────────────────────────────────────────
-- 1. SET LOCAL statement_timeout = 0 disables the timeout for the
--    duration of this migration's transaction (auto-restored on
--    commit). Belt-and-suspenders against any future scale issues.
-- 2. Each UPDATE is its own top-level statement so Postgres gives
--    each one a fresh statement_timeout window. Even without #1,
--    individual UPDATEs are fast.
-- 3. The DataWiseRE org id is looked up via inline subquery in each
--    UPDATE. Postgres caches the constant lookup, so the repeated
--    subquery has negligible overhead.
-- 4. A small dedicated DO block does the existence check up-front
--    so we still fail loudly if Step 1 didn't ship correctly.

-- Disable statement_timeout for this transaction.
-- Postgres restores the original setting automatically after commit.
SET LOCAL statement_timeout = 0;

-- Pre-flight: fail loudly if DataWiseRE org doesn't exist.
-- This is a tiny single-row lookup, won't hit any timeout.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.organizations WHERE slug = 'datawisere'
  ) THEN
    RAISE EXCEPTION 'DataWiseRE organization (slug = ''datawisere'') not found. Did Phase 1 Step 1 complete?';
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────────────
-- Backfill all 22 tables. Each UPDATE is its own statement.
-- ────────────────────────────────────────────────────────────────────

-- Property layer (4 tables)

UPDATE public.real_properties
SET organization_id = (SELECT id FROM public.organizations WHERE slug = 'datawisere')
WHERE organization_id IS NULL;

UPDATE public.property_physical
SET organization_id = (SELECT id FROM public.organizations WHERE slug = 'datawisere')
WHERE organization_id IS NULL;

UPDATE public.property_financials
SET organization_id = (SELECT id FROM public.organizations WHERE slug = 'datawisere')
WHERE organization_id IS NULL;

UPDATE public.mls_listings
SET organization_id = (SELECT id FROM public.organizations WHERE slug = 'datawisere')
WHERE organization_id IS NULL;

-- Import layer (3 tables — import_batch_rows is the big one, ~52k rows)

UPDATE public.import_batches
SET organization_id = (SELECT id FROM public.organizations WHERE slug = 'datawisere')
WHERE organization_id IS NULL;

UPDATE public.import_batch_files
SET organization_id = (SELECT id FROM public.organizations WHERE slug = 'datawisere')
WHERE organization_id IS NULL;

UPDATE public.import_batch_rows
SET organization_id = (SELECT id FROM public.organizations WHERE slug = 'datawisere')
WHERE organization_id IS NULL;

-- Analysis layer (8 tables)

UPDATE public.analyses
SET organization_id = (SELECT id FROM public.organizations WHERE slug = 'datawisere')
WHERE organization_id IS NULL;

UPDATE public.manual_analysis
SET organization_id = (SELECT id FROM public.organizations WHERE slug = 'datawisere')
WHERE organization_id IS NULL;

UPDATE public.analysis_pipeline
SET organization_id = (SELECT id FROM public.organizations WHERE slug = 'datawisere')
WHERE organization_id IS NULL;

UPDATE public.analysis_notes
SET organization_id = (SELECT id FROM public.organizations WHERE slug = 'datawisere')
WHERE organization_id IS NULL;

UPDATE public.analysis_showings
SET organization_id = (SELECT id FROM public.organizations WHERE slug = 'datawisere')
WHERE organization_id IS NULL;

UPDATE public.analysis_offers
SET organization_id = (SELECT id FROM public.organizations WHERE slug = 'datawisere')
WHERE organization_id IS NULL;

UPDATE public.analysis_links
SET organization_id = (SELECT id FROM public.organizations WHERE slug = 'datawisere')
WHERE organization_id IS NULL;

UPDATE public.analysis_reports
SET organization_id = (SELECT id FROM public.organizations WHERE slug = 'datawisere')
WHERE organization_id IS NULL;

-- Comparables layer (5 tables)

UPDATE public.comparable_profiles
SET organization_id = (SELECT id FROM public.organizations WHERE slug = 'datawisere')
WHERE organization_id IS NULL;

UPDATE public.comparable_search_runs
SET organization_id = (SELECT id FROM public.organizations WHERE slug = 'datawisere')
WHERE organization_id IS NULL;

UPDATE public.comparable_search_candidates
SET organization_id = (SELECT id FROM public.organizations WHERE slug = 'datawisere')
WHERE organization_id IS NULL;

UPDATE public.comparable_sets
SET organization_id = (SELECT id FROM public.organizations WHERE slug = 'datawisere')
WHERE organization_id IS NULL;

UPDATE public.comparable_set_members
SET organization_id = (SELECT id FROM public.organizations WHERE slug = 'datawisere')
WHERE organization_id IS NULL;

-- Screening layer (2 tables — screening_results may be moderately large)

UPDATE public.screening_batches
SET organization_id = (SELECT id FROM public.organizations WHERE slug = 'datawisere')
WHERE organization_id IS NULL;

UPDATE public.screening_results
SET organization_id = (SELECT id FROM public.organizations WHERE slug = 'datawisere')
WHERE organization_id IS NULL;

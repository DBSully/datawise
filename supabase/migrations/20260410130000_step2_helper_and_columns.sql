-- Phase 1 Step 2 — Migration 1
-- Helper function + add nullable organization_id columns to all 22 core tables
--
-- This migration is purely additive:
--   1. Creates public.current_user_organization_id() helper function
--   2. Adds nullable organization_id uuid columns to all 22 core tables
--
-- The dev "authenticated full access" policies are still in effect after
-- this migration. The new columns have no values yet (NULL on every
-- existing row). New INSERTs from the application continue to work
-- because the column is nullable and has no constraints yet.
--
-- The next migrations in the Step 2 chain:
--   - 20260410130100 (Task 2): backfill all rows to DataWiseRE org
--   - 20260410130200 (Task 3): NOT NULL + FK + DEFAULT
--   - 20260410130300 (Task 4): drop dev policies + add org-scoped policies
--   - 20260410130400 (Task 5): recreate views with security_invoker = true

-- ────────────────────────────────────────────────────────────────────
-- Helper function: current_user_organization_id()
-- ────────────────────────────────────────────────────────────────────
--
-- Returns the organization_id for the current authenticated user by
-- reading their profile row. Used by:
--   - RLS policies (added in Migration 4) to scope queries
--   - Column DEFAULT clauses (added in Migration 3) so the application
--     doesn't need to set organization_id on INSERTs
--
-- STABLE: result doesn't change within a single statement, so Postgres
--   can cache the result and skip repeat evaluations.
-- SECURITY DEFINER: bypasses RLS on profiles. Safe because the query
--   is hard-filtered by auth.uid() — only the calling user's own
--   profile can ever be returned.
-- SET search_path = public: prevents search_path injection attacks,
--   a known concern for SECURITY DEFINER functions.

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

-- ────────────────────────────────────────────────────────────────────
-- Add nullable organization_id columns to all 22 core tables
-- ────────────────────────────────────────────────────────────────────
--
-- Each ALTER uses IF NOT EXISTS so the migration is safe to re-run.
-- No constraints, no FK, no default — those come in Migration 3.
-- The columns are populated by Migration 2 (backfill).

-- Property layer (4 tables)
ALTER TABLE public.real_properties     ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.property_physical   ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.property_financials ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.mls_listings        ADD COLUMN IF NOT EXISTS organization_id uuid;

-- Import layer (3 tables)
ALTER TABLE public.import_batches      ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.import_batch_files  ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.import_batch_rows   ADD COLUMN IF NOT EXISTS organization_id uuid;

-- Analysis layer (8 tables)
ALTER TABLE public.analyses            ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.manual_analysis     ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.analysis_pipeline   ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.analysis_notes      ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.analysis_showings   ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.analysis_offers     ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.analysis_links      ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.analysis_reports    ADD COLUMN IF NOT EXISTS organization_id uuid;

-- Comparables layer (5 tables)
ALTER TABLE public.comparable_profiles            ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.comparable_search_runs         ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.comparable_search_candidates   ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.comparable_sets                ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.comparable_set_members         ADD COLUMN IF NOT EXISTS organization_id uuid;

-- Screening layer (2 tables)
ALTER TABLE public.screening_batches   ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.screening_results   ADD COLUMN IF NOT EXISTS organization_id uuid;

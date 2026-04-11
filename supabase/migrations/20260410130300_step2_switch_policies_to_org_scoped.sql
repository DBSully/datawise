-- Phase 1 Step 2 — Migration 4 (THE POLICY SWITCH — HIGH RISK)
--
-- Drops all 22 "dev authenticated full access" policies and replaces
-- them with org-scoped policies that allow each user to read/write
-- only rows belonging to their own organization.
--
-- Before this migration: any authenticated user could see all rows.
-- After this migration: users see only their own org's rows.
--
-- For DataWiseRE right now this is functionally equivalent because
-- there is only one user (Dan) and one organization (DataWiseRE).
-- But the policy shape is the foundation for the partner portal in
-- Step 4 where distinct roles (analyst vs partner) will get
-- different access patterns on top of this org-scoping.
--
-- ─── Why BEGIN/COMMIT is explicit ───
-- This migration is wrapped in an explicit transaction so all
-- policy changes are atomic. If any CREATE POLICY fails mid-way,
-- the whole transaction rolls back and the dev policies remain
-- intact. This is the safest migration pattern for a risky change
-- where a partial state could lock the analyst out of their data.
--
-- Supabase CLI does not wrap migrations in transactions by default
-- (verified via SET LOCAL warnings in Migrations 2 and 3), so the
-- explicit BEGIN/COMMIT here creates the transaction we need.
--
-- ─── Rollback ───
-- If this migration causes any analyst workflow to break, run
-- supabase/rollback/step2_migration4_rollback.sql in the Supabase
-- dashboard SQL editor. That restores the dev policies.
--
-- ─── Policy pattern ───
-- Four policies per table (88 total across 22 tables):
--   _org_select:  SELECT  USING  (org_id = current_user_organization_id())
--   _org_insert:  INSERT  WITH CHECK (org_id = current_user_organization_id())
--   _org_update:  UPDATE  USING (...) WITH CHECK (...)
--   _org_delete:  DELETE  USING  (org_id = current_user_organization_id())
--
-- The four-policy pattern (instead of one FOR ALL policy) gives
-- granular permissions that are easier to audit and easier to
-- relax selectively in Step 4 (e.g., partners might get SELECT on
-- some tables but not UPDATE).

BEGIN;

-- ────────────────────────────────────────────────────────────────────
-- Drop existing dev policies (22 tables — plus 3 legacy valuation names)
-- ────────────────────────────────────────────────────────────────────

-- Property layer
DROP POLICY IF EXISTS "dev authenticated full access real_properties"     ON public.real_properties;
DROP POLICY IF EXISTS "dev authenticated full access property_physical"   ON public.property_physical;
DROP POLICY IF EXISTS "dev authenticated full access property_financials" ON public.property_financials;
DROP POLICY IF EXISTS "dev authenticated full access mls_listings"        ON public.mls_listings;

-- Import layer
DROP POLICY IF EXISTS "dev authenticated full access import_batches"      ON public.import_batches;
DROP POLICY IF EXISTS "dev authenticated full access import_batch_files"  ON public.import_batch_files;
DROP POLICY IF EXISTS "dev authenticated full access import_batch_rows"   ON public.import_batch_rows;

-- Analysis layer
DROP POLICY IF EXISTS "dev authenticated full access analyses"            ON public.analyses;
DROP POLICY IF EXISTS "dev authenticated full access manual_analysis"     ON public.manual_analysis;
DROP POLICY IF EXISTS "dev authenticated full access analysis_pipeline"   ON public.analysis_pipeline;
DROP POLICY IF EXISTS "dev authenticated full access analysis_notes"      ON public.analysis_notes;
DROP POLICY IF EXISTS "dev authenticated full access analysis_showings"   ON public.analysis_showings;
DROP POLICY IF EXISTS "dev authenticated full access analysis_offers"     ON public.analysis_offers;
DROP POLICY IF EXISTS "dev authenticated full access analysis_links"      ON public.analysis_links;
DROP POLICY IF EXISTS "dev authenticated full access analysis_reports"    ON public.analysis_reports;

-- Comparable tables: drop BOTH the legacy valuation-named policies AND
-- the comparable-named ones in case either or both exist. The legacy
-- names are because these three tables were originally named
-- valuation_profiles / valuation_runs / valuation_run_candidates and
-- their dev policies were created before the rename.
DROP POLICY IF EXISTS "dev authenticated full access valuation_profiles"           ON public.comparable_profiles;
DROP POLICY IF EXISTS "dev authenticated full access valuation_runs"               ON public.comparable_search_runs;
DROP POLICY IF EXISTS "dev authenticated full access valuation_run_candidates"     ON public.comparable_search_candidates;
DROP POLICY IF EXISTS "dev authenticated full access comparable_profiles"          ON public.comparable_profiles;
DROP POLICY IF EXISTS "dev authenticated full access comparable_search_runs"       ON public.comparable_search_runs;
DROP POLICY IF EXISTS "dev authenticated full access comparable_search_candidates" ON public.comparable_search_candidates;
DROP POLICY IF EXISTS "dev authenticated full access comparable_sets"              ON public.comparable_sets;
DROP POLICY IF EXISTS "dev authenticated full access comparable_set_members"       ON public.comparable_set_members;

-- Screening layer
DROP POLICY IF EXISTS "dev authenticated full access screening_batches"   ON public.screening_batches;
DROP POLICY IF EXISTS "dev authenticated full access screening_results"   ON public.screening_results;

-- ────────────────────────────────────────────────────────────────────
-- Create new org-scoped policies (22 tables × 4 operations = 88)
-- ────────────────────────────────────────────────────────────────────

-- ─── Property layer ───

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

-- property_physical
CREATE POLICY "property_physical_org_select" ON public.property_physical
  FOR SELECT TO authenticated
  USING (organization_id = public.current_user_organization_id());

CREATE POLICY "property_physical_org_insert" ON public.property_physical
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.current_user_organization_id());

CREATE POLICY "property_physical_org_update" ON public.property_physical
  FOR UPDATE TO authenticated
  USING (organization_id = public.current_user_organization_id())
  WITH CHECK (organization_id = public.current_user_organization_id());

CREATE POLICY "property_physical_org_delete" ON public.property_physical
  FOR DELETE TO authenticated
  USING (organization_id = public.current_user_organization_id());

-- property_financials
CREATE POLICY "property_financials_org_select" ON public.property_financials
  FOR SELECT TO authenticated
  USING (organization_id = public.current_user_organization_id());

CREATE POLICY "property_financials_org_insert" ON public.property_financials
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.current_user_organization_id());

CREATE POLICY "property_financials_org_update" ON public.property_financials
  FOR UPDATE TO authenticated
  USING (organization_id = public.current_user_organization_id())
  WITH CHECK (organization_id = public.current_user_organization_id());

CREATE POLICY "property_financials_org_delete" ON public.property_financials
  FOR DELETE TO authenticated
  USING (organization_id = public.current_user_organization_id());

-- mls_listings
CREATE POLICY "mls_listings_org_select" ON public.mls_listings
  FOR SELECT TO authenticated
  USING (organization_id = public.current_user_organization_id());

CREATE POLICY "mls_listings_org_insert" ON public.mls_listings
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.current_user_organization_id());

CREATE POLICY "mls_listings_org_update" ON public.mls_listings
  FOR UPDATE TO authenticated
  USING (organization_id = public.current_user_organization_id())
  WITH CHECK (organization_id = public.current_user_organization_id());

CREATE POLICY "mls_listings_org_delete" ON public.mls_listings
  FOR DELETE TO authenticated
  USING (organization_id = public.current_user_organization_id());

-- ─── Import layer ───

-- import_batches
CREATE POLICY "import_batches_org_select" ON public.import_batches
  FOR SELECT TO authenticated
  USING (organization_id = public.current_user_organization_id());

CREATE POLICY "import_batches_org_insert" ON public.import_batches
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.current_user_organization_id());

CREATE POLICY "import_batches_org_update" ON public.import_batches
  FOR UPDATE TO authenticated
  USING (organization_id = public.current_user_organization_id())
  WITH CHECK (organization_id = public.current_user_organization_id());

CREATE POLICY "import_batches_org_delete" ON public.import_batches
  FOR DELETE TO authenticated
  USING (organization_id = public.current_user_organization_id());

-- import_batch_files
CREATE POLICY "import_batch_files_org_select" ON public.import_batch_files
  FOR SELECT TO authenticated
  USING (organization_id = public.current_user_organization_id());

CREATE POLICY "import_batch_files_org_insert" ON public.import_batch_files
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.current_user_organization_id());

CREATE POLICY "import_batch_files_org_update" ON public.import_batch_files
  FOR UPDATE TO authenticated
  USING (organization_id = public.current_user_organization_id())
  WITH CHECK (organization_id = public.current_user_organization_id());

CREATE POLICY "import_batch_files_org_delete" ON public.import_batch_files
  FOR DELETE TO authenticated
  USING (organization_id = public.current_user_organization_id());

-- import_batch_rows
CREATE POLICY "import_batch_rows_org_select" ON public.import_batch_rows
  FOR SELECT TO authenticated
  USING (organization_id = public.current_user_organization_id());

CREATE POLICY "import_batch_rows_org_insert" ON public.import_batch_rows
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.current_user_organization_id());

CREATE POLICY "import_batch_rows_org_update" ON public.import_batch_rows
  FOR UPDATE TO authenticated
  USING (organization_id = public.current_user_organization_id())
  WITH CHECK (organization_id = public.current_user_organization_id());

CREATE POLICY "import_batch_rows_org_delete" ON public.import_batch_rows
  FOR DELETE TO authenticated
  USING (organization_id = public.current_user_organization_id());

-- ─── Analysis layer ───

-- analyses
CREATE POLICY "analyses_org_select" ON public.analyses
  FOR SELECT TO authenticated
  USING (organization_id = public.current_user_organization_id());

CREATE POLICY "analyses_org_insert" ON public.analyses
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.current_user_organization_id());

CREATE POLICY "analyses_org_update" ON public.analyses
  FOR UPDATE TO authenticated
  USING (organization_id = public.current_user_organization_id())
  WITH CHECK (organization_id = public.current_user_organization_id());

CREATE POLICY "analyses_org_delete" ON public.analyses
  FOR DELETE TO authenticated
  USING (organization_id = public.current_user_organization_id());

-- manual_analysis
CREATE POLICY "manual_analysis_org_select" ON public.manual_analysis
  FOR SELECT TO authenticated
  USING (organization_id = public.current_user_organization_id());

CREATE POLICY "manual_analysis_org_insert" ON public.manual_analysis
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.current_user_organization_id());

CREATE POLICY "manual_analysis_org_update" ON public.manual_analysis
  FOR UPDATE TO authenticated
  USING (organization_id = public.current_user_organization_id())
  WITH CHECK (organization_id = public.current_user_organization_id());

CREATE POLICY "manual_analysis_org_delete" ON public.manual_analysis
  FOR DELETE TO authenticated
  USING (organization_id = public.current_user_organization_id());

-- analysis_pipeline
CREATE POLICY "analysis_pipeline_org_select" ON public.analysis_pipeline
  FOR SELECT TO authenticated
  USING (organization_id = public.current_user_organization_id());

CREATE POLICY "analysis_pipeline_org_insert" ON public.analysis_pipeline
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.current_user_organization_id());

CREATE POLICY "analysis_pipeline_org_update" ON public.analysis_pipeline
  FOR UPDATE TO authenticated
  USING (organization_id = public.current_user_organization_id())
  WITH CHECK (organization_id = public.current_user_organization_id());

CREATE POLICY "analysis_pipeline_org_delete" ON public.analysis_pipeline
  FOR DELETE TO authenticated
  USING (organization_id = public.current_user_organization_id());

-- analysis_notes
CREATE POLICY "analysis_notes_org_select" ON public.analysis_notes
  FOR SELECT TO authenticated
  USING (organization_id = public.current_user_organization_id());

CREATE POLICY "analysis_notes_org_insert" ON public.analysis_notes
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.current_user_organization_id());

CREATE POLICY "analysis_notes_org_update" ON public.analysis_notes
  FOR UPDATE TO authenticated
  USING (organization_id = public.current_user_organization_id())
  WITH CHECK (organization_id = public.current_user_organization_id());

CREATE POLICY "analysis_notes_org_delete" ON public.analysis_notes
  FOR DELETE TO authenticated
  USING (organization_id = public.current_user_organization_id());

-- analysis_showings
CREATE POLICY "analysis_showings_org_select" ON public.analysis_showings
  FOR SELECT TO authenticated
  USING (organization_id = public.current_user_organization_id());

CREATE POLICY "analysis_showings_org_insert" ON public.analysis_showings
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.current_user_organization_id());

CREATE POLICY "analysis_showings_org_update" ON public.analysis_showings
  FOR UPDATE TO authenticated
  USING (organization_id = public.current_user_organization_id())
  WITH CHECK (organization_id = public.current_user_organization_id());

CREATE POLICY "analysis_showings_org_delete" ON public.analysis_showings
  FOR DELETE TO authenticated
  USING (organization_id = public.current_user_organization_id());

-- analysis_offers
CREATE POLICY "analysis_offers_org_select" ON public.analysis_offers
  FOR SELECT TO authenticated
  USING (organization_id = public.current_user_organization_id());

CREATE POLICY "analysis_offers_org_insert" ON public.analysis_offers
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.current_user_organization_id());

CREATE POLICY "analysis_offers_org_update" ON public.analysis_offers
  FOR UPDATE TO authenticated
  USING (organization_id = public.current_user_organization_id())
  WITH CHECK (organization_id = public.current_user_organization_id());

CREATE POLICY "analysis_offers_org_delete" ON public.analysis_offers
  FOR DELETE TO authenticated
  USING (organization_id = public.current_user_organization_id());

-- analysis_links
CREATE POLICY "analysis_links_org_select" ON public.analysis_links
  FOR SELECT TO authenticated
  USING (organization_id = public.current_user_organization_id());

CREATE POLICY "analysis_links_org_insert" ON public.analysis_links
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.current_user_organization_id());

CREATE POLICY "analysis_links_org_update" ON public.analysis_links
  FOR UPDATE TO authenticated
  USING (organization_id = public.current_user_organization_id())
  WITH CHECK (organization_id = public.current_user_organization_id());

CREATE POLICY "analysis_links_org_delete" ON public.analysis_links
  FOR DELETE TO authenticated
  USING (organization_id = public.current_user_organization_id());

-- analysis_reports
CREATE POLICY "analysis_reports_org_select" ON public.analysis_reports
  FOR SELECT TO authenticated
  USING (organization_id = public.current_user_organization_id());

CREATE POLICY "analysis_reports_org_insert" ON public.analysis_reports
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.current_user_organization_id());

CREATE POLICY "analysis_reports_org_update" ON public.analysis_reports
  FOR UPDATE TO authenticated
  USING (organization_id = public.current_user_organization_id())
  WITH CHECK (organization_id = public.current_user_organization_id());

CREATE POLICY "analysis_reports_org_delete" ON public.analysis_reports
  FOR DELETE TO authenticated
  USING (organization_id = public.current_user_organization_id());

-- ─── Comparables layer ───

-- comparable_profiles
CREATE POLICY "comparable_profiles_org_select" ON public.comparable_profiles
  FOR SELECT TO authenticated
  USING (organization_id = public.current_user_organization_id());

CREATE POLICY "comparable_profiles_org_insert" ON public.comparable_profiles
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.current_user_organization_id());

CREATE POLICY "comparable_profiles_org_update" ON public.comparable_profiles
  FOR UPDATE TO authenticated
  USING (organization_id = public.current_user_organization_id())
  WITH CHECK (organization_id = public.current_user_organization_id());

CREATE POLICY "comparable_profiles_org_delete" ON public.comparable_profiles
  FOR DELETE TO authenticated
  USING (organization_id = public.current_user_organization_id());

-- comparable_search_runs
CREATE POLICY "comparable_search_runs_org_select" ON public.comparable_search_runs
  FOR SELECT TO authenticated
  USING (organization_id = public.current_user_organization_id());

CREATE POLICY "comparable_search_runs_org_insert" ON public.comparable_search_runs
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.current_user_organization_id());

CREATE POLICY "comparable_search_runs_org_update" ON public.comparable_search_runs
  FOR UPDATE TO authenticated
  USING (organization_id = public.current_user_organization_id())
  WITH CHECK (organization_id = public.current_user_organization_id());

CREATE POLICY "comparable_search_runs_org_delete" ON public.comparable_search_runs
  FOR DELETE TO authenticated
  USING (organization_id = public.current_user_organization_id());

-- comparable_search_candidates
CREATE POLICY "comparable_search_candidates_org_select" ON public.comparable_search_candidates
  FOR SELECT TO authenticated
  USING (organization_id = public.current_user_organization_id());

CREATE POLICY "comparable_search_candidates_org_insert" ON public.comparable_search_candidates
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.current_user_organization_id());

CREATE POLICY "comparable_search_candidates_org_update" ON public.comparable_search_candidates
  FOR UPDATE TO authenticated
  USING (organization_id = public.current_user_organization_id())
  WITH CHECK (organization_id = public.current_user_organization_id());

CREATE POLICY "comparable_search_candidates_org_delete" ON public.comparable_search_candidates
  FOR DELETE TO authenticated
  USING (organization_id = public.current_user_organization_id());

-- comparable_sets
CREATE POLICY "comparable_sets_org_select" ON public.comparable_sets
  FOR SELECT TO authenticated
  USING (organization_id = public.current_user_organization_id());

CREATE POLICY "comparable_sets_org_insert" ON public.comparable_sets
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.current_user_organization_id());

CREATE POLICY "comparable_sets_org_update" ON public.comparable_sets
  FOR UPDATE TO authenticated
  USING (organization_id = public.current_user_organization_id())
  WITH CHECK (organization_id = public.current_user_organization_id());

CREATE POLICY "comparable_sets_org_delete" ON public.comparable_sets
  FOR DELETE TO authenticated
  USING (organization_id = public.current_user_organization_id());

-- comparable_set_members
CREATE POLICY "comparable_set_members_org_select" ON public.comparable_set_members
  FOR SELECT TO authenticated
  USING (organization_id = public.current_user_organization_id());

CREATE POLICY "comparable_set_members_org_insert" ON public.comparable_set_members
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.current_user_organization_id());

CREATE POLICY "comparable_set_members_org_update" ON public.comparable_set_members
  FOR UPDATE TO authenticated
  USING (organization_id = public.current_user_organization_id())
  WITH CHECK (organization_id = public.current_user_organization_id());

CREATE POLICY "comparable_set_members_org_delete" ON public.comparable_set_members
  FOR DELETE TO authenticated
  USING (organization_id = public.current_user_organization_id());

-- ─── Screening layer ───

-- screening_batches
CREATE POLICY "screening_batches_org_select" ON public.screening_batches
  FOR SELECT TO authenticated
  USING (organization_id = public.current_user_organization_id());

CREATE POLICY "screening_batches_org_insert" ON public.screening_batches
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.current_user_organization_id());

CREATE POLICY "screening_batches_org_update" ON public.screening_batches
  FOR UPDATE TO authenticated
  USING (organization_id = public.current_user_organization_id())
  WITH CHECK (organization_id = public.current_user_organization_id());

CREATE POLICY "screening_batches_org_delete" ON public.screening_batches
  FOR DELETE TO authenticated
  USING (organization_id = public.current_user_organization_id());

-- screening_results
CREATE POLICY "screening_results_org_select" ON public.screening_results
  FOR SELECT TO authenticated
  USING (organization_id = public.current_user_organization_id());

CREATE POLICY "screening_results_org_insert" ON public.screening_results
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.current_user_organization_id());

CREATE POLICY "screening_results_org_update" ON public.screening_results
  FOR UPDATE TO authenticated
  USING (organization_id = public.current_user_organization_id())
  WITH CHECK (organization_id = public.current_user_organization_id());

CREATE POLICY "screening_results_org_delete" ON public.screening_results
  FOR DELETE TO authenticated
  USING (organization_id = public.current_user_organization_id());

COMMIT;

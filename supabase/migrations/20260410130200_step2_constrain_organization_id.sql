-- Phase 1 Step 2 — Migration 3
-- NOT NULL + FK + DEFAULT + index on organization_id for all 22 tables.
--
-- After this migration, the organization_id column is fully constrained:
--   - NOT NULL (no row can exist without an org id)
--   - Foreign key to public.organizations with ON DELETE RESTRICT
--   - DEFAULT public.current_user_organization_id() so application
--     INSERTs without an explicit org_id auto-populate from the
--     calling user's profile — no application code changes needed
--   - btree index for RLS filter performance
--
-- The existing dev "authenticated full access" policies are still in
-- effect after this migration. The policy switch to org-scoped access
-- happens in Migration 4.
--
-- EXPECTED DURATION: 1-3 minutes on the current micro compute tier.
-- Most time is spent on the four largest tables:
--   - comparable_search_candidates (737k rows): ~30-60s
--   - import_batch_rows (73k rows):              ~5-10s
--   - mls_listings (70k rows):                   ~5-10s
--   - screening_results (65k rows):              ~10-20s
--
-- DO NOT USE THE APPLICATION WHILE THIS MIGRATION RUNS.
-- Each table is briefly locked for reads and writes during its
-- NOT NULL validation, FK validation, and index build. Requests
-- that touch a locked table will wait until the lock releases.
--
-- SET LOCAL statement_timeout = 0 is included as belt-and-suspenders
-- but will emit a WARNING since Supabase CLI doesn't wrap migrations
-- in explicit transactions (see Migration 2 for the original
-- observation). The individual statements each get their own
-- statement_timeout window regardless.

SET LOCAL statement_timeout = 0;

-- ────────────────────────────────────────────────────────────────────
-- Property layer (4 tables)
-- ────────────────────────────────────────────────────────────────────

-- real_properties
ALTER TABLE public.real_properties
  ALTER COLUMN organization_id SET NOT NULL,
  ALTER COLUMN organization_id SET DEFAULT public.current_user_organization_id();

ALTER TABLE public.real_properties
  ADD CONSTRAINT real_properties_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS real_properties_organization_id_idx
  ON public.real_properties(organization_id);

-- property_physical
ALTER TABLE public.property_physical
  ALTER COLUMN organization_id SET NOT NULL,
  ALTER COLUMN organization_id SET DEFAULT public.current_user_organization_id();

ALTER TABLE public.property_physical
  ADD CONSTRAINT property_physical_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS property_physical_organization_id_idx
  ON public.property_physical(organization_id);

-- property_financials
ALTER TABLE public.property_financials
  ALTER COLUMN organization_id SET NOT NULL,
  ALTER COLUMN organization_id SET DEFAULT public.current_user_organization_id();

ALTER TABLE public.property_financials
  ADD CONSTRAINT property_financials_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS property_financials_organization_id_idx
  ON public.property_financials(organization_id);

-- mls_listings
ALTER TABLE public.mls_listings
  ALTER COLUMN organization_id SET NOT NULL,
  ALTER COLUMN organization_id SET DEFAULT public.current_user_organization_id();

ALTER TABLE public.mls_listings
  ADD CONSTRAINT mls_listings_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS mls_listings_organization_id_idx
  ON public.mls_listings(organization_id);

-- ────────────────────────────────────────────────────────────────────
-- Import layer (3 tables)
-- ────────────────────────────────────────────────────────────────────

-- import_batches
ALTER TABLE public.import_batches
  ALTER COLUMN organization_id SET NOT NULL,
  ALTER COLUMN organization_id SET DEFAULT public.current_user_organization_id();

ALTER TABLE public.import_batches
  ADD CONSTRAINT import_batches_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS import_batches_organization_id_idx
  ON public.import_batches(organization_id);

-- import_batch_files
ALTER TABLE public.import_batch_files
  ALTER COLUMN organization_id SET NOT NULL,
  ALTER COLUMN organization_id SET DEFAULT public.current_user_organization_id();

ALTER TABLE public.import_batch_files
  ADD CONSTRAINT import_batch_files_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS import_batch_files_organization_id_idx
  ON public.import_batch_files(organization_id);

-- import_batch_rows (large)
ALTER TABLE public.import_batch_rows
  ALTER COLUMN organization_id SET NOT NULL,
  ALTER COLUMN organization_id SET DEFAULT public.current_user_organization_id();

ALTER TABLE public.import_batch_rows
  ADD CONSTRAINT import_batch_rows_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS import_batch_rows_organization_id_idx
  ON public.import_batch_rows(organization_id);

-- ────────────────────────────────────────────────────────────────────
-- Analysis layer (8 tables)
-- ────────────────────────────────────────────────────────────────────

-- analyses
ALTER TABLE public.analyses
  ALTER COLUMN organization_id SET NOT NULL,
  ALTER COLUMN organization_id SET DEFAULT public.current_user_organization_id();

ALTER TABLE public.analyses
  ADD CONSTRAINT analyses_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS analyses_organization_id_idx
  ON public.analyses(organization_id);

-- manual_analysis
ALTER TABLE public.manual_analysis
  ALTER COLUMN organization_id SET NOT NULL,
  ALTER COLUMN organization_id SET DEFAULT public.current_user_organization_id();

ALTER TABLE public.manual_analysis
  ADD CONSTRAINT manual_analysis_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS manual_analysis_organization_id_idx
  ON public.manual_analysis(organization_id);

-- analysis_pipeline
ALTER TABLE public.analysis_pipeline
  ALTER COLUMN organization_id SET NOT NULL,
  ALTER COLUMN organization_id SET DEFAULT public.current_user_organization_id();

ALTER TABLE public.analysis_pipeline
  ADD CONSTRAINT analysis_pipeline_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS analysis_pipeline_organization_id_idx
  ON public.analysis_pipeline(organization_id);

-- analysis_notes
ALTER TABLE public.analysis_notes
  ALTER COLUMN organization_id SET NOT NULL,
  ALTER COLUMN organization_id SET DEFAULT public.current_user_organization_id();

ALTER TABLE public.analysis_notes
  ADD CONSTRAINT analysis_notes_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS analysis_notes_organization_id_idx
  ON public.analysis_notes(organization_id);

-- analysis_showings
ALTER TABLE public.analysis_showings
  ALTER COLUMN organization_id SET NOT NULL,
  ALTER COLUMN organization_id SET DEFAULT public.current_user_organization_id();

ALTER TABLE public.analysis_showings
  ADD CONSTRAINT analysis_showings_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS analysis_showings_organization_id_idx
  ON public.analysis_showings(organization_id);

-- analysis_offers
ALTER TABLE public.analysis_offers
  ALTER COLUMN organization_id SET NOT NULL,
  ALTER COLUMN organization_id SET DEFAULT public.current_user_organization_id();

ALTER TABLE public.analysis_offers
  ADD CONSTRAINT analysis_offers_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS analysis_offers_organization_id_idx
  ON public.analysis_offers(organization_id);

-- analysis_links
ALTER TABLE public.analysis_links
  ALTER COLUMN organization_id SET NOT NULL,
  ALTER COLUMN organization_id SET DEFAULT public.current_user_organization_id();

ALTER TABLE public.analysis_links
  ADD CONSTRAINT analysis_links_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS analysis_links_organization_id_idx
  ON public.analysis_links(organization_id);

-- analysis_reports
ALTER TABLE public.analysis_reports
  ALTER COLUMN organization_id SET NOT NULL,
  ALTER COLUMN organization_id SET DEFAULT public.current_user_organization_id();

ALTER TABLE public.analysis_reports
  ADD CONSTRAINT analysis_reports_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS analysis_reports_organization_id_idx
  ON public.analysis_reports(organization_id);

-- ────────────────────────────────────────────────────────────────────
-- Comparables layer (5 tables — comparable_search_candidates is the
-- biggest table in the whole schema at ~737k rows)
-- ────────────────────────────────────────────────────────────────────

-- comparable_profiles
ALTER TABLE public.comparable_profiles
  ALTER COLUMN organization_id SET NOT NULL,
  ALTER COLUMN organization_id SET DEFAULT public.current_user_organization_id();

ALTER TABLE public.comparable_profiles
  ADD CONSTRAINT comparable_profiles_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS comparable_profiles_organization_id_idx
  ON public.comparable_profiles(organization_id);

-- comparable_search_runs
ALTER TABLE public.comparable_search_runs
  ALTER COLUMN organization_id SET NOT NULL,
  ALTER COLUMN organization_id SET DEFAULT public.current_user_organization_id();

ALTER TABLE public.comparable_search_runs
  ADD CONSTRAINT comparable_search_runs_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS comparable_search_runs_organization_id_idx
  ON public.comparable_search_runs(organization_id);

-- comparable_search_candidates (the big one — ~737k rows)
ALTER TABLE public.comparable_search_candidates
  ALTER COLUMN organization_id SET NOT NULL,
  ALTER COLUMN organization_id SET DEFAULT public.current_user_organization_id();

ALTER TABLE public.comparable_search_candidates
  ADD CONSTRAINT comparable_search_candidates_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS comparable_search_candidates_organization_id_idx
  ON public.comparable_search_candidates(organization_id);

-- comparable_sets
ALTER TABLE public.comparable_sets
  ALTER COLUMN organization_id SET NOT NULL,
  ALTER COLUMN organization_id SET DEFAULT public.current_user_organization_id();

ALTER TABLE public.comparable_sets
  ADD CONSTRAINT comparable_sets_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS comparable_sets_organization_id_idx
  ON public.comparable_sets(organization_id);

-- comparable_set_members
ALTER TABLE public.comparable_set_members
  ALTER COLUMN organization_id SET NOT NULL,
  ALTER COLUMN organization_id SET DEFAULT public.current_user_organization_id();

ALTER TABLE public.comparable_set_members
  ADD CONSTRAINT comparable_set_members_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS comparable_set_members_organization_id_idx
  ON public.comparable_set_members(organization_id);

-- ────────────────────────────────────────────────────────────────────
-- Screening layer (2 tables)
-- ────────────────────────────────────────────────────────────────────

-- screening_batches
ALTER TABLE public.screening_batches
  ALTER COLUMN organization_id SET NOT NULL,
  ALTER COLUMN organization_id SET DEFAULT public.current_user_organization_id();

ALTER TABLE public.screening_batches
  ADD CONSTRAINT screening_batches_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS screening_batches_organization_id_idx
  ON public.screening_batches(organization_id);

-- screening_results (medium-large — ~65k rows)
ALTER TABLE public.screening_results
  ALTER COLUMN organization_id SET NOT NULL,
  ALTER COLUMN organization_id SET DEFAULT public.current_user_organization_id();

ALTER TABLE public.screening_results
  ADD CONSTRAINT screening_results_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS screening_results_organization_id_idx
  ON public.screening_results(organization_id);

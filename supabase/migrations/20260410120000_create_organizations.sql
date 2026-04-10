-- Phase 1 Step 1 — Task 1
-- Create the organizations table.
--
-- This is the multi-tenancy primitive for DataWiseRE. Every other table
-- will eventually carry organization_id for RLS scoping (Phase 1 Step 2).
-- For now, only one row exists: the DataWiseRE org itself.
--
-- Step 1 RLS policy: any authenticated user can read all organizations.
-- Step 2 will tighten this so users only see their own org.

CREATE TABLE IF NOT EXISTS public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  market text,
  logo_url text,
  strategy_profile_slug text NOT NULL DEFAULT 'denver_flip_v1',
  mls_agreement_confirmed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Auto-update updated_at on row changes (uses existing trigger function
-- from supabase/migrations/20260322_create_real_properties.sql or later).
CREATE TRIGGER organizations_set_updated_at
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

-- Step 1 policy: any authenticated user can read all organizations.
-- Step 2 will replace this with a stricter org-scoped policy.
CREATE POLICY "organizations_authenticated_read"
  ON public.organizations
  FOR SELECT
  TO authenticated
  USING (true);

-- Seed the DataWiseRE organization. The profile backfill in
-- 20260410120200_backfill_existing_profiles.sql will look this up
-- by slug rather than hardcoding the UUID.
INSERT INTO public.organizations (
  name,
  slug,
  market,
  strategy_profile_slug,
  mls_agreement_confirmed
) VALUES (
  'DataWiseRE',
  'datawisere',
  'denver',
  'denver_flip_v1',
  true
);

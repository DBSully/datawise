-- Phase 1 Step 1 — Task 2
-- Create the profiles table.
--
-- 1:1 link to auth.users carrying role assignment, organization
-- membership, and analyst-friendly metadata. Step 1 supports the
-- analyst role only; partner and admin roles become operational
-- in Phase 1 Step 4 (Partner Portal MVP) and beyond.
--
-- This migration does NOT backfill existing users — that happens
-- in 20260410120200_backfill_existing_profiles.sql (Task 3).
-- It also does NOT install the auto-create trigger for new users
-- — that happens in 20260410120300_profiles_auto_create_trigger.sql
-- (Task 4).

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  role text NOT NULL DEFAULT 'analyst'
    CHECK (role IN ('analyst', 'partner', 'admin')),
  full_name text,
  email text NOT NULL,
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for the most common lookups.
-- organization_id: org-scoped queries from Step 2 onward
-- email: partner invitation flow (Step 4) needs to find profiles by email
-- role: filter profiles by role (e.g., "show me all partners in this org")
CREATE INDEX profiles_organization_id_idx ON public.profiles(organization_id);
CREATE INDEX profiles_email_idx ON public.profiles(email);
CREATE INDEX profiles_role_idx ON public.profiles(role);

-- Auto-update updated_at on row changes (uses existing trigger function).
CREATE TRIGGER profiles_set_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Step 1 RLS policies — minimum to support the analyst workflow.
-- Step 2 will add: analysts can read other profiles in their own org
--                  (needed for the Partner Sharing partner picker).
-- Step 4 will add: partners can be visible to analysts who shared
--                  with them; partners can read their own assigned shares.

-- Read own: any authenticated user can SELECT their own profile row.
CREATE POLICY "profiles_read_own"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (id = auth.uid());

-- Update own: any authenticated user can UPDATE their own profile row.
-- The WITH CHECK clause prevents row-id reassignment (defense in depth;
-- the PK constraint already blocks this).
--
-- Note: this policy currently allows a user to update their own role
-- and organization_id columns, which is too permissive. Step 2 will
-- restrict updates to just full_name and avatar_url, with role/org
-- changes requiring an admin. For Step 1 the only user is Dan and the
-- risk is non-existent.
CREATE POLICY "profiles_update_own"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

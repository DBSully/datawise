-- Phase 1 Step 1 — Task 4
-- Auto-create profile trigger on new auth.users INSERT.
--
-- Trigger that creates a profile row automatically when a new user
-- signs up via Supabase Auth. Eliminates race conditions and ensures
-- every authenticated user has a corresponding profile.
--
-- For Step 1 / Step 2, all new users default to:
--   - organization: DataWiseRE (slug: datawisere)
--   - role: analyst
--
-- The trigger reads raw_user_meta_data for two optional keys:
--   - 'role': the role to assign (defaults to 'analyst')
--   - 'organization_slug': the org slug to look up (defaults to 'datawisere')
--
-- This makes Phase 1 Step 4 (Partner Portal MVP) easy to implement:
-- the partner sign-up flow can pass role='partner' and the appropriate
-- organization_slug in user metadata at signup time, and the trigger
-- routes the new user into the correct role + org without any
-- additional application code.
--
-- Why SECURITY DEFINER: the trigger needs to write to public.profiles
-- but the calling user (a fresh signup) doesn't yet have any privileges.
-- SECURITY DEFINER runs the trigger with the privileges of the function
-- owner (typically postgres / service_role), which can insert.
--
-- Why SET search_path = public: prevents search_path injection attacks,
-- a known concern for SECURITY DEFINER functions.

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
  v_role text;
  v_org_slug text;
BEGIN
  -- Extract role and org from raw_user_meta_data if provided by sign-up flow.
  -- Falls back to analyst + default org if metadata is missing.
  v_role := COALESCE(NEW.raw_user_meta_data->>'role', 'analyst');
  v_org_slug := COALESCE(NEW.raw_user_meta_data->>'organization_slug', 'datawisere');

  -- Validate role against the same CHECK constraint that profiles enforces.
  IF v_role NOT IN ('analyst', 'partner', 'admin') THEN
    RAISE EXCEPTION 'Invalid role % provided for new user (expected analyst|partner|admin)', v_role;
  END IF;

  -- Look up the organization by slug.
  SELECT id INTO v_org_id
  FROM public.organizations
  WHERE slug = v_org_slug
  LIMIT 1;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'No organization found for slug % during new user profile creation', v_org_slug;
  END IF;

  -- Insert the profile row. ON CONFLICT DO NOTHING makes the trigger
  -- safe to retry — if a profile already exists for this user (e.g.
  -- from the backfill migration), the trigger silently no-ops.
  INSERT INTO public.profiles (id, organization_id, role, full_name, email)
  VALUES (
    NEW.id,
    v_org_id,
    v_role,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.email
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- Drop any pre-existing trigger of the same name before recreating.
-- Defensive: lets this migration be re-applied if needed.
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

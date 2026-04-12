-- Change the default role for new users from 'analyst' to 'partner'.
--
-- Anyone who signs up gets 'partner' by default. Analysts are promoted
-- manually. Existing profiles are NOT changed.

-- 1. Update the column default on the profiles table.
ALTER TABLE public.profiles ALTER COLUMN role SET DEFAULT 'partner';

-- 2. Recreate the auto-create trigger function with 'partner' as the
--    fallback role (was 'analyst').
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
  v_role := COALESCE(NEW.raw_user_meta_data->>'role', 'partner');
  v_org_slug := COALESCE(NEW.raw_user_meta_data->>'organization_slug', 'datawisere');

  IF v_role NOT IN ('analyst', 'partner', 'admin') THEN
    RAISE EXCEPTION 'Invalid role % provided for new user (expected analyst|partner|admin)', v_role;
  END IF;

  SELECT id INTO v_org_id
  FROM public.organizations
  WHERE slug = v_org_slug
  LIMIT 1;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'No organization found for slug % during new user profile creation', v_org_slug;
  END IF;

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

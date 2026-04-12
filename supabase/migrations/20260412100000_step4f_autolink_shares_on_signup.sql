-- Phase 1 Step 4F — Auto-link shares when a new user signs up.
--
-- Extends the handle_new_auth_user trigger to also update any
-- analysis_shares rows that were sent to this email address BEFORE
-- the user registered. Sets shared_with_user_id to the new user's
-- profile ID so the shares appear in the partner's dashboard and
-- the partner RLS policies (which check shared_with_user_id) work.
--
-- This makes the flow seamless: analyst shares with partner@email.com
-- → partner clicks the link → partner creates an account with
-- partner@email.com → all previously-shared analyses instantly
-- appear in their dashboard.

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
  v_role := COALESCE(NEW.raw_user_meta_data->>'role', 'analyst');
  v_org_slug := COALESCE(NEW.raw_user_meta_data->>'organization_slug', 'datawisere');

  IF v_role NOT IN ('analyst', 'partner', 'admin') THEN
    RAISE EXCEPTION 'Invalid role % provided for new user', v_role;
  END IF;

  SELECT id INTO v_org_id
  FROM public.organizations
  WHERE slug = v_org_slug
  LIMIT 1;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'No organization found for slug %', v_org_slug;
  END IF;

  -- Create the profile row.
  INSERT INTO public.profiles (id, organization_id, role, full_name, email)
  VALUES (
    NEW.id,
    v_org_id,
    v_role,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.email
  )
  ON CONFLICT (id) DO NOTHING;

  -- ── NEW in Step 4F: auto-link pending shares ──
  -- If any analysis_shares rows were created for this email address
  -- before the user registered, link them now so the shares appear
  -- in the partner's dashboard and RLS policies work.
  UPDATE public.analysis_shares
  SET shared_with_user_id = NEW.id
  WHERE LOWER(shared_with_email) = LOWER(NEW.email)
    AND shared_with_user_id IS NULL;

  RETURN NEW;
END;
$$;

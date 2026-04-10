-- Phase 1 Step 1 — Task 3
-- Backfill profiles for existing auth.users.
--
-- One-time backfill: create a profile row for every existing
-- auth.users that doesn't already have one. In practice this is
-- a single-row insert for Dan, but the query is idempotent and
-- safe to run against any future state.
--
-- The migration looks up the DataWiseRE org by slug rather than
-- hardcoding its UUID, so it works regardless of when the
-- organizations migration ran.

INSERT INTO public.profiles (id, organization_id, role, full_name, email)
SELECT
  u.id,
  (SELECT id FROM public.organizations WHERE slug = 'datawisere'),
  'analyst',
  COALESCE(u.raw_user_meta_data->>'full_name', split_part(u.email, '@', 1)),
  u.email
FROM auth.users u
WHERE NOT EXISTS (
  SELECT 1 FROM public.profiles p WHERE p.id = u.id
);

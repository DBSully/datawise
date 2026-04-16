-- Fix the infinite-recursion RLS error introduced by 20260416200000.
--
-- That migration added:
--   using (
--     organization_id = (
--       select organization_id from public.profiles where id = auth.uid()
--     )
--   )
--
-- Subquerying public.profiles inside a policy ON public.profiles triggers
-- the policy's own USING clause recursively → "infinite recursion detected
-- in policy for relation profiles".
--
-- Fix: use the existing public.current_user_organization_id() helper
-- from 20260410130000. It's SECURITY DEFINER, so its internal query
-- bypasses profiles RLS cleanly.

begin;

drop policy if exists "profiles_read_same_org" on public.profiles;

create policy "profiles_read_same_org"
  on public.profiles
  for select
  to authenticated
  using (
    organization_id = public.current_user_organization_id()
  );

commit;

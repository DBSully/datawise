/**
 * Database type for the organizations table.
 *
 * Mirrors the schema in:
 *   supabase/migrations/20260410120000_create_organizations.sql
 *
 * The organizations table is the multi-tenancy primitive for DataWiseRE.
 * In Phase 1 Step 1 only one row exists (DataWiseRE itself); Step 2
 * onward will scope every other table to org via organization_id.
 */
export type OrganizationRow = {
  id: string;
  name: string;
  slug: string;
  market: string | null;
  logo_url: string | null;
  strategy_profile_slug: string;
  mls_agreement_confirmed: boolean;
  created_at: string;
  updated_at: string;
};

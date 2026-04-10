/**
 * Database types for the profiles table.
 *
 * Mirrors the schema in:
 *   supabase/migrations/20260410120100_create_profiles.sql
 *
 * The profiles table is 1:1 with auth.users (FK with cascade delete).
 * Every authenticated user has exactly one profile row that carries
 * their role assignment, organization membership, and analyst-friendly
 * metadata.
 *
 * Roles in Phase 1:
 *   - 'analyst' — internal user, full workspace access (current behavior)
 *   - 'partner' — external partner, restricted to /portal area (Step 4)
 *   - 'admin'   — superuser within an org (future)
 */
export type UserRole = "analyst" | "partner" | "admin";

export type ProfileRow = {
  id: string;
  organization_id: string;
  role: UserRole;
  full_name: string | null;
  email: string;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * Shape for inserting a new profile row. Most fields are optional
 * because the auto-create trigger handles defaults from auth.users
 * raw_user_meta_data — see supabase/migrations/20260410120300_profiles_auto_create_trigger.sql
 */
export type ProfileInsert = {
  id: string;
  organization_id: string;
  role?: UserRole;
  full_name?: string | null;
  email: string;
  avatar_url?: string | null;
};

/**
 * Shape for updating an existing profile row. Step 1 RLS allows
 * users to update their own profile freely; Step 2 will tighten
 * this to only the fields below (full_name, avatar_url) — role
 * and organization_id changes will require admin in Step 2+.
 */
export type ProfileUpdate = Partial<Pick<ProfileRow, "full_name" | "avatar_url">>;

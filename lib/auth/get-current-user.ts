import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { UserRole } from "@/lib/types/profiles";

/**
 * The shape of a profile as returned by getCurrentUser. Mirrors a
 * subset of ProfileRow from lib/types/profiles.ts — only the fields
 * commonly needed at request time. Avoid widening this without a
 * reason; the smaller the surface, the easier it is to swap implementations.
 */
export type CurrentProfile = {
  id: string;
  organization_id: string;
  role: UserRole;
  full_name: string | null;
  email: string;
  avatar_url: string | null;
};

export type CurrentUser = {
  user: { id: string; email: string };
  profile: CurrentProfile;
};

/**
 * Returns the current authenticated user and their profile, or null
 * if no user is signed in.
 *
 * Cached per React request lifecycle via cache() — multiple component
 * or action calls in the same request share a single Supabase round trip.
 *
 * Use this in server components, server actions, and route handlers
 * where you need the user's identity or role.
 *
 * NOTE: this is a server-only helper. It uses lib/supabase/server which
 * relies on next/headers and cannot run in client components.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !user.email) return null;

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id, organization_id, role, full_name, email, avatar_url")
    .eq("id", user.id)
    .single();

  if (error || !profile) {
    // Should never happen if the auto-create trigger is working.
    // Surface clearly so we can debug instead of silently degrading.
    console.error(
      "[getCurrentUser] User has no profile row — auto-create trigger may have failed",
      { userId: user.id, error },
    );
    return null;
  }

  return {
    user: { id: user.id, email: user.email },
    profile: profile as CurrentProfile,
  };
});

/**
 * Like getCurrentUser but throws if no user is signed in.
 *
 * Use in server actions and components where the absence of a user
 * is a programming error — i.e. the route should already have been
 * gated by middleware. The throw is a loud failure mode that surfaces
 * any place where middleware coverage is missing.
 */
export async function requireCurrentUser(): Promise<CurrentUser> {
  const current = await getCurrentUser();
  if (!current) {
    throw new Error(
      "[requireCurrentUser] No authenticated user — route should have been protected by middleware",
    );
  }
  return current;
}

import type { UserRole } from "@/lib/types/profiles";
import type { CurrentUser } from "./get-current-user";

/**
 * Type-safe role check. Use in server components and actions to gate
 * behavior based on user role.
 *
 * Examples:
 *   if (hasRole(currentUser, "analyst")) { ... }
 *   if (hasRole(currentUser, "analyst", "admin")) { ... }
 *
 * Returns false if currentUser is null — null users have no role.
 */
export function hasRole(
  current: CurrentUser | null,
  ...allowedRoles: UserRole[]
): boolean {
  if (!current) return false;
  return allowedRoles.includes(current.profile.role);
}

/**
 * Convenience wrapper: is this user effectively an analyst?
 *
 * Includes 'admin' because admins are a superset of analysts —
 * anything an analyst can do, an admin can also do. Partners are
 * a separate audience entirely.
 */
export const isAnalyst = (current: CurrentUser | null): boolean =>
  hasRole(current, "analyst", "admin");

/**
 * Convenience wrapper: is this user a partner?
 *
 * Note: admins are NOT partners — they're the analyst-side admin role,
 * not external. Use hasRole() directly if you need a different combination.
 */
export const isPartner = (current: CurrentUser | null): boolean =>
  hasRole(current, "partner");

/**
 * Convenience wrapper: is this user an admin?
 *
 * Admin is the superuser role within an organization. Phase 1 doesn't
 * differentiate admin from analyst in any meaningful way — admin
 * becomes load-bearing in Phase 3 (multi-tenancy management).
 */
export const isAdmin = (current: CurrentUser | null): boolean =>
  hasRole(current, "admin");

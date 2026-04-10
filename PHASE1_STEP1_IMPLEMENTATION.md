# Phase 1 — Step 1 — Auth & Profiles

> **Goal:** Lay the user/profile/organization foundation that all subsequent Phase 1 work depends on, without breaking the existing analyst workflow.
> **Status:** DRAFT — awaiting Dan's review before execution
> **Authority:** Implementation against `WORKSTATION_CARD_SPEC.md` (locked) + `DataWiseRE_Restructure_Plan.md` § 5 Phase 1 Step 1
> **Date:** 2026-04-10
> **Estimated scope:** 4 SQL migrations, 1 new file at project root, 4 new TS modules, 0 modifications to existing route or business logic code

---

## 1. What Step 1 Accomplishes

Step 1 establishes three foundational pieces that everything in Phase 1 builds on:

1. **Multi-tenancy primitive** — an `organizations` table with Dan's org as the seed row. Even though there's only one org today, every record going forward is implicitly scoped to one. This avoids a painful schema retrofit later when a second org joins.
2. **User profiles** — a `profiles` table linked 1:1 with `auth.users`, carrying role assignment (`analyst` / `partner` / `admin`), org membership, and analyst-friendly metadata (full name, avatar). Without this, we cannot differentiate user types in Phase 1 Step 4 (Partner Portal MVP).
3. **Middleware-based auth enforcement** — `middleware.ts` at the project root enforces authentication on protected routes *before* any layout renders. This is more robust than the current layout-level check (which would silently fail to protect a future route if someone forgets to add `redirect()` to a new layout).

**Step 1 explicitly does NOT do these things — they belong to later steps:**

| Out of scope | Belongs to |
|---|---|
| Adding `organization_id` columns to existing tables (real_properties, analyses, etc.) | Step 2 — RLS Scaffolding |
| Replacing the "dev authenticated full access" RLS policies on existing tables | Step 2 — RLS Scaffolding |
| Route restructure (`/deals/watchlist` → `/analysis`, etc.) | Step 3 — Route Restructure |
| Building the Workstation card UI (collapsible cards, modals, the 4-tile top row) | Step 3 — Route Restructure (paired with the route move) |
| `analysis_shares`, `partner_analysis_versions`, `partner_feedback` tables | Step 4 — Partner Portal MVP |
| Email service integration (Resend) | Step 4 — Partner Portal MVP |
| Removing the existing layout-level auth check at `app/(workspace)/layout.tsx:16` | Defense-in-depth — kept until Step 3 proves middleware works in production |

---

## 2. The #1 Constraint

**Every existing analyst workflow must keep working unchanged.** Dan is the only user, the application is in active production use for his real estate analysis work, and he cannot afford a regression. Every change in Step 1 is either purely additive (new tables, new files) or strictly augmentative (middleware *adds* protection earlier in the pipeline; the existing layout check stays as a safety net).

There is no business logic change in Step 1. No screening engine code, no ARV math, no comp loading, no UI components, no existing routes, no strategy profiles. Step 1 is auth and identity only.

---

## 3. Risk & Rollback

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Middleware misconfiguration redirects a public path to sign-in | Low | High (site appears broken) | Explicit `PUBLIC_PATHS` and `PUBLIC_PREFIXES` lists; manual verification of every public route in dev before push |
| Auto-create-profile trigger fails silently on new user signup | Low | Medium (new user has no profile, can sign in but downstream queries fail) | `requireCurrentUser()` helper raises a clear error; trigger has `ON CONFLICT (id) DO NOTHING` so retries are safe |
| Profile backfill misses a user | Very Low (only 1 user exists today) | Low | Verification step in §8 confirms profile count matches `auth.users` count |
| Session cookie refresh breaks in middleware (existing layout used `cookieStore.set` which has a try/catch) | Medium | Medium (analyst gets logged out unexpectedly) | Middleware uses the documented `@supabase/ssr` pattern; tested in dev before push |
| New migration conflicts with existing schema | Low | Medium | All new tables use `IF NOT EXISTS`; no existing table modifications in Step 1 |

**Rollback procedure (if Step 1 needs to be reverted):**

1. Revert the application code commit (middleware + helpers) — restores layout-only auth
2. Run a down migration that drops `profiles`, `organizations`, and the trigger
3. Existing data is unaffected because no existing tables were modified

The Git checkpoint `checkpoint-pre-phase5` created on 2026-04-10 remains the ultimate fallback if anything goes catastrophically wrong.

---

## 4. Schema Design

Four new SQL migrations, applied in order. Each is independently testable.

### 4.1 Migration: Create `organizations` table

**File:** `supabase/migrations/<ts>_create_organizations.sql`

```sql
-- Create the organizations table — multi-tenancy primitive.
-- Every other table will eventually carry organization_id for RLS scoping
-- (Step 2). For now, only one row exists: Dan's org.

CREATE TABLE IF NOT EXISTS public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  market text,
  logo_url text,
  strategy_profile_slug text NOT NULL DEFAULT 'denver_flip_v1',
  mls_agreement_confirmed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER organizations_set_updated_at
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

-- Step 1 policy: any authenticated user can read all organizations.
-- Step 2 will tighten this so users only see their own org's row.
CREATE POLICY "organizations_authenticated_read"
  ON public.organizations
  FOR SELECT
  TO authenticated
  USING (true);

-- Seed Dan's organization. Use a query-by-slug strategy for the
-- profile backfill in migration 3 so we don't need to hardcode UUIDs.
INSERT INTO public.organizations (name, slug, market, strategy_profile_slug, mls_agreement_confirmed)
VALUES (
  'DataWiseRE',
  'datawisere',
  'denver',
  'denver_flip_v1',
  true
);
```

**Verification after running:**
```sql
SELECT id, name, slug, market FROM organizations;
-- Expect exactly 1 row: DataWiseRE / datawisere / denver
```

### 4.2 Migration: Create `profiles` table

**File:** `supabase/migrations/<ts>_create_profiles.sql`

```sql
-- Create the profiles table — 1:1 with auth.users.
-- Carries role assignment, org membership, and metadata for the
-- analyst/partner/admin model that Phase 1 introduces.

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

CREATE INDEX profiles_organization_id_idx ON public.profiles(organization_id);
CREATE INDEX profiles_email_idx ON public.profiles(email);
CREATE INDEX profiles_role_idx ON public.profiles(role);

CREATE TRIGGER profiles_set_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Step 1 policies — minimum to support analyst workflows:
-- 1. Users can read their own profile
-- 2. Users can update limited fields on their own profile (full_name, avatar_url)
-- Step 2 will add: analysts can read other profiles in their org (for sharing UI)
-- Step 4 will add: partners can be visible to analysts who shared with them

CREATE POLICY "profiles_read_own"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (id = auth.uid());

CREATE POLICY "profiles_update_own"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());
```

**Note on the WITH CHECK clause:** prevents a user from updating their own profile to point at a different `id` (impossible anyway because of the PK constraint, but explicit defense). It does NOT prevent updating `role` or `organization_id` — those need a stricter Step 2 policy that only allows changes by an admin in the same org. For Step 1 we accept the minor risk because the only user is Dan and he can't accidentally upgrade himself to admin (he'd need to do it manually).

### 4.3 Migration: Backfill profiles for existing `auth.users`

**File:** `supabase/migrations/<ts>_backfill_existing_profiles.sql`

```sql
-- One-time backfill: create a profile row for every existing auth.users
-- that doesn't already have one. In practice this is a single-row
-- insert for Dan, but the query is idempotent and will safely run
-- against any future state.

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
```

**Verification after running:**
```sql
-- Should return the same count
SELECT COUNT(*) AS auth_users_count FROM auth.users;
SELECT COUNT(*) AS profiles_count FROM profiles;

-- Confirm Dan's profile exists with correct org
SELECT p.email, p.role, p.full_name, o.slug AS org_slug
FROM profiles p
JOIN organizations o ON p.organization_id = o.id
WHERE p.email LIKE '%datawisere%' OR p.email LIKE '%dan%';
```

### 4.4 Migration: Auto-create profile trigger on new `auth.users` INSERT

**File:** `supabase/migrations/<ts>_profiles_auto_create_trigger.sql`

```sql
-- Trigger that creates a profile row automatically when a new user
-- signs up via Supabase Auth. Eliminates race conditions and ensures
-- every authenticated user has a corresponding profile.
--
-- For Step 1 / Step 2, all new users default to:
--   - organization: Dan's org (datawisere)
--   - role: analyst
--
-- Step 4 (Partner Portal MVP) will enhance this trigger to read
-- raw_user_meta_data->>'role' and 'organization_slug' so the
-- partner sign-up flow can route new users into the partner role
-- and the correct org.

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_default_org_id uuid;
  v_role text;
  v_org_slug text;
BEGIN
  -- Extract role and org from raw_user_meta_data if provided by sign-up flow.
  -- Falls back to analyst + default org if metadata is missing (Step 1 behavior).
  v_role := COALESCE(NEW.raw_user_meta_data->>'role', 'analyst');
  v_org_slug := COALESCE(NEW.raw_user_meta_data->>'organization_slug', 'datawisere');

  SELECT id INTO v_default_org_id
  FROM public.organizations
  WHERE slug = v_org_slug
  LIMIT 1;

  IF v_default_org_id IS NULL THEN
    RAISE EXCEPTION 'No organization found for slug % during user profile creation', v_org_slug;
  END IF;

  INSERT INTO public.profiles (id, organization_id, role, full_name, email)
  VALUES (
    NEW.id,
    v_default_org_id,
    v_role,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.email
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();
```

**Why `SECURITY DEFINER`:** the trigger needs to write to `public.profiles` but the calling user (a fresh signup) doesn't yet have any privileges. `SECURITY DEFINER` runs the trigger with the privileges of the function owner (postgres / service_role), which can insert.

**Why `SET search_path = public`:** prevents search_path injection attacks, a known concern for `SECURITY DEFINER` functions.

**Verification after running:**
```sql
-- Trigger exists
SELECT trigger_name, event_object_table
FROM information_schema.triggers
WHERE trigger_name = 'on_auth_user_created';

-- Function exists
SELECT proname FROM pg_proc WHERE proname = 'handle_new_auth_user';
```

### 4.5 Migration ordering

The four migrations must apply in this order (the timestamps in the filenames will enforce it):

```
20260411090000_create_organizations.sql
20260411090100_create_profiles.sql
20260411090200_backfill_existing_profiles.sql
20260411090300_profiles_auto_create_trigger.sql
```

Filename timestamps will be assigned at the moment of creation to be slightly past `20260409120000` (the most recent migration in the repo). I'll pick the actual timestamps when writing the files.

---

## 5. Application Code Changes

Six new files, zero modifications to existing route or business logic code. The middleware adds protection but doesn't remove the existing layout-level auth check (defense in depth).

### 5.1 New file: `middleware.ts` at project root

```typescript
import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Public paths that bypass authentication entirely.
 * Anything not in this list (and not matching a public prefix) requires auth.
 */
const PUBLIC_PATHS = new Set<string>([
  "/",
  "/offerings",
  "/methodology",
  "/contact",
  "/auth/sign-in",
]);

const PUBLIC_PREFIXES: readonly string[] = [
  "/_next",
  "/api/public",          // future: public API for partner portal
  "/share/",              // future: tokenized share links (Phase 1 Step 4)
] as const;

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return true;
  return PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Public paths bypass auth entirely.
  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  // Set up Supabase client with cookie management compatible with
  // Next.js App Router middleware.
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Authenticate. Use getUser() — NOT getSession() — because getUser()
  // verifies the JWT against the Supabase server, which is the secure path.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const signInUrl = new URL("/auth/sign-in", request.url);
    signInUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(signInUrl);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon)
     * - common image extensions (svg, png, jpg, jpeg, gif, webp)
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
```

**Key design decisions:**

1. **Uses `getUser()`, not `getSession()`** — `getUser()` verifies the JWT against the Supabase server on every request, which is secure. `getSession()` only reads the cookie locally and could be spoofed by a client with a stale or forged cookie.
2. **Cookie management uses the documented `@supabase/ssr` middleware pattern** — `setAll` writes to both `request.cookies` (so subsequent middleware/route handlers see them) and `response.cookies` (so the browser receives them). This handles session refresh correctly.
3. **`PUBLIC_PATHS` is explicit, not pattern-based** — every public path is enumerated. New routes are private by default.
4. **Returns the existing `response` object** — this preserves any cookies that Supabase set during the auth check (session refresh tokens, etc.).
5. **Redirects to `/auth/sign-in` with a `next` query param** — when sign-in succeeds, the sign-in page can redirect back to the original destination.

### 5.2 New file: `lib/auth/get-current-user.ts`

```typescript
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export type UserRole = "analyst" | "partner" | "admin";

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
 * if no user is signed in. Cached per React request lifecycle so
 * multiple component or action calls share a single DB lookup.
 *
 * Use this in server components, server actions, and route handlers
 * where you need either the user's identity or their role.
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
      "[getCurrentUser] User has no profile row — trigger may have failed",
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
 * Like getCurrentUser but throws if no user is signed in. Use in
 * server actions and components where the absence of a user is
 * a programming error (the route should have been gated by middleware).
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
```

**Why `cache()`:** React's `cache()` memoizes the function result for the duration of a single request. If three different server components in one page render call `getCurrentUser()`, they all share one DB lookup. This matters because Phase 1 Step 4 will introduce many more components that need the current user's role.

### 5.3 New file: `lib/auth/has-role.ts`

```typescript
import type { UserRole, CurrentUser } from "./get-current-user";

/**
 * Type-safe role check. Use in server components and actions to
 * gate behavior based on user role.
 *
 * Examples:
 *   if (hasRole(currentUser, "analyst")) { ... }
 *   if (hasRole(currentUser, "analyst", "admin")) { ... }
 */
export function hasRole(
  current: CurrentUser | null,
  ...allowedRoles: UserRole[]
): boolean {
  if (!current) return false;
  return allowedRoles.includes(current.profile.role);
}

/**
 * Convenience wrappers for common role checks.
 */
export const isAnalyst = (current: CurrentUser | null) =>
  hasRole(current, "analyst", "admin");

export const isPartner = (current: CurrentUser | null) =>
  hasRole(current, "partner");

export const isAdmin = (current: CurrentUser | null) =>
  hasRole(current, "admin");
```

**Why `isAnalyst` includes `admin`:** admins are a superset of analysts. Anything an analyst can do, an admin can also do. Partners are a separate audience entirely.

### 5.4 New file: `lib/types/profiles.ts`

```typescript
/**
 * Database type for the profiles table. Mirrors the migration in
 * supabase/migrations/<ts>_create_profiles.sql.
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

export type ProfileInsert = {
  id: string;
  organization_id: string;
  role?: UserRole;
  full_name?: string | null;
  email: string;
  avatar_url?: string | null;
};

export type ProfileUpdate = Partial<Pick<ProfileRow, "full_name" | "avatar_url">>;
```

### 5.5 New file: `lib/types/organizations.ts`

```typescript
/**
 * Database type for the organizations table. Mirrors the migration in
 * supabase/migrations/<ts>_create_organizations.sql.
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
```

### 5.6 Sign-in page — honor the `?next=` redirect

Per Dan's answer to question 11.2 ("lean toward the better user experience"), the sign-in page is updated as part of Step 1 to honor the `?next=` query param the middleware sets. This means after a successful sign-in, the user lands back on the page they were trying to reach, not always on `/home`.

**File:** `app/auth/sign-in/page.tsx` (small modification — read query param, validate, redirect)

**Change shape:**

```typescript
// Add to imports
import { useSearchParams } from "next/navigation";

// Inside the component
const searchParams = useSearchParams();

// Validate the next param to prevent open-redirect attacks.
// Only allow internal paths starting with a single slash.
function safeNextPath(raw: string | null): string {
  if (!raw) return "/home";
  // Must start with exactly one slash (not //, which is protocol-relative)
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/home";
  // No protocol injection, no backslash tricks
  if (raw.includes("\\")) return "/home";
  return raw;
}

// In the success handler — replace the existing router.push("/home")
const next = safeNextPath(searchParams.get("next"));
router.push(next);
```

**Security notes (worth understanding for any sign-in redirect feature):**

- An open redirect happens when a sign-in page accepts an arbitrary URL in a query param and redirects to it after auth. An attacker can send a victim a link like `https://datawisere.com/auth/sign-in?next=https://evil.com/fake-login`, the victim signs in, gets redirected to the attacker's site, and may not notice the domain change. This is a real attack vector — phishing campaigns use it constantly.
- The `safeNextPath` validator prevents this by:
  - Defaulting to `/home` if no `next` param is provided
  - Requiring the path to start with a single forward slash (so `https://evil.com` is rejected because it doesn't start with `/`)
  - Rejecting `//evil.com` because it starts with TWO slashes (a protocol-relative URL the browser would interpret as `https://evil.com`)
  - Rejecting any path containing a backslash (Windows-style path tricks that some browsers normalize)
- The result: only paths within the DataWiseRE site are accepted as redirect destinations.

The middleware is the only thing that sets `?next=` legitimately, and it always sets a path that starts with `/`. The validator is defense against the case where someone manually crafts a malicious URL.

---

## 6. Ordered Task List

Each task is a discrete, verifiable unit. Execute in order. Each task is independently committable.

### Phase A — Schema (4 commits)

**Task 1:** Create `supabase/migrations/<ts>_create_organizations.sql` with the SQL from §4.1. Run `npx supabase db push --dry-run` to verify, then `npx supabase db push`. Verify the seed row exists.
- File: `supabase/migrations/<ts>_create_organizations.sql` (new)
- Verification: `SELECT * FROM organizations;` returns 1 row

**Task 2:** Create `supabase/migrations/<ts>_create_profiles.sql` with the SQL from §4.2. Run dry-run, push, verify.
- File: `supabase/migrations/<ts>_create_profiles.sql` (new)
- Verification: Table exists, indexes exist, RLS enabled

**Task 3:** Create `supabase/migrations/<ts>_backfill_existing_profiles.sql` with the SQL from §4.3. Run dry-run, push, verify.
- File: `supabase/migrations/<ts>_backfill_existing_profiles.sql` (new)
- Verification: `SELECT count(*) FROM auth.users` equals `SELECT count(*) FROM profiles`. Dan's profile exists with role='analyst'.

**Task 4:** Create `supabase/migrations/<ts>_profiles_auto_create_trigger.sql` with the SQL from §4.4. Run dry-run, push, verify.
- File: `supabase/migrations/<ts>_profiles_auto_create_trigger.sql` (new)
- Verification: Trigger exists in `information_schema.triggers`. (Functional verification of the trigger waits until Phase B.)

**Commit message convention:** `migration: <action>` — e.g., `migration: create organizations table with seed row`.

### Phase B — Application code (4 commits or 1 batched)

**Task 5:** Add type definitions.
- File: `lib/types/organizations.ts` (new)
- File: `lib/types/profiles.ts` (new)
- Verification: `npm run build` passes with no type errors

**Task 6:** Add the auth helpers.
- File: `lib/auth/get-current-user.ts` (new)
- File: `lib/auth/has-role.ts` (new)
- Verification: `npm run build` passes

**Task 7:** Add the middleware.
- File: `middleware.ts` (new, project root)
- Verification: dev server starts cleanly; manually test:
  - Public route (e.g., `/offerings`) loads without sign-in
  - Protected route (e.g., `/home`) redirects to `/auth/sign-in?next=/home` when not signed in
  - After sign-in, accessing `/home` succeeds

**Task 7b:** Update the sign-in page to honor `?next=` per §5.6.
- File: `app/auth/sign-in/page.tsx` (small edit)
- Verification:
  - Sign out, hit `/screening`, get redirected to `/auth/sign-in?next=/screening`
  - Sign in, land on `/screening` (NOT `/home`)
  - Sign out, hit `/auth/sign-in` directly with no `next` param, sign in, land on `/home` (default behavior preserved)
  - Try a malicious `?next=//evil.com` — should be rejected and fall back to `/home`

**Task 8:** Manual verification + smoke test of all existing analyst flows.
- No code change.
- Run through the verification checklist in §8.

**Commit message convention:** `auth: <action>` — e.g., `auth: add middleware and current-user helpers`.

### Phase C — Verification & merge (1 commit)

**Task 9:** Update `CHANGELOG.md` with a Phase 1 Step 1 entry. Create a Git tag `phase1-step1-complete` once all verification passes.

---

## 7. Files Touched

| File | Type | Why |
|---|---|---|
| `supabase/migrations/<ts>_create_organizations.sql` | NEW | Creates organizations table + seed |
| `supabase/migrations/<ts>_create_profiles.sql` | NEW | Creates profiles table + RLS |
| `supabase/migrations/<ts>_backfill_existing_profiles.sql` | NEW | Backfills existing auth.users |
| `supabase/migrations/<ts>_profiles_auto_create_trigger.sql` | NEW | Auto-create profile on user signup |
| `middleware.ts` | NEW (project root) | Middleware-based auth enforcement |
| `lib/auth/get-current-user.ts` | NEW | Server-side current user helper |
| `lib/auth/has-role.ts` | NEW | Type-safe role checks |
| `lib/types/profiles.ts` | NEW | TypeScript types for profiles table |
| `lib/types/organizations.ts` | NEW | TypeScript types for organizations table |
| `CHANGELOG.md` | EDIT | Phase 1 Step 1 entry |
| `app/(workspace)/layout.tsx` | NOT MODIFIED | Existing layout-level auth check stays as defense in depth |
| `app/auth/sign-in/page.tsx` | EDIT (small) | Honor `?next=` query param with safe-redirect validation per §5.6 |
| `lib/supabase/server.ts` | NOT MODIFIED | Existing client config unchanged |
| Any existing route, component, or business logic file | NOT MODIFIED | Step 1 is purely additive |

---

## 8. Verification Checklist

Run through this manually in dev mode after Phase B is complete. Every box must be checked before declaring Step 1 done.

### Schema verification

- [ ] `organizations` table exists in Supabase dashboard
- [ ] One row in `organizations` with slug `datawisere`
- [ ] `profiles` table exists in Supabase dashboard
- [ ] `SELECT count(*) FROM auth.users` equals `SELECT count(*) FROM profiles`
- [ ] Dan's profile row has `role = 'analyst'` and `organization_id` pointing at datawisere
- [ ] Trigger `on_auth_user_created` exists on `auth.users`
- [ ] Trigger function `public.handle_new_auth_user` exists
- [ ] RLS is enabled on both new tables
- [ ] `set_updated_at` triggers fire on UPDATE for both tables

### Middleware verification

- [ ] `middleware.ts` exists at project root
- [ ] `npm run build` passes with no type errors
- [ ] `npm run dev` starts the dev server cleanly
- [ ] Hitting `/` (root) loads the marketing homepage without redirecting
- [ ] Hitting `/offerings` loads without redirecting
- [ ] Hitting `/methodology` loads without redirecting
- [ ] Hitting `/contact` loads without redirecting
- [ ] Hitting `/auth/sign-in` loads without redirecting
- [ ] Sign out (or open in incognito); hit `/home` → redirected to `/auth/sign-in?next=/home`
- [ ] Sign out; hit `/intake/imports` → redirected to sign-in
- [ ] Sign out; hit `/screening` → redirected to sign-in
- [ ] Sign out; hit `/deals/watchlist` → redirected to sign-in
- [ ] Sign out; hit `/admin/properties` → redirected to sign-in
- [ ] Sign in; all of the above routes load successfully

### Auth helper verification

- [ ] In a server component or action, calling `getCurrentUser()` returns the expected profile
- [ ] Calling `getCurrentUser()` twice in the same request doesn't trigger a second DB query (cached)
- [ ] `requireCurrentUser()` throws cleanly if called without a session

### Existing analyst workflow verification (THE CRITICAL PART)

These all must work exactly as they did before Step 1. If any one breaks, do not declare Step 1 complete.

- [ ] **Sign in** works
- [ ] **/home** dashboard loads with the daily metrics
- [ ] **/intake/imports** — upload a small test CSV, see preview, process it
- [ ] **/intake/manual** — open the manual property form
- [ ] **/screening** — screening queue loads with current results
- [ ] **/screening/[batchId]** — open a recent batch, see results
- [ ] **/screening/[batchId]/[resultId]** — open a specific result detail
- [ ] **/deals/watchlist** — Watch List loads with all promoted properties
- [ ] **/deals/watchlist/[analysisId]** — open the Workstation, comp map renders, deal math is correct
- [ ] **/deals/pipeline** — pipeline loads
- [ ] **/deals/closed** — closed deals load
- [ ] **/reports** — report library loads
- [ ] **/admin/properties** — properties browser loads
- [ ] **Open ScreeningCompModal** from the screening queue → modal renders, comps display correctly
- [ ] **Promote a property** from the modal → analysis is created, redirects to workstation
- [ ] **Save manual analysis overrides** in the workstation → values persist
- [ ] **Save pipeline status** in the workstation → values persist
- [ ] **Generate a report** → report PDF appears in the library
- [ ] **Sign out** works and clears the session

### Production-readiness check

- [ ] No console errors in the browser dev tools while signed in
- [ ] No 401s or 403s in the network tab for normal operations
- [ ] Session persists across page reloads
- [ ] Session refreshes automatically after the JWT expiry window

---

## 9. Definition of Done

Step 1 is complete when **every box in §8 is checked** AND:

1. All four migration files are committed to `supabase/migrations/`
2. All six new application files are committed
3. `CHANGELOG.md` has a Phase 1 Step 1 entry
4. The Git tag `phase1-step1-complete` has been created and pushed
5. A short verification note has been left in the chat confirming nothing in the existing analyst workflow regressed

---

## 10. What Step 2 Builds On Top

Step 1 is the foundation. Step 2 (RLS Scaffolding) will use it as follows:

- Add `organization_id` columns to all core tables (`real_properties`, `screening_batches`, `screening_results`, `analyses`, etc.)
- Backfill: set every existing row to Dan's org id
- Replace the "dev authenticated full access" RLS policies with org-scoped policies that join to `profiles` to determine the current user's org
- Test extensively that existing analyst workflows still work end-to-end

Step 2 is the riskier step because it touches existing tables and changes how every query is filtered. Step 1 needs to be rock-solid before Step 2 begins.

Step 3 (Route Restructure) will then move the Workstation to `/analysis/[analysisId]` and start building the card layout from `WORKSTATION_CARD_SPEC.md`. By the time Step 3 starts, the spec, the schema scaffolding, and the auth model will all be in place.

Step 4 (Partner Portal MVP) is when the partner role actually gets used — the auto-create-profile trigger will be enhanced to read `raw_user_meta_data->>'role'` and route partner sign-ups into the partner role automatically.

---

## 11. Open Questions — RESOLVED

1. 🟢 **Org name:** `DataWiseRE` / slug `datawisere`. Confirmed by Dan 2026-04-10.

2. 🟢 **Sign-in `?next=` redirect:** Included in Step 1 scope per §5.6. Dan: *"I would lean toward the better user experience."* The sign-in page reads the query param, validates it (open-redirect protection), and redirects to it on successful sign-in.

---

*Drafted by Claude Opus | 2026-04-10 | Awaiting Dan's review before execution*

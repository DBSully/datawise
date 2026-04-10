// proxy.ts
//
// Phase 1 Step 1 — Task 7
//
// Next.js 16's renamed-from-middleware request interceptor.
// Handles two responsibilities on every matching request:
//
//   1. Refresh the Supabase session cookie (always, even on public paths)
//   2. Enforce authentication on protected routes
//
// The order matters: session refresh runs first so a signed-in user
// browsing public marketing pages still gets their session kept alive.
// Only after the refresh do we make the auth/redirect decision.
//
// Defense in depth: the existing layout-level auth check at
// app/(workspace)/layout.tsx is intentionally KEPT as a backstop
// until this proxy-based enforcement is proven in production use.
//
// See PHASE1_STEP1_IMPLEMENTATION.md §5.1 for the full design.

import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

/**
 * Public paths that bypass authentication entirely.
 * Anything not in this set (and not matching a public prefix) requires auth.
 *
 * Add new public routes here explicitly. Routes are private by default.
 */
const PUBLIC_PATHS = new Set<string>([
  "/",
  "/offerings",
  "/methodology",
  "/contact",
  "/auth/sign-in",
]);

/**
 * Public path prefixes — anything starting with these is considered public.
 * Use sparingly; explicit PUBLIC_PATHS entries are preferred.
 */
const PUBLIC_PREFIXES: readonly string[] = [
  "/_next",      // Next.js internals (chunks, hot reload)
  "/api/public", // future: public API endpoints (Phase 1 Step 4)
  "/share/",     // future: tokenized share links (Phase 1 Step 4)
] as const;

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return true;
  return PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Always refresh the session first — even on public paths — so a
  // signed-in user reading marketing content doesn't have their session
  // expire while they browse.
  const { response, user } = await updateSession(request);

  // Public paths bypass the auth gate but still benefit from the
  // session refresh above.
  if (isPublicPath(pathname)) {
    return response;
  }

  // Protected paths require an authenticated user.
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

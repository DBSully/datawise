// lib/supabase/proxy.ts
//
// Phase 1 Step 1 — Task 7
//
// Refreshes the Supabase session cookie on every request and returns
// both the response (with refreshed cookies) and the authenticated
// user (or null). The orchestrator at proxy.ts uses the user value
// to gate protected routes.
//
// This is the standard @supabase/ssr Next.js pattern: the cookie
// trick relies on `let response` being closed over by the setAll
// callback, which reassigns it to a fresh NextResponse whenever
// Supabase needs to write refreshed cookies. By the time getUser()
// resolves, `response` points to the newest version with all cookie
// updates applied.

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { User } from "@supabase/supabase-js";

export type UpdateSessionResult = {
  response: NextResponse;
  user: User | null;
};

export async function updateSession(
  request: NextRequest,
): Promise<UpdateSessionResult> {
  let response = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });

          response = NextResponse.next({
            request,
          });

          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  // getUser() — NOT getSession() — verifies the JWT against the
  // Supabase server, which is the secure path. getSession() reads
  // the cookie locally without server verification and could be
  // spoofed by a client with a stale or forged cookie.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { response, user };
}

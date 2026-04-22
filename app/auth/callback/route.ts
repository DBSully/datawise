// /app/auth/callback/route.ts
//
// Server route handler for the Supabase PKCE auth callback.
//
// Used by:
//   - signup email-confirmation links (redirectTo set by the signUp call)
//   - any future magic-link / OAuth flows that land here
//
// Password recovery does NOT use this handler — the recovery flow lands
// directly on /auth/reset-password, which performs its own
// exchangeCodeForSession so the user can set a new password in place.
//
// Contract:
//   - ?code=<pkce code>   required; exchanged for a session
//   - ?next=<path>        optional; post-confirmation destination
//   - ?error=<desc>       present when Supabase could not verify the link
//
// On success we look up the user's role (analyst vs partner) and send
// them to /dashboard or /portal respectively, mirroring the post-login
// routing on the sign-in page.

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

function safeNextPath(raw: string | null, fallback: string): string {
  if (!raw) return fallback;
  if (!raw.startsWith("/") || raw.startsWith("//")) return fallback;
  if (raw.includes("\\")) return fallback;
  return raw;
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const nextParam = searchParams.get("next");
  const errorDescription =
    searchParams.get("error_description") ?? searchParams.get("error");

  if (errorDescription) {
    const signInUrl = new URL("/auth/sign-in", origin);
    signInUrl.searchParams.set("error", errorDescription);
    return NextResponse.redirect(signInUrl);
  }

  if (!code) {
    return NextResponse.redirect(new URL("/auth/sign-in", origin));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    const signInUrl = new URL("/auth/sign-in", origin);
    signInUrl.searchParams.set("error", error.message);
    return NextResponse.redirect(signInUrl);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL("/auth/sign-in", origin));
  }

  // Auth-flow destinations (e.g. /auth/reset-password) are role-agnostic:
  // any authenticated user can legitimately land there to complete a
  // recovery or email-change flow. Skip role routing in that case.
  if (nextParam && nextParam.startsWith("/auth/")) {
    return NextResponse.redirect(
      new URL(safeNextPath(nextParam, "/dashboard"), origin),
    );
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const role = profile?.role ?? "partner";

  if (role === "partner") {
    const dest = safeNextPath(nextParam, "/portal");
    const finalDest = dest.startsWith("/portal") ? dest : "/portal";
    return NextResponse.redirect(new URL(finalDest, origin));
  }

  return NextResponse.redirect(
    new URL(safeNextPath(nextParam, "/dashboard"), origin),
  );
}

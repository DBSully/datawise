// /app/auth/sign-in/page.tsx

"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Validates a `?next=` query param value to prevent open-redirect attacks.
 * Falls back to the provided default path in any rejected case.
 */
function safeNextPath(raw: string | null, fallback: string): string {
  if (!raw) return fallback;
  if (!raw.startsWith("/") || raw.startsWith("//")) return fallback;
  if (raw.includes("\\")) return fallback;
  return raw;
}

/**
 * Determine post-login destination by user role.
 * Partners always go to /portal (even if ?next= points to a workspace route).
 * Analysts honor ?next= and fall back to /dashboard.
 */
async function getPostLoginPath(
  supabase: ReturnType<typeof createClient>,
  nextParam: string | null,
): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return "/auth/sign-in";

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const role = profile?.role ?? "partner";

  if (role === "partner") {
    // Partners can go to /portal/* paths via ?next=, but never workspace routes
    const next = safeNextPath(nextParam, "/portal");
    return next.startsWith("/portal") ? next : "/portal";
  }

  // Analysts honor ?next= fully, fall back to /dashboard
  return safeNextPath(nextParam, "/dashboard");
}

/**
 * Wrapper required by Next.js: useSearchParams() in a client component
 * page must be inside a Suspense boundary so the page can be statically
 * pre-rendered without blocking on the URL params resolving.
 */
export default function SignInPage() {
  return (
    <Suspense fallback={<SignInLoadingFallback />}>
      <SignInPageInner />
    </Suspense>
  );
}

function SignInLoadingFallback() {
  return (
    <main className="mx-auto max-w-md px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
        Sign in to DataWise
      </h1>
      <p className="mt-3 text-slate-600">Loading...</p>
    </main>
  );
}

function SignInPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [loadingAction, setLoadingAction] = useState<
    "signin" | "signup" | null
  >(null);

  async function handleSignIn(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoadingAction("signin");
    setErrorMessage(null);
    setInfoMessage(null);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setLoadingAction(null);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    // Determine post-login destination by role.
    // Partners → /portal, analysts → /dashboard (or ?next= target).
    const destination = await getPostLoginPath(supabase, searchParams.get("next"));
    router.push(destination);
    router.refresh();
  }

  async function handleSignUp() {
    setLoadingAction("signup");
    setErrorMessage(null);
    setInfoMessage(null);

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    });

    setLoadingAction(null);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    if (data.session) {
      const destination = await getPostLoginPath(supabase, searchParams.get("next"));
      router.push(destination);
      router.refresh();
      return;
    }

    setInfoMessage(
      "Account created. If email confirmation is enabled, check your inbox and confirm your signup before signing in.",
    );
  }

  return (
    <main className="mx-auto max-w-md px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
        Sign in to DataWise
      </h1>
      <p className="mt-3 text-slate-600">
        Create your account once, then use it to access protected tables.
      </p>

      <form
        onSubmit={handleSignIn}
        className="mt-8 space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Email
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
            required
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Password
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
            required
          />
        </div>

        {errorMessage ? (
          <p className="text-sm text-red-600">{errorMessage}</p>
        ) : null}

        {infoMessage ? (
          <p className="text-sm text-slate-600">{infoMessage}</p>
        ) : null}

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={loadingAction !== null}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {loadingAction === "signin" ? "Signing in..." : "Sign in"}
          </button>

          <button
            type="button"
            onClick={handleSignUp}
            disabled={loadingAction !== null}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-900 disabled:opacity-50"
          >
            {loadingAction === "signup" ? "Creating account..." : "Sign up"}
          </button>
        </div>
      </form>
    </main>
  );
}

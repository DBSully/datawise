// /app/auth/sign-in/page.tsx

"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Validates a `?next=` query param value to prevent open-redirect attacks.
 *
 * Open redirects let attackers craft links like
 *   https://datawisere.com/auth/sign-in?next=https://evil.com/fake-login
 * The victim signs in, gets bounced to the attacker's site, and may not
 * notice the domain change. The validator below only accepts internal
 * paths starting with exactly one forward slash.
 *
 * Rejected:
 *   - null / empty                  (no param)
 *   - https://evil.com              (doesn't start with /)
 *   - //evil.com                    (protocol-relative URL)
 *   - /\evil                        (backslash injection)
 *
 * Falls back to /home in any rejected case.
 */
function safeNextPath(raw: string | null): string {
  if (!raw) return "/home";
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/home";
  if (raw.includes("\\")) return "/home";
  return raw;
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

    // Honor the ?next= query param the proxy sets when redirecting
    // unauthenticated users. Falls back to /home if not provided
    // or if the param fails open-redirect validation.
    router.push(safeNextPath(searchParams.get("next")));
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

    // If Confirm Email is OFF, Supabase usually gives you a session immediately.
    // If Confirm Email is ON, you may get a user but no active session yet.
    if (data.session) {
      // Same ?next= handling as sign-in: a partner who signs up after
      // following a share link should land on the shared deal, not /home.
      router.push(safeNextPath(searchParams.get("next")));
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

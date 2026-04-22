// /app/auth/reset-password/page.tsx

"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Password-reset form.
 *
 * By the time the user lands here, /auth/callback has already exchanged
 * the PKCE recovery code server-side and set the session cookies. This
 * page just needs to:
 *
 *   1. Confirm a session exists (defense against direct navigation)
 *   2. Accept a new password and call updateUser({ password })
 *
 * The server-side exchange is essential because @supabase/ssr stores
 * the PKCE code verifier in an HTTP-only cookie that the browser
 * client cannot read — attempting exchangeCodeForSession in the
 * browser fails with "PKCE code verifier not found in storage."
 */
export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<ResetPasswordLoadingFallback />}>
      <ResetPasswordPageInner />
    </Suspense>
  );
}

function ResetPasswordLoadingFallback() {
  return (
    <main className="mx-auto max-w-md px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
        Set a new password
      </h1>
      <p className="mt-3 text-slate-600">Loading...</p>
    </main>
  );
}

function ResetPasswordPageInner() {
  const supabase = createClient();
  const router = useRouter();

  const [sessionStatus, setSessionStatus] = useState<
    "checking" | "ready" | "missing"
  >("checking");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    let cancelled = false;

    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setSessionStatus(data.session ? "ready" : "missing");
    });

    return () => {
      cancelled = true;
    };
  }, [supabase]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrorMessage(null);

    if (password.length < 6) {
      setErrorMessage("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setErrorMessage("Passwords do not match.");
      return;
    }

    setSubmitting(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSubmitting(false);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    setSuccess(true);
  }

  return (
    <main className="mx-auto max-w-md px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
        Set a new password
      </h1>

      {success ? (
        <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm text-slate-700">
            Your password has been updated.
          </p>
          <div className="mt-4 flex gap-3">
            <button
              type="button"
              onClick={() => {
                router.push("/dashboard");
                router.refresh();
              }}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white"
            >
              Go to dashboard
            </button>
            <Link
              href="/auth/sign-in"
              className="text-sm font-medium text-slate-700 underline"
            >
              Back to sign in
            </Link>
          </div>
        </div>
      ) : sessionStatus === "missing" ? (
        <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm text-red-600">
            No active recovery session found. Your reset link may have
            expired, or you may have navigated here directly.
          </p>
          <div className="mt-4">
            <Link
              href="/auth/forgot-password"
              className="text-sm font-medium text-slate-900 underline"
            >
              Request a new reset link
            </Link>
          </div>
        </div>
      ) : (
        <>
          <p className="mt-3 text-slate-600">
            Enter a new password for your account.
          </p>

          {sessionStatus === "checking" ? (
            <p className="mt-4 text-sm text-slate-600">
              Verifying recovery session&hellip;
            </p>
          ) : null}

          <form
            onSubmit={handleSubmit}
            className="mt-8 space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
          >
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                New password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
                required
                minLength={6}
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Confirm new password
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
                required
                minLength={6}
              />
            </div>

            {errorMessage ? (
              <p className="text-sm text-red-600">{errorMessage}</p>
            ) : null}

            <div className="flex items-center justify-between gap-3">
              <button
                type="submit"
                disabled={submitting || sessionStatus !== "ready"}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {submitting ? "Updating..." : "Update password"}
              </button>

              <Link
                href="/auth/sign-in"
                className="text-sm font-medium text-slate-700 underline"
              >
                Back to sign in
              </Link>
            </div>
          </form>
        </>
      )}
    </main>
  );
}

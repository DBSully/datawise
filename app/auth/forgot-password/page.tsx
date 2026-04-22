// /app/auth/forgot-password/page.tsx

"use client";

import Link from "next/link";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function ForgotPasswordPage() {
  const supabase = createClient();

  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setErrorMessage(null);

    // redirectTo must be an exact-match URL in the Supabase dashboard's
    // Auth → URL Configuration → Redirect URLs allowlist. Using
    // window.location.origin keeps local dev (localhost:3000) and the
    // deployed site pointing at the same relative callback.
    //
    // Route through /auth/callback (server route handler) so the PKCE
    // code exchange runs server-side where @supabase/ssr stores the
    // verifier cookie. The callback then forwards the user to
    // /auth/reset-password with the recovery session already set.
    const redirectTo = `${window.location.origin}/auth/callback?next=/auth/reset-password`;

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo,
    });

    setSubmitting(false);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    setSent(true);
  }

  return (
    <main className="mx-auto max-w-md px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
        Reset your password
      </h1>
      <p className="mt-3 text-slate-600">
        Enter the email on your account. We&apos;ll send you a link to set a
        new password.
      </p>

      {sent ? (
        <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm text-slate-700">
            If an account exists for <span className="font-medium">{email}</span>,
            a password reset email has been sent. Check your inbox (and spam
            folder) for a message from Supabase, then follow the link to set a
            new password.
          </p>
          <div className="mt-4">
            <Link
              href="/auth/sign-in"
              className="text-sm font-medium text-slate-900 underline"
            >
              Back to sign in
            </Link>
          </div>
        </div>
      ) : (
        <form
          onSubmit={handleSubmit}
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

          {errorMessage ? (
            <p className="text-sm text-red-600">{errorMessage}</p>
          ) : null}

          <div className="flex items-center justify-between gap-3">
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {submitting ? "Sending..." : "Send reset link"}
            </button>

            <Link
              href="/auth/sign-in"
              className="text-sm font-medium text-slate-700 underline"
            >
              Back to sign in
            </Link>
          </div>
        </form>
      )}
    </main>
  );
}

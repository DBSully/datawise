// Service-role Supabase client — bypasses RLS entirely.
//
// SECURITY: this client has FULL database access. Use it ONLY in
// server-side code where the authorization boundary is enforced by
// application logic (e.g., the share_token lookup in the partner
// portal). NEVER use this client in "use client" files or expose
// its results without filtering.
//
// The service_role key is stored in SUPABASE_SERVICE_ROLE_KEY
// (in .env.local for dev, Vercel env vars for production).

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. " +
        "The service-role client requires both environment variables.",
    );
  }

  return createSupabaseClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

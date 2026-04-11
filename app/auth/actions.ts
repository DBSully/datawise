"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Sign-out server action wired to the header sign-out button in
// components/layout/app-chrome.tsx. Calls supabase.auth.signOut()
// (which clears the auth cookies via the server client) and then
// redirects to the sign-in page.
export async function signOutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/auth/sign-in");
}

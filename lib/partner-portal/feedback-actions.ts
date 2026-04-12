// Phase 1 Step 4D — Partner feedback server action.
//
// Persists a partner's response (Interested / Pass / Schedule Showing /
// Request Discussion) to the partner_feedback table. Requires auth —
// per Decision 4.3, viewing is free but acting requires sign-in.

"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

type SubmitFeedbackInput = {
  shareId: string;
  action: "interested" | "pass" | "showing_request" | "discussion_request";
  passReason?: string;
  notes?: string;
};

type SubmitFeedbackResult = {
  ok: boolean;
  error?: string;
  requiresAuth?: boolean;
};

export async function submitPartnerFeedbackAction(
  input: SubmitFeedbackInput,
): Promise<SubmitFeedbackResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      ok: false,
      error: "Please sign in to submit your response.",
      requiresAuth: true,
    };
  }

  const { shareId, action, passReason, notes } = input;

  // Verify the share exists and is active
  const { data: share, error: lookupError } = await supabase
    .from("analysis_shares")
    .select("id, is_active")
    .eq("id", shareId)
    .maybeSingle();

  if (lookupError) return { ok: false, error: lookupError.message };
  if (!share || !share.is_active) {
    return { ok: false, error: "This share is no longer active." };
  }

  // Insert the feedback
  const { error: insertError } = await supabase
    .from("partner_feedback")
    .insert({
      analysis_share_id: shareId,
      action,
      pass_reason: passReason?.trim() || null,
      notes: notes?.trim() || null,
    });

  if (insertError) return { ok: false, error: insertError.message };

  return { ok: true };
}

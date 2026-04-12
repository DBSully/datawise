// Phase 1 Step 4B — Partner share server actions.
//
// Two actions for the analyst's Partner Sharing card:
//
// 1. createAnalysisShareAction — generates a UUID share_token, creates
//    an analysis_shares row, and (eventually) sends an email via Resend.
//    For now, email is a placeholder that logs the share link to the
//    server console so the full flow can be tested without Resend setup.
//
// 2. revokeAnalysisShareAction — sets is_active = false on an existing
//    share, effectively removing the partner's access.
//
// Both actions revalidate the canonical Workstation route so the Partner
// Sharing card's collapsed headline and expanded modal refresh with the
// latest share state.
//
// EMAIL PLACEHOLDER: when Resend is set up, replace the console.log
// block in createAnalysisShareAction with the actual Resend API call.
// Search for "RESEND_PLACEHOLDER" to find the exact location.

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

type CreateShareInput = {
  analysisId: string;
  partnerEmail: string;
  message?: string;
};

type CreateShareResult = {
  ok: boolean;
  shareToken?: string;
  shareUrl?: string;
  error?: string;
};

export async function createAnalysisShareAction(
  input: CreateShareInput,
): Promise<CreateShareResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/sign-in");

  const { analysisId, partnerEmail, message } = input;

  if (!analysisId || !partnerEmail) {
    return { ok: false, error: "Analysis ID and partner email are required." };
  }

  // Verify the analysis exists and is owned by the calling user
  const { data: analysis, error: lookupError } = await supabase
    .from("analyses")
    .select("id, real_property_id")
    .eq("id", analysisId)
    .eq("created_by_user_id", user.id)
    .maybeSingle();
  if (lookupError) return { ok: false, error: lookupError.message };
  if (!analysis) return { ok: false, error: "Analysis not found." };

  // Check if this partner already has an active share for this analysis
  const { data: existingShare } = await supabase
    .from("analysis_shares")
    .select("id")
    .eq("analysis_id", analysisId)
    .eq("shared_with_email", partnerEmail.toLowerCase().trim())
    .eq("is_active", true)
    .maybeSingle();

  if (existingShare) {
    return {
      ok: false,
      error: `${partnerEmail} already has an active share for this analysis.`,
    };
  }

  // Look up whether this email belongs to a registered partner
  const { data: partnerProfile } = await supabase
    .from("profiles")
    .select("id")
    .eq("email", partnerEmail.toLowerCase().trim())
    .maybeSingle();

  // Generate share token (UUID v4 per Decision 4.2)
  const shareToken = crypto.randomUUID();

  // Create the analysis_shares row
  const { error: insertError } = await supabase
    .from("analysis_shares")
    .insert({
      analysis_id: analysisId,
      shared_with_user_id: partnerProfile?.id ?? null,
      shared_with_email: partnerEmail.toLowerCase().trim(),
      share_token: shareToken,
      message: message?.trim() || null,
    });

  if (insertError) return { ok: false, error: insertError.message };

  // Also create an empty partner_analysis_versions row so the partner
  // has a sandbox ready when they first view the analysis.
  const { data: newShare } = await supabase
    .from("analysis_shares")
    .select("id")
    .eq("share_token", shareToken)
    .single();

  if (newShare) {
    await supabase.from("partner_analysis_versions").insert({
      analysis_share_id: newShare.id,
    });
  }

  // Build the share URL
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const shareUrl = `${baseUrl}/portal/deals/${shareToken}`;

  // ── RESEND_PLACEHOLDER ──────────────────────────────────────────
  // When Resend is set up, replace this block with the actual email
  // send. For now, log the share link to the server console so the
  // full flow can be tested manually.
  //
  // Future code shape:
  //   import { Resend } from "resend";
  //   const resend = new Resend(process.env.RESEND_API_KEY);
  //   await resend.emails.send({
  //     from: process.env.RESEND_FROM_EMAIL,
  //     to: partnerEmail,
  //     subject: `Analysis shared with you — ${address}`,
  //     html: `<p>${message ?? "An analysis has been shared with you."}</p>
  //            <a href="${shareUrl}">View Analysis</a>`,
  //   });
  //
  // eslint-disable-next-line no-console
  console.log(
    `\n[SHARE] ── Email placeholder ──\n` +
    `  To: ${partnerEmail}\n` +
    `  Analysis: ${analysisId}\n` +
    `  Token: ${shareToken}\n` +
    `  URL: ${shareUrl}\n` +
    `  Message: ${message ?? "(none)"}\n` +
    `  ── Copy the URL above to test the partner portal ──\n`,
  );
  // ── END RESEND_PLACEHOLDER ──────────────────────────────────────

  revalidatePath(`/analysis/${analysisId}`);

  return { ok: true, shareToken, shareUrl };
}

type RevokeShareInput = {
  shareId: string;
  analysisId: string;
};

export async function revokeAnalysisShareAction(
  input: RevokeShareInput,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/sign-in");

  const { shareId, analysisId } = input;

  const { error } = await supabase
    .from("analysis_shares")
    .update({ is_active: false })
    .eq("id", shareId);

  if (error) return { ok: false, error: error.message };

  revalidatePath(`/analysis/${analysisId}`);
  return { ok: true };
}

export async function markFeedbackReadAction(
  input: { shareId: string; analysisId: string },
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/sign-in");

  const { error } = await supabase
    .from("analysis_shares")
    .update({ last_viewed_by_analyst_at: new Date().toISOString() })
    .eq("id", input.shareId);

  if (error) return { ok: false, error: error.message };

  revalidatePath(`/analysis/${input.analysisId}`);
  return { ok: true };
}

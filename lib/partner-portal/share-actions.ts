// Phase 1 Step 4B + 4C — Partner share server actions.
//
// Two actions for the analyst's Partner Sharing card:
//
// 1. createAnalysisShareAction — generates a UUID share_token, creates
//    an analysis_shares row, and sends an email via Resend.
//
// 2. revokeAnalysisShareAction — sets is_active = false on an existing
//    share, effectively removing the partner's access.
//
// Both actions revalidate the canonical Workstation route so the Partner
// Sharing card's collapsed headline and expanded modal refresh with the
// latest share state.

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Resend } from "resend";
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

  // Fetch the property address for the email subject line
  const { data: property } = await supabase
    .from("real_properties")
    .select("unparsed_address, city")
    .eq("id", analysis.real_property_id)
    .single();
  const subjectAddress = property
    ? [property.unparsed_address, property.city].filter(Boolean).join(", ")
    : "a property";

  // Build the share URL
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const shareUrl = `${baseUrl}/portal/deals/${shareToken}`;

  // Send the share notification email via Resend
  const resend = new Resend(process.env.RESEND_API_KEY);
  const { error: emailError } = await resend.emails.send({
    from: "DataWise <analysis@datawisere.com>",
    to: partnerEmail,
    subject: `Analysis shared with you — ${subjectAddress}`,
    html: [
      `<div style="font-family: sans-serif; max-width: 560px; margin: 0 auto;">`,
      `<h2 style="color: #1e293b; margin-bottom: 4px;">A deal analysis has been shared with you</h2>`,
      `<p style="color: #64748b; font-size: 14px; margin-top: 0;">${subjectAddress}</p>`,
      message
        ? `<p style="color: #334155; font-size: 14px; background: #f8fafc; padding: 12px; border-radius: 6px; border-left: 3px solid #3b82f6;">${message}</p>`
        : "",
      `<a href="${shareUrl}" style="display: inline-block; background: #2563eb; color: #fff; padding: 10px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 14px; margin-top: 8px;">View Analysis</a>`,
      `<p style="color: #94a3b8; font-size: 12px; margin-top: 24px;">You can view the numbers, adjust your own assumptions, and submit feedback — all from the link above.</p>`,
      `</div>`,
    ].join("\n"),
  });

  if (emailError) {
    // eslint-disable-next-line no-console
    console.error("[SHARE] Email send failed:", emailError);
    // Don't fail the share — the DB row is created, the link works.
    // The analyst can copy the link manually from the Partner Sharing modal.
  }

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

// ─────────────────────────────────────────────────────────────────────
// Data loading for the Partner Sharing card
// ─────────────────────────────────────────────────────────────────────

export type AnalysisShareRow = {
  id: string;
  shared_with_email: string;
  shared_with_user_id: string | null;
  share_token: string;
  message: string | null;
  is_active: boolean;
  sent_at: string;
  first_viewed_at: string | null;
  last_viewed_at: string | null;
  view_count: number;
  last_viewed_by_analyst_at: string | null;
};

export type PartnerFeedbackRow = {
  id: string;
  analysis_share_id: string;
  action: string;
  pass_reason: string | null;
  notes: string | null;
  submitted_at: string;
};

export type PartnerVersionRow = {
  analysis_share_id: string;
  arv_override: number | null;
  rehab_override: number | null;
  target_profit_override: number | null;
  days_held_override: number | null;
};

export type AnalysisSharesData = {
  shares: AnalysisShareRow[];
  feedback: PartnerFeedbackRow[];
  partnerVersions: PartnerVersionRow[];
};

export async function loadAnalysisSharesAction(
  analysisId: string,
): Promise<AnalysisSharesData> {
  const supabase = await createClient();

  const [{ data: shares }, { data: feedback }] = await Promise.all([
    supabase
      .from("analysis_shares")
      .select(
        "id, shared_with_email, shared_with_user_id, share_token, message, is_active, sent_at, first_viewed_at, last_viewed_at, view_count, last_viewed_by_analyst_at",
      )
      .eq("analysis_id", analysisId)
      .order("sent_at", { ascending: false }),
    supabase
      .from("partner_feedback")
      .select("id, analysis_share_id, action, pass_reason, notes, submitted_at")
      .in(
        "analysis_share_id",
        // Subquery: get all share IDs for this analysis
        // PostgREST doesn't support subqueries directly, so we'll
        // fetch all feedback and filter client-side for now.
        // This is fine for the MVP scale (few shares per analysis).
        [],
      ),
  ]);

  // Fetch feedback separately since PostgREST doesn't support
  // subquery-based IN filters. For MVP scale this is fine.
  const shareIds = (shares ?? []).map((s) => s.id);
  let feedbackRows: PartnerFeedbackRow[] = [];
  if (shareIds.length > 0) {
    const { data: fb } = await supabase
      .from("partner_feedback")
      .select(
        "id, analysis_share_id, action, pass_reason, notes, submitted_at",
      )
      .in("analysis_share_id", shareIds)
      .order("submitted_at", { ascending: false });
    feedbackRows = (fb ?? []) as PartnerFeedbackRow[];
  }

  // Load partner versions for each share
  let partnerVersionRows: PartnerVersionRow[] = [];
  if (shareIds.length > 0) {
    const { data: pv } = await supabase
      .from("partner_analysis_versions")
      .select("analysis_share_id, arv_override, rehab_override, target_profit_override, days_held_override")
      .in("analysis_share_id", shareIds);
    partnerVersionRows = (pv ?? []) as PartnerVersionRow[];
  }

  return {
    shares: (shares ?? []) as AnalysisShareRow[],
    feedback: feedbackRows,
    partnerVersions: partnerVersionRows,
  };
}

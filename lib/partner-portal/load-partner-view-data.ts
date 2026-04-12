// Phase 1 Step 4D — Partner view data loader.
//
// Loads analysis data for the partner-facing route at
// /portal/deals/[shareToken]. Uses the service-role Supabase client
// (bypasses RLS) because partners may view WITHOUT login (Decision 4.3).
// The share_token is the authorization boundary — a valid, active token
// grants read access to the analysis.
//
// Returns a subset of WorkstationData suitable for the partner view:
// the full analysis data loads server-side, and the partner client
// component filters what to display per spec §7.
//
// SECURITY: the service-role client has full database access. This
// loader ONLY uses it after verifying the share_token exists and is
// active. The returned data is the same WorkstationData the analyst
// sees — the partner client component is responsible for hiding
// analyst-only sections (MLS Info, Quick Status, Holding/Trans,
// Financing, Cash Required, Pipeline, Partner Sharing).

import { createServiceClient } from "@/lib/supabase/service";
import { loadWorkstationData } from "@/lib/analysis/load-workstation-data";

export type PartnerViewData = {
  /** The analysis data (same shape as what the analyst sees). The
   *  partner client component filters visible sections. */
  workstationData: Awaited<ReturnType<typeof loadWorkstationData>>;
  /** The share record — needed for partner identity, message, etc. */
  share: {
    id: string;
    analysisId: string;
    sharedWithEmail: string;
    sharedWithUserId: string | null;
    message: string | null;
    sentAt: string;
  };
  /** The partner's private sandbox data (if they have an account and
   *  have started adjusting values). Null for unauthenticated views. */
  partnerVersion: {
    arvOverride: number | null;
    rehabOverride: number | null;
    targetProfitOverride: number | null;
    daysHeldOverride: number | null;
    selectedCompIds: string[] | null;
    notes: string | null;
  } | null;
};

export async function loadPartnerViewData(
  shareToken: string,
): Promise<PartnerViewData | null> {
  const supabase = createServiceClient();

  // 1. Look up the share by token — this IS the authorization check.
  //    If the token doesn't exist or is inactive, return null (404).
  const { data: share, error: shareError } = await supabase
    .from("analysis_shares")
    .select(
      "id, analysis_id, shared_with_email, shared_with_user_id, message, sent_at",
    )
    .eq("share_token", shareToken)
    .eq("is_active", true)
    .maybeSingle();

  if (shareError || !share) return null;

  // 2. Increment view count + update last_viewed_at
  await supabase
    .from("analysis_shares")
    .update({
      view_count: (share as Record<string, unknown>).view_count
        ? Number((share as Record<string, unknown>).view_count) + 1
        : 1,
      last_viewed_at: new Date().toISOString(),
      first_viewed_at:
        (share as Record<string, unknown>).first_viewed_at ??
        new Date().toISOString(),
    })
    .eq("id", share.id);

  // 3. Load the full analysis data. We pass the service client to
  //    loadWorkstationData — but that function expects the authenticated
  //    client shape. Since the service client is a superset (it can do
  //    everything the auth client can + more), this works. The userId
  //    parameter is used for the created_by_user_id filter on analyses;
  //    we pass an empty string and rely on the service client's ability
  //    to bypass RLS.
  //
  //    NOTE: loadWorkstationData filters analyses by created_by_user_id.
  //    With the service client we bypass RLS, but the function-level
  //    filter still applies. We need to load the analysis differently.

  // Load the analysis to get the property ID and owner
  const { data: analysis } = await supabase
    .from("analyses")
    .select("id, real_property_id, created_by_user_id")
    .eq("id", share.analysis_id)
    .maybeSingle();

  if (!analysis) return null;

  // Load WorkstationData using the analysis owner's perspective
  const workstationData = await loadWorkstationData(
    supabase,
    analysis.created_by_user_id,
    analysis.real_property_id,
    analysis.id,
  );

  if (!workstationData) return null;

  // 4. Load the partner's private sandbox (if one exists)
  const { data: partnerVersion } = await supabase
    .from("partner_analysis_versions")
    .select(
      "arv_override, rehab_override, target_profit_override, days_held_override, selected_comp_ids, notes",
    )
    .eq("analysis_share_id", share.id)
    .maybeSingle();

  return {
    workstationData,
    share: {
      id: share.id,
      analysisId: share.analysis_id,
      sharedWithEmail: share.shared_with_email,
      sharedWithUserId: share.shared_with_user_id,
      message: share.message,
      sentAt: share.sent_at,
    },
    partnerVersion: partnerVersion
      ? {
          arvOverride: partnerVersion.arv_override as number | null,
          rehabOverride: partnerVersion.rehab_override as number | null,
          targetProfitOverride:
            partnerVersion.target_profit_override as number | null,
          daysHeldOverride:
            partnerVersion.days_held_override as number | null,
          selectedCompIds:
            (partnerVersion.selected_comp_ids as string[] | null) ?? null,
          notes: (partnerVersion.notes as string | null) ?? null,
        }
      : null,
  };
}

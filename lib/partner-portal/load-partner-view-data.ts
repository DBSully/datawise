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

export type PartnerCompCandidate = {
  id: string;
  comp_listing_row_id: string | null;
  distance_miles: number | null;
  days_since_close: number | null;
  sqft_delta_pct: number | null;
  raw_score: number | null;
  selected_yn: boolean;
  metrics_json: Record<string, unknown>;
  score_breakdown_json: Record<string, unknown> | null;
};

export type PartnerCompData = {
  subjectAddress: string;
  subjectLat: number | null;
  subjectLng: number | null;
  subjectBuildingSqft: number | null;
  subjectListPrice: number | null;
  estGapPerSqft: number | null;
  subdivision: string | null;
  levelsRaw: string | null;
  yearBuilt: number | null;
  bedsTotal: number | null;
  bathsTotal: number | null;
  garageSpaces: number | null;
  aboveGradeSqft: number | null;
  belowGradeTotalSqft: number | null;
  belowGradeFinishedSqft: number | null;
  lotSizeSqft: number | null;
  compSearchRunId: string | null;
  realPropertyId: string;
  candidates: PartnerCompCandidate[];
  arvByCompListingId: Record<string, { arv: number; weight: number; netSalePrice: number; compBuildingSqft: number; compAboveGradeSqft: number; psfBuilding: number; psfAboveGrade: number; arvBuilding: number; arvAboveGrade: number; arvBlended: number; timeAdjustment: number; daysSinceClose: number; confidence: number }>;
};

export type PartnerViewData = {
  /** The analysis data (same shape as what the analyst sees). The
   *  partner client component filters visible sections. */
  workstationData: Awaited<ReturnType<typeof loadWorkstationData>>;
  /** Comp data loaded server-side (service-role client). Passed to the
   *  partner client component so it doesn't need to call the
   *  authenticated loadCompDataByRunAction. */
  compData: PartnerCompData | null;
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

  // 5. Load comp data server-side so the partner client component
  //    doesn't need to call the authenticated loadCompDataByRunAction
  //    (which would fail for unauthenticated partners due to RLS).
  let compData: PartnerCompData | null = null;
  const latestRunId = workstationData.compModalData.latestRun?.id;
  if (latestRunId) {
    // Load comp candidates
    const { data: candidates } = await supabase
      .from("comparable_search_candidates")
      .select(
        "id, comp_listing_row_id, distance_miles, days_since_close, sqft_delta_pct, raw_score, selected_yn, metrics_json, score_breakdown_json",
      )
      .eq("comparable_search_run_id", latestRunId)
      .order("raw_score", { ascending: false });

    // Build ARV breakdowns by comp listing ID
    const arvByCompListingId: PartnerCompData["arvByCompListingId"] =
      workstationData.compModalData.arvByCompListingId as PartnerCompData["arvByCompListingId"];

    const property = workstationData.property;
    const physical = workstationData.physical;
    const listing = workstationData.listing;

    compData = {
      subjectAddress: property.address,
      subjectLat: property.latitude,
      subjectLng: property.longitude,
      subjectBuildingSqft: physical?.buildingSqft ?? null,
      subjectListPrice: listing?.listPrice ?? null,
      estGapPerSqft: workstationData.dealMath?.estGapPerSqft ?? null,
      subdivision: listing?.subdivisionName ?? null,
      levelsRaw: physical?.levelClass ?? null,
      yearBuilt: physical?.yearBuilt ?? null,
      bedsTotal: physical?.bedroomsTotal ?? null,
      bathsTotal: physical?.bathroomsTotal ?? null,
      garageSpaces: physical?.garageSpaces ?? null,
      aboveGradeSqft: physical?.aboveGradeSqft ?? null,
      belowGradeTotalSqft: physical?.belowGradeTotalSqft ?? null,
      belowGradeFinishedSqft: physical?.belowGradeFinishedSqft ?? null,
      lotSizeSqft: physical?.lotSizeSqft ?? null,
      compSearchRunId: latestRunId,
      realPropertyId: analysis.real_property_id,
      candidates: (candidates ?? []) as PartnerCompCandidate[],
      arvByCompListingId,
    };
  }

  return {
    workstationData,
    compData,
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

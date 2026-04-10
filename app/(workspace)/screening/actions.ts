"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { runScreeningBatch, expandComparableSearch, type ExpandSearchOverrides } from "@/lib/screening/bulk-runner";
import { DENVER_FLIP_V1 } from "@/lib/screening/strategy-profiles";
import { calculateArv } from "@/lib/screening/arv-engine";
import { resolvePropertyTypeFamily } from "@/lib/comparables/scoring";
import type { CompArvInput, PropertyTypeKey } from "@/lib/screening/types";
import type { ArvCompBreakdown } from "@/lib/reports/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function textValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

/** Compute per-comp implied ARV for all candidates using the ARV engine. */
function computeArvForCandidates(
  candidates: Array<{ comp_listing_row_id: string | null; metrics_json: Record<string, unknown> }>,
  subjectBuildingSqft: number,
  subjectAboveGradeSqft: number,
  subjectPropertyType: string | null,
): Record<string, ArvCompBreakdown> {
  const propertyType = resolvePropertyTypeFamily(subjectPropertyType) as PropertyTypeKey;
  const comps: CompArvInput[] = [];

  for (const c of candidates) {
    const m = c.metrics_json;
    const netSalePrice = Number(m.net_price) || Number(m.close_price) || 0;
    const closeDateIso = m.close_date ? String(m.close_date) : null;
    if (netSalePrice <= 0 || !closeDateIso || !c.comp_listing_row_id) continue;

    comps.push({
      compListingRowId: c.comp_listing_row_id,
      compRealPropertyId: String(m.comp_real_property_id ?? ""),
      listingId: String(m.listing_id ?? ""),
      address: String(m.address ?? ""),
      netSalePrice,
      closeDateIso,
      compBuildingSqft: Number(m.building_area_total_sqft) || Number(m.above_grade_finished_area_sqft) || 0,
      compAboveGradeSqft: Number(m.above_grade_finished_area_sqft) || Number(m.building_area_total_sqft) || 0,
      distanceMiles: Number(m.distance_miles) || 0,
      yearBuilt: m.year_built != null ? Number(m.year_built) : null,
      bedroomsTotal: m.bedrooms_total != null ? Number(m.bedrooms_total) : null,
      bathroomsTotal: m.bathrooms_total != null ? Number(m.bathrooms_total) : null,
      propertyType: m.property_type ? String(m.property_type) : null,
      levelClass: m.level_class_standardized ? String(m.level_class_standardized) : null,
      mlsStatus: m.mls_status ? String(m.mls_status) : null,
    });
  }

  if (comps.length === 0) return {};

  const result = calculateArv({
    subjectBuildingSqft,
    subjectAboveGradeSqft,
    comps,
    config: DENVER_FLIP_V1.arv,
    propertyType,
  });

  if (!result) return {};

  const map: Record<string, ArvCompBreakdown> = {};
  for (const d of result.perCompDetails) {
    map[d.compListingRowId] = {
      arv: d.arvTimeAdjusted,
      weight: d.decayWeight,
      netSalePrice: d.netSalePrice,
      compBuildingSqft: d.compBuildingSqft,
      compAboveGradeSqft: d.compAboveGradeSqft,
      psfBuilding: d.psfBuilding,
      psfAboveGrade: d.psfAboveGrade,
      arvBuilding: d.arvBuilding,
      arvAboveGrade: d.arvAboveGrade,
      arvBlended: d.arvBlended,
      timeAdjustment: d.timeAdjustment,
      daysSinceClose: d.daysSinceClose,
      confidence: d.confidence,
    };
  }
  return map;
}

// ---------------------------------------------------------------------------
// Run screening batch
// ---------------------------------------------------------------------------

export async function runScreeningAction(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/sign-in");
  }

  const name = textValue(formData, "name") || "Screening Batch";
  const statusFilter = textValue(formData, "status_filter") || "Active";
  const filterMode = textValue(formData, "filter_mode") || "all";

  // Parse status filter into array
  const statuses = statusFilter
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  let propertyIds: string[];

  if (filterMode === "unscreened") {
    // Use RPC to get only properties with no existing screening results
    const { data: unscreenedRows, error: rpcError } = await supabase.rpc(
      "get_unscreened_property_ids",
      { statuses },
    );

    if (rpcError) {
      throw new Error(rpcError.message);
    }

    propertyIds = (unscreenedRows ?? []).map(
      (r: { real_property_id: string }) => r.real_property_id,
    );
  } else {
    // Find subject properties: those with active/coming-soon listings
    // Paginate to avoid the default PostgREST 1,000-row cap
    const PAGE_SIZE = 1000;
    const propertyIdSet = new Set<string>();
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      const { data: page, error: pageError } = await supabase
        .from("mls_listings")
        .select("real_property_id")
        .in("mls_status", statuses)
        .range(offset, offset + PAGE_SIZE - 1);

      if (pageError) {
        throw new Error(pageError.message);
      }

      for (const row of page ?? []) {
        propertyIdSet.add(row.real_property_id);
      }

      if (!page || page.length < PAGE_SIZE) {
        hasMore = false;
      } else {
        offset += PAGE_SIZE;
      }
    }

    propertyIds = Array.from(propertyIdSet);
  }

  if (propertyIds.length === 0) {
    // Nothing to screen — redirect back with a message
    revalidatePath("/intake/imports");
    redirect("/intake/imports");
  }

  const profile = DENVER_FLIP_V1;

  // Create batch record
  const { data: batch, error: batchError } = await supabase
    .from("screening_batches")
    .insert({
      name,
      trigger_type: "manual",
      strategy_profile_slug: profile.slug,
      status: "pending",
      subject_filter_json: { statuses, filterMode },
      total_subjects: propertyIds.length,
      created_by_user_id: user.id,
    })
    .select("id")
    .single();

  if (batchError || !batch) {
    throw new Error(batchError?.message ?? "Failed to create screening batch");
  }

  // Run the pipeline
  await runScreeningBatch({
    supabase,
    batchId: batch.id,
    subjectPropertyIds: propertyIds,
    profile,
  });

  revalidatePath("/intake/imports");
  redirect(`/screening/${batch.id}`);
}

// ---------------------------------------------------------------------------
// Run screening for a specific import batch
// ---------------------------------------------------------------------------

export async function runImportScreeningAction(
  formData: FormData,
): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/sign-in");
  }

  const importBatchId = textValue(formData, "import_batch_id");
  if (!importBatchId) {
    throw new Error("Missing import_batch_id");
  }

  // Get property IDs from this import batch (paginated to avoid PostgREST cap)
  const PAGE_SIZE = 1000;
  const propertyIdSet = new Set<string>();
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const { data: page, error: rpcError } = await supabase
      .rpc("get_import_batch_property_ids", { p_import_batch_id: importBatchId })
      .range(offset, offset + PAGE_SIZE - 1);

    if (rpcError) {
      throw new Error(rpcError.message);
    }

    for (const row of page ?? []) {
      propertyIdSet.add((row as { real_property_id: string }).real_property_id);
    }

    if (!page || page.length < PAGE_SIZE) {
      hasMore = false;
    } else {
      offset += PAGE_SIZE;
    }
  }

  const propertyIds = Array.from(propertyIdSet);

  if (propertyIds.length === 0) {
    revalidatePath("/intake/imports");
    redirect("/intake/imports");
  }

  const profile = DENVER_FLIP_V1;

  // Create batch record linked to the import
  const { data: batch, error: batchError } = await supabase
    .from("screening_batches")
    .insert({
      name: `Import Screen — ${new Date().toLocaleDateString()}`,
      trigger_type: "import",
      source_import_batch_id: importBatchId,
      strategy_profile_slug: profile.slug,
      status: "pending",
      subject_filter_json: { importBatchId },
      total_subjects: propertyIds.length,
      created_by_user_id: user.id,
    })
    .select("id")
    .single();

  if (batchError || !batch) {
    throw new Error(batchError?.message ?? "Failed to create screening batch");
  }

  // Run the pipeline
  await runScreeningBatch({
    supabase,
    batchId: batch.id,
    subjectPropertyIds: propertyIds,
    profile,
  });

  revalidatePath("/intake/imports");
  redirect(`/screening/${batch.id}`);
}

// ---------------------------------------------------------------------------
// Load comp data for screening result (used by Quick Comps modal)
// ---------------------------------------------------------------------------

export type ScreeningCompData = {
  compSearchRunId: string | null;
  realPropertyId: string;
  subjectAddress: string;
  subjectCity: string;
  subjectListPrice: number | null;
  subjectBuildingSqft: number | null;
  subjectLat: number | null;
  subjectLng: number | null;
  estGapPerSqft: number | null;
  // Deal math fields for modal summary
  arvAggregate: number | null;
  maxOffer: number | null;
  offerPct: number | null;
  spread: number | null;
  rehabTotal: number | null;
  holdTotal: number | null;
  transactionTotal: number | null;
  financingTotal: number | null;
  targetProfit: number | null;
  trendAnnualRate: number | null;
  trendConfidence: string | null;
  isPrimeCandidate: boolean;
  // Review status
  reviewAction: string | null;
  passReason: string | null;
  // Property header fields
  postalCode: string | null;
  county: string | null;
  subdivision: string | null;
  propertyType: string | null;
  bedsTotal: number | null;
  bathsTotal: number | null;
  garageSpaces: number | null;
  levelsRaw: string | null;
  yearBuilt: number | null;
  aboveGradeSqft: number | null;
  belowGradeTotalSqft: number | null;
  belowGradeFinishedSqft: number | null;
  lotSizeSqft: number | null;
  ownershipRaw: string | null;
  occupantType: string | null;
  annualPropertyTax: number | null;
  annualHoaDues: number | null;
  // MLS listing fields
  mlsNumber: string | null;
  mlsStatus: string | null;
  mlsChangeType: string | null;
  listDate: string | null;
  ucDate: string | null;
  closeDate: string | null;
  originalListPrice: number | null;
  closePrice: number | null;
  // Per-comp implied ARV keyed by comp_listing_row_id (arvTimeAdjusted + decayWeight)
  arvByCompListingId: Record<string, ArvCompBreakdown>;
  candidates: Array<{
    id: string;
    comp_listing_row_id: string | null;
    selected_yn: boolean;
    distance_miles: number | null;
    days_since_close: number | null;
    sqft_delta_pct: number | null;
    raw_score: number | null;
    metrics_json: Record<string, unknown>;
  }>;
};

export async function loadScreeningCompDataAction(
  resultId: string,
): Promise<ScreeningCompData | null> {
  const supabase = await createClient();

  const { data: result, error: resultError } = await supabase
    .from("screening_results")
    .select(
      "id, real_property_id, listing_row_id, comp_search_run_id, subject_address, subject_city, subject_list_price, subject_building_sqft, subject_above_grade_sqft, subject_below_grade_total_sqft, subject_below_grade_finished_sqft, subject_year_built, subject_property_type, est_gap_per_sqft, arv_aggregate, arv_detail_json, max_offer, offer_pct, spread, rehab_total, hold_total, transaction_total, financing_total, target_profit, trend_annual_rate, trend_confidence, is_prime_candidate, review_action, pass_reason",
    )
    .eq("id", resultId)
    .single();

  if (resultError || !result) return null;

  // Fetch property, physical, financials, and MLS listing data in parallel
  const propPromise = supabase
    .from("real_properties")
    .select("latitude, longitude, postal_code, county, lot_size_sqft")
    .eq("id", result.real_property_id)
    .single();

  const physPromise = supabase
    .from("property_physical")
    .select(
      "bedrooms_total, bathrooms_total, garage_spaces, levels_raw, above_grade_finished_area_sqft, below_grade_total_sqft, below_grade_finished_area_sqft, building_area_total_sqft, year_built, property_type",
    )
    .eq("real_property_id", result.real_property_id)
    .single();

  const finPromise = supabase
    .from("property_financials")
    .select("annual_property_tax, annual_hoa_dues")
    .eq("real_property_id", result.real_property_id)
    .single();

  const mlsPromise = result.listing_row_id
    ? supabase
        .from("mls_listings")
        .select(
          "listing_id, mls_status, mls_major_change_type, listing_contract_date, purchase_contract_date, close_date, original_list_price, close_price, subdivision_name, ownership_raw, occupant_type",
        )
        .eq("id", result.listing_row_id)
        .single()
    : Promise.resolve({ data: null });

  const [{ data: prop }, { data: phys }, { data: fin }, { data: mls }] =
    await Promise.all([propPromise, physPromise, finPromise, mlsPromise]);

  const dealFields = {
    arvAggregate: result.arv_aggregate,
    maxOffer: result.max_offer,
    offerPct: result.offer_pct,
    spread: result.spread,
    rehabTotal: result.rehab_total,
    holdTotal: result.hold_total,
    transactionTotal: result.transaction_total,
    financingTotal: result.financing_total,
    targetProfit: result.target_profit,
    trendAnnualRate: result.trend_annual_rate,
    trendConfidence: result.trend_confidence,
    isPrimeCandidate: result.is_prime_candidate ?? false,
    reviewAction: result.review_action,
    passReason: result.pass_reason,
  };

  // Property header fields — prefer live DB values, fall back to screening snapshot
  const headerFields = {
    postalCode: prop?.postal_code ?? null,
    county: prop?.county ?? null,
    subdivision: mls?.subdivision_name ?? null,
    propertyType: phys?.property_type ?? result.subject_property_type ?? null,
    bedsTotal: phys?.bedrooms_total ?? null,
    bathsTotal: phys?.bathrooms_total ?? null,
    garageSpaces: phys?.garage_spaces ?? null,
    levelsRaw: phys?.levels_raw ?? null,
    yearBuilt: phys?.year_built ?? result.subject_year_built ?? null,
    aboveGradeSqft:
      phys?.above_grade_finished_area_sqft ??
      result.subject_above_grade_sqft ??
      null,
    belowGradeTotalSqft:
      phys?.below_grade_total_sqft ??
      result.subject_below_grade_total_sqft ??
      null,
    belowGradeFinishedSqft:
      phys?.below_grade_finished_area_sqft ??
      result.subject_below_grade_finished_sqft ??
      null,
    lotSizeSqft: prop?.lot_size_sqft ?? null,
    ownershipRaw: mls?.ownership_raw ?? null,
    occupantType: mls?.occupant_type ?? null,
    annualPropertyTax: fin?.annual_property_tax ?? null,
    annualHoaDues: fin?.annual_hoa_dues ?? null,
    // MLS listing fields
    mlsNumber: mls?.listing_id ?? null,
    mlsStatus: mls?.mls_status ?? null,
    mlsChangeType: mls?.mls_major_change_type ?? null,
    listDate: mls?.listing_contract_date ?? null,
    ucDate: mls?.purchase_contract_date ?? null,
    closeDate: mls?.close_date ?? null,
    originalListPrice: mls?.original_list_price ?? null,
    closePrice: mls?.close_price ?? null,
  };

  const base = {
    compSearchRunId: result.comp_search_run_id ?? null,
    realPropertyId: result.real_property_id,
    subjectAddress: result.subject_address,
    subjectCity: result.subject_city,
    subjectListPrice: result.subject_list_price,
    subjectBuildingSqft: result.subject_building_sqft,
    subjectLat: prop?.latitude ?? null,
    subjectLng: prop?.longitude ?? null,
    estGapPerSqft: result.est_gap_per_sqft,
    ...dealFields,
    ...headerFields,
    arvByCompListingId: {} as Record<string, ArvCompBreakdown>,
  };

  if (!result.comp_search_run_id) {
    return { ...base, candidates: [] };
  }

  const { data: candidates } = await supabase
    .from("comparable_search_candidates")
    .select(
      "id, comp_listing_row_id, selected_yn, distance_miles, days_since_close, sqft_delta_pct, raw_score, metrics_json",
    )
    .eq("comparable_search_run_id", result.comp_search_run_id)
    .order("raw_score", { ascending: false });

  // Batch-load concessions for all comp listings so we can compute net_price
  // for candidates that pre-date the net_price field in metrics_json
  const compListingIds = (candidates ?? [])
    .map((c) => c.comp_listing_row_id)
    .filter((id): id is string => id != null);

  const concessionsMap = new Map<string, number>();
  const subdivisionMap = new Map<string, string | null>();
  if (compListingIds.length > 0) {
    const { data: listings } = await supabase
      .from("mls_listings")
      .select("id, concessions_amount, subdivision_name")
      .in("id", compListingIds);
    for (const l of listings ?? []) {
      concessionsMap.set(l.id, Number(l.concessions_amount) || 0);
      subdivisionMap.set(l.id, l.subdivision_name ?? null);
    }
  }

  const processedCandidates = (candidates ?? []).map((c) => {
    const m = (c.metrics_json ?? {}) as Record<string, unknown>;
    // Always compute net_price from close_price - concessions
    if (m.close_price != null && m.net_price == null) {
      const concessions = c.comp_listing_row_id
        ? concessionsMap.get(c.comp_listing_row_id) ?? 0
        : 0;
      m.net_price = (Number(m.close_price) || 0) - concessions;
      m.concessions_amount = concessions;
      const sqft = Number(m.building_area_total_sqft) || Number(m.size_basis_value) || 0;
      if (sqft > 0) {
        m.ppsf = Math.round(((m.net_price as number) / sqft) * 100) / 100;
      }
    }
    if (m.subdivision_name == null && c.comp_listing_row_id) {
      m.subdivision_name = subdivisionMap.get(c.comp_listing_row_id) ?? null;
    }
    return { ...c, metrics_json: m };
  });

  // Compute per-comp implied ARV live from all candidates (covers manual adds + expanded search)
  const subjectBldg = Number(result.subject_building_sqft) || Number(result.subject_above_grade_sqft) || 0;
  const subjectAbove = Number(result.subject_above_grade_sqft) || Number(result.subject_building_sqft) || 0;
  const arvByCompListingId = computeArvForCandidates(
    processedCandidates,
    subjectBldg,
    subjectAbove,
    result.subject_property_type,
  );

  return {
    ...base,
    arvByCompListingId,
    candidates: processedCandidates,
  };
}

// ---------------------------------------------------------------------------
// Toggle comp candidate selection from screening (no analysis required)
// ---------------------------------------------------------------------------

export async function toggleScreeningCompSelectionAction(
  formData: FormData,
): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/sign-in");
  }

  const candidateId =
    typeof formData.get("candidate_id") === "string"
      ? (formData.get("candidate_id") as string).trim()
      : "";
  const nextSelected =
    typeof formData.get("next_selected") === "string"
      ? formData.get("next_selected") === "true"
      : false;
  const batchId =
    typeof formData.get("batch_id") === "string"
      ? (formData.get("batch_id") as string).trim()
      : "";

  if (!candidateId) {
    throw new Error("Candidate ID is required.");
  }

  const { error } = await supabase
    .from("comparable_search_candidates")
    .update({ selected_yn: nextSelected })
    .eq("id", candidateId);

  if (error) {
    throw new Error(error.message);
  }

  if (batchId) {
    revalidatePath(`/screening/${batchId}`);
  }
}

// ---------------------------------------------------------------------------
// Promote screening result to Watch List
// ---------------------------------------------------------------------------

export type PromoteResult = {
  analysisId: string;
  openWorkstation: boolean;
};

export async function promoteToAnalysisAction(
  formData: FormData,
): Promise<PromoteResult | void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/sign-in");
  }

  const resultId = textValue(formData, "result_id");
  const interestLevel = textValue(formData, "interest_level") || "warm";
  const watchListNote = textValue(formData, "watch_list_note") || null;
  const openWorkstation = textValue(formData, "open_workstation") === "true";

  if (!resultId) {
    throw new Error("Missing result_id");
  }

  // Load the screening result with comp run linkage
  const { data: result, error: resultError } = await supabase
    .from("screening_results")
    .select("id, real_property_id, arv_aggregate, screening_batch_id, comp_search_run_id")
    .eq("id", resultId)
    .single();

  if (resultError || !result) {
    throw new Error(resultError?.message ?? "Screening result not found");
  }

  // Create an analysis record
  const { data: analysis, error: analysisError } = await supabase
    .from("analyses")
    .insert({
      real_property_id: result.real_property_id,
      created_by_user_id: user.id,
      scenario_name: "Fix-and-Flip (from screening)",
      strategy_type: "flip",
      status: "draft",
    })
    .select("id")
    .single();

  if (analysisError || !analysis) {
    throw new Error(analysisError?.message ?? "Failed to create analysis");
  }

  // Link the screening's comp search run to the new analysis
  if (result.comp_search_run_id) {
    await supabase
      .from("comparable_search_runs")
      .update({ analysis_id: analysis.id })
      .eq("id", result.comp_search_run_id);
  }

  const now = new Date().toISOString();

  // Mark the screening result as promoted + reviewed
  await supabase
    .from("screening_results")
    .update({
      promoted_analysis_id: analysis.id,
      review_action: "promoted",
      reviewed_at: now,
      reviewed_by_user_id: user.id,
      screening_updated_at: now,
    })
    .eq("id", resultId);

  // Initialize pipeline with promotion context
  await supabase.from("analysis_pipeline").upsert({
    analysis_id: analysis.id,
    lifecycle_stage: "analysis",
    disposition: "active",
    interest_level: interestLevel,
    promoted_at: now,
    promoted_from_screening_result_id: resultId,
    watch_list_note: watchListNote,
  });

  revalidatePath("/screening");
  revalidatePath("/home");
  revalidatePath("/deals/watchlist");

  if (openWorkstation) {
    redirect(`/deals/watchlist/${analysis.id}`);
  }

  // Return result for modal to handle (close modal, stay on queue)
  return { analysisId: analysis.id, openWorkstation: false };
}

// ---------------------------------------------------------------------------
// Promote and open workstation (form action variant — always redirects)
// Used by the result detail page where a form action must return void.
// ---------------------------------------------------------------------------

export async function promoteAndOpenAction(formData: FormData): Promise<void> {
  formData.set("open_workstation", "true");
  await promoteToAnalysisAction(formData);
}

// ---------------------------------------------------------------------------
// Pass on a screening result
// ---------------------------------------------------------------------------

export async function passOnScreeningResultAction(
  formData: FormData,
): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/sign-in");
  }

  const resultId = textValue(formData, "result_id");
  const passReason = textValue(formData, "pass_reason");

  if (!resultId) {
    throw new Error("Missing result_id");
  }

  if (!passReason) {
    throw new Error("A pass reason is required.");
  }

  const now = new Date().toISOString();

  const { error } = await supabase
    .from("screening_results")
    .update({
      review_action: "passed",
      reviewed_at: now,
      reviewed_by_user_id: user.id,
      pass_reason: passReason,
      screening_updated_at: now,
    })
    .eq("id", resultId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/screening");
  revalidatePath("/home");
}

// ---------------------------------------------------------------------------
// Reactivate a passed screening result
// ---------------------------------------------------------------------------

export async function reactivateScreeningResultAction(
  resultId: string,
): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/sign-in");
  }

  const { error } = await supabase
    .from("screening_results")
    .update({
      review_action: null,
      reviewed_at: null,
      reviewed_by_user_id: null,
      pass_reason: null,
      screening_updated_at: new Date().toISOString(),
    })
    .eq("id", resultId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/screening");
  revalidatePath("/home");
}

// ---------------------------------------------------------------------------
// Expand comparable search with wider parameters
// ---------------------------------------------------------------------------

export async function expandComparableSearchAction(
  compSearchRunId: string,
  subjectPropertyId: string,
  overrides: ExpandSearchOverrides,
): Promise<{ added: number; total: number }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/sign-in");
  }

  return expandComparableSearch(supabase, compSearchRunId, subjectPropertyId, overrides);
}

// ---------------------------------------------------------------------------
// Load comp data by comp_search_run_id + real_property_id (no screening result)
// Used by Analysis Workstation where no screening_results row exists.
// ---------------------------------------------------------------------------

export async function loadCompDataByRunAction(
  compSearchRunId: string,
  realPropertyId: string,
): Promise<ScreeningCompData | null> {
  const supabase = await createClient();

  // Load property, physical, financials in parallel
  const [{ data: prop }, { data: phys }, { data: fin }] = await Promise.all([
    supabase
      .from("real_properties")
      .select("unparsed_address, city, postal_code, county, latitude, longitude, lot_size_sqft")
      .eq("id", realPropertyId)
      .single(),
    supabase
      .from("property_physical")
      .select(
        "bedrooms_total, bathrooms_total, garage_spaces, levels_raw, above_grade_finished_area_sqft, below_grade_total_sqft, below_grade_finished_area_sqft, building_area_total_sqft, year_built, property_type",
      )
      .eq("real_property_id", realPropertyId)
      .single(),
    supabase
      .from("property_financials")
      .select("annual_property_tax, annual_hoa_dues")
      .eq("real_property_id", realPropertyId)
      .single(),
  ]);

  if (!prop) return null;

  // Get the latest listing for this property (for MLS info)
  const { data: mls } = await supabase
    .from("mls_listings")
    .select(
      "listing_id, mls_status, mls_major_change_type, listing_contract_date, purchase_contract_date, close_date, original_list_price, list_price, close_price, subdivision_name, ownership_raw, occupant_type",
    )
    .eq("real_property_id", realPropertyId)
    .order("listing_contract_date", { ascending: false, nullsFirst: true })
    .limit(1)
    .maybeSingle();

  // Load the comp search run for arv_detail if available
  const { data: run } = await supabase
    .from("comparable_search_runs")
    .select("parameters_json, summary_json")
    .eq("id", compSearchRunId)
    .single();

  // Load screening result linked to this property + run (if any) for deal math
  const { data: sr } = await supabase
    .from("screening_results")
    .select("arv_aggregate, arv_detail_json, max_offer, offer_pct, spread, rehab_total, hold_total, transaction_total, financing_total, target_profit, trend_annual_rate, trend_confidence, is_prime_candidate, est_gap_per_sqft, review_action, pass_reason")
    .eq("real_property_id", realPropertyId)
    .eq("comp_search_run_id", compSearchRunId)
    .maybeSingle();

  const buildingSqft = phys?.building_area_total_sqft ?? phys?.above_grade_finished_area_sqft ?? null;
  const listPrice = mls?.list_price ?? null;

  const base: Omit<ScreeningCompData, "candidates"> = {
    compSearchRunId,
    realPropertyId,
    subjectAddress: prop.unparsed_address ?? "",
    subjectCity: prop.city ?? "",
    subjectListPrice: listPrice,
    subjectBuildingSqft: buildingSqft,
    subjectLat: prop.latitude ?? null,
    subjectLng: prop.longitude ?? null,
    estGapPerSqft: sr?.est_gap_per_sqft ?? null,
    arvAggregate: sr?.arv_aggregate ?? null,
    maxOffer: sr?.max_offer ?? null,
    offerPct: sr?.offer_pct ?? null,
    spread: sr?.spread ?? null,
    rehabTotal: sr?.rehab_total ?? null,
    holdTotal: sr?.hold_total ?? null,
    transactionTotal: sr?.transaction_total ?? null,
    financingTotal: sr?.financing_total ?? null,
    targetProfit: sr?.target_profit ?? null,
    trendAnnualRate: sr?.trend_annual_rate ?? null,
    trendConfidence: sr?.trend_confidence ?? null,
    isPrimeCandidate: sr?.is_prime_candidate ?? false,
    reviewAction: sr?.review_action ?? null,
    passReason: sr?.pass_reason ?? null,
    postalCode: prop.postal_code ?? null,
    county: prop.county ?? null,
    subdivision: mls?.subdivision_name ?? null,
    propertyType: phys?.property_type ?? null,
    bedsTotal: phys?.bedrooms_total ?? null,
    bathsTotal: phys?.bathrooms_total ?? null,
    garageSpaces: phys?.garage_spaces ?? null,
    levelsRaw: phys?.levels_raw ?? null,
    yearBuilt: phys?.year_built ?? null,
    aboveGradeSqft: phys?.above_grade_finished_area_sqft ?? null,
    belowGradeTotalSqft: phys?.below_grade_total_sqft ?? null,
    belowGradeFinishedSqft: phys?.below_grade_finished_area_sqft ?? null,
    lotSizeSqft: prop.lot_size_sqft ?? null,
    ownershipRaw: mls?.ownership_raw ?? null,
    occupantType: mls?.occupant_type ?? null,
    annualPropertyTax: fin?.annual_property_tax ?? null,
    annualHoaDues: fin?.annual_hoa_dues ?? null,
    mlsNumber: mls?.listing_id ?? null,
    mlsStatus: mls?.mls_status ?? null,
    mlsChangeType: mls?.mls_major_change_type ?? null,
    listDate: mls?.listing_contract_date ?? null,
    ucDate: mls?.purchase_contract_date ?? null,
    closeDate: mls?.close_date ?? null,
    originalListPrice: mls?.original_list_price ?? null,
    closePrice: mls?.close_price ?? null,
    arvByCompListingId: {} as Record<string, ArvCompBreakdown>,
  };

  // Load candidates
  const { data: candidates } = await supabase
    .from("comparable_search_candidates")
    .select(
      "id, comp_listing_row_id, selected_yn, distance_miles, days_since_close, sqft_delta_pct, raw_score, metrics_json",
    )
    .eq("comparable_search_run_id", compSearchRunId)
    .order("raw_score", { ascending: false });

  // Batch-load concessions + subdivision for backfill
  const compListingIds = (candidates ?? [])
    .map((c) => c.comp_listing_row_id)
    .filter((id): id is string => id != null);

  const concessionsMap = new Map<string, number>();
  const subdivisionMap = new Map<string, string | null>();
  if (compListingIds.length > 0) {
    const { data: listings } = await supabase
      .from("mls_listings")
      .select("id, concessions_amount, subdivision_name")
      .in("id", compListingIds);
    for (const l of listings ?? []) {
      concessionsMap.set(l.id, Number(l.concessions_amount) || 0);
      subdivisionMap.set(l.id, l.subdivision_name ?? null);
    }
  }

  const processedCandidates = (candidates ?? []).map((c) => {
    const m = (c.metrics_json ?? {}) as Record<string, unknown>;
    if (m.close_price != null && m.net_price == null) {
      const concessions = c.comp_listing_row_id
        ? concessionsMap.get(c.comp_listing_row_id) ?? 0
        : 0;
      m.net_price = (Number(m.close_price) || 0) - concessions;
      m.concessions_amount = concessions;
      const sqft = Number(m.building_area_total_sqft) || Number(m.size_basis_value) || 0;
      if (sqft > 0) {
        m.ppsf = Math.round(((m.net_price as number) / sqft) * 100) / 100;
      }
    }
    if (m.subdivision_name == null && c.comp_listing_row_id) {
      m.subdivision_name = subdivisionMap.get(c.comp_listing_row_id) ?? null;
    }
    return { ...c, metrics_json: m };
  });

  // Compute per-comp implied ARV live from all candidates
  const subjectBldg = Number(buildingSqft) || Number(phys?.above_grade_finished_area_sqft) || 0;
  const subjectAbove = Number(phys?.above_grade_finished_area_sqft) || Number(buildingSqft) || 0;
  const arvByCompListingId = computeArvForCandidates(
    processedCandidates,
    subjectBldg,
    subjectAbove,
    phys?.property_type ?? null,
  );

  return {
    ...base,
    arvByCompListingId,
    candidates: processedCandidates,
  };
}

// ---------------------------------------------------------------------------
// Add a comp manually by MLS number (screening modal version)
// ---------------------------------------------------------------------------

export async function addManualScreeningCompAction(
  compSearchRunId: string,
  subjectPropertyId: string,
  mlsNumber: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/sign-in");
  }

  if (!mlsNumber.trim()) {
    return { ok: false, error: "Enter an MLS number." };
  }

  // Lookup listing
  const { data: compListing } = await supabase
    .from("mls_listings")
    .select("id, real_property_id, close_price, concessions_amount, close_date, listing_id, subdivision_name")
    .eq("listing_id", mlsNumber.trim())
    .maybeSingle();

  if (!compListing) {
    return { ok: false, error: `No listing found for MLS# ${mlsNumber.trim()}.` };
  }

  // Check for duplicate
  const { data: existing } = await supabase
    .from("comparable_search_candidates")
    .select("id")
    .eq("comparable_search_run_id", compSearchRunId)
    .eq("comp_listing_row_id", compListing.id)
    .maybeSingle();

  if (existing) {
    return { ok: false, error: `MLS# ${mlsNumber.trim()} is already in the candidate list.` };
  }

  // Load subject + comp property data in parallel
  const [
    { data: subjectProp },
    { data: subjectPhys },
    { data: compProp },
    { data: compPhys },
  ] = await Promise.all([
    supabase.from("real_properties").select("latitude, longitude, lot_size_sqft").eq("id", subjectPropertyId).maybeSingle(),
    supabase.from("property_physical").select("building_area_total_sqft, above_grade_finished_area_sqft, below_grade_total_sqft, below_grade_finished_area_sqft, lot_size_sqft, year_built, bedrooms_total, bathrooms_total, garage_spaces, property_type, property_sub_type, structure_type, level_class_standardized, levels_raw, building_form_standardized").eq("real_property_id", subjectPropertyId).maybeSingle(),
    supabase.from("real_properties").select("latitude, longitude, unparsed_address, city, state, postal_code, lot_size_sqft").eq("id", compListing.real_property_id).maybeSingle(),
    supabase.from("property_physical").select("building_area_total_sqft, above_grade_finished_area_sqft, below_grade_total_sqft, below_grade_finished_area_sqft, year_built, bedrooms_total, bathrooms_total, garage_spaces, property_type, property_sub_type, structure_type, level_class_standardized, levels_raw, building_form_standardized").eq("real_property_id", compListing.real_property_id).maybeSingle(),
  ]);

  // Calculate deltas
  const haversine = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 3958.8;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };

  let distanceMiles: number | null = null;
  if (subjectProp?.latitude && subjectProp?.longitude && compProp?.latitude && compProp?.longitude) {
    distanceMiles = Math.round(haversine(Number(subjectProp.latitude), Number(subjectProp.longitude), Number(compProp.latitude), Number(compProp.longitude)) * 1000) / 1000;
  }

  let daysSinceClose: number | null = null;
  if (compListing.close_date) {
    daysSinceClose = Math.round((Date.now() - new Date(compListing.close_date).getTime()) / 86_400_000);
  }

  const subjectSqft = Number(subjectPhys?.building_area_total_sqft ?? subjectPhys?.above_grade_finished_area_sqft ?? 0);
  const compSqft = Number(compPhys?.building_area_total_sqft ?? compPhys?.above_grade_finished_area_sqft ?? 0);
  const sqftDeltaPct = subjectSqft > 0 && compSqft > 0
    ? Math.round(((compSqft - subjectSqft) / subjectSqft) * 1000) / 1000
    : null;

  const netPrice = (Number(compListing.close_price) || 0) - (Number(compListing.concessions_amount) || 0);
  const ppsf = compSqft > 0 ? Math.round((netPrice / compSqft) * 100) / 100 : null;

  const { error: insertError } = await supabase
    .from("comparable_search_candidates")
    .insert({
      comparable_search_run_id: compSearchRunId,
      comp_listing_row_id: compListing.id,
      comp_real_property_id: compListing.real_property_id,
      distance_miles: distanceMiles,
      days_since_close: daysSinceClose,
      sqft_delta_pct: sqftDeltaPct,
      year_built_delta: subjectPhys?.year_built && compPhys?.year_built ? Number(compPhys.year_built) - Number(subjectPhys.year_built) : null,
      bed_delta: subjectPhys?.bedrooms_total != null && compPhys?.bedrooms_total != null ? Number(compPhys.bedrooms_total) - Number(subjectPhys.bedrooms_total) : null,
      bath_delta: subjectPhys?.bathrooms_total != null && compPhys?.bathrooms_total != null ? Math.round((Number(compPhys.bathrooms_total) - Number(subjectPhys.bathrooms_total)) * 100) / 100 : null,
      raw_score: null,
      selected_yn: true,
      metrics_json: {
        source: "manual",
        listing_id: compListing.listing_id,
        address: compProp?.unparsed_address ?? null,
        city: compProp?.city ?? null,
        state: compProp?.state ?? null,
        postal_code: compProp?.postal_code ?? null,
        latitude: compProp?.latitude ?? null,
        longitude: compProp?.longitude ?? null,
        close_date: compListing.close_date,
        close_price: compListing.close_price,
        concessions_amount: compListing.concessions_amount,
        net_price: netPrice,
        ppsf,
        building_area_total_sqft: compPhys?.building_area_total_sqft ?? null,
        above_grade_finished_area_sqft: compPhys?.above_grade_finished_area_sqft ?? null,
        below_grade_total_sqft: compPhys?.below_grade_total_sqft ?? null,
        below_grade_finished_area_sqft: compPhys?.below_grade_finished_area_sqft ?? null,
        lot_size_sqft: compProp?.lot_size_sqft ?? null,
        bedrooms_total: compPhys?.bedrooms_total ?? null,
        bathrooms_total: compPhys?.bathrooms_total ?? null,
        garage_spaces: compPhys?.garage_spaces ?? null,
        year_built: compPhys?.year_built ?? null,
        property_type: compPhys?.property_type ?? null,
        property_sub_type: compPhys?.property_sub_type ?? null,
        structure_type: compPhys?.structure_type ?? null,
        level_class_standardized: compPhys?.level_class_standardized ?? null,
        levels_raw: compPhys?.levels_raw ?? null,
        building_form_standardized: compPhys?.building_form_standardized ?? null,
        subdivision_name: compListing.subdivision_name ?? null,
        distance_miles: distanceMiles,
        days_since_close: daysSinceClose,
        sqft_delta_pct: sqftDeltaPct,
      },
      score_breakdown_json: { source: "manual" },
    });

  if (insertError) {
    return { ok: false, error: insertError.message };
  }

  return { ok: true };
}

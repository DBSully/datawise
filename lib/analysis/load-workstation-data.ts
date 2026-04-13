/**
 * Loads all data needed for the analysis workstation and computes derived values.
 * Used by both the analysis page (for rendering) and the report generation action (for snapshots).
 */

import { calculateArv } from "@/lib/screening/arv-engine";
import { calculateRehab } from "@/lib/screening/rehab-engine";
import { calculateHolding } from "@/lib/screening/holding-engine";
import { calculateTransaction } from "@/lib/screening/transaction-engine";
import { calculateFinancing } from "@/lib/screening/financing-engine";
import { calculateDealMath } from "@/lib/screening/deal-math";
import {
  DENVER_FLIP_V1,
  resolvePropertyTypeKey,
} from "@/lib/screening/strategy-profiles";
import type { RehabScopeTier, RehabCategoryKey, CategoryScopeTier, CategoryScopeValue, RehabCategoryScopes } from "@/lib/screening/types";
import type { WorkstationData, TrendTierStats, RehabDetail, RehabCategoryScopeDetail } from "@/lib/reports/types";
import type { RehabConfig } from "@/lib/screening/strategy-profiles";

type TrendDetailJsonShape = {
  localStats?: TrendTierStats;
  metroStats?: TrendTierStats;
  direction?: string;
};

function defaultComparableProfileSlug(propertyType: string | null) {
  const normalized = (propertyType ?? "").trim().toLowerCase();
  if (normalized === "condo") return "denver_condo_standard_v1";
  if (normalized === "townhome") return "denver_townhome_standard_v1";
  return "denver_detached_standard_v1";
}

const REHAB_CATEGORY_KEYS: RehabCategoryKey[] = [
  "aboveGrade", "belowGradeFinished", "belowGradeUnfinished",
  "exterior", "landscaping", "systems",
];

/** Resolve a single category scope value to a tier label and numeric multiplier.
 *  For { cost } overrides, multiplier is set to -1 as a sentinel — the caller
 *  uses the cost value directly instead. */
function resolveCategoryScope(
  value: CategoryScopeValue | undefined,
  config: RehabConfig,
): RehabCategoryScopeDetail & { costOverride?: number } {
  if (value === undefined || value === null) {
    return { tier: "moderate", multiplier: config.categoryScopeMultipliers.moderate };
  }
  if (typeof value === "string") {
    const mult = config.categoryScopeMultipliers[value];
    return { tier: value, multiplier: mult ?? config.categoryScopeMultipliers.moderate };
  }
  if (typeof value === "object" && "cost" in value && typeof value.cost === "number") {
    return { tier: "custom", multiplier: 1, costOverride: value.cost };
  }
  return { tier: "moderate", multiplier: config.categoryScopeMultipliers.moderate };
}

function toNum(v: unknown): number {
  if (v === null || v === undefined || v === "") return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Sums two nullable numeric values with NULL semantics:
 *   - both null    → null
 *   - one null     → the other value
 *   - both set     → sum
 *
 * Used by Phase 1 Step 3A to collapse property_physical's
 * lower_level_* and basement_level_* columns into a single
 * "Lower" value for the Property Physical tile bed/bath grid
 * (per WORKSTATION_CARD_SPEC.md §3.2 Tile 2 — 4-column grid).
 */
function sumNullSafe(a: unknown, b: unknown): number | null {
  const aNull = a === null || a === undefined;
  const bNull = b === null || b === undefined;
  if (aNull && bNull) return null;
  const aNum = aNull ? 0 : Number(a);
  const bNum = bNull ? 0 : Number(b);
  if (!Number.isFinite(aNum) || !Number.isFinite(bNum)) return null;
  return aNum + bNum;
}

/**
 * Loads all analysis data from Supabase and computes derived values.
 * Returns null if the property or analysis is not found.
 */
export async function loadWorkstationData(
  supabase: any,
  userId: string,
  propertyId: string,
  analysisId: string,
): Promise<WorkstationData | null> {
  // ---- Load all data in parallel ----
  const [
    { data: property, error: propErr },
    { data: physical, error: physErr },
    { data: financials },
    { data: analysis, error: analysisErr },
    { data: manualAnalysis },
    { data: pipeline },
    { data: notes },
  ] = await Promise.all([
    supabase
      .from("real_properties")
      .select("id, unparsed_address, city, county, state, postal_code, parcel_id, latitude, longitude, lot_size_sqft, lot_size_acres")
      .eq("id", propertyId)
      .maybeSingle(),
    supabase
      .from("property_physical")
      .select(
        "property_type, property_sub_type, structure_type, level_class_standardized, " +
        "levels_raw, building_form_standardized, building_area_total_sqft, " +
        "above_grade_finished_area_sqft, below_grade_total_sqft, " +
        "below_grade_finished_area_sqft, below_grade_unfinished_area_sqft, " +
        "year_built, bedrooms_total, bathrooms_total, garage_spaces, " +
        // NEW (Phase 1 Step 3A): level-specific bed/bath columns for the
        // Property Physical tile mini-grid in the new Workstation (3E).
        "main_level_bedrooms, main_level_bathrooms, " +
        "upper_level_bedrooms, upper_level_bathrooms, " +
        "lower_level_bedrooms, lower_level_bathrooms, " +
        "basement_level_bedrooms, basement_level_bathrooms"
      )
      .eq("real_property_id", propertyId)
      .maybeSingle(),
    supabase
      .from("property_financials")
      .select("annual_property_tax, annual_hoa_dues")
      .eq("real_property_id", propertyId)
      .maybeSingle(),
    supabase
      .from("analyses")
      .select("id, real_property_id, listing_id, scenario_name, strategy_type, status, analysis_completed_at, created_at")
      .eq("id", analysisId)
      .eq("real_property_id", propertyId)
      .eq("created_by_user_id", userId)
      .eq("is_archived", false)
      .maybeSingle(),
    supabase
      .from("manual_analysis")
      .select("*")
      .eq("analysis_id", analysisId)
      .maybeSingle(),
    supabase
      .from("analysis_pipeline")
      .select("*")
      .eq("analysis_id", analysisId)
      .maybeSingle(),
    supabase
      .from("analysis_notes")
      .select("id, note_type, note_body, visibility, created_at, updated_at")
      .eq("analysis_id", analysisId)
      .order("created_at", { ascending: true }),
  ]);

  if (propErr) throw new Error(propErr.message);
  if (physErr) throw new Error(physErr.message);
  if (analysisErr) throw new Error(analysisErr.message);
  if (!property || !analysis) return null;

  // Load listing
  const listingSelect = "id, listing_id, mls_status, list_price, close_price, concessions_amount, listing_contract_date, purchase_contract_date, close_date, mls_major_change_type, property_condition_source, source_system, original_list_price, subdivision_name";
  let listing: Record<string, unknown> | null = null;

  if (analysis.listing_id) {
    const { data } = await supabase
      .from("mls_listings")
      .select(listingSelect)
      .eq("real_property_id", propertyId)
      .eq("listing_id", analysis.listing_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    listing = data;
  }
  if (!listing) {
    const { data } = await supabase
      .from("mls_listings")
      .select(listingSelect)
      .eq("real_property_id", propertyId)
      .order("listing_contract_date", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    listing = data;
  }

  // Load screening result (if promoted from screening)
  const { data: screeningResult } = await supabase
    .from("screening_results")
    .select("arv_aggregate, arv_per_sqft, arv_comp_count, rehab_total, hold_total, hold_days, transaction_total, max_offer, est_gap_per_sqft, spread, offer_pct, rehab_composite_multiplier, target_profit, trend_annual_rate, trend_local_rate, trend_metro_rate, trend_local_comp_count, trend_metro_comp_count, trend_local_radius, trend_metro_radius, trend_is_fallback, trend_confidence, trend_low_end_rate, trend_high_end_rate, trend_summary, trend_detail_json")
    .eq("promoted_analysis_id", analysisId)
    .maybeSingle();

  // Load latest comp run for this analysis
  const { data: latestRun } = await supabase
    .from("comparable_search_runs")
    .select("id, status, parameters_json, summary_json, created_at")
    .eq("analysis_id", analysisId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Load comp candidates (shared pool for both ARV and As-Is selection)
  let compCandidates: Array<Record<string, unknown>> = [];
  if (latestRun?.id) {
    const { data: rawCandidates } = await supabase
      .from("comparable_search_candidates")
      .select("id, comp_listing_row_id, comp_real_property_id, distance_miles, days_since_close, sqft_delta_pct, raw_score, selected_yn, selected_as_is_yn, metrics_json, score_breakdown_json, analyst_adjustments_json")
      .eq("comparable_search_run_id", latestRun.id)
      .order("raw_score", { ascending: false });

    if (rawCandidates) {
      // Resolve listing IDs
      const compListingIds = Array.from(
        new Set(rawCandidates.map((c: any) => c.comp_listing_row_id).filter(Boolean)),
      );
      let listingIdMap = new Map<string, string>();
      let listingExtraMap = new Map<string, { subdivision_name: string | null; concessions_amount: number | null }>();
      if (compListingIds.length > 0) {
        const { data: compListings } = await supabase
          .from("mls_listings")
          .select("id, listing_id, subdivision_name, concessions_amount")
          .in("id", compListingIds.slice(0, 200));
        listingIdMap = new Map((compListings ?? []).map((r: any) => [r.id, r.listing_id]));
        listingExtraMap = new Map((compListings ?? []).map((r: any) => [r.id, { subdivision_name: r.subdivision_name, concessions_amount: r.concessions_amount }]));
      }

      // Resolve lat/lng from real_properties for map pins
      const compPropertyIds = Array.from(
        new Set(rawCandidates.map((c: any) => c.comp_real_property_id).filter(Boolean)),
      );
      let coordsMap = new Map<string, { latitude: number | null; longitude: number | null }>();
      if (compPropertyIds.length > 0) {
        const { data: compProps } = await supabase
          .from("real_properties")
          .select("id, latitude, longitude")
          .in("id", compPropertyIds.slice(0, 200));
        coordsMap = new Map((compProps ?? []).map((r: any) => [r.id, { latitude: r.latitude, longitude: r.longitude }]));
      }

      compCandidates = rawCandidates.map((c: any) => {
        const coords = c.comp_real_property_id ? coordsMap.get(c.comp_real_property_id) : null;
        const extra = c.comp_listing_row_id ? listingExtraMap.get(c.comp_listing_row_id) : null;
        const metrics = (c.metrics_json ?? {}) as Record<string, unknown>;
        // Backfill subdivision_name and net_price from source if missing
        const subdivName = metrics.subdivision_name ?? extra?.subdivision_name ?? null;
        const concessions = Number(metrics.concessions_amount) || Number(extra?.concessions_amount) || 0;
        const grossPrice = Number(metrics.close_price) || 0;
        const netPrice = metrics.net_price ?? (grossPrice > 0 ? grossPrice - concessions : null);
        return {
          ...c,
          listing_id: c.comp_listing_row_id ? listingIdMap.get(c.comp_listing_row_id) ?? null : null,
          metrics_json: {
            ...metrics,
            latitude: metrics.latitude ?? coords?.latitude ?? null,
            longitude: metrics.longitude ?? coords?.longitude ?? null,
            subdivision_name: subdivName,
            net_price: netPrice,
            concessions_amount: concessions || metrics.concessions_amount,
          },
        };
      });
    }
  }

  // ---- Compute deal analysis values ----
  const profile = DENVER_FLIP_V1;
  const propertyType = resolvePropertyTypeKey(physical?.property_type);
  const buildingSqft = toNum(physical?.building_area_total_sqft) || toNum(physical?.above_grade_finished_area_sqft);
  const aboveGradeSqft = toNum(physical?.above_grade_finished_area_sqft) || buildingSqft;
  const belowGradeFinishedSqft = toNum(physical?.below_grade_finished_area_sqft);
  const belowGradeTotalSqft = toNum(physical?.below_grade_total_sqft);
  const belowGradeUnfinishedSqft = Math.max(0, belowGradeTotalSqft - belowGradeFinishedSqft);
  const listPrice = toNum(listing?.list_price);
  // For off-market properties use ARV (computed later) as the cost anchor

  // Trend data from screening (if promoted)
  const trendDetailJson = screeningResult?.trend_detail_json as Record<string, unknown> | null;
  const trendData = screeningResult?.trend_annual_rate != null ? {
    blendedAnnualRate: toNum(screeningResult.trend_annual_rate),
    rawLocalRate: screeningResult.trend_local_rate != null ? toNum(screeningResult.trend_local_rate) : null,
    rawMetroRate: screeningResult.trend_metro_rate != null ? toNum(screeningResult.trend_metro_rate) : null,
    localCompCount: screeningResult.trend_local_comp_count ?? 0,
    metroCompCount: screeningResult.trend_metro_comp_count ?? 0,
    localRadius: toNum(screeningResult.trend_local_radius),
    metroRadius: toNum(screeningResult.trend_metro_radius),
    direction: (trendDetailJson?.direction as string ?? "flat") as "strong_appreciation" | "appreciating" | "flat" | "softening" | "declining" | "sharp_decline",
    isFallback: screeningResult.trend_is_fallback ?? false,
    confidence: (screeningResult.trend_confidence as "high" | "low" | "fallback") ?? "fallback",
    lowEndRate: screeningResult.trend_low_end_rate != null ? toNum(screeningResult.trend_low_end_rate) : null,
    highEndRate: screeningResult.trend_high_end_rate != null ? toNum(screeningResult.trend_high_end_rate) : null,
    summary: screeningResult.trend_summary ?? null,
    detailJson: trendDetailJson as TrendDetailJsonShape | null,
  } : null;

  // Override ARV config with data-driven trend rate when available
  const arvConfig = trendData
    ? { ...profile.arv, timeAdjustmentAnnualRate: trendData.blendedAnnualRate }
    : profile.arv;

  // Auto ARV (from screening, frozen)
  const autoArv = screeningResult?.arv_aggregate ? toNum(screeningResult.arv_aggregate) : null;
  const autoRehab = screeningResult?.rehab_total ? toNum(screeningResult.rehab_total) : null;

  // Selected ARV (from currently selected comps)
  const selectedComps = compCandidates.filter((c: any) => c.selected_yn);
  let selectedArvResult: {
    arvAggregate: number;
    arvPerSqft: number;
    compCount: number;
    perCompDetails: import("@/lib/reports/types").ArvPerCompDetail[];
  } | null = null;

  if (selectedComps.length > 0 && buildingSqft > 0) {
    const compInputs = selectedComps.map((c: any) => {
      const m = (c.metrics_json ?? {}) as Record<string, unknown>;
      return {
        compListingRowId: String(c.comp_listing_row_id ?? ""),
        compRealPropertyId: String(c.comp_real_property_id ?? ""),
        listingId: String(m.listing_id ?? c.listing_id ?? ""),
        address: String(m.address ?? ""),
        netSalePrice: toNum(m.net_price) || (toNum(m.close_price) - toNum(m.concessions_amount)),
        closeDateIso: String(m.close_date ?? ""),
        compBuildingSqft: toNum(m.building_area_total_sqft) || toNum(m.above_grade_finished_area_sqft),
        compAboveGradeSqft: toNum(m.above_grade_finished_area_sqft) || toNum(m.building_area_total_sqft),
        distanceMiles: toNum(c.distance_miles),
        yearBuilt: m.year_built !== null && m.year_built !== undefined ? Number(m.year_built) : null,
        bedroomsTotal: m.bedrooms_total !== null && m.bedrooms_total !== undefined ? Number(m.bedrooms_total) : null,
        bathroomsTotal: m.bathrooms_total !== null && m.bathrooms_total !== undefined ? Number(m.bathrooms_total) : null,
        propertyType: m.property_type ? String(m.property_type) : null,
        levelClass: m.level_class_standardized ? String(m.level_class_standardized) : null,
        mlsStatus: null,
        analystAdjustments: c.analyst_adjustments_json ?? null,
        _candidateId: c.id,
      };
    });

    const arvResult = calculateArv({
      subjectBuildingSqft: buildingSqft,
      subjectAboveGradeSqft: aboveGradeSqft,
      comps: compInputs,
      config: arvConfig,
      propertyType,
    });

    if (arvResult) {
      // Build a lookup from compListingRowId → candidateId
      const candidateIdByComp = new Map<string, string>();
      for (const ci of compInputs) {
        if (ci.compListingRowId && ci._candidateId) {
          candidateIdByComp.set(ci.compListingRowId, ci._candidateId);
        }
      }

      selectedArvResult = {
        arvAggregate: arvResult.arvAggregate,
        arvPerSqft: arvResult.arvPerSqft,
        compCount: arvResult.compCount,
        perCompDetails: arvResult.perCompDetails.map((d) => ({
          address: d.address,
          netSalePrice: d.netSalePrice,
          closeDateIso: d.closeDateIso,
          daysSinceClose: d.daysSinceClose,
          distanceMiles: d.distanceMiles,
          compBuildingSqft: d.compBuildingSqft,
          psfBuilding: d.psfBuilding,
          arvBlended: d.arvBlended,
          timeAdjustment: d.timeAdjustment,
          arvTimeAdjusted: d.arvTimeAdjusted,
          analystAdjustments: d.analystAdjustments,
          analystAdjustmentTotal: d.analystAdjustmentTotal,
          arvFinal: d.arvFinal,
          confidence: d.confidence,
          decayWeight: d.decayWeight,
          candidateId: candidateIdByComp.get(d.compListingRowId),
        })),
      };
    }
  }

  const selectedArv = selectedArvResult?.arvAggregate ?? null;

  // Per-candidate implied ARV (for all candidates, not just selected)
  const arvByCompListingId: Record<string, import("@/lib/reports/types").ArvCompBreakdown> = {};
  if (compCandidates.length > 0 && buildingSqft > 0) {
    const allCompInputs = compCandidates
      .filter((c: any) => c.comp_listing_row_id)
      .map((c: any) => {
        const m = (c.metrics_json ?? {}) as Record<string, unknown>;
        const cp = toNum(m.net_price) || (toNum(m.close_price) - toNum(m.concessions_amount));
        const cd = m.close_date ? String(m.close_date) : null;
        if (cp <= 0 || !cd) return null;
        return {
          compListingRowId: String(c.comp_listing_row_id),
          compRealPropertyId: String(c.comp_real_property_id ?? ""),
          listingId: String(m.listing_id ?? c.listing_id ?? ""),
          address: String(m.address ?? ""),
          netSalePrice: cp,
          closeDateIso: cd,
          compBuildingSqft: toNum(m.building_area_total_sqft) || toNum(m.above_grade_finished_area_sqft),
          compAboveGradeSqft: toNum(m.above_grade_finished_area_sqft) || toNum(m.building_area_total_sqft),
          distanceMiles: toNum(c.distance_miles),
          yearBuilt: m.year_built != null ? Number(m.year_built) : null,
          bedroomsTotal: m.bedrooms_total != null ? Number(m.bedrooms_total) : null,
          bathroomsTotal: m.bathrooms_total != null ? Number(m.bathrooms_total) : null,
          propertyType: m.property_type ? String(m.property_type) : null,
          levelClass: m.level_class_standardized ? String(m.level_class_standardized) : null,
          mlsStatus: null,
        };
      })
      .filter(Boolean) as any[];

    if (allCompInputs.length > 0) {
      const allArvResult = calculateArv({
        subjectBuildingSqft: buildingSqft,
        subjectAboveGradeSqft: aboveGradeSqft,
        comps: allCompInputs,
        config: arvConfig,
        propertyType,
      });
      if (allArvResult) {
        for (const d of allArvResult.perCompDetails) {
          arvByCompListingId[d.compListingRowId] = {
            arv: d.arvFinal,
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
      }
    }
  }

  // Final ARV (manual override)
  const finalArv = manualAnalysis?.arv_manual ? toNum(manualAnalysis.arv_manual) : null;

  // Effective ARV = Final ?? Selected ?? Auto
  const effectiveArv = finalArv ?? selectedArv ?? autoArv ?? 0;

  // Price anchor for cost engines: list price when available, else ARV
  const costAnchor = listPrice > 0 ? listPrice : effectiveArv;

  // Rehab — compute full result for detail card
  const manualRehab = manualAnalysis?.rehab_manual ? toNum(manualAnalysis.rehab_manual) : null;
  const rehabScope = (manualAnalysis?.rehab_scope as RehabScopeTier | null) ?? null;
  const scopeMultiplier = rehabScope ? profile.rehab.scopeMultipliers[rehabScope] : profile.rehab.scopeMultipliers.moderate;

  // Per-category scopes (new system) — takes precedence over global scope when present
  const rawCategoryScopes = manualAnalysis?.rehab_category_scopes as RehabCategoryScopes | null;
  const hasCategoryScopes = rawCategoryScopes != null && Object.keys(rawCategoryScopes).length > 0;

  let computedRehabResult: {
    compositeMultiplier: number;
    typeMultiplier: number;
    conditionMultiplier: number;
    priceMultiplier: number;
    ageMultiplier: number;
    aboveGrade: number;
    belowGradeFinished: number;
    belowGradeUnfinished: number;
    belowGradeTotal: number;
    interior: number;
    exterior: number;
    landscaping: number;
    systems: number;
    total: number;
    perSqftBuilding: number;
    perSqftAboveGrade: number;
    categoryScopes?: Record<RehabCategoryKey, RehabCategoryScopeDetail>;
  } | null = null;

  // Pre-scope base costs per category (sent to client for instant recalc)
  let rehabBaseDetail: Pick<RehabDetail, RehabCategoryKey> | null = null;

  if (buildingSqft > 0) {
    const rehabResult = calculateRehab({
      propertyType,
      aboveGradeSqft,
      belowGradeFinishedSqft,
      belowGradeUnfinishedSqft,
      buildingSqft,
      priceAnchor: costAnchor,
      yearBuilt: physical?.year_built ?? null,
      condition: listing?.property_condition_source ? String(listing.property_condition_source) : null,
      config: profile.rehab,
    });

    // Store pre-scope base costs for client-side instant recalc
    rehabBaseDetail = {
      aboveGrade: rehabResult.aboveGrade,
      belowGradeFinished: rehabResult.belowGradeFinished,
      belowGradeUnfinished: rehabResult.belowGradeUnfinished,
      exterior: rehabResult.exterior,
      landscaping: rehabResult.landscaping,
      systems: rehabResult.systems,
    };

    // Resolve per-category multipliers (with optional cost overrides)
    const catScopes: Record<RehabCategoryKey, RehabCategoryScopeDetail> = {} as any;
    const costOverrides: Partial<Record<RehabCategoryKey, number>> = {};
    for (const key of REHAB_CATEGORY_KEYS) {
      if (hasCategoryScopes) {
        const resolved = resolveCategoryScope(rawCategoryScopes?.[key], profile.rehab);
        catScopes[key] = { tier: resolved.tier, multiplier: resolved.multiplier };
        if (resolved.costOverride !== undefined) {
          costOverrides[key] = resolved.costOverride;
        }
      } else {
        // Fall back to global scope multiplier — map legacy tier name to category tier
        const legacyToCategory: Record<string, CategoryScopeTier> = {
          cosmetic: "light", moderate: "moderate", heavy: "heavy", gut: "gut",
        };
        const fallbackTier = legacyToCategory[rehabScope ?? "moderate"] ?? "moderate";
        catScopes[key] = { tier: fallbackTier, multiplier: scopeMultiplier };
      }
    }

    // Apply multipliers (or direct cost overrides) per category
    function applyCat(key: RehabCategoryKey, baseVal: number): number {
      if (costOverrides[key] !== undefined) return Math.round(costOverrides[key]!);
      return Math.round(baseVal * catScopes[key].multiplier);
    }

    const aboveGrade = applyCat("aboveGrade", rehabResult.aboveGrade);
    const belowGradeFinished = applyCat("belowGradeFinished", rehabResult.belowGradeFinished);
    const belowGradeUnfinished = applyCat("belowGradeUnfinished", rehabResult.belowGradeUnfinished);
    const belowGradeTotal = belowGradeFinished + belowGradeUnfinished;
    const interior = aboveGrade + belowGradeTotal;
    const exterior = applyCat("exterior", rehabResult.exterior);
    const landscaping = applyCat("landscaping", rehabResult.landscaping);
    const systems = applyCat("systems", rehabResult.systems);
    const total = interior + exterior + landscaping + systems;

    computedRehabResult = {
      ...rehabResult,
      aboveGrade,
      belowGradeFinished,
      belowGradeUnfinished,
      belowGradeTotal,
      interior,
      exterior,
      landscaping,
      systems,
      total,
      perSqftBuilding: buildingSqft > 0 ? Math.round(total / buildingSqft * 100) / 100 : 0,
      perSqftAboveGrade: aboveGradeSqft > 0 ? Math.round(total / aboveGradeSqft * 100) / 100 : 0,
      categoryScopes: catScopes,
    };
  }

  const computedRehab = computedRehabResult?.total ?? null;

  // Custom rehab items — always added on top of the base rehab
  const rawCustomItems = Array.isArray(manualAnalysis?.rehab_custom_items)
    ? (manualAnalysis.rehab_custom_items as Array<{ label: string; cost: number }>).filter(
        (item) => item && typeof item.cost === "number",
      )
    : [];
  const customItemsTotal = rawCustomItems.reduce((sum, item) => sum + item.cost, 0);

  const effectiveRehab = (manualRehab ?? computedRehab ?? autoRehab ?? 0) + customItemsTotal;

  // Holding — full result
  const holdResult = buildingSqft > 0 ? calculateHolding({
    buildingSqft,
    priceAnchor: costAnchor,
    annualTax: financials?.annual_property_tax ? toNum(financials.annual_property_tax) : null,
    annualHoa: financials?.annual_hoa_dues ? toNum(financials.annual_hoa_dues) : null,
    config: profile.holding,
  }) : null;

  // Transaction — full result
  const transResult = effectiveArv > 0 ? calculateTransaction({
    acquisitionPrice: costAnchor,
    arvPrice: effectiveArv,
    config: profile.transaction,
  }) : null;

  // Financing
  const financingOverrides = {
    annualRate: manualAnalysis?.financing_rate_manual ? toNum(manualAnalysis.financing_rate_manual) : null,
    pointsRate: manualAnalysis?.financing_points_manual ? toNum(manualAnalysis.financing_points_manual) : null,
    ltvPct: manualAnalysis?.financing_ltv_manual ? toNum(manualAnalysis.financing_ltv_manual) : null,
  };
  const finResult = effectiveArv > 0 && holdResult && profile.financing.enabled
    ? calculateFinancing({
        arv: effectiveArv,
        daysHeld: holdResult.daysHeld,
        config: profile.financing,
        overrides: financingOverrides,
      })
    : null;

  // Target profit (manual override or profile default)
  const manualTargetProfit = manualAnalysis?.target_profit_manual ? toNum(manualAnalysis.target_profit_manual) : null;
  const effectiveTargetProfit = manualTargetProfit ?? profile.targetProfitDefault;

  // Deal math
  const dealMath = effectiveArv > 0 ? calculateDealMath({
    arv: effectiveArv,
    listPrice: listPrice > 0 ? listPrice : null,
    buildingSqft,
    rehabTotal: effectiveRehab,
    holdTotal: holdResult?.total ?? 0,
    transactionTotal: transResult?.total ?? 0,
    financingTotal: finResult?.total ?? 0,
    targetProfit: effectiveTargetProfit,
  }) : null;

  // Cash out of pocket
  const downPaymentRate = profile.financing.downPaymentRate;
  let cashRequired: WorkstationData["cashRequired"] = null;

  // Use max offer as purchase price basis — that's what we'd actually pay
  const purchasePrice = dealMath?.maxOffer ?? 0;

  if (purchasePrice > 0 && finResult) {
    const downPayment = Math.round(purchasePrice * downPaymentRate);
    const loanForPurchase = purchasePrice - downPayment;
    const originationCost = finResult.originationCost;
    const loanAvailableForRehab = Math.max(0, finResult.loanAmount - loanForPurchase - originationCost);
    const rehabFromLoan = Math.min(effectiveRehab, loanAvailableForRehab);
    const rehabOutOfPocket = Math.max(0, effectiveRehab - loanAvailableForRehab);
    const acquisitionTitle = transResult?.acquisitionTitle ?? 0;
    // NEW (Phase 1 Step 3A — Decision 5 cascade):
    // Acquisition Commission is signed (negative = credit at closing).
    // Acquisition Fee is always positive (flat dollars).
    // Both default to 0 in DENVER_FLIP_V1, so existing totalCashRequired
    // values are preserved unchanged for analyses using the default profile.
    const acquisitionCommission = transResult?.acquisitionCommission ?? 0;
    const acquisitionFee = transResult?.acquisitionFee ?? 0;
    const holdingTotal = holdResult?.total ?? 0;
    const interestCost = finResult.interestCost;

    // Acquisition section: paid at closing, cash impact at purchase
    // (per WORKSTATION_CARD_SPEC.md §5.5)
    const acquisitionSubtotal =
      downPayment +
      acquisitionTitle +
      acquisitionCommission +  // signed — negative reduces total
      acquisitionFee +
      originationCost;

    // Project carry section: paid through the hold period
    const carrySubtotal =
      rehabOutOfPocket +
      holdingTotal +
      interestCost;

    const totalCashRequired = acquisitionSubtotal + carrySubtotal;

    cashRequired = {
      purchasePrice,
      downPaymentRate,
      downPayment,
      loanForPurchase,
      originationCost,
      loanAvailableForRehab,
      rehabTotal: effectiveRehab,
      rehabFromLoan,
      rehabOutOfPocket,
      acquisitionTitle,
      acquisitionCommission,
      acquisitionFee,
      holdingTotal,
      interestCost,
      acquisitionSubtotal,
      carrySubtotal,
      totalCashRequired,
    };
  }

  // Comp summary stats (ARV)
  const totalComps = compCandidates.length;
  const selectedCount = selectedComps.length;
  const avgSelectedPrice = selectedCount > 0
    ? Math.round(selectedComps.reduce((sum: number, c: any) => {
        const m = c.metrics_json as any;
        return sum + (toNum(m?.net_price) || (toNum(m?.close_price) - toNum(m?.concessions_amount)));
      }, 0) / selectedCount)
    : null;
  const avgSelectedPsf = selectedCount > 0
    ? Math.round(selectedComps.reduce((sum: number, c: any) => sum + toNum((c.metrics_json as any)?.ppsf), 0) / selectedCount)
    : null;
  const avgSelectedDist = selectedCount > 0
    ? Math.round(selectedComps.reduce((sum: number, c: any) => sum + toNum(c.distance_miles), 0) / selectedCount * 100) / 100
    : null;

  // Comp summary stats (As-Is) — same candidate pool, different selection flag
  const asIsSelectedComps = compCandidates.filter((c: any) => c.selected_as_is_yn);
  const asIsTotalComps = compCandidates.length;
  const asIsSelectedCount = asIsSelectedComps.length;
  const asIsAvgSelectedPrice = asIsSelectedCount > 0
    ? Math.round(asIsSelectedComps.reduce((sum: number, c: any) => {
        const m = c.metrics_json as any;
        return sum + (toNum(m?.net_price) || (toNum(m?.close_price) - toNum(m?.concessions_amount)));
      }, 0) / asIsSelectedCount)
    : null;
  const asIsAvgSelectedPsf = asIsSelectedCount > 0
    ? Math.round(asIsSelectedComps.reduce((sum: number, c: any) => sum + toNum((c.metrics_json as any)?.ppsf), 0) / asIsSelectedCount)
    : null;
  const asIsAvgSelectedDist = asIsSelectedCount > 0
    ? Math.round(asIsSelectedComps.reduce((sum: number, c: any) => sum + toNum(c.distance_miles), 0) / asIsSelectedCount * 100) / 100
    : null;

  // Build the data payload
  return {
    propertyId,
    analysisId,
    analysis: {
      scenarioName: analysis.scenario_name,
      strategyType: analysis.strategy_type,
      status: analysis.status,
      analysisCompletedAt: analysis.analysis_completed_at,
    },
    property: {
      address: property.unparsed_address,
      city: property.city,
      county: property.county,
      state: property.state,
      postalCode: property.postal_code,
      latitude: property.latitude ? toNum(property.latitude) : null,
      longitude: property.longitude ? toNum(property.longitude) : null,
    },
    physical: physical ? {
      propertyType: physical.property_type,
      propertySubType: physical.property_sub_type,
      structureType: physical.structure_type,
      levelClass: physical.level_class_standardized,
      buildingSqft,
      aboveGradeSqft,
      belowGradeTotalSqft,
      belowGradeFinishedSqft,
      yearBuilt: physical.year_built,
      bedroomsTotal: physical.bedrooms_total,
      bathroomsTotal: physical.bathrooms_total,
      garageSpaces: physical.garage_spaces,
      lotSizeSqft: toNum(property.lot_size_sqft),
      // NEW (Phase 1 Step 3A): per-level bed/bath breakdown for the
      // Property Physical tile mini-grid in the new Workstation (3E).
      // bedroomsLower / bathroomsLower collapse lower_level_* and
      // basement_level_* into a single value via NULL-safe sum:
      // - if both are null → null
      // - if one is null → the other value
      // - if both are set → the sum
      bedroomsMain: physical.main_level_bedrooms ?? null,
      bedroomsUpper: physical.upper_level_bedrooms ?? null,
      bedroomsLower: sumNullSafe(physical.lower_level_bedrooms, physical.basement_level_bedrooms),
      bathroomsMain: physical.main_level_bathrooms ?? null,
      bathroomsUpper: physical.upper_level_bathrooms ?? null,
      bathroomsLower: sumNullSafe(physical.lower_level_bathrooms, physical.basement_level_bathrooms),
    } : null,
    listing: listing ? {
      listingId: listing.listing_id as string,
      mlsStatus: listing.mls_status as string | null,
      listPrice,
      originalListPrice: toNum(listing.original_list_price),
      listingContractDate: listing.listing_contract_date as string | null,
      subdivisionName: listing.subdivision_name as string | null,
      mlsMajorChangeType: listing.mls_major_change_type as string | null,
      purchaseContractDate: listing.purchase_contract_date as string | null,
      closeDate: listing.close_date as string | null,
    } : null,
    financials: financials ? {
      annualTax: toNum(financials.annual_property_tax),
      annualHoa: toNum(financials.annual_hoa_dues),
    } : null,
    trend: trendData,
    arv: {
      auto: autoArv,
      selected: selectedArv,
      final: finalArv,
      effective: effectiveArv,
      selectedDetail: selectedArvResult,
    },
    rehab: {
      auto: autoRehab,
      computed: computedRehab,
      manual: manualRehab,
      effective: effectiveRehab,
      scope: rehabScope,
      scopeMultiplier,
      detail: computedRehabResult,
      baseDetail: rehabBaseDetail,
      categoryScopes: rawCategoryScopes ?? null,
      customItems: Array.isArray(manualAnalysis?.rehab_custom_items)
        ? (manualAnalysis.rehab_custom_items as Array<{ label: string; cost: number }>).filter(
            (item) => item && typeof item.label === "string" && typeof item.cost === "number",
          )
        : [],
    },
    holding: holdResult,
    transaction: transResult,
    financing: finResult,
    dealMath,
    compSummary: {
      totalComps,
      selectedCount,
      avgSelectedPrice,
      avgSelectedPsf,
      avgSelectedDist,
    },
    manualAnalysis: manualAnalysis ?? null,
    pipeline: pipeline ?? null,
    notes: (notes ?? []) as Array<{
      id: string;
      note_type: string;
      note_body: string;
      visibility: string;
      created_at: string;
    }>,
    compModalData: {
      subjectListingRowId: listing?.id as string ?? null,
      subjectListingMlsNumber: listing?.listing_id as string ?? null,
      defaultProfileSlug: defaultComparableProfileSlug(physical?.property_type ?? null),
      latestRun: latestRun ? {
        id: latestRun.id as string,
        status: latestRun.status as string | null,
        created_at: latestRun.created_at as string | null,
        parameters_json: latestRun.parameters_json as Record<string, unknown> | null,
        summary_json: latestRun.summary_json as Record<string, unknown> | null,
      } : null,
      compCandidates,
      arvByCompListingId,
    },
    asIsCompSummary: {
      totalComps: asIsTotalComps,
      selectedCount: asIsSelectedCount,
      avgSelectedPrice: asIsAvgSelectedPrice,
      avgSelectedPsf: asIsAvgSelectedPsf,
      avgSelectedDist: asIsAvgSelectedDist,
    },
    subjectContext: {
      propertyType: physical?.property_type ?? null,
      propertySubType: physical?.property_sub_type ?? null,
      buildingFormStandardized: physical?.building_form_standardized ?? null,
      levelClassStandardized: physical?.level_class_standardized ?? null,
      levelsRaw: physical?.levels_raw ?? null,
      buildingAreaTotalSqft: toNum(physical?.building_area_total_sqft),
      aboveGradeFinishedAreaSqft: toNum(physical?.above_grade_finished_area_sqft),
      belowGradeTotalSqft: toNum(physical?.below_grade_total_sqft),
      belowGradeFinishedAreaSqft: toNum(physical?.below_grade_finished_area_sqft),
      lotSizeSqft: toNum(property.lot_size_sqft),
      yearBuilt: physical?.year_built ?? null,
      bedroomsTotal: physical?.bedrooms_total ?? null,
      bathroomsTotal: physical?.bathrooms_total ?? null,
      garageSpaces: physical?.garage_spaces ?? null,
      listingContractDate: listing?.listing_contract_date as string | null ?? null,
      address: property.unparsed_address,
      listPrice,
    },
    scopeMultipliers: profile.rehab.scopeMultipliers,
    cashRequired,
  };
}

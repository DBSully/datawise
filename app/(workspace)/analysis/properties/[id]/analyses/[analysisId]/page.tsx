import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { createClient } from "@/lib/supabase/server";
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
import { AnalysisWorkstation } from "./analysis-workstation";

export const dynamic = "force-dynamic";

type AnalysisPageProps = {
  params: Promise<{ id: string; analysisId: string }>;
};

function defaultComparableProfileSlug(propertyType: string | null) {
  const normalized = (propertyType ?? "").trim().toLowerCase();
  if (normalized === "condo") return "denver_condo_standard_v1";
  if (normalized === "townhome") return "denver_townhome_standard_v1";
  return "denver_detached_standard_v1";
}

function toNum(v: unknown): number {
  if (v === null || v === undefined || v === "") return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export default async function AnalysisPage({ params }: AnalysisPageProps) {
  noStore();
  const { id: propertyId, analysisId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // ---- Load all data in parallel ----
  const [
    { data: property, error: propErr },
    { data: physical, error: physErr },
    { data: financials, error: finErr },
    { data: analysis, error: analysisErr },
    { data: manualAnalysis, error: manualErr },
    { data: pipeline, error: pipeErr },
    { data: notes, error: notesErr },
  ] = await Promise.all([
    supabase
      .from("real_properties")
      .select("id, unparsed_address, city, county, state, postal_code, parcel_id, latitude, longitude, lot_size_sqft, lot_size_acres")
      .eq("id", propertyId)
      .maybeSingle(),
    supabase
      .from("property_physical")
      .select("property_type, property_sub_type, structure_type, level_class_standardized, levels_raw, building_form_standardized, building_area_total_sqft, above_grade_finished_area_sqft, below_grade_total_sqft, below_grade_finished_area_sqft, below_grade_unfinished_area_sqft, year_built, bedrooms_total, bathrooms_total, garage_spaces")
      .eq("real_property_id", propertyId)
      .maybeSingle(),
    supabase
      .from("property_financials")
      .select("annual_property_tax, annual_hoa_dues")
      .eq("real_property_id", propertyId)
      .maybeSingle(),
    supabase
      .from("analyses")
      .select("id, real_property_id, listing_id, scenario_name, strategy_type, status, created_at")
      .eq("id", analysisId)
      .eq("real_property_id", propertyId)
      .eq("created_by_user_id", user?.id ?? "")
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
      .select("id, note_type, note_body, is_public, created_at, updated_at")
      .eq("analysis_id", analysisId)
      .order("created_at", { ascending: true }),
  ]);

  if (propErr) throw new Error(propErr.message);
  if (physErr) throw new Error(physErr.message);
  if (analysisErr) throw new Error(analysisErr.message);
  if (!property || !analysis) notFound();

  // Load listing
  const listingSelect = "id, listing_id, mls_status, list_price, close_price, listing_contract_date, property_condition_source, source_system, original_list_price";
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
    .select("arv_aggregate, arv_per_sqft, arv_comp_count, rehab_total, hold_total, hold_days, transaction_total, max_offer, est_gap_per_sqft, spread, offer_pct, rehab_composite_multiplier, target_profit")
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

  // Load comp candidates
  let compCandidates: Array<Record<string, unknown>> = [];
  if (latestRun?.id) {
    const { data: rawCandidates } = await supabase
      .from("comparable_search_candidates")
      .select("id, comp_listing_row_id, comp_real_property_id, distance_miles, days_since_close, sqft_delta_pct, raw_score, selected_yn, metrics_json, score_breakdown_json")
      .eq("comparable_search_run_id", latestRun.id)
      .order("raw_score", { ascending: false });

    if (rawCandidates) {
      // Resolve listing IDs
      const compListingIds = Array.from(
        new Set(rawCandidates.map((c: any) => c.comp_listing_row_id).filter(Boolean)),
      );
      let listingIdMap = new Map<string, string>();
      if (compListingIds.length > 0) {
        const { data: compListings } = await supabase
          .from("mls_listings")
          .select("id, listing_id")
          .in("id", compListingIds.slice(0, 200));
        listingIdMap = new Map((compListings ?? []).map((r: any) => [r.id, r.listing_id]));
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
        const metrics = (c.metrics_json ?? {}) as Record<string, unknown>;
        return {
          ...c,
          listing_id: c.comp_listing_row_id ? listingIdMap.get(c.comp_listing_row_id) ?? null : null,
          metrics_json: {
            ...metrics,
            latitude: metrics.latitude ?? coords?.latitude ?? null,
            longitude: metrics.longitude ?? coords?.longitude ?? null,
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
  const listPrice = toNum(listing?.list_price);

  // Auto ARV (from screening, frozen)
  const autoArv = screeningResult?.arv_aggregate ? toNum(screeningResult.arv_aggregate) : null;
  const autoRehab = screeningResult?.rehab_total ? toNum(screeningResult.rehab_total) : null;

  // Selected ARV (from currently selected comps)
  const selectedComps = compCandidates.filter((c: any) => c.selected_yn);
  let selectedArv: number | null = null;

  if (selectedComps.length > 0 && buildingSqft > 0) {
    const compInputs = selectedComps.map((c: any) => {
      const m = (c.metrics_json ?? {}) as Record<string, unknown>;
      return {
        compListingRowId: String(c.comp_listing_row_id ?? ""),
        compRealPropertyId: String(c.comp_real_property_id ?? ""),
        listingId: String(m.listing_id ?? c.listing_id ?? ""),
        address: String(m.address ?? ""),
        closePrice: toNum(m.close_price),
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
      };
    });

    const arvResult = calculateArv({
      subjectBuildingSqft: buildingSqft,
      subjectAboveGradeSqft: aboveGradeSqft,
      comps: compInputs,
      config: profile.arv,
      propertyType,
    });

    selectedArv = arvResult?.arvAggregate ?? null;
  }

  // Final ARV (manual override)
  const finalArv = manualAnalysis?.arv_manual ? toNum(manualAnalysis.arv_manual) : null;

  // Effective ARV = Final ?? Selected ?? Auto
  const effectiveArv = finalArv ?? selectedArv ?? autoArv ?? 0;

  // Rehab
  const manualRehab = manualAnalysis?.rehab_manual ? toNum(manualAnalysis.rehab_manual) : null;
  let computedRehab: number | null = null;
  if (buildingSqft > 0) {
    const rehabResult = calculateRehab({
      propertyType,
      aboveGradeSqft,
      belowGradeFinishedSqft: toNum(physical?.below_grade_finished_area_sqft),
      belowGradeUnfinishedSqft: Math.max(0, toNum(physical?.below_grade_total_sqft) - toNum(physical?.below_grade_finished_area_sqft)),
      buildingSqft,
      listPrice,
      yearBuilt: physical?.year_built ?? null,
      condition: listing?.property_condition_source ? String(listing.property_condition_source) : null,
      config: profile.rehab,
    });
    computedRehab = rehabResult.total;
  }
  const effectiveRehab = manualRehab ?? computedRehab ?? autoRehab ?? 0;

  // Holding
  const holdResult = buildingSqft > 0 ? calculateHolding({
    buildingSqft,
    listPrice,
    annualTax: financials?.annual_property_tax ? toNum(financials.annual_property_tax) : null,
    annualHoa: financials?.annual_hoa_dues ? toNum(financials.annual_hoa_dues) : null,
    config: profile.holding,
  }) : null;

  // Transaction
  const transResult = effectiveArv > 0 ? calculateTransaction({
    acquisitionPrice: listPrice,
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
    listPrice,
    buildingSqft,
    rehabTotal: effectiveRehab,
    holdTotal: holdResult?.total ?? 0,
    transactionTotal: transResult?.total ?? 0,
    financingTotal: finResult?.total ?? 0,
    targetProfit: effectiveTargetProfit,
  }) : null;

  // Comp summary stats
  const totalComps = compCandidates.length;
  const selectedCount = selectedComps.length;
  const avgSelectedPrice = selectedCount > 0
    ? Math.round(selectedComps.reduce((sum: number, c: any) => sum + toNum((c.metrics_json as any)?.close_price), 0) / selectedCount)
    : null;
  const avgSelectedPsf = selectedCount > 0
    ? Math.round(selectedComps.reduce((sum: number, c: any) => sum + toNum((c.metrics_json as any)?.ppsf), 0) / selectedCount)
    : null;
  const avgSelectedDist = selectedCount > 0
    ? Math.round(selectedComps.reduce((sum: number, c: any) => sum + toNum(c.distance_miles), 0) / selectedCount * 100) / 100
    : null;

  // Build the data payload for the client component
  const workstationData = {
    propertyId,
    analysisId,
    analysis: {
      scenarioName: analysis.scenario_name,
      strategyType: analysis.strategy_type,
      status: analysis.status,
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
      belowGradeTotalSqft: toNum(physical.below_grade_total_sqft),
      belowGradeFinishedSqft: toNum(physical.below_grade_finished_area_sqft),
      yearBuilt: physical.year_built,
      bedroomsTotal: physical.bedrooms_total,
      bathroomsTotal: physical.bathrooms_total,
      garageSpaces: physical.garage_spaces,
      lotSizeSqft: toNum(property.lot_size_sqft),
    } : null,
    listing: listing ? {
      listingId: listing.listing_id as string,
      mlsStatus: listing.mls_status as string | null,
      listPrice,
      originalListPrice: toNum(listing.original_list_price),
      listingContractDate: listing.listing_contract_date as string | null,
    } : null,
    financials: financials ? {
      annualTax: toNum(financials.annual_property_tax),
      annualHoa: toNum(financials.annual_hoa_dues),
    } : null,
    arv: {
      auto: autoArv,
      selected: selectedArv,
      final: finalArv,
      effective: effectiveArv,
    },
    rehab: {
      auto: autoRehab,
      computed: computedRehab,
      manual: manualRehab,
      effective: effectiveRehab,
    },
    holding: holdResult ? {
      total: holdResult.total,
      daysHeld: holdResult.daysHeld,
    } : null,
    transaction: transResult ? { total: transResult.total } : null,
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
      is_public: boolean;
      created_at: string;
    }>,
    // Comp data for modal
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
    },
    // Subject context for comp panel
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
  };

  return <AnalysisWorkstation data={workstationData} />;
}

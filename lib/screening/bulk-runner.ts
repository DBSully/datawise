// ---------------------------------------------------------------------------
// Bulk Screening Runner
//
// Orchestrates the full fix-and-flip screening pipeline for a batch of
// subject properties. Pre-loads the comp pool once into memory, then
// processes each subject without additional DB queries.
//
// Comp scoring uses the shared scoring functions from lib/comparables/scoring.ts
// so that screening and analysis produce identical scoring output.
// Comps are persisted to comparable_search_runs + comparable_search_candidates
// for seamless transition from screening into analysis.
// ---------------------------------------------------------------------------

import "server-only";

import type { FlipStrategyProfile } from "./strategy-profiles";
import { resolvePropertyTypeKey } from "./strategy-profiles";
import { calculateArv } from "./arv-engine";
import { calculateRehab } from "./rehab-engine";
import { calculateHolding } from "./holding-engine";
import { calculateTransaction } from "./transaction-engine";
import { calculateFinancing } from "./financing-engine";
import { calculateDealMath } from "./deal-math";
import { evaluateQualification } from "./qualification-engine";
import { calculateTrend } from "./trend-engine";
import type {
  PropertyTypeKey,
  CompArvInput,
  ScreeningResultRow,
  TrendSaleInput,
  TrendResult,
} from "./types";
import {
  haversineMiles,
  pctDelta,
  componentScoreFromDelta,
  computeFormMatchScore,
  computeLevelMatchScore,
  computeConditionMatchScore,
  resolvePropertyTypeFamily,
  resolveComparableMode,
  buildWeightedScore,
  clamp01,
  roundNumber,
  type ComparableSearchRules,
} from "@/lib/comparables/scoring";

// ---------------------------------------------------------------------------
// Screening-specific search rules (per property type)
// ---------------------------------------------------------------------------

const SCREENING_RULES_BASE: Omit<ComparableSearchRules, "maxDistanceMiles"> = {
  maxDaysSinceClose: 365,
  sqftTolerancePct: 30,
  lotSizeTolerancePct: 30,
  yearToleranceYears: 25,
  bedTolerance: 2,
  bathTolerance: 2,
  maxCandidates: 25,
  requireSamePropertyType: true,
  requireSameLevelClass: true,
  requireSameBuildingForm: true,
  preferredSizeBasis: "building_area_total",
};

const SCREENING_RULES_BY_TYPE: Record<PropertyTypeKey, ComparableSearchRules> = {
  detached: { ...SCREENING_RULES_BASE, maxDistanceMiles: 0.75 },
  townhome: { ...SCREENING_RULES_BASE, maxDistanceMiles: 0.6 },
  condo:    { ...SCREENING_RULES_BASE, maxDistanceMiles: 0.1 },
};

function screeningRulesForType(propertyType: PropertyTypeKey): ComparableSearchRules {
  return SCREENING_RULES_BY_TYPE[propertyType];
}

// ---------------------------------------------------------------------------
// In-memory pool types (loaded once per batch)
// ---------------------------------------------------------------------------

type PoolProperty = {
  id: string;
  unparsed_address: string;
  city: string;
  state: string;
  postal_code: string | null;
  latitude: number;
  longitude: number;
  lot_size_sqft: number | null;
};

type PoolPhysical = {
  real_property_id: string;
  property_type: string | null;
  property_sub_type: string | null;
  structure_type: string | null;
  level_class_standardized: string | null;
  levels_raw: string | null;
  building_form_standardized: string | null;
  building_area_total_sqft: number | null;
  above_grade_finished_area_sqft: number | null;
  below_grade_total_sqft: number | null;
  below_grade_finished_area_sqft: number | null;
  below_grade_unfinished_area_sqft: number | null;
  year_built: number | null;
  bedrooms_total: number | null;
  bathrooms_total: number | null;
  garage_spaces: number | null;
};

type PoolListing = {
  id: string;
  listing_id: string;
  real_property_id: string;
  mls_status: string | null;
  list_price: number | null;
  close_price: number | null;
  concessions_amount: number | null;
  close_date: string | null;
  listing_contract_date: string | null;
  purchase_contract_date: string | null;
  property_condition_source: string | null;
  subdivision_name: string | null;
};

type PoolFinancials = {
  real_property_id: string;
  annual_property_tax: number | null;
  annual_hoa_dues: number | null;
};

type CompPool = {
  properties: Map<string, PoolProperty>;
  physicals: Map<string, PoolPhysical>;
  closedListingsByProperty: Map<string, PoolListing[]>;
};

type SubjectData = {
  property: PoolProperty;
  physical: PoolPhysical;
  listing: PoolListing | null;
  financials: PoolFinancials | null;
};

/** Scored candidate ready for DB persistence and ARV calculation. */
type ScoredCandidate = {
  compArvInput: CompArvInput;
  candidateRow: Record<string, unknown>;
};

// ---------------------------------------------------------------------------
// Reference date resolution
// ---------------------------------------------------------------------------

/**
 * For closed/pending subjects, the reference date should be the contract date
 * so that only comps available at deal time are considered. For active listings
 * or manual entries (no listing), use today.
 */
function resolveSubjectReferenceDate(
  listing: PoolListing | null,
  today: Date,
): Date {
  if (!listing) return today;

  const status = (listing.mls_status ?? "").toLowerCase();
  const isClosed = status === "closed";
  const isPending = status === "pending";

  if (isClosed || isPending) {
    // Prefer purchase_contract_date (when the deal was struck),
    // then listing_contract_date, then close_date
    const dateStr =
      listing.purchase_contract_date ??
      listing.listing_contract_date ??
      listing.close_date;

    if (dateStr) {
      const parsed = new Date(dateStr);
      if (!isNaN(parsed.getTime())) return parsed;
    }
  }

  return today;
}

// ---------------------------------------------------------------------------
// Supabase helpers
// ---------------------------------------------------------------------------

async function fetchAllRows<T>(
  supabase: any,
  table: string,
  selectCols: string,
  filters?: (query: any) => any,
  pageSize = 1000,
): Promise<T[]> {
  const all: T[] = [];
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    let query = supabase
      .from(table)
      .select(selectCols)
      .range(offset, offset + pageSize - 1);

    if (filters) query = filters(query);

    const { data, error } = await query;
    if (error) throw new Error(`Failed to fetch ${table}: ${error.message}`);

    const rows = (data ?? []) as T[];
    all.push(...rows);
    hasMore = rows.length === pageSize;
    offset += pageSize;
  }

  return all;
}

// ---------------------------------------------------------------------------
// Numeric helpers
// ---------------------------------------------------------------------------

function toNum(v: unknown): number {
  if (v === null || v === undefined || v === "") return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function pickBuildingSqft(p: PoolPhysical): number {
  return toNum(p.building_area_total_sqft) || toNum(p.above_grade_finished_area_sqft) || 0;
}

function pickAboveGradeSqft(p: PoolPhysical): number {
  return toNum(p.above_grade_finished_area_sqft) || toNum(p.building_area_total_sqft) || 0;
}

function belowGradeFinished(p: PoolPhysical): number {
  return toNum(p.below_grade_finished_area_sqft);
}

function belowGradeUnfinished(p: PoolPhysical): number {
  if (toNum(p.below_grade_unfinished_area_sqft) > 0) {
    return toNum(p.below_grade_unfinished_area_sqft);
  }
  return Math.max(0, toNum(p.below_grade_total_sqft) - toNum(p.below_grade_finished_area_sqft));
}

// ---------------------------------------------------------------------------
// Build trend sales pool from comp pool data
// ---------------------------------------------------------------------------

function buildTrendSalesPool(pool: CompPool): TrendSaleInput[] {
  const sales: TrendSaleInput[] = [];

  for (const [propertyId, listings] of pool.closedListingsByProperty) {
    const prop = pool.properties.get(propertyId);
    const phys = pool.physicals.get(propertyId);
    if (!prop || !phys) continue;

    for (const listing of listings) {
      if (!listing.close_date || !listing.close_price) continue;
      const closePrice = toNum(listing.close_price) - toNum(listing.concessions_amount);
      if (closePrice <= 0) continue;

      sales.push({
        realPropertyId: propertyId,
        latitude: prop.latitude,
        longitude: prop.longitude,
        closePrice,
        closeDateIso: listing.close_date,
        buildingSqft: pickBuildingSqft(phys),
        aboveGradeSqft: pickAboveGradeSqft(phys),
        yearBuilt: phys.year_built,
        propertyType: phys.property_type,
      });
    }
  }

  return sales;
}

// ---------------------------------------------------------------------------
// Pre-load comp pool
// ---------------------------------------------------------------------------

async function loadCompPool(
  supabase: any,
  maxDaysSinceClose: number,
): Promise<CompPool> {
  const cutoffDate = new Date(
    Date.now() - maxDaysSinceClose * 86_400_000,
  ).toISOString();

  const [properties, physicals, closedListings] = await Promise.all([
    fetchAllRows<PoolProperty>(
      supabase,
      "real_properties",
      "id, unparsed_address, city, state, postal_code, latitude, longitude, lot_size_sqft",
      (q: any) => q.not("latitude", "is", null).not("longitude", "is", null),
    ),
    fetchAllRows<PoolPhysical>(
      supabase,
      "property_physical",
      "real_property_id, property_type, property_sub_type, structure_type, level_class_standardized, levels_raw, building_form_standardized, building_area_total_sqft, above_grade_finished_area_sqft, below_grade_total_sqft, below_grade_finished_area_sqft, below_grade_unfinished_area_sqft, year_built, bedrooms_total, bathrooms_total, garage_spaces",
    ),
    fetchAllRows<PoolListing>(
      supabase,
      "mls_listings",
      "id, listing_id, real_property_id, mls_status, list_price, close_price, concessions_amount, close_date, listing_contract_date, purchase_contract_date, property_condition_source, subdivision_name",
      (q: any) =>
        q
          .not("close_date", "is", null)
          .not("close_price", "is", null)
          .gt("close_price", 0)
          .gte("close_date", cutoffDate),
    ),
  ]);

  const propertyMap = new Map(properties.map((p) => [p.id, p]));
  const physicalMap = new Map(physicals.map((p) => [p.real_property_id, p]));

  const closedByProperty = new Map<string, PoolListing[]>();
  for (const listing of closedListings) {
    const existing = closedByProperty.get(listing.real_property_id);
    if (existing) existing.push(listing);
    else closedByProperty.set(listing.real_property_id, [listing]);
  }

  return { properties: propertyMap, physicals: physicalMap, closedListingsByProperty: closedByProperty };
}

// ---------------------------------------------------------------------------
// Load subject data
// ---------------------------------------------------------------------------

async function loadSubjects(
  supabase: any,
  propertyIds: string[],
  pool: CompPool,
): Promise<Map<string, SubjectData>> {
  const ID_CHUNK_SIZE = 200;
  const idChunks: string[][] = [];
  for (let i = 0; i < propertyIds.length; i += ID_CHUNK_SIZE) {
    idChunks.push(propertyIds.slice(i, i + ID_CHUNK_SIZE));
  }

  const financials: PoolFinancials[] = [];
  for (const chunk of idChunks) {
    const rows = await fetchAllRows<PoolFinancials>(
      supabase,
      "property_financials",
      "real_property_id, annual_property_tax, annual_hoa_dues",
      (q: any) => q.in("real_property_id", chunk),
    );
    financials.push(...rows);
  }
  const financialsMap = new Map(financials.map((f) => [f.real_property_id, f]));

  // Fetch all listings for subject properties (any status) so closed sales
  // still have their list price available for screening analysis.
  const allSubjectListings: PoolListing[] = [];
  for (const chunk of idChunks) {
    const rows = await fetchAllRows<PoolListing>(
      supabase,
      "mls_listings",
      "id, listing_id, real_property_id, mls_status, list_price, close_price, concessions_amount, close_date, listing_contract_date, purchase_contract_date, property_condition_source, subdivision_name",
      (q: any) =>
        q
          .in("real_property_id", chunk)
          .order("listing_contract_date", { ascending: false, nullsFirst: true }),
    );
    allSubjectListings.push(...rows);
  }

  // Pick the best listing per property: prefer active/pending over closed
  const STATUS_PRIORITY: Record<string, number> = {
    "Active": 0, "Coming Soon": 1, "Pending": 2, "Closed": 3,
  };
  const latestListingByProperty = new Map<string, PoolListing>();
  for (const listing of allSubjectListings) {
    const existing = latestListingByProperty.get(listing.real_property_id);
    if (!existing) {
      latestListingByProperty.set(listing.real_property_id, listing);
    } else {
      const existingPri = STATUS_PRIORITY[existing.mls_status ?? ""] ?? 99;
      const newPri = STATUS_PRIORITY[listing.mls_status ?? ""] ?? 99;
      if (newPri < existingPri) {
        latestListingByProperty.set(listing.real_property_id, listing);
      }
    }
  }

  const subjects = new Map<string, SubjectData>();
  for (const id of propertyIds) {
    const property = pool.properties.get(id);
    const physical = pool.physicals.get(id);
    if (!property || !physical) continue;
    subjects.set(id, {
      property,
      physical,
      listing: latestListingByProperty.get(id) ?? null,
      financials: financialsMap.get(id) ?? null,
    });
  }
  return subjects;
}

// ---------------------------------------------------------------------------
// Score comps for a subject (in-memory, using shared scoring)
// ---------------------------------------------------------------------------

function scoreCompsForSubject(
  subject: SubjectData,
  pool: CompPool,
  rules: ComparableSearchRules,
  referenceDate: Date,
): ScoredCandidate[] {
  const subjectLat = subject.property.latitude;
  const subjectLon = subject.property.longitude;
  const subjectFamily = resolvePropertyTypeFamily(subject.physical.property_type);
  const subjectSqft = pickBuildingSqft(subject.physical);
  const subjectAbove = pickAboveGradeSqft(subject.physical);
  const subjectCondition = subject.listing?.property_condition_source ?? null;

  const mode = resolveComparableMode({ purpose: "flip", subjectFamily, rules });

  // Bounding box pre-filter
  const latDelta = rules.maxDistanceMiles / 69;
  const lonDivisor = Math.max(0.2, Math.cos((subjectLat * Math.PI) / 180)) * 69.172;
  const lonDelta = rules.maxDistanceMiles / lonDivisor;

  const scored: ScoredCandidate[] = [];

  for (const [compPropertyId, compListings] of pool.closedListingsByProperty) {
    if (compPropertyId === subject.property.id) continue;

    const compProperty = pool.properties.get(compPropertyId);
    const compPhysical = pool.physicals.get(compPropertyId);
    if (!compProperty || !compPhysical) continue;

    // Bounding box
    if (
      Math.abs(compProperty.latitude - subjectLat) > latDelta ||
      Math.abs(compProperty.longitude - subjectLon) > lonDelta
    ) continue;

    // Property type match
    if (mode.requireSamePropertyType) {
      const compFamily = resolvePropertyTypeFamily(compPhysical.property_type);
      if (compFamily !== subjectFamily) continue;
    }

    // Building form match
    const formScore = computeFormMatchScore(
      subject.physical.building_form_standardized,
      compPhysical.building_form_standardized,
    );
    if (mode.requireSameBuildingForm && formScore !== null && formScore < 1) continue;

    // Level class match
    const levelScore = computeLevelMatchScore({
      subjectLevelClass: subject.physical.level_class_standardized,
      candidateLevelClass: compPhysical.level_class_standardized,
      subjectLevelsRaw: subject.physical.levels_raw ?? null,
      candidateLevelsRaw: compPhysical.levels_raw ?? null,
      allowedLevelClassesNormalized: [],
    });
    if (mode.requireSameLevelClass && levelScore !== null && levelScore < 0.85) continue;

    const distanceMiles = haversineMiles(
      subjectLat, subjectLon, compProperty.latitude, compProperty.longitude,
    );
    if (distanceMiles > rules.maxDistanceMiles) continue;

    // Use first (most recent) closed listing per property
    for (const listing of compListings) {
      if (!listing.close_date || !listing.close_price) continue;

      const closeDateMs = new Date(listing.close_date).getTime();
      const daysSinceClose = Math.floor((referenceDate.getTime() - closeDateMs) / 86_400_000);
      if (daysSinceClose < 0 || daysSinceClose > rules.maxDaysSinceClose) continue;

      const compSqft = pickBuildingSqft(compPhysical);
      const compAbove = pickAboveGradeSqft(compPhysical);

      // Tolerance filters
      const sqftDeltaPct = subjectSqft > 0 && compSqft > 0 ? pctDelta(subjectSqft, compSqft) : null;
      if (mode.useSqftMetric && sqftDeltaPct !== null && sqftDeltaPct > rules.sqftTolerancePct) continue;

      const yearDelta = subject.physical.year_built !== null && compPhysical.year_built !== null
        ? Math.abs(subject.physical.year_built - compPhysical.year_built)
        : null;
      if (mode.useYearMetric && yearDelta !== null && yearDelta > rules.yearToleranceYears) continue;

      const bedDelta = subject.physical.bedrooms_total !== null && compPhysical.bedrooms_total !== null
        ? Math.abs(subject.physical.bedrooms_total - compPhysical.bedrooms_total)
        : null;
      if (mode.useBedMetric && bedDelta !== null && bedDelta > rules.bedTolerance) continue;

      const bathDelta = subject.physical.bathrooms_total !== null && compPhysical.bathrooms_total !== null
        ? Math.abs(toNum(subject.physical.bathrooms_total) - toNum(compPhysical.bathrooms_total))
        : null;
      if (mode.useBathMetric && bathDelta !== null && bathDelta > rules.bathTolerance) continue;

      // Condition match
      const conditionScore = computeConditionMatchScore(subjectCondition, listing.property_condition_source);

      // Net price (close price minus concessions) and PSF
      const netPrice = toNum(listing.close_price) - toNum(listing.concessions_amount);
      const ppsf = compSqft > 0 ? roundNumber(netPrice / compSqft, 2) : null;

      // Build weighted score (same logic as analysis engine)
      const distanceComponent = clamp01(1 - distanceMiles / rules.maxDistanceMiles);
      const recencyComponent = clamp01(1 - daysSinceClose / rules.maxDaysSinceClose);

      const scoreResult = buildWeightedScore({
        weights: mode.weights,
        components: {
          distance: { used: true, score: distanceComponent },
          recency: { used: true, score: recencyComponent },
          size: { used: mode.useSqftMetric, score: componentScoreFromDelta(sqftDeltaPct, rules.sqftTolerancePct) },
          lotSize: { used: false, score: null },
          year: { used: mode.useYearMetric, score: componentScoreFromDelta(yearDelta, rules.yearToleranceYears) },
          beds: { used: mode.useBedMetric, score: componentScoreFromDelta(bedDelta, Math.max(rules.bedTolerance, 1)) },
          baths: { used: mode.useBathMetric, score: componentScoreFromDelta(bathDelta, Math.max(rules.bathTolerance, 0.5)) },
          form: { used: mode.useBuildingFormMetric, score: formScore },
          level: { used: mode.useLevelMetric, score: levelScore },
          condition: { used: mode.useConditionMetric, score: conditionScore },
        },
      });

      const distRounded = roundNumber(distanceMiles, 3);

      // Build candidate row for DB persistence (same structure as analysis engine)
      const candidateRow = {
        comp_listing_row_id: listing.id,
        comp_real_property_id: compPropertyId,
        distance_miles: distRounded,
        days_since_close: daysSinceClose,
        sqft_delta_pct: sqftDeltaPct !== null ? roundNumber(sqftDeltaPct, 3) : null,
        lot_size_delta_pct: null,
        year_built_delta: yearDelta,
        bed_delta: bedDelta,
        bath_delta: bathDelta !== null ? roundNumber(bathDelta, 2) : null,
        form_match_score: formScore !== null ? roundNumber(formScore * 100, 2) : null,
        raw_score: scoreResult.rawScore,
        selected_yn: false,
        score_breakdown_json: {
          purposeMode: "flip",
          sizeBasis: "building_area_total",
          totalWeight: scoreResult.totalWeight,
          components: scoreResult.breakdown,
        },
        metrics_json: {
          listing_id: listing.listing_id,
          address: compProperty.unparsed_address,
          city: compProperty.city,
          state: compProperty.state,
          postal_code: compProperty.postal_code,
          latitude: compProperty.latitude,
          longitude: compProperty.longitude,
          close_date: listing.close_date,
          close_price: listing.close_price,
          concessions_amount: listing.concessions_amount,
          net_price: netPrice,
          ppsf,
          building_area_total_sqft: compPhysical.building_area_total_sqft,
          above_grade_finished_area_sqft: compPhysical.above_grade_finished_area_sqft,
          below_grade_total_sqft: compPhysical.below_grade_total_sqft,
          below_grade_finished_area_sqft: compPhysical.below_grade_finished_area_sqft,
          lot_size_sqft: compProperty.lot_size_sqft,
          size_basis: "building_area_total",
          size_basis_value: compSqft,
          bedrooms_total: compPhysical.bedrooms_total,
          bathrooms_total: compPhysical.bathrooms_total,
          garage_spaces: compPhysical.garage_spaces,
          year_built: compPhysical.year_built,
          property_type: compPhysical.property_type,
          property_sub_type: compPhysical.property_sub_type,
          structure_type: compPhysical.structure_type,
          building_form_standardized: compPhysical.building_form_standardized,
          levels_raw: compPhysical.levels_raw,
          level_class_standardized: compPhysical.level_class_standardized,
          property_condition_source: listing.property_condition_source,
          subdivision_name: listing.subdivision_name,
          distance_miles: distRounded,
          days_since_close: daysSinceClose,
          sqft_delta_pct: sqftDeltaPct !== null ? roundNumber(sqftDeltaPct, 3) : null,
          year_built_delta: yearDelta,
          bed_delta: bedDelta,
          bath_delta: bathDelta !== null ? roundNumber(bathDelta, 2) : null,
          form_match_score: formScore !== null ? roundNumber(formScore * 100, 2) : null,
          level_match_score: levelScore !== null ? roundNumber(levelScore * 100, 2) : null,
          condition_match_score: conditionScore !== null ? roundNumber(conditionScore * 100, 2) : null,
        },
      };

      // Build ARV input
      const compArvInput: CompArvInput = {
        compListingRowId: listing.id,
        compRealPropertyId: compPropertyId,
        listingId: listing.listing_id,
        address: compProperty.unparsed_address,
        closePrice: netPrice,
        closeDateIso: listing.close_date,
        compBuildingSqft: compSqft,
        compAboveGradeSqft: compAbove,
        distanceMiles: distRounded,
        yearBuilt: compPhysical.year_built,
        bedroomsTotal: compPhysical.bedrooms_total,
        bathroomsTotal: compPhysical.bathrooms_total,
        propertyType: compPhysical.property_type,
        levelClass: compPhysical.level_class_standardized,
        mlsStatus: listing.mls_status,
      };

      scored.push({ compArvInput, candidateRow });
      break; // Use first (most recent) closed listing per property
    }
  }

  // Sort by raw_score descending
  scored.sort((a, b) => {
    const sa = a.candidateRow.raw_score as number;
    const sb = b.candidateRow.raw_score as number;
    if (sb !== sa) return sb - sa;
    return (a.compArvInput.distanceMiles - b.compArvInput.distanceMiles);
  });

  return scored.slice(0, rules.maxCandidates);
}

// ---------------------------------------------------------------------------
// Screen one subject
// ---------------------------------------------------------------------------

type ScreeningSubjectResult = {
  result: ScreeningResultRow;
  candidateRows: Record<string, unknown>[];
};

function screenSubject(
  subject: SubjectData,
  pool: CompPool,
  profile: FlipStrategyProfile,
  referenceDate: Date,
  trendSalesPool: TrendSaleInput[],
): ScreeningSubjectResult {
  const propertyType = resolvePropertyTypeKey(subject.physical.property_type);
  const buildingSqft = pickBuildingSqft(subject.physical);
  const aboveGradeSqft = pickAboveGradeSqft(subject.physical);
  const listPrice = toNum(subject.listing?.list_price);

  const base: Omit<
    ScreeningResultRow,
    "trend" | "arv" | "rehab" | "holding" | "transaction" | "financing" | "dealMath" | "qualification" | "screeningStatus" | "errorMessage"
  > = {
    realPropertyId: subject.property.id,
    listingRowId: subject.listing?.id ?? null,
    subjectAddress: subject.property.unparsed_address,
    subjectCity: subject.property.city,
    subjectPropertyType: subject.physical.property_type,
    subjectListPrice: listPrice || null,
    subjectBuildingSqft: buildingSqft,
    subjectAboveGradeSqft: aboveGradeSqft,
    subjectYearBuilt: subject.physical.year_built,
  };

  const skipResult = (msg: string): ScreeningSubjectResult => ({
    result: {
      ...base,
      trend: null, arv: null, rehab: null, holding: null, transaction: null, financing: null, dealMath: null,
      qualification: { isPrimeCandidate: false, qualifyingCompCount: 0, reasons: [], disqualifiers: [msg] },
      screeningStatus: "skipped", errorMessage: msg,
    },
    candidateRows: [],
  });

  if (buildingSqft <= 0) return skipResult("Missing building square footage");

  // Score comps using property-type-specific search rules
  const rules = screeningRulesForType(propertyType);
  const scored = scoreCompsForSubject(subject, pool, rules, referenceDate);
  const comps = scored.map((s) => s.compArvInput);
  const candidateRows = scored.map((s) => s.candidateRow);

  // --- Two-pass ARV with data-driven trend rate ---

  // Pass 1: Rough ARV using the fixed fallback rate (for price tier filtering)
  const roughArvConfig = { ...profile.arv, timeAdjustmentAnnualRate: profile.trend.fallbackRate };
  const roughArv = calculateArv({
    subjectBuildingSqft: buildingSqft,
    subjectAboveGradeSqft: aboveGradeSqft,
    comps,
    config: roughArvConfig,
    propertyType,
    referenceDate,
  });

  // Use rough ARV (or list price) as the price anchor for trend calculation
  const priceAnchor = (roughArv && roughArv.arvAggregate > 0)
    ? roughArv.arvAggregate
    : listPrice;

  // Trend calculation
  const trend = calculateTrend({
    subjectLat: subject.property.latitude,
    subjectLon: subject.property.longitude,
    subjectAboveGradeSqft: aboveGradeSqft,
    subjectYearBuilt: subject.physical.year_built,
    subjectEstimatedValue: priceAnchor,
    subjectPropertyType: propertyType,
    closedSales: trendSalesPool,
    config: profile.trend,
    referenceDate,
  });

  // Pass 2: Final ARV using the data-driven trend rate
  const finalArvConfig = { ...profile.arv, timeAdjustmentAnnualRate: trend.blendedAnnualRate };
  const arv = calculateArv({
    subjectBuildingSqft: buildingSqft,
    subjectAboveGradeSqft: aboveGradeSqft,
    comps,
    config: finalArvConfig,
    propertyType,
    referenceDate,
  });

  if (!arv || arv.arvAggregate <= 0) {
    return {
      result: {
        ...base, trend, arv: null, rehab: null, holding: null, transaction: null, financing: null, dealMath: null,
        qualification: { isPrimeCandidate: false, qualifyingCompCount: 0, reasons: [], disqualifiers: ["No usable comparable sales found"] },
        screeningStatus: "screened", errorMessage: null,
      },
      candidateRows,
    };
  }

  // For off-market properties (no list price), use ARV as the price anchor
  // for rehab tier selection, insurance calc, and acquisition cost estimates.
  const costAnchor = listPrice > 0 ? listPrice : arv.arvAggregate;

  const rehab = calculateRehab({
    propertyType, aboveGradeSqft,
    belowGradeFinishedSqft: belowGradeFinished(subject.physical),
    belowGradeUnfinishedSqft: belowGradeUnfinished(subject.physical),
    buildingSqft, priceAnchor: costAnchor,
    yearBuilt: subject.physical.year_built,
    condition: subject.listing?.property_condition_source ?? null,
    config: profile.rehab,
  });

  const holding = calculateHolding({
    buildingSqft, priceAnchor: costAnchor,
    annualTax: subject.financials?.annual_property_tax ?? null,
    annualHoa: subject.financials?.annual_hoa_dues ?? null,
    config: profile.holding,
  });

  const transaction = calculateTransaction({
    acquisitionPrice: costAnchor,
    arvPrice: arv.arvAggregate,
    config: profile.transaction,
  });

  const financing = profile.financing.enabled
    ? calculateFinancing({
        arv: arv.arvAggregate,
        daysHeld: holding.daysHeld,
        config: profile.financing,
      })
    : null;

  const dealMath = calculateDealMath({
    arv: arv.arvAggregate,
    listPrice: listPrice > 0 ? listPrice : null,
    buildingSqft,
    rehabTotal: rehab.total, holdTotal: holding.total,
    transactionTotal: transaction.total,
    financingTotal: financing?.total ?? 0,
    targetProfit: profile.targetProfitDefault,
  });

  const qualification = evaluateQualification({
    comps: arv.perCompDetails, config: profile.qualification,
    propertyType,
    listPrice: listPrice > 0 ? listPrice : null,
    buildingSqft, arv: arv.arvAggregate,
    maxOffer: dealMath.maxOffer,
  });

  return {
    result: {
      ...base, trend, arv, rehab, holding, transaction, financing, dealMath, qualification,
      screeningStatus: "screened", errorMessage: null,
    },
    candidateRows,
  };
}

// ---------------------------------------------------------------------------
// Write comp search runs + candidates to DB
// ---------------------------------------------------------------------------

async function writeCompRuns(
  supabase: any,
  runRows: Array<{
    subjectPropertyId: string;
    subjectListingId: string | null;
    candidateRows: Record<string, unknown>[];
    propertyTypeKey: PropertyTypeKey;
  }>,
  profileId: string | null,
): Promise<Map<string, string>> {
  // Returns: Map<subjectPropertyId, compSearchRunId>
  const runIdMap = new Map<string, string>();
  const chunkSize = 100;

  for (let i = 0; i < runRows.length; i += chunkSize) {
    const chunk = runRows.slice(i, i + chunkSize);

    const runInserts = chunk.map((r) => ({
      analysis_id: null,
      comparable_profile_id: profileId,
      subject_real_property_id: r.subjectPropertyId,
      subject_listing_row_id: r.subjectListingId,
      purpose: "flip",
      run_type: "screening",
      status: "complete",
      parameters_json: screeningRulesForType(r.propertyTypeKey),
      summary_json: { candidateCount: r.candidateRows.length, source: "screening_batch" },
    }));

    const { data: runs, error: runError } = await supabase
      .from("comparable_search_runs")
      .insert(runInserts)
      .select("id");

    if (runError) throw new Error(`Failed to write comp runs: ${runError.message}`);

    // Map run IDs back to subjects
    for (let j = 0; j < chunk.length; j++) {
      const runId = runs[j]?.id;
      if (runId) {
        runIdMap.set(chunk[j].subjectPropertyId, runId);

        // Write candidates for this run
        if (chunk[j].candidateRows.length > 0) {
          const candidates = chunk[j].candidateRows.map((c) => ({
            comparable_search_run_id: runId,
            ...c,
          }));

          const candChunkSize = 200;
          for (let k = 0; k < candidates.length; k += candChunkSize) {
            const candChunk = candidates.slice(k, k + candChunkSize);
            const { error: candError } = await supabase
              .from("comparable_search_candidates")
              .insert(candChunk);
            if (candError) {
              throw new Error(`Failed to write comp candidates: ${candError.message}`);
            }
          }
        }
      }
    }
  }

  return runIdMap;
}

// ---------------------------------------------------------------------------
// Write screening results to DB
// ---------------------------------------------------------------------------

async function writeScreeningResults(
  supabase: any,
  batchId: string,
  results: ScreeningResultRow[],
  compRunIds: Map<string, string>,
  profile: FlipStrategyProfile,
): Promise<void> {
  const chunkSize = 200;

  for (let i = 0; i < results.length; i += chunkSize) {
    const chunk = results.slice(i, i + chunkSize);

    const rows = chunk.map((r) => ({
      screening_batch_id: batchId,
      real_property_id: r.realPropertyId,
      listing_row_id: r.listingRowId,
      comp_search_run_id: compRunIds.get(r.realPropertyId) ?? null,

      subject_address: r.subjectAddress,
      subject_city: r.subjectCity,
      subject_property_type: r.subjectPropertyType,
      subject_list_price: r.subjectListPrice,
      subject_building_sqft: r.subjectBuildingSqft,
      subject_above_grade_sqft: r.subjectAboveGradeSqft,
      subject_year_built: r.subjectYearBuilt,

      arv_aggregate: r.arv?.arvAggregate ?? null,
      arv_per_sqft: r.arv?.arvPerSqft ?? null,
      arv_comp_count: r.arv?.compCount ?? null,
      arv_detail_json: r.arv?.perCompDetails ?? null,

      trend_annual_rate: r.trend?.blendedAnnualRate ?? null,
      trend_local_rate: r.trend?.rawLocalRate ?? null,
      trend_metro_rate: r.trend?.rawMetroRate ?? null,
      trend_local_comp_count: r.trend?.localStats.compCount ?? null,
      trend_metro_comp_count: r.trend?.metroStats.compCount ?? null,
      trend_local_radius: r.trend?.localStats.radiusMiles ?? null,
      trend_metro_radius: r.trend?.metroStats.radiusMiles ?? null,
      trend_is_fallback: r.trend?.isFallback ?? false,
      trend_confidence: r.trend?.confidenceLevel ?? null,
      trend_low_end_rate: r.trend?.lowEndTrendRate ?? null,
      trend_high_end_rate: r.trend?.highEndTrendRate ?? null,
      trend_summary: r.trend?.summary ?? null,
      trend_detail_json: r.trend ?? null,

      rehab_total: r.rehab?.total ?? null,
      rehab_above_grade: r.rehab?.aboveGrade ?? null,
      rehab_below_finished: r.rehab?.belowGradeFinished ?? null,
      rehab_below_unfinished: r.rehab?.belowGradeUnfinished ?? null,
      rehab_exterior: r.rehab?.exterior ?? null,
      rehab_landscaping: r.rehab?.landscaping ?? null,
      rehab_systems: r.rehab?.systems ?? null,
      rehab_composite_multiplier: r.rehab?.compositeMultiplier ?? null,
      rehab_detail_json: r.rehab
        ? { typeMultiplier: r.rehab.typeMultiplier, conditionMultiplier: r.rehab.conditionMultiplier, priceMultiplier: r.rehab.priceMultiplier, ageMultiplier: r.rehab.ageMultiplier }
        : null,

      hold_total: r.holding?.total ?? null,
      hold_days: r.holding?.daysHeld ?? null,
      transaction_total: r.transaction?.total ?? null,

      financing_total: r.financing?.total ?? null,
      financing_interest: r.financing?.interestCost ?? null,
      financing_origination: r.financing?.originationCost ?? null,
      financing_loan_amount: r.financing?.loanAmount ?? null,
      financing_detail_json: r.financing
        ? { ltvPct: r.financing.ltvPct, annualRate: r.financing.annualRate, pointsRate: r.financing.pointsRate, daysHeld: r.financing.daysHeld, monthlyPayment: r.financing.monthlyPayment, dailyInterest: r.financing.dailyInterest }
        : null,

      target_profit: profile.targetProfitDefault,
      max_offer: r.dealMath?.maxOffer ?? null,
      est_gap_per_sqft: r.dealMath?.estGapPerSqft ?? null,
      spread: r.dealMath?.spread ?? null,
      offer_pct: r.dealMath?.offerPct ?? null,

      is_prime_candidate: r.qualification.isPrimeCandidate,
      qualification_json: {
        qualifyingCompCount: r.qualification.qualifyingCompCount,
        reasons: r.qualification.reasons,
        disqualifiers: r.qualification.disqualifiers,
      },

      screening_status: r.screeningStatus,
      error_message: r.errorMessage,
    }));

    const { error } = await supabase.from("screening_results").insert(rows);
    if (error) throw new Error(`Failed to write screening results: ${error.message}`);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export type RunScreeningBatchInput = {
  supabase: any;
  batchId: string;
  subjectPropertyIds: string[];
  profile: FlipStrategyProfile;
};

export type RunScreeningBatchResult = {
  screened: number;
  skipped: number;
  errors: number;
  primeCandidates: number;
};

export async function runScreeningBatch(
  input: RunScreeningBatchInput,
): Promise<RunScreeningBatchResult> {
  const { supabase, batchId, subjectPropertyIds, profile } = input;

  await supabase
    .from("screening_batches")
    .update({ status: "running", started_at: new Date().toISOString(), total_subjects: subjectPropertyIds.length })
    .eq("id", batchId);

  try {
    const pool = await loadCompPool(supabase, 365);
    const subjects = await loadSubjects(supabase, subjectPropertyIds, pool);

    // Look up a comparable profile ID for the comp run records
    const compProfileSlug = profile.compProfileSlugByType.detached;
    const { data: compProfile } = await supabase
      .from("comparable_profiles")
      .select("id")
      .eq("slug", compProfileSlug)
      .maybeSingle();
    const compProfileId = compProfile?.id ?? null;

    const today = new Date();
    const trendSalesPool = buildTrendSalesPool(pool);

    const results: ScreeningResultRow[] = [];
    const compRunData: Array<{
      subjectPropertyId: string;
      subjectListingId: string | null;
      candidateRows: Record<string, unknown>[];
      propertyTypeKey: PropertyTypeKey;
    }> = [];

    for (const propertyId of subjectPropertyIds) {
      const subject = subjects.get(propertyId);
      if (!subject) continue;

      // For closed/pending subjects, use the contract date as the reference
      // point so comps that closed after the subject are excluded.
      // Priority: purchase_contract_date > listing_contract_date > close_date > today
      const referenceDate = resolveSubjectReferenceDate(subject.listing, today);

      try {
        const { result, candidateRows } = screenSubject(subject, pool, profile, referenceDate, trendSalesPool);
        results.push(result);
        if (candidateRows.length > 0) {
          const ptKey = resolvePropertyTypeKey(subject.physical.property_type);
          compRunData.push({
            subjectPropertyId: propertyId,
            subjectListingId: subject.listing?.id ?? null,
            candidateRows,
            propertyTypeKey: ptKey,
          });
        }
      } catch (err) {
        results.push({
          realPropertyId: propertyId,
          listingRowId: null,
          subjectAddress: subject.property.unparsed_address,
          subjectCity: subject.property.city,
          subjectPropertyType: subject.physical.property_type,
          subjectListPrice: toNum(subject.listing?.list_price) || null,
          subjectBuildingSqft: pickBuildingSqft(subject.physical),
          subjectAboveGradeSqft: pickAboveGradeSqft(subject.physical),
          subjectYearBuilt: subject.physical.year_built,
          trend: null, arv: null, rehab: null, holding: null, transaction: null, financing: null, dealMath: null,
          qualification: { isPrimeCandidate: false, qualifyingCompCount: 0, reasons: [], disqualifiers: ["Processing error"] },
          screeningStatus: "error",
          errorMessage: err instanceof Error ? err.message : "Unknown processing error",
        });
      }
    }

    // Write comp runs + candidates to relational tables
    const compRunIds = await writeCompRuns(supabase, compRunData, compProfileId);

    // Write screening results (with comp_search_run_id linkage)
    await writeScreeningResults(supabase, batchId, results, compRunIds, profile);

    const screened = results.filter((r) => r.screeningStatus === "screened").length;
    const skipped = results.filter((r) => r.screeningStatus === "skipped").length;
    const errors = results.filter((r) => r.screeningStatus === "error").length;
    const primeCandidates = results.filter((r) => r.qualification.isPrimeCandidate).length;

    await supabase
      .from("screening_batches")
      .update({
        status: "complete", screened_count: screened, qualified_count: screened,
        prime_candidate_count: primeCandidates, completed_at: new Date().toISOString(),
        summary_json: { screened, skipped, errors, primeCandidates, totalSubjects: subjectPropertyIds.length },
      })
      .eq("id", batchId);

    return { screened, skipped, errors, primeCandidates };
  } catch (err) {
    await supabase
      .from("screening_batches")
      .update({ status: "error", summary_json: { error: err instanceof Error ? err.message : "Unknown error" } })
      .eq("id", batchId);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Expand Comparable Search — run a wider search for a single subject and
// merge new candidates into the existing comparable_search_run.
// ---------------------------------------------------------------------------

export type ExpandSearchOverrides = {
  maxDistanceMiles?: number;
  maxDaysSinceClose?: number;
  sqftTolerancePct?: number;
  requireSameLevelClass?: boolean;
  requireSameBuildingForm?: boolean;
  /** If provided, only keep candidates with these level classes (post-filter). Empty = any. */
  targetLevelClasses?: string[];
  /** If provided, only keep candidates with these building forms (post-filter). Empty = any. */
  targetBuildingForms?: string[];
  maxCandidates?: number;
};

export async function expandComparableSearch(
  supabase: any,
  compSearchRunId: string,
  subjectPropertyId: string,
  overrides: ExpandSearchOverrides,
): Promise<{ added: number; total: number }> {
  // Load the existing run to get the subject listing and parameters
  const { data: run } = await supabase
    .from("comparable_search_runs")
    .select("subject_listing_row_id, parameters_json")
    .eq("id", compSearchRunId)
    .single();

  if (!run) throw new Error("Comparable search run not found");

  // Load existing candidate listing IDs to skip duplicates
  const { data: existingCandidates } = await supabase
    .from("comparable_search_candidates")
    .select("comp_listing_row_id")
    .eq("comparable_search_run_id", compSearchRunId);

  const existingListingIds = new Set(
    (existingCandidates ?? []).map((c: any) => c.comp_listing_row_id),
  );

  // Build expanded rules — start from the original run parameters, apply overrides
  const baseRules = (run.parameters_json ?? {}) as ComparableSearchRules;
  const expandedRules: ComparableSearchRules = {
    ...baseRules,
    maxDistanceMiles: overrides.maxDistanceMiles ?? baseRules.maxDistanceMiles ?? 1.5,
    maxDaysSinceClose: overrides.maxDaysSinceClose ?? baseRules.maxDaysSinceClose ?? 365,
    sqftTolerancePct: overrides.sqftTolerancePct ?? baseRules.sqftTolerancePct ?? 30,
    requireSameLevelClass: overrides.requireSameLevelClass ?? false,
    requireSameBuildingForm: overrides.requireSameBuildingForm ?? false,
    maxCandidates: overrides.maxCandidates ?? 50,
  };

  // Load comp pool with the expanded days range
  const pool = await loadCompPool(supabase, expandedRules.maxDaysSinceClose);

  // Build subject data
  const subjectProp = pool.properties.get(subjectPropertyId);
  const subjectPhys = pool.physicals.get(subjectPropertyId);
  if (!subjectProp || !subjectPhys) throw new Error("Subject property not found in pool");

  // Get subject listing
  let subjectListing: PoolListing | null = null;
  if (run.subject_listing_row_id) {
    const { data: listing } = await supabase
      .from("mls_listings")
      .select("id, listing_id, real_property_id, mls_status, list_price, close_price, concessions_amount, close_date, listing_contract_date, purchase_contract_date, property_condition_source, subdivision_name")
      .eq("id", run.subject_listing_row_id)
      .single();
    subjectListing = listing;
  }

  const subject: SubjectData = {
    property: subjectProp,
    physical: subjectPhys,
    listing: subjectListing,
    financials: null,
  };

  // Score comps with expanded rules
  const scored = scoreCompsForSubject(subject, pool, expandedRules, new Date());

  // Filter out existing candidates and apply target filters
  const targetLevels = (overrides.targetLevelClasses ?? []).map((v) => v.toLowerCase());
  const targetForms = (overrides.targetBuildingForms ?? []).map((v) => v.toLowerCase());

  const newCandidates = scored.filter((s) => {
    if (existingListingIds.has(s.candidateRow.comp_listing_row_id as string)) return false;
    const m = s.candidateRow.metrics_json as Record<string, unknown> | undefined;
    if (targetLevels.length > 0 && m) {
      const lvl = String(m.level_class_standardized ?? "").toLowerCase();
      if (!targetLevels.includes(lvl)) return false;
    }
    if (targetForms.length > 0 && m) {
      const form = String(m.building_form_standardized ?? "").toLowerCase();
      if (!targetForms.includes(form)) return false;
    }
    return true;
  });

  if (newCandidates.length === 0) {
    return { added: 0, total: existingListingIds.size };
  }

  // Insert new candidates
  const rows = newCandidates.map((s) => ({
    comparable_search_run_id: compSearchRunId,
    ...s.candidateRow,
  }));

  const CHUNK_SIZE = 200;
  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const { error } = await supabase
      .from("comparable_search_candidates")
      .insert(rows.slice(i, i + CHUNK_SIZE));
    if (error) throw new Error(error.message);
  }

  return { added: newCandidates.length, total: existingListingIds.size + newCandidates.length };
}

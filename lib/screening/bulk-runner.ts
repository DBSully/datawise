// ---------------------------------------------------------------------------
// Bulk Screening Runner
//
// Orchestrates the full fix-and-flip screening pipeline for a batch of
// subject properties. Pre-loads the comp pool once into memory, then
// processes each subject without additional DB queries.
// ---------------------------------------------------------------------------

import "server-only";

import type { FlipStrategyProfile } from "./strategy-profiles";
import { resolvePropertyTypeKey } from "./strategy-profiles";
import { calculateArv } from "./arv-engine";
import { calculateRehab } from "./rehab-engine";
import { calculateHolding } from "./holding-engine";
import { calculateTransaction } from "./transaction-engine";
import { calculateDealMath } from "./deal-math";
import { evaluateQualification } from "./qualification-engine";
import type {
  PropertyTypeKey,
  CompArvInput,
  ScreeningResultRow,
} from "./types";

// ---------------------------------------------------------------------------
// In-memory pool types (loaded once per batch)
// ---------------------------------------------------------------------------

type PoolProperty = {
  id: string;
  unparsed_address: string;
  city: string;
  latitude: number;
  longitude: number;
};

type PoolPhysical = {
  real_property_id: string;
  property_type: string | null;
  structure_type: string | null;
  level_class_standardized: string | null;
  building_form_standardized: string | null;
  building_area_total_sqft: number | null;
  above_grade_finished_area_sqft: number | null;
  below_grade_total_sqft: number | null;
  below_grade_finished_area_sqft: number | null;
  below_grade_unfinished_area_sqft: number | null;
  year_built: number | null;
  bedrooms_total: number | null;
  bathrooms_total: number | null;
};

type PoolListing = {
  id: string;
  listing_id: string;
  real_property_id: string;
  mls_status: string | null;
  list_price: number | null;
  close_price: number | null;
  close_date: string | null;
  property_condition_source: string | null;
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

// ---------------------------------------------------------------------------
// Supabase helpers
// ---------------------------------------------------------------------------

/**
 * Fetch all rows from a table, paginating through Supabase's row limit.
 * Returns the full array or throws on error.
 */
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
// Haversine distance
// ---------------------------------------------------------------------------

function haversineMiles(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 3958.7613;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
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
  return (
    toNum(p.building_area_total_sqft) ||
    toNum(p.above_grade_finished_area_sqft) ||
    0
  );
}

function pickAboveGradeSqft(p: PoolPhysical): number {
  return (
    toNum(p.above_grade_finished_area_sqft) ||
    toNum(p.building_area_total_sqft) ||
    0
  );
}

function belowGradeFinished(p: PoolPhysical): number {
  return toNum(p.below_grade_finished_area_sqft);
}

function belowGradeUnfinished(p: PoolPhysical): number {
  if (toNum(p.below_grade_unfinished_area_sqft) > 0) {
    return toNum(p.below_grade_unfinished_area_sqft);
  }
  const total = toNum(p.below_grade_total_sqft);
  const finished = toNum(p.below_grade_finished_area_sqft);
  return Math.max(0, total - finished);
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
      "id, unparsed_address, city, latitude, longitude",
      (q: any) => q.not("latitude", "is", null).not("longitude", "is", null),
    ),
    fetchAllRows<PoolPhysical>(
      supabase,
      "property_physical",
      "real_property_id, property_type, structure_type, level_class_standardized, building_form_standardized, building_area_total_sqft, above_grade_finished_area_sqft, below_grade_total_sqft, below_grade_finished_area_sqft, below_grade_unfinished_area_sqft, year_built, bedrooms_total, bathrooms_total",
    ),
    fetchAllRows<PoolListing>(
      supabase,
      "mls_listings",
      "id, listing_id, real_property_id, mls_status, list_price, close_price, close_date, property_condition_source",
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
    if (existing) {
      existing.push(listing);
    } else {
      closedByProperty.set(listing.real_property_id, [listing]);
    }
  }

  return {
    properties: propertyMap,
    physicals: physicalMap,
    closedListingsByProperty: closedByProperty,
  };
}

// ---------------------------------------------------------------------------
// Load subject data
// ---------------------------------------------------------------------------

async function loadSubjects(
  supabase: any,
  propertyIds: string[],
  pool: CompPool,
): Promise<Map<string, SubjectData>> {
  // Chunk IDs to avoid Supabase/PostgREST URL length limits on .in() filters
  const ID_CHUNK_SIZE = 200;
  const idChunks: string[][] = [];
  for (let i = 0; i < propertyIds.length; i += ID_CHUNK_SIZE) {
    idChunks.push(propertyIds.slice(i, i + ID_CHUNK_SIZE));
  }

  // Load financials for subjects (chunked)
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
  const financialsMap = new Map(
    financials.map((f) => [f.real_property_id, f]),
  );

  // Load latest active listing for each subject (chunked)
  const activeListings: PoolListing[] = [];
  for (const chunk of idChunks) {
    const rows = await fetchAllRows<PoolListing>(
      supabase,
      "mls_listings",
      "id, listing_id, real_property_id, mls_status, list_price, close_price, close_date, property_condition_source",
      (q: any) =>
        q
          .in("real_property_id", chunk)
          .in("mls_status", ["Active", "Coming Soon", "Pending"])
          .order("listing_contract_date", { ascending: false, nullsFirst: true }),
    );
    activeListings.push(...rows);
  }

  // Keep latest listing per property
  const latestListingByProperty = new Map<string, PoolListing>();
  for (const listing of activeListings) {
    if (!latestListingByProperty.has(listing.real_property_id)) {
      latestListingByProperty.set(listing.real_property_id, listing);
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
// Find comps for a subject (in-memory)
// ---------------------------------------------------------------------------

function findCompsForSubject(
  subject: SubjectData,
  pool: CompPool,
  maxDistanceMiles: number,
  maxDaysSinceClose: number,
  referenceDate: Date,
): CompArvInput[] {
  const subjectLat = subject.property.latitude;
  const subjectLon = subject.property.longitude;
  const subjectType = resolvePropertyTypeKey(subject.physical.property_type);
  const subjectLevelClass = subject.physical.level_class_standardized;
  const subjectStructureType = subject.physical.structure_type;

  const candidates: CompArvInput[] = [];

  // Bounding box pre-filter
  const latDelta = maxDistanceMiles / 69;
  const lonDivisor =
    Math.max(0.2, Math.cos((subjectLat * Math.PI) / 180)) * 69.172;
  const lonDelta = maxDistanceMiles / lonDivisor;

  for (const [compPropertyId, compListings] of pool.closedListingsByProperty) {
    if (compPropertyId === subject.property.id) continue;

    const compProperty = pool.properties.get(compPropertyId);
    const compPhysical = pool.physicals.get(compPropertyId);
    if (!compProperty || !compPhysical) continue;

    // Bounding box
    if (
      Math.abs(compProperty.latitude - subjectLat) > latDelta ||
      Math.abs(compProperty.longitude - subjectLon) > lonDelta
    ) {
      continue;
    }

    // Property type match
    const compType = resolvePropertyTypeKey(compPhysical.property_type);
    if (compType !== subjectType) continue;

    // Structure type / level class match for detached
    if (subjectType === "detached") {
      if (
        subjectLevelClass &&
        compPhysical.level_class_standardized &&
        subjectLevelClass !== compPhysical.level_class_standardized
      ) {
        continue;
      }
    }

    const distance = haversineMiles(
      subjectLat,
      subjectLon,
      compProperty.latitude,
      compProperty.longitude,
    );
    if (distance > maxDistanceMiles) continue;

    // Score best listing for this property (most recent close)
    for (const listing of compListings) {
      if (!listing.close_date || !listing.close_price) continue;

      const closeDateMs = new Date(listing.close_date).getTime();
      const daysSinceClose = Math.floor(
        (referenceDate.getTime() - closeDateMs) / 86_400_000,
      );
      if (daysSinceClose > maxDaysSinceClose) continue;

      candidates.push({
        compListingRowId: listing.id,
        compRealPropertyId: compPropertyId,
        listingId: listing.listing_id,
        address: compProperty.unparsed_address,
        closePrice: toNum(listing.close_price),
        closeDateIso: listing.close_date,
        compBuildingSqft: pickBuildingSqft(compPhysical),
        compAboveGradeSqft: pickAboveGradeSqft(compPhysical),
        distanceMiles: Math.round(distance * 1000) / 1000,
        yearBuilt: compPhysical.year_built,
        bedroomsTotal: compPhysical.bedrooms_total,
        bathroomsTotal: compPhysical.bathrooms_total,
        propertyType: compPhysical.property_type,
        levelClass: compPhysical.level_class_standardized,
        mlsStatus: listing.mls_status,
      });

      break; // Use the first (most recent) closed listing per property
    }
  }

  // Sort by distance, then recency
  candidates.sort((a, b) => {
    if (a.distanceMiles !== b.distanceMiles)
      return a.distanceMiles - b.distanceMiles;
    return (
      new Date(b.closeDateIso).getTime() - new Date(a.closeDateIso).getTime()
    );
  });

  return candidates.slice(0, 25); // Cap at 25 comps per subject
}

// ---------------------------------------------------------------------------
// Screen one subject
// ---------------------------------------------------------------------------

function screenSubject(
  subject: SubjectData,
  pool: CompPool,
  profile: FlipStrategyProfile,
  referenceDate: Date,
): ScreeningResultRow {
  const propertyType = resolvePropertyTypeKey(subject.physical.property_type);
  const buildingSqft = pickBuildingSqft(subject.physical);
  const aboveGradeSqft = pickAboveGradeSqft(subject.physical);
  const listPrice = toNum(subject.listing?.list_price);

  const base: Omit<
    ScreeningResultRow,
    "arv" | "rehab" | "holding" | "transaction" | "dealMath" | "qualification" | "screeningStatus" | "errorMessage"
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

  // Skip if missing critical data
  if (buildingSqft <= 0) {
    return {
      ...base,
      arv: null,
      rehab: null,
      holding: null,
      transaction: null,
      dealMath: null,
      qualification: {
        isPrimeCandidate: false,
        qualifyingCompCount: 0,
        reasons: [],
        disqualifiers: ["Missing building square footage"],
      },
      screeningStatus: "skipped",
      errorMessage: "Missing building square footage",
    };
  }

  if (listPrice <= 0) {
    return {
      ...base,
      arv: null,
      rehab: null,
      holding: null,
      transaction: null,
      dealMath: null,
      qualification: {
        isPrimeCandidate: false,
        qualifyingCompCount: 0,
        reasons: [],
        disqualifiers: ["Missing list price"],
      },
      screeningStatus: "skipped",
      errorMessage: "Missing list price",
    };
  }

  // Find comps
  const comps = findCompsForSubject(
    subject,
    pool,
    0.75, // Max distance for comp search (wider than qualification threshold)
    365, // Max days since close for comp search
    referenceDate,
  );

  // ARV
  const arv = calculateArv({
    subjectBuildingSqft: buildingSqft,
    subjectAboveGradeSqft: aboveGradeSqft,
    comps,
    config: profile.arv,
    propertyType,
    referenceDate,
  });

  if (!arv || arv.arvAggregate <= 0) {
    return {
      ...base,
      arv: null,
      rehab: null,
      holding: null,
      transaction: null,
      dealMath: null,
      qualification: {
        isPrimeCandidate: false,
        qualifyingCompCount: 0,
        reasons: [],
        disqualifiers: ["No usable comparable sales found"],
      },
      screeningStatus: "screened",
      errorMessage: null,
    };
  }

  // Rehab
  const rehab = calculateRehab({
    propertyType,
    aboveGradeSqft,
    belowGradeFinishedSqft: belowGradeFinished(subject.physical),
    belowGradeUnfinishedSqft: belowGradeUnfinished(subject.physical),
    buildingSqft,
    listPrice,
    yearBuilt: subject.physical.year_built,
    condition: subject.listing?.property_condition_source ?? null,
    config: profile.rehab,
  });

  // Holding
  const holding = calculateHolding({
    buildingSqft,
    listPrice,
    annualTax: subject.financials?.annual_property_tax ?? null,
    annualHoa: subject.financials?.annual_hoa_dues ?? null,
    config: profile.holding,
  });

  // Transaction
  const transaction = calculateTransaction({
    acquisitionPrice: listPrice,
    arvPrice: arv.arvAggregate,
    config: profile.transaction,
  });

  // Deal math
  const dealMath = calculateDealMath({
    arv: arv.arvAggregate,
    listPrice,
    buildingSqft,
    rehabTotal: rehab.total,
    holdTotal: holding.total,
    transactionTotal: transaction.total,
    targetProfit: profile.targetProfitDefault,
  });

  // Qualification
  const qualification = evaluateQualification({
    comps: arv.perCompDetails,
    config: profile.qualification,
    listPrice,
    buildingSqft,
    arv: arv.arvAggregate,
  });

  return {
    ...base,
    arv,
    rehab,
    holding,
    transaction,
    dealMath,
    qualification,
    screeningStatus: "screened",
    errorMessage: null,
  };
}

// ---------------------------------------------------------------------------
// Write results to DB
// ---------------------------------------------------------------------------

async function writeResults(
  supabase: any,
  batchId: string,
  results: ScreeningResultRow[],
  profile: FlipStrategyProfile,
): Promise<void> {
  const chunkSize = 200;

  for (let i = 0; i < results.length; i += chunkSize) {
    const chunk = results.slice(i, i + chunkSize);

    const rows = chunk.map((r) => ({
      screening_batch_id: batchId,
      real_property_id: r.realPropertyId,
      listing_row_id: r.listingRowId,

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

      rehab_total: r.rehab?.total ?? null,
      rehab_above_grade: r.rehab?.aboveGrade ?? null,
      rehab_below_finished: r.rehab?.belowGradeFinished ?? null,
      rehab_below_unfinished: r.rehab?.belowGradeUnfinished ?? null,
      rehab_exterior: r.rehab?.exterior ?? null,
      rehab_landscaping: r.rehab?.landscaping ?? null,
      rehab_systems: r.rehab?.systems ?? null,
      rehab_composite_multiplier: r.rehab?.compositeMultiplier ?? null,
      rehab_detail_json: r.rehab
        ? {
            typeMultiplier: r.rehab.typeMultiplier,
            conditionMultiplier: r.rehab.conditionMultiplier,
            priceMultiplier: r.rehab.priceMultiplier,
            ageMultiplier: r.rehab.ageMultiplier,
          }
        : null,

      hold_total: r.holding?.total ?? null,
      hold_days: r.holding?.daysHeld ?? null,

      transaction_total: r.transaction?.total ?? null,

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
    if (error) {
      throw new Error(`Failed to write screening results: ${error.message}`);
    }
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

  // Mark batch as running
  await supabase
    .from("screening_batches")
    .update({
      status: "running",
      started_at: new Date().toISOString(),
      total_subjects: subjectPropertyIds.length,
    })
    .eq("id", batchId);

  try {
    // Pre-load comp pool
    const pool = await loadCompPool(supabase, 365);

    // Load subject-specific data
    const subjects = await loadSubjects(supabase, subjectPropertyIds, pool);

    const referenceDate = new Date();
    const results: ScreeningResultRow[] = [];

    // Process each subject in-memory
    for (const propertyId of subjectPropertyIds) {
      const subject = subjects.get(propertyId);
      if (!subject) continue;

      try {
        const result = screenSubject(subject, pool, profile, referenceDate);
        results.push(result);
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
          arv: null,
          rehab: null,
          holding: null,
          transaction: null,
          dealMath: null,
          qualification: {
            isPrimeCandidate: false,
            qualifyingCompCount: 0,
            reasons: [],
            disqualifiers: ["Processing error"],
          },
          screeningStatus: "error",
          errorMessage:
            err instanceof Error ? err.message : "Unknown processing error",
        });
      }
    }

    // Write all results
    await writeResults(supabase, batchId, results, profile);

    // Compute summary
    const screened = results.filter((r) => r.screeningStatus === "screened").length;
    const skipped = results.filter((r) => r.screeningStatus === "skipped").length;
    const errors = results.filter((r) => r.screeningStatus === "error").length;
    const primeCandidates = results.filter(
      (r) => r.qualification.isPrimeCandidate,
    ).length;

    // Update batch
    await supabase
      .from("screening_batches")
      .update({
        status: "complete",
        screened_count: screened,
        qualified_count: screened,
        prime_candidate_count: primeCandidates,
        completed_at: new Date().toISOString(),
        summary_json: {
          screened,
          skipped,
          errors,
          primeCandidates,
          totalSubjects: subjectPropertyIds.length,
        },
      })
      .eq("id", batchId);

    return { screened, skipped, errors, primeCandidates };
  } catch (err) {
    await supabase
      .from("screening_batches")
      .update({
        status: "error",
        summary_json: {
          error: err instanceof Error ? err.message : "Unknown error",
        },
      })
      .eq("id", batchId);

    throw err;
  }
}

import "server-only";

import { createClient } from "@/lib/supabase/server";
// Scoring types and pure functions are also available in lib/comparables/scoring.ts
// for use by the screening pipeline. The engine keeps its own local definitions
// to avoid a risky refactor of this large file — both produce identical output.
import {
  type SizeBasis,
  type ComparablePurpose,
  type SnapshotMode,
  type SnapshotDateSource,
  type PropertyTypeFamily,
  type ScoreWeights,
  type ScoreComponent,
  type ComparableMode,
  type ComparableSearchRules,
  normalizedKey,
  toNumber,
  firstNonNull,
  clamp01,
  roundNumber,
  resolvePropertyTypeFamily,
} from "./scoring";

export type RunComparableSearchInput = {
  analysisId: string;
  subjectRealPropertyId: string;
  subjectListingRowId: string;
  profileSlug: string;
  purpose?: ComparablePurpose | null;
  snapshotMode?: SnapshotMode | null;
  customSnapshotDate?: string | null;
  allowedLevelClasses?: string[] | null;
  overrides: {
    maxDistanceMiles: number | null;
    maxDaysSinceClose: number | null;
    sqftTolerancePct: number | null;
    yearToleranceYears: number | null;
    bedTolerance: number | null;
    bathTolerance: number | null;
    maxCandidates: number | null;
    requireSamePropertyType: boolean;
    requireSameLevelClass: boolean;
    lotSizeTolerancePct?: number | null;
    requireSameBuildingForm?: boolean | null;
    sizeBasis?: SizeBasis | null;
  };
};

const comparablesDebugEnabled =
  process.env.COMPARABLES_DEBUG === "1" ||
  process.env.COMPARABLES_DEBUG === "true";

function normalizeText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "y", "on"].includes(normalized)) return true;
    if (["false", "0", "no", "n", "off"].includes(normalized)) return false;
  }
  return null;
}

function parseSizeBasis(value: unknown): SizeBasis | null {
  const normalized = normalizedKey(value);
  if (normalized === "building_area_total") return "building_area_total";
  if (normalized === "lot_size") return "lot_size";
  return null;
}

function parseComparablePurpose(value: unknown): ComparablePurpose | null {
  const normalized = normalizedKey(value);
  if (!normalized) return null;

  if (["standard", "generic", "listing"].includes(normalized)) {
    return "standard";
  }

  if (["flip", "arv"].includes(normalized)) return "flip";
  if (normalized === "rental" || normalized === "rent") return "rental";
  if (
    normalized === "scrape" ||
    normalized === "land" ||
    normalized === "new build" ||
    normalized === "new_build" ||
    normalized === "new construction"
  ) {
    return "scrape";
  }

  return null;
}

function parseSnapshotMode(value: unknown): SnapshotMode | null {
  const normalized = normalizedKey(value);
  if (normalized === "auto") return "auto";
  if (normalized === "current" || normalized === "current market") {
    return "current";
  }
  if (normalized === "custom") return "custom";
  return null;
}

function toIntegerOrNull(value: number | null) {
  return value === null ? null : Math.round(value);
}

function parseIsoDateToUtcDate(value: string | null): Date | null {
  if (!value) return null;

  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));

  return Number.isNaN(date.getTime()) ? null : date;
}

function currentUtcDateMidnight() {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

function addUtcDays(date: Date, days: number) {
  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate() + days,
    ),
  );
}

function isoDateFromUtcDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function resolveSnapshotDates(input: {
  requestedSnapshotMode: SnapshotMode;
  customSnapshotDate: string | null;
  subjectListingContractDate: string | null;
  maxDaysSinceClose: number;
}) {
  const contractDate = parseIsoDateToUtcDate(input.subjectListingContractDate);
  const customDate = parseIsoDateToUtcDate(input.customSnapshotDate);
  const recencyWindowDays = Math.max(0, Math.round(input.maxDaysSinceClose));

  let snapshotReferenceDate: Date;
  let snapshotDateSource: SnapshotDateSource;
  let latestCloseDateExclusive: Date;

  if (input.requestedSnapshotMode === "custom") {
    if (!customDate) {
      throw new Error(
        "Custom snapshot mode requires a valid customSnapshotDate (YYYY-MM-DD).",
      );
    }

    snapshotReferenceDate = customDate;
    snapshotDateSource = "custom_override";
    latestCloseDateExclusive = snapshotReferenceDate;
  } else if (input.requestedSnapshotMode === "current") {
    snapshotReferenceDate = currentUtcDateMidnight();
    snapshotDateSource = "current_override";
    latestCloseDateExclusive = addUtcDays(snapshotReferenceDate, 1);
  } else if (contractDate) {
    snapshotReferenceDate = contractDate;
    snapshotDateSource = "listing_contract_date";
    latestCloseDateExclusive = snapshotReferenceDate;
  } else {
    snapshotReferenceDate = currentUtcDateMidnight();
    snapshotDateSource = "current_date_fallback";
    latestCloseDateExclusive = addUtcDays(snapshotReferenceDate, 1);
  }

  const earliestCloseDate = addUtcDays(
    snapshotReferenceDate,
    -recencyWindowDays,
  );

  return {
    requestedSnapshotMode: input.requestedSnapshotMode,
    snapshotReferenceDate,
    snapshotDateSource,
    snapshotReferenceDateIso: isoDateFromUtcDate(snapshotReferenceDate),
    earliestCloseDateIso: isoDateFromUtcDate(earliestCloseDate),
    latestCloseDateExclusiveIso: isoDateFromUtcDate(latestCloseDateExclusive),
  };
}

function mergeRules(
  defaults: Record<string, unknown> | null | undefined,
  overrides: RunComparableSearchInput["overrides"],
): ComparableSearchRules {
  const defaultMaxDistance =
    toNumber(defaults?.maxDistanceMiles ?? defaults?.max_distance_miles) ?? 0.5;
  const defaultMaxDays =
    toNumber(defaults?.maxDaysSinceClose ?? defaults?.max_days_since_close) ??
    365;
  const defaultSqftTolerance =
    toNumber(defaults?.sqftTolerancePct ?? defaults?.sqft_tolerance_pct) ?? 20;
  const defaultLotSizeTolerance =
    toNumber(
      defaults?.lotSizeTolerancePct ?? defaults?.lot_size_tolerance_pct,
    ) ?? defaultSqftTolerance;
  const defaultYearTolerance =
    toNumber(defaults?.yearToleranceYears ?? defaults?.year_tolerance_years) ??
    25;
  const defaultBedTolerance =
    toNumber(defaults?.bedTolerance ?? defaults?.bed_tolerance) ?? 1;
  const defaultBathTolerance =
    toNumber(defaults?.bathTolerance ?? defaults?.bath_tolerance) ?? 1;
  const defaultMaxCandidates =
    toNumber(defaults?.maxCandidates ?? defaults?.max_candidates) ?? 15;
  const defaultRequireSamePropertyType =
    toBoolean(
      defaults?.requireSamePropertyType ?? defaults?.require_same_property_type,
    ) ?? true;
  const defaultRequireSameLevelClass =
    toBoolean(
      defaults?.requireSameLevelClass ?? defaults?.require_same_level_class,
    ) ?? true;
  const defaultRequireSameBuildingForm =
    toBoolean(
      defaults?.requireSameBuildingForm ?? defaults?.require_same_building_form,
    ) ?? true;
  const defaultPreferredSizeBasis = parseSizeBasis(
    defaults?.sizeBasis ?? defaults?.size_basis,
  );

  return {
    maxDistanceMiles: overrides.maxDistanceMiles ?? defaultMaxDistance,
    maxDaysSinceClose: overrides.maxDaysSinceClose ?? defaultMaxDays,
    sqftTolerancePct: overrides.sqftTolerancePct ?? defaultSqftTolerance,
    lotSizeTolerancePct:
      overrides.lotSizeTolerancePct ?? defaultLotSizeTolerance,
    yearToleranceYears: overrides.yearToleranceYears ?? defaultYearTolerance,
    bedTolerance: overrides.bedTolerance ?? defaultBedTolerance,
    bathTolerance: overrides.bathTolerance ?? defaultBathTolerance,
    maxCandidates: overrides.maxCandidates ?? defaultMaxCandidates,
    requireSamePropertyType:
      overrides.requireSamePropertyType ?? defaultRequireSamePropertyType,
    requireSameLevelClass:
      overrides.requireSameLevelClass ?? defaultRequireSameLevelClass,
    requireSameBuildingForm:
      overrides.requireSameBuildingForm ?? defaultRequireSameBuildingForm,
    preferredSizeBasis:
      overrides.sizeBasis ?? defaultPreferredSizeBasis ?? null,
  };
}

function resolveComparablePurposeFromProfile(input: {
  slug?: unknown;
  name?: unknown;
  purpose?: unknown;
}): ComparablePurpose {
  const haystack = [
    normalizeText(input.slug),
    normalizeText(input.name),
    normalizeText(input.purpose),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (
    haystack.includes("scrape") ||
    haystack.includes("new build") ||
    haystack.includes("new_build") ||
    haystack.includes("new construction") ||
    haystack.includes("land")
  ) {
    return "scrape";
  }

  if (haystack.includes("rental") || haystack.includes("rent")) {
    return "rental";
  }

  if (haystack.includes("flip") || haystack.includes("arv")) {
    return "flip";
  }

  return "standard";
}

function resolveComparablePurpose(input: {
  explicitPurpose?: unknown;
  slug?: unknown;
  name?: unknown;
  purpose?: unknown;
}): ComparablePurpose {
  return (
    parseComparablePurpose(input.explicitPurpose) ??
    resolveComparablePurposeFromProfile({
      slug: input.slug,
      name: input.name,
      purpose: input.purpose,
    })
  );
}

function resolveComparableMode(input: {
  purpose: ComparablePurpose;
  subjectFamily: PropertyTypeFamily;
  rules: ComparableSearchRules;
}): ComparableMode {
  const { purpose, subjectFamily, rules } = input;

  const isCondo = subjectFamily === "condo";
  const isTownhome = subjectFamily === "townhome";
  const isAttachedLike = isCondo || isTownhome;
  const isScrape = purpose === "scrape";

  const sizeBasis =
    rules.preferredSizeBasis ?? (isScrape ? "lot_size" : "building_area_total");

  const useBuildingFormMetric =
    !isScrape &&
    (subjectFamily === "condo" ||
      subjectFamily === "townhome" ||
      subjectFamily === "multifamily");

  const useLevelMetric = !isScrape && !isAttachedLike;
  const useLotSizeMetric = !isCondo;
  const useConditionMetric = !isScrape;

  if (purpose === "scrape") {
    return {
      purpose,
      subjectFamily,
      sizeBasis,
      useSqftMetric: false,
      useLotSizeMetric,
      useYearMetric: false,
      useBedMetric: false,
      useBathMetric: false,
      useBuildingFormMetric: false,
      useLevelMetric: false,
      useConditionMetric: false,
      requireSamePropertyType: false,
      requireSameBuildingForm: false,
      requireSameLevelClass: false,
      weights: {
        distance: 0.35,
        recency: 0.25,
        size: 0,
        lotSize: useLotSizeMetric ? 0.4 : 0,
        year: 0,
        beds: 0,
        baths: 0,
        form: 0,
        level: 0,
        condition: 0,
      },
    };
  }

  if (purpose === "flip") {
    return {
      purpose,
      subjectFamily,
      sizeBasis,
      useSqftMetric: true,
      useLotSizeMetric,
      useYearMetric: true,
      useBedMetric: true,
      useBathMetric: true,
      useBuildingFormMetric,
      useLevelMetric,
      useConditionMetric,
      requireSamePropertyType: rules.requireSamePropertyType,
      requireSameBuildingForm:
        useBuildingFormMetric && rules.requireSameBuildingForm,
      requireSameLevelClass: useLevelMetric && rules.requireSameLevelClass,
      weights: {
        distance: 0.24,
        recency: 0.18,
        size: 0.24,
        lotSize: useLotSizeMetric ? 0.08 : 0,
        year: 0.1,
        beds: 0.06,
        baths: 0.06,
        form: useBuildingFormMetric ? 0.12 : 0,
        level: useLevelMetric ? 0.12 : 0,
        condition: useConditionMetric ? 0.06 : 0,
      },
    };
  }

  return {
    purpose,
    subjectFamily,
    sizeBasis,
    useSqftMetric: true,
    useLotSizeMetric,
    useYearMetric: true,
    useBedMetric: true,
    useBathMetric: true,
    useBuildingFormMetric,
    useLevelMetric,
    useConditionMetric,
    requireSamePropertyType: rules.requireSamePropertyType,
    requireSameBuildingForm:
      useBuildingFormMetric && rules.requireSameBuildingForm,
    requireSameLevelClass: useLevelMetric && rules.requireSameLevelClass,
    weights: {
      distance: 0.22,
      recency: purpose === "rental" ? 0.14 : 0.16,
      size: 0.22,
      lotSize: useLotSizeMetric ? 0.06 : 0,
      year: 0.1,
      beds: 0.1,
      baths: 0.1,
      form: useBuildingFormMetric ? 0.12 : 0,
      level: useLevelMetric ? 0.12 : 0,
      condition: useConditionMetric ? 0.1 : 0,
    },
  };
}

function normalizeAllowedLevelClasses(values: string[] | null | undefined) {
  return Array.from(
    new Set(
      (values ?? [])
        .map((value) => normalizedKey(value))
        .filter((value): value is string => Boolean(value)),
    ),
  );
}

function haversineMiles(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
) {
  const toRadians = (value: number) => (value * Math.PI) / 180;

  const earthRadiusMiles = 3958.8;
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusMiles * c;
}

function daysBetween(fromDate: string, toDate: Date): number | null {
  const from = new Date(fromDate);

  if (Number.isNaN(from.getTime()) || Number.isNaN(toDate.getTime())) {
    return null;
  }

  const fromUtcMidnight = Date.UTC(
    from.getUTCFullYear(),
    from.getUTCMonth(),
    from.getUTCDate(),
  );

  const toUtcMidnight = Date.UTC(
    toDate.getUTCFullYear(),
    toDate.getUTCMonth(),
    toDate.getUTCDate(),
  );

  return Math.floor((toUtcMidnight - fromUtcMidnight) / 86400000);
}

function pctDelta(subject: number, candidate: number) {
  if (subject === 0) return null;
  return (Math.abs(candidate - subject) / subject) * 100;
}

function componentScoreFromDelta(
  delta: number | null,
  tolerance: number,
): number | null {
  if (delta === null) return null;
  if (tolerance <= 0) return delta === 0 ? 1 : 0;
  return clamp01(1 - delta / tolerance);
}

function computeFormMatchScore(
  subjectForm: string | null,
  candidateForm: string | null,
): number | null {
  const subject = normalizedKey(subjectForm);
  const candidate = normalizedKey(candidateForm);

  if (!subject && !candidate) return null;
  if (!subject || !candidate) return 0.45;
  return subject === candidate ? 1 : 0;
}

function computeLevelMatchScore(input: {
  subjectLevelClass: string | null;
  candidateLevelClass: string | null;
  subjectLevelsRaw: string | null;
  candidateLevelsRaw: string | null;
  allowedLevelClassesNormalized: string[];
}) {
  const subjectRaw = normalizedKey(input.subjectLevelsRaw);
  const candidateRaw = normalizedKey(input.candidateLevelsRaw);
  const subjectClass = normalizedKey(input.subjectLevelClass);
  const candidateClass = normalizedKey(input.candidateLevelClass);

  if (!subjectRaw && !candidateRaw && !subjectClass && !candidateClass) {
    return null;
  }

  if (subjectRaw && candidateRaw && subjectRaw === candidateRaw) {
    return 1;
  }

  if (subjectClass && candidateClass && subjectClass === candidateClass) {
    return 0.85;
  }

  if (
    candidateClass &&
    input.allowedLevelClassesNormalized.length > 0 &&
    input.allowedLevelClassesNormalized.includes(candidateClass)
  ) {
    return 0.65;
  }

  if (!subjectClass || !candidateClass) {
    return 0.45;
  }

  return 0;
}

function computeConditionMatchScore(
  subjectCondition: string | null,
  candidateCondition: string | null,
): number | null {
  const subject = normalizedKey(subjectCondition);
  const candidate = normalizedKey(candidateCondition);

  if (!subject && !candidate) return null;
  if (!subject || !candidate) return 0.45;
  return subject === candidate ? 1 : 0.3;
}

function sizeSqftFromPhysical(physical: {
  building_area_total_sqft?: unknown;
  above_grade_finished_area_sqft?: unknown;
}) {
  return firstNonNull(
    toNumber(physical.building_area_total_sqft),
    toNumber(physical.above_grade_finished_area_sqft),
  );
}

function lotSizeSqftFromProperty(input: {
  lot_size_sqft?: unknown;
  lot_size_acres?: unknown;
}) {
  const sqft = toNumber(input.lot_size_sqft);
  if (sqft !== null) return sqft;

  const acres = toNumber(input.lot_size_acres);
  return acres !== null ? acres * 43560 : null;
}

function buildWeightedScore(input: {
  weights: ScoreWeights;
  components: Record<keyof ScoreWeights, ScoreComponent>;
}) {
  let totalWeight = 0;
  let weightedScoreTotal = 0;

  const breakdown: Record<
    keyof ScoreWeights,
    {
      used: boolean;
      weight: number;
      score: number | null;
      rawScore: number | null;
    }
  > = {
    distance: { used: false, weight: 0, score: null, rawScore: null },
    recency: { used: false, weight: 0, score: null, rawScore: null },
    size: { used: false, weight: 0, score: null, rawScore: null },
    lotSize: { used: false, weight: 0, score: null, rawScore: null },
    year: { used: false, weight: 0, score: null, rawScore: null },
    beds: { used: false, weight: 0, score: null, rawScore: null },
    baths: { used: false, weight: 0, score: null, rawScore: null },
    form: { used: false, weight: 0, score: null, rawScore: null },
    level: { used: false, weight: 0, score: null, rawScore: null },
    condition: { used: false, weight: 0, score: null, rawScore: null },
  };

  (Object.keys(input.weights) as Array<keyof ScoreWeights>).forEach((key) => {
    const weight = input.weights[key];
    const component = input.components[key];
    const used = component.used && weight > 0;

    if (!used) {
      breakdown[key] = {
        used: false,
        weight: roundNumber(weight),
        score: null,
        rawScore:
          component.score === null
            ? null
            : roundNumber(component.score * 100, 2),
      };
      return;
    }

    const resolvedScore = component.score ?? component.missingDefault ?? 0.5;

    totalWeight += weight;
    weightedScoreTotal += resolvedScore * weight;

    breakdown[key] = {
      used: true,
      weight: roundNumber(weight),
      score: roundNumber(resolvedScore * 100, 2),
      rawScore:
        component.score === null ? null : roundNumber(component.score * 100, 2),
    };
  });

  return {
    rawScore:
      totalWeight === 0
        ? 0
        : roundNumber(clamp01(weightedScoreTotal / totalWeight) * 100, 4),
    totalWeight: roundNumber(totalWeight),
    breakdown,
  };
}

async function fetchRealPropertiesByIds(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ids: string[],
) {
  if (ids.length === 0) return [];

  const chunkSize = 1000;
  const results: any[] = [];

  for (let start = 0; start < ids.length; start += chunkSize) {
    const chunk = ids.slice(start, start + chunkSize);

    const { data, error } = await supabase
      .from("real_properties")
      .select(
        `
        id,
        unparsed_address,
        city,
        county,
        state,
        postal_code,
        latitude,
        longitude,
        lot_size_sqft,
        lot_size_acres
      `,
      )
      .in("id", chunk);

    if (error) throw new Error(error.message);
    results.push(...(data ?? []));
  }

  return results;
}

async function fetchPhysicalByPropertyIds(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ids: string[],
) {
  if (ids.length === 0) return [];

  const chunkSize = 1000;
  const results: any[] = [];

  for (let start = 0; start < ids.length; start += chunkSize) {
    const chunk = ids.slice(start, start + chunkSize);

    const { data, error } = await supabase
      .from("property_physical")
      .select(
        `
        real_property_id,
        property_type,
        property_sub_type,
        structure_type,
        levels_raw,
        level_class_standardized,
        building_form_standardized,
        above_grade_finished_area_sqft,
        below_grade_total_sqft,
        below_grade_finished_area_sqft,
        building_area_total_sqft,
        year_built,
        bedrooms_total,
        bathrooms_total,
        garage_spaces
      `,
      )
      .in("real_property_id", chunk);

    if (error) throw new Error(error.message);
    results.push(...(data ?? []));
  }

  return results;
}

async function fetchCandidateListingsByPropertyIds(
  supabase: Awaited<ReturnType<typeof createClient>>,
  params: {
    propertyIds: string[];
    sourceSystem: string;
    subjectRealPropertyId: string;
    earliestCloseDateIso: string;
    latestCloseDateExclusiveIso: string;
  },
) {
  const {
    propertyIds,
    sourceSystem,
    subjectRealPropertyId,
    earliestCloseDateIso,
    latestCloseDateExclusiveIso,
  } = params;

  if (propertyIds.length === 0) return [];

  const chunkSize = 1000;
  const results: any[] = [];

  for (let start = 0; start < propertyIds.length; start += chunkSize) {
    const chunk = propertyIds.slice(start, start + chunkSize);

    const { data, error } = await supabase
      .from("mls_listings")
      .select(
        `
        id,
        listing_id,
        real_property_id,
        source_system,
        close_date,
        close_price,
        list_price,
        property_condition_source,
        listing_contract_date,
        mls_status
      `,
      )
      .eq("source_system", sourceSystem)
      .in("real_property_id", chunk)
      .neq("real_property_id", subjectRealPropertyId)
      .not("close_date", "is", null)
      .gte("close_date", earliestCloseDateIso)
      .lt("close_date", latestCloseDateExclusiveIso);

    if (error) throw new Error(error.message);
    results.push(...(data ?? []));
  }

  return results;
}

export async function runComparableSearch(input: RunComparableSearchInput) {
  const supabase = await createClient();

  const { data: profile, error: profileError } = await supabase
    .from("comparable_profiles")
    .select(
      `
      id,
      slug,
      name,
      purpose,
      rules_json
    `,
    )
    .eq("slug", input.profileSlug)
    .single();

  if (profileError || !profile) {
    throw new Error(profileError?.message ?? "Comparable profile not found.");
  }

  const mergedRules = mergeRules(
    profile.rules_json as Record<string, unknown> | null,
    input.overrides,
  );

  const [
    { data: subjectListing, error: subjectListingError },
    { data: subjectProperty, error: subjectPropertyError },
    { data: subjectPhysical, error: subjectPhysicalError },
  ] = await Promise.all([
    supabase
      .from("mls_listings")
      .select(
        `
          id,
          listing_id,
          source_system,
          real_property_id,
          property_condition_source,
          listing_contract_date
        `,
      )
      .eq("id", input.subjectListingRowId)
      .maybeSingle(),

    supabase
      .from("real_properties")
      .select(
        `
          id,
          unparsed_address,
          city,
          state,
          postal_code,
          latitude,
          longitude,
          lot_size_sqft,
          lot_size_acres
        `,
      )
      .eq("id", input.subjectRealPropertyId)
      .maybeSingle(),

    supabase
      .from("property_physical")
      .select(
        `
          real_property_id,
          property_type,
          property_sub_type,
          structure_type,
          levels_raw,
          level_class_standardized,
          building_form_standardized,
          above_grade_finished_area_sqft,
          below_grade_total_sqft,
          below_grade_finished_area_sqft,
          building_area_total_sqft,
          year_built,
          bedrooms_total,
          bathrooms_total,
          garage_spaces
        `,
      )
      .eq("real_property_id", input.subjectRealPropertyId)
      .maybeSingle(),
  ]);

  if (subjectListingError) throw new Error(subjectListingError.message);
  if (subjectPropertyError) throw new Error(subjectPropertyError.message);
  if (subjectPhysicalError) throw new Error(subjectPhysicalError.message);

  if (!subjectListing || !subjectProperty || !subjectPhysical) {
    throw new Error("Subject property is missing required imported facts.");
  }

  const sourceSystem = normalizeText(subjectListing.source_system);
  if (!sourceSystem) {
    throw new Error("Subject listing is missing source_system.");
  }

  const subjectLat = toNumber(subjectProperty.latitude);
  const subjectLon = toNumber(subjectProperty.longitude);

  if (subjectLat === null || subjectLon === null) {
    throw new Error("Subject property is missing latitude/longitude.");
  }

  const subjectPropertyType = normalizeText(subjectPhysical.property_type);
  const subjectPropertyTypeFamily =
    resolvePropertyTypeFamily(subjectPropertyType);
  const resolvedPurpose = resolveComparablePurpose({
    explicitPurpose: input.purpose,
    slug: profile.slug,
    name: profile.name,
    purpose: profile.purpose,
  });
  const mode = resolveComparableMode({
    purpose: resolvedPurpose,
    subjectFamily: subjectPropertyTypeFamily,
    rules: mergedRules,
  });

  const requestedSnapshotMode = parseSnapshotMode(input.snapshotMode) ?? "auto";
  const subjectListingContractDate = normalizeText(
    subjectListing.listing_contract_date,
  );
  const snapshotDates = resolveSnapshotDates({
    requestedSnapshotMode,
    customSnapshotDate: normalizeText(input.customSnapshotDate),
    subjectListingContractDate,
    maxDaysSinceClose: mergedRules.maxDaysSinceClose,
  });

  const subjectSqft = sizeSqftFromPhysical(subjectPhysical);
  const subjectLotSizeSqft = lotSizeSqftFromProperty(subjectProperty);
  const subjectYearBuilt = toNumber(subjectPhysical.year_built);
  const subjectBeds = toNumber(subjectPhysical.bedrooms_total);
  const subjectBaths = toNumber(subjectPhysical.bathrooms_total);
  const subjectCondition = normalizeText(
    subjectListing.property_condition_source,
  );
  const subjectBuildingForm = normalizeText(
    subjectPhysical.building_form_standardized,
  );
  const subjectStructureType = normalizeText(subjectPhysical.structure_type);
  const subjectLevelClass = normalizeText(
    subjectPhysical.level_class_standardized,
  );
  const subjectLevelsRaw = normalizeText(subjectPhysical.levels_raw);

  const allowedLevelClassesNormalized = mode.useLevelMetric
    ? normalizeAllowedLevelClasses(input.allowedLevelClasses)
    : [];
  const allowedLevelClassesDisplay =
    mode.useLevelMetric && (input.allowedLevelClasses?.length ?? 0) > 0
      ? (input.allowedLevelClasses ?? []).filter(Boolean)
      : subjectLevelClass
        ? [subjectLevelClass]
        : [];

  const initialSummary = {
    sourceSystem,
    subjectListingId: subjectListing.listing_id,
    subjectListingContractDate,
    subjectPropertyType,
    subjectPropertyTypeFamily,
    subjectBuildingForm,
    subjectStructureType,
    subjectLevelClass,
    subjectLevelsRaw,
    requestedPurpose: parseComparablePurpose(input.purpose),
    purposeMode: resolvedPurpose,
    sizeBasis: mode.sizeBasis,
    requestedSnapshotMode,
    marketSnapshotDate: snapshotDates.snapshotReferenceDateIso,
    marketSnapshotDateSource: snapshotDates.snapshotDateSource,
    earliestCloseDateInclusive: snapshotDates.earliestCloseDateIso,
    latestCloseDateExclusive: snapshotDates.latestCloseDateExclusiveIso,
    allowedLevelClasses: allowedLevelClassesDisplay,
  };

  const { data: insertedRun, error: insertedRunError } = await supabase
    .from("comparable_search_runs")
    .insert({
      analysis_id: input.analysisId,
      subject_real_property_id: input.subjectRealPropertyId,
      subject_listing_row_id: input.subjectListingRowId,
      comparable_profile_id: profile.id,
      purpose: resolvedPurpose,
      status: "pending",
      parameters_json: {
        ...mergedRules,
        requestedPurpose: parseComparablePurpose(input.purpose),
        requestedSnapshotMode,
        customSnapshotDate: normalizeText(input.customSnapshotDate),
        allowedLevelClasses: allowedLevelClassesDisplay,
      },
      summary_json: initialSummary,
    })
    .select("id")
    .single();

  if (insertedRunError || !insertedRun) {
    throw new Error(
      insertedRunError?.message ?? "Failed to save comparable search run.",
    );
  }

  try {
    if (comparablesDebugEnabled) {
      console.log(
        "[comp-pull] merged rules",
        JSON.stringify(
          {
            analysisId: input.analysisId,
            profileSlug: input.profileSlug,
            rules: mergedRules,
            mode,
            snapshot: {
              requestedSnapshotMode,
              subjectListingContractDate,
              marketSnapshotDate: snapshotDates.snapshotReferenceDateIso,
              marketSnapshotDateSource: snapshotDates.snapshotDateSource,
              earliestCloseDateInclusive: snapshotDates.earliestCloseDateIso,
              latestCloseDateExclusive:
                snapshotDates.latestCloseDateExclusiveIso,
            },
            subject: {
              subjectPropertyType,
              subjectPropertyTypeFamily,
              subjectBuildingForm,
              subjectLevelClass,
              subjectLevelsRaw,
              subjectSqft,
              subjectLotSizeSqft,
              allowedLevelClasses: allowedLevelClassesDisplay,
            },
          },
          null,
          2,
        ),
      );
    }

    const latDelta = mergedRules.maxDistanceMiles / 69;
    const lonDelta =
      mergedRules.maxDistanceMiles /
      Math.max(1, 69 * Math.cos((subjectLat * Math.PI) / 180));

    const {
      data: candidatePropertyShells,
      error: candidatePropertyShellsError,
    } = await supabase
      .from("real_properties")
      .select(
        `
        id,
        latitude,
        longitude
      `,
      )
      .gte("latitude", subjectLat - latDelta)
      .lte("latitude", subjectLat + latDelta)
      .gte("longitude", subjectLon - lonDelta)
      .lte("longitude", subjectLon + lonDelta);

    if (candidatePropertyShellsError) {
      throw new Error(candidatePropertyShellsError.message);
    }

    const candidatePropertyIds = Array.from(
      new Set(
        (candidatePropertyShells ?? [])
          .map((row) => row.id)
          .filter((value): value is string => Boolean(value)),
      ),
    );

    const [candidateProperties, candidatePhysicals, candidateListings] =
      await Promise.all([
        fetchRealPropertiesByIds(supabase, candidatePropertyIds),
        fetchPhysicalByPropertyIds(supabase, candidatePropertyIds),
        fetchCandidateListingsByPropertyIds(supabase, {
          propertyIds: candidatePropertyIds,
          sourceSystem,
          subjectRealPropertyId: input.subjectRealPropertyId,
          earliestCloseDateIso: snapshotDates.earliestCloseDateIso,
          latestCloseDateExclusiveIso:
            snapshotDates.latestCloseDateExclusiveIso,
        }),
      ]);

    const propertyMap = new Map(
      candidateProperties.map((row) => [row.id, row]),
    );
    const physicalMap = new Map(
      candidatePhysicals.map((row) => [row.real_property_id, row]),
    );

    const rankedCandidates = candidateListings
      .map((listing) => {
        const property = propertyMap.get(listing.real_property_id);
        const physical = physicalMap.get(listing.real_property_id);

        if (!property || !physical) return null;

        const candidateLat = toNumber(property.latitude);
        const candidateLon = toNumber(property.longitude);
        if (candidateLat === null || candidateLon === null) return null;

        const distanceMiles = haversineMiles(
          subjectLat,
          subjectLon,
          candidateLat,
          candidateLon,
        );
        if (distanceMiles > mergedRules.maxDistanceMiles) return null;

        const daysSinceClose = listing.close_date
          ? daysBetween(listing.close_date, snapshotDates.snapshotReferenceDate)
          : null;

        if (
          daysSinceClose === null ||
          daysSinceClose < 0 ||
          daysSinceClose > mergedRules.maxDaysSinceClose
        ) {
          return null;
        }

        const candidatePropertyType = normalizeText(physical.property_type);
        if (
          mode.requireSamePropertyType &&
          subjectPropertyType &&
          candidatePropertyType &&
          normalizedKey(candidatePropertyType) !==
            normalizedKey(subjectPropertyType)
        ) {
          return null;
        }

        const candidateBuildingForm = normalizeText(
          physical.building_form_standardized,
        );
        const formMatchScore01 = mode.useBuildingFormMetric
          ? computeFormMatchScore(subjectBuildingForm, candidateBuildingForm)
          : null;

        if (
          mode.requireSameBuildingForm &&
          subjectBuildingForm &&
          candidateBuildingForm &&
          normalizedKey(candidateBuildingForm) !==
            normalizedKey(subjectBuildingForm)
        ) {
          return null;
        }

        const candidateLevelClass = normalizeText(
          physical.level_class_standardized,
        );
        const candidateLevelClassNormalized =
          normalizedKey(candidateLevelClass);
        const candidateLevelsRaw = normalizeText(physical.levels_raw);
        const levelMatchScore01 = mode.useLevelMetric
          ? computeLevelMatchScore({
              subjectLevelClass,
              candidateLevelClass,
              subjectLevelsRaw,
              candidateLevelsRaw,
              allowedLevelClassesNormalized,
            })
          : null;

        if (mode.useLevelMetric) {
          if (allowedLevelClassesNormalized.length > 0) {
            if (
              !candidateLevelClassNormalized ||
              !allowedLevelClassesNormalized.includes(
                candidateLevelClassNormalized,
              )
            ) {
              return null;
            }
          } else if (
            mode.requireSameLevelClass &&
            subjectLevelClass &&
            candidateLevelClass &&
            normalizedKey(candidateLevelClass) !==
              normalizedKey(subjectLevelClass)
          ) {
            return null;
          }
        }

        const candidateBuildingAreaTotalSqft = toNumber(
          physical.building_area_total_sqft,
        );
        const candidateAboveGradeFinishedSqft = toNumber(
          physical.above_grade_finished_area_sqft,
        );
        const candidateBelowGradeTotalSqft = toNumber(
          physical.below_grade_total_sqft,
        );
        const candidateBelowGradeFinishedSqft = toNumber(
          physical.below_grade_finished_area_sqft,
        );
        const candidateGarageSpaces = toNumber(physical.garage_spaces);
        const candidateSqft = sizeSqftFromPhysical(physical);

        const sqftDeltaPct =
          subjectSqft !== null && candidateSqft !== null
            ? pctDelta(subjectSqft, candidateSqft)
            : null;

        if (
          mode.useSqftMetric &&
          sqftDeltaPct !== null &&
          sqftDeltaPct > mergedRules.sqftTolerancePct
        ) {
          return null;
        }

        const candidateLotSizeSqft = lotSizeSqftFromProperty(property);
        const lotSizeDeltaPct =
          subjectLotSizeSqft !== null && candidateLotSizeSqft !== null
            ? pctDelta(subjectLotSizeSqft, candidateLotSizeSqft)
            : null;

        if (
          mode.sizeBasis === "lot_size" &&
          mode.useLotSizeMetric &&
          lotSizeDeltaPct !== null &&
          lotSizeDeltaPct > mergedRules.lotSizeTolerancePct
        ) {
          return null;
        }

        const candidateYearBuilt = toNumber(physical.year_built);
        const yearDelta =
          mode.useYearMetric &&
          subjectYearBuilt !== null &&
          candidateYearBuilt !== null
            ? Math.abs(candidateYearBuilt - subjectYearBuilt)
            : null;

        if (
          mode.useYearMetric &&
          yearDelta !== null &&
          yearDelta > mergedRules.yearToleranceYears
        ) {
          return null;
        }

        const candidateBeds = toNumber(physical.bedrooms_total);
        const bedDelta =
          mode.useBedMetric && subjectBeds !== null && candidateBeds !== null
            ? Math.abs(candidateBeds - subjectBeds)
            : null;

        if (
          mode.useBedMetric &&
          bedDelta !== null &&
          bedDelta > mergedRules.bedTolerance
        ) {
          return null;
        }

        const candidateBaths = toNumber(physical.bathrooms_total);
        const bathDelta =
          mode.useBathMetric && subjectBaths !== null && candidateBaths !== null
            ? Math.abs(candidateBaths - subjectBaths)
            : null;

        if (
          mode.useBathMetric &&
          bathDelta !== null &&
          bathDelta > mergedRules.bathTolerance
        ) {
          return null;
        }

        const candidateCondition = normalizeText(
          listing.property_condition_source,
        );
        const conditionMatchScore01 = mode.useConditionMetric
          ? computeConditionMatchScore(subjectCondition, candidateCondition)
          : null;

        const closePrice = toNumber(listing.close_price);
        const ppsf =
          closePrice !== null && candidateSqft !== null && candidateSqft > 0
            ? closePrice / candidateSqft
            : null;

        const distanceComponent = clamp01(
          1 - distanceMiles / Math.max(mergedRules.maxDistanceMiles, 0.0001),
        );
        const recencyComponent = clamp01(
          1 - daysSinceClose / Math.max(mergedRules.maxDaysSinceClose, 1),
        );

        const scoreBreakdown = buildWeightedScore({
          weights: mode.weights,
          components: {
            distance: {
              used: true,
              score: distanceComponent,
              missingDefault: 0.5,
            },
            recency: {
              used: true,
              score: recencyComponent,
              missingDefault: 0.5,
            },
            size: {
              used: mode.useSqftMetric,
              score: componentScoreFromDelta(
                sqftDeltaPct,
                mergedRules.sqftTolerancePct,
              ),
              missingDefault: 0.5,
            },
            lotSize: {
              used: mode.useLotSizeMetric,
              score: componentScoreFromDelta(
                lotSizeDeltaPct,
                mergedRules.lotSizeTolerancePct,
              ),
              missingDefault: 0.5,
            },
            year: {
              used: mode.useYearMetric,
              score: componentScoreFromDelta(
                yearDelta,
                mergedRules.yearToleranceYears,
              ),
              missingDefault: 0.5,
            },
            beds: {
              used: mode.useBedMetric,
              score: componentScoreFromDelta(
                bedDelta,
                Math.max(mergedRules.bedTolerance, 1),
              ),
              missingDefault: 0.5,
            },
            baths: {
              used: mode.useBathMetric,
              score: componentScoreFromDelta(
                bathDelta,
                Math.max(mergedRules.bathTolerance, 0.5),
              ),
              missingDefault: 0.5,
            },
            form: {
              used: mode.useBuildingFormMetric,
              score: formMatchScore01,
              missingDefault: 0.5,
            },
            level: {
              used: mode.useLevelMetric,
              score: levelMatchScore01,
              missingDefault: 0.5,
            },
            condition: {
              used: mode.useConditionMetric,
              score: conditionMatchScore01,
              missingDefault: 0.5,
            },
          },
        });

        return {
          comp_listing_row_id: listing.id,
          comp_real_property_id: listing.real_property_id,
          distance_miles: roundNumber(distanceMiles),
          days_since_close: toIntegerOrNull(daysSinceClose),
          sqft_delta_pct:
            sqftDeltaPct === null ? null : roundNumber(sqftDeltaPct),
          lot_size_delta_pct:
            lotSizeDeltaPct === null ? null : roundNumber(lotSizeDeltaPct),
          year_built_delta: toIntegerOrNull(yearDelta),
          bed_delta: toIntegerOrNull(bedDelta),
          bath_delta: bathDelta === null ? null : roundNumber(bathDelta),
          form_match_score:
            formMatchScore01 === null
              ? null
              : roundNumber(formMatchScore01 * 100, 2),
          raw_score: scoreBreakdown.rawScore,
          selected_yn: false,
          score_breakdown_json: {
            purposeMode: mode.purpose,
            sizeBasis: mode.sizeBasis,
            requestedSnapshotMode,
            marketSnapshotDate: snapshotDates.snapshotReferenceDateIso,
            marketSnapshotDateSource: snapshotDates.snapshotDateSource,
            subjectPropertyType,
            subjectPropertyTypeFamily,
            allowedLevelClasses: allowedLevelClassesDisplay,
            totalWeight: scoreBreakdown.totalWeight,
            components: scoreBreakdown.breakdown,
          },
          metrics_json: {
            listing_id: listing.listing_id,
            address: property.unparsed_address,
            close_date: listing.close_date,
            close_price: closePrice,
            ppsf,
            building_area_total_sqft: candidateBuildingAreaTotalSqft,
            above_grade_finished_area_sqft: candidateAboveGradeFinishedSqft,
            below_grade_total_sqft: candidateBelowGradeTotalSqft,
            below_grade_finished_area_sqft: candidateBelowGradeFinishedSqft,
            lot_size_sqft: candidateLotSizeSqft,
            size_basis: mode.sizeBasis,
            size_basis_value:
              mode.sizeBasis === "lot_size"
                ? candidateLotSizeSqft
                : candidateSqft,
            bedrooms_total: candidateBeds,
            bathrooms_total: candidateBaths,
            garage_spaces: candidateGarageSpaces,
            year_built: candidateYearBuilt,
            property_type: candidatePropertyType,
            property_sub_type: normalizeText(physical.property_sub_type),
            structure_type: normalizeText(physical.structure_type),
            building_form_standardized: candidateBuildingForm,
            levels_raw: candidateLevelsRaw,
            level_class_standardized: candidateLevelClass,
            city: property.city,
            state: property.state,
            postal_code: property.postal_code,
            property_condition_source: candidateCondition,
            distance_miles: roundNumber(distanceMiles),
            days_since_close: toIntegerOrNull(daysSinceClose),
            sqft_delta_pct:
              sqftDeltaPct === null ? null : roundNumber(sqftDeltaPct),
            lot_size_delta_pct:
              lotSizeDeltaPct === null ? null : roundNumber(lotSizeDeltaPct),
            year_built_delta: toIntegerOrNull(yearDelta),
            bed_delta: toIntegerOrNull(bedDelta),
            bath_delta: bathDelta === null ? null : roundNumber(bathDelta),
            form_match_score:
              formMatchScore01 === null
                ? null
                : roundNumber(formMatchScore01 * 100, 2),
            level_match_score:
              levelMatchScore01 === null
                ? null
                : roundNumber(levelMatchScore01 * 100, 2),
            condition_match_score:
              conditionMatchScore01 === null
                ? null
                : roundNumber(conditionMatchScore01 * 100, 2),
          },
        };
      })
      .filter((row): row is NonNullable<typeof row> => Boolean(row))
      .sort((a, b) => (b.raw_score ?? 0) - (a.raw_score ?? 0))
      .slice(0, mergedRules.maxCandidates);

    const candidateRows = rankedCandidates.map((candidate) => ({
      comparable_search_run_id: insertedRun.id,
      comp_listing_row_id: candidate.comp_listing_row_id,
      comp_real_property_id: candidate.comp_real_property_id,
      distance_miles: candidate.distance_miles,
      days_since_close: candidate.days_since_close,
      sqft_delta_pct: candidate.sqft_delta_pct,
      lot_size_delta_pct: candidate.lot_size_delta_pct,
      year_built_delta: candidate.year_built_delta,
      bed_delta: candidate.bed_delta,
      bath_delta: candidate.bath_delta,
      form_match_score: candidate.form_match_score,
      raw_score: candidate.raw_score,
      selected_yn: candidate.selected_yn,
      score_breakdown_json: candidate.score_breakdown_json,
      metrics_json: candidate.metrics_json,
    }));

    if (comparablesDebugEnabled) {
      console.log(
        "[comp-pull] candidate rows preview",
        JSON.stringify(
          {
            runId: insertedRun.id,
            snapshot: {
              requestedSnapshotMode,
              marketSnapshotDate: snapshotDates.snapshotReferenceDateIso,
              marketSnapshotDateSource: snapshotDates.snapshotDateSource,
              earliestCloseDateInclusive: snapshotDates.earliestCloseDateIso,
              latestCloseDateExclusive:
                snapshotDates.latestCloseDateExclusiveIso,
            },
            candidateCount: candidateRows.length,
            preview: candidateRows.slice(0, 5),
          },
          null,
          2,
        ),
      );
    }

    const invalidIntegerCandidateRows: Array<{
      index: number;
      issues: string[];
      row: (typeof candidateRows)[number];
    }> = [];

    for (const [index, row] of candidateRows.entries()) {
      const issues: string[] = [];

      if (
        row.days_since_close !== null &&
        !Number.isInteger(row.days_since_close)
      ) {
        issues.push(`days_since_close=${row.days_since_close}`);
      }

      if (
        row.year_built_delta !== null &&
        !Number.isInteger(row.year_built_delta)
      ) {
        issues.push(`year_built_delta=${row.year_built_delta}`);
      }

      if (row.bed_delta !== null && !Number.isInteger(row.bed_delta)) {
        issues.push(`bed_delta=${row.bed_delta}`);
      }

      if (issues.length > 0) {
        invalidIntegerCandidateRows.push({ index, issues, row });
      }
    }

    if (invalidIntegerCandidateRows.length > 0) {
      console.error(
        "[comp-pull] invalid integer candidate rows",
        JSON.stringify(
          {
            runId: insertedRun.id,
            invalidIntegerCandidateRows,
          },
          null,
          2,
        ),
      );
    }

    if (candidateRows.length > 0) {
      const { error: candidateInsertError } = await supabase
        .from("comparable_search_candidates")
        .insert(candidateRows);

      if (candidateInsertError) {
        console.error(
          "[comp-pull] candidate insert failed",
          JSON.stringify(
            {
              analysisId: input.analysisId,
              runId: insertedRun.id,
              candidateCount: candidateRows.length,
              preview: candidateRows.slice(0, 3),
              error: candidateInsertError,
            },
            null,
            2,
          ),
        );

        throw new Error(candidateInsertError.message);
      }
    }

    const completeSummary = {
      ...initialSummary,
      candidateCount: rankedCandidates.length,
      effectiveRules: {
        ...mergedRules,
        requestedPurpose: parseComparablePurpose(input.purpose),
        resolvedPurpose,
        requestedSnapshotMode,
        customSnapshotDate: normalizeText(input.customSnapshotDate),
        allowedLevelClasses: allowedLevelClassesDisplay,
        sizeBasis: mode.sizeBasis,
        requireSamePropertyType: mode.requireSamePropertyType,
        requireSameBuildingForm: mode.requireSameBuildingForm,
        requireSameLevelClass:
          allowedLevelClassesNormalized.length === 0 &&
          mode.requireSameLevelClass,
      },
    };

    const { error: completeRunError } = await supabase
      .from("comparable_search_runs")
      .update({
        status: "complete",
        summary_json: completeSummary,
      })
      .eq("id", insertedRun.id);

    if (completeRunError) {
      throw new Error(completeRunError.message);
    }

    return {
      runId: insertedRun.id,
      candidateCount: rankedCandidates.length,
    };
  } catch (error) {
    const failureMessage =
      error instanceof Error ? error.message : "Comparable search failed.";

    const failedSummary = {
      ...initialSummary,
      errorMessage: failureMessage,
    };

    const { error: failedRunError } = await supabase
      .from("comparable_search_runs")
      .update({
        status: "failed",
        summary_json: failedSummary,
      })
      .eq("id", insertedRun.id);

    if (failedRunError && comparablesDebugEnabled) {
      console.error(
        "[comp-pull] failed to mark run failed",
        JSON.stringify(
          {
            runId: insertedRun.id,
            failedRunError,
          },
          null,
          2,
        ),
      );
    }

    throw error;
  }
}

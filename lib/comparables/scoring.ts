// ---------------------------------------------------------------------------
// Shared Comparable Scoring Functions
//
// Pure functions extracted from engine.ts so that both the analysis
// comparables engine and the screening bulk runner can share them.
// No database dependencies — all functions operate on in-memory data.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SizeBasis = "building_area_total" | "lot_size";
export type ComparablePurpose = "standard" | "rental" | "flip" | "scrape";
export type SnapshotMode = "auto" | "current" | "custom";
export type SnapshotDateSource =
  | "listing_contract_date"
  | "current_date_fallback"
  | "current_override"
  | "custom_override";

export type PropertyTypeFamily =
  | "detached"
  | "condo"
  | "townhome"
  | "manufactured"
  | "multifamily"
  | "new_home_community"
  | "other";

export type ScoreWeights = {
  distance: number;
  recency: number;
  size: number;
  lotSize: number;
  year: number;
  beds: number;
  baths: number;
  form: number;
  level: number;
  condition: number;
};

export type ScoreComponent = {
  used: boolean;
  score: number | null;
  missingDefault?: number;
};

export type ComparableMode = {
  purpose: ComparablePurpose;
  subjectFamily: PropertyTypeFamily;
  sizeBasis: SizeBasis;
  useSqftMetric: boolean;
  useLotSizeMetric: boolean;
  useYearMetric: boolean;
  useBedMetric: boolean;
  useBathMetric: boolean;
  useBuildingFormMetric: boolean;
  useLevelMetric: boolean;
  useConditionMetric: boolean;
  requireSamePropertyType: boolean;
  requireSameBuildingForm: boolean;
  requireSameLevelClass: boolean;
  weights: ScoreWeights;
};

export type ComparableSearchRules = {
  maxDistanceMiles: number;
  maxDaysSinceClose: number;
  sqftTolerancePct: number;
  lotSizeTolerancePct: number;
  yearToleranceYears: number;
  bedTolerance: number;
  bathTolerance: number;
  maxCandidates: number;
  requireSamePropertyType: boolean;
  requireSameLevelClass: boolean;
  requireSameBuildingForm: boolean;
  preferredSizeBasis: SizeBasis | null;
};

export type ScoreBreakdownEntry = {
  used: boolean;
  weight: number;
  score: number | null;
  rawScore: number | null;
};

export type WeightedScoreResult = {
  rawScore: number;
  totalWeight: number;
  breakdown: Record<keyof ScoreWeights, ScoreBreakdownEntry>;
};

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

export function normalizedKey(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.toLowerCase() : null;
}

export function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function firstNonNull<T>(
  ...values: Array<T | null | undefined>
): T | null {
  for (const value of values) {
    if (value !== null && value !== undefined) return value;
  }
  return null;
}

export function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function roundNumber(value: number, digits = 4): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

// ---------------------------------------------------------------------------
// Size helpers
// ---------------------------------------------------------------------------

export function sizeSqftFromPhysical(physical: {
  building_area_total_sqft?: unknown;
  above_grade_finished_area_sqft?: unknown;
}): number | null {
  return firstNonNull(
    toNumber(physical.building_area_total_sqft),
    toNumber(physical.above_grade_finished_area_sqft),
  );
}

export function lotSizeSqftFromProperty(input: {
  lot_size_sqft?: unknown;
  lot_size_acres?: unknown;
}): number | null {
  const sqft = toNumber(input.lot_size_sqft);
  if (sqft !== null) return sqft;
  const acres = toNumber(input.lot_size_acres);
  return acres !== null ? acres * 43560 : null;
}

// ---------------------------------------------------------------------------
// Geographic distance
// ---------------------------------------------------------------------------

export function haversineMiles(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
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

// ---------------------------------------------------------------------------
// Delta / tolerance helpers
// ---------------------------------------------------------------------------

export function pctDelta(
  subject: number,
  candidate: number,
): number | null {
  if (subject === 0) return null;
  return (Math.abs(candidate - subject) / subject) * 100;
}

export function componentScoreFromDelta(
  delta: number | null,
  tolerance: number,
): number | null {
  if (delta === null) return null;
  if (tolerance <= 0) return delta === 0 ? 1 : 0;
  return clamp01(1 - delta / tolerance);
}

// ---------------------------------------------------------------------------
// Match score helpers
// ---------------------------------------------------------------------------

export function computeFormMatchScore(
  subjectForm: string | null,
  candidateForm: string | null,
): number | null {
  const subject = normalizedKey(subjectForm);
  const candidate = normalizedKey(candidateForm);
  if (!subject && !candidate) return null;
  if (!subject || !candidate) return 0.45;
  return subject === candidate ? 1 : 0;
}

export function computeLevelMatchScore(input: {
  subjectLevelClass: string | null;
  candidateLevelClass: string | null;
  subjectLevelsRaw: string | null;
  candidateLevelsRaw: string | null;
  allowedLevelClassesNormalized: string[];
}): number | null {
  const subjectRaw = normalizedKey(input.subjectLevelsRaw);
  const candidateRaw = normalizedKey(input.candidateLevelsRaw);
  const subjectClass = normalizedKey(input.subjectLevelClass);
  const candidateClass = normalizedKey(input.candidateLevelClass);

  if (!subjectRaw && !candidateRaw && !subjectClass && !candidateClass) {
    return null;
  }
  if (subjectRaw && candidateRaw && subjectRaw === candidateRaw) return 1;
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
  if (!subjectClass || !candidateClass) return 0.45;
  return 0;
}

export function computeConditionMatchScore(
  subjectCondition: string | null,
  candidateCondition: string | null,
): number | null {
  const subject = normalizedKey(subjectCondition);
  const candidate = normalizedKey(candidateCondition);
  if (!subject && !candidate) return null;
  if (!subject || !candidate) return 0.45;
  return subject === candidate ? 1 : 0.3;
}

// ---------------------------------------------------------------------------
// Property type family resolution
// ---------------------------------------------------------------------------

export function resolvePropertyTypeFamily(
  value: string | null,
): PropertyTypeFamily {
  const normalized = normalizedKey(value);
  switch (normalized) {
    case "detached":
      return "detached";
    case "condo":
      return "condo";
    case "townhome":
      return "townhome";
    case "manufactured":
      return "manufactured";
    case "multi-family":
      return "multifamily";
    case "new home community":
      return "new_home_community";
    default:
      return "other";
  }
}

// ---------------------------------------------------------------------------
// Mode resolution (purpose → weights + metric flags)
// ---------------------------------------------------------------------------

export function resolveComparableMode(input: {
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
    rules.preferredSizeBasis ??
    (isScrape ? "lot_size" : "building_area_total");

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

  // standard / rental
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

// ---------------------------------------------------------------------------
// Weighted score assembly
// ---------------------------------------------------------------------------

export function buildWeightedScore(input: {
  weights: ScoreWeights;
  components: Record<keyof ScoreWeights, ScoreComponent>;
}): WeightedScoreResult {
  let totalWeight = 0;
  let weightedScoreTotal = 0;

  const breakdown: Record<keyof ScoreWeights, ScoreBreakdownEntry> = {
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
        component.score === null
          ? null
          : roundNumber(component.score * 100, 2),
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

// ---------------------------------------------------------------------------
// Level class normalization
// ---------------------------------------------------------------------------

export function normalizeAllowedLevelClasses(
  values: string[] | null | undefined,
): string[] {
  return Array.from(
    new Set(
      (values ?? [])
        .map((value) => normalizedKey(value))
        .filter((value): value is string => Boolean(value)),
    ),
  );
}

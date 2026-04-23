// ---------------------------------------------------------------------------
// Strategy profile definitions for fix-and-flip screening
//
// A strategy profile bundles ALL configurable assumptions for a strategy type
// into one place. Engine modules receive profile parameters as input — they
// contain no hardcoded constants. To adjust behaviour, edit the profile.
// ---------------------------------------------------------------------------

import type { PropertyTypeKey, RehabScopeTier, CategoryScopeTier } from "./types";

// ---------------------------------------------------------------------------
// ARV configuration
// ---------------------------------------------------------------------------

export type ArvBlendConfig = {
  /** Weight for building-total-based ARV (must sum to 1 with aboveGradeWeight). */
  buildingTotalWeight: number;
  /** Weight for above-grade-based ARV. */
  aboveGradeWeight: number;
  /** Dampening factor for building-total size adjustment (0–1). */
  buildingDampening: number;
  /** Dampening factor for above-grade size adjustment (0–1). */
  aboveGradeDampening: number;
};

export type ConfidenceTier = {
  maxDistanceMiles: number;
  confidence: number;
};

export type ArvConfig = {
  /** Annual market adjustment rate applied per-comp (e.g. -0.05 = -5%/year). */
  timeAdjustmentAnnualRate: number;
  /** Distance-based confidence tiers per property type, ordered ascending by maxDistanceMiles. */
  confidenceTiersByType: Record<PropertyTypeKey, ConfidenceTier[]>;
  /** ARV blending weights per property type. */
  blendByPropertyType: Record<PropertyTypeKey, ArvBlendConfig>;
};

// ---------------------------------------------------------------------------
// Rehab configuration
// ---------------------------------------------------------------------------

export type RehabRates = {
  aboveGradeInteriorPerSqft: number;
  belowGradeFinishedPerSqft: number;
  belowGradeUnfinishedPerSqft: number;
  /** Per-sqft exterior cost based on above-grade sqft. 0 for condos. */
  exteriorPerAboveSqft: number;
  /** Per-sqft landscaping cost based on above-grade sqft. 0 for condos. */
  landscapingPerAboveSqft: number;
  /** Systems cost. If flatAmount is set, use that. Otherwise use perBuildingSqft. */
  systems: { flatAmount: number } | { perBuildingSqft: number };
};

export type MultiplierBreakpoint = {
  /** Upper bound (inclusive) for "less than or equal" tiers, or lower bound for "greater than or equal". */
  threshold: number;
  multiplier: number;
};

export type RehabMultiplierConfig = {
  /** Property type multipliers. */
  type: Record<PropertyTypeKey, number>;
  /** MLS condition multipliers. Keys are lowercase condition strings. */
  condition: Record<string, number>;
  /** Default condition multiplier when condition is null or unrecognized. */
  conditionDefault: number;
  /**
   * Price multiplier tiers. Evaluated top-to-bottom:
   * first matching tier wins. Use `maxPrice` for ≤ tiers, `minPrice` for ≥ tiers.
   */
  priceTiers: Array<{ maxPrice?: number; minPrice?: number; multiplier: number }>;
  /** Default price multiplier when no tier matches. */
  priceDefault: number;
  /**
   * Age multiplier tiers. Evaluated top-to-bottom.
   * Use `beforeYear` for < tiers, `afterYear` for > tiers.
   */
  ageTiers: Array<{ beforeYear?: number; afterYear?: number; multiplier: number }>;
  /** Default age multiplier when no tier matches. */
  ageDefault: number;
};

export type RehabConfig = {
  ratesByPropertyType: Record<PropertyTypeKey, RehabRates>;
  multipliers: RehabMultiplierConfig;
  /** Scope tier multipliers applied on top of composite multiplier (legacy global). */
  scopeMultipliers: Record<RehabScopeTier, number>;
  /** Per-category scope tier multipliers (none/light/moderate/heavy/gut). */
  categoryScopeMultipliers: Record<CategoryScopeTier, number>;
};

// ---------------------------------------------------------------------------
// Holding configuration
// ---------------------------------------------------------------------------

export type HoldingConfig = {
  /** Base days for the holding period formula. */
  baseDays: number;
  /** Baseline sqft for the adjustment formula. */
  sqftBaseline: number;
  /** Days adjustment per sqft above/below baseline. */
  sqftAdjustmentRate: number;
  /** Floor for calculated days held. */
  minimumDays: number;
  /** Annual insurance rate as a fraction of list price (e.g. 0.0055 = 0.55%). */
  insuranceAnnualRate: number;
  /** Monthly utility cost per sqft of building area. */
  utilityPerSqftMonthly: number;
};

// ---------------------------------------------------------------------------
// Transaction configuration
// ---------------------------------------------------------------------------

/** Title/closing matrix identifier. Drives which rate sheet the
 *  transaction engine consults for Owner's Title Premium (disposition)
 *  and Bundled Concurrent Loan Rate (acquisition).
 *
 *  "fitco_ct_zone1" — FITCO/Chicago Title, Colorado CT Zone 1 counties
 *  (Adams, Arapahoe, Broomfield, Clear Creek, Denver, Douglas, Elbert,
 *  Gilpin, Jefferson). See lib/screening/title-matrix.ts. */
export type TitleMatrixKey = "fitco_ct_zone1";

export type TransactionConfig = {
  /** Rate sheet used for title/closing matrix lookups. */
  titleMatrix: TitleMatrixKey;

  // ── Acquisition side ──
  // Bundled Concurrent Loan Rate comes from the matrix (keyed by loan
  // amount from the financing engine). The fees below are fixed-dollar
  // add-ons that stack on top of the matrix lookup.
  /** Buyer's share of Bundled Resale Closing Fee (50% of $360 = $180). */
  acquisitionBundledClosingFee: number;
  /** Disbursement of Loan Only Fee ($150). */
  acquisitionLoanDisbursementFee: number;
  /** Estimated Recording Costs ($43 per document). */
  acquisitionRecordingCosts: number;
  /** Closing Protection Letter Fee ($25). */
  acquisitionClosingProtectionLetter: number;
  /** E-recording fee ($5.25 per document). */
  acquisitionERecordingFee: number;
  /** Signed acquisition commission as fraction of purchase price.
   *  Positive = OOP at closing; negative = credit at closing. Default 0. */
  acquisitionCommissionRate: number;
  /** Flat acquisition fee in dollars (e.g. wholesale assignment). Default 0. */
  acquisitionFeeFlat: number;

  // ── Disposition side ──
  // Owner's Title Premium Basic Rate comes from the matrix (keyed by ARV).
  // Seller pays a configurable share of it; remaining fees are fixed.
  /** Seller's share of Owner's Title Premium Basic Rate (e.g. 0.65). */
  dispositionOwnerTitlePremiumShare: number;
  /** Seller's share of Bundled Resale Closing Fee (50% of $360 = $180). */
  dispositionBundledClosingFee: number;
  /** Owner's Extended Coverage ($95). */
  dispositionOwnerExtendedCoverage: number;
  /** Tax Certificate ($25). */
  dispositionTaxCertificate: number;
  /** Disposition buyer-agent commission as fraction of sale price. */
  dispositionCommissionBuyerRate: number;
  /** Disposition seller-agent commission as fraction of sale price. */
  dispositionCommissionSellerRate: number;
};

// ---------------------------------------------------------------------------
// Financing configuration
// ---------------------------------------------------------------------------

export type FinancingConfig = {
  /** Whether financing costs are included in the deal model. */
  enabled: boolean;
  /** Annual interest rate as a decimal (e.g. 0.11 = 11%). */
  annualRate: number;
  /** Origination/points fee as a fraction of loan amount (e.g. 0.01 = 1 point). */
  originationPointsRate: number;
  /** Loan-to-value ratio based on ARV (e.g. 0.80 = 80% LTV). */
  ltvPct: number;
  /** Down payment as a fraction of purchase price (e.g. 0.20 = 20%). */
  downPaymentRate: number;
};

// ---------------------------------------------------------------------------
// Market trend configuration
// ---------------------------------------------------------------------------

export type TrendConfig = {
  /** Local neighbourhood radius in miles. */
  localRadiusMiles: number;
  /** Broader metro radius in miles. */
  metroRadiusMiles: number;
  /** Rolling window length in months. */
  windowMonths: number;
  /** Blend weight for the local tier (local + metro must sum to 1). */
  localWeight: number;
  /** Blend weight for the metro tier. */
  metroWeight: number;
  /** Minimum comps required before falling back to fixed rate. */
  minComps: number;
  /** Low-confidence threshold — comps below this but ≥ minComps are flagged. */
  lowConfidenceThreshold: number;
  /** Asymmetric floor for the blended annual rate (e.g. -0.20). */
  clampMin: number;
  /** Asymmetric ceiling for the blended annual rate (e.g. +0.12). Sanity bound
   *  only — the defensibility guardrail is `positiveRateCap` below. */
  clampMax: number;
  /**
   * Defensibility cap applied to positive blended rates AFTER the symmetric
   * clamp. Thin-volume regression can produce +10–20% annual signals that we
   * cannot support in print. Negative rates pass through unchanged.
   * `rawBlendedRate` on the result preserves the pre-cap market signal for
   * the audit trail.
   */
  positiveRateCap: number;
  /**
   * Fixed fallback rate per property type when comp count < minComps.
   * Condos historically behave differently from SFR/townhome stock, so
   * the fallback is typed rather than global.
   */
  fallbackRateByType: Record<PropertyTypeKey, number>;
  /** Subject sqft tolerance for similar-property matching (e.g. 0.20 = ±20%). */
  sqftTolerancePct: number;
  /** Subject year-built tolerance in years (e.g. 15 = ±15 years). */
  yearBuiltToleranceYears: number;
  /** Subject price tolerance for similar-property matching (e.g. 0.25 = ±25%). */
  priceTierTolerancePct: number;
  /** Percentile cutoff for low-end segment trend (e.g. 25). */
  lowEndPercentile: number;
  /** Percentile cutoff for high-end segment trend (e.g. 75). */
  highEndPercentile: number;
};

// ---------------------------------------------------------------------------
// Qualification configuration (Prime Candidates)
// ---------------------------------------------------------------------------

export type QualificationConfig = {
  /** Max comp distance to qualify as a "prime" comp, per property type. */
  maxCompDistanceMilesByType: Record<PropertyTypeKey, number>;
  /** Min est_gap ($/sqft) for a comp to be considered "prime". */
  minEstGapPerSqft: number;
  /** Max comp age in days. */
  maxCompAgeDays: number;
  /** Minimum number of qualifying comps to earn Prime Candidate status. */
  minQualifyingComps: number;
};

// ---------------------------------------------------------------------------
// Full strategy profile
// ---------------------------------------------------------------------------

export type FlipStrategyProfile = {
  slug: string;
  name: string;
  version: number;
  strategyType: "flip";
  /** Default target profit ($) when calculating max offer. */
  targetProfitDefault: number;
  /** Which comparable_profiles.slug to use per property type for comp search. */
  compProfileSlugByType: Record<PropertyTypeKey, string>;
  arv: ArvConfig;
  trend: TrendConfig;
  rehab: RehabConfig;
  holding: HoldingConfig;
  transaction: TransactionConfig;
  financing: FinancingConfig;
  qualification: QualificationConfig;
};

// ---------------------------------------------------------------------------
// DENVER FLIP V1 — default profile with legacy Access values
// ---------------------------------------------------------------------------

export const DENVER_FLIP_V1: FlipStrategyProfile = {
  slug: "denver_flip_v1",
  name: "Denver Fix-and-Flip v1",
  version: 1,
  strategyType: "flip",
  targetProfitDefault: 40_000,

  compProfileSlugByType: {
    detached: "denver_detached_standard_v1",
    condo: "denver_condo_standard_v1",
    townhome: "denver_townhome_standard_v1",
  },

  // -- ARV ------------------------------------------------------------------
  arv: {
    timeAdjustmentAnnualRate: -0.05,
    confidenceTiersByType: {
      detached: [
        { maxDistanceMiles: 0.3, confidence: 1.0 },
        { maxDistanceMiles: 0.5, confidence: 0.8 },
        { maxDistanceMiles: 0.6, confidence: 0.6 },
        { maxDistanceMiles: 0.75, confidence: 0.4 },
        { maxDistanceMiles: Infinity, confidence: 0.2 },
      ],
      townhome: [
        { maxDistanceMiles: 0.2, confidence: 1.0 },
        { maxDistanceMiles: 0.35, confidence: 0.8 },
        { maxDistanceMiles: 0.5, confidence: 0.6 },
        { maxDistanceMiles: 0.6, confidence: 0.4 },
        { maxDistanceMiles: Infinity, confidence: 0.2 },
      ],
      condo: [
        { maxDistanceMiles: 0.02, confidence: 1.0 },
        { maxDistanceMiles: 0.05, confidence: 0.8 },
        { maxDistanceMiles: 0.08, confidence: 0.6 },
        { maxDistanceMiles: 0.1, confidence: 0.4 },
        { maxDistanceMiles: Infinity, confidence: 0.2 },
      ],
    },
    blendByPropertyType: {
      detached: {
        buildingTotalWeight: 0.4,
        aboveGradeWeight: 0.6,
        buildingDampening: 0.3,
        aboveGradeDampening: 0.4,
      },
      condo: {
        buildingTotalWeight: 0.15,
        aboveGradeWeight: 0.85,
        buildingDampening: 0.2,
        aboveGradeDampening: 0.45,
      },
      townhome: {
        buildingTotalWeight: 0.35,
        aboveGradeWeight: 0.65,
        buildingDampening: 0.3,
        aboveGradeDampening: 0.4,
      },
    },
  },

  // -- Market Trend ----------------------------------------------------------
  trend: {
    localRadiusMiles: 0.75,
    metroRadiusMiles: 12,
    windowMonths: 12,
    localWeight: 0.1,
    metroWeight: 0.9,
    minComps: 8,
    lowConfidenceThreshold: 15,
    clampMin: -0.20,
    clampMax: 0.12,
    positiveRateCap: 0.02,
    fallbackRateByType: {
      detached: -0.05,
      townhome: -0.05,
      condo: -0.10,
    },
    sqftTolerancePct: 0.20,
    yearBuiltToleranceYears: 15,
    priceTierTolerancePct: 0.25,
    lowEndPercentile: 25,
    highEndPercentile: 75,
  },

  // -- Rehab ----------------------------------------------------------------
  rehab: {
    ratesByPropertyType: {
      detached: {
        aboveGradeInteriorPerSqft: 35,
        belowGradeFinishedPerSqft: 39,
        belowGradeUnfinishedPerSqft: 49,
        exteriorPerAboveSqft: 4.4,
        landscapingPerAboveSqft: 2.7,
        systems: { perBuildingSqft: 1.7 },
      },
      condo: {
        aboveGradeInteriorPerSqft: 35,
        belowGradeFinishedPerSqft: 39,
        belowGradeUnfinishedPerSqft: 49,
        exteriorPerAboveSqft: 0,
        landscapingPerAboveSqft: 0,
        systems: { flatAmount: 1_500 },
      },
      townhome: {
        aboveGradeInteriorPerSqft: 35,
        belowGradeFinishedPerSqft: 39,
        belowGradeUnfinishedPerSqft: 49,
        exteriorPerAboveSqft: 3.3,
        landscapingPerAboveSqft: 1.5,
        systems: { flatAmount: 3_000 },
      },
    },
    multipliers: {
      type: { detached: 1.0, condo: 0.85, townhome: 0.95 },
      condition: {
        fixer: 1.15,
        "fixer, incomplete": 1.15,
        new_construction: 0,
        "new construction": 0,
      },
      conditionDefault: 1.0,
      // Evaluated top-to-bottom; first match wins.
      // Fixed the legacy Access bug where ≥900k was unreachable.
      priceTiers: [
        { maxPrice: 300_000, multiplier: 0.85 },
        { maxPrice: 400_000, multiplier: 0.9 },
        { maxPrice: 500_000, multiplier: 0.95 },
        { minPrice: 900_000, multiplier: 1.2 },
        { minPrice: 700_000, multiplier: 1.1 },
      ],
      priceDefault: 1.0,
      ageTiers: [
        { beforeYear: 1930, multiplier: 1.25 },
        { beforeYear: 1950, multiplier: 1.15 },
        { afterYear: 2019, multiplier: 0.2 },
        { afterYear: 2010, multiplier: 0.4 },
        { afterYear: 2005, multiplier: 0.75 },
      ],
      ageDefault: 1.0,
    },
    scopeMultipliers: {
      cosmetic: 0.6,
      moderate: 1.0,
      heavy: 1.4,
      gut: 2.0,
    },
    categoryScopeMultipliers: {
      none: 0,
      light: 0.5,
      moderate: 1.0,
      heavy: 1.5,
      gut: 2.0,
    },
  },

  // -- Holding --------------------------------------------------------------
  holding: {
    baseDays: 190,
    sqftBaseline: 2_500,
    sqftAdjustmentRate: 0.085,
    minimumDays: 67,
    insuranceAnnualRate: 0.0055,
    utilityPerSqftMonthly: 0.08,
  },

  // -- Transaction (FITCO/Chicago Title matrix — 2026-04-22) --------------
  // Acquisition title comes from the Bundled Concurrent Loan Rate matrix
  // (keyed by loan amount) plus the fixed-dollar add-ons below.
  // Disposition title is 65% of the Owner's Title Premium Basic Rate
  // (keyed by ARV) plus the fixed-dollar add-ons below.
  // See lib/screening/title-matrix.ts for the published rate sheets.
  transaction: {
    titleMatrix: "fitco_ct_zone1",
    acquisitionBundledClosingFee:       180,    // 50% of $360
    acquisitionLoanDisbursementFee:     150,
    acquisitionRecordingCosts:          43,
    acquisitionClosingProtectionLetter: 25,
    acquisitionERecordingFee:           5.25,
    acquisitionCommissionRate:          0,      // default 0
    acquisitionFeeFlat:                 0,      // default $0
    dispositionOwnerTitlePremiumShare:  0.65,   // seller pays 65% of Basic Rate
    dispositionBundledClosingFee:       180,    // 50% of $360
    dispositionOwnerExtendedCoverage:   95,
    dispositionTaxCertificate:          25,
    dispositionCommissionBuyerRate:     0.02,
    dispositionCommissionSellerRate:    0.02,
  },

  // -- Financing ------------------------------------------------------------
  financing: {
    enabled: true,
    annualRate: 0.11,           // 11% hard money rate
    originationPointsRate: 0.01, // 1 point origination fee
    ltvPct: 0.80,               // 80% of ARV
    downPaymentRate: 0.20,      // 20% of purchase price
  },

  // -- Qualification (Prime Candidates) -------------------------------------
  qualification: {
    maxCompDistanceMilesByType: {
      detached: 0.4,
      townhome: 0.4,
      condo: 0.08,
    },
    minEstGapPerSqft: 60,
    maxCompAgeDays: 213, // ~7 months
    minQualifyingComps: 2,
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Resolve a property_type string from the database to a PropertyTypeKey. */
export function resolvePropertyTypeKey(
  propertyType: string | null | undefined,
): PropertyTypeKey {
  if (!propertyType) return "detached";
  const lower = propertyType.toLowerCase();
  if (lower.includes("condo") || lower.includes("condominium")) return "condo";
  if (lower.includes("townho") || lower.includes("town ho")) return "townhome";
  return "detached";
}

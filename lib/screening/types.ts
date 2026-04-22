// ---------------------------------------------------------------------------
// Shared types for the fix-and-flip screening pipeline
// ---------------------------------------------------------------------------

/** Canonical property-type key used to look up strategy-profile parameters. */
export type PropertyTypeKey = "detached" | "condo" | "townhome";

/** Rehab scope tiers — analyst-selectable renovation depth (legacy global). */
export type RehabScopeTier = "cosmetic" | "moderate" | "heavy" | "gut";

/** Per-category rehab scope tiers — finer-grained control per line item. */
export type CategoryScopeTier = "none" | "light" | "moderate" | "heavy" | "gut";

/** Rehab category keys matching the line-item breakdown. */
export type RehabCategoryKey =
  | "aboveGrade"
  | "belowGradeFinished"
  | "belowGradeUnfinished"
  | "exterior"
  | "landscaping"
  | "systems";

/**
 * Per-category scope value: a preset tier name, or { custom: number } for
 * a manual multiplier override.
 */
export type CategoryScopeValue = CategoryScopeTier | { cost: number };

/** Map of per-category scope overrides. Missing keys default to "moderate". */
export type RehabCategoryScopes = Partial<Record<RehabCategoryKey, CategoryScopeValue>>;

// ---------------------------------------------------------------------------
// ARV — Analyst adjustments
// ---------------------------------------------------------------------------

/** Per-comp manual dollar adjustments entered by the analyst. */
export type CompAnalystAdjustments = {
  view_location: number;
  layout: number;
  lot_size: number;
  garage: number;
  condition: number;
  other: number;
  other_note?: string;
};

export const ANALYST_ADJ_CATEGORIES = [
  { key: "view_location" as const, label: "View / Location" },
  { key: "layout" as const, label: "Layout / Floor Plan" },
  { key: "lot_size" as const, label: "Lot Size / Yard" },
  { key: "garage" as const, label: "Garage / Parking" },
  { key: "condition" as const, label: "Condition / Updates" },
  { key: "other" as const, label: "Other" },
] as const;

export type AnalystAdjCategoryKey = (typeof ANALYST_ADJ_CATEGORIES)[number]["key"];

export function emptyAdjustments(): CompAnalystAdjustments {
  return { view_location: 0, layout: 0, lot_size: 0, garage: 0, condition: 0, other: 0 };
}

export function sumAdjustments(adj: CompAnalystAdjustments | null | undefined): number {
  if (!adj) return 0;
  return (adj.view_location || 0) + (adj.layout || 0) + (adj.lot_size || 0) +
    (adj.garage || 0) + (adj.condition || 0) + (adj.other || 0);
}

// ---------------------------------------------------------------------------
// ARV
// ---------------------------------------------------------------------------

/** Input describing a single comparable sale for ARV calculation. */
export type CompArvInput = {
  compListingRowId: string;
  compRealPropertyId: string;
  listingId: string;
  address: string;
  netSalePrice: number;
  closeDateIso: string;
  compBuildingSqft: number;
  compAboveGradeSqft: number;
  distanceMiles: number;
  yearBuilt: number | null;
  bedroomsTotal: number | null;
  bathroomsTotal: number | null;
  propertyType: string | null;
  levelClass: string | null;
  mlsStatus: string | null;
  /** Per-comp analyst adjustments (null during screening, populated during deep analysis). */
  analystAdjustments?: CompAnalystAdjustments | null;
};

/** Per-comp ARV adjustment detail, stored for transparency / drill-in. */
export type CompArvDetail = {
  compListingRowId: string;
  compRealPropertyId: string;
  listingId: string;
  address: string;
  netSalePrice: number;
  closeDateIso: string;
  daysSinceClose: number;
  distanceMiles: number;
  compBuildingSqft: number;
  compAboveGradeSqft: number;
  psfBuilding: number;
  psfAboveGrade: number;
  arvBuilding: number;
  arvAboveGrade: number;
  arvBlended: number;
  timeAdjustment: number;
  arvTimeAdjusted: number;
  /** Per-comp analyst adjustments (null = not entered). */
  analystAdjustments: CompAnalystAdjustments | null;
  /** Sum of analyst adjustments (0 if null/empty). */
  analystAdjustmentTotal: number;
  /** Final adjusted ARV: arvTimeAdjusted + analystAdjustmentTotal. */
  arvFinal: number;
  confidence: number;
  decayWeight: number;
};

/** Aggregated ARV result for a subject property. */
export type ArvResult = {
  arvAggregate: number;
  arvPerSqft: number;
  compCount: number;
  perCompDetails: CompArvDetail[];
};

// ---------------------------------------------------------------------------
// Rehab
// ---------------------------------------------------------------------------

export type RehabResult = {
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
};

// ---------------------------------------------------------------------------
// Holding
// ---------------------------------------------------------------------------

export type HoldingResult = {
  daysHeld: number;
  dailyTax: number;
  dailyInsurance: number;
  dailyHoa: number;
  dailyUtilities: number;
  dailyTotal: number;
  holdTax: number;
  holdInsurance: number;
  holdHoa: number;
  holdUtilities: number;
  total: number;
};

// ---------------------------------------------------------------------------
// Transaction
// ---------------------------------------------------------------------------

export type TransactionResult = {
  // ─── Acquisition side (paid out-of-pocket at closing) ───

  /** Acquisition title/closing fee. */
  acquisitionTitle: number;

  /**
   * NEW (Decision 5): Signed acquisition commission.
   * Positive = OOP at closing (analyst pays a fee, e.g. to a buyer's agent).
   * Negative = credit at closing (analyst receives a credit).
   * Default rate is 0, so this is 0 in normal flips.
   */
  acquisitionCommission: number;

  /**
   * NEW (Decision 5): Flat acquisition fee in dollars.
   * E.g. wholesale assignment fee, service fee. Always positive.
   * Default is $0, so this is 0 in normal flips.
   */
  acquisitionFee: number;

  /** NEW (Decision 5): Sum of acquisition-side line items. Cash impact at purchase. */
  acquisitionSubtotal: number;

  // ─── Disposition side (deducted from sale proceeds, not OOP) ───

  /** Disposition title/closing fee. */
  dispositionTitle: number;

  /**
   * NEW (Decision 5): Buyer-agent commission paid at sale.
   * Replaces the combined dispositionCommissions field.
   */
  dispositionCommissionBuyer: number;

  /**
   * NEW (Decision 5): Seller-agent commission paid at sale.
   * Replaces the combined dispositionCommissions field.
   */
  dispositionCommissionSeller: number;

  /** NEW (Decision 5): Sum of disposition-side line items. Deducted from sale proceeds. */
  dispositionSubtotal: number;

  // ─── Total ───

  /** Sum of all 6 line items (acquisitionSubtotal + dispositionSubtotal). */
  total: number;
};

// ---------------------------------------------------------------------------
// Financing
// ---------------------------------------------------------------------------

export type FinancingResult = {
  loanAmount: number;
  ltvPct: number;
  annualRate: number;
  pointsRate: number;
  daysHeld: number;
  interestCost: number;
  originationCost: number;
  monthlyPayment: number;
  dailyInterest: number;
  total: number;
};

// ---------------------------------------------------------------------------
// Cash out of pocket
// ---------------------------------------------------------------------------

export type CashRequiredResult = {
  purchasePrice: number;
  downPaymentRate: number;
  downPayment: number;
  loanForPurchase: number;
  originationCost: number;
  loanAvailableForRehab: number;
  rehabTotal: number;
  rehabFromLoan: number;
  rehabOutOfPocket: number;
  acquisitionTitle: number;
  holdingTotal: number;
  interestCost: number;
  totalCashRequired: number;
};

// ---------------------------------------------------------------------------
// Deal math
// ---------------------------------------------------------------------------

export type DealMathResult = {
  arv: number;
  listPrice: number | null;
  rehabTotal: number;
  holdTotal: number;
  transactionTotal: number;
  financingTotal: number;
  targetProfit: number;
  totalCosts: number;
  maxOffer: number;
  /** null when no list price (off-market). */
  offerPct: number | null;
  /** Opportunity signal: ARV - listPrice. Null when no list price. */
  spread: number | null;
  /** Gap (List): (ARV - listPrice) / buildingSqft. Null when no list price. */
  gapListPerSqft: number | null;
  /** Gap (Offer): (ARV - maxOffer) / buildingSqft. Always computable when ARV > 0. */
  gapOfferPerSqft: number | null;
  /** @deprecated Use gapListPerSqft. Kept for DB backward compat during migration. */
  estGapPerSqft: number | null;
  /** Negotiation room: maxOffer - listPrice. Positive = max offer above list. Null when no list price. */
  negotiationGap: number | null;
};

// ---------------------------------------------------------------------------
// Qualification
// ---------------------------------------------------------------------------

export type QualificationResult = {
  isPrimeCandidate: boolean;
  qualifyingCompCount: number;
  reasons: string[];
  disqualifiers: string[];
};

// ---------------------------------------------------------------------------
// Market trend
// ---------------------------------------------------------------------------

/** Segment trend with comp count. */
export type TrendSegment = {
  rate: number | null;
  compCount: number;
};

/** Statistics for a set of comps used in trend calculation. */
export type TrendCompStats = {
  compCount: number;
  radiusMiles: number;
  salePriceLow: number | null;
  salePriceHigh: number | null;
  psfBuildingLow: number | null;
  psfBuildingHigh: number | null;
  psfAboveGradeLow: number | null;
  psfAboveGradeHigh: number | null;
  /** Bottom-quartile segment trend for this tier. */
  lowEnd: TrendSegment;
  /** Top-quartile segment trend for this tier. */
  highEnd: TrendSegment;
};

/** Trend direction category derived from the blended rate. */
export type TrendDirection =
  | "strong_appreciation"
  | "appreciating"
  | "flat"
  | "softening"
  | "declining"
  | "sharp_decline";

/** Full trend calculation result for a single subject property. */
export type TrendResult = {
  /** Blended annual rate actually applied (clamped + positive-cap enforced). */
  blendedAnnualRate: number;
  /** Pre-cap blended rate — the market signal before the positive-rate
   *  defensibility guardrail. Equals blendedAnnualRate when no cap applied. */
  rawBlendedRate: number;
  /** The positive-rate cap value in effect when this was computed. */
  positiveRateCap: number;
  /** True when rawBlendedRate exceeded positiveRateCap and was capped. */
  positiveRateCapApplied: boolean;
  /** Unclamped local-tier rate (null if insufficient comps). */
  rawLocalRate: number | null;
  /** Unclamped metro-tier rate (null if insufficient comps). */
  rawMetroRate: number | null;
  /** Stats for the local comp pool. */
  localStats: TrendCompStats;
  /** Stats for the metro comp pool. */
  metroStats: TrendCompStats;
  /** Rolling window length used. */
  windowMonths: number;
  /** Bottom-quartile segment trend (acquisition signal). Combined from best pool. */
  lowEndTrendRate: number | null;
  /** Top-quartile segment trend (ARV signal). Combined from best pool. */
  highEndTrendRate: number | null;
  /** Trend direction category. */
  direction: TrendDirection;
  /** True if fixed fallback rate was used. */
  isFallback: boolean;
  /** Confidence assessment. */
  confidenceLevel: "high" | "low" | "fallback";
  /** Plain-English explanation for the UI. */
  summary: string;
};

/** A closed sale record suitable for trend analysis. */
export type TrendSaleInput = {
  realPropertyId: string;
  latitude: number;
  longitude: number;
  netSalePrice: number;
  closeDateIso: string;
  buildingSqft: number;
  aboveGradeSqft: number;
  yearBuilt: number | null;
  propertyType: string | null;
};

// ---------------------------------------------------------------------------
// Screening result row (combines all engine outputs for one subject)
// ---------------------------------------------------------------------------

export type ScreeningResultRow = {
  realPropertyId: string;
  listingRowId: string | null;

  // Subject snapshot
  subjectAddress: string;
  subjectCity: string;
  subjectPropertyType: string | null;
  subjectListPrice: number | null;
  subjectBuildingSqft: number;
  subjectAboveGradeSqft: number;
  subjectYearBuilt: number | null;

  // Engine outputs
  trend: TrendResult | null;
  arv: ArvResult | null;
  rehab: RehabResult | null;
  holding: HoldingResult | null;
  transaction: TransactionResult | null;
  financing: FinancingResult | null;
  dealMath: DealMathResult | null;
  qualification: QualificationResult;

  // Status
  screeningStatus: "screened" | "error" | "skipped";
  errorMessage: string | null;
};

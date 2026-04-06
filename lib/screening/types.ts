// ---------------------------------------------------------------------------
// Shared types for the fix-and-flip screening pipeline
// ---------------------------------------------------------------------------

/** Canonical property-type key used to look up strategy-profile parameters. */
export type PropertyTypeKey = "detached" | "condo" | "townhome";

/** Rehab scope tiers — analyst-selectable renovation depth. */
export type RehabScopeTier = "cosmetic" | "moderate" | "heavy" | "gut";

// ---------------------------------------------------------------------------
// ARV
// ---------------------------------------------------------------------------

/** Input describing a single comparable sale for ARV calculation. */
export type CompArvInput = {
  compListingRowId: string;
  compRealPropertyId: string;
  listingId: string;
  address: string;
  closePrice: number;
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
};

/** Per-comp ARV adjustment detail, stored for transparency / drill-in. */
export type CompArvDetail = {
  compListingRowId: string;
  compRealPropertyId: string;
  listingId: string;
  address: string;
  closePrice: number;
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
  acquisitionTitle: number;
  dispositionTitle: number;
  dispositionCommissions: number;
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
  listPrice: number;
  rehabTotal: number;
  holdTotal: number;
  transactionTotal: number;
  financingTotal: number;
  targetProfit: number;
  totalCosts: number;
  maxOffer: number;
  offerPct: number;
  spread: number;
  estGapPerSqft: number;
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
  /** Blended annual rate actually applied (clamped). */
  blendedAnnualRate: number;
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
  closePrice: number;
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

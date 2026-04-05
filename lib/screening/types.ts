// ---------------------------------------------------------------------------
// Shared types for the fix-and-flip screening pipeline
// ---------------------------------------------------------------------------

/** Canonical property-type key used to look up strategy-profile parameters. */
export type PropertyTypeKey = "detached" | "condo" | "townhome";

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

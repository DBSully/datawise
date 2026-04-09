/**
 * Shared types for analysis workstation data and report snapshots.
 */

// ---------------------------------------------------------------------------
// Analysis sub-types (used by both workstation and reports)
// ---------------------------------------------------------------------------

export type RehabScopeTier = "cosmetic" | "moderate" | "heavy" | "gut";

export type CategoryScopeTier = "none" | "light" | "moderate" | "heavy" | "gut";

export type RehabCategoryKey =
  | "aboveGrade"
  | "belowGradeFinished"
  | "belowGradeUnfinished"
  | "exterior"
  | "landscaping"
  | "systems";

export type CategoryScopeValue = CategoryScopeTier | { cost: number };

export type RehabCategoryScopes = Partial<Record<RehabCategoryKey, CategoryScopeValue>>;

/** A user-defined custom rehab line item (e.g. Roof, Sewer, Structural). */
export type RehabCustomItem = {
  label: string;
  cost: number;
};

/** Per-category scope label + multiplier for display and reports. */
export type RehabCategoryScopeDetail = {
  tier: CategoryScopeTier | "custom";
  multiplier: number;
};

export type RehabDetail = {
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
  /** Per-category scope tiers and multipliers, when per-category scoping is active. */
  categoryScopes?: Record<RehabCategoryKey, RehabCategoryScopeDetail>;
};

export type HoldingDetail = {
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

export type TransactionDetail = {
  acquisitionTitle: number;
  dispositionTitle: number;
  dispositionCommissions: number;
  total: number;
};

export type FinancingDetail = {
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

export type ArvPerCompDetail = {
  address: string;
  closePrice: number;
  closeDateIso: string;
  daysSinceClose: number;
  distanceMiles: number;
  compBuildingSqft: number;
  psfBuilding: number;
  arvBlended: number;
  arvTimeAdjusted: number;
  confidence: number;
  decayWeight: number;
};

export type TrendTierSegment = { rate: number | null; compCount: number };

export type TrendTierStats = {
  compCount: number;
  radiusMiles: number;
  salePriceLow: number | null;
  salePriceHigh: number | null;
  psfBuildingLow: number | null;
  psfBuildingHigh: number | null;
  psfAboveGradeLow: number | null;
  psfAboveGradeHigh: number | null;
  lowEnd: TrendTierSegment;
  highEnd: TrendTierSegment;
};

export type TrendDirection =
  | "strong_appreciation"
  | "appreciating"
  | "flat"
  | "softening"
  | "declining"
  | "sharp_decline";

export type TrendData = {
  blendedAnnualRate: number;
  rawLocalRate: number | null;
  rawMetroRate: number | null;
  localCompCount: number;
  metroCompCount: number;
  localRadius: number;
  metroRadius: number;
  direction: TrendDirection;
  isFallback: boolean;
  confidence: "high" | "low" | "fallback";
  lowEndRate: number | null;
  highEndRate: number | null;
  summary: string | null;
  detailJson: {
    localStats?: TrendTierStats;
    metroStats?: TrendTierStats;
  } | null;
};

// ---------------------------------------------------------------------------
// WorkstationData — the full payload passed from server to client
// ---------------------------------------------------------------------------

export type WorkstationData = {
  propertyId: string;
  analysisId: string;
  analysis: {
    scenarioName: string | null;
    strategyType: string | null;
    status: string | null;
    analysisCompletedAt: string | null;
  };
  property: {
    address: string;
    city: string;
    county: string | null;
    state: string;
    postalCode: string | null;
    latitude: number | null;
    longitude: number | null;
  };
  trend: TrendData | null;
  physical: {
    propertyType: string | null;
    propertySubType: string | null;
    structureType: string | null;
    levelClass: string | null;
    buildingSqft: number;
    aboveGradeSqft: number;
    belowGradeTotalSqft: number;
    belowGradeFinishedSqft: number;
    yearBuilt: number | null;
    bedroomsTotal: number | null;
    bathroomsTotal: number | null;
    garageSpaces: number | null;
    lotSizeSqft: number;
  } | null;
  listing: {
    listingId: string;
    mlsStatus: string | null;
    listPrice: number;
    originalListPrice: number;
    listingContractDate: string | null;
  } | null;
  financials: { annualTax: number; annualHoa: number } | null;
  arv: {
    auto: number | null;
    selected: number | null;
    final: number | null;
    effective: number;
    selectedDetail: {
      arvAggregate: number;
      arvPerSqft: number;
      compCount: number;
      perCompDetails: ArvPerCompDetail[];
    } | null;
  };
  rehab: {
    auto: number | null;
    computed: number | null;
    manual: number | null;
    effective: number;
    scope: RehabScopeTier | null;
    scopeMultiplier: number;
    detail: RehabDetail | null;
    /** Pre-scope base costs per category (for client-side instant recalc). */
    baseDetail: Pick<RehabDetail, RehabCategoryKey> | null;
    /** Per-category scope overrides from manual_analysis. */
    categoryScopes: RehabCategoryScopes | null;
    /** User-defined custom rehab line items. */
    customItems: RehabCustomItem[];
  };
  holding: HoldingDetail | null;
  transaction: TransactionDetail | null;
  financing: FinancingDetail | null;
  dealMath: {
    arv: number;
    listPrice: number | null;
    rehabTotal: number;
    holdTotal: number;
    transactionTotal: number;
    financingTotal: number;
    targetProfit: number;
    totalCosts: number;
    maxOffer: number;
    offerPct: number | null;
    spread: number | null;
    estGapPerSqft: number | null;
  } | null;
  compSummary: {
    totalComps: number;
    selectedCount: number;
    avgSelectedPrice: number | null;
    avgSelectedPsf: number | null;
    avgSelectedDist: number | null;
  };
  manualAnalysis: Record<string, unknown> | null;
  pipeline: Record<string, unknown> | null;
  notes: Array<{
    id: string;
    note_type: string;
    note_body: string;
    is_public: boolean;
    created_at: string;
  }>;
  compModalData: {
    subjectListingRowId: string | null;
    subjectListingMlsNumber: string | null;
    defaultProfileSlug: string;
    latestRun: {
      id: string;
      status: string | null;
      created_at: string | null;
      parameters_json: Record<string, unknown> | null;
      summary_json: Record<string, unknown> | null;
    } | null;
    compCandidates: Array<Record<string, unknown>>;
  };
  asIsCompSummary: {
    totalComps: number;
    selectedCount: number;
    avgSelectedPrice: number | null;
    avgSelectedPsf: number | null;
    avgSelectedDist: number | null;
  };
  subjectContext: Record<string, unknown>;
  scopeMultipliers: Record<RehabScopeTier, number>;
  cashRequired: {
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
  } | null;
};

// ---------------------------------------------------------------------------
// Report content JSON — the frozen snapshot stored in analysis_reports
// ---------------------------------------------------------------------------

export type ReportSelectedComp = {
  address: string;
  closePrice: number | null;
  ppsf: number | null;
  sqft: number | null;
  distance: number | null;
  closeDate: string | null;
  latitude: number | null;
  longitude: number | null;
};

export type ReportContentJson = {
  version: 1;
  generatedAt: string;

  property: {
    address: string;
    city: string;
    county: string | null;
    state: string;
    postalCode: string | null;
    latitude: number | null;
    longitude: number | null;
  };

  physical: {
    propertyType: string | null;
    buildingSqft: number;
    aboveGradeSqft: number;
    belowGradeTotalSqft: number;
    belowGradeFinishedSqft: number;
    yearBuilt: number | null;
    bedroomsTotal: number | null;
    bathroomsTotal: number | null;
    garageSpaces: number | null;
    lotSizeSqft: number;
  } | null;

  listing: {
    listingId: string;
    mlsStatus: string | null;
    listPrice: number;
  } | null;

  analysis: {
    scenarioName: string | null;
    strategyType: string | null;
  };

  arv: {
    effective: number;
    selectedDetail: {
      arvAggregate: number;
      arvPerSqft: number;
      compCount: number;
      perCompDetails: ArvPerCompDetail[];
    } | null;
  };

  rehab: {
    effective: number;
    scope: RehabScopeTier | null;
    scopeMultiplier: number;
    detail: RehabDetail | null;
    categoryScopes: RehabCategoryScopes | null;
    customItems: RehabCustomItem[];
  };

  holding: HoldingDetail | null;
  transaction: TransactionDetail | null;
  financing: FinancingDetail | null;

  dealMath: {
    arv: number;
    listPrice: number | null;
    rehabTotal: number;
    holdTotal: number;
    transactionTotal: number;
    financingTotal: number;
    targetProfit: number;
    totalCosts: number;
    maxOffer: number;
    offerPct: number | null;
    spread: number | null;
    estGapPerSqft: number | null;
  } | null;

  cashRequired: {
    purchasePrice: number;
    downPayment: number;
    rehabOutOfPocket: number;
    totalCashRequired: number;
  } | null;

  selectedComps: ReportSelectedComp[];

  compSummary: {
    selectedCount: number;
    avgSelectedPrice: number | null;
    avgSelectedPsf: number | null;
    avgSelectedDist: number | null;
  };

  notes: Array<{
    noteType: string;
    noteBody: string;
  }>;

  staticMapUrl: string | null;
};

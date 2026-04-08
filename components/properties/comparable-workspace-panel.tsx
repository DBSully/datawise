"use client";

import { useMemo, useState, type ReactNode } from "react";
import { runComparableSearchAction, addManualCompAction } from "@/app/(workspace)/deals/actions";
import { ComparableCandidateTable } from "@/components/properties/comparable-candidate-table";

type ComparableWorkspacePanelProps = {
  propertyId: string;
  analysisId: string;
  subjectListingRowId: string | null;
  subjectListingMlsNumber: string | null;
  analysisStrategyType: string | null;
  defaultProfileSlug: string;
  latestRun: {
    id: string;
    status: string | null;
    created_at: string | null;
    parameters_json: Record<string, unknown> | null;
    summary_json: Record<string, unknown> | null;
  } | null;
  latestCandidates: Array<{
    id: string;
    comp_listing_row_id: string | null;
    listing_id: string | null;
    distance_miles: number | null;
    days_since_close: number | null;
    sqft_delta_pct: number | null;
    raw_score: number | null;
    selected_yn: boolean;
    metrics_json: Record<string, unknown> | null;
    score_breakdown_json?: Record<string, unknown> | null;
  }>;
  defaultProfileRules: Record<string, unknown>;
  compRunMessage: string | null;
  compErrorMessage: string | null;
  subjectContext: {
    propertyType: string | null;
    propertySubType: string | null;
    buildingFormStandardized: string | null;
    levelClassStandardized: string | null;
    levelsRaw: string | null;
    buildingAreaTotalSqft: number | null;
    aboveGradeFinishedAreaSqft: number | null;
    belowGradeTotalSqft: number | null;
    belowGradeFinishedAreaSqft: number | null;
    lotSizeSqft: number | null;
    yearBuilt: number | null;
    bedroomsTotal: number | null;
    bathroomsTotal: number | null;
    garageSpaces: number | null;
    listingContractDate: string | null;
    address: string | null;
    listPrice: number | null;
  };
};

type UiPurpose = "standard" | "flip" | "rental" | "scrape" | "as_is";
type SnapshotMode = "auto" | "current" | "custom";
type SizeBasis = "building_area_total" | "lot_size";
type SubjectFamily =
  | "detached"
  | "condo"
  | "townhome"
  | "manufactured"
  | "multifamily"
  | "new_home_community"
  | "other";

type ComparableFormState = {
  purpose: UiPurpose;
  snapshotMode: SnapshotMode;
  customSnapshotDate: string;
  sizeBasis: SizeBasis;
  maxDistanceMiles: string;
  maxDaysSinceClose: string;
  sqftTolerancePct: string;
  lotSizeTolerancePct: string;
  yearToleranceYears: string;
  bedTolerance: string;
  bathTolerance: string;
  maxCandidates: string;
  requireSamePropertyType: boolean;
  requireSameBuildingForm: boolean;
  useLevelFilter: boolean;
  allowedLevelClasses: string[];
};

type PresetConfig = Omit<
  ComparableFormState,
  "purpose" | "snapshotMode" | "customSnapshotDate"
>;

const COMMON_LEVEL_CLASS_OPTIONS = [
  "One Story",
  "One and One Half Story",
  "Two Story",
  "Two and One Half Story",
  "Bi-Level",
  "Tri-Level",
  "Multi-Level",
  "Split Level",
  "Three Story",
];

function normalizeText(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizedKey(value: unknown) {
  const normalized = normalizeText(value);
  return normalized ? normalized.toLowerCase() : null;
}

function resolveSubjectFamily(propertyType: string | null): SubjectFamily {
  switch (normalizedKey(propertyType)) {
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

function readParam(
  params: Record<string, unknown> | null | undefined,
  ...keys: string[]
) {
  if (!params) return null;

  for (const key of keys) {
    const value = params[key];
    if (value !== null && value !== undefined && value !== "") {
      return value;
    }
  }

  return null;
}

function readArrayParam(
  params: Record<string, unknown> | null | undefined,
  ...keys: string[]
) {
  if (!params) return [] as string[];

  for (const key of keys) {
    const value = params[key];
    if (Array.isArray(value)) {
      return value
        .map((entry) => normalizeText(entry))
        .filter((entry): entry is string => Boolean(entry));
    }
  }

  return [];
}

function readNumberParam(
  params: Record<string, unknown> | null | undefined,
  ...keys: string[]
): number | null {
  const value = readParam(params, ...keys);

  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function readBooleanParam(
  params: Record<string, unknown> | null | undefined,
  ...keys: string[]
): boolean | null {
  const value = readParam(params, ...keys);

  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "y", "on"].includes(normalized)) return true;
    if (["false", "0", "no", "n", "off"].includes(normalized)) return false;
  }

  return null;
}

function metricValue(
  metrics: Record<string, unknown> | null | undefined,
  ...keys: string[]
) {
  if (!metrics) return null;

  for (const key of keys) {
    const value = metrics[key];
    if (value !== null && value !== undefined && value !== "") {
      return value;
    }
  }

  return null;
}

function parseNumericLike(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const cleaned = value.replace(/[$,]/g, "").trim();
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function formatCurrency(value: unknown) {
  const numeric = parseNumericLike(value);
  if (numeric === null) return "—";

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(numeric);
}

function formatNumber(value: unknown, decimals = 0) {
  const numeric = parseNumericLike(value);
  if (numeric === null) return "—";

  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(numeric);
}

function formatDate(value: unknown) {
  if (!value || typeof value !== "string") return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return parsed.toLocaleDateString();
}

function average(numbers: Array<number | null>) {
  const valid = numbers.filter((value): value is number => value !== null);
  if (valid.length === 0) return null;
  return valid.reduce((sum, value) => sum + value, 0) / valid.length;
}

function purposeLabel(purpose: UiPurpose) {
  switch (purpose) {
    case "standard":
      return "Standard";
    case "flip":
      return "Flip / ARV";
    case "rental":
      return "Rental";
    case "scrape":
      return "Scrape / Land";
    case "as_is":
      return "As-Is";
  }
}

function strategyToDefaultPurpose(strategyType: string | null): UiPurpose {
  const normalized = normalizedKey(strategyType);

  if (normalized === "flip") return "flip";
  if (normalized === "rental") return "rental";
  if (normalized === "as_is" || normalized === "as-is" || normalized === "asis") return "as_is";
  if (
    normalized === "new_build" ||
    normalized === "new build" ||
    normalized === "scrape"
  ) {
    return "scrape";
  }

  return "standard";
}

function uiPurposeFromSummary(
  value: unknown,
  fallbackStrategyType: string | null,
): UiPurpose {
  const normalized = normalizedKey(value);

  if (normalized === "flip") return "flip";
  if (normalized === "rental") return "rental";
  if (normalized === "scrape") return "scrape";
  if (normalized === "as_is" || normalized === "as-is" || normalized === "asis") return "as_is";
  if (
    normalized === "standard" ||
    normalized === "listing" ||
    normalized === "generic"
  ) {
    return "standard";
  }

  return strategyToDefaultPurpose(fallbackStrategyType);
}

function buildPresetConfig(params: {
  purpose: UiPurpose;
  subjectFamily: SubjectFamily;
  subjectLevelClass: string | null;
}): PresetConfig {
  const { purpose, subjectFamily, subjectLevelClass } = params;

  const usesBuildingForm =
    subjectFamily === "condo" ||
    subjectFamily === "townhome" ||
    subjectFamily === "multifamily";
  const usesLevelFilter =
    subjectFamily === "detached" || subjectFamily === "manufactured";
  const baseLevelClasses =
    usesLevelFilter && subjectLevelClass ? [subjectLevelClass] : [];

  if (purpose === "scrape") {
    return {
      sizeBasis: "lot_size",
      maxDistanceMiles: "1.0",
      maxDaysSinceClose: "365",
      sqftTolerancePct: "100",
      lotSizeTolerancePct: "25",
      yearToleranceYears: "100",
      bedTolerance: "5",
      bathTolerance: "5",
      maxCandidates: "20",
      requireSamePropertyType: false,
      requireSameBuildingForm: false,
      useLevelFilter: false,
      allowedLevelClasses: [],
    };
  }

  if (purpose === "rental") {
    return {
      sizeBasis: "building_area_total",
      maxDistanceMiles: "1.0",
      maxDaysSinceClose: "540",
      sqftTolerancePct: "20",
      lotSizeTolerancePct: "25",
      yearToleranceYears: "30",
      bedTolerance: "1",
      bathTolerance: "1",
      maxCandidates: "20",
      requireSamePropertyType: true,
      requireSameBuildingForm: usesBuildingForm,
      useLevelFilter: usesLevelFilter,
      allowedLevelClasses: baseLevelClasses,
    };
  }

  if (purpose === "flip") {
    return {
      sizeBasis: "building_area_total",
      maxDistanceMiles: "0.5",
      maxDaysSinceClose: "365",
      sqftTolerancePct: "20",
      lotSizeTolerancePct: "20",
      yearToleranceYears: "25",
      bedTolerance: "2",
      bathTolerance: "1.5",
      maxCandidates: "15",
      requireSamePropertyType: true,
      requireSameBuildingForm: usesBuildingForm,
      useLevelFilter: usesLevelFilter,
      allowedLevelClasses: baseLevelClasses,
    };
  }

  return {
    sizeBasis: "building_area_total",
    maxDistanceMiles: "0.5",
    maxDaysSinceClose: "365",
    sqftTolerancePct: "20",
    lotSizeTolerancePct: "20",
    yearToleranceYears: "25",
    bedTolerance: "1",
    bathTolerance: "1",
    maxCandidates: "15",
    requireSamePropertyType: true,
    requireSameBuildingForm: usesBuildingForm,
    useLevelFilter: usesLevelFilter,
    allowedLevelClasses: baseLevelClasses,
  };
}

function areStringArraysEqual(a: string[], b: string[]) {
  if (a.length !== b.length) return false;

  const sortedA = [...a].sort();
  const sortedB = [...b].sort();

  return sortedA.every((value, index) => value === sortedB[index]);
}

function formatPercentRange(
  base: number | null,
  pct: number | null,
  decimals = 0,
) {
  if (base === null || pct === null) return "Subject data unavailable";

  const min = base * (1 - pct / 100);
  const max = base * (1 + pct / 100);

  return `${formatNumber(min, decimals)} – ${formatNumber(max, decimals)}`;
}

function formatToleranceRange(
  base: number | null,
  tolerance: number | null,
  decimals = 0,
) {
  if (base === null || tolerance === null) return "Subject data unavailable";

  return `${formatNumber(base - tolerance, decimals)} – ${formatNumber(
    base + tolerance,
    decimals,
  )}`;
}

function formatSnapshotSummary(params: {
  summary: Record<string, unknown> | null | undefined;
  subjectListingContractDate: string | null;
}) {
  const summary = params.summary;
  const snapshotDate = readParam(summary, "marketSnapshotDate");
  const snapshotSource = readParam(summary, "marketSnapshotDateSource");
  const subjectListingContractDate =
    params.subjectListingContractDate ??
    (typeof readParam(summary, "subjectListingContractDate") === "string"
      ? String(readParam(summary, "subjectListingContractDate"))
      : null);

  if (typeof snapshotDate === "string") {
    if (snapshotSource === "current_date_fallback") {
      return `Current (${formatDate(snapshotDate)})`;
    }

    if (snapshotSource === "custom_snapshot_date") {
      return `Custom (${formatDate(snapshotDate)})`;
    }

    if (snapshotSource === "listing_contract_date") {
      return `Auto (${formatDate(snapshotDate)})`;
    }

    return formatDate(snapshotDate);
  }

  if (subjectListingContractDate) {
    return `Auto (${formatDate(subjectListingContractDate)})`;
  }

  return "Current";
}

function DetailMini({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5">
      <div className="text-[10px] uppercase tracking-[0.14em] text-slate-500">
        {label}
      </div>
      <div className="mt-0.5 text-xs font-semibold text-slate-900">{value}</div>
    </div>
  );
}

function SegmentedButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? "rounded-md border border-slate-900 bg-slate-900 px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-white"
          : "rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-700 hover:bg-slate-50"
      }
    >
      {children}
    </button>
  );
}

export function ComparableWorkspacePanel({
  propertyId,
  analysisId,
  subjectListingRowId,
  subjectListingMlsNumber,
  analysisStrategyType,
  defaultProfileSlug,
  latestRun,
  latestCandidates,
  defaultProfileRules,
  compRunMessage,
  compErrorMessage,
  subjectContext,
}: ComparableWorkspacePanelProps) {
  const [copiedAll, setCopiedAll] = useState(false);
  const [copiedSelected, setCopiedSelected] = useState(false);

  const subjectFamily = resolveSubjectFamily(subjectContext.propertyType);
  const isDetachedLike =
    subjectFamily === "detached" || subjectFamily === "manufactured";
  const usesBuildingForm =
    subjectFamily === "condo" ||
    subjectFamily === "townhome" ||
    subjectFamily === "multifamily";
  const lotSizeRelevant = subjectFamily !== "condo";

  const activeParams =
    latestRun?.parameters_json && typeof latestRun.parameters_json === "object"
      ? latestRun.parameters_json
      : defaultProfileRules;

  const summary =
    latestRun?.summary_json && typeof latestRun.summary_json === "object"
      ? latestRun.summary_json
      : null;

  const subjectLevelOptions = useMemo(() => {
    return Array.from(
      new Set(
        [subjectContext.levelClassStandardized, ...COMMON_LEVEL_CLASS_OPTIONS]
          .map((value) => normalizeText(value))
          .filter((value): value is string => Boolean(value)),
      ),
    );
  }, [subjectContext.levelClassStandardized]);

  const initialPurpose = uiPurposeFromSummary(
    readParam(summary, "requestedPurpose", "purposeMode"),
    analysisStrategyType,
  );

  const initialPreset = buildPresetConfig({
    purpose: initialPurpose,
    subjectFamily,
    subjectLevelClass: subjectContext.levelClassStandardized,
  });

  const initialAllowedLevelClasses = (() => {
    const fromSummary = readArrayParam(summary, "allowedLevelClasses");
    if (fromSummary.length > 0) return fromSummary;

    if (initialPreset.allowedLevelClasses.length > 0) {
      return initialPreset.allowedLevelClasses;
    }

    return [];
  })();

  const initialSnapshotMode = (() => {
    const raw = normalizedKey(
      readParam(summary, "requestedSnapshotMode", "snapshotMode"),
    );
    if (raw === "current") return "current" as const;
    if (raw === "custom") return "custom" as const;
    return "auto" as const;
  })();

  const initialCustomSnapshotDate =
    initialSnapshotMode === "custom"
      ? (normalizeText(
          readParam(summary, "customSnapshotDate", "marketSnapshotDate"),
        ) ?? "")
      : "";

  const summarySizeBasis = normalizedKey(
    readParam(summary, "sizeBasis", "preferredSizeBasis"),
  );

  const paramsSizeBasis = normalizedKey(
    readParam(activeParams, "preferredSizeBasis", "sizeBasis", "size_basis"),
  );

  const initialSizeBasis: SizeBasis =
    summarySizeBasis === "lot_size" || paramsSizeBasis === "lot_size"
      ? "lot_size"
      : summarySizeBasis === "building_area_total" ||
          paramsSizeBasis === "building_area_total"
        ? "building_area_total"
        : initialPreset.sizeBasis;

  const [formState, setFormState] = useState<ComparableFormState>({
    purpose: initialPurpose,
    snapshotMode: initialSnapshotMode,
    customSnapshotDate: initialCustomSnapshotDate,
    sizeBasis: initialSizeBasis,
    maxDistanceMiles: String(
      readNumberParam(activeParams, "maxDistanceMiles", "max_distance_miles") ??
        Number(initialPreset.maxDistanceMiles),
    ),
    maxDaysSinceClose: String(
      readNumberParam(
        activeParams,
        "maxDaysSinceClose",
        "max_days_since_close",
      ) ?? Number(initialPreset.maxDaysSinceClose),
    ),
    sqftTolerancePct: String(
      readNumberParam(activeParams, "sqftTolerancePct", "sqft_tolerance_pct") ??
        Number(initialPreset.sqftTolerancePct),
    ),
    lotSizeTolerancePct: String(
      readNumberParam(
        activeParams,
        "lotSizeTolerancePct",
        "lot_size_tolerance_pct",
      ) ?? Number(initialPreset.lotSizeTolerancePct),
    ),
    yearToleranceYears: String(
      readNumberParam(
        activeParams,
        "yearToleranceYears",
        "year_tolerance_years",
      ) ?? Number(initialPreset.yearToleranceYears),
    ),
    bedTolerance: String(
      readNumberParam(activeParams, "bedTolerance", "bed_tolerance") ??
        Number(initialPreset.bedTolerance),
    ),
    bathTolerance: String(
      readNumberParam(activeParams, "bathTolerance", "bath_tolerance") ??
        Number(initialPreset.bathTolerance),
    ),
    maxCandidates: String(
      readNumberParam(activeParams, "maxCandidates", "max_candidates") ??
        Number(initialPreset.maxCandidates),
    ),
    requireSamePropertyType:
      readBooleanParam(
        activeParams,
        "requireSamePropertyType",
        "require_same_property_type",
      ) ?? initialPreset.requireSamePropertyType,
    requireSameBuildingForm:
      readBooleanParam(
        activeParams,
        "requireSameBuildingForm",
        "require_same_building_form",
      ) ?? initialPreset.requireSameBuildingForm,
    useLevelFilter:
      readBooleanParam(
        activeParams,
        "requireSameLevelClass",
        "require_same_level_class",
      ) ??
      (initialAllowedLevelClasses.length > 0
        ? true
        : initialPreset.useLevelFilter),
    allowedLevelClasses:
      initialAllowedLevelClasses.length > 0
        ? initialAllowedLevelClasses
        : initialPreset.allowedLevelClasses,
  });

  const currentPreset = useMemo(
    () =>
      buildPresetConfig({
        purpose: formState.purpose,
        subjectFamily,
        subjectLevelClass: subjectContext.levelClassStandardized,
      }),
    [formState.purpose, subjectFamily, subjectContext.levelClassStandardized],
  );

  const presetModified =
    formState.sizeBasis !== currentPreset.sizeBasis ||
    formState.maxDistanceMiles !== currentPreset.maxDistanceMiles ||
    formState.maxDaysSinceClose !== currentPreset.maxDaysSinceClose ||
    formState.sqftTolerancePct !== currentPreset.sqftTolerancePct ||
    formState.lotSizeTolerancePct !== currentPreset.lotSizeTolerancePct ||
    formState.yearToleranceYears !== currentPreset.yearToleranceYears ||
    formState.bedTolerance !== currentPreset.bedTolerance ||
    formState.bathTolerance !== currentPreset.bathTolerance ||
    formState.maxCandidates !== currentPreset.maxCandidates ||
    formState.requireSamePropertyType !==
      currentPreset.requireSamePropertyType ||
    formState.requireSameBuildingForm !==
      currentPreset.requireSameBuildingForm ||
    formState.useLevelFilter !== currentPreset.useLevelFilter ||
    !areStringArraysEqual(
      formState.allowedLevelClasses,
      currentPreset.allowedLevelClasses,
    );

  function applyPreset(nextPurpose: UiPurpose) {
    const preset = buildPresetConfig({
      purpose: nextPurpose,
      subjectFamily,
      subjectLevelClass: subjectContext.levelClassStandardized,
    });

    setFormState((current) => ({
      ...current,
      purpose: nextPurpose,
      sizeBasis: preset.sizeBasis,
      maxDistanceMiles: preset.maxDistanceMiles,
      maxDaysSinceClose: preset.maxDaysSinceClose,
      sqftTolerancePct: preset.sqftTolerancePct,
      lotSizeTolerancePct: preset.lotSizeTolerancePct,
      yearToleranceYears: preset.yearToleranceYears,
      bedTolerance: preset.bedTolerance,
      bathTolerance: preset.bathTolerance,
      maxCandidates: preset.maxCandidates,
      requireSamePropertyType: preset.requireSamePropertyType,
      requireSameBuildingForm: preset.requireSameBuildingForm,
      useLevelFilter: preset.useLevelFilter,
      allowedLevelClasses: preset.allowedLevelClasses,
    }));
  }

  function toggleLevelClass(levelClass: string) {
    setFormState((current) => {
      const exists = current.allowedLevelClasses.includes(levelClass);

      return {
        ...current,
        allowedLevelClasses: exists
          ? current.allowedLevelClasses.filter((value) => value !== levelClass)
          : [...current.allowedLevelClasses, levelClass],
      };
    });
  }

  const maxDistance = parseNumericLike(formState.maxDistanceMiles);
  const maxDays = parseNumericLike(formState.maxDaysSinceClose);
  const sqftTolerance = parseNumericLike(formState.sqftTolerancePct);
  const lotSizeTolerance = parseNumericLike(formState.lotSizeTolerancePct);
  const yearTolerance = parseNumericLike(formState.yearToleranceYears);
  const bedTolerance = parseNumericLike(formState.bedTolerance);
  const bathTolerance = parseNumericLike(formState.bathTolerance);
  const maxCandidates = parseNumericLike(formState.maxCandidates);

  const sortedCandidates = useMemo(() => {
    return [...latestCandidates].sort((a, b) => {
      if (a.selected_yn !== b.selected_yn) {
        return a.selected_yn ? -1 : 1;
      }

      const aScore = a.raw_score ?? -Infinity;
      const bScore = b.raw_score ?? -Infinity;
      return bScore - aScore;
    });
  }, [latestCandidates]);

  const candidateViewRows = useMemo(() => {
    return sortedCandidates.map((candidate) => {
      const metrics = candidate.metrics_json ?? {};

      const address =
        metricValue(
          metrics,
          "address",
          "unparsed_address",
          "comp_address",
          "compAddress",
        ) ?? "—";

      const closeDate = metricValue(metrics, "close_date", "closeDate");
      const closePrice = metricValue(metrics, "net_price", "close_price", "closePrice");

      const gla = metricValue(
        metrics,
        "building_area_total_sqft",
        "above_grade_finished_area_sqft",
        "aboveGradeFinishedAreaSqft",
        "gla",
      );

      const ppsf = metricValue(
        metrics,
        "ppsf",
        "price_per_sqft",
        "ppsf_above",
        "ppsfAbove",
      );

      const listingId =
        candidate.listing_id ??
        metricValue(metrics, "listing_id", "mls_number", "mlsNumber");

      return {
        ...candidate,
        address: String(address),
        closeDate,
        closePrice,
        gla,
        ppsf,
        listingId: typeof listingId === "string" ? listingId : null,
      };
    });
  }, [sortedCandidates]);

  const selectedCandidates = candidateViewRows.filter(
    (candidate) => candidate.selected_yn,
  );

  const selectedCount = selectedCandidates.length;

  const avgSelectedDistance = average(
    selectedCandidates.map((candidate) => candidate.distance_miles),
  );

  const avgSelectedClosePrice = average(
    selectedCandidates.map((candidate) =>
      parseNumericLike(candidate.closePrice),
    ),
  );

  const avgSelectedPpsf = average(
    selectedCandidates.map((candidate) => parseNumericLike(candidate.ppsf)),
  );

  const allMlsNumbers = useMemo(() => {
    const values = [
      subjectListingMlsNumber,
      ...candidateViewRows.map((candidate) => candidate.listingId),
    ];

    return Array.from(
      new Set(
        values
          .map((value) => (typeof value === "string" ? value.trim() : ""))
          .filter(Boolean),
      ),
    );
  }, [subjectListingMlsNumber, candidateViewRows]);

  const selectedMlsNumbers = useMemo(() => {
    const values = [
      subjectListingMlsNumber,
      ...selectedCandidates.map((candidate) => candidate.listingId),
    ];

    return Array.from(
      new Set(
        values
          .map((value) => (typeof value === "string" ? value.trim() : ""))
          .filter(Boolean),
      ),
    );
  }, [subjectListingMlsNumber, selectedCandidates]);

  const allMlsClipboardText = allMlsNumbers.join(", ");
  const selectedMlsClipboardText = selectedMlsNumbers.join(", ");

  const subjectSummaryGla =
    subjectContext.buildingAreaTotalSqft ??
    subjectContext.aboveGradeFinishedAreaSqft ??
    null;

  const subjectSummary = {
    listingId: subjectListingMlsNumber,
    address: subjectContext.address ?? "Subject",
    listDate: subjectContext.listingContractDate ?? null,
    listPrice: subjectContext.listPrice ?? null,
    gla: subjectSummaryGla,
    yearBuilt: subjectContext.yearBuilt ?? null,
    levelClass: subjectContext.levelClassStandardized ?? null,
    aboveGradeFinishedSqft: subjectContext.aboveGradeFinishedAreaSqft ?? null,
    belowGradeTotalSqft: subjectContext.belowGradeTotalSqft ?? null,
    belowGradeFinishedSqft: subjectContext.belowGradeFinishedAreaSqft ?? null,
    bedroomsTotal: subjectContext.bedroomsTotal ?? null,
    bathroomsTotal: subjectContext.bathroomsTotal ?? null,
    garageSpaces: subjectContext.garageSpaces ?? null,
    ppsf:
      typeof subjectContext.listPrice === "number" &&
      typeof subjectSummaryGla === "number" &&
      subjectSummaryGla > 0
        ? subjectContext.listPrice / subjectSummaryGla
        : null,
  };

  async function handleCopyAllMlsIds() {
    if (!allMlsClipboardText) return;

    try {
      await navigator.clipboard.writeText(allMlsClipboardText);
      setCopiedAll(true);
      window.setTimeout(() => setCopiedAll(false), 1800);
    } catch {
      setCopiedAll(false);
    }
  }

  async function handleCopySelectedMlsIds() {
    if (!selectedMlsClipboardText) return;

    try {
      await navigator.clipboard.writeText(selectedMlsClipboardText);
      setCopiedSelected(true);
      window.setTimeout(() => setCopiedSelected(false), 1800);
    } catch {
      setCopiedSelected(false);
    }
  }

  const latestRunSummary = latestRun?.summary_json ?? null;

  return (
    <div className="dw-card-compact space-y-3">
      {/* ── MLS# Quick Copy ── */}
      <div className="dw-card-tight space-y-2">
        <div className="flex items-center justify-between gap-3">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
            MLS# Quick Copy (Subject + All Candidates)
          </div>
          <div className="text-[11px] text-slate-500">
            {copiedAll ? "Copied" : "Click box to copy"}
          </div>
        </div>

        <button
          type="button"
          onClick={handleCopyAllMlsIds}
          className="w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-left font-mono text-[11px] leading-5 text-slate-700 hover:bg-slate-50"
        >
          {allMlsClipboardText || "No MLS numbers available yet."}
        </button>
      </div>

      {/* ── Selected Comp Summary ── */}
      <div className="dw-card-tight space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
              Selected Comp Summary
            </div>
            <div className="mt-1 text-xs text-slate-600">
              Analyst-picked comparable set for detailed review.
            </div>
          </div>

          <div className="text-[11px] text-slate-500">
            {copiedSelected ? "Copied selected MLS#" : "Selected MLS# copy"}
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-4">
          <DetailMini label="Selected Count" value={String(selectedCount)} />
          <DetailMini
            label="Avg Distance"
            value={formatNumber(avgSelectedDistance, 2)}
          />
          <DetailMini
            label="Avg Close Price"
            value={formatCurrency(avgSelectedClosePrice)}
          />
          <DetailMini
            label="Avg PPSF"
            value={formatCurrency(avgSelectedPpsf)}
          />
        </div>

        <button
          type="button"
          onClick={handleCopySelectedMlsIds}
          className="w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-left font-mono text-[11px] leading-5 text-slate-700 hover:bg-slate-50"
        >
          {selectedMlsClipboardText || "No selected MLS numbers yet."}
        </button>

        {selectedCandidates.length > 0 ? (
          <div className="dw-table-wrap">
            <table className="dw-table-compact">
              <thead>
                <tr>
                  <th>MLS#</th>
                  <th>Address</th>
                  <th>Dist</th>
                  <th>Close</th>
                  <th>Price</th>
                  <th>PSF</th>
                </tr>
              </thead>
              <tbody>
                {selectedCandidates.map((candidate) => (
                  <tr key={candidate.id}>
                    <td>{candidate.listingId ?? "—"}</td>
                    <td>{candidate.address}</td>
                    <td>{formatNumber(candidate.distance_miles, 2)}</td>
                    <td>{formatDate(candidate.closeDate)}</td>
                    <td>{formatCurrency(candidate.closePrice)}</td>
                    <td>{formatCurrency(candidate.ppsf)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
            No comps are selected yet. Use the{" "}
            <span className="font-semibold">Pick</span> buttons below to build
            the preferred comp set.
          </div>
        )}
      </div>

      {/* ── Add Comp by MLS # ── */}
      {latestRun && (
        <form action={addManualCompAction} className="flex items-end gap-2">
          <input type="hidden" name="property_id" value={propertyId} />
          <input type="hidden" name="analysis_id" value={analysisId} />
          <input type="hidden" name="comp_search_run_id" value={latestRun.id} />
          <div>
            <label className="dw-label">Add comp by MLS #</label>
            <input
              name="mls_number"
              className="dw-input"
              placeholder="e.g. 4839210"
              style={{ width: 160 }}
            />
          </div>
          <button type="submit" className="dw-button-secondary text-xs">
            Add
          </button>
        </form>
      )}

      {/* ── Candidate List ── */}
      <ComparableCandidateTable
        propertyId={propertyId}
        analysisId={analysisId}
        candidateViewRows={candidateViewRows}
        subjectSummary={subjectSummary}
      />

      {/* ── Search Controls ── */}
      <details className="group">
        <summary className="flex cursor-pointer items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500 hover:text-slate-700">
          <span className="transition-transform group-open:rotate-90">&#9654;</span>
          Search Parameters &amp; Property Details
          <button
            type="submit"
            form="comp-search-form"
            className="dw-button-primary ml-auto text-[11px]"
            title="Run comparable search"
          >
            Run Comp Search
          </button>
        </summary>

        <div className="mt-3 space-y-3">

      {compRunMessage ? (
        <div className="dw-card-tight border-emerald-200 bg-emerald-50 text-sm text-emerald-800">
          {compRunMessage}
        </div>
      ) : null}

      {compErrorMessage ? (
        <div className="dw-card-tight border-red-200 bg-red-50 text-sm text-red-800">
          {compErrorMessage}
        </div>
      ) : null}

      <form
        id="comp-search-form"
        action={runComparableSearchAction}
        className="space-y-4"
      >
        <input type="hidden" name="property_id" value={propertyId} />
        <input type="hidden" name="analysis_id" value={analysisId} />
        <input
          type="hidden"
          name="subject_listing_row_id"
          value={subjectListingRowId ?? ""}
        />
        <input type="hidden" name="profile_slug" value={defaultProfileSlug} />
        <input type="hidden" name="purpose" value={formState.purpose} />
        <input
          type="hidden"
          name="snapshot_mode"
          value={formState.snapshotMode}
        />
        <input type="hidden" name="size_basis" value={formState.sizeBasis} />

        <div className="grid gap-3 xl:grid-cols-3">
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
            <div className="text-[10px] uppercase tracking-[0.14em] text-slate-500">
              Purpose
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {(["standard", "flip", "rental", "scrape", "as_is"] as UiPurpose[]).map(
                (purpose) => (
                  <SegmentedButton
                    key={purpose}
                    active={formState.purpose === purpose}
                    onClick={() => applyPreset(purpose)}
                  >
                    {purposeLabel(purpose)}
                  </SegmentedButton>
                ),
              )}
            </div>
            <div className="mt-2 text-xs text-slate-600">
              Preset:{" "}
              <span className="font-semibold text-slate-900">
                {purposeLabel(formState.purpose)}
                {presetModified ? " (modified)" : ""}
              </span>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
            <div className="text-[10px] uppercase tracking-[0.14em] text-slate-500">
              Market Snapshot
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {(["auto", "current", "custom"] as SnapshotMode[]).map((mode) => (
                <SegmentedButton
                  key={mode}
                  active={formState.snapshotMode === mode}
                  onClick={() =>
                    setFormState((current) => ({
                      ...current,
                      snapshotMode: mode,
                      customSnapshotDate:
                        mode === "custom" ? current.customSnapshotDate : "",
                    }))
                  }
                >
                  {mode === "auto"
                    ? "Auto"
                    : mode === "current"
                      ? "Current Market"
                      : "Custom Date"}
                </SegmentedButton>
              ))}
            </div>

            {formState.snapshotMode === "custom" ? (
              <div className="mt-2">
                <label className="dw-label">Custom Snapshot Date</label>
                <input
                  type="date"
                  name="custom_snapshot_date"
                  className="dw-input"
                  value={formState.customSnapshotDate}
                  onChange={(event) =>
                    setFormState((current) => ({
                      ...current,
                      customSnapshotDate: event.target.value,
                    }))
                  }
                />
              </div>
            ) : (
              <div className="mt-2 text-xs text-slate-600">
                Active snapshot:{" "}
                <span className="font-semibold text-slate-900">
                  {latestRun
                    ? formatSnapshotSummary({
                        summary: latestRunSummary,
                        subjectListingContractDate:
                          subjectContext.listingContractDate,
                      })
                    : formState.snapshotMode === "auto"
                      ? subjectContext.listingContractDate
                        ? `Auto (${formatDate(subjectContext.listingContractDate)})`
                        : "Current"
                      : "Current"}
                </span>
              </div>
            )}
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
            <div className="text-[10px] uppercase tracking-[0.14em] text-slate-500">
              Size Basis
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <SegmentedButton
                active={formState.sizeBasis === "building_area_total"}
                onClick={() =>
                  setFormState((current) => ({
                    ...current,
                    sizeBasis: "building_area_total",
                  }))
                }
              >
                Building Area
              </SegmentedButton>

              {lotSizeRelevant ? (
                <SegmentedButton
                  active={formState.sizeBasis === "lot_size"}
                  onClick={() =>
                    setFormState((current) => ({
                      ...current,
                      sizeBasis: "lot_size",
                    }))
                  }
                >
                  Lot Size
                </SegmentedButton>
              ) : null}
            </div>

            <div className="mt-2 text-xs text-slate-600">
              Subject:{" "}
              <span className="font-semibold text-slate-900">
                {formState.sizeBasis === "lot_size"
                  ? `${formatNumber(subjectContext.lotSizeSqft)} sf lot`
                  : `${formatNumber(subjectContext.buildingAreaTotalSqft)} sf total`}
              </span>
            </div>
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-2">
          <div>
            <label className="dw-label">Max Distance (mi)</label>
            <input
              name="max_distance_miles"
              type="number"
              step="0.1"
              className="dw-input"
              value={formState.maxDistanceMiles}
              onChange={(event) =>
                setFormState((current) => ({
                  ...current,
                  maxDistanceMiles: event.target.value,
                }))
              }
            />
          </div>

          <div>
            <label className="dw-label">Max Days Since Close</label>
            <input
              name="max_days_since_close"
              type="number"
              step="1"
              className="dw-input"
              value={formState.maxDaysSinceClose}
              onChange={(event) =>
                setFormState((current) => ({
                  ...current,
                  maxDaysSinceClose: event.target.value,
                }))
              }
            />
          </div>

          {formState.purpose !== "scrape" ? (
            <>
              <div>
                <label className="dw-label">Sq Ft Tolerance %</label>
                <input
                  name="sqft_tolerance_pct"
                  type="number"
                  step="1"
                  className="dw-input"
                  value={formState.sqftTolerancePct}
                  onChange={(event) =>
                    setFormState((current) => ({
                      ...current,
                      sqftTolerancePct: event.target.value,
                    }))
                  }
                />
                <div className="mt-1 text-[11px] text-slate-500">
                  Subject {formatNumber(subjectContext.buildingAreaTotalSqft)}{" "}
                  sf →{" "}
                  {formatPercentRange(
                    subjectContext.buildingAreaTotalSqft,
                    sqftTolerance,
                  )}
                </div>
              </div>

              <div>
                <label className="dw-label">Year Tolerance</label>
                <input
                  name="year_tolerance_years"
                  type="number"
                  step="1"
                  className="dw-input"
                  value={formState.yearToleranceYears}
                  onChange={(event) =>
                    setFormState((current) => ({
                      ...current,
                      yearToleranceYears: event.target.value,
                    }))
                  }
                />
                <div className="mt-1 text-[11px] text-slate-500">
                  Subject {formatNumber(subjectContext.yearBuilt)} →{" "}
                  {formatToleranceRange(
                    subjectContext.yearBuilt,
                    yearTolerance,
                  )}
                </div>
              </div>

              <div>
                <label className="dw-label">Bed Tolerance</label>
                <input
                  name="bed_tolerance"
                  type="number"
                  step="1"
                  className="dw-input"
                  value={formState.bedTolerance}
                  onChange={(event) =>
                    setFormState((current) => ({
                      ...current,
                      bedTolerance: event.target.value,
                    }))
                  }
                />
                <div className="mt-1 text-[11px] text-slate-500">
                  Subject {formatNumber(subjectContext.bedroomsTotal)} →{" "}
                  {formatToleranceRange(
                    subjectContext.bedroomsTotal,
                    bedTolerance,
                  )}
                </div>
              </div>

              <div>
                <label className="dw-label">Bath Tolerance</label>
                <input
                  name="bath_tolerance"
                  type="number"
                  step="0.5"
                  className="dw-input"
                  value={formState.bathTolerance}
                  onChange={(event) =>
                    setFormState((current) => ({
                      ...current,
                      bathTolerance: event.target.value,
                    }))
                  }
                />
                <div className="mt-1 text-[11px] text-slate-500">
                  Subject {formatNumber(subjectContext.bathroomsTotal, 1)} →{" "}
                  {formatToleranceRange(
                    subjectContext.bathroomsTotal,
                    bathTolerance,
                    1,
                  )}
                </div>
              </div>
            </>
          ) : null}

          {lotSizeRelevant ? (
            <div>
              <label className="dw-label">Lot Size Tolerance %</label>
              <input
                name="lot_size_tolerance_pct"
                type="number"
                step="1"
                className="dw-input"
                value={formState.lotSizeTolerancePct}
                onChange={(event) =>
                  setFormState((current) => ({
                    ...current,
                    lotSizeTolerancePct: event.target.value,
                  }))
                }
              />
              <div className="mt-1 text-[11px] text-slate-500">
                Subject {formatNumber(subjectContext.lotSizeSqft)} sf →{" "}
                {formatPercentRange(
                  subjectContext.lotSizeSqft,
                  lotSizeTolerance,
                )}
              </div>
            </div>
          ) : null}

          <div>
            <label className="dw-label">Max Candidates</label>
            <input
              name="max_candidates"
              type="number"
              step="1"
              className="dw-input"
              value={formState.maxCandidates}
              onChange={(event) =>
                setFormState((current) => ({
                  ...current,
                  maxCandidates: event.target.value,
                }))
              }
            />
          </div>
        </div>

        <div className="grid gap-3 xl:grid-cols-2">
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-xs text-slate-600">
            <div className="text-[10px] uppercase tracking-[0.14em] text-slate-500">
              Matching Rules
            </div>
            <div className="mt-2 grid gap-2">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  name="require_same_property_type"
                  checked={formState.requireSamePropertyType}
                  onChange={(event) =>
                    setFormState((current) => ({
                      ...current,
                      requireSamePropertyType: event.target.checked,
                    }))
                  }
                />
                Require same property type
              </label>

              {usesBuildingForm ? (
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    name="require_same_building_form"
                    checked={formState.requireSameBuildingForm}
                    onChange={(event) =>
                      setFormState((current) => ({
                        ...current,
                        requireSameBuildingForm: event.target.checked,
                      }))
                    }
                  />
                  Require same building form
                </label>
              ) : null}

              {isDetachedLike ? (
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    name="require_same_level_class"
                    checked={formState.useLevelFilter}
                    onChange={(event) =>
                      setFormState((current) => ({
                        ...current,
                        useLevelFilter: event.target.checked,
                        allowedLevelClasses:
                          event.target.checked &&
                          current.allowedLevelClasses.length === 0
                            ? subjectContext.levelClassStandardized
                              ? [subjectContext.levelClassStandardized]
                              : current.allowedLevelClasses
                            : current.allowedLevelClasses,
                      }))
                    }
                  />
                  Filter by level class
                </label>
              ) : null}
            </div>
          </div>

          {isDetachedLike ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
              <div className="text-[10px] uppercase tracking-[0.14em] text-slate-500">
                Level Class
              </div>
              <div className="mt-1 text-xs text-slate-600">
                Start with the subject’s exact level class, then expand if you
                want to include compatible layouts.
              </div>

              {formState.useLevelFilter ? (
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {subjectLevelOptions.map((levelClass) => (
                    <label
                      key={levelClass}
                      className="flex items-center gap-2 text-xs text-slate-700"
                    >
                      <input
                        type="checkbox"
                        name="allowed_level_classes"
                        value={levelClass}
                        checked={formState.allowedLevelClasses.includes(
                          levelClass,
                        )}
                        onChange={() => toggleLevelClass(levelClass)}
                      />
                      {levelClass}
                    </label>
                  ))}
                </div>
              ) : (
                <div className="mt-2 text-xs text-slate-500">
                  Level filtering is currently off.
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
              <div className="text-[10px] uppercase tracking-[0.14em] text-slate-500">
                Subject Context
              </div>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <DetailMini
                  label="Property Type"
                  value={subjectContext.propertyType ?? "—"}
                />
                <DetailMini
                  label="Building Form"
                  value={
                    subjectContext.buildingFormStandardized ??
                    subjectContext.propertySubType ??
                    "—"
                  }
                />
                <DetailMini
                  label="Building Area"
                  value={formatNumber(subjectContext.buildingAreaTotalSqft)}
                />
                <DetailMini
                  label="Lot Size"
                  value={formatNumber(subjectContext.lotSizeSqft)}
                />
              </div>
            </div>
          )}
        </div>
      </form>

      <div className="grid gap-2 sm:grid-cols-6">
        <DetailMini label="Latest Run" value={latestRun ? "Saved" : "None"} />
        <DetailMini
          label="Run Date"
          value={
            latestRun?.created_at
              ? new Date(latestRun.created_at).toLocaleString()
              : "—"
          }
        />
        <DetailMini label="Purpose" value={purposeLabel(formState.purpose)} />
        <DetailMini
          label="Snapshot"
          value={
            latestRun
              ? formatSnapshotSummary({
                  summary: latestRunSummary,
                  subjectListingContractDate:
                    subjectContext.listingContractDate,
                })
              : formState.snapshotMode === "custom" &&
                  formState.customSnapshotDate
                ? formatDate(formState.customSnapshotDate)
                : formState.snapshotMode === "current"
                  ? "Current"
                  : subjectContext.listingContractDate
                    ? `Auto (${formatDate(subjectContext.listingContractDate)})`
                    : "Current"
          }
        />
        <DetailMini
          label="Candidates"
          value={String(candidateViewRows.length)}
        />
        <DetailMini label="Selected" value={String(selectedCount)} />
      </div>

        </div>
      </details>
    </div>
  );
}

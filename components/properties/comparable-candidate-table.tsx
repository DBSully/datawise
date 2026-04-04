"use client";

import { Fragment, useMemo, useState, type ReactNode } from "react";
import { toggleComparableCandidateSelectionAction } from "@/app/(workspace)/analysis/properties/actions";

export type ComparableCandidateViewRow = {
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
  address: string;
  closeDate: unknown;
  closePrice: unknown;
  gla: unknown;
  ppsf: unknown;
  listingId: string | null;
};

export type ComparableSubjectSummary = {
  listingId: string | null;
  address: string;
  listDate: string | null;
  listPrice: number | null;
  gla: number | null;
  bedroomsTotal: number | null;
  bathroomsTotal: number | null;
  garageSpaces: number | null;
  ppsf: number | null;
};

type ComparableCandidateTableProps = {
  propertyId: string;
  analysisId: string;
  candidateViewRows: ComparableCandidateViewRow[];
  subjectSummary: ComparableSubjectSummary | null;
};

const SCORE_COMPONENT_LABELS: Record<string, string> = {
  distance: "Distance",
  recency: "Recency",
  size: "Size",
  lotSize: "Lot Size",
  year: "Year Built",
  beds: "Beds",
  baths: "Baths",
  form: "Building Form",
  level: "Level",
  condition: "Condition",
};

const SCORE_COMPONENT_ORDER = [
  "distance",
  "recency",
  "size",
  "lotSize",
  "year",
  "beds",
  "baths",
  "form",
  "level",
  "condition",
] as const;

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

function formatSmartNumber(value: unknown) {
  const numeric = parseNumericLike(value);
  if (numeric === null) return "—";

  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: Number.isInteger(numeric) ? 0 : 1,
    maximumFractionDigits: Number.isInteger(numeric) ? 0 : 1,
  }).format(numeric);
}

function formatSignedNumber(value: unknown, decimals = 0) {
  const numeric = parseNumericLike(value);
  if (numeric === null) return "—";

  const formatted = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(Math.abs(numeric));

  if (numeric > 0) return `+${formatted}`;
  if (numeric < 0) return `-${formatted}`;
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(0);
}

function formatPercent(value: unknown, decimals = 1) {
  const numeric = parseNumericLike(value);
  if (numeric === null) return "—";

  return `${formatNumber(numeric, decimals)}%`;
}

function formatDate(value: unknown) {
  if (!value || typeof value !== "string") return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return parsed.toLocaleDateString();
}

function readBreakdownComponent(
  scoreBreakdown: Record<string, unknown> | null | undefined,
  componentKey: string,
) {
  const components = scoreBreakdown?.components;
  if (!components || typeof components !== "object") return null;

  const value = (components as Record<string, unknown>)[componentKey];
  if (!value || typeof value !== "object") return null;

  return value as Record<string, unknown>;
}

function DetailCell({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-2 py-1.5">
      <div className="text-[10px] uppercase tracking-[0.14em] text-slate-500">
        {label}
      </div>
      <div className="mt-0.5 text-xs font-semibold text-slate-900">{value}</div>
    </div>
  );
}

function CandidateTableHeader() {
  return (
    <tr>
      <th>Pick</th>
      <th>MLS#</th>
      <th>Address</th>
      <th>Dist</th>
      <th>Date</th>
      <th>Price</th>
      <th>GLA</th>
      <th>GLA Δ</th>
      <th>Bd</th>
      <th>Ba</th>
      <th>Gar</th>
      <th>PSF</th>
      <th>Score</th>
      <th>Why</th>
    </tr>
  );
}

export function ComparableCandidateTable({
  propertyId,
  analysisId,
  candidateViewRows,
  subjectSummary,
}: ComparableCandidateTableProps) {
  const [expandedCandidateId, setExpandedCandidateId] = useState<string | null>(
    null,
  );

  const hasCandidates = candidateViewRows.length > 0;

  const subjectGla = parseNumericLike(subjectSummary?.gla);
  const subjectPpsf = useMemo(() => {
    if (!subjectSummary) return null;
    if (subjectSummary.ppsf !== null && subjectSummary.ppsf !== undefined) {
      return parseNumericLike(subjectSummary.ppsf);
    }

    const listPrice = parseNumericLike(subjectSummary.listPrice);
    const gla = parseNumericLike(subjectSummary.gla);

    if (listPrice === null || gla === null || gla <= 0) return null;
    return listPrice / gla;
  }, [subjectSummary]);

  const rowsWithExpansion = useMemo(() => {
    return candidateViewRows.map((candidate) => {
      const metrics = candidate.metrics_json ?? {};
      const scoreBreakdown = candidate.score_breakdown_json ?? null;
      const isExpanded = expandedCandidateId === candidate.id;

      const candidateBeds = metricValue(metrics, "bedrooms_total");
      const candidateBaths = metricValue(metrics, "bathrooms_total");
      const candidateGarageSpaces = metricValue(
        metrics,
        "garage_spaces",
        "garageSpaces",
      );

      const candidateGla = parseNumericLike(candidate.gla);
      const glaDelta =
        subjectGla !== null && candidateGla !== null
          ? subjectGla - candidateGla
          : null;

      return {
        candidate,
        metrics,
        scoreBreakdown,
        isExpanded,
        candidateBeds,
        candidateBaths,
        candidateGarageSpaces,
        glaDelta,
      };
    });
  }, [candidateViewRows, expandedCandidateId, subjectGla]);

  return (
    <div className="dw-card-tight space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
            Candidate List
          </div>
          <div className="mt-1 text-xs text-slate-600">
            Ranked comp candidates with direct subject comparison.
          </div>
        </div>
        <div className="text-[11px] text-slate-500">
          {candidateViewRows.length} candidate
          {candidateViewRows.length === 1 ? "" : "s"}
        </div>
      </div>

      {subjectSummary ? (
        <div className="space-y-1">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
            Subject Reference
          </div>
          <div className="dw-table-wrap">
            <table className="dw-table-compact">
              <thead>
                <CandidateTableHeader />
              </thead>
              <tbody>
                <tr className="bg-slate-100">
                  <td>
                    <span className="rounded border border-slate-300 bg-white px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-700">
                      Subject
                    </span>
                  </td>
                  <td>{subjectSummary.listingId ?? "—"}</td>
                  <td className="font-semibold text-slate-900">
                    {subjectSummary.address}
                  </td>
                  <td>—</td>
                  <td>{formatDate(subjectSummary.listDate)}</td>
                  <td>{formatCurrency(subjectSummary.listPrice)}</td>
                  <td>{formatNumber(subjectSummary.gla)}</td>
                  <td>{subjectGla !== null ? formatSignedNumber(0) : "—"}</td>
                  <td>{formatSmartNumber(subjectSummary.bedroomsTotal)}</td>
                  <td>{formatSmartNumber(subjectSummary.bathroomsTotal)}</td>
                  <td>{formatSmartNumber(subjectSummary.garageSpaces)}</td>
                  <td>{formatCurrency(subjectPpsf)}</td>
                  <td>—</td>
                  <td>—</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      <div className="dw-table-wrap max-h-[520px] overflow-auto">
        <table className="dw-table-compact">
          <thead>
            <CandidateTableHeader />
          </thead>
          <tbody>
            {hasCandidates ? (
              rowsWithExpansion.map(
                ({
                  candidate,
                  metrics,
                  scoreBreakdown,
                  isExpanded,
                  candidateBeds,
                  candidateBaths,
                  candidateGarageSpaces,
                  glaDelta,
                }) => {
                  const sizeBasis = metricValue(metrics, "size_basis");
                  const lotSizeDeltaPct = metricValue(
                    metrics,
                    "lot_size_delta_pct",
                  );
                  const yearBuiltDelta = metricValue(
                    metrics,
                    "year_built_delta",
                  );
                  const bedDelta = metricValue(metrics, "bed_delta");
                  const bathDelta = metricValue(metrics, "bath_delta");
                  const levelClass = metricValue(
                    metrics,
                    "level_class_standardized",
                  );
                  const levelsRaw = metricValue(metrics, "levels_raw");
                  const condition = metricValue(
                    metrics,
                    "property_condition_source",
                  );
                  const snapshotDate = metricValue(
                    metrics,
                    "market_snapshot_date",
                  );

                  return (
                    <Fragment key={candidate.id}>
                      <tr
                        className={candidate.selected_yn ? "bg-slate-100" : ""}
                      >
                        <td>
                          <form
                            action={toggleComparableCandidateSelectionAction}
                          >
                            <input
                              type="hidden"
                              name="candidate_id"
                              value={candidate.id}
                            />
                            <input
                              type="hidden"
                              name="property_id"
                              value={propertyId}
                            />
                            <input
                              type="hidden"
                              name="analysis_id"
                              value={analysisId}
                            />
                            <input
                              type="hidden"
                              name="next_selected"
                              value={candidate.selected_yn ? "false" : "true"}
                            />
                            <button
                              type="submit"
                              className={
                                candidate.selected_yn
                                  ? "rounded border border-emerald-300 bg-emerald-100 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-800"
                                  : "rounded border border-slate-300 bg-white px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-700"
                              }
                            >
                              {candidate.selected_yn ? "Picked" : "Pick"}
                            </button>
                          </form>
                        </td>
                        <td>{candidate.listingId ?? "—"}</td>
                        <td
                          className={
                            candidate.selected_yn
                              ? "font-semibold text-slate-900"
                              : ""
                          }
                        >
                          {candidate.address}
                        </td>
                        <td>{formatNumber(candidate.distance_miles, 2)}</td>
                        <td>{formatDate(candidate.closeDate)}</td>
                        <td>{formatCurrency(candidate.closePrice)}</td>
                        <td>{formatNumber(candidate.gla)}</td>
                        <td>{formatSignedNumber(glaDelta)}</td>
                        <td>{formatSmartNumber(candidateBeds)}</td>
                        <td>{formatSmartNumber(candidateBaths)}</td>
                        <td>{formatSmartNumber(candidateGarageSpaces)}</td>
                        <td>{formatCurrency(candidate.ppsf)}</td>
                        <td>{formatNumber(candidate.raw_score, 1)}</td>
                        <td>
                          <button
                            type="button"
                            className="rounded border border-slate-300 bg-white px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-700 hover:bg-slate-50"
                            onClick={() =>
                              setExpandedCandidateId((current) =>
                                current === candidate.id ? null : candidate.id,
                              )
                            }
                          >
                            {isExpanded ? "Hide" : "Why"}
                          </button>
                        </td>
                      </tr>

                      {isExpanded ? (
                        <tr>
                          <td colSpan={14} className="bg-slate-50 px-3 py-3">
                            <div className="grid gap-3 xl:grid-cols-2">
                              <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-3">
                                <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                                  Candidate Metrics
                                </div>
                                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                                  <DetailCell
                                    label="Snapshot Date"
                                    value={formatDate(snapshotDate)}
                                  />
                                  <DetailCell
                                    label="Days Since Close"
                                    value={formatNumber(
                                      candidate.days_since_close,
                                    )}
                                  />
                                  <DetailCell
                                    label="Sq Ft Delta %"
                                    value={formatPercent(
                                      candidate.sqft_delta_pct,
                                    )}
                                  />
                                  <DetailCell
                                    label="GLA Δ"
                                    value={formatSignedNumber(glaDelta)}
                                  />
                                  <DetailCell
                                    label="Lot Size Delta %"
                                    value={formatPercent(lotSizeDeltaPct)}
                                  />
                                  <DetailCell
                                    label="Year Delta"
                                    value={formatNumber(yearBuiltDelta)}
                                  />
                                  <DetailCell
                                    label="Bed Delta"
                                    value={formatNumber(bedDelta)}
                                  />
                                  <DetailCell
                                    label="Bath Delta"
                                    value={formatNumber(bathDelta, 1)}
                                  />
                                  <DetailCell
                                    label="Garage Spaces"
                                    value={formatSmartNumber(
                                      candidateGarageSpaces,
                                    )}
                                  />
                                  <DetailCell
                                    label="Level Class"
                                    value={
                                      typeof levelClass === "string"
                                        ? levelClass
                                        : "—"
                                    }
                                  />
                                  <DetailCell
                                    label="Levels Raw"
                                    value={
                                      typeof levelsRaw === "string"
                                        ? levelsRaw
                                        : "—"
                                    }
                                  />
                                  <DetailCell
                                    label="Condition"
                                    value={
                                      typeof condition === "string"
                                        ? condition
                                        : "—"
                                    }
                                  />
                                  <DetailCell
                                    label="Size Basis"
                                    value={
                                      typeof sizeBasis === "string"
                                        ? sizeBasis
                                        : "—"
                                    }
                                  />
                                  <DetailCell
                                    label="Raw Score"
                                    value={formatNumber(candidate.raw_score, 1)}
                                  />
                                </div>
                              </div>

                              <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-3">
                                <div className="flex items-center justify-between gap-2">
                                  <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                                    Score Breakdown
                                  </div>
                                  <div className="text-[11px] text-slate-500">
                                    Weight total{" "}
                                    {formatNumber(
                                      scoreBreakdown?.totalWeight,
                                      2,
                                    )}
                                  </div>
                                </div>

                                <div className="grid gap-2">
                                  {SCORE_COMPONENT_ORDER.map((componentKey) => {
                                    const component = readBreakdownComponent(
                                      scoreBreakdown,
                                      componentKey,
                                    );

                                    const used = component?.used === true;
                                    const weight = component?.weight;
                                    const score = component?.score;
                                    const rawScore = component?.rawScore;

                                    return (
                                      <div
                                        key={componentKey}
                                        className="grid grid-cols-[minmax(0,1fr)_72px_72px_72px] items-center gap-2 rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
                                      >
                                        <div>
                                          <div className="font-semibold text-slate-900">
                                            {SCORE_COMPONENT_LABELS[
                                              componentKey
                                            ] ?? componentKey}
                                          </div>
                                          <div className="text-[11px] text-slate-500">
                                            {used
                                              ? "Used in score"
                                              : "Not used"}
                                          </div>
                                        </div>
                                        <div>
                                          <div className="text-[10px] uppercase tracking-[0.12em] text-slate-500">
                                            Weight
                                          </div>
                                          <div className="font-semibold text-slate-900">
                                            {formatNumber(weight, 2)}
                                          </div>
                                        </div>
                                        <div>
                                          <div className="text-[10px] uppercase tracking-[0.12em] text-slate-500">
                                            Score
                                          </div>
                                          <div className="font-semibold text-slate-900">
                                            {formatNumber(score, 1)}
                                          </div>
                                        </div>
                                        <div>
                                          <div className="text-[10px] uppercase tracking-[0.12em] text-slate-500">
                                            Raw
                                          </div>
                                          <div className="font-semibold text-slate-900">
                                            {formatNumber(rawScore, 1)}
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                },
              )
            ) : (
              <tr>
                <td colSpan={14} className="text-slate-500">
                  Comparable candidate list will appear here after a comp search
                  is run.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

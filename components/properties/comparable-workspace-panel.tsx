"use client";

import { useMemo, useState } from "react";
import {
  runComparableSearchAction,
  toggleComparableCandidateSelectionAction,
} from "@/app/(workspace)/analysis/properties/actions";

type ComparableWorkspacePanelProps = {
  propertyId: string;
  analysisId: string;
  subjectListingRowId: string | null;
  subjectListingMlsNumber: string | null;
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
  }>;
  defaultProfileRules: Record<string, unknown>;
  compRunMessage: string | null;
  compErrorMessage: string | null;
};

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

function DetailMini({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5">
      <div className="text-[10px] uppercase tracking-[0.14em] text-slate-500">
        {label}
      </div>
      <div className="mt-0.5 text-xs font-semibold text-slate-900">{value}</div>
    </div>
  );
}

export function ComparableWorkspacePanel({
  propertyId,
  analysisId,
  subjectListingRowId,
  subjectListingMlsNumber,
  latestRun,
  latestCandidates,
  defaultProfileRules,
  compRunMessage,
  compErrorMessage,
}: ComparableWorkspacePanelProps) {
  const [copiedAll, setCopiedAll] = useState(false);
  const [copiedSelected, setCopiedSelected] = useState(false);

  const activeParams =
    latestRun?.parameters_json && typeof latestRun.parameters_json === "object"
      ? latestRun.parameters_json
      : defaultProfileRules;

  const maxDistance = readNumberParam(
    activeParams,
    "maxDistanceMiles",
    "max_distance_miles",
  );

  const maxDays = readNumberParam(
    activeParams,
    "maxDaysSinceClose",
    "max_days_since_close",
  );

  const sqftTolerance = readNumberParam(
    activeParams,
    "sqftTolerancePct",
    "sqft_tolerance_pct",
  );

  const yearTolerance = readNumberParam(
    activeParams,
    "yearToleranceYears",
    "year_tolerance_years",
  );

  const bedTolerance = readNumberParam(
    activeParams,
    "bedTolerance",
    "bed_tolerance",
  );

  const bathTolerance = readNumberParam(
    activeParams,
    "bathTolerance",
    "bath_tolerance",
  );

  const maxCandidates = readNumberParam(
    activeParams,
    "maxCandidates",
    "max_candidates",
  );

  const requireSamePropertyType =
    readBooleanParam(
      activeParams,
      "requireSamePropertyType",
      "require_same_property_type",
    ) ?? true;

  const requireSameLevelClass =
    readBooleanParam(
      activeParams,
      "requireSameLevelClass",
      "require_same_level_class",
    ) ?? true;

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
      const closePrice = metricValue(metrics, "close_price", "closePrice");

      const gla = metricValue(
        metrics,
        "above_grade_finished_area_sqft",
        "aboveGradeFinishedAreaSqft",
        "gla",
        "building_area_total_sqft",
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

  return (
    <div className="dw-card-compact space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="dw-card-title-compact">Comparable Workspace</h2>
          <p className="dw-card-copy-compact">
            Search, review, and compare nearby sold comps.
          </p>
        </div>

        <button
          type="submit"
          form="comp-search-form"
          className="dw-button-primary"
          disabled={!subjectListingRowId}
          title={
            subjectListingRowId
              ? "Run comparable search"
              : "A linked subject listing is required"
          }
        >
          Run Comp Search
        </button>
      </div>

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
        className="space-y-3"
      >
        <input type="hidden" name="property_id" value={propertyId} />
        <input type="hidden" name="analysis_id" value={analysisId} />
        <input
          type="hidden"
          name="subject_listing_row_id"
          value={subjectListingRowId ?? ""}
        />
        <input
          type="hidden"
          name="profile_slug"
          value="denver_detached_basic_v1"
        />

        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-2">
          <div>
            <label className="dw-label">Max Distance (mi)</label>
            <input
              name="max_distance_miles"
              type="number"
              step="0.1"
              className="dw-input"
              defaultValue={maxDistance ?? 0.5}
            />
          </div>

          <div>
            <label className="dw-label">Max Days Since Close</label>
            <input
              name="max_days_since_close"
              type="number"
              step="1"
              className="dw-input"
              defaultValue={maxDays ?? 365}
            />
          </div>

          <div>
            <label className="dw-label">Sq Ft Tolerance %</label>
            <input
              name="sqft_tolerance_pct"
              type="number"
              step="1"
              className="dw-input"
              defaultValue={sqftTolerance ?? 20}
            />
          </div>

          <div>
            <label className="dw-label">Year Tolerance</label>
            <input
              name="year_tolerance_years"
              type="number"
              step="1"
              className="dw-input"
              defaultValue={yearTolerance ?? 25}
            />
          </div>

          <div>
            <label className="dw-label">Bed Tolerance</label>
            <input
              name="bed_tolerance"
              type="number"
              step="1"
              className="dw-input"
              defaultValue={bedTolerance ?? 1}
            />
          </div>

          <div>
            <label className="dw-label">Bath Tolerance</label>
            <input
              name="bath_tolerance"
              type="number"
              step="0.5"
              className="dw-input"
              defaultValue={bathTolerance ?? 1}
            />
          </div>

          <div>
            <label className="dw-label">Max Candidates</label>
            <input
              name="max_candidates"
              type="number"
              step="1"
              className="dw-input"
              defaultValue={maxCandidates ?? 15}
            />
          </div>

          <div className="flex items-end">
            <div className="grid w-full gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-2 text-xs text-slate-600">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  name="require_same_property_type"
                  defaultChecked={requireSamePropertyType}
                />
                Require same property type
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  name="require_same_level_class"
                  defaultChecked={requireSameLevelClass}
                />
                Require same level class
              </label>
            </div>
          </div>
        </div>
      </form>

      <div className="grid gap-2 sm:grid-cols-4">
        <DetailMini label="Latest Run" value={latestRun ? "Saved" : "None"} />
        <DetailMini
          label="Run Date"
          value={
            latestRun?.created_at
              ? new Date(latestRun.created_at).toLocaleString()
              : "—"
          }
        />
        <DetailMini
          label="Candidates"
          value={String(candidateViewRows.length)}
        />
        <DetailMini label="Selected" value={String(selectedCount)} />
      </div>

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

      <div className="dw-table-wrap max-h-[420px] overflow-auto">
        <table className="dw-table-compact">
          <thead>
            <tr>
              <th>Pick</th>
              <th>MLS#</th>
              <th>Address</th>
              <th>Dist</th>
              <th>Close</th>
              <th>Price</th>
              <th>GLA</th>
              <th>PSF</th>
              <th>Score</th>
            </tr>
          </thead>
          <tbody>
            {candidateViewRows.length > 0 ? (
              candidateViewRows.map((candidate) => (
                <tr
                  key={candidate.id}
                  className={candidate.selected_yn ? "bg-slate-100" : ""}
                >
                  <td>
                    <form action={toggleComparableCandidateSelectionAction}>
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
                  <td>{formatCurrency(candidate.ppsf)}</td>
                  <td>{formatNumber(candidate.raw_score, 1)}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={9} className="text-slate-500">
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

"use client";

import { useState } from "react";
import Link from "next/link";
import { ScreeningCompModal } from "./screening-comp-modal";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type QueueResultRow = {
  id: string;
  real_property_id: string;
  screening_batch_id: string;
  is_prime_candidate: boolean;
  subject_address: string;
  subject_city: string;
  subject_property_type: string | null;
  subject_list_price: number | null;
  mls_status: string | null;
  mls_major_change_type: string | null;
  listing_contract_date: string | null;
  arv_aggregate: number | null;
  trend_annual_rate: number | null;
  trend_confidence: string | null;
  trend_detail_json: Record<string, unknown> | null;
  spread: number | null;
  est_gap_per_sqft: number | null;
  arv_comp_count: number | null;
  rehab_total: number | null;
  hold_total: number | null;
  max_offer: number | null;
  offer_pct: number | null;
  promoted_analysis_id: string | null;
  comp_search_run_id: string | null;
  review_action: string | null;
  // Added by the interim queue fix migration (20260410130500). These come
  // from analysis_queue_v's LEFT JOIN LATERAL to find any active analysis
  // for this property, plus a "has the latest screening run happened
  // since the analysis was created" flag.
  has_active_analysis: boolean | null;
  active_analysis_id: string | null;
  active_lifecycle_stage: string | null;
  active_interest_level: string | null;
  has_newer_screening_than_analysis: boolean | null;
};

type QueueResultsTableProps = {
  results: QueueResultRow[];
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCurrency(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatNumber(value: number | null | undefined, decimals = 0) {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

function formatPercent(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";
  return `${(value * 100).toFixed(1)}%`;
}

function classifyDirection(rate: number): string {
  if (rate >= 0.05) return "strong_appreciation";
  if (rate >= 0.02) return "appreciating";
  if (rate >= -0.02) return "flat";
  if (rate >= -0.05) return "softening";
  if (rate >= -0.10) return "declining";
  return "sharp_decline";
}

function trendColor(rate: number, detailJson: Record<string, unknown> | null): string {
  const direction = (detailJson?.direction as string) ?? classifyDirection(rate);
  switch (direction) {
    case "strong_appreciation": return "bg-emerald-100 text-emerald-800";
    case "appreciating": return "bg-emerald-50 text-emerald-700";
    case "flat": return "bg-slate-100 text-slate-600";
    case "softening": return "bg-amber-100 text-amber-800";
    case "declining": return "bg-red-100 text-red-700";
    case "sharp_decline": return "bg-red-200 text-red-800";
    default: return "bg-slate-100 text-slate-600";
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function QueueResultsTable({ results }: QueueResultsTableProps) {
  const [activeResultId, setActiveResultId] = useState<string | null>(null);
  const activeRow = activeResultId
    ? results.find((r) => r.id === activeResultId) ?? null
    : null;

  return (
    <>
      <div className="dw-table-wrap">
        <table className="dw-table-compact min-w-[1500px]" style={{ tableLayout: "fixed" }}>
          <colgroup>
            {/* Map   Status  Star */}
            <col style={{ width: 38 }} />
            <col style={{ width: 68 }} />
            <col style={{ width: 20 }} />
            {/* Address  City  Type  ChangeType  ListDate */}
            <col style={{ width: 220 }} />
            <col style={{ width: 100 }} />
            <col style={{ width: 68 }} />
            <col style={{ width: 105 }} />
            <col style={{ width: 78 }} />
            {/* ListPrice  ARV  Trend  Spread  Gap  Comps */}
            <col style={{ width: 76 }} />
            <col style={{ width: 76 }} />
            <col style={{ width: 58 }} />
            <col style={{ width: 76 }} />
            <col style={{ width: 58 }} />
            <col style={{ width: 44 }} />
            {/* Rehab  Hold  MaxOffer  Offer%  Detail */}
            <col style={{ width: 70 }} />
            <col style={{ width: 66 }} />
            <col style={{ width: 76 }} />
            <col style={{ width: 50 }} />
            <col style={{ width: 40 }} />
          </colgroup>
          <thead>
            <tr>
              <th className="text-left"></th>
              <th className="text-left"></th>
              <th className="text-left"></th>
              <th className="text-left">Address</th>
              <th className="text-left">City</th>
              <th className="text-left">Type</th>
              <th className="text-left">Change Type</th>
              <th className="text-left">List Date</th>
              <th className="text-right">List Price</th>
              <th className="text-right">ARV</th>
              <th className="text-right">Trend</th>
              <th className="text-right">Spread</th>
              <th className="text-right">Gap/sqft</th>
              <th className="text-right">Comps</th>
              <th className="text-right">Rehab</th>
              <th className="text-right">Hold</th>
              <th className="text-right">Max Offer</th>
              <th className="text-right">Offer%</th>
              <th className="text-left"></th>
            </tr>
          </thead>
          <tbody>
            {results.length === 0 ? (
              <tr>
                <td colSpan={19} className="py-8 text-center text-sm text-slate-400">
                  No screened properties found.
                </td>
              </tr>
            ) : (
              results.map((r) => (
                <tr
                  key={r.id}
                  className={r.is_prime_candidate ? "bg-emerald-50/60" : ""}
                >
                  <td className="text-center">
                    {r.comp_search_run_id ? (
                      <button
                        type="button"
                        onClick={() => setActiveResultId(r.id)}
                        className="rounded border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700 hover:bg-blue-100"
                        title="Quick Comps — view map and pick comps"
                      >
                        Map
                      </button>
                    ) : null}
                  </td>
                  <td>
                    {/* Status badge logic — interim queue fix:
                        Prefer active_analysis_id (always reflects the most
                        current active analysis for this property) over
                        promoted_analysis_id (which is per-row and NULL on
                        re-screened rows). When the latest screening data
                        is newer than the analysis was created, append a
                        red dot indicator so the analyst can spot which
                        watch list items have fresh information. */}
                    {r.active_analysis_id ?? r.promoted_analysis_id ? (
                      <Link
                        href={`/analysis/${r.active_analysis_id ?? r.promoted_analysis_id}`}
                        className="inline-flex items-center gap-1 rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold text-blue-800 hover:bg-blue-200"
                        title={
                          r.has_newer_screening_than_analysis
                            ? `Watch List (${r.active_lifecycle_stage ?? "active"}) — newer screening data available`
                            : `Watch List (${r.active_lifecycle_stage ?? "active"})`
                        }
                      >
                        Watch List
                        {r.has_newer_screening_than_analysis && (
                          <span
                            className="inline-block h-1.5 w-1.5 rounded-full bg-red-500"
                            aria-label="newer screening data available"
                          />
                        )}
                      </Link>
                    ) : r.review_action === "passed" ? (
                      <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">
                        Passed
                      </span>
                    ) : (
                      <span className="text-[10px] text-slate-400">Ready</span>
                    )}
                  </td>
                  <td className="text-center">
                    {r.is_prime_candidate ? (
                      <span title="Prime Candidate" className="text-emerald-600">★</span>
                    ) : null}
                  </td>
                  <td className="truncate font-medium">
                    <Link
                      href={`/screening/${r.screening_batch_id}/${r.id}`}
                      className="text-blue-700 hover:underline"
                    >
                      {r.subject_address}
                    </Link>
                  </td>
                  <td className="truncate text-slate-500">{r.subject_city}</td>
                  <td className="text-slate-500">{r.subject_property_type ?? "—"}</td>
                  <td className="truncate text-slate-600">{r.mls_major_change_type ?? r.mls_status ?? "—"}</td>
                  <td className="text-slate-500">
                    {r.listing_contract_date ? r.listing_contract_date.slice(0, 10) : "—"}
                  </td>
                  <td className="text-right">{formatCurrency(r.subject_list_price)}</td>
                  <td className="text-right font-medium">{formatCurrency(r.arv_aggregate)}</td>
                  <td className="text-right">
                    {r.trend_annual_rate != null ? (
                      <span
                        className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${trendColor(r.trend_annual_rate, r.trend_detail_json)}`}
                      >
                        {r.trend_annual_rate >= 0 ? "+" : ""}
                        {(r.trend_annual_rate * 100).toFixed(1)}%
                      </span>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                  <td
                    className={`text-right font-medium ${
                      (r.spread ?? 0) > 0
                        ? "text-emerald-700"
                        : (r.spread ?? 0) < 0
                          ? "text-red-600"
                          : ""
                    }`}
                  >
                    {formatCurrency(r.spread)}
                  </td>
                  <td
                    className={`text-right font-semibold ${
                      (r.est_gap_per_sqft ?? 0) >= 60 ? "text-emerald-700" : ""
                    }`}
                  >
                    {r.est_gap_per_sqft !== null
                      ? `$${formatNumber(r.est_gap_per_sqft)}`
                      : "—"}
                  </td>
                  <td className="text-right text-slate-500">
                    {formatNumber(r.arv_comp_count)}
                  </td>
                  <td className="text-right">{formatCurrency(r.rehab_total)}</td>
                  <td className="text-right">{formatCurrency(r.hold_total)}</td>
                  <td className="text-right font-medium">
                    {formatCurrency(r.max_offer)}
                  </td>
                  <td className="text-right text-slate-500">
                    {formatPercent(r.offer_pct)}
                  </td>
                  <td>
                    <Link
                      href={`/screening/${r.screening_batch_id}/${r.id}`}
                      className="text-xs text-blue-600 hover:underline"
                    >
                      Detail
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Quick Comps Modal */}
      {activeResultId && activeRow && (
        <ScreeningCompModal
          resultId={activeResultId}
          batchId={activeRow.screening_batch_id}
          // Prefer active_analysis_id (interim queue fix) over per-row
          // promoted_analysis_id so the modal correctly recognizes a
          // re-screened watch list property as already promoted.
          promotedAnalysisId={activeRow.active_analysis_id ?? activeRow.promoted_analysis_id}
          realPropertyId={activeRow.real_property_id}
          onClose={() => setActiveResultId(null)}
        />
      )}
    </>
  );
}

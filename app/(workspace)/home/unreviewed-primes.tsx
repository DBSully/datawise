"use client";

import { useState } from "react";
import Link from "next/link";
import { ScreeningCompModal } from "@/components/screening/screening-comp-modal";

type PrimeRow = {
  id: string;
  real_property_id: string;
  screening_batch_id: string;
  subject_address: string;
  subject_city: string;
  subject_property_type: string | null;
  subject_list_price: number | null;
  arv_aggregate: number | null;
  max_offer: number | null;
  est_gap_per_sqft: number | null;
  arv_comp_count: number | null;
  comp_search_run_id: string | null;
  promoted_analysis_id: string | null;
};

function $f(v: number | null | undefined) {
  if (v == null) return "—";
  return "$" + v.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function fmtNum(v: number | null | undefined) {
  if (v == null) return "—";
  return v.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

export function UnreviewedPrimes({
  rows,
  totalCount,
}: {
  rows: PrimeRow[];
  totalCount: number;
}) {
  const [activeResultId, setActiveResultId] = useState<string | null>(null);
  const activeRow = activeResultId
    ? rows.find((r) => r.id === activeResultId) ?? null
    : null;

  return (
    <div className="dw-card-tight space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-800">
          Unreviewed Prime Candidates
        </h2>
        {totalCount > 0 && (
          <Link
            href="/screening?prime=true"
            className="text-xs text-blue-600 hover:underline"
          >
            View All {totalCount} →
          </Link>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="py-4 text-center text-sm text-slate-400">
          No unreviewed prime candidates. You're caught up.
        </p>
      ) : (
        <div className="dw-table-wrap">
          <table className="dw-table-compact">
            <thead>
              <tr>
                <th style={{ width: 50 }}></th>
                <th>Address</th>
                <th>City</th>
                <th>Type</th>
                <th className="text-right">List</th>
                <th className="text-right">ARV</th>
                <th className="text-right">Max Offer</th>
                <th className="text-right">Gap/sqft</th>
                <th className="text-right">Comps</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="bg-emerald-50/40">
                  <td>
                    {r.comp_search_run_id ? (
                      <button
                        type="button"
                        onClick={() => setActiveResultId(r.id)}
                        className="rounded border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700 hover:bg-blue-100"
                      >
                        Review
                      </button>
                    ) : null}
                  </td>
                  <td className="font-medium">
                    <Link
                      href={`/screening/${r.screening_batch_id}/${r.id}`}
                      className="text-blue-700 hover:underline"
                    >
                      {r.subject_address}
                    </Link>
                  </td>
                  <td className="text-slate-500">{r.subject_city}</td>
                  <td className="text-xs text-slate-500">
                    {r.subject_property_type ?? "—"}
                  </td>
                  <td className="text-right">{$f(r.subject_list_price)}</td>
                  <td className="text-right font-medium text-emerald-700">
                    {$f(r.arv_aggregate)}
                  </td>
                  <td className="text-right font-medium">
                    {$f(r.max_offer)}
                  </td>
                  <td
                    className={`text-right font-semibold ${
                      (r.est_gap_per_sqft ?? 0) >= 60
                        ? "text-emerald-700"
                        : ""
                    }`}
                  >
                    {r.est_gap_per_sqft != null
                      ? `$${fmtNum(r.est_gap_per_sqft)}`
                      : "—"}
                  </td>
                  <td className="text-right text-slate-500">
                    {fmtNum(r.arv_comp_count)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeResultId && activeRow && (
        <ScreeningCompModal
          resultId={activeResultId}
          batchId={activeRow.screening_batch_id}
          promotedAnalysisId={activeRow.promoted_analysis_id}
          realPropertyId={activeRow.real_property_id}
          onClose={() => setActiveResultId(null)}
        />
      )}
    </div>
  );
}

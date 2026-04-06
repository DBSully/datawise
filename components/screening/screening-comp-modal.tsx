"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import type { MapPin } from "@/components/properties/comp-map";
import {
  loadScreeningCompDataAction,
  toggleScreeningCompSelectionAction,
  promoteToAnalysisAction,
  type ScreeningCompData,
} from "@/app/(workspace)/analysis/screening/actions";

const CompMap = dynamic(
  () => import("@/components/properties/comp-map").then((m) => m.CompMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[420px] w-[420px] items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-xs text-slate-400">
        Loading map...
      </div>
    ),
  },
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function $f(v: number | null | undefined) {
  if (v == null) return "—";
  return "$" + v.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function fmtNum(v: number | null | undefined, d = 0) {
  if (v == null) return "—";
  return v.toLocaleString("en-US", {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  });
}

function fmtDate(v: unknown) {
  if (!v || typeof v !== "string") return "—";
  return new Date(v).toLocaleDateString();
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type ScreeningCompModalProps = {
  resultId: string;
  batchId: string;
  /** If already promoted, link to the existing analysis instead of showing promote button */
  promotedAnalysisId?: string | null;
  realPropertyId?: string | null;
  onClose: () => void;
};

export function ScreeningCompModal({
  resultId,
  batchId,
  promotedAnalysisId,
  realPropertyId,
  onClose,
}: ScreeningCompModalProps) {
  const router = useRouter();
  const [data, setData] = useState<ScreeningCompData | null>(null);
  const [loading, setLoading] = useState(true);
  const [promoting, setPromoting] = useState(false);

  // Load data on mount
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadScreeningCompDataAction(resultId).then((result) => {
      if (!cancelled) {
        setData(result);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [resultId]);

  // Toggle selection
  const handleToggle = useCallback(
    async (candidateId: string, currentType: "selected" | "candidate") => {
      const fd = new FormData();
      fd.set("candidate_id", candidateId);
      fd.set("next_selected", currentType === "candidate" ? "true" : "false");
      fd.set("batch_id", batchId);
      await toggleScreeningCompSelectionAction(fd);

      // Optimistic local update
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          candidates: prev.candidates.map((c) =>
            c.id === candidateId
              ? { ...c, selected_yn: currentType === "candidate" }
              : c,
          ),
        };
      });
    },
    [batchId],
  );

  // Map pin click handler
  const handleMapPinToggle = useCallback(
    (pinId: string, currentType: "selected" | "candidate") => {
      handleToggle(pinId, currentType);
    },
    [handleToggle],
  );

  // Build map pins
  const mapPins = useMemo<MapPin[]>(() => {
    if (!data) return [];
    const pins: MapPin[] = [];
    const subjectSqft = data.subjectBuildingSqft ?? 0;
    const subjectListPrice = data.subjectListPrice ?? 0;

    if (data.subjectLat && data.subjectLng) {
      pins.push({
        id: "subject",
        lat: data.subjectLat,
        lng: data.subjectLng,
        label: data.subjectAddress,
        tooltipData: {
          listPrice: subjectListPrice || null,
          sqft: subjectSqft || null,
          gapPerSqft: data.estGapPerSqft,
        },
        type: "subject",
      });
    }

    for (const c of data.candidates) {
      const m = c.metrics_json;
      const lat = Number(m.latitude);
      const lng = Number(m.longitude);
      if (!lat || !lng || !Number.isFinite(lat) || !Number.isFinite(lng))
        continue;

      const compSqft = Number(m.building_area_total_sqft) || null;
      const sqftDelta =
        compSqft && subjectSqft ? subjectSqft - compSqft : null;
      const sqftDeltaPct =
        compSqft && subjectSqft
          ? (subjectSqft - compSqft) / subjectSqft
          : null;

      const compClosePrice = Number(m.close_price) || 0;
      const perCompGapPerSqft =
        subjectSqft > 0 && compClosePrice > 0 && subjectListPrice > 0
          ? Math.round((compClosePrice - subjectListPrice) / subjectSqft)
          : null;

      pins.push({
        id: c.id,
        lat,
        lng,
        label: String(m.address ?? "—"),
        tooltipData: {
          closePrice: (m.close_price as number) ?? null,
          closeDate: m.close_date ? String(m.close_date).slice(0, 10) : null,
          sqft: compSqft,
          sqftDelta,
          sqftDeltaPct,
          ppsf: (m.ppsf as number) ?? null,
          distance: (c.distance_miles as number) ?? null,
          gapPerSqft: perCompGapPerSqft,
        },
        type: c.selected_yn ? "selected" : "candidate",
      });
    }

    return pins;
  }, [data]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const selectedCount = data?.candidates.filter((c) => c.selected_yn).length ?? 0;

  // Promote handler
  const handlePromote = useCallback(async () => {
    setPromoting(true);
    const fd = new FormData();
    fd.set("result_id", resultId);
    await promoteToAnalysisAction(fd);
    // promoteToAnalysisAction redirects, but just in case:
    setPromoting(false);
  }, [resultId]);

  return (
    // Backdrop
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* Modal */}
      <div
        className="flex max-h-[90vh] w-[1060px] max-w-[95vw] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2.5">
          <div className="min-w-0">
            <h2 className="truncate text-sm font-bold text-slate-900">
              {data?.subjectAddress ?? "Loading..."}
            </h2>
            <div className="flex items-center gap-3 text-xs text-slate-500">
              {data && (
                <>
                  <span>{data.subjectCity}</span>
                  <span>List: {$f(data.subjectListPrice)}</span>
                  <span>{fmtNum(data.subjectBuildingSqft)} sqft</span>
                  <span>
                    {selectedCount} picked
                  </span>
                </>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <p className="text-[10px] text-slate-400">
              <span
                className="mr-1 inline-block h-2 w-2 rounded-full bg-emerald-500"
              />
              Picked
              <span
                className="ml-2 mr-1 inline-block h-2 w-2 rounded-full bg-slate-400"
              />
              Candidate
              <span
                className="ml-2 mr-1 inline-block h-2 w-2 rounded-full bg-red-600"
              />
              Subject
            </p>
            <button
              type="button"
              onClick={onClose}
              className="rounded px-2.5 py-1 text-sm font-medium text-slate-500 hover:bg-slate-100"
            >
              Close
            </button>
          </div>
        </div>

        {/* Body */}
        {loading ? (
          <div className="flex h-[460px] items-center justify-center text-sm text-slate-400">
            Loading comparables...
          </div>
        ) : !data || data.candidates.length === 0 ? (
          <div className="flex h-[460px] items-center justify-center text-sm text-slate-400">
            No comparable data available for this property.
          </div>
        ) : (
          <div className="flex flex-1 overflow-hidden">
            {/* Left: Square map */}
            <div className="shrink-0 border-r border-slate-200 p-3">
              <CompMap
                pins={mapPins}
                height={420}
                className="!w-[420px]"
                subjectLat={data.subjectLat}
                subjectLng={data.subjectLng}
                onPinClick={handleMapPinToggle}
              />
            </div>

            {/* Right: Condensed candidate table */}
            <div className="flex-1 overflow-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="sticky top-0 z-10 bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
                    <th className="px-2 py-1.5 text-left" style={{ width: 52 }}>Pick</th>
                    <th className="px-2 py-1.5 text-left">Address</th>
                    <th className="px-2 py-1.5 text-right">Price</th>
                    <th className="px-2 py-1.5 text-right">Dist</th>
                    <th className="px-2 py-1.5 text-right">Days</th>
                    <th className="px-2 py-1.5 text-right">GLA</th>
                    <th className="px-2 py-1.5 text-right">PSF</th>
                    <th className="px-2 py-1.5 text-right">Score</th>
                  </tr>
                </thead>
                <tbody>
                  {data.candidates.map((c) => {
                    const m = c.metrics_json;
                    return (
                      <tr
                        key={c.id}
                        className={`border-t border-slate-100 ${c.selected_yn ? "bg-emerald-50/60" : "hover:bg-slate-50"}`}
                      >
                        <td className="px-2 py-1">
                          <button
                            type="button"
                            onClick={() =>
                              handleToggle(
                                c.id,
                                c.selected_yn ? "selected" : "candidate",
                              )
                            }
                            className={
                              c.selected_yn
                                ? "rounded border border-emerald-300 bg-emerald-100 px-1.5 py-0.5 text-[9px] font-bold uppercase text-emerald-800"
                                : "rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[9px] font-bold uppercase text-slate-600 hover:bg-slate-50"
                            }
                          >
                            {c.selected_yn ? "Picked" : "Pick"}
                          </button>
                        </td>
                        <td
                          className={`max-w-[200px] truncate px-2 py-1 ${c.selected_yn ? "font-semibold text-slate-900" : "text-slate-700"}`}
                          title={String(m.address ?? "")}
                        >
                          {String(m.address ?? "—")}
                        </td>
                        <td className="px-2 py-1 text-right">
                          {$f(m.close_price as number)}
                        </td>
                        <td className="px-2 py-1 text-right">
                          {fmtNum(c.distance_miles, 2)}
                        </td>
                        <td className="px-2 py-1 text-right">
                          {c.days_since_close ?? "—"}
                        </td>
                        <td className="px-2 py-1 text-right">
                          {fmtNum(
                            m.building_area_total_sqft as number | null,
                          )}
                        </td>
                        <td className="px-2 py-1 text-right">
                          {m.ppsf ? `$${fmtNum(m.ppsf as number)}` : "—"}
                        </td>
                        <td className="px-2 py-1 text-right font-semibold">
                          {fmtNum(c.raw_score, 1)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Footer — promote to analysis */}
        {!loading && data && data.candidates.length > 0 && (
          <div className="flex items-center justify-between border-t border-slate-200 px-4 py-2.5">
            <div className="text-xs text-slate-500">
              {selectedCount} comp{selectedCount !== 1 ? "s" : ""} picked
            </div>
            {promotedAnalysisId && realPropertyId ? (
              <a
                href={`/analysis/properties/${realPropertyId}/analyses/${promotedAnalysisId}`}
                className="rounded bg-blue-100 px-3 py-1.5 text-xs font-semibold text-blue-800 hover:bg-blue-200"
              >
                Open Analysis →
              </a>
            ) : (
              <button
                type="button"
                onClick={handlePromote}
                disabled={promoting}
                className="rounded bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
              >
                {promoting ? "Creating..." : "Begin Analysis →"}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import type { MapPin } from "@/components/properties/comp-map";
import {
  loadScreeningCompDataAction,
  toggleScreeningCompSelectionAction,
  promoteToAnalysisAction,
  passOnScreeningResultAction,
  type ScreeningCompData,
} from "@/app/(workspace)/intake/screening/actions";

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

function fmtPct(v: number | null | undefined) {
  if (v == null) return "—";
  return `${(v * 100).toFixed(1)}%`;
}

const PASS_REASONS = [
  "Comps too weak",
  "Rehab too heavy",
  "Price too high / offer% too low",
  "Location concern",
  "Already analyzed / duplicate",
  "Other",
] as const;

const INTEREST_LEVELS = [
  { value: "hot", label: "Hot", icon: "🔴", desc: "Act immediately" },
  { value: "warm", label: "Warm", icon: "🟡", desc: "Review soon" },
  { value: "watch", label: "Watch", icon: "🟢", desc: "Monitor for now" },
] as const;

type ModalMode = "view" | "promote" | "pass";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type ScreeningCompModalProps = {
  resultId: string;
  batchId: string;
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
  const [mode, setMode] = useState<ModalMode>("view");
  const [submitting, setSubmitting] = useState(false);

  // Promote form state
  const [interestLevel, setInterestLevel] = useState<string>("warm");
  const [watchListNote, setWatchListNote] = useState("");

  // Pass form state
  const [passReason, setPassReason] = useState("");
  const [passOtherText, setPassOtherText] = useState("");

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
      if (e.key === "Escape") {
        if (mode !== "view") {
          setMode("view");
        } else {
          onClose();
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose, mode]);

  const selectedCount =
    data?.candidates.filter((c) => c.selected_yn).length ?? 0;

  // Comp quality stats
  const compStats = useMemo(() => {
    if (!data || data.candidates.length === 0)
      return { count: 0, avgDist: null, avgScore: null };
    const selected = data.candidates.filter((c) => c.selected_yn);
    const pool = selected.length > 0 ? selected : data.candidates;
    const dists = pool
      .map((c) => c.distance_miles)
      .filter((d): d is number => d != null);
    const scores = pool
      .map((c) => c.raw_score)
      .filter((s): s is number => s != null);
    return {
      count: pool.length,
      avgDist: dists.length > 0 ? dists.reduce((a, b) => a + b, 0) / dists.length : null,
      avgScore: scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : null,
    };
  }, [data]);

  // Promote handler
  const handlePromote = useCallback(
    async (openWorkstation: boolean) => {
      setSubmitting(true);
      const fd = new FormData();
      fd.set("result_id", resultId);
      fd.set("interest_level", interestLevel);
      if (watchListNote) fd.set("watch_list_note", watchListNote);
      fd.set("open_workstation", openWorkstation ? "true" : "false");

      try {
        await promoteToAnalysisAction(fd);
        // If openWorkstation=true, the action calls redirect() and this won't execute.
        // If openWorkstation=false, we reach here — close modal and refresh.
        router.refresh();
        onClose();
      } finally {
        setSubmitting(false);
      }
    },
    [resultId, interestLevel, watchListNote, router, onClose],
  );

  // Pass handler
  const handlePass = useCallback(async () => {
    const reason =
      passReason === "Other" ? passOtherText.trim() : passReason;
    if (!reason) return;

    setSubmitting(true);
    const fd = new FormData();
    fd.set("result_id", resultId);
    fd.set("pass_reason", reason);

    try {
      await passOnScreeningResultAction(fd);
      router.refresh();
      onClose();
    } finally {
      setSubmitting(false);
    }
  }, [resultId, passReason, passOtherText, router, onClose]);

  // Already reviewed?
  const isReviewed = data?.reviewAction != null;
  const isAlreadyPromoted = !!promotedAnalysisId || data?.reviewAction === "promoted";
  const isAlreadyPassed = data?.reviewAction === "passed";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[90vh] w-[1060px] max-w-[95vw] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2.5">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-sm font-bold text-slate-900">
                {data?.subjectAddress ?? "Loading..."}
              </h2>
              {data?.isPrimeCandidate && (
                <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800">
                  Prime
                </span>
              )}
              {isAlreadyPassed && (
                <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-700">
                  Passed
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 text-xs text-slate-500">
              {data && (
                <>
                  <span>{data.subjectCity}</span>
                  <span>List: {$f(data.subjectListPrice)}</span>
                  <span>{fmtNum(data.subjectBuildingSqft)} sqft</span>
                </>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <p className="text-[10px] text-slate-400">
              <span className="mr-1 inline-block h-2 w-2 rounded-full bg-emerald-500" />
              Picked
              <span className="ml-2 mr-1 inline-block h-2 w-2 rounded-full bg-slate-400" />
              Candidate
              <span className="ml-2 mr-1 inline-block h-2 w-2 rounded-full bg-red-600" />
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

        {/* Deal math summary strip */}
        {!loading && data && (
          <div className="flex items-center gap-4 border-b border-slate-100 bg-slate-50 px-4 py-2">
            <DealStat label="ARV" value={$f(data.arvAggregate)} highlight />
            <DealStat label="Max Offer" value={$f(data.maxOffer)} highlight />
            <DealStat
              label="Gap/sqft"
              value={
                data.estGapPerSqft != null
                  ? `$${fmtNum(data.estGapPerSqft)}`
                  : "—"
              }
            />
            <DealStat label="Offer%" value={fmtPct(data.offerPct)} />
            <DealStat label="Rehab" value={$f(data.rehabTotal)} />
            {data.trendAnnualRate != null && (
              <DealStat
                label="Trend"
                value={`${data.trendAnnualRate >= 0 ? "+" : ""}${(data.trendAnnualRate * 100).toFixed(1)}%`}
              />
            )}
            <div className="ml-auto text-xs text-slate-400">
              {compStats.count} comps
              {compStats.avgDist != null && (
                <> · {fmtNum(compStats.avgDist, 2)} mi avg</>
              )}
              {compStats.avgScore != null && (
                <> · {fmtNum(compStats.avgScore, 1)} avg score</>
              )}
            </div>
          </div>
        )}

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
                    <th className="px-2 py-1.5 text-left" style={{ width: 52 }}>
                      Pick
                    </th>
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
                          {fmtNum(m.building_area_total_sqft as number | null)}
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

        {/* Footer — action area */}
        {!loading && data && data.candidates.length > 0 && (
          <div className="border-t border-slate-200">
            {/* Already promoted — show link */}
            {isAlreadyPromoted && promotedAnalysisId && (
              <div className="flex items-center justify-between px-4 py-2.5">
                <div className="text-xs text-slate-500">
                  {selectedCount} comp{selectedCount !== 1 ? "s" : ""} picked
                </div>
                <a
                  href={`/deals/watchlist/${promotedAnalysisId}`}
                  className="rounded bg-blue-100 px-3 py-1.5 text-xs font-semibold text-blue-800 hover:bg-blue-200"
                >
                  Open Analysis →
                </a>
              </div>
            )}

            {/* Already passed — show status */}
            {isAlreadyPassed && !isAlreadyPromoted && (
              <div className="flex items-center justify-between px-4 py-2.5">
                <div className="text-xs text-slate-500">
                  Passed: {data.passReason}
                </div>
              </div>
            )}

            {/* Not yet reviewed — show Promote/Pass buttons */}
            {!isReviewed && mode === "view" && (
              <div className="flex items-center justify-between px-4 py-2.5">
                <div className="text-xs text-slate-500">
                  {selectedCount} comp{selectedCount !== 1 ? "s" : ""} picked
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setMode("pass")}
                    className="rounded border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50"
                  >
                    Pass on This Property
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode("promote")}
                    className="rounded bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700"
                  >
                    Add to Watch List
                  </button>
                </div>
              </div>
            )}

            {/* Promote form */}
            {!isReviewed && mode === "promote" && (
              <div className="space-y-3 px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-700">
                    Interest Level
                  </span>
                  <span className="text-[10px] text-slate-400">(required)</span>
                </div>
                <div className="flex gap-2">
                  {INTEREST_LEVELS.map((level) => (
                    <button
                      key={level.value}
                      type="button"
                      onClick={() => setInterestLevel(level.value)}
                      className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs transition-colors ${
                        interestLevel === level.value
                          ? "border-slate-800 bg-slate-900 text-white"
                          : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      <span>{level.icon}</span>
                      <span className="font-semibold">{level.label}</span>
                      <span
                        className={
                          interestLevel === level.value
                            ? "text-slate-300"
                            : "text-slate-400"
                        }
                      >
                        — {level.desc}
                      </span>
                    </button>
                  ))}
                </div>
                <div>
                  <label className="text-xs text-slate-500" htmlFor="wl-note">
                    Note (optional)
                  </label>
                  <input
                    id="wl-note"
                    type="text"
                    value={watchListNote}
                    onChange={(e) => setWatchListNote(e.target.value)}
                    placeholder="e.g. great comps, check basement finish"
                    className="mt-1 w-full rounded border border-slate-200 px-3 py-1.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
                  />
                </div>
                <div className="flex items-center justify-between pt-1">
                  <button
                    type="button"
                    onClick={() => setMode("view")}
                    className="text-xs text-slate-500 hover:text-slate-700"
                  >
                    ← Back
                  </button>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handlePromote(false)}
                      disabled={submitting}
                      className="rounded border border-emerald-300 bg-emerald-50 px-4 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
                    >
                      {submitting ? "Saving..." : "Save to Watch List"}
                    </button>
                    <button
                      type="button"
                      onClick={() => handlePromote(true)}
                      disabled={submitting}
                      className="rounded bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
                    >
                      {submitting ? "Saving..." : "Save + Open Analysis →"}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Pass form */}
            {!isReviewed && mode === "pass" && (
              <div className="space-y-3 px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-700">
                    Pass Reason
                  </span>
                  <span className="text-[10px] text-slate-400">(required)</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {PASS_REASONS.map((reason) => (
                    <button
                      key={reason}
                      type="button"
                      onClick={() => setPassReason(reason)}
                      className={`rounded-lg border px-3 py-1.5 text-xs transition-colors ${
                        passReason === reason
                          ? "border-red-400 bg-red-50 font-semibold text-red-800"
                          : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      {reason}
                    </button>
                  ))}
                </div>
                {passReason === "Other" && (
                  <input
                    type="text"
                    value={passOtherText}
                    onChange={(e) => setPassOtherText(e.target.value)}
                    placeholder="Describe the reason..."
                    className="w-full rounded border border-slate-200 px-3 py-1.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-red-400 focus:outline-none focus:ring-1 focus:ring-red-400"
                  />
                )}
                <div className="flex items-center justify-between pt-1">
                  <button
                    type="button"
                    onClick={() => setMode("view")}
                    className="text-xs text-slate-500 hover:text-slate-700"
                  >
                    ← Back
                  </button>
                  <button
                    type="button"
                    onClick={handlePass}
                    disabled={
                      submitting ||
                      !passReason ||
                      (passReason === "Other" && !passOtherText.trim())
                    }
                    className="rounded bg-red-600 px-4 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-red-700 disabled:opacity-50"
                  >
                    {submitting ? "Saving..." : "Confirm Pass"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function DealStat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] uppercase tracking-wider text-slate-400">
        {label}
      </span>
      <span
        className={`text-xs font-semibold ${highlight ? "text-emerald-700" : "text-slate-900"}`}
      >
        {value}
      </span>
    </div>
  );
}

"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import type { MapPin } from "@/components/properties/comp-map";
import { CompWorkspace } from "@/components/workstation/comp-workspace";
import { DealStatStrip } from "@/components/workstation/deal-stat-strip";
import { SubjectTileRow } from "@/components/workstation/subject-tile-row";
import {
  loadScreeningCompDataAction,
  loadCompDataByRunAction,
  toggleScreeningCompSelectionAction,
  promoteToAnalysisAction,
  passOnScreeningResultAction,
  reactivateScreeningResultAction,
  type ScreeningCompData,
} from "@/app/(workspace)/screening/actions";

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
  /** Screening result ID — provide this when opening from screening tables. */
  resultId?: string | null;
  batchId?: string | null;
  promotedAnalysisId?: string | null;
  /** When opening from a workstation (no screening result), provide these instead. */
  compSearchRunId?: string | null;
  realPropertyId?: string | null;
  onClose: () => void;
};

export function ScreeningCompModal({
  resultId,
  batchId,
  promotedAnalysisId,
  compSearchRunId: compSearchRunIdProp,
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
  const [showSelectedOnly, setShowSelectedOnly] = useState(false);

  // QuickAnalysis overrides
  const [manualArvInput, setManualArvInput] = useState("");
  const [manualTargetProfitInput, setManualTargetProfitInput] = useState("");
  const [manualRehabInput, setManualRehabInput] = useState("");

  // Sort state for candidate table
  type SortCol = "gap" | "impArv" | "days" | "bldg";
  type SortDir = "asc" | "desc";
  const [sortCol, setSortCol] = useState<SortCol>("gap");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const toggleSort = (col: SortCol) => {
    if (sortCol === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortCol(col); setSortDir("desc"); }
  };

  // Determine the loading mode
  const isWorkstationMode = !resultId && !!compSearchRunIdProp && !!realPropertyId;

  // Load data on mount
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const promise = isWorkstationMode
      ? loadCompDataByRunAction(compSearchRunIdProp!, realPropertyId!)
      : loadScreeningCompDataAction(resultId!);
    promise.then((result) => {
      if (!cancelled) {
        setData(result);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [resultId, compSearchRunIdProp, realPropertyId, isWorkstationMode]);

  // Shared reload function
  const reloadData = useCallback(() => {
    setLoading(true);
    const promise = isWorkstationMode
      ? loadCompDataByRunAction(compSearchRunIdProp!, realPropertyId!)
      : loadScreeningCompDataAction(resultId!);
    promise.then((result) => {
      setData(result);
      setLoading(false);
    });
  }, [resultId, compSearchRunIdProp, realPropertyId, isWorkstationMode]);

  // Toggle selection
  const handleToggle = useCallback(
    async (candidateId: string, currentType: "selected" | "candidate") => {
      const fd = new FormData();
      fd.set("candidate_id", candidateId);
      fd.set("next_selected", currentType === "candidate" ? "true" : "false");
      fd.set("batch_id", batchId ?? "");
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

      const compNetPrice = Number(m.net_price) || Number(m.close_price) || 0;
      const perCompGapPerSqft =
        subjectSqft > 0 && compNetPrice > 0 && subjectListPrice > 0
          ? Math.round((compNetPrice - subjectListPrice) / subjectSqft)
          : null;
      const compArvDetail = c.comp_listing_row_id ? data.arvByCompListingId[c.comp_listing_row_id] ?? null : null;

      pins.push({
        id: c.id,
        lat,
        lng,
        label: String(m.address ?? "—"),
        tooltipData: {
          closePrice: compNetPrice || null,
          impliedArv: compArvDetail?.arv ?? null,
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

  // Live-recomputed ARV and deal math based on current comp selection + manual overrides
  const liveDeal = useMemo(() => {
    if (!data) return null;

    // Parse manual overrides from input strings
    const parsedArv = manualArvInput ? Number(manualArvInput.replace(/[,$]/g, "")) : null;
    const parsedTargetProfit = manualTargetProfitInput ? Number(manualTargetProfitInput.replace(/[,$]/g, "")) : null;
    const parsedRehab = manualRehabInput ? Number(manualRehabInput.replace(/[,$]/g, "")) : null;

    // Determine ARV: manual override → comp-based → screening default
    let arv: number;
    if (parsedArv != null && Number.isFinite(parsedArv) && parsedArv > 0) {
      arv = parsedArv;
    } else {
      const selected = data.candidates.filter((c) => c.selected_yn);
      let weightedSum = 0;
      let weightTotal = 0;
      for (const c of selected) {
        const detail = c.comp_listing_row_id
          ? data.arvByCompListingId[c.comp_listing_row_id]
          : null;
        if (detail) {
          weightedSum += detail.arv * detail.weight;
          weightTotal += detail.weight;
        }
      }
      arv = weightTotal > 0
        ? Math.round(weightedSum / weightTotal)
        : (data.arvAggregate ?? 0);
    }

    const targetProfit = (parsedTargetProfit != null && Number.isFinite(parsedTargetProfit))
      ? parsedTargetProfit
      : (data.targetProfit ?? 40_000);

    const rehabTotal = (parsedRehab != null && Number.isFinite(parsedRehab))
      ? parsedRehab
      : (data.rehabTotal ?? 0);

    const costs =
      rehabTotal +
      (data.holdTotal ?? 0) +
      (data.transactionTotal ?? 0) +
      (data.financingTotal ?? 0) +
      targetProfit;
    const maxOffer = Math.round(arv - costs);
    const listPrice = data.subjectListPrice ?? 0;
    const offerPct = listPrice > 0 ? Math.round((maxOffer / listPrice) * 10000) / 10000 : null;
    const sqft = data.subjectBuildingSqft ?? 0;
    const gapPerSqft = listPrice > 0 && sqft > 0
      ? Math.round((arv - listPrice) / sqft)
      : null;
    return { arv, maxOffer, offerPct, gapPerSqft, rehabTotal, targetProfit };
  }, [data, manualArvInput, manualTargetProfitInput, manualRehabInput]);

  // Promote handler
  const handlePromote = useCallback(
    async (openWorkstation: boolean) => {
      setSubmitting(true);
      const fd = new FormData();
      fd.set("result_id", resultId!);
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
    fd.set("result_id", resultId!);
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
      <div className="flex max-h-[90vh] w-[1440px] max-w-[95vw] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">
        {/* Property Header */}
        <div className="border-b border-slate-200 px-4 pt-2.5 pb-2">
          {/* Address row */}
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <h2 className="truncate text-base font-bold text-slate-900">
                {data?.subjectAddress ?? "Loading..."};{" "}
                {data?.subjectCity ?? ""} {data?.postalCode ?? ""}
              </h2>
              {data?.isPrimeCandidate && (
                <span className="shrink-0 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800">
                  Prime
                </span>
              )}
              {isAlreadyPassed && (
                <span className="shrink-0 rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-700">
                  Passed
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 shrink-0 ml-4">
              <span className="text-xs text-slate-500 whitespace-nowrap">
                {[data?.subdivision, data?.county ? `${data.county} County` : null]
                  .filter(Boolean)
                  .join(" | ")}
              </span>
              <button
                type="button"
                onClick={onClose}
                className="rounded px-2.5 py-1 text-sm font-medium text-slate-500 hover:bg-slate-100"
              >
                Close
              </button>
            </div>
          </div>
          {/* Thin divider line */}
          <div className="my-1.5 border-t border-slate-300" />
          {/* Property + MLS tiles side-by-side */}
          {data && (
            <SubjectTileRow
              mlsInfo={{
                mlsStatus: data.mlsStatus ?? "—",
                mlsNumber: data.mlsNumber ?? "—",
                mlsChangeType: data.mlsChangeType ?? "—",
                listDate: data.listDate ?? "—",
                origListPrice: $f(data.originalListPrice),
                ucDate: data.ucDate ?? "—",
                listPrice: $f(data.subjectListPrice),
                closeDate: data.closeDate ?? "—",
              }}
              physical={{
                totalSf: fmtNum(data.subjectBuildingSqft),
                aboveSf: fmtNum(data.aboveGradeSqft),
                belowSf: fmtNum(data.belowGradeTotalSqft),
                basementFinSf: fmtNum(data.belowGradeFinishedSqft),
                beds: data.bedsTotal != null ? String(data.bedsTotal) : "—",
                baths: data.bathsTotal != null ? fmtNum(data.bathsTotal) : "—",
                garage: data.garageSpaces != null ? fmtNum(data.garageSpaces) : "—",
                yearBuilt: data.yearBuilt ?? null,
                levels: data.levelsRaw ?? "—",
                propertyType: data.propertyType ?? "—",
                lotSf: fmtNum(data.lotSizeSqft),
                taxHoa: `${$f(data.annualPropertyTax)} | ${$f(data.annualHoaDues)}`,
              }}
              quickAnalysis={{
                manualArvInput,
                setManualArvInput,
                arvPlaceholder: liveDeal ? `${liveDeal.arv.toLocaleString()}` : "—",
                manualRehabInput,
                setManualRehabInput,
                rehabPlaceholder: data.rehabTotal != null ? `${Math.round(data.rehabTotal).toLocaleString()}` : "—",
                manualTargetProfitInput,
                setManualTargetProfitInput,
                targetProfitPlaceholder: data.targetProfit != null ? `${data.targetProfit.toLocaleString()}` : "40,000",
              }}
            />
          )}
        </div>

        {/* Deal math summary strip — live-recalculated from picked comps */}
        {!loading && data && liveDeal && (
          <DealStatStrip
            arv={liveDeal.arv}
            maxOffer={liveDeal.maxOffer}
            offerPct={liveDeal.offerPct}
            gapPerSqft={liveDeal.gapPerSqft}
            rehabTotal={liveDeal.rehabTotal}
            targetProfit={liveDeal.targetProfit}
            trendAnnualRate={data.trendAnnualRate ?? null}
            rightSlot={
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <span>
                  {compStats.count} comps
                  {compStats.avgDist != null && (
                    <> · {fmtNum(compStats.avgDist, 2)} mi avg</>
                  )}
                  {compStats.avgScore != null && (
                    <> · {fmtNum(compStats.avgScore, 1)} avg score</>
                  )}
                </span>
                <CopyMlsButton
                  label="Copy Selected"
                  mlsNumbers={[
                    ...(data.mlsNumber ? [data.mlsNumber] : []),
                    ...data.candidates
                      .filter((c) => c.selected_yn)
                      .map((c) => ({ mls: String(c.metrics_json.listing_id ?? ""), arv: (c.comp_listing_row_id ? data.arvByCompListingId[c.comp_listing_row_id]?.arv : null) ?? 0 }))
                      .filter((x) => x.mls)
                      .sort((a, b) => b.arv - a.arv)
                      .map((x) => x.mls),
                  ]}
                />
                <CopyMlsButton
                  label="Copy All"
                  mlsNumbers={[
                    ...(data.mlsNumber ? [data.mlsNumber] : []),
                    ...data.candidates
                      .map((c) => ({ mls: String(c.metrics_json.listing_id ?? ""), arv: (c.comp_listing_row_id ? data.arvByCompListingId[c.comp_listing_row_id]?.arv : null) ?? 0 }))
                      .filter((x) => x.mls)
                      .sort((a, b) => b.arv - a.arv)
                      .map((x) => x.mls),
                  ]}
                />
              </div>
            }
          />
        )}

        {/* Body — extracted into <CompWorkspace> in 3E.5.a/b */}
        <CompWorkspace
          loading={loading}
          data={data}
          mapPins={mapPins}
          liveDeal={
            liveDeal
              ? { arv: liveDeal.arv, gapPerSqft: liveDeal.gapPerSqft }
              : null
          }
          compStats={compStats}
          onToggleSelection={handleToggle}
          onMapPinToggle={handleMapPinToggle}
          onReloadData={reloadData}
        />
        {/* Footer — action area (screening mode only) */}
        {!loading && data && data.candidates.length > 0 && !isWorkstationMode && (
          <div className="border-t border-slate-200">
            {/* Already promoted — show link */}
            {isAlreadyPromoted && promotedAnalysisId && (
              <div className="flex items-center justify-between px-4 py-2.5">
                <div className="text-xs text-slate-500">
                  {selectedCount} comp{selectedCount !== 1 ? "s" : ""} picked
                </div>
                <a
                  href={`/analysis/${promotedAnalysisId}`}
                  className="rounded bg-blue-100 px-3 py-1.5 text-xs font-semibold text-blue-800 hover:bg-blue-200"
                >
                  Open Analysis →
                </a>
              </div>
            )}

            {/* Already passed — show status + reactivate */}
            {isAlreadyPassed && !isAlreadyPromoted && (
              <div className="flex items-center justify-between px-4 py-2.5">
                <div className="text-xs text-slate-500">
                  Passed: {data.passReason}
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    setSubmitting(true);
                    try {
                      await reactivateScreeningResultAction(resultId!);
                      setData((prev) =>
                        prev ? { ...prev, reviewAction: null, passReason: null } : prev,
                      );
                      setMode("view");
                      router.refresh();
                    } finally {
                      setSubmitting(false);
                    }
                  }}
                  disabled={submitting}
                  className="rounded border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-50"
                >
                  {submitting ? "Reactivating..." : "Reactivate"}
                </button>
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

        {/* Footer — workstation mode: just show comp count */}
        {!loading && data && data.candidates.length > 0 && isWorkstationMode && (
          <div className="flex items-center justify-between border-t border-slate-200 px-4 py-2.5">
            <div className="text-xs text-slate-500">
              {selectedCount} comp{selectedCount !== 1 ? "s" : ""} picked
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function CopyMlsButton({
  label,
  mlsNumbers,
}: {
  label: string;
  mlsNumbers: string[];
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    if (mlsNumbers.length === 0) return;
    navigator.clipboard.writeText(mlsNumbers.join(", "));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [mlsNumbers]);

  return (
    <button
      type="button"
      onClick={handleCopy}
      disabled={mlsNumbers.length === 0}
      className="rounded border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40"
    >
      {copied ? "Copied!" : `${label} (${mlsNumbers.length})`}
    </button>
  );
}


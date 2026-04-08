"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import type { MapPin } from "@/components/properties/comp-map";
import {
  loadScreeningCompDataAction,
  loadCompDataByRunAction,
  toggleScreeningCompSelectionAction,
  promoteToAnalysisAction,
  passOnScreeningResultAction,
  reactivateScreeningResultAction,
  expandComparableSearchAction,
  addManualScreeningCompAction,
  type ScreeningCompData,
} from "@/app/(workspace)/intake/screening/actions";

const CompMap = dynamic(
  () => import("@/components/properties/comp-map").then((m) => m.CompMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[320px] w-[380px] items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-xs text-slate-400">
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

const LEVEL_CLASS_OPTIONS = [
  { value: "One Story", label: "One Story" },
  { value: "Two Story", label: "Two Story" },
  { value: "Three+ Story", label: "Three+ Story" },
  { value: "Bi-Level", label: "Bi-Level" },
  { value: "Tri-Level", label: "Tri-Level" },
  { value: "Multi-Level", label: "Multi-Level" },
  { value: "Split Level", label: "Split Level" },
] as const;

const BUILDING_FORM_OPTIONS = [
  { value: "house", label: "House" },
  { value: "townhouse_style", label: "Townhouse" },
  { value: "patio_cluster", label: "Patio/Cluster" },
  { value: "duplex", label: "Duplex" },
  { value: "triplex", label: "Triplex" },
  { value: "quadruplex", label: "Quadruplex" },
  { value: "low_rise", label: "Low Rise" },
  { value: "mid_rise", label: "Mid Rise" },
  { value: "high_rise", label: "High Rise" },
  { value: "manufactured_house", label: "Manufactured" },
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

      pins.push({
        id: c.id,
        lat,
        lng,
        label: String(m.address ?? "—"),
        tooltipData: {
          closePrice: compNetPrice || null,
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

  // Live-recomputed ARV and deal math based on current comp selection
  const liveDeal = useMemo(() => {
    if (!data) return null;
    const selected = data.candidates.filter((c) => c.selected_yn);
    // If nothing is picked, show the original screening values
    if (selected.length === 0) {
      return {
        arv: data.arvAggregate,
        maxOffer: data.maxOffer,
        offerPct: data.offerPct,
        gapPerSqft: data.estGapPerSqft,
      };
    }
    // Decay-weighted average of per-comp ARVs for selected comps
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
    if (weightTotal === 0) {
      return {
        arv: data.arvAggregate,
        maxOffer: data.maxOffer,
        offerPct: data.offerPct,
        gapPerSqft: data.estGapPerSqft,
      };
    }
    const arv = Math.round(weightedSum / weightTotal);
    const costs =
      (data.rehabTotal ?? 0) +
      (data.holdTotal ?? 0) +
      (data.transactionTotal ?? 0) +
      (data.financingTotal ?? 0) +
      (data.targetProfit ?? 40_000);
    const maxOffer = Math.round(arv - costs);
    const listPrice = data.subjectListPrice ?? 0;
    const offerPct = listPrice > 0 ? Math.round((maxOffer / listPrice) * 10000) / 10000 : null;
    const sqft = data.subjectBuildingSqft ?? 0;
    const gapPerSqft = listPrice > 0 && sqft > 0
      ? Math.round((arv - listPrice) / sqft)
      : null;
    return { arv, maxOffer, offerPct, gapPerSqft };
  }, [data]);

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
            <div className="flex gap-3">
              {/* MLS Info tile */}
              <div className="shrink-0 rounded border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] leading-snug">
                <div className="grid grid-cols-[auto_auto_1fr_auto_auto] gap-x-2 gap-y-0.5">
                  <span className="font-bold text-slate-500">MLS Status</span>
                  <span className="text-slate-900">{data.mlsStatus ?? "—"}</span>
                  <span />
                  <span className="font-bold text-slate-500">MLS#</span>
                  <span className="text-slate-900">{data.mlsNumber ?? "—"}</span>

                  <span className="font-bold text-slate-500">MLS Change</span>
                  <span className="text-slate-900">{data.mlsChangeType ?? "—"}</span>
                  <span />
                  <span className="font-bold text-slate-500">List Date</span>
                  <span className="text-slate-900">{data.listDate ?? "—"}</span>

                  <span className="font-bold text-slate-500">Orig List Price</span>
                  <span className="text-slate-900">{$f(data.originalListPrice)}</span>
                  <span />
                  <span className="font-bold text-slate-500">U/C Date</span>
                  <span className="text-slate-900">{data.ucDate ?? "—"}</span>

                  <span className="font-bold text-slate-500">List Price</span>
                  <span className="text-slate-900">{$f(data.subjectListPrice)}</span>
                  <span />
                  <span className="font-bold text-slate-500">Close Date</span>
                  <span className="text-slate-900">{data.closeDate ?? "—"}</span>
                </div>
              </div>
              {/* Property Physical tile */}
              <div className="flex-1 rounded border border-slate-200 bg-slate-50 px-3 py-2">
                <div className="grid grid-cols-[auto_auto_1fr_auto_auto_1fr_auto_auto_1fr_auto_auto] gap-x-2 gap-y-0.5 text-[11px] leading-snug">
                  {/* Row 1 */}
                  <span className="font-bold text-slate-500">Total SF</span>
                  <span className="text-slate-900">{fmtNum(data.subjectBuildingSqft)}</span>
                  <span />
                  <span className="font-bold text-slate-500">Beds</span>
                  <span className="text-slate-900">{data.bedsTotal ?? "—"}</span>
                  <span />
                  <span className="font-bold text-slate-500">Type</span>
                  <span className="text-slate-900">{data.propertyType ?? "—"}</span>
                  <span />
                  <span className="font-bold text-slate-500">Ownership</span>
                  <span className="text-slate-900">{data.ownershipRaw ?? "—"}</span>
                  {/* Row 2 */}
                  <span className="font-bold text-slate-500">Above Grade SF</span>
                  <span className="text-slate-900">{fmtNum(data.aboveGradeSqft)}</span>
                  <span />
                  <span className="font-bold text-slate-500">Baths</span>
                  <span className="text-slate-900">{data.bathsTotal != null ? fmtNum(data.bathsTotal) : "—"}</span>
                  <span />
                  <span className="font-bold text-slate-500">Levels</span>
                  <span className="text-slate-900">{data.levelsRaw ?? "—"}</span>
                  <span />
                  <span className="font-bold text-slate-500">Occupant</span>
                  <span className="text-slate-900">{data.occupantType ?? "—"}</span>
                  {/* Row 3 */}
                  <span className="font-bold text-slate-500">Below Grade SF</span>
                  <span className="text-slate-900">{fmtNum(data.belowGradeTotalSqft)}</span>
                  <span />
                  <span className="font-bold text-slate-500">Garage</span>
                  <span className="text-slate-900">{data.garageSpaces != null ? fmtNum(data.garageSpaces) : "—"}</span>
                  <span />
                  <span className="font-bold text-slate-500">Year</span>
                  <span className={data.yearBuilt && data.yearBuilt < 1950 ? "font-bold text-red-600" : "text-slate-900"}>{data.yearBuilt ?? "—"}</span>
                  <span />
                  <span className="font-bold text-slate-500">Taxes / HOA</span>
                  <span className="text-slate-900">
                    {$f(data.annualPropertyTax)} | {$f(data.annualHoaDues)}
                  </span>
                  {/* Row 4 */}
                  <span className="font-bold text-slate-500">Below Finished</span>
                  <span className="text-slate-900">{fmtNum(data.belowGradeFinishedSqft)}</span>
                  <span />
                  <span />
                  <span />
                  <span />
                  <span className="font-bold text-slate-500">Lot SF</span>
                  <span className="text-slate-900">{fmtNum(data.lotSizeSqft)}</span>
                  <span />
                  <span />
                  <span />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Deal math summary strip — live-recalculated from picked comps */}
        {!loading && data && liveDeal && (
          <div className="flex items-center gap-4 border-b border-slate-100 bg-slate-50 px-4 py-2">
            <DealStat label="ARV" value={$f(liveDeal.arv)} highlight />
            <DealStat label="Max Offer" value={$f(liveDeal.maxOffer)} highlight />
            <DealStat label="Offer%" value={fmtPct(liveDeal.offerPct)} />
            <DealStat
              label="Gap/sqft"
              value={
                liveDeal.gapPerSqft != null
                  ? `$${fmtNum(liveDeal.gapPerSqft)}`
                  : "—"
              }
            />
            <DealStat label="Rehab" value={$f(data.rehabTotal)} />
            {data.trendAnnualRate != null && (
              <DealStat
                label="Trend"
                value={`${data.trendAnnualRate >= 0 ? "+" : ""}${(data.trendAnnualRate * 100).toFixed(1)}%`}
              />
            )}
            <div className="ml-auto flex items-center gap-2 text-xs text-slate-400">
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
                mlsNumbers={data.candidates
                  .filter((c) => c.selected_yn)
                  .map((c) => String(c.metrics_json.listing_id ?? ""))
                  .filter(Boolean)}
              />
              <CopyMlsButton
                label="Copy All"
                mlsNumbers={data.candidates
                  .map((c) => String(c.metrics_json.listing_id ?? ""))
                  .filter(Boolean)}
              />
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
            {/* Left: Map + legend */}
            <div className="shrink-0 border-r border-slate-200 p-3">
              <CompMap
                pins={mapPins}
                height={320}
                className="!w-[380px]"
                subjectLat={data.subjectLat}
                subjectLng={data.subjectLng}
                onPinClick={handleMapPinToggle}
              />
              <div className="mt-1.5 flex items-center gap-3 text-[10px] text-slate-400">
                {/* Subject */}
                <span className="flex items-center gap-1">
                  <span className="inline-block h-3 w-3 rounded-full bg-red-600" style={{ border: "2px solid #fff", boxShadow: "0 0 0 1.5px #dc2626" }} />
                  Subject
                </span>
                {/* Picked */}
                <span className="flex items-center gap-1">
                  <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500" style={{ border: "2px solid #fff", boxShadow: "0 0 0 1px #16a34a" }} />
                  Picked
                </span>
                {/* Candidate — gap/sqft border key */}
                <span className="flex items-center gap-1">
                  <span className="inline-block h-2 w-2 rounded-full bg-slate-400" style={{ border: "2px solid #16a34a" }} />
                  <span className="text-slate-500">≥$60</span>
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block h-2 w-2 rounded-full bg-slate-400" style={{ border: "2px solid #ca8a04" }} />
                  <span className="text-slate-500">≥$30</span>
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block h-2 w-2 rounded-full bg-slate-400" style={{ border: "2px solid #dc2626" }} />
                  <span className="text-slate-500">&lt;$30</span>
                </span>
                <span className="ml-auto text-slate-300">gap/sqft</span>
              </div>
              {/* Add comp by MLS # */}
              {data.compSearchRunId && (
                <AddCompByMls
                  compSearchRunId={data.compSearchRunId}
                  subjectPropertyId={data.realPropertyId}
                  onAdded={reloadData}
                />
              )}
              {/* Expand Search */}
              {data.compSearchRunId && (
                <ExpandSearchPanel
                  compSearchRunId={data.compSearchRunId}
                  realPropertyId={data.realPropertyId}
                  onComplete={reloadData}
                />
              )}
            </div>

            {/* Right: Dense candidate table */}
            <div className="flex-1 overflow-auto">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="sticky top-0 z-20 bg-slate-50 text-[9px] uppercase tracking-wider text-slate-500" style={{ height: 22 }}>
                    <th className="px-1 py-0.5 text-left" style={{ width: 42 }}></th>
                    <th className="px-1 py-0.5 text-left" style={{ maxWidth: 140 }}>Address</th>
                    <th className="px-1 py-0.5 text-right">Dist</th>
                    <th className="px-1 py-0.5 text-left" style={{ maxWidth: 110 }}>Subdiv</th>
                    <th className="px-1 py-0.5 text-left" style={{ maxWidth: 56 }}>Lvl</th>
                    <th className="px-1 py-0.5 text-right">Net Price</th>
                    <th className="px-1 py-0.5 text-right">Imp ARV</th>
                    <th className="px-1 py-0.5 text-right">Gap</th>
                    <th className="px-1 py-0.5 text-right">Days</th>
                    <th className="px-1 py-0.5 text-right">Year</th>
                    <th className="px-1 py-0.5 text-right" style={{ width: 24 }}>Bd</th>
                    <th className="px-1 py-0.5 text-right" style={{ width: 24 }}>Ba</th>
                    <th className="px-1 py-0.5 text-right" style={{ width: 24 }}>Gar</th>
                    <th className="px-1 py-0.5 text-right">Bldg SF</th>
                    <th className="px-1 py-0.5 text-right">Bsmt</th>
                    <th className="px-1 py-0.5 text-right">BsFin</th>
                    <th className="px-1 py-0.5 text-right">Lot</th>
                    <th className="px-1 py-0.5 text-right" style={{ width: 34 }}>Score</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Subject property row — sticky below header */}
                  <tr className="sticky z-20 border-b border-red-200 bg-red-50 font-semibold text-slate-900" style={{ top: 22 }}>
                    <td className="px-1 py-0.5">
                      <span className="rounded bg-red-600 px-1 py-0.5 text-[8px] font-bold uppercase text-white">
                        Subject
                      </span>
                    </td>
                    <td className="max-w-[140px] truncate px-1 py-0.5" title={data.subjectAddress}>
                      {data.subjectAddress}
                    </td>
                    <td className="px-1 py-0.5 text-right">—</td>
                    <td className="max-w-[110px] truncate px-1 py-0.5" title={data.subdivision ?? ""}>
                      {data.subdivision ?? "—"}
                    </td>
                    <td className="max-w-[56px] truncate px-1 py-0.5">
                      {data.levelsRaw ?? "—"}
                    </td>
                    <td className="px-1 py-0.5 text-right">
                      {$f(data.subjectListPrice)}
                    </td>
                    <td className="px-1 py-0.5 text-right">
                      {liveDeal?.arv != null ? $f(liveDeal.arv) : "—"}
                    </td>
                    <td className="px-1 py-0.5 text-right">
                      {liveDeal?.gapPerSqft != null ? `$${fmtNum(liveDeal.gapPerSqft)}` : "—"}
                    </td>
                    <td className="px-1 py-0.5 text-right">—</td>
                    <td className="px-1 py-0.5 text-right">
                      {data.yearBuilt != null ? String(data.yearBuilt) : "—"}
                    </td>
                    <td className="px-1 py-0.5 text-right">{data.bedsTotal ?? "—"}</td>
                    <td className="px-1 py-0.5 text-right">{data.bathsTotal != null ? fmtNum(data.bathsTotal) : "—"}</td>
                    <td className="px-1 py-0.5 text-right">{data.garageSpaces != null ? fmtNum(data.garageSpaces) : "—"}</td>
                    <td className="px-1 py-0.5 text-right">{fmtNum(data.subjectBuildingSqft)}</td>
                    <td className="px-1 py-0.5 text-right">{fmtNum(data.belowGradeTotalSqft)}</td>
                    <td className="px-1 py-0.5 text-right">{fmtNum(data.belowGradeFinishedSqft)}</td>
                    <td className="px-1 py-0.5 text-right">{fmtNum(data.lotSizeSqft)}</td>
                    <td className="px-1 py-0.5 text-right">
                      {compStats.avgScore != null ? fmtNum(compStats.avgScore, 1) : "—"}
                    </td>
                  </tr>
                  {data.candidates.map((c) => {
                    const m = c.metrics_json;
                    const netPrice = (m.net_price as number) ?? (m.close_price as number) ?? null;
                    const arvDetail = c.comp_listing_row_id
                      ? data.arvByCompListingId[c.comp_listing_row_id] ?? null
                      : null;
                    const impliedArv = arvDetail?.arv ?? null;
                    const subjectSqftVal = data.subjectBuildingSqft ?? 0;
                    const subjectListVal = data.subjectListPrice ?? 0;
                    const gapPerSqft =
                      netPrice != null && subjectSqftVal > 0 && subjectListVal > 0
                        ? Math.round((netPrice - subjectListVal) / subjectSqftVal)
                        : null;
                    const gapClass =
                      gapPerSqft != null && gapPerSqft >= 60
                        ? "text-emerald-600 font-semibold"
                        : gapPerSqft != null && gapPerSqft < 30
                          ? "text-red-600 font-semibold"
                          : "text-slate-700";
                    const days = c.days_since_close;
                    const daysClass =
                      days != null && days > 180
                        ? "text-red-600"
                        : days != null && days < 60
                          ? "text-emerald-600"
                          : "text-slate-700";
                    return (
                      <tr
                        key={c.id}
                        className={`border-t border-slate-100 ${c.selected_yn ? "bg-emerald-50/60" : "hover:bg-slate-50"}`}
                      >
                        <td className="px-1 py-0.5">
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
                                ? "rounded border border-emerald-300 bg-emerald-100 px-1 py-0.5 text-[8px] font-bold uppercase text-emerald-800"
                                : "rounded border border-slate-300 bg-white px-1 py-0.5 text-[8px] font-bold uppercase text-slate-600 hover:bg-slate-50"
                            }
                          >
                            {c.selected_yn ? "Picked" : "Pick"}
                          </button>
                        </td>
                        <td
                          className={`max-w-[140px] truncate px-1 py-0.5 ${c.selected_yn ? "font-semibold text-slate-900" : "text-slate-700"}`}
                          title={String(m.address ?? "")}
                        >
                          {String(m.address ?? "—")}
                        </td>
                        <td className="px-1 py-0.5 text-right text-slate-700">
                          {fmtNum(c.distance_miles, 2)}
                        </td>
                        <td
                          className="max-w-[110px] truncate px-1 py-0.5 text-slate-700"
                          title={String(m.subdivision_name ?? "")}
                        >
                          {String(m.subdivision_name ?? "—")}
                        </td>
                        <td className="max-w-[56px] truncate px-1 py-0.5 text-slate-700" title={String(m.level_class_standardized ?? "")}>
                          {String(m.level_class_standardized ?? "—")}
                        </td>
                        <td className="px-1 py-0.5 text-right text-slate-700">
                          {$f(netPrice)}
                        </td>
                        <td className="px-1 py-0.5 text-right font-semibold text-slate-900">
                          {impliedArv != null ? $f(impliedArv) : "—"}
                        </td>
                        <td className={`px-1 py-0.5 text-right ${gapClass}`}>
                          {gapPerSqft != null ? `$${fmtNum(gapPerSqft)}` : "—"}
                        </td>
                        <td className={`px-1 py-0.5 text-right font-semibold ${daysClass}`}>
                          {days ?? "—"}
                        </td>
                        <td className="px-1 py-0.5 text-right text-slate-700">
                          {m.year_built != null ? String(m.year_built) : "—"}
                        </td>
                        <td className="px-1 py-0.5 text-right text-slate-700">
                          {m.bedrooms_total != null ? fmtNum(m.bedrooms_total as number) : "—"}
                        </td>
                        <td className="px-1 py-0.5 text-right text-slate-700">
                          {m.bathrooms_total != null ? fmtNum(m.bathrooms_total as number) : "—"}
                        </td>
                        <td className="px-1 py-0.5 text-right text-slate-700">
                          {m.garage_spaces != null ? fmtNum(m.garage_spaces as number) : "—"}
                        </td>
                        <td className="px-1 py-0.5 text-right text-slate-700">
                          {fmtNum(m.building_area_total_sqft as number | null)}
                        </td>
                        <td className="px-1 py-0.5 text-right text-slate-700">
                          {fmtNum(m.below_grade_total_sqft as number | null)}
                        </td>
                        <td className="px-1 py-0.5 text-right text-slate-700">
                          {fmtNum(m.below_grade_finished_area_sqft as number | null)}
                        </td>
                        <td className="px-1 py-0.5 text-right text-slate-700">
                          {fmtNum(m.lot_size_sqft as number | null)}
                        </td>
                        <td className="px-1 py-0.5 text-right font-semibold text-slate-900">
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
                  href={`/deals/watchlist/${promotedAnalysisId}`}
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

function ExpandSearchPanel({
  compSearchRunId,
  realPropertyId,
  onComplete,
}: {
  compSearchRunId: string;
  realPropertyId: string;
  onComplete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ added: number; total: number } | null>(null);

  // Form state with sensible expanded defaults
  const [radius, setRadius] = useState("1.5");
  const [days, setDays] = useState("540");
  const [sqft, setSqft] = useState("40");
  const [levelClasses, setLevelClasses] = useState<string[]>([]);
  const [buildingForms, setBuildingForms] = useState<string[]>([]);

  const handleRun = useCallback(async () => {
    setRunning(true);
    setResult(null);
    try {
      const r = await expandComparableSearchAction(compSearchRunId, realPropertyId, {
        maxDistanceMiles: parseFloat(radius),
        maxDaysSinceClose: parseInt(days, 10),
        sqftTolerancePct: parseInt(sqft, 10),
        requireSameLevelClass: false,
        requireSameBuildingForm: false,
        targetLevelClasses: levelClasses,
        targetBuildingForms: buildingForms,
        maxCandidates: 50,
      });
      setResult(r);
      if (r.added > 0) onComplete();
    } finally {
      setRunning(false);
    }
  }, [compSearchRunId, realPropertyId, radius, days, sqft, levelClasses, buildingForms, onComplete]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-2 w-full rounded border border-blue-200 bg-blue-50 px-2 py-1.5 text-[10px] font-semibold text-blue-700 hover:bg-blue-100"
      >
        Expand Comparable Search
      </button>
    );
  }

  return (
    <div className="mt-2 rounded border border-blue-200 bg-blue-50 px-2.5 py-2 text-[11px]">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-semibold text-blue-800">Expand Search</span>
        <button type="button" onClick={() => setOpen(false)} className="text-blue-400 hover:text-blue-600">✕</button>
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
        <label className="flex items-center justify-between">
          <span className="text-slate-600">Radius (mi)</span>
          <input type="number" step="0.1" min="0.1" max="5" value={radius} onChange={(e) => setRadius(e.target.value)}
            className="w-14 rounded border border-slate-200 px-1.5 py-0.5 text-right text-[11px]" />
        </label>
        <MultiCheckDropdown
          label="Building Form"
          selected={buildingForms}
          onChange={setBuildingForms}
          options={BUILDING_FORM_OPTIONS}
        />
        <label className="flex items-center justify-between">
          <span className="text-slate-600">SqFt Tol %</span>
          <input type="number" step="5" min="10" max="60" value={sqft} onChange={(e) => setSqft(e.target.value)}
            className="w-14 rounded border border-slate-200 px-1.5 py-0.5 text-right text-[11px]" />
        </label>
        <MultiCheckDropdown
          label="Level Class"
          selected={levelClasses}
          onChange={setLevelClasses}
          options={LEVEL_CLASS_OPTIONS}
        />
        <label className="flex items-center justify-between">
          <span className="text-slate-600">Max Days</span>
          <input type="number" step="30" min="90" max="730" value={days} onChange={(e) => setDays(e.target.value)}
            className="w-14 rounded border border-slate-200 px-1.5 py-0.5 text-right text-[11px]" />
        </label>
      </div>
      <div className="mt-2 flex items-center justify-between">
        <button
          type="button"
          onClick={handleRun}
          disabled={running}
          className="rounded bg-blue-600 px-3 py-1 text-[10px] font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {running ? "Searching..." : "Run Expanded Search"}
        </button>
        {result && (
          <span className="text-[10px] text-blue-700">
            +{result.added} new comp{result.added !== 1 ? "s" : ""} ({result.total} total)
          </span>
        )}
      </div>
    </div>
  );
}

function AddCompByMls({
  compSearchRunId,
  subjectPropertyId,
  onAdded,
}: {
  compSearchRunId: string;
  subjectPropertyId: string;
  onAdded: () => void;
}) {
  const [mls, setMls] = useState("");
  const [adding, setAdding] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const handleAdd = useCallback(async () => {
    if (!mls.trim()) return;
    setAdding(true);
    setMsg(null);
    const result = await addManualScreeningCompAction(compSearchRunId, subjectPropertyId, mls.trim());
    if (result.ok) {
      setMsg({ ok: true, text: `MLS# ${mls.trim()} added.` });
      setMls("");
      onAdded();
    } else {
      setMsg({ ok: false, text: result.error });
    }
    setAdding(false);
  }, [compSearchRunId, subjectPropertyId, mls, onAdded]);

  return (
    <div className="mt-2 flex items-center gap-1.5">
      <input
        type="text"
        value={mls}
        onChange={(e) => { setMls(e.target.value); setMsg(null); }}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAdd(); } }}
        placeholder="Add by MLS#"
        className="w-[120px] rounded border border-slate-200 px-1.5 py-1 text-[11px] text-slate-900 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none"
      />
      <button
        type="button"
        onClick={handleAdd}
        disabled={adding || !mls.trim()}
        className="rounded bg-slate-700 px-2 py-1 text-[10px] font-semibold text-white hover:bg-slate-800 disabled:opacity-40"
      >
        {adding ? "..." : "Add"}
      </button>
      {msg && (
        <span className={`text-[10px] ${msg.ok ? "text-emerald-600" : "text-red-600"}`}>
          {msg.text}
        </span>
      )}
    </div>
  );
}

function MultiCheckDropdown({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: readonly { value: string; label: string }[];
  selected: string[];
  onChange: (v: string[]) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [isOpen]);

  const toggle = (value: string) => {
    onChange(
      selected.includes(value)
        ? selected.filter((v) => v !== value)
        : [...selected, value],
    );
  };

  const summary =
    selected.length === 0
      ? "Any"
      : selected.length <= 2
        ? selected.map((v) => options.find((o) => o.value === v)?.label ?? v).join(", ")
        : `${selected.length} selected`;

  return (
    <div className="flex items-center justify-between" ref={ref}>
      <span className="text-slate-600">{label}</span>
      <div className="relative">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="w-[110px] truncate rounded border border-slate-200 bg-white px-1.5 py-0.5 text-left text-[11px] text-slate-700 hover:bg-slate-50"
        >
          {summary}
          <span className="float-right text-slate-400">&#9662;</span>
        </button>
        {isOpen && (
          <div className="absolute right-0 z-50 mt-0.5 max-h-[180px] w-[140px] overflow-auto rounded border border-slate-200 bg-white py-0.5 shadow-lg">
            {options.map((opt) => (
              <label
                key={opt.value}
                className="flex cursor-pointer items-center gap-1.5 px-2 py-0.5 text-[11px] hover:bg-slate-50"
              >
                <input
                  type="checkbox"
                  checked={selected.includes(opt.value)}
                  onChange={() => toggle(opt.value)}
                  className="h-3 w-3"
                />
                <span className="text-slate-700">{opt.label}</span>
              </label>
            ))}
            {selected.length > 0 && (
              <button
                type="button"
                onClick={() => onChange([])}
                className="mt-0.5 w-full border-t border-slate-100 px-2 py-1 text-left text-[10px] text-blue-600 hover:bg-slate-50"
              >
                Clear all (Any)
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

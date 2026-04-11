"use client";

import { useState, useMemo, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { MapPin, MapPinTooltipData } from "@/components/properties/comp-map";
import { ScreeningCompModal } from "@/components/screening/screening-comp-modal";
import { ArvBreakdownTooltip } from "@/components/screening/arv-breakdown-tooltip";
import { CardTitle } from "@/components/workstation/card-title";
import { CostLine } from "@/components/workstation/cost-line";
import { DealStat } from "@/components/workstation/deal-stat";
import { RehabCard } from "@/components/workstation/rehab-card";
import { SubjectTileRow } from "@/components/workstation/subject-tile-row";
import {
  TrendDirectionBadge,
  TrendTierColumn,
} from "@/components/workstation/trend-badges";

const CompMap = dynamic(
  () => import("@/components/properties/comp-map").then((m) => m.CompMap),
  { ssr: false, loading: () => <div className="flex h-[340px] items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-xs text-slate-400">Loading map...</div> },
);
import {
  saveManualAnalysisAction,
  addAnalysisNoteAction,
  deleteAnalysisNoteAction,
  savePipelineAction,
  toggleComparableCandidateSelectionAction,
  toggleAsIsComparableCandidateSelectionAction,
  markAnalysisCompleteAction,
} from "@/app/(workspace)/deals/actions";
import { initialManualAnalysisFormState } from "@/lib/analysis/manual-analysis-state";
import { ComparableWorkspacePanel } from "@/components/properties/comparable-workspace-panel";
import { fmt, fmtNum, fmtPct } from "@/lib/reports/format";
import { generateReportAction } from "@/app/(workspace)/reports/actions";
import type {
  RehabCategoryScopes,
  RehabCategoryScopeDetail,
  HoldingDetail,
  TransactionDetail,
  FinancingDetail,
  ArvPerCompDetail,
  TrendData,
  WorkstationData,
} from "@/lib/reports/types";

// ---------------------------------------------------------------------------
// Tiny sub-components
// ---------------------------------------------------------------------------

/** Format an ISO date string ("YYYY-MM-DD" or full timestamp) as mm/dd/yy without TZ shifts. */
function fmtIsoDate(v: string | null | undefined): string {
  if (!v) return "\u2014";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  if (!m) return "\u2014";
  return `${m[2]}/${m[3]}/${m[1].slice(2)}`;
}

const NOTE_CATEGORIES = [
  { value: "location", label: "Location", icon: "L" },
  { value: "scope", label: "Scope", icon: "S" },
  { value: "valuation", label: "Valuation", icon: "V" },
  { value: "property", label: "Property", icon: "P" },
  { value: "internal", label: "Internal", icon: "I" },
  { value: "offer", label: "Offer", icon: "O" },
];

const PIPELINE_INTEREST = ["Low", "Medium", "High", "Hot"];
const PIPELINE_SHOWING = ["Not Scheduled", "Scheduled", "Complete", "Virtual Complete"];
const PIPELINE_OFFER = ["No Offer", "Drafting", "Submitted", "Accepted", "Expired", "Rejected"];


// ---------------------------------------------------------------------------
// Main workstation component
// ---------------------------------------------------------------------------

export function AnalysisWorkstation({ data }: { data: WorkstationData }) {
  const router = useRouter();
  const [showCompModal, setShowCompModal] = useState(false);
  const [showAsIsCompModal, setShowAsIsCompModal] = useState(false);
  const [showNoteForm, setShowNoteForm] = useState(false);
  const [showHoldTransDetail, setShowHoldTransDetail] = useState(false);
  const [showReportDialog, setShowReportDialog] = useState(false);
  const [reportTitle, setReportTitle] = useState("");
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [completedAt, setCompletedAt] = useState<string | null>(data.analysis.analysisCompletedAt ?? null);
  const [isMarkingComplete, setIsMarkingComplete] = useState(false);
  const [noteCategory, setNoteCategory] = useState("location");
  const [noteBody, setNoteBody] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [copiedAll, setCopiedAll] = useState(false);
  const [copiedSelected, setCopiedSelected] = useState(false);
  const [copiedSelectedAsIs, setCopiedSelectedAsIs] = useState(false);

  // Quick Analysis overrides — local-only, recalculate live without persisting
  const [manualArvInput, setManualArvInput] = useState("");
  const [manualRehabInput, setManualRehabInput] = useState("");
  const [manualTargetProfitInput, setManualTargetProfitInput] = useState("");
  // Ref so Tab from Target Profit jumps directly to Copy Selected MLS#
  // (skipping the Hold & Trans Detail toggle which is the natural next focus)
  const copySelectedMlsBtnRef = useRef<HTMLButtonElement | null>(null);

  const d = data;
  const p = d.physical;

  const profileRules = d.compModalData.latestRun?.parameters_json ?? {};

  // Toggle comp selection from map click
  const handleMapPinToggle = useCallback(
    async (pinId: string, currentType: "selected" | "candidate") => {
      const fd = new FormData();
      fd.set("candidate_id", pinId);
      fd.set("property_id", d.propertyId);
      fd.set("analysis_id", d.analysisId);
      fd.set("next_selected", currentType === "candidate" ? "true" : "false");
      await toggleComparableCandidateSelectionAction(fd);
      router.refresh();
    },
    [d.propertyId, d.analysisId, router],
  );

  const _subjSqft = d.physical?.buildingSqft ?? 0;
  const _subjListPrice = d.listing?.listPrice ?? 0;

  const _arvMap = d.compModalData.arvByCompListingId;

  // Build selected comps list for the table
  const selectedComps = useMemo(() => {
    return d.compModalData.compCandidates
      .filter((c) => Boolean(c.selected_yn))
      .map((c) => {
        const m = (c.metrics_json ?? {}) as Record<string, unknown>;
        const netPrice = (m.net_price as number) ?? (m.close_price as number) ?? null;
        const gapPerSqft = netPrice != null && _subjSqft > 0 && _subjListPrice > 0
          ? Math.round((netPrice - _subjListPrice) / _subjSqft) : null;
        const arvDetail = c.comp_listing_row_id ? _arvMap[c.comp_listing_row_id as string] ?? null : null;
        return {
          id: String(c.id),
          address: String(m.address ?? "\u2014"),
          netPrice,
          closePrice: (m.net_price as number) ?? (m.close_price as number) ?? null,
          ppsf: m.ppsf as number | null,
          sqft: m.building_area_total_sqft as number | null,
          distance: c.distance_miles as number | null,
          days: c.days_since_close as number | null,
          closeDate: m.close_date ? String(m.close_date).slice(0, 10) : null,
          subdivision: String(m.subdivision_name ?? ""),
          levelClass: String(m.level_class_standardized ?? ""),
          yearBuilt: m.year_built as number | null,
          beds: m.bedrooms_total as number | null,
          baths: m.bathrooms_total as number | null,
          garageSpaces: m.garage_spaces as number | null,
          bldgSf: m.building_area_total_sqft as number | null,
          abvSf: m.above_grade_finished_area_sqft as number | null,
          bsmt: m.below_grade_total_sqft as number | null,
          bsFin: m.below_grade_finished_area_sqft as number | null,
          lot: m.lot_size_sqft as number | null,
          score: c.raw_score as number | null,
          gapPerSqft,
          impliedArv: arvDetail?.arv ?? null,
          arvBreakdown: arvDetail ?? null,
        };
      });
  }, [d, _subjSqft, _subjListPrice, _arvMap]);

  // Live-recomputed deal math driven by Quick Analysis overrides.
  // Mirrors the logic in ScreeningCompModal so the workstation reacts instantly
  // to manual ARV / rehab / target profit edits without persisting.
  const liveDeal = useMemo(() => {
    const parsedArv = manualArvInput ? Number(manualArvInput.replace(/[,$]/g, "")) : null;
    const parsedRehab = manualRehabInput ? Number(manualRehabInput.replace(/[,$]/g, "")) : null;
    const parsedTargetProfit = manualTargetProfitInput ? Number(manualTargetProfitInput.replace(/[,$]/g, "")) : null;

    const arv = (parsedArv != null && Number.isFinite(parsedArv) && parsedArv > 0)
      ? parsedArv
      : (d.arv.effective ?? 0);

    const rehabTotal = (parsedRehab != null && Number.isFinite(parsedRehab))
      ? parsedRehab
      : (d.rehab.effective ?? 0);

    const targetProfit = (parsedTargetProfit != null && Number.isFinite(parsedTargetProfit))
      ? parsedTargetProfit
      : (d.dealMath?.targetProfit ?? 40_000);

    const holdTotal = d.holding?.total ?? 0;
    const transactionTotal = d.transaction?.total ?? 0;
    const financingTotal = d.financing?.total ?? 0;

    const costs = rehabTotal + holdTotal + transactionTotal + financingTotal + targetProfit;
    const maxOffer = Math.round(arv - costs);
    const listPrice = d.listing?.listPrice ?? 0;
    const offerPct = listPrice > 0 ? Math.round((maxOffer / listPrice) * 10000) / 10000 : null;
    const sqft = d.physical?.buildingSqft ?? 0;
    const gapPerSqft = listPrice > 0 && sqft > 0
      ? Math.round((arv - listPrice) / sqft)
      : null;

    return { arv, maxOffer, offerPct, gapPerSqft, rehabTotal, targetProfit };
  }, [d, manualArvInput, manualRehabInput, manualTargetProfitInput]);

  // Build selected As-Is comps list — same candidate pool, different selection flag
  const selectedAsIsComps = useMemo(() => {
    return d.compModalData.compCandidates
      .filter((c) => Boolean(c.selected_as_is_yn))
      .map((c) => {
        const m = (c.metrics_json ?? {}) as Record<string, unknown>;
        const netPrice = (m.net_price as number) ?? (m.close_price as number) ?? null;
        const gapPerSqft = netPrice != null && _subjSqft > 0 && _subjListPrice > 0
          ? Math.round((netPrice - _subjListPrice) / _subjSqft) : null;
        const arvDetail = c.comp_listing_row_id ? _arvMap[c.comp_listing_row_id as string] ?? null : null;
        return {
          id: String(c.id),
          address: String(m.address ?? "\u2014"),
          netPrice,
          closePrice: (m.net_price as number) ?? (m.close_price as number) ?? null,
          ppsf: m.ppsf as number | null,
          sqft: m.building_area_total_sqft as number | null,
          distance: c.distance_miles as number | null,
          days: c.days_since_close as number | null,
          closeDate: m.close_date ? String(m.close_date).slice(0, 10) : null,
          subdivision: String(m.subdivision_name ?? ""),
          levelClass: String(m.level_class_standardized ?? ""),
          yearBuilt: m.year_built as number | null,
          beds: m.bedrooms_total as number | null,
          baths: m.bathrooms_total as number | null,
          garageSpaces: m.garage_spaces as number | null,
          bldgSf: m.building_area_total_sqft as number | null,
          abvSf: m.above_grade_finished_area_sqft as number | null,
          bsmt: m.below_grade_total_sqft as number | null,
          bsFin: m.below_grade_finished_area_sqft as number | null,
          lot: m.lot_size_sqft as number | null,
          score: c.raw_score as number | null,
          gapPerSqft,
          impliedArv: arvDetail?.arv ?? null,
          arvBreakdown: arvDetail ?? null,
        };
      });
  }, [d, _subjSqft, _subjListPrice, _arvMap]);

  // MLS number clipboard helpers
  const allMlsText = useMemo(() => {
    const nums = [
      d.compModalData.subjectListingMlsNumber,
      ...d.compModalData.compCandidates.map((c) => {
        const m = (c.metrics_json ?? {}) as Record<string, unknown>;
        return c.listing_id ?? m.listing_id ?? m.mls_number ?? m.mlsNumber ?? null;
      }),
    ].filter((v): v is string => typeof v === "string" && v.length > 0);
    return [...new Set(nums)].join(", ");
  }, [d]);

  const selectedMlsText = useMemo(() => {
    const nums = [
      d.compModalData.subjectListingMlsNumber,
      ...d.compModalData.compCandidates
        .filter((c) => Boolean(c.selected_yn))
        .map((c) => {
          const m = (c.metrics_json ?? {}) as Record<string, unknown>;
          return c.listing_id ?? m.listing_id ?? m.mls_number ?? m.mlsNumber ?? null;
        }),
    ].filter((v): v is string => typeof v === "string" && v.length > 0);
    return [...new Set(nums)].join(", ");
  }, [d]);

  async function handleCopyAllMls() {
    if (!allMlsText) return;
    try {
      await navigator.clipboard.writeText(allMlsText);
      setCopiedAll(true);
      window.setTimeout(() => setCopiedAll(false), 1800);
    } catch { /* noop */ }
  }

  async function handleCopySelectedMls() {
    if (!selectedMlsText) return;
    try {
      await navigator.clipboard.writeText(selectedMlsText);
      setCopiedSelected(true);
      window.setTimeout(() => setCopiedSelected(false), 1800);
    } catch { /* noop */ }
  }

  // As-Is MLS number clipboard helpers — same pool, filtered by selected_as_is_yn
  const selectedAsIsMlsText = useMemo(() => {
    const nums = [
      d.compModalData.subjectListingMlsNumber,
      ...d.compModalData.compCandidates
        .filter((c) => Boolean(c.selected_as_is_yn))
        .map((c) => {
          const m = (c.metrics_json ?? {}) as Record<string, unknown>;
          return c.listing_id ?? m.listing_id ?? m.mls_number ?? m.mlsNumber ?? null;
        }),
    ].filter((v): v is string => typeof v === "string" && v.length > 0);
    return [...new Set(nums)].join(", ");
  }, [d]);

  async function handleCopySelectedAsIsMls() {
    if (!selectedAsIsMlsText) return;
    try {
      await navigator.clipboard.writeText(selectedAsIsMlsText);
      setCopiedSelectedAsIs(true);
      window.setTimeout(() => setCopiedSelectedAsIs(false), 1800);
    } catch { /* noop */ }
  }

  // Build map pins
  const subjectSqft = p?.buildingSqft ?? 0;
  const subjectListPrice = d.listing?.listPrice ?? 0;

  const mapPins = useMemo<MapPin[]>(() => {
    const pins: MapPin[] = [];

    if (d.property.latitude && d.property.longitude) {
      pins.push({
        id: "subject",
        lat: d.property.latitude,
        lng: d.property.longitude,
        label: d.property.address,
        tooltipData: {
          listPrice: subjectListPrice || null,
          sqft: subjectSqft || null,
          gapPerSqft: d.dealMath?.estGapPerSqft ?? null,
        },
        type: "subject",
      });
    }

    for (const c of d.compModalData.compCandidates) {
      const m = (c.metrics_json ?? {}) as Record<string, unknown>;
      const lat = Number(m.latitude);
      const lng = Number(m.longitude);
      if (!lat || !lng || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;

      const compSqft = Number(m.building_area_total_sqft) || null;
      const sqftDelta = compSqft && subjectSqft ? subjectSqft - compSqft : null;
      const sqftDeltaPct = compSqft && subjectSqft ? (subjectSqft - compSqft) / subjectSqft : null;

      const compNetPrice = Number(m.net_price) || Number(m.close_price) || 0;
      const perCompGapPerSqft =
        subjectSqft > 0 && compNetPrice > 0 && subjectListPrice > 0
          ? Math.round((compNetPrice - subjectListPrice) / subjectSqft)
          : null;
      const compArvDetail = c.comp_listing_row_id ? _arvMap[c.comp_listing_row_id as string] ?? null : null;

      const isSelected = Boolean(c.selected_yn);
      pins.push({
        id: String(c.id),
        lat,
        lng,
        label: String(m.address ?? "\u2014"),
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
        type: isSelected ? "selected" : "candidate",
      });
    }

    return pins;
  }, [d, subjectSqft, subjectListPrice]);

  // As-Is map pins — same candidates, but selected/candidate reflects selected_as_is_yn
  const asIsMapPins = useMemo<MapPin[]>(() => {
    const pins: MapPin[] = [];

    if (d.property.latitude && d.property.longitude) {
      pins.push({
        id: "subject",
        lat: d.property.latitude,
        lng: d.property.longitude,
        label: d.property.address,
        tooltipData: {
          listPrice: subjectListPrice || null,
          sqft: subjectSqft || null,
          gapPerSqft: d.dealMath?.estGapPerSqft ?? null,
        },
        type: "subject",
      });
    }

    for (const c of d.compModalData.compCandidates) {
      const m = (c.metrics_json ?? {}) as Record<string, unknown>;
      const lat = Number(m.latitude);
      const lng = Number(m.longitude);
      if (!lat || !lng || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;

      const compSqft = Number(m.building_area_total_sqft) || null;
      const sqftDelta = compSqft && subjectSqft ? subjectSqft - compSqft : null;
      const sqftDeltaPct = compSqft && subjectSqft ? (subjectSqft - compSqft) / subjectSqft : null;

      const compNetPrice = Number(m.net_price) || Number(m.close_price) || 0;
      const perCompGapPerSqft =
        subjectSqft > 0 && compNetPrice > 0 && subjectListPrice > 0
          ? Math.round((compNetPrice - subjectListPrice) / subjectSqft)
          : null;
      const compArvDetailAsIs = c.comp_listing_row_id ? _arvMap[c.comp_listing_row_id as string] ?? null : null;

      const isSelected = Boolean(c.selected_as_is_yn);
      pins.push({
        id: String(c.id),
        lat,
        lng,
        label: String(m.address ?? "\u2014"),
        tooltipData: {
          closePrice: compNetPrice || null,
          impliedArv: compArvDetailAsIs?.arv ?? null,
          closeDate: m.close_date ? String(m.close_date).slice(0, 10) : null,
          sqft: compSqft,
          sqftDelta,
          sqftDeltaPct,
          ppsf: (m.ppsf as number) ?? null,
          distance: (c.distance_miles as number) ?? null,
          gapPerSqft: perCompGapPerSqft,
        },
        type: isSelected ? "selected" : "candidate",
      });
    }

    return pins;
  }, [d, subjectSqft, subjectListPrice]);

  // Toggle As-Is selection from map pin click
  const handleAsIsMapPinToggle = useCallback(
    async (pinId: string, currentType: "selected" | "candidate") => {
      const fd = new FormData();
      fd.set("candidate_id", pinId);
      fd.set("property_id", d.propertyId);
      fd.set("analysis_id", d.analysisId);
      fd.set("next_selected", currentType === "candidate" ? "true" : "false");
      await toggleAsIsComparableCandidateSelectionAction(fd);
      router.refresh();
    },
    [d.propertyId, d.analysisId, router],
  );

  // Per-category scope state for the rehab card
  // Re-key when server data changes (after save + refresh)
  const serverCategoryScopesKey = JSON.stringify(d.rehab.categoryScopes);
  const [categoryScopes, setCategoryScopes] = useState<RehabCategoryScopes>(
    d.rehab.categoryScopes ?? {},
  );
  const [prevScopesKey, setPrevScopesKey] = useState(serverCategoryScopesKey);
  if (serverCategoryScopesKey !== prevScopesKey) {
    setCategoryScopes(d.rehab.categoryScopes ?? {});
    setPrevScopesKey(serverCategoryScopesKey);
  }

  // Custom rehab items state
  const serverCustomItemsKey = JSON.stringify(d.rehab.customItems);
  const [customItems, setCustomItems] = useState<Array<{ label: string; cost: number }>>(
    d.rehab.customItems ?? [],
  );
  const [prevCustomItemsKey, setPrevCustomItemsKey] = useState(serverCustomItemsKey);
  if (serverCustomItemsKey !== prevCustomItemsKey) {
    setCustomItems(d.rehab.customItems ?? []);
    setPrevCustomItemsKey(serverCustomItemsKey);
  }

  return (
    <section className="dw-section-stack-compact">
      {/* ================================================================== */}
      {/* HEADER BAR — compact property identity + key metrics               */}
      {/* ================================================================== */}
      <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Link
              href={`/admin/properties/${d.propertyId}`}
              className="text-[10px] uppercase tracking-[0.14em] text-slate-400 hover:text-slate-700 shrink-0"
            >
              &larr; Hub
            </Link>
            <h1 className="text-sm font-bold text-slate-900 truncate">{d.property.address}</h1>
            <span className="text-xs text-slate-500 shrink-0">
              {d.property.city}, {d.property.state} {d.property.postalCode}
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {d.listing?.listingId && (
              <span className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-mono text-slate-500">
                MLS# {d.listing.listingId}
              </span>
            )}
            <span className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.1em] text-slate-500">
              {d.listing?.mlsStatus ?? "No Listing"}
            </span>
            <span className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.1em] text-slate-500">
              {d.analysis.strategyType ?? "general"}
            </span>
            <button
              type="button"
              disabled={isMarkingComplete}
              onClick={async () => {
                setIsMarkingComplete(true);
                try {
                  const fd = new FormData();
                  fd.set("analysis_id", d.analysisId);
                  const res = await markAnalysisCompleteAction(fd);
                  if (res?.completedAt) setCompletedAt(res.completedAt);
                } finally {
                  setIsMarkingComplete(false);
                }
              }}
              className={`rounded-md border px-2 py-0.5 text-[10px] font-semibold ${completedAt ? "border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100" : "border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100"}`}
            >
              {isMarkingComplete ? "Saving..." : completedAt ? "Update Complete" : "Mark Complete"}
            </button>
            {completedAt && (
              <span className="text-[9px] text-slate-400">
                {new Date(completedAt).toLocaleDateString()} {new Date(completedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
            <button
              type="button"
              onClick={() => {
                setReportTitle(`${d.property.address} - ${d.analysis.strategyType === "flip" ? "Fix & Flip" : d.analysis.strategyType ?? "Analysis"}`);
                setShowReportDialog(true);
              }}
              className="rounded-md border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 hover:bg-emerald-100"
            >
              Generate Report
            </button>
          </div>
        </div>
        {/* Inline property facts */}
        <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-0.5 text-[11px] text-slate-500">
          <span><b className="text-slate-700">{p?.propertyType ?? "\u2014"}</b> {p?.structureType ? `\u00b7 ${p.structureType}` : ""}</span>
          <span><b className="text-slate-700">{fmtNum(p?.bedroomsTotal)}</b> bd / <b className="text-slate-700">{fmtNum(p?.bathroomsTotal, 1)}</b> ba</span>
          <span><b className="text-slate-700">{fmtNum(p?.buildingSqft)}</b> sqft</span>
          {(p?.belowGradeTotalSqft ?? 0) > 0 && <span>Bsmt: {fmtNum(p!.belowGradeTotalSqft)} ({fmtNum(p!.belowGradeFinishedSqft)} fin)</span>}
          <span>Built <b className="text-slate-700">{p?.yearBuilt ?? "\u2014"}</b></span>
          <span>Lot: {fmtNum(p?.lotSizeSqft)} sqft</span>
          <span>Garage: {fmtNum(p?.garageSpaces, 1)}</span>
          <span>Tax: {fmt(d.financials?.annualTax)}/yr</span>
          {(d.financials?.annualHoa ?? 0) > 0 && <span>HOA: {fmt(d.financials!.annualHoa)}/yr</span>}
          <span>List: <b className="text-slate-700">{fmt(d.listing?.listPrice)}</b></span>
        </div>
      </div>

      {/* ================================================================== */}
      {/* THREE-CARD PANEL — MLS Info / Property Physical / Quick Analysis    */}
      {/* Mirrors the top of ScreeningCompModal for at-a-glance subject facts */}
      {/* and live recalc inputs that update the Deal Strip below.            */}
      {/* ================================================================== */}
      <SubjectTileRow
        mlsInfo={{
          mlsStatus: d.listing?.mlsStatus ?? "\u2014",
          mlsNumber: d.listing?.listingId ?? "\u2014",
          mlsChangeType: d.listing?.mlsMajorChangeType ?? "\u2014",
          listDate: fmtIsoDate(d.listing?.listingContractDate),
          origListPrice: fmt(d.listing?.originalListPrice),
          ucDate: fmtIsoDate(d.listing?.purchaseContractDate),
          listPrice: fmt(d.listing?.listPrice),
          closeDate: fmtIsoDate(d.listing?.closeDate),
        }}
        physical={{
          totalSf: fmtNum(p?.buildingSqft),
          aboveSf: fmtNum(p?.aboveGradeSqft),
          belowSf: fmtNum(p?.belowGradeTotalSqft),
          basementFinSf: fmtNum(p?.belowGradeFinishedSqft),
          beds: p?.bedroomsTotal != null ? String(p.bedroomsTotal) : "\u2014",
          baths: p?.bathroomsTotal != null ? fmtNum(p.bathroomsTotal, 1) : "\u2014",
          garage: p?.garageSpaces != null ? fmtNum(p.garageSpaces, 1) : "\u2014",
          yearBuilt: p?.yearBuilt ?? null,
          levels: (d.subjectContext.levelsRaw as string | null) ?? p?.levelClass ?? "\u2014",
          propertyType: p?.propertyType ?? "\u2014",
          lotSf: fmtNum(p?.lotSizeSqft),
          taxHoa: `${fmt(d.financials?.annualTax)} | ${fmt(d.financials?.annualHoa)}`,
        }}
        quickAnalysis={{
          manualArvInput,
          setManualArvInput,
          arvPlaceholder: liveDeal.arv ? `${liveDeal.arv.toLocaleString()}` : "\u2014",
          manualRehabInput,
          setManualRehabInput,
          rehabPlaceholder: d.rehab.effective != null ? `${Math.round(d.rehab.effective).toLocaleString()}` : "\u2014",
          manualTargetProfitInput,
          setManualTargetProfitInput,
          targetProfitPlaceholder: d.dealMath?.targetProfit != null ? `${d.dealMath.targetProfit.toLocaleString()}` : "40,000",
          onTargetProfitTab: () => copySelectedMlsBtnRef.current?.focus(),
        }}
      />

      {/* Deal math summary strip — live-recalculated from Quick Analysis inputs */}
      <div className="flex items-center gap-4 rounded border border-slate-200 bg-slate-50 px-4 py-2">
        <DealStat label="ARV" value={fmt(liveDeal.arv)} highlight />
        <DealStat label="Max Offer" value={fmt(liveDeal.maxOffer)} highlight />
        <DealStat label="Offer%" value={fmtPct(liveDeal.offerPct)} />
        <DealStat
          label="Gap/sqft"
          value={liveDeal.gapPerSqft != null ? `$${fmtNum(liveDeal.gapPerSqft)}` : "\u2014"}
        />
        <DealStat label="Rehab" value={fmt(liveDeal.rehabTotal)} />
        <DealStat label="Target Profit" value={fmt(liveDeal.targetProfit)} />
      </div>

      {/* ================================================================== */}
      {/* MAIN 3-COLUMN LAYOUT — Left: financials / Center: valuation+comps / Right: rehab+controls */}
      {/* ================================================================== */}
      <div className="grid gap-2" style={{ gridTemplateColumns: "260px 1fr 420px" }}>

        {/* ================================================================ */}
        {/* LEFT COLUMN — Deal Math + Financing + Cash Required + Hold/Trans */}
        {/* ================================================================ */}
        <div className="flex flex-col gap-2">

          {/* ── DEAL WATERFALL ── */}
          <div className="rounded-lg border border-slate-200 bg-white p-2.5 shadow-sm">
            <CardTitle>Deal Math</CardTitle>
            <div className="space-y-0.5 text-[11px]">
              <div className="flex justify-between py-0.5">
                <span className="font-medium text-slate-700">Eff. ARV</span>
                <span className="font-mono font-semibold text-slate-800">{fmt(d.arv.effective)}</span>
              </div>
              <div className="flex justify-between py-0.5">
                <span className="text-slate-500">&minus; Rehab</span>
                <span className="font-mono text-red-600">{fmt(d.rehab.effective)}</span>
              </div>
              <div className="flex justify-between py-0.5">
                <span className="text-slate-500">&minus; Hold</span>
                <span className="font-mono text-red-600">{fmt(d.holding?.total)}</span>
              </div>
              <div className="flex justify-between py-0.5">
                <span className="text-slate-500">&minus; Trans</span>
                <span className="font-mono text-red-600">{fmt(d.transaction?.total)}</span>
              </div>
              <div className="flex justify-between py-0.5">
                <span className="text-slate-500">&minus; Finance</span>
                <span className="font-mono text-red-600">{fmt(d.financing?.total)}</span>
              </div>
              <div className="flex justify-between py-0.5">
                <span className="text-slate-500">&minus; Profit</span>
                <span className="font-mono text-red-600">{fmt(d.dealMath?.targetProfit)}</span>
              </div>
              <div className="border-t border-slate-300 pt-1 mt-1">
                <div className="flex justify-between py-0.5">
                  <span className="font-bold text-slate-800">Financed</span>
                  <span className="font-mono font-bold text-emerald-700">{fmt(d.dealMath?.maxOffer)}</span>
                </div>
                <div className="flex justify-between py-0.5">
                  <span className="font-bold text-slate-800">Cash</span>
                  <span className="font-mono font-bold text-emerald-700">{fmt(d.dealMath && d.financing ? d.dealMath.maxOffer + d.financing.total : d.dealMath?.maxOffer)}</span>
                </div>
              </div>
              <div className="border-t border-slate-200 pt-1 mt-1 space-y-0.5 text-[10px]">
                <div className="flex justify-between">
                  <span className="text-slate-400">Offer %</span>
                  <span className="font-mono text-slate-600">{fmtPct(d.dealMath?.offerPct)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Spread</span>
                  <span className="font-mono text-slate-600">{fmt(d.dealMath?.spread)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Gap/sqft</span>
                  <span className="font-mono text-slate-600">{d.dealMath?.estGapPerSqft !== undefined ? `$${fmtNum(d.dealMath.estGapPerSqft)}` : "\u2014"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Project Costs</span>
                  <span className="font-mono text-slate-600">{fmt(d.dealMath?.totalCosts)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* ── FINANCING ── */}
          <div className="rounded-lg border border-slate-200 bg-white p-2.5 shadow-sm">
            <CardTitle>Financing</CardTitle>
            {d.financing ? (
              <div className="text-[11px] space-y-0.5">
                <div className="rounded border border-slate-100 bg-slate-50 px-2 py-1 mb-1.5 text-[10px]">
                  <div className="flex justify-between"><span className="text-slate-400">Loan</span><span className="font-mono text-slate-600">{fmt(d.financing.loanAmount)}</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">LTV / Rate / Pts</span><span className="font-mono text-slate-600">{fmtPct(d.financing.ltvPct)} / {fmtPct(d.financing.annualRate)} / {fmtPct(d.financing.pointsRate)}</span></div>
                </div>
                <CostLine label={`Interest (@ $${fmtNum(d.financing.dailyInterest, 2)}/day)`} value={fmt(d.financing.interestCost)} sub={`${d.financing.daysHeld}d`} />
                <CostLine label="Origination" value={fmt(d.financing.originationCost)} />
                <div className="border-t border-slate-200 pt-1 mt-1 flex justify-between">
                  <span className="font-bold text-slate-700">Total</span>
                  <span className="font-mono font-bold text-slate-800">{fmt(d.financing.total)}</span>
                </div>
                <div className="text-[10px] text-slate-400 flex justify-between">
                  <span>I/O pmt</span><span className="font-mono">{fmt(d.financing.monthlyPayment)}/mo</span>
                </div>
              </div>
            ) : (
              <p className="text-[10px] text-slate-400">Financing disabled</p>
            )}
          </div>

          {/* ── CASH REQUIRED ── */}
          {d.cashRequired && (
            <div className="rounded-lg border border-indigo-200 bg-indigo-50/30 p-2.5 shadow-sm">
              <CardTitle>Cash Required <span className="normal-case font-normal tracking-normal text-[9px] text-slate-400">@ Max Offer {fmt(d.cashRequired.purchasePrice)}</span></CardTitle>
              <div className="text-[11px] space-y-0.5">
                <CostLine label={`Down Pmt (${fmtPct(d.cashRequired.downPaymentRate)})`} value={fmt(d.cashRequired.downPayment)} />
                <CostLine label="Acq. Title" value={fmt(d.cashRequired.acquisitionTitle)} />
                <CostLine label="Origination" value={fmt(d.cashRequired.originationCost)} />
                <CostLine label="Rehab OOP" value={fmt(d.cashRequired.rehabOutOfPocket)} sub={d.cashRequired.rehabOutOfPocket > 0 ? `of ${fmt(d.cashRequired.rehabTotal)}` : `covered`} />
                <CostLine label="Holding" value={fmt(d.cashRequired.holdingTotal)} />
                <CostLine label="Interest" value={fmt(d.cashRequired.interestCost)} />
                <div className="border-t border-indigo-200 pt-1 mt-1 flex justify-between">
                  <span className="font-bold text-slate-700">Total Cash</span>
                  <span className="font-mono font-bold text-indigo-700">{fmt(d.cashRequired.totalCashRequired)}</span>
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">
                  <div className="flex justify-between">
                    <span>Loan &rarr; purchase</span>
                    <span className="font-mono">{fmt(d.cashRequired.loanForPurchase)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Loan &rarr; rehab</span>
                    <span className="font-mono">{fmt(d.cashRequired.rehabFromLoan)}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── HOLDING + TRANSACTION (collapsible detail) ── */}
          <div className="rounded-lg border border-slate-200 bg-white p-2 shadow-sm">
            <button
              type="button"
              onClick={() => setShowHoldTransDetail(!showHoldTransDetail)}
              className="flex items-center justify-between w-full text-[10px]"
            >
              <span className="font-bold uppercase tracking-[0.12em] text-slate-500">Hold &amp; Trans Detail</span>
              <span className="text-slate-400">{showHoldTransDetail ? "\u25B2" : "\u25BC"}</span>
            </button>
            {showHoldTransDetail && (
              <div className="mt-2 space-y-2">
                {/* Holding */}
                {d.holding ? (
                  <div className="text-[11px] space-y-0.5">
                    <div className="text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-400 mb-1">Holding &middot; {d.holding.daysHeld} days</div>
                    <CostLine label="Property Tax" value={fmt(d.holding.holdTax)} sub={`$${fmtNum(d.holding.dailyTax, 2)}/d`} />
                    <CostLine label="Insurance" value={fmt(d.holding.holdInsurance)} sub={`$${fmtNum(d.holding.dailyInsurance, 2)}/d`} />
                    <CostLine label="HOA" value={fmt(d.holding.holdHoa)} sub={`$${fmtNum(d.holding.dailyHoa, 2)}/d`} />
                    <CostLine label="Utilities" value={fmt(d.holding.holdUtilities)} sub={`$${fmtNum(d.holding.dailyUtilities, 2)}/d`} />
                    <div className="border-t border-slate-200 pt-1 mt-1 flex justify-between">
                      <span className="font-bold text-slate-700">Total</span>
                      <div>
                        <span className="font-mono font-bold text-slate-800">{fmt(d.holding.total)}</span>
                        <span className="ml-1 text-[10px] text-slate-400">${fmtNum(d.holding.dailyTotal, 2)}/d</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-[10px] text-slate-400">No holding data</p>
                )}
                {/* Transaction */}
                {d.transaction ? (
                  <div className="text-[11px] space-y-0.5 border-t border-slate-100 pt-2">
                    <div className="text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-400 mb-1">Transaction</div>
                    <CostLine label="Acq. Title (0.3%)" value={fmt(d.transaction.acquisitionTitle)} />
                    <CostLine label="Disp. Title (0.47%)" value={fmt(d.transaction.dispositionTitle)} />
                    <CostLine label="Commissions (4%)" value={fmt(d.transaction.dispositionCommissions)} />
                    <div className="border-t border-slate-200 pt-1 mt-1 flex justify-between">
                      <span className="font-bold text-slate-700">Total</span>
                      <span className="font-mono font-bold text-slate-800">{fmt(d.transaction.total)}</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-[10px] text-slate-400">No transaction data</p>
                )}
              </div>
            )}
          </div>

        </div>{/* end left column */}

        {/* ================================================================ */}
        {/* CENTER COLUMN — ARV+Trend row, Comps, Notes                      */}
        {/* ================================================================ */}
        <div className="flex flex-col gap-2">

          {/* ── ARV + PRICE TREND side by side ── */}
          <div className="grid grid-cols-2 gap-2">

            {/* ARV DETAIL CARD */}
            <div className="rounded-lg border border-slate-200 bg-white p-2.5 shadow-sm">
              <CardTitle>ARV</CardTitle>
              {/* 3-tier */}
              <div className="grid grid-cols-3 gap-1 text-center mb-2">
                <div className="rounded border border-slate-100 bg-slate-50 px-1 py-1">
                  <div className="text-[9px] text-slate-400 uppercase">Auto</div>
                  <div className="text-xs font-medium text-slate-600">{fmt(d.arv.auto)}</div>
                </div>
                <div className="rounded border border-blue-100 bg-blue-50 px-1 py-1">
                  <div className="text-[9px] text-blue-400 uppercase">Selected</div>
                  <div className="text-xs font-semibold text-blue-700">{fmt(d.arv.selected)}</div>
                </div>
                <div className="rounded border border-emerald-100 bg-emerald-50 px-1 py-1">
                  <div className="text-[9px] text-emerald-400 uppercase">Final</div>
                  <div className="text-xs font-bold text-emerald-700">{d.arv.final !== null ? fmt(d.arv.final) : <span className="text-slate-300">&mdash;</span>}</div>
                </div>
              </div>
              <div className="rounded border border-slate-100 bg-slate-50 px-2 py-1.5 mb-2">
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-500">Effective ARV</span>
                  <span className="font-mono font-bold text-emerald-700">{fmt(d.arv.effective)}</span>
                </div>
                {d.arv.selectedDetail && (
                  <div className="flex justify-between text-[10px] text-slate-400">
                    <span>$/sqft</span>
                    <span className="font-mono">${fmtNum(d.arv.selectedDetail.arvPerSqft, 2)}</span>
                  </div>
                )}
                {/* Subject PSF from effective ARV */}
                {(() => {
                  const bldg = d.physical?.buildingSqft ?? 0;
                  const ag = d.physical?.aboveGradeSqft ?? 0;
                  if (d.arv.effective <= 0 || (bldg <= 0 && ag <= 0)) return null;
                  const psfBldg = bldg > 0 ? d.arv.effective / bldg : null;
                  const psfAg = ag > 0 ? d.arv.effective / ag : null;
                  const ls = d.trend?.detailJson?.localStats;
                  const bldgAboveRange = psfBldg != null && ls?.psfBuildingHigh != null && psfBldg > ls.psfBuildingHigh;
                  const agAboveRange = psfAg != null && ls?.psfAboveGradeHigh != null && psfAg > ls.psfAboveGradeHigh;
                  return (
                    <div className="mt-0.5 space-y-0 text-[10px]">
                      {psfBldg != null && (
                        <div className="flex justify-between">
                          <span className="text-slate-400">PSF Bldg</span>
                          <span className={`font-mono ${bldgAboveRange ? "text-red-600 font-semibold" : "text-slate-500"}`}>
                            ${fmtNum(psfBldg, 2)}
                            {bldgAboveRange && <span className="text-[8px] ml-0.5">&gt; local</span>}
                          </span>
                        </div>
                      )}
                      {psfAg != null && (
                        <div className="flex justify-between">
                          <span className="text-slate-400">PSF AG</span>
                          <span className={`font-mono ${agAboveRange ? "text-red-600 font-semibold" : "text-slate-500"}`}>
                            ${fmtNum(psfAg, 2)}
                            {agAboveRange && <span className="text-[8px] ml-0.5">&gt; local</span>}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
              {/* Per-comp details */}
              {d.arv.selectedDetail && d.arv.selectedDetail.perCompDetails.length > 0 && (
                <div className="space-y-0">
                  <div className="text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-400 mb-1">Per-Comp ARV</div>
                  <div className="overflow-auto max-h-[140px]">
                    <table className="w-full text-[10px]">
                      <thead>
                        <tr className="text-left text-[9px] uppercase tracking-wide text-slate-400 border-b border-slate-100">
                          <th className="py-0.5 pr-1">Address</th>
                          <th className="py-0.5 text-right">Close</th>
                          <th className="py-0.5 text-right">ARV Adj</th>
                          <th className="py-0.5 text-right">Wt</th>
                        </tr>
                      </thead>
                      <tbody>
                        {d.arv.selectedDetail.perCompDetails.map((comp, i) => (
                          <tr key={i} className="border-b border-slate-50">
                            <td className="py-0.5 pr-1 text-slate-600 truncate max-w-[120px]">{comp.address}</td>
                            <td className="py-0.5 text-right font-mono text-slate-600">{fmt(comp.netSalePrice)}</td>
                            <td className="py-0.5 text-right font-mono text-slate-700">{fmt(comp.arvTimeAdjusted)}</td>
                            <td className="py-0.5 text-right font-mono text-slate-400">{comp.decayWeight.toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              {/* Comp summary stats */}
              <div className="mt-2 flex gap-2 text-[10px] text-slate-400">
                <span>{d.compSummary.selectedCount} comps</span>
                <span>Avg {fmt(d.compSummary.avgSelectedPrice)}</span>
                <span>${fmtNum(d.compSummary.avgSelectedPsf)}/sf</span>
              </div>
            </div>

            {/* PRICE TREND CARD */}
            <div className="rounded-lg border border-slate-200 bg-white p-2.5 shadow-sm">
              <CardTitle>Price Trend</CardTitle>
              {d.trend ? (
                <div className="space-y-2">
                  {/* Badges: confidence + direction */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${
                      d.trend.confidence === "high" ? "bg-emerald-100 text-emerald-700"
                        : d.trend.confidence === "low" ? "bg-amber-100 text-amber-700"
                          : "bg-red-100 text-red-700"
                    }`}>
                      Confidence: {d.trend.confidence === "high" ? "High" : d.trend.confidence === "low" ? "Low" : "Fallback"}
                    </span>
                    <TrendDirectionBadge direction={d.trend.direction} />
                    {d.trend.isFallback && (
                      <span className="text-[9px] text-red-500">Fixed rate — insufficient data</span>
                    )}
                  </div>

                  {/* Applied rate + blend weight bar */}
                  <div className="rounded border border-slate-100 bg-slate-50 px-2 py-1.5 space-y-1.5">
                    <div className="flex justify-between text-[11px]">
                      <span className="text-slate-500">Applied Rate</span>
                      <span className={`font-mono font-bold ${d.trend.blendedAnnualRate >= 0 ? "text-emerald-700" : "text-red-600"}`}>
                        {d.trend.blendedAnnualRate >= 0 ? "+" : ""}{(d.trend.blendedAnnualRate * 100).toFixed(1)}%/yr
                      </span>
                    </div>
                    {/* Blend weight visualization */}
                    <div>
                      <div className="flex items-center gap-1 text-[9px] text-slate-400 mb-0.5">
                        <span>Local 10%</span>
                        <span className="flex-1" />
                        <span>Metro 90%</span>
                      </div>
                      <div className="flex h-1.5 rounded-full overflow-hidden">
                        <div className="bg-blue-400" style={{ width: "10%" }} />
                        <div className="bg-slate-300" style={{ width: "90%" }} />
                      </div>
                    </div>
                  </div>

                  {/* Two-column: Local / Metro */}
                  <div className="grid grid-cols-2 gap-2">
                    <TrendTierColumn
                      label="Local"
                      radius={d.trend.localRadius}
                      rate={d.trend.rawLocalRate}
                      stats={d.trend.detailJson?.localStats ?? null}
                    />
                    <TrendTierColumn
                      label="Metro"
                      radius={d.trend.metroRadius}
                      rate={d.trend.rawMetroRate}
                      stats={d.trend.detailJson?.metroStats ?? null}
                    />
                  </div>

                  {/* Summary */}
                  {d.trend.summary && (
                    <p className="text-[9px] text-slate-400 leading-tight">{d.trend.summary}</p>
                  )}
                </div>
              ) : (
                <p className="text-[10px] text-slate-400">No trend data — run screening first.</p>
              )}
            </div>

          </div>{/* end ARV + Trend row */}

          {/* ── ARV COMPARABLES — map + table ── */}
          <div className="rounded-lg border border-slate-200 bg-white p-2.5 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <CardTitle>
                ARV Comparables ({d.compSummary.selectedCount} selected of {d.compSummary.totalComps})
              </CardTitle>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleCopyAllMls}
                  className="rounded-md border border-slate-200 bg-white px-2 py-0.5 font-mono text-[11px] text-slate-600 hover:bg-slate-50"
                >
                  {copiedAll ? "Copied!" : "Copy All MLS#"}
                </button>
                <button
                  type="button"
                  ref={copySelectedMlsBtnRef}
                  onClick={handleCopySelectedMls}
                  className="rounded-md border border-slate-200 bg-white px-2 py-0.5 font-mono text-[11px] text-slate-600 hover:bg-slate-50"
                >
                  {copiedSelected ? "Copied!" : "Copy Selected MLS#"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowCompModal(true)}
                  className="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Edit Comps
                </button>
              </div>
            </div>
            <div className="grid gap-2" style={{ gridTemplateColumns: "280px 1fr" }}>
              {/* Map */}
              <div>
                {showCompModal ? (
                  <div className="flex h-[250px] items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-xs text-slate-400">
                    Map open in comp editor
                  </div>
                ) : mapPins.length > 1 ? (
                  <CompMap
                    pins={mapPins}
                    height={250}
                    subjectLat={d.property.latitude}
                    subjectLng={d.property.longitude}
                    onPinClick={handleMapPinToggle}
                  />
                ) : (
                  <div className="flex h-[250px] items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-xs text-slate-400">
                    No location data
                  </div>
                )}
              </div>
              {/* Selected comps table */}
              <div>
                {selectedComps.length > 0 ? (
                  <div className="overflow-auto rounded-lg border border-slate-200 max-h-[250px]">
                    <table className="w-full text-[11px]">
                      <thead>
                        <tr className="sticky top-0 z-10 bg-slate-50 text-[9px] uppercase tracking-wider text-slate-500" style={{ height: 22 }}>
                          <th className="px-1 py-0.5 text-right">Dist</th>
                          <th className="px-1 py-0.5 text-left" style={{ maxWidth: 140 }}>Address</th>
                          <th className="px-1 py-0.5 text-left" style={{ maxWidth: 100 }}>Subdiv</th>
                          <th className="px-1 py-0.5 text-right">Net Price</th>
                          <th className="px-1 py-0.5 text-right">Imp ARV</th>
                          <th className="px-1 py-0.5 text-right">Gap</th>
                          <th className="px-1 py-0.5 text-right">Days</th>
                          <th className="px-1 py-0.5 text-left" style={{ maxWidth: 56 }}>Lvl</th>
                          <th className="px-1 py-0.5 text-right">Year</th>
                          <th className="px-1 py-0.5 text-right" style={{ width: 24 }}>Bd</th>
                          <th className="px-1 py-0.5 text-right" style={{ width: 24 }}>Ba</th>
                          <th className="px-1 py-0.5 text-right" style={{ width: 24 }}>Gar</th>
                          <th className="px-1 py-0.5 text-right">Bldg SF</th>
                          <th className="px-1 py-0.5 text-right">Abv SF</th>
                          <th className="px-1 py-0.5 text-right">Bsmt</th>
                          <th className="px-1 py-0.5 text-right">BsFin</th>
                          <th className="px-1 py-0.5 text-right">Lot</th>
                          <th className="px-1 py-0.5 text-right" style={{ width: 34 }}>Score</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="sticky z-20 border-b border-red-200 bg-red-50 font-semibold text-slate-900" style={{ top: 22 }}>
                          <td className="px-1 py-0.5 text-right">—</td>
                          <td className="max-w-[140px] truncate px-1 py-0.5" title={d.property.address}>{d.property.address}</td>
                          <td className="max-w-[100px] truncate px-1 py-0.5" title={d.listing?.subdivisionName ?? ""}>{d.listing?.subdivisionName ?? "—"}</td>
                          <td className="px-1 py-0.5 text-right">{fmt(d.listing?.listPrice)}</td>
                          <td className="px-1 py-0.5 text-right">—</td>
                          <td className="px-1 py-0.5 text-right">{d.dealMath?.estGapPerSqft != null ? `$${fmtNum(d.dealMath.estGapPerSqft)}` : "—"}</td>
                          <td className="px-1 py-0.5 text-right">—</td>
                          <td className="max-w-[56px] truncate px-1 py-0.5">{p?.levelClass ?? "—"}</td>
                          <td className="px-1 py-0.5 text-right">{p?.yearBuilt != null ? String(p.yearBuilt) : "—"}</td>
                          <td className="px-1 py-0.5 text-right">{p?.bedroomsTotal ?? "—"}</td>
                          <td className="px-1 py-0.5 text-right">{p?.bathroomsTotal != null ? fmtNum(p.bathroomsTotal) : "—"}</td>
                          <td className="px-1 py-0.5 text-right">{p?.garageSpaces != null ? fmtNum(p.garageSpaces) : "—"}</td>
                          <td className="px-1 py-0.5 text-right">{fmtNum(p?.buildingSqft)}</td>
                          <td className="px-1 py-0.5 text-right">{fmtNum(p?.aboveGradeSqft)}</td>
                          <td className="px-1 py-0.5 text-right">{fmtNum(p?.belowGradeTotalSqft)}</td>
                          <td className="px-1 py-0.5 text-right">{fmtNum(p?.belowGradeFinishedSqft)}</td>
                          <td className="px-1 py-0.5 text-right">{fmtNum(p?.lotSizeSqft)}</td>
                          <td className="px-1 py-0.5 text-right">—</td>
                        </tr>
                        {selectedComps.map((c) => {
                          const distClass = c.distance != null && c.distance <= 0.2 ? "text-emerald-600 font-semibold" : c.distance != null && c.distance >= 0.6 ? "text-red-600 font-semibold" : "text-slate-700";
                          const gapClass = c.gapPerSqft != null && c.gapPerSqft >= 60 ? "text-emerald-600 font-semibold" : c.gapPerSqft != null && c.gapPerSqft < 30 ? "text-red-600 font-semibold" : "text-slate-700";
                          const daysClass = c.days != null && c.days > 180 ? "text-red-600" : c.days != null && c.days < 60 ? "text-emerald-600" : "text-slate-700";
                          return (
                            <tr key={c.id} className="border-t border-slate-100 bg-emerald-50/60">
                              <td className={`px-1 py-0.5 text-right ${distClass}`}>{fmtNum(c.distance, 2)}</td>
                              <td className="max-w-[140px] truncate px-1 py-0.5 font-semibold text-slate-900" title={c.address}>{c.address}</td>
                              <td className="max-w-[100px] truncate px-1 py-0.5 text-slate-700" title={c.subdivision}>{c.subdivision || "\u2014"}</td>
                              <td className="px-1 py-0.5 text-right text-slate-700">{fmt(c.netPrice)}</td>
                              <td className="relative px-1 py-0.5 text-right font-semibold text-slate-900">{c.impliedArv != null ? fmt(c.impliedArv) : "\u2014"}{c.arvBreakdown && <ArvBreakdownTooltip d={c.arvBreakdown} />}</td>
                              <td className={`px-1 py-0.5 text-right ${gapClass}`}>{c.gapPerSqft != null ? `$${fmtNum(c.gapPerSqft)}` : "\u2014"}</td>
                              <td className={`px-1 py-0.5 text-right font-semibold ${daysClass}`}>{c.days ?? "\u2014"}</td>
                              <td className="max-w-[56px] truncate px-1 py-0.5 text-slate-700">{c.levelClass || "\u2014"}</td>
                              <td className="px-1 py-0.5 text-right text-slate-700">{c.yearBuilt != null ? String(c.yearBuilt) : "\u2014"}</td>
                              <td className="px-1 py-0.5 text-right text-slate-700">{c.beds != null ? fmtNum(c.beds) : "\u2014"}</td>
                              <td className="px-1 py-0.5 text-right text-slate-700">{c.baths != null ? fmtNum(c.baths) : "\u2014"}</td>
                              <td className="px-1 py-0.5 text-right text-slate-700">{c.garageSpaces != null ? fmtNum(c.garageSpaces) : "\u2014"}</td>
                              <td className="px-1 py-0.5 text-right text-slate-700">{fmtNum(c.bldgSf)}</td>
                              <td className="px-1 py-0.5 text-right text-slate-700">{fmtNum(c.abvSf)}</td>
                              <td className="px-1 py-0.5 text-right text-slate-700">{fmtNum(c.bsmt)}</td>
                              <td className="px-1 py-0.5 text-right text-slate-700">{fmtNum(c.bsFin)}</td>
                              <td className="px-1 py-0.5 text-right text-slate-700">{fmtNum(c.lot)}</td>
                              <td className="px-1 py-0.5 text-right font-semibold text-slate-900">{fmtNum(c.score, 1)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="flex h-[250px] items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-sm text-slate-400">
                    No comps selected. Click &quot;Edit Comps&quot; to review.
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── AS-IS COMPARABLES — map + table ── */}
          <div className="rounded-lg border border-slate-200 bg-white p-2.5 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <CardTitle>
                As-Is Comparables ({d.asIsCompSummary.selectedCount} selected of {d.asIsCompSummary.totalComps})
              </CardTitle>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleCopySelectedAsIsMls}
                  className="rounded-md border border-slate-200 bg-white px-2 py-0.5 font-mono text-[11px] text-slate-600 hover:bg-slate-50"
                >
                  {copiedSelectedAsIs ? "Copied!" : "Copy Selected MLS#"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowAsIsCompModal(true)}
                  className="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Edit Comps
                </button>
              </div>
            </div>
            <div className="grid gap-2" style={{ gridTemplateColumns: "280px 1fr" }}>
              {/* Map */}
              <div>
                {showAsIsCompModal ? (
                  <div className="flex h-[250px] items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-xs text-slate-400">
                    Map open in comp editor
                  </div>
                ) : asIsMapPins.length > 1 ? (
                  <CompMap
                    pins={asIsMapPins}
                    height={250}
                    subjectLat={d.property.latitude}
                    subjectLng={d.property.longitude}
                    onPinClick={handleAsIsMapPinToggle}
                  />
                ) : (
                  <div className="flex h-[250px] items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-xs text-slate-400">
                    No location data
                  </div>
                )}
              </div>
              {/* Selected comps table */}
              <div>
                {selectedAsIsComps.length > 0 ? (
                  <div className="overflow-auto rounded-lg border border-slate-200 max-h-[250px]">
                    <table className="w-full text-[11px]">
                      <thead>
                        <tr className="sticky top-0 z-10 bg-slate-50 text-[9px] uppercase tracking-wider text-slate-500" style={{ height: 22 }}>
                          <th className="px-1 py-0.5 text-right">Dist</th>
                          <th className="px-1 py-0.5 text-left" style={{ maxWidth: 140 }}>Address</th>
                          <th className="px-1 py-0.5 text-left" style={{ maxWidth: 100 }}>Subdiv</th>
                          <th className="px-1 py-0.5 text-right">Net Price</th>
                          <th className="px-1 py-0.5 text-right">Imp ARV</th>
                          <th className="px-1 py-0.5 text-right">Gap</th>
                          <th className="px-1 py-0.5 text-right">Days</th>
                          <th className="px-1 py-0.5 text-left" style={{ maxWidth: 56 }}>Lvl</th>
                          <th className="px-1 py-0.5 text-right">Year</th>
                          <th className="px-1 py-0.5 text-right" style={{ width: 24 }}>Bd</th>
                          <th className="px-1 py-0.5 text-right" style={{ width: 24 }}>Ba</th>
                          <th className="px-1 py-0.5 text-right" style={{ width: 24 }}>Gar</th>
                          <th className="px-1 py-0.5 text-right">Bldg SF</th>
                          <th className="px-1 py-0.5 text-right">Abv SF</th>
                          <th className="px-1 py-0.5 text-right">Bsmt</th>
                          <th className="px-1 py-0.5 text-right">BsFin</th>
                          <th className="px-1 py-0.5 text-right">Lot</th>
                          <th className="px-1 py-0.5 text-right" style={{ width: 34 }}>Score</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="sticky z-20 border-b border-red-200 bg-red-50 font-semibold text-slate-900" style={{ top: 22 }}>
                          <td className="px-1 py-0.5 text-right">—</td>
                          <td className="max-w-[140px] truncate px-1 py-0.5" title={d.property.address}>{d.property.address}</td>
                          <td className="max-w-[100px] truncate px-1 py-0.5" title={d.listing?.subdivisionName ?? ""}>{d.listing?.subdivisionName ?? "—"}</td>
                          <td className="px-1 py-0.5 text-right">{fmt(d.listing?.listPrice)}</td>
                          <td className="px-1 py-0.5 text-right">—</td>
                          <td className="px-1 py-0.5 text-right">—</td>
                          <td className="max-w-[56px] truncate px-1 py-0.5">{p?.levelClass ?? "—"}</td>
                          <td className="px-1 py-0.5 text-right">{p?.yearBuilt != null ? String(p.yearBuilt) : "—"}</td>
                          <td className="px-1 py-0.5 text-right">{p?.bedroomsTotal ?? "—"}</td>
                          <td className="px-1 py-0.5 text-right">{p?.bathroomsTotal != null ? fmtNum(p.bathroomsTotal) : "—"}</td>
                          <td className="px-1 py-0.5 text-right">{p?.garageSpaces != null ? fmtNum(p.garageSpaces) : "—"}</td>
                          <td className="px-1 py-0.5 text-right">{fmtNum(p?.buildingSqft)}</td>
                          <td className="px-1 py-0.5 text-right">{fmtNum(p?.aboveGradeSqft)}</td>
                          <td className="px-1 py-0.5 text-right">{fmtNum(p?.belowGradeTotalSqft)}</td>
                          <td className="px-1 py-0.5 text-right">{fmtNum(p?.belowGradeFinishedSqft)}</td>
                          <td className="px-1 py-0.5 text-right">{fmtNum(p?.lotSizeSqft)}</td>
                          <td className="px-1 py-0.5 text-right">—</td>
                        </tr>
                        {selectedAsIsComps.map((c) => {
                          const distClass = c.distance != null && c.distance <= 0.2 ? "text-emerald-600 font-semibold" : c.distance != null && c.distance >= 0.6 ? "text-red-600 font-semibold" : "text-slate-700";
                          const gapClass = c.gapPerSqft != null && c.gapPerSqft >= 60 ? "text-emerald-600 font-semibold" : c.gapPerSqft != null && c.gapPerSqft < 30 ? "text-red-600 font-semibold" : "text-slate-700";
                          const daysClass = c.days != null && c.days > 180 ? "text-red-600" : c.days != null && c.days < 60 ? "text-emerald-600" : "text-slate-700";
                          return (
                            <tr key={c.id} className="border-t border-slate-100 bg-emerald-50/60">
                              <td className={`px-1 py-0.5 text-right ${distClass}`}>{fmtNum(c.distance, 2)}</td>
                              <td className="max-w-[140px] truncate px-1 py-0.5 font-semibold text-slate-900" title={c.address}>{c.address}</td>
                              <td className="max-w-[100px] truncate px-1 py-0.5 text-slate-700" title={c.subdivision}>{c.subdivision || "\u2014"}</td>
                              <td className="px-1 py-0.5 text-right text-slate-700">{fmt(c.netPrice)}</td>
                              <td className="relative px-1 py-0.5 text-right font-semibold text-slate-900">{c.impliedArv != null ? fmt(c.impliedArv) : "\u2014"}{c.arvBreakdown && <ArvBreakdownTooltip d={c.arvBreakdown} />}</td>
                              <td className={`px-1 py-0.5 text-right ${gapClass}`}>{c.gapPerSqft != null ? `$${fmtNum(c.gapPerSqft)}` : "\u2014"}</td>
                              <td className={`px-1 py-0.5 text-right font-semibold ${daysClass}`}>{c.days ?? "\u2014"}</td>
                              <td className="max-w-[56px] truncate px-1 py-0.5 text-slate-700">{c.levelClass || "\u2014"}</td>
                              <td className="px-1 py-0.5 text-right text-slate-700">{c.yearBuilt != null ? String(c.yearBuilt) : "\u2014"}</td>
                              <td className="px-1 py-0.5 text-right text-slate-700">{c.beds != null ? fmtNum(c.beds) : "\u2014"}</td>
                              <td className="px-1 py-0.5 text-right text-slate-700">{c.baths != null ? fmtNum(c.baths) : "\u2014"}</td>
                              <td className="px-1 py-0.5 text-right text-slate-700">{c.garageSpaces != null ? fmtNum(c.garageSpaces) : "\u2014"}</td>
                              <td className="px-1 py-0.5 text-right text-slate-700">{fmtNum(c.bldgSf)}</td>
                              <td className="px-1 py-0.5 text-right text-slate-700">{fmtNum(c.abvSf)}</td>
                              <td className="px-1 py-0.5 text-right text-slate-700">{fmtNum(c.bsmt)}</td>
                              <td className="px-1 py-0.5 text-right text-slate-700">{fmtNum(c.bsFin)}</td>
                              <td className="px-1 py-0.5 text-right text-slate-700">{fmtNum(c.lot)}</td>
                              <td className="px-1 py-0.5 text-right font-semibold text-slate-900">{fmtNum(c.score, 1)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="flex h-[250px] items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-sm text-slate-400">
                    No comps selected. Click &quot;Edit Comps&quot; to review.
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── NOTES ── */}
          <div className="rounded-lg border border-slate-200 bg-white p-2.5 shadow-sm flex-1">
            <div className="flex items-center justify-between mb-1.5">
              <CardTitle>Notes ({d.notes.length})</CardTitle>
              <button
                type="button"
                onClick={() => setShowNoteForm(!showNoteForm)}
                className="text-[10px] text-blue-600 hover:underline"
              >
                {showNoteForm ? "Cancel" : "+ Add"}
              </button>
            </div>

            {showNoteForm && (
              <form
                action={async (formData: FormData) => {
                  await addAnalysisNoteAction(formData);
                  setNoteBody("");
                  setShowNoteForm(false);
                  router.refresh();
                }}
                className="mb-2 space-y-1.5 rounded border border-slate-200 bg-slate-50 p-2"
              >
                <input type="hidden" name="analysis_id" value={d.analysisId} />
                <div className="flex gap-2">
                  <select
                    name="note_type"
                    className="dw-select !py-1 !text-xs"
                    value={noteCategory}
                    onChange={(e) => setNoteCategory(e.target.value)}
                  >
                    {NOTE_CATEGORIES.map((c) => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                  <label className="flex items-center gap-1 text-[10px] text-slate-500">
                    <input type="checkbox" name="is_public" defaultChecked={noteCategory !== "internal"} />
                    Public
                  </label>
                </div>
                <textarea
                  name="note_body"
                  className="dw-textarea !py-1 !text-xs w-full"
                  rows={2}
                  placeholder="Enter note..."
                  value={noteBody}
                  onChange={(e) => setNoteBody(e.target.value)}
                  required
                />
                <button type="submit" className="dw-button-primary !py-1 !text-[10px]">Save Note</button>
              </form>
            )}

            {d.notes.length === 0 && !showNoteForm ? (
              <p className="py-2 text-center text-[10px] text-slate-400">No notes yet.</p>
            ) : (
              <div className="space-y-0.5">
                {d.notes.map((note) => {
                  const cat = NOTE_CATEGORIES.find((c) => c.value === note.note_type);
                  return (
                    <div key={note.id} className="flex items-start gap-1.5 rounded border border-slate-100 bg-white px-1.5 py-1 text-[11px]">
                      <span className="shrink-0 rounded bg-slate-100 px-1 py-0.5 text-[9px] font-bold uppercase text-slate-500">
                        {cat?.icon ?? "?"} {cat?.label ?? note.note_type}
                      </span>
                      <span className="flex-1 text-slate-700">{note.note_body}</span>
                      <span className={`shrink-0 text-[9px] ${note.is_public ? "text-emerald-600" : "text-slate-400"}`}>
                        {note.is_public ? "Pub" : "Int"}
                      </span>
                      <form action={async (formData: FormData) => { await deleteAnalysisNoteAction(formData); router.refresh(); }}>
                        <input type="hidden" name="note_id" value={note.id} />
                        <input type="hidden" name="analysis_id" value={d.analysisId} />
                        <button type="submit" className="text-[10px] text-red-400 hover:text-red-600">x</button>
                      </form>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </div>{/* end center column */}

        {/* ================================================================ */}
        {/* RIGHT COLUMN — Rehab + Overrides + Pipeline                      */}
        {/* ================================================================ */}
        <div className="flex flex-col gap-2">

          {/* ── REHAB DETAIL CARD ── */}
          <RehabCard
            d={d}
            categoryScopes={categoryScopes}
            setCategoryScopes={setCategoryScopes}
            customItems={customItems}
            setCustomItems={setCustomItems}
            isSaving={isSaving}
            setIsSaving={setIsSaving}
            router={router}
          />

          {/* ── OVERRIDES ── */}
          <div className="rounded-lg border border-amber-200 bg-amber-50/30 p-2.5 shadow-sm">
            <CardTitle>Overrides</CardTitle>
            <form
              action={async (formData: FormData) => {
                setIsSaving(true);
                await saveManualAnalysisAction(initialManualAnalysisFormState, formData);
                setIsSaving(false);
                router.refresh();
              }}
              className="space-y-1"
            >
              <input type="hidden" name="analysis_id" value={d.analysisId} />
              <input type="hidden" name="property_id" value={d.propertyId} />
              <input type="hidden" name="rehab_scope" value={d.rehab.scope ?? ""} />
              <div className="grid grid-cols-2 gap-x-2 gap-y-1">
                <div>
                  <label className="text-[9px] font-semibold uppercase tracking-wide text-slate-500">Final ARV</label>
                  <input type="number" name="arv_manual" className="dw-input !py-1 !px-1.5 !text-xs" defaultValue={d.manualAnalysis?.arv_manual as number ?? ""} placeholder="Auto" />
                </div>
                <div>
                  <label className="text-[9px] font-semibold uppercase tracking-wide text-slate-500">Rehab $</label>
                  <input type="number" name="rehab_manual" className="dw-input !py-1 !px-1.5 !text-xs" defaultValue={d.manualAnalysis?.rehab_manual as number ?? ""} placeholder="Auto" />
                </div>
                <div>
                  <label className="text-[9px] font-semibold uppercase tracking-wide text-slate-500">Days Held</label>
                  <input type="number" name="days_held_manual" className="dw-input !py-1 !px-1.5 !text-xs" defaultValue={d.manualAnalysis?.days_held_manual as number ?? ""} placeholder="Auto" />
                </div>
                <div>
                  <label className="text-[9px] font-semibold uppercase tracking-wide text-slate-500">Profit $</label>
                  <input type="number" name="target_profit_manual" className="dw-input !py-1 !px-1.5 !text-xs" defaultValue={d.manualAnalysis?.target_profit_manual as number ?? ""} placeholder="$40K" />
                </div>
                <div>
                  <label className="text-[9px] font-semibold uppercase tracking-wide text-slate-500">Condition</label>
                  <select name="analyst_condition" className="dw-select !py-1 !px-1.5 !text-xs" defaultValue={d.manualAnalysis?.analyst_condition as string ?? ""}>
                    <option value="">—</option>
                    <option>Fixer</option><option>Poor</option><option>Fair</option>
                    <option>Average</option><option>Good</option><option>Excellent</option>
                  </select>
                </div>
                <div>
                  <label className="text-[9px] font-semibold uppercase tracking-wide text-slate-500">Location</label>
                  <select name="location_rating" className="dw-select !py-1 !px-1.5 !text-xs" defaultValue={d.manualAnalysis?.location_rating as string ?? ""}>
                    <option value="">—</option>
                    <option>Poor</option><option>Fair</option><option>Average</option>
                    <option>Good</option><option>Excellent</option>
                  </select>
                </div>
                <div>
                  <label className="text-[9px] font-semibold uppercase tracking-wide text-slate-500">Rate %</label>
                  <input type="number" step="0.1" name="financing_rate_manual" className="dw-input !py-1 !px-1.5 !text-xs" defaultValue={d.manualAnalysis?.financing_rate_manual ? String(Number(d.manualAnalysis.financing_rate_manual) * 100) : ""} placeholder="11" />
                </div>
                <div>
                  <label className="text-[9px] font-semibold uppercase tracking-wide text-slate-500">LTV %</label>
                  <input type="number" step="1" name="financing_ltv_manual" className="dw-input !py-1 !px-1.5 !text-xs" defaultValue={d.manualAnalysis?.financing_ltv_manual ? String(Number(d.manualAnalysis.financing_ltv_manual) * 100) : ""} placeholder="80" />
                </div>
              </div>
              <input type="hidden" name="rent_estimate_monthly" value={d.manualAnalysis?.rent_estimate_monthly as string ?? ""} />
              <input type="hidden" name="financing_points_manual" value={d.manualAnalysis?.financing_points_manual ? String(Number(d.manualAnalysis.financing_points_manual) * 100) : ""} />
              <button type="submit" className="w-full rounded-md border border-amber-300 bg-amber-100 px-2 py-1 text-[10px] font-semibold text-amber-800 hover:bg-amber-200 transition-colors mt-1" disabled={isSaving}>
                {isSaving ? "Saving..." : "Save Overrides"}
              </button>
            </form>
          </div>

          {/* ── PIPELINE ── */}
          <div className="rounded-lg border border-slate-200 bg-white p-2.5 shadow-sm">
            <CardTitle>Pipeline</CardTitle>
            <form
              action={async (formData: FormData) => {
                await savePipelineAction(formData);
                router.refresh();
              }}
              className="space-y-1.5"
            >
              <input type="hidden" name="analysis_id" value={d.analysisId} />
              <div>
                <label className="text-[9px] font-semibold uppercase tracking-wide text-slate-500">Interest</label>
                <select name="interest_level" className="dw-select !py-1 !text-xs" defaultValue={d.pipeline?.interest_level as string ?? ""}>
                  <option value="">—</option>
                  {PIPELINE_INTEREST.map((v) => <option key={v}>{v}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[9px] font-semibold uppercase tracking-wide text-slate-500">Showing</label>
                <select name="showing_status" className="dw-select !py-1 !text-xs" defaultValue={d.pipeline?.showing_status as string ?? ""}>
                  <option value="">—</option>
                  {PIPELINE_SHOWING.map((v) => <option key={v}>{v}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[9px] font-semibold uppercase tracking-wide text-slate-500">Offer</label>
                <select name="offer_status" className="dw-select !py-1 !text-xs" defaultValue={d.pipeline?.offer_status as string ?? ""}>
                  <option value="">—</option>
                  {PIPELINE_OFFER.map((v) => <option key={v}>{v}</option>)}
                </select>
              </div>
              <button type="submit" className="dw-button-secondary !py-1 !text-[10px] w-full">Save</button>
            </form>
          </div>

        </div>{/* end right column */}

      </div>{/* end 3-column grid */}

      {/* ================================================================== */}
      {/* COMP SELECTION MODAL                                               */}
      {/* ================================================================== */}
      {showCompModal && d.compModalData.latestRun && (
        <ScreeningCompModal
          compSearchRunId={d.compModalData.latestRun.id}
          realPropertyId={d.propertyId}
          onClose={() => { setShowCompModal(false); router.refresh(); }}
        />
      )}

      {/* ================================================================== */}
      {/* AS-IS COMP SELECTION MODAL                                        */}
      {/* ================================================================== */}
      {showAsIsCompModal && d.compModalData.latestRun && (
        <ScreeningCompModal
          compSearchRunId={d.compModalData.latestRun.id}
          realPropertyId={d.propertyId}
          onClose={() => { setShowAsIsCompModal(false); router.refresh(); }}
        />
      )}
      {showAsIsCompModal && !d.compModalData.latestRun && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="rounded-xl bg-white p-6 shadow-2xl">
            <p className="text-sm text-slate-500">No comp search run available. Run a comp search first.</p>
            <button type="button" onClick={() => setShowAsIsCompModal(false)} className="mt-3 rounded bg-slate-700 px-3 py-1 text-xs text-white">Close</button>
          </div>
        </div>
      )}

      {/* ================================================================== */}
      {/* GENERATE REPORT DIALOG                                            */}
      {/* ================================================================== */}
      {showReportDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-slate-300 bg-white p-5 shadow-2xl">
            <h2 className="mb-3 text-sm font-semibold text-slate-800">Generate Report</h2>
            <p className="mb-3 text-xs text-slate-500">
              This will create a snapshot of the current analysis as a shareable report.
            </p>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              Report Title
            </label>
            <input
              type="text"
              value={reportTitle}
              onChange={(e) => setReportTitle(e.target.value)}
              className="dw-input mb-4 w-full"
              placeholder="Report title..."
            />
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowReportDialog(false)}
                className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                disabled={isGeneratingReport}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isGeneratingReport || !reportTitle.trim()}
                onClick={async () => {
                  setIsGeneratingReport(true);
                  try {
                    const fd = new FormData();
                    fd.set("analysis_id", d.analysisId);
                    fd.set("property_id", d.propertyId);
                    fd.set("title", reportTitle.trim());
                    await generateReportAction(fd);
                  } catch {
                    setIsGeneratingReport(false);
                  }
                }}
                className="rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
              >
                {isGeneratingReport ? "Generating..." : "Generate Report"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

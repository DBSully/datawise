"use client";

import { useState, useMemo, useCallback, type ReactNode } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { MapPin, MapPinTooltipData } from "@/components/properties/comp-map";

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
} from "@/app/(workspace)/analysis/properties/actions";
import { initialManualAnalysisFormState } from "@/lib/analysis/manual-analysis-state";
import { ComparableWorkspacePanel } from "@/components/properties/comparable-workspace-panel";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type RehabScopeTier = "cosmetic" | "moderate" | "heavy" | "gut";

type RehabDetail = {
  compositeMultiplier: number;
  typeMultiplier: number;
  conditionMultiplier: number;
  priceMultiplier: number;
  ageMultiplier: number;
  aboveGrade: number;
  belowGradeFinished: number;
  belowGradeUnfinished: number;
  belowGradeTotal: number;
  interior: number;
  exterior: number;
  landscaping: number;
  systems: number;
  total: number;
  perSqftBuilding: number;
  perSqftAboveGrade: number;
};

type HoldingDetail = {
  daysHeld: number;
  dailyTax: number;
  dailyInsurance: number;
  dailyHoa: number;
  dailyUtilities: number;
  dailyTotal: number;
  holdTax: number;
  holdInsurance: number;
  holdHoa: number;
  holdUtilities: number;
  total: number;
};

type TransactionDetail = {
  acquisitionTitle: number;
  dispositionTitle: number;
  dispositionCommissions: number;
  total: number;
};

type FinancingDetail = {
  loanAmount: number;
  ltvPct: number;
  annualRate: number;
  pointsRate: number;
  daysHeld: number;
  interestCost: number;
  originationCost: number;
  monthlyPayment: number;
  dailyInterest: number;
  total: number;
};

type ArvPerCompDetail = {
  address: string;
  closePrice: number;
  closeDateIso: string;
  daysSinceClose: number;
  distanceMiles: number;
  compBuildingSqft: number;
  psfBuilding: number;
  arvBlended: number;
  arvTimeAdjusted: number;
  confidence: number;
  decayWeight: number;
};

type TrendTierSegment = { rate: number | null; compCount: number };

type TrendTierStats = {
  compCount: number;
  radiusMiles: number;
  salePriceLow: number | null;
  salePriceHigh: number | null;
  psfBuildingLow: number | null;
  psfBuildingHigh: number | null;
  psfAboveGradeLow: number | null;
  psfAboveGradeHigh: number | null;
  lowEnd: TrendTierSegment;
  highEnd: TrendTierSegment;
};

type TrendDirection = "strong_appreciation" | "appreciating" | "flat" | "softening" | "declining" | "sharp_decline";

type TrendData = {
  blendedAnnualRate: number;
  rawLocalRate: number | null;
  rawMetroRate: number | null;
  localCompCount: number;
  metroCompCount: number;
  localRadius: number;
  metroRadius: number;
  direction: TrendDirection;
  isFallback: boolean;
  confidence: "high" | "low" | "fallback";
  lowEndRate: number | null;
  highEndRate: number | null;
  summary: string | null;
  detailJson: {
    localStats?: TrendTierStats;
    metroStats?: TrendTierStats;
  } | null;
};

type WorkstationData = {
  propertyId: string;
  analysisId: string;
  analysis: { scenarioName: string | null; strategyType: string | null; status: string | null };
  property: { address: string; city: string; county: string | null; state: string; postalCode: string | null; latitude: number | null; longitude: number | null };
  trend: TrendData | null;
  physical: {
    propertyType: string | null; propertySubType: string | null; structureType: string | null;
    levelClass: string | null; buildingSqft: number; aboveGradeSqft: number;
    belowGradeTotalSqft: number; belowGradeFinishedSqft: number;
    yearBuilt: number | null; bedroomsTotal: number | null; bathroomsTotal: number | null;
    garageSpaces: number | null; lotSizeSqft: number;
  } | null;
  listing: { listingId: string; mlsStatus: string | null; listPrice: number; originalListPrice: number; listingContractDate: string | null } | null;
  financials: { annualTax: number; annualHoa: number } | null;
  arv: {
    auto: number | null; selected: number | null; final: number | null; effective: number;
    selectedDetail: {
      arvAggregate: number; arvPerSqft: number; compCount: number;
      perCompDetails: ArvPerCompDetail[];
    } | null;
  };
  rehab: {
    auto: number | null; computed: number | null; manual: number | null; effective: number;
    scope: RehabScopeTier | null;
    scopeMultiplier: number;
    detail: RehabDetail | null;
  };
  holding: HoldingDetail | null;
  transaction: TransactionDetail | null;
  financing: FinancingDetail | null;
  dealMath: {
    arv: number; listPrice: number; rehabTotal: number; holdTotal: number;
    transactionTotal: number; financingTotal: number; targetProfit: number; totalCosts: number;
    maxOffer: number; offerPct: number; spread: number; estGapPerSqft: number;
  } | null;
  compSummary: { totalComps: number; selectedCount: number; avgSelectedPrice: number | null; avgSelectedPsf: number | null; avgSelectedDist: number | null };
  manualAnalysis: Record<string, unknown> | null;
  pipeline: Record<string, unknown> | null;
  notes: Array<{ id: string; note_type: string; note_body: string; is_public: boolean; created_at: string }>;
  compModalData: {
    subjectListingRowId: string | null;
    subjectListingMlsNumber: string | null;
    defaultProfileSlug: string;
    latestRun: { id: string; status: string | null; created_at: string | null; parameters_json: Record<string, unknown> | null; summary_json: Record<string, unknown> | null } | null;
    compCandidates: Array<Record<string, unknown>>;
  };
  subjectContext: Record<string, unknown>;
  scopeMultipliers: Record<RehabScopeTier, number>;
  cashRequired: {
    purchasePrice: number;
    downPaymentRate: number;
    downPayment: number;
    loanForPurchase: number;
    originationCost: number;
    loanAvailableForRehab: number;
    rehabTotal: number;
    rehabFromLoan: number;
    rehabOutOfPocket: number;
    acquisitionTitle: number;
    holdingTotal: number;
    interestCost: number;
    totalCashRequired: number;
  } | null;
};

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

function fmt(value: number | null | undefined) {
  if (value === null || value === undefined) return "\u2014";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

function fmtNum(value: number | null | undefined, d = 0) {
  if (value === null || value === undefined) return "\u2014";
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }).format(value);
}

function fmtPct(value: number | null | undefined) {
  if (value === null || value === undefined) return "\u2014";
  return `${(value * 100).toFixed(1)}%`;
}

// ---------------------------------------------------------------------------
// Tiny sub-components
// ---------------------------------------------------------------------------

const DIRECTION_DISPLAY: Record<TrendDirection, { label: string; color: string }> = {
  strong_appreciation: { label: "Strong Appreciation", color: "bg-emerald-100 text-emerald-700" },
  appreciating: { label: "Appreciating", color: "bg-emerald-50 text-emerald-600" },
  flat: { label: "Flat", color: "bg-slate-100 text-slate-600" },
  softening: { label: "Softening", color: "bg-amber-100 text-amber-700" },
  declining: { label: "Declining", color: "bg-red-100 text-red-700" },
  sharp_decline: { label: "Sharp Decline", color: "bg-red-200 text-red-800" },
};

function TrendDirectionBadge({ direction }: { direction: TrendDirection }) {
  const { label, color } = DIRECTION_DISPLAY[direction];
  return (
    <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${color}`}>
      {label}
    </span>
  );
}

function fmtRate(rate: number | null): string {
  if (rate == null) return "\u2014";
  return `${rate >= 0 ? "+" : ""}${(rate * 100).toFixed(1)}%`;
}

function TrendTierColumn({ label, radius, rate, stats }: {
  label: string;
  radius: number;
  rate: number | null;
  stats: TrendTierStats | null;
}) {
  const cc = stats?.compCount ?? 0;
  return (
    <div className="space-y-1 text-[10px]">
      <div className="text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-400">
        {label} <span className="font-normal">({cc} comps &le;{radius} mi)</span>
      </div>
      <div className="flex justify-between">
        <span className="text-slate-400">Rate</span>
        <span className={`font-mono ${rate != null && rate < 0 ? "text-red-600" : "text-slate-600"}`}>{fmtRate(rate)}/yr</span>
      </div>
      {/* Segments */}
      {stats?.lowEnd && stats.lowEnd.compCount > 0 && (
        <div className="flex justify-between">
          <span className="text-slate-400">Low 25th ({stats.lowEnd.compCount})</span>
          <span className="font-mono text-slate-600">{fmtRate(stats.lowEnd.rate)}</span>
        </div>
      )}
      {stats?.highEnd && stats.highEnd.compCount > 0 && (
        <div className="flex justify-between">
          <span className="text-slate-400">High 75th ({stats.highEnd.compCount})</span>
          <span className="font-mono text-slate-600">{fmtRate(stats.highEnd.rate)}</span>
        </div>
      )}
      {/* Ranges */}
      {stats && stats.salePriceLow != null && stats.salePriceHigh != null && (
        <div className="flex justify-between">
          <span className="text-slate-400">Price</span>
          <span className="font-mono text-slate-500">{fmt(stats.salePriceLow)}&ndash;{fmt(stats.salePriceHigh)}</span>
        </div>
      )}
      {stats && stats.psfBuildingLow != null && stats.psfBuildingHigh != null && (
        <div className="flex justify-between">
          <span className="text-slate-400">PSF Bldg</span>
          <span className="font-mono text-slate-500">${fmtNum(stats.psfBuildingLow, 0)}&ndash;${fmtNum(stats.psfBuildingHigh, 0)}</span>
        </div>
      )}
      {stats && stats.psfAboveGradeLow != null && stats.psfAboveGradeHigh != null && (
        <div className="flex justify-between">
          <span className="text-slate-400">PSF AG</span>
          <span className="font-mono text-slate-500">${fmtNum(stats.psfAboveGradeLow, 0)}&ndash;${fmtNum(stats.psfAboveGradeHigh, 0)}</span>
        </div>
      )}
    </div>
  );
}

function CostLine({ label, value, sub, negative }: { label: string; value: string; sub?: string; negative?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-2 py-[1px]">
      <span className="text-slate-500 truncate">{label}</span>
      <div className="text-right shrink-0">
        <span className={`font-mono ${negative ? "text-red-600" : "text-slate-700"}`}>{value}</span>
        {sub && <span className="ml-1 text-[10px] text-slate-400">{sub}</span>}
      </div>
    </div>
  );
}

function CardTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-1.5">
      <h3 className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">{children}</h3>
      {action}
    </div>
  );
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

const SCOPE_TIERS: { key: RehabScopeTier; label: string; short: string }[] = [
  { key: "cosmetic", label: "Cosmetic", short: "0.6x" },
  { key: "moderate", label: "Moderate", short: "1.0x" },
  { key: "heavy", label: "Heavy", short: "1.4x" },
  { key: "gut", label: "Gut", short: "2.0x" },
];

// ---------------------------------------------------------------------------
// Main workstation component
// ---------------------------------------------------------------------------

export function AnalysisWorkstation({ data }: { data: WorkstationData }) {
  const router = useRouter();
  const [showCompModal, setShowCompModal] = useState(false);
  const [showNoteForm, setShowNoteForm] = useState(false);
  const [noteCategory, setNoteCategory] = useState("location");
  const [noteBody, setNoteBody] = useState("");
  const [isSaving, setIsSaving] = useState(false);

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

  // Build selected comps list for the table
  const selectedComps = useMemo(() => {
    return d.compModalData.compCandidates
      .filter((c) => Boolean(c.selected_yn))
      .map((c) => {
        const m = (c.metrics_json ?? {}) as Record<string, unknown>;
        return {
          id: String(c.id),
          address: String(m.address ?? "\u2014"),
          closePrice: m.close_price as number | null,
          ppsf: m.ppsf as number | null,
          sqft: m.building_area_total_sqft as number | null,
          distance: c.distance_miles as number | null,
          closeDate: m.close_date ? String(m.close_date).slice(0, 10) : null,
        };
      });
  }, [d]);

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

      const compClosePrice = Number(m.close_price) || 0;
      const perCompGapPerSqft =
        subjectSqft > 0 && compClosePrice > 0 && subjectListPrice > 0
          ? Math.round((compClosePrice - subjectListPrice) / subjectSqft)
          : null;

      const isSelected = Boolean(c.selected_yn);
      pins.push({
        id: String(c.id),
        lat,
        lng,
        label: String(m.address ?? "\u2014"),
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
        type: isSelected ? "selected" : "candidate",
      });
    }

    return pins;
  }, [d, subjectSqft, subjectListPrice]);

  // Active scope for display
  const activeScope: RehabScopeTier = d.rehab.scope ?? "moderate";

  return (
    <section className="dw-section-stack-compact">
      {/* ================================================================== */}
      {/* HEADER BAR — compact property identity + key metrics               */}
      {/* ================================================================== */}
      <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Link
              href={`/analysis/properties/${d.propertyId}`}
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
      {/* MAIN ANALYSIS GRID — deal waterfall + 5 cost cards + overrides     */}
      {/* ================================================================== */}
      <div className="grid gap-2" style={{ gridTemplateColumns: "180px 1fr 1.4fr 1fr 1fr" }}>

        {/* ── DEAL WATERFALL (narrow spine) ── */}
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

        {/* ── ARV DETAIL CARD ── */}
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
                        <td className="py-0.5 text-right font-mono text-slate-600">{fmt(comp.closePrice)}</td>
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

        {/* ── PRICE TREND CARD ── */}
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

        {/* ── REHAB DETAIL CARD (largest) ── */}
        <div className="rounded-lg border border-slate-200 bg-white p-2.5 shadow-sm">
          <CardTitle
            action={
              d.rehab.manual !== null ? (
                <span className="text-[9px] font-semibold text-emerald-600 uppercase">Manual Override Active</span>
              ) : undefined
            }
          >
            Rehab
          </CardTitle>

          {/* Scope tier selector */}
          <form
            action={async (formData: FormData) => {
              setIsSaving(true);
              await saveManualAnalysisAction(initialManualAnalysisFormState, formData);
              setIsSaving(false);
              router.refresh();
            }}
          >
            <input type="hidden" name="analysis_id" value={d.analysisId} />
            <input type="hidden" name="property_id" value={d.propertyId} />
            {/* Preserve existing overrides */}
            <input type="hidden" name="arv_manual" value={d.manualAnalysis?.arv_manual as string ?? ""} />
            <input type="hidden" name="rehab_manual" value={d.manualAnalysis?.rehab_manual as string ?? ""} />
            <input type="hidden" name="days_held_manual" value={d.manualAnalysis?.days_held_manual as string ?? ""} />
            <input type="hidden" name="target_profit_manual" value={d.manualAnalysis?.target_profit_manual as string ?? ""} />
            <input type="hidden" name="analyst_condition" value={d.manualAnalysis?.analyst_condition as string ?? ""} />
            <input type="hidden" name="location_rating" value={d.manualAnalysis?.location_rating as string ?? ""} />
            <input type="hidden" name="rent_estimate_monthly" value={d.manualAnalysis?.rent_estimate_monthly as string ?? ""} />
            <input type="hidden" name="financing_rate_manual" value={d.manualAnalysis?.financing_rate_manual ? String(Number(d.manualAnalysis.financing_rate_manual) * 100) : ""} />
            <input type="hidden" name="financing_points_manual" value={d.manualAnalysis?.financing_points_manual ? String(Number(d.manualAnalysis.financing_points_manual) * 100) : ""} />
            <input type="hidden" name="financing_ltv_manual" value={d.manualAnalysis?.financing_ltv_manual ? String(Number(d.manualAnalysis.financing_ltv_manual) * 100) : ""} />

            <div className="flex gap-1 mb-2">
              {SCOPE_TIERS.map((tier) => (
                <button
                  key={tier.key}
                  type="submit"
                  name="rehab_scope"
                  value={tier.key}
                  disabled={isSaving}
                  className={`flex-1 rounded-md border px-1.5 py-1 text-center text-[10px] font-medium transition-colors ${
                    activeScope === tier.key
                      ? "border-blue-300 bg-blue-50 text-blue-700 shadow-sm"
                      : "border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:bg-slate-50"
                  }`}
                >
                  <div>{tier.label}</div>
                  <div className="text-[9px] opacity-70">{tier.short}</div>
                </button>
              ))}
            </div>
          </form>

          {d.rehab.detail && (
            <>
              {/* Multiplier breakdown */}
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-slate-400 mb-1.5">
                <span>Type: {d.rehab.detail.typeMultiplier}</span>
                <span>Cond: {d.rehab.detail.conditionMultiplier}</span>
                <span>Price: {d.rehab.detail.priceMultiplier}</span>
                <span>Age: {d.rehab.detail.ageMultiplier}</span>
                <span>Scope: {d.rehab.scopeMultiplier}</span>
                <span className="font-semibold text-slate-600">Composite: {(d.rehab.detail.compositeMultiplier * d.rehab.scopeMultiplier).toFixed(3)}</span>
              </div>

              {/* Line items in two columns */}
              <div className="grid grid-cols-2 gap-x-3 text-[11px]">
                <CostLine label="Above Grade" value={fmt(d.rehab.detail.aboveGrade)} />
                <CostLine label="Below Grade (fin)" value={fmt(d.rehab.detail.belowGradeFinished)} />
                <CostLine label="Below Grade (unfin)" value={fmt(d.rehab.detail.belowGradeUnfinished)} />
                <CostLine label="Exterior" value={fmt(d.rehab.detail.exterior)} />
                <CostLine label="Landscaping" value={fmt(d.rehab.detail.landscaping)} />
                <CostLine label="Systems" value={fmt(d.rehab.detail.systems)} />
              </div>

              <div className="border-t border-slate-200 mt-1.5 pt-1.5 flex items-center justify-between text-[11px]">
                <span className="font-bold text-slate-700">Total Rehab</span>
                <span className="font-mono font-bold text-slate-800">{fmt(d.rehab.detail.total)}</span>
              </div>
              <div className="flex justify-between text-[10px] text-slate-400">
                <span>${fmtNum(d.rehab.detail.perSqftBuilding, 2)}/sqft bldg</span>
                <span>${fmtNum(d.rehab.detail.perSqftAboveGrade, 2)}/sqft above</span>
              </div>
            </>
          )}
        </div>

        {/* ── HOLD + TRANSACTION stacked ── */}
        <div className="flex flex-col gap-2">
          {/* Holding */}
          <div className="rounded-lg border border-slate-200 bg-white p-2.5 shadow-sm flex-1">
            <CardTitle>Holding</CardTitle>
            {d.holding ? (
              <div className="text-[11px] space-y-0.5">
                <div className="rounded border border-slate-100 bg-slate-50 px-2 py-1 text-center mb-1.5">
                  <span className="text-[10px] text-slate-400">Hold Period </span>
                  <span className="font-mono font-bold text-slate-700">{d.holding.daysHeld} days</span>
                </div>
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
              <p className="text-[10px] text-slate-400">No data</p>
            )}
          </div>

          {/* Transaction */}
          <div className="rounded-lg border border-slate-200 bg-white p-2.5 shadow-sm flex-1">
            <CardTitle>Transaction</CardTitle>
            {d.transaction ? (
              <div className="text-[11px] space-y-0.5">
                <CostLine label="Acq. Title (0.3%)" value={fmt(d.transaction.acquisitionTitle)} />
                <CostLine label="Disp. Title (0.47%)" value={fmt(d.transaction.dispositionTitle)} />
                <CostLine label="Commissions (4%)" value={fmt(d.transaction.dispositionCommissions)} />
                <div className="border-t border-slate-200 pt-1 mt-1 flex justify-between">
                  <span className="font-bold text-slate-700">Total</span>
                  <span className="font-mono font-bold text-slate-800">{fmt(d.transaction.total)}</span>
                </div>
              </div>
            ) : (
              <p className="text-[10px] text-slate-400">No data</p>
            )}
          </div>
        </div>

        {/* ── FINANCING + OVERRIDES stacked ── */}
        <div className="flex flex-col gap-2">
          {/* Financing */}
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

          {/* Cash Out of Pocket */}
          {d.cashRequired && (
            <div className="rounded-lg border border-indigo-200 bg-indigo-50/30 p-2.5 shadow-sm">
              <CardTitle>Cash Required <span className="normal-case font-normal tracking-normal text-[9px] text-slate-400">@ Max Offer {fmt(d.cashRequired.purchasePrice)}</span></CardTitle>
              <div className="text-[11px] space-y-0.5">
                <CostLine label={`Down Pmt (${fmtPct(d.cashRequired.downPaymentRate)} of ${fmt(d.cashRequired.purchasePrice)})`} value={fmt(d.cashRequired.downPayment)} />
                <CostLine label="Acq. Title" value={fmt(d.cashRequired.acquisitionTitle)} />
                <CostLine label="Origination" value={fmt(d.cashRequired.originationCost)} />
                <CostLine label="Rehab OOP" value={fmt(d.cashRequired.rehabOutOfPocket)} sub={d.cashRequired.rehabOutOfPocket > 0 ? `of ${fmt(d.cashRequired.rehabTotal)}` : `${fmt(d.cashRequired.rehabTotal)} covered`} />
                <CostLine label="Holding" value={fmt(d.cashRequired.holdingTotal)} />
                <CostLine label="Interest" value={fmt(d.cashRequired.interestCost)} />
                <div className="border-t border-indigo-200 pt-1 mt-1 flex justify-between">
                  <span className="font-bold text-slate-700">Total Cash</span>
                  <span className="font-mono font-bold text-indigo-700">{fmt(d.cashRequired.totalCashRequired)}</span>
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">
                  <div className="flex justify-between">
                    <span>Loan funds purchase</span>
                    <span className="font-mono">{fmt(d.cashRequired.loanForPurchase)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Loan funds rehab</span>
                    <span className="font-mono">{fmt(d.cashRequired.rehabFromLoan)}</span>
                  </div>
                </div>
                <p className="text-[9px] text-slate-400 mt-1 leading-tight">
                  Excludes disp. costs (paid from sale proceeds). Down payment is equity returned at sale.
                </p>
              </div>
            </div>
          )}

          {/* Analyst Overrides (compact) */}
          <div className="rounded-lg border border-amber-200 bg-amber-50/30 p-2.5 shadow-sm flex-1">
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
        </div>
      </div>

      {/* ================================================================== */}
      {/* COMPARABLE SALES — map + table                                     */}
      {/* ================================================================== */}
      <div className="rounded-lg border border-slate-200 bg-white p-2.5 shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <CardTitle>
            Comparable Sales ({d.compSummary.selectedCount} selected of {d.compSummary.totalComps})
          </CardTitle>
          <button
            type="button"
            onClick={() => setShowCompModal(true)}
            className="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-600 hover:bg-slate-50"
          >
            Edit Comps
          </button>
        </div>
        <div className="grid gap-2" style={{ gridTemplateColumns: "340px 1fr" }}>
          {/* Map */}
          <div>
            {showCompModal ? (
              <div className="flex h-[340px] items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-xs text-slate-400">
                Map open in comp editor
              </div>
            ) : mapPins.length > 1 ? (
              <CompMap
                pins={mapPins}
                height={340}
                subjectLat={d.property.latitude}
                subjectLng={d.property.longitude}
              />
            ) : (
              <div className="flex h-[340px] items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-xs text-slate-400">
                No location data
              </div>
            )}
          </div>
          {/* Selected comps table */}
          <div>
            {selectedComps.length > 0 ? (
              <div className="overflow-auto rounded-lg border border-slate-200 max-h-[340px]">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-left text-[9px] uppercase tracking-[0.1em] text-slate-500 sticky top-0">
                      <th className="px-2 py-1">Address</th>
                      <th className="px-2 py-1 text-right">Close</th>
                      <th className="px-2 py-1 text-right">PSF</th>
                      <th className="px-2 py-1 text-right">Sqft</th>
                      <th className="px-2 py-1 text-right">Dist</th>
                      <th className="px-2 py-1 text-right">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedComps.map((c) => (
                      <tr key={c.id} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="px-2 py-1 font-medium text-slate-700">{c.address}</td>
                        <td className="px-2 py-1 text-right font-mono text-slate-700">{fmt(c.closePrice)}</td>
                        <td className="px-2 py-1 text-right font-mono text-slate-600">${fmtNum(c.ppsf)}</td>
                        <td className="px-2 py-1 text-right text-slate-600">{fmtNum(c.sqft)}</td>
                        <td className="px-2 py-1 text-right text-slate-600">{fmtNum(c.distance, 2)} mi</td>
                        <td className="px-2 py-1 text-right text-slate-500">{c.closeDate ?? "\u2014"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="flex h-[340px] items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-sm text-slate-400">
                No comps selected. Click &quot;Edit Comps&quot; to review.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ================================================================== */}
      {/* NOTES + PIPELINE (side by side, compressed)                        */}
      {/* ================================================================== */}
      <div className="grid gap-2 xl:grid-cols-[1fr_auto]">
        {/* Notes */}
        <div className="rounded-lg border border-slate-200 bg-white p-2.5 shadow-sm">
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

        {/* Pipeline */}
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
      </div>

      {/* ================================================================== */}
      {/* COMP SELECTION MODAL                                               */}
      {/* ================================================================== */}
      {showCompModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="relative flex h-[90vh] w-[92vw] flex-col overflow-hidden rounded-xl border border-slate-300 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2">
              <h2 className="text-sm font-semibold text-slate-800">Comparable Selection &mdash; {d.property.address}</h2>
              <div className="flex items-center gap-3">
                <p className="text-[10px] text-slate-400">
                  Hover for details &middot; Click to select/deselect &middot;
                  <span className="inline-block h-2 w-2 rounded-full bg-emerald-500 mx-0.5 align-middle" /> Selected
                  <span className="inline-block h-2 w-2 rounded-full bg-slate-400 mx-0.5 align-middle" /> Candidate
                  <span className="inline-block h-2 w-2 rounded-full bg-red-600 mx-0.5 align-middle" /> Subject
                </p>
                <button
                  type="button"
                  onClick={() => { setShowCompModal(false); router.refresh(); }}
                  className="rounded px-3 py-1 text-sm font-medium text-slate-600 hover:bg-slate-100"
                >
                  Close
                </button>
              </div>
            </div>
            <div className="flex flex-1 overflow-hidden">
              {/* Left: Map */}
              {mapPins.length > 1 && (
                <div className="shrink-0 border-r border-slate-200 p-3" style={{ width: 480 }}>
                  <CompMap
                    pins={mapPins}
                    height={480}
                    subjectLat={d.property.latitude}
                    subjectLng={d.property.longitude}
                    onPinClick={handleMapPinToggle}
                  />
                </div>
              )}
              {/* Right: Candidate list & search controls */}
              <div className="flex-1 overflow-auto p-3">
                <ComparableWorkspacePanel
                  propertyId={d.propertyId}
                  analysisId={d.analysisId}
                  subjectListingRowId={d.compModalData.subjectListingRowId}
                  subjectListingMlsNumber={d.compModalData.subjectListingMlsNumber}
                  analysisStrategyType={d.analysis.strategyType}
                  defaultProfileSlug={d.compModalData.defaultProfileSlug}
                  latestRun={d.compModalData.latestRun}
                  latestCandidates={d.compModalData.compCandidates as any}
                  defaultProfileRules={profileRules}
                  compRunMessage={null}
                  compErrorMessage={null}
                  subjectContext={d.subjectContext as any}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

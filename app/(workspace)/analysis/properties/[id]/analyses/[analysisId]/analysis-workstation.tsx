"use client";

import { useState, useMemo, useCallback, type ReactNode } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { MapPin, MapPinTooltipData } from "@/components/properties/comp-map";

const CompMap = dynamic(
  () => import("@/components/properties/comp-map").then((m) => m.CompMap),
  { ssr: false, loading: () => <div className="flex h-[300px] items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-xs text-slate-400">Loading map...</div> },
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

type WorkstationData = {
  propertyId: string;
  analysisId: string;
  analysis: { scenarioName: string | null; strategyType: string | null; status: string | null };
  property: { address: string; city: string; county: string | null; state: string; postalCode: string | null; latitude: number | null; longitude: number | null };
  physical: {
    propertyType: string | null; propertySubType: string | null; structureType: string | null;
    levelClass: string | null; buildingSqft: number; aboveGradeSqft: number;
    belowGradeTotalSqft: number; belowGradeFinishedSqft: number;
    yearBuilt: number | null; bedroomsTotal: number | null; bathroomsTotal: number | null;
    garageSpaces: number | null; lotSizeSqft: number;
  } | null;
  listing: { listingId: string; mlsStatus: string | null; listPrice: number; originalListPrice: number; listingContractDate: string | null } | null;
  financials: { annualTax: number; annualHoa: number } | null;
  arv: { auto: number | null; selected: number | null; final: number | null; effective: number };
  rehab: { auto: number | null; computed: number | null; manual: number | null; effective: number };
  holding: { total: number; daysHeld: number } | null;
  transaction: { total: number } | null;
  financing: {
    loanAmount: number; ltvPct: number; annualRate: number; pointsRate: number;
    daysHeld: number; interestCost: number; originationCost: number;
    monthlyPayment: number; dailyInterest: number; total: number;
  } | null;
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
};

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

function fmt(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

function fmtNum(value: number | null | undefined, d = 0) {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }).format(value);
}

function fmtPct(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";
  return `${(value * 100).toFixed(1)}%`;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatChip({ label, value, highlight }: { label: string; value: ReactNode; highlight?: boolean }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm">
      <div className="text-[10px] uppercase tracking-[0.14em] text-slate-500">{label}</div>
      <div className={`mt-1 text-sm font-semibold ${highlight ? "text-emerald-700" : "text-slate-900"}`}>{value}</div>
    </div>
  );
}

function DetailItem({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="dw-detail-item">
      <div className="dw-detail-label">{label}</div>
      <div className="dw-detail-value">{value}</div>
    </div>
  );
}

function DealLine({ label, value, negative, bold }: { label: string; value: string; negative?: boolean; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between py-0.5">
      <span className={`${negative ? "text-slate-500" : ""} ${bold ? "font-semibold" : ""}`}>{label}</span>
      <span className={`font-mono text-sm ${negative ? "text-red-600" : ""} ${bold ? "font-bold text-emerald-700" : ""}`}>{value}</span>
    </div>
  );
}

function SectionCard({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <div className="dw-card-compact space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
        {action}
      </div>
      {children}
    </div>
  );
}

const NOTE_CATEGORIES = [
  { value: "location", label: "Location", icon: "📍" },
  { value: "scope", label: "Scope", icon: "🔧" },
  { value: "valuation", label: "Valuation", icon: "💰" },
  { value: "property", label: "Property", icon: "🏠" },
  { value: "internal", label: "Internal", icon: "💬" },
  { value: "offer", label: "Offer", icon: "📋" },
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
  const [showFinancingModal, setShowFinancingModal] = useState(false);
  const [showNoteForm, setShowNoteForm] = useState(false);
  const [noteCategory, setNoteCategory] = useState("location");
  const [noteBody, setNoteBody] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const d = data;
  const p = d.physical;

  // Load default profile rules for comp panel (empty object as fallback)
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
          address: String(m.address ?? "—"),
          closePrice: m.close_price as number | null,
          ppsf: m.ppsf as number | null,
          sqft: m.building_area_total_sqft as number | null,
          distance: c.distance_miles as number | null,
          closeDate: m.close_date ? String(m.close_date).slice(0, 10) : null,
        };
      });
  }, [d]);

  // Build map pins from comp candidates
  const subjectSqft = p?.buildingSqft ?? 0;
  const subjectListPrice = d.listing?.listPrice ?? 0;

  const mapPins = useMemo<MapPin[]>(() => {
    const pins: MapPin[] = [];

    // Subject pin — show deal-level gap/sqft
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

    // Comp pins from candidates (lat/lng stored in metrics_json)
    for (const c of d.compModalData.compCandidates) {
      const m = (c.metrics_json ?? {}) as Record<string, unknown>;
      const lat = Number(m.latitude);
      const lng = Number(m.longitude);
      if (!lat || !lng || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;

      const compSqft = Number(m.building_area_total_sqft) || null;
      // Positive = subject is larger (good for buyer), negative = subject is smaller
      const sqftDelta = compSqft && subjectSqft ? subjectSqft - compSqft : null;
      const sqftDeltaPct = compSqft && subjectSqft ? (subjectSqft - compSqft) / subjectSqft : null;

      // Per-comp gap/sqft: (comp close price − subject list price) / subject sqft
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
        type: isSelected ? "selected" : "candidate",
      });
    }

    return pins;
  }, [d, subjectSqft, subjectListPrice]);

  return (
    <section className="dw-section-stack-compact">
      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link
            href={`/analysis/properties/${d.propertyId}`}
            className="text-[11px] uppercase tracking-[0.16em] text-slate-500 hover:text-slate-900"
          >
            ← Property Hub
          </Link>
          <h1 className="dw-page-title mt-1">{d.property.address}</h1>
          <p className="dw-page-copy">
            {d.property.city}, {d.property.state} {d.property.postalCode} &middot;{" "}
            {d.analysis.scenarioName ?? "Analysis"} &middot;{" "}
            {d.listing?.mlsStatus ?? "No Listing"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-medium uppercase tracking-[0.14em] text-slate-600">
            {d.analysis.strategyType ?? "general"}
          </span>
          {d.listing?.listingId && (
            <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-mono text-slate-600">
              MLS# {d.listing.listingId}
            </span>
          )}
        </div>
      </div>

      {/* ── Stat chips ── */}
      <div className="grid gap-2 sm:grid-cols-4 xl:grid-cols-7">
        <StatChip label="List Price" value={fmt(d.listing?.listPrice)} />
        <StatChip label="Type" value={p?.propertyType ?? "—"} />
        <StatChip label="Beds / Baths" value={`${fmtNum(p?.bedroomsTotal)} / ${fmtNum(p?.bathroomsTotal, 1)}`} />
        <StatChip label="Building Sqft" value={fmtNum(p?.buildingSqft)} />
        <StatChip label="Year Built" value={p?.yearBuilt?.toString() ?? "—"} />
        <StatChip label="Effective ARV" value={fmt(d.arv.effective)} highlight />
        <StatChip label="Max Offer" value={fmt(d.dealMath?.maxOffer)} highlight />
      </div>

      {/* ── Property Facts + Deal Analysis ── */}
      <div className="grid gap-3 xl:grid-cols-[0.85fr_1.15fr]">
        <SectionCard title="Property Facts">
          <div className="dw-detail-grid">
            <DetailItem label="Property Type" value={p?.propertyType ?? "—"} />
            <DetailItem label="Structure" value={p?.structureType ?? "—"} />
            <DetailItem label="Level Class" value={p?.levelClass ?? "—"} />
            <DetailItem label="Beds" value={fmtNum(p?.bedroomsTotal)} />
            <DetailItem label="Baths" value={fmtNum(p?.bathroomsTotal, 1)} />
            <DetailItem label="Garage" value={fmtNum(p?.garageSpaces, 1)} />
            <DetailItem label="Above Grade" value={fmtNum(p?.aboveGradeSqft)} />
            <DetailItem label="Below Grade" value={fmtNum(p?.belowGradeTotalSqft)} />
            <DetailItem label="Lot Sqft" value={fmtNum(p?.lotSizeSqft)} />
            <DetailItem label="Year Built" value={p?.yearBuilt?.toString() ?? "—"} />
            <DetailItem label="Taxes/yr" value={fmt(d.financials?.annualTax)} />
            <DetailItem label="HOA/yr" value={fmt(d.financials?.annualHoa)} />
          </div>
        </SectionCard>

        <SectionCard title="Deal Analysis">
          <div className="space-y-3">
            {/* 3-tier ARV */}
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                After Repair Value (ARV)
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <div className="text-[10px] text-slate-400">Auto</div>
                  <div className="text-sm font-medium text-slate-600">{fmt(d.arv.auto)}</div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-400">Selected ({d.compSummary.selectedCount} comps)</div>
                  <div className="text-sm font-semibold text-blue-700">{fmt(d.arv.selected)}</div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-400">Final (manual)</div>
                  <div className="text-sm font-bold text-emerald-700">{d.arv.final !== null ? fmt(d.arv.final) : <span className="text-slate-300">—</span>}</div>
                </div>
              </div>
            </div>

            {/* Deal math waterfall */}
            <div className="space-y-0.5 text-sm">
              <DealLine label="Effective ARV" value={fmt(d.arv.effective)} />
              <DealLine label="− Rehab" value={fmt(d.rehab.effective)} negative />
              <DealLine label="− Holding" value={fmt(d.holding?.total)} negative />
              <DealLine label="− Transaction" value={fmt(d.transaction?.total)} negative />
              {d.financing && (
                <div className="flex items-center justify-between py-0.5">
                  <button
                    type="button"
                    onClick={() => setShowFinancingModal(true)}
                    className="text-slate-500 underline decoration-dotted underline-offset-2 hover:text-blue-600"
                  >
                    − Financing
                  </button>
                  <span className="font-mono text-sm text-red-600">{fmt(d.financing.total)}</span>
                </div>
              )}
              <DealLine label="− Target Profit" value={fmt(d.dealMath?.targetProfit)} negative />
              <div className="border-t border-slate-300 pt-1">
                <DealLine label="= Max Offer" value={fmt(d.dealMath?.maxOffer)} bold />
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>Offer %</span>
                  <span>{fmtPct(d.dealMath?.offerPct)}</span>
                </div>
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>Spread (ARV − List)</span>
                  <span>{fmt(d.dealMath?.spread)}</span>
                </div>
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>Gap/sqft</span>
                  <span>{d.dealMath?.estGapPerSqft !== undefined ? `$${fmtNum(d.dealMath.estGapPerSqft)}` : "—"}</span>
                </div>
              </div>
            </div>

            {/* Cost breakdown summary */}
            <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 space-y-0.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">Rehab</span>
                <span>
                  <span className="text-slate-400">Auto: {fmt(d.rehab.auto ?? d.rehab.computed)}</span>
                  {d.rehab.manual !== null && (
                    <span className="ml-2 font-semibold text-emerald-700">Manual: {fmt(d.rehab.manual)}</span>
                  )}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">Hold ({d.holding?.daysHeld ?? "—"} days)</span>
                <span>{fmt(d.holding?.total)}</span>
              </div>
              {d.financing && (
                <div className="flex items-center justify-between text-xs">
                  <button
                    type="button"
                    onClick={() => setShowFinancingModal(true)}
                    className="text-slate-500 underline decoration-dotted underline-offset-2 hover:text-blue-600"
                  >
                    Financing ({fmtPct(d.financing.annualRate)} @ {fmtPct(d.financing.ltvPct)} LTV)
                  </button>
                  <span>{fmt(d.financing.total)}</span>
                </div>
              )}
            </div>
          </div>
        </SectionCard>
      </div>

      {/* ── Manual Overrides (inline form) ── */}
      <SectionCard title="Analyst Overrides">
        <form
          action={async (formData: FormData) => {
            setIsSaving(true);
            await saveManualAnalysisAction(initialManualAnalysisFormState, formData);
            setIsSaving(false);
            router.refresh();
          }}
          className="space-y-3"
        >
          <input type="hidden" name="analysis_id" value={d.analysisId} />
          <input type="hidden" name="property_id" value={d.propertyId} />
          <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-6">
            <div>
              <label className="dw-label">Final ARV</label>
              <input type="number" name="arv_manual" className="dw-input" defaultValue={d.manualAnalysis?.arv_manual as number ?? ""} placeholder="Auto" />
            </div>
            <div>
              <label className="dw-label">Manual Rehab</label>
              <input type="number" name="rehab_manual" className="dw-input" defaultValue={d.manualAnalysis?.rehab_manual as number ?? ""} placeholder="Auto" />
            </div>
            <div>
              <label className="dw-label">Days Held</label>
              <input type="number" name="days_held_manual" className="dw-input" defaultValue={d.manualAnalysis?.days_held_manual as number ?? ""} placeholder="Auto" />
            </div>
            <div>
              <label className="dw-label">Target Profit</label>
              <input type="number" name="target_profit_manual" className="dw-input" defaultValue={d.manualAnalysis?.target_profit_manual as number ?? ""} placeholder="$40,000" />
            </div>
            <div>
              <label className="dw-label">Condition</label>
              <select name="analyst_condition" className="dw-select" defaultValue={d.manualAnalysis?.analyst_condition as string ?? ""}>
                <option value="">—</option>
                <option>Fixer</option><option>Poor</option><option>Fair</option>
                <option>Average</option><option>Good</option><option>Excellent</option>
              </select>
            </div>
            <div>
              <label className="dw-label">Location Rating</label>
              <select name="location_rating" className="dw-select" defaultValue={d.manualAnalysis?.location_rating as string ?? ""}>
                <option value="">—</option>
                <option>Poor</option><option>Fair</option><option>Average</option>
                <option>Good</option><option>Excellent</option>
              </select>
            </div>
            <div>
              <label className="dw-label">Est. Rent/mo</label>
              <input type="number" name="rent_estimate_monthly" className="dw-input" defaultValue={d.manualAnalysis?.rent_estimate_monthly as number ?? ""} />
            </div>
            <div>
              <label className="dw-label">Loan Rate %</label>
              <input type="number" step="0.1" name="financing_rate_manual" className="dw-input" defaultValue={d.manualAnalysis?.financing_rate_manual ? String(Number(d.manualAnalysis.financing_rate_manual) * 100) : ""} placeholder="11" />
            </div>
            <div>
              <label className="dw-label">Points %</label>
              <input type="number" step="0.1" name="financing_points_manual" className="dw-input" defaultValue={d.manualAnalysis?.financing_points_manual ? String(Number(d.manualAnalysis.financing_points_manual) * 100) : ""} placeholder="1" />
            </div>
            <div>
              <label className="dw-label">LTV %</label>
              <input type="number" step="1" name="financing_ltv_manual" className="dw-input" defaultValue={d.manualAnalysis?.financing_ltv_manual ? String(Number(d.manualAnalysis.financing_ltv_manual) * 100) : ""} placeholder="80" />
            </div>
          </div>
          <button type="submit" className="dw-button-secondary text-xs" disabled={isSaving}>
            {isSaving ? "Saving..." : "Save Overrides"}
          </button>
        </form>
      </SectionCard>

      {/* ── Comparable Sales ── */}
      <SectionCard
        title={`Comparable Sales (${d.compSummary.selectedCount} selected of ${d.compSummary.totalComps})`}
        action={
          <button
            type="button"
            onClick={() => setShowCompModal(true)}
            className="dw-button-secondary text-xs"
          >
            Edit Comps ↗
          </button>
        }
      >
        <div className="grid gap-2 sm:grid-cols-4 mb-3">
          <StatChip label="Avg Close Price" value={fmt(d.compSummary.avgSelectedPrice)} />
          <StatChip label="Avg PSF" value={d.compSummary.avgSelectedPsf ? `$${fmtNum(d.compSummary.avgSelectedPsf)}` : "—"} />
          <StatChip label="Avg Distance" value={d.compSummary.avgSelectedDist ? `${fmtNum(d.compSummary.avgSelectedDist, 2)} mi` : "—"} />
          <StatChip label="Selected ARV" value={fmt(d.arv.selected)} highlight />
        </div>

        <div className="grid gap-3 xl:grid-cols-[400px_1fr]">
          {/* Map — square (hidden when comp modal is open to avoid z-index overlap) */}
          <div>
            {showCompModal ? (
              <div className="flex h-[400px] items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-xs text-slate-400">
                Map open in comp editor
              </div>
            ) : mapPins.length > 1 ? (
              <CompMap
                pins={mapPins}
                height={400}
                subjectLat={d.property.latitude}
                subjectLng={d.property.longitude}
              />
            ) : (
              <div className="flex h-[400px] items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-xs text-slate-400">
                No location data available
              </div>
            )}
          </div>

          {/* Selected comps table */}
          <div>
            {selectedComps.length > 0 ? (
              <div className="overflow-auto rounded-lg border border-slate-200">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-left text-[10px] uppercase tracking-[0.12em] text-slate-500">
                      <th className="px-2 py-1.5">Address</th>
                      <th className="px-2 py-1.5 text-right">Close Price</th>
                      <th className="px-2 py-1.5 text-right">PSF</th>
                      <th className="px-2 py-1.5 text-right">Sqft</th>
                      <th className="px-2 py-1.5 text-right">Dist</th>
                      <th className="px-2 py-1.5 text-right">Close Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedComps.map((c) => (
                      <tr key={c.id} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="px-2 py-1.5 font-medium text-slate-700">{c.address}</td>
                        <td className="px-2 py-1.5 text-right font-mono text-slate-700">{fmt(c.closePrice)}</td>
                        <td className="px-2 py-1.5 text-right font-mono text-slate-600">${fmtNum(c.ppsf)}</td>
                        <td className="px-2 py-1.5 text-right text-slate-600">{fmtNum(c.sqft)}</td>
                        <td className="px-2 py-1.5 text-right text-slate-600">{fmtNum(c.distance, 2)} mi</td>
                        <td className="px-2 py-1.5 text-right text-slate-500">{c.closeDate ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="flex h-full items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-sm text-slate-400">
                No comps selected yet. Click &quot;Edit Comps&quot; to review and select comparable sales.
              </div>
            )}
          </div>
        </div>
      </SectionCard>

      {/* ── Notes ── */}
      <SectionCard
        title={`Notes (${d.notes.length})`}
        action={
          <button
            type="button"
            onClick={() => setShowNoteForm(!showNoteForm)}
            className="text-xs text-blue-600 hover:underline"
          >
            {showNoteForm ? "Cancel" : "+ Add Note"}
          </button>
        }
      >
        {showNoteForm && (
          <form
            action={async (formData: FormData) => {
              await addAnalysisNoteAction(formData);
              setNoteBody("");
              setShowNoteForm(false);
              router.refresh();
            }}
            className="mb-3 space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3"
          >
            <input type="hidden" name="analysis_id" value={d.analysisId} />
            <div className="flex gap-2">
              <select
                name="note_type"
                className="dw-select"
                value={noteCategory}
                onChange={(e) => setNoteCategory(e.target.value)}
              >
                {NOTE_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>{c.icon} {c.label}</option>
                ))}
              </select>
              <label className="flex items-center gap-1 text-xs text-slate-500">
                <input
                  type="checkbox"
                  name="is_public"
                  defaultChecked={noteCategory !== "internal"}
                />
                Public
              </label>
            </div>
            <textarea
              name="note_body"
              className="dw-textarea w-full"
              rows={2}
              placeholder="Enter note..."
              value={noteBody}
              onChange={(e) => setNoteBody(e.target.value)}
              required
            />
            <button type="submit" className="dw-button-primary text-xs">Save Note</button>
          </form>
        )}

        {d.notes.length === 0 && !showNoteForm ? (
          <p className="py-3 text-center text-xs text-slate-400">No notes yet.</p>
        ) : (
          <div className="space-y-1">
            {d.notes.map((note) => {
              const cat = NOTE_CATEGORIES.find((c) => c.value === note.note_type);
              return (
                <div key={note.id} className="flex items-start gap-2 rounded border border-slate-100 bg-white px-2 py-1.5 text-sm">
                  <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                    {cat?.icon} {cat?.label ?? note.note_type}
                  </span>
                  <span className="flex-1 text-slate-700">{note.note_body}</span>
                  <span className={`shrink-0 text-[10px] ${note.is_public ? "text-emerald-600" : "text-slate-400"}`}>
                    {note.is_public ? "Public" : "Internal"}
                  </span>
                  <form action={async (formData: FormData) => { await deleteAnalysisNoteAction(formData); router.refresh(); }}>
                    <input type="hidden" name="note_id" value={note.id} />
                    <input type="hidden" name="analysis_id" value={d.analysisId} />
                    <button type="submit" className="text-[10px] text-red-400 hover:text-red-600">✕</button>
                  </form>
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>

      {/* ── Pipeline ── */}
      <SectionCard title="Pipeline">
        <form
          action={async (formData: FormData) => {
            await savePipelineAction(formData);
            router.refresh();
          }}
          className="flex flex-wrap items-end gap-3"
        >
          <input type="hidden" name="analysis_id" value={d.analysisId} />
          <div>
            <label className="dw-label">Interest Level</label>
            <select name="interest_level" className="dw-select" defaultValue={d.pipeline?.interest_level as string ?? ""}>
              <option value="">—</option>
              {PIPELINE_INTEREST.map((v) => <option key={v}>{v}</option>)}
            </select>
          </div>
          <div>
            <label className="dw-label">Showing Status</label>
            <select name="showing_status" className="dw-select" defaultValue={d.pipeline?.showing_status as string ?? ""}>
              <option value="">—</option>
              {PIPELINE_SHOWING.map((v) => <option key={v}>{v}</option>)}
            </select>
          </div>
          <div>
            <label className="dw-label">Offer Status</label>
            <select name="offer_status" className="dw-select" defaultValue={d.pipeline?.offer_status as string ?? ""}>
              <option value="">—</option>
              {PIPELINE_OFFER.map((v) => <option key={v}>{v}</option>)}
            </select>
          </div>
          <button type="submit" className="dw-button-secondary text-xs">Save Pipeline</button>
        </form>
      </SectionCard>

      {/* ── Financing Detail Modal ── */}
      {showFinancingModal && d.financing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="relative w-full max-w-md rounded-xl border border-slate-300 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <h2 className="text-sm font-semibold text-slate-800">Financing Detail</h2>
              <button
                type="button"
                onClick={() => setShowFinancingModal(false)}
                className="rounded px-2 py-1 text-sm font-medium text-slate-600 hover:bg-slate-100"
              >
                ✕
              </button>
            </div>
            <div className="space-y-3 p-4">
              {/* Loan parameters */}
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Loan Parameters</div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                  <span className="text-slate-500">Loan Basis (ARV)</span>
                  <span className="text-right font-mono">{fmt(d.arv.effective)}</span>
                  <span className="text-slate-500">LTV</span>
                  <span className="text-right font-mono">{fmtPct(d.financing.ltvPct)}</span>
                  <span className="text-slate-500">Loan Amount</span>
                  <span className="text-right font-mono font-semibold">{fmt(d.financing.loanAmount)}</span>
                  <span className="text-slate-500">Annual Rate</span>
                  <span className="text-right font-mono">{fmtPct(d.financing.annualRate)}</span>
                  <span className="text-slate-500">Origination Points</span>
                  <span className="text-right font-mono">{fmtPct(d.financing.pointsRate)}</span>
                  <span className="text-slate-500">Hold Period</span>
                  <span className="text-right font-mono">{d.financing.daysHeld} days</span>
                </div>
              </div>

              {/* Cost breakdown */}
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Cost Breakdown</div>
                <div className="space-y-1 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Interest ({d.financing.daysHeld} days)</span>
                    <span className="font-mono text-red-600">{fmt(d.financing.interestCost)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Origination Fee</span>
                    <span className="font-mono text-red-600">{fmt(d.financing.originationCost)}</span>
                  </div>
                  <div className="flex items-center justify-between border-t border-slate-300 pt-1">
                    <span className="font-semibold">Total Financing</span>
                    <span className="font-mono font-bold text-red-700">{fmt(d.financing.total)}</span>
                  </div>
                </div>
              </div>

              {/* Reference rates */}
              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Reference</div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                  <span className="text-slate-500">Monthly Payment (I/O)</span>
                  <span className="text-right font-mono">{fmt(d.financing.monthlyPayment)}</span>
                  <span className="text-slate-500">Daily Interest</span>
                  <span className="text-right font-mono">${fmtNum(d.financing.dailyInterest, 2)}</span>
                </div>
              </div>

              <p className="text-[10px] text-slate-400">
                Loan based on ARV &times; LTV (hard money). Override rate, points, and LTV in Analyst Overrides.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── Comp Selection Modal ── */}
      {showCompModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="relative flex h-[90vh] w-[92vw] flex-col overflow-hidden rounded-xl border border-slate-300 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2">
              <h2 className="text-sm font-semibold text-slate-800">Comparable Selection — {d.property.address}</h2>
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
                  ✕ Close
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

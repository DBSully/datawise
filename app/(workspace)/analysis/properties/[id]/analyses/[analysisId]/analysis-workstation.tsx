"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  saveManualAnalysisAction,
  addAnalysisNoteAction,
  deleteAnalysisNoteAction,
  savePipelineAction,
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
  dealMath: {
    arv: number; listPrice: number; rehabTotal: number; holdTotal: number;
    transactionTotal: number; targetProfit: number; totalCosts: number;
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
  const [showNoteForm, setShowNoteForm] = useState(false);
  const [noteCategory, setNoteCategory] = useState("location");
  const [noteBody, setNoteBody] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const d = data;
  const p = d.physical;

  // Load default profile rules for comp panel (empty object as fallback)
  const profileRules = d.compModalData.latestRun?.parameters_json ?? {};

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

            {/* Rehab summary */}
            <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
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
          </div>
          <button type="submit" className="dw-button-secondary text-xs" disabled={isSaving}>
            {isSaving ? "Saving..." : "Save Overrides"}
          </button>
        </form>
      </SectionCard>

      {/* ── Comp Summary ── */}
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
        {d.compSummary.selectedCount > 0 ? (
          <div className="grid gap-2 sm:grid-cols-4">
            <StatChip label="Avg Close Price" value={fmt(d.compSummary.avgSelectedPrice)} />
            <StatChip label="Avg PSF" value={d.compSummary.avgSelectedPsf ? `$${fmtNum(d.compSummary.avgSelectedPsf)}` : "—"} />
            <StatChip label="Avg Distance" value={d.compSummary.avgSelectedDist ? `${fmtNum(d.compSummary.avgSelectedDist, 2)} mi` : "—"} />
            <StatChip label="Selected ARV" value={fmt(d.arv.selected)} highlight />
          </div>
        ) : (
          <p className="py-4 text-center text-sm text-slate-400">
            No comps selected yet. Click &quot;Edit Comps&quot; to review and select comparable sales.
          </p>
        )}
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

      {/* ── Comp Selection Modal ── */}
      {showCompModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="relative flex h-[90vh] w-[85vw] flex-col overflow-hidden rounded-xl border border-slate-300 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2">
              <h2 className="text-sm font-semibold text-slate-800">Comparable Selection — {d.property.address}</h2>
              <button
                type="button"
                onClick={() => { setShowCompModal(false); router.refresh(); }}
                className="rounded px-3 py-1 text-sm font-medium text-slate-600 hover:bg-slate-100"
              >
                ✕ Close
              </button>
            </div>
            <div className="flex-1 overflow-auto p-4">
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
      )}
    </section>
  );
}

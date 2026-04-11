// Phase 1 Step 3E — new Workstation client.
//
// The canonical Analysis Workstation client component, built up
// incrementally per WORKSTATION_CARD_SPEC.md. As of 3E.2 the header
// bar is functional. Subsequent sub-tasks fill in the remaining
// regions: top tile row (3E.3), deal stat strip (3E.4), hero comp
// workspace (3E.5), right column collapsed cards (3E.6), per-card
// detail modals (3E.7), cross-card cascades + polish (3E.8).
//
// Layout overview (per spec §2):
//
//   ┌─────────────────────────────────────────────────────────────┐
//   │  HEADER BAR                                       (3E.2 ✓)  │
//   ├─────────────────────────────────────────────────────────────┤
//   │  TOP TILE ROW — MLS / Physical / QuickAnalysis / QuickStat │
//   │                                                   (3E.3)    │
//   ├─────────────────────────────────────────────────────────────┤
//   │  DEAL STAT STRIP                                  (3E.4)    │
//   ├─────────────────────────────────────────────┬───────────────┤
//   │                                             │               │
//   │  HERO COMP WORKSPACE                        │  RIGHT COLUMN │
//   │  Map + comp table + tab bar + controls      │  9 cards stacked │
//   │                                             │               │
//   │                                  (3E.5)     │  (3E.6 + 3E.7)│
//   └─────────────────────────────────────────────┴───────────────┘

"use client";

import { useState } from "react";
import Link from "next/link";
import { markAnalysisCompleteAction } from "@/app/(workspace)/deals/actions";
import { generateReportAction } from "@/app/(workspace)/reports/actions";
import { QuickAnalysisTile } from "@/components/workstation/quick-analysis-tile";
import { SubjectTileRow } from "@/components/workstation/subject-tile-row";
import { fmt, fmtNum } from "@/lib/reports/format";
import type { WorkstationData } from "@/lib/reports/types";

/** Format an ISO date string ("YYYY-MM-DD" or full timestamp) as
 *  mm/dd/yy without TZ shifts. Mirrors the legacy Workstation's
 *  fmtIsoDate helper. */
function fmtIsoDate(v: string | null | undefined): string {
  if (!v) return "\u2014";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  if (!m) return "\u2014";
  return `${m[2]}/${m[3]}/${m[1].slice(2)}`;
}

type AnalysisWorkstationProps = {
  data: WorkstationData;
};

export function AnalysisWorkstation({ data }: AnalysisWorkstationProps) {
  // ── Quick Analysis initial values from manualAnalysis row ───────────
  // The auto-persisting <QuickAnalysisTile> below initializes its 4
  // input states from these values and writes them back via 3D's
  // saveManualAnalysisFieldAction.
  const ma = data.manualAnalysis;
  const initialArvManual = (ma?.arv_manual as number | null) ?? null;
  const initialRehabManual = (ma?.rehab_manual as number | null) ?? null;
  const initialTargetProfitManual =
    (ma?.target_profit_manual as number | null) ?? null;
  const initialDaysHeldManual =
    (ma?.days_held_manual as number | null) ?? null;

  const p = data.physical;

  return (
    <section className="dw-section-stack-compact">
      <WorkstationHeader data={data} />

      {/* TOP TILE ROW — 4 tiles total. SubjectTileRow handles the first
       *  two (MLS Info + Property Physical with bed/bath grid). The
       *  Quick Analysis tile is hidden via showQuickAnalysis={false}
       *  because the new Workstation uses the auto-persisting
       *  <QuickAnalysisTile> built on top of 3D's primitives.
       *  Tile 4 (Quick Status) is still a stub — added in 3E.3.c. */}
      <div className="flex flex-wrap gap-3">
        <SubjectTileRow
          showQuickAnalysis={false}
          mlsInfo={{
            mlsStatus: data.listing?.mlsStatus ?? "\u2014",
            mlsNumber: data.listing?.listingId ?? "\u2014",
            mlsChangeType: data.listing?.mlsMajorChangeType ?? "\u2014",
            listDate: fmtIsoDate(data.listing?.listingContractDate),
            origListPrice: fmt(data.listing?.originalListPrice),
            ucDate: fmtIsoDate(data.listing?.purchaseContractDate),
            listPrice: fmt(data.listing?.listPrice),
            closeDate: fmtIsoDate(data.listing?.closeDate),
          }}
          physical={{
            totalSf: fmtNum(p?.buildingSqft),
            aboveSf: fmtNum(p?.aboveGradeSqft),
            belowSf: fmtNum(p?.belowGradeTotalSqft),
            basementFinSf: fmtNum(p?.belowGradeFinishedSqft),
            beds: p?.bedroomsTotal != null ? String(p.bedroomsTotal) : "\u2014",
            baths:
              p?.bathroomsTotal != null
                ? fmtNum(p.bathroomsTotal, 1)
                : "\u2014",
            garage:
              p?.garageSpaces != null ? fmtNum(p.garageSpaces, 1) : "\u2014",
            yearBuilt: p?.yearBuilt ?? null,
            levels: p?.levelClass ?? "\u2014",
            propertyType: p?.propertyType ?? "\u2014",
            lotSf: fmtNum(p?.lotSizeSqft),
            taxHoa: `${fmt(data.financials?.annualTax)} | ${fmt(data.financials?.annualHoa)}`,
            bedBathLevels: p
              ? {
                  bedsTotal: p.bedroomsTotal,
                  bedsMain: p.bedroomsMain,
                  bedsUpper: p.bedroomsUpper,
                  bedsLower: p.bedroomsLower,
                  bathsTotal: p.bathroomsTotal,
                  bathsMain: p.bathroomsMain,
                  bathsUpper: p.bathroomsUpper,
                  bathsLower: p.bathroomsLower,
                }
              : undefined,
          }}
          // Empty quickAnalysis stub since showQuickAnalysis={false}
          // hides the Quick Analysis tile entirely. The prop is
          // required by the SubjectTileRowProps type but never read
          // when the tile is hidden.
          quickAnalysis={{
            manualArvInput: "",
            setManualArvInput: () => {},
            arvPlaceholder: "",
            manualRehabInput: "",
            setManualRehabInput: () => {},
            rehabPlaceholder: "",
            manualTargetProfitInput: "",
            setManualTargetProfitInput: () => {},
            targetProfitPlaceholder: "",
          }}
        />

        {/* TILE 3 — Quick Analysis (auto-persist) */}
        <QuickAnalysisTile
          analysisId={data.analysisId}
          initialArvManual={initialArvManual}
          initialRehabManual={initialRehabManual}
          initialTargetProfitManual={initialTargetProfitManual}
          initialDaysHeldManual={initialDaysHeldManual}
          autoArv={data.arv.effective}
          autoRehab={data.rehab.effective}
          autoTargetProfit={null}
          autoDaysHeld={data.holding?.daysHeld ?? null}
        />

        {/* TILE 4 — QUICK STATUS — 3E.3.c (placeholder for now) */}
        <div
          className="shrink-0 rounded border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-500"
          style={{ maxWidth: 240 }}
        >
          TILE 4 — QUICK STATUS (3E.3.c)
          <div className="mt-1 text-[10px]">
            Interest / Condition / Location / Next Step dropdowns with
            auto-persist
          </div>
        </div>
      </div>

      {/* DEAL STAT STRIP — 3E.4 */}
      <div className="rounded border border-dashed border-slate-300 bg-slate-50 px-4 py-2 text-xs text-slate-500">
        DEAL STAT STRIP (3E.4) — ARV / Max Offer / Offer% / Gap-sqft / Rehab
        / Target Profit / Trend, with override indicators
      </div>

      {/* HERO + RIGHT COLUMN — 3E.5 + 3E.6 */}
      <div className="grid gap-2" style={{ gridTemplateColumns: "1fr 320px" }}>
        <div className="rounded border border-dashed border-slate-300 bg-slate-50 px-4 py-12 text-xs text-slate-500">
          HERO COMP WORKSPACE (3E.5) — map + comp table + tab bar + controls
        </div>
        <div className="rounded border border-dashed border-slate-300 bg-slate-50 px-4 py-12 text-xs text-slate-500">
          RIGHT TILE COLUMN (3E.6 + 3E.7) — 9 collapsible detail cards
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Header bar (3E.2)
// ─────────────────────────────────────────────────────────────────────────────

/** Format an analysis_completed_at ISO string as "M/D HH:MM" for the
 *  header's compact "Completed 4/8 14:32" indicator. */
function formatCompletedTimestamp(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");
  return `${month}/${day} ${hours}:${minutes}`;
}

function WorkstationHeader({ data }: { data: WorkstationData }) {
  // Local state for Mark Complete — server returns the new completedAt
  // and we mirror it locally so the button label flips immediately
  // without waiting for a page revalidation round-trip.
  const [completedAt, setCompletedAt] = useState<string | null>(
    data.analysis.analysisCompletedAt,
  );
  const [isMarkingComplete, setIsMarkingComplete] = useState(false);

  // Local state for the Generate Report dialog. The dialog is a small
  // inline modal — title input + Generate button. The legacy
  // Workstation used the same pattern.
  const [showReportDialog, setShowReportDialog] = useState(false);
  const [reportTitle, setReportTitle] = useState("");
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);

  const handleMarkComplete = async () => {
    setIsMarkingComplete(true);
    try {
      const formData = new FormData();
      formData.set("analysis_id", data.analysisId);
      const result = await markAnalysisCompleteAction(formData);
      if (result.error == null && result.completedAt) {
        setCompletedAt(result.completedAt);
      }
    } finally {
      setIsMarkingComplete(false);
    }
  };

  const handleGenerateReport = async () => {
    if (!reportTitle.trim()) return;
    setIsGeneratingReport(true);
    try {
      const formData = new FormData();
      formData.set("analysis_id", data.analysisId);
      formData.set("property_id", data.propertyId);
      formData.set("title", reportTitle.trim());
      // generateReportAction redirects on success — no need to handle the
      // result because the page navigates away.
      await generateReportAction(formData);
    } catch (err) {
      // The action throws on validation failure or DB error. Surface to
      // console for now; future polish could add a toast.
      // eslint-disable-next-line no-console
      console.error("[generateReport]", err);
      setIsGeneratingReport(false);
    }
  };

  const completedDisplay = formatCompletedTimestamp(completedAt);
  const fullAddress = [
    data.property.address,
    [data.property.city, data.property.state, data.property.postalCode]
      .filter(Boolean)
      .join(" "),
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <header className="rounded-lg border border-slate-200 bg-white px-4 py-2 shadow-sm">
      <div className="flex items-center gap-3">
        {/* ── Left: Hub link ── */}
        <Link
          href={`/admin/properties/${data.propertyId}`}
          className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500 hover:text-slate-900"
        >
          ← Hub
        </Link>

        {/* ── Center: address (truncates on overflow) ── */}
        <h1
          className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900"
          title={fullAddress}
        >
          {fullAddress || "Untitled property"}
        </h1>

        {/* ── Right: status badges + action buttons ── */}
        <div className="flex shrink-0 items-center gap-1.5">
          {/* MLS# chip */}
          {data.listing?.listingId && (
            <span className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-[10px] text-slate-600">
              MLS# {data.listing.listingId}
            </span>
          )}

          {/* MLS status chip */}
          {data.listing?.mlsStatus && (
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-700">
              {data.listing.mlsStatus}
            </span>
          )}

          {/* Strategy type chip */}
          {data.analysis.strategyType && (
            <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-blue-700">
              {data.analysis.strategyType}
            </span>
          )}

          {/* Completed timestamp (only when set) */}
          {completedDisplay && (
            <span className="text-[10px] text-emerald-700">
              Completed {completedDisplay}
            </span>
          )}

          {/* Active share pill — placeholder per Decision 5.4. The full
           *  Partner Sharing card ships in Step 4. */}
          {/* (no render in 3E.2) */}

          {/* Divider before action buttons */}
          <span className="mx-1 h-4 w-px bg-slate-200" aria-hidden="true" />

          {/* Mark Complete / Update Complete */}
          <button
            type="button"
            onClick={handleMarkComplete}
            disabled={isMarkingComplete}
            className={`rounded-md border px-2 py-1 text-[11px] font-semibold transition-colors ${
              completedAt
                ? "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
                : "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"
            } disabled:opacity-50`}
          >
            {isMarkingComplete
              ? "Saving..."
              : completedAt
                ? "Update Complete"
                : "Mark Complete"}
          </button>

          {/* Share button — placeholder per Decision 5.4. The full
           *  Partner Sharing flow ships in Step 4. */}
          <button
            type="button"
            disabled
            title="Partner sharing arrives in Step 4"
            className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-400 cursor-not-allowed"
          >
            Share
          </button>

          {/* Generate Report */}
          <button
            type="button"
            onClick={() => setShowReportDialog(true)}
            className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-100"
          >
            Generate Report
          </button>
        </div>
      </div>

      {/* Generate Report dialog (inline modal overlay) */}
      {showReportDialog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowReportDialog(false);
          }}
        >
          <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-4 shadow-2xl">
            <h2 className="text-sm font-bold uppercase tracking-[0.12em] text-slate-700">
              Generate Report
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Create a frozen snapshot of this analysis. The report appears
              in the Reports library and can be shared.
            </p>
            <label className="mt-3 block text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Title
            </label>
            <input
              type="text"
              value={reportTitle}
              onChange={(e) => setReportTitle(e.target.value)}
              autoFocus
              placeholder="e.g. 1005 Garfield — Initial Underwrite"
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm text-slate-900"
            />
            <div className="mt-3 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowReportDialog(false);
                  setReportTitle("");
                }}
                disabled={isGeneratingReport}
                className="rounded-md border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleGenerateReport}
                disabled={isGeneratingReport || !reportTitle.trim()}
                className="rounded-md border border-emerald-300 bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800 hover:bg-emerald-200 disabled:opacity-50"
              >
                {isGeneratingReport ? "Generating..." : "Generate"}
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}

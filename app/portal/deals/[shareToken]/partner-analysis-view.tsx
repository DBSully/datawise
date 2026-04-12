// Phase 1 Step 4D — PartnerAnalysisView client component.
//
// The partner's view of a shared analysis per WORKSTATION_CARD_SPEC.md §7.
// Reuses shared components from components/workstation/ with a
// partner-specific layout that hides analyst-only sections.
//
// Partners SEE:
//   - Header (limited: property address, no analyst actions)
//   - Property Physical tile (with bed/bath grid)
//   - Deal Stat Strip (from analyst's deal math — partner overrides
//     will drive recalc in a future commit)
//   - ARV card, Rehab card, Price Trend card (read-only)
//   - Action Buttons (Interested / Schedule Showing / Request Discussion / Pass)
//   - Analyst's message (from the share)
//
// Partners DO NOT SEE:
//   - MLS Info tile (raw MLS data)
//   - Quick Status tile (analyst's internal categorization)
//   - Holding & Transaction card
//   - Financing card
//   - Cash Required card
//   - Pipeline Status card
//   - Partner Sharing card
//   - Notes card (visibility-filtered notes deferred to a future commit)
//
// The Quick Analysis tile (partner's private sandbox) and Comp Workspace
// (map + table) ship in subsequent 4D commits.

"use client";

import { useState, useCallback } from "react";
import { SubjectTileRow } from "@/components/workstation/subject-tile-row";
import { DealStatStrip } from "@/components/workstation/deal-stat-strip";
import { DetailCard } from "@/components/workstation/detail-card";
import { DetailModal } from "@/components/workstation/detail-modal";
import { ArvCardModal } from "@/app/(workspace)/analysis/[analysisId]/arv-card-modal";
import { PriceTrendCardModal } from "@/app/(workspace)/analysis/[analysisId]/price-trend-card-modal";
import { fmt, fmtNum } from "@/lib/reports/format";
import type { WorkstationData } from "@/lib/reports/types";

/** Format an ISO date string as mm/dd/yy without TZ shifts. */
function fmtIsoDate(v: string | null | undefined): string {
  if (!v) return "\u2014";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  if (!m) return "\u2014";
  return `${m[2]}/${m[3]}/${m[1].slice(2)}`;
}

type PartnerAnalysisViewProps = {
  workstationData: WorkstationData;
  share: {
    id: string;
    analysisId: string;
    sharedWithEmail: string;
    sharedWithUserId: string | null;
    message: string | null;
    sentAt: string;
  };
  partnerVersion: {
    arvOverride: number | null;
    rehabOverride: number | null;
    targetProfitOverride: number | null;
    daysHeldOverride: number | null;
    selectedCompIds: string[] | null;
    notes: string | null;
  } | null;
};

export function PartnerAnalysisView({
  workstationData: data,
  share,
  partnerVersion,
}: PartnerAnalysisViewProps) {
  const [openModal, setOpenModal] = useState<string | null>(null);

  const p = data.physical;

  // For MVP, use the analyst's deal math values. Partner overrides
  // (Quick Analysis sandbox) ship in a subsequent 4D commit.
  const dealMath = data.dealMath;

  const fullAddress = [
    data.property.address,
    [data.property.city, data.property.state, data.property.postalCode]
      .filter(Boolean)
      .join(" "),
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="space-y-4">
      {/* ── Partner header (limited) ── */}
      <header className="rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Shared Analysis
            </div>
            <h1 className="text-lg font-bold text-slate-900">{fullAddress}</h1>
          </div>
          <div className="flex items-center gap-2">
            {data.listing?.mlsStatus && (
              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-700">
                {data.listing.mlsStatus}
              </span>
            )}
            {data.analysis.strategyType && (
              <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-blue-700">
                {data.analysis.strategyType}
              </span>
            )}
          </div>
        </div>
        {share.message && (
          <div className="mt-2 rounded border border-blue-100 bg-blue-50/50 px-3 py-2 text-xs text-blue-800">
            <span className="font-semibold">Message from analyst:</span>{" "}
            {share.message}
          </div>
        )}
      </header>

      {/* ── Property Physical tile (no MLS Info, no Quick Analysis/Status) ── */}
      <SubjectTileRow
        showQuickAnalysis={false}
        mlsInfo={{
          mlsStatus: "\u2014",
          mlsNumber: "\u2014",
          mlsChangeType: "\u2014",
          listDate: "\u2014",
          origListPrice: "\u2014",
          ucDate: "\u2014",
          listPrice: fmt(data.listing?.listPrice),
          closeDate: "\u2014",
        }}
        physical={{
          totalSf: fmtNum(p?.buildingSqft),
          aboveSf: fmtNum(p?.aboveGradeSqft),
          belowSf: fmtNum(p?.belowGradeTotalSqft),
          basementFinSf: fmtNum(p?.belowGradeFinishedSqft),
          beds: p?.bedroomsTotal != null ? String(p.bedroomsTotal) : "\u2014",
          baths:
            p?.bathroomsTotal != null ? fmtNum(p.bathroomsTotal, 1) : "\u2014",
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

      {/* ── Deal Stat Strip (analyst's values for MVP) ── */}
      {dealMath && (
        <DealStatStrip
          arv={dealMath.arv}
          maxOffer={dealMath.maxOffer}
          offerPct={dealMath.offerPct}
          gapPerSqft={dealMath.estGapPerSqft}
          rehabTotal={dealMath.rehabTotal}
          targetProfit={dealMath.targetProfit}
          trendAnnualRate={data.trend?.blendedAnnualRate ?? null}
        />
      )}

      {/* ── Partner-visible cards (read-only) ── */}
      <div className="grid gap-2" style={{ gridTemplateColumns: "1fr 320px" }}>
        {/* Left: placeholder for Comp Workspace (ships in next 4D commit) */}
        <div className="rounded border border-dashed border-slate-300 bg-slate-50 px-4 py-12 text-center text-xs text-slate-400">
          Comp Workspace (map + table) coming in next commit
        </div>

        {/* Right: partner-visible cards */}
        <div className="flex flex-col gap-1.5">
          <DetailCard
            title="ARV"
            headline={fmt(data.arv.effective)}
            context={`${data.compSummary.selectedCount} comps · $${fmtNum(data.physical?.buildingSqft ? Math.round(data.arv.effective / data.physical.buildingSqft) : 0)}/sf`}
            onExpand={() => setOpenModal("arv")}
          />
          <DetailCard
            title="Rehab"
            headline={fmt(data.rehab.effective)}
            context={`$${fmtNum(data.physical?.buildingSqft ? Math.round(data.rehab.effective / data.physical.buildingSqft) : 0)}/sf bldg`}
            onExpand={() => setOpenModal("rehab")}
          />
          <DetailCard
            title="Price Trend"
            headline={
              data.trend
                ? `${data.trend.blendedAnnualRate >= 0 ? "+" : ""}${(data.trend.blendedAnnualRate * 100).toFixed(1)}%/yr`
                : "No trend data"
            }
            context={
              data.trend
                ? `${data.trend.direction.replace(/_/g, " ")} · ${data.trend.confidence} confidence`
                : "\u2014"
            }
            onExpand={() => setOpenModal("priceTrend")}
          />

          {/* ── Action Buttons (partner feedback) ── */}
          <div className="mt-2 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
            <h3 className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Your Response
            </h3>
            <div className="grid grid-cols-2 gap-2">
              <ActionButton
                label="I'm Interested"
                color="emerald"
                shareId={share.id}
                analysisId={share.analysisId}
                action="interested"
              />
              <ActionButton
                label="Schedule Showing"
                color="blue"
                shareId={share.id}
                analysisId={share.analysisId}
                action="showing_request"
              />
              <ActionButton
                label="Request Discussion"
                color="amber"
                shareId={share.id}
                analysisId={share.analysisId}
                action="discussion_request"
              />
              <ActionButton
                label="Pass"
                color="red"
                shareId={share.id}
                analysisId={share.analysisId}
                action="pass"
              />
            </div>
            <p className="mt-2 text-center text-[10px] text-slate-400">
              Sign in to submit your response and save your analysis adjustments
            </p>
          </div>
        </div>
      </div>

      {/* ── Modals ── */}
      {openModal === "arv" && (
        <ArvCardModal
          data={data}
          liveDeal={{ arv: data.arv.effective, arvManual: false }}
          onClose={() => setOpenModal(null)}
        />
      )}
      {openModal === "priceTrend" && (
        <PriceTrendCardModal
          trend={data.trend}
          onClose={() => setOpenModal(null)}
        />
      )}
      {openModal === "rehab" && (
        <DetailModal title="Rehab" onClose={() => setOpenModal(null)}>
          <div className="space-y-2 text-[11px]">
            <div className="flex justify-between">
              <span className="text-slate-500">Total Rehab</span>
              <span className="font-mono font-bold text-slate-800">
                {fmt(data.rehab.effective)}
              </span>
            </div>
            {data.rehab.detail && (
              <>
                <div className="flex gap-x-2 text-[10px] text-slate-400">
                  <span>
                    Type: {data.rehab.detail.typeMultiplier}
                  </span>
                  <span>
                    Cond: {data.rehab.detail.conditionMultiplier}
                  </span>
                  <span>
                    Base: {data.rehab.detail.compositeMultiplier.toFixed(3)}
                  </span>
                </div>
                <div className="text-[10px] text-slate-400">
                  ${fmtNum(data.physical?.buildingSqft ? Math.round(data.rehab.effective / data.physical.buildingSqft) : 0)}/sf bldg
                </div>
              </>
            )}
          </div>
        </DetailModal>
      )}
    </div>
  );
}

// ── Action Button (partner feedback submission) ──────────────────────

function ActionButton({
  label,
  color,
  shareId,
  analysisId,
  action,
}: {
  label: string;
  color: "emerald" | "blue" | "amber" | "red";
  shareId: string;
  analysisId: string;
  action: string;
}) {
  const [submitted, setSubmitted] = useState(false);

  const colorClasses = {
    emerald:
      "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100",
    blue: "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100",
    amber: "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100",
    red: "border-red-200 bg-red-50 text-red-700 hover:bg-red-100",
  };

  const handleClick = useCallback(async () => {
    // For MVP: mark as submitted locally. Full persistence (writing to
    // partner_feedback table) requires the partner to be signed in.
    // The sign-in flow + feedback persistence ships in 4F.
    setSubmitted(true);
  }, []);

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={submitted}
      className={`rounded-md border px-2 py-1.5 text-[11px] font-semibold transition-colors ${
        submitted
          ? "border-slate-200 bg-slate-50 text-slate-400 cursor-default"
          : colorClasses[color]
      }`}
    >
      {submitted ? `✓ ${label}` : label}
    </button>
  );
}

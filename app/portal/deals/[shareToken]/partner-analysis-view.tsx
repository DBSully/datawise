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

import { useState, useCallback, useMemo } from "react";
import type { MapPin } from "@/components/properties/comp-map";
import { CompWorkspace } from "@/components/workstation/comp-workspace";
import { SubjectTileRow } from "@/components/workstation/subject-tile-row";
import { DealStatStrip } from "@/components/workstation/deal-stat-strip";
import { DetailCard } from "@/components/workstation/detail-card";
import { DetailModal } from "@/components/workstation/detail-modal";
import { ArvCardModal } from "@/app/(workspace)/analysis/[analysisId]/arv-card-modal";
import { PriceTrendCardModal } from "@/app/(workspace)/analysis/[analysisId]/price-trend-card-modal";
import { fmt, fmtNum } from "@/lib/reports/format";
import type { WorkstationData } from "@/lib/reports/types";
import type { PartnerCompData } from "@/lib/partner-portal/load-partner-view-data";
import { submitPartnerFeedbackAction } from "@/lib/partner-portal/feedback-actions";

/** Format an ISO date string as mm/dd/yy without TZ shifts. */
function fmtIsoDate(v: string | null | undefined): string {
  if (!v) return "\u2014";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  if (!m) return "\u2014";
  return `${m[2]}/${m[3]}/${m[1].slice(2)}`;
}

type PartnerAnalysisViewProps = {
  workstationData: WorkstationData;
  compData: PartnerCompData | null;
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
  compData: serverCompData,
  share,
  partnerVersion,
}: PartnerAnalysisViewProps) {
  const [openModal, setOpenModal] = useState<string | null>(null);

  const p = data.physical;

  // For MVP, use the analyst's deal math values. Partner overrides
  // (Quick Analysis sandbox) ship in a subsequent 4D commit.
  const dealMath = data.dealMath;

  // ── Comp data from server (loaded via service-role client, no
  //    client-side fetch needed — avoids RLS issues for unauthenticated
  //    partner views per Decision 4.3) ──
  const compMapPins = useMemo<MapPin[]>(() => {
    if (!serverCompData) return [];
    const pins: MapPin[] = [];
    const subjectSqft = serverCompData.subjectBuildingSqft ?? 0;
    const subjectListPrice = serverCompData.subjectListPrice ?? 0;
    if (serverCompData.subjectLat && serverCompData.subjectLng) {
      pins.push({
        id: "subject",
        lat: serverCompData.subjectLat,
        lng: serverCompData.subjectLng,
        label: serverCompData.subjectAddress,
        tooltipData: {
          listPrice: subjectListPrice || null,
          sqft: subjectSqft || null,
          gapPerSqft: serverCompData.estGapPerSqft,
        },
        type: "subject",
      });
    }
    for (const c of serverCompData.candidates) {
      const m = c.metrics_json;
      const lat = Number(m.latitude);
      const lng = Number(m.longitude);
      if (!lat || !lng || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      const compSqft = Number(m.building_area_total_sqft) || null;
      const compNetPrice = Number(m.net_price) || Number(m.close_price) || 0;
      const perCompGapPerSqft =
        subjectSqft > 0 && compNetPrice > 0 && subjectListPrice > 0
          ? Math.round((compNetPrice - subjectListPrice) / subjectSqft) : null;
      const compArvDetail = c.comp_listing_row_id
        ? serverCompData.arvByCompListingId[c.comp_listing_row_id] ?? null : null;
      pins.push({
        id: c.id,
        lat, lng,
        label: String(m.address ?? "—"),
        tooltipData: {
          closePrice: compNetPrice || null,
          impliedArv: compArvDetail?.arv ?? null,
          closeDate: m.close_date ? String(m.close_date).slice(0, 10) : null,
          sqft: compSqft,
          sqftDelta: compSqft && subjectSqft ? subjectSqft - compSqft : null,
          sqftDeltaPct: compSqft && subjectSqft ? (subjectSqft - compSqft) / subjectSqft : null,
          ppsf: (m.ppsf as number) ?? null,
          distance: (c.distance_miles as number) ?? null,
          gapPerSqft: perCompGapPerSqft,
        },
        type: c.selected_yn ? "selected" : "candidate",
      });
    }
    return pins;
  }, [serverCompData]);

  const compStats = useMemo(() => {
    if (!serverCompData || serverCompData.candidates.length === 0)
      return { count: 0, avgDist: null, avgScore: null };
    const selected = serverCompData.candidates.filter((c) => c.selected_yn);
    const pool = selected.length > 0 ? selected : serverCompData.candidates;
    const dists = pool.map((c) => c.distance_miles).filter((d): d is number => d != null);
    const scores = pool.map((c) => c.raw_score).filter((s): s is number => s != null);
    return {
      count: pool.length,
      avgDist: dists.length > 0 ? dists.reduce((a, b) => a + b, 0) / dists.length : null,
      avgScore: scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : null,
    };
  }, [serverCompData]);

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
        {/* Left: Comp Workspace (read-only for partner MVP).
         *  CompWorkspace expects ScreeningCompData — we build a
         *  compatible object from the server-loaded PartnerCompData. */}
        <div className="rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden">
          <CompWorkspace
            loading={false}
            data={
              serverCompData
                ? ({
                    ...serverCompData,
                    closePrice: null,
                    mlsStatus: null,
                    mlsNumber: null,
                    mlsChangeType: null,
                    listDate: null,
                    ucDate: null,
                    closeDate: null,
                    originalListPrice: null,
                    propertyType: data.physical?.propertyType ?? null,
                    postalCode: data.property.postalCode,
                    county: data.property.county,
                    ownershipRaw: null,
                    occupantType: null,
                    annualPropertyTax: null,
                    annualHoaDues: null,
                    arvAggregate: data.arv.effective,
                    maxOffer: dealMath?.maxOffer ?? null,
                    offerPct: dealMath?.offerPct ?? null,
                    spread: dealMath?.spread ?? null,
                    rehabTotal: data.rehab.effective,
                    holdTotal: data.holding?.total ?? null,
                    transactionTotal: data.transaction?.total ?? null,
                    financingTotal: data.financing?.total ?? null,
                    targetProfit: dealMath?.targetProfit ?? null,
                    trendAnnualRate: data.trend?.blendedAnnualRate ?? null,
                    trendConfidence: data.trend?.confidence ?? null,
                    isPrimeCandidate: false,
                    reviewAction: null,
                    passReason: null,
                    subjectCity: data.property.city,
                  } as Parameters<typeof CompWorkspace>[0]["data"])
                : null
            }
            mapPins={compMapPins}
            liveDeal={{
              arv: dealMath?.arv ?? null,
              gapPerSqft: dealMath?.estGapPerSqft ?? null,
            }}
            compStats={compStats}
            onToggleSelection={() => {}}
            onMapPinToggle={() => {}}
            onReloadData={() => {}}
          />
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
                action="interested"
              />
              <ActionButton
                label="Schedule Showing"
                color="blue"
                shareId={share.id}
                action="showing_request"
              />
              <ActionButton
                label="Request Discussion"
                color="amber"
                shareId={share.id}
                action="discussion_request"
              />
              <ActionButton
                label="Pass"
                color="red"
                shareId={share.id}
                action="pass"
              />
            </div>
            <p className="mt-2 text-center text-[10px] text-slate-400">
              Your response is shared with the analyst
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
  action,
}: {
  label: string;
  color: "emerald" | "blue" | "amber" | "red";
  shareId: string;
  action: "interested" | "pass" | "showing_request" | "discussion_request";
}) {
  const [status, setStatus] = useState<
    "idle" | "submitting" | "submitted" | "auth_required" | "error"
  >("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const colorClasses = {
    emerald:
      "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100",
    blue: "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100",
    amber: "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100",
    red: "border-red-200 bg-red-50 text-red-700 hover:bg-red-100",
  };

  const handleClick = useCallback(async () => {
    setStatus("submitting");
    setErrorMsg(null);
    const result = await submitPartnerFeedbackAction({
      shareId,
      action,
    });
    if (result.ok) {
      setStatus("submitted");
    } else if (result.requiresAuth) {
      setStatus("auth_required");
      setErrorMsg(result.error ?? "Sign in required.");
    } else {
      setStatus("error");
      setErrorMsg(result.error ?? "Something went wrong.");
    }
  }, [shareId, action]);

  if (status === "auth_required") {
    return (
      <a
        href="/auth/sign-in?next=/portal"
        className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-center text-[10px] font-semibold text-slate-500 hover:bg-slate-100"
      >
        Sign in to {label.toLowerCase()}
      </a>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleClick}
        disabled={status === "submitting" || status === "submitted"}
        className={`w-full rounded-md border px-2 py-1.5 text-[11px] font-semibold transition-colors ${
          status === "submitted"
            ? "border-slate-200 bg-slate-50 text-slate-400 cursor-default"
            : colorClasses[color]
        }`}
      >
        {status === "submitting"
          ? "Submitting..."
          : status === "submitted"
            ? `✓ ${label}`
            : label}
      </button>
      {status === "error" && errorMsg && (
        <div className="mt-0.5 text-[9px] text-red-500">{errorMsg}</div>
      )}
    </div>
  );
}

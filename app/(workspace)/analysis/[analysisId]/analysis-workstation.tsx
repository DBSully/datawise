// Phase 1 Step 3E — new Workstation client (COMPLETE as of 3E.8).
//
// The canonical Analysis Workstation client component per
// WORKSTATION_CARD_SPEC.md. All layout regions are functional:
//
//   ┌─────────────────────────────────────────────────────────────┐
//   │  HEADER BAR — address, badges, Mark Complete / Generate     │
//   ├─────────────────────────────────────────────────────────────┤
//   │  MLS Info │ Prop Physical │ Quick Analysis │ Quick Status   │
//   ├─────────────────────────────────────────────────────────────┤
//   │  DEAL STAT STRIP — live recompute + override indicators     │
//   ├─────────────────────────────────────────────┬───────────────┤
//   │  HERO COMP WORKSPACE                        │  9 DETAIL     │
//   │  Map + comp table + sort + filter           │  CARDS        │
//   │  AddCompByMls + ExpandSearchPanel           │  (click →     │
//   │                                             │   modal)      │
//   └─────────────────────────────────────────────┴───────────────┘

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { markAnalysisCompleteAction } from "@/app/(workspace)/deals/actions";
import { generateReportAction } from "@/app/(workspace)/reports/actions";
import {
  loadCompDataByRunAction,
  toggleScreeningCompSelectionAction,
  type ScreeningCompData,
} from "@/app/(workspace)/screening/actions";
import type { MapPin } from "@/components/properties/comp-map";
import { CompWorkspace } from "@/components/workstation/comp-workspace";
import { DealStatStrip } from "@/components/workstation/deal-stat-strip";
import { DetailCard } from "@/components/workstation/detail-card";
import { DetailModal } from "@/components/workstation/detail-modal";
import { ArvCardModal } from "./arv-card-modal";
import { CashRequiredCardModal } from "./cash-required-card-modal";
import { FinancingCardModal } from "./financing-card-modal";
import { HoldTransCardModal } from "./hold-trans-card-modal";
import { NotesCardModal } from "./notes-card-modal";
import { PartnerSharingCardModal } from "./partner-sharing-card-modal";
import { PipelineCardModal } from "./pipeline-card-modal";
import { PriceTrendCardModal } from "./price-trend-card-modal";
import { RehabCardModal } from "./rehab-card-modal";
import {
  loadAnalysisSharesAction,
  type AnalysisShareRow,
  type PartnerFeedbackRow,
} from "@/lib/partner-portal/share-actions";
import { useShareRealtime } from "@/lib/partner-portal/use-share-realtime";
import {
  QuickAnalysisTile,
  parseDollarInput,
  parseIntInput,
} from "@/components/workstation/quick-analysis-tile";
import { QuickStatusTile } from "@/components/workstation/quick-status-tile";
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

  // ── Quick Status initial values ─────────────────────────────────────
  // Interest Level lives on analysis_pipeline; the other 3 dropdowns
  // live on manual_analysis. The shared saveManualAnalysisFieldAction
  // handles the cross-table routing internally.
  const initialInterestLevel =
    (data.pipeline?.interest_level as string | null) ?? null;
  const initialCondition = (ma?.analyst_condition as string | null) ?? null;
  const initialLocation = (ma?.location_rating as string | null) ?? null;
  const initialNextStep = (ma?.next_step as string | null) ?? null;

  // ── Lifted Quick Analysis input state ──────────────────────────────
  // The 4 numeric inputs in the Quick Analysis tile are owned at this
  // level (not inside QuickAnalysisTile) so the parent can compute the
  // liveDeal memo from the live values and feed it to the Deal Stat
  // Strip + the right-column cards. This is the cross-card cascade
  // requirement from §6.6/§6.8 of the 3E plan and the proactive fix
  // for the legacy "Deal Math card doesn't reflect Quick Analysis"
  // bug Dan surfaced during 3D testing.
  const [arvInput, setArvInput] = useState<string>(
    initialArvManual != null ? String(initialArvManual) : "",
  );
  const [rehabInput, setRehabInput] = useState<string>(
    initialRehabManual != null ? String(initialRehabManual) : "",
  );
  const [targetProfitInput, setTargetProfitInput] = useState<string>(
    initialTargetProfitManual != null
      ? String(initialTargetProfitManual)
      : "",
  );
  const [daysHeldInput, setDaysHeldInput] = useState<string>(
    initialDaysHeldManual != null ? String(initialDaysHeldManual) : "",
  );

  // ── liveDeal memo ──────────────────────────────────────────────────
  // Recomputes synchronously on every keystroke in Quick Analysis.
  // Mirrors the screening modal's liveDeal pattern but reads from
  // WorkstationData fields instead of ScreeningCompData. The right-
  // column cards in 3E.6 will read from this memo too (via props).
  const liveDeal = useMemo(() => {
    const parsedArv = parseDollarInput(arvInput);
    const parsedRehab = parseDollarInput(rehabInput);
    const parsedTargetProfit = parseDollarInput(targetProfitInput);
    const parsedDaysHeld = parseIntInput(daysHeldInput);

    const arv = parsedArv ?? data.arv.effective ?? 0;
    const rehabTotal = parsedRehab ?? data.rehab.effective ?? 0;
    const targetProfit =
      parsedTargetProfit ?? data.dealMath?.targetProfit ?? 40_000;

    // Holding total: server-computed value if no override; if Days
    // Held is overridden, scale the server's per-day rate by the new
    // day count. This is the simplest cascade — full recomputation
    // (re-running holding-engine) belongs in 3E.8 polish if needed.
    const serverDaysHeld = data.holding?.daysHeld ?? null;
    const serverHoldTotal = data.holding?.total ?? 0;
    const dailyHoldTotal = data.holding?.dailyTotal ?? 0;
    const holdTotal =
      parsedDaysHeld != null && parsedDaysHeld > 0
        ? Math.round(dailyHoldTotal * parsedDaysHeld)
        : serverHoldTotal;

    const transactionTotal = data.transaction?.total ?? 0;
    const financingTotal = data.financing?.total ?? 0;

    const costs =
      rehabTotal + holdTotal + transactionTotal + financingTotal + targetProfit;
    const maxOffer = Math.round(arv - costs);

    const listPrice = data.listing?.listPrice ?? 0;
    const offerPct =
      listPrice > 0 ? Math.round((maxOffer / listPrice) * 10000) / 10000 : null;

    const sqft = data.physical?.buildingSqft ?? 0;
    const gapPerSqft =
      listPrice > 0 && sqft > 0 ? Math.round((arv - listPrice) / sqft) : null;

    return {
      arv,
      maxOffer,
      offerPct,
      gapPerSqft,
      rehabTotal,
      targetProfit,
      holdTotal,
      transactionTotal,
      financingTotal,
      // Track the parsed override values so cards downstream can detect
      // which fields are user-overridden vs auto-computed.
      arvManual: parsedArv != null,
      rehabManual: parsedRehab != null,
      targetProfitManual: parsedTargetProfit != null,
      daysHeldManual: parsedDaysHeld != null,
      // Effective days held (used by Holding card headline cascade)
      daysHeld: parsedDaysHeld ?? serverDaysHeld ?? 0,
    };
  }, [
    arvInput,
    rehabInput,
    targetProfitInput,
    daysHeldInput,
    data,
  ]);

  // ── Comp data loading for the hero CompWorkspace ───────────────────
  // The new Workstation reuses the screening modal's loadCompDataByRunAction
  // which returns ScreeningCompData (the shape CompWorkspace consumes).
  // Loaded client-side on mount because WorkstationData doesn't carry
  // the full ScreeningCompData payload server-side. CompWorkspace handles
  // the brief loading state internally.
  const compSearchRunId = data.compModalData.latestRun?.id ?? null;
  const realPropertyId = data.propertyId;
  const [compData, setCompData] = useState<ScreeningCompData | null>(null);
  const [compLoading, setCompLoading] = useState<boolean>(
    compSearchRunId != null,
  );

  const reloadCompData = useCallback(() => {
    if (!compSearchRunId) return;
    setCompLoading(true);
    loadCompDataByRunAction(compSearchRunId, realPropertyId).then((result) => {
      setCompData(result);
      setCompLoading(false);
    });
  }, [compSearchRunId, realPropertyId]);

  useEffect(() => {
    let cancelled = false;
    if (!compSearchRunId) {
      setCompData(null);
      setCompLoading(false);
      return;
    }
    setCompLoading(true);
    loadCompDataByRunAction(compSearchRunId, realPropertyId).then((result) => {
      if (!cancelled) {
        setCompData(result);
        setCompLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [compSearchRunId, realPropertyId]);

  // Optimistic toggle: update local compData immediately for snappy UI,
  // then fire the server action. Mirrors the screening modal's pattern.
  const handleCompToggle = useCallback(
    async (candidateId: string, currentType: "selected" | "candidate") => {
      const fd = new FormData();
      fd.set("candidate_id", candidateId);
      fd.set("property_id", realPropertyId);
      fd.set("analysis_id", data.analysisId);
      fd.set("next_selected", currentType === "candidate" ? "true" : "false");
      setCompData((prev) => {
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
      try {
        await toggleScreeningCompSelectionAction(fd);
      } catch (err) {
        // On failure, reload to restore consistency.
        // eslint-disable-next-line no-console
        console.error("[handleCompToggle]", err);
        reloadCompData();
      }
    },
    [data.analysisId, realPropertyId, reloadCompData],
  );

  // Map pin click — same intent as a Pick button click. Mirrors modal.
  const handleCompMapPinToggle = useCallback(
    (pinId: string, currentType: "selected" | "candidate") => {
      handleCompToggle(pinId, currentType);
    },
    [handleCompToggle],
  );

  // Map pins computed from compData. Mirrors the modal's mapPins useMemo.
  const compMapPins = useMemo<MapPin[]>(() => {
    if (!compData) return [];
    const pins: MapPin[] = [];
    const subjectSqft = compData.subjectBuildingSqft ?? 0;
    const subjectListPrice = compData.subjectListPrice ?? 0;

    if (compData.subjectLat && compData.subjectLng) {
      pins.push({
        id: "subject",
        lat: compData.subjectLat,
        lng: compData.subjectLng,
        label: compData.subjectAddress,
        tooltipData: {
          listPrice: subjectListPrice || null,
          sqft: subjectSqft || null,
          gapPerSqft: compData.estGapPerSqft,
        },
        type: "subject",
      });
    }

    for (const c of compData.candidates) {
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
      const compArvDetail = c.comp_listing_row_id
        ? compData.arvByCompListingId[c.comp_listing_row_id] ?? null
        : null;

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
  }, [compData]);

  // Comp quality stats for the subject row's Score column. Mirrors the
  // modal's compStats useMemo.
  const compStats = useMemo(() => {
    if (!compData || compData.candidates.length === 0)
      return { count: 0, avgDist: null, avgScore: null };
    const selected = compData.candidates.filter((c) => c.selected_yn);
    const pool = selected.length > 0 ? selected : compData.candidates;
    const dists = pool
      .map((c) => c.distance_miles)
      .filter((d): d is number => d != null);
    const scores = pool
      .map((c) => c.raw_score)
      .filter((s): s is number => s != null);
    return {
      count: pool.length,
      avgDist:
        dists.length > 0 ? dists.reduce((a, b) => a + b, 0) / dists.length : null,
      avgScore:
        scores.length > 0
          ? scores.reduce((a, b) => a + b, 0) / scores.length
          : null,
    };
  }, [compData]);

  // ── Partner share data (for the collapsed card headline) ────────
  // Loaded client-side on mount, same pattern as compData.
  const [shareData, setShareData] = useState<{
    shares: AnalysisShareRow[];
    feedback: PartnerFeedbackRow[];
  } | null>(null);

  const refreshShareData = useCallback(() => {
    loadAnalysisSharesAction(data.analysisId).then(setShareData);
  }, [data.analysisId]);

  useEffect(() => {
    refreshShareData();
  }, [refreshShareData]);

  // ── Realtime subscription (Decision 9) ─────────────────────────────
  // Live-updates the Partner Sharing card when partners view or submit
  // feedback. Falls back to manual refresh if Realtime is unavailable.
  useShareRealtime({
    analysisId: data.analysisId,
    onUpdate: refreshShareData,
  });

  const activeShareCount = shareData?.shares.filter((s) => s.is_active).length ?? 0;
  const viewedCount = shareData?.shares.filter((s) => s.is_active && s.first_viewed_at).length ?? 0;
  const interestedCount = shareData?.feedback.filter((f) => f.action === "interested").length ?? 0;

  // ── Right column modal state ─────────────────────────────────────
  // Which card's modal is currently open, or null if none.
  type CardModalId =
    | "arv"
    | "rehab"
    | "holdTrans"
    | "financing"
    | "cashRequired"
    | "priceTrend"
    | "pipeline"
    | "notes"
    | "partnerSharing"
    | null;
  const [openModal, setOpenModal] = useState<CardModalId>(null);

  const p = data.physical;

  return (
    <section className="dw-section-stack-compact">
      <WorkstationHeader
        data={data}
        onShare={() => setOpenModal("partnerSharing")}
      />

      {/* TOP TILE ROW — 4 tiles. SubjectTileRow handles MLS Info +
       *  Property Physical (with bed/bath grid). QuickAnalysisTile
       *  handles the 4 auto-persisting numeric inputs. QuickStatusTile
       *  handles the 4 auto-persisting dropdowns. */}
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

        {/* TILE 3 — Quick Analysis (auto-persist, controlled by parent) */}
        <QuickAnalysisTile
          analysisId={data.analysisId}
          arvInput={arvInput}
          setArvInput={setArvInput}
          rehabInput={rehabInput}
          setRehabInput={setRehabInput}
          targetProfitInput={targetProfitInput}
          setTargetProfitInput={setTargetProfitInput}
          daysHeldInput={daysHeldInput}
          setDaysHeldInput={setDaysHeldInput}
          autoArv={data.arv.effective}
          autoRehab={data.rehab.effective}
          autoTargetProfit={data.dealMath?.targetProfit ?? null}
          autoDaysHeld={data.holding?.daysHeld ?? null}
        />

        {/* TILE 4 — Quick Status (auto-persist) */}
        <QuickStatusTile
          analysisId={data.analysisId}
          initialInterestLevel={initialInterestLevel}
          initialCondition={initialCondition}
          initialLocation={initialLocation}
          initialNextStep={initialNextStep}
        />
      </div>

      {/* DEAL STAT STRIP — 3E.4 (live values from liveDeal memo +
       *  per-spec override indicators driven by Quick Analysis flags). */}
      <DealStatStrip
        arv={liveDeal.arv}
        maxOffer={liveDeal.maxOffer}
        offerPct={liveDeal.offerPct}
        gapPerSqft={liveDeal.gapPerSqft}
        rehabTotal={liveDeal.rehabTotal}
        targetProfit={liveDeal.targetProfit}
        trendAnnualRate={data.trend?.blendedAnnualRate ?? null}
        manualOverrides={{
          arv: liveDeal.arvManual,
          rehab: liveDeal.rehabManual,
          targetProfit: liveDeal.targetProfitManual,
        }}
      />

      {/* HERO + RIGHT COLUMN — 3E.5 (hero) + 3E.6 (right column) */}
      <div className="grid gap-2" style={{ gridTemplateColumns: "1fr 320px" }}>
        <div className="rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden">
          <CompWorkspace
            loading={compLoading}
            data={compData}
            mapPins={compMapPins}
            liveDeal={{
              arv: liveDeal.arv,
              gapPerSqft: liveDeal.gapPerSqft,
            }}
            compStats={compStats}
            onToggleSelection={handleCompToggle}
            onMapPinToggle={handleCompMapPinToggle}
            onReloadData={reloadCompData}
          />
        </div>
        {/* RIGHT TILE COLUMN — 9 collapsible detail cards per spec §5 */}
        <div className="flex flex-col gap-1.5">
          {/* 1. ARV card — reads from liveDeal (cascade-affected) */}
          <DetailCard
            title="ARV"
            headline={fmt(liveDeal.arv)}
            context={`${data.compSummary.selectedCount} comps · $${fmtNum(data.physical?.buildingSqft ? Math.round(liveDeal.arv / data.physical.buildingSqft) : 0)}/sf`}
            badge={
              liveDeal.arvManual ? (
                <span className="rounded bg-emerald-100 px-1 py-0.5 text-[8px] font-semibold text-emerald-700">
                  Override
                </span>
              ) : undefined
            }
            onExpand={() => setOpenModal("arv")}
          />

          {/* 2. Rehab card — reads from liveDeal (cascade-affected) */}
          <DetailCard
            title="Rehab"
            headline={fmt(liveDeal.rehabTotal)}
            context={`$${fmtNum(data.physical?.buildingSqft ? Math.round(liveDeal.rehabTotal / data.physical.buildingSqft) : 0)}/sf bldg`}
            badge={
              liveDeal.rehabManual ? (
                <span className="rounded bg-emerald-100 px-1 py-0.5 text-[8px] font-semibold text-emerald-700">
                  Override
                </span>
              ) : undefined
            }
            onExpand={() => setOpenModal("rehab")}
          />

          {/* 3. Holding & Transaction card — reads from liveDeal (cascade-affected via daysHeld) */}
          <DetailCard
            title="Hold & Trans"
            headline={`Hold ${fmt(liveDeal.holdTotal)} · Trans ${fmt(liveDeal.transactionTotal)}`}
            context={`${liveDeal.daysHeld} days held`}
            badge={
              liveDeal.daysHeldManual ? (
                <span className="rounded bg-emerald-100 px-1 py-0.5 text-[8px] font-semibold text-emerald-700">
                  Override
                </span>
              ) : undefined
            }
            onExpand={() => setOpenModal("holdTrans")}
          />

          {/* 4. Financing card — reads from server data (not cascade-affected by Quick Analysis) */}
          <DetailCard
            title="Financing"
            headline={fmt(data.financing?.total)}
            context={
              data.financing
                ? `$${fmtNum(data.financing.loanAmount)} loan · ${fmtNum(data.financing.ltvPct * 100, 0)}% · ${fmtNum(data.financing.annualRate * 100, 1)}%`
                : "No financing data"
            }
            onExpand={() => setOpenModal("financing")}
          />

          {/* 5. Cash Required card — server data for now; full cascade through
           *  Quick Analysis → Cash Required is a 3E.8 polish item */}
          <DetailCard
            title="Cash Required"
            headline={fmt(data.cashRequired?.totalCashRequired)}
            context={`@ Max Offer ${fmt(liveDeal.maxOffer)}`}
            onExpand={() => setOpenModal("cashRequired")}
          />

          {/* 6. Price Trend card — pure market data, no cascade */}
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

          {/* 7. Pipeline Status card — pipeline state, no cascade */}
          <DetailCard
            title="Pipeline"
            headline={
              [
                data.pipeline?.showing_status as string | null,
                data.pipeline?.offer_status as string | null,
              ]
                .filter(Boolean)
                .join(" · ") || "No pipeline data"
            }
            context={
              data.pipeline?.offer_submitted_date
                ? `Offer submitted ${String(data.pipeline.offer_submitted_date).slice(0, 10)}`
                : "\u2014"
            }
            onExpand={() => setOpenModal("pipeline")}
          />

          {/* 8. Notes card — note count, no cascade */}
          <DetailCard
            title="Notes"
            headline={`${data.notes.length} note${data.notes.length !== 1 ? "s" : ""}`}
            context={
              data.notes.length > 0
                ? (() => {
                    const counts: Record<string, number> = {};
                    for (const n of data.notes) {
                      counts[n.note_type] = (counts[n.note_type] ?? 0) + 1;
                    }
                    return Object.entries(counts)
                      .slice(0, 3)
                      .map(([type, count]) => `${count} ${type}`)
                      .join(" · ");
                  })()
                : "\u2014"
            }
            onExpand={() => setOpenModal("notes")}
          />

          {/* 9. Partner Sharing card */}
          <DetailCard
            title="Partner Sharing"
            headline={
              activeShareCount === 0
                ? "Not shared"
                : interestedCount > 0
                  ? `${activeShareCount} shared · ${viewedCount} viewed · ${interestedCount} interested`
                  : `Shared with ${activeShareCount} partner${activeShareCount !== 1 ? "s" : ""}`
            }
            context={
              activeShareCount === 0
                ? "Click to share this analysis"
                : "Click to manage shares"
            }
            onExpand={() => setOpenModal("partnerSharing")}
          />
        </div>
      </div>

      {/* ── Per-card modals (3E.7 complete — all 9 cards have real modals) ── */}
      {openModal === "arv" && (
        <ArvCardModal
          data={data}
          liveDeal={{ arv: liveDeal.arv, arvManual: liveDeal.arvManual }}
          onClose={() => setOpenModal(null)}
        />
      )}
      {openModal === "cashRequired" && (
        <CashRequiredCardModal
          data={data}
          liveDeal={{ maxOffer: liveDeal.maxOffer }}
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
        <RehabCardModal
          data={data}
          rehabManual={liveDeal.rehabManual}
          rehabManualValue={parseDollarInput(rehabInput)}
          onClose={() => setOpenModal(null)}
        />
      )}
      {openModal === "holdTrans" && (
        <HoldTransCardModal
          data={data}
          liveDeal={{
            holdTotal: liveDeal.holdTotal,
            transactionTotal: liveDeal.transactionTotal,
            daysHeld: liveDeal.daysHeld,
            daysHeldManual: liveDeal.daysHeldManual,
          }}
          onClose={() => setOpenModal(null)}
        />
      )}
      {openModal === "financing" && (
        <FinancingCardModal
          data={data}
          analysisId={data.analysisId}
          onClose={() => setOpenModal(null)}
        />
      )}
      {openModal === "pipeline" && (
        <PipelineCardModal
          data={data}
          onClose={() => setOpenModal(null)}
        />
      )}
      {openModal === "notes" && (
        <NotesCardModal
          data={data}
          onClose={() => setOpenModal(null)}
        />
      )}
      {openModal === "partnerSharing" && (
        <PartnerSharingCardModal
          analysisId={data.analysisId}
          onClose={() => {
            setOpenModal(null);
            refreshShareData();
          }}
        />
      )}
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

function WorkstationHeader({
  data,
  onShare,
}: {
  data: WorkstationData;
  onShare?: () => void;
}) {
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

          {/* Share button — opens the Partner Sharing card modal */}
          <button
            type="button"
            onClick={onShare}
            className="rounded-md border border-indigo-200 bg-indigo-50 px-2 py-1 text-[11px] font-semibold text-indigo-700 hover:bg-indigo-100"
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

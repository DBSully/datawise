// Partner-facing deal spreadsheet — /portal/deals/[shareToken].
//
// Layout (2026-04-23 redesign):
//
//   ┌── Header (address, status, analyst message) ────────────────┐
//   ├── SubjectTileRow (physical facts) ──────────────────────────┤
//   │                                                             │
//   │  ┌── Analyst ──┐ ┌── Partner ──┐  ┌── Right ───────────┐    │
//   │  │ ARV         │ │ Your ARV    │  │ Trend | ROC | ROR  │    │
//   │  │ Rehab       │ │ Your Rehab  │  ├────────────────────┤    │
//   │  │ Holding     │ │ Your Hold   │  │                    │    │
//   │  │ Financing   │ │ Your Fin    │  │   Comp Workspace   │    │
//   │  │ Target $    │ │ Your $      │  │                    │    │
//   │  │ Max Offer   │ │ Your Max    │  │                    │    │
//   │  └─────────────┘ └─────────────┘  └────────────────────┘    │
//   │                                                             │
//   ├── Action Buttons (Interested / Showing / Discuss / Pass) ───┤
//   └─────────────────────────────────────────────────────────────┘
//
// The Analyst column is read-only context (click to open a methodology
// modal). The Partner column is the interactive entry side — each card
// auto-persists to partner_analysis_versions and live-recalculates the
// "Your Max Offer" result card at the bottom.
//
// Rows are horizontally aligned via a single CSS grid with 2 columns
// spanning both card stacks, so "ARV" sits beside "Your ARV", etc.
// Heights auto-match via the grid's implicit row behavior.

"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import type { MapPin } from "@/components/properties/comp-map";
import { CompWorkspace } from "@/components/workstation/comp-workspace";
import { SubjectTileRow } from "@/components/workstation/subject-tile-row";
import { DetailCard } from "@/components/workstation/detail-card";
import { DetailModal } from "@/components/workstation/detail-modal";
import { PartnerEntryCard } from "@/components/workstation/partner-entry-card";
import { PartnerResultCard } from "@/components/workstation/partner-result-card";
import { MaxOfferCard } from "@/components/workstation/max-offer-card";
import { SaveStatusDot } from "@/components/workstation/save-status-dot";
import { ArvCardModal } from "@/app/(workspace)/analysis/[analysisId]/arv-card-modal";
import { PriceTrendCardModal } from "@/app/(workspace)/analysis/[analysisId]/price-trend-card-modal";
import { fmt, fmtNum } from "@/lib/reports/format";
import type { WorkstationData } from "@/lib/reports/types";
import type { PartnerCompData } from "@/lib/partner-portal/load-partner-view-data";
import { createClient } from "@/lib/supabase/client";
import { submitPartnerFeedbackAction } from "@/lib/partner-portal/feedback-actions";
import { savePartnerOverrideAction } from "@/lib/partner-portal/save-partner-override-action";
import { useDebouncedSave } from "@/lib/auto-persist/use-debounced-save";

/** Format an ISO date string as mm/dd/yy without TZ shifts. */
function fmtIsoDate(v: string | null | undefined): string {
  if (!v) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  if (!m) return "—";
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
    financingOverride: number | null;
    buyerCommissionPctOverride: number | null;
    sellerCommissionPctOverride: number | null;
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

  // Client-side auth check — the Partner Entry side requires sign-in to
  // persist overrides and to submit feedback. The server always renders
  // the "locked" state; the client upgrades on mount.
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      setIsAuthenticated(!!user);
    });
  }, []);

  const p = data.physical;
  const dealMath = data.dealMath;

  // ── Partner override inputs (private) ─────────────────────────
  const [partnerArvInput, setPartnerArvInput] = useState<string>(
    partnerVersion?.arvOverride != null ? String(partnerVersion.arvOverride) : "",
  );
  const [partnerRehabInput, setPartnerRehabInput] = useState<string>(
    partnerVersion?.rehabOverride != null ? String(partnerVersion.rehabOverride) : "",
  );
  const [partnerDaysInput, setPartnerDaysInput] = useState<string>(
    partnerVersion?.daysHeldOverride != null ? String(partnerVersion.daysHeldOverride) : "",
  );
  const [partnerFinancingInput, setPartnerFinancingInput] = useState<string>(
    partnerVersion?.financingOverride != null ? String(partnerVersion.financingOverride) : "",
  );
  const [partnerProfitInput, setPartnerProfitInput] = useState<string>(
    partnerVersion?.targetProfitOverride != null ? String(partnerVersion.targetProfitOverride) : "",
  );
  // Commission inputs hold the percentage string the user typed
  // ("2.5") — we convert to a decimal (0.025) before saving.
  const [partnerBuyerCommInput, setPartnerBuyerCommInput] = useState<string>(
    partnerVersion?.buyerCommissionPctOverride != null
      ? String(partnerVersion.buyerCommissionPctOverride * 100)
      : "",
  );
  const [partnerSellerCommInput, setPartnerSellerCommInput] = useState<string>(
    partnerVersion?.sellerCommissionPctOverride != null
      ? String(partnerVersion.sellerCommissionPctOverride * 100)
      : "",
  );

  const parseDollar = (s: string): number | null => {
    const c = s.replace(/[,$\s]/g, "");
    if (c === "") return null;
    const n = Number(c);
    return Number.isFinite(n) ? n : null;
  };
  const parseInt_ = (s: string): number | null => {
    const c = s.replace(/[,\s]/g, "");
    if (c === "") return null;
    const n = Number.parseInt(c, 10);
    return Number.isFinite(n) ? n : null;
  };
  /** Parse a percentage input ("2.5", "2.5%") → decimal (0.025). */
  const parsePct = (s: string): number | null => {
    const c = s.replace(/[%\s,]/g, "");
    if (c === "") return null;
    const n = Number(c);
    return Number.isFinite(n) ? n / 100 : null;
  };

  // ── Auto-persist hooks (one per override field) ───────────────
  const arvSave = useDebouncedSave(parseDollar(partnerArvInput), async (v) => {
    await savePartnerOverrideAction({ shareId: share.id, field: "arv_override", value: v });
  });
  const rehabSave = useDebouncedSave(parseDollar(partnerRehabInput), async (v) => {
    await savePartnerOverrideAction({ shareId: share.id, field: "rehab_override", value: v });
  });
  const daysSave = useDebouncedSave(parseInt_(partnerDaysInput), async (v) => {
    await savePartnerOverrideAction({ shareId: share.id, field: "days_held_override", value: v });
  });
  const financingSave = useDebouncedSave(parseDollar(partnerFinancingInput), async (v) => {
    await savePartnerOverrideAction({ shareId: share.id, field: "financing_override", value: v });
  });
  const profitSave = useDebouncedSave(parseDollar(partnerProfitInput), async (v) => {
    await savePartnerOverrideAction({ shareId: share.id, field: "target_profit_override", value: v });
  });
  const buyerCommSave = useDebouncedSave(parsePct(partnerBuyerCommInput), async (v) => {
    await savePartnerOverrideAction({
      shareId: share.id,
      field: "buyer_commission_pct_override",
      value: v,
    });
  });
  const sellerCommSave = useDebouncedSave(parsePct(partnerSellerCommInput), async (v) => {
    await savePartnerOverrideAction({
      shareId: share.id,
      field: "seller_commission_pct_override",
      value: v,
    });
  });

  // ── Partner liveDeal — mirrors analyst cascade logic ──────────
  //   - ARV / Rehab / Target Profit: direct overrides
  //   - Days Held: cascades into holding line items AND financing
  //     interest cost (same formulas as analyst workstation)
  //   - Financing Override: if set, REPLACES financingTotal and
  //     bypasses the days-held cascade for financing
  const partnerLiveDeal = useMemo(() => {
    if (!dealMath) return null;
    const parsedArv = parseDollar(partnerArvInput);
    const parsedRehab = parseDollar(partnerRehabInput);
    const parsedDays = parseInt_(partnerDaysInput);
    const parsedFinancing = parseDollar(partnerFinancingInput);
    const parsedProfit = parseDollar(partnerProfitInput);
    const parsedBuyerComm = parsePct(partnerBuyerCommInput);
    const parsedSellerComm = parsePct(partnerSellerCommInput);

    const arv = parsedArv ?? dealMath.arv ?? 0;
    const rehabTotal = parsedRehab ?? dealMath.rehabTotal ?? 0;
    const targetProfit = parsedProfit ?? dealMath.targetProfit ?? 40_000;

    // Days held cascade
    const serverDays = data.holding?.daysHeld ?? null;
    const effectiveDays =
      parsedDays != null && parsedDays > 0 ? parsedDays : serverDays ?? 0;

    // Holding line items scaled by effectiveDays
    const h = data.holding;
    const holdTax = h ? Math.round(h.dailyTax * effectiveDays) : 0;
    const holdInsurance = h ? Math.round(h.dailyInsurance * effectiveDays) : 0;
    const holdHoa = h ? Math.round(h.dailyHoa * effectiveDays) : 0;
    const holdUtilities = h ? Math.round(h.dailyUtilities * effectiveDays) : 0;
    const holdTotal = holdTax + holdInsurance + holdHoa + holdUtilities;

    // Transaction: fixed costs (title, fees) + commissions. When the
    // partner overrides a commission rate or the ARV, the commission
    // dollars scale with ARV × rate. Title + other fixed parts stay
    // straight from the analyst's server-computed TransactionDetail.
    const tx = data.transaction;
    let transactionTotal = tx?.total ?? 0;
    if (tx) {
      const analystBuyerRate = tx.dispositionCommissionBuyerRate ?? null;
      const analystSellerRate = tx.dispositionCommissionSellerRate ?? null;
      const analystArvForRate = dealMath.arv || 1; // avoid div-by-zero
      const derivedBuyerRate =
        analystBuyerRate ?? tx.dispositionCommissionBuyer / analystArvForRate;
      const derivedSellerRate =
        analystSellerRate ??
        tx.dispositionCommissionSeller / analystArvForRate;
      const effectiveBuyerRate = parsedBuyerComm ?? derivedBuyerRate;
      const effectiveSellerRate = parsedSellerComm ?? derivedSellerRate;

      // Fixed portion = everything the analyst computed minus the
      // commissions that are now partner-dependent.
      const fixedPortion =
        tx.total -
        tx.dispositionCommissionBuyer -
        tx.dispositionCommissionSeller;
      const partnerBuyerComm = Math.round(arv * effectiveBuyerRate);
      const partnerSellerComm = Math.round(arv * effectiveSellerRate);
      transactionTotal = fixedPortion + partnerBuyerComm + partnerSellerComm;
    }

    // Financing: partner override wins, else cascade from days held
    const fin = data.financing;
    const financingInterestCost = fin
      ? Math.round(fin.loanAmount * fin.annualRate * (effectiveDays / 365))
      : 0;
    const financingCascadeTotal = fin
      ? financingInterestCost + fin.originationCost
      : 0;
    const financingTotal = parsedFinancing ?? financingCascadeTotal;

    const costs =
      rehabTotal +
      holdTotal +
      transactionTotal +
      financingTotal +
      targetProfit;
    const maxOffer = Math.round(arv - costs);

    const listPrice = data.listing?.listPrice ?? 0;
    const offerPct =
      listPrice > 0 ? Math.round((maxOffer / listPrice) * 10000) / 10000 : null;
    const sqft = data.physical?.buildingSqft ?? 0;
    const gapListPerSqft =
      listPrice > 0 && sqft > 0 ? Math.round((arv - listPrice) / sqft) : null;
    const gapOfferPerSqft =
      sqft > 0 && arv > 0 ? Math.round((arv - maxOffer) / sqft) : null;
    const negotiationGap =
      listPrice > 0 ? Math.round(maxOffer - listPrice) : null;

    const hasAnyOverride =
      parsedArv != null ||
      parsedRehab != null ||
      parsedDays != null ||
      parsedFinancing != null ||
      parsedProfit != null ||
      parsedBuyerComm != null ||
      parsedSellerComm != null;

    // Cash required — partner-facing formula that respects every
    // override and matches the analyst's server-side
    // calculateCashRequired shape when no overrides are set:
    //   Down Payment + Acquisition Subtotal (title + fees at closing)
    //   + Rehab OOP + Holding + Financing (origination + interest).
    // Disposition transaction costs (title + commissions) come out of
    // the SALE proceeds, not cash at closing — they must NOT be in
    // the cash-required formula. LTV comes from the analyst's
    // financing config; partners don't adjust loan structure directly.
    const ltv = data.financing?.ltvPct ?? 0;
    const downPayment = Math.round(maxOffer * (1 - ltv));
    const acquisitionSubtotal = data.transaction?.acquisitionSubtotal ?? 0;
    // Rehab OOP: analyst may have a line of credit for rehab
    // (loanAvailableForRehab) that reduces the cash the partner has to
    // front. Mirror the analyst's formula: rehabOOP = rehab − min(loan
    // available, rehab). Critical: without this subtraction the partner
    // card over-reports cash required by the full loanAvailableForRehab
    // amount (e.g. $100k).
    const loanAvailableForRehab =
      data.cashRequired?.loanAvailableForRehab ?? 0;
    const rehabFromLoan = Math.min(loanAvailableForRehab, rehabTotal);
    const rehabOOP = Math.max(0, rehabTotal - rehabFromLoan);
    const cashRequired = Math.max(
      0,
      downPayment +
        acquisitionSubtotal +
        rehabOOP +
        holdTotal +
        financingTotal,
    );

    return {
      arv,
      rehabTotal,
      holdTotal,
      transactionTotal,
      financingTotal,
      financingCascadeTotal,
      targetProfit,
      effectiveDays,
      maxOffer,
      offerPct,
      gapListPerSqft,
      gapOfferPerSqft,
      negotiationGap,
      arvManual: parsedArv != null,
      rehabManual: parsedRehab != null,
      daysHeldManual: parsedDays != null,
      financingManual: parsedFinancing != null,
      targetProfitManual: parsedProfit != null,
      buyerCommManual: parsedBuyerComm != null,
      sellerCommManual: parsedSellerComm != null,
      hasAnyOverride,
      cashRequired,
    };
  }, [
    partnerArvInput,
    partnerRehabInput,
    partnerDaysInput,
    partnerFinancingInput,
    partnerProfitInput,
    partnerBuyerCommInput,
    partnerSellerCommInput,
    dealMath,
    data,
  ]);

  // ── Comp data (server-loaded) → map pins + stats ──────────────
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
      const compArvDetail = c.comp_listing_row_id
        ? serverCompData.arvByCompListingId[c.comp_listing_row_id] ?? null
        : null;
      const compImpliedArv = compArvDetail?.arv ?? null;
      const perCompGapPerSqft =
        compImpliedArv != null && subjectSqft > 0 && subjectListPrice > 0
          ? Math.round((compImpliedArv - subjectListPrice) / subjectSqft)
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
          sqftDelta: compSqft && subjectSqft ? subjectSqft - compSqft : null,
          sqftDeltaPct:
            compSqft && subjectSqft ? (subjectSqft - compSqft) / subjectSqft : null,
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

  // Analyst reference values — shown as placeholders inside partner
  // entry cards so the partner sees what the value will snap back to
  // on reset, and used for the delta badge on Your Max Offer.
  const analystArv = dealMath?.arv ?? data.arv.effective ?? 0;
  const analystRehab = dealMath?.rehabTotal ?? data.rehab.effective ?? 0;
  const analystDays = data.holding?.daysHeld ?? 0;
  const analystFinancing = data.financing
    ? (data.financing.interestCost ?? 0) + (data.financing.originationCost ?? 0)
    : 0;
  const analystProfit = dealMath?.targetProfit ?? 40_000;
  const analystMaxOffer = dealMath?.maxOffer ?? null;

  // Transaction / commission references. Rates may not be on the
  // snapshot (pre-2026-04-22 analyses); derive from commission $ ÷ ARV
  // when missing so the partner always has a placeholder.
  const analystTransactionTotal = data.transaction?.total ?? 0;
  const analystHoldingTotal = data.holding
    ? Math.round(data.holding.dailyTotal * analystDays)
    : 0;
  // Return on Risk: profit divided by total capital at stake —
  // everything that goes INTO the deal, regardless of whether it's
  // loan or cash. A flip that falls apart mid-rehab has all of this
  // money exposed, so it's the right denominator for a risk-adjusted
  // return. Disposition costs are NOT included (they come out of
  // sale proceeds — you never front them).
  const analystAcquisitionSubtotal =
    data.transaction?.acquisitionSubtotal ?? 0;
  const analystRisk =
    (analystMaxOffer ?? 0) +
    analystAcquisitionSubtotal +
    analystRehab +
    analystFinancing +
    analystHoldingTotal;
  const analystBuyerRate =
    data.transaction?.dispositionCommissionBuyerRate ??
    (data.transaction && dealMath?.arv
      ? data.transaction.dispositionCommissionBuyer / dealMath.arv
      : null);
  const analystSellerRate =
    data.transaction?.dispositionCommissionSellerRate ??
    (data.transaction && dealMath?.arv
      ? data.transaction.dispositionCommissionSeller / dealMath.arv
      : null);

  // Financing hint line for the partner entry card — shows the analyst's
  // baseline so the partner knows what number they're replacing.
  const financingHint = data.financing
    ? `Analyst: $${fmtNum(Math.round(data.financing.loanAmount))} loan · ${fmtNum(data.financing.annualRate * 100, 1)}% · ${fmtNum(data.financing.ltvPct * 100, 0)}% LTV · ${analystDays} days → ${fmt(analystFinancing)}`
    : undefined;

  const holdHint =
    data.holding
      ? `Analyst estimate includes rehab + marketing: ${analystDays} days × $${fmtNum(data.holding.dailyTotal, 2)}/day`
      : undefined;

  const profitHint = "Strategy default accounts for scope, hold time, and difficulty.";

  // Shared CompWorkspace props — used both inline and inside the expand
  // modal so the map + table render identically in either surface.
  const compWorkspaceProps = {
    loading: false as const,
    data: serverCompData
      ? ({
          ...serverCompData,
          closePrice: null,
          concessionsAmount: null,
          mlsStatus: null,
          mlsNumber: null,
          mlsChangeType: null,
          listDate: null,
          ucDate: null,
          closeDate: null,
          originalListPrice: null,
          propertyType: p?.propertyType ?? null,
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
          trendRawRate: data.trend?.rawBlendedRate ?? null,
          trendPositiveCapApplied: data.trend?.positiveRateCapApplied ?? false,
          trendConfidence: data.trend?.confidence ?? null,
          gapOfferPerSqft: dealMath?.gapOfferPerSqft ?? null,
          isPrimeCandidate: false,
          reviewAction: null,
          passReason: null,
          subjectCity: data.property.city,
        } as Parameters<typeof CompWorkspace>[0]["data"])
      : null,
    mapPins: compMapPins,
    liveDeal: {
      arv: partnerLiveDeal?.arv ?? dealMath?.arv ?? null,
      gapListPerSqft:
        partnerLiveDeal?.gapListPerSqft ??
        dealMath?.gapListPerSqft ??
        dealMath?.estGapPerSqft ??
        null,
    },
    compStats,
    onToggleSelection: () => {},
    onMapPinToggle: () => {},
    onReloadData: () => {},
  };

  return (
    <div className="space-y-3">
      {/* ── Header ── */}
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

      {/* ── 2-column body: deal-math grid (left) + subject+comp stack (right) ──
       *  Deal-math grid sits directly beneath the header on the left so
       *  the interactive surface is the first thing the partner sees.
       *  SubjectTileRow (MLS + Physical), top stat strip, and the Comp
       *  Workspace all stack in the right 1fr column. */}
      <div className="grid gap-3" style={{ gridTemplateColumns: "auto 1fr" }}>
        {/* LEFT: 2-col deal-math grid. One CSS grid for both stacks so
         *  each row's analyst + partner card auto-align height.
         *  Each column is 300px wide. */}
        <div
          className="grid gap-x-2 gap-y-2"
          style={{ gridTemplateColumns: "210px 210px" }}
        >
          {/* Row 1 — ARV */}
          <DetailCard
            layout="stacked"
            title="ARV"
            headline={fmt(analystArv)}
            context={`${data.compSummary.selectedCount} comps · $${fmtNum(
              p?.buildingSqft ? Math.round(analystArv / p.buildingSqft) : 0,
            )}/sf`}
            onExpand={() => setOpenModal("arv")}
          />
          <PartnerEntryCard
            title="Your ARV"
            prompt="Disagree with the ARV? Enter yours here."
            value={partnerArvInput}
            onChange={setPartnerArvInput}
            placeholder={String(Math.round(analystArv))}
            hasOverride={partnerLiveDeal?.arvManual ?? false}
            saveStatus={arvSave.status}
            saveErrorMessage={arvSave.errorMessage}
          />

          {/* Row 2 — Rehab */}
          <DetailCard
            layout="stacked"
            title="Rehab Budget"
            headline={fmt(analystRehab)}
            context={`$${fmtNum(
              p?.buildingSqft ? Math.round(analystRehab / p.buildingSqft) : 0,
            )}/sf bldg`}
            onExpand={() => setOpenModal("rehab")}
          />
          <PartnerEntryCard
            title="Your Rehab"
            prompt="Different scope of work? Enter your rehab budget."
            value={partnerRehabInput}
            onChange={setPartnerRehabInput}
            placeholder={String(Math.round(analystRehab))}
            hasOverride={partnerLiveDeal?.rehabManual ?? false}
            saveStatus={rehabSave.status}
            saveErrorMessage={rehabSave.errorMessage}
          />

          {/* Row 3 — Holding / Days Held */}
          <DetailCard
            layout="stacked"
            title="Holding"
            headline={fmt(
              data.holding
                ? Math.round(data.holding.dailyTotal * analystDays)
                : null,
            )}
            context={
              data.holding
                ? `${analystDays} days · $${fmtNum(data.holding.dailyTotal, 2)}/day`
                : "No holding data"
            }
            onExpand={() => setOpenModal("holding")}
          />
          <PartnerResultCard
            title="Your Holding Costs"
            result={fmt(partnerLiveDeal?.holdTotal ?? null)}
            hasOverride={partnerLiveDeal?.daysHeldManual ?? false}
            prompt={`We're estimating ${analystDays} days (rehab + marketing). What's your estimate?`}
            hint={holdHint}
          >
            <div className="flex items-center gap-1.5">
              <span>Days held:</span>
              <input
                type="text"
                value={partnerDaysInput}
                onChange={(e) => setPartnerDaysInput(e.target.value)}
                placeholder={String(analystDays)}
                className="w-10 rounded border border-slate-300 bg-white px-1 py-0.5 text-right font-mono text-[10px] text-slate-900 placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-200"
              />
              <SaveStatusDot
                status={daysSave.status}
                errorMessage={daysSave.errorMessage}
              />
            </div>
          </PartnerResultCard>

          {/* Row 4 — Transaction Costs */}
          <DetailCard
            layout="stacked"
            title="Transaction Costs"
            headline={fmt(analystTransactionTotal)}
            context={
              analystBuyerRate != null && analystSellerRate != null
                ? `Title + fees · Buyer ${fmtNum(analystBuyerRate * 100, 1)}% · Seller ${fmtNum(analystSellerRate * 100, 1)}%`
                : "Title + fees + commissions"
            }
            onExpand={() => setOpenModal("transaction")}
          />
          <PartnerResultCard
            title="Your Transaction Costs"
            result={fmt(partnerLiveDeal?.transactionTotal ?? null)}
            hasOverride={
              (partnerLiveDeal?.buyerCommManual ?? false) ||
              (partnerLiveDeal?.sellerCommManual ?? false)
            }
            prompt="Title and closing costs are pretty standard. What do you want for RE commissions when you sell?"
            hint="DataWise lists for 1%."
          >
            <div className="flex flex-col gap-0.5">
              <span>Commissions:</span>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-0.5">
                  <span>Buyer</span>
                  <input
                    type="text"
                    value={partnerBuyerCommInput}
                    onChange={(e) => setPartnerBuyerCommInput(e.target.value)}
                    placeholder={
                      analystBuyerRate != null
                        ? (analystBuyerRate * 100).toFixed(1)
                        : "2.5"
                    }
                    className="w-7 rounded border border-slate-300 bg-white px-0.5 py-0.5 text-right font-mono text-[10px] text-slate-900 placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-200"
                  />
                  <span>%</span>
                  <SaveStatusDot
                    status={buyerCommSave.status}
                    errorMessage={buyerCommSave.errorMessage}
                  />
                </div>
                <div className="flex items-center gap-0.5">
                  <span>Seller</span>
                  <input
                    type="text"
                    value={partnerSellerCommInput}
                    onChange={(e) => setPartnerSellerCommInput(e.target.value)}
                    placeholder={
                      analystSellerRate != null
                        ? (analystSellerRate * 100).toFixed(1)
                        : "1.0"
                    }
                    className="w-7 rounded border border-slate-300 bg-white px-0.5 py-0.5 text-right font-mono text-[10px] text-slate-900 placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-200"
                  />
                  <span>%</span>
                  <SaveStatusDot
                    status={sellerCommSave.status}
                    errorMessage={sellerCommSave.errorMessage}
                  />
                </div>
              </div>
            </div>
          </PartnerResultCard>

          {/* Row 5 — Financing */}
          <DetailCard
            layout="stacked"
            title="Financing"
            headline={fmt(data.financing ? analystFinancing : null)}
            context={
              data.financing
                ? `$${fmtNum(data.financing.loanAmount)} loan · ${fmtNum(data.financing.annualRate * 100, 1)}% · ${fmtNum(data.financing.ltvPct * 100, 0)}% LTV`
                : "No financing data"
            }
            onExpand={() => setOpenModal("financing")}
          />
          <PartnerEntryCard
            title="Your Financing"
            prompt="Our analysis used a hard money loan. Enter your total financing cost."
            value={partnerFinancingInput}
            onChange={setPartnerFinancingInput}
            placeholder={String(Math.round(analystFinancing))}
            hasOverride={partnerLiveDeal?.financingManual ?? false}
            saveStatus={financingSave.status}
            saveErrorMessage={financingSave.errorMessage}
            hint={financingHint}
          />

          {/* Row 6 — Target Profit */}
          <DetailCard
            layout="stacked"
            title="Target Profit"
            headline={fmt(analystProfit)}
            context="Strategy default"
            onExpand={() => setOpenModal("targetProfit")}
          />
          <PartnerEntryCard
            title="Your Target Profit"
            prompt="What do you need to make on this project?"
            value={partnerProfitInput}
            onChange={setPartnerProfitInput}
            placeholder={String(analystProfit)}
            hasOverride={partnerLiveDeal?.targetProfitManual ?? false}
            saveStatus={profitSave.status}
            saveErrorMessage={profitSave.errorMessage}
            hint={profitHint}
          />

          {/* Row 7 — Max Offer (result row) */}
          <MaxOfferCard
            variant="analyst"
            maxOffer={analystMaxOffer}
            offerPct={dealMath?.offerPct ?? null}
            gapOfferPerSqft={dealMath?.gapOfferPerSqft ?? null}
            negotiationGap={dealMath?.negotiationGap ?? null}
          />
          <MaxOfferCard
            variant="partner"
            maxOffer={partnerLiveDeal?.maxOffer ?? null}
            offerPct={partnerLiveDeal?.offerPct ?? null}
            gapOfferPerSqft={partnerLiveDeal?.gapOfferPerSqft ?? null}
            negotiationGap={partnerLiveDeal?.negotiationGap ?? null}
            analystMaxOffer={analystMaxOffer}
            hasAnyOverride={partnerLiveDeal?.hasAnyOverride ?? false}
          />

          {/* Row 8 — Cash Required (result only, no inputs) */}
          <DetailCard
            layout="stacked"
            title="Cash Required"
            headline={fmt(data.cashRequired?.totalCashRequired ?? null)}
            context={`@ Max Offer ${fmt(analystMaxOffer)}`}
            onExpand={() => setOpenModal("cashRequired")}
          />
          <PartnerResultCard
            title="Your Cash Required"
            result={fmt(partnerLiveDeal?.cashRequired ?? null)}
            hasOverride={partnerLiveDeal?.hasAnyOverride ?? false}
            prompt={`Cash at closing + carry: down payment (${fmtNum((data.financing?.ltvPct ?? 0) * 100, 0)}% LTV) + acquisition title/fees + rehab + holding + financing. Disposition costs come out of sale proceeds, not upfront cash.`}
            hint="Loan structure (LTV, origination) is the analyst's; your overrides flow into everything else."
          />
        </div>

        {/* RIGHT: subject tiles + top stat strip + comp workspace */}
        <div className="flex min-w-0 flex-col gap-2">
          {/* Subject tile row (MLS Info + Property Physical).
           *  compact + bedBathLevels omitted keeps the row tight —
           *  the partner view doesn't need per-level bed/bath detail. */}
          <SubjectTileRow
            showQuickAnalysis={false}
            compact
            mlsInfo={{
              mlsStatus: data.listing?.mlsStatus ?? "—",
              mlsNumber: data.listing?.listingId ?? "—",
              mlsChangeType: data.listing?.mlsMajorChangeType ?? "—",
              listDate: fmtIsoDate(data.listing?.listingContractDate),
              origListPrice: fmt(data.listing?.originalListPrice),
              ucDate: fmtIsoDate(data.listing?.purchaseContractDate),
              listPrice: fmt(data.listing?.listPrice),
              netClosePrice:
                data.listing?.closePrice != null
                  ? fmt(
                      data.listing.closePrice -
                        (data.listing.concessionsAmount ?? 0),
                    )
                  : "—",
              closeDate: fmtIsoDate(data.listing?.closeDate),
            }}
            physical={{
              totalSf: fmtNum(p?.buildingSqft),
              aboveSf: fmtNum(p?.aboveGradeSqft),
              belowSf: fmtNum(p?.belowGradeTotalSqft),
              basementFinSf: fmtNum(p?.belowGradeFinishedSqft),
              beds: p?.bedroomsTotal != null ? String(p.bedroomsTotal) : "—",
              baths:
                p?.bathroomsTotal != null
                  ? fmtNum(p.bathroomsTotal, 1)
                  : "—",
              garage:
                p?.garageSpaces != null ? fmtNum(p.garageSpaces, 1) : "—",
              yearBuilt: p?.yearBuilt ?? null,
              levels: p?.levelClass ?? "—",
              propertyType: p?.propertyType ?? "—",
              lotSf: fmtNum(p?.lotSizeSqft),
              taxHoa: `${fmt(data.financials?.annualTax)} | ${fmt(data.financials?.annualHoa)}`,
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
              manualDaysHeldInput: "",
              setManualDaysHeldInput: () => {},
              daysHeldPlaceholder: "",
            }}
          />

          {/* Top strip: Price Trend + ROC/ROR placeholders */}
          <div className="grid grid-cols-3 gap-2">
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
                  : "—"
              }
              onExpand={() => setOpenModal("priceTrend")}
            />
            <ReturnOnCashCard
              targetProfit={analystProfit}
              cashRequired={data.cashRequired?.totalCashRequired ?? null}
              daysHeld={analystDays}
              onClick={() => setOpenModal("returnOnCash")}
            />
            <ReturnOnRiskCard
              targetProfit={analystProfit}
              risk={analystRisk}
              daysHeld={analystDays}
              onClick={() => setOpenModal("returnOnRisk")}
            />
          </div>

          {/* Comp Workspace (read-only map + table). The
           *  "Expand Comparables Panel" button is rendered INSIDE
           *  CompWorkspace alongside the Copy buttons when onExpand is
           *  provided. */}
          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
            <CompWorkspace
              {...compWorkspaceProps}
              onExpand={() => setOpenModal("compWorkspace")}
            />
          </div>
        </div>
      </div>

      {/* ── Action Buttons (full width) ── */}
      <div className="relative rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
        <h3 className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
          Your Response
        </h3>
        <div className="grid grid-cols-4 gap-2">
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
        {isAuthenticated ? (
          <p className="mt-2 text-center text-[10px] text-slate-400">
            Your response is shared with the analyst
          </p>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-white/80 backdrop-blur-[1px]">
            <a
              href="/auth/sign-in?next=/portal"
              className="rounded-md border border-indigo-200 bg-white px-3 py-1.5 text-xs font-semibold text-indigo-700 shadow-sm hover:bg-indigo-50"
            >
              Sign in to respond & save your values
            </a>
          </div>
        )}
      </div>

      {/* ── Modals (methodology / read-only) ── */}
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
          hideMethodology
        />
      )}
      {openModal === "rehab" && (
        <DetailModal
          title="Rehab"
          size="compact"
          onClose={() => setOpenModal(null)}
        >
          <div className="space-y-2 text-[11px]">
            <div className="flex justify-between">
              <span className="text-slate-500">Total Rehab</span>
              <span className="font-mono font-bold text-slate-800">
                {fmt(analystRehab)}
              </span>
            </div>
            {data.rehab.detail && (
              <>
                <div className="flex gap-x-2 text-[10px] text-slate-400">
                  <span>Type: {data.rehab.detail.typeMultiplier}</span>
                  <span>Cond: {data.rehab.detail.conditionMultiplier}</span>
                  <span>
                    Base: {data.rehab.detail.compositeMultiplier.toFixed(3)}
                  </span>
                </div>
                <div className="text-[10px] text-slate-400">
                  $
                  {fmtNum(
                    p?.buildingSqft
                      ? Math.round(analystRehab / p.buildingSqft)
                      : 0,
                  )}
                  /sf bldg
                </div>
              </>
            )}
          </div>
        </DetailModal>
      )}
      {openModal === "holding" && (
        <DetailModal
          title="Holding"
          size="medium"
          onClose={() => setOpenModal(null)}
        >
          <div className="space-y-2 text-[11px]">
            <p className="text-slate-500">
              Our hold time estimate includes both rehab and marketing.
              It cascades into daily tax, insurance, HOA, and utilities.
            </p>
            {data.holding ? (
              <>
                <div className="rounded border border-slate-200 bg-slate-50 p-2">
                  <Row label="Days Held" value={String(analystDays)} />
                  <Row
                    label="Daily Rate"
                    value={`$${fmtNum(data.holding.dailyTotal, 2)}/day`}
                  />
                  <Row
                    label="Total"
                    value={fmt(
                      Math.round(data.holding.dailyTotal * analystDays),
                    )}
                    bold
                  />
                </div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px] text-slate-500">
                  <Row
                    label="Tax"
                    value={`$${fmtNum(data.holding.dailyTax, 2)}/day`}
                  />
                  <Row
                    label="Insurance"
                    value={`$${fmtNum(data.holding.dailyInsurance, 2)}/day`}
                  />
                  <Row
                    label="HOA"
                    value={`$${fmtNum(data.holding.dailyHoa, 2)}/day`}
                  />
                  <Row
                    label="Utilities"
                    value={`$${fmtNum(data.holding.dailyUtilities, 2)}/day`}
                  />
                </div>
              </>
            ) : (
              <p className="italic text-slate-400">No holding data.</p>
            )}
          </div>
        </DetailModal>
      )}
      {openModal === "transaction" && (
        <DetailModal
          title="Transaction Costs"
          size="medium"
          onClose={() => setOpenModal(null)}
        >
          <div className="space-y-2 text-[11px]">
            <p className="text-slate-500">
              Title and closing costs come from the FITCO rate matrix and
              aren't typically under negotiation. Buyer and seller RE
              commissions scale with the sale price — you can override
              both rates on the right.
            </p>
            {data.transaction ? (
              <div className="rounded border border-slate-200 bg-slate-50 p-2">
                <Row
                  label="Acquisition Title + Fees"
                  value={fmt(data.transaction.acquisitionSubtotal)}
                />
                <Row
                  label="Disposition Title"
                  value={fmt(data.transaction.dispositionTitle)}
                />
                <Row
                  label={`Buyer Commission${analystBuyerRate != null ? ` (${fmtNum(analystBuyerRate * 100, 1)}%)` : ""}`}
                  value={fmt(data.transaction.dispositionCommissionBuyer)}
                />
                <Row
                  label={`Seller Commission${analystSellerRate != null ? ` (${fmtNum(analystSellerRate * 100, 1)}%)` : ""}`}
                  value={fmt(data.transaction.dispositionCommissionSeller)}
                />
                <Row label="Total" value={fmt(data.transaction.total)} bold />
              </div>
            ) : (
              <p className="italic text-slate-400">No transaction data.</p>
            )}
          </div>
        </DetailModal>
      )}
      {openModal === "financing" && (
        <DetailModal
          title="Financing"
          size="medium"
          onClose={() => setOpenModal(null)}
        >
          <div className="space-y-2 text-[11px]">
            <p className="text-slate-500">
              Our analysis assumes a hard money loan. You can enter your
              own total financing cost if yours differs.
            </p>
            {data.financing ? (
              <div className="rounded border border-slate-200 bg-slate-50 p-2">
                <Row
                  label="Loan Amount"
                  value={fmt(data.financing.loanAmount)}
                />
                <Row
                  label="Rate"
                  value={`${fmtNum(data.financing.annualRate * 100, 2)}%`}
                />
                <Row
                  label="LTV"
                  value={`${fmtNum(data.financing.ltvPct * 100, 0)}%`}
                />
                <Row label="Days Held" value={String(analystDays)} />
                <Row
                  label="Interest Cost"
                  value={fmt(data.financing.interestCost)}
                />
                <Row
                  label="Origination"
                  value={fmt(data.financing.originationCost)}
                />
                <Row label="Total" value={fmt(analystFinancing)} bold />
              </div>
            ) : (
              <p className="italic text-slate-400">No financing data.</p>
            )}
          </div>
        </DetailModal>
      )}
      {openModal === "targetProfit" && (
        <DetailModal
          title="Target Profit"
          size="compact"
          onClose={() => setOpenModal(null)}
        >
          <div className="space-y-2 text-[11px]">
            <p className="text-slate-500">
              Our target profit is based on expected scope of work, hold
              time, and project difficulty — sized for a reasonable
              return given the risk. Enter your own minimum if yours
              differs.
            </p>
            <div className="rounded border border-slate-200 bg-slate-50 p-2">
              <Row
                label="Analyst Target"
                value={fmt(analystProfit)}
                bold
              />
            </div>
          </div>
        </DetailModal>
      )}
      {openModal === "returnOnCash" && (
        <DetailModal
          title="Return on Cash"
          size="medium"
          onClose={() => setOpenModal(null)}
        >
          <div className="space-y-2 text-[11px]">
            <p className="text-slate-500">
              How hard the cash you actually front is working for you —
              target profit divided by total cash required, then linearly
              annualized so you can compare against yearly benchmarks.
            </p>
            <div className="rounded border border-slate-200 bg-slate-50 p-2">
              <Row label="Target Profit" value={fmt(analystProfit)} />
              <Row
                label="Cash Required"
                value={fmt(data.cashRequired?.totalCashRequired ?? null)}
              />
              <div className="my-1 border-t border-slate-200" />
              <Row
                label="Return on Cash"
                value={
                  data.cashRequired && data.cashRequired.totalCashRequired > 0
                    ? `${((analystProfit / data.cashRequired.totalCashRequired) * 100).toFixed(1)}%`
                    : "—"
                }
                bold
              />
              <div className="my-1 border-t border-slate-200" />
              <Row label="Days Held" value={String(analystDays)} />
              <Row
                label="Annualized"
                value={
                  data.cashRequired &&
                  data.cashRequired.totalCashRequired > 0 &&
                  analystDays > 0
                    ? `${(
                        (analystProfit / data.cashRequired.totalCashRequired) *
                        (365 / analystDays) *
                        100
                      ).toFixed(0)}%/yr`
                    : "—"
                }
                bold
              />
            </div>
            <p className="text-[10px] italic text-slate-400">
              Linear annualization (ROC × 365 ÷ days). Standard flip
              convention — not compounded.
            </p>
          </div>
        </DetailModal>
      )}
      {openModal === "returnOnRisk" && (
        <DetailModal
          title="Return on Risk"
          size="medium"
          onClose={() => setOpenModal(null)}
        >
          <div className="space-y-2 text-[11px]">
            <p className="text-slate-500">
              How hard the total capital at stake is working for you.
              Unlike cash required, this includes the full purchase
              price — the loan principal is also exposed if the deal
              fails and the asset can't be sold for what you paid.
            </p>
            <div className="rounded border border-slate-200 bg-slate-50 p-2">
              <Row label="Max Offer" value={fmt(analystMaxOffer)} />
              <Row
                label="Acquisition Costs"
                value={fmt(analystAcquisitionSubtotal)}
              />
              <Row label="Rehab" value={fmt(analystRehab)} />
              <Row label="Holding" value={fmt(analystHoldingTotal)} />
              <Row label="Financing" value={fmt(analystFinancing)} />
              <Row label="Total Risk" value={fmt(analystRisk)} bold />
              <div className="my-1 border-t border-slate-200" />
              <Row label="Target Profit" value={fmt(analystProfit)} />
              <Row
                label="Return on Risk"
                value={
                  analystRisk > 0
                    ? `${((analystProfit / analystRisk) * 100).toFixed(1)}%`
                    : "—"
                }
                bold
              />
              <div className="my-1 border-t border-slate-200" />
              <Row label="Days Held" value={String(analystDays)} />
              <Row
                label="Annualized"
                value={
                  analystRisk > 0 && analystDays > 0
                    ? `${(
                        (analystProfit / analystRisk) *
                        (365 / analystDays) *
                        100
                      ).toFixed(0)}%/yr`
                    : "—"
                }
                bold
              />
            </div>
            <p className="text-[10px] italic text-slate-400">
              Linear annualization (ROR × 365 ÷ days). Disposition costs
              are excluded — they come out of sale proceeds, not cash
              you front.
            </p>
          </div>
        </DetailModal>
      )}
      {openModal === "cashRequired" && (
        <DetailModal
          title="Cash Required"
          size="medium"
          onClose={() => setOpenModal(null)}
        >
          <div className="space-y-2 text-[11px]">
            <p className="text-slate-500">
              Total cash you'd need to close, rehab, and carry the
              project through to resale. Splits into acquisition
              (at closing) and carry (during the hold).
            </p>
            {data.cashRequired ? (
              <div className="rounded border border-slate-200 bg-slate-50 p-2">
                <Row
                  label="Down Payment"
                  value={fmt(data.cashRequired.downPayment)}
                />
                <Row
                  label="Acquisition Title"
                  value={fmt(data.cashRequired.acquisitionTitle)}
                />
                <Row
                  label="Origination"
                  value={fmt(data.cashRequired.originationCost)}
                />
                <Row
                  label="Acquisition Subtotal"
                  value={fmt(data.cashRequired.acquisitionSubtotal)}
                  bold
                />
                <div className="my-1 border-t border-slate-200" />
                <Row
                  label="Rehab (out of pocket)"
                  value={fmt(data.cashRequired.rehabOutOfPocket)}
                />
                <Row
                  label="Holding"
                  value={fmt(data.cashRequired.holdingTotal)}
                />
                <Row
                  label="Interest (during hold)"
                  value={fmt(data.cashRequired.interestCost)}
                />
                <Row
                  label="Carry Subtotal"
                  value={fmt(data.cashRequired.carrySubtotal)}
                  bold
                />
                <div className="my-1 border-t border-slate-200" />
                <Row
                  label="Total Cash Required"
                  value={fmt(data.cashRequired.totalCashRequired)}
                  bold
                />
              </div>
            ) : (
              <p className="italic text-slate-400">
                No cash-required data.
              </p>
            )}
          </div>
        </DetailModal>
      )}
      {openModal === "compWorkspace" && (
        <DetailModal
          title="Comparable Sales"
          size="wide"
          onClose={() => setOpenModal(null)}
        >
          <div className="h-[82vh]">
            <CompWorkspace {...compWorkspaceProps} />
          </div>
        </DetailModal>
      )}
    </div>
  );
}

// ── Small helpers ───────────────────────────────────────────────────

function Row({
  label,
  value,
  bold,
}: {
  label: string;
  value: string;
  bold?: boolean;
}) {
  return (
    <div className="flex justify-between py-0.5">
      <span className="text-slate-500">{label}</span>
      <span
        className={`font-mono ${bold ? "font-bold text-slate-800" : "text-slate-700"}`}
      >
        {value}
      </span>
    </div>
  );
}

function PlaceholderStatCard({
  title,
  note,
}: {
  title: string;
  note: string;
}) {
  return (
    <div className="flex flex-col justify-between rounded-lg border border-dashed border-slate-200 bg-slate-50/50 px-3 py-2">
      <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-400">
        {title}
      </span>
      <span className="font-mono text-[13px] font-bold text-slate-300">
        —
      </span>
      <span className="text-[9px] italic text-slate-400">{note}</span>
    </div>
  );
}

/** Shared layout for return-on-X stat cards. Per-deal % + linear
 *  annualized rate (× 365/daysHeld) — the flip-underwriting convention.
 *  When onClick is provided the card renders as a button with hover
 *  affordances; the parent uses onClick to open a methodology modal. */
function ReturnStatCard({
  title,
  numerator,
  denominator,
  daysHeld,
  onClick,
}: {
  title: string;
  numerator: number | null;
  denominator: number | null;
  daysHeld: number | null;
  onClick?: () => void;
}) {
  const ratio =
    numerator != null && denominator != null && denominator > 0
      ? numerator / denominator
      : null;
  const annualized =
    ratio != null && daysHeld && daysHeld > 0 ? ratio * (365 / daysHeld) : null;

  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-500">
          {title}
        </span>
        {onClick && (
          <span
            aria-hidden="true"
            className="text-[10px] text-slate-400 transition-colors group-hover:text-slate-600"
          >
            ▾
          </span>
        )}
      </div>
      <span className="mt-0.5 text-right font-mono text-[14px] font-bold leading-tight text-slate-800">
        {ratio != null ? `${(ratio * 100).toFixed(1)}%` : "—"}
      </span>
      <span className="mt-0.5 text-right text-[10px] leading-tight text-slate-400">
        {annualized != null
          ? `${(annualized * 100).toFixed(0)}%/yr · ${daysHeld}d hold`
          : "—"}
      </span>
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="group flex w-full flex-col rounded-lg border border-slate-200 bg-white px-3 py-2 text-left shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-200"
      >
        {body}
      </button>
    );
  }
  return (
    <div className="flex flex-col rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm">
      {body}
    </div>
  );
}

/** Return on Cash — Target Profit / Cash Required. Cash Required is
 *  what the investor actually fronts (down payment + acq fees +
 *  rehab OOP + financing + holding). Linear annualization so partners
 *  can compare to simple yearly benchmarks. */
function ReturnOnCashCard({
  targetProfit,
  cashRequired,
  daysHeld,
  onClick,
}: {
  targetProfit: number | null;
  cashRequired: number | null;
  daysHeld: number | null;
  onClick?: () => void;
}) {
  return (
    <ReturnStatCard
      title="Return on Cash"
      numerator={targetProfit}
      denominator={cashRequired}
      daysHeld={daysHeld}
      onClick={onClick}
    />
  );
}

/** Return on Risk — Target Profit / total capital at stake
 *  (purchase + acquisition + rehab + financing + holding). Unlike
 *  cash-required, this includes the full purchase, not just the down
 *  payment — the loan principal is also exposed if the deal fails. */
function ReturnOnRiskCard({
  targetProfit,
  risk,
  daysHeld,
  onClick,
}: {
  targetProfit: number | null;
  risk: number | null;
  daysHeld: number | null;
  onClick?: () => void;
}) {
  return (
    <ReturnStatCard
      title="Return on Risk"
      numerator={targetProfit}
      denominator={risk}
      daysHeld={daysHeld}
      onClick={onClick}
    />
  );
}

// ── Action Button (partner feedback submission) ─────────────────────

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
    const result = await submitPartnerFeedbackAction({ shareId, action });
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

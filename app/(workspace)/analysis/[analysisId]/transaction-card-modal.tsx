// Transaction Costs detail modal.
//
// FITCO/Chicago Title matrix breakdown — acquisition side (Bundled
// Concurrent Loan Rate + fixed add-ons + optional commission/fee) and
// disposition side (seller's share of Owner's Title Premium + fixed
// add-ons + agent commissions).
//
// Buyer and Seller commission RATES are analyst-adjustable inline
// (default 2%/2% from DENVER_FLIP_V1, override per-deal). Hooks live
// in the modal itself — unlike ARV/Rehab/Days Held/Target Profit,
// commissions don't appear in the Quick Analysis tile, so there's
// nothing else to share save state with. Same debounce + SaveStatusDot
// pattern as the Financing modal's Rate/LTV/Points inputs.
//
// The displayed dollar amount for each commission lags the input by
// one revalidation round-trip: the user types a new rate → debounced
// save fires → server revalidates → new `data.transaction` values
// come down with the dollar amount recomputed. This matches the
// Financing modal's behaviour.
//
// Breakdown fields may be absent on legacy report snapshots stored
// before the FITCO matrix change (2026-04-22); the modal gracefully
// degrades to a single-line summary in that case.

"use client";

import { useState } from "react";
import { DetailModal } from "@/components/workstation/detail-modal";
import { CostLine } from "@/components/workstation/cost-line";
import { SaveStatusDot } from "@/components/workstation/save-status-dot";
import { useDebouncedSave } from "@/lib/auto-persist/use-debounced-save";
import { saveManualAnalysisFieldAction } from "@/lib/auto-persist/save-manual-analysis-field-action";
import { fmt } from "@/lib/reports/format";
import type { WorkstationData } from "@/lib/reports/types";

/** Parse a percentage input string → decimal for persistence. Empty
 *  string returns null. E.g. "2" → 0.02, "2.5" → 0.025. Mirrors the
 *  helper inside financing-card-modal.tsx. */
function parsePctInput(s: string): number | null {
  const cleaned = s.replace(/[%\s]/g, "");
  if (cleaned === "") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n / 100 : null;
}

type TransactionCardModalProps = {
  data: WorkstationData;
  analysisId: string;
  onClose: () => void;
};

export function TransactionCardModal({
  data,
  analysisId,
  onClose,
}: TransactionCardModalProps) {
  const t = data.transaction;
  const ma = data.manualAnalysis;

  // Initial rates from manual_analysis (stored as decimals — display as %).
  // Falls back to strategy-profile default (2%) shown as placeholder.
  const initialBuyerRate =
    (ma?.disposition_commission_buyer_manual as number | null) ?? null;
  const initialSellerRate =
    (ma?.disposition_commission_seller_manual as number | null) ?? null;

  const [buyerRateInput, setBuyerRateInput] = useState<string>(
    initialBuyerRate != null ? String(initialBuyerRate * 100) : "",
  );
  const [sellerRateInput, setSellerRateInput] = useState<string>(
    initialSellerRate != null ? String(initialSellerRate * 100) : "",
  );

  const buyerSave = useDebouncedSave(
    parsePctInput(buyerRateInput),
    async (value) => {
      await saveManualAnalysisFieldAction({
        analysisId,
        field: "disposition_commission_buyer_manual",
        value,
      });
    },
  );
  const sellerSave = useDebouncedSave(
    parsePctInput(sellerRateInput),
    async (value) => {
      await saveManualAnalysisFieldAction({
        analysisId,
        field: "disposition_commission_seller_manual",
        value,
      });
    },
  );

  if (!t) {
    return (
      <DetailModal title="Transaction Costs" onClose={onClose}>
        <p className="py-8 text-center text-sm text-slate-400">
          No transaction data available.
        </p>
      </DetailModal>
    );
  }

  const acqBrk = t.acquisitionTitleBreakdown;
  const dispBrk = t.dispositionTitleBreakdown;

  // Effective rates from the server (already factors in any saved
  // override). Used for the displayed "%" on commission rows — e.g.
  // after the analyst saves 2.5%, the label reads "2.5%" not "2%".
  const buyerRatePct = t.dispositionCommissionBuyerRate != null
    ? t.dispositionCommissionBuyerRate * 100
    : 2;
  const sellerRatePct = t.dispositionCommissionSellerRate != null
    ? t.dispositionCommissionSellerRate * 100
    : 2;

  return (
    <DetailModal title="Transaction Costs" onClose={onClose}>
      <div className="space-y-0.5 text-[11px]">
        {/* Acquisition side */}
        <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
          Acquisition
        </div>
        {acqBrk ? (
          <>
            <CostLine
              label="Bundled Loan Rate"
              value={fmt(acqBrk.bundledLoanRate)}
            />
            <CostLine
              label="Bundled Closing Fee"
              value={fmt(acqBrk.bundledClosingFee)}
              sub="50% of $360"
            />
            <CostLine
              label="Loan Disbursement"
              value={fmt(acqBrk.loanDisbursementFee)}
            />
            <CostLine
              label="Recording"
              value={fmt(acqBrk.recordingCosts)}
            />
            <CostLine
              label="Closing Protection Letter"
              value={fmt(acqBrk.closingProtectionLetter)}
            />
            <CostLine
              label="E-recording"
              value={`$${acqBrk.eRecordingFee.toFixed(2)}`}
            />
          </>
        ) : (
          <CostLine label="Acq. Title" value={fmt(t.acquisitionTitle)} />
        )}
        <CostLine
          label="Acq. Commission"
          value={
            t.acquisitionCommission < 0
              ? `(${fmt(Math.abs(t.acquisitionCommission))})`
              : t.acquisitionCommission === 0
                ? "—"
                : fmt(t.acquisitionCommission)
          }
          sub={t.acquisitionCommission < 0 ? "credit" : undefined}
          negative={t.acquisitionCommission < 0}
        />
        <CostLine
          label="Acq. Fee"
          value={t.acquisitionFee === 0 ? "—" : fmt(t.acquisitionFee)}
        />
        <div className="flex items-baseline justify-between border-t border-slate-200 py-1">
          <span className="text-slate-500">Acquisition subtotal</span>
          <span className="font-mono text-slate-700">
            {fmt(t.acquisitionSubtotal)}
          </span>
        </div>

        {/* Disposition side */}
        <div className="mt-3 text-[9px] font-bold uppercase tracking-wider text-slate-400">
          Disposition
        </div>
        {dispBrk ? (
          <>
            <CostLine
              label="Owner's Title Premium"
              value={fmt(dispBrk.ownerTitlePremium)}
              sub={`${Math.round(dispBrk.premiumShare * 100)}% of ${fmt(dispBrk.ownerTitlePremiumBasic)}`}
            />
            <CostLine
              label="Bundled Closing Fee"
              value={fmt(dispBrk.bundledClosingFee)}
              sub="50% of $360"
            />
            <CostLine
              label="Owner's Extended Coverage"
              value={fmt(dispBrk.ownerExtendedCoverage)}
            />
            <CostLine
              label="Tax Certificate"
              value={fmt(dispBrk.taxCertificate)}
            />
          </>
        ) : (
          <CostLine label="Disp. Title" value={fmt(t.dispositionTitle)} />
        )}

        <CommissionRow
          label="Commission — Buyer"
          rateInput={buyerRateInput}
          setRateInput={setBuyerRateInput}
          saveStatus={buyerSave}
          placeholderPct={buyerRatePct}
          dollarAmount={t.dispositionCommissionBuyer}
        />
        <CommissionRow
          label="Commission — Seller"
          rateInput={sellerRateInput}
          setRateInput={setSellerRateInput}
          saveStatus={sellerSave}
          placeholderPct={sellerRatePct}
          dollarAmount={t.dispositionCommissionSeller}
        />

        <div className="flex items-baseline justify-between border-t border-slate-200 py-1">
          <span className="text-slate-500">Disposition subtotal</span>
          <span className="font-mono text-slate-700">
            {fmt(t.dispositionSubtotal)}
          </span>
        </div>

        {/* Transaction Total */}
        <div className="mt-2 flex items-baseline justify-between border-t border-slate-200 py-1">
          <span className="font-semibold text-slate-700">
            Transaction Total
          </span>
          <span className="font-mono font-semibold text-slate-800">
            {fmt(t.total)}
          </span>
        </div>
      </div>
    </DetailModal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CommissionRow — percent-editable waterfall row
// ─────────────────────────────────────────────────────────────────────────────

function CommissionRow({
  label,
  rateInput,
  setRateInput,
  saveStatus,
  placeholderPct,
  dollarAmount,
}: {
  label: string;
  rateInput: string;
  setRateInput: (s: string) => void;
  saveStatus: { status: "idle" | "saving" | "saved" | "error"; errorMessage: string | null };
  placeholderPct: number;
  dollarAmount: number;
}) {
  return (
    <div className="flex items-center justify-between gap-2 py-0.5">
      <span className="text-slate-600">{label}</span>
      <div className="flex items-center gap-1">
        <input
          type="text"
          value={rateInput}
          onChange={(e) => setRateInput(e.target.value)}
          placeholder={placeholderPct.toFixed(1)}
          className="w-[48px] rounded border border-slate-300 bg-white px-1 py-0 text-right text-[10px] font-mono text-slate-900 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-200"
        />
        <span className="text-[10px] text-slate-400">%</span>
        <SaveStatusDot
          status={saveStatus.status}
          errorMessage={saveStatus.errorMessage}
        />
        {rateInput ? (
          <button
            type="button"
            onClick={() => setRateInput("")}
            className="text-[10px] text-slate-400 hover:text-red-500"
            title="Clear override"
          >
            ×
          </button>
        ) : (
          <span className="w-[10px]" />
        )}
        <span className="ml-1 w-[70px] text-right font-mono text-slate-700">
          {fmt(dollarAmount)}
        </span>
      </div>
    </div>
  );
}

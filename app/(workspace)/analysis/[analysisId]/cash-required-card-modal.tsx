// Phase 1 Step 3E.7.b — CashRequiredCardModal (read-only).
//
// The Cash Required card's detail modal per WORKSTATION_CARD_SPEC.md §5.5.
// Pure read-only — every value is derived from inputs in other cards
// (Financing, Holding, Rehab, Transaction). Two sections:
//
//   1. Acquisition (paid at closing): Down Payment, Acq Title,
//      Acq Commission (signed), Acq Fee, Origination, Acq Subtotal.
//   2. Project carry (paid through hold period): Rehab OOP, Holding,
//      Interest, Carry Subtotal.
//   Total = Acq Subtotal + Carry Subtotal.
//   Footer: informational Loan → Purchase / Loan → Rehab.
//
// Uses <CostLine> from 3C for the waterfall line items.

"use client";

import { DetailModal } from "@/components/workstation/detail-modal";
import { CostLine } from "@/components/workstation/cost-line";
import { fmt, fmtPct } from "@/lib/reports/format";
import type { WorkstationData } from "@/lib/reports/types";

type CashRequiredCardModalProps = {
  data: WorkstationData;
  liveDeal: { maxOffer: number };
  onClose: () => void;
};

export function CashRequiredCardModal({
  data,
  liveDeal,
  onClose,
}: CashRequiredCardModalProps) {
  const cr = data.cashRequired;

  if (!cr) {
    return (
      <DetailModal title="Cash Required" onClose={onClose}>
        <p className="py-8 text-center text-sm text-slate-400">
          No cash required data available.
        </p>
      </DetailModal>
    );
  }

  return (
    <DetailModal title="Cash Required" onClose={onClose}>
      {/* Header — purchase price context */}
      <div className="mb-3 flex items-baseline justify-between rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          @ Max Offer
        </span>
        <span className="font-mono text-sm font-bold text-slate-900">
          {fmt(liveDeal.maxOffer)}
        </span>
      </div>

      {/* ── Acquisition (paid at closing) ── */}
      <div className="space-y-0.5 text-[11px]">
        <h3 className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
          Acquisition (paid at closing)
        </h3>
        <CostLine
          label={`Down Payment (${fmtPct(cr.downPaymentRate)})`}
          value={fmt(cr.downPayment)}
        />
        <CostLine label="Acq. Title" value={fmt(cr.acquisitionTitle)} />
        <CostLine
          label="Acq. Commission"
          value={
            cr.acquisitionCommission < 0
              ? `(${fmt(Math.abs(cr.acquisitionCommission))})`
              : fmt(cr.acquisitionCommission)
          }
          sub={
            cr.acquisitionCommission < 0
              ? "credit"
              : cr.acquisitionCommission === 0
                ? ""
                : undefined
          }
          negative={cr.acquisitionCommission < 0}
        />
        <CostLine label="Acq. Fee" value={fmt(cr.acquisitionFee)} />
        <CostLine label="Origination" value={fmt(cr.originationCost)} />
        <div className="flex items-baseline justify-between border-t border-slate-200 py-1">
          <span className="font-semibold text-slate-700">
            Acquisition subtotal
          </span>
          <span className="font-mono font-semibold text-slate-800">
            {fmt(cr.acquisitionSubtotal)}
          </span>
        </div>
      </div>

      {/* ── Project carry (paid through hold period) ── */}
      <div className="mt-4 space-y-0.5 text-[11px]">
        <h3 className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
          Project carry (through hold period)
        </h3>
        <CostLine
          label="Rehab Out-of-Pocket"
          value={fmt(cr.rehabOutOfPocket)}
          sub={
            cr.rehabOutOfPocket > 0
              ? `of ${fmt(cr.rehabTotal)}`
              : "covered"
          }
        />
        <CostLine label="Holding" value={fmt(cr.holdingTotal)} />
        <CostLine label="Interest" value={fmt(cr.interestCost)} />
        <div className="flex items-baseline justify-between border-t border-slate-200 py-1">
          <span className="font-semibold text-slate-700">
            Carry subtotal
          </span>
          <span className="font-mono font-semibold text-slate-800">
            {fmt(cr.carrySubtotal)}
          </span>
        </div>
      </div>

      {/* ── Total ── */}
      <div className="mt-4 flex items-baseline justify-between rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
        <span className="text-sm font-bold uppercase tracking-wider text-slate-700">
          Total Cash Required
        </span>
        <span className="font-mono text-lg font-bold text-slate-900">
          {fmt(cr.totalCashRequired)}
        </span>
      </div>

      {/* ── Informational footer — loan splits ── */}
      <div className="mt-3 flex gap-4 text-[11px] text-slate-500">
        <span>
          Loan → purchase:{" "}
          <span className="font-mono text-slate-700">
            {fmt(cr.loanForPurchase)}
          </span>
        </span>
        <span>
          Loan → rehab:{" "}
          <span className="font-mono text-slate-700">
            {fmt(cr.loanAvailableForRehab)}
          </span>
        </span>
      </div>
    </DetailModal>
  );
}

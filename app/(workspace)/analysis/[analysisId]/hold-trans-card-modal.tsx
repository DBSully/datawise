// Phase 1 Step 3E.7.e — HoldTransCardModal (read-only display).
//
// The combined Holding & Transaction card's detail modal per
// WORKSTATION_CARD_SPEC.md §5.3 + Decision 5. Read-only — Days Held
// override lives in Quick Analysis (Decision 2); transaction line items
// are configured at the strategy profile level, not per-analysis.
//
// Two sections:
//   1. Holding — daily-rate waterfall (Tax, Insurance, HOA, Utilities)
//   2. Transaction — 6-line breakdown per Decision 5 (3 acquisition +
//      3 disposition) with acquisition/disposition subtotals
//
// Footer link: "Edit Days Held →" to focus the Quick Analysis input.
// Uses <CostLine> from 3C for the waterfall line items.

"use client";

import { DetailModal } from "@/components/workstation/detail-modal";
import { CostLine } from "@/components/workstation/cost-line";
import { fmt, fmtNum } from "@/lib/reports/format";
import type { WorkstationData } from "@/lib/reports/types";

type HoldTransCardModalProps = {
  data: WorkstationData;
  liveDeal: {
    holdTotal: number;
    transactionTotal: number;
    daysHeld: number;
    daysHeldManual: boolean;
  };
  onClose: () => void;
  onEditDaysHeld?: () => void;
};

export function HoldTransCardModal({
  data,
  liveDeal,
  onClose,
  onEditDaysHeld,
}: HoldTransCardModalProps) {
  const h = data.holding;
  const t = data.transaction;

  return (
    <DetailModal title="Holding & Transaction" onClose={onClose}>
      {/* Days Held context */}
      <div className="mb-3 flex items-baseline justify-between rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          Days Held
        </span>
        <span className="font-mono text-sm font-bold text-slate-900">
          {liveDeal.daysHeld}
          {liveDeal.daysHeldManual && (
            <span className="ml-1 text-[9px] font-semibold text-indigo-600">
              manual override
            </span>
          )}
        </span>
      </div>

      {/* ── Holding section ── */}
      {h && (
        <div className="space-y-0.5 text-[11px]">
          <h3 className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
            Holding
          </h3>
          <CostLine
            label="Property Tax"
            value={fmt(h.holdTax)}
            sub={`$${fmtNum(h.dailyTax, 2)}/d`}
          />
          <CostLine
            label="Insurance"
            value={fmt(h.holdInsurance)}
            sub={`$${fmtNum(h.dailyInsurance, 2)}/d`}
          />
          <CostLine
            label="HOA"
            value={fmt(h.holdHoa)}
            sub={`$${fmtNum(h.dailyHoa, 2)}/d`}
          />
          <CostLine
            label="Utilities"
            value={fmt(h.holdUtilities)}
            sub={`$${fmtNum(h.dailyUtilities, 2)}/d`}
          />
          <div className="flex items-baseline justify-between border-t border-slate-200 py-1">
            <span className="font-semibold text-slate-700">Holding Total</span>
            <span className="font-mono font-semibold text-slate-800">
              {fmt(liveDeal.holdTotal)}
              <span className="ml-1 text-[10px] font-normal text-slate-400">
                ${fmtNum(h.dailyTotal, 2)}/d
              </span>
            </span>
          </div>
        </div>
      )}

      {/* ── Transaction section ── */}
      {t && (
        <div className="mt-4 space-y-0.5 text-[11px]">
          <h3 className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
            Transaction
          </h3>

          {/* Acquisition side */}
          <div className="mt-1 text-[8px] font-semibold uppercase tracking-wider text-slate-300">
            Acquisition
          </div>
          <CostLine label="Acq. Title (0.3%)" value={fmt(t.acquisitionTitle)} />
          <CostLine
            label="Acq. Commission"
            value={
              t.acquisitionCommission < 0
                ? `(${fmt(Math.abs(t.acquisitionCommission))})`
                : t.acquisitionCommission === 0
                  ? "\u2014"
                  : fmt(t.acquisitionCommission)
            }
            sub={t.acquisitionCommission < 0 ? "credit" : undefined}
            negative={t.acquisitionCommission < 0}
          />
          <CostLine
            label="Acq. Fee"
            value={t.acquisitionFee === 0 ? "\u2014" : fmt(t.acquisitionFee)}
          />

          {/* Disposition side */}
          <div className="mt-2 text-[8px] font-semibold uppercase tracking-wider text-slate-300">
            Disposition
          </div>
          <CostLine
            label="Disp. Title (0.47%)"
            value={fmt(t.dispositionTitle)}
          />
          <CostLine
            label="Commission — Buyer (2%)"
            value={fmt(t.dispositionCommissionBuyer)}
          />
          <CostLine
            label="Commission — Seller (2%)"
            value={fmt(t.dispositionCommissionSeller)}
          />

          {/* Subtotals */}
          <div className="mt-2 flex items-baseline justify-between border-t border-slate-200 py-1">
            <span className="text-slate-500">Acquisition subtotal</span>
            <span className="font-mono text-slate-700">
              {fmt(t.acquisitionSubtotal)}
            </span>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-slate-500">Disposition subtotal</span>
            <span className="font-mono text-slate-700">
              {fmt(t.dispositionSubtotal)}
            </span>
          </div>
          <div className="flex items-baseline justify-between border-t border-slate-200 py-1">
            <span className="font-semibold text-slate-700">
              Transaction Total
            </span>
            <span className="font-mono font-semibold text-slate-800">
              {fmt(t.total)}
            </span>
          </div>
        </div>
      )}

      {!h && !t && (
        <p className="py-8 text-center text-sm text-slate-400">
          No holding or transaction data available.
        </p>
      )}

      {/* Footer link */}
      {onEditDaysHeld && (
        <div className="mt-4 border-t border-slate-200 pt-3">
          <button
            type="button"
            onClick={() => {
              onClose();
              onEditDaysHeld();
            }}
            className="text-xs font-semibold text-blue-600 hover:text-blue-800"
          >
            Edit Days Held →
          </button>
        </div>
      )}
    </DetailModal>
  );
}

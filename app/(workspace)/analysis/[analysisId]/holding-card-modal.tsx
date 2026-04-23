// Holding Costs detail modal.
//
// Split from the former HoldTransCardModal on 2026-04-22. The Days Held
// override input is editable inline — same controlled-input + lifted
// useDebouncedSave pattern as the Quick Analysis tile, so edits from
// either surface route through one debounced save.

"use client";

import { DetailModal } from "@/components/workstation/detail-modal";
import { CostLine } from "@/components/workstation/cost-line";
import { SaveStatusDot } from "@/components/workstation/save-status-dot";
import { fmt, fmtNum } from "@/lib/reports/format";
import type { WorkstationData } from "@/lib/reports/types";
import type { UseDebouncedSaveResult } from "@/lib/auto-persist/use-debounced-save";

type HoldingCardModalProps = {
  data: WorkstationData;
  liveDeal: {
    /** Scaled holding line items — each = daily rate × effective days
     *  held. Passed in from the parent so they stay in sync with the
     *  Days Held override without re-deriving. */
    holdTax: number;
    holdInsurance: number;
    holdHoa: number;
    holdUtilities: number;
    holdTotal: number;
    daysHeld: number;
    daysHeldManual: boolean;
  };
  /** Controlled input + save-status for the Days Held override. Shared
   *  with Quick Analysis so edits from either surface flow through
   *  one debounced save. */
  daysHeldInput: string;
  setDaysHeldInput: (s: string) => void;
  daysHeldSave: UseDebouncedSaveResult;
  autoDaysHeld: number | null;
  onClose: () => void;
};

export function HoldingCardModal({
  data,
  liveDeal,
  daysHeldInput,
  setDaysHeldInput,
  daysHeldSave,
  autoDaysHeld,
  onClose,
}: HoldingCardModalProps) {
  const h = data.holding;

  return (
    <DetailModal title="Holding Costs" onClose={onClose}>
      {/* Days Held override — editable inline. Writes through the
       *  lifted useDebouncedSave hook shared with Quick Analysis. */}
      <div className="mb-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
        <div className="flex items-center justify-between">
          <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            Days Held
          </label>
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              value={daysHeldInput}
              onChange={(e) => setDaysHeldInput(e.target.value)}
              placeholder={autoDaysHeld != null ? String(autoDaysHeld) : "—"}
              className="w-[80px] rounded border border-slate-300 bg-white px-1.5 py-0.5 text-right text-[11px] font-mono text-slate-900 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-200"
            />
            <SaveStatusDot
              status={daysHeldSave.status}
              errorMessage={daysHeldSave.errorMessage}
            />
            {daysHeldInput && (
              <button
                type="button"
                onClick={() => setDaysHeldInput("")}
                className="text-[10px] text-slate-400 hover:text-red-500"
                title="Clear override"
              >
                ×
              </button>
            )}
          </div>
        </div>
        <div className="mt-1.5 flex items-baseline justify-between text-[10px] text-slate-500">
          <span>Effective</span>
          <span className="font-mono font-semibold text-slate-700">
            {liveDeal.daysHeld}
            {liveDeal.daysHeldManual && (
              <span className="ml-1 text-[9px] font-semibold text-indigo-600">
                override
              </span>
            )}
          </span>
        </div>
      </div>

      {h ? (
        <div className="space-y-0.5 text-[11px]">
          <CostLine
            label="Property Tax"
            value={fmt(liveDeal.holdTax)}
            sub={`$${fmtNum(h.dailyTax, 2)}/d`}
          />
          <CostLine
            label="Insurance"
            value={fmt(liveDeal.holdInsurance)}
            sub={`$${fmtNum(h.dailyInsurance, 2)}/d`}
          />
          <CostLine
            label="HOA"
            value={fmt(liveDeal.holdHoa)}
            sub={`$${fmtNum(h.dailyHoa, 2)}/d`}
          />
          <CostLine
            label="Utilities"
            value={fmt(liveDeal.holdUtilities)}
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
      ) : (
        <p className="py-8 text-center text-sm text-slate-400">
          No holding data available.
        </p>
      )}
    </DetailModal>
  );
}

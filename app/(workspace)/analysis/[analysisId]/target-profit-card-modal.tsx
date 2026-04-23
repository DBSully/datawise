// Target Profit detail modal.
//
// Single analyst assumption — the minimum profit target used in the
// max-offer calculation (ARV - costs - target profit = max offer).
// Default comes from the strategy profile (DENVER_FLIP_V1 →
// targetProfitDefault = $40,000). The analyst can override per deal.
//
// Same controlled-input + lifted useDebouncedSave pattern as the other
// Deal Math card modals — writes go through the same debounced save as
// the Quick Analysis tile's Target Profit input.

"use client";

import { DetailModal } from "@/components/workstation/detail-modal";
import { SaveStatusDot } from "@/components/workstation/save-status-dot";
import { fmt } from "@/lib/reports/format";
import type { UseDebouncedSaveResult } from "@/lib/auto-persist/use-debounced-save";

type TargetProfitCardModalProps = {
  /** Effective target profit (manual override ?? profile default). */
  effectiveTargetProfit: number;
  /** Whether the analyst has set a manual override. */
  targetProfitManual: boolean;
  /** Controlled input + save-status. Shared with Quick Analysis so
   *  edits from either surface flow through one debounced save. */
  targetProfitInput: string;
  setTargetProfitInput: (s: string) => void;
  targetProfitSave: UseDebouncedSaveResult;
  /** Strategy-profile default ($40,000 on DENVER_FLIP_V1). Shown as
   *  placeholder and in the "auto" row. */
  autoTargetProfit: number | null;
  onClose: () => void;
};

export function TargetProfitCardModal({
  effectiveTargetProfit,
  targetProfitManual,
  targetProfitInput,
  setTargetProfitInput,
  targetProfitSave,
  autoTargetProfit,
  onClose,
}: TargetProfitCardModalProps) {
  return (
    <DetailModal title="Target Profit" onClose={onClose}>
      {/* Effective + override input */}
      <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
        <div className="flex items-baseline justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Effective Target Profit
          </span>
          <div className="text-right">
            <span className="font-mono text-lg font-bold text-slate-900">
              {fmt(effectiveTargetProfit)}
            </span>
            {targetProfitManual && (
              <span className="ml-1 text-[9px] font-semibold text-indigo-600">
                manual override
              </span>
            )}
          </div>
        </div>
        <div className="mt-2 flex items-center justify-between border-t border-slate-200 pt-2">
          <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            Target Profit Override
          </label>
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              value={targetProfitInput}
              onChange={(e) => setTargetProfitInput(e.target.value)}
              placeholder={
                autoTargetProfit != null
                  ? autoTargetProfit.toLocaleString()
                  : "40,000"
              }
              className="w-[120px] rounded border border-slate-300 bg-white px-1.5 py-0.5 text-right text-[11px] font-mono text-slate-900 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-200"
            />
            <SaveStatusDot
              status={targetProfitSave.status}
              errorMessage={targetProfitSave.errorMessage}
            />
            {targetProfitInput && (
              <button
                type="button"
                onClick={() => setTargetProfitInput("")}
                className="text-[10px] text-slate-400 hover:text-red-500"
                title="Clear override"
              >
                ×
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Context — what this number does */}
      <div className="mt-3 space-y-1 text-[11px] text-slate-600">
        <p>
          Target Profit is subtracted from ARV (along with rehab, holding,
          transaction, and financing costs) to produce the Max Offer:
        </p>
        <p className="rounded bg-slate-100 px-2 py-1 font-mono text-[10px] text-slate-700">
          Max Offer = ARV − Rehab − Hold − Trans − Financing − Target Profit
        </p>
        <p className="text-slate-500">
          Raising Target Profit lowers Max Offer. Clear the override to
          revert to the strategy-profile default
          {autoTargetProfit != null && (
            <> ({fmt(autoTargetProfit)})</>
          )}
          .
        </p>
      </div>
    </DetailModal>
  );
}

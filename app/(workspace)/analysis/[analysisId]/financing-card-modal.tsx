// Phase 1 Step 3E.7.f — FinancingCardModal (editing with auto-persist).
//
// The Financing card's detail modal per WORKSTATION_CARD_SPEC.md §5.4.
// Three editable percentage inputs (Rate%, LTV%, Points%) wired to 3D's
// auto-persist infrastructure. Read-only display for the rest: loan
// amount, days held, interest cost, origination cost, monthly I/O
// payment, total financing.
//
// Per Decision 2, the financing percentage overrides live HERE (not in
// Quick Analysis) because they belong contextually with loan structure.
// Each input persists to manual_analysis.financing_rate_manual /
// financing_ltv_manual / financing_points_manual as DECIMALS (0.11 for
// 11%). The user types the percentage value (e.g. "11"); the component
// divides by 100 before persisting.
//
// Each input has a SaveStatusDot + a small "× clear" button to revert
// to the auto value.

"use client";

import { useState } from "react";
import { useDebouncedSave } from "@/lib/auto-persist/use-debounced-save";
import { saveManualAnalysisFieldAction } from "@/lib/auto-persist/save-manual-analysis-field-action";
import { SaveStatusDot } from "@/components/workstation/save-status-dot";
import { DetailModal } from "@/components/workstation/detail-modal";
import { CostLine } from "@/components/workstation/cost-line";
import { fmt, fmtNum } from "@/lib/reports/format";
import type { WorkstationData } from "@/lib/reports/types";

/** Parse a percentage input string → decimal for persistence. Empty
 *  string returns null. E.g. "11" → 0.11, "2.5" → 0.025. */
function parsePctInput(s: string): number | null {
  const cleaned = s.replace(/[%\s]/g, "");
  if (cleaned === "") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n / 100 : null;
}

type FinancingCardModalProps = {
  data: WorkstationData;
  analysisId: string;
  onClose: () => void;
};

export function FinancingCardModal({
  data,
  analysisId,
  onClose,
}: FinancingCardModalProps) {
  const fin = data.financing;
  const ma = data.manualAnalysis;

  // Initial values from manual_analysis (stored as decimals — display as %)
  const initialRate = (ma?.financing_rate_manual as number | null) ?? null;
  const initialLtv = (ma?.financing_ltv_manual as number | null) ?? null;
  const initialPoints = (ma?.financing_points_manual as number | null) ?? null;

  const [rateInput, setRateInput] = useState<string>(
    initialRate != null ? String(initialRate * 100) : "",
  );
  const [ltvInput, setLtvInput] = useState<string>(
    initialLtv != null ? String(initialLtv * 100) : "",
  );
  const [pointsInput, setPointsInput] = useState<string>(
    initialPoints != null ? String(initialPoints * 100) : "",
  );

  const rateSave = useDebouncedSave(
    parsePctInput(rateInput),
    async (value) => {
      await saveManualAnalysisFieldAction({
        analysisId,
        field: "financing_rate_manual",
        value,
      });
    },
  );

  const ltvSave = useDebouncedSave(
    parsePctInput(ltvInput),
    async (value) => {
      await saveManualAnalysisFieldAction({
        analysisId,
        field: "financing_ltv_manual",
        value,
      });
    },
  );

  const pointsSave = useDebouncedSave(
    parsePctInput(pointsInput),
    async (value) => {
      await saveManualAnalysisFieldAction({
        analysisId,
        field: "financing_points_manual",
        value,
      });
    },
  );

  return (
    <DetailModal title="Financing" onClose={onClose}>
      {!fin ? (
        <p className="py-8 text-center text-sm text-slate-400">
          No financing data available.
        </p>
      ) : (
        <>
          {/* Loan summary */}
          <div className="mb-3 flex items-baseline justify-between rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Loan Amount
            </span>
            <span className="font-mono text-sm font-bold text-slate-900">
              {fmt(fin.loanAmount)}
            </span>
          </div>

          {/* 3 editable percentage inputs */}
          <div className="grid grid-cols-3 gap-3">
            {/* Rate % */}
            <div>
              <label className="block text-[9px] font-semibold uppercase tracking-wider text-slate-500">
                Annual Rate %
              </label>
              <div className="mt-0.5 flex items-center gap-1">
                <input
                  type="text"
                  value={rateInput}
                  onChange={(e) => setRateInput(e.target.value)}
                  placeholder={
                    fin.annualRate != null
                      ? `${(fin.annualRate * 100).toFixed(1)}`
                      : "\u2014"
                  }
                  className="w-[70px] rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[11px] font-mono text-slate-900 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-200"
                />
                <SaveStatusDot
                  status={rateSave.status}
                  errorMessage={rateSave.errorMessage}
                />
                {rateInput && (
                  <button
                    type="button"
                    onClick={() => setRateInput("")}
                    className="text-[10px] text-slate-400 hover:text-red-500"
                    title="Clear override"
                  >
                    ×
                  </button>
                )}
              </div>
            </div>

            {/* LTV % */}
            <div>
              <label className="block text-[9px] font-semibold uppercase tracking-wider text-slate-500">
                LTV %
              </label>
              <div className="mt-0.5 flex items-center gap-1">
                <input
                  type="text"
                  value={ltvInput}
                  onChange={(e) => setLtvInput(e.target.value)}
                  placeholder={
                    fin.ltvPct != null
                      ? `${(fin.ltvPct * 100).toFixed(0)}`
                      : "\u2014"
                  }
                  className="w-[70px] rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[11px] font-mono text-slate-900 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-200"
                />
                <SaveStatusDot
                  status={ltvSave.status}
                  errorMessage={ltvSave.errorMessage}
                />
                {ltvInput && (
                  <button
                    type="button"
                    onClick={() => setLtvInput("")}
                    className="text-[10px] text-slate-400 hover:text-red-500"
                    title="Clear override"
                  >
                    ×
                  </button>
                )}
              </div>
            </div>

            {/* Points % */}
            <div>
              <label className="block text-[9px] font-semibold uppercase tracking-wider text-slate-500">
                Points %
              </label>
              <div className="mt-0.5 flex items-center gap-1">
                <input
                  type="text"
                  value={pointsInput}
                  onChange={(e) => setPointsInput(e.target.value)}
                  placeholder={
                    fin.pointsRate != null
                      ? `${(fin.pointsRate * 100).toFixed(1)}`
                      : "\u2014"
                  }
                  className="w-[70px] rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[11px] font-mono text-slate-900 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-200"
                />
                <SaveStatusDot
                  status={pointsSave.status}
                  errorMessage={pointsSave.errorMessage}
                />
                {pointsInput && (
                  <button
                    type="button"
                    onClick={() => setPointsInput("")}
                    className="text-[10px] text-slate-400 hover:text-red-500"
                    title="Clear override"
                  >
                    ×
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Cost waterfall */}
          <div className="mt-4 space-y-0.5 text-[11px]">
            <CostLine
              label={`Interest (@ $${fmtNum(fin.dailyInterest, 2)}/day)`}
              value={fmt(fin.interestCost)}
              sub={`${fin.daysHeld}d`}
            />
            <CostLine label="Origination" value={fmt(fin.originationCost)} />
            <CostLine
              label="Monthly I/O"
              value={fmt(fin.monthlyPayment)}
              sub="informational"
            />
            <div className="flex items-baseline justify-between border-t border-slate-200 py-1">
              <span className="font-semibold text-slate-700">
                Financing Total
              </span>
              <span className="font-mono font-semibold text-slate-800">
                {fmt(fin.total)}
              </span>
            </div>
          </div>
        </>
      )}
    </DetailModal>
  );
}

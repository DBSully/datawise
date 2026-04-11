// Phase 1 Step 3D Task 4 — auto-persist test harness client component.
//
// Three test inputs covering both target tables and both value types:
//
//   - Target Profit (number → manual_analysis.target_profit_manual)
//   - Next Step      (string → manual_analysis.next_step)
//   - Interest Level (string → analysis_pipeline.interest_level)
//
// Each input has its own useDebouncedSave hook + SaveStatusDot indicator.
// The "Status" column shows the current save state textually so the
// state machine transitions are visible even if the dot color cycle is
// too subtle to spot.
//
// Smoke test checklist (also in PHASE1_STEP3D_IMPLEMENTATION.md §9):
//
//   - Initial mount: dot is slate (idle), no save fires
//   - Type a value: dot stays idle for 500ms, then turns amber (saving)
//   - Save success: dot transitions amber → emerald (saved)
//   - Saved fade: dot fades emerald → slate after exactly 1 second
//   - Fast typing: type 7 chars rapidly — only ONE save fires
//   - Mid-fade edit: type, wait for emerald, type again → fade cancels
//   - Empty input: clear the field → save with value: null persists
//   - Network error: disable network → red dot + tooltip with message
//   - Recovery: re-enable network, type → red → amber → emerald
//   - Unmount during save: navigate away → no console errors
//   - Reload persistence: type, wait for emerald, reload → value persists

"use client";

import { useState } from "react";
import { useDebouncedSave } from "@/lib/auto-persist/use-debounced-save";
import { saveManualAnalysisFieldAction } from "@/lib/auto-persist/save-manual-analysis-field-action";
import { SaveStatusDot } from "@/components/workstation/save-status-dot";

const NEXT_STEP_OPTIONS = [
  "none",
  "analyze_deeper",
  "schedule_showing",
  "request_partner_input",
  "make_offer",
  "wait_price_drop",
  "pass",
] as const;

const INTEREST_LEVEL_OPTIONS = ["new", "watch", "warm", "hot"] as const;

type AutoPersistTestClientProps = {
  analysisId: string;
  initialTargetProfit: number | null;
  initialNextStep: string | null;
  initialInterestLevel: string | null;
};

export function AutoPersistTestClient({
  analysisId,
  initialTargetProfit,
  initialNextStep,
  initialInterestLevel,
}: AutoPersistTestClientProps) {
  // Each test input is a controlled component. The state holds the
  // raw user input (string), and the value passed to useDebouncedSave
  // is the parsed/typed version that gets persisted.

  // ── Test 1: number field on manual_analysis ─────────────────────────
  const [targetProfitInput, setTargetProfitInput] = useState<string>(
    initialTargetProfit != null ? String(initialTargetProfit) : "",
  );
  const targetProfitValue: number | null =
    targetProfitInput.trim() === ""
      ? null
      : Number.isFinite(Number(targetProfitInput))
        ? Number(targetProfitInput)
        : null;

  const targetProfitSave = useDebouncedSave(
    targetProfitValue,
    async (value) => {
      await saveManualAnalysisFieldAction({
        analysisId,
        field: "target_profit_manual",
        value,
      });
    },
  );

  // ── Test 2: string field on manual_analysis ─────────────────────────
  const [nextStepValue, setNextStepValue] = useState<string | null>(
    initialNextStep,
  );
  const nextStepSave = useDebouncedSave(nextStepValue, async (value) => {
    await saveManualAnalysisFieldAction({
      analysisId,
      field: "next_step",
      value,
    });
  });

  // ── Test 3: string field on analysis_pipeline (cross-table routing) ─
  const [interestLevelValue, setInterestLevelValue] = useState<string | null>(
    initialInterestLevel,
  );
  const interestLevelSave = useDebouncedSave(
    interestLevelValue,
    async (value) => {
      await saveManualAnalysisFieldAction({
        analysisId,
        field: "interest_level",
        value,
      });
    },
  );

  return (
    <div className="dw-card-tight space-y-4">
      <h2 className="text-sm font-semibold text-slate-800">
        Test Inputs (each wired to the full pipeline)
      </h2>

      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-slate-200 text-[10px] uppercase tracking-wider text-slate-500">
            <th className="px-2 py-1 text-left">Field</th>
            <th className="px-2 py-1 text-left">Table</th>
            <th className="px-2 py-1 text-left">Input</th>
            <th className="px-2 py-1 text-left">Dot</th>
            <th className="px-2 py-1 text-left">Status</th>
            <th className="px-2 py-1 text-left">Error</th>
          </tr>
        </thead>
        <tbody>
          {/* ── Test 1: Target Profit (number) ── */}
          <tr className="border-t border-slate-100">
            <td className="px-2 py-2 font-mono text-slate-700">
              target_profit_manual
            </td>
            <td className="px-2 py-2 text-slate-500">manual_analysis</td>
            <td className="px-2 py-2">
              <input
                type="text"
                value={targetProfitInput}
                onChange={(e) => setTargetProfitInput(e.target.value)}
                placeholder="40000"
                className="w-[120px] rounded border border-slate-300 px-1.5 py-0.5 font-mono text-[11px]"
              />
            </td>
            <td className="px-2 py-2">
              <SaveStatusDot
                status={targetProfitSave.status}
                errorMessage={targetProfitSave.errorMessage}
              />
            </td>
            <td className="px-2 py-2 font-mono text-[11px] text-slate-700">
              {targetProfitSave.status}
            </td>
            <td className="px-2 py-2 text-[11px] text-red-600">
              {targetProfitSave.errorMessage ?? ""}
            </td>
          </tr>

          {/* ── Test 2: Next Step (string dropdown) ── */}
          <tr className="border-t border-slate-100">
            <td className="px-2 py-2 font-mono text-slate-700">next_step</td>
            <td className="px-2 py-2 text-slate-500">manual_analysis</td>
            <td className="px-2 py-2">
              <select
                value={nextStepValue ?? ""}
                onChange={(e) =>
                  setNextStepValue(e.target.value === "" ? null : e.target.value)
                }
                className="w-[180px] rounded border border-slate-300 px-1.5 py-0.5 text-[11px]"
              >
                <option value="">(none — null)</option>
                {NEXT_STEP_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </td>
            <td className="px-2 py-2">
              <SaveStatusDot
                status={nextStepSave.status}
                errorMessage={nextStepSave.errorMessage}
              />
            </td>
            <td className="px-2 py-2 font-mono text-[11px] text-slate-700">
              {nextStepSave.status}
            </td>
            <td className="px-2 py-2 text-[11px] text-red-600">
              {nextStepSave.errorMessage ?? ""}
            </td>
          </tr>

          {/* ── Test 3: Interest Level (string, cross-table routing) ── */}
          <tr className="border-t border-slate-100">
            <td className="px-2 py-2 font-mono text-slate-700">
              interest_level
            </td>
            <td className="px-2 py-2 text-slate-500">analysis_pipeline</td>
            <td className="px-2 py-2">
              <select
                value={interestLevelValue ?? ""}
                onChange={(e) =>
                  setInterestLevelValue(
                    e.target.value === "" ? null : e.target.value,
                  )
                }
                className="w-[180px] rounded border border-slate-300 px-1.5 py-0.5 text-[11px]"
              >
                <option value="">(none — null)</option>
                {INTEREST_LEVEL_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </td>
            <td className="px-2 py-2">
              <SaveStatusDot
                status={interestLevelSave.status}
                errorMessage={interestLevelSave.errorMessage}
              />
            </td>
            <td className="px-2 py-2 font-mono text-[11px] text-slate-700">
              {interestLevelSave.status}
            </td>
            <td className="px-2 py-2 text-[11px] text-red-600">
              {interestLevelSave.errorMessage ?? ""}
            </td>
          </tr>
        </tbody>
      </table>

      <div className="border-t border-slate-200 pt-3 text-[11px] text-slate-500">
        <p className="font-semibold text-slate-700">Smoke test checklist:</p>
        <ol className="ml-4 mt-1 list-decimal space-y-0.5">
          <li>Initial mount → all dots slate (no save fires)</li>
          <li>Type a Target Profit value → 500ms debounce → amber → emerald → slate after 1s</li>
          <li>Type fast in Target Profit → only ONE save fires after the typing pause</li>
          <li>Type a value, wait for emerald, then type again before fade completes → new edit cycle takes over</li>
          <li>Clear Target Profit → null persists (column becomes NULL in Supabase)</li>
          <li>Change Next Step dropdown → string field on manual_analysis</li>
          <li>Change Interest Level dropdown → tests cross-table routing to analysis_pipeline</li>
          <li>Disable network in DevTools, type → red dot + hover for error message</li>
          <li>Re-enable network, type → recovery: red → amber → emerald</li>
          <li>Type a value, immediately navigate to /home → no console errors about setState on unmounted</li>
          <li>Reload page → new values are loaded from the database</li>
        </ol>
      </div>
    </div>
  );
}

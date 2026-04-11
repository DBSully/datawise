// Phase 1 Step 3E.3.b — QuickAnalysisTile with auto-persist.
//
// The new Workstation's Quick Analysis tile (per WORKSTATION_CARD_SPEC.md
// §3.2 Tile 3). Four numeric override inputs that auto-persist to
// manual_analysis via 3D's saveManualAnalysisFieldAction. Each input
// shows an inline SaveStatusDot for the live save state.
//
// Layout (per spec):
//
//   ┌──────────────────────────────────────┐
//   │ QUICK ANALYSIS                       │
//   │                                      │
//   │  Manual ARV       Rehab Override     │
//   │  [1,125,000]●     [71,400]●          │
//   │                                      │
//   │  Target Profit    Days Held          │
//   │  [40,000]●        [120]●             │
//   └──────────────────────────────────────┘
//
// Per Decision 5.2 (3C plan) the screening modal continues to use
// SubjectTileRow's existing local-only Quick Analysis tile (no
// auto-persist — the modal is a what-if scratchpad). This component
// is Workstation-specific and consumes 3D's auto-persist primitives
// directly.
//
// AS OF 3E.4 — controlled component pattern. The 4 input strings
// live in the parent (the Workstation) so the parent can compute
// liveDeal from the live inputs and feed it to the Deal Stat Strip
// + the right-column cards. The tile receives values + setters as
// props. The auto-persist hooks still live INSIDE the tile because
// the save callbacks are field-specific.
//
// Empty input semantics (per spec): clearing a field reverts to the
// auto-computed value. The placeholder shows the current auto value
// at all times. The persisted value is null when the input is empty.

"use client";

import { useDebouncedSave } from "@/lib/auto-persist/use-debounced-save";
import { saveManualAnalysisFieldAction } from "@/lib/auto-persist/save-manual-analysis-field-action";
import { SaveStatusDot } from "@/components/workstation/save-status-dot";

// ─────────────────────────────────────────────────────────────────────────────
// Input parsers — exported so the parent can also compute liveDeal
// ─────────────────────────────────────────────────────────────────────────────

/** Parse a dollar input (allows commas, $ sign, whitespace). Empty
 *  string returns null. Non-numeric returns null. */
export function parseDollarInput(s: string): number | null {
  const cleaned = s.replace(/[,$\s]/g, "");
  if (cleaned === "") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** Parse an integer input (allows commas, whitespace). Empty string
 *  returns null. Non-numeric returns null. */
export function parseIntInput(s: string): number | null {
  const cleaned = s.replace(/[,\s]/g, "");
  if (cleaned === "") return null;
  const n = parseInt(cleaned, 10);
  return Number.isFinite(n) ? n : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Props (controlled component as of 3E.4)
// ─────────────────────────────────────────────────────────────────────────────

type QuickAnalysisTileProps = {
  analysisId: string;
  /** Controlled input strings owned by the parent. */
  arvInput: string;
  setArvInput: (s: string) => void;
  rehabInput: string;
  setRehabInput: (s: string) => void;
  targetProfitInput: string;
  setTargetProfitInput: (s: string) => void;
  daysHeldInput: string;
  setDaysHeldInput: (s: string) => void;
  /** Auto-computed values to show as placeholders when the
   *  corresponding manual override is not set. The placeholder
   *  reflects "what would happen if you cleared this input". */
  autoArv: number | null;
  autoRehab: number | null;
  autoTargetProfit: number | null;
  autoDaysHeld: number | null;
  /** Optional Tab handler on the Target Profit input. Used by the
   *  Workstation to redirect Tab focus to a downstream button (e.g.
   *  the Copy Selected MLS button in the hero comp workspace). Not
   *  applicable until 3E.5 ships the hero — pass undefined for now. */
  onTargetProfitTab?: () => void;
};

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function QuickAnalysisTile({
  analysisId,
  arvInput,
  setArvInput,
  rehabInput,
  setRehabInput,
  targetProfitInput,
  setTargetProfitInput,
  daysHeldInput,
  setDaysHeldInput,
  autoArv,
  autoRehab,
  autoTargetProfit,
  autoDaysHeld,
  onTargetProfitTab,
}: QuickAnalysisTileProps) {
  const arvSave = useDebouncedSave(parseDollarInput(arvInput), async (value) => {
    await saveManualAnalysisFieldAction({
      analysisId,
      field: "arv_manual",
      value,
    });
  });

  const rehabSave = useDebouncedSave(parseDollarInput(rehabInput), async (value) => {
    await saveManualAnalysisFieldAction({
      analysisId,
      field: "rehab_manual",
      value,
    });
  });

  const targetProfitSave = useDebouncedSave(
    parseDollarInput(targetProfitInput),
    async (value) => {
      await saveManualAnalysisFieldAction({
        analysisId,
        field: "target_profit_manual",
        value,
      });
    },
  );

  const daysHeldSave = useDebouncedSave(
    parseIntInput(daysHeldInput),
    async (value) => {
      await saveManualAnalysisFieldAction({
        analysisId,
        field: "days_held_manual",
        value,
      });
    },
  );

  // Placeholder strings — show the auto value as a hint of what the
  // input will revert to if cleared.
  const arvPlaceholder =
    autoArv != null ? autoArv.toLocaleString() : "\u2014";
  const rehabPlaceholder =
    autoRehab != null ? Math.round(autoRehab).toLocaleString() : "\u2014";
  const targetProfitPlaceholder =
    autoTargetProfit != null
      ? autoTargetProfit.toLocaleString()
      : "40,000";
  const daysHeldPlaceholder =
    autoDaysHeld != null ? String(autoDaysHeld) : "\u2014";

  return (
    <div
      className="shrink-0 rounded border border-blue-200 bg-blue-50/50 px-3 py-2"
      style={{ maxWidth: 320 }}
    >
      <div className="mb-1.5 text-[9px] font-bold uppercase tracking-wider text-blue-600">
        Quick Analysis
      </div>
      <div className="grid grid-cols-2 gap-x-2 gap-y-2">
        {/* Manual ARV */}
        <div>
          <label className="block text-[9px] font-semibold uppercase tracking-wider text-slate-500">
            Manual ARV
          </label>
          <div className="mt-0.5 flex items-center gap-1">
            <input
              type="text"
              value={arvInput}
              onChange={(e) => setArvInput(e.target.value)}
              placeholder={arvPlaceholder}
              className="w-[100px] rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[11px] font-mono text-slate-900 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-200"
            />
            <SaveStatusDot
              status={arvSave.status}
              errorMessage={arvSave.errorMessage}
            />
          </div>
        </div>

        {/* Rehab Override */}
        <div>
          <label className="block text-[9px] font-semibold uppercase tracking-wider text-slate-500">
            Rehab Override
          </label>
          <div className="mt-0.5 flex items-center gap-1">
            <input
              type="text"
              value={rehabInput}
              onChange={(e) => setRehabInput(e.target.value)}
              placeholder={rehabPlaceholder}
              className="w-[100px] rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[11px] font-mono text-slate-900 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-200"
            />
            <SaveStatusDot
              status={rehabSave.status}
              errorMessage={rehabSave.errorMessage}
            />
          </div>
        </div>

        {/* Target Profit */}
        <div>
          <label className="block text-[9px] font-semibold uppercase tracking-wider text-slate-500">
            Target Profit
          </label>
          <div className="mt-0.5 flex items-center gap-1">
            <input
              type="text"
              value={targetProfitInput}
              onChange={(e) => setTargetProfitInput(e.target.value)}
              onKeyDown={(e) => {
                if (
                  onTargetProfitTab &&
                  e.key === "Tab" &&
                  !e.shiftKey
                ) {
                  e.preventDefault();
                  onTargetProfitTab();
                }
              }}
              placeholder={targetProfitPlaceholder}
              className="w-[100px] rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[11px] font-mono text-slate-900 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-200"
            />
            <SaveStatusDot
              status={targetProfitSave.status}
              errorMessage={targetProfitSave.errorMessage}
            />
          </div>
        </div>

        {/* Days Held */}
        <div>
          <label className="block text-[9px] font-semibold uppercase tracking-wider text-slate-500">
            Days Held
          </label>
          <div className="mt-0.5 flex items-center gap-1">
            <input
              type="text"
              value={daysHeldInput}
              onChange={(e) => setDaysHeldInput(e.target.value)}
              placeholder={daysHeldPlaceholder}
              className="w-[100px] rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[11px] font-mono text-slate-900 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-200"
            />
            <SaveStatusDot
              status={daysHeldSave.status}
              errorMessage={daysHeldSave.errorMessage}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

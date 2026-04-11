// Phase 1 Step 3E.3.c — QuickStatusTile with auto-persist.
//
// The new Workstation's Quick Status tile (per WORKSTATION_CARD_SPEC.md
// §3.2 Tile 4). Four qualitative dropdowns that auto-persist via 3D's
// saveManualAnalysisFieldAction. The Interest Level dropdown writes to
// analysis_pipeline.interest_level (cross-table routing handled by the
// shared action's internal FIELD_TABLE map); the other 3 write to
// manual_analysis.{analyst_condition,location_rating,next_step}.
//
// Layout (per spec):
//
//   ┌──────────────────────────────────┐
//   │ QUICK STATUS                     │
//   │                                  │
//   │  Interest                        │
//   │  [ Hot ▾ ]●                      │
//   │                                  │
//   │  Condition                       │
//   │  [ Average ▾ ]●                  │
//   │                                  │
//   │  Location                        │
//   │  [ Good ▾ ]●                     │
//   │                                  │
//   │  Next Step                       │
//   │  [ Schedule Showing ▾ ]●         │
//   └──────────────────────────────────┘
//
// Dropdowns persist on onChange "instantly" per spec — implemented
// by passing delayMs=0 to useDebouncedSave so the save fires on the
// next tick rather than after the default 500ms debounce.
//
// Empty dropdown value (the leading "(none)" option) persists null.

"use client";

import { useState } from "react";
import { useDebouncedSave } from "@/lib/auto-persist/use-debounced-save";
import { saveManualAnalysisFieldAction } from "@/lib/auto-persist/save-manual-analysis-field-action";
import { SaveStatusDot } from "@/components/workstation/save-status-dot";

// ─────────────────────────────────────────────────────────────────────────────
// Option lists
// ─────────────────────────────────────────────────────────────────────────────

const INTEREST_OPTIONS = [
  { value: "new", label: "New" },
  { value: "watch", label: "Watch" },
  { value: "warm", label: "Warm" },
  { value: "hot", label: "Hot" },
] as const;

const CONDITION_OPTIONS = [
  { value: "fixer", label: "Fixer" },
  { value: "poor", label: "Poor" },
  { value: "fair", label: "Fair" },
  { value: "average", label: "Average" },
  { value: "good", label: "Good" },
  { value: "excellent", label: "Excellent" },
] as const;

const LOCATION_OPTIONS = [
  { value: "poor", label: "Poor" },
  { value: "fair", label: "Fair" },
  { value: "average", label: "Average" },
  { value: "good", label: "Good" },
  { value: "excellent", label: "Excellent" },
] as const;

const NEXT_STEP_OPTIONS = [
  { value: "none", label: "None" },
  { value: "analyze_deeper", label: "Analyze Deeper" },
  { value: "schedule_showing", label: "Schedule Showing" },
  { value: "request_partner_input", label: "Request Partner Input" },
  { value: "make_offer", label: "Make Offer" },
  { value: "wait_price_drop", label: "Wait Price Drop" },
  { value: "pass", label: "Pass" },
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

type QuickStatusTileProps = {
  analysisId: string;
  initialInterestLevel: string | null;
  initialCondition: string | null;
  initialLocation: string | null;
  initialNextStep: string | null;
};

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function QuickStatusTile({
  analysisId,
  initialInterestLevel,
  initialCondition,
  initialLocation,
  initialNextStep,
}: QuickStatusTileProps) {
  const [interestLevel, setInterestLevel] = useState<string | null>(
    initialInterestLevel,
  );
  const [condition, setCondition] = useState<string | null>(initialCondition);
  const [location, setLocation] = useState<string | null>(initialLocation);
  const [nextStep, setNextStep] = useState<string | null>(initialNextStep);

  // Dropdowns persist "instantly" per spec — delayMs=0 means the save
  // fires on the next tick after a change rather than waiting 500ms.
  const interestSave = useDebouncedSave(
    interestLevel,
    async (value) => {
      await saveManualAnalysisFieldAction({
        analysisId,
        field: "interest_level",
        value,
      });
    },
    { delayMs: 0 },
  );

  const conditionSave = useDebouncedSave(
    condition,
    async (value) => {
      await saveManualAnalysisFieldAction({
        analysisId,
        field: "analyst_condition",
        value,
      });
    },
    { delayMs: 0 },
  );

  const locationSave = useDebouncedSave(
    location,
    async (value) => {
      await saveManualAnalysisFieldAction({
        analysisId,
        field: "location_rating",
        value,
      });
    },
    { delayMs: 0 },
  );

  const nextStepSave = useDebouncedSave(
    nextStep,
    async (value) => {
      await saveManualAnalysisFieldAction({
        analysisId,
        field: "next_step",
        value,
      });
    },
    { delayMs: 0 },
  );

  return (
    <div
      className="shrink-0 rounded border border-blue-200 bg-blue-50/50 px-3 py-2"
      style={{ maxWidth: 320 }}
    >
      <div className="mb-1.5 text-[9px] font-bold uppercase tracking-wider text-blue-600">
        Quick Status
      </div>
      <div className="grid grid-cols-2 gap-x-2 gap-y-2">
        {/* Interest */}
        <div>
          <label className="block text-[9px] font-semibold uppercase tracking-wider text-slate-500">
            Interest
          </label>
          <div className="mt-0.5 flex items-center gap-1">
            <select
              value={interestLevel ?? ""}
              onChange={(e) =>
                setInterestLevel(e.target.value === "" ? null : e.target.value)
              }
              className="w-[120px] rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[11px] text-slate-900 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-200"
            >
              <option value="">(none)</option>
              {INTEREST_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <SaveStatusDot
              status={interestSave.status}
              errorMessage={interestSave.errorMessage}
            />
          </div>
        </div>

        {/* Condition */}
        <div>
          <label className="block text-[9px] font-semibold uppercase tracking-wider text-slate-500">
            Condition
          </label>
          <div className="mt-0.5 flex items-center gap-1">
            <select
              value={condition ?? ""}
              onChange={(e) =>
                setCondition(e.target.value === "" ? null : e.target.value)
              }
              className="w-[120px] rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[11px] text-slate-900 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-200"
            >
              <option value="">(none)</option>
              {CONDITION_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <SaveStatusDot
              status={conditionSave.status}
              errorMessage={conditionSave.errorMessage}
            />
          </div>
        </div>

        {/* Location */}
        <div>
          <label className="block text-[9px] font-semibold uppercase tracking-wider text-slate-500">
            Location
          </label>
          <div className="mt-0.5 flex items-center gap-1">
            <select
              value={location ?? ""}
              onChange={(e) =>
                setLocation(e.target.value === "" ? null : e.target.value)
              }
              className="w-[120px] rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[11px] text-slate-900 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-200"
            >
              <option value="">(none)</option>
              {LOCATION_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <SaveStatusDot
              status={locationSave.status}
              errorMessage={locationSave.errorMessage}
            />
          </div>
        </div>

        {/* Next Step */}
        <div>
          <label className="block text-[9px] font-semibold uppercase tracking-wider text-slate-500">
            Next Step
          </label>
          <div className="mt-0.5 flex items-center gap-1">
            <select
              value={nextStep ?? ""}
              onChange={(e) =>
                setNextStep(e.target.value === "" ? null : e.target.value)
              }
              className="w-[120px] rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[11px] text-slate-900 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-200"
            >
              <option value="">(none)</option>
              {NEXT_STEP_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <SaveStatusDot
              status={nextStepSave.status}
              errorMessage={nextStepSave.errorMessage}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

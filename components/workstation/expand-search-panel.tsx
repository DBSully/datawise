// Phase 1 Step 3C Task 7 — ExpandSearchPanel lifted to its own module.
//
// The "Expand Comparable Search" panel that sits under the comp map in
// the screening modal (and will sit under the comp map in the new
// Workstation hero in 3E). Lets the analyst rerun the comparable search
// with relaxed parameters when the default candidate set is too tight.
//
// Already had a clean prop interface (compSearchRunId, realPropertyId,
// onComplete) — no closures over modal-local state. The lift moves the
// component plus its private helpers (MultiCheckDropdown, the two
// option constants) into a single shared file. All four were exclusive
// to ExpandSearchPanel in the modal, so nothing remains behind.

"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { expandComparableSearchAction } from "@/app/(workspace)/screening/actions";

// ─────────────────────────────────────────────────────────────────────────────
// Option constants — used by ExpandSearchPanel's MultiCheckDropdowns
// ─────────────────────────────────────────────────────────────────────────────

const LEVEL_CLASS_OPTIONS = [
  { value: "One Story", label: "One Story" },
  { value: "Two Story", label: "Two Story" },
  { value: "Three+ Story", label: "Three+ Story" },
  { value: "Bi-Level", label: "Bi-Level" },
  { value: "Tri-Level", label: "Tri-Level" },
  { value: "Multi-Level", label: "Multi-Level" },
  { value: "Split Level", label: "Split Level" },
] as const;

const BUILDING_FORM_OPTIONS = [
  { value: "house", label: "House" },
  { value: "townhouse_style", label: "Townhouse" },
  { value: "patio_cluster", label: "Patio/Cluster" },
  { value: "duplex", label: "Duplex" },
  { value: "triplex", label: "Triplex" },
  { value: "quadruplex", label: "Quadruplex" },
  { value: "low_rise", label: "Low Rise" },
  { value: "mid_rise", label: "Mid Rise" },
  { value: "high_rise", label: "High Rise" },
  { value: "manufactured_house", label: "Manufactured" },
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// MultiCheckDropdown — private helper used by ExpandSearchPanel.
// ─────────────────────────────────────────────────────────────────────────────

type MultiCheckDropdownProps = {
  label: string;
  options: readonly { value: string; label: string }[];
  selected: string[];
  onChange: (v: string[]) => void;
};

function MultiCheckDropdown({
  label,
  options,
  selected,
  onChange,
}: MultiCheckDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [isOpen]);

  const toggle = (value: string) => {
    onChange(
      selected.includes(value)
        ? selected.filter((v) => v !== value)
        : [...selected, value],
    );
  };

  const summary =
    selected.length === 0
      ? "Any"
      : selected.length <= 2
        ? selected.map((v) => options.find((o) => o.value === v)?.label ?? v).join(", ")
        : `${selected.length} selected`;

  return (
    <div className="flex items-center justify-between" ref={ref}>
      <span className="text-slate-600">{label}</span>
      <div className="relative">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="w-[110px] truncate rounded border border-slate-200 bg-white px-1.5 py-0.5 text-left text-[11px] text-slate-700 hover:bg-slate-50"
        >
          {summary}
          <span className="float-right text-slate-400">&#9662;</span>
        </button>
        {isOpen && (
          <div className="absolute right-0 z-50 mt-0.5 max-h-[180px] w-[140px] overflow-auto rounded border border-slate-200 bg-white py-0.5 shadow-lg">
            {options.map((opt) => (
              <label
                key={opt.value}
                className="flex cursor-pointer items-center gap-1.5 px-2 py-0.5 text-[11px] hover:bg-slate-50"
              >
                <input
                  type="checkbox"
                  checked={selected.includes(opt.value)}
                  onChange={() => toggle(opt.value)}
                  className="h-3 w-3"
                />
                <span className="text-slate-700">{opt.label}</span>
              </label>
            ))}
            {selected.length > 0 && (
              <button
                type="button"
                onClick={() => onChange([])}
                className="mt-0.5 w-full border-t border-slate-100 px-2 py-1 text-left text-[10px] text-blue-600 hover:bg-slate-50"
              >
                Clear all (Any)
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ExpandSearchPanel — exported public API
// ─────────────────────────────────────────────────────────────────────────────

type ExpandSearchPanelProps = {
  compSearchRunId: string;
  realPropertyId: string;
  onComplete: () => void;
};

export function ExpandSearchPanel({
  compSearchRunId,
  realPropertyId,
  onComplete,
}: ExpandSearchPanelProps) {
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ added: number; total: number } | null>(null);

  // Form state with sensible expanded defaults
  const [radius, setRadius] = useState("1.5");
  const [days, setDays] = useState("540");
  const [sqft, setSqft] = useState("40");
  const [levelClasses, setLevelClasses] = useState<string[]>([]);
  const [buildingForms, setBuildingForms] = useState<string[]>([]);

  const handleRun = useCallback(async () => {
    setRunning(true);
    setResult(null);
    try {
      const r = await expandComparableSearchAction(compSearchRunId, realPropertyId, {
        maxDistanceMiles: parseFloat(radius),
        maxDaysSinceClose: parseInt(days, 10),
        sqftTolerancePct: parseInt(sqft, 10),
        requireSameLevelClass: false,
        requireSameBuildingForm: false,
        targetLevelClasses: levelClasses,
        targetBuildingForms: buildingForms,
        maxCandidates: 50,
      });
      setResult(r);
      if (r.added > 0) onComplete();
    } finally {
      setRunning(false);
    }
  }, [compSearchRunId, realPropertyId, radius, days, sqft, levelClasses, buildingForms, onComplete]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-2 w-full rounded border border-blue-200 bg-blue-50 px-2 py-1.5 text-[10px] font-semibold text-blue-700 hover:bg-blue-100"
      >
        Expand Comparable Search
      </button>
    );
  }

  return (
    <div className="mt-2 rounded border border-blue-200 bg-blue-50 px-2.5 py-2 text-[11px]">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-semibold text-blue-800">Expand Search</span>
        <button type="button" onClick={() => setOpen(false)} className="text-blue-400 hover:text-blue-600">✕</button>
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
        <label className="flex items-center justify-between">
          <span className="text-slate-600">Radius (mi)</span>
          <input type="number" step="0.1" min="0.1" max="5" value={radius} onChange={(e) => setRadius(e.target.value)}
            className="w-14 rounded border border-slate-200 px-1.5 py-0.5 text-right text-[11px]" />
        </label>
        <MultiCheckDropdown
          label="Building Form"
          selected={buildingForms}
          onChange={setBuildingForms}
          options={BUILDING_FORM_OPTIONS}
        />
        <label className="flex items-center justify-between">
          <span className="text-slate-600">SqFt Tol %</span>
          <input type="number" step="5" min="10" max="60" value={sqft} onChange={(e) => setSqft(e.target.value)}
            className="w-14 rounded border border-slate-200 px-1.5 py-0.5 text-right text-[11px]" />
        </label>
        <MultiCheckDropdown
          label="Level Class"
          selected={levelClasses}
          onChange={setLevelClasses}
          options={LEVEL_CLASS_OPTIONS}
        />
        <label className="flex items-center justify-between">
          <span className="text-slate-600">Max Days</span>
          <input type="number" step="30" min="90" max="730" value={days} onChange={(e) => setDays(e.target.value)}
            className="w-14 rounded border border-slate-200 px-1.5 py-0.5 text-right text-[11px]" />
        </label>
      </div>
      <div className="mt-2 flex items-center justify-between">
        <button
          type="button"
          onClick={handleRun}
          disabled={running}
          className="rounded bg-blue-600 px-3 py-1 text-[10px] font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {running ? "Searching..." : "Run Expanded Search"}
        </button>
        {result && (
          <span className="text-[10px] text-blue-700">
            +{result.added} new comp{result.added !== 1 ? "s" : ""} ({result.total} total)
          </span>
        )}
      </div>
    </div>
  );
}

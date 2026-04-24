// Partner Entry Card — one of the paired cards in the partner-facing
// deal spreadsheet at /portal/deals/[shareToken].
//
// Each card sits in the middle column of the deal spreadsheet,
// horizontally aligned with the matching analyst "Deal Math" card:
//
//     ┌──────────────────┐  ┌──────────────────────────────┐
//     │  ARV  $1,125,000 │  │  YOUR ARV                    │
//     │  12 comps · …    │  │  Disagree? Enter yours here. │
//     └──────────────────┘  │  [ $1,150,000 ]  ●           │
//                           │                              │
//                           │  Reset to analyst's          │
//                           └──────────────────────────────┘
//
// Input auto-saves via the parent's useDebouncedSave hook. When the
// partner has entered a value the card gets an indigo accent border +
// checkmark so it feels "done". Clearing the input resets to the
// analyst's number (placeholder shows what they'd snap back to).
//
// The card is intentionally a bit taller than the matching analyst
// card so it reads as the interactive/important side of the row.

"use client";

import { SaveStatusDot } from "./save-status-dot";
import type { SaveState } from "@/lib/auto-persist/use-debounced-save";

type PartnerEntryCardProps = {
  /** Short uppercase title — e.g. "Your ARV". */
  title: string;
  /** One-line prompt addressed to the partner. */
  prompt: string;
  /** Current input value (controlled). */
  value: string;
  onChange: (value: string) => void;
  /** Placeholder shown when the input is empty — typically the
   *  formatted analyst figure so the partner sees what the value
   *  will snap back to if they clear it. */
  placeholder: string;
  /** Whether the partner has an active override saved — controls
   *  the accent styling + checkmark. */
  hasOverride: boolean;
  saveStatus: SaveState;
  saveErrorMessage?: string | null;
  /** Short unit/prefix hint shown next to the input — e.g. "$" or "days". */
  prefix?: string;
  /** Optional hint line below the input (tooltip-like context). */
  hint?: string;
};

export function PartnerEntryCard({
  title,
  prompt,
  value,
  onChange,
  placeholder,
  hasOverride,
  saveStatus,
  saveErrorMessage,
  prefix = "$",
  hint,
}: PartnerEntryCardProps) {
  return (
    <div
      className={`group relative flex flex-col rounded-lg border px-2.5 py-1.5 shadow-sm transition-colors ${
        hasOverride
          ? "border-indigo-300 bg-indigo-50/60"
          : "border-slate-200 bg-white hover:border-indigo-300"
      }`}
    >
      {/* Header row: title + check when overridden */}
      <div className="flex items-center justify-between gap-2">
        <span
          className={`text-[9px] font-bold uppercase tracking-[0.12em] ${
            hasOverride ? "text-indigo-700" : "text-slate-500"
          }`}
        >
          {title}
        </span>
        {hasOverride ? (
          <span
            className="text-[11px] leading-none text-indigo-600"
            aria-label="Your override is active"
            title="Your override is active"
          >
            ✓
          </span>
        ) : (
          <span
            className="text-[9px] leading-none text-slate-300 transition-colors group-hover:text-indigo-400"
            aria-hidden="true"
            title="Hover for details"
          >
            ⓘ
          </span>
        )}
      </div>

      {/* Input row — sits directly below the title so the partner's
       *  entry is visually "across from" the analyst's headline value
       *  in the matching row. */}
      <div className="mt-1 flex items-center gap-1.5">
        <div
          className={`flex flex-1 items-center rounded border bg-white px-1.5 py-0.5 transition-colors ${
            hasOverride
              ? "border-indigo-300 focus-within:border-indigo-400 focus-within:ring-1 focus-within:ring-indigo-200"
              : "border-slate-300 focus-within:border-indigo-400 focus-within:ring-1 focus-within:ring-indigo-200"
          }`}
        >
          <span className="mr-1 text-[11px] font-semibold text-slate-400">
            {prefix}
          </span>
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className="min-w-0 flex-1 bg-transparent text-right font-mono text-[12px] text-slate-900 placeholder:text-slate-400 focus:outline-none"
          />
        </div>
        <SaveStatusDot
          status={saveStatus}
          errorMessage={saveErrorMessage}
        />
      </div>

      {/* Reset link — visible when override is active (kept outside the
       *  hover tooltip so the partner can always clear their entry). */}
      {hasOverride && (
        <button
          type="button"
          onClick={() => onChange("")}
          className="mt-1 self-start text-[9px] font-semibold uppercase tracking-wider text-indigo-500 hover:text-indigo-700"
        >
          Reset to analyst's
        </button>
      )}

      {/* Hover tooltip — prompt + hint shown on group hover so the card
       *  stays compact at rest. Pops out to the RIGHT of the card in a
       *  light-blue bubble matching the "Expand Comparable Search"
       *  palette so it draws attention without feeling like an error. */}
      <div
        className="pointer-events-none absolute left-full top-0 z-30 ml-2 hidden w-60 rounded-md border border-blue-200 bg-blue-50 px-2.5 py-2 text-[11px] leading-snug text-blue-800 shadow-lg group-hover:block"
        role="tooltip"
      >
        <p>{prompt}</p>
        {hint && (
          <p className="mt-1 text-[10px] text-blue-700/80">{hint}</p>
        )}
      </div>
    </div>
  );
}

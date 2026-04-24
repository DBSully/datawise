// Partner Result Card — shared base for partner cards whose result is a
// computed dollar figure (Holding, Transaction) rather than a single
// dollar input. Layout:
//
//   ┌──────────────────────────────────┐
//   │  YOUR ___ COSTS              ⓘ   │  ← title + hover indicator
//   │                     $9,045       │  ← computed result (right-aligned)
//   │  <children slot, small font>     │  ← compact inputs with inline labels
//   └──────────────────────────────────┘
//
// Rows 1–2 mirror the analyst's stacked DetailCard (title on top, number
// right-aligned) so the paired rows stay aligned across the grid. Row 3
// is a slot for the card-specific compact input(s).
//
// Prompt + hint live in a hover tooltip so the card stays vertically
// short at rest.

"use client";

import type { ReactNode } from "react";

type PartnerResultCardProps = {
  /** Short uppercase title. */
  title: string;
  /** Formatted result — the computed dollar figure (e.g. "$9,045"). */
  result: string;
  /** True if any of the partner-owned inputs in the children slot have
   *  a saved override. Drives the indigo accent + ✓ marker. */
  hasOverride: boolean;
  /** One-line prompt shown in the hover tooltip. */
  prompt: string;
  /** Optional secondary line in the tooltip (analyst baseline etc). */
  hint?: string;
  /** Row-3 content — typically an inline label + compact input(s). */
  children: ReactNode;
};

export function PartnerResultCard({
  title,
  result,
  hasOverride,
  prompt,
  hint,
  children,
}: PartnerResultCardProps) {
  return (
    <div
      className={`group relative flex flex-col rounded-lg border px-2.5 py-1.5 shadow-sm transition-colors ${
        hasOverride
          ? "border-indigo-300 bg-indigo-50/60"
          : "border-slate-200 bg-white hover:border-indigo-300"
      }`}
    >
      {/* Row 1 — title + indicator */}
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

      {/* Row 2 — computed result, right-aligned accounting style */}
      <div
        className={`mt-0.5 text-right font-mono text-[14px] font-bold leading-tight ${
          hasOverride ? "text-indigo-900" : "text-slate-800"
        }`}
      >
        {result}
      </div>

      {/* Row 3 — card-specific compact input(s) */}
      <div className="mt-0.5 text-[10px] leading-tight text-slate-500">
        {children}
      </div>

      {/* Hover tooltip — pops out to the RIGHT of the card in a
       *  light-blue bubble (matches the "Expand Comparable Search"
       *  palette) so it stands out against the slate grid. */}
      <div
        className="pointer-events-none absolute left-full top-0 z-30 ml-2 hidden w-60 rounded-md border border-blue-200 bg-blue-50 px-2.5 py-2 text-[11px] leading-snug text-blue-800 shadow-lg group-hover:block"
        role="tooltip"
      >
        <p>{prompt}</p>
        {hint && <p className="mt-1 text-[10px] text-blue-700/80">{hint}</p>}
      </div>
    </div>
  );
}

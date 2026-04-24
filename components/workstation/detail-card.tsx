// Phase 1 Step 3C Task 11 — DetailCard greenfield wrapper.
//
// A small collapsed card that lives in the new Workstation's right tile
// column (introduced in 3E). Each detail card displays a title, a
// headline number, a context line, and an optional badge. Clicking
// anywhere on the card fires `onExpand`, which the parent uses to open
// the corresponding partial-screen modal (DetailModal — Task 12).
//
// Anatomy per WORKSTATION_CARD_SPEC.md §5.0:
//
//   ┌──────────────────────────────────────┐
//   │  ARV               $1,125,000   ▾    │
//   │  12 comps · $580/sf      [Override]  │
//   └──────────────────────────────────────┘
//
// - Title:    uppercase, 9px font, slate-500, tracking-[0.12em]
// - Headline: font-mono, bold, slate-800
// - Context:  small (10px), slate-400
// - Badge:    optional ReactNode shown to the right of the context row
//             (e.g. an "Override" pill, a trend arrow, an unread red dot)
// - Chevron:  ▾ on the right edge of the headline row, signals the
//             card is expandable
// - Click:    anywhere on the card fires `onExpand`. The card is wrapped
//             in a button element so it inherits keyboard accessibility
//             (Enter/Space) and focus styling for free.
//
// The card is purely presentational — it does NOT manage modal open/close
// state or read any application data. The parent (an orchestrator in 3E)
// supplies the strings and the onExpand callback that opens the
// corresponding DetailModal.
//
// No current consumer in 3C; 3E plugs it into RightTileColumn alongside
// the 9 specific card modals.

"use client";

import type { ReactNode } from "react";

type DetailCardProps = {
  title: string;
  headline: string;
  context: string;
  badge?: ReactNode;
  onExpand: () => void;
  /** Layout variant:
   *  - "compact" (default): title + headline on row 1, context + badge
   *    on row 2. Used in the analyst workstation's right rail.
   *  - "stacked": title on row 1, headline on row 2 (aligns vertically
   *    with an adjacent input box in a paired-card grid), context on
   *    row 3. Used in the partner portal deal spreadsheet so the
   *    analyst's headline number sits across from the partner's entry
   *    input in the matching row. */
  layout?: "compact" | "stacked";
};

export function DetailCard({
  title,
  headline,
  context,
  badge,
  onExpand,
  layout = "compact",
}: DetailCardProps) {
  if (layout === "stacked") {
    return (
      <button
        type="button"
        onClick={onExpand}
        className="group flex w-full flex-col rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-left shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-200"
      >
        {/* Row 1 — title + optional badge + chevron */}
        <div className="flex items-center justify-between gap-2">
          <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-500">
            {title}
          </span>
          <span className="flex items-center gap-1.5">
            {badge && <span className="shrink-0">{badge}</span>}
            <span
              aria-hidden="true"
              className="text-[10px] text-slate-400 transition-colors group-hover:text-slate-600"
            >
              ▾
            </span>
          </span>
        </div>

        {/* Row 2 — headline value (aligns with the partner input box
         *  in the paired card on the right). Right-aligned for
         *  accounting-style readability. */}
        <div className="mt-0.5 text-right font-mono text-[14px] font-bold leading-tight text-slate-800">
          {headline}
        </div>

        {/* Row 3 — context at the bottom */}
        <div className="mt-0.5 truncate text-[10px] leading-tight text-slate-400">
          {context}
        </div>
      </button>
    );
  }

  // Default "compact" layout — unchanged from the original spec.
  return (
    <button
      type="button"
      onClick={onExpand}
      className="group flex w-full flex-col rounded-lg border border-slate-200 bg-white px-3 py-2 text-left shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-200"
    >
      {/* Headline row: title (left) — value (right) — chevron */}
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-500">
          {title}
        </span>
        <span className="flex items-baseline gap-1.5">
          <span className="font-mono text-[13px] font-bold text-slate-800">
            {headline}
          </span>
          <span
            aria-hidden="true"
            className="text-[10px] text-slate-400 transition-colors group-hover:text-slate-600"
          >
            ▾
          </span>
        </span>
      </div>

      {/* Context row: caption (left) — optional badge (right) */}
      <div className="mt-0.5 flex items-center justify-between gap-2">
        <span className="truncate text-[10px] text-slate-400">{context}</span>
        {badge && <span className="shrink-0">{badge}</span>}
      </div>
    </button>
  );
}

// Phase 1 Step 3C Tasks 3-4 — shared price-trend badge primitives.
//
// Two related components used wherever we display Zillow-style price-trend
// data: TrendDirectionBadge (a single-pill direction label) and (Task 4)
// TrendTierColumn. Both lift duplicated implementations out of the current
// Workstation and the screening result detail page so the new Workstation
// in 3E and any other future consumer can share them.
//
// `TrendDirectionBadge` supports two visual variants per Decision 5.5
// (Task 3 of the 3C plan):
//
//   - "compact"   (default) — smaller padding, smaller text, lighter color
//                 shade. Suited to dense card layouts where the badge sits
//                 inline next to other stats. Used by the current
//                 Workstation right-column trend card and (in 3E) the new
//                 Workstation Price Trend card.
//
//   - "prominent" — wider padding, larger text, one shade darker. Suited
//                 to standalone presentation. Used by the screening result
//                 detail page where the trend display is its own hero
//                 section with room to breathe.
//
// Both variants share the same background colors and labels — only the text
// color shade and the size scale differ. The two existing surfaces had
// diverged on these visual details over time (compact vs prominent reflect
// the deliberate design intent of each consumer); merging them behind a
// variant prop preserves both looks exactly while still giving us a single
// canonical source for the data table and the rendering logic.

type Variant = "compact" | "prominent";

type DirectionDisplay = {
  label: string;
  bg: string;
  textCompact: string;
  textProminent: string;
};

const DIRECTION_DISPLAY: Record<string, DirectionDisplay> = {
  strong_appreciation: {
    label: "Strong Appreciation",
    bg: "bg-emerald-100",
    textCompact: "text-emerald-700",
    textProminent: "text-emerald-800",
  },
  appreciating: {
    label: "Appreciating",
    bg: "bg-emerald-50",
    textCompact: "text-emerald-600",
    textProminent: "text-emerald-700",
  },
  flat: {
    label: "Flat",
    bg: "bg-slate-100",
    textCompact: "text-slate-600",
    textProminent: "text-slate-600",
  },
  softening: {
    label: "Softening",
    bg: "bg-amber-100",
    textCompact: "text-amber-700",
    textProminent: "text-amber-800",
  },
  declining: {
    label: "Declining",
    bg: "bg-red-100",
    textCompact: "text-red-700",
    textProminent: "text-red-800",
  },
  sharp_decline: {
    label: "Sharp Decline",
    bg: "bg-red-200",
    textCompact: "text-red-800",
    textProminent: "text-red-900",
  },
};

const SIZE_CLASSES: Record<Variant, string> = {
  compact: "px-1.5 py-0.5 text-[9px] font-semibold",
  prominent: "px-2 py-0.5 text-xs font-medium",
};

type TrendDirectionBadgeProps = {
  direction: string;
  variant?: Variant;
};

export function TrendDirectionBadge({
  direction,
  variant = "compact",
}: TrendDirectionBadgeProps) {
  const display = DIRECTION_DISPLAY[direction] ?? DIRECTION_DISPLAY.flat;
  const text =
    variant === "prominent" ? display.textProminent : display.textCompact;
  return (
    <span
      className={`inline-flex items-center rounded-full ${display.bg} ${text} ${SIZE_CLASSES[variant]}`}
    >
      {display.label}
    </span>
  );
}

// Phase 1 Step 3C Task 5 — shared DealStat primitive (extended in Task 10).
//
// A single label/value pair used in deal-summary stat strips. Two visual
// variants per Decision 5.5 (Task 5 of the 3C plan):
//
//   - "stacked" (default) — vertical tile with label on top and a larger
//                monospace value below. Used inside the horizontal stat
//                strip in the current Workstation (and the new Workstation
//                in 3E). The "highlight" flag bolds the value and darkens
//                the text color.
//
//   - "inline"   — horizontal row with the label and value side by side.
//                Used inside the screening comp modal where the stat row
//                sits in a denser layout. The "highlight" flag flips the
//                value color to emerald (signaling a positive spread or
//                similar metric).
//
// In Task 10 the component gained a `tone` prop for value-driven semantic
// coloring (green/red) used by the unified DealStatStrip on stats like
// Offer%, Gap/sqft, and Trend. Tone overrides the value's text color but
// does NOT affect the highlight bold treatment — both can be combined
// (e.g. a highlighted stat that's also "good" tone in some future use).

type Variant = "stacked" | "inline";

/** Semantic tone for the value text color. Default = neutral; "good" =
 *  emerald-700 (positive); "bad" = red-600 (negative). Used by callers
 *  that compute the tone from a numeric value (e.g. Offer% green when
 *  >= 0.9, red when <= 0.8). Tone overrides the variant's default text
 *  color but does not change boldness or sizing. */
type Tone = "default" | "good" | "bad";

type DealStatProps = {
  label: string;
  value: string;
  highlight?: boolean;
  variant?: Variant;
  tone?: Tone;
};

const TONE_COLOR: Record<Tone, string> = {
  default: "",
  good: "text-emerald-700",
  bad: "text-red-600",
};

export function DealStat({
  label,
  value,
  highlight,
  variant = "stacked",
  tone = "default",
}: DealStatProps) {
  if (variant === "inline") {
    // Inline default text color is slate-900 (or emerald-700 if highlighted).
    // A non-default tone overrides whichever the variant would have produced.
    const baseColor =
      tone !== "default"
        ? TONE_COLOR[tone]
        : highlight
          ? "text-emerald-700"
          : "text-slate-900";
    return (
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] uppercase tracking-wider text-slate-400">
          {label}
        </span>
        <span className={`text-xs font-semibold ${baseColor}`}>{value}</span>
      </div>
    );
  }

  // stacked (default)
  // Stacked default text color is slate-700 (or slate-900 + bold if highlighted).
  // A non-default tone overrides the color but preserves the highlight bold.
  const baseColor =
    tone !== "default"
      ? TONE_COLOR[tone]
      : highlight
        ? "text-slate-900"
        : "text-slate-700";
  const boldClass = highlight ? "font-bold" : "";
  return (
    <div className="flex flex-col leading-tight">
      <span className="text-[9px] font-semibold uppercase tracking-wider text-slate-500">
        {label}
      </span>
      <span className={`font-mono text-[13px] ${boldClass} ${baseColor}`}>
        {value}
      </span>
    </div>
  );
}

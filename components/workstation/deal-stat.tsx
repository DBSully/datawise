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

/** Override indicator state per Decision 6.1 in the master plan
 *  (combined option A + B):
 *
 *   - "none"      — automated value, default text color
 *   - "manual"    — value is directly manually overridden via Quick
 *                   Analysis (indigo-700) with a small `ᴹ` superscript
 *                   marker
 *   - "cascading" — value is derived from a manual override upstream
 *                   (e.g. Max Offer when ARV is manually set) — lighter
 *                   indigo-500, no superscript
 *
 *   When `override` is non-default, it takes priority over `tone` and
 *   over the variant's highlight color — the indigo wins because the
 *   override status is more important for the analyst to see than the
 *   green/red threshold tone. The bold treatment from `highlight` is
 *   preserved (so a highlighted manual ARV is bold indigo-700, not
 *   plain indigo-700). */
type Override = "none" | "manual" | "cascading";

type DealStatProps = {
  label: string;
  value: string;
  highlight?: boolean;
  variant?: Variant;
  tone?: Tone;
  override?: Override;
};

const TONE_COLOR: Record<Tone, string> = {
  default: "",
  good: "text-emerald-700",
  bad: "text-red-600",
};

const OVERRIDE_COLOR: Record<Override, string> = {
  none: "",
  manual: "text-indigo-700",
  cascading: "text-indigo-500",
};

/** Color resolution priority: override > tone > highlight > default.
 *  override "manual" or "cascading" wins over everything else because
 *  knowing the value is manually overridden is the most important
 *  signal for the analyst. */
function resolveValueColor(
  override: Override,
  tone: Tone,
  highlight: boolean | undefined,
  variant: Variant,
): string {
  if (override !== "none") return OVERRIDE_COLOR[override];
  if (tone !== "default") return TONE_COLOR[tone];
  if (variant === "inline") {
    return highlight ? "text-emerald-700" : "text-slate-900";
  }
  // stacked
  return highlight ? "text-slate-900" : "text-slate-700";
}

export function DealStat({
  label,
  value,
  highlight,
  variant = "stacked",
  tone = "default",
  override = "none",
}: DealStatProps) {
  const valueColor = resolveValueColor(override, tone, highlight, variant);
  // The `ᴹ` superscript marker renders only for "manual" overrides
  // (not "cascading"). Per Decision 6.1.
  const manualMarker =
    override === "manual" ? (
      <sup className="ml-0.5 text-[8px] font-bold text-indigo-700">
        M
      </sup>
    ) : null;

  if (variant === "inline") {
    return (
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] uppercase tracking-wider text-slate-400">
          {label}
        </span>
        <span className={`text-xs font-semibold ${valueColor}`}>
          {value}
          {manualMarker}
        </span>
      </div>
    );
  }

  // stacked (default)
  const boldClass = highlight ? "font-bold" : "";
  return (
    <div className="flex flex-col leading-tight">
      <span className="text-[9px] font-semibold uppercase tracking-wider text-slate-500">
        {label}
      </span>
      <span className={`font-mono text-[13px] ${boldClass} ${valueColor}`}>
        {value}
        {manualMarker}
      </span>
    </div>
  );
}

// Phase 1 Step 3C Task 5 — shared DealStat primitive.
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
// The two existing implementations had structurally different layouts
// (vertical tile vs horizontal inline) AND different highlight semantics
// (bolder/darker vs green). Both styles are useful and serve their
// respective layouts well; the variant prop preserves both exactly while
// giving the new Workstation in 3E a single import to consume.

type Variant = "stacked" | "inline";

type DealStatProps = {
  label: string;
  value: string;
  highlight?: boolean;
  variant?: Variant;
};

export function DealStat({
  label,
  value,
  highlight,
  variant = "stacked",
}: DealStatProps) {
  if (variant === "inline") {
    return (
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] uppercase tracking-wider text-slate-400">
          {label}
        </span>
        <span
          className={`text-xs font-semibold ${highlight ? "text-emerald-700" : "text-slate-900"}`}
        >
          {value}
        </span>
      </div>
    );
  }

  // stacked (default)
  return (
    <div className="flex flex-col leading-tight">
      <span className="text-[9px] font-semibold uppercase tracking-wider text-slate-500">
        {label}
      </span>
      <span
        className={`font-mono text-[13px] ${highlight ? "font-bold text-slate-900" : "text-slate-700"}`}
      >
        {value}
      </span>
    </div>
  );
}

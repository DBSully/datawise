// Phase 1 Step 3C Task 2 — shared CostLine primitive.
//
// A single line item in a cost waterfall (Holding, Transaction, Financing,
// Cash Required). Renders a label on the left and a monospace value on the
// right with an optional small subscript caption. The `negative` flag flips
// the value color to red for line items like commissions or signed-negative
// amounts.
//
// Originally lived inline in the current Workstation; lifted here so the
// new Workstation in 3E and the current Workstation can share the same
// implementation. Pure presentational — no hooks, no state, no closures.

type CostLineProps = {
  label: string;
  value: string;
  sub?: string;
  negative?: boolean;
};

export function CostLine({ label, value, sub, negative }: CostLineProps) {
  return (
    <div className="flex items-baseline justify-between gap-2 py-[1px]">
      <span className="text-slate-500 truncate">{label}</span>
      <div className="text-right shrink-0">
        <span
          className={`font-mono ${negative ? "text-red-600" : "text-slate-700"}`}
        >
          {value}
        </span>
        {sub && (
          <span className="ml-1 text-[10px] text-slate-400">{sub}</span>
        )}
      </div>
    </div>
  );
}

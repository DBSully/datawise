// Phase 1 Step 3C Task 6 — shared CardTitle primitive (bonus extraction).
//
// A tiny header used at the top of every card in the current Workstation
// (Deal Math, ARV, Rehab, Holding, Trans, Cash Required, Financing, Price
// Trend, Notes, Overrides, Pipeline). Lifted out of the current Workstation
// so the new RehabCard module (and any future card module in 3E) can share
// it without forcing them to import from the legacy workstation file.
//
// Not in the spec §6 explicit list but covered by the same "small shared
// primitives" intent — and required to cleanly extract RehabCard since
// RehabCard's first child is `<CardTitle>Rehab</CardTitle>`.

import type { ReactNode } from "react";

type CardTitleProps = {
  children: ReactNode;
  action?: ReactNode;
};

export function CardTitle({ children, action }: CardTitleProps) {
  return (
    <div className="flex items-center justify-between mb-1.5">
      <h3 className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">
        {children}
      </h3>
      {action}
    </div>
  );
}

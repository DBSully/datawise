// Phase 1 Step 3E.1 — new Workstation skeleton.
//
// The canonical Analysis Workstation client component, built up
// incrementally throughout 3E.2-3E.8 per WORKSTATION_CARD_SPEC.md.
// At this point only the layout regions are stubbed; actual content
// arrives in subsequent sub-tasks.
//
// Layout overview (per spec §2):
//
//   ┌─────────────────────────────────────────────────────────────┐
//   │  HEADER BAR                                       (3E.2)    │
//   ├─────────────────────────────────────────────────────────────┤
//   │  TOP TILE ROW — MLS / Physical / QuickAnalysis / QuickStat │
//   │                                                   (3E.3)    │
//   ├─────────────────────────────────────────────────────────────┤
//   │  DEAL STAT STRIP                                  (3E.4)    │
//   ├─────────────────────────────────────────────┬───────────────┤
//   │                                             │               │
//   │  HERO COMP WORKSPACE                        │  RIGHT COLUMN │
//   │  Map + comp table + tab bar + controls      │  9 cards stacked │
//   │                                             │               │
//   │                                  (3E.5)     │  (3E.6 + 3E.7)│
//   └─────────────────────────────────────────────┴───────────────┘
//
// The skeleton renders dashed-box placeholders for each section so
// the route loads without errors and each subsequent sub-task can
// replace its placeholder with real content.

"use client";

import type { WorkstationData } from "@/lib/reports/types";

type AnalysisWorkstationProps = {
  data: WorkstationData;
};

export function AnalysisWorkstation({ data }: AnalysisWorkstationProps) {
  return (
    <section className="dw-section-stack-compact">
      {/* HEADER BAR — 3E.2 */}
      <div className="rounded border border-dashed border-slate-300 bg-slate-50 px-4 py-2 text-xs text-slate-500">
        HEADER BAR (3E.2) — address, status badges, Mark Complete / Share /
        Generate Report buttons
      </div>

      {/* TOP TILE ROW — 3E.3 */}
      <div className="rounded border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-xs text-slate-500">
        TOP TILE ROW (3E.3) — MLS Info / Property Physical (with bed/bath
        grid) / Quick Analysis / Quick Status
      </div>

      {/* DEAL STAT STRIP — 3E.4 */}
      <div className="rounded border border-dashed border-slate-300 bg-slate-50 px-4 py-2 text-xs text-slate-500">
        DEAL STAT STRIP (3E.4) — ARV / Max Offer / Offer% / Gap-sqft / Rehab
        / Target Profit / Trend, with override indicators
      </div>

      {/* HERO + RIGHT COLUMN — 3E.5 + 3E.6 */}
      <div className="grid gap-2" style={{ gridTemplateColumns: "1fr 320px" }}>
        <div className="rounded border border-dashed border-slate-300 bg-slate-50 px-4 py-12 text-xs text-slate-500">
          HERO COMP WORKSPACE (3E.5) — map + comp table + tab bar + controls
        </div>
        <div className="rounded border border-dashed border-slate-300 bg-slate-50 px-4 py-12 text-xs text-slate-500">
          RIGHT TILE COLUMN (3E.6 + 3E.7) — 9 collapsible detail cards
        </div>
      </div>

      {/* Reference: analysis ID for verification while the skeleton is
       *  being filled in. Removed in 3E.8 polish. */}
      <div className="text-[10px] text-slate-400">
        analysisId:{" "}
        <span className="font-mono">{data.analysisId}</span>
      </div>
    </section>
  );
}

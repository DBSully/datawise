// Phase 1 Step 3C Task 10 — DealStatStrip built by extraction.
//
// The horizontal strip of deal-summary stat pills that sits below the
// SubjectTileRow in both the screening comp modal and the current
// Workstation. The two consumers had drifted on visual styling (rounded
// card vs separator bar), stat list (Target Profit vs Trend), and the
// modal had a right-aligned section with comp count + Copy MLS buttons
// while the workstation had nothing on the right side.
//
// Per Dan's call, the unification uses the workstation's layout for both
// surfaces, with Trend added to the right of Target Profit, plus an
// optional rightSlot for the modal's comp stats and copy buttons. The
// drift was accidental — both consumers want the same visual now.
//
// Color rules (new in Task 10):
//
//   - ARV / Max Offer: highlighted (bold + slate-900). Plain dark text,
//                      no semantic green color.
//   - Offer%:  green if >= 0.90, red if <= 0.80, default otherwise
//   - Gap/sqft: green if  > 100,  red if <= 70,    default otherwise
//   - Trend:    green if >= 0.05, red if <= -0.05, default otherwise
//   - Rehab / Target Profit: default styling
//
// Trend pill is hidden entirely when trendAnnualRate is null.
//
// Pre-existing modal bug fixed in this commit: the modal's Rehab pill
// previously read from data.rehabTotal (server-static), so typing in
// the Quick Analysis Rehab Override field updated ARV/MaxOffer/Offer%/
// Gap via liveDeal but the Rehab pill itself stayed frozen. Now both
// consumers pass liveDeal.rehabTotal which responds to the override.

"use client";

import type { ReactNode } from "react";
import { fmt, fmtNum, fmtPct } from "@/lib/reports/format";
import { DealStat } from "@/components/workstation/deal-stat";

// ─────────────────────────────────────────────────────────────────────────────
// Tone helpers — value-driven semantic coloring
// ─────────────────────────────────────────────────────────────────────────────

type Tone = "default" | "good" | "bad";

function offerPctTone(v: number | null): Tone {
  if (v == null) return "default";
  if (v >= 0.9) return "good";
  if (v <= 0.8) return "bad";
  return "default";
}

function gapPerSqftTone(v: number | null): Tone {
  if (v == null) return "default";
  if (v > 100) return "good";
  if (v <= 70) return "bad";
  return "default";
}

function trendTone(v: number | null): Tone {
  if (v == null) return "default";
  if (v >= 0.05) return "good";
  if (v <= -0.05) return "bad";
  return "default";
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

/** Override flags from the parent. The strip computes per-stat
 *  override states internally per the cascade rules in spec §3.3:
 *  - arv → ARV manual; Max Offer / Offer% / Gap-sqft cascading
 *  - rehab → Rehab manual; Max Offer / Offer% cascading
 *  - targetProfit → Target Profit manual; Max Offer / Offer% cascading
 *  - daysHeld → no Deal Stat Strip implication (cascades into the
 *    Holding card instead, handled in 3E.6) */
export type DealStatStripManualOverrides = {
  arv?: boolean;
  rehab?: boolean;
  targetProfit?: boolean;
};

type DealStatStripProps = {
  arv: number | null;
  maxOffer: number | null;
  /** Decimal — 0.85 means 85% */
  offerPct: number | null;
  gapPerSqft: number | null;
  rehabTotal: number | null;
  targetProfit: number | null;
  /** Decimal — 0.05 means 5%/yr. When null the Trend pill is hidden entirely. */
  trendAnnualRate: number | null;
  /** Per-spec §3.3 + Decision 6.1: per-value override indicators on
   *  the strip. Each flag means the corresponding Quick Analysis input
   *  has a manual value set; the strip computes which downstream stats
   *  also need the cascading indicator. Modal consumers omit this
   *  prop (no Quick Analysis tile in the legacy modal flow). */
  manualOverrides?: DealStatStripManualOverrides;
  /** Optional right-aligned content (used by the modal for comp count
   *  text and Copy MLS buttons). The strip wraps it in `ml-auto` so the
   *  consumer doesn't need to set positioning itself. */
  rightSlot?: ReactNode;
};

export function DealStatStrip({
  arv,
  maxOffer,
  offerPct,
  gapPerSqft,
  rehabTotal,
  targetProfit,
  trendAnnualRate,
  manualOverrides,
  rightSlot,
}: DealStatStripProps) {
  const trendDisplay =
    trendAnnualRate != null
      ? `${trendAnnualRate >= 0 ? "+" : ""}${(trendAnnualRate * 100).toFixed(1)}%/yr`
      : null;

  // Per-stat override resolution per spec §3.3 cascade rules.
  const arvManual = manualOverrides?.arv ?? false;
  const rehabManual = manualOverrides?.rehab ?? false;
  const targetProfitManual = manualOverrides?.targetProfit ?? false;
  const anyArvAffectingOverride = arvManual || rehabManual || targetProfitManual;

  // ARV is only directly overridden by arv_manual.
  const arvOverride = arvManual ? "manual" : "none";
  // Max Offer = ARV - costs - target profit. Cascades from any Quick
  // Analysis override that touches a component.
  const maxOfferOverride = anyArvAffectingOverride ? "cascading" : "none";
  // Offer% derives from Max Offer (which derives from ARV/Rehab/Target)
  // — same cascade as Max Offer.
  const offerPctOverride = anyArvAffectingOverride ? "cascading" : "none";
  // Gap/sqft = (ARV - listPrice) / sqft. Cascades only when ARV is
  // overridden — Rehab and Target Profit don't affect Gap.
  const gapOverride = arvManual ? "cascading" : "none";
  // Rehab pill renders the user's override directly (manual) or the
  // computed value (none).
  const rehabOverride = rehabManual ? "manual" : "none";
  // Target Profit pill: same logic.
  const targetProfitPillOverride = targetProfitManual ? "manual" : "none";

  return (
    <div className="flex items-center gap-4 rounded border border-slate-200 bg-slate-50 px-4 py-2">
      <DealStat label="ARV" value={fmt(arv)} highlight override={arvOverride} />
      <DealStat
        label="Max Offer"
        value={fmt(maxOffer)}
        highlight
        override={maxOfferOverride}
      />
      <DealStat
        label="Offer%"
        value={fmtPct(offerPct)}
        tone={offerPctTone(offerPct)}
        override={offerPctOverride}
      />
      <DealStat
        label="Gap/sqft"
        value={gapPerSqft != null ? `$${fmtNum(gapPerSqft)}` : "\u2014"}
        tone={gapPerSqftTone(gapPerSqft)}
        override={gapOverride}
      />
      <DealStat label="Rehab" value={fmt(rehabTotal)} override={rehabOverride} />
      <DealStat
        label="Target Profit"
        value={fmt(targetProfit)}
        override={targetProfitPillOverride}
      />
      {trendDisplay != null && (
        <DealStat
          label="Trend"
          value={trendDisplay}
          tone={trendTone(trendAnnualRate)}
        />
      )}
      {rightSlot && <div className="ml-auto">{rightSlot}</div>}
    </div>
  );
}

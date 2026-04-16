// Phase 1 Step 3E.7.c — PriceTrendCardModal (read-only).
//
// The Price Trend card's detail modal per WORKSTATION_CARD_SPEC.md §5.6.
// Pure read-only — trend data is market-derived, no editable fields.
// Uses shared components from 3C: TrendDirectionBadge (prominent
// variant) and TrendTierColumn for the local / metro tier displays.

"use client";

import { DetailModal } from "@/components/workstation/detail-modal";
import {
  TrendDirectionBadge,
  TrendTierColumn,
} from "@/components/workstation/trend-badges";
import type { TrendData } from "@/lib/reports/types";

type PriceTrendCardModalProps = {
  trend: TrendData | null;
  onClose: () => void;
  /** When true, suppresses internal methodology: positive-rate cap info,
   *  local/metro tier breakdown, and the summary text (which references
   *  comp counts and radii). Partners see the applied rate + direction
   *  + confidence only. */
  hideMethodology?: boolean;
};

export function PriceTrendCardModal({
  trend,
  onClose,
  hideMethodology = false,
}: PriceTrendCardModalProps) {
  if (!trend) {
    return (
      <DetailModal title="Price Trend" onClose={onClose}>
        <p className="py-8 text-center text-sm text-slate-400">
          No trend data available for this property.
        </p>
      </DetailModal>
    );
  }

  const fmtRate = (r: number) =>
    `${r >= 0 ? "+" : ""}${(r * 100).toFixed(1)}%/yr`;
  const rateDisplay = fmtRate(trend.blendedAnnualRate);
  const rawDisplay = fmtRate(trend.rawBlendedRate);
  const capPctDisplay = `${(trend.positiveRateCap * 100).toFixed(1)}%/yr`;

  return (
    <DetailModal title="Price Trend" onClose={onClose}>
      {/* Confidence + direction badges */}
      <div className="flex items-center gap-2">
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
            trend.confidence === "high"
              ? "bg-emerald-100 text-emerald-700"
              : trend.confidence === "low"
                ? "bg-amber-100 text-amber-700"
                : "bg-red-100 text-red-700"
          }`}
        >
          Confidence: {trend.confidence === "high" ? "High" : trend.confidence === "low" ? "Low" : "Fallback"}
        </span>
        <TrendDirectionBadge direction={trend.direction} variant="prominent" />
        {trend.positiveRateCapApplied && !hideMethodology && (
          <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-semibold text-indigo-700">
            Capped at +{capPctDisplay}
          </span>
        )}
      </div>

      {/* Fallback warning */}
      {trend.isFallback && (
        <div className="mt-2 rounded border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-800">
          Insufficient local comps — a fixed fallback rate was applied instead
          of the market-derived rate.
        </div>
      )}

      {/* Cap transparency note — analyst-only */}
      {trend.positiveRateCapApplied && !hideMethodology && (
        <div className="mt-2 rounded border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs text-indigo-800">
          Market-derived signal was <strong>{rawDisplay}</strong>, but positive rates
          are capped at <strong>+{capPctDisplay}</strong> for defensibility. ARV
          and downstream deal math use the applied (capped) rate.
        </div>
      )}

      {/* Applied rate */}
      <div className="mt-3 flex items-baseline justify-between rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          Applied Rate (blended)
        </span>
        <span
          className={`font-mono text-lg font-bold ${
            trend.blendedAnnualRate >= 0 ? "text-emerald-700" : "text-red-600"
          }`}
        >
          {rateDisplay}
        </span>
      </div>

      {/* Raw (pre-cap) rate — analyst-only, shown when different from applied */}
      {trend.positiveRateCapApplied && !hideMethodology && (
        <div className="mt-1 flex items-baseline justify-between rounded-md border border-slate-100 bg-white px-3 py-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Market Rate (pre-cap)
          </span>
          <span className="font-mono text-sm font-semibold text-slate-500">
            {rawDisplay}
          </span>
        </div>
      )}

      {/* Local / Metro tier columns — analyst-only. Partner view hides
       *  these because they expose the OLS tier breakdown and per-tier
       *  comp counts / price ranges, i.e. how we derived the rate. */}
      {!hideMethodology && (
        <div className="mt-4 grid grid-cols-2 gap-4">
          <TrendTierColumn
            label="Local"
            radius={trend.localRadius}
            rate={trend.rawLocalRate}
            stats={trend.detailJson?.localStats ?? null}
          />
          <TrendTierColumn
            label="Metro"
            radius={trend.metroRadius}
            rate={trend.rawMetroRate}
            stats={trend.detailJson?.metroStats ?? null}
          />
        </div>
      )}

      {/* Summary text — analyst-only. The text references comp counts,
       *  radii, and the cap mechanism, all of which are internal. */}
      {trend.summary && !hideMethodology && (
        <p className="mt-3 text-xs leading-relaxed text-slate-500">
          {trend.summary}
        </p>
      )}
    </DetailModal>
  );
}

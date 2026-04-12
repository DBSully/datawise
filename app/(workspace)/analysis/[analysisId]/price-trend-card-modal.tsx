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
};

export function PriceTrendCardModal({
  trend,
  onClose,
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

  const rateDisplay = `${trend.blendedAnnualRate >= 0 ? "+" : ""}${(trend.blendedAnnualRate * 100).toFixed(1)}%/yr`;

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
      </div>

      {/* Fallback warning */}
      {trend.isFallback && (
        <div className="mt-2 rounded border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-800">
          Insufficient local comps — a fixed fallback rate was applied instead
          of the market-derived rate.
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

      {/* Local / Metro tier columns */}
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

      {/* Summary text */}
      {trend.summary && (
        <p className="mt-3 text-xs leading-relaxed text-slate-500">
          {trend.summary}
        </p>
      )}
    </DetailModal>
  );
}

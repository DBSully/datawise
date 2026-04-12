// Phase 1 Step 3E.7.a — ArvCardModal (read-only).
//
// The ARV card's detail modal per WORKSTATION_CARD_SPEC.md §5.1.
// Pure read-only — the manual ARV override lives in the Quick Analysis
// tile (Decision 2). This modal shows: the 3-tier display (Auto /
// Selected / Final), effective ARV with $/sqft, PSF comparisons, the
// per-comp ARV table, and comp summary stats.
//
// Footer link: "Edit Manual ARV →" scrolls/focuses the Quick Analysis
// tile's Manual ARV input (wired via the onEditManualArv callback).

"use client";

import { DetailModal } from "@/components/workstation/detail-modal";
import { fmt, fmtNum } from "@/lib/reports/format";
import type { WorkstationData, ArvPerCompDetail } from "@/lib/reports/types";

type ArvCardModalProps = {
  data: WorkstationData;
  liveDeal: { arv: number; arvManual: boolean };
  onClose: () => void;
  /** Callback to focus the Manual ARV input in Quick Analysis. */
  onEditManualArv?: () => void;
};

function TierChip({
  label,
  value,
  color,
  active,
}: {
  label: string;
  value: number | null;
  color: string;
  active: boolean;
}) {
  return (
    <div
      className={`rounded-md border px-3 py-1.5 text-center ${
        active
          ? `${color} border-current shadow-sm`
          : "border-slate-200 bg-slate-50 text-slate-400"
      }`}
    >
      <div className="text-[9px] font-semibold uppercase tracking-wider">
        {label}
      </div>
      <div className="mt-0.5 font-mono text-sm font-bold">
        {value != null ? fmt(value) : "\u2014"}
      </div>
    </div>
  );
}

export function ArvCardModal({
  data,
  liveDeal,
  onClose,
  onEditManualArv,
}: ArvCardModalProps) {
  const arv = data.arv;
  const detail = arv.selectedDetail;
  const perComp = detail?.perCompDetails ?? [];
  const buildingSqft = data.physical?.buildingSqft ?? 0;
  const aboveGradeSqft = data.physical?.aboveGradeSqft ?? 0;

  // Effective values
  const effectiveArv = liveDeal.arv;
  const psfBldg = buildingSqft > 0 ? Math.round(effectiveArv / buildingSqft) : null;
  const psfAg = aboveGradeSqft > 0 ? Math.round(effectiveArv / aboveGradeSqft) : null;

  // Local trend high for PSF comparison
  const localStats = data.trend?.detailJson?.localStats ?? null;
  const localPsfBldgHigh = localStats?.psfBuildingHigh ?? null;
  const localPsfAgHigh = localStats?.psfAboveGradeHigh ?? null;

  // Which tier is "active" (drives the effective ARV)
  const activeTier: "auto" | "selected" | "final" =
    arv.final != null ? "final" : arv.selected != null ? "selected" : "auto";

  return (
    <DetailModal title="ARV" onClose={onClose}>
      {/* 3-tier display */}
      <div className="flex gap-3">
        <TierChip
          label="Auto"
          value={arv.auto}
          color="text-slate-700 bg-slate-100"
          active={activeTier === "auto"}
        />
        <TierChip
          label="Selected"
          value={arv.selected}
          color="text-blue-700 bg-blue-50"
          active={activeTier === "selected"}
        />
        <TierChip
          label="Final"
          value={arv.final}
          color="text-emerald-700 bg-emerald-50"
          active={activeTier === "final"}
        />
      </div>

      {/* Effective ARV row */}
      <div className="mt-4 flex items-baseline justify-between rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          Effective ARV
        </span>
        <div className="text-right">
          <span className="font-mono text-lg font-bold text-slate-900">
            {fmt(effectiveArv)}
          </span>
          {liveDeal.arvManual && (
            <span className="ml-1 text-[9px] font-semibold text-indigo-600">
              manual override
            </span>
          )}
        </div>
      </div>

      {/* PSF comparisons */}
      <div className="mt-3 flex gap-4 text-xs">
        <div>
          <span className="text-slate-500">PSF Bldg: </span>
          <span
            className={`font-mono font-semibold ${
              psfBldg != null && localPsfBldgHigh != null && psfBldg > localPsfBldgHigh
                ? "text-red-600"
                : "text-slate-900"
            }`}
          >
            {psfBldg != null ? `$${fmtNum(psfBldg)}` : "\u2014"}
          </span>
          {psfBldg != null && localPsfBldgHigh != null && psfBldg > localPsfBldgHigh && (
            <span className="ml-1 text-[10px] text-red-500" title="Above local trend high">
              ⚠
            </span>
          )}
        </div>
        <div>
          <span className="text-slate-500">PSF AG: </span>
          <span
            className={`font-mono font-semibold ${
              psfAg != null && localPsfAgHigh != null && psfAg > localPsfAgHigh
                ? "text-red-600"
                : "text-slate-900"
            }`}
          >
            {psfAg != null ? `$${fmtNum(psfAg)}` : "\u2014"}
          </span>
          {psfAg != null && localPsfAgHigh != null && psfAg > localPsfAgHigh && (
            <span className="ml-1 text-[10px] text-red-500" title="Above local trend high">
              ⚠
            </span>
          )}
        </div>
      </div>

      {/* Per-comp ARV table */}
      {perComp.length > 0 && (
        <div className="mt-4">
          <h3 className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Per-Comp ARV ({perComp.length})
          </h3>
          <div className="max-h-[260px] overflow-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="sticky top-0 bg-slate-50 text-[9px] uppercase tracking-wider text-slate-400">
                  <th className="px-1 py-0.5 text-left">Address</th>
                  <th className="px-1 py-0.5 text-right">Close</th>
                  <th className="px-1 py-0.5 text-right">Dist</th>
                  <th className="px-1 py-0.5 text-right">Net Price</th>
                  <th className="px-1 py-0.5 text-right">ARV Adj</th>
                  <th className="px-1 py-0.5 text-right">Weight</th>
                </tr>
              </thead>
              <tbody>
                {perComp.map((c: ArvPerCompDetail, i: number) => (
                  <tr
                    key={i}
                    className="border-t border-slate-100 hover:bg-slate-50"
                  >
                    <td
                      className="max-w-[180px] truncate px-1 py-0.5 text-slate-700"
                      title={c.address}
                    >
                      {c.address}
                    </td>
                    <td className="px-1 py-0.5 text-right text-slate-500">
                      {c.closeDateIso?.slice(5, 10) ?? "\u2014"}
                    </td>
                    <td className="px-1 py-0.5 text-right text-slate-500">
                      {fmtNum(c.distanceMiles, 2)}
                    </td>
                    <td className="px-1 py-0.5 text-right text-slate-700">
                      {fmt(c.netSalePrice)}
                    </td>
                    <td className="px-1 py-0.5 text-right font-semibold text-slate-900">
                      {fmt(c.arvTimeAdjusted)}
                    </td>
                    <td className="px-1 py-0.5 text-right font-mono text-slate-600">
                      {fmtNum(c.decayWeight, 3)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Comp summary stats */}
      <div className="mt-3 flex gap-4 text-[11px] text-slate-500">
        <span>
          Avg Price:{" "}
          <span className="font-mono text-slate-700">
            {fmt(data.compSummary.avgSelectedPrice)}
          </span>
        </span>
        <span>
          Avg PSF:{" "}
          <span className="font-mono text-slate-700">
            {data.compSummary.avgSelectedPsf != null
              ? `$${fmtNum(data.compSummary.avgSelectedPsf)}`
              : "\u2014"}
          </span>
        </span>
        <span>
          Avg Dist:{" "}
          <span className="font-mono text-slate-700">
            {data.compSummary.avgSelectedDist != null
              ? `${fmtNum(data.compSummary.avgSelectedDist, 2)} mi`
              : "\u2014"}
          </span>
        </span>
      </div>

      {/* Footer link */}
      {onEditManualArv && (
        <div className="mt-4 border-t border-slate-200 pt-3">
          <button
            type="button"
            onClick={() => {
              onClose();
              onEditManualArv();
            }}
            className="text-xs font-semibold text-blue-600 hover:text-blue-800"
          >
            Edit Manual ARV →
          </button>
        </div>
      )}
    </DetailModal>
  );
}

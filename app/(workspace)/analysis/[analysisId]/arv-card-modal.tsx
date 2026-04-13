// ArvCardModal — per-comp ARV with analyst adjustment inputs.
//
// Shows: 3-tier display (Auto/Selected/Final), effective ARV, PSF
// comparisons, per-comp table with expandable adjustment rows.
//
// Each comp row expands to show:
//   - Size adjustment (auto, read-only)
//   - Time adjustment (auto, read-only)
//   - 6 analyst adjustment inputs (view, layout, lot, garage, condition, other)
//   - Total analyst adjustment + final implied ARV
//
// Adjustments auto-persist via saveCompAdjustmentAction.

"use client";

import { useState, useCallback } from "react";
import { DetailModal } from "@/components/workstation/detail-modal";
import { fmt, fmtNum } from "@/lib/reports/format";
import type { WorkstationData, ArvPerCompDetail } from "@/lib/reports/types";
import {
  ANALYST_ADJ_CATEGORIES,
  emptyAdjustments,
  sumAdjustments,
  type CompAnalystAdjustments,
  type AnalystAdjCategoryKey,
} from "@/lib/screening/types";
import { saveCompAdjustmentAction } from "@/lib/auto-persist/save-comp-adjustment-action";

type ArvCardModalProps = {
  data: WorkstationData;
  liveDeal: { arv: number; arvManual: boolean };
  onClose: () => void;
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

  const effectiveArv = liveDeal.arv;
  const psfBldg = buildingSqft > 0 ? Math.round(effectiveArv / buildingSqft) : null;
  const psfAg = aboveGradeSqft > 0 ? Math.round(effectiveArv / aboveGradeSqft) : null;

  const localStats = data.trend?.detailJson?.localStats ?? null;
  const localPsfBldgHigh = localStats?.psfBuildingHigh ?? null;
  const localPsfAgHigh = localStats?.psfAboveGradeHigh ?? null;

  const activeTier: "auto" | "selected" | "final" =
    arv.final != null ? "final" : arv.selected != null ? "selected" : "auto";

  // Track which comp row is expanded
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

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
        </div>
      </div>

      {/* Per-comp ARV table with expandable adjustment rows */}
      {perComp.length > 0 && (
        <div className="mt-4">
          <h3 className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Per-Comp ARV ({perComp.length})
          </h3>
          <div className="max-h-[400px] overflow-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="sticky top-0 bg-slate-50 text-[9px] uppercase tracking-wider text-slate-400">
                  <th className="px-1 py-0.5 text-left">Address</th>
                  <th className="px-1 py-0.5 text-right">Close</th>
                  <th className="px-1 py-0.5 text-right">Dist</th>
                  <th className="px-1 py-0.5 text-right">Net Price</th>
                  <th className="px-1 py-0.5 text-right">Size Adj</th>
                  <th className="px-1 py-0.5 text-right">Time Adj</th>
                  <th className="px-1 py-0.5 text-right">Analyst Adj</th>
                  <th className="px-1 py-0.5 text-right">Implied ARV</th>
                  <th className="px-1 py-0.5 text-right">Weight</th>
                </tr>
              </thead>
              <tbody>
                {perComp.map((c: ArvPerCompDetail, i: number) => {
                  const isExpanded = expandedIdx === i;
                  const sizeAdj = c.arvBlended - c.netSalePrice;
                  const adjTotal = c.analystAdjustmentTotal ?? 0;
                  const hasAdj = adjTotal !== 0;

                  return (
                    <CompRow
                      key={i}
                      comp={c}
                      sizeAdj={sizeAdj}
                      isExpanded={isExpanded}
                      hasAdj={hasAdj}
                      onToggle={() => setExpandedIdx(isExpanded ? null : i)}
                    />
                  );
                })}
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

// ─────────────────────────────────────────────────────────────────────────────
// CompRow — expandable per-comp row with adjustment inputs
// ─────────────────────────────────────────────────────────────────────────────

function CompRow({
  comp,
  sizeAdj,
  isExpanded,
  hasAdj,
  onToggle,
}: {
  comp: ArvPerCompDetail;
  sizeAdj: number;
  isExpanded: boolean;
  hasAdj: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <tr
        className="cursor-pointer border-t border-slate-100 hover:bg-slate-50"
        onClick={onToggle}
      >
        <td
          className="max-w-[150px] truncate px-1 py-0.5 text-slate-700"
          title={comp.address}
        >
          <span className="mr-1 text-[9px] text-slate-400">
            {isExpanded ? "▼" : "▶"}
          </span>
          {comp.address}
        </td>
        <td className="px-1 py-0.5 text-right text-slate-500">
          {comp.closeDateIso?.slice(5, 10) ?? "\u2014"}
        </td>
        <td className="px-1 py-0.5 text-right text-slate-500">
          {fmtNum(comp.distanceMiles, 2)}
        </td>
        <td className="px-1 py-0.5 text-right text-slate-700">
          {fmt(comp.netSalePrice)}
        </td>
        <td className="px-1 py-0.5 text-right text-slate-500">
          {fmtSigned(sizeAdj)}
        </td>
        <td className="px-1 py-0.5 text-right text-slate-500">
          {fmtSigned(comp.timeAdjustment)}
        </td>
        <td
          className={`px-1 py-0.5 text-right ${
            hasAdj ? "font-semibold text-indigo-600" : "text-slate-400"
          }`}
        >
          {hasAdj ? fmtSigned(comp.analystAdjustmentTotal) : "\u2014"}
        </td>
        <td className="px-1 py-0.5 text-right font-semibold text-slate-900">
          {fmt(comp.arvFinal)}
        </td>
        <td className="px-1 py-0.5 text-right font-mono text-slate-600">
          {fmtNum(comp.decayWeight, 3)}
        </td>
      </tr>
      {isExpanded && (
        <tr>
          <td colSpan={9} className="bg-slate-50 px-2 py-2">
            <CompAdjustmentPanel comp={comp} />
          </td>
        </tr>
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CompAdjustmentPanel — the 6 adjustment inputs for a single comp
// ─────────────────────────────────────────────────────────────────────────────

function CompAdjustmentPanel({ comp }: { comp: ArvPerCompDetail }) {
  const [adj, setAdj] = useState<CompAnalystAdjustments>(
    comp.analystAdjustments ?? emptyAdjustments(),
  );
  const [saving, setSaving] = useState(false);
  const [otherNote, setOtherNote] = useState(comp.analystAdjustments?.other_note ?? "");

  const total = sumAdjustments(adj);
  const sizeAdj = comp.arvBlended - comp.netSalePrice;

  const handleChange = useCallback(
    (key: AnalystAdjCategoryKey, value: string) => {
      const num = value === "" || value === "-" ? 0 : parseInt(value.replace(/[,$]/g, ""), 10);
      setAdj((prev) => ({ ...prev, [key]: Number.isFinite(num) ? num : 0 }));
    },
    [],
  );

  const handleSave = useCallback(async () => {
    if (!comp.candidateId) return;
    setSaving(true);
    const toSave = { ...adj, other_note: otherNote.trim() || undefined };
    await saveCompAdjustmentAction({
      candidateId: comp.candidateId,
      adjustments: toSave,
    });
    setSaving(false);
  }, [comp.candidateId, adj, otherNote]);

  return (
    <div className="rounded border border-slate-200 bg-white p-3">
      {/* Auto adjustments (read-only) */}
      <div className="mb-3 grid grid-cols-2 gap-x-6 gap-y-1 text-[11px]">
        <div className="flex justify-between">
          <span className="text-slate-500">Size adjustment</span>
          <span className="font-mono text-slate-700">{fmtSigned(sizeAdj)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">Time adjustment</span>
          <span className="font-mono text-slate-700">
            {fmtSigned(comp.timeAdjustment)}
          </span>
        </div>
      </div>

      <div className="mb-2 border-t border-slate-200 pt-2">
        <span className="text-[9px] font-bold uppercase tracking-wider text-indigo-600">
          Analyst Adjustments
        </span>
      </div>

      {/* 6 adjustment inputs in a 2x3 grid */}
      <div className="grid grid-cols-2 gap-x-6 gap-y-2">
        {ANALYST_ADJ_CATEGORIES.map(({ key, label }) => (
          <div key={key} className="flex items-center justify-between gap-2">
            <label className="text-[10px] text-slate-600 whitespace-nowrap">
              {label}
            </label>
            <input
              type="text"
              value={adj[key] === 0 ? "" : String(adj[key])}
              onChange={(e) => handleChange(key, e.target.value)}
              placeholder="0"
              className="w-[80px] rounded border border-slate-300 bg-white px-1.5 py-0.5 text-right text-[11px] font-mono text-slate-900 placeholder:text-slate-300 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-200"
            />
          </div>
        ))}
      </div>

      {/* Other note (only visible when "Other" has a value) */}
      {adj.other !== 0 && (
        <div className="mt-2">
          <input
            type="text"
            value={otherNote}
            onChange={(e) => setOtherNote(e.target.value)}
            placeholder="Describe the 'Other' adjustment..."
            className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-[11px] text-slate-900 placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-200"
          />
        </div>
      )}

      {/* Total + save */}
      <div className="mt-3 flex items-center justify-between border-t border-slate-200 pt-2">
        <div className="text-[11px]">
          <span className="text-slate-500">Total analyst adjustment: </span>
          <span
            className={`font-mono font-semibold ${
              total !== 0 ? "text-indigo-700" : "text-slate-400"
            }`}
          >
            {fmtSigned(total)}
          </span>
          <span className="mx-2 text-slate-300">→</span>
          <span className="text-slate-500">Implied ARV: </span>
          <span className="font-mono font-semibold text-slate-900">
            {fmt(comp.arvTimeAdjusted + total)}
          </span>
        </div>
        {comp.candidateId && (
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="rounded bg-indigo-600 px-3 py-1 text-[10px] font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function fmtSigned(v: number): string {
  if (v === 0) return "$0";
  const abs = Math.abs(v).toLocaleString("en-US", { maximumFractionDigits: 0 });
  return v > 0 ? `+$${abs}` : `-$${abs}`;
}

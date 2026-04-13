// Phase 1 Step 3E.5.a/b — CompWorkspace extraction.
//
// The hero comp workspace — map (left ~380px) + comp table (right) +
// filter / sort controls — that lives in BOTH the screening modal AND
// the new Workstation in 3E. The deferred extraction from 3C Task 9
// per Decision 5.4 hybrid: at 3C time the screening modal had this
// JSX inline; this commit lifts it into a shared component so the new
// Workstation can render the same hero in 3E.5.c.
//
// Layout (per WORKSTATION_CARD_SPEC.md §4.1):
//
//   ┌──────────────────┐  ┌─────────────────────────────────────────┐
//   │                  │  │                                          │
//   │  COMP MAP        │  │  COMP TABLE                              │
//   │  (380×320)       │  │  - Subject row (sticky, red)             │
//   │                  │  │  - Sortable: Gap / ImpArv / Days / Bldg │
//   │  Legend          │  │  - Pick / Picked toggle per row          │
//   │  Add Comp by MLS#│  │  - 19 cols matching modal exactly        │
//   │  Expand Search   │  │                                          │
//   └──────────────────┘  └─────────────────────────────────────────┘
//
// Loading and empty states are handled inside this component so the
// consumer just renders <CompWorkspace .../> without branching on
// loading/data presence.
//
// Internal state:
//   - sort column + direction (gap, impArv, days, bldg)
//   - "Show Selected Only" filter toggle
//
// Props the parent owns:
//   - loading + data (the ScreeningCompData payload)
//   - mapPins (computed from data, including subject + candidates)
//   - liveDeal (the live ARV / gap-per-sqft from Quick Analysis recompute,
//     used for the subject row's ARV / Gap display)
//   - compStats (avg score, etc., used for the subject row's Score column)
//   - onToggleSelection callback (for the Pick/Picked button + map pin click)
//   - onReloadData callback (for AddCompByMls + ExpandSearchPanel completion)
//
// Per Decision 5.4 hybrid (3C plan), this component takes
// ScreeningCompData directly. 3E.5.c will resolve how the new
// Workstation provides this shape — either by extending the loader
// or by mapping WorkstationData at the call site.

"use client";

import { useState, useCallback } from "react";
import dynamic from "next/dynamic";
import type { MapPin } from "@/components/properties/comp-map";
import { ArvBreakdownTooltip } from "@/components/screening/arv-breakdown-tooltip";
import { AddCompByMls } from "@/components/workstation/add-comp-by-mls";
import { ExpandSearchPanel } from "@/components/workstation/expand-search-panel";
import type { ScreeningCompData } from "@/app/(workspace)/screening/actions";

const CompMap = dynamic(
  () => import("@/components/properties/comp-map").then((m) => m.CompMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[320px] w-[380px] items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-xs text-slate-400">
        Loading map...
      </div>
    ),
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Local helpers (private to CompWorkspace)
// ─────────────────────────────────────────────────────────────────────────────

function $f(v: number | null | undefined) {
  if (v == null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(v);
}

function fmtNum(v: number | null | undefined, d = 0) {
  if (v == null) return "—";
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  }).format(v);
}

type SortCol = "gap" | "impArv" | "days" | "bldg";
type SortDir = "asc" | "desc";

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

export type CompWorkspaceLiveDeal = {
  arv: number | null;
  gapPerSqft: number | null;
};

export type CompWorkspaceCompStats = {
  count: number;
  avgDist: number | null;
  avgScore: number | null;
};

type CompWorkspaceProps = {
  loading: boolean;
  data: ScreeningCompData | null;
  mapPins: MapPin[];
  liveDeal: CompWorkspaceLiveDeal | null;
  compStats: CompWorkspaceCompStats;
  /** Toggles a candidate's selected_yn. The parent owns the
   *  underlying state (it lives on the candidate row); this callback
   *  signals the user clicked Pick or Picked. */
  onToggleSelection: (
    candidateId: string,
    currentType: "selected" | "candidate",
  ) => void;
  /** Same intent as onToggleSelection but invoked from a map pin
   *  click. Modal aliases this to onToggleSelection; new Workstation
   *  will do the same. */
  onMapPinToggle: (
    pinId: string,
    currentType: "selected" | "candidate",
  ) => void;
  /** Reload comps after AddCompByMls / ExpandSearchPanel completion. */
  onReloadData: () => void;
};

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function CompWorkspace({
  loading,
  data,
  mapPins,
  liveDeal,
  compStats,
  onToggleSelection,
  onMapPinToggle,
  onReloadData,
}: CompWorkspaceProps) {
  const [showSelectedOnly, setShowSelectedOnly] = useState(false);
  const [sortCol, setSortCol] = useState<SortCol>("gap");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const toggleSort = useCallback((col: SortCol) => {
    setSortCol((current) => {
      if (current === col) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
        return current;
      }
      setSortDir("desc");
      return col;
    });
  }, []);

  if (loading) {
    return (
      <div className="flex h-[460px] items-center justify-center text-sm text-slate-400">
        Loading comparables...
      </div>
    );
  }

  if (!data || data.candidates.length === 0) {
    return (
      <div className="flex h-[460px] items-center justify-center text-sm text-slate-400">
        No comparable data available for this property.
      </div>
    );
  }

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Left: Map + legend + add/expand controls */}
      <div className="shrink-0 border-r border-slate-200 p-3">
        <CompMap
          pins={mapPins}
          height={320}
          className="!w-[380px]"
          subjectLat={data.subjectLat}
          subjectLng={data.subjectLng}
          onPinClick={onMapPinToggle}
        />
        <div className="mt-1.5 flex items-center gap-3 text-[10px] text-slate-400">
          <span className="flex items-center gap-1">
            <span
              className="inline-block h-3 w-3 rounded-full bg-red-600"
              style={{
                border: "2px solid #fff",
                boxShadow: "0 0 0 1.5px #dc2626",
              }}
            />
            Subject
          </span>
          <span className="flex items-center gap-1">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500"
              style={{
                border: "2px solid #fff",
                boxShadow: "0 0 0 1px #16a34a",
              }}
            />
            Picked
          </span>
          <span className="flex items-center gap-1">
            <span
              className="inline-block h-2 w-2 rounded-full bg-slate-400"
              style={{ border: "2px solid #16a34a" }}
            />
            <span className="text-slate-500">≥$60</span>
          </span>
          <span className="flex items-center gap-1">
            <span
              className="inline-block h-2 w-2 rounded-full bg-slate-400"
              style={{ border: "2px solid #ca8a04" }}
            />
            <span className="text-slate-500">≥$30</span>
          </span>
          <span className="flex items-center gap-1">
            <span
              className="inline-block h-2 w-2 rounded-full bg-slate-400"
              style={{ border: "2px solid #dc2626" }}
            />
            <span className="text-slate-500">&lt;$30</span>
          </span>
          <span className="ml-auto text-slate-300">gap/sqft</span>
        </div>
        {/* Add comp by MLS # */}
        {data.compSearchRunId && (
          <AddCompByMls
            compSearchRunId={data.compSearchRunId}
            subjectPropertyId={data.realPropertyId}
            onAdded={onReloadData}
          />
        )}
        {/* Expand Search */}
        {data.compSearchRunId && (
          <ExpandSearchPanel
            compSearchRunId={data.compSearchRunId}
            realPropertyId={data.realPropertyId}
            onComplete={onReloadData}
          />
        )}
      </div>

      {/* Right: Dense candidate table */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="flex items-center justify-between px-1 py-0.5">
          <div className="flex items-center gap-1">
            <CopyMlsButton
              label="Copy Selected"
              candidates={data.candidates}
              arvByCompListingId={data.arvByCompListingId}
              mlsNumber={data.mlsNumber ?? null}
              selectedOnly
            />
            <CopyMlsButton
              label="Copy All"
              candidates={data.candidates}
              arvByCompListingId={data.arvByCompListingId}
              mlsNumber={data.mlsNumber ?? null}
              selectedOnly={false}
            />
          </div>
          <button
            type="button"
            onClick={() => setShowSelectedOnly((v) => !v)}
            className={`rounded border px-2 py-0.5 text-[10px] font-semibold ${
              showSelectedOnly
                ? "border-emerald-300 bg-emerald-100 text-emerald-800"
                : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            {showSelectedOnly ? "Show All Comps" : "Show Selected Only"}
          </button>
        </div>
        <div className="flex-1 overflow-auto">
          <table className="w-full text-[11px]">
            <thead>
              <tr
                className="sticky top-0 z-20 bg-slate-50 text-[9px] uppercase tracking-wider text-slate-500"
                style={{ height: 22 }}
              >
                <th className="px-1 py-0.5 text-left" style={{ width: 42 }}></th>
                <th className="px-1 py-0.5 text-right">Dist</th>
                <th
                  className="px-1 py-0.5 text-left"
                  style={{ maxWidth: 140 }}
                >
                  Address
                </th>
                <th
                  className="px-1 py-0.5 text-left"
                  style={{ maxWidth: 110 }}
                >
                  Subdiv
                </th>
                <th className="px-1 py-0.5 text-right">Net Price</th>
                <th
                  className="cursor-pointer select-none px-1 py-0.5 text-right hover:text-slate-800"
                  onClick={() => toggleSort("impArv")}
                >
                  Imp ARV
                  {sortCol === "impArv"
                    ? sortDir === "desc"
                      ? " ▼"
                      : " ▲"
                    : ""}
                </th>
                <th
                  className="cursor-pointer select-none px-1 py-0.5 text-right hover:text-slate-800"
                  onClick={() => toggleSort("gap")}
                >
                  Gap
                  {sortCol === "gap"
                    ? sortDir === "desc"
                      ? " ▼"
                      : " ▲"
                    : ""}
                </th>
                <th
                  className="cursor-pointer select-none px-1 py-0.5 text-right hover:text-slate-800"
                  onClick={() => toggleSort("days")}
                >
                  Days
                  {sortCol === "days"
                    ? sortDir === "desc"
                      ? " ▼"
                      : " ▲"
                    : ""}
                </th>
                <th
                  className="px-1 py-0.5 text-left"
                  style={{ maxWidth: 56 }}
                >
                  Lvl
                </th>
                <th className="px-1 py-0.5 text-right">Year</th>
                <th
                  className="px-1 py-0.5 text-right"
                  style={{ width: 24 }}
                >
                  Bd
                </th>
                <th
                  className="px-1 py-0.5 text-right"
                  style={{ width: 24 }}
                >
                  Ba
                </th>
                <th
                  className="px-1 py-0.5 text-right"
                  style={{ width: 24 }}
                >
                  Gar
                </th>
                <th
                  className="cursor-pointer select-none px-1 py-0.5 text-right hover:text-slate-800"
                  onClick={() => toggleSort("bldg")}
                >
                  Bldg SF
                  {sortCol === "bldg"
                    ? sortDir === "desc"
                      ? " ▼"
                      : " ▲"
                    : ""}
                </th>
                <th className="px-1 py-0.5 text-right">Abv SF</th>
                <th className="px-1 py-0.5 text-right">Bsmt</th>
                <th className="px-1 py-0.5 text-right">BsFin</th>
                <th className="px-1 py-0.5 text-right">Lot</th>
                <th
                  className="px-1 py-0.5 text-right"
                  style={{ width: 34 }}
                >
                  Score
                </th>
              </tr>
            </thead>
            <tbody>
              {/* Subject property row — sticky below header */}
              <tr
                className="sticky z-20 border-b border-red-200 bg-red-50 font-semibold text-slate-900"
                style={{ top: 22 }}
              >
                <td className="px-1 py-0.5">
                  <span className="rounded bg-red-600 px-1 py-0.5 text-[8px] font-bold uppercase text-white">
                    Subject
                  </span>
                </td>
                <td className="px-1 py-0.5 text-right">—</td>
                <td
                  className="max-w-[140px] truncate px-1 py-0.5"
                  title={data.subjectAddress}
                >
                  {data.subjectAddress}
                </td>
                <td
                  className="max-w-[110px] truncate px-1 py-0.5"
                  title={data.subdivision ?? ""}
                >
                  {data.subdivision ?? "—"}
                </td>
                <td className="px-1 py-0.5 text-right">
                  {$f(data.subjectListPrice)}
                </td>
                <td className="px-1 py-0.5 text-right">
                  {liveDeal?.arv != null ? $f(liveDeal.arv) : "—"}
                </td>
                <td className="px-1 py-0.5 text-right">
                  {liveDeal?.gapPerSqft != null
                    ? `$${fmtNum(liveDeal.gapPerSqft)}`
                    : "—"}
                </td>
                <td className="px-1 py-0.5 text-right">—</td>
                <td className="max-w-[56px] truncate px-1 py-0.5">
                  {data.levelsRaw ?? "—"}
                </td>
                <td className="px-1 py-0.5 text-right">
                  {data.yearBuilt != null ? String(data.yearBuilt) : "—"}
                </td>
                <td className="px-1 py-0.5 text-right">
                  {data.bedsTotal ?? "—"}
                </td>
                <td className="px-1 py-0.5 text-right">
                  {data.bathsTotal != null ? fmtNum(data.bathsTotal) : "—"}
                </td>
                <td className="px-1 py-0.5 text-right">
                  {data.garageSpaces != null ? fmtNum(data.garageSpaces) : "—"}
                </td>
                <td className="px-1 py-0.5 text-right">
                  {fmtNum(data.subjectBuildingSqft)}
                </td>
                <td className="px-1 py-0.5 text-right">
                  {fmtNum(data.aboveGradeSqft)}
                </td>
                <td className="px-1 py-0.5 text-right">
                  {fmtNum(data.belowGradeTotalSqft)}
                </td>
                <td className="px-1 py-0.5 text-right">
                  {fmtNum(data.belowGradeFinishedSqft)}
                </td>
                <td className="px-1 py-0.5 text-right">
                  {fmtNum(data.lotSizeSqft)}
                </td>
                <td className="px-1 py-0.5 text-right">
                  {compStats.avgScore != null
                    ? fmtNum(compStats.avgScore, 1)
                    : "—"}
                </td>
              </tr>
              {(() => {
                const subjectSqftVal = data.subjectBuildingSqft ?? 0;
                const subjectListVal = data.subjectListPrice ?? 0;
                const filtered = data.candidates.filter(
                  (c) => !showSelectedOnly || c.selected_yn,
                );
                const withSortVals = filtered.map((c) => {
                  const m = c.metrics_json;
                  const netPrice =
                    (m.net_price as number) ??
                    (m.close_price as number) ??
                    null;
                  const arvDetail = c.comp_listing_row_id
                    ? data.arvByCompListingId[c.comp_listing_row_id] ?? null
                    : null;
                  const impliedArv = arvDetail?.arv ?? null;
                  const gapPerSqft =
                    netPrice != null && subjectSqftVal > 0 && subjectListVal > 0
                      ? Math.round((netPrice - subjectListVal) / subjectSqftVal)
                      : null;
                  return { c, m, netPrice, arvDetail, impliedArv, gapPerSqft };
                });
                const mult = sortDir === "desc" ? -1 : 1;
                withSortVals.sort((a, b) => {
                  let va: number | null = null,
                    vb: number | null = null;
                  if (sortCol === "gap") {
                    va = a.gapPerSqft;
                    vb = b.gapPerSqft;
                  } else if (sortCol === "impArv") {
                    va = a.impliedArv;
                    vb = b.impliedArv;
                  } else if (sortCol === "days") {
                    va = a.c.days_since_close;
                    vb = b.c.days_since_close;
                  } else if (sortCol === "bldg") {
                    va = (a.m.building_area_total_sqft as number) ?? null;
                    vb = (b.m.building_area_total_sqft as number) ?? null;
                  }
                  if (va == null && vb == null) return 0;
                  if (va == null) return 1;
                  if (vb == null) return -1;
                  return (va - vb) * mult;
                });
                return withSortVals.map(
                  ({ c, m, netPrice, arvDetail, impliedArv, gapPerSqft }) => {
                    const gapClass =
                      gapPerSqft != null && gapPerSqft >= 60
                        ? "text-emerald-600 font-semibold"
                        : gapPerSqft != null && gapPerSqft < 30
                          ? "text-red-600 font-semibold"
                          : "text-slate-700";
                    const days = c.days_since_close;
                    const daysClass =
                      days != null && days > 180
                        ? "text-red-600"
                        : days != null && days < 60
                          ? "text-emerald-600"
                          : "text-slate-700";
                    return (
                      <tr
                        key={c.id}
                        className={`border-t border-slate-100 ${
                          c.selected_yn
                            ? "bg-emerald-50/60"
                            : "hover:bg-slate-50"
                        }`}
                      >
                        <td className="px-1 py-0.5">
                          <button
                            type="button"
                            onClick={() =>
                              onToggleSelection(
                                c.id,
                                c.selected_yn ? "selected" : "candidate",
                              )
                            }
                            className={
                              c.selected_yn
                                ? "rounded border border-emerald-300 bg-emerald-100 px-1 py-0.5 text-[8px] font-bold uppercase text-emerald-800"
                                : "rounded border border-slate-300 bg-white px-1 py-0.5 text-[8px] font-bold uppercase text-slate-600 hover:bg-slate-50"
                            }
                          >
                            {c.selected_yn ? "Picked" : "Pick"}
                          </button>
                        </td>
                        <td
                          className={`px-1 py-0.5 text-right ${
                            c.distance_miles != null && c.distance_miles <= 0.2
                              ? "text-emerald-600 font-semibold"
                              : c.distance_miles != null &&
                                  c.distance_miles >= 0.6
                                ? "text-red-600 font-semibold"
                                : "text-slate-700"
                          }`}
                        >
                          {fmtNum(c.distance_miles, 2)}
                        </td>
                        <td
                          className={`max-w-[140px] truncate px-1 py-0.5 ${
                            c.selected_yn
                              ? "font-semibold text-slate-900"
                              : "text-slate-700"
                          }`}
                          title={String(m.address ?? "")}
                        >
                          {String(m.address ?? "—")}
                        </td>
                        <td
                          className="max-w-[110px] truncate px-1 py-0.5 text-slate-700"
                          title={String(m.subdivision_name ?? "")}
                        >
                          {String(m.subdivision_name ?? "—")}
                        </td>
                        <td className="px-1 py-0.5 text-right text-slate-700">
                          {$f(netPrice)}
                        </td>
                        <td className="relative px-1 py-0.5 text-right font-semibold text-slate-900">
                          {impliedArv != null ? $f(impliedArv) : "—"}
                          {arvDetail && <ArvBreakdownTooltip d={arvDetail} />}
                        </td>
                        <td className={`px-1 py-0.5 text-right ${gapClass}`}>
                          {gapPerSqft != null
                            ? `$${fmtNum(gapPerSqft)}`
                            : "—"}
                        </td>
                        <td
                          className={`px-1 py-0.5 text-right font-semibold ${daysClass}`}
                        >
                          {days ?? "—"}
                        </td>
                        <td
                          className="max-w-[56px] truncate px-1 py-0.5 text-slate-700"
                          title={String(m.level_class_standardized ?? "")}
                        >
                          {String(m.level_class_standardized ?? "—")}
                        </td>
                        <td className="px-1 py-0.5 text-right text-slate-700">
                          {m.year_built != null ? String(m.year_built) : "—"}
                        </td>
                        <td className="px-1 py-0.5 text-right text-slate-700">
                          {m.bedrooms_total != null
                            ? fmtNum(m.bedrooms_total as number)
                            : "—"}
                        </td>
                        <td className="px-1 py-0.5 text-right text-slate-700">
                          {m.bathrooms_total != null
                            ? fmtNum(m.bathrooms_total as number)
                            : "—"}
                        </td>
                        <td className="px-1 py-0.5 text-right text-slate-700">
                          {m.garage_spaces != null
                            ? fmtNum(m.garage_spaces as number)
                            : "—"}
                        </td>
                        <td className="px-1 py-0.5 text-right text-slate-700">
                          {fmtNum(m.building_area_total_sqft as number | null)}
                        </td>
                        <td className="px-1 py-0.5 text-right text-slate-700">
                          {fmtNum(
                            m.above_grade_finished_area_sqft as number | null,
                          )}
                        </td>
                        <td className="px-1 py-0.5 text-right text-slate-700">
                          {fmtNum(m.below_grade_total_sqft as number | null)}
                        </td>
                        <td className="px-1 py-0.5 text-right text-slate-700">
                          {fmtNum(
                            m.below_grade_finished_area_sqft as number | null,
                          )}
                        </td>
                        <td className="px-1 py-0.5 text-right text-slate-700">
                          {fmtNum(m.lot_size_sqft as number | null)}
                        </td>
                        <td className="px-1 py-0.5 text-right font-semibold text-slate-900">
                          {fmtNum(c.raw_score, 1)}
                        </td>
                      </tr>
                    );
                  },
                );
              })()}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CopyMlsButton — copies subject + comp MLS numbers to clipboard
// ─────────────────────────────────────────────────────────────────────────────

type CopyMlsButtonProps = {
  label: string;
  candidates: ScreeningCompData["candidates"];
  arvByCompListingId: ScreeningCompData["arvByCompListingId"];
  mlsNumber: string | null;
  selectedOnly: boolean;
};

function CopyMlsButton({
  label,
  candidates,
  arvByCompListingId,
  mlsNumber,
  selectedOnly,
}: CopyMlsButtonProps) {
  const [copied, setCopied] = useState(false);

  const pool = selectedOnly
    ? candidates.filter((c) => c.selected_yn)
    : candidates;

  const mlsNumbers = [
    ...(mlsNumber ? [mlsNumber] : []),
    ...pool
      .map((c) => ({
        mls: String(c.metrics_json.listing_id ?? ""),
        arv: c.comp_listing_row_id
          ? (arvByCompListingId[c.comp_listing_row_id]?.arv ?? 0)
          : 0,
      }))
      .filter((x) => x.mls)
      .sort((a, b) => b.arv - a.arv)
      .map((x) => x.mls),
  ];

  const handleCopy = useCallback(() => {
    if (mlsNumbers.length === 0) return;
    navigator.clipboard.writeText(mlsNumbers.join(", "));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [mlsNumbers]);

  return (
    <button
      type="button"
      onClick={handleCopy}
      disabled={mlsNumbers.length === 0}
      className="rounded border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40"
    >
      {copied ? "Copied!" : `${label} (${mlsNumbers.length})`}
    </button>
  );
}

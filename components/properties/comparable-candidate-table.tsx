"use client";

import { Fragment, useMemo, useState, type ReactNode } from "react";
import { toggleComparableCandidateSelectionAction } from "@/app/(workspace)/deals/actions";

export type ComparableCandidateViewRow = {
  id: string;
  comp_listing_row_id: string | null;
  listing_id: string | null;
  distance_miles: number | null;
  days_since_close: number | null;
  sqft_delta_pct: number | null;
  raw_score: number | null;
  selected_yn: boolean;
  metrics_json: Record<string, unknown> | null;
  score_breakdown_json?: Record<string, unknown> | null;
  address: string;
  closeDate: unknown;
  closePrice: unknown;
  gla: unknown;
  ppsf: unknown;
  listingId: string | null;
};

export type ComparableSubjectSummary = {
  listingId: string | null;
  address: string;
  listDate: string | null;
  listPrice: number | null;
  gla: number | null;
  yearBuilt: number | null;
  levelClass: string | null;
  aboveGradeFinishedSqft: number | null;
  belowGradeTotalSqft: number | null;
  belowGradeFinishedSqft: number | null;
  lotSizeSqft: number | null;
  bedroomsTotal: number | null;
  bathroomsTotal: number | null;
  garageSpaces: number | null;
  ppsf: number | null;
};

type ComparableCandidateTableProps = {
  propertyId: string;
  analysisId: string;
  candidateViewRows: ComparableCandidateViewRow[];
  subjectSummary: ComparableSubjectSummary | null;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SCORE_COMPONENT_LABELS: Record<string, string> = {
  distance: "Distance",
  recency: "Recency",
  size: "Size",
  lotSize: "Lot Size",
  year: "Year Built",
  beds: "Beds",
  baths: "Baths",
  form: "Building Form",
  level: "Level",
  condition: "Condition",
};

const SCORE_COMPONENT_ORDER = [
  "distance", "recency", "size", "lotSize", "year",
  "beds", "baths", "form", "level", "condition",
] as const;

function mv(metrics: Record<string, unknown> | null | undefined, ...keys: string[]) {
  if (!metrics) return null;
  for (const key of keys) {
    const v = metrics[key];
    if (v !== null && v !== undefined && v !== "") return v;
  }
  return null;
}

function toNum(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number(value.replace(/[$,]/g, "").trim());
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function $f(v: unknown) {
  const n = toNum(v);
  if (n === null) return "—";
  return "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function fmtNum(v: unknown, d = 0) {
  const n = toNum(v);
  if (n === null) return "—";
  return n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
}

function fmtSmart(v: unknown) {
  const n = toNum(v);
  if (n === null) return "—";
  return n.toLocaleString("en-US", {
    minimumFractionDigits: Number.isInteger(n) ? 0 : 1,
    maximumFractionDigits: Number.isInteger(n) ? 0 : 1,
  });
}

function readBreakdownComponent(
  sb: Record<string, unknown> | null | undefined,
  key: string,
) {
  const comps = sb?.components;
  if (!comps || typeof comps !== "object") return null;
  const v = (comps as Record<string, unknown>)[key];
  if (!v || typeof v !== "object") return null;
  return v as Record<string, unknown>;
}

function DetailCell({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-2 py-1.5">
      <div className="text-[10px] uppercase tracking-[0.14em] text-slate-500">{label}</div>
      <div className="mt-0.5 text-xs font-semibold text-slate-900">{value}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sort types
// ---------------------------------------------------------------------------

type SortCol = "gap" | "impArv" | "days" | "bldg";
type SortDir = "asc" | "desc";

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ComparableCandidateTable({
  propertyId,
  analysisId,
  candidateViewRows,
  subjectSummary,
}: ComparableCandidateTableProps) {
  const [expandedCandidateId, setExpandedCandidateId] = useState<string | null>(null);
  const [sortCol, setSortCol] = useState<SortCol>("gap");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [showSelectedOnly, setShowSelectedOnly] = useState(false);

  const toggleSort = (col: SortCol) => {
    if (sortCol === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortCol(col); setSortDir("desc"); }
  };

  const sortArrow = (col: SortCol) =>
    sortCol === col ? (sortDir === "desc" ? " ▼" : " ▲") : "";

  const subjectListPrice = subjectSummary?.listPrice ?? 0;
  const subjectSqft = subjectSummary?.gla ?? 0;

  // Build enriched rows with computed fields
  const enrichedRows = useMemo(() => {
    const filtered = candidateViewRows.filter((c) => !showSelectedOnly || c.selected_yn);

    const rows = filtered.map((c) => {
      const m = c.metrics_json ?? {};
      const netPrice = toNum(mv(m, "net_price")) ?? toNum(mv(m, "close_price")) ?? null;
      const gapPerSqft =
        netPrice != null && subjectSqft > 0 && subjectListPrice > 0
          ? Math.round((netPrice - subjectListPrice) / subjectSqft)
          : null;
      const bldgSf = toNum(mv(m, "building_area_total_sqft"));

      return { c, m, netPrice, gapPerSqft, bldgSf };
    });

    const mult = sortDir === "desc" ? -1 : 1;
    rows.sort((a, b) => {
      let va: number | null = null, vb: number | null = null;
      if (sortCol === "gap") { va = a.gapPerSqft; vb = b.gapPerSqft; }
      else if (sortCol === "impArv") { va = null; vb = null; } // Imp ARV not available here
      else if (sortCol === "days") { va = a.c.days_since_close; vb = b.c.days_since_close; }
      else if (sortCol === "bldg") { va = a.bldgSf; vb = b.bldgSf; }
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      return (va - vb) * mult;
    });

    return rows;
  }, [candidateViewRows, showSelectedOnly, sortCol, sortDir, subjectListPrice, subjectSqft]);

  return (
    <div className="dw-card-tight space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
            Candidate List
          </div>
          <div className="mt-1 text-xs text-slate-600">
            {candidateViewRows.length} candidate{candidateViewRows.length === 1 ? "" : "s"}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setShowSelectedOnly((v) => !v)}
          className={`rounded border px-2 py-0.5 text-[10px] font-semibold ${showSelectedOnly ? "border-emerald-300 bg-emerald-100 text-emerald-800" : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"}`}
        >
          {showSelectedOnly ? "Show All Comps" : "Show Selected Only"}
        </button>
      </div>

      <div className="dw-table-wrap max-h-[560px] overflow-auto">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="sticky top-0 z-20 bg-slate-50 text-[9px] uppercase tracking-wider text-slate-500" style={{ height: 22 }}>
              <th className="px-1 py-0.5 text-left" style={{ width: 42 }}></th>
              <th className="px-1 py-0.5 text-right">Dist</th>
              <th className="px-1 py-0.5 text-left" style={{ maxWidth: 140 }}>Address</th>
              <th className="px-1 py-0.5 text-left" style={{ maxWidth: 110 }}>Subdiv</th>
              <th className="px-1 py-0.5 text-right">Net Price</th>
              <th className="cursor-pointer select-none px-1 py-0.5 text-right hover:text-slate-800" onClick={() => toggleSort("impArv")}>Imp ARV{sortArrow("impArv")}</th>
              <th className="cursor-pointer select-none px-1 py-0.5 text-right hover:text-slate-800" onClick={() => toggleSort("gap")}>Gap{sortArrow("gap")}</th>
              <th className="cursor-pointer select-none px-1 py-0.5 text-right hover:text-slate-800" onClick={() => toggleSort("days")}>Days{sortArrow("days")}</th>
              <th className="px-1 py-0.5 text-left" style={{ maxWidth: 56 }}>Lvl</th>
              <th className="px-1 py-0.5 text-right">Year</th>
              <th className="px-1 py-0.5 text-right" style={{ width: 24 }}>Bd</th>
              <th className="px-1 py-0.5 text-right" style={{ width: 24 }}>Ba</th>
              <th className="px-1 py-0.5 text-right" style={{ width: 24 }}>Gar</th>
              <th className="cursor-pointer select-none px-1 py-0.5 text-right hover:text-slate-800" onClick={() => toggleSort("bldg")}>Bldg SF{sortArrow("bldg")}</th>
              <th className="px-1 py-0.5 text-right">Abv SF</th>
              <th className="px-1 py-0.5 text-right">Bsmt</th>
              <th className="px-1 py-0.5 text-right">BsFin</th>
              <th className="px-1 py-0.5 text-right">Lot</th>
              <th className="px-1 py-0.5 text-right" style={{ width: 34 }}>Score</th>
              <th className="px-1 py-0.5 text-right" style={{ width: 34 }}></th>
            </tr>
          </thead>

          <tbody>
            {/* Subject row — sticky below header */}
            {subjectSummary && (
              <tr className="sticky z-20 border-b border-red-200 bg-red-50 font-semibold text-slate-900" style={{ top: 22 }}>
                <td className="px-1 py-0.5">
                  <span className="rounded bg-red-600 px-1 py-0.5 text-[8px] font-bold uppercase text-white">Subject</span>
                </td>
                <td className="px-1 py-0.5 text-right">—</td>
                <td className="max-w-[140px] truncate px-1 py-0.5" title={subjectSummary.address}>
                  {subjectSummary.address}
                </td>
                <td className="px-1 py-0.5">—</td>
                <td className="px-1 py-0.5 text-right">{$f(subjectSummary.listPrice)}</td>
                <td className="px-1 py-0.5 text-right">—</td>
                <td className="px-1 py-0.5 text-right">—</td>
                <td className="px-1 py-0.5 text-right">—</td>
                <td className="max-w-[56px] truncate px-1 py-0.5">{subjectSummary.levelClass ?? "—"}</td>
                <td className="px-1 py-0.5 text-right">{subjectSummary.yearBuilt != null ? String(subjectSummary.yearBuilt) : "—"}</td>
                <td className="px-1 py-0.5 text-right">{subjectSummary.bedroomsTotal ?? "—"}</td>
                <td className="px-1 py-0.5 text-right">{subjectSummary.bathroomsTotal != null ? fmtNum(subjectSummary.bathroomsTotal) : "—"}</td>
                <td className="px-1 py-0.5 text-right">{subjectSummary.garageSpaces != null ? fmtNum(subjectSummary.garageSpaces) : "—"}</td>
                <td className="px-1 py-0.5 text-right">{fmtNum(subjectSummary.gla)}</td>
                <td className="px-1 py-0.5 text-right">{fmtNum(subjectSummary.aboveGradeFinishedSqft)}</td>
                <td className="px-1 py-0.5 text-right">{fmtNum(subjectSummary.belowGradeTotalSqft)}</td>
                <td className="px-1 py-0.5 text-right">{fmtNum(subjectSummary.belowGradeFinishedSqft)}</td>
                <td className="px-1 py-0.5 text-right">{fmtNum(subjectSummary.lotSizeSqft)}</td>
                <td className="px-1 py-0.5 text-right">—</td>
                <td className="px-1 py-0.5"></td>
              </tr>
            )}

            {enrichedRows.length > 0 ? (
              enrichedRows.map(({ c, m, netPrice, gapPerSqft }) => {
                const isExpanded = expandedCandidateId === c.id;
                const days = c.days_since_close;

                const distClass =
                  c.distance_miles != null && c.distance_miles <= 0.2
                    ? "text-emerald-600 font-semibold"
                    : c.distance_miles != null && c.distance_miles >= 0.6
                      ? "text-red-600 font-semibold"
                      : "text-slate-700";

                const gapClass =
                  gapPerSqft != null && gapPerSqft >= 60
                    ? "text-emerald-600 font-semibold"
                    : gapPerSqft != null && gapPerSqft < 30
                      ? "text-red-600 font-semibold"
                      : "text-slate-700";

                const daysClass =
                  days != null && days > 180
                    ? "text-red-600"
                    : days != null && days < 60
                      ? "text-emerald-600"
                      : "text-slate-700";

                const scoreBreakdown = c.score_breakdown_json ?? null;

                return (
                  <Fragment key={c.id}>
                    <tr className={`border-t border-slate-100 ${c.selected_yn ? "bg-emerald-50/60" : "hover:bg-slate-50"}`}>
                      <td className="px-1 py-0.5">
                        <form action={toggleComparableCandidateSelectionAction}>
                          <input type="hidden" name="candidate_id" value={c.id} />
                          <input type="hidden" name="property_id" value={propertyId} />
                          <input type="hidden" name="analysis_id" value={analysisId} />
                          <input type="hidden" name="next_selected" value={c.selected_yn ? "false" : "true"} />
                          <button
                            type="submit"
                            className={
                              c.selected_yn
                                ? "rounded border border-emerald-300 bg-emerald-100 px-1 py-0.5 text-[8px] font-bold uppercase text-emerald-800"
                                : "rounded border border-slate-300 bg-white px-1 py-0.5 text-[8px] font-bold uppercase text-slate-600 hover:bg-slate-50"
                            }
                          >
                            {c.selected_yn ? "Picked" : "Pick"}
                          </button>
                        </form>
                      </td>
                      <td className={`px-1 py-0.5 text-right ${distClass}`}>
                        {fmtNum(c.distance_miles, 2)}
                      </td>
                      <td
                        className={`max-w-[140px] truncate px-1 py-0.5 ${c.selected_yn ? "font-semibold text-slate-900" : "text-slate-700"}`}
                        title={c.address}
                      >
                        {c.address}
                      </td>
                      <td className="max-w-[110px] truncate px-1 py-0.5 text-slate-700" title={String(mv(m, "subdivision_name") ?? "")}>
                        {String(mv(m, "subdivision_name") ?? "—")}
                      </td>
                      <td className="px-1 py-0.5 text-right text-slate-700">{$f(netPrice)}</td>
                      <td className="px-1 py-0.5 text-right font-semibold text-slate-900">—</td>
                      <td className={`px-1 py-0.5 text-right ${gapClass}`}>
                        {gapPerSqft != null ? `$${fmtNum(gapPerSqft)}` : "—"}
                      </td>
                      <td className={`px-1 py-0.5 text-right font-semibold ${daysClass}`}>{days ?? "—"}</td>
                      <td className="max-w-[56px] truncate px-1 py-0.5 text-slate-700" title={String(mv(m, "level_class_standardized") ?? "")}>
                        {String(mv(m, "level_class_standardized") ?? "—")}
                      </td>
                      <td className="px-1 py-0.5 text-right text-slate-700">
                        {m.year_built != null ? String(m.year_built) : "—"}
                      </td>
                      <td className="px-1 py-0.5 text-right text-slate-700">{m.bedrooms_total != null ? fmtNum(m.bedrooms_total as number) : "—"}</td>
                      <td className="px-1 py-0.5 text-right text-slate-700">{m.bathrooms_total != null ? fmtNum(m.bathrooms_total as number) : "—"}</td>
                      <td className="px-1 py-0.5 text-right text-slate-700">{m.garage_spaces != null ? fmtNum(m.garage_spaces as number) : "—"}</td>
                      <td className="px-1 py-0.5 text-right text-slate-700">{fmtNum(m.building_area_total_sqft as number | null)}</td>
                      <td className="px-1 py-0.5 text-right text-slate-700">{fmtNum(m.above_grade_finished_area_sqft as number | null)}</td>
                      <td className="px-1 py-0.5 text-right text-slate-700">{fmtNum(m.below_grade_total_sqft as number | null)}</td>
                      <td className="px-1 py-0.5 text-right text-slate-700">{fmtNum(m.below_grade_finished_area_sqft as number | null)}</td>
                      <td className="px-1 py-0.5 text-right text-slate-700">{fmtNum(m.lot_size_sqft as number | null)}</td>
                      <td className="px-1 py-0.5 text-right font-semibold text-slate-900">{fmtNum(c.raw_score, 1)}</td>
                      <td className="px-1 py-0.5 text-right">
                        <button
                          type="button"
                          className="rounded border border-slate-300 bg-white px-1 py-0.5 text-[8px] font-bold uppercase text-slate-600 hover:bg-slate-50"
                          onClick={() =>
                            setExpandedCandidateId((cur) => cur === c.id ? null : c.id)
                          }
                        >
                          {isExpanded ? "Hide" : "Why"}
                        </button>
                      </td>
                    </tr>

                    {isExpanded && (
                      <tr>
                        <td colSpan={20} className="bg-slate-50 px-3 py-3">
                          <div className="grid gap-3 xl:grid-cols-2">
                            <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-3">
                              <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Candidate Metrics</div>
                              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                                <DetailCell label="Days Since Close" value={fmtNum(c.days_since_close)} />
                                <DetailCell label="Sq Ft Delta %" value={c.sqft_delta_pct != null ? `${fmtNum(c.sqft_delta_pct, 1)}%` : "—"} />
                                <DetailCell label="Level Class" value={String(mv(m, "level_class_standardized") ?? "—")} />
                                <DetailCell label="Levels Raw" value={String(mv(m, "levels_raw") ?? "—")} />
                                <DetailCell label="Condition" value={String(mv(m, "property_condition_source") ?? "—")} />
                                <DetailCell label="Raw Score" value={fmtNum(c.raw_score, 1)} />
                              </div>
                            </div>

                            <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-3">
                              <div className="flex items-center justify-between gap-2">
                                <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Score Breakdown</div>
                                <div className="text-[11px] text-slate-500">
                                  Weight total {fmtNum(scoreBreakdown?.totalWeight, 2)}
                                </div>
                              </div>
                              <div className="grid gap-2">
                                {SCORE_COMPONENT_ORDER.map((key) => {
                                  const comp = readBreakdownComponent(scoreBreakdown, key);
                                  const used = comp?.used === true;
                                  return (
                                    <div
                                      key={key}
                                      className="grid grid-cols-[minmax(0,1fr)_72px_72px_72px] items-center gap-2 rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
                                    >
                                      <div>
                                        <div className="font-semibold text-slate-900">{SCORE_COMPONENT_LABELS[key] ?? key}</div>
                                        <div className="text-[11px] text-slate-500">{used ? "Used in score" : "Not used"}</div>
                                      </div>
                                      <div>
                                        <div className="text-[10px] uppercase tracking-[0.12em] text-slate-500">Weight</div>
                                        <div className="font-semibold text-slate-900">{fmtNum(comp?.weight, 2)}</div>
                                      </div>
                                      <div>
                                        <div className="text-[10px] uppercase tracking-[0.12em] text-slate-500">Score</div>
                                        <div className="font-semibold text-slate-900">{fmtNum(comp?.score, 1)}</div>
                                      </div>
                                      <div>
                                        <div className="text-[10px] uppercase tracking-[0.12em] text-slate-500">Raw</div>
                                        <div className="font-semibold text-slate-900">{fmtNum(comp?.rawScore, 1)}</div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })
            ) : (
              <tr>
                <td colSpan={20} className="px-2 py-4 text-center text-slate-500">
                  {showSelectedOnly
                    ? "No selected comps. Switch to Show All Comps."
                    : "Comparable candidate list will appear here after a comp search is run."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

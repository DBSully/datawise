"use client";

import { useState } from "react";
import Link from "next/link";
import { ScreeningCompModal } from "./screening-comp-modal";
import { RowActionPopover } from "./row-action-popover";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type QueueResultRow = {
  id: string;
  real_property_id: string;
  screening_batch_id: string;
  is_prime_candidate: boolean;
  subject_address: string;
  subject_city: string;
  subject_property_type: string | null;
  subject_list_price: number | null;
  mls_status: string | null;
  mls_major_change_type: string | null;
  listing_contract_date: string | null;
  arv_aggregate: number | null;
  trend_annual_rate: number | null;
  trend_raw_rate: number | null;
  trend_confidence: string | null;
  trend_detail_json: Record<string, unknown> | null;
  spread: number | null;
  est_gap_per_sqft: number | null;
  arv_comp_count: number | null;
  rehab_total: number | null;
  hold_total: number | null;
  max_offer: number | null;
  offer_pct: number | null;
  promoted_analysis_id: string | null;
  comp_search_run_id: string | null;
  review_action: string | null;
  has_active_analysis: boolean | null;
  active_analysis_id: string | null;
  active_lifecycle_stage: string | null;
  active_interest_level: string | null;
  active_analysis_is_mine: boolean | null;
  active_analysis_owner_name: string | null;
  has_newer_screening_than_analysis: boolean | null;

  // Step 2b — pill + Why Now data. Optional so consumers that don't
  // enrich keep compiling. Missing values render as dim pills / empty
  // Why Now cell.
  screening_run_count?: number;
  analyzed_updated_at?: string | null;
  share_count?: number;
  latest_share_at?: string | null;
  next_showing_at?: string | null;
  next_showing_status?: string | null;
  open_offer_amount?: number | null;
  open_offer_status?: string | null;
  open_offer_deadline?: string | null;
  recent_event?: {
    event_type: string;
    before_value: unknown;
    after_value: unknown;
    detected_at: string;
  } | null;

  // Step 3 — extra MLS dates (UC / Close) fetched from mls_listings.
  uc_date?: string | null;
  close_date?: string | null;

  // Step 4 — single-pill stage model + Won/Lost signal for closed deals.
  active_disposition?: string | null;
  has_accepted_offer?: boolean;

  // Focus-view physical columns (property_physical + DOM from mls_listings).
  // Only rendered when the parent sets showPhysicalColumns=true.
  beds_total?: number | null;
  baths_total?: number | null;
  building_sqft?: number | null;
  year_built?: number | null;
  dom?: number | null;
};

type QueueResultsTableProps = {
  results: QueueResultRow[];
  showPhysicalColumns?: boolean;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCurrency(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatNumber(value: number | null | undefined, decimals = 0) {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

function formatPercent(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";
  return `${(value * 100).toFixed(1)}%`;
}

function formatShortPrice(value: number | null | undefined): string | null {
  if (value == null) return null;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(value % 1_000_000 === 0 ? 0 : 2)}M`;
  if (value >= 1_000) return `$${Math.round(value / 1_000)}k`;
  return `$${Math.round(value)}`;
}

function formatShortDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function formatDaysAgo(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  const deltaMs = Date.now() - then;
  if (deltaMs < 0) return null;
  const mins = Math.round(deltaMs / 60_000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours}h`;
  const days = Math.round(hours / 24);
  return `${days}d`;
}

function classifyDirection(rate: number): string {
  if (rate >= 0.05) return "strong_appreciation";
  if (rate >= 0.02) return "appreciating";
  if (rate >= -0.02) return "flat";
  if (rate >= -0.05) return "softening";
  if (rate >= -0.10) return "declining";
  return "sharp_decline";
}

function trendColor(rate: number, detailJson: Record<string, unknown> | null): string {
  const direction = (detailJson?.direction as string) ?? classifyDirection(rate);
  switch (direction) {
    case "strong_appreciation": return "bg-emerald-100 text-emerald-800";
    case "appreciating": return "bg-emerald-50 text-emerald-700";
    case "flat": return "bg-slate-100 text-slate-600";
    case "softening": return "bg-amber-100 text-amber-800";
    case "declining": return "bg-red-100 text-red-700";
    case "sharp_decline": return "bg-red-200 text-red-800";
    default: return "bg-slate-100 text-slate-600";
  }
}

// ---------------------------------------------------------------------------
// Pill primitive + per-pill renderers
// ---------------------------------------------------------------------------

type PillColor = "slate" | "red" | "orange" | "blue" | "purple" | "amber" | "emerald" | "dim";

const PILL_COLORS: Record<PillColor, string> = {
  slate:   "bg-slate-200 text-slate-700",
  red:     "bg-red-100 text-red-800",
  orange:  "bg-orange-100 text-orange-800",
  blue:    "bg-blue-100 text-blue-800",
  purple:  "bg-purple-100 text-purple-800",
  amber:   "bg-amber-100 text-amber-800",
  emerald: "bg-emerald-100 text-emerald-800",
  dim:     "bg-slate-50 text-slate-400",
};

function Pill({
  color,
  label,
  title,
  href,
  onClick,
  widthPx,
}: {
  color: PillColor;
  label: string;
  title: string;
  href?: string;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  widthPx: number;
}) {
  // Fixed-width pills keep the cluster column-aligned across rows so the
  // analyst's eye can scan a single pill column top-to-bottom.
  const className = `inline-flex items-center justify-center rounded px-1 py-0.5 text-[10px] font-semibold leading-none overflow-hidden whitespace-nowrap ${PILL_COLORS[color]}`;
  const style = { width: `${widthPx}px` };
  if (onClick) {
    return (
      <button
        type="button"
        title={title}
        onClick={onClick}
        className={`${className} hover:opacity-80`}
        style={style}
      >
        {label}
      </button>
    );
  }
  if (href) {
    return (
      <Link href={href} title={title} className={`${className} hover:opacity-80`} style={style}>
        {label}
      </Link>
    );
  }
  return <span title={title} className={className} style={style}>{label}</span>;
}

// Per-pill fixed widths (px) — tuned for the longest realistic label.
// Single stage pill must fit "Ofr $450k" / "Passed" / "By Alice"; shared
// pill is optional alongside.
const PILL_W = {
  stage: 82,
  shared: 36,
} as const;

// Single-pill stage model — one primary pill per row showing the furthest
// stage reached. The click popover (step 4 follow-up) will surface
// stage-appropriate actions. A secondary SharedPill renders alongside
// when any shares exist, independent of the stage.
//
// Progression (furthest wins):
//   Foreign active → "By Alice"
//   Closed + accepted offer → "Won"
//   Closed + no accepted offer → "Lost"
//   Open offer → "Ofr $450k"
//   Upcoming showing → "Sho 4/28"
//   Manual analysis done → "Anl"
//   Caller active analysis only → interest-level label (Hot / Warm / Curious)
//   Passed (no active analysis) → "Passed"
//   Screened only → "Scr" (or "Scr·N" for re-screened)
//
// Rule (iii): an active analysis overrides a stale "passed" marker — the
// analyst un-passed the property by promoting it, so forward motion wins.

type StagePill = {
  label: string;
  color: PillColor;
  title: string;
  href?: string;
};

function resolveStagePill(row: QueueResultRow): StagePill {
  const callerActive = row.active_analysis_is_mine === true && row.active_analysis_id != null;
  const foreignActive = row.active_analysis_is_mine === false;

  // Foreign analysis — another analyst owns this property.
  if (foreignActive) {
    const firstName = row.active_analysis_owner_name?.split(" ")[0] ?? "other";
    return {
      label: `By ${firstName}`,
      color: "slate",
      title: `Another analyst (${row.active_analysis_owner_name ?? "unknown"}) is working on this property`,
    };
  }

  // Caller's active or closed analysis.
  if (callerActive) {
    const href = `/analysis/${row.active_analysis_id}`;

    // Closed → Won / Lost.
    if (row.active_disposition === "closed") {
      if (row.has_accepted_offer) {
        return { label: "Won", color: "emerald", title: "Closed — offer accepted", href };
      }
      return { label: "Lost", color: "red", title: "Closed — no accepted offer", href };
    }

    // Open offer takes precedence over showing (later in funnel).
    if (row.open_offer_amount != null || row.open_offer_status) {
      const amount = formatShortPrice(row.open_offer_amount);
      const label = amount ? `Ofr ${amount}` : "Offer";
      const deadline = row.open_offer_deadline
        ? ` · deadline ${formatShortDate(row.open_offer_deadline)}`
        : "";
      return {
        label,
        color: "amber",
        title: `Open offer${row.open_offer_status ? ` (${row.open_offer_status})` : ""}${deadline}`,
        href,
      };
    }

    // Upcoming showing.
    if (row.next_showing_at) {
      const short = formatShortDate(row.next_showing_at);
      return {
        label: `Sho ${short ?? ""}`,
        color: "amber",
        title: `Showing scheduled${row.next_showing_status ? ` (${row.next_showing_status})` : ""} · ${row.next_showing_at.slice(0, 16).replace("T", " ")}`,
        href,
      };
    }

    // Manual analysis done.
    if (row.analyzed_updated_at) {
      const ago = formatDaysAgo(row.analyzed_updated_at);
      return {
        label: "Anl",
        color: "blue",
        title: `Manual analysis last updated ${ago ?? row.analyzed_updated_at}`,
        href,
      };
    }

    // Watch List — color by interest.
    const level = (row.active_interest_level ?? "warm").toLowerCase();
    const colorByLevel: Record<string, PillColor> = { hot: "red", warm: "orange", curious: "slate" };
    const labelByLevel: Record<string, string> = { hot: "Hot", warm: "Warm", curious: "Curious" };
    return {
      label: labelByLevel[level] ?? "Warm",
      color: colorByLevel[level] ?? "orange",
      title: `Watch list · ${level}${row.has_newer_screening_than_analysis ? " · newer screening available" : ""}`,
      href,
    };
  }

  // No active analysis. Falls back to promoted_analysis_id for the
  // batch-detail view which didn't enrich (defensive fallback — should
  // rarely fire on /pipeline proper).
  if (row.promoted_analysis_id) {
    return {
      label: "WL",
      color: "orange",
      title: "On watch list",
      href: `/analysis/${row.promoted_analysis_id}`,
    };
  }

  // Passed — only wins when there's no forward motion (rule iii).
  if (row.review_action === "passed") {
    return { label: "Passed", color: "dim", title: "Passed on this property" };
  }

  // Just screened.
  const count = row.screening_run_count ?? 0;
  return {
    label: count > 1 ? `Scr·${count}` : "Scr",
    color: "slate",
    title: count > 1 ? `Screened ${count}× — latest run shown` : "Screened",
  };
}

function StagePillCell({
  row,
  onOpen,
}: {
  row: QueueResultRow;
  onOpen: (row: QueueResultRow, rect: DOMRect) => void;
}) {
  const pill = resolveStagePill(row);
  // Foreign-active rows are read-only; keep those as plain (non-clickable)
  // so analysts don't accidentally open a popover with no relevant actions.
  const isForeign = row.active_analysis_is_mine === false;
  const handleClick = isForeign
    ? undefined
    : (e: React.MouseEvent<HTMLButtonElement>) => {
        onOpen(row, e.currentTarget.getBoundingClientRect());
      };
  return (
    <Pill
      color={pill.color}
      label={pill.label}
      title={`${pill.title} — click for actions`}
      onClick={handleClick}
      href={isForeign ? pill.href : undefined}
      widthPx={PILL_W.stage}
    />
  );
}

function SharedPill({ row }: { row: QueueResultRow }) {
  const count = row.share_count ?? 0;
  if (count <= 0) return null;
  const ago = formatDaysAgo(row.latest_share_at);
  return (
    <Pill
      color="purple"
      label={count > 1 ? `Shr·${count}` : "Shr"}
      title={`${count} share${count > 1 ? "s" : ""}${ago ? ` · latest ${ago} ago` : ""}`}
      widthPx={PILL_W.shared}
    />
  );
}

// ---------------------------------------------------------------------------
// Why Now cell
// ---------------------------------------------------------------------------

function extractScalar(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  return null;
}

function renderWhyNow(row: QueueResultRow) {
  const e = row.recent_event;
  if (!e) {
    return <span className="text-[10px] text-slate-300">—</span>;
  }
  const ago = formatDaysAgo(e.detected_at);
  const before = extractScalar(e.before_value);
  const after = extractScalar(e.after_value);
  let main = "";
  let tone = "text-slate-600";
  switch (e.event_type) {
    case "price_change": {
      const b = before ? formatShortPrice(Number(before)) : "—";
      const a = after ? formatShortPrice(Number(after)) : "—";
      main = `Price ${b} → ${a}`;
      if (before && after && Number(after) < Number(before)) tone = "text-emerald-700";
      else if (before && after && Number(after) > Number(before)) tone = "text-red-600";
      break;
    }
    case "status_change":
      main = `${before ?? "—"} → ${after ?? "—"}`;
      tone = "text-blue-700";
      break;
    case "change_type":
      main = after ?? "Change";
      tone = "text-slate-600";
      break;
    case "uc_date":
      main = after ? `UC ${formatShortDate(after)}` : "UC cleared";
      tone = "text-amber-700";
      break;
    case "close_date":
      main = after ? `Closed ${formatShortDate(after)}` : "Close cleared";
      tone = "text-slate-600";
      break;
    case "close_price": {
      const a = after ? formatShortPrice(Number(after)) : "—";
      main = `Closed ${a}`;
      tone = "text-slate-600";
      break;
    }
    default:
      main = e.event_type;
  }
  return (
    <div className={`text-[10px] leading-tight ${tone}`} title={`${e.event_type} · ${e.detected_at}`}>
      <div className="truncate font-medium">{main}</div>
      {ago && <div className="text-[9px] text-slate-400">{ago} ago</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function QueueResultsTable({
  results,
  showPhysicalColumns = false,
}: QueueResultsTableProps) {
  const [activeResultId, setActiveResultId] = useState<string | null>(null);
  const activeRow = activeResultId
    ? results.find((r) => r.id === activeResultId) ?? null
    : null;

  const [popoverState, setPopoverState] = useState<{
    rowId: string;
    anchorRect: DOMRect;
  } | null>(null);
  const popoverRow = popoverState
    ? results.find((r) => r.id === popoverState.rowId) ?? null
    : null;

  const openPopover = (row: QueueResultRow, rect: DOMRect) => {
    setPopoverState({ rowId: row.id, anchorRect: rect });
  };

  return (
    <>
      <div className="dw-table-wrap">
        <table
          className={`dw-table-dense ${showPhysicalColumns ? "min-w-[1780px]" : "min-w-[1500px]"}`}
          style={{ tableLayout: "fixed" }}
        >
          <colgroup>
            {/* Map  Pills  WhyNow  Star */}
            <col style={{ width: 38 }} />
            <col style={{ width: 130 }} />
            <col style={{ width: 140 }} />
            <col style={{ width: 20 }} />
            {/* Address  City  Type  ChangeType */}
            <col style={{ width: 220 }} />
            <col style={{ width: 100 }} />
            <col style={{ width: 68 }} />
            {showPhysicalColumns && (
              <>
                {/* DOM  Beds  Baths  BldgSF  YrBuilt */}
                <col style={{ width: 46 }} />
                <col style={{ width: 40 }} />
                <col style={{ width: 40 }} />
                <col style={{ width: 64 }} />
                <col style={{ width: 54 }} />
              </>
            )}
            <col style={{ width: 105 }} />
            {/* ListDate  UCDate  CloseDate */}
            <col style={{ width: 78 }} />
            <col style={{ width: 78 }} />
            <col style={{ width: 78 }} />
            {/* ListPrice  ARV  Trend  Gap  Comps */}
            <col style={{ width: 76 }} />
            <col style={{ width: 76 }} />
            <col style={{ width: 58 }} />
            <col style={{ width: 58 }} />
            <col style={{ width: 44 }} />
            {/* MaxOffer  Offer%  Detail */}
            <col style={{ width: 76 }} />
            <col style={{ width: 50 }} />
            <col style={{ width: 40 }} />
          </colgroup>
          <thead>
            <tr>
              <th className="text-left"></th>
              <th className="text-left">Status</th>
              <th className="text-left">Why Now</th>
              <th className="text-left"></th>
              <th className="text-left">Address</th>
              <th className="text-left">City</th>
              <th className="text-left">Type</th>
              {showPhysicalColumns && (
                <>
                  <th className="text-right">DOM</th>
                  <th className="text-right">Bd</th>
                  <th className="text-right">Ba</th>
                  <th className="text-right">Bldg SF</th>
                  <th className="text-right">Yr</th>
                </>
              )}
              <th className="text-left">Change Type</th>
              <th className="text-left">List Date</th>
              <th className="text-left">UC Date</th>
              <th className="text-left">Close Date</th>
              <th className="text-right">List Price</th>
              <th className="text-right">ARV</th>
              <th className="text-right">Trend</th>
              <th className="text-right">Gap (List)</th>
              <th className="text-right">Comps</th>
              <th className="text-right">Max Offer</th>
              <th className="text-right">Offer%</th>
              <th className="text-left"></th>
            </tr>
          </thead>
          <tbody>
            {results.length === 0 ? (
              <tr>
                <td
                  colSpan={showPhysicalColumns ? 24 : 19}
                  className="py-8 text-center text-sm text-slate-400"
                >
                  No screened properties found.
                </td>
              </tr>
            ) : (
              results.map((r) => (
                <tr
                  key={r.id}
                  className={r.is_prime_candidate ? "bg-emerald-50/60" : ""}
                >
                  <td className="text-center">
                    {r.comp_search_run_id ? (
                      <button
                        type="button"
                        onClick={() => setActiveResultId(r.id)}
                        className="rounded border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700 hover:bg-blue-100"
                        title="Quick Comps — view map and pick comps"
                      >
                        Map
                      </button>
                    ) : null}
                  </td>
                  <td>
                    <div className="flex items-center gap-1">
                      <StagePillCell row={r} onOpen={openPopover} />
                      <SharedPill row={r} />
                    </div>
                  </td>
                  <td>{renderWhyNow(r)}</td>
                  <td className="text-center">
                    {r.is_prime_candidate ? (
                      <span title="Prime Candidate" className="text-emerald-600">★</span>
                    ) : null}
                  </td>
                  <td className="truncate font-medium">
                    <Link
                      href={`/screening/${r.screening_batch_id}/${r.id}`}
                      className="text-blue-700 hover:underline"
                    >
                      {r.subject_address}
                    </Link>
                  </td>
                  <td className="truncate text-slate-500">{r.subject_city}</td>
                  <td className="text-slate-500">{r.subject_property_type ?? "—"}</td>
                  {showPhysicalColumns && (
                    <>
                      <td className="text-right text-slate-600">
                        {r.dom != null ? r.dom : "—"}
                      </td>
                      <td className="text-right text-slate-600">
                        {r.beds_total != null ? r.beds_total : "—"}
                      </td>
                      <td className="text-right text-slate-600">
                        {r.baths_total != null ? r.baths_total : "—"}
                      </td>
                      <td className="text-right text-slate-600">
                        {r.building_sqft != null
                          ? formatNumber(r.building_sqft)
                          : "—"}
                      </td>
                      <td className="text-right text-slate-600">
                        {r.year_built != null ? r.year_built : "—"}
                      </td>
                    </>
                  )}
                  <td className="truncate text-slate-600">{r.mls_major_change_type ?? r.mls_status ?? "—"}</td>
                  <td className="text-slate-500">
                    {r.listing_contract_date ? r.listing_contract_date.slice(0, 10) : "—"}
                  </td>
                  <td className="text-slate-500">
                    {r.uc_date ? r.uc_date.slice(0, 10) : "—"}
                  </td>
                  <td className="text-slate-500">
                    {r.close_date ? r.close_date.slice(0, 10) : "—"}
                  </td>
                  <td className="text-right">{formatCurrency(r.subject_list_price)}</td>
                  <td className="text-right font-medium">{formatCurrency(r.arv_aggregate)}</td>
                  <td className="text-right">
                    {(() => {
                      const displayRate = r.trend_raw_rate ?? r.trend_annual_rate;
                      if (displayRate == null) return <span className="text-slate-300">—</span>;
                      return (
                        <span
                          className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${trendColor(displayRate, r.trend_detail_json)}`}
                        >
                          {displayRate >= 0 ? "+" : ""}
                          {(displayRate * 100).toFixed(1)}%
                        </span>
                      );
                    })()}
                  </td>
                  <td
                    className={`text-right font-semibold ${
                      (r.est_gap_per_sqft ?? 0) >= 60 ? "text-emerald-700" : ""
                    }`}
                  >
                    {r.est_gap_per_sqft !== null
                      ? `$${formatNumber(r.est_gap_per_sqft)}`
                      : "—"}
                  </td>
                  <td className="text-right text-slate-500">
                    {formatNumber(r.arv_comp_count)}
                  </td>
                  <td className="text-right font-medium">
                    {formatCurrency(r.max_offer)}
                  </td>
                  <td className="text-right text-slate-500">
                    {formatPercent(r.offer_pct)}
                  </td>
                  <td>
                    <Link
                      href={`/screening/${r.screening_batch_id}/${r.id}`}
                      className="text-xs text-blue-600 hover:underline"
                    >
                      Detail
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Quick Comps Modal */}
      {activeResultId && activeRow && (
        <ScreeningCompModal
          resultId={activeResultId}
          batchId={activeRow.screening_batch_id}
          promotedAnalysisId={activeRow.active_analysis_id ?? activeRow.promoted_analysis_id}
          realPropertyId={activeRow.real_property_id}
          onClose={() => setActiveResultId(null)}
        />
      )}

      {/* Row-action popover (click stage pill) */}
      {popoverState && popoverRow && (
        <RowActionPopover
          row={popoverRow}
          anchorRect={popoverState.anchorRect}
          onClose={() => setPopoverState(null)}
        />
      )}
    </>
  );
}

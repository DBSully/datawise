"use client";

import { useState } from "react";
import Link from "next/link";
import { ScreeningCompModal } from "./screening-comp-modal";

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
};

type QueueResultsTableProps = {
  results: QueueResultRow[];
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

type PillColor = "slate" | "red" | "orange" | "blue" | "purple" | "amber" | "dim";

const PILL_COLORS: Record<PillColor, string> = {
  slate:  "bg-slate-200 text-slate-700",
  red:    "bg-red-100 text-red-800",
  orange: "bg-orange-100 text-orange-800",
  blue:   "bg-blue-100 text-blue-800",
  purple: "bg-purple-100 text-purple-800",
  amber:  "bg-amber-100 text-amber-800",
  dim:    "bg-slate-50 text-slate-400",
};

function Pill({
  color,
  label,
  title,
  href,
  widthPx,
}: {
  color: PillColor;
  label: string;
  title: string;
  href?: string;
  widthPx: number;
}) {
  // Fixed-width pills keep the cluster column-aligned across rows so the
  // analyst's eye can scan a single pill column top-to-bottom.
  const className = `inline-flex items-center justify-center rounded px-1 py-0.5 text-[10px] font-semibold leading-none overflow-hidden whitespace-nowrap ${PILL_COLORS[color]}`;
  const style = { width: `${widthPx}px` };
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
const PILL_W = {
  screened: 36,
  watch: 56,
  analyzed: 32,
  shared: 36,
  action: 76,
} as const;

function ScreenedPill({ count }: { count: number }) {
  if (count <= 0) {
    return <Pill color="dim" label="Scr" title="Never screened" widthPx={PILL_W.screened} />;
  }
  return (
    <Pill
      color="slate"
      label={count > 1 ? `Scr·${count}` : "Scr"}
      title={count > 1 ? `Screened ${count}× — latest run shown` : "Screened once"}
      widthPx={PILL_W.screened}
    />
  );
}

function WatchListPill({ row }: { row: QueueResultRow }) {
  // Active-analysis is the primary signal (enriched in /pipeline page.tsx).
  // Batch-detail page doesn't enrich, so fall back to promoted_analysis_id
  // on the screening_results row itself.
  const analysisId = row.active_analysis_id ?? row.promoted_analysis_id;
  if (!analysisId) {
    return <Pill color="dim" label="WL" title="Not on watch list" widthPx={PILL_W.watch} />;
  }
  const level = (row.active_interest_level ?? "warm").toLowerCase();
  const colorByLevel: Record<string, PillColor> =
    { hot: "red", warm: "orange", curious: "slate" };
  const isMine = row.active_analysis_is_mine ?? true;
  const color = isMine ? (colorByLevel[level] ?? "orange") : "slate";
  const label = isMine
    ? level.charAt(0).toUpperCase() + level.slice(1)
    : `By ${row.active_analysis_owner_name?.split(" ")[0] ?? "other"}`;
  const title = isMine
    ? `Watch list · ${level}${row.has_newer_screening_than_analysis ? " · newer screening available" : ""}`
    : `Another analyst (${row.active_analysis_owner_name ?? "unknown"}) is working on this property`;
  const href = isMine ? `/analysis/${analysisId}` : undefined;
  return <Pill color={color} label={label} title={title} href={href} widthPx={PILL_W.watch} />;
}

function AnalyzedPill({ row }: { row: QueueResultRow }) {
  if (!row.active_analysis_is_mine) {
    return <Pill color="dim" label="Anl" title="No analysis of your own yet" widthPx={PILL_W.analyzed} />;
  }
  if (!row.analyzed_updated_at) {
    return <Pill color="dim" label="Anl" title="Promoted but no manual analysis yet" widthPx={PILL_W.analyzed} />;
  }
  const ago = formatDaysAgo(row.analyzed_updated_at);
  return (
    <Pill
      color="blue"
      label="Anl"
      title={`Manual analysis last updated ${ago ?? row.analyzed_updated_at}`}
      widthPx={PILL_W.analyzed}
    />
  );
}

function SharedPill({ row }: { row: QueueResultRow }) {
  const count = row.share_count ?? 0;
  if (count <= 0) {
    return <Pill color="dim" label="Shr" title="Not shared" widthPx={PILL_W.shared} />;
  }
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

function ActionPill({ row }: { row: QueueResultRow }) {
  // Priority: open offer > upcoming showing > nothing.
  if (row.open_offer_amount != null || row.open_offer_status) {
    const amount = formatShortPrice(row.open_offer_amount);
    const label = amount ? `Ofr ${amount}` : "Offer";
    const deadline = row.open_offer_deadline
      ? ` · deadline ${formatShortDate(row.open_offer_deadline)}`
      : "";
    return (
      <Pill
        color="amber"
        label={label}
        title={`Open offer${row.open_offer_status ? ` (${row.open_offer_status})` : ""}${deadline}`}
        widthPx={PILL_W.action}
      />
    );
  }
  if (row.next_showing_at) {
    const short = formatShortDate(row.next_showing_at);
    return (
      <Pill
        color="amber"
        label={`Sho ${short ?? ""}`}
        title={`Showing scheduled${row.next_showing_status ? ` (${row.next_showing_status})` : ""} · ${row.next_showing_at.slice(0, 16).replace("T", " ")}`}
        widthPx={PILL_W.action}
      />
    );
  }
  return <Pill color="dim" label="Act" title="No pending actions" widthPx={PILL_W.action} />;
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

export function QueueResultsTable({ results }: QueueResultsTableProps) {
  const [activeResultId, setActiveResultId] = useState<string | null>(null);
  const activeRow = activeResultId
    ? results.find((r) => r.id === activeResultId) ?? null
    : null;

  return (
    <>
      <div className="dw-table-wrap">
        <table className="dw-table-compact min-w-[1600px]" style={{ tableLayout: "fixed" }}>
          <colgroup>
            {/* Map  Pills  WhyNow  Star */}
            <col style={{ width: 38 }} />
            <col style={{ width: 240 }} />
            <col style={{ width: 140 }} />
            <col style={{ width: 20 }} />
            {/* Address  City  Type  ChangeType */}
            <col style={{ width: 220 }} />
            <col style={{ width: 100 }} />
            <col style={{ width: 68 }} />
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
                <td colSpan={19} className="py-8 text-center text-sm text-slate-400">
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
                      <ScreenedPill count={r.screening_run_count ?? 0} />
                      <WatchListPill row={r} />
                      <AnalyzedPill row={r} />
                      <SharedPill row={r} />
                      <ActionPill row={r} />
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
    </>
  );
}

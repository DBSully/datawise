"use client";

import { useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  updateInterestLevelAction,
  updateShowingStatusAction,
  updateWatchListNoteAction,
  passFromWatchListAction,
  moveToPipelineAction,
} from "./actions";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type WatchListRow = {
  analysis_id: string;
  real_property_id: string;
  interest_level: string | null;
  showing_status: string | null;
  watch_list_note: string | null;
  unparsed_address: string;
  city: string;
  lot_size_sqft: number | null;
  subdivision_name: string | null;
  mls_major_change_type: string | null;
  listing_contract_date: string | null;
  mls_status: string | null;
  list_price: number | null;
  dom: number | null;
  level_class_standardized: string | null;
  year_built: number | null;
  bedrooms_total: number | null;
  bathrooms_total: number | null;
  garage_spaces: number | null;
  building_area_total_sqft: number | null;
  above_grade_finished_area_sqft: number | null;
  below_grade_total_sqft: number | null;
  below_grade_finished_area_sqft: number | null;
  arv_aggregate: number | null;
  max_offer: number | null;
  comps_selected: number | null;
  comps_total: number | null;
  offer_pct: number | null;
  gap_per_sqft: number | null;
  target_profit: number | null;
  is_prime_candidate: boolean | null;
  unread_event_count: number | null;
  latest_unread_event_type: string | null;
  latest_unread_event_before: unknown;
  latest_unread_event_after: unknown;
  latest_unread_event_at: string | null;
};

type SortKey =
  | "dom"
  | "comps_selected"
  | "list_price"
  | "arv_aggregate"
  | "max_offer"
  | "offer_pct"
  | "gap_per_sqft"
  | "target_profit"
  | "year_built"
  | "bedrooms_total"
  | "bathrooms_total"
  | "garage_spaces"
  | "building_area_total_sqft"
  | "above_grade_finished_area_sqft"
  | "below_grade_total_sqft"
  | "below_grade_finished_area_sqft"
  | "lot_size_sqft";

type SortDir = "asc" | "desc";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function $f(v: number | null | undefined) {
  if (v == null) return "—";
  return "$" + v.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function fmtNum(v: number | null | undefined, d = 0) {
  if (v == null) return "—";
  return v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
}

function fmtPct(v: number | null | undefined) {
  if (v == null) return "—";
  return `${(v * 100).toFixed(1)}%`;
}

function fmtDate(v: string | null | undefined) {
  if (!v) return "—";
  // Parse "YYYY-MM-DD" directly to avoid timezone shifts; format as mm/dd/yy.
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  if (!m) return "—";
  return `${m[2]}/${m[3]}/${m[1].slice(2)}`;
}

// Compact pill for the watchlist address cell — surfaces unread
// property_events. Click through (the adjacent address link) marks them
// seen via the workstation page's events_last_seen_at update.
function UnreadEventPill({
  count,
  eventType,
  before,
  after,
  at,
}: {
  count: number;
  eventType: string | null;
  before: unknown;
  after: unknown;
  at: string | null;
}) {
  const summary = summarizeEvent(eventType, before, after);
  const relTime = at ? fmtRelative(at) : "";
  const tooltip = at
    ? `${summary} · ${new Date(at).toLocaleString()}${count > 1 ? ` (+${count - 1} more)` : ""}`
    : summary;
  return (
    <span
      className="inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-semibold text-amber-800"
      title={tooltip}
    >
      <span>{summary}</span>
      {relTime && <span className="opacity-60">· {relTime}</span>}
      {count > 1 && <span className="opacity-80">+{count - 1}</span>}
    </span>
  );
}

function summarizeEvent(eventType: string | null, before: unknown, after: unknown): string {
  if (!eventType) return "New activity";
  const fmtMoney = (v: unknown) => {
    if (v === null || v === undefined) return "null";
    const n = typeof v === "number" ? v : Number(v);
    if (!Number.isFinite(n)) return "—";
    return "$" + Math.round(n).toLocaleString();
  };
  switch (eventType) {
    case "price_change": {
      const b = Number(before);
      const a = Number(after);
      if (Number.isFinite(b) && Number.isFinite(a)) {
        const d = Math.round(a - b);
        const sign = d >= 0 ? "+" : "";
        return `Price ${sign}${fmtMoney(d)}`;
      }
      return `Price → ${fmtMoney(after)}`;
    }
    case "close_price":
      return `Closed ${fmtMoney(after)}`;
    case "status_change":
      return `Status → ${String(after ?? "—")}`;
    case "change_type":
      return `${String(after ?? "—")}`;
    case "uc_date":
      return `UC date`;
    case "close_date":
      return `Close date`;
    default:
      return eventType;
  }
}

function fmtRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffMin = Math.round((now - then) / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d`;
  return `${Math.round(diffDay / 30)}mo`;
}

const INTEREST_CONFIG: Record<string, { icon: string; label: string; sortOrder: number }> = {
  hot:   { icon: "🔴", label: "Hot",   sortOrder: 0 },
  warm:  { icon: "🟡", label: "Warm",  sortOrder: 1 },
  watch: { icon: "🟢", label: "Watch", sortOrder: 2 },
  new:   { icon: "⚪", label: "New",   sortOrder: 3 },
};

const SHOWING_OPTIONS = [
  { value: "", label: "No contact" },
  { value: "agent_contacted", label: "Agent contacted" },
  { value: "showing_scheduled", label: "Showing scheduled" },
  { value: "showing_complete", label: "Showing complete" },
];

const PASS_REASONS = [
  "Comps too weak",
  "Rehab too heavy",
  "Price too high",
  "Location concern",
  "Lost to another buyer",
  "Other",
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function WatchListTable({ rows }: { rows: WatchListRow[] }) {
  const router = useRouter();
  const [editingNote, setEditingNote] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");
  const [passingId, setPassingId] = useState<string | null>(null);
  const [passReason, setPassReason] = useState("");
  const [busy, setBusy] = useState(false);

  // ----- Sort state ----------------------------------------------------------
  const [sortKey, setSortKey] = useState<SortKey>("offer_pct");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const toggleSort = useCallback(
    (k: SortKey) => {
      if (sortKey === k) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      } else {
        setSortKey(k);
        setSortDir("desc");
      }
    },
    [sortKey],
  );

  // ----- Filter state --------------------------------------------------------
  const [filterCity, setFilterCity] = useState<string>("");
  const [filterLevelClass, setFilterLevelClass] = useState<string>("");
  const [filterChangeType, setFilterChangeType] = useState<string>("");
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [filterInterest, setFilterInterest] = useState<string>("");
  const [minOfferPct, setMinOfferPct] = useState<string>("");
  const [minGap, setMinGap] = useState<string>("");

  // Distinct dropdown options derived from data
  const cityOptions = useMemo(
    () => Array.from(new Set(rows.map((r) => r.city).filter(Boolean))).sort(),
    [rows],
  );
  const levelClassOptions = useMemo(
    () =>
      Array.from(new Set(rows.map((r) => r.level_class_standardized).filter(Boolean))).sort() as string[],
    [rows],
  );
  const changeTypeOptions = useMemo(
    () =>
      Array.from(new Set(rows.map((r) => r.mls_major_change_type).filter(Boolean))).sort() as string[],
    [rows],
  );

  // ----- Filtered + sorted view ---------------------------------------------
  const visibleRows = useMemo(() => {
    const minOfferPctNum = minOfferPct === "" ? null : Number(minOfferPct) / 100;
    const minGapNum = minGap === "" ? null : Number(minGap);

    let out = rows.filter((r) => {
      if (filterCity && r.city !== filterCity) return false;
      if (filterLevelClass && r.level_class_standardized !== filterLevelClass) return false;
      if (filterChangeType && r.mls_major_change_type !== filterChangeType) return false;
      if (filterStatus && (r.showing_status ?? "") !== filterStatus) return false;
      if (filterInterest && (r.interest_level ?? "new") !== filterInterest) return false;
      if (minOfferPctNum != null && (r.offer_pct ?? -Infinity) < minOfferPctNum) return false;
      if (minGapNum != null && (r.gap_per_sqft ?? -Infinity) < minGapNum) return false;
      return true;
    });

    out = [...out].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      const an = av == null ? -Infinity : (av as number);
      const bn = bv == null ? -Infinity : (bv as number);
      if (an === bn) return 0;
      return sortDir === "asc" ? an - bn : bn - an;
    });

    return out;
  }, [
    rows,
    filterCity,
    filterLevelClass,
    filterChangeType,
    filterStatus,
    filterInterest,
    minOfferPct,
    minGap,
    sortKey,
    sortDir,
  ]);

  const clearFilters = () => {
    setFilterCity("");
    setFilterLevelClass("");
    setFilterChangeType("");
    setFilterStatus("");
    setFilterInterest("");
    setMinOfferPct("");
    setMinGap("");
  };

  // ----- Mutation handlers --------------------------------------------------
  const handleInterestChange = useCallback(
    async (analysisId: string, level: string) => {
      const fd = new FormData();
      fd.set("analysis_id", analysisId);
      fd.set("interest_level", level);
      await updateInterestLevelAction(fd);
      router.refresh();
    },
    [router],
  );

  const handleStatusChange = useCallback(
    async (analysisId: string, status: string) => {
      const fd = new FormData();
      fd.set("analysis_id", analysisId);
      fd.set("showing_status", status);
      await updateShowingStatusAction(fd);
      router.refresh();
    },
    [router],
  );

  const handleNoteSave = useCallback(
    async (analysisId: string) => {
      const fd = new FormData();
      fd.set("analysis_id", analysisId);
      fd.set("watch_list_note", noteText);
      await updateWatchListNoteAction(fd);
      setEditingNote(null);
      router.refresh();
    },
    [noteText, router],
  );

  const handlePass = useCallback(
    async (analysisId: string) => {
      if (!passReason) return;
      setBusy(true);
      const fd = new FormData();
      fd.set("analysis_id", analysisId);
      fd.set("pass_reason", passReason);
      await passFromWatchListAction(fd);
      setPassingId(null);
      setPassReason("");
      setBusy(false);
      router.refresh();
    },
    [passReason, router],
  );

  const handleMoveToPipeline = useCallback(
    async (analysisId: string) => {
      const fd = new FormData();
      fd.set("analysis_id", analysisId);
      await moveToPipelineAction(fd);
      router.refresh();
    },
    [router],
  );

  if (rows.length === 0) {
    return (
      <div className="dw-card py-12 text-center">
        <p className="text-sm text-slate-500">
          No deals on the Watch List yet. Promote properties from the{" "}
          <Link href="/screening" className="text-blue-600 hover:underline">
            Screening Queue
          </Link>{" "}
          to get started.
        </p>
      </div>
    );
  }

  // ----- Sort indicator helper ----------------------------------------------
  const sortIndicator = (k: SortKey) =>
    sortKey === k ? (sortDir === "asc" ? " ▲" : " ▼") : "";

  // ----- Sortable header component ------------------------------------------
  const SortTh = ({
    k,
    label,
    align = "right",
    width,
  }: {
    k: SortKey;
    label: string;
    align?: "left" | "right" | "center";
    width?: number;
  }) => (
    <th
      className={`sticky top-0 z-20 cursor-pointer select-none bg-slate-50 px-1 py-0.5 hover:text-slate-800 ${
        align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left"
      }`}
      onClick={() => toggleSort(k)}
      title="Click to sort"
      style={width ? { width, minWidth: width } : undefined}
    >
      {label}
      {sortIndicator(k)}
    </th>
  );

  // Frozen-column widths (used for both header and body sticky offsets)
  const W_ACTIONS = 130;
  const W_INTEREST = 32;
  const W_ADDRESS = 180;
  const LEFT_INTEREST = W_ACTIONS;
  const LEFT_ADDRESS = W_ACTIONS + W_INTEREST;

  // Reusable styles
  const frozenHeader = "sticky top-0 z-30 bg-slate-50";
  const frozenBody = "sticky z-10 bg-white group-hover:bg-slate-50";
  const stickyHeader = "sticky top-0 z-20 bg-slate-50";

  return (
    <>
      {/* Filter bar */}
      <div className="mb-2 flex flex-wrap items-center gap-1.5 rounded border border-slate-200 bg-slate-50 px-2 py-1.5 text-[11px]">
        <span className="font-semibold uppercase tracking-wider text-slate-500">Filter:</span>

        <select
          value={filterCity}
          onChange={(e) => setFilterCity(e.target.value)}
          className="rounded border border-slate-200 bg-white px-1.5 py-0.5"
        >
          <option value="">All cities</option>
          {cityOptions.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>

        <select
          value={filterLevelClass}
          onChange={(e) => setFilterLevelClass(e.target.value)}
          className="rounded border border-slate-200 bg-white px-1.5 py-0.5"
        >
          <option value="">All level class</option>
          {levelClassOptions.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>

        <select
          value={filterChangeType}
          onChange={(e) => setFilterChangeType(e.target.value)}
          className="rounded border border-slate-200 bg-white px-1.5 py-0.5"
        >
          <option value="">All change types</option>
          {changeTypeOptions.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>

        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="rounded border border-slate-200 bg-white px-1.5 py-0.5"
        >
          <option value="">All statuses</option>
          {SHOWING_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        <select
          value={filterInterest}
          onChange={(e) => setFilterInterest(e.target.value)}
          className="rounded border border-slate-200 bg-white px-1.5 py-0.5"
        >
          <option value="">All interest</option>
          <option value="hot">🔴 Hot</option>
          <option value="warm">🟡 Warm</option>
          <option value="watch">🟢 Watch</option>
          <option value="new">⚪ New</option>
        </select>

        <label className="flex items-center gap-1">
          <span className="text-slate-500">Min Offer %</span>
          <input
            type="number"
            value={minOfferPct}
            onChange={(e) => setMinOfferPct(e.target.value)}
            placeholder="0"
            className="w-14 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-right"
          />
        </label>

        <label className="flex items-center gap-1">
          <span className="text-slate-500">Min Gap $/sf</span>
          <input
            type="number"
            value={minGap}
            onChange={(e) => setMinGap(e.target.value)}
            placeholder="0"
            className="w-14 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-right"
          />
        </label>

        <button
          type="button"
          onClick={clearFilters}
          className="ml-auto rounded border border-slate-300 bg-white px-2 py-0.5 text-slate-600 hover:bg-slate-100"
        >
          Clear
        </button>

        <span className="text-slate-500">
          {visibleRows.length} of {rows.length}
        </span>
      </div>

      {/* Table */}
      <div className="dw-table-wrap overflow-x-auto">
        <table className="w-full border-collapse text-[11px]">
          <thead>
            <tr className="text-[9px] uppercase tracking-wider text-slate-500" style={{ height: 22 }}>
              <th
                className={`${frozenHeader} px-1 py-0.5 text-left`}
                style={{ left: 0, width: W_ACTIONS, minWidth: W_ACTIONS }}
              >
                Actions
              </th>
              <th
                className={`${frozenHeader} px-1 py-0.5 text-center`}
                style={{ left: LEFT_INTEREST, width: W_INTEREST, minWidth: W_INTEREST }}
              ></th>
              <th
                className={`${frozenHeader} border-r border-slate-200 px-1 py-0.5 text-left`}
                style={{ left: LEFT_ADDRESS, width: W_ADDRESS, minWidth: W_ADDRESS }}
              >
                Address
              </th>
              <th className={`${stickyHeader} px-1 py-0.5 text-left`}>City</th>
              <th className={`${stickyHeader} px-1 py-0.5 text-left`} style={{ maxWidth: 110 }}>Subdiv</th>
              <th className={`${stickyHeader} px-1 py-0.5 text-left`}>Change Type</th>
              <SortTh k="dom" label="DOM" align="center" width={36} />
              <th className={`${stickyHeader} px-1 py-0.5 text-left`}>List Date</th>
              <SortTh k="comps_selected" label="Comps" align="center" width={48} />
              <SortTh k="arv_aggregate" label="ARV" />
              <SortTh k="list_price" label="List Price" />
              <SortTh k="max_offer" label="Max Offer" />
              <SortTh k="offer_pct" label="Offer %" />
              <SortTh k="gap_per_sqft" label="Gap" />
              <SortTh k="target_profit" label="Profit" />
              <th className={`${stickyHeader} px-1 py-0.5 text-left`} style={{ maxWidth: 56 }}>Lvl</th>
              <SortTh k="year_built" label="Year" width={40} />
              <SortTh k="bedrooms_total" label="Bd" width={24} />
              <SortTh k="bathrooms_total" label="Ba" width={24} />
              <SortTh k="garage_spaces" label="Gar" width={28} />
              <SortTh k="building_area_total_sqft" label="Bldg SF" />
              <SortTh k="above_grade_finished_area_sqft" label="Abv SF" />
              <SortTh k="below_grade_total_sqft" label="Bsmt" />
              <SortTh k="below_grade_finished_area_sqft" label="BsFin" />
              <SortTh k="lot_size_sqft" label="Lot" />
              <th className={`${stickyHeader} px-1 py-0.5 text-left`}>Status</th>
              <th className={`${stickyHeader} px-1 py-0.5 text-left`}>Note</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((r) => {
              const ic = INTEREST_CONFIG[r.interest_level ?? "new"] ?? INTEREST_CONFIG.new;
              const isEditingThisNote = editingNote === r.analysis_id;
              const isPassingThis = passingId === r.analysis_id;

              return (
                <tr key={r.analysis_id} className="group border-t border-slate-100 hover:bg-slate-50">
                  {/* Actions (leftmost — frozen) */}
                  <td
                    className={`${frozenBody} px-1 py-0.5`}
                    style={{ left: 0, width: W_ACTIONS, minWidth: W_ACTIONS }}
                  >
                    {isPassingThis ? (
                      <div className="flex items-center gap-1">
                        <select
                          value={passReason}
                          onChange={(e) => setPassReason(e.target.value)}
                          className="rounded border border-red-200 px-1 py-0.5 text-[10px]"
                        >
                          <option value="">Reason...</option>
                          {PASS_REASONS.map((rs) => (
                            <option key={rs} value={rs}>{rs}</option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => handlePass(r.analysis_id)}
                          disabled={!passReason || busy}
                          className="text-[10px] font-semibold text-red-600 disabled:opacity-50"
                        >
                          OK
                        </button>
                        <button
                          type="button"
                          onClick={() => { setPassingId(null); setPassReason(""); }}
                          className="text-[10px] text-slate-400"
                        >
                          ×
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <Link
                          href={`/analysis/${r.analysis_id}`}
                          className="text-[10px] font-semibold text-blue-600 hover:underline"
                        >
                          Open
                        </Link>
                        <button
                          type="button"
                          onClick={() => handleMoveToPipeline(r.analysis_id)}
                          className="text-[10px] font-semibold text-indigo-600 hover:underline"
                        >
                          Pipeline
                        </button>
                        <button
                          type="button"
                          onClick={() => setPassingId(r.analysis_id)}
                          className="text-[10px] font-semibold text-red-500 hover:underline"
                        >
                          Pass
                        </button>
                      </div>
                    )}
                  </td>

                  {/* Interest level (frozen) */}
                  <td
                    className={`${frozenBody} px-1 py-0.5 text-center`}
                    style={{ left: LEFT_INTEREST, width: W_INTEREST, minWidth: W_INTEREST }}
                  >
                    <InterestDropdown
                      value={r.interest_level ?? "new"}
                      icon={ic.icon}
                      onChange={(level) => handleInterestChange(r.analysis_id, level)}
                    />
                  </td>

                  {/* Address (frozen) — with unread event badge when
                   *  property_events has new changes since this analyst's
                   *  events_last_seen_at. Click the address to open the
                   *  workstation which auto-marks events as seen. */}
                  <td
                    className={`${frozenBody} border-r border-slate-200 px-1 py-0.5 font-medium`}
                    style={{ left: LEFT_ADDRESS, width: W_ADDRESS, minWidth: W_ADDRESS }}
                  >
                    <div className="flex items-center gap-1.5">
                      <Link
                        href={`/analysis/${r.analysis_id}`}
                        className="block truncate text-blue-700 hover:underline"
                        title={r.unparsed_address}
                      >
                        {r.unparsed_address}
                      </Link>
                      {(r.unread_event_count ?? 0) > 0 && (
                        <UnreadEventPill
                          count={r.unread_event_count ?? 0}
                          eventType={r.latest_unread_event_type}
                          before={r.latest_unread_event_before}
                          after={r.latest_unread_event_after}
                          at={r.latest_unread_event_at}
                        />
                      )}
                    </div>
                  </td>

                  <td className="px-1 py-0.5 text-slate-700">{r.city}</td>
                  <td className="max-w-[110px] truncate px-1 py-0.5 text-slate-700" title={r.subdivision_name ?? ""}>
                    {r.subdivision_name ?? "—"}
                  </td>
                  <td className="px-1 py-0.5 text-slate-700">{r.mls_major_change_type ?? "—"}</td>
                  <td className="px-1 py-0.5 text-center text-slate-700">{fmtNum(r.dom)}</td>
                  <td className="px-1 py-0.5 text-slate-700">{fmtDate(r.listing_contract_date)}</td>
                  <td className="px-1 py-0.5 text-center text-slate-700">
                    {r.comps_total != null && r.comps_total > 0
                      ? `${r.comps_selected ?? 0}/${r.comps_total}`
                      : "—"}
                  </td>
                  <td className="px-1 py-0.5 text-right font-semibold text-emerald-700">{$f(r.arv_aggregate)}</td>
                  <td className="px-1 py-0.5 text-right text-slate-900">{$f(r.list_price)}</td>
                  <td className="px-1 py-0.5 text-right font-semibold text-slate-900">{$f(r.max_offer)}</td>
                  <td className="px-1 py-0.5 text-right font-semibold text-slate-900">{fmtPct(r.offer_pct)}</td>
                  <td className={`px-1 py-0.5 text-right font-semibold ${(r.gap_per_sqft ?? 0) >= 60 ? "text-emerald-700" : "text-slate-900"}`}>
                    {r.gap_per_sqft != null ? `$${fmtNum(r.gap_per_sqft)}` : "—"}
                  </td>
                  <td className="px-1 py-0.5 text-right text-slate-700">{$f(r.target_profit)}</td>
                  <td className="max-w-[56px] truncate px-1 py-0.5 text-slate-700" title={r.level_class_standardized ?? ""}>
                    {r.level_class_standardized ?? "—"}
                  </td>
                  <td className="px-1 py-0.5 text-right text-slate-700">{r.year_built ?? "—"}</td>
                  <td className="px-1 py-0.5 text-right text-slate-700">{fmtNum(r.bedrooms_total)}</td>
                  <td className="px-1 py-0.5 text-right text-slate-700">{fmtNum(r.bathrooms_total)}</td>
                  <td className="px-1 py-0.5 text-right text-slate-700">{fmtNum(r.garage_spaces)}</td>
                  <td className="px-1 py-0.5 text-right text-slate-700">{fmtNum(r.building_area_total_sqft)}</td>
                  <td className="px-1 py-0.5 text-right text-slate-700">{fmtNum(r.above_grade_finished_area_sqft)}</td>
                  <td className="px-1 py-0.5 text-right text-slate-700">{fmtNum(r.below_grade_total_sqft)}</td>
                  <td className="px-1 py-0.5 text-right text-slate-700">{fmtNum(r.below_grade_finished_area_sqft)}</td>
                  <td className="px-1 py-0.5 text-right text-slate-700">{fmtNum(r.lot_size_sqft)}</td>

                  {/* Status dropdown */}
                  <td className="px-1 py-0.5">
                    <select
                      value={r.showing_status ?? ""}
                      onChange={(e) => handleStatusChange(r.analysis_id, e.target.value)}
                      className="rounded border border-slate-200 bg-white px-1 py-0.5 text-[10px] text-slate-700"
                    >
                      {SHOWING_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </td>

                  {/* Note */}
                  <td className="max-w-[160px] px-1 py-0.5">
                    {isEditingThisNote ? (
                      <div className="flex items-center gap-1">
                        <input
                          type="text"
                          value={noteText}
                          onChange={(e) => setNoteText(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleNoteSave(r.analysis_id);
                            if (e.key === "Escape") setEditingNote(null);
                          }}
                          className="w-full rounded border border-blue-300 px-1 py-0.5 text-[10px] focus:outline-none focus:ring-1 focus:ring-blue-400"
                          autoFocus
                        />
                        <button
                          type="button"
                          onClick={() => handleNoteSave(r.analysis_id)}
                          className="text-[10px] font-semibold text-blue-600"
                        >
                          Save
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingNote(r.analysis_id);
                          setNoteText(r.watch_list_note ?? "");
                        }}
                        className="block max-w-[160px] truncate text-left text-[10px] text-slate-500 hover:text-slate-800"
                        title={r.watch_list_note ?? "Click to add note"}
                      >
                        {r.watch_list_note || "—"}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Interest level dropdown (inline)
// ---------------------------------------------------------------------------

function InterestDropdown({
  value,
  icon,
  onChange,
}: {
  value: string;
  icon: string;
  onChange: (level: string) => void;
}) {
  return (
    <div className="relative inline-block">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 cursor-pointer opacity-0"
        title="Change interest level"
      >
        <option value="hot">Hot</option>
        <option value="warm">Warm</option>
        <option value="watch">Watch</option>
      </select>
      <span className="cursor-pointer text-base" title={INTEREST_CONFIG[value]?.label ?? value}>
        {icon}
      </span>
    </div>
  );
}

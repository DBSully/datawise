import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { UnreviewedPrimes } from "./unreviewed-primes";

export const dynamic = "force-dynamic";

function formatNumber(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat("en-US").format(value);
}

function $f(v: number | null | undefined) {
  if (v == null) return "—";
  return "$" + v.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

const INTEREST_ICONS: Record<string, string> = {
  hot: "🔴",
  warm: "🟡",
  watch: "🟢",
  new: "⚪",
};

// Compact event-type summarizer for the Dashboard's "Changes on your
// watchlist" card. Mirrors the watchlist table's UnreadEventPill logic.
function summarizeDashboardEvent(
  eventType: string | null,
  before: unknown,
  after: unknown,
): string {
  const money = (v: unknown) => {
    if (v === null || v === undefined) return "null";
    const n = typeof v === "number" ? v : Number(v);
    if (!Number.isFinite(n)) return "—";
    return "$" + Math.round(n).toLocaleString();
  };
  if (!eventType) return "New activity";
  switch (eventType) {
    case "price_change": {
      const b = Number(before);
      const a = Number(after);
      if (Number.isFinite(b) && Number.isFinite(a)) {
        const d = Math.round(a - b);
        return `Price ${d >= 0 ? "+" : ""}${money(d)}`;
      }
      return `Price → ${money(after)}`;
    }
    case "close_price":
      return `Closed ${money(after)}`;
    case "status_change":
      return `Status → ${String(after ?? "—")}`;
    case "change_type":
      return String(after ?? "—");
    case "uc_date":
      return "UC date";
    case "close_date":
      return "Close date";
    default:
      return eventType;
  }
}

export default async function DashboardPage() {
  noStore();
  const supabase = await createClient();

  // --- Section 1 + 2: Today at a Glance + Unreviewed Prime Candidates ---
  //
  // The "unreviewed primes" query against analysis_queue_v is the dominant
  // cost on this page (~2.3s per call against the current data scale, see
  // PERFORMANCE_FOLLOWUPS.md). Section 1 needs ALL unreviewed primes (to
  // count them by MLS status); section 2 needs the top 10 (full columns).
  // Both used to call analysis_queue_v separately for the same WHERE clause,
  // doubling the cost. Now we issue a single query inside the Section 1
  // Promise.all, fetching the section-2 column set + mls_status for ALL
  // unreviewed primes ordered by est_gap_per_sqft DESC, and slice the result
  // two ways in JS — section 1 = full result for the count, section 2 = top
  // 10 for the table. Cuts queue-view calls per page load from 2 to 1.

  // Use Denver local midnight (UTC-6 standard / UTC-7 daylight) for "today"
  const nowLocal = new Date();
  const denverOffsetMs = nowLocal.getTimezoneOffset() * 60_000;
  const todayStart = new Date(nowLocal.getTime() - denverOffsetMs);
  todayStart.setUTCHours(0, 0, 0, 0);
  const todayIso = new Date(todayStart.getTime() + denverOffsetMs).toISOString();

  const [
    { data: todayImports },
    { data: unreviewedPrimeRows },
    { count: watchListCount },
    { data: pipelineRows },
  ] = await Promise.all([
    // Listings imported today
    supabase
      .from("import_batches")
      .select("unique_listing_count")
      .gte("created_at", todayIso)
      .eq("status", "complete"),
    // Unreviewed prime candidates — fetched once, sliced for both section 1
    // (count by mls_status) and section 2 (top 10 by est_gap_per_sqft)
    supabase
      .from("analysis_queue_v")
      .select(
        "id, real_property_id, screening_batch_id, subject_address, subject_city, subject_property_type, subject_list_price, arv_aggregate, max_offer, est_gap_per_sqft, arv_comp_count, comp_search_run_id, promoted_analysis_id, mls_status",
      )
      .eq("is_prime_candidate", true)
      .is("review_action", null)
      .order("est_gap_per_sqft", { ascending: false, nullsFirst: false }),
    // Active watch list
    supabase
      .from("watch_list_v")
      .select("analysis_id", { count: "exact", head: true }),
    // Pipeline deals (showing/offer/under_contract)
    supabase
      .from("analysis_pipeline")
      .select("analysis_id, lifecycle_stage, offer_status, showing_status, offer_submitted_date, offer_deadline_date, updated_at")
      .in("lifecycle_stage", ["showing", "offer", "under_contract"])
      .eq("disposition", "active"),
  ]);

  const listingsImportedToday = (todayImports ?? []).reduce(
    (sum, r: { unique_listing_count: number | null }) =>
      sum + (r.unique_listing_count ?? 0),
    0,
  );
  const pipelineCount = pipelineRows?.length ?? 0;

  // Break down unreviewed primes by MLS status (exclude Closed)
  const primeStatusCounts: Record<string, number> = {};
  let unreviewedPrimeTotal = 0;
  for (const r of unreviewedPrimeRows ?? []) {
    const status = (r as { mls_status: string | null }).mls_status ?? "Unknown";
    if (status === "Closed") continue;
    primeStatusCounts[status] = (primeStatusCounts[status] ?? 0) + 1;
    unreviewedPrimeTotal++;
  }

  // Top 10 unreviewed primes for the table — sliced from the same result
  // (already ordered by est_gap_per_sqft DESC by the SQL ORDER BY above).
  const primeRows = (unreviewedPrimeRows ?? []).slice(0, 10).map(
    (r: Record<string, unknown>) => ({
      id: r.id as string,
      real_property_id: r.real_property_id as string,
      screening_batch_id: r.screening_batch_id as string,
      subject_address: r.subject_address as string,
      subject_city: r.subject_city as string,
      subject_property_type: r.subject_property_type as string | null,
      subject_list_price: r.subject_list_price as number | null,
      arv_aggregate: r.arv_aggregate as number | null,
      max_offer: r.max_offer as number | null,
      est_gap_per_sqft: r.est_gap_per_sqft as number | null,
      arv_comp_count: r.arv_comp_count as number | null,
      comp_search_run_id: r.comp_search_run_id as string | null,
      promoted_analysis_id: r.promoted_analysis_id as string | null,
    }),
  );

  // --- Section 3: Watch List — Needs Attention ---

  const threeDaysAgo = new Date();
  threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
  const threeDaysAgoIso = threeDaysAgo.toISOString();

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setUTCHours(23, 59, 59, 999);

  // Note: days_on_watch_list was in this select previously but does not
  // exist on watch_list_v — the whole query silently errored and this
  // card + the Needs Attention card both rendered as empty. Kept removed.
  const { data: watchListRows } = await supabase
    .from("watch_list_v")
    .select(
      "analysis_id, unparsed_address, city, interest_level, showing_status, watch_list_note, pipeline_updated_at, arv_aggregate, max_offer, est_gap_per_sqft, unread_event_count, latest_unread_event_type, latest_unread_event_before, latest_unread_event_after, latest_unread_event_at",
    );

  type WatchAttentionRow = {
    analysis_id: string;
    unparsed_address: string;
    city: string;
    interest_level: string | null;
    reason: string;
    est_gap_per_sqft: number | null;
    arv_aggregate: number | null;
    max_offer: number | null;
  };

  const watchAttention: WatchAttentionRow[] = [];
  type WatchChangesRow = {
    analysis_id: string;
    unparsed_address: string;
    city: string;
    interest_level: string | null;
    unread_event_count: number;
    latest_unread_event_type: string | null;
    latest_unread_event_before: unknown;
    latest_unread_event_after: unknown;
    latest_unread_event_at: string | null;
  };
  const watchChanges: WatchChangesRow[] = [];

  for (const r of watchListRows ?? []) {
    const row = r as Record<string, unknown>;
    const base = {
      analysis_id: row.analysis_id as string,
      unparsed_address: row.unparsed_address as string,
      city: row.city as string,
      interest_level: row.interest_level as string | null,
      est_gap_per_sqft: row.est_gap_per_sqft as number | null,
      arv_aggregate: row.arv_aggregate as number | null,
      max_offer: row.max_offer as number | null,
    };

    if (row.interest_level === "hot") {
      watchAttention.push({ ...base, reason: "Hot interest" });
    } else if (
      row.pipeline_updated_at &&
      (row.pipeline_updated_at as string) < threeDaysAgoIso
    ) {
      watchAttention.push({ ...base, reason: "No activity in 3+ days" });
    } else if (row.showing_status === "showing_scheduled") {
      watchAttention.push({ ...base, reason: "Showing scheduled" });
    }

    // Collect unread-event rows for the new "Changes on your watchlist"
    // card. Per-analyst scoping is baked into the view via
    // coalesce(events_last_seen_at, promoted_at) — see migration
    // 20260416180000.
    const unreadCount = (row.unread_event_count as number | null) ?? 0;
    if (unreadCount > 0) {
      watchChanges.push({
        analysis_id: row.analysis_id as string,
        unparsed_address: row.unparsed_address as string,
        city: row.city as string,
        interest_level: row.interest_level as string | null,
        unread_event_count: unreadCount,
        latest_unread_event_type: row.latest_unread_event_type as string | null,
        latest_unread_event_before: row.latest_unread_event_before,
        latest_unread_event_after: row.latest_unread_event_after,
        latest_unread_event_at: row.latest_unread_event_at as string | null,
      });
    }
  }

  // Sort changes newest first by latest_unread_event_at
  watchChanges.sort((a, b) => {
    const at = a.latest_unread_event_at ?? "";
    const bt = b.latest_unread_event_at ?? "";
    return bt.localeCompare(at);
  });

  // --- Section 4: Pipeline — Action Required ---

  type PipelineAlertRow = {
    analysis_id: string;
    reason: string;
  };

  const pipelineAlerts: PipelineAlertRow[] = [];
  const now = Date.now();

  for (const row of pipelineRows ?? []) {
    const r = row as Record<string, unknown>;

    // Offer submitted more than 3 days ago with no response
    if (
      r.offer_status === "submitted" &&
      r.offer_submitted_date &&
      now - new Date(r.offer_submitted_date as string).getTime() >
        3 * 24 * 60 * 60 * 1000
    ) {
      pipelineAlerts.push({
        analysis_id: r.analysis_id as string,
        reason: "Offer submitted 3+ days ago — no response",
      });
    }

    // Offer deadline within 24 hours
    if (r.offer_deadline_date) {
      const deadlineMs =
        new Date(r.offer_deadline_date as string).getTime() - now;
      if (deadlineMs > 0 && deadlineMs < 24 * 60 * 60 * 1000) {
        pipelineAlerts.push({
          analysis_id: r.analysis_id as string,
          reason: "Offer deadline within 24 hours",
        });
      }
    }
  }

  // --- Section 5: Daily Activity Log ---

  const { data: activityRows } = await supabase
    .from("daily_activity_v")
    .select("activity_type, real_property_id, analysis_id, address, city, is_prime_candidate, strategy_type, screening_decision, activity_at")
    .gte("activity_at", todayIso)
    .order("activity_at", { ascending: false })
    .limit(30);

  type ActivityRow = {
    activity_type: string;
    real_property_id: string;
    analysis_id: string | null;
    address: string;
    city: string | null;
    is_prime_candidate: boolean | null;
    strategy_type: string | null;
    screening_decision: string | null;
    activity_at: string;
  };

  const activityList = (activityRows ?? []) as ActivityRow[];

  return (
    <section className="dw-section-stack-compact">
      <div>
        <h1 className="dw-page-title">Dashboard</h1>
        <p className="dw-page-copy">
          Morning briefing — everything that needs your attention.
        </p>
      </div>

      {/* Section 1: Today at a Glance */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <GlanceCard
          label="Imported Today"
          value={formatNumber(listingsImportedToday)}
          sublabel="listings"
          href="/intake/imports"
        />
        <div
          className={`rounded-lg border px-4 py-3 shadow-sm ${
            unreviewedPrimeTotal > 0
              ? "border-emerald-200 bg-emerald-50"
              : "border-slate-200 bg-white"
          }`}
        >
          <div className="text-[10px] uppercase tracking-[0.14em] text-slate-500">
            Unreviewed Primes
          </div>
          <div
            className={`mt-1 text-2xl font-semibold ${
              unreviewedPrimeTotal > 0 ? "text-emerald-800" : "text-slate-900"
            }`}
          >
            {formatNumber(unreviewedPrimeTotal)}
          </div>
          {unreviewedPrimeTotal > 0 ? (
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
              {["Active", "Coming Soon", "Expired", "Withdrawn"].map(
                (status) => {
                  const count = primeStatusCounts[status];
                  if (!count) return null;
                  return (
                    <Link
                      key={status}
                      href={`/screening?prime=true&mlsStatus=${encodeURIComponent(status)}`}
                      className="text-xs text-emerald-700 hover:underline"
                    >
                      {status}: {count}
                    </Link>
                  );
                },
              )}
              {Object.entries(primeStatusCounts)
                .filter(
                  ([s]) =>
                    !["Active", "Coming Soon", "Expired", "Withdrawn"].includes(s),
                )
                .map(([status, count]) => (
                  <Link
                    key={status}
                    href={`/screening?prime=true&mlsStatus=${encodeURIComponent(status)}`}
                    className="text-xs text-emerald-700 hover:underline"
                  >
                    {status}: {count}
                  </Link>
                ))}
            </div>
          ) : (
            <div className="mt-0.5 text-xs text-slate-500">candidates</div>
          )}
        </div>
        <GlanceCard
          label="Watch List"
          value={formatNumber(watchListCount ?? 0)}
          sublabel="active deals"
          href="/analysis"
        />
        <GlanceCard
          label="Pipeline"
          value={formatNumber(pipelineCount)}
          sublabel={
            pipelineAlerts.length > 0
              ? `${pipelineAlerts.length} need action`
              : "deals in progress"
          }
          href="/action"
          accent={pipelineAlerts.length > 0 ? "red" : undefined}
        />
      </div>

      {/* Section 2: Unreviewed Prime Candidates */}
      <UnreviewedPrimes
        rows={primeRows}
        totalCount={unreviewedPrimeTotal}
      />

      {/* Changes on your watchlist — unread property_events */}
      {watchChanges.length > 0 && (
        <div className="dw-card-tight space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-800">
              Changes on your watchlist
              <span className="ml-2 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">
                {watchChanges.length} new
              </span>
            </h2>
            <Link href="/analysis" className="text-xs text-blue-600 hover:underline">
              View Watch List →
            </Link>
          </div>
          <div className="dw-table-wrap">
            <table className="dw-table-compact">
              <thead>
                <tr>
                  <th>Address</th>
                  <th>City</th>
                  <th>Change</th>
                  <th className="text-right">When</th>
                </tr>
              </thead>
              <tbody>
                {watchChanges.slice(0, 10).map((r) => (
                  <tr key={r.analysis_id}>
                    <td className="font-medium">
                      <Link
                        href={`/analysis/${r.analysis_id}`}
                        className="text-blue-700 hover:underline"
                      >
                        {r.unparsed_address}
                      </Link>
                    </td>
                    <td className="text-slate-500">{r.city}</td>
                    <td>
                      <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                        {summarizeDashboardEvent(
                          r.latest_unread_event_type,
                          r.latest_unread_event_before,
                          r.latest_unread_event_after,
                        )}
                        {r.unread_event_count > 1 && ` +${r.unread_event_count - 1}`}
                      </span>
                    </td>
                    <td className="text-right text-[11px] text-slate-500">
                      {r.latest_unread_event_at
                        ? new Date(r.latest_unread_event_at).toLocaleString()
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Section 3: Watch List — Needs Attention */}
      <div className="dw-card-tight space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-800">
            Watch List — Needs Attention
          </h2>
          <Link
            href="/analysis"
            className="text-xs text-blue-600 hover:underline"
          >
            View Watch List →
          </Link>
        </div>

        {watchAttention.length === 0 ? (
          <p className="py-4 text-center text-sm text-slate-400">
            All Watch List deals are up to date.
          </p>
        ) : (
          <div className="dw-table-wrap">
            <table className="dw-table-compact">
              <thead>
                <tr>
                  <th style={{ width: 30 }}></th>
                  <th>Address</th>
                  <th>City</th>
                  <th className="text-right">ARV</th>
                  <th className="text-right">Gap/sqft</th>
                  <th>Reason</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {watchAttention.map((r, i) => (
                  <tr key={`${r.analysis_id}-${i}`}>
                    <td className="text-center">
                      {INTEREST_ICONS[r.interest_level ?? "new"] ?? "⚪"}
                    </td>
                    <td className="font-medium">
                      <Link
                        href={`/analysis/${r.analysis_id}`}
                        className="text-blue-700 hover:underline"
                      >
                        {r.unparsed_address}
                      </Link>
                    </td>
                    <td className="text-slate-500">{r.city}</td>
                    <td className="text-right font-medium text-emerald-700">
                      {$f(r.arv_aggregate)}
                    </td>
                    <td
                      className={`text-right font-semibold ${
                        (r.est_gap_per_sqft ?? 0) >= 60
                          ? "text-emerald-700"
                          : ""
                      }`}
                    >
                      {r.est_gap_per_sqft != null
                        ? `$${formatNumber(r.est_gap_per_sqft)}`
                        : "—"}
                    </td>
                    <td>
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                          r.reason.includes("Hot")
                            ? "bg-red-100 text-red-700"
                            : r.reason.includes("Showing")
                              ? "bg-blue-100 text-blue-700"
                              : "bg-amber-100 text-amber-700"
                        }`}
                      >
                        {r.reason}
                      </span>
                    </td>
                    <td>
                      <Link
                        href={`/analysis/${r.analysis_id}`}
                        className="text-[10px] text-blue-600 hover:underline"
                      >
                        Open
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Section 4: Pipeline — Action Required */}
      <div className="dw-card-tight space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-800">
            Pipeline — Action Required
          </h2>
          <Link
            href="/action"
            className="text-xs text-blue-600 hover:underline"
          >
            View Pipeline →
          </Link>
        </div>

        {pipelineAlerts.length === 0 ? (
          <p className="py-4 text-center text-sm text-slate-400">
            No pipeline items need immediate action.
          </p>
        ) : (
          <div className="space-y-1">
            {pipelineAlerts.map((alert, i) => (
              <div
                key={`${alert.analysis_id}-${i}`}
                className="flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-3 py-2"
              >
                <span className="text-sm text-red-800">{alert.reason}</span>
                <Link
                  href={`/analysis/${alert.analysis_id}`}
                  className="text-xs font-semibold text-red-700 hover:underline"
                >
                  Open →
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Section 5: Daily Activity Log */}
      <div className="dw-card-tight space-y-2">
        <h2 className="text-sm font-semibold text-slate-800">
          Today&apos;s Activity
        </h2>

        {activityList.length === 0 ? (
          <p className="py-4 text-center text-sm text-slate-400">
            No activity recorded today.
          </p>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-[10px] uppercase tracking-wider text-slate-500">
                <th className="px-2 py-1 text-left">Time</th>
                <th className="px-2 py-1 text-left">Type</th>
                <th className="px-2 py-1 text-left">Address</th>
                <th className="px-2 py-1 text-left">City</th>
                <th className="px-2 py-1 text-left">Details</th>
              </tr>
            </thead>
            <tbody>
              {activityList.map((a, i) => (
                <tr key={`${a.activity_type}-${a.real_property_id}-${i}`} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="whitespace-nowrap px-2 py-1 text-slate-500">
                    {new Date(a.activity_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </td>
                  <td className="px-2 py-1">
                    <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ${
                      a.activity_type === "screening"
                        ? a.screening_decision === "promoted" ? "bg-emerald-100 text-emerald-700"
                          : a.screening_decision === "passed" ? "bg-red-100 text-red-700"
                          : "bg-violet-100 text-violet-700"
                        : "bg-blue-100 text-blue-700"
                    }`}>
                      {a.activity_type === "screening"
                        ? a.screening_decision === "promoted" ? "Promoted"
                          : a.screening_decision === "passed" ? "Passed"
                          : "Screened"
                        : "Analysis"}
                    </span>
                  </td>
                  <td className="px-2 py-1 font-medium text-slate-800">
                    {a.analysis_id ? (
                      <Link href={`/analysis/${a.analysis_id}`} className="hover:underline">
                        {a.address}
                      </Link>
                    ) : (
                      a.address
                    )}
                  </td>
                  <td className="px-2 py-1 text-slate-600">{a.city ?? "—"}</td>
                  <td className="px-2 py-1 text-slate-500">
                    {a.activity_type === "screening" && a.is_prime_candidate && (
                      <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700">Prime</span>
                    )}
                    {a.activity_type === "analysis_complete" && a.strategy_type && (
                      <span className="text-slate-600">{a.strategy_type}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

function GlanceCard({
  label,
  value,
  sublabel,
  href,
  accent,
}: {
  label: string;
  value: string;
  sublabel: string;
  href: string;
  accent?: "emerald" | "amber" | "red";
}) {
  const borderClass =
    accent === "emerald"
      ? "border-emerald-200 bg-emerald-50"
      : accent === "amber"
        ? "border-amber-200 bg-amber-50"
        : accent === "red"
          ? "border-red-200 bg-red-50"
          : "border-slate-200 bg-white";
  const valueClass =
    accent === "emerald"
      ? "text-emerald-800"
      : accent === "red"
        ? "text-red-800"
        : "text-slate-900";

  return (
    <Link
      href={href}
      className={`group rounded-lg border px-4 py-3 shadow-sm transition-shadow hover:shadow-md ${borderClass}`}
    >
      <div className="text-[10px] uppercase tracking-[0.14em] text-slate-500">
        {label}
      </div>
      <div className={`mt-1 text-2xl font-semibold ${valueClass}`}>
        {value}
      </div>
      <div className="mt-0.5 text-xs text-slate-500">{sublabel}</div>
    </Link>
  );
}

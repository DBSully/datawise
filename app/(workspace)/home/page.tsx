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

export default async function DashboardPage() {
  noStore();
  const supabase = await createClient();

  // --- Section 1: Today at a Glance ---

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
    // Unreviewed prime candidates by MLS status
    supabase
      .from("analysis_queue_v")
      .select("id, mls_status")
      .eq("is_prime_candidate", true)
      .is("review_action", null),
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

  // --- Section 2: Unreviewed Prime Candidates (top 10) ---

  const { data: unreviewedPrimes } = await supabase
    .from("analysis_queue_v")
    .select(
      "id, real_property_id, screening_batch_id, subject_address, subject_city, subject_property_type, subject_list_price, arv_aggregate, max_offer, est_gap_per_sqft, arv_comp_count, comp_search_run_id, promoted_analysis_id",
    )
    .eq("is_prime_candidate", true)
    .is("review_action", null)
    .order("est_gap_per_sqft", { ascending: false, nullsFirst: false })
    .limit(10);

  const primeRows = (unreviewedPrimes ?? []).map(
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

  const { data: watchListRows } = await supabase
    .from("watch_list_v")
    .select(
      "analysis_id, unparsed_address, city, interest_level, showing_status, watch_list_note, days_on_watch_list, pipeline_updated_at, arv_aggregate, max_offer, est_gap_per_sqft",
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
  }

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
                      href={`/intake/screening?prime=true&mlsStatus=${encodeURIComponent(status)}`}
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
                    href={`/intake/screening?prime=true&mlsStatus=${encodeURIComponent(status)}`}
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
          href="/deals/watchlist"
        />
        <GlanceCard
          label="Pipeline"
          value={formatNumber(pipelineCount)}
          sublabel={
            pipelineAlerts.length > 0
              ? `${pipelineAlerts.length} need action`
              : "deals in progress"
          }
          href="/deals/pipeline"
          accent={pipelineAlerts.length > 0 ? "red" : undefined}
        />
      </div>

      {/* Section 2: Unreviewed Prime Candidates */}
      <UnreviewedPrimes
        rows={primeRows}
        totalCount={unreviewedPrimeTotal}
      />

      {/* Section 3: Watch List — Needs Attention */}
      <div className="dw-card-tight space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-800">
            Watch List — Needs Attention
          </h2>
          <Link
            href="/deals/watchlist"
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
                        href={`/deals/watchlist/${r.analysis_id}`}
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
                        href={`/deals/watchlist/${r.analysis_id}`}
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
            href="/deals/pipeline"
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
                  href={`/deals/watchlist/${alert.analysis_id}`}
                  className="text-xs font-semibold text-red-700 hover:underline"
                >
                  Open →
                </Link>
              </div>
            ))}
          </div>
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

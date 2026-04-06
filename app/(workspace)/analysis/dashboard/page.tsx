import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { runScreeningAction } from "@/app/(workspace)/analysis/screening/actions";

export const dynamic = "force-dynamic";

function formatNumber(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat("en-US").format(value);
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString();
}

const LIFECYCLE_STAGES = [
  { key: "analysis", label: "Analysis" },
  { key: "showing", label: "Showing" },
  { key: "offer", label: "Offer" },
  { key: "under_contract", label: "Under Contract" },
  { key: "closed", label: "Closed" },
  { key: "project", label: "Project" },
  { key: "completed", label: "Completed" },
];

export default async function DashboardPage() {
  noStore();

  const supabase = await createClient();

  // Pipeline funnel
  const { data: pipelineRows } = await supabase
    .from("dashboard_pipeline_summary_v")
    .select("lifecycle_stage, property_count");

  const pipelineMap = new Map<string, number>();
  for (const row of pipelineRows ?? []) {
    pipelineMap.set(
      row.lifecycle_stage,
      (pipelineMap.get(row.lifecycle_stage) ?? 0) + row.property_count,
    );
  }

  // Daily scorecard
  const { data: scorecardRows } = await supabase.rpc("get_daily_scorecard", {
    lookback_days: 7,
  });

  // Unscreened count
  const { data: unscreenedCount } = await supabase.rpc(
    "count_unscreened_properties",
    { statuses: ["Active", "Coming Soon"] },
  );
  const unscreenedTotal: number =
    typeof unscreenedCount === "number" ? unscreenedCount : 0;

  // MLS status counts
  const { data: statusCounts } = await supabase
    .from("mls_status_counts_v")
    .select("mls_status, property_count");

  const activeCount =
    (statusCounts ?? []).find(
      (s: { mls_status: string }) => s.mls_status === "Active",
    )?.property_count ?? 0;
  const comingSoonCount =
    (statusCounts ?? []).find(
      (s: { mls_status: string }) => s.mls_status === "Coming Soon",
    )?.property_count ?? 0;

  // Import outcomes (last 10)
  const { data: importOutcomes } = await supabase
    .from("import_outcomes_v")
    .select("*")
    .limit(10);

  // Total screened / prime across all time
  const { data: statsRows } = await supabase
    .from("screening_results")
    .select("is_prime_candidate", { count: "exact" });

  const totalScreened = statsRows?.length ?? 0;
  const totalPrime =
    statsRows?.filter(
      (r: { is_prime_candidate: boolean }) => r.is_prime_candidate,
    ).length ?? 0;

  return (
    <section className="dw-section-stack-compact">
      <div>
        <h1 className="dw-page-title">Dashboard</h1>
        <p className="dw-page-copy">
          Overview of your deal pipeline, screening activity, and import
          outcomes.
        </p>
      </div>

      {/* Top-level stats */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="Active Listings" value={formatNumber(activeCount)} />
        <StatCard
          label="Coming Soon"
          value={formatNumber(comingSoonCount)}
        />
        <StatCard
          label="Unscreened"
          value={formatNumber(unscreenedTotal)}
          accent={unscreenedTotal > 0 ? "amber" : undefined}
        />
        <StatCard label="Total Screened" value={formatNumber(totalScreened)} />
        <StatCard
          label="Prime Candidates"
          value={formatNumber(totalPrime)}
          accent="emerald"
        />
      </div>

      {/* Quick actions */}
      <div className="flex flex-wrap gap-3">
        <form action={runScreeningAction}>
          <input type="hidden" name="name" value="Unscreened Listings Screen" />
          <input type="hidden" name="status_filter" value="Active,Coming Soon" />
          <input type="hidden" name="filter_mode" value="unscreened" />
          <button
            type="submit"
            className="dw-button-primary"
            disabled={unscreenedTotal === 0}
          >
            Screen Unscreened ({formatNumber(unscreenedTotal)})
          </button>
        </form>

        <Link href="/analysis/queue?prime=true" className="dw-button-secondary">
          View Prime Candidates
        </Link>

        <Link href="/analysis/imports" className="dw-button-secondary">
          Import Data
        </Link>

        <Link href="/analysis/screening" className="dw-button-secondary">
          Screening
        </Link>
      </div>

      {/* Pipeline funnel */}
      <div className="dw-card-tight">
        <h2 className="mb-2 text-sm font-semibold text-slate-800">
          Deal Pipeline
        </h2>
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-7">
          {LIFECYCLE_STAGES.map((stage) => {
            const count = pipelineMap.get(stage.key) ?? 0;
            return (
              <div
                key={stage.key}
                className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-center"
              >
                <div className="text-[10px] uppercase tracking-[0.14em] text-slate-500">
                  {stage.label}
                </div>
                <div className="mt-1 text-lg font-semibold text-slate-900">
                  {count}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Daily scorecard */}
      <div className="dw-card-tight">
        <h2 className="mb-2 text-sm font-semibold text-slate-800">
          Daily Scorecard (Last 7 Days)
        </h2>
        <div className="dw-table-wrap">
          <table className="dw-table">
            <thead>
              <tr>
                <th>Day</th>
                <th className="text-right">Imports</th>
                <th className="text-right">Listings</th>
                <th className="text-right">Screened</th>
                <th className="text-right">Prime</th>
                <th className="text-right">Promoted</th>
              </tr>
            </thead>
            <tbody>
              {(scorecardRows ?? []).map(
                (row: {
                  day: string;
                  imports_count: number;
                  listings_imported: number;
                  properties_screened: number;
                  prime_candidates: number;
                  promoted_to_analysis: number;
                }) => {
                  const isToday =
                    row.day === new Date().toISOString().slice(0, 10);
                  return (
                    <tr
                      key={row.day}
                      className={isToday ? "bg-blue-50" : undefined}
                    >
                      <td className={isToday ? "font-semibold" : ""}>
                        {new Date(row.day + "T00:00:00").toLocaleDateString(
                          "en-US",
                          { weekday: "short", month: "short", day: "numeric" },
                        )}
                        {isToday && (
                          <span className="ml-1 text-[10px] uppercase text-blue-600">
                            today
                          </span>
                        )}
                      </td>
                      <td className="text-right">
                        {formatNumber(row.imports_count)}
                      </td>
                      <td className="text-right">
                        {formatNumber(row.listings_imported)}
                      </td>
                      <td className="text-right">
                        {formatNumber(row.properties_screened)}
                      </td>
                      <td className="text-right font-semibold text-emerald-700">
                        {formatNumber(row.prime_candidates)}
                      </td>
                      <td className="text-right">
                        {formatNumber(row.promoted_to_analysis)}
                      </td>
                    </tr>
                  );
                },
              )}
              {(!scorecardRows || scorecardRows.length === 0) && (
                <tr>
                  <td colSpan={6} className="text-center text-slate-500">
                    No activity data yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Import outcomes */}
      <div className="dw-card-tight">
        <h2 className="mb-2 text-sm font-semibold text-slate-800">
          Recent Import Outcomes
        </h2>
        <div className="dw-table-wrap">
          <table className="dw-table">
            <thead>
              <tr>
                <th>Imported</th>
                <th>Notes</th>
                <th className="text-right">Listings</th>
                <th className="text-right">Screened</th>
                <th className="text-right">Prime</th>
                <th className="text-right">Promoted</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {(importOutcomes ?? []).map(
                (row: {
                  import_batch_id: string;
                  imported_at: string;
                  import_notes: string | null;
                  unique_listing_count: number;
                  screening_batch_id: string | null;
                  screening_status: string | null;
                  screened_count: number | null;
                  prime_candidate_count: number | null;
                  promoted_count: number | null;
                }) => (
                  <tr key={row.import_batch_id}>
                    <td>{formatDate(row.imported_at)}</td>
                    <td className="max-w-[200px] truncate text-slate-600">
                      {row.import_notes ?? "—"}
                    </td>
                    <td className="text-right">
                      {formatNumber(row.unique_listing_count)}
                    </td>
                    <td className="text-right">
                      {row.screening_batch_id
                        ? formatNumber(row.screened_count)
                        : "—"}
                    </td>
                    <td className="text-right font-semibold text-emerald-700">
                      {row.screening_batch_id
                        ? formatNumber(row.prime_candidate_count)
                        : "—"}
                    </td>
                    <td className="text-right">
                      {row.screening_batch_id
                        ? formatNumber(row.promoted_count)
                        : "—"}
                    </td>
                    <td>
                      {row.screening_batch_id ? (
                        <Link
                          href={`/analysis/screening/${row.screening_batch_id}`}
                          className="text-xs text-blue-600 hover:underline"
                        >
                          Results
                        </Link>
                      ) : (
                        <span className="text-[11px] text-slate-400">
                          Not screened
                        </span>
                      )}
                    </td>
                  </tr>
                ),
              )}
              {(!importOutcomes || importOutcomes.length === 0) && (
                <tr>
                  <td colSpan={7} className="text-center text-slate-500">
                    No imports yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "amber" | "emerald";
}) {
  const borderClass =
    accent === "amber"
      ? "border-amber-200 bg-amber-50"
      : accent === "emerald"
        ? "border-emerald-200 bg-emerald-50"
        : "border-slate-200 bg-white";
  const valueClass =
    accent === "amber"
      ? "text-amber-900"
      : accent === "emerald"
        ? "text-emerald-800"
        : "text-slate-900";

  return (
    <div
      className={`rounded-lg border px-3 py-2 shadow-sm ${borderClass}`}
    >
      <div className="text-[10px] uppercase tracking-[0.14em] text-slate-500">
        {label}
      </div>
      <div className={`mt-1 text-lg font-semibold ${valueClass}`}>{value}</div>
    </div>
  );
}

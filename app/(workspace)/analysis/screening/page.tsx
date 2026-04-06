import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { runScreeningAction } from "./actions";

export const dynamic = "force-dynamic";

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

function formatNumber(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat("en-US").format(value);
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    pending: "bg-yellow-100 text-yellow-800",
    running: "bg-blue-100 text-blue-800",
    complete: "bg-green-100 text-green-800",
    error: "bg-red-100 text-red-800",
  };
  return (
    <span
      className={`inline-block rounded px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${colors[status] ?? "bg-slate-100 text-slate-600"}`}
    >
      {status}
    </span>
  );
}

export default async function ScreeningDashboardPage() {
  noStore();

  const supabase = await createClient();

  // Load recent batches
  const { data: batches, error: batchesError } = await supabase
    .from("screening_batches")
    .select(
      "id, name, status, trigger_type, source_import_batch_id, strategy_profile_slug, total_subjects, screened_count, prime_candidate_count, created_at, completed_at",
    )
    .order("created_at", { ascending: false })
    .limit(25);

  if (batchesError) throw new Error(batchesError.message);

  // Summary stats
  const { data: statsRows } = await supabase
    .from("screening_results")
    .select("is_prime_candidate", { count: "exact" });

  const totalScreened = statsRows?.length ?? 0;
  const totalPrime =
    statsRows?.filter((r: { is_prime_candidate: boolean }) => r.is_prime_candidate)
      .length ?? 0;

  // Dataset metrics: property counts by MLS status
  const { data: statusCounts } = await supabase
    .from("mls_status_counts_v")
    .select("mls_status, property_count");

  // Unscreened count
  const { data: unscreenedCount } = await supabase.rpc(
    "count_unscreened_properties",
    { statuses: ["Active", "Coming Soon"] },
  );

  const unscreenedTotal: number =
    typeof unscreenedCount === "number" ? unscreenedCount : 0;

  // Order statuses for display
  const statusOrder = ["Active", "Coming Soon", "Pending", "Closed"];
  const sortedStatusCounts = (statusCounts ?? []).sort(
    (
      a: { mls_status: string; property_count: number },
      b: { mls_status: string; property_count: number },
    ) => {
      const ai = statusOrder.indexOf(a.mls_status);
      const bi = statusOrder.indexOf(b.mls_status);
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    },
  );

  return (
    <section className="dw-section-stack-compact">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="dw-page-title">Deal Screening</h1>
          <p className="dw-page-copy">
            Screen properties through the fix-and-flip pipeline to identify
            Prime Candidates.
          </p>
        </div>
      </div>

      {/* Dataset overview */}
      <div className="dw-card-tight">
        <h2 className="mb-2 text-sm font-semibold text-slate-800">
          Dataset Overview
        </h2>
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {sortedStatusCounts.map(
            (sc: { mls_status: string; property_count: number }) => (
              <div key={sc.mls_status} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <div className="text-[10px] uppercase tracking-[0.14em] text-slate-500">
                  {sc.mls_status}
                </div>
                <div className="mt-1 text-lg font-semibold text-slate-900">
                  {formatNumber(sc.property_count)}
                </div>
              </div>
            ),
          )}
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
            <div className="text-[10px] uppercase tracking-[0.14em] text-amber-700">
              Unscreened
            </div>
            <div className="mt-1 text-lg font-semibold text-amber-900">
              {formatNumber(unscreenedTotal)}
            </div>
          </div>
        </div>
      </div>

      {/* Quick actions */}
      <div className="grid gap-3 sm:grid-cols-4">
        <form action={runScreeningAction}>
          <input type="hidden" name="name" value="Unscreened Listings Screen" />
          <input type="hidden" name="status_filter" value="Active,Coming Soon" />
          <input type="hidden" name="filter_mode" value="unscreened" />
          <button
            type="submit"
            className="dw-button-primary w-full"
            disabled={unscreenedTotal === 0}
          >
            Screen Unscreened ({formatNumber(unscreenedTotal)})
          </button>
        </form>

        <form action={runScreeningAction}>
          <input type="hidden" name="name" value="Active Listings Screen" />
          <input type="hidden" name="status_filter" value="Active" />
          <button type="submit" className="dw-button-secondary w-full">
            Screen All Active
          </button>
        </form>

        <form action={runScreeningAction}>
          <input
            type="hidden"
            name="name"
            value="Coming Soon Screen"
          />
          <input type="hidden" name="status_filter" value="Coming Soon" />
          <button type="submit" className="dw-button-secondary w-full">
            Screen All Coming Soon
          </button>
        </form>

        <form action={runScreeningAction}>
          <input
            type="hidden"
            name="name"
            value="Active + Coming Soon Screen"
          />
          <input
            type="hidden"
            name="status_filter"
            value="Active,Coming Soon"
          />
          <button type="submit" className="dw-button-secondary w-full">
            Screen All Both
          </button>
        </form>
      </div>

      {/* Summary stats */}
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Total Screened (all batches)" value={formatNumber(totalScreened)} />
        <StatCard label="Prime Candidates Found" value={formatNumber(totalPrime)} />
        <StatCard label="Screening Batches" value={formatNumber(batches?.length ?? 0)} />
      </div>

      {/* Recent batches table */}
      <div className="dw-card-tight">
        <h2 className="mb-2 text-sm font-semibold text-slate-800">
          Recent Screening Batches
        </h2>

        {(!batches || batches.length === 0) ? (
          <p className="py-6 text-center text-sm text-slate-500">
            No screening batches yet. Use the buttons above to run your first
            screen.
          </p>
        ) : (
          <div className="dw-table-wrap">
            <table className="dw-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Status</th>
                  <th>Trigger</th>
                  <th className="text-right">Subjects</th>
                  <th className="text-right">Screened</th>
                  <th className="text-right">Prime</th>
                  <th>Started</th>
                  <th>Completed</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {batches.map(
                  (batch: {
                    id: string;
                    name: string;
                    status: string;
                    trigger_type: string;
                    source_import_batch_id: string | null;
                    total_subjects: number;
                    screened_count: number;
                    prime_candidate_count: number;
                    created_at: string;
                    completed_at: string | null;
                  }) => (
                    <tr key={batch.id}>
                      <td className="font-medium">
                        <Link
                          href={`/analysis/screening/${batch.id}`}
                          className="text-blue-700 hover:underline"
                        >
                          {batch.name}
                        </Link>
                      </td>
                      <td>
                        <StatusBadge status={batch.status} />
                      </td>
                      <td className="text-slate-500">
                        {batch.trigger_type === "import" &&
                        batch.source_import_batch_id ? (
                          <Link
                            href="/analysis/imports"
                            className="text-blue-600 hover:underline"
                          >
                            Import
                          </Link>
                        ) : (
                          batch.trigger_type
                        )}
                      </td>
                      <td className="text-right">
                        {formatNumber(batch.total_subjects)}
                      </td>
                      <td className="text-right">
                        {formatNumber(batch.screened_count)}
                      </td>
                      <td className="text-right font-semibold text-emerald-700">
                        {formatNumber(batch.prime_candidate_count)}
                      </td>
                      <td className="text-slate-500">
                        {formatDate(batch.created_at)}
                      </td>
                      <td className="text-slate-500">
                        {formatDate(batch.completed_at)}
                      </td>
                      <td>
                        <Link
                          href={`/analysis/screening/${batch.id}`}
                          className="text-xs text-blue-600 hover:underline"
                        >
                          View
                        </Link>
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm">
      <div className="text-[10px] uppercase tracking-[0.14em] text-slate-500">
        {label}
      </div>
      <div className="mt-1 text-lg font-semibold text-slate-900">{value}</div>
    </div>
  );
}

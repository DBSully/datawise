import Link from "next/link";
import { ImportUploadPanel } from "@/components/imports/import-upload-panel";
import { createClient } from "@/lib/supabase/server";
import { runImportScreeningAction, runScreeningAction } from "@/app/(workspace)/intake/screening/actions";
import { processImportBatchAction } from "./actions";

const ROLLING_LIMIT_30_DAY = 75_000;
const DAILY_AVERAGE_LIMIT = ROLLING_LIMIT_30_DAY / 30;

type ImportsPageProps = {
  searchParams?: Promise<{
    processed?: string;
    screened?: string;
    screen_error?: string;
    batch?: string;
    process_error?: string;
  }>;
};

function shiftUtcDays(date: Date, offset: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + offset);
  return next;
}

function startOfUtcDay(date: Date) {
  const next = new Date(date);
  next.setUTCHours(0, 0, 0, 0);
  return next;
}

function dayKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function formatShortDate(date: Date) {
  return `${date.getUTCMonth() + 1}/${date.getUTCDate()}`;
}

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

export default async function ImportsPage({ searchParams }: ImportsPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const supabase = await createClient();

  const sixtyDayStart = startOfUtcDay(
    shiftUtcDays(new Date(), -59),
  ).toISOString();

  const [
    { data: importBatches, error },
    { data: recentBatches, error: recentBatchesError },
  ] = await Promise.all([
    supabase
      .from("import_batches")
      .select(
        `
          id,
          created_at,
          status,
          source_system,
          import_profile,
          total_row_count,
          unique_listing_count,
          unique_property_count,
          file_count,
          import_notes
        `,
      )
      .eq("source_system", "recolorado")
      .gte("created_at", sixtyDayStart)
      .order("created_at", { ascending: false }),

    supabase
      .from("import_batch_progress_v")
      .select(
        `
          id,
          created_at,
          completed_at,
          status,
          source_system,
          import_profile,
          file_count,
          total_row_count,
          unique_listing_count,
          unique_property_count,
          import_notes,
          processed_rows,
          remaining_validated_rows,
          processing_error_rows,
          validation_error_rows,
          processed_pct
        `,
      )
      .eq("source_system", "recolorado")
      .order("created_at", { ascending: false })
      .limit(25),
  ]);

  if (error) throw new Error(error.message);
  if (recentBatchesError) throw new Error(recentBatchesError.message);

  // Load screening batches linked to imports for the Screening column
  const { data: screeningBatchesLinked } = await supabase
    .from("screening_batches")
    .select("id, source_import_batch_id, status, prime_candidate_count, screened_count")
    .not("source_import_batch_id", "is", null);

  const screeningByImport = new Map<
    string,
    { id: string; status: string; primeCount: number; screenedCount: number }
  >();
  for (const sb of screeningBatchesLinked ?? []) {
    screeningByImport.set(sb.source_import_batch_id, {
      id: sb.id,
      status: sb.status,
      primeCount: sb.prime_candidate_count ?? 0,
      screenedCount: sb.screened_count ?? 0,
    });
  }

  // Load all screening batches for the batch management section
  const { data: screeningBatches } = await supabase
    .from("screening_batches")
    .select(
      "id, name, status, trigger_type, source_import_batch_id, total_subjects, screened_count, prime_candidate_count, created_at, completed_at",
    )
    .order("created_at", { ascending: false })
    .limit(25);

  // Dataset metrics for screening section
  const { data: statusCounts } = await supabase
    .from("mls_status_counts_v")
    .select("mls_status, property_count");

  const { data: unscreenedCount } = await supabase.rpc(
    "count_unscreened_properties",
    { statuses: ["Active", "Coming Soon"] },
  );

  const unscreenedTotal: number =
    typeof unscreenedCount === "number" ? unscreenedCount : 0;

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

  // Screening summary stats
  const { data: statsRows } = await supabase
    .from("screening_results")
    .select("is_prime_candidate", { count: "exact" });

  const totalScreened = statsRows?.length ?? 0;
  const totalPrime =
    statsRows?.filter((r: { is_prime_candidate: boolean }) => r.is_prime_candidate)
      .length ?? 0;

  const batches = importBatches ?? [];
  const progressRows = recentBatches ?? [];

  const totalsByDay = new Map<string, number>();
  for (const batch of batches) {
    const key = String(batch.created_at).slice(0, 10);
    totalsByDay.set(
      key,
      (totalsByDay.get(key) ?? 0) + (batch.total_row_count ?? 0),
    );
  }

  const today = new Date();

  const chartDays = Array.from({ length: 60 }, (_, index) => {
    const date = startOfUtcDay(shiftUtcDays(today, -59 + index));
    const key = dayKey(date);
    return {
      key,
      label: formatShortDate(date),
      total: totalsByDay.get(key) ?? 0,
    };
  });

  const last30Days = chartDays.slice(-30);
  const last7Days = chartDays.slice(-7);
  const todayPoint = chartDays[chartDays.length - 1];
  const yesterdayPoint = chartDays[chartDays.length - 2];

  const rolling30Total = last30Days.reduce((sum, day) => sum + day.total, 0);
  const last7Total = last7Days.reduce((sum, day) => sum + day.total, 0);
  const todayTotal = todayPoint?.total ?? 0;
  const yesterdayTotal = yesterdayPoint?.total ?? 0;

  const average7Day = last7Total / 7;
  const average30Day = rolling30Total / 30;

  const remaining30DayCapacity = Math.max(
    0,
    ROLLING_LIMIT_30_DAY - rolling30Total,
  );
  const utilizationPercent = Math.min(
    100,
    Math.round((rolling30Total / ROLLING_LIMIT_30_DAY) * 100),
  );

  const maxChartValue = Math.max(...chartDays.map((day) => day.total), 1);

  const summaryToneClass =
    rolling30Total >= ROLLING_LIMIT_30_DAY
      ? "text-red-700"
      : rolling30Total >= ROLLING_LIMIT_30_DAY * 0.85
        ? "text-amber-700"
        : "text-emerald-700";

  const summaryMessage =
    rolling30Total >= ROLLING_LIMIT_30_DAY
      ? `You are over the 75,000 rolling 30-day limit. Reduce imports immediately until older days roll off.`
      : `To stay within the 75,000-record rolling 30-day limit, keep your 30-day average at or below ${DAILY_AVERAGE_LIMIT.toLocaleString()} records/day. You are currently averaging ${Math.round(
          average30Day,
        ).toLocaleString()} per day and have ${remaining30DayCapacity.toLocaleString()} records of 30-day capacity remaining.`;

  return (
    <section className="dw-section-stack">
      <div>
        <h1 className="dw-page-title">Imports</h1>
        <p className="dw-page-copy">
          Upload CSVs, process into core tables, and screen for opportunities.
        </p>
      </div>

      {resolvedSearchParams?.processed === "1" ? (
        <div className="dw-card-tight border-emerald-200 bg-emerald-50 text-sm text-emerald-800 flex items-center justify-between">
          <span>
            Batch processed successfully
            {resolvedSearchParams?.screened === "1"
              ? " and auto-screened."
              : "."}
            {resolvedSearchParams?.screen_error === "1" && (
              <span className="ml-2 text-amber-700">
                Auto-screening encountered an error — you can screen manually below.
              </span>
            )}
          </span>
          {resolvedSearchParams?.screened === "1" ? (
            <Link
              href="/intake/screening?prime=true"
              className="dw-button-primary"
            >
              View Prime Candidates →
            </Link>
          ) : resolvedSearchParams?.screen_error === "1" && resolvedSearchParams?.batch ? (
            <form action={runImportScreeningAction}>
              <input
                type="hidden"
                name="import_batch_id"
                value={resolvedSearchParams.batch}
              />
              <button type="submit" className="dw-button-primary">
                Retry Screening
              </button>
            </form>
          ) : null}
        </div>
      ) : null}

      {resolvedSearchParams?.process_error ? (
        <div className="dw-card-tight border-red-200 bg-red-50 text-sm text-red-800">
          {resolvedSearchParams.process_error}
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="min-w-0">
          <ImportUploadPanel />
        </div>

        <div className="dw-card space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">
                Usage Dashboard
              </p>
              <h2 className="mt-1 text-lg font-semibold text-slate-900">
                REcolorado import limits
              </h2>
            </div>

            <div className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] uppercase tracking-[0.14em] text-slate-600">
              75,000 / 30 days
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <div className="dw-card-tight">
              <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500">
                Rolling 30 Days
              </p>
              <p className="mt-1 text-2xl font-semibold text-slate-900">
                {rolling30Total.toLocaleString()}
              </p>
            </div>

            <div className="dw-card-tight">
              <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500">
                Remaining Capacity
              </p>
              <p className="mt-1 text-2xl font-semibold text-slate-900">
                {remaining30DayCapacity.toLocaleString()}
              </p>
            </div>

            <div className="dw-card-tight">
              <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500">
                Today
              </p>
              <p className="mt-1 text-2xl font-semibold text-slate-900">
                {todayTotal.toLocaleString()}
              </p>
            </div>

            <div className="dw-card-tight">
              <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500">
                Yesterday
              </p>
              <p className="mt-1 text-xl font-semibold text-slate-900">
                {yesterdayTotal.toLocaleString()}
              </p>
            </div>

            <div className="dw-card-tight">
              <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500">
                7-Day Avg / Day
              </p>
              <p className="mt-1 text-xl font-semibold text-slate-900">
                {Math.round(average7Day).toLocaleString()}
              </p>
            </div>

            <div className="dw-card-tight">
              <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500">
                30-Day Avg / Day
              </p>
              <p className="mt-1 text-xl font-semibold text-slate-900">
                {Math.round(average30Day).toLocaleString()}
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-600">
              <span>30-day limit utilization</span>
              <span>{utilizationPercent}%</span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-slate-200">
              <div
                className={`h-full rounded-full ${
                  utilizationPercent >= 100
                    ? "bg-red-600"
                    : utilizationPercent >= 85
                      ? "bg-amber-500"
                      : "bg-emerald-600"
                }`}
                style={{ width: `${utilizationPercent}%` }}
              />
            </div>
          </div>

          <div className={`text-sm ${summaryToneClass}`}>{summaryMessage}</div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">
                Last 60 Days
              </p>
              <p className="text-[11px] text-slate-500">
                Daily imported records
              </p>
            </div>

            <div className="dw-card-tight">
              <div className="relative h-36">
                <div className="absolute inset-0 flex items-end gap-[2px]">
                  {chartDays.map((day) => {
                    const heightPercent =
                      day.total > 0
                        ? Math.max(4, (day.total / maxChartValue) * 100)
                        : 2;

                    return (
                      <div
                        key={day.key}
                        className="flex-1 rounded-t-[2px] bg-slate-400 transition-colors hover:bg-slate-700"
                        style={{ height: `${heightPercent}%` }}
                        title={`${day.key}: ${day.total.toLocaleString()} records`}
                      />
                    );
                  })}
                </div>
              </div>

              <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
                <span>{chartDays[0]?.label}</span>
                <span>60-day window</span>
                <span>{chartDays[chartDays.length - 1]?.label}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Import batches table */}
      <div className="dw-card space-y-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">
            Recent Import Batches
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Track batch progress, resume partially processed batches, and
            monitor row-level completion.
          </p>
        </div>

        <div className="dw-table-wrap">
          <table className="dw-table">
            <thead>
              <tr>
                <th>Created</th>
                <th>Status</th>
                <th>Source</th>
                <th>Profile</th>
                <th>Files</th>
                <th>Total Rows</th>
                <th>Processed</th>
                <th>Remaining</th>
                <th>Errors</th>
                <th>Notes</th>
                <th>Screening</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {progressRows.length > 0 ? (
                progressRows.map((batch) => {
                  const canResume = (batch.remaining_validated_rows ?? 0) > 0;
                  const actionLabel =
                    (batch.processed_rows ?? 0) > 0 ? "Resume" : "Process";

                  return (
                    <tr key={batch.id}>
                      <td>{new Date(batch.created_at).toLocaleString()}</td>
                      <td>{batch.status}</td>
                      <td>{batch.source_system}</td>
                      <td>{batch.import_profile}</td>
                      <td>{batch.file_count ?? "—"}</td>
                      <td>{batch.total_row_count ?? 0}</td>
                      <td>
                        <div className="min-w-[120px]">
                          <div className="text-xs text-slate-700">
                            {(batch.processed_rows ?? 0).toLocaleString()} /{" "}
                            {(batch.total_row_count ?? 0).toLocaleString()}
                          </div>
                          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-200">
                            <div
                              className="h-full rounded-full bg-slate-700"
                              style={{
                                width: `${Math.min(
                                  100,
                                  Number(batch.processed_pct ?? 0),
                                )}%`,
                              }}
                            />
                          </div>
                        </div>
                      </td>
                      <td>{batch.remaining_validated_rows ?? 0}</td>
                      <td>
                        {(batch.processing_error_rows ?? 0) +
                          (batch.validation_error_rows ?? 0)}
                      </td>
                      <td>{batch.import_notes ?? "—"}</td>
                      <td>
                        {(() => {
                          const linked = screeningByImport.get(batch.id);
                          if (linked) {
                            return (
                              <Link
                                href={`/intake/screening/${linked.id}`}
                                className="text-xs text-blue-600 hover:underline"
                              >
                                {linked.status === "complete"
                                  ? `${linked.screenedCount} screened · ${linked.primeCount} prime`
                                  : linked.status}
                              </Link>
                            );
                          }
                          if (batch.status === "complete") {
                            return (
                              <form action={runImportScreeningAction}>
                                <input
                                  type="hidden"
                                  name="import_batch_id"
                                  value={batch.id}
                                />
                                <button
                                  type="submit"
                                  className="text-xs font-medium text-blue-700 hover:underline"
                                >
                                  Screen
                                </button>
                              </form>
                            );
                          }
                          return (
                            <span className="text-[11px] text-slate-400">—</span>
                          );
                        })()}
                      </td>
                      <td>
                        {canResume ? (
                          <form action={processImportBatchAction}>
                            <input
                              type="hidden"
                              name="batch_id"
                              value={batch.id}
                            />
                            <button type="submit" className="dw-button-primary">
                              {actionLabel}
                            </button>
                          </form>
                        ) : (
                          <span className="text-[11px] uppercase tracking-[0.14em] text-slate-500">
                            Complete
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={12} className="text-slate-500">
                    No batches yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Screening batch management */}
      <div className="dw-card space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              Deal Screening
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Screen properties through the fix-and-flip pipeline to identify
              Prime Candidates.
            </p>
          </div>
        </div>

        {/* Dataset overview */}
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <h3 className="mb-2 text-sm font-semibold text-slate-800">
            Dataset Overview
          </h3>
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {sortedStatusCounts.map(
              (sc: { mls_status: string; property_count: number }) => (
                <div key={sc.mls_status} className="rounded-lg border border-slate-200 bg-white px-3 py-2">
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
            <input type="hidden" name="name" value="Coming Soon Screen" />
            <input type="hidden" name="status_filter" value="Coming Soon" />
            <button type="submit" className="dw-button-secondary w-full">
              Screen All Coming Soon
            </button>
          </form>

          <form action={runScreeningAction}>
            <input type="hidden" name="name" value="Active + Coming Soon Screen" />
            <input type="hidden" name="status_filter" value="Active,Coming Soon" />
            <button type="submit" className="dw-button-secondary w-full">
              Screen All Both
            </button>
          </form>
        </div>

        {/* Summary stats */}
        <div className="grid gap-3 sm:grid-cols-3">
          <StatCard label="Total Screened (all batches)" value={formatNumber(totalScreened)} />
          <StatCard label="Prime Candidates Found" value={formatNumber(totalPrime)} />
          <StatCard label="Screening Batches" value={formatNumber(screeningBatches?.length ?? 0)} />
        </div>

        {/* Screening batches table */}
        {screeningBatches && screeningBatches.length > 0 && (
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
                {screeningBatches.map(
                  (sb: {
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
                    <tr key={sb.id}>
                      <td className="font-medium">
                        <Link
                          href={`/intake/screening/${sb.id}`}
                          className="text-blue-700 hover:underline"
                        >
                          {sb.name}
                        </Link>
                      </td>
                      <td>
                        <StatusBadge status={sb.status} />
                      </td>
                      <td className="text-slate-500">
                        {sb.trigger_type === "import" ? "Import" : sb.trigger_type}
                      </td>
                      <td className="text-right">
                        {formatNumber(sb.total_subjects)}
                      </td>
                      <td className="text-right">
                        {formatNumber(sb.screened_count)}
                      </td>
                      <td className="text-right font-semibold text-emerald-700">
                        {formatNumber(sb.prime_candidate_count)}
                      </td>
                      <td className="text-slate-500">
                        {formatDate(sb.created_at)}
                      </td>
                      <td className="text-slate-500">
                        {formatDate(sb.completed_at)}
                      </td>
                      <td>
                        <Link
                          href={`/intake/screening/${sb.id}`}
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

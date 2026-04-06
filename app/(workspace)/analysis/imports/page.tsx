import Link from "next/link";
import { ImportUploadPanel } from "@/components/imports/import-upload-panel";
import { createClient } from "@/lib/supabase/server";
import { runImportScreeningAction } from "@/app/(workspace)/analysis/screening/actions";
import { processImportBatchAction } from "./actions";

const ROLLING_LIMIT_30_DAY = 75_000;
const DAILY_AVERAGE_LIMIT = ROLLING_LIMIT_30_DAY / 30;

type ImportsPageProps = {
  searchParams?: Promise<{
    processed?: string;
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
  const { data: screeningBatches } = await supabase
    .from("screening_batches")
    .select("id, source_import_batch_id, status, prime_candidate_count, screened_count")
    .not("source_import_batch_id", "is", null);

  const screeningByImport = new Map<
    string,
    { id: string; status: string; primeCount: number; screenedCount: number }
  >();
  for (const sb of screeningBatches ?? []) {
    screeningByImport.set(sb.source_import_batch_id, {
      id: sb.id,
      status: sb.status,
      primeCount: sb.prime_candidate_count ?? 0,
      screenedCount: sb.screened_count ?? 0,
    });
  }

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
          Upload one or more REcolorado CSV files, validate them, stage them,
          and process them into core tables.
        </p>
      </div>

      {resolvedSearchParams?.processed === "1" ? (
        <div className="dw-card-tight border-emerald-200 bg-emerald-50 text-sm text-emerald-800 flex items-center justify-between">
          <span>
            Batch processed successfully.
            {resolvedSearchParams?.batch ? (
              <span className="ml-2 font-mono text-emerald-900">
                {resolvedSearchParams.batch}
              </span>
            ) : null}
          </span>
          {resolvedSearchParams?.batch ? (
            <form action={runImportScreeningAction}>
              <input
                type="hidden"
                name="import_batch_id"
                value={resolvedSearchParams.batch}
              />
              <button type="submit" className="dw-button-primary">
                Screen Imported Listings
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
              <div className="flex h-36 items-end gap-[2px]">
                {chartDays.map((day) => {
                  const heightPercent =
                    day.total > 0
                      ? Math.max(4, (day.total / maxChartValue) * 100)
                      : 2;

                  return (
                    <div
                      key={day.key}
                      className="group flex-1"
                      title={`${day.key}: ${day.total.toLocaleString()} records`}
                    >
                      <div
                        className="w-full rounded-t-[2px] bg-slate-400 transition-colors group-hover:bg-slate-700"
                        style={{ height: `${heightPercent}%` }}
                      />
                    </div>
                  );
                })}
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

      <div className="dw-card space-y-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">
            Recent batches
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
                                href={`/analysis/screening/${linked.id}`}
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
    </section>
  );
}

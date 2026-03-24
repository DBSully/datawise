import { createClient } from "@/lib/supabase/server";
import { ImportUploadPanel } from "@/components/imports/import-upload-panel";
import { processImportBatchAction } from "./actions";

type ImportsPageProps = {
  searchParams?: Promise<{
    processed?: string;
    batch?: string;
    process_error?: string;
  }>;
};

export default async function ImportsPage({ searchParams }: ImportsPageProps) {
  const params = searchParams ? await searchParams : undefined;
  const processed = params?.processed === "1";
  const batchId = params?.batch ?? null;
  const processError = params?.process_error ?? null;

  const supabase = await createClient();

  const { data: recentBatches, error } = await supabase
    .from("import_batches")
    .select(
      `
      id,
      source_system,
      import_profile,
      import_notes,
      total_row_count,
      unique_listing_count,
      unique_property_count,
      file_count,
      status,
      created_at,
      completed_at
    `,
    )
    .order("created_at", { ascending: false })
    .limit(10);

  if (error) {
    throw new Error(error.message);
  }

  return (
    <section className="dw-section-stack">
      <div>
        <h1 className="dw-page-title">Imports</h1>
        <p className="dw-page-copy">
          Upload one or more REcolorado CSV files, validate them, stage them, and process them into core tables.
        </p>
      </div>

      {processed ? (
        <div className="dw-card-tight border-emerald-200 bg-emerald-50 text-sm text-emerald-800">
          Batch {batchId ? <span className="font-mono">{batchId}</span> : null} processed successfully.
        </div>
      ) : null}

      {processError ? (
        <div className="dw-card-tight border-red-200 bg-red-50 text-sm text-red-800">
          {processError}
        </div>
      ) : null}

      <ImportUploadPanel />

      <div className="dw-card space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Recent batches</h2>
            <p className="mt-1 text-sm text-slate-600">
              Staged batches can be processed into `mls_listings`, `real_properties`, `property_physical`, and `property_financials`.
            </p>
          </div>
        </div>

        {recentBatches && recentBatches.length > 0 ? (
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
                  <th>Unique Listings</th>
                  <th>Unique Properties</th>
                  <th>Notes</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {recentBatches.map((batch) => {
                  const canProcess = ["staged", "processed_with_errors"].includes(batch.status);

                  return (
                    <tr key={batch.id}>
                      <td>{new Date(batch.created_at).toLocaleString()}</td>
                      <td>{batch.status}</td>
                      <td>{batch.source_system}</td>
                      <td>{batch.import_profile}</td>
                      <td>{batch.file_count ?? "—"}</td>
                      <td>{batch.total_row_count ?? "—"}</td>
                      <td>{batch.unique_listing_count ?? "—"}</td>
                      <td>{batch.unique_property_count ?? "—"}</td>
                      <td>{batch.import_notes ?? "—"}</td>
                      <td>
                        {canProcess ? (
                          <form action={processImportBatchAction}>
                            <input type="hidden" name="batch_id" value={batch.id} />
                            <button type="submit" className="dw-button-primary">
                              Process
                            </button>
                          </form>
                        ) : (
                          <span className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
                            Complete
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-600">
            No import batches yet.
          </div>
        )}
      </div>
    </section>
  );
}

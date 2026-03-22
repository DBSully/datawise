export default function ImportsPage() {
  return (
    <main className="mx-auto max-w-6xl px-6 py-12">
      <div className="mb-8">
        <p className="text-sm uppercase tracking-[0.2em] text-slate-500">Imports</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
          Source ingestion hub
        </h1>
        <p className="mt-3 max-w-3xl text-slate-600">
          Start with manual Excel uploads. Keep the pipeline shaped so MLS Grid API,
          public-record feeds, and manual entry can all land in the same downstream model.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-medium text-slate-900">Upload pipeline</h2>
          <p className="mt-2 text-sm text-slate-600">
            Placeholder for source uploads, validation, mapping review, and import status.
          </p>
        </section>
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-medium text-slate-900">Import history</h2>
          <p className="mt-2 text-sm text-slate-600">
            Placeholder for batch history, row counts, errors, and successful upserts.
          </p>
        </section>
      </div>
    </main>
  );
}

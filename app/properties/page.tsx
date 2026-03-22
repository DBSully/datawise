export default function PropertiesPage() {
  return (
    <main className="mx-auto max-w-6xl px-6 py-12">
      <div className="mb-8">
        <p className="text-sm uppercase tracking-[0.2em] text-slate-500">Properties</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
          Canonical real property records
        </h1>
        <p className="mt-3 max-w-3xl text-slate-600">
          This page will become the searchable directory of DataWise property records.
          The initial version can be simple: search box, filters, and a table of results.
        </p>
      </div>

      <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-slate-600">
        Placeholder for property search, filters, and results.
      </div>
    </main>
  );
}

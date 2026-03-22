export default function NewPropertyPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <div className="mb-8">
        <p className="text-sm uppercase tracking-[0.2em] text-slate-500">New Property</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
          Create a real property manually
        </h1>
        <p className="mt-3 text-slate-600">
          This form will be your source-agnostic fallback. If MLS or public records are
          unavailable, you can still create the canonical property record directly.
        </p>
      </div>

      <form className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Unparsed address</label>
          <input className="w-full rounded-lg border border-slate-300 px-3 py-2" placeholder="5601 E Nichols Pl" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">City</label>
            <input className="w-full rounded-lg border border-slate-300 px-3 py-2" placeholder="Centennial" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">State</label>
            <input className="w-full rounded-lg border border-slate-300 px-3 py-2" placeholder="CO" />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Postal code</label>
            <input className="w-full rounded-lg border border-slate-300 px-3 py-2" placeholder="80112" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Unit number</label>
            <input className="w-full rounded-lg border border-slate-300 px-3 py-2" placeholder="310" />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Latitude</label>
            <input className="w-full rounded-lg border border-slate-300 px-3 py-2" placeholder="39.5708" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Longitude</label>
            <input className="w-full rounded-lg border border-slate-300 px-3 py-2" placeholder="-104.9226" />
          </div>
        </div>
        <button
          type="button"
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white"
        >
          Save property
        </button>
      </form>
    </main>
  );
}

export function PropertySearch() {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <label className="mb-2 block text-sm font-medium text-slate-700">Search properties</label>
      <input
        className="w-full rounded-lg border border-slate-300 px-3 py-2"
        placeholder="Search by address, parcel ID, or public code"
      />
    </div>
  );
}

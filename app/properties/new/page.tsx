// app/properties/new/page.tsx
import { createPropertyAction } from "./actions";

type NewPropertyPageProps = {
  searchParams?: Promise<{ created?: string }>;
};

export default async function NewPropertyPage({
  searchParams,
}: NewPropertyPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const created = resolvedSearchParams?.created === "1";

  const inputClassName =
    "w-full rounded-lg border border-slate-400 bg-white px-3 py-2 text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-200";

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-12 text-slate-900">
      <div className="mx-auto max-w-3xl">
        <div className="mb-8">
          <p className="text-sm uppercase tracking-[0.2em] text-slate-500">
            New Property
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
            Create a real property manually
          </h1>
          <p className="mt-3 text-slate-600">
            This form will be your source-agnostic fallback. If MLS or public
            records are unavailable, you can still create the canonical property
            record directly.
          </p>
        </div>

        {created ? (
          <div className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            Property saved successfully.
          </div>
        ) : null}

        <form
          action={createPropertyAction}
          className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
        >
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Unparsed address
            </label>
            <input
              name="unparsed_address"
              className={inputClassName}
              placeholder="5601 E Nichols Pl"
              required
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                City
              </label>
              <input
                name="city"
                className={inputClassName}
                placeholder="Centennial"
                required
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                State
              </label>
              <input
                name="state"
                className={inputClassName}
                placeholder="CO"
                required
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Postal code
              </label>
              <input
                name="postal_code"
                className={inputClassName}
                placeholder="80112"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Unit number
              </label>
              <input
                name="unit_number"
                className={inputClassName}
                placeholder="310"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Latitude
              </label>
              <input
                name="latitude"
                className={inputClassName}
                placeholder="39.5708"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Longitude
              </label>
              <input
                name="longitude"
                className={inputClassName}
                placeholder="-104.9226"
              />
            </div>
          </div>

          <button
            type="submit"
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Save property
          </button>
        </form>
      </div>
    </main>
  );
}

import { createPropertyAction } from "./actions";

type NewPropertyPageProps = {
  searchParams?: Promise<{ created?: string }>;
};

export default async function NewPropertyPage({
  searchParams,
}: NewPropertyPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const created = resolvedSearchParams?.created === "1";

  return (
    <section className="dw-section-stack">
      <div>
        <h1 className="dw-page-title">Create a real property manually</h1>
        <p className="dw-page-copy">
          This is the source-agnostic fallback for creating canonical property
          records.
        </p>
      </div>

      {created ? (
        <div className="dw-card-tight border-emerald-200 bg-emerald-50 text-sm text-emerald-800">
          Property saved successfully.
        </div>
      ) : null}

      <form action={createPropertyAction} className="dw-card space-y-4">
        <div>
          <label className="dw-label">Unparsed address</label>
          <input
            name="unparsed_address"
            className="dw-input"
            placeholder="5601 E Nichols Pl"
            required
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="dw-label">City</label>
            <input
              name="city"
              className="dw-input"
              placeholder="Centennial"
              required
            />
          </div>

          <div>
            <label className="dw-label">State</label>
            <input
              name="state"
              className="dw-input"
              placeholder="CO"
              required
            />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="dw-label">Postal code</label>
            <input
              name="postal_code"
              className="dw-input"
              placeholder="80112"
            />
          </div>

          <div>
            <label className="dw-label">Unit number</label>
            <input name="unit_number" className="dw-input" placeholder="310" />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="dw-label">Latitude</label>
            <input name="latitude" className="dw-input" placeholder="39.5708" />
          </div>

          <div>
            <label className="dw-label">Longitude</label>
            <input
              name="longitude"
              className="dw-input"
              placeholder="-104.9226"
            />
          </div>
        </div>

        <div className="pt-1">
          <button type="submit" className="dw-button-primary">
            Save property
          </button>
        </div>
      </form>
    </section>
  );
}

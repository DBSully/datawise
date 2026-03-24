import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export default async function PropertiesPage() {
  const supabase = await createClient();

  const { data: properties, error } = await supabase
    .from("real_properties")
    .select(
      `
      id,
      unparsed_address,
      city,
      state,
      postal_code,
      unit_number,
      created_at
    `,
    )
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (
    <section className="dw-section-stack">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="dw-page-title">Saved property records</h1>
          <p className="dw-page-copy">
            Canonical DataWise property records created through the app.
          </p>
        </div>

        <Link href="/analysis/properties/new" className="dw-button-primary">
          New property
        </Link>
      </div>

      {properties && properties.length > 0 ? (
        <div className="dw-table-wrap">
          <table className="dw-table">
            <thead>
              <tr>
                <th>Address</th>
                <th>City</th>
                <th>State</th>
                <th>Postal Code</th>
                <th>Unit</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {properties.map((property) => (
                <tr key={property.id}>
                  <td>{property.unparsed_address}</td>
                  <td>{property.city}</td>
                  <td>{property.state}</td>
                  <td>{property.postal_code ?? "—"}</td>
                  <td>{property.unit_number ?? "—"}</td>
                  <td>{new Date(property.created_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="dw-card">
          <p className="text-sm text-slate-600">No properties yet.</p>
        </div>
      )}
    </section>
  );
}

// /app/properties/page.tsx

import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function PropertiesPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/sign-in");
  }

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
    <main className="min-h-screen bg-slate-50 px-6 py-12 text-slate-900">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-slate-500">
              Properties
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
              Saved property records
            </h1>
            <p className="mt-3 text-slate-600">
              These are canonical DataWise property records created through the
              app.
            </p>
          </div>

          <Link
            href="/properties/new"
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            New property
          </Link>
        </div>

        {properties && properties.length > 0 ? (
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-100">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">
                    Address
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">
                    City
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">
                    State
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">
                    Postal Code
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">
                    Unit
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">
                    Created
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {properties.map((property) => (
                  <tr key={property.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-sm text-slate-900">
                      {property.unparsed_address}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-700">
                      {property.city}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-700">
                      {property.state}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-700">
                      {property.postal_code ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-700">
                      {property.unit_number ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-700">
                      {new Date(property.created_at).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-slate-600 shadow-sm">
            No properties yet.
          </div>
        )}
      </div>
    </main>
  );
}

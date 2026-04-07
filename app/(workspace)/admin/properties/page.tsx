import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const PAGE_SIZE = 200;

type PropertiesPageProps = {
  searchParams?: Promise<{
    city?: string;
    listingStatus?: string;
    propertyType?: string;
    sort?: string;
    page?: string;
  }>;
};

function buildHref(params: Record<string, string | undefined>) {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value && value !== "all") {
      search.set(key, value);
    }
  }

  const queryString = search.toString();
  return queryString
    ? `/admin/properties?${queryString}`
    : "/admin/properties";
}

export const dynamic = "force-dynamic";

export default async function PropertiesPage({
  searchParams,
}: PropertiesPageProps) {
  noStore();

  const resolvedSearchParams = searchParams ? await searchParams : undefined;

  const cityFilter = resolvedSearchParams?.city ?? "all";
  const listingStatusFilter = resolvedSearchParams?.listingStatus ?? "all";
  const propertyTypeFilter = resolvedSearchParams?.propertyType ?? "all";
  const sort = resolvedSearchParams?.sort ?? "import_date_desc";
  const page = Math.max(1, Number(resolvedSearchParams?.page ?? "1") || 1);

  const supabase = await createClient();

  const [
    { data: cityRows, error: cityError },
    { data: listingStatusRows, error: listingStatusError },
    { data: propertyTypeRows, error: propertyTypeError },
  ] = await Promise.all([
    supabase
      .from("property_city_options_v")
      .select("city")
      .order("city", { ascending: true })
      .range(0, 5000),

    supabase
      .from("property_status_options_v")
      .select("listing_status")
      .order("listing_status", { ascending: true })
      .range(0, 5000),

    supabase
      .from("property_type_options_v")
      .select("property_type")
      .order("property_type", { ascending: true })
      .range(0, 5000),
  ]);

  if (cityError) throw new Error(cityError.message);
  if (listingStatusError) throw new Error(listingStatusError.message);
  if (propertyTypeError) throw new Error(propertyTypeError.message);

  const cities = (cityRows ?? [])
    .map((row) => row.city)
    .filter((value): value is string => Boolean(value));

  const listingStatuses = (listingStatusRows ?? [])
    .map((row) => row.listing_status)
    .filter((value): value is string => Boolean(value));

  const propertyTypes = (propertyTypeRows ?? [])
    .map((row) => row.property_type)
    .filter((value): value is string => Boolean(value));

  let query = supabase.from("property_browser_v").select(
    `
      real_property_id,
      unparsed_address,
      city,
      state,
      postal_code,
      unit_number,
      property_type,
      latest_listing_status,
      latest_list_price,
      latest_listing_date,
      latest_imported_at
    `,
    { count: "exact" },
  );

  if (cityFilter !== "all") {
    query = query.eq("city", cityFilter);
  }

  if (listingStatusFilter !== "all") {
    query = query.eq("latest_listing_status", listingStatusFilter);
  }

  if (propertyTypeFilter !== "all") {
    query = query.eq("property_type", propertyTypeFilter);
  }

  switch (sort) {
    case "listing_date_asc":
      query = query.order("latest_listing_date", {
        ascending: true,
        nullsFirst: false,
      });
      break;
    case "listing_date_desc":
      query = query.order("latest_listing_date", {
        ascending: false,
        nullsFirst: false,
      });
      break;
    case "import_date_asc":
      query = query.order("latest_imported_at", {
        ascending: true,
        nullsFirst: false,
      });
      break;
    case "import_date_desc":
    default:
      query = query.order("latest_imported_at", {
        ascending: false,
        nullsFirst: false,
      });
      break;
  }

  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const { data: properties, error, count } = await query.range(from, to);

  if (error) {
    throw new Error(error.message);
  }

  const totalRows = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));

  const previousPageHref = buildHref({
    city: cityFilter,
    listingStatus: listingStatusFilter,
    propertyType: propertyTypeFilter,
    sort,
    page: String(Math.max(1, page - 1)),
  });

  const nextPageHref = buildHref({
    city: cityFilter,
    listingStatus: listingStatusFilter,
    propertyType: propertyTypeFilter,
    sort,
    page: String(Math.min(totalPages, page + 1)),
  });

  const clearFiltersHref = "/admin/properties";

  return (
    <section className="dw-section-stack-compact">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="dw-page-title">Saved property records</h1>
          <p className="dw-page-copy">
            Browse imported and manually created canonical DataWise property
            records.
          </p>
        </div>

        <Link href="/admin/properties/new" className="dw-button-primary">
          New property
        </Link>
      </div>

      <div className="dw-card-tight text-xs text-slate-600">
        Filter options loaded: {cities.length} cities • {listingStatuses.length}{" "}
        statuses • {propertyTypes.length} property types
      </div>

      <form method="get" className="dw-card-tight">
        <div className="grid gap-3 xl:grid-cols-[1fr_1fr_1fr_1fr_auto_auto]">
          <div>
            <label className="dw-label">City</label>
            <select name="city" defaultValue={cityFilter} className="dw-select">
              <option value="all">All</option>
              {cities.map((city) => (
                <option key={city} value={city}>
                  {city}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="dw-label">Listing Status</label>
            <select
              name="listingStatus"
              defaultValue={listingStatusFilter}
              className="dw-select"
            >
              <option value="all">All</option>
              {listingStatuses.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="dw-label">Property Type</label>
            <select
              name="propertyType"
              defaultValue={propertyTypeFilter}
              className="dw-select"
            >
              <option value="all">All</option>
              {propertyTypes.map((propertyType) => (
                <option key={propertyType} value={propertyType}>
                  {propertyType}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="dw-label">Sort</label>
            <select name="sort" defaultValue={sort} className="dw-select">
              <option value="import_date_desc">Import Date ↓</option>
              <option value="import_date_asc">Import Date ↑</option>
              <option value="listing_date_desc">Listing Date ↓</option>
              <option value="listing_date_asc">Listing Date ↑</option>
            </select>
          </div>

          <div className="flex items-end">
            <button type="submit" className="dw-button-primary w-full">
              Apply
            </button>
          </div>

          <div className="flex items-end">
            <Link
              href={clearFiltersHref}
              className="dw-button-secondary w-full"
            >
              Clear
            </Link>
          </div>
        </div>
      </form>

      <div className="flex items-center justify-between gap-4 text-sm text-slate-600">
        <div>
          Showing {(properties ?? []).length.toLocaleString()} of{" "}
          {totalRows.toLocaleString()} properties
        </div>
        <div>
          Page {page} of {totalPages}
        </div>
      </div>

      {properties && properties.length > 0 ? (
        <div className="dw-table-wrap">
          <table className="dw-table-compact">
            <thead>
              <tr>
                <th>Address</th>
                <th>City</th>
                <th>Type</th>
                <th>Status</th>
                <th>Latest List Price</th>
                <th>Listing Date</th>
                <th>Imported</th>
                <th>Open</th>
              </tr>
            </thead>
            <tbody>
              {properties.map((property) => (
                <tr key={property.real_property_id}>
                  <td>
                    <Link
                      href={`/admin/properties/${property.real_property_id}`}
                      className="font-medium text-slate-900 hover:underline"
                    >
                      {property.unparsed_address}
                    </Link>
                  </td>
                  <td>{property.city}</td>
                  <td>{property.property_type ?? "—"}</td>
                  <td>{property.latest_listing_status ?? "—"}</td>
                  <td>
                    {property.latest_list_price !== null &&
                    property.latest_list_price !== undefined
                      ? new Intl.NumberFormat("en-US", {
                          style: "currency",
                          currency: "USD",
                          maximumFractionDigits: 0,
                        }).format(property.latest_list_price)
                      : "—"}
                  </td>
                  <td>
                    {property.latest_listing_date
                      ? new Date(
                          property.latest_listing_date,
                        ).toLocaleDateString()
                      : "—"}
                  </td>
                  <td>
                    {property.latest_imported_at
                      ? new Date(
                          property.latest_imported_at,
                        ).toLocaleDateString()
                      : "—"}
                  </td>
                  <td>
                    <Link
                      href={`/admin/properties/${property.real_property_id}`}
                      className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-600 hover:text-slate-900"
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="dw-card">
          <p className="text-sm text-slate-600">
            No properties matched the current filters.
          </p>
        </div>
      )}

      <div className="flex items-center justify-between gap-4">
        <Link
          href={page > 1 ? previousPageHref : "#"}
          className={`dw-button-secondary ${page <= 1 ? "pointer-events-none opacity-50" : ""}`}
        >
          Previous
        </Link>

        <Link
          href={page < totalPages ? nextPageHref : "#"}
          className={`dw-button-secondary ${page >= totalPages ? "pointer-events-none opacity-50" : ""}`}
        >
          Next
        </Link>
      </div>
    </section>
  );
}

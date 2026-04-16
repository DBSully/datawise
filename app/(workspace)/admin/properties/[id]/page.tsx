import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAnalysisScenarioAction } from "@/app/(workspace)/deals/actions";
import { LocalTimestamp } from "@/components/common/local-timestamp";

type PropertyHubPageProps = {
  params: Promise<{ id: string }>;
};

function formatCurrency(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatNumber(value: number | null | undefined, decimals = 0) {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

function DetailItem({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="dw-detail-item">
      <div className="dw-detail-label">{label}</div>
      <div className="dw-detail-value">{value}</div>
    </div>
  );
}

function StatChip({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm">
      <div className="text-[10px] uppercase tracking-[0.14em] text-slate-500">
        {label}
      </div>
      <div className="mt-1 text-sm font-semibold text-slate-900">{value}</div>
    </div>
  );
}

const strategyButtons = [
  { strategy: "flip", label: "New Flip Analysis" },
  { strategy: "rental", label: "New Rental Analysis" },
  { strategy: "wholesale", label: "New Wholesale Analysis" },
  { strategy: "listing", label: "New Listing Analysis" },
  { strategy: "new_build", label: "New Build Analysis" },
];

export default async function PropertyHubPage({
  params,
}: PropertyHubPageProps) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: property, error: propertyError } = await supabase
    .from("real_properties")
    .select(
      `
      id,
      public_code,
      unparsed_address,
      city,
      county,
      state,
      postal_code,
      unit_number,
      parcel_id,
      lot_size_sqft,
      lot_size_acres,
      created_at,
      updated_at
    `,
    )
    .eq("id", id)
    .maybeSingle();

  if (propertyError) throw new Error(propertyError.message);
  if (!property) notFound();

  const [
    { data: physical, error: physicalError },
    { data: listings, error: listingsError },
    { data: analyses, error: analysesError },
  ] = await Promise.all([
    supabase
      .from("property_physical")
      .select(
        `
        property_type,
        property_sub_type,
        structure_type,
        level_class_standardized,
        bedrooms_total,
        bathrooms_total,
        garage_spaces,
        year_built,
        above_grade_finished_area_sqft
      `,
      )
      .eq("real_property_id", id)
      .maybeSingle(),

    supabase
      .from("mls_listings")
      .select(
        `
        id,
        listing_id,
        mls_status,
        list_price,
        close_price,
        listing_contract_date,
        created_at
      `,
      )
      .eq("real_property_id", id)
      .order("listing_contract_date", { ascending: false, nullsFirst: true })
      .order("created_at", { ascending: false }),

    supabase
      .from("analyses")
      .select(
        `
        id,
        scenario_name,
        strategy_type,
        status,
        created_by_user_id,
        created_at,
        updated_at,
        listing_id
      `,
      )
      .eq("real_property_id", id)
      .eq("created_by_user_id", user?.id ?? "")
      .eq("is_archived", false)
      .order("updated_at", { ascending: false }),
  ]);

  if (physicalError) throw new Error(physicalError.message);
  if (listingsError) throw new Error(listingsError.message);
  if (analysesError) throw new Error(analysesError.message);

  const latestListing = listings?.[0] ?? null;

  return (
    <section className="dw-section-stack-compact">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="mb-1">
            <Link
              href="/admin/properties"
              className="text-[11px] uppercase tracking-[0.16em] text-slate-500 hover:text-slate-900"
            >
              ← Back to Properties
            </Link>
          </div>

          <h1 className="dw-page-title">{property.unparsed_address}</h1>
          <p className="dw-page-copy">
            Property hub for subject facts, scenario creation, and analysis
            navigation.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {property.public_code ? (
            <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-medium uppercase tracking-[0.14em] text-slate-600">
              {property.public_code}
            </span>
          ) : null}
          <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-medium uppercase tracking-[0.14em] text-slate-600">
            Property Hub
          </span>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-7">
        <StatChip label="Type" value={physical?.property_type ?? "—"} />
        <StatChip
          label="Beds / Baths"
          value={`${formatNumber(physical?.bedrooms_total as number | null)} / ${formatNumber(
            physical?.bathrooms_total as number | null,
            1,
          )}`}
        />
        <StatChip
          label="Above Grade"
          value={formatNumber(
            physical?.above_grade_finished_area_sqft as number | null,
          )}
        />
        <StatChip
          label="Lot Sq Ft"
          value={formatNumber(property.lot_size_sqft as number | null)}
        />
        <StatChip
          label="Year Built"
          value={formatNumber(physical?.year_built as number | null)}
        />
        <StatChip
          label="Latest List Price"
          value={formatCurrency(latestListing?.list_price as number | null)}
        />
        <StatChip
          label="Latest Status"
          value={latestListing?.mls_status ?? "—"}
        />
      </div>

      <div className="grid gap-3 xl:grid-cols-[0.85fr_1.15fr]">
        <div className="dw-card-compact space-y-3">
          <div className="dw-card-header-compact">
            <h2 className="dw-card-title-compact">Subject Snapshot</h2>
            <p className="dw-card-copy-compact">
              High-level subject property facts for strategy selection.
            </p>
          </div>

          <div className="dw-detail-grid">
            <DetailItem
              label="Property Type"
              value={physical?.property_type ?? "—"}
            />
            <DetailItem
              label="Sub Type"
              value={physical?.property_sub_type ?? "—"}
            />
            <DetailItem
              label="Structure"
              value={physical?.structure_type ?? "—"}
            />
            <DetailItem
              label="Level Class"
              value={physical?.level_class_standardized ?? "—"}
            />
            <DetailItem
              label="Beds"
              value={formatNumber(physical?.bedrooms_total as number | null)}
            />
            <DetailItem
              label="Baths"
              value={formatNumber(
                physical?.bathrooms_total as number | null,
                1,
              )}
            />
            <DetailItem
              label="Garage"
              value={formatNumber(physical?.garage_spaces as number | null, 1)}
            />
            <DetailItem
              label="Year Built"
              value={formatNumber(physical?.year_built as number | null)}
            />
            <DetailItem label="Parcel ID" value={property.parcel_id ?? "—"} />
            <DetailItem label="City" value={property.city} />
            <DetailItem label="County" value={property.county ?? "—"} />
            <DetailItem
              label="Latest MLS#"
              value={latestListing?.listing_id ?? "—"}
            />
          </div>
        </div>

        <div className="dw-card-compact space-y-3">
          <div className="dw-card-header-compact">
            <h2 className="dw-card-title-compact">Create Analysis Scenario</h2>
            <p className="dw-card-copy-compact">
              Start a separate scenario for a different strategy or
              recommendation path.
            </p>
          </div>

          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {strategyButtons.map((item) => (
              <form key={item.strategy} action={createAnalysisScenarioAction}>
                <input type="hidden" name="property_id" value={property.id} />
                <input
                  type="hidden"
                  name="listing_id"
                  value={latestListing?.listing_id ?? ""}
                />
                <input
                  type="hidden"
                  name="strategy_type"
                  value={item.strategy}
                />
                <button type="submit" className="dw-button-secondary w-full">
                  {item.label}
                </button>
              </form>
            ))}
          </div>
        </div>
      </div>

      <div className="dw-card-compact space-y-3">
        <div className="dw-card-header-compact">
          <h2 className="dw-card-title-compact">Your Analysis Scenarios</h2>
          <p className="dw-card-copy-compact">
            Each scenario is an independent strategy path for this property.
          </p>
        </div>

        {analyses && analyses.length > 0 ? (
          <div className="dw-table-wrap">
            <table className="dw-table-compact">
              <thead>
                <tr>
                  <th>Scenario</th>
                  <th>Strategy</th>
                  <th>Status</th>
                  <th>Updated</th>
                  <th>Overview</th>
                  <th>Comparables</th>
                </tr>
              </thead>
              <tbody>
                {analyses.map((analysis) => (
                  <tr key={analysis.id}>
                    <td>{analysis.scenario_name ?? "Untitled Analysis"}</td>
                    <td>{analysis.strategy_type ?? "general"}</td>
                    <td>{analysis.status ?? "draft"}</td>
                    <td><LocalTimestamp value={analysis.updated_at} /></td>
                    <td>
                      <Link
                        href={`/analysis/${analysis.id}`}
                        className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-600 hover:text-slate-900"
                      >
                        Open
                      </Link>
                    </td>
                    <td>
                      <Link
                        href={`/analysis/${analysis.id}/comparables`}
                        className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-600 hover:text-slate-900"
                      >
                        Open
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="dw-card-tight">
            <p className="text-sm text-slate-600">
              No analysis scenarios exist for this property yet. Create one to
              begin.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

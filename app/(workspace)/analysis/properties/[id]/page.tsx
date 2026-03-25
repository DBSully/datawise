import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ManualAnalysisPanel } from "@/components/properties/manual-analysis-panel";

type PropertyDetailPageProps = {
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

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString();
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

function DetailItem({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="dw-detail-item">
      <div className="dw-detail-label">{label}</div>
      <div className="dw-detail-value">{value}</div>
    </div>
  );
}

function StatChip({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm">
      <div className="text-[10px] uppercase tracking-[0.14em] text-slate-500">
        {label}
      </div>
      <div className="mt-1 text-sm font-semibold text-slate-900">{value}</div>
    </div>
  );
}

export default async function PropertyDetailPage({
  params,
}: PropertyDetailPageProps) {
  const { id } = await params;
  const supabase = await createClient();

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
      latitude,
      longitude,
      lot_size_sqft,
      lot_size_acres,
      normalized_address_key,
      address_slug,
      geocode_source,
      created_at,
      updated_at
    `,
    )
    .eq("id", id)
    .maybeSingle();

  if (propertyError) {
    throw new Error(propertyError.message);
  }

  if (!property) {
    notFound();
  }

  const [
    { data: physical, error: physicalError },
    { data: financials, error: financialsError },
    { data: listings, error: listingsError },
    { data: latestAnalysis, error: analysisError },
  ] = await Promise.all([
    supabase
      .from("property_physical")
      .select(
        `
        real_property_id,
        property_type,
        property_sub_type,
        structure_type,
        architectural_style,
        property_attached_yn,
        living_area_sqft,
        building_area_total_sqft,
        above_grade_finished_area_sqft,
        below_grade_total_sqft,
        below_grade_finished_area_sqft,
        below_grade_unfinished_area_sqft,
        basement_yn,
        bedrooms_total,
        bathrooms_total,
        garage_spaces,
        year_built,
        levels_raw,
        level_class_standardized,
        number_of_units_total,
        main_level_bedrooms,
        main_level_bathrooms,
        upper_level_bedrooms,
        upper_level_bathrooms,
        basement_level_bedrooms,
        basement_level_bathrooms,
        lower_level_bedrooms,
        lower_level_bathrooms,
        created_at,
        updated_at
      `,
      )
      .eq("real_property_id", id)
      .maybeSingle(),

    supabase
      .from("property_financials")
      .select(
        `
        real_property_id,
        annual_property_tax,
        annual_hoa_dues,
        source_system,
        source_record_id,
        created_at,
        updated_at
      `,
      )
      .eq("real_property_id", id)
      .maybeSingle(),

    supabase
      .from("mls_listings")
      .select(
        `
        id,
        source_system,
        listing_id,
        mls_status,
        mls_major_change_type,
        property_condition_source,
        original_list_price,
        list_price,
        close_price,
        concessions_amount,
        listing_contract_date,
        purchase_contract_date,
        close_date,
        subdivision_name,
        ownership_raw,
        occupant_type,
        elementary_school,
        list_agent_mls_id,
        buyer_agent_mls_id,
        created_at,
        updated_at
      `,
      )
      .eq("real_property_id", id)
      .order("created_at", { ascending: false }),

    supabase
      .from("analyses")
      .select(
        `
        id,
        listing_id,
        created_at,
        updated_at
      `,
      )
      .eq("real_property_id", id)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (physicalError) throw new Error(physicalError.message);
  if (financialsError) throw new Error(financialsError.message);
  if (listingsError) throw new Error(listingsError.message);
  if (analysisError) throw new Error(analysisError.message);

  const latestListing = listings?.[0] ?? null;

  let manualAnalysis: any = null;
  let pipeline: any = null;

  if (latestAnalysis?.id) {
    const [
      { data: manualAnalysisData, error: manualError },
      { data: pipelineData, error: pipelineError },
    ] = await Promise.all([
      supabase
        .from("manual_analysis")
        .select(
          `
          analysis_id,
          analyst_condition,
          update_year_est,
          update_quality,
          uad_condition_manual,
          uad_updates_manual,
          arv_manual,
          margin_manual,
          rehab_manual,
          days_held_manual,
          rent_estimate_monthly,
          design_rating,
          location_rating,
          created_at,
          updated_at
        `,
        )
        .eq("analysis_id", latestAnalysis.id)
        .maybeSingle(),

      supabase
        .from("analysis_pipeline")
        .select(
          `
          analysis_id,
          interest_level,
          showing_status,
          offer_status,
          created_at,
          updated_at
        `,
        )
        .eq("analysis_id", latestAnalysis.id)
        .maybeSingle(),
    ]);

    if (manualError) throw new Error(manualError.message);
    if (pipelineError) throw new Error(pipelineError.message);

    manualAnalysis = manualAnalysisData;
    pipeline = pipelineData;
  }

  return (
    <section className="dw-section-stack-compact">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="mb-1">
            <Link
              href="/analysis/properties"
              className="text-[11px] uppercase tracking-[0.16em] text-slate-500 hover:text-slate-900"
            >
              ← Back to Properties
            </Link>
          </div>

          <h1 className="dw-page-title">{property.unparsed_address}</h1>
          <p className="dw-page-copy">
            Compact property workspace for imported facts, manual analysis, and
            future comp review.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {property.public_code ? (
            <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-medium uppercase tracking-[0.14em] text-slate-600">
              {property.public_code}
            </span>
          ) : null}
          <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-medium uppercase tracking-[0.14em] text-slate-600">
            Workspace
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

      <div className="grid gap-3 xl:grid-cols-[0.95fr_1fr_1.05fr]">
        <div className="dw-section-stack-compact">
          <div className="dw-card-compact space-y-3">
            <div className="dw-card-header-compact">
              <h2 className="dw-card-title-compact">Subject Snapshot</h2>
              <p className="dw-card-copy-compact">
                High-visibility property facts for underwriting.
              </p>
            </div>

            <div className="space-y-2">
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                Core
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
                  value={formatNumber(
                    physical?.bedrooms_total as number | null,
                  )}
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
                  value={formatNumber(
                    physical?.garage_spaces as number | null,
                    1,
                  )}
                />
                <DetailItem
                  label="Year Built"
                  value={formatNumber(physical?.year_built as number | null)}
                />
                <DetailItem
                  label="Attached"
                  value={
                    physical?.property_attached_yn === null
                      ? "—"
                      : physical?.property_attached_yn
                        ? "Yes"
                        : "No"
                  }
                />
                <DetailItem
                  label="Parcel ID"
                  value={property.parcel_id ?? "—"}
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                Area Breakdown
              </div>
              <div className="dw-detail-grid">
                <DetailItem
                  label="Building Total"
                  value={formatNumber(
                    physical?.building_area_total_sqft as number | null,
                  )}
                />
                <DetailItem
                  label="Living Area"
                  value={formatNumber(
                    physical?.living_area_sqft as number | null,
                  )}
                />
                <DetailItem
                  label="Above Grade"
                  value={formatNumber(
                    physical?.above_grade_finished_area_sqft as number | null,
                  )}
                />
                <DetailItem
                  label="Below Grade Total"
                  value={formatNumber(
                    physical?.below_grade_total_sqft as number | null,
                  )}
                />
                <DetailItem
                  label="Below Finished"
                  value={formatNumber(
                    physical?.below_grade_finished_area_sqft as number | null,
                  )}
                />
                <DetailItem
                  label="Below Unfinished"
                  value={formatNumber(
                    physical?.below_grade_unfinished_area_sqft as number | null,
                  )}
                />
                <DetailItem
                  label="Main Beds"
                  value={formatNumber(
                    physical?.main_level_bedrooms as number | null,
                  )}
                />
                <DetailItem
                  label="Main Baths"
                  value={formatNumber(
                    physical?.main_level_bathrooms as number | null,
                    1,
                  )}
                />
                <DetailItem
                  label="Upper Beds"
                  value={formatNumber(
                    physical?.upper_level_bedrooms as number | null,
                  )}
                />
                <DetailItem
                  label="Upper Baths"
                  value={formatNumber(
                    physical?.upper_level_bathrooms as number | null,
                    1,
                  )}
                />
                <DetailItem
                  label="Lot Sq Ft"
                  value={formatNumber(property.lot_size_sqft as number | null)}
                />
                <DetailItem
                  label="Lot Acres"
                  value={formatNumber(
                    property.lot_size_acres as number | null,
                    4,
                  )}
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                Latest Listing Snapshot
              </div>
              <div className="dw-detail-grid">
                <DetailItem
                  label="Listing ID"
                  value={latestListing?.listing_id ?? "—"}
                />
                <DetailItem
                  label="Status"
                  value={latestListing?.mls_status ?? "—"}
                />
                <DetailItem
                  label="List Price"
                  value={formatCurrency(
                    latestListing?.list_price as number | null,
                  )}
                />
                <DetailItem
                  label="Close Price"
                  value={formatCurrency(
                    latestListing?.close_price as number | null,
                  )}
                />
                <DetailItem
                  label="Condition"
                  value={latestListing?.property_condition_source ?? "—"}
                />
                <DetailItem
                  label="Contract Date"
                  value={formatDate(latestListing?.listing_contract_date)}
                />
                <DetailItem
                  label="Annual Tax"
                  value={formatCurrency(
                    financials?.annual_property_tax as number | null,
                  )}
                />
                <DetailItem
                  label="Annual HOA"
                  value={formatCurrency(
                    financials?.annual_hoa_dues as number | null,
                  )}
                />
              </div>
            </div>
          </div>

          <details className="dw-card-compact">
            <summary className="cursor-pointer text-sm font-medium text-slate-700">
              Record metadata
            </summary>
            <div className="mt-3 dw-detail-grid">
              <DetailItem
                label="Property ID"
                value={
                  <span className="font-mono text-[11px]">{property.id}</span>
                }
              />
              <DetailItem
                label="Normalized Address Key"
                value={
                  <span className="font-mono text-[11px]">
                    {property.normalized_address_key}
                  </span>
                }
              />
              <DetailItem
                label="Address Slug"
                value={property.address_slug ?? "—"}
              />
              <DetailItem
                label="Latitude"
                value={formatNumber(property.latitude as number | null, 6)}
              />
              <DetailItem
                label="Longitude"
                value={formatNumber(property.longitude as number | null, 6)}
              />
              <DetailItem
                label="Geocode Source"
                value={property.geocode_source ?? "—"}
              />
              <DetailItem
                label="Created"
                value={formatDateTime(property.created_at)}
              />
              <DetailItem
                label="Updated"
                value={formatDateTime(property.updated_at)}
              />
            </div>
          </details>
        </div>

        <ManualAnalysisPanel
          propertyId={property.id}
          listingId={
            latestAnalysis?.listing_id ?? latestListing?.listing_id ?? null
          }
          analysisId={latestAnalysis?.id ?? null}
          analysisUpdatedAt={latestAnalysis?.updated_at ?? null}
          manualAnalysis={manualAnalysis}
          pipeline={pipeline}
        />

        <div className="dw-section-stack-compact xl:sticky xl:top-[122px]">
          <div className="dw-card-compact space-y-3">
            <div className="dw-card-header-compact">
              <h2 className="dw-card-title-compact">Comparable Workspace</h2>
              <p className="dw-card-copy-compact">
                Reserved for spreadsheet-style comp selection and ranking.
              </p>
            </div>

            <div className="dw-table-wrap">
              <table className="dw-table-compact">
                <thead>
                  <tr>
                    <th>Comp</th>
                    <th>Dist</th>
                    <th>GLA</th>
                    <th>PSF</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td colSpan={5} className="text-slate-500">
                      Comparable selection list will appear here next.
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="dw-card-compact space-y-3">
            <div className="dw-card-header-compact">
              <h2 className="dw-card-title-compact">Visual Context</h2>
              <p className="dw-card-copy-compact">
                Reserved for property photo, map, and mapped comparables.
              </p>
            </div>

            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-1">
              <div className="flex min-h-[130px] items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 text-sm text-slate-500">
                Primary photo area
              </div>
              <div className="flex min-h-[170px] items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 text-sm text-slate-500">
                Map + comparable pins
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="dw-card-compact space-y-3">
        <div className="dw-card-header-compact">
          <h2 className="dw-card-title-compact">Linked MLS Listings</h2>
          <p className="dw-card-copy-compact">
            Source listing records currently attached to this property.
          </p>
        </div>

        {listings && listings.length > 0 ? (
          <div className="dw-table-wrap">
            <table className="dw-table-compact">
              <thead>
                <tr>
                  <th>Listing ID</th>
                  <th>Status</th>
                  <th>List Price</th>
                  <th>Close Price</th>
                  <th>Contract</th>
                  <th>Close</th>
                  <th>Condition</th>
                </tr>
              </thead>
              <tbody>
                {listings.map((listing) => (
                  <tr key={listing.id}>
                    <td>{listing.listing_id}</td>
                    <td>{listing.mls_status ?? "—"}</td>
                    <td>
                      {formatCurrency(listing.list_price as number | null)}
                    </td>
                    <td>
                      {formatCurrency(listing.close_price as number | null)}
                    </td>
                    <td>{formatDate(listing.listing_contract_date)}</td>
                    <td>{formatDate(listing.close_date)}</td>
                    <td>{listing.property_condition_source ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="dw-card-tight">
            <p className="text-sm text-slate-600">
              No linked MLS listings found for this property.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

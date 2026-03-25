import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ManualAnalysisPanel } from "@/components/properties/manual-analysis-panel";
import { ComparableWorkspacePanel } from "@/components/properties/comparable-workspace-panel";

type PropertyDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ comp_run?: string; comp_error?: string }>;
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

function readParam(
  params: Record<string, unknown> | null | undefined,
  ...keys: string[]
) {
  if (!params) return null;

  for (const key of keys) {
    const value = params[key];
    if (value !== null && value !== undefined && value !== "") {
      return value;
    }
  }

  return null;
}

export default async function PropertyDetailPage({
  params,
  searchParams,
}: PropertyDetailPageProps) {
  const { id } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
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

  if (propertyError) throw new Error(propertyError.message);
  if (!property) notFound();

  const [
    { data: physical, error: physicalError },
    { data: financials, error: financialsError },
    { data: listings, error: listingsError },
    { data: latestAnalysis, error: analysisError },
    { data: defaultProfile, error: profileError },
    { data: latestRun, error: latestRunError },
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
      .order("listing_contract_date", { ascending: false, nullsFirst: true })
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

    supabase
      .from("valuation_profiles")
      .select(
        `
        id,
        slug,
        name,
        rules_json
      `,
      )
      .eq("slug", "denver_detached_basic_v1")
      .maybeSingle(),

    supabase
      .from("valuation_runs")
      .select(
        `
        id,
        status,
        parameters_json,
        summary_json,
        created_at
      `,
      )
      .eq("subject_real_property_id", id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (physicalError) throw new Error(physicalError.message);
  if (financialsError) throw new Error(financialsError.message);
  if (listingsError) throw new Error(listingsError.message);
  if (analysisError) throw new Error(analysisError.message);
  if (profileError) throw new Error(profileError.message);
  if (latestRunError) throw new Error(latestRunError.message);

  const latestListing = listings?.[0] ?? null;

  let manualAnalysis: {
    analyst_condition: string | null;
    update_year_est: number | null;
    update_quality: string | null;
    uad_condition_manual: string | null;
    uad_updates_manual: string | null;
    arv_manual: number | null;
    margin_manual: number | null;
    rehab_manual: number | null;
    days_held_manual: number | null;
    rent_estimate_monthly: number | null;
    design_rating: string | null;
    location_rating: string | null;
    created_at?: string | null;
    updated_at?: string | null;
  } | null = null;

  let pipeline: {
    interest_level: string | null;
    showing_status: string | null;
    offer_status: string | null;
    created_at?: string | null;
    updated_at?: string | null;
  } | null = null;

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

  let latestCandidates: Array<{
    id: string;
    comp_listing_row_id: string | null;
    listing_id: string | null;
    distance_miles: number | null;
    days_since_close: number | null;
    sqft_delta_pct: number | null;
    raw_score: number | null;
    selected_yn: boolean;
    metrics_json: Record<string, unknown> | null;
  }> = [];

  if (latestRun?.id) {
    const { data: rawCandidates, error: candidatesError } = await supabase
      .from("valuation_run_candidates")
      .select(
        `
        id,
        comp_listing_row_id,
        distance_miles,
        days_since_close,
        sqft_delta_pct,
        raw_score,
        selected_yn,
        metrics_json
      `,
      )
      .eq("valuation_run_id", latestRun.id)
      .order("raw_score", { ascending: false });

    if (candidatesError) throw new Error(candidatesError.message);

    const candidateRows =
      (rawCandidates as Array<{
        id: string;
        comp_listing_row_id: string | null;
        distance_miles: number | null;
        days_since_close: number | null;
        sqft_delta_pct: number | null;
        raw_score: number | null;
        selected_yn: boolean;
        metrics_json: Record<string, unknown> | null;
      }>) ?? [];

    const compListingRowIds = Array.from(
      new Set(
        candidateRows
          .map((candidate) => candidate.comp_listing_row_id)
          .filter((value): value is string => Boolean(value)),
      ),
    );

    let listingIdMap = new Map<string, string>();

    if (compListingRowIds.length > 0) {
      const { data: compListingRows, error: compListingRowsError } =
        await supabase
          .from("mls_listings")
          .select("id, listing_id")
          .in("id", compListingRowIds);

      if (compListingRowsError) throw new Error(compListingRowsError.message);

      listingIdMap = new Map(
        (compListingRows ?? []).map((row) => [row.id, row.listing_id]),
      );
    }

    latestCandidates = candidateRows.map((candidate) => ({
      ...candidate,
      listing_id: candidate.comp_listing_row_id
        ? (listingIdMap.get(candidate.comp_listing_row_id) ?? null)
        : null,
    }));
  }

  const profileRules =
    defaultProfile?.rules_json && typeof defaultProfile.rules_json === "object"
      ? (defaultProfile.rules_json as Record<string, unknown>)
      : {};

  const latestRunParams =
    latestRun?.parameters_json && typeof latestRun.parameters_json === "object"
      ? (latestRun.parameters_json as Record<string, unknown>)
      : null;

  const runParams = latestRunParams ?? profileRules;

  const compCandidateCount = latestCandidates.length;
  const compSelectedCount = latestCandidates.filter(
    (candidate) => candidate.selected_yn,
  ).length;

  const compMaxDistance = readParam(
    runParams,
    "maxDistanceMiles",
    "max_distance_miles",
  );

  const compMaxDays = readParam(
    runParams,
    "maxDaysSinceClose",
    "max_days_since_close",
  );

  const compSqftTolerance = readParam(
    runParams,
    "sqftTolerancePct",
    "sqft_tolerance_pct",
  );

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
            comparable review.
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
                  label="Contract Date"
                  value={formatDate(latestListing?.listing_contract_date)}
                />
                <DetailItem
                  label="Condition"
                  value={latestListing?.property_condition_source ?? "—"}
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
              <h2 className="dw-card-title-compact">Latest Comp Run</h2>
              <p className="dw-card-copy-compact">
                Most recent saved comparable search for this property.
              </p>
            </div>

            {latestRun ? (
              <div className="dw-detail-grid">
                <DetailItem
                  label="Run Status"
                  value={latestRun.status ?? "—"}
                />
                <DetailItem
                  label="Run Date"
                  value={formatDateTime(latestRun.created_at)}
                />
                <DetailItem
                  label="Candidates"
                  value={String(compCandidateCount)}
                />
                <DetailItem
                  label="Selected"
                  value={String(compSelectedCount)}
                />
                <DetailItem
                  label="Max Distance"
                  value={
                    compMaxDistance !== null && compMaxDistance !== undefined
                      ? `${compMaxDistance} mi`
                      : "—"
                  }
                />
                <DetailItem
                  label="Max Days"
                  value={
                    compMaxDays !== null && compMaxDays !== undefined
                      ? String(compMaxDays)
                      : "—"
                  }
                />
                <DetailItem
                  label="Sq Ft Tol"
                  value={
                    compSqftTolerance !== null &&
                    compSqftTolerance !== undefined
                      ? `${compSqftTolerance}%`
                      : "—"
                  }
                />
                <DetailItem
                  label="Run ID"
                  value={
                    <span className="font-mono text-[11px]">
                      {latestRun.id}
                    </span>
                  }
                />
              </div>
            ) : (
              <div className="dw-card-tight">
                <p className="text-sm text-slate-600">
                  No comp search has been run for this property yet.
                </p>
              </div>
            )}
          </div>

          <ComparableWorkspacePanel
            propertyId={property.id}
            subjectListingRowId={latestListing?.id ?? null}
            subjectListingMlsNumber={latestListing?.listing_id ?? null}
            latestRun={latestRun}
            latestCandidates={latestCandidates}
            defaultProfileRules={profileRules}
            compRunMessage={resolvedSearchParams?.comp_run ?? null}
            compErrorMessage={resolvedSearchParams?.comp_error ?? null}
          />

          <div className="dw-card-compact space-y-3">
            <div className="dw-card-header-compact">
              <h2 className="dw-card-title-compact">Visual Context</h2>
              <p className="dw-card-copy-compact">
                Reserved for property photo, map, and mapped comparables.
              </p>
            </div>

            <div className="grid gap-2 md:grid-cols-2">
              <div className="flex aspect-square items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 text-sm text-slate-500">
                Primary photo area
              </div>
              <div className="flex aspect-square items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 text-sm text-slate-500">
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
            Source listing records attached to this property, newest/relevant
            first.
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

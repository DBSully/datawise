
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AnalysisWorkspaceNav } from "@/components/properties/analysis-workspace-nav";
import { ComparableWorkspacePanel } from "@/components/properties/comparable-workspace-panel";

type ComparablesPageProps = {
  params: Promise<{ id: string; analysisId: string }>;
  searchParams?: Promise<{ comp_run?: string; comp_error?: string }>;
};

export default async function ComparablesPage({
  params,
  searchParams,
}: ComparablesPageProps) {
  const { id, analysisId } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [
    { data: property, error: propertyError },
    { data: analysis, error: analysisError },
    { data: subjectPhysical, error: subjectPhysicalError },
  ] = await Promise.all([
    supabase
      .from("real_properties")
      .select(
        `
          id,
          unparsed_address,
          city,
          state,
          postal_code,
          lot_size_sqft,
          lot_size_acres
        `,
      )
      .eq("id", id)
      .maybeSingle(),

    supabase
      .from("analyses")
      .select(
        `
          id,
          real_property_id,
          listing_id,
          scenario_name,
          strategy_type,
          status
        `,
      )
      .eq("id", analysisId)
      .eq("real_property_id", id)
      .eq("created_by_user_id", user?.id ?? "")
      .eq("is_archived", false)
      .maybeSingle(),

    supabase
      .from("property_physical")
      .select(
        `
          real_property_id,
          property_type,
          property_sub_type,
          building_form_standardized,
          level_class_standardized,
          levels_raw,
          building_area_total_sqft,
          above_grade_finished_area_sqft,
          year_built,
          bedrooms_total,
          bathrooms_total
        `,
      )
      .eq("real_property_id", id)
      .maybeSingle(),
  ]);

  if (propertyError) throw new Error(propertyError.message);
  if (analysisError) throw new Error(analysisError.message);
  if (subjectPhysicalError) throw new Error(subjectPhysicalError.message);
  if (!property || !analysis) notFound();

  const listingSelect = `
        id,
        listing_id,
        mls_status,
        list_price,
        property_condition_source,
        listing_contract_date,
        source_system
      `;

  let subjectListing:
    | {
        id: string;
        listing_id: string | null;
        mls_status: string | null;
        list_price: number | null;
        property_condition_source: string | null;
        listing_contract_date: string | null;
        source_system: string | null;
      }
    | null = null;

  if (analysis.listing_id) {
    const { data: linkedListing, error: linkedListingError } = await supabase
      .from("mls_listings")
      .select(listingSelect)
      .eq("real_property_id", id)
      .eq("listing_id", analysis.listing_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (linkedListingError) throw new Error(linkedListingError.message);
    subjectListing = linkedListing;
  }

  if (!subjectListing) {
    const { data: latestListing, error: listingError } = await supabase
      .from("mls_listings")
      .select(listingSelect)
      .eq("real_property_id", id)
      .order("listing_contract_date", {
        ascending: false,
        nullsFirst: false,
      })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (listingError) throw new Error(listingError.message);
    subjectListing = latestListing;
  }

  const [
    { data: defaultProfile, error: profileError },
    { data: latestRun, error: latestRunError },
  ] = await Promise.all([
    supabase
      .from("comparable_profiles")
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
      .from("comparable_search_runs")
      .select(
        `
        id,
        status,
        parameters_json,
        summary_json,
        created_at
      `,
      )
      .eq("analysis_id", analysisId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (profileError) throw new Error(profileError.message);
  if (latestRunError) throw new Error(latestRunError.message);

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
    score_breakdown_json: Record<string, unknown> | null;
  }> = [];

  if (latestRun?.id) {
    const { data: rawCandidates, error: candidatesError } = await supabase
      .from("comparable_search_candidates")
      .select(
        `
        id,
        comp_listing_row_id,
        distance_miles,
        days_since_close,
        sqft_delta_pct,
        raw_score,
        selected_yn,
        metrics_json,
        score_breakdown_json
      `,
      )
      .eq("comparable_search_run_id", latestRun.id)
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
        score_breakdown_json: Record<string, unknown> | null;
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

  return (
    <section className="dw-section-stack-compact">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="mb-1">
            <Link
              href={`/analysis/properties/${property.id}/analyses/${analysis.id}`}
              className="text-[11px] uppercase tracking-[0.16em] text-slate-500 hover:text-slate-900"
            >
              ← Back to Analysis Overview
            </Link>
          </div>

          <h1 className="dw-page-title">
            {analysis.scenario_name ?? "Comparables"}
          </h1>
          <p className="dw-page-copy">
            Deep comparable-sale review for {property.unparsed_address}.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-medium uppercase tracking-[0.14em] text-slate-600">
            {analysis.strategy_type ?? "general"}
          </span>
          <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-medium uppercase tracking-[0.14em] text-slate-600">
            Comparables
          </span>
        </div>
      </div>

      <AnalysisWorkspaceNav
        propertyId={property.id}
        analysisId={analysis.id}
        current="comparables"
      />

      <ComparableWorkspacePanel
        propertyId={property.id}
        analysisId={analysis.id}
        subjectListingRowId={subjectListing?.id ?? null}
        subjectListingMlsNumber={subjectListing?.listing_id ?? null}
        analysisStrategyType={analysis.strategy_type ?? null}
        defaultProfileSlug={defaultProfile?.slug ?? "denver_detached_basic_v1"}
        latestRun={latestRun}
        latestCandidates={latestCandidates}
        defaultProfileRules={profileRules}
        compRunMessage={resolvedSearchParams?.comp_run ?? null}
        compErrorMessage={resolvedSearchParams?.comp_error ?? null}
        subjectContext={{
          propertyType: subjectPhysical?.property_type ?? null,
          propertySubType: subjectPhysical?.property_sub_type ?? null,
          buildingFormStandardized:
            subjectPhysical?.building_form_standardized ?? null,
          levelClassStandardized:
            subjectPhysical?.level_class_standardized ?? null,
          levelsRaw: subjectPhysical?.levels_raw ?? null,
          buildingAreaTotalSqft:
            subjectPhysical?.building_area_total_sqft ?? null,
          aboveGradeFinishedAreaSqft:
            subjectPhysical?.above_grade_finished_area_sqft ?? null,
          lotSizeSqft:
            property.lot_size_sqft ??
            (typeof property.lot_size_acres === "number"
              ? property.lot_size_acres * 43560
              : null),
          yearBuilt: subjectPhysical?.year_built ?? null,
          bedroomsTotal: subjectPhysical?.bedrooms_total ?? null,
          bathroomsTotal: subjectPhysical?.bathrooms_total ?? null,
          listingContractDate: subjectListing?.listing_contract_date ?? null,
        }}
      />
    </section>
  );
}

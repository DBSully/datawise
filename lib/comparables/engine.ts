import "server-only";

import { createClient } from "@/lib/supabase/server";

export type RunComparableSearchInput = {
  analysisId: string;
  subjectRealPropertyId: string;
  subjectListingRowId: string;
  profileSlug: string;
  overrides: {
    maxDistanceMiles: number | null;
    maxDaysSinceClose: number | null;
    sqftTolerancePct: number | null;
    yearToleranceYears: number | null;
    bedTolerance: number | null;
    bathTolerance: number | null;
    maxCandidates: number | null;
    requireSamePropertyType: boolean;
    requireSameLevelClass: boolean;
  };
};

type ComparableSearchRules = {
  maxDistanceMiles: number;
  maxDaysSinceClose: number;
  sqftTolerancePct: number;
  yearToleranceYears: number;
  bedTolerance: number;
  bathTolerance: number;
  maxCandidates: number;
  requireSamePropertyType: boolean;
  requireSameLevelClass: boolean;
};

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "y", "on"].includes(normalized)) return true;
    if (["false", "0", "no", "n", "off"].includes(normalized)) return false;
  }
  return null;
}

function firstNonNull<T>(...values: Array<T | null | undefined>): T | null {
  for (const value of values) {
    if (value !== null && value !== undefined) return value;
  }
  return null;
}

function mergeRules(
  defaults: Record<string, unknown> | null | undefined,
  overrides: RunComparableSearchInput["overrides"],
): ComparableSearchRules {
  const defaultMaxDistance =
    toNumber(defaults?.maxDistanceMiles ?? defaults?.max_distance_miles) ?? 0.5;
  const defaultMaxDays =
    toNumber(defaults?.maxDaysSinceClose ?? defaults?.max_days_since_close) ??
    365;
  const defaultSqftTolerance =
    toNumber(defaults?.sqftTolerancePct ?? defaults?.sqft_tolerance_pct) ?? 20;
  const defaultYearTolerance =
    toNumber(defaults?.yearToleranceYears ?? defaults?.year_tolerance_years) ??
    25;
  const defaultBedTolerance =
    toNumber(defaults?.bedTolerance ?? defaults?.bed_tolerance) ?? 1;
  const defaultBathTolerance =
    toNumber(defaults?.bathTolerance ?? defaults?.bath_tolerance) ?? 1;
  const defaultMaxCandidates =
    toNumber(defaults?.maxCandidates ?? defaults?.max_candidates) ?? 15;
  const defaultRequireSamePropertyType =
    toBoolean(
      defaults?.requireSamePropertyType ?? defaults?.require_same_property_type,
    ) ?? true;
  const defaultRequireSameLevelClass =
    toBoolean(
      defaults?.requireSameLevelClass ?? defaults?.require_same_level_class,
    ) ?? true;

  return {
    maxDistanceMiles: overrides.maxDistanceMiles ?? defaultMaxDistance,
    maxDaysSinceClose: overrides.maxDaysSinceClose ?? defaultMaxDays,
    sqftTolerancePct: overrides.sqftTolerancePct ?? defaultSqftTolerance,
    yearToleranceYears: overrides.yearToleranceYears ?? defaultYearTolerance,
    bedTolerance: overrides.bedTolerance ?? defaultBedTolerance,
    bathTolerance: overrides.bathTolerance ?? defaultBathTolerance,
    maxCandidates: overrides.maxCandidates ?? defaultMaxCandidates,
    requireSamePropertyType:
      overrides.requireSamePropertyType ?? defaultRequireSamePropertyType,
    requireSameLevelClass:
      overrides.requireSameLevelClass ?? defaultRequireSameLevelClass,
  };
}

function haversineMiles(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
) {
  const toRadians = (value: number) => (value * Math.PI) / 180;

  const earthRadiusMiles = 3958.8;
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusMiles * c;
}

function daysBetween(fromDate: string, toDate: Date) {
  const from = new Date(fromDate);
  const diffMs = toDate.getTime() - from.getTime();
  return diffMs / (1000 * 60 * 60 * 24);
}

function pctDelta(subject: number, candidate: number) {
  if (subject === 0) return null;
  return (Math.abs(candidate - subject) / subject) * 100;
}

function computeRawScore(input: {
  distanceMiles: number;
  maxDistanceMiles: number;
  daysSinceClose: number;
  maxDaysSinceClose: number;
  sqftDeltaPct: number | null;
  sqftTolerancePct: number;
  yearDelta: number | null;
  yearToleranceYears: number;
  bedDelta: number | null;
  bedTolerance: number;
  bathDelta: number | null;
  bathTolerance: number;
}) {
  const distanceComponent =
    1 - Math.min(input.distanceMiles / input.maxDistanceMiles, 1);
  const recencyComponent =
    1 - Math.min(input.daysSinceClose / input.maxDaysSinceClose, 1);

  const sqftComponent =
    input.sqftDeltaPct === null
      ? 0.4
      : 1 - Math.min(input.sqftDeltaPct / input.sqftTolerancePct, 1);

  const yearComponent =
    input.yearDelta === null
      ? 0.4
      : 1 - Math.min(input.yearDelta / input.yearToleranceYears, 1);

  const bedComponent =
    input.bedDelta === null
      ? 0.4
      : 1 - Math.min(input.bedDelta / Math.max(input.bedTolerance, 1), 1);

  const bathComponent =
    input.bathDelta === null
      ? 0.4
      : 1 - Math.min(input.bathDelta / Math.max(input.bathTolerance, 0.5), 1);

  const weighted =
    distanceComponent * 0.28 +
    recencyComponent * 0.22 +
    sqftComponent * 0.22 +
    yearComponent * 0.12 +
    bedComponent * 0.08 +
    bathComponent * 0.08;

  return Math.max(0, Math.min(100, weighted * 100));
}

async function fetchRealPropertiesByIds(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ids: string[],
) {
  if (ids.length === 0) return [];

  const chunkSize = 1000;
  const results: any[] = [];

  for (let start = 0; start < ids.length; start += chunkSize) {
    const chunk = ids.slice(start, start + chunkSize);

    const { data, error } = await supabase
      .from("real_properties")
      .select(
        `
        id,
        unparsed_address,
        city,
        county,
        state,
        postal_code,
        latitude,
        longitude
      `,
      )
      .in("id", chunk);

    if (error) throw new Error(error.message);
    results.push(...(data ?? []));
  }

  return results;
}

async function fetchPhysicalByPropertyIds(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ids: string[],
) {
  if (ids.length === 0) return [];

  const chunkSize = 1000;
  const results: any[] = [];

  for (let start = 0; start < ids.length; start += chunkSize) {
    const chunk = ids.slice(start, start + chunkSize);

    const { data, error } = await supabase
      .from("property_physical")
      .select(
        `
        real_property_id,
        property_type,
        property_sub_type,
        level_class_standardized,
        above_grade_finished_area_sqft,
        building_area_total_sqft,
        year_built,
        bedrooms_total,
        bathrooms_total
      `,
      )
      .in("real_property_id", chunk);

    if (error) throw new Error(error.message);
    results.push(...(data ?? []));
  }

  return results;
}

async function fetchCandidateListingsByPropertyIds(
  supabase: Awaited<ReturnType<typeof createClient>>,
  params: {
    propertyIds: string[];
    sourceSystem: string;
    subjectRealPropertyId: string;
    earliestCloseDate: string;
  },
) {
  const {
    propertyIds,
    sourceSystem,
    subjectRealPropertyId,
    earliestCloseDate,
  } = params;

  if (propertyIds.length === 0) return [];

  const chunkSize = 1000;
  const results: any[] = [];

  for (let start = 0; start < propertyIds.length; start += chunkSize) {
    const chunk = propertyIds.slice(start, start + chunkSize);

    const { data, error } = await supabase
      .from("mls_listings")
      .select(
        `
        id,
        listing_id,
        real_property_id,
        source_system,
        close_date,
        close_price,
        list_price,
        property_condition_source,
        listing_contract_date,
        mls_status
      `,
      )
      .eq("source_system", sourceSystem)
      .in("real_property_id", chunk)
      .neq("real_property_id", subjectRealPropertyId)
      .not("close_date", "is", null)
      .gte("close_date", earliestCloseDate);

    if (error) throw new Error(error.message);
    results.push(...(data ?? []));
  }

  return results;
}

export async function runComparableSearch(input: RunComparableSearchInput) {
  const supabase = await createClient();

  const { data: profile, error: profileError } = await supabase
    .from("comparable_profiles")
    .select(
      `
      id,
      slug,
      name,
      purpose,
      rules_json
    `,
    )
    .eq("slug", input.profileSlug)
    .single();

  if (profileError || !profile) {
    throw new Error(profileError?.message ?? "Comparable profile not found.");
  }

  const mergedRules = mergeRules(
    profile.rules_json as Record<string, unknown> | null,
    input.overrides,
  );

  const [
    { data: subjectListing, error: subjectListingError },
    { data: subjectProperty, error: subjectPropertyError },
    { data: subjectPhysical, error: subjectPhysicalError },
  ] = await Promise.all([
    supabase
      .from("mls_listings")
      .select(
        `
          id,
          listing_id,
          source_system,
          real_property_id
        `,
      )
      .eq("id", input.subjectListingRowId)
      .maybeSingle(),

    supabase
      .from("real_properties")
      .select(
        `
          id,
          unparsed_address,
          city,
          state,
          postal_code,
          latitude,
          longitude
        `,
      )
      .eq("id", input.subjectRealPropertyId)
      .maybeSingle(),

    supabase
      .from("property_physical")
      .select(
        `
          real_property_id,
          property_type,
          level_class_standardized,
          above_grade_finished_area_sqft,
          building_area_total_sqft,
          year_built,
          bedrooms_total,
          bathrooms_total
        `,
      )
      .eq("real_property_id", input.subjectRealPropertyId)
      .maybeSingle(),
  ]);

  if (subjectListingError) throw new Error(subjectListingError.message);
  if (subjectPropertyError) throw new Error(subjectPropertyError.message);
  if (subjectPhysicalError) throw new Error(subjectPhysicalError.message);

  if (!subjectListing || !subjectProperty || !subjectPhysical) {
    throw new Error("Subject property is missing required imported facts.");
  }

  const subjectLat = toNumber(subjectProperty.latitude);
  const subjectLon = toNumber(subjectProperty.longitude);

  if (subjectLat === null || subjectLon === null) {
    throw new Error("Subject property is missing latitude/longitude.");
  }

  const subjectSqft = firstNonNull(
    toNumber(subjectPhysical.above_grade_finished_area_sqft),
    toNumber(subjectPhysical.building_area_total_sqft),
  );

  const latDelta = mergedRules.maxDistanceMiles / 69;
  const lonDelta =
    mergedRules.maxDistanceMiles /
    Math.max(1, 69 * Math.cos((subjectLat * Math.PI) / 180));

  const { data: candidatePropertyShells, error: candidatePropertyShellsError } =
    await supabase
      .from("real_properties")
      .select(
        `
        id,
        latitude,
        longitude
      `,
      )
      .gte("latitude", subjectLat - latDelta)
      .lte("latitude", subjectLat + latDelta)
      .gte("longitude", subjectLon - lonDelta)
      .lte("longitude", subjectLon + lonDelta);

  if (candidatePropertyShellsError) {
    throw new Error(candidatePropertyShellsError.message);
  }

  const candidatePropertyIds = Array.from(
    new Set(
      (candidatePropertyShells ?? [])
        .map((row) => row.id)
        .filter((value): value is string => Boolean(value)),
    ),
  );

  const earliestCloseDate = new Date(
    Date.now() - mergedRules.maxDaysSinceClose * 24 * 60 * 60 * 1000,
  )
    .toISOString()
    .slice(0, 10);

  const [candidateProperties, candidatePhysicals, candidateListings] =
    await Promise.all([
      fetchRealPropertiesByIds(supabase, candidatePropertyIds),
      fetchPhysicalByPropertyIds(supabase, candidatePropertyIds),
      fetchCandidateListingsByPropertyIds(supabase, {
        propertyIds: candidatePropertyIds,
        sourceSystem: subjectListing.source_system,
        subjectRealPropertyId: input.subjectRealPropertyId,
        earliestCloseDate,
      }),
    ]);

  const propertyMap = new Map(candidateProperties.map((row) => [row.id, row]));
  const physicalMap = new Map(
    candidatePhysicals.map((row) => [row.real_property_id, row]),
  );

  const now = new Date();

  const rankedCandidates = candidateListings
    .map((listing) => {
      const property = propertyMap.get(listing.real_property_id);
      const physical = physicalMap.get(listing.real_property_id);

      if (!property || !physical) return null;

      const candidateLat = toNumber(property.latitude);
      const candidateLon = toNumber(property.longitude);
      if (candidateLat === null || candidateLon === null) return null;

      const distanceMiles = haversineMiles(
        subjectLat,
        subjectLon,
        candidateLat,
        candidateLon,
      );
      if (distanceMiles > mergedRules.maxDistanceMiles) return null;

      const daysSinceClose = listing.close_date
        ? daysBetween(listing.close_date, now)
        : null;

      if (
        daysSinceClose === null ||
        daysSinceClose < 0 ||
        daysSinceClose > mergedRules.maxDaysSinceClose
      ) {
        return null;
      }

      const candidatePropertyType =
        typeof physical.property_type === "string"
          ? physical.property_type
          : null;
      const subjectPropertyType =
        typeof subjectPhysical.property_type === "string"
          ? subjectPhysical.property_type
          : null;

      if (
        mergedRules.requireSamePropertyType &&
        subjectPropertyType &&
        candidatePropertyType &&
        candidatePropertyType !== subjectPropertyType
      ) {
        return null;
      }

      const candidateLevelClass =
        typeof physical.level_class_standardized === "string"
          ? physical.level_class_standardized
          : null;
      const subjectLevelClass =
        typeof subjectPhysical.level_class_standardized === "string"
          ? subjectPhysical.level_class_standardized
          : null;

      if (
        mergedRules.requireSameLevelClass &&
        subjectLevelClass &&
        candidateLevelClass &&
        candidateLevelClass !== subjectLevelClass
      ) {
        return null;
      }

      const candidateSqft = firstNonNull(
        toNumber(physical.above_grade_finished_area_sqft),
        toNumber(physical.building_area_total_sqft),
      );

      const sqftDeltaPct =
        subjectSqft !== null && candidateSqft !== null
          ? pctDelta(subjectSqft, candidateSqft)
          : null;

      if (
        sqftDeltaPct !== null &&
        sqftDeltaPct > mergedRules.sqftTolerancePct
      ) {
        return null;
      }

      const subjectYearBuilt = toNumber(subjectPhysical.year_built);
      const candidateYearBuilt = toNumber(physical.year_built);
      const yearDelta =
        subjectYearBuilt !== null && candidateYearBuilt !== null
          ? Math.abs(candidateYearBuilt - subjectYearBuilt)
          : null;

      if (yearDelta !== null && yearDelta > mergedRules.yearToleranceYears) {
        return null;
      }

      const subjectBeds = toNumber(subjectPhysical.bedrooms_total);
      const candidateBeds = toNumber(physical.bedrooms_total);
      const bedDelta =
        subjectBeds !== null && candidateBeds !== null
          ? Math.abs(candidateBeds - subjectBeds)
          : null;

      if (bedDelta !== null && bedDelta > mergedRules.bedTolerance) {
        return null;
      }

      const subjectBaths = toNumber(subjectPhysical.bathrooms_total);
      const candidateBaths = toNumber(physical.bathrooms_total);
      const bathDelta =
        subjectBaths !== null && candidateBaths !== null
          ? Math.abs(candidateBaths - subjectBaths)
          : null;

      if (bathDelta !== null && bathDelta > mergedRules.bathTolerance) {
        return null;
      }

      const closePrice = toNumber(listing.close_price);
      const ppsf =
        closePrice !== null && candidateSqft !== null && candidateSqft > 0
          ? closePrice / candidateSqft
          : null;

      const rawScore = computeRawScore({
        distanceMiles,
        maxDistanceMiles: mergedRules.maxDistanceMiles,
        daysSinceClose,
        maxDaysSinceClose: mergedRules.maxDaysSinceClose,
        sqftDeltaPct,
        sqftTolerancePct: mergedRules.sqftTolerancePct,
        yearDelta,
        yearToleranceYears: mergedRules.yearToleranceYears,
        bedDelta,
        bedTolerance: mergedRules.bedTolerance,
        bathDelta,
        bathTolerance: mergedRules.bathTolerance,
      });

      return {
        comp_listing_row_id: listing.id,
        comp_real_property_id: listing.real_property_id,
        distance_miles: distanceMiles,
        days_since_close: daysSinceClose,
        sqft_delta_pct: sqftDeltaPct,
        raw_score: rawScore,
        selected_yn: false,
        metrics_json: {
          listing_id: listing.listing_id,
          address: property.unparsed_address,
          close_date: listing.close_date,
          close_price: closePrice,
          ppsf,
          above_grade_finished_area_sqft: candidateSqft,
          bedrooms_total: candidateBeds,
          bathrooms_total: candidateBaths,
          year_built: candidateYearBuilt,
          property_type: candidatePropertyType,
          level_class_standardized: candidateLevelClass,
          city: property.city,
          state: property.state,
          postal_code: property.postal_code,
          property_condition_source: listing.property_condition_source,
        },
      };
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row))
    .sort((a, b) => (b.raw_score ?? 0) - (a.raw_score ?? 0))
    .slice(0, mergedRules.maxCandidates);

  const { data: insertedRun, error: insertedRunError } = await supabase
    .from("comparable_search_runs")
    .insert({
      analysis_id: input.analysisId,
      subject_real_property_id: input.subjectRealPropertyId,
      subject_listing_row_id: input.subjectListingRowId,
      comparable_profile_id: profile.id,
      purpose: profile.purpose ?? "arv",
      status: "complete",
      parameters_json: mergedRules,
      summary_json: {
        candidateCount: rankedCandidates.length,
        sourceSystem: subjectListing.source_system,
        subjectListingId: subjectListing.listing_id,
      },
    })
    .select("id")
    .single();

  if (insertedRunError || !insertedRun) {
    throw new Error(
      insertedRunError?.message ?? "Failed to save comparable search run.",
    );
  }

  if (rankedCandidates.length > 0) {
    const candidateRows = rankedCandidates.map((candidate) => ({
      comparable_search_run_id: insertedRun.id,
      comp_listing_row_id: candidate.comp_listing_row_id,
      comp_real_property_id: candidate.comp_real_property_id,
      distance_miles: candidate.distance_miles,
      days_since_close: candidate.days_since_close,
      sqft_delta_pct: candidate.sqft_delta_pct,
      raw_score: candidate.raw_score,
      selected_yn: candidate.selected_yn,
      metrics_json: candidate.metrics_json,
    }));

    const { error: candidateInsertError } = await supabase
      .from("comparable_search_candidates")
      .insert(candidateRows);

    if (candidateInsertError) {
      throw new Error(candidateInsertError.message);
    }
  }

  return {
    runId: insertedRun.id,
    candidateCount: rankedCandidates.length,
  };
}

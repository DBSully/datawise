
export type ComparableSearchOverrides = {
  maxDistanceMiles?: number;
  maxDaysSinceClose?: number;
  sqftTolerancePct?: number;
  yearBuiltTolerance?: number;
  bedTolerance?: number;
  bathTolerance?: number;
  maxCandidateCount?: number;
  requireSameLevelClass?: boolean;
  requireSamePropertyType?: boolean;
};

type SubjectProperty = {
  id: string;
  unparsed_address: string;
  city: string;
  state: string;
  postal_code: string | null;
  unit_number: string | null;
  latitude: number | null;
  longitude: number | null;
  parcel_id: string | null;
};

type SubjectPhysical = {
  property_type: string | null;
  property_sub_type: string | null;
  structure_type: string | null;
  level_class_standardized: string | null;
  above_grade_finished_area_sqft: number | null;
  living_area_sqft: number | null;
  building_area_total_sqft: number | null;
  bedrooms_total: number | null;
  bathrooms_total: number | null;
  year_built: number | null;
};

type CandidateProperty = {
  id: string;
  unparsed_address: string;
  city: string;
  state: string;
  postal_code: string | null;
  unit_number: string | null;
  latitude: number | null;
  longitude: number | null;
  parcel_id: string | null;
};

type CandidatePhysical = {
  real_property_id: string;
  property_type: string | null;
  property_sub_type: string | null;
  structure_type: string | null;
  level_class_standardized: string | null;
  above_grade_finished_area_sqft: number | null;
  living_area_sqft: number | null;
  building_area_total_sqft: number | null;
  bedrooms_total: number | null;
  bathrooms_total: number | null;
  year_built: number | null;
};

type CandidateListing = {
  id: string;
  source_system: string;
  listing_id: string;
  real_property_id: string;
  mls_status: string | null;
  close_price: number | null;
  close_date: string | null;
  property_condition_source: string | null;
};

type ComparableSearchInput = {
  supabase: any;
  propertyId: string;
  subjectListingRowId?: string | null;
  profileSlug: string;
  overrides: ComparableSearchOverrides;
  createdByUserId?: string | null;
};

type ComparableSearchResult = {
  runId: string;
  candidateCount: number;
  evaluatedCount: number;
};

function clampToZero(value: number) {
  return value < 0 ? 0 : value;
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function pickAreaSqft(input: {
  above_grade_finished_area_sqft?: number | null;
  living_area_sqft?: number | null;
  building_area_total_sqft?: number | null;
}) {
  return (
    toNumber(input.above_grade_finished_area_sqft) ??
    toNumber(input.living_area_sqft) ??
    toNumber(input.building_area_total_sqft)
  );
}

function haversineMiles(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
) {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const earthRadiusMiles = 3958.7613;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) ** 2;

  return earthRadiusMiles * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function daysBetween(now: Date, dateValue: string | null) {
  if (!dateValue) return null;
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return null;
  return Math.floor((now.getTime() - date.getTime()) / 86_400_000);
}

function scoreCandidate(args: {
  distanceMiles: number;
  maxDistanceMiles: number;
  daysSinceClose: number;
  maxDaysSinceClose: number;
  sqftDeltaPct: number;
  sqftTolerancePct: number;
  yearBuiltDelta: number | null;
  yearBuiltTolerance: number;
  bedDelta: number | null;
  bedTolerance: number;
  bathDelta: number | null;
  bathTolerance: number;
}) {
  const distanceScore =
    args.maxDistanceMiles > 0
      ? clampToZero(40 * (1 - args.distanceMiles / args.maxDistanceMiles))
      : 0;

  const recencyScore =
    args.maxDaysSinceClose > 0
      ? clampToZero(25 * (1 - args.daysSinceClose / args.maxDaysSinceClose))
      : 0;

  const sqftScore =
    args.sqftTolerancePct > 0
      ? clampToZero(25 * (1 - args.sqftDeltaPct / args.sqftTolerancePct))
      : 0;

  const yearScore =
    args.yearBuiltDelta === null || args.yearBuiltTolerance <= 0
      ? 5
      : clampToZero(5 * (1 - args.yearBuiltDelta / args.yearBuiltTolerance));

  const bedScore =
    args.bedDelta === null || args.bedTolerance <= 0
      ? 2.5
      : clampToZero(2.5 * (1 - args.bedDelta / args.bedTolerance));

  const bathScore =
    args.bathDelta === null || args.bathTolerance <= 0
      ? 2.5
      : clampToZero(2.5 * (1 - args.bathDelta / args.bathTolerance));

  return Number(
    (distanceScore + recencyScore + sqftScore + yearScore + bedScore + bathScore).toFixed(3),
  );
}

function mergeParameters(rulesJson: Record<string, any>, overrides: ComparableSearchOverrides) {
  return {
    maxDistanceMiles:
      overrides.maxDistanceMiles ?? Number(rulesJson.default_max_distance_miles ?? 0.5),
    maxDaysSinceClose:
      overrides.maxDaysSinceClose ?? Number(rulesJson.default_max_days_since_close ?? 365),
    sqftTolerancePct:
      overrides.sqftTolerancePct ?? Number(rulesJson.default_sqft_tolerance_pct ?? 20),
    yearBuiltTolerance:
      overrides.yearBuiltTolerance ?? Number(rulesJson.default_year_built_tolerance ?? 25),
    bedTolerance:
      overrides.bedTolerance ?? Number(rulesJson.default_bed_tolerance ?? 1),
    bathTolerance:
      overrides.bathTolerance ?? Number(rulesJson.default_bath_tolerance ?? 1),
    maxCandidateCount:
      overrides.maxCandidateCount ?? Number(rulesJson.default_max_candidate_count ?? 15),
    requireSameLevelClass:
      overrides.requireSameLevelClass ??
      Boolean(rulesJson.default_require_same_level_class ?? true),
    requireSamePropertyType:
      overrides.requireSamePropertyType ??
      Boolean(rulesJson.default_require_same_property_type ?? true),
  };
}

export async function runComparableSearch({
  supabase,
  propertyId,
  subjectListingRowId,
  profileSlug,
  overrides,
  createdByUserId,
}: ComparableSearchInput): Promise<ComparableSearchResult> {
  const { data: profile, error: profileError } = await supabase
    .from("valuation_profiles")
    .select("id, slug, name, source_system, rules_json")
    .eq("slug", profileSlug)
    .single();

  if (profileError || !profile) {
    throw new Error(profileError?.message ?? "Valuation profile not found.");
  }

  const parameters = mergeParameters(profile.rules_json ?? {}, overrides);

  const [{ data: subjectProperty, error: propertyError }, { data: subjectPhysical, error: physicalError }] =
    await Promise.all([
      supabase
        .from("real_properties")
        .select(
          "id, unparsed_address, city, state, postal_code, unit_number, latitude, longitude, parcel_id",
        )
        .eq("id", propertyId)
        .single(),
      supabase
        .from("property_physical")
        .select(
          "property_type, property_sub_type, structure_type, level_class_standardized, above_grade_finished_area_sqft, living_area_sqft, building_area_total_sqft, bedrooms_total, bathrooms_total, year_built",
        )
        .eq("real_property_id", propertyId)
        .maybeSingle(),
    ]);

  if (propertyError || !subjectProperty) {
    throw new Error(propertyError?.message ?? "Subject property not found.");
  }

  if (physicalError) {
    throw new Error(physicalError.message);
  }

  if (subjectProperty.latitude === null || subjectProperty.longitude === null) {
    throw new Error("Subject property must have latitude and longitude to run comp search.");
  }

  let subjectListingRow: { id: string; source_system: string } | null = null;
  if (subjectListingRowId) {
    const { data, error } = await supabase
      .from("mls_listings")
      .select("id, source_system")
      .eq("id", subjectListingRowId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    subjectListingRow = data;
  } else {
    const { data, error } = await supabase
      .from("mls_listings")
      .select("id, source_system")
      .eq("real_property_id", propertyId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw new Error(error.message);
    subjectListingRow = data;
  }

  const subjectAreaSqft = pickAreaSqft(subjectPhysical ?? {});
  if (!subjectAreaSqft) {
    throw new Error("Subject property must have a usable square footage field for comp search.");
  }

  const latDelta = parameters.maxDistanceMiles / 69;
  const longitudeDivisor =
    Math.max(0.2, Math.cos((subjectProperty.latitude * Math.PI) / 180)) * 69.172;
  const lngDelta = parameters.maxDistanceMiles / longitudeDivisor;

  const { data: candidateProperties, error: candidatePropertiesError } = await supabase
    .from("real_properties")
    .select(
      "id, unparsed_address, city, state, postal_code, unit_number, latitude, longitude, parcel_id",
    )
    .neq("id", propertyId)
    .gte("latitude", subjectProperty.latitude - latDelta)
    .lte("latitude", subjectProperty.latitude + latDelta)
    .gte("longitude", subjectProperty.longitude - lngDelta)
    .lte("longitude", subjectProperty.longitude + lngDelta);

  if (candidatePropertiesError) {
    throw new Error(candidatePropertiesError.message);
  }

  const candidatePropertyRows = (candidateProperties ?? []).filter(
    (item: CandidateProperty) =>
      item.latitude !== null &&
      item.longitude !== null,
  );

  if (candidatePropertyRows.length === 0) {
    const { data: emptyRun, error: emptyRunError } = await supabase
      .from("valuation_runs")
      .insert({
        valuation_profile_id: profile.id,
        subject_real_property_id: propertyId,
        subject_listing_row_id: subjectListingRow?.id ?? null,
        run_type: "manual",
        status: "complete",
        parameters_json: parameters,
        summary_json: {
          evaluated_properties: 0,
          matched_candidates: 0,
          subject_area_sqft: subjectAreaSqft,
          note: "No candidate properties found within bounding box.",
        },
        created_by_user_id: createdByUserId ?? null,
      })
      .select("id")
      .single();

    if (emptyRunError || !emptyRun) {
      throw new Error(emptyRunError?.message ?? "Failed to save empty valuation run.");
    }

    return {
      runId: emptyRun.id,
      candidateCount: 0,
      evaluatedCount: 0,
    };
  }

  const candidatePropertyIds = candidatePropertyRows.map((item: CandidateProperty) => item.id);

  const [{ data: candidatePhysicals, error: candidatePhysicalsError }, { data: candidateListings, error: candidateListingsError }] =
    await Promise.all([
      supabase
        .from("property_physical")
        .select(
          "real_property_id, property_type, property_sub_type, structure_type, level_class_standardized, above_grade_finished_area_sqft, living_area_sqft, building_area_total_sqft, bedrooms_total, bathrooms_total, year_built",
        )
        .in("real_property_id", candidatePropertyIds),
      supabase
        .from("mls_listings")
        .select(
          "id, source_system, listing_id, real_property_id, mls_status, close_price, close_date, property_condition_source",
        )
        .in("real_property_id", candidatePropertyIds)
        .eq("source_system", subjectListingRow?.source_system ?? profile.source_system ?? "recolorado")
        .not("close_date", "is", null)
        .not("close_price", "is", null)
        .gt("close_price", 0)
        .gte(
          "close_date",
          new Date(Date.now() - parameters.maxDaysSinceClose * 86_400_000).toISOString(),
        )
        .order("close_date", { ascending: false }),
    ]);

  if (candidatePhysicalsError) {
    throw new Error(candidatePhysicalsError.message);
  }

  if (candidateListingsError) {
    throw new Error(candidateListingsError.message);
  }

  const propertyMap = new Map<string, CandidateProperty>(
    candidatePropertyRows.map((item: CandidateProperty) => [item.id, item]),
  );
  const physicalMap = new Map<string, CandidatePhysical>(
    (candidatePhysicals ?? []).map((item: CandidatePhysical) => [item.real_property_id, item]),
  );

  const now = new Date();
  const evaluated: Array<{
    compListingRowId: string;
    compRealPropertyId: string;
    distanceMiles: number;
    daysSinceClose: number;
    sqftDeltaPct: number;
    yearBuiltDelta: number | null;
    bedDelta: number | null;
    bathDelta: number | null;
    rawScore: number;
    metricsJson: Record<string, any>;
  }> = [];

  for (const listing of (candidateListings ?? []) as CandidateListing[]) {
    const property = propertyMap.get(listing.real_property_id);
    const physical = physicalMap.get(listing.real_property_id);

    if (!property || !physical) continue;
    if (property.latitude === null || property.longitude === null) continue;

    if (
      parameters.requireSamePropertyType &&
      subjectPhysical?.property_type &&
      physical.property_type &&
      subjectPhysical.property_type !== physical.property_type
    ) {
      continue;
    }

    if (
      parameters.requireSameLevelClass &&
      subjectPhysical?.level_class_standardized &&
      physical.level_class_standardized &&
      subjectPhysical.level_class_standardized !== physical.level_class_standardized
    ) {
      continue;
    }

    const distanceMiles = haversineMiles(
      Number(subjectProperty.latitude),
      Number(subjectProperty.longitude),
      Number(property.latitude),
      Number(property.longitude),
    );

    if (distanceMiles > parameters.maxDistanceMiles) {
      continue;
    }

    const daysSinceClose = daysBetween(now, listing.close_date);
    if (daysSinceClose === null || daysSinceClose > parameters.maxDaysSinceClose) {
      continue;
    }

    const candidateAreaSqft = pickAreaSqft(physical);
    if (!candidateAreaSqft) continue;

    const sqftDeltaPct = Math.abs(subjectAreaSqft - candidateAreaSqft) / subjectAreaSqft * 100;
    if (sqftDeltaPct > parameters.sqftTolerancePct) {
      continue;
    }

    const yearBuiltDelta =
      subjectPhysical?.year_built !== null &&
      subjectPhysical?.year_built !== undefined &&
      physical.year_built !== null &&
      physical.year_built !== undefined
        ? Math.abs(Number(subjectPhysical.year_built) - Number(physical.year_built))
        : null;

    if (
      yearBuiltDelta !== null &&
      yearBuiltDelta > parameters.yearBuiltTolerance
    ) {
      continue;
    }

    const bedDelta =
      subjectPhysical?.bedrooms_total !== null &&
      subjectPhysical?.bedrooms_total !== undefined &&
      physical.bedrooms_total !== null &&
      physical.bedrooms_total !== undefined
        ? Math.abs(Number(subjectPhysical.bedrooms_total) - Number(physical.bedrooms_total))
        : null;

    if (bedDelta !== null && bedDelta > parameters.bedTolerance) {
      continue;
    }

    const bathDelta =
      subjectPhysical?.bathrooms_total !== null &&
      subjectPhysical?.bathrooms_total !== undefined &&
      physical.bathrooms_total !== null &&
      physical.bathrooms_total !== undefined
        ? Math.abs(Number(subjectPhysical.bathrooms_total) - Number(physical.bathrooms_total))
        : null;

    if (bathDelta !== null && bathDelta > parameters.bathTolerance) {
      continue;
    }

    const rawScore = scoreCandidate({
      distanceMiles,
      maxDistanceMiles: parameters.maxDistanceMiles,
      daysSinceClose,
      maxDaysSinceClose: parameters.maxDaysSinceClose,
      sqftDeltaPct,
      sqftTolerancePct: parameters.sqftTolerancePct,
      yearBuiltDelta,
      yearBuiltTolerance: parameters.yearBuiltTolerance,
      bedDelta,
      bedTolerance: parameters.bedTolerance,
      bathDelta,
      bathTolerance: parameters.bathTolerance,
    });

    const ppsf =
      listing.close_price && candidateAreaSqft
        ? Number((Number(listing.close_price) / candidateAreaSqft).toFixed(2))
        : null;

    evaluated.push({
      compListingRowId: listing.id,
      compRealPropertyId: listing.real_property_id,
      distanceMiles: Number(distanceMiles.toFixed(3)),
      daysSinceClose,
      sqftDeltaPct: Number(sqftDeltaPct.toFixed(3)),
      yearBuiltDelta,
      bedDelta,
      bathDelta: bathDelta !== null ? Number(bathDelta.toFixed(2)) : null,
      rawScore,
      metricsJson: {
        address: property.unparsed_address,
        city: property.city,
        postal_code: property.postal_code,
        listing_id: listing.listing_id,
        mls_status: listing.mls_status,
        property_condition_source: listing.property_condition_source,
        close_price: listing.close_price,
        close_date: listing.close_date,
        property_type: physical.property_type,
        level_class_standardized: physical.level_class_standardized,
        comp_area_sqft: candidateAreaSqft,
        bedrooms_total: physical.bedrooms_total,
        bathrooms_total: physical.bathrooms_total,
        year_built: physical.year_built,
        ppsf,
      },
    });
  }

  evaluated.sort((a, b) => {
    if (b.rawScore !== a.rawScore) return b.rawScore - a.rawScore;
    if (a.distanceMiles !== b.distanceMiles) return a.distanceMiles - b.distanceMiles;
    return a.daysSinceClose - b.daysSinceClose;
  });

  const candidates = evaluated.slice(0, parameters.maxCandidateCount);

  const { data: run, error: runError } = await supabase
    .from("valuation_runs")
    .insert({
      valuation_profile_id: profile.id,
      subject_real_property_id: propertyId,
      subject_listing_row_id: subjectListingRow?.id ?? null,
      run_type: "manual",
      status: "complete",
      parameters_json: parameters,
      summary_json: {
        evaluated_candidates: evaluated.length,
        returned_candidates: candidates.length,
        subject_area_sqft: subjectAreaSqft,
        subject_property_type: subjectPhysical?.property_type ?? null,
        subject_level_class: subjectPhysical?.level_class_standardized ?? null,
      },
      created_by_user_id: createdByUserId ?? null,
    })
    .select("id")
    .single();

  if (runError || !run) {
    throw new Error(runError?.message ?? "Failed to create valuation run.");
  }

  if (candidates.length > 0) {
    const candidatePayload = candidates.map((candidate, index) => ({
      valuation_run_id: run.id,
      comp_listing_row_id: candidate.compListingRowId,
      comp_real_property_id: candidate.compRealPropertyId,
      distance_miles: candidate.distanceMiles,
      days_since_close: candidate.daysSinceClose,
      sqft_delta_pct: candidate.sqftDeltaPct,
      year_built_delta: candidate.yearBuiltDelta,
      bed_delta: candidate.bedDelta,
      bath_delta: candidate.bathDelta,
      raw_score: candidate.rawScore,
      selected_yn: index < 5,
      metrics_json: candidate.metricsJson,
    }));

    const { error: candidatesError } = await supabase
      .from("valuation_run_candidates")
      .insert(candidatePayload);

    if (candidatesError) {
      throw new Error(candidatesError.message);
    }
  }

  return {
    runId: run.id,
    candidateCount: candidates.length,
    evaluatedCount: evaluated.length,
  };
}

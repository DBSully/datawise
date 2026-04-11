// /app/(workspace)/deals/actions.ts

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  initialManualAnalysisFormState,
  type ManualAnalysisFormState,
} from "@/lib/analysis/manual-analysis-state";
import { runComparableSearch } from "@/lib/comparables/engine";

function textValue(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function nullableText(formData: FormData, key: string) {
  const value = textValue(formData, key);
  return value === "" ? null : value;
}

function nullableNumber(formData: FormData, key: string) {
  const raw = textValue(formData, key);
  if (raw === "") return null;

  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function nullableInteger(formData: FormData, key: string) {
  const raw = textValue(formData, key);
  if (raw === "") return null;

  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Parse a percentage input (e.g. "11" for 11%) and store as decimal (0.11). */
function nullablePctToDecimal(formData: FormData, key: string) {
  const raw = textValue(formData, key);
  if (raw === "") return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return null;
  return parsed / 100;
}

function arrayTextValues(formData: FormData, key: string) {
  return formData
    .getAll(key)
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter((value): value is string => value.length > 0);
}

function parseComparablePurpose(value: string) {
  if (
    value === "standard" ||
    value === "flip" ||
    value === "rental" ||
    value === "scrape"
  ) {
    return value;
  }

  return undefined;
}

function parseSnapshotMode(value: string) {
  if (value === "auto" || value === "current" || value === "custom") {
    return value;
  }

  return undefined;
}

function parseSizeBasis(value: string) {
  if (value === "building_area_total" || value === "lot_size") {
    return value;
  }

  return null;
}

function isIsoDateString(value: string | null) {
  if (!value) return false;
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

type ActiveAnalysisRecord = {
  id: string;
  listing_id: string | null;
  updated_at: string | null;
  scenario_name: string | null;
  strategy_type: string | null;
};

function titleCaseStrategy(strategy: string) {
  return strategy
    .split("_")
    .join(" ")
    .split("-")
    .join(" ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

async function getUserOwnedAnalysis(params: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
  propertyId: string;
  analysisId: string;
}): Promise<ActiveAnalysisRecord> {
  const { supabase, userId, propertyId, analysisId } = params;

  const { data, error } = await supabase
    .from("analyses")
    .select("id, listing_id, updated_at, scenario_name, strategy_type")
    .eq("id", analysisId)
    .eq("real_property_id", propertyId)
    .eq("created_by_user_id", userId)
    .eq("is_archived", false)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error("Analysis not found for this property and user.");
  }

  return data;
}

async function getOrCreateAnalysis(params: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
  propertyId: string;
  listingId: string | null;
  analysisId?: string | null;
}): Promise<ActiveAnalysisRecord> {
  const { supabase, userId, propertyId, listingId, analysisId } = params;

  if (analysisId) {
    return getUserOwnedAnalysis({
      supabase,
      userId,
      propertyId,
      analysisId,
    });
  }

  const { data: insertedAnalysis, error: insertedAnalysisError } =
    await supabase
      .from("analyses")
      .insert({
        real_property_id: propertyId,
        listing_id: listingId,
        created_by_user_id: userId,
        scenario_name: "General Analysis",
        strategy_type: "general",
        status: "draft",
        is_archived: false,
      })
      .select("id, listing_id, updated_at, scenario_name, strategy_type")
      .single();

  if (insertedAnalysisError || !insertedAnalysis) {
    throw new Error(
      insertedAnalysisError?.message ?? "Failed to create analysis.",
    );
  }

  return insertedAnalysis;
}

export async function createAnalysisScenarioAction(formData: FormData) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/sign-in");
  }

  const propertyId = textValue(formData, "property_id");
  const listingId = nullableText(formData, "listing_id");
  const strategyType = textValue(formData, "strategy_type") || "general";
  const scenarioNameInput = nullableText(formData, "scenario_name");

  if (!propertyId) {
    redirect("/admin/properties");
  }

  const { count: existingScenarioCount, error: existingScenarioCountError } =
    await supabase
      .from("analyses")
      .select("id", { count: "exact", head: true })
      .eq("real_property_id", propertyId)
      .eq("created_by_user_id", user.id)
      .eq("strategy_type", strategyType)
      .eq("is_archived", false);

  if (existingScenarioCountError) {
    throw new Error(existingScenarioCountError.message);
  }

  const scenarioNumber = (existingScenarioCount ?? 0) + 1;
  const defaultScenarioName = `${titleCaseStrategy(strategyType)} ${scenarioNumber}`;

  const { data: insertedAnalysis, error: insertedAnalysisError } =
    await supabase
      .from("analyses")
      .insert({
        real_property_id: propertyId,
        listing_id: listingId,
        created_by_user_id: user.id,
        scenario_name: scenarioNameInput ?? defaultScenarioName,
        strategy_type: strategyType,
        status: "draft",
        is_archived: false,
      })
      .select("id")
      .single();

  if (insertedAnalysisError || !insertedAnalysis) {
    throw new Error(
      insertedAnalysisError?.message ?? "Failed to create analysis scenario.",
    );
  }

  revalidatePath(`/admin/properties/${propertyId}`);
  revalidatePath(`/analysis/${insertedAnalysis.id}`);
  redirect(
    `/analysis/${insertedAnalysis.id}`,
  );
}

export async function saveManualAnalysisAction(
  _previousState: ManualAnalysisFormState,
  formData: FormData,
): Promise<ManualAnalysisFormState> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/sign-in");
  }

  const propertyId = textValue(formData, "property_id");
  const listingId = nullableText(formData, "listing_id");
  const analysisId = nullableText(formData, "analysis_id");

  if (!propertyId) {
    return {
      ...initialManualAnalysisFormState,
      status: "error",
      message: "Property ID is required.",
    };
  }

  let activeAnalysis: ActiveAnalysisRecord;
  try {
    activeAnalysis = await getOrCreateAnalysis({
      supabase,
      userId: user.id,
      propertyId,
      listingId,
      analysisId,
    });
  } catch (error) {
    return {
      ...initialManualAnalysisFormState,
      status: "error",
      message:
        error instanceof Error
          ? error.message
          : "Failed to initialize analysis.",
    };
  }

  const { error: manualError } = await supabase.from("manual_analysis").upsert({
    analysis_id: activeAnalysis.id,
    analyst_condition: nullableText(formData, "analyst_condition"),
    update_year_est: nullableInteger(formData, "update_year_est"),
    update_quality: nullableText(formData, "update_quality"),
    uad_condition_manual: nullableText(formData, "uad_condition_manual"),
    uad_updates_manual: nullableText(formData, "uad_updates_manual"),
    arv_manual: nullableNumber(formData, "arv_manual"),
    margin_manual: nullableNumber(formData, "margin_manual"),
    rehab_manual: nullableNumber(formData, "rehab_manual"),
    days_held_manual: nullableInteger(formData, "days_held_manual"),
    rent_estimate_monthly: nullableNumber(formData, "rent_estimate_monthly"),
    target_profit_manual: nullableNumber(formData, "target_profit_manual"),
    financing_rate_manual: nullablePctToDecimal(formData, "financing_rate_manual"),
    financing_points_manual: nullablePctToDecimal(formData, "financing_points_manual"),
    financing_ltv_manual: nullablePctToDecimal(formData, "financing_ltv_manual"),
    design_rating: nullableText(formData, "design_rating"),
    location_rating: nullableText(formData, "location_rating"),
    rehab_scope: nullableText(formData, "rehab_scope"),
    rehab_category_scopes: (() => {
      const raw = formData.get("rehab_category_scopes");
      if (typeof raw !== "string" || raw === "") return null;
      try { return JSON.parse(raw); } catch { return null; }
    })(),
    rehab_custom_items: (() => {
      const raw = formData.get("rehab_custom_items");
      if (typeof raw !== "string" || raw === "") return null;
      try { return JSON.parse(raw); } catch { return null; }
    })(),
  });

  if (manualError) {
    return {
      ...initialManualAnalysisFormState,
      status: "error",
      analysisId: activeAnalysis.id,
      message: manualError.message,
    };
  }

  const { error: pipelineError } = await supabase
    .from("analysis_pipeline")
    .upsert({
      analysis_id: activeAnalysis.id,
      interest_level: nullableText(formData, "interest_level"),
      showing_status: nullableText(formData, "showing_status"),
      offer_status: nullableText(formData, "offer_status"),
    });

  if (pipelineError) {
    return {
      ...initialManualAnalysisFormState,
      status: "error",
      analysisId: activeAnalysis.id,
      message: pipelineError.message,
    };
  }

  revalidatePath(`/admin/properties/${propertyId}`);
  revalidatePath(
    `/analysis/${activeAnalysis.id}`,
  );

  return {
    status: "success",
    analysisId: activeAnalysis.id,
    message: "Manual analysis saved successfully.",
  };
}

export async function runComparableSearchAction(formData: FormData) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/sign-in");
  }

  const propertyId = textValue(formData, "property_id");
  const analysisId = textValue(formData, "analysis_id");
  const subjectListingRowId = textValue(formData, "subject_listing_row_id");
  const profileSlug =
    textValue(formData, "profile_slug") || "denver_detached_standard_v1";

  if (!propertyId || !analysisId) {
    redirect("/admin/properties");
  }

  try {
    await getUserOwnedAnalysis({
      supabase,
      userId: user.id,
      propertyId,
      analysisId,
    });
  } catch (error) {
    redirect(
      `/admin/properties/${propertyId}?comp_error=${encodeURIComponent(
        error instanceof Error ? error.message : "Analysis not found.",
      )}`,
    );
  }

  const requestedPurpose = parseComparablePurpose(
    textValue(formData, "purpose"),
  );
  const snapshotMode =
    parseSnapshotMode(textValue(formData, "snapshot_mode")) ?? "auto";
  const customSnapshotDate = nullableText(formData, "custom_snapshot_date");
  const allowedLevelClasses = arrayTextValues(
    formData,
    "allowed_level_classes",
  );
  const parsedSizeBasis = parseSizeBasis(textValue(formData, "size_basis"));

  if (snapshotMode === "custom" && !isIsoDateString(customSnapshotDate)) {
    redirect(
      `/analysis/${analysisId}?comp_error=${encodeURIComponent(
        "A valid custom snapshot date is required.",
      )}`,
    );
  }

  try {
    await runComparableSearch({
      analysisId,
      subjectRealPropertyId: propertyId,
      subjectListingRowId: subjectListingRowId || null,
      profileSlug,
      purpose: requestedPurpose,
      snapshotMode,
      customSnapshotDate,
      allowedLevelClasses,
      overrides: {
        maxDistanceMiles: nullableNumber(formData, "max_distance_miles"),
        maxDaysSinceClose: nullableInteger(formData, "max_days_since_close"),
        sqftTolerancePct: nullableNumber(formData, "sqft_tolerance_pct"),
        lotSizeTolerancePct: nullableNumber(formData, "lot_size_tolerance_pct"),
        yearToleranceYears: nullableInteger(formData, "year_tolerance_years"),
        bedTolerance: nullableInteger(formData, "bed_tolerance"),
        bathTolerance: nullableNumber(formData, "bath_tolerance"),
        maxCandidates: nullableInteger(formData, "max_candidates"),
        requireSamePropertyType:
          formData.get("require_same_property_type") === "on",
        requireSameLevelClass:
          formData.get("require_same_level_class") === "on" ||
          allowedLevelClasses.length > 0,
        requireSameBuildingForm:
          formData.get("require_same_building_form") === "on",
        sizeBasis: parsedSizeBasis,
      },
    });
  } catch (error) {
    redirect(
      `/analysis/${analysisId}?comp_error=${encodeURIComponent(
        error instanceof Error ? error.message : "Comp search failed.",
      )}`,
    );
  }

  revalidatePath(`/admin/properties/${propertyId}`);
  revalidatePath(`/analysis/${analysisId}`);

  redirect(
    `/analysis/${analysisId}?comp_run=${encodeURIComponent(
      "Comparable search saved successfully.",
    )}`,
  );
}

export async function toggleComparableCandidateSelectionAction(
  formData: FormData,
) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/sign-in");
  }

  const candidateIdValue = formData.get("candidate_id");
  const propertyIdValue = formData.get("property_id");
  const analysisIdValue = formData.get("analysis_id");
  const nextSelectedValue = formData.get("next_selected");

  const candidateId =
    typeof candidateIdValue === "string" ? candidateIdValue.trim() : "";
  const propertyId =
    typeof propertyIdValue === "string" ? propertyIdValue.trim() : "";
  const analysisId =
    typeof analysisIdValue === "string" ? analysisIdValue.trim() : "";
  const nextSelected =
    typeof nextSelectedValue === "string"
      ? nextSelectedValue === "true"
      : false;

  if (!candidateId || !propertyId || !analysisId) {
    throw new Error("Candidate ID, property ID, and analysis ID are required.");
  }

  const { error } = await supabase
    .from("comparable_search_candidates")
    .update({ selected_yn: nextSelected })
    .eq("id", candidateId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath(`/admin/properties/${propertyId}`);
  revalidatePath(`/analysis/${analysisId}`);
  revalidatePath(
    `/analysis/${analysisId}`,
  );
}

// ---------------------------------------------------------------------------
// Toggle As-Is comparable candidate selection
// ---------------------------------------------------------------------------

export async function toggleAsIsComparableCandidateSelectionAction(
  formData: FormData,
) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/sign-in");
  }

  const candidateId =
    typeof formData.get("candidate_id") === "string"
      ? (formData.get("candidate_id") as string).trim()
      : "";
  const propertyId =
    typeof formData.get("property_id") === "string"
      ? (formData.get("property_id") as string).trim()
      : "";
  const analysisId =
    typeof formData.get("analysis_id") === "string"
      ? (formData.get("analysis_id") as string).trim()
      : "";
  const nextSelected =
    typeof formData.get("next_selected") === "string"
      ? formData.get("next_selected") === "true"
      : false;

  if (!candidateId || !propertyId || !analysisId) {
    throw new Error("Candidate ID, property ID, and analysis ID are required.");
  }

  const { error } = await supabase
    .from("comparable_search_candidates")
    .update({ selected_as_is_yn: nextSelected })
    .eq("id", candidateId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath(`/admin/properties/${propertyId}`);
  revalidatePath(`/analysis/${analysisId}`);
  revalidatePath(
    `/analysis/${analysisId}`,
  );
}

// ---------------------------------------------------------------------------
// Add a comp manually by MLS number
// ---------------------------------------------------------------------------

export async function addManualCompAction(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/sign-in");
  }

  const propertyId = textValue(formData, "property_id");
  const analysisId = textValue(formData, "analysis_id");
  const compSearchRunId = textValue(formData, "comp_search_run_id");
  const mlsNumber = textValue(formData, "mls_number");

  if (!propertyId || !analysisId || !compSearchRunId || !mlsNumber) {
    redirect(
      `/analysis/${analysisId}?comp_error=${encodeURIComponent(
        "MLS number is required.",
      )}`,
    );
  }

  // Look up the listing by MLS number (listing_id)
  const { data: compListing, error: listingError } = await supabase
    .from("mls_listings")
    .select("id, real_property_id, close_price, concessions_amount, close_date, listing_id")
    .eq("listing_id", mlsNumber)
    .maybeSingle();

  if (listingError) {
    redirect(
      `/analysis/${analysisId}?comp_error=${encodeURIComponent(
        listingError.message,
      )}`,
    );
  }

  if (!compListing) {
    redirect(
      `/analysis/${analysisId}?comp_error=${encodeURIComponent(
        `No listing found for MLS# ${mlsNumber}. The listing must exist in the database.`,
      )}`,
    );
  }

  // Check for duplicate
  const { data: existing } = await supabase
    .from("comparable_search_candidates")
    .select("id")
    .eq("comparable_search_run_id", compSearchRunId)
    .eq("comp_listing_row_id", compListing.id)
    .maybeSingle();

  if (existing) {
    redirect(
      `/analysis/${analysisId}?comp_error=${encodeURIComponent(
        `MLS# ${mlsNumber} is already in the candidate list.`,
      )}`,
    );
  }

  // Load subject property for delta calculations
  const [
    { data: subjectProperty },
    { data: subjectPhysical },
    { data: compProperty },
    { data: compPhysical },
  ] = await Promise.all([
    supabase
      .from("real_properties")
      .select("latitude, longitude")
      .eq("id", propertyId)
      .maybeSingle(),
    supabase
      .from("property_physical")
      .select("building_area_total_sqft, above_grade_finished_area_sqft, lot_size_sqft, year_built, bedrooms_total, bathrooms_total")
      .eq("real_property_id", propertyId)
      .maybeSingle(),
    supabase
      .from("real_properties")
      .select("latitude, longitude, lot_size_sqft")
      .eq("id", compListing.real_property_id)
      .maybeSingle(),
    supabase
      .from("property_physical")
      .select("building_area_total_sqft, above_grade_finished_area_sqft, year_built, bedrooms_total, bathrooms_total")
      .eq("real_property_id", compListing.real_property_id)
      .maybeSingle(),
  ]);

  // Calculate deltas where possible
  let distanceMiles: number | null = null;
  if (
    subjectProperty?.latitude && subjectProperty?.longitude &&
    compProperty?.latitude && compProperty?.longitude
  ) {
    distanceMiles = haversine(
      Number(subjectProperty.latitude), Number(subjectProperty.longitude),
      Number(compProperty.latitude), Number(compProperty.longitude),
    );
  }

  let daysSinceClose: number | null = null;
  if (compListing.close_date) {
    daysSinceClose = Math.round(
      (Date.now() - new Date(compListing.close_date).getTime()) / 86_400_000,
    );
  }

  const subjectSqft = Number(subjectPhysical?.building_area_total_sqft ?? subjectPhysical?.above_grade_finished_area_sqft ?? 0);
  const compSqft = Number(compPhysical?.building_area_total_sqft ?? compPhysical?.above_grade_finished_area_sqft ?? 0);
  const sqftDeltaPct = subjectSqft > 0 && compSqft > 0
    ? Math.round(((compSqft - subjectSqft) / subjectSqft) * 10000) / 100
    : null;

  const yearBuiltDelta =
    subjectPhysical?.year_built && compPhysical?.year_built
      ? Number(compPhysical.year_built) - Number(subjectPhysical.year_built)
      : null;

  const bedDelta =
    subjectPhysical?.bedrooms_total != null && compPhysical?.bedrooms_total != null
      ? Number(compPhysical.bedrooms_total) - Number(subjectPhysical.bedrooms_total)
      : null;

  const bathDelta =
    subjectPhysical?.bathrooms_total != null && compPhysical?.bathrooms_total != null
      ? Number(compPhysical.bathrooms_total) - Number(subjectPhysical.bathrooms_total)
      : null;

  const { error: insertError } = await supabase
    .from("comparable_search_candidates")
    .insert({
      comparable_search_run_id: compSearchRunId,
      comp_listing_row_id: compListing.id,
      comp_real_property_id: compListing.real_property_id,
      distance_miles: distanceMiles != null ? Math.round(distanceMiles * 1000) / 1000 : null,
      days_since_close: daysSinceClose,
      sqft_delta_pct: sqftDeltaPct,
      year_built_delta: yearBuiltDelta,
      bed_delta: bedDelta,
      bath_delta: bathDelta,
      raw_score: null,
      selected_yn: true,
      metrics_json: {
        source: "manual",
        listing_id: compListing.listing_id,
        close_price: compListing.close_price,
        concessions_amount: compListing.concessions_amount,
        net_price: (Number(compListing.close_price) || 0) - (Number(compListing.concessions_amount) || 0),
        close_date: compListing.close_date,
      },
      score_breakdown_json: { source: "manual" },
    });

  if (insertError) {
    redirect(
      `/analysis/${analysisId}?comp_error=${encodeURIComponent(
        insertError.message,
      )}`,
    );
  }

  revalidatePath(`/admin/properties/${propertyId}`);
  revalidatePath(`/analysis/${analysisId}`);

  redirect(
    `/analysis/${analysisId}?comp_run=${encodeURIComponent(
      `MLS# ${mlsNumber} added as a comp.`,
    )}`,
  );
}

function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3958.8;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ---------------------------------------------------------------------------
// Add analysis note
// ---------------------------------------------------------------------------

export async function addAnalysisNoteAction(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const analysisId = textValue(formData, "analysis_id");
  const noteType = textValue(formData, "note_type") || "general";
  const noteBody = textValue(formData, "note_body");
  const isPublic = formData.get("is_public") === "on";

  if (!analysisId || !noteBody) return;

  const { error } = await supabase.from("analysis_notes").insert({
    analysis_id: analysisId,
    note_type: noteType,
    note_body: noteBody,
    is_public: isPublic,
  });

  if (error) throw new Error(error.message);

  // Find property ID to revalidate
  const { data: analysis } = await supabase
    .from("analyses")
    .select("real_property_id")
    .eq("id", analysisId)
    .maybeSingle();

  if (analysis) {
    revalidatePath(
      `/analysis/${analysisId}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Delete analysis note
// ---------------------------------------------------------------------------

export async function deleteAnalysisNoteAction(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const noteId = textValue(formData, "note_id");
  const analysisId = textValue(formData, "analysis_id");
  if (!noteId) return;

  const { error } = await supabase
    .from("analysis_notes")
    .delete()
    .eq("id", noteId);

  if (error) throw new Error(error.message);

  if (analysisId) {
    const { data: analysis } = await supabase
      .from("analyses")
      .select("real_property_id")
      .eq("id", analysisId)
      .maybeSingle();

    if (analysis) {
      revalidatePath(
        `/analysis/${analysisId}`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Save pipeline status
// ---------------------------------------------------------------------------
// Mark analysis complete / update timestamp
// ---------------------------------------------------------------------------

export async function markAnalysisCompleteAction(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const analysisId = textValue(formData, "analysis_id");
  if (!analysisId) return { error: "Missing analysis_id" };

  const { error } = await supabase
    .from("analyses")
    .update({
      status: "complete",
      analysis_completed_at: new Date().toISOString(),
    })
    .eq("id", analysisId);

  if (error) return { error: error.message };

  revalidatePath(`/analysis/${analysisId}`);
  revalidatePath("/home");

  return { error: null, completedAt: new Date().toISOString() };
}

// ---------------------------------------------------------------------------

export async function savePipelineAction(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const analysisId = textValue(formData, "analysis_id");
  if (!analysisId) return;

  const interestLevel = nullableText(formData, "interest_level");
  const showingStatus = nullableText(formData, "showing_status");
  const offerStatus = nullableText(formData, "offer_status");

  const { error } = await supabase.from("analysis_pipeline").upsert(
    {
      analysis_id: analysisId,
      interest_level: interestLevel,
      showing_status: showingStatus,
      offer_status: offerStatus,
    },
    { onConflict: "analysis_id" },
  );

  if (error) throw new Error(error.message);

  const { data: analysis } = await supabase
    .from("analyses")
    .select("real_property_id")
    .eq("id", analysisId)
    .maybeSingle();

  if (analysis) {
    revalidatePath(
      `/analysis/${analysisId}`,
    );
  }
}

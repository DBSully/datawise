"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { runScreeningBatch } from "@/lib/screening/bulk-runner";
import { DENVER_FLIP_V1 } from "@/lib/screening/strategy-profiles";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function textValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

// ---------------------------------------------------------------------------
// Run screening batch
// ---------------------------------------------------------------------------

export async function runScreeningAction(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/sign-in");
  }

  const name = textValue(formData, "name") || "Screening Batch";
  const statusFilter = textValue(formData, "status_filter") || "Active";
  const filterMode = textValue(formData, "filter_mode") || "all";

  // Parse status filter into array
  const statuses = statusFilter
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  let propertyIds: string[];

  if (filterMode === "unscreened") {
    // Use RPC to get only properties with no existing screening results
    const { data: unscreenedRows, error: rpcError } = await supabase.rpc(
      "get_unscreened_property_ids",
      { statuses },
    );

    if (rpcError) {
      throw new Error(rpcError.message);
    }

    propertyIds = (unscreenedRows ?? []).map(
      (r: { real_property_id: string }) => r.real_property_id,
    );
  } else {
    // Find subject properties: those with active/coming-soon listings
    // Paginate to avoid the default PostgREST 1,000-row cap
    const PAGE_SIZE = 1000;
    const propertyIdSet = new Set<string>();
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      const { data: page, error: pageError } = await supabase
        .from("mls_listings")
        .select("real_property_id")
        .in("mls_status", statuses)
        .range(offset, offset + PAGE_SIZE - 1);

      if (pageError) {
        throw new Error(pageError.message);
      }

      for (const row of page ?? []) {
        propertyIdSet.add(row.real_property_id);
      }

      if (!page || page.length < PAGE_SIZE) {
        hasMore = false;
      } else {
        offset += PAGE_SIZE;
      }
    }

    propertyIds = Array.from(propertyIdSet);
  }

  if (propertyIds.length === 0) {
    // Nothing to screen — redirect back with a message
    revalidatePath("/analysis/screening");
    redirect("/analysis/screening");
  }

  const profile = DENVER_FLIP_V1;

  // Create batch record
  const { data: batch, error: batchError } = await supabase
    .from("screening_batches")
    .insert({
      name,
      trigger_type: "manual",
      strategy_profile_slug: profile.slug,
      status: "pending",
      subject_filter_json: { statuses, filterMode },
      total_subjects: propertyIds.length,
      created_by_user_id: user.id,
    })
    .select("id")
    .single();

  if (batchError || !batch) {
    throw new Error(batchError?.message ?? "Failed to create screening batch");
  }

  // Run the pipeline
  await runScreeningBatch({
    supabase,
    batchId: batch.id,
    subjectPropertyIds: propertyIds,
    profile,
  });

  revalidatePath("/analysis/screening");
  redirect(`/analysis/screening/${batch.id}`);
}

// ---------------------------------------------------------------------------
// Run screening for a specific import batch
// ---------------------------------------------------------------------------

export async function runImportScreeningAction(
  formData: FormData,
): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/sign-in");
  }

  const importBatchId = textValue(formData, "import_batch_id");
  if (!importBatchId) {
    throw new Error("Missing import_batch_id");
  }

  // Get property IDs from this import batch
  const { data: importRows, error: rpcError } = await supabase.rpc(
    "get_import_batch_property_ids",
    { p_import_batch_id: importBatchId },
  );

  if (rpcError) {
    throw new Error(rpcError.message);
  }

  const propertyIds = (importRows ?? []).map(
    (r: { real_property_id: string }) => r.real_property_id,
  );

  if (propertyIds.length === 0) {
    revalidatePath("/analysis/screening");
    redirect("/analysis/screening");
  }

  const profile = DENVER_FLIP_V1;

  // Create batch record linked to the import
  const { data: batch, error: batchError } = await supabase
    .from("screening_batches")
    .insert({
      name: `Import Screen — ${new Date().toLocaleDateString()}`,
      trigger_type: "import",
      source_import_batch_id: importBatchId,
      strategy_profile_slug: profile.slug,
      status: "pending",
      subject_filter_json: { importBatchId },
      total_subjects: propertyIds.length,
      created_by_user_id: user.id,
    })
    .select("id")
    .single();

  if (batchError || !batch) {
    throw new Error(batchError?.message ?? "Failed to create screening batch");
  }

  // Run the pipeline
  await runScreeningBatch({
    supabase,
    batchId: batch.id,
    subjectPropertyIds: propertyIds,
    profile,
  });

  revalidatePath("/analysis/screening");
  redirect(`/analysis/screening/${batch.id}`);
}

// ---------------------------------------------------------------------------
// Load comp data for screening result (used by Quick Comps modal)
// ---------------------------------------------------------------------------

export type ScreeningCompData = {
  subjectAddress: string;
  subjectCity: string;
  subjectListPrice: number | null;
  subjectBuildingSqft: number | null;
  subjectLat: number | null;
  subjectLng: number | null;
  estGapPerSqft: number | null;
  candidates: Array<{
    id: string;
    selected_yn: boolean;
    distance_miles: number | null;
    days_since_close: number | null;
    sqft_delta_pct: number | null;
    raw_score: number | null;
    metrics_json: Record<string, unknown>;
  }>;
};

export async function loadScreeningCompDataAction(
  resultId: string,
): Promise<ScreeningCompData | null> {
  const supabase = await createClient();

  const { data: result, error: resultError } = await supabase
    .from("screening_results")
    .select(
      "id, real_property_id, comp_search_run_id, subject_address, subject_city, subject_list_price, subject_building_sqft, est_gap_per_sqft",
    )
    .eq("id", resultId)
    .single();

  if (resultError || !result) return null;

  // Get subject coordinates
  const { data: prop } = await supabase
    .from("real_properties")
    .select("latitude, longitude")
    .eq("id", result.real_property_id)
    .single();

  if (!result.comp_search_run_id) {
    return {
      subjectAddress: result.subject_address,
      subjectCity: result.subject_city,
      subjectListPrice: result.subject_list_price,
      subjectBuildingSqft: result.subject_building_sqft,
      subjectLat: prop?.latitude ?? null,
      subjectLng: prop?.longitude ?? null,
      estGapPerSqft: result.est_gap_per_sqft,
      candidates: [],
    };
  }

  const { data: candidates } = await supabase
    .from("comparable_search_candidates")
    .select(
      "id, selected_yn, distance_miles, days_since_close, sqft_delta_pct, raw_score, metrics_json",
    )
    .eq("comparable_search_run_id", result.comp_search_run_id)
    .order("raw_score", { ascending: false });

  return {
    subjectAddress: result.subject_address,
    subjectCity: result.subject_city,
    subjectListPrice: result.subject_list_price,
    subjectBuildingSqft: result.subject_building_sqft,
    subjectLat: prop?.latitude ?? null,
    subjectLng: prop?.longitude ?? null,
    estGapPerSqft: result.est_gap_per_sqft,
    candidates: (candidates ?? []).map((c) => ({
      ...c,
      metrics_json: (c.metrics_json ?? {}) as Record<string, unknown>,
    })),
  };
}

// ---------------------------------------------------------------------------
// Toggle comp candidate selection from screening (no analysis required)
// ---------------------------------------------------------------------------

export async function toggleScreeningCompSelectionAction(
  formData: FormData,
): Promise<void> {
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
  const nextSelected =
    typeof formData.get("next_selected") === "string"
      ? formData.get("next_selected") === "true"
      : false;
  const batchId =
    typeof formData.get("batch_id") === "string"
      ? (formData.get("batch_id") as string).trim()
      : "";

  if (!candidateId) {
    throw new Error("Candidate ID is required.");
  }

  const { error } = await supabase
    .from("comparable_search_candidates")
    .update({ selected_yn: nextSelected })
    .eq("id", candidateId);

  if (error) {
    throw new Error(error.message);
  }

  if (batchId) {
    revalidatePath(`/analysis/screening/${batchId}`);
  }
}

// ---------------------------------------------------------------------------
// Promote screening result to full analysis
// ---------------------------------------------------------------------------

export async function promoteToAnalysisAction(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/sign-in");
  }

  const resultId = textValue(formData, "result_id");
  if (!resultId) {
    throw new Error("Missing result_id");
  }

  // Load the screening result with comp run linkage
  const { data: result, error: resultError } = await supabase
    .from("screening_results")
    .select("id, real_property_id, arv_aggregate, screening_batch_id, comp_search_run_id")
    .eq("id", resultId)
    .single();

  if (resultError || !result) {
    throw new Error(resultError?.message ?? "Screening result not found");
  }

  // Create an analysis record
  const { data: analysis, error: analysisError } = await supabase
    .from("analyses")
    .insert({
      real_property_id: result.real_property_id,
      created_by_user_id: user.id,
      scenario_name: "Fix-and-Flip (from screening)",
      strategy_type: "flip",
      status: "draft",
    })
    .select("id")
    .single();

  if (analysisError || !analysis) {
    throw new Error(analysisError?.message ?? "Failed to create analysis");
  }

  // Link the screening's comp search run to the new analysis
  // so the analysis workspace opens with comps pre-loaded
  if (result.comp_search_run_id) {
    await supabase
      .from("comparable_search_runs")
      .update({ analysis_id: analysis.id })
      .eq("id", result.comp_search_run_id);
  }

  // Mark the screening result as promoted
  await supabase
    .from("screening_results")
    .update({ promoted_analysis_id: analysis.id })
    .eq("id", resultId);

  // Initialize pipeline lifecycle tracking
  await supabase.from("analysis_pipeline").upsert({
    analysis_id: analysis.id,
    lifecycle_stage: "analysis",
    disposition: "active",
    interest_level: "new",
  });

  revalidatePath("/analysis/screening");
  revalidatePath("/analysis/dashboard");
  redirect(
    `/analysis/properties/${result.real_property_id}/analyses/${analysis.id}`,
  );
}

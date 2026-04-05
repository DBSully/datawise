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

  // Parse status filter into array
  const statuses = statusFilter
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  // Find subject properties: those with active/coming-soon listings
  const { data: listings, error: listingsError } = await supabase
    .from("mls_listings")
    .select("real_property_id")
    .in("mls_status", statuses);

  if (listingsError) {
    throw new Error(listingsError.message);
  }

  // Deduplicate property IDs
  const propertyIdSet = new Set<string>(
    (listings ?? []).map((l: { real_property_id: string }) => l.real_property_id),
  );
  const propertyIds = Array.from(propertyIdSet);

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
      subject_filter_json: { statuses },
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

  // Load the screening result
  const { data: result, error: resultError } = await supabase
    .from("screening_results")
    .select("id, real_property_id, arv_aggregate, screening_batch_id")
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

  // Mark the screening result as promoted
  await supabase
    .from("screening_results")
    .update({ promoted_analysis_id: analysis.id })
    .eq("id", resultId);

  revalidatePath("/analysis/screening");
  redirect(
    `/analysis/properties/${result.real_property_id}/analyses/${analysis.id}`,
  );
}

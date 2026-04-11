"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function textValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

// ---------------------------------------------------------------------------
// Advance pipeline stage
// ---------------------------------------------------------------------------

export async function advancePipelineStageAction(
  formData: FormData,
): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/sign-in");

  const analysisId = textValue(formData, "analysis_id");
  const nextStage = textValue(formData, "next_stage");
  if (!analysisId || !nextStage) return;

  const updates: Record<string, unknown> = {
    lifecycle_stage: nextStage,
  };

  // Set date fields based on stage transition
  const now = new Date().toISOString();
  if (nextStage === "offer") {
    updates.offer_status = "drafting";
  } else if (nextStage === "under_contract") {
    updates.offer_status = "accepted";
    updates.offer_accepted_date = now;
  }

  const { error } = await supabase
    .from("analysis_pipeline")
    .update(updates)
    .eq("analysis_id", analysisId);

  if (error) throw new Error(error.message);

  revalidatePath("/deals/pipeline");
  revalidatePath("/action");
  revalidatePath("/deals/watchlist");
  revalidatePath("/analysis");
  revalidatePath("/home");
}

// ---------------------------------------------------------------------------
// Update offer status inline
// ---------------------------------------------------------------------------

export async function updateOfferStatusAction(
  formData: FormData,
): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/sign-in");

  const analysisId = textValue(formData, "analysis_id");
  const offerStatus = textValue(formData, "offer_status");
  if (!analysisId) return;

  const updates: Record<string, unknown> = {
    offer_status: offerStatus || null,
  };

  // Track submission date
  if (offerStatus === "submitted") {
    updates.offer_submitted_date = new Date().toISOString();
  }

  const { error } = await supabase
    .from("analysis_pipeline")
    .update(updates)
    .eq("analysis_id", analysisId);

  if (error) throw new Error(error.message);
  revalidatePath("/deals/pipeline");
  revalidatePath("/action");
  revalidatePath("/home");
}

// ---------------------------------------------------------------------------
// Close deal (won or lost)
// ---------------------------------------------------------------------------

export async function closeDealAction(
  formData: FormData,
): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/sign-in");

  const analysisId = textValue(formData, "analysis_id");
  const outcome = textValue(formData, "outcome"); // "won" or "lost"
  const reason = textValue(formData, "reason");
  if (!analysisId || !outcome) return;

  const disposition = outcome === "won" ? "closed" : "passed";

  const { error } = await supabase
    .from("analysis_pipeline")
    .update({
      lifecycle_stage: "closed",
      disposition,
      closed_date: new Date().toISOString().slice(0, 10),
      offer_status: outcome === "won" ? "accepted" : (reason || "lost"),
    })
    .eq("analysis_id", analysisId);

  if (error) throw new Error(error.message);

  revalidatePath("/deals/pipeline");
  revalidatePath("/action");
  revalidatePath("/deals/closed");
  revalidatePath("/deals/watchlist");
  revalidatePath("/analysis");
  revalidatePath("/home");
}

// ---------------------------------------------------------------------------
// Move back to Watch List
// ---------------------------------------------------------------------------

export async function moveToWatchListAction(
  formData: FormData,
): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/sign-in");

  const analysisId = textValue(formData, "analysis_id");
  if (!analysisId) return;

  const { error } = await supabase
    .from("analysis_pipeline")
    .update({ lifecycle_stage: "analysis" })
    .eq("analysis_id", analysisId);

  if (error) throw new Error(error.message);

  revalidatePath("/deals/pipeline");
  revalidatePath("/action");
  revalidatePath("/deals/watchlist");
  revalidatePath("/analysis");
  revalidatePath("/home");
}

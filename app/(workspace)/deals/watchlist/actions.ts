"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function textValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

// ---------------------------------------------------------------------------
// Update analyst interest inline (hot | warm | watch | pass)
// ---------------------------------------------------------------------------

export async function updateAnalystInterestAction(
  formData: FormData,
): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/sign-in");

  const analysisId = textValue(formData, "analysis_id");
  const analystInterest = textValue(formData, "analyst_interest");
  const analystPassReason = textValue(formData, "analyst_pass_reason");
  if (!analysisId || !analystInterest) return;

  if (!["hot", "warm", "watch", "pass"].includes(analystInterest)) {
    throw new Error(`Unknown analyst interest: ${analystInterest}`);
  }

  // Pass requires a reason — symmetric to screener Fail.
  if (analystInterest === "pass" && !analystPassReason) {
    throw new Error("A reason is required when passing on a property.");
  }

  const update: Record<string, unknown> = {
    analyst_interest: analystInterest,
    analyst_decided_at: new Date().toISOString(),
    analyst_decided_by: user.id,
    analyst_pass_reason: analystInterest === "pass" ? analystPassReason : null,
  };

  const { error } = await supabase
    .from("analysis_pipeline")
    .update(update)
    .eq("analysis_id", analysisId);

  if (error) throw new Error(error.message);
  revalidatePath("/deals/watchlist");
  revalidatePath("/analysis");
  revalidatePath("/pipeline");
}

// ---------------------------------------------------------------------------
// Update showing status inline
// ---------------------------------------------------------------------------

export async function updateShowingStatusAction(
  formData: FormData,
): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/sign-in");

  const analysisId = textValue(formData, "analysis_id");
  const showingStatus = textValue(formData, "showing_status");
  if (!analysisId) return;

  const { error } = await supabase
    .from("analysis_pipeline")
    .update({ showing_status: showingStatus || null })
    .eq("analysis_id", analysisId);

  if (error) throw new Error(error.message);
  revalidatePath("/deals/watchlist");
  revalidatePath("/analysis");
  revalidatePath("/pipeline");
}

// ---------------------------------------------------------------------------
// Update watch list note inline
// ---------------------------------------------------------------------------

export async function updateWatchListNoteAction(
  formData: FormData,
): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/sign-in");

  const analysisId = textValue(formData, "analysis_id");
  const note = textValue(formData, "watch_list_note");
  if (!analysisId) return;

  const { error } = await supabase
    .from("analysis_pipeline")
    .update({ watch_list_note: note || null })
    .eq("analysis_id", analysisId);

  if (error) throw new Error(error.message);
  revalidatePath("/deals/watchlist");
  revalidatePath("/analysis");
  revalidatePath("/pipeline");
}

// ---------------------------------------------------------------------------
// Pass from Watch List (analyst-side decision; closes the lifecycle).
// Three-gate model: this DOES NOT touch screening_results.screener_decision —
// the screener's call is durable and stays as whatever they set originally.
// ---------------------------------------------------------------------------

export async function passFromWatchListAction(
  formData: FormData,
): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/sign-in");

  const analysisId = textValue(formData, "analysis_id");
  const passReason = textValue(formData, "pass_reason");
  if (!analysisId || !passReason) return;

  const { error } = await supabase
    .from("analysis_pipeline")
    .update({
      analyst_interest: "pass",
      analyst_pass_reason: passReason,
      analyst_decided_at: new Date().toISOString(),
      analyst_decided_by: user.id,
      disposition: "passed",
      lifecycle_stage: "closed",
    })
    .eq("analysis_id", analysisId);

  if (error) throw new Error(error.message);

  revalidatePath("/deals/watchlist");
  revalidatePath("/analysis");
  revalidatePath("/pipeline");
  revalidatePath("/deals/pipeline");
  revalidatePath("/action");
  revalidatePath("/dashboard");
}

// ---------------------------------------------------------------------------
// Move to Pipeline
// ---------------------------------------------------------------------------

export async function moveToPipelineAction(
  formData: FormData,
): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/sign-in");

  const analysisId = textValue(formData, "analysis_id");
  if (!analysisId) return;

  const { error } = await supabase
    .from("analysis_pipeline")
    .update({ lifecycle_stage: "showing" })
    .eq("analysis_id", analysisId);

  if (error) throw new Error(error.message);

  revalidatePath("/deals/watchlist");
  revalidatePath("/analysis");
  revalidatePath("/pipeline");
  revalidatePath("/deals/pipeline");
  revalidatePath("/action");
  revalidatePath("/dashboard");
}

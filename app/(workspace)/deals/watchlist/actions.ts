"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function textValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

// ---------------------------------------------------------------------------
// Update interest level inline
// ---------------------------------------------------------------------------

export async function updateInterestLevelAction(
  formData: FormData,
): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/sign-in");

  const analysisId = textValue(formData, "analysis_id");
  const interestLevel = textValue(formData, "interest_level");
  if (!analysisId || !interestLevel) return;

  const { error } = await supabase
    .from("analysis_pipeline")
    .update({ interest_level: interestLevel })
    .eq("analysis_id", analysisId);

  if (error) throw new Error(error.message);
  revalidatePath("/deals/watchlist");
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
}

// ---------------------------------------------------------------------------
// Pass from Watch List (archive the deal)
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
      disposition: "passed",
      lifecycle_stage: "closed",
    })
    .eq("analysis_id", analysisId);

  if (error) throw new Error(error.message);

  // Also mark the screening result as passed if it exists
  const { data: pipeline } = await supabase
    .from("analysis_pipeline")
    .select("promoted_from_screening_result_id")
    .eq("analysis_id", analysisId)
    .maybeSingle();

  if (pipeline?.promoted_from_screening_result_id) {
    await supabase
      .from("screening_results")
      .update({
        review_action: "passed",
        pass_reason: `Passed from Watch List: ${passReason}`,
        reviewed_at: new Date().toISOString(),
        reviewed_by_user_id: user.id,
        screening_updated_at: new Date().toISOString(),
      })
      .eq("id", pipeline.promoted_from_screening_result_id)
      .is("review_action", null);
  }

  revalidatePath("/deals/watchlist");
  revalidatePath("/deals/pipeline");
  revalidatePath("/home");
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
  revalidatePath("/deals/pipeline");
  revalidatePath("/home");
}

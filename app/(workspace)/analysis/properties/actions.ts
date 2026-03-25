"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  initialManualAnalysisFormState,
  type ManualAnalysisFormState,
} from "@/lib/analysis/manual-analysis-state";

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
  let analysisId = nullableText(formData, "analysis_id");

  if (!propertyId) {
    return {
      ...initialManualAnalysisFormState,
      status: "error",
      message: "Property ID is required.",
    };
  }

  if (!analysisId) {
    const { data: analysis, error: analysisCreateError } = await supabase
      .from("analyses")
      .insert({
        real_property_id: propertyId,
        listing_id: listingId,
      })
      .select("id")
      .single();

    if (analysisCreateError || !analysis) {
      return {
        ...initialManualAnalysisFormState,
        status: "error",
        message:
          analysisCreateError?.message ?? "Failed to create analysis record.",
      };
    }

    analysisId = analysis.id;
  }

  const { error: manualError } = await supabase.from("manual_analysis").upsert({
    analysis_id: analysisId,
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
    design_rating: nullableText(formData, "design_rating"),
    location_rating: nullableText(formData, "location_rating"),
  });

  if (manualError) {
    return {
      ...initialManualAnalysisFormState,
      status: "error",
      analysisId,
      message: manualError.message,
    };
  }

  const { error: pipelineError } = await supabase
    .from("analysis_pipeline")
    .upsert({
      analysis_id: analysisId,
      interest_level: nullableText(formData, "interest_level"),
      showing_status: nullableText(formData, "showing_status"),
      offer_status: nullableText(formData, "offer_status"),
    });

  if (pipelineError) {
    return {
      ...initialManualAnalysisFormState,
      status: "error",
      analysisId,
      message: pipelineError.message,
    };
  }

  revalidatePath(`/analysis/properties/${propertyId}`);
  revalidatePath("/analysis/properties");

  return {
    status: "success",
    analysisId,
    message: "Manual analysis saved successfully.",
  };
}

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadWorkstationData } from "@/lib/analysis/load-workstation-data";
import { buildReportSnapshot } from "@/lib/reports/snapshot";

export async function generateReportAction(formData: FormData) {
  const analysisId = formData.get("analysis_id") as string;
  const propertyId = formData.get("property_id") as string;
  const title = formData.get("title") as string;

  if (!analysisId || !propertyId || !title) {
    throw new Error("Missing required fields");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  // Load current analysis data (same function the workstation uses)
  const workstationData = await loadWorkstationData(
    supabase,
    user.id,
    propertyId,
    analysisId,
  );

  if (!workstationData) {
    throw new Error("Analysis not found");
  }

  // Build frozen snapshot
  const contentJson = buildReportSnapshot(workstationData);

  // Insert report
  const { data: report, error } = await supabase
    .from("analysis_reports")
    .insert({
      analysis_id: analysisId,
      report_type: "detailed",
      title,
      content_json: contentJson,
      created_by_user_id: user.id,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);

  revalidatePath("/reports");
  redirect(`/reports/${report.id}`);
}

export async function regenerateReportAction(formData: FormData) {
  const reportId = formData.get("report_id") as string;
  if (!reportId) throw new Error("Missing report_id");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  // Fetch the existing report to get analysis_id and confirm ownership.
  const { data: report, error: fetchError } = await supabase
    .from("analysis_reports")
    .select("id, analysis_id, created_by_user_id, analyses!inner(real_property_id)")
    .eq("id", reportId)
    .eq("created_by_user_id", user.id)
    .maybeSingle();

  if (fetchError) throw new Error(fetchError.message);
  if (!report) throw new Error("Report not found or access denied");

  // analyses!inner returns an object; guard against Supabase's array typing
  const analyses = report.analyses as unknown as { real_property_id: string } | { real_property_id: string }[];
  const realPropertyId = Array.isArray(analyses) ? analyses[0]?.real_property_id : analyses?.real_property_id;
  if (!realPropertyId) throw new Error("Analysis property not found");

  const workstationData = await loadWorkstationData(
    supabase,
    user.id,
    realPropertyId,
    report.analysis_id,
  );
  if (!workstationData) throw new Error("Analysis data could not be loaded");

  const contentJson = buildReportSnapshot(workstationData);

  const { error: updateError } = await supabase
    .from("analysis_reports")
    .update({ content_json: contentJson })
    .eq("id", reportId)
    .eq("created_by_user_id", user.id);

  if (updateError) throw new Error(updateError.message);

  revalidatePath(`/reports/${reportId}`);
  revalidatePath("/reports");
}

export async function deleteReportAction(formData: FormData) {
  const reportId = formData.get("report_id") as string;
  if (!reportId) throw new Error("Missing report_id");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { error } = await supabase
    .from("analysis_reports")
    .delete()
    .eq("id", reportId)
    .eq("created_by_user_id", user.id);

  if (error) throw new Error(error.message);

  revalidatePath("/reports");
  redirect("/reports");
}

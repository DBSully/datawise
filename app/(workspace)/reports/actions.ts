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

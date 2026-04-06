import { notFound } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ReportContentJson } from "@/lib/reports/types";
import { ReportViewer } from "./report-viewer";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ reportId: string }>;
};

export default async function ReportPage({ params }: Props) {
  noStore();
  const { reportId } = await params;
  const supabase = await createClient();

  const { data: report, error } = await supabase
    .from("analysis_reports")
    .select("id, analysis_id, report_type, title, content_json, created_at")
    .eq("id", reportId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!report) notFound();

  return (
    <ReportViewer
      reportId={report.id}
      title={report.title}
      content={report.content_json as ReportContentJson}
      createdAt={report.created_at}
    />
  );
}

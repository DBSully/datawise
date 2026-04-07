import { notFound } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { loadWorkstationData } from "@/lib/analysis/load-workstation-data";
import { AnalysisWorkstation } from "./analysis-workstation";

export const dynamic = "force-dynamic";

type WatchlistDetailPageProps = {
  params: Promise<{ analysisId: string }>;
};

export default async function WatchlistDetailPage({ params }: WatchlistDetailPageProps) {
  noStore();
  const { analysisId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Look up the property ID from the analysis record
  const { data: analysis } = await supabase
    .from("analyses")
    .select("real_property_id")
    .eq("id", analysisId)
    .maybeSingle();

  if (!analysis) notFound();

  const propertyId = analysis.real_property_id;

  const workstationData = await loadWorkstationData(
    supabase,
    user?.id ?? "",
    propertyId,
    analysisId,
  );

  if (!workstationData) notFound();

  return <AnalysisWorkstation data={workstationData} />;
}

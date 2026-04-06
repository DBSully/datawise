import { notFound } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { loadWorkstationData } from "@/lib/analysis/load-workstation-data";
import { AnalysisWorkstation } from "./analysis-workstation";

export const dynamic = "force-dynamic";

type AnalysisPageProps = {
  params: Promise<{ id: string; analysisId: string }>;
};

export default async function AnalysisPage({ params }: AnalysisPageProps) {
  noStore();
  const { id: propertyId, analysisId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const workstationData = await loadWorkstationData(
    supabase,
    user?.id ?? "",
    propertyId,
    analysisId,
  );

  if (!workstationData) notFound();

  return <AnalysisWorkstation data={workstationData} />;
}

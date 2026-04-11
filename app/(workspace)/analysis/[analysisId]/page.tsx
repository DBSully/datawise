// Phase 1 Step 3B Task 2 — canonical Workstation route
//
// New canonical home for the Analysis Workstation. Until 3E rebuilds
// the Workstation per WORKSTATION_CARD_SPEC.md, this route imports
// the SAME AnalysisWorkstation client component that the legacy
// /deals/watchlist/[analysisId] route uses. Both URLs render
// identical UI throughout the 3B-3E side-by-side period.
//
// In 3E, this page.tsx will be updated to import a NEW Workstation
// component file (built incrementally over 3E.1-3E.8) while the
// legacy /deals/watchlist/[analysisId] wrapper continues to import
// the OLD client component. The two routes diverge naturally
// without any duplicated code maintenance.
//
// In 3F, the legacy wrapper becomes a redirect() to /analysis/[analysisId].

import { notFound } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { loadWorkstationData } from "@/lib/analysis/load-workstation-data";
import { AnalysisWorkstation } from "@/app/(workspace)/deals/watchlist/[analysisId]/analysis-workstation";

export const dynamic = "force-dynamic";

type AnalysisWorkstationPageProps = {
  params: Promise<{ analysisId: string }>;
};

export default async function AnalysisWorkstationPage({ params }: AnalysisWorkstationPageProps) {
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

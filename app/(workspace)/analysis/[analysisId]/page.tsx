// Phase 1 Step 3E.1 — canonical Workstation route, now importing the
// new client.
//
// As of 3E.1, this route imports the NEW Analysis Workstation client
// from the relative path. Per Decision 5.1 (drop side-by-side), the
// legacy Workstation file at deals/watchlist/[analysisId]/
// analysis-workstation.tsx has been deleted; the legacy URL
// /deals/watchlist/[analysisId] continues to work via the 3B
// re-export wrapper, which now serves the NEW client too. Both URLs
// resolve to this page.tsx → which renders the new client below.
//
// In 3F, the legacy wrapper at /deals/watchlist/[analysisId]/page.tsx
// becomes a redirect() to /analysis/[analysisId] and the legacy URL
// stops serving content directly.

import { notFound } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { loadWorkstationData } from "@/lib/analysis/load-workstation-data";
import { AnalysisWorkstation } from "./analysis-workstation";

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

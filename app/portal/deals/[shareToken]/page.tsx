// Phase 1 Step 4D — Partner-facing shared analysis page.
//
// This is what the partner sees when they click the share link.
// The share_token in the URL is the authorization — no login required
// for viewing (Decision 4.3). Acting (adjusting values, submitting
// feedback) requires sign-in.
//
// The server component loads data via the service-role client
// (loadPartnerViewData), then renders the PartnerAnalysisView
// client component which reuses Workstation shared components
// with a partner-specific layout per spec §7.

import { notFound } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { loadPartnerViewData } from "@/lib/partner-portal/load-partner-view-data";
import { PartnerAnalysisView } from "./partner-analysis-view";

export const dynamic = "force-dynamic";

type PartnerDealPageProps = {
  params: Promise<{ shareToken: string }>;
};

export default async function PartnerDealPage({
  params,
}: PartnerDealPageProps) {
  noStore();
  const { shareToken } = await params;

  const data = await loadPartnerViewData(shareToken);
  if (!data) notFound();

  return (
    <PartnerAnalysisView
      workstationData={data.workstationData!}
      compData={data.compData}
      share={data.share}
      partnerVersion={data.partnerVersion}
    />
  );
}

// Phase 1 Step 4F — Partner Workspace dashboard.
//
// The partner's home at /portal/ — all shared analyses organized by
// status lanes. Requires auth (the partner must be signed in to see
// their deals). Unauthenticated users get redirected to sign-in.

import { redirect } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { loadPartnerDashboardData } from "@/lib/partner-portal/load-partner-dashboard-data";
import { PartnerDashboard } from "./partner-dashboard";

export const dynamic = "force-dynamic";

export default async function PortalDashboardPage() {
  noStore();

  const data = await loadPartnerDashboardData();

  if (!data) {
    redirect("/auth/sign-in?next=/portal");
  }

  return <PartnerDashboard data={data} />;
}

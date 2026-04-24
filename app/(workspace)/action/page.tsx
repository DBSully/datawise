// Legacy /action (active pipeline + closed deals) — absorbed into
// /pipeline on 2026-04-24 via the Action and Closed view chips.
//
//   /action                 → /pipeline?view=action
//   /action?status=active   → /pipeline?view=action
//   /action?status=closed   → /pipeline?view=closed
//
// Stage-progression buttons (→ Offer, → Contract) and the Close Deal
// modal now live in the RowActionPopover on /pipeline.

import { redirect } from "next/navigation";

type LegacyActionPageProps = {
  searchParams?: Promise<Record<string, string | string[]>>;
};

export default async function LegacyActionRedirect({
  searchParams,
}: LegacyActionPageProps) {
  const resolved = searchParams ? await searchParams : undefined;
  const statusRaw = resolved?.status;
  const status = Array.isArray(statusRaw) ? statusRaw[0] : statusRaw;
  const view = status === "closed" ? "closed" : "action";
  redirect(`/pipeline?view=${view}`);
}

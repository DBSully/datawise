// Legacy /analysis (watch list) — absorbed into /pipeline on 2026-04-24.
// Watch-list properties now surface on /pipeline with view=focus by default
// (caller's active analyses), with richer physical columns in that view.
// Row-level interactions (interest level, showing status, pass, promote,
// notes) live in the RowActionPopover that opens when the analyst clicks
// the stage pill.
//
// The workstation route /analysis/[analysisId] is unaffected — that's
// the detail page and remains the canonical per-property workspace.

import { redirect } from "next/navigation";

type LegacyAnalysisPageProps = {
  searchParams?: Promise<Record<string, string | string[]>>;
};

export default async function LegacyAnalysisRedirect({
  searchParams,
}: LegacyAnalysisPageProps) {
  const resolved = searchParams ? await searchParams : undefined;
  const qs = new URLSearchParams();
  qs.set("view", "focus");
  for (const [key, value] of Object.entries(resolved ?? {})) {
    if (key === "view") continue;
    if (Array.isArray(value)) {
      for (const v of value) qs.append(key, v);
    } else if (value) {
      qs.set(key, value);
    }
  }
  redirect(`/pipeline?${qs.toString()}`);
}

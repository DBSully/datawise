// Legacy screening URL — redirects to the unified /pipeline page.
// All navigation was renamed in step 3 (2026-04-24); this file exists
// so bookmarks, revalidatePath calls, and external links keep working.

import { redirect } from "next/navigation";

type LegacyScreeningPageProps = {
  searchParams?: Promise<Record<string, string | string[]>>;
};

export default async function LegacyScreeningRedirect({
  searchParams,
}: LegacyScreeningPageProps) {
  const resolved = searchParams ? await searchParams : undefined;
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(resolved ?? {})) {
    if (Array.isArray(value)) {
      for (const v of value) qs.append(key, v);
    } else if (value) {
      qs.set(key, value);
    }
  }
  const suffix = qs.toString();
  redirect(suffix ? `/pipeline?${suffix}` : "/pipeline");
}

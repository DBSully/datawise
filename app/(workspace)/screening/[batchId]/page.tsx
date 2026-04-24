// Legacy /screening/[batchId] — folded into /pipeline?batchId=X in step 3
// (2026-04-24). Progress tracker + cancel controls now live on /pipeline.

import { redirect } from "next/navigation";

type LegacyBatchPageProps = {
  params: Promise<{ batchId: string }>;
  searchParams?: Promise<Record<string, string | string[]>>;
};

export default async function LegacyBatchRedirect({
  params,
  searchParams,
}: LegacyBatchPageProps) {
  const { batchId } = await params;
  const resolved = searchParams ? await searchParams : undefined;
  const qs = new URLSearchParams();
  qs.set("batchId", batchId);
  for (const [key, value] of Object.entries(resolved ?? {})) {
    if (Array.isArray(value)) {
      for (const v of value) qs.append(key, v);
    } else if (value) {
      qs.set(key, value);
    }
  }
  redirect(`/pipeline?${qs.toString()}`);
}

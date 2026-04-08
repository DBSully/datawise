import Link from "next/link";
import { ManualEntryForm } from "@/components/intake/manual-entry-form";

type ManualEntryPageProps = {
  searchParams?: Promise<{ created?: string; batch?: string }>;
};

export default async function ManualEntryPage({
  searchParams,
}: ManualEntryPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const created = resolvedSearchParams?.created === "1";
  const batchId = resolvedSearchParams?.batch ?? null;

  return (
    <section className="dw-section-stack">
      <div>
        <h1 className="dw-page-title">Manual Property Entry</h1>
        <p className="dw-page-copy">
          Add off-market properties or historical sales directly. The entry
          appears as an import batch with source &quot;manual&quot; and flows
          through the standard screening pipeline.
        </p>
      </div>

      {created ? (
        <div className="dw-card-tight border-emerald-200 bg-emerald-50 text-sm text-emerald-800 flex items-center justify-between">
          <span>Property created successfully and recorded as a manual import batch.</span>
          <Link
            href={batchId ? `/intake/imports` : "/intake/imports"}
            className="text-emerald-700 font-medium hover:underline"
          >
            View Import Batches →
          </Link>
        </div>
      ) : null}

      <ManualEntryForm />
    </section>
  );
}

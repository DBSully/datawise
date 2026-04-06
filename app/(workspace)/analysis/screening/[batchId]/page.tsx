import Link from "next/link";
import { notFound } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { BatchResultsTable } from "@/components/screening/batch-results-table";

export const dynamic = "force-dynamic";

type BatchResultsPageProps = {
  params: Promise<{ batchId: string }>;
  searchParams?: Promise<{
    prime?: string;
    sort?: string;
  }>;
};

function formatNumber(value: number | null | undefined, decimals = 0) {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

export default async function BatchResultsPage({
  params,
  searchParams,
}: BatchResultsPageProps) {
  noStore();

  const { batchId } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const primeOnly = resolvedSearchParams?.prime === "true";
  const sort = resolvedSearchParams?.sort ?? "gap_desc";

  const supabase = await createClient();

  // Load batch
  const { data: batch, error: batchError } = await supabase
    .from("screening_batches")
    .select("*")
    .eq("id", batchId)
    .single();

  if (batchError || !batch) notFound();

  // Load results
  let query = supabase
    .from("screening_results")
    .select("*")
    .eq("screening_batch_id", batchId);

  if (primeOnly) {
    query = query.eq("is_prime_candidate", true);
  }

  // Sorting
  switch (sort) {
    case "gap_desc":
      query = query.order("est_gap_per_sqft", {
        ascending: false,
        nullsFirst: false,
      });
      break;
    case "spread_desc":
      query = query.order("spread", { ascending: false, nullsFirst: false });
      break;
    case "arv_desc":
      query = query.order("arv_aggregate", {
        ascending: false,
        nullsFirst: false,
      });
      break;
    case "offer_desc":
      query = query.order("max_offer", {
        ascending: false,
        nullsFirst: false,
      });
      break;
    case "rehab_asc":
      query = query.order("rehab_total", {
        ascending: true,
        nullsFirst: false,
      });
      break;
    case "offer_pct_desc":
      query = query.order("offer_pct", {
        ascending: false,
        nullsFirst: false,
      });
      break;
    default:
      query = query.order("est_gap_per_sqft", {
        ascending: false,
        nullsFirst: false,
      });
  }

  query = query.limit(500);

  const { data: results, error: resultsError } = await query;
  if (resultsError) throw new Error(resultsError.message);

  // Build href helper
  function buildHref(overrides: Record<string, string | undefined>) {
    const p = new URLSearchParams();
    const merged = {
      prime: primeOnly ? "true" : undefined,
      sort: sort !== "gap_desc" ? sort : undefined,
      ...overrides,
    };
    for (const [k, v] of Object.entries(merged)) {
      if (v) p.set(k, v);
    }
    const qs = p.toString();
    return qs
      ? `/analysis/screening/${batchId}?${qs}`
      : `/analysis/screening/${batchId}`;
  }

  const sortOptions = [
    { value: "gap_desc", label: "Gap $/sqft" },
    { value: "spread_desc", label: "Spread" },
    { value: "arv_desc", label: "ARV" },
    { value: "offer_desc", label: "Max Offer" },
    { value: "rehab_asc", label: "Rehab (low→high)" },
    { value: "offer_pct_desc", label: "Offer %" },
  ];

  // Shape rows for the client component
  const tableRows = (results ?? []).map((r: Record<string, unknown>) => ({
    id: r.id as string,
    real_property_id: r.real_property_id as string,
    is_prime_candidate: r.is_prime_candidate as boolean,
    subject_address: r.subject_address as string,
    subject_city: r.subject_city as string,
    subject_property_type: r.subject_property_type as string | null,
    subject_list_price: r.subject_list_price as number | null,
    arv_aggregate: r.arv_aggregate as number | null,
    spread: r.spread as number | null,
    est_gap_per_sqft: r.est_gap_per_sqft as number | null,
    arv_comp_count: r.arv_comp_count as number | null,
    rehab_total: r.rehab_total as number | null,
    hold_total: r.hold_total as number | null,
    transaction_total: r.transaction_total as number | null,
    financing_total: r.financing_total as number | null,
    max_offer: r.max_offer as number | null,
    offer_pct: r.offer_pct as number | null,
    screening_status: r.screening_status as string,
    comp_search_run_id: r.comp_search_run_id as string | null,
  }));

  return (
    <section className="dw-section-stack-compact">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link
            href="/analysis/screening"
            className="text-xs text-blue-600 hover:underline"
          >
            ← All Batches
          </Link>
          <h1 className="dw-page-title mt-1">{batch.name}</h1>
          <p className="dw-page-copy">
            {formatNumber(batch.total_subjects)} subjects &middot;{" "}
            {formatNumber(batch.screened_count)} screened &middot;{" "}
            <span className="font-semibold text-emerald-700">
              {formatNumber(batch.prime_candidate_count)} Prime Candidates
            </span>{" "}
            &middot; {formatDate(batch.completed_at)}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="dw-card-tight flex flex-wrap items-center gap-3">
        <Link
          href={buildHref({ prime: primeOnly ? undefined : "true" })}
          className={`rounded px-2.5 py-1 text-xs font-semibold ${
            primeOnly
              ? "bg-emerald-100 text-emerald-800"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
        >
          {primeOnly ? "★ Prime Only" : "Show All"}
        </Link>

        <span className="text-xs text-slate-400">Sort:</span>
        {sortOptions.map((opt) => (
          <Link
            key={opt.value}
            href={buildHref({ sort: opt.value })}
            className={`rounded px-2 py-0.5 text-xs ${
              sort === opt.value
                ? "bg-blue-100 font-semibold text-blue-800"
                : "text-slate-500 hover:bg-slate-100"
            }`}
          >
            {opt.label}
          </Link>
        ))}

        <span className="ml-auto text-xs text-slate-400">
          {formatNumber(results?.length ?? 0)} results
        </span>
      </div>

      {/* Results table (client component for modal support) */}
      <BatchResultsTable batchId={batchId} results={tableRows} />
    </section>
  );
}

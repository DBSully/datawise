import Link from "next/link";
import { notFound } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type BatchResultsPageProps = {
  params: Promise<{ batchId: string }>;
  searchParams?: Promise<{
    prime?: string;
    sort?: string;
  }>;
};

function formatCurrency(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatNumber(value: number | null | undefined, decimals = 0) {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

function formatPercent(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";
  return `${(value * 100).toFixed(1)}%`;
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

      {/* Results table */}
      <div className="dw-table-wrap">
        <table className="dw-table-compact min-w-[1500px]">
          <thead>
            <tr>
              <th style={{ width: 28 }}></th>
              <th>Address</th>
              <th>City</th>
              <th>Type</th>
              <th className="text-right">List Price</th>
              <th className="text-right">ARV</th>
              <th className="text-right">Spread</th>
              <th className="text-right">Gap/sqft</th>
              <th className="text-right">Comps</th>
              <th className="text-right">Rehab</th>
              <th className="text-right">Hold</th>
              <th className="text-right">Trans.</th>
              <th className="text-right">Fin.</th>
              <th className="text-right">Max Offer</th>
              <th className="text-right">Offer%</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {(!results || results.length === 0) ? (
              <tr>
                <td colSpan={16} className="py-8 text-center text-sm text-slate-400">
                  No results found.
                </td>
              </tr>
            ) : (
              results.map(
                (r: {
                  id: string;
                  real_property_id: string;
                  is_prime_candidate: boolean;
                  subject_address: string;
                  subject_city: string;
                  subject_property_type: string | null;
                  subject_list_price: number | null;
                  arv_aggregate: number | null;
                  spread: number | null;
                  est_gap_per_sqft: number | null;
                  arv_comp_count: number | null;
                  rehab_total: number | null;
                  hold_total: number | null;
                  transaction_total: number | null;
                  financing_total: number | null;
                  max_offer: number | null;
                  offer_pct: number | null;
                  screening_status: string;
                }) => (
                  <tr
                    key={r.id}
                    className={
                      r.is_prime_candidate ? "bg-emerald-50/60" : ""
                    }
                  >
                    <td className="text-center">
                      {r.is_prime_candidate ? (
                        <span title="Prime Candidate" className="text-emerald-600">★</span>
                      ) : null}
                    </td>
                    <td className="font-medium">
                      <Link
                        href={`/analysis/screening/${batchId}/${r.id}`}
                        className="text-blue-700 hover:underline"
                      >
                        {r.subject_address}
                      </Link>
                    </td>
                    <td className="text-slate-500">{r.subject_city}</td>
                    <td className="text-xs text-slate-500">
                      {r.subject_property_type ?? "—"}
                    </td>
                    <td className="text-right">
                      {formatCurrency(r.subject_list_price)}
                    </td>
                    <td className="text-right font-medium">
                      {formatCurrency(r.arv_aggregate)}
                    </td>
                    <td
                      className={`text-right font-medium ${
                        (r.spread ?? 0) > 0
                          ? "text-emerald-700"
                          : (r.spread ?? 0) < 0
                            ? "text-red-600"
                            : ""
                      }`}
                    >
                      {formatCurrency(r.spread)}
                    </td>
                    <td
                      className={`text-right font-semibold ${
                        (r.est_gap_per_sqft ?? 0) >= 60
                          ? "text-emerald-700"
                          : ""
                      }`}
                    >
                      {r.est_gap_per_sqft !== null
                        ? `$${formatNumber(r.est_gap_per_sqft)}`
                        : "—"}
                    </td>
                    <td className="text-right text-slate-500">
                      {formatNumber(r.arv_comp_count)}
                    </td>
                    <td className="text-right">
                      {formatCurrency(r.rehab_total)}
                    </td>
                    <td className="text-right">
                      {formatCurrency(r.hold_total)}
                    </td>
                    <td className="text-right">
                      {formatCurrency(r.transaction_total)}
                    </td>
                    <td className="text-right">
                      {formatCurrency(r.financing_total)}
                    </td>
                    <td className="text-right font-medium">
                      {formatCurrency(r.max_offer)}
                    </td>
                    <td className="text-right text-slate-500">
                      {formatPercent(r.offer_pct)}
                    </td>
                    <td>
                      <Link
                        href={`/analysis/screening/${batchId}/${r.id}`}
                        className="text-xs text-blue-600 hover:underline"
                      >
                        Detail
                      </Link>
                    </td>
                  </tr>
                ),
              )
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

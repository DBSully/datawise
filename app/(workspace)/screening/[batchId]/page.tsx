import Link from "next/link";
import { notFound } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { QueueResultsTable } from "@/components/screening/queue-results-table";
import { LocalTimestamp } from "@/components/common/local-timestamp";

export const dynamic = "force-dynamic";

type BatchResultsPageProps = {
  params: Promise<{ batchId: string }>;
  searchParams?: Promise<{
    city?: string;
    propertyType?: string;
    prime?: string;
    reviewed?: string;
    mlsStatus?: string;
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


function buildHref(
  base: string,
  params: Record<string, string | undefined>,
) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value && value !== "all") search.set(key, value);
  }
  const qs = search.toString();
  return qs ? `${base}?${qs}` : base;
}

export default async function BatchResultsPage({
  params,
  searchParams,
}: BatchResultsPageProps) {
  noStore();

  const { batchId } = await params;
  const resolved = searchParams ? await searchParams : undefined;
  const cityFilter = resolved?.city ?? "all";
  const typeFilter = resolved?.propertyType ?? "all";
  const primeFilter = resolved?.prime ?? "all";
  const showReviewed = resolved?.reviewed === "true";
  const mlsStatusFilter = resolved?.mlsStatus ?? "all";
  const sort = resolved?.sort ?? "gap_desc";

  const supabase = await createClient();

  // Load batch metadata
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

  if (primeFilter === "true") {
    query = query.eq("is_prime_candidate", true);
  }
  if (!showReviewed) {
    query = query.is("review_action", null);
  }

  // Sorting
  switch (sort) {
    case "gap_desc":
      query = query.order("est_gap_per_sqft", { ascending: false, nullsFirst: false });
      break;
    case "offer_pct_desc":
      query = query.order("offer_pct", { ascending: false, nullsFirst: false });
      break;
    case "spread_desc":
      query = query.order("spread", { ascending: false, nullsFirst: false });
      break;
    case "arv_desc":
      query = query.order("arv_aggregate", { ascending: false, nullsFirst: false });
      break;
    case "offer_desc":
      query = query.order("max_offer", { ascending: false, nullsFirst: false });
      break;
    case "rehab_asc":
      query = query.order("rehab_total", { ascending: true, nullsFirst: false });
      break;
    case "price_asc":
      query = query.order("subject_list_price", { ascending: true, nullsFirst: false });
      break;
    default:
      query = query.order("est_gap_per_sqft", { ascending: false, nullsFirst: false });
  }

  query = query.limit(500);

  const { data: results, error: resultsError } = await query;
  if (resultsError) throw new Error(resultsError.message);

  // Load MLS data for properties in this batch
  const propertyIds = [
    ...new Set((results ?? []).map((r: Record<string, unknown>) => r.real_property_id as string)),
  ];

  const mlsMap = new Map<string, { mls_status: string | null; mls_major_change_type: string | null; listing_contract_date: string | null }>();
  const mlsStatusSet = new Set<string>();

  if (propertyIds.length > 0) {
    const CHUNK = 200;
    for (let i = 0; i < propertyIds.length; i += CHUNK) {
      const chunk = propertyIds.slice(i, i + CHUNK);
      const { data: listings } = await supabase
        .from("mls_listings")
        .select("real_property_id, mls_status, mls_major_change_type, listing_contract_date")
        .in("real_property_id", chunk)
        .order("listing_contract_date", { ascending: false, nullsFirst: true })
        .order("created_at", { ascending: false });

      for (const l of listings ?? []) {
        if (!mlsMap.has(l.real_property_id)) {
          mlsMap.set(l.real_property_id, {
            mls_status: l.mls_status,
            mls_major_change_type: l.mls_major_change_type,
            listing_contract_date: l.listing_contract_date,
          });
          if (l.mls_status) mlsStatusSet.add(l.mls_status);
        }
      }
    }
  }

  const mlsStatuses = [...mlsStatusSet].sort();

  // Collect distinct cities and types from results for filters
  const citySet = new Set<string>();
  const typeSet = new Set<string>();
  for (const r of results ?? []) {
    const row = r as Record<string, unknown>;
    if (row.subject_city) citySet.add(row.subject_city as string);
    if (row.subject_property_type) typeSet.add(row.subject_property_type as string);
  }
  const cities = [...citySet].sort();
  const propertyTypes = [...typeSet].sort();

  // Shape and filter rows
  const tableRows = (results ?? [])
    .map((r: Record<string, unknown>) => {
      const propId = r.real_property_id as string;
      const mls = mlsMap.get(propId);
      return {
        id: r.id as string,
        real_property_id: propId,
        screening_batch_id: batchId,
        is_prime_candidate: r.is_prime_candidate as boolean,
        subject_address: r.subject_address as string,
        subject_city: r.subject_city as string,
        subject_property_type: r.subject_property_type as string | null,
        subject_list_price: r.subject_list_price as number | null,
        mls_status: mls?.mls_status ?? null,
        mls_major_change_type: mls?.mls_major_change_type ?? null,
        listing_contract_date: mls?.listing_contract_date ?? null,
        arv_aggregate: r.arv_aggregate as number | null,
        trend_annual_rate: r.trend_annual_rate as number | null,
        trend_raw_rate: r.trend_raw_rate as number | null,
        trend_confidence: r.trend_confidence as string | null,
        trend_detail_json: r.trend_detail_json as Record<string, unknown> | null,
        spread: r.spread as number | null,
        est_gap_per_sqft: r.est_gap_per_sqft as number | null,
        arv_comp_count: r.arv_comp_count as number | null,
        rehab_total: r.rehab_total as number | null,
        hold_total: r.hold_total as number | null,
        max_offer: r.max_offer as number | null,
        offer_pct: r.offer_pct as number | null,
        promoted_analysis_id: r.promoted_analysis_id as string | null,
        comp_search_run_id: r.comp_search_run_id as string | null,
        review_action: r.review_action as string | null,
        // Interim queue fix columns from analysis_queue_v are not available
        // here because this page queries screening_results directly (per-batch
        // view, not "latest per property"). The batch detail page isn't
        // affected by the re-screening bug — each batch has its own per-batch
        // rows with intact review_action — so we pass null for these fields
        // and the table falls back to promoted_analysis_id for the Watch List
        // badge.
        has_active_analysis: null,
        active_analysis_id: null,
        active_lifecycle_stage: null,
        active_interest_level: null,
        active_analysis_is_mine: null,
        active_analysis_owner_name: null,
        has_newer_screening_than_analysis: null,
      };
    })
    .filter((r) => {
      if (cityFilter !== "all" && r.subject_city !== cityFilter) return false;
      if (typeFilter !== "all" && r.subject_property_type !== typeFilter) return false;
      if (mlsStatusFilter !== "all" && r.mls_status !== mlsStatusFilter) return false;
      return true;
    });

  const basePath = `/screening/${batchId}`;

  const currentParams = {
    city: cityFilter !== "all" ? cityFilter : undefined,
    propertyType: typeFilter !== "all" ? typeFilter : undefined,
    prime: primeFilter !== "all" ? primeFilter : undefined,
    reviewed: showReviewed ? "true" : undefined,
    mlsStatus: mlsStatusFilter !== "all" ? mlsStatusFilter : undefined,
    sort: sort !== "gap_desc" ? sort : undefined,
  };

  const sortOptions = [
    { value: "gap_desc", label: "Gap $/sqft" },
    { value: "offer_pct_desc", label: "Offer %" },
    { value: "spread_desc", label: "Spread" },
    { value: "arv_desc", label: "ARV" },
    { value: "offer_desc", label: "Max Offer" },
    { value: "rehab_asc", label: "Rehab (low)" },
    { value: "price_asc", label: "Price (low)" },
  ];

  return (
    <section className="dw-section-stack-compact">
      {/* Header */}
      <div>
        <Link
          href="/intake/imports"
          className="text-xs text-blue-600 hover:underline"
        >
          &larr; Back to Imports
        </Link>
        <h1 className="dw-page-title mt-1">{batch.name}</h1>
        <p className="dw-page-copy">
          {formatNumber(batch.total_subjects)} subjects &middot;{" "}
          {formatNumber(batch.screened_count)} screened &middot;{" "}
          <span className="font-semibold text-emerald-700">
            {formatNumber(batch.prime_candidate_count)} Prime Candidates
          </span>{" "}
          &middot; <LocalTimestamp value={batch.completed_at} />
          {tableRows.length > 0 && (
            <> &middot; {formatNumber(tableRows.length)} showing</>
          )}
        </p>
      </div>

      {/* Import context */}
      {batch.source_import_batch_id && (
        <div className="dw-card-tight border-blue-200 bg-blue-50 text-sm text-blue-800">
          Screened from{" "}
          <Link
            href="/intake/imports"
            className="font-medium text-blue-700 hover:underline"
          >
            import batch
          </Link>
          {" · "}{formatNumber(batch.total_subjects)} listings from import
        </div>
      )}

      {/* Filters — same layout as Screening Queue */}
      <form method="get" className="dw-card-tight flex flex-wrap items-end gap-3">
        <div>
          <label className="dw-label" htmlFor="city">City</label>
          <select id="city" name="city" className="dw-select" defaultValue={cityFilter}>
            <option value="all">All Cities</option>
            {cities.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="dw-label" htmlFor="propertyType">Type</label>
          <select id="propertyType" name="propertyType" className="dw-select" defaultValue={typeFilter}>
            <option value="all">All Types</option>
            {propertyTypes.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="dw-label" htmlFor="prime">Prime</label>
          <select id="prime" name="prime" className="dw-select" defaultValue={primeFilter}>
            <option value="all">All</option>
            <option value="true">Prime Only</option>
          </select>
        </div>

        <div>
          <label className="dw-label" htmlFor="mlsStatus">MLS Status</label>
          <select id="mlsStatus" name="mlsStatus" className="dw-select" defaultValue={mlsStatusFilter}>
            <option value="all">All Statuses</option>
            {mlsStatuses.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="dw-label" htmlFor="reviewed">Reviewed</label>
          <select id="reviewed" name="reviewed" className="dw-select" defaultValue={showReviewed ? "true" : "false"}>
            <option value="false">Unreviewed Only</option>
            <option value="true">Show All</option>
          </select>
        </div>

        {sort !== "gap_desc" && (
          <input type="hidden" name="sort" value={sort} />
        )}

        <button type="submit" className="dw-button-secondary">
          Filter
        </button>
      </form>

      {/* Sort controls */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-slate-400">Sort:</span>
        {sortOptions.map((opt) => (
          <Link
            key={opt.value}
            href={buildHref(basePath, { ...currentParams, sort: opt.value })}
            className={`rounded px-2 py-0.5 text-xs ${
              sort === opt.value
                ? "bg-blue-100 font-semibold text-blue-800"
                : "text-slate-500 hover:bg-slate-100"
            }`}
          >
            {opt.label}
          </Link>
        ))}
      </div>

      {/* Results table — same component as Screening Queue */}
      <QueueResultsTable results={tableRows} />
    </section>
  );
}

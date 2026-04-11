import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { QueueResultsTable } from "@/components/screening/queue-results-table";
import { AutoFilterButtons } from "@/components/screening/auto-filter-buttons";

export const dynamic = "force-dynamic";

type ScreeningQueuePageProps = {
  searchParams?: Promise<{
    city?: string;
    propertyType?: string;
    prime?: string;
    reviewed?: string;
    mlsStatus?: string;
    sort?: string;
    page?: string;
    listingDays?: string;
    screenedDays?: string;
    priceLow?: string;
    priceHigh?: string;
  }>;
};

const PAGE_SIZE = 200;

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

export default async function ScreeningQueuePage({
  searchParams,
}: ScreeningQueuePageProps) {
  noStore();

  const resolved = searchParams ? await searchParams : undefined;
  const cityFilter = resolved?.city ?? "all";
  const typeFilter = resolved?.propertyType ?? "all";
  const primeFilter = resolved?.prime ?? "all";
  const showReviewed = resolved?.reviewed === "true";
  const mlsStatusFilter = resolved?.mlsStatus ?? "all";
  const sort = resolved?.sort ?? "gap_desc";
  const page = Math.max(1, Number(resolved?.page ?? "1") || 1);
  const listingDays = resolved?.listingDays ? parseInt(resolved.listingDays, 10) : null;
  const screenedDays = resolved?.screenedDays ? parseInt(resolved.screenedDays, 10) : null;
  const priceLow = resolved?.priceLow ? parseInt(resolved.priceLow, 10) : null;
  const priceHigh = resolved?.priceHigh ? parseInt(resolved.priceHigh, 10) : null;

  const supabase = await createClient();

  // Load filter options
  const [{ data: cityRows }, { data: typeRows }, { data: statusRows }] = await Promise.all([
    supabase
      .from("property_city_options_v")
      .select("city")
      .order("city", { ascending: true })
      .range(0, 500),
    supabase
      .from("property_type_options_v")
      .select("property_type")
      .order("property_type", { ascending: true })
      .range(0, 100),
    supabase
      .from("mls_status_counts_v")
      .select("mls_status")
      .order("mls_status", { ascending: true }),
  ]);

  const cities = (cityRows ?? [])
    .map((r: { city: string }) => r.city)
    .filter(Boolean);
  const propertyTypes = (typeRows ?? [])
    .map((r: { property_type: string }) => r.property_type)
    .filter(Boolean);
  const mlsStatuses = (statusRows ?? [])
    .map((r: { mls_status: string }) => r.mls_status)
    .filter(Boolean);

  // Build query on the view
  let query = supabase
    .from("analysis_queue_v")
    .select("*", { count: "exact" });

  if (cityFilter !== "all") {
    query = query.eq("subject_city", cityFilter);
  }
  if (typeFilter !== "all") {
    query = query.eq("subject_property_type", typeFilter);
  }
  if (primeFilter === "true") {
    query = query.eq("is_prime_candidate", true);
  }
  if (!showReviewed) {
    // Hide both:
    //   1. Reviewed (passed/promoted) screening_results rows
    //   2. Properties that already have an active or closed analysis
    //      (i.e. on the watch list, in pipeline, or already closed).
    // Without #2, re-screened watch list items reappear in the queue
    // because the new screening_results row has review_action = NULL.
    // The has_active_analysis column comes from the LEFT JOIN LATERAL
    // added in supabase/migrations/20260410130500_interim_queue_filter.sql.
    query = query
      .is("review_action", null)
      .is("has_active_analysis", false);
  }
  if (mlsStatusFilter !== "all") {
    query = query.eq("mls_status", mlsStatusFilter);
  }
  if (listingDays && listingDays > 0) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - (listingDays - 1));
    cutoff.setHours(0, 0, 0, 0);
    query = query.gte("listing_contract_date", cutoff.toISOString().slice(0, 10));
  }
  if (screenedDays && screenedDays > 0) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - (screenedDays - 1));
    cutoff.setHours(0, 0, 0, 0);
    query = query.gte("screening_updated_at", cutoff.toISOString());
  }
  if (priceLow && priceLow > 0) {
    query = query.gte("subject_list_price", priceLow);
  }
  if (priceHigh && priceHigh > 0) {
    query = query.lte("subject_list_price", priceHigh);
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

  query = query.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  const { data: results, error, count } = await query;
  if (error) throw new Error(error.message);

  const totalCount = count ?? 0;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

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

  // Shape rows for client component
  const tableRows = (results ?? []).map((r: Record<string, unknown>) => ({
    id: r.id as string,
    real_property_id: r.real_property_id as string,
    screening_batch_id: r.screening_batch_id as string,
    is_prime_candidate: r.is_prime_candidate as boolean,
    subject_address: r.subject_address as string,
    subject_city: r.subject_city as string,
    subject_property_type: r.subject_property_type as string | null,
    subject_list_price: r.subject_list_price as number | null,
    mls_status: r.mls_status as string | null,
    mls_major_change_type: r.mls_major_change_type as string | null,
    listing_contract_date: r.listing_contract_date as string | null,
    arv_aggregate: r.arv_aggregate as number | null,
    trend_annual_rate: r.trend_annual_rate as number | null,
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
    // Interim queue fix columns from the recreated analysis_queue_v
    has_active_analysis: r.has_active_analysis as boolean | null,
    active_analysis_id: r.active_analysis_id as string | null,
    active_lifecycle_stage: r.active_lifecycle_stage as string | null,
    active_interest_level: r.active_interest_level as string | null,
    has_newer_screening_than_analysis: r.has_newer_screening_than_analysis as boolean | null,
  }));

  return (
    <section className="dw-section-stack-compact">
      <div>
        <h1 className="dw-page-title">Screening Queue</h1>
        <p className="dw-page-copy">
          Latest screening result per property — find your next deal.
          {totalCount > 0 && (
            <> &middot; {formatNumber(totalCount)} properties</>
          )}
        </p>
      </div>

      {/* Auto Filter Buttons */}
      <AutoFilterButtons />

      {/* Filters */}
      <form method="get" className="dw-card-tight flex flex-wrap items-end gap-3">
        <div>
          <label className="dw-label" htmlFor="city">City</label>
          <select id="city" name="city" className="dw-select" defaultValue={cityFilter}>
            <option value="all">All Cities</option>
            {cities.map((c: string) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="dw-label" htmlFor="propertyType">Type</label>
          <select id="propertyType" name="propertyType" className="dw-select" defaultValue={typeFilter}>
            <option value="all">All Types</option>
            {propertyTypes.map((t: string) => (
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
            {mlsStatuses.map((s: string) => (
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
            href={buildHref("/screening", { ...currentParams, sort: opt.value })}
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

      {/* Results table (client component for modal support) */}
      <QueueResultsTable results={tableRows} />

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 text-sm">
          {page > 1 && (
            <Link
              href={buildHref("/screening", { ...currentParams, page: String(page - 1) })}
              className="text-blue-600 hover:underline"
            >
              ← Prev
            </Link>
          )}
          <span className="text-slate-500">
            Page {page} of {totalPages}
          </span>
          {page < totalPages && (
            <Link
              href={buildHref("/screening", { ...currentParams, page: String(page + 1) })}
              className="text-blue-600 hover:underline"
            >
              Next →
            </Link>
          )}
        </div>
      )}
    </section>
  );
}

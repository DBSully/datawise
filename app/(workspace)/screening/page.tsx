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

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const currentUserId = user?.id ?? null;

  // --------------------------------------------------------------------
  // Query decomposition — analysis_queue_v was doing DISTINCT ON over
  // 8k+ screening_results AND firing 2 lateral joins per row, which pushed
  // past the 8s statement timeout. We replace one heavy view hit with:
  //   1. A slim view (screening_results_latest_v): DISTINCT ON only, no laterals.
  //   2. Small pre-queries to convert mls_* and "hide my own" filters into
  //      a property_id set we can pass via .in() / .not("in").
  //   3. Batch follow-up queries against the visible 50 rows for mls_listings
  //      info, active analyses, and owner names.
  //
  // Result: bounded cost per query, total load ~500-800ms instead of 8s+.
  // --------------------------------------------------------------------

  // Normalize listing-date cutoff (used by pre-query + potentially elsewhere)
  const listingDaysCutoffIso = (() => {
    if (!listingDays || listingDays <= 0) return null;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - (listingDays - 1));
    cutoff.setHours(0, 0, 0, 0);
    return cutoff.toISOString().slice(0, 10);
  })();

  // Pre-query A: property IDs matching mls_* filters. Only runs when at least
  // one such filter is active; otherwise returns null meaning "no restriction."
  async function loadMlsFilteredPropertyIds(): Promise<string[] | null> {
    if (mlsStatusFilter === "all" && !listingDaysCutoffIso) return null;
    let q = supabase.from("mls_listings").select("real_property_id");
    if (mlsStatusFilter !== "all") q = q.eq("mls_status", mlsStatusFilter);
    if (listingDaysCutoffIso) q = q.gte("listing_contract_date", listingDaysCutoffIso);
    const { data, error } = await q.limit(10_000);
    if (error) throw new Error(error.message);
    return Array.from(
      new Set(
        (data ?? [])
          .map((r) => (r as { real_property_id: string | null }).real_property_id)
          .filter((v): v is string => v != null),
      ),
    );
  }

  // Pre-query B: the current analyst's active-analysis property IDs. We
  // exclude these from the default queue (open your existing analysis
  // instead). Properties where ANOTHER analyst has an active analysis
  // remain visible — cross-analyst communication is the goal.
  async function loadMyActiveAnalysisPropertyIds(): Promise<string[]> {
    if (showReviewed || !currentUserId) return [];
    const { data, error } = await supabase
      .from("analyses")
      .select("real_property_id, analysis_pipeline!inner(disposition, lifecycle_stage)")
      .eq("created_by_user_id", currentUserId)
      .eq("is_archived", false)
      .in("analysis_pipeline.disposition", ["active", "closed"]);
    if (error) throw new Error(error.message);
    return Array.from(
      new Set(
        (data ?? [])
          .map((r) => (r as { real_property_id: string }).real_property_id)
          .filter((v): v is string => v != null),
      ),
    );
  }

  // Run filter options + both pre-queries in parallel
  const [
    { data: cityRows },
    { data: typeRows },
    { data: statusRows },
    mlsFilteredPropertyIds,
    myActiveAnalysisPropertyIds,
  ] = await Promise.all([
    supabase.from("property_city_options_v").select("city").order("city", { ascending: true }).range(0, 500),
    supabase.from("property_type_options_v").select("property_type").order("property_type", { ascending: true }).range(0, 100),
    supabase.from("mls_status_counts_v").select("mls_status").order("mls_status", { ascending: true }),
    loadMlsFilteredPropertyIds(),
    loadMyActiveAnalysisPropertyIds(),
  ]);

  const cities = (cityRows ?? []).map((r: { city: string }) => r.city).filter(Boolean);
  const propertyTypes = (typeRows ?? []).map((r: { property_type: string }) => r.property_type).filter(Boolean);
  const mlsStatuses = (statusRows ?? []).map((r: { mls_status: string }) => r.mls_status).filter(Boolean);

  // Main query: slim view, all filters only touch screening_results columns.
  let query = supabase.from("screening_results_latest_v").select("*");

  if (cityFilter !== "all") query = query.eq("subject_city", cityFilter);
  if (typeFilter !== "all") query = query.eq("subject_property_type", typeFilter);
  if (primeFilter === "true") query = query.eq("is_prime_candidate", true);
  if (!showReviewed) query = query.is("review_action", null);
  if (mlsFilteredPropertyIds !== null) {
    // No rows match mls filters → short-circuit to an empty query.
    if (mlsFilteredPropertyIds.length === 0) {
      query = query.in("real_property_id", ["00000000-0000-0000-0000-000000000000"]);
    } else {
      query = query.in("real_property_id", mlsFilteredPropertyIds);
    }
  }
  if (myActiveAnalysisPropertyIds.length > 0) {
    query = query.not("real_property_id", "in", `(${myActiveAnalysisPropertyIds.join(",")})`);
  }
  if (screenedDays && screenedDays > 0) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - (screenedDays - 1));
    cutoff.setHours(0, 0, 0, 0);
    query = query.gte("screening_updated_at", cutoff.toISOString());
  }
  if (priceLow && priceLow > 0) query = query.gte("subject_list_price", priceLow);
  if (priceHigh && priceHigh > 0) query = query.lte("subject_list_price", priceHigh);

  switch (sort) {
    case "gap_desc":         query = query.order("est_gap_per_sqft",   { ascending: false, nullsFirst: false }); break;
    case "offer_pct_desc":   query = query.order("offer_pct",          { ascending: false, nullsFirst: false }); break;
    case "spread_desc":      query = query.order("spread",             { ascending: false, nullsFirst: false }); break;
    case "arv_desc":         query = query.order("arv_aggregate",      { ascending: false, nullsFirst: false }); break;
    case "offer_desc":       query = query.order("max_offer",          { ascending: false, nullsFirst: false }); break;
    case "rehab_asc":        query = query.order("rehab_total",        { ascending: true,  nullsFirst: false }); break;
    case "price_asc":        query = query.order("subject_list_price", { ascending: true,  nullsFirst: false }); break;
    default:                 query = query.order("est_gap_per_sqft",   { ascending: false, nullsFirst: false });
  }

  query = query.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  const { data: results, error } = await query;

  if (error) throw new Error(error.message);

  // ------------------------------------------------------------------
  // Follow-up batch queries scoped to the visible rows
  // ------------------------------------------------------------------

  const visiblePropertyIds = Array.from(
    new Set((results ?? []).map((r) => (r as { real_property_id: string }).real_property_id)),
  );

  type MlsInfo = {
    mls_status: string | null;
    mls_major_change_type: string | null;
    listing_contract_date: string | null;
  };
  type ActiveAnalysis = {
    analysis_id: string;
    owner_id: string;
    lifecycle_stage: string | null;
    interest_level: string | null;
    analysis_created_at: string;
  };

  const mlsByPropertyId = new Map<string, MlsInfo>();
  const activeAnalysisByPropertyId = new Map<string, ActiveAnalysis>();
  const ownerNameById = new Map<string, string>();

  if (visiblePropertyIds.length > 0) {
    // Latest MLS listing per visible property — fetch a superset (all
    // listings for these properties) and keep the latest per property in JS.
    const [{ data: mlsRows }, { data: analysisRows }] = await Promise.all([
      supabase
        .from("mls_listings")
        .select("real_property_id, mls_status, mls_major_change_type, listing_contract_date, created_at")
        .in("real_property_id", visiblePropertyIds)
        .order("listing_contract_date", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false }),
      supabase
        .from("analyses")
        .select("id, real_property_id, created_by_user_id, created_at, analysis_pipeline!inner(disposition, lifecycle_stage, interest_level)")
        .in("real_property_id", visiblePropertyIds)
        .in("analysis_pipeline.disposition", ["active", "closed"])
        .order("created_at", { ascending: false }),
    ]);

    // Dedupe to latest-per-property (rows already ordered desc)
    for (const row of mlsRows ?? []) {
      const r = row as { real_property_id: string } & MlsInfo;
      if (!mlsByPropertyId.has(r.real_property_id)) {
        mlsByPropertyId.set(r.real_property_id, {
          mls_status: r.mls_status,
          mls_major_change_type: r.mls_major_change_type,
          listing_contract_date: r.listing_contract_date,
        });
      }
    }

    for (const row of analysisRows ?? []) {
      const r = row as {
        id: string;
        real_property_id: string;
        created_by_user_id: string;
        created_at: string;
        analysis_pipeline: { lifecycle_stage: string; interest_level: string | null } | { lifecycle_stage: string; interest_level: string | null }[];
      };
      if (!activeAnalysisByPropertyId.has(r.real_property_id)) {
        const ap = Array.isArray(r.analysis_pipeline) ? r.analysis_pipeline[0] : r.analysis_pipeline;
        activeAnalysisByPropertyId.set(r.real_property_id, {
          analysis_id: r.id,
          owner_id: r.created_by_user_id,
          lifecycle_stage: ap?.lifecycle_stage ?? null,
          interest_level: ap?.interest_level ?? null,
          analysis_created_at: r.created_at,
        });
      }
    }

    // Owner name resolution — profiles lookup for distinct non-self owners
    const ownerIds = Array.from(
      new Set(
        Array.from(activeAnalysisByPropertyId.values())
          .map((a) => a.owner_id)
          .filter((v) => v !== currentUserId),
      ),
    );
    if (ownerIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", ownerIds);
      for (const p of profiles ?? []) {
        const row = p as { id: string; full_name: string | null; email: string };
        ownerNameById.set(row.id, row.full_name || row.email);
      }
    }
  }

  const totalCount = results?.length ?? 0;
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

  // Shape rows for client component. mls_* fields and active-analysis
  // fields come from the batched follow-up queries above (Maps keyed by
  // real_property_id), not from the slim view itself.
  const tableRows = (results ?? []).map((r: Record<string, unknown>) => {
    const propertyId = r.real_property_id as string;
    const mls = mlsByPropertyId.get(propertyId);
    const active = activeAnalysisByPropertyId.get(propertyId);
    const isMine =
      currentUserId != null && active != null
        ? active.owner_id === currentUserId
        : null;
    return {
    id: r.id as string,
    real_property_id: propertyId,
    screening_batch_id: r.screening_batch_id as string,
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
    has_active_analysis: active != null,
    active_analysis_id: active?.analysis_id ?? null,
    active_lifecycle_stage: active?.lifecycle_stage ?? null,
    active_interest_level: active?.interest_level ?? null,
    active_analysis_is_mine: isMine,
    active_analysis_owner_name:
      active != null
        ? ownerNameById.get(active.owner_id) ?? null
        : null,
    has_newer_screening_than_analysis:
      active != null
        ? new Date(r.created_at as string) > new Date(active.analysis_created_at)
        : false,
    };
  });

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

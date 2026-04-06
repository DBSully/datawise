import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type QueuePageProps = {
  searchParams?: Promise<{
    city?: string;
    propertyType?: string;
    prime?: string;
    sort?: string;
    page?: string;
  }>;
};

const PAGE_SIZE = 200;

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

function trendColor(rate: number, detailJson: Record<string, unknown> | null): string {
  const direction = (detailJson?.direction as string) ?? classifyDirection(rate);
  switch (direction) {
    case "strong_appreciation": return "bg-emerald-100 text-emerald-800";
    case "appreciating": return "bg-emerald-50 text-emerald-700";
    case "flat": return "bg-slate-100 text-slate-600";
    case "softening": return "bg-amber-100 text-amber-800";
    case "declining": return "bg-red-100 text-red-700";
    case "sharp_decline": return "bg-red-200 text-red-800";
    default: return "bg-slate-100 text-slate-600";
  }
}

function classifyDirection(rate: number): string {
  if (rate >= 0.05) return "strong_appreciation";
  if (rate >= 0.02) return "appreciating";
  if (rate >= -0.02) return "flat";
  if (rate >= -0.05) return "softening";
  if (rate >= -0.10) return "declining";
  return "sharp_decline";
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

export default async function AnalysisQueuePage({
  searchParams,
}: QueuePageProps) {
  noStore();

  const resolved = searchParams ? await searchParams : undefined;
  const cityFilter = resolved?.city ?? "all";
  const typeFilter = resolved?.propertyType ?? "all";
  const primeFilter = resolved?.prime ?? "all";
  const sort = resolved?.sort ?? "gap_desc";
  const page = Math.max(1, Number(resolved?.page ?? "1") || 1);

  const supabase = await createClient();

  // Load filter options
  const [{ data: cityRows }, { data: typeRows }] = await Promise.all([
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
  ]);

  const cities = (cityRows ?? [])
    .map((r: { city: string }) => r.city)
    .filter(Boolean);
  const propertyTypes = (typeRows ?? [])
    .map((r: { property_type: string }) => r.property_type)
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
      <div>
        <h1 className="dw-page-title">Analysis Queue</h1>
        <p className="dw-page-copy">
          Latest screening result per property — find your next deal.
          {totalCount > 0 && (
            <> &middot; {formatNumber(totalCount)} properties</>
          )}
        </p>
      </div>

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
            href={buildHref("/analysis/queue", { ...currentParams, sort: opt.value })}
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

      {/* Results table */}
      <div className="dw-table-wrap">
        <table className="dw-table-compact min-w-[1500px]">
          <thead>
            <tr>
              <th style={{ width: 20 }}></th>
              <th>Address</th>
              <th>City</th>
              <th>Type</th>
              <th>MLS Status</th>
              <th>Contract</th>
              <th className="text-right">List Price</th>
              <th className="text-right">ARV</th>
              <th className="text-right">Trend</th>
              <th className="text-right">Spread</th>
              <th className="text-right">Gap/sqft</th>
              <th className="text-right">Comps</th>
              <th className="text-right">Rehab</th>
              <th className="text-right">Hold</th>
              <th className="text-right">Max Offer</th>
              <th className="text-right">Offer%</th>
              <th></th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {(!results || results.length === 0) ? (
              <tr>
                <td colSpan={18} className="py-8 text-center text-sm text-slate-400">
                  No screened properties found. Run a screening batch first.
                </td>
              </tr>
            ) : (
              results.map(
                (r: {
                  id: string;
                  real_property_id: string;
                  screening_batch_id: string;
                  is_prime_candidate: boolean;
                  subject_address: string;
                  subject_city: string;
                  subject_property_type: string | null;
                  subject_list_price: number | null;
                  mls_status: string | null;
                  listing_contract_date: string | null;
                  arv_aggregate: number | null;
                  trend_annual_rate: number | null;
                  trend_confidence: string | null;
                  trend_detail_json: Record<string, unknown> | null;
                  spread: number | null;
                  est_gap_per_sqft: number | null;
                  arv_comp_count: number | null;
                  rehab_total: number | null;
                  hold_total: number | null;
                  max_offer: number | null;
                  offer_pct: number | null;
                  promoted_analysis_id: string | null;
                }) => (
                  <tr
                    key={r.id}
                    className={r.is_prime_candidate ? "bg-emerald-50/60" : ""}
                  >
                    <td className="text-center">
                      {r.is_prime_candidate ? (
                        <span title="Prime Candidate" className="text-emerald-600">★</span>
                      ) : null}
                    </td>
                    <td className="font-medium">
                      <Link
                        href={`/analysis/screening/${r.screening_batch_id}/${r.id}`}
                        className="text-blue-700 hover:underline"
                      >
                        {r.subject_address}
                      </Link>
                    </td>
                    <td className="text-slate-500">{r.subject_city}</td>
                    <td className="text-slate-500">{r.subject_property_type ?? "—"}</td>
                    <td className="text-slate-600">{r.mls_status ?? "—"}</td>
                    <td className="text-slate-500">{r.listing_contract_date ? r.listing_contract_date.slice(0, 10) : "—"}</td>
                    <td className="text-right">{formatCurrency(r.subject_list_price)}</td>
                    <td className="text-right font-medium">{formatCurrency(r.arv_aggregate)}</td>
                    <td className="text-right">
                      {r.trend_annual_rate != null ? (
                        <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                          trendColor(r.trend_annual_rate, r.trend_detail_json)
                        }`}>
                          {r.trend_annual_rate >= 0 ? "+" : ""}{(r.trend_annual_rate * 100).toFixed(1)}%
                        </span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className={`text-right font-medium ${(r.spread ?? 0) > 0 ? "text-emerald-700" : (r.spread ?? 0) < 0 ? "text-red-600" : ""}`}>
                      {formatCurrency(r.spread)}
                    </td>
                    <td className={`text-right font-semibold ${(r.est_gap_per_sqft ?? 0) >= 60 ? "text-emerald-700" : ""}`}>
                      {r.est_gap_per_sqft !== null ? `$${formatNumber(r.est_gap_per_sqft)}` : "—"}
                    </td>
                    <td className="text-right text-slate-500">{formatNumber(r.arv_comp_count)}</td>
                    <td className="text-right">{formatCurrency(r.rehab_total)}</td>
                    <td className="text-right">{formatCurrency(r.hold_total)}</td>
                    <td className="text-right font-medium">{formatCurrency(r.max_offer)}</td>
                    <td className="text-right text-slate-500">{formatPercent(r.offer_pct)}</td>
                    <td>
                      {r.promoted_analysis_id ? (
                        <Link
                          href={`/analysis/properties/${r.real_property_id}/analyses/${r.promoted_analysis_id}`}
                          className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold text-blue-800"
                        >
                          In Analysis
                        </Link>
                      ) : (
                        <span className="text-[10px] text-slate-400">Ready</span>
                      )}
                    </td>
                    <td>
                      <Link
                        href={`/analysis/screening/${r.screening_batch_id}/${r.id}`}
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

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 text-sm">
          {page > 1 && (
            <Link
              href={buildHref("/analysis/queue", { ...currentParams, page: String(page - 1) })}
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
              href={buildHref("/analysis/queue", { ...currentParams, page: String(page + 1) })}
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

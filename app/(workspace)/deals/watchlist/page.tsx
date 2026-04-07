import { unstable_noStore as noStore } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { WatchListTable } from "./watch-list-table";

export const dynamic = "force-dynamic";

type WatchListRow = {
  analysis_id: string;
  real_property_id: string;
  unparsed_address: string;
  city: string;
  property_type: string | null;
  building_area_total_sqft: number | null;
  bedrooms_total: number | null;
  bathrooms_total: number | null;
  interest_level: string | null;
  showing_status: string | null;
  watch_list_note: string | null;
  days_on_watch_list: number | null;
  pipeline_updated_at: string | null;
  subject_list_price: number | null;
  current_list_price: number | null;
  arv_aggregate: number | null;
  max_offer: number | null;
  est_gap_per_sqft: number | null;
  offer_pct: number | null;
  arv_comp_count: number | null;
  rehab_total: number | null;
  trend_annual_rate: number | null;
  is_prime_candidate: boolean | null;
  mls_status: string | null;
  strategy_type: string | null;
};

export default async function WatchListPage() {
  noStore();
  const supabase = await createClient();

  const { data: rows, error } = await supabase
    .from("watch_list_v")
    .select("*")
    .order("interest_level", { ascending: true })
    .order("est_gap_per_sqft", { ascending: false, nullsFirst: false })
    .limit(200);

  if (error) throw new Error(error.message);

  const tableRows: WatchListRow[] = (rows ?? []).map((r: Record<string, unknown>) => ({
    analysis_id: r.analysis_id as string,
    real_property_id: r.real_property_id as string,
    unparsed_address: r.unparsed_address as string,
    city: r.city as string,
    property_type: r.property_type as string | null,
    building_area_total_sqft: r.building_area_total_sqft as number | null,
    bedrooms_total: r.bedrooms_total as number | null,
    bathrooms_total: r.bathrooms_total as number | null,
    interest_level: r.interest_level as string | null,
    showing_status: r.showing_status as string | null,
    watch_list_note: r.watch_list_note as string | null,
    days_on_watch_list: r.days_on_watch_list as number | null,
    pipeline_updated_at: r.pipeline_updated_at as string | null,
    subject_list_price: r.subject_list_price as number | null,
    current_list_price: r.current_list_price as number | null,
    arv_aggregate: r.arv_aggregate as number | null,
    max_offer: r.max_offer as number | null,
    est_gap_per_sqft: r.est_gap_per_sqft as number | null,
    offer_pct: r.offer_pct as number | null,
    arv_comp_count: r.arv_comp_count as number | null,
    rehab_total: r.rehab_total as number | null,
    trend_annual_rate: r.trend_annual_rate as number | null,
    is_prime_candidate: r.is_prime_candidate as boolean | null,
    mls_status: r.mls_status as string | null,
    strategy_type: r.strategy_type as string | null,
  }));

  return (
    <section className="dw-section-stack-compact">
      <div>
        <h1 className="dw-page-title">Watch List</h1>
        <p className="dw-page-copy">
          Deals promoted from screening — every property here was reviewed and
          deliberately added by an analyst.
          {tableRows.length > 0 && <> &middot; {tableRows.length} deals</>}
        </p>
      </div>
      <WatchListTable rows={tableRows} />
    </section>
  );
}

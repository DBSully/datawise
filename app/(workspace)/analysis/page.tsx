// Phase 1 Step 3B Task 1 — canonical Watch List route
//
// Replaces the previous stub redirect (which sent /analysis to /home).
// This is now the canonical Analysis stage entry: the list of properties
// promoted from screening that the analyst is actively underwriting.
//
// During Step 3 transition (3B-3E), the old /deals/watchlist URL still
// works via a thin re-export wrapper at app/(workspace)/deals/watchlist/page.tsx
// that re-exports this same component. Both URLs render identical UI.
// In 3F the old wrapper becomes a redirect() to /analysis.
//
// The WatchListTable component still lives under deals/watchlist/ for
// now — moving it is out of scope for 3B (component extraction is 3C).
// We import it via absolute path so the new route doesn't depend on
// directory structure.

import { unstable_noStore as noStore } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { WatchListTable } from "@/app/(workspace)/deals/watchlist/watch-list-table";

export const dynamic = "force-dynamic";

type WatchListRow = {
  analysis_id: string;
  real_property_id: string;
  interest_level: string | null;
  showing_status: string | null;
  watch_list_note: string | null;
  unparsed_address: string;
  city: string;
  lot_size_sqft: number | null;
  subdivision_name: string | null;
  mls_major_change_type: string | null;
  listing_contract_date: string | null;
  mls_status: string | null;
  list_price: number | null;
  dom: number | null;
  level_class_standardized: string | null;
  year_built: number | null;
  bedrooms_total: number | null;
  bathrooms_total: number | null;
  garage_spaces: number | null;
  building_area_total_sqft: number | null;
  above_grade_finished_area_sqft: number | null;
  below_grade_total_sqft: number | null;
  below_grade_finished_area_sqft: number | null;
  arv_aggregate: number | null;
  max_offer: number | null;
  comps_selected: number | null;
  comps_total: number | null;
  offer_pct: number | null;
  gap_per_sqft: number | null;
  target_profit: number | null;
  is_prime_candidate: boolean | null;
  // Unread change-event info from property_events (via watch_list_v).
  unread_event_count: number | null;
  latest_unread_event_type: string | null;
  latest_unread_event_before: unknown;
  latest_unread_event_after: unknown;
  latest_unread_event_at: string | null;
};

export default async function WatchListPage() {
  noStore();
  const supabase = await createClient();

  const { data: rows, error } = await supabase
    .from("watch_list_v")
    .select("*")
    .order("offer_pct", { ascending: false, nullsFirst: false })
    .limit(500);

  if (error) throw new Error(error.message);

  const tableRows: WatchListRow[] = (rows ?? []).map((r: Record<string, unknown>) => ({
    analysis_id: r.analysis_id as string,
    real_property_id: r.real_property_id as string,
    interest_level: r.interest_level as string | null,
    showing_status: r.showing_status as string | null,
    watch_list_note: r.watch_list_note as string | null,
    unparsed_address: r.unparsed_address as string,
    city: r.city as string,
    lot_size_sqft: r.lot_size_sqft as number | null,
    subdivision_name: r.subdivision_name as string | null,
    mls_major_change_type: r.mls_major_change_type as string | null,
    listing_contract_date: r.listing_contract_date as string | null,
    mls_status: r.mls_status as string | null,
    list_price: r.list_price as number | null,
    dom: r.dom as number | null,
    level_class_standardized: r.level_class_standardized as string | null,
    year_built: r.year_built as number | null,
    bedrooms_total: r.bedrooms_total as number | null,
    bathrooms_total: r.bathrooms_total as number | null,
    garage_spaces: r.garage_spaces as number | null,
    building_area_total_sqft: r.building_area_total_sqft as number | null,
    above_grade_finished_area_sqft: r.above_grade_finished_area_sqft as number | null,
    below_grade_total_sqft: r.below_grade_total_sqft as number | null,
    below_grade_finished_area_sqft: r.below_grade_finished_area_sqft as number | null,
    arv_aggregate: r.arv_aggregate as number | null,
    max_offer: r.max_offer as number | null,
    comps_selected: r.comps_selected as number | null,
    comps_total: r.comps_total as number | null,
    offer_pct: r.offer_pct as number | null,
    gap_per_sqft: r.gap_per_sqft as number | null,
    target_profit: r.target_profit as number | null,
    is_prime_candidate: r.is_prime_candidate as boolean | null,
    unread_event_count: r.unread_event_count as number | null,
    latest_unread_event_type: r.latest_unread_event_type as string | null,
    latest_unread_event_before: r.latest_unread_event_before,
    latest_unread_event_after: r.latest_unread_event_after,
    latest_unread_event_at: r.latest_unread_event_at as string | null,
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

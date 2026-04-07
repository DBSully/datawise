import { unstable_noStore as noStore } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { PipelineTable } from "./pipeline-table";

export const dynamic = "force-dynamic";

export default async function PipelinePage() {
  noStore();
  const supabase = await createClient();

  const { data: rows, error } = await supabase
    .from("pipeline_v")
    .select("*")
    .order("pipeline_updated_at", { ascending: false })
    .limit(200);

  if (error) throw new Error(error.message);

  const tableRows = (rows ?? []).map((r: Record<string, unknown>) => ({
    analysis_id: r.analysis_id as string,
    unparsed_address: r.unparsed_address as string,
    city: r.city as string,
    property_type: r.property_type as string | null,
    lifecycle_stage: r.lifecycle_stage as string,
    offer_status: r.offer_status as string | null,
    showing_status: r.showing_status as string | null,
    subject_list_price: r.subject_list_price as number | null,
    current_list_price: r.current_list_price as number | null,
    arv_aggregate: r.arv_aggregate as number | null,
    max_offer: r.max_offer as number | null,
    est_gap_per_sqft: r.est_gap_per_sqft as number | null,
    offer_submitted_date: r.offer_submitted_date as string | null,
    offer_deadline_date: r.offer_deadline_date as string | null,
    offer_accepted_date: r.offer_accepted_date as string | null,
    days_since_update: r.days_since_update as number | null,
    interest_level: r.interest_level as string | null,
  }));

  return (
    <section className="dw-section-stack-compact">
      <div>
        <h1 className="dw-page-title">Pipeline</h1>
        <p className="dw-page-copy">
          Active deal-making: showings, offers, and contracts in progress.
          {tableRows.length > 0 && <> &middot; {tableRows.length} deals</>}
        </p>
      </div>
      <PipelineTable rows={tableRows} />
    </section>
  );
}

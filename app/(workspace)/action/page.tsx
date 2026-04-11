// Phase 1 Step 3B Task 3 — canonical Action route
//
// Single page that dispatches on ?status=active|closed (default: active),
// replacing the previous split between /deals/pipeline (active) and
// /deals/closed (closed). Both legacy URLs continue to work via thin
// wrappers that delegate to this page so there is one source of truth
// for both views.
//
// In 3F the legacy wrappers become redirect() calls to /action.
//
// Tabs in the Action section subheader (added to app-chrome.tsx in 3B
// Task 5) toggle the ?status= query param.

import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { PipelineTable } from "@/app/(workspace)/deals/pipeline/pipeline-table";

export const dynamic = "force-dynamic";

type ActionPageProps = {
  searchParams?: Promise<{ status?: string }>;
};

export default async function ActionPage({ searchParams }: ActionPageProps) {
  const resolved = searchParams ? await searchParams : undefined;
  const status = resolved?.status === "closed" ? "closed" : "active";

  if (status === "closed") {
    return <ClosedDealsSection />;
  }

  return <PipelineSection />;
}

// ─────────────────────────────────────────────────────────────────────────────
// Active pipeline (default view)
// ─────────────────────────────────────────────────────────────────────────────

async function PipelineSection() {
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

// ─────────────────────────────────────────────────────────────────────────────
// Closed deals (?status=closed)
// ─────────────────────────────────────────────────────────────────────────────

function $f(v: number | null | undefined) {
  if (v == null) return "—";
  return "$" + v.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function fmtDate(v: string | null | undefined) {
  if (!v) return "—";
  return new Date(v).toLocaleDateString();
}

function formatNumber(v: number | null | undefined) {
  if (v == null) return "—";
  return v.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

async function ClosedDealsSection() {
  noStore();
  const supabase = await createClient();

  const { data: rows, error } = await supabase
    .from("closed_deals_v")
    .select("*")
    .order("pipeline_updated_at", { ascending: false })
    .limit(200);

  if (error) throw new Error(error.message);

  const deals = (rows ?? []).map((r: Record<string, unknown>) => ({
    analysis_id: r.analysis_id as string,
    unparsed_address: r.unparsed_address as string,
    city: r.city as string,
    property_type: r.property_type as string | null,
    disposition: r.disposition as string,
    offer_status: r.offer_status as string | null,
    closed_date: r.closed_date as string | null,
    subject_list_price: r.subject_list_price as number | null,
    current_list_price: r.current_list_price as number | null,
    arv_aggregate: r.arv_aggregate as number | null,
    max_offer: r.max_offer as number | null,
    est_gap_per_sqft: r.est_gap_per_sqft as number | null,
    pipeline_updated_at: r.pipeline_updated_at as string | null,
  }));

  const wonCount = deals.filter((d) => d.disposition === "closed").length;
  const lostCount = deals.filter((d) => d.disposition === "passed").length;

  return (
    <section className="dw-section-stack-compact">
      <div>
        <h1 className="dw-page-title">Closed Deals</h1>
        <p className="dw-page-copy">
          Completed deals — won and lost — for historical tracking.
          {deals.length > 0 && (
            <>
              {" "}&middot; {wonCount} won, {lostCount} lost
            </>
          )}
        </p>
      </div>

      {deals.length === 0 ? (
        <div className="dw-card py-12 text-center">
          <p className="text-sm text-slate-500">
            No closed deals yet. Deals move here when they close from the{" "}
            <Link href="/action" className="text-blue-600 hover:underline">
              Pipeline
            </Link>
            .
          </p>
        </div>
      ) : (
        <div className="dw-table-wrap">
          <table className="dw-table-compact min-w-[1000px]">
            <thead>
              <tr>
                <th>Outcome</th>
                <th>Address</th>
                <th>City</th>
                <th>Type</th>
                <th className="text-right">List</th>
                <th className="text-right">ARV</th>
                <th className="text-right">Max Offer</th>
                <th className="text-right">Gap/sqft</th>
                <th>Closed</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {deals.map((d) => {
                const isWon = d.disposition === "closed";
                const listPrice = d.current_list_price ?? d.subject_list_price;

                return (
                  <tr
                    key={d.analysis_id}
                    className={isWon ? "bg-emerald-50/40" : ""}
                  >
                    <td>
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                          isWon
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-red-100 text-red-700"
                        }`}
                      >
                        {isWon ? "Won" : "Lost"}
                      </span>
                    </td>
                    <td className="font-medium">
                      <Link
                        href={`/analysis/${d.analysis_id}`}
                        className="text-blue-700 hover:underline"
                      >
                        {d.unparsed_address}
                      </Link>
                    </td>
                    <td className="text-slate-500">{d.city}</td>
                    <td className="text-xs text-slate-500">
                      {d.property_type ?? "—"}
                    </td>
                    <td className="text-right">{$f(listPrice)}</td>
                    <td className="text-right font-medium text-emerald-700">
                      {$f(d.arv_aggregate)}
                    </td>
                    <td className="text-right font-medium">
                      {$f(d.max_offer)}
                    </td>
                    <td
                      className={`text-right font-semibold ${
                        (d.est_gap_per_sqft ?? 0) >= 60
                          ? "text-emerald-700"
                          : ""
                      }`}
                    >
                      {d.est_gap_per_sqft != null
                        ? `$${formatNumber(d.est_gap_per_sqft)}`
                        : "—"}
                    </td>
                    <td className="text-xs text-slate-500">
                      {fmtDate(d.closed_date ?? d.pipeline_updated_at)}
                    </td>
                    <td className="max-w-[160px] truncate text-xs text-slate-500">
                      {!isWon ? (d.offer_status ?? "—") : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

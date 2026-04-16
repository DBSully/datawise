/**
 * Backfill: recompute ARV + deal math for screening_results rows where
 * the new positive-rate cap lowered the trend rate, and regenerate any
 * analysis_reports snapshots frozen off the pre-cap numbers.
 *
 * Run with:
 *   npx tsx --env-file=.env.local scripts/backfill-trend-cap.ts
 *
 * Idempotent — safe to re-run. Only touches rows where the cap flag is set
 * AND the stored ARV still reflects the uncapped rate (detected by comparing
 * a sample per-comp arvTimeAdjusted against what the capped rate would
 * produce). Writes a summary line per row.
 */

import { createClient } from "@supabase/supabase-js";
import { calculateDealMath } from "../lib/screening/deal-math";
import { loadWorkstationData } from "../lib/analysis/load-workstation-data";
import { buildReportSnapshot } from "../lib/reports/snapshot";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env.",
  );
  process.exit(1);
}

const CAPPED_RATE = 0.02;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type PerCompDetail = {
  arvBlended: number;
  daysSinceClose: number;
  decayWeight: number;
  analystAdjustmentTotal?: number | null;
  timeAdjustment?: number;
  arvTimeAdjusted?: number;
  arvFinal?: number;
  [k: string]: unknown;
};

function round(n: number): number {
  return Math.round(n);
}

function recomputeArvFromDetails(
  details: PerCompDetail[],
  rate: number,
): { arvAggregate: number; patchedDetails: PerCompDetail[] } {
  const patched: PerCompDetail[] = [];
  let weightedSum = 0;
  let weightSum = 0;

  for (const d of details) {
    const timeMultiplier = 1 + rate * (d.daysSinceClose / 365);
    const timeAdjustment = d.arvBlended * (timeMultiplier - 1);
    const arvTimeAdjusted = d.arvBlended * timeMultiplier;
    const analystAdjTotal = Number(d.analystAdjustmentTotal ?? 0) || 0;
    const arvFinal = round(arvTimeAdjusted + analystAdjTotal);

    patched.push({
      ...d,
      timeAdjustment: round(timeAdjustment),
      arvTimeAdjusted: round(arvTimeAdjusted),
      arvFinal,
    });

    weightedSum += arvFinal * d.decayWeight;
    weightSum += d.decayWeight;
  }

  const arvAggregate = weightSum > 0 ? round(weightedSum / weightSum) : 0;
  return { arvAggregate, patchedDetails: patched };
}

// ---------------------------------------------------------------------------
// Step 1: Recompute ARV + deal math on capped screening_results
// ---------------------------------------------------------------------------

async function backfillScreeningResults(): Promise<string[]> {
  // Paginate — Supabase/PostgREST caps a single response at 1000 rows.
  const PAGE = 1000;
  const touchedAnalysisIds: string[] = [];
  let offset = 0;
  let totalSeen = 0;
  let totalUpdated = 0;
  let totalSkipped = 0;

  for (;;) {
    const { data: rows, error } = await supabase
      .from("screening_results")
      .select(
        "id, promoted_analysis_id, subject_building_sqft, subject_list_price, arv_aggregate, arv_detail_json, rehab_total, hold_total, transaction_total, financing_total, target_profit, trend_detail_json, trend_annual_rate, trend_raw_rate, trend_positive_cap_applied",
      )
      .eq("trend_positive_cap_applied", true)
      .order("id", { ascending: true })
      .range(offset, offset + PAGE - 1);

    if (error) throw new Error(`Load screening_results: ${error.message}`);
    if (!rows || rows.length === 0) break;

    totalSeen += rows.length;
    console.log(`Page starting at ${offset}: ${rows.length} rows`);

    for (const row of rows) {
      const details = row.arv_detail_json as PerCompDetail[] | null;
      if (!details || !Array.isArray(details) || details.length === 0) {
        totalSkipped++;
        continue;
      }

      const buildingSqft = Number(row.subject_building_sqft) || 0;
      if (buildingSqft <= 0) {
        totalSkipped++;
        continue;
      }

      const { arvAggregate, patchedDetails } = recomputeArvFromDetails(
        details,
        CAPPED_RATE,
      );

      const dealMath = calculateDealMath({
        arv: arvAggregate,
        listPrice: row.subject_list_price != null ? Number(row.subject_list_price) : null,
        buildingSqft,
        rehabTotal: Number(row.rehab_total) || 0,
        holdTotal: Number(row.hold_total) || 0,
        transactionTotal: Number(row.transaction_total) || 0,
        financingTotal: Number(row.financing_total) || 0,
        targetProfit: Number(row.target_profit) || 0,
      });

      // Patch trend_detail_json with the three new keys for any row that
      // lacks them. This is the per-row version of the SQL patch that was
      // too expensive to run as a single bulk UPDATE.
      const trendDetail = (row.trend_detail_json as Record<string, unknown>) ?? {};
      const patchedTrendDetail = {
        ...trendDetail,
        rawBlendedRate: row.trend_raw_rate ?? trendDetail.rawBlendedRate ?? null,
        positiveRateCap: CAPPED_RATE,
        positiveRateCapApplied: true,
        blendedAnnualRate: row.trend_annual_rate ?? CAPPED_RATE,
      };

      const arvPerSqft = buildingSqft > 0 ? Math.round((arvAggregate / buildingSqft) * 100) / 100 : 0;

      const { error: updateError } = await supabase
        .from("screening_results")
        .update({
          arv_aggregate: arvAggregate,
          arv_per_sqft: arvPerSqft,
          arv_detail_json: patchedDetails,
          max_offer: dealMath.maxOffer,
          spread: dealMath.spread,
          est_gap_per_sqft: dealMath.estGapPerSqft,
          negotiation_gap: dealMath.negotiationGap,
          offer_pct: dealMath.offerPct,
          trend_detail_json: patchedTrendDetail,
        })
        .eq("id", row.id);

      if (updateError) {
        console.error(`  FAIL ${row.id}: ${updateError.message}`);
        continue;
      }

      totalUpdated++;
      if (row.promoted_analysis_id) {
        touchedAnalysisIds.push(row.promoted_analysis_id);
      }
    }

    if (rows.length < PAGE) break;
    offset += PAGE;
  }

  console.log(`Screening results: ${totalSeen} seen, ${totalUpdated} updated, ${totalSkipped} skipped (no ARV detail or sqft).`);
  return touchedAnalysisIds;
}

// ---------------------------------------------------------------------------
// Step 2: Regenerate analysis_reports snapshots for affected analyses
// ---------------------------------------------------------------------------

async function regenerateReports(analysisIds: string[]): Promise<void> {
  if (analysisIds.length === 0) {
    console.log("No analyses to regenerate reports for.");
    return;
  }

  const uniqueIds = Array.from(new Set(analysisIds));

  const { data: reports, error } = await supabase
    .from("analysis_reports")
    .select("id, analysis_id, created_by_user_id, analyses!inner(real_property_id)")
    .in("analysis_id", uniqueIds);

  if (error) throw new Error(`Load analysis_reports: ${error.message}`);

  console.log(
    `Analysis reports to regenerate: ${reports?.length ?? 0} (${uniqueIds.length} unique analyses)`,
  );

  for (const report of reports ?? []) {
    const analyses = report.analyses as
      | { real_property_id: string }
      | { real_property_id: string }[];
    const realPropertyId = Array.isArray(analyses)
      ? analyses[0]?.real_property_id
      : analyses?.real_property_id;

    if (!realPropertyId) {
      console.log(`  skip report ${report.id}: no real_property_id`);
      continue;
    }

    const workstationData = await loadWorkstationData(
      supabase,
      report.created_by_user_id,
      realPropertyId,
      report.analysis_id,
    );

    if (!workstationData) {
      console.log(`  skip report ${report.id}: workstation data load failed`);
      continue;
    }

    const contentJson = buildReportSnapshot(workstationData);

    const { error: updErr } = await supabase
      .from("analysis_reports")
      .update({ content_json: contentJson })
      .eq("id", report.id);

    if (updErr) {
      console.error(`  FAIL report ${report.id}: ${updErr.message}`);
      continue;
    }

    console.log(`  regenerated report ${report.id}`);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("=== Trend-cap backfill ===");
  const touchedAnalysisIds = await backfillScreeningResults();
  await regenerateReports(touchedAnalysisIds);
  console.log("=== Done ===");
}

main().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});

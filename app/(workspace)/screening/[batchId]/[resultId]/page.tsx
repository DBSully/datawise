import Link from "next/link";
import { notFound } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { promoteAndOpenAction } from "../../actions";
import { TrendDirectionBadge } from "@/components/workstation/trend-badges";

export const dynamic = "force-dynamic";

type DealDetailPageProps = {
  params: Promise<{ batchId: string; resultId: string }>;
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

function DetailItem({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="dw-detail-item">
      <div className="dw-detail-label">{label}</div>
      <div
        className={`dw-detail-value ${highlight ? "font-semibold text-emerald-700" : ""}`}
      >
        {value}
      </div>
    </div>
  );
}

function SectionCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="dw-card-compact space-y-2">
      <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
      {children}
    </div>
  );
}

export default async function DealDetailPage({ params }: DealDetailPageProps) {
  noStore();

  const { batchId, resultId } = await params;
  const supabase = await createClient();

  const { data: result, error } = await supabase
    .from("screening_results")
    .select("*")
    .eq("id", resultId)
    .single();

  if (error || !result) notFound();

  // Load comps from relational table if comp run exists
  let compCandidates: Array<{
    id: string;
    comp_listing_row_id: string;
    distance_miles: number | null;
    days_since_close: number | null;
    sqft_delta_pct: number | null;
    year_built_delta: number | null;
    bed_delta: number | null;
    bath_delta: number | null;
    raw_score: number | null;
    selected_yn: boolean;
    metrics_json: Record<string, unknown> | null;
    score_breakdown_json: Record<string, unknown> | null;
  }> = [];

  if (result.comp_search_run_id) {
    const { data: candidates } = await supabase
      .from("comparable_search_candidates")
      .select("id, comp_listing_row_id, distance_miles, days_since_close, sqft_delta_pct, year_built_delta, bed_delta, bath_delta, raw_score, selected_yn, metrics_json, score_breakdown_json")
      .eq("comparable_search_run_id", result.comp_search_run_id)
      .order("raw_score", { ascending: false });
    compCandidates = candidates ?? [];
  }

  // Fallback to ARV detail JSON if no relational comps
  const arvDetail = (result.arv_detail_json ?? []) as Array<{
    listingId: string;
    address: string;
    closePrice: number;
    closeDateIso: string;
    daysSinceClose: number;
    distanceMiles: number;
    compBuildingSqft: number;
    compAboveGradeSqft: number;
    psfBuilding: number;
    psfAboveGrade: number;
    arvBlended: number;
    timeAdjustment: number;
    arvTimeAdjusted: number;
    confidence: number;
    decayWeight: number;
  }>;

  const rehabDetail = result.rehab_detail_json as {
    typeMultiplier: number;
    conditionMultiplier: number;
    priceMultiplier: number;
    ageMultiplier: number;
  } | null;

  const financingDetail = result.financing_detail_json as {
    ltvPct: number;
    annualRate: number;
    pointsRate: number;
    daysHeld: number;
    monthlyPayment: number;
    dailyInterest: number;
  } | null;

  const isPrime = result.is_prime_candidate;
  const qualJson = result.qualification_json as {
    qualifyingCompCount: number;
    reasons: string[];
    disqualifiers: string[];
  } | null;

  return (
    <section className="dw-section-stack-compact">
      {/* Header */}
      <div>
        <Link
          href={`/screening/${batchId}`}
          className="text-xs text-blue-600 hover:underline"
        >
          ← Batch Results
        </Link>
        <div className="mt-1 flex items-center gap-3">
          <h1 className="dw-page-title">{result.subject_address}</h1>
          {isPrime && (
            <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-800">
              ★ Prime Candidate
            </span>
          )}
        </div>
        <p className="dw-page-copy">
          {result.subject_city} &middot;{" "}
          {result.subject_property_type ?? "Unknown Type"} &middot; Built{" "}
          {result.subject_year_built ?? "—"}
        </p>
      </div>

      {/* Deal summary */}
      <div className="grid gap-3 sm:grid-cols-5">
        <StatCard label="List Price" value={formatCurrency(result.subject_list_price)} />
        <StatCard
          label="ARV"
          value={formatCurrency(result.arv_aggregate)}
          highlight
        />
        <StatCard label="Spread" value={formatCurrency(result.spread)} />
        <StatCard
          label="Gap/sqft"
          value={
            result.est_gap_per_sqft !== null
              ? `$${formatNumber(result.est_gap_per_sqft)}`
              : "—"
          }
        />
        <StatCard
          label="Max Offer"
          value={formatCurrency(result.max_offer)}
          highlight
        />
      </div>

      <div className="grid gap-3 xl:grid-cols-2">
        {/* Subject snapshot */}
        <SectionCard title="Subject Property">
          <div className="dw-detail-grid">
            <DetailItem
              label="List Price"
              value={formatCurrency(result.subject_list_price)}
            />
            <DetailItem
              label="Building Sqft"
              value={formatNumber(result.subject_building_sqft)}
            />
            <DetailItem
              label="Above Grade"
              value={formatNumber(result.subject_above_grade_sqft)}
            />
            <DetailItem
              label="Below Grade"
              value={formatNumber(result.subject_below_grade_total_sqft)}
            />
            <DetailItem
              label="Year Built"
              value={result.subject_year_built?.toString() ?? "—"}
            />
            <DetailItem
              label="Property Type"
              value={result.subject_property_type ?? "—"}
            />
          </div>
        </SectionCard>

        {/* Deal math summary */}
        <SectionCard title="Deal Math">
          <div className="space-y-1 text-sm">
            <DealLine label="ARV" value={formatCurrency(result.arv_aggregate)} />
            <DealLine
              label="− Rehab"
              value={formatCurrency(result.rehab_total)}
              negative
            />
            <DealLine
              label="− Holding"
              value={formatCurrency(result.hold_total)}
              negative
            />
            <DealLine
              label="− Transaction"
              value={formatCurrency(result.transaction_total)}
              negative
            />
            {result.financing_total != null && (
              <DealLine
                label="− Financing"
                value={formatCurrency(result.financing_total)}
                negative
              />
            )}
            <DealLine
              label="− Target Profit"
              value={formatCurrency(result.target_profit)}
              negative
            />
            <div className="border-t border-slate-300 pt-1">
              <DealLine
                label="= Max Offer"
                value={formatCurrency(result.max_offer)}
                bold
              />
              <DealLine
                label="Offer %"
                value={formatPercent(result.offer_pct)}
              />
            </div>
          </div>
        </SectionCard>
      </div>

      {/* Market Trend */}
      <SectionCard title="Market Trend">
        {result.trend_annual_rate != null ? (
          <div className="space-y-3">
            {/* Summary */}
            <p className="text-sm text-slate-600">{result.trend_summary}</p>

            {/* Badges: confidence + direction */}
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                  result.trend_confidence === "high"
                    ? "bg-emerald-100 text-emerald-800"
                    : result.trend_confidence === "low"
                      ? "bg-amber-100 text-amber-800"
                      : "bg-red-100 text-red-800"
                }`}
              >
                {result.trend_confidence === "high"
                  ? "Confidence: High"
                  : result.trend_confidence === "low"
                    ? "Confidence: Low"
                    : "Confidence: Fallback"}
              </span>
              <TrendDirectionBadge
                direction={((result.trend_detail_json as Record<string, unknown> | null)?.direction as string) ?? "flat"}
                variant="prominent"
              />
              {result.trend_is_fallback && (
                <span className="text-xs text-red-600">
                  Insufficient comps — fixed {formatPercent(result.trend_annual_rate)}/yr applied
                </span>
              )}
              {result.trend_positive_cap_applied && (
                <span className="inline-flex items-center rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-800">
                  Capped at +2.0%/yr
                </span>
              )}
            </div>

            {/* Applied rate (+ raw market rate when capped) */}
            <div className="dw-detail-grid">
              <DetailItem
                label="Applied Rate"
                value={`${formatPercent(result.trend_annual_rate)}/yr`}
                highlight
              />
              {result.trend_positive_cap_applied && result.trend_raw_rate != null && (
                <DetailItem
                  label="Market Rate (pre-cap)"
                  value={`${formatPercent(result.trend_raw_rate)}/yr`}
                />
              )}
            </div>

            {/* Two-column: Local / Metro */}
            {(() => {
              const td = result.trend_detail_json as {
                localStats?: TrendTierStatsJson;
                metroStats?: TrendTierStatsJson;
              } | null;
              return (
                <div className="grid gap-4 sm:grid-cols-2">
                  <TrendTierSection
                    label="Local"
                    radius={result.trend_local_radius ?? 0.75}
                    rate={result.trend_local_rate}
                    stats={td?.localStats ?? null}
                  />
                  <TrendTierSection
                    label="Metro"
                    radius={result.trend_metro_radius ?? 12}
                    rate={result.trend_metro_rate}
                    stats={td?.metroStats ?? null}
                  />
                </div>
              );
            })()}
          </div>
        ) : (
          <p className="py-2 text-sm text-slate-400">
            No market trend data available.
          </p>
        )}
      </SectionCard>

      {/* Rehab breakdown */}
      <SectionCard title="Rehab Budget Estimate">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="dw-detail-grid">
            <DetailItem
              label="Above Grade Interior"
              value={formatCurrency(result.rehab_above_grade)}
            />
            <DetailItem
              label="Below Grade Finished"
              value={formatCurrency(result.rehab_below_finished)}
            />
            <DetailItem
              label="Below Grade Unfinished"
              value={formatCurrency(result.rehab_below_unfinished)}
            />
            <DetailItem
              label="Exterior"
              value={formatCurrency(result.rehab_exterior)}
            />
            <DetailItem
              label="Landscaping"
              value={formatCurrency(result.rehab_landscaping)}
            />
            <DetailItem
              label="Systems"
              value={formatCurrency(result.rehab_systems)}
            />
            <DetailItem
              label="Total Rehab"
              value={formatCurrency(result.rehab_total)}
              highlight
            />
          </div>
          {rehabDetail && (
            <div className="dw-detail-grid">
              <DetailItem
                label="Composite Multiplier"
                value={formatNumber(result.rehab_composite_multiplier, 3)}
              />
              <DetailItem
                label="Type Multiplier"
                value={formatNumber(rehabDetail.typeMultiplier, 2)}
              />
              <DetailItem
                label="Condition Multiplier"
                value={formatNumber(rehabDetail.conditionMultiplier, 2)}
              />
              <DetailItem
                label="Price Multiplier"
                value={formatNumber(rehabDetail.priceMultiplier, 2)}
              />
              <DetailItem
                label="Age Multiplier"
                value={formatNumber(rehabDetail.ageMultiplier, 2)}
              />
            </div>
          )}
        </div>
      </SectionCard>

      {/* Holding costs */}
      <SectionCard title="Holding Costs">
        <div className="dw-detail-grid">
          <DetailItem
            label="Days Held"
            value={result.hold_days?.toString() ?? "—"}
          />
          <DetailItem
            label="Total Hold Cost"
            value={formatCurrency(result.hold_total)}
            highlight
          />
        </div>
      </SectionCard>

      {/* Financing costs */}
      {(result.financing_total != null || financingDetail) && (
        <SectionCard title="Financing Costs">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="dw-detail-grid">
              <DetailItem
                label="Loan Amount"
                value={formatCurrency(result.financing_loan_amount)}
              />
              <DetailItem
                label="Interest Cost"
                value={formatCurrency(result.financing_interest)}
              />
              <DetailItem
                label="Origination Fee"
                value={formatCurrency(result.financing_origination)}
              />
              <DetailItem
                label="Total Financing"
                value={formatCurrency(result.financing_total)}
                highlight
              />
            </div>
            {financingDetail && (
              <div className="dw-detail-grid">
                <DetailItem
                  label="LTV"
                  value={formatPercent(financingDetail.ltvPct)}
                />
                <DetailItem
                  label="Annual Rate"
                  value={formatPercent(financingDetail.annualRate)}
                />
                <DetailItem
                  label="Origination Points"
                  value={formatPercent(financingDetail.pointsRate)}
                />
                <DetailItem
                  label="Hold Period"
                  value={`${financingDetail.daysHeld} days`}
                />
                <DetailItem
                  label="Monthly Payment (I/O)"
                  value={formatCurrency(financingDetail.monthlyPayment)}
                />
                <DetailItem
                  label="Daily Interest"
                  value={`$${formatNumber(financingDetail.dailyInterest, 2)}`}
                />
              </div>
            )}
          </div>
        </SectionCard>
      )}

      {/* Comparable Sales */}
      <SectionCard title={`Comparable Sales (${compCandidates.length > 0 ? compCandidates.length : arvDetail.length} comps)`}>
        {compCandidates.length > 0 ? (
          <div className="dw-table-wrap">
            <table className="dw-table-compact min-w-[1500px]">
              <thead>
                <tr>
                  <th>MLS#</th>
                  <th>Address</th>
                  <th className="text-right">Close Price</th>
                  <th>Close Date</th>
                  <th className="text-right">Dist</th>
                  <th className="text-right">Days</th>
                  <th className="text-right">GLA</th>
                  <th className="text-right">GLA Δ%</th>
                  <th className="text-right">Yr</th>
                  <th className="text-right">Yr Δ</th>
                  <th className="text-right">Bd</th>
                  <th className="text-right">Ba</th>
                  <th className="text-right">Gar</th>
                  <th>Level</th>
                  <th className="text-right">PSF</th>
                  <th className="text-right">Score</th>
                </tr>
              </thead>
              <tbody>
                {compCandidates.map((c) => {
                  const m = (c.metrics_json ?? {}) as Record<string, unknown>;
                  return (
                    <tr key={c.id}>
                      <td className="font-mono text-xs">{String(m.listing_id ?? "—")}</td>
                      <td>{String(m.address ?? "—")}</td>
                      <td className="text-right">{formatCurrency((m.net_price as number) ?? (m.close_price as number))}</td>
                      <td className="text-xs">{m.close_date ? new Date(String(m.close_date)).toLocaleDateString() : "—"}</td>
                      <td className="text-right">{formatNumber(c.distance_miles, 2)}</td>
                      <td className="text-right">{c.days_since_close ?? "—"}</td>
                      <td className="text-right">{formatNumber(m.building_area_total_sqft as number)}</td>
                      <td className="text-right">{c.sqft_delta_pct !== null ? `${formatNumber(c.sqft_delta_pct, 1)}%` : "—"}</td>
                      <td className="text-right">{String(m.year_built ?? "—")}</td>
                      <td className="text-right">{c.year_built_delta ?? "—"}</td>
                      <td className="text-right">{String(m.bedrooms_total ?? "—")}</td>
                      <td className="text-right">{String(m.bathrooms_total ?? "—")}</td>
                      <td className="text-right">{String(m.garage_spaces ?? "—")}</td>
                      <td className="text-xs">{String(m.level_class_standardized ?? "—")}</td>
                      <td className="text-right">{m.ppsf ? formatCurrency(m.ppsf as number) : "—"}</td>
                      <td className="text-right font-semibold">{c.raw_score !== null ? formatNumber(c.raw_score, 1) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : arvDetail.length > 0 ? (
          <div className="dw-table-wrap">
            <table className="dw-table-compact min-w-[1200px]">
              <thead>
                <tr>
                  <th>MLS#</th>
                  <th>Address</th>
                  <th className="text-right">Close Price</th>
                  <th>Close Date</th>
                  <th className="text-right">Dist</th>
                  <th className="text-right">Days</th>
                  <th className="text-right">Bldg Sqft</th>
                  <th className="text-right">PSF Bldg</th>
                  <th className="text-right">ARV Blended</th>
                  <th className="text-right">ARV Adjusted</th>
                  <th className="text-right">Confidence</th>
                </tr>
              </thead>
              <tbody>
                {arvDetail.map((comp, idx) => (
                  <tr key={idx}>
                    <td className="font-mono text-xs">{comp.listingId}</td>
                    <td>{comp.address}</td>
                    <td className="text-right">{formatCurrency(comp.closePrice)}</td>
                    <td className="text-xs">{new Date(comp.closeDateIso).toLocaleDateString()}</td>
                    <td className="text-right">{formatNumber(comp.distanceMiles, 2)}</td>
                    <td className="text-right">{comp.daysSinceClose}</td>
                    <td className="text-right">{formatNumber(comp.compBuildingSqft)}</td>
                    <td className="text-right">{formatCurrency(comp.psfBuilding)}</td>
                    <td className="text-right font-medium">{formatCurrency(comp.arvBlended)}</td>
                    <td className="text-right font-semibold">{formatCurrency(comp.arvTimeAdjusted)}</td>
                    <td className="text-right">{comp.confidence}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="py-4 text-center text-sm text-slate-400">
            No comparable sales data.
          </p>
        )}
      </SectionCard>

      {/* Qualification */}
      <SectionCard title="Qualification">
        <div className="space-y-1 text-sm">
          {qualJson?.reasons?.map((r, i) => (
            <div key={i} className="text-emerald-700">
              ✓ {r}
            </div>
          ))}
          {qualJson?.disqualifiers?.map((d, i) => (
            <div key={i} className="text-red-600">
              ✗ {d}
            </div>
          ))}
          {!qualJson && (
            <div className="text-slate-400">No qualification data.</div>
          )}
        </div>
      </SectionCard>

      {/* Promote action */}
      {!result.promoted_analysis_id && (
        <div className="dw-card-tight">
          <form action={promoteAndOpenAction}>
            <input type="hidden" name="result_id" value={result.id} />
            <input type="hidden" name="interest_level" value="warm" />
            <button type="submit" className="dw-button-primary">
              Promote to Full Analysis →
            </button>
          </form>
        </div>
      )}
      {result.promoted_analysis_id && (
        <div className="dw-card-tight">
          <p className="text-sm text-slate-500">
            Promoted to{" "}
            <Link
              href={`/analysis/${result.promoted_analysis_id}`}
              className="text-blue-600 hover:underline"
            >
              analysis →
            </Link>
          </p>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Trend helpers
// ---------------------------------------------------------------------------

type TrendSegmentJson = { rate: number | null; compCount: number };
type TrendTierStatsJson = {
  compCount: number; radiusMiles: number;
  salePriceLow: number | null; salePriceHigh: number | null;
  psfBuildingLow: number | null; psfBuildingHigh: number | null;
  psfAboveGradeLow: number | null; psfAboveGradeHigh: number | null;
  lowEnd?: TrendSegmentJson; highEnd?: TrendSegmentJson;
};

function fmtRate(rate: number | null | undefined): string {
  if (rate == null) return "—";
  const pct = (rate * 100).toFixed(1);
  return rate >= 0 ? `+${pct}%` : `${pct}%`;
}

function TrendTierSection({ label, radius, rate, stats }: {
  label: string; radius: number; rate: number | null | undefined; stats: TrendTierStatsJson | null;
}) {
  const cc = stats?.compCount ?? 0;
  return (
    <div className="space-y-1.5">
      <h4 className="text-xs font-semibold text-slate-700">{label} <span className="font-normal text-slate-400">({cc} comps within {radius} mi)</span></h4>
      <div className="dw-detail-grid">
        <DetailItem label="Rate" value={`${fmtRate(rate)}/yr`} />
        {stats?.lowEnd && stats.lowEnd.compCount > 0 && (
          <DetailItem label={`Low-End 25th (${stats.lowEnd.compCount} comps)`} value={`${fmtRate(stats.lowEnd.rate)}/yr`} />
        )}
        {stats?.highEnd && stats.highEnd.compCount > 0 && (
          <DetailItem label={`High-End 75th (${stats.highEnd.compCount} comps)`} value={`${fmtRate(stats.highEnd.rate)}/yr`} />
        )}
        {stats && stats.salePriceLow != null && stats.salePriceHigh != null && (
          <DetailItem label="Sale Price Range" value={`${formatCurrency(stats.salePriceLow)} – ${formatCurrency(stats.salePriceHigh)}`} />
        )}
        {stats && stats.psfBuildingLow != null && stats.psfBuildingHigh != null && (
          <DetailItem label="PSF Building" value={`$${formatNumber(stats.psfBuildingLow, 2)} – $${formatNumber(stats.psfBuildingHigh, 2)}`} />
        )}
        {stats && stats.psfAboveGradeLow != null && stats.psfAboveGradeHigh != null && (
          <DetailItem label="PSF Above Grade" value={`$${formatNumber(stats.psfAboveGradeLow, 2)} – $${formatNumber(stats.psfAboveGradeHigh, 2)}`} />
        )}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm">
      <div className="text-[10px] uppercase tracking-[0.14em] text-slate-500">
        {label}
      </div>
      <div
        className={`mt-1 text-lg font-semibold ${highlight ? "text-emerald-700" : "text-slate-900"}`}
      >
        {value}
      </div>
    </div>
  );
}

function DealLine({
  label,
  value,
  negative,
  bold,
}: {
  label: string;
  value: string;
  negative?: boolean;
  bold?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span
        className={`${negative ? "text-slate-500" : ""} ${bold ? "font-semibold" : ""}`}
      >
        {label}
      </span>
      <span
        className={`font-mono ${negative ? "text-red-600" : ""} ${bold ? "font-bold text-emerald-700" : ""}`}
      >
        {value}
      </span>
    </div>
  );
}

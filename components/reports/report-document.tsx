import Image from "next/image";
import type { ReportContentJson } from "@/lib/reports/types";
import { fmt, fmtNum, fmtPct } from "@/lib/reports/format";

type Props = {
  report: ReportContentJson;
  title: string;
  /** Slot for a client-rendered map component (e.g. CompMap) */
  mapSlot?: React.ReactNode;
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="report-section-title mb-2 border-b border-slate-300 pb-1 text-sm font-bold uppercase tracking-[0.1em] text-slate-700">
      {children}
    </h2>
  );
}

function Row({ label, value, bold, negative }: { label: string; value: string; bold?: boolean; negative?: boolean }) {
  return (
    <div className={`flex justify-between py-[2px] text-xs ${bold ? "font-semibold" : ""}`}>
      <span className="text-slate-600">{label}</span>
      <span className={`font-mono ${negative ? "text-red-600" : "text-slate-800"}`}>{value}</span>
    </div>
  );
}

function DetailPair({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div className="text-xs">
      <span className="text-slate-500">{label}:</span>{" "}
      <span className="font-medium text-slate-800">{value ?? "\u2014"}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main document
// ---------------------------------------------------------------------------

export function ReportDocument({ report, title, mapSlot }: Props) {
  const r = report;
  const p = r.physical;
  const dm = r.dealMath;

  const strategyLabel =
    r.analysis.strategyType === "flip" ? "Fix & Flip" :
    r.analysis.strategyType === "rental" ? "Rental" :
    r.analysis.strategyType === "wholesale" ? "Wholesale" :
    r.analysis.strategyType ?? "Analysis";

  const generatedDate = new Date(r.generatedAt).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="report-document mx-auto max-w-[800px] bg-white text-slate-900">
      {/* ---- Header ---- */}
      <div className="report-section mb-6 flex items-start justify-between border-b-2 border-emerald-700 pb-4">
        <div>
          <Image
            src="/logos/datawise-logo.png"
            alt="DataWiseRE"
            width={160}
            height={100}
            className="mb-2"
            priority
          />
        </div>
        <div className="text-right">
          <h1 className="text-lg font-bold text-slate-900">Property Analysis Report</h1>
          <p className="text-xs text-slate-500">{strategyLabel} Strategy</p>
          <p className="text-xs text-slate-400">{generatedDate}</p>
        </div>
      </div>

      {/* ---- Subject Property ---- */}
      <div className="report-section mb-5">
        <SectionTitle>Subject Property</SectionTitle>
        <div className="mb-2">
          <p className="text-base font-semibold">{r.property.address}</p>
          <p className="text-xs text-slate-500">
            {r.property.city}, {r.property.state} {r.property.postalCode}
            {r.property.county ? ` \u00B7 ${r.property.county} County` : ""}
          </p>
        </div>
        {p && (
          <div className="grid grid-cols-4 gap-x-4 gap-y-1 rounded border border-slate-200 bg-slate-50 p-3">
            <DetailPair label="Type" value={p.propertyType} />
            <DetailPair label="Sqft" value={p.buildingSqft ? fmtNum(p.buildingSqft) : null} />
            <DetailPair label="Beds" value={p.bedroomsTotal} />
            <DetailPair label="Baths" value={p.bathroomsTotal} />
            <DetailPair label="Year Built" value={p.yearBuilt} />
            <DetailPair label="Garage" value={p.garageSpaces} />
            <DetailPair label="Lot (sqft)" value={p.lotSizeSqft ? fmtNum(p.lotSizeSqft) : null} />
            <DetailPair label="List Price" value={r.listing ? fmt(r.listing.listPrice) : null} />
          </div>
        )}
      </div>

      {/* ---- Deal Math Waterfall ---- */}
      {dm && (
        <div className="report-section mb-5">
          <SectionTitle>Deal Math</SectionTitle>

          {/* Summary cards */}
          <div className="mb-3 grid grid-cols-4 gap-2">
            {[
              { label: "ARV", value: fmt(dm.arv) },
              { label: "Max Offer", value: fmt(dm.maxOffer) },
              { label: "Gap/SqFt", value: `$${fmtNum(dm.estGapPerSqft)}` },
              { label: "Neg Gap", value: dm.negotiationGap != null ? fmt(dm.negotiationGap) : "—" },
            ].map((card) => (
              <div key={card.label} className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-center">
                <div className="text-[10px] uppercase tracking-wider text-slate-500">{card.label}</div>
                <div className="text-sm font-bold text-slate-800">{card.value}</div>
              </div>
            ))}
          </div>

          {/* Waterfall */}
          <div className="rounded border border-slate-200 p-3">
            <Row label="After Repair Value (ARV)" value={fmt(dm.arv)} bold />
            <div className="my-1 border-t border-slate-100" />
            <Row label="Rehab Budget" value={`(${fmt(dm.rehabTotal)})`} negative />
            <Row label="Holding Costs" value={`(${fmt(dm.holdTotal)})`} negative />
            <Row label="Transaction Costs" value={`(${fmt(dm.transactionTotal)})`} negative />
            {dm.financingTotal > 0 && (
              <Row label="Financing Costs" value={`(${fmt(dm.financingTotal)})`} negative />
            )}
            <Row label="Target Profit" value={`(${fmt(dm.targetProfit)})`} negative />
            <div className="my-1 border-t border-slate-300" />
            <Row label="Maximum Offer" value={fmt(dm.maxOffer)} bold />
            <Row label="Offer as % of List" value={fmtPct(dm.offerPct)} />
            <Row label="Spread (ARV − Max Offer)" value={fmt(dm.spread)} />
            <Row
              label="Negotiation Gap (Max Offer − List)"
              value={dm.negotiationGap != null ? fmt(dm.negotiationGap) : "—"}
            />
            {r.trend && (
              <>
                <div className="my-1 border-t border-slate-100" />
                <Row
                  label={
                    r.trend.positiveRateCapApplied
                      ? "Market Trend (applied, capped)"
                      : "Market Trend (applied)"
                  }
                  value={`${r.trend.blendedAnnualRate >= 0 ? "+" : ""}${(r.trend.blendedAnnualRate * 100).toFixed(1)}%/yr`}
                />
                {r.trend.positiveRateCapApplied && (
                  <Row
                    label="Market Rate (pre-cap)"
                    value={`${r.trend.rawBlendedRate >= 0 ? "+" : ""}${(r.trend.rawBlendedRate * 100).toFixed(1)}%/yr`}
                  />
                )}
              </>
            )}
          </div>

          {r.cashRequired && (
            <div className="mt-2 rounded border border-slate-200 bg-amber-50 p-3">
              <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-amber-700">Cash Required</div>
              <Row label="Down Payment" value={fmt(r.cashRequired.downPayment)} />
              <Row label="Rehab (Out of Pocket)" value={fmt(r.cashRequired.rehabOutOfPocket)} />
              <div className="mt-1 border-t border-amber-200" />
              <Row label="Total Cash Required" value={fmt(r.cashRequired.totalCashRequired)} bold />
            </div>
          )}
        </div>
      )}

      {/* ---- Rehab Summary ---- */}
      {r.rehab.detail && (
        <div className="report-section mb-5">
          <SectionTitle>Rehab Budget</SectionTitle>
          <div className="rounded border border-slate-200 p-3">
            <div className="mb-2 flex items-center gap-3 text-xs">
              <span className="text-slate-500">
                Scope: <span className="font-medium text-slate-800 capitalize">{r.rehab.scope ?? "moderate"}</span>
                <span className="text-slate-400"> ({r.rehab.scopeMultiplier}x)</span>
              </span>
              <span className="text-slate-500">
                Total: <span className="font-bold text-slate-800">{fmt(r.rehab.effective)}</span>
              </span>
              {p && p.buildingSqft > 0 && (
                <span className="text-slate-500">
                  Per SqFt: <span className="font-medium text-slate-800">${fmtNum(r.rehab.detail.perSqftBuilding, 2)}</span>
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-x-6">
              <Row label="Above Grade" value={fmt(r.rehab.detail.aboveGrade)} />
              {r.rehab.detail.belowGradeTotal > 0 && (
                <Row label="Below Grade" value={fmt(r.rehab.detail.belowGradeTotal)} />
              )}
              <Row label="Exterior" value={fmt(r.rehab.detail.exterior)} />
              <Row label="Landscaping" value={fmt(r.rehab.detail.landscaping)} />
              <Row label="Systems" value={fmt(r.rehab.detail.systems)} />
              <Row label="Interior" value={fmt(r.rehab.detail.interior)} />
            </div>
          </div>
        </div>
      )}

      {/* ---- Holding & Transaction ---- */}
      {(r.holding || r.transaction) && (
        <div className="report-section mb-5">
          <SectionTitle>Holding & Transaction Costs</SectionTitle>
          <div className="grid grid-cols-2 gap-3">
            {r.holding && (
              <div className="rounded border border-slate-200 p-3">
                <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">Holding ({r.holding.daysHeld} days)</div>
                <Row label="Property Tax" value={fmt(r.holding.holdTax)} />
                <Row label="Insurance" value={fmt(r.holding.holdInsurance)} />
                <Row label="HOA" value={fmt(r.holding.holdHoa)} />
                <Row label="Utilities" value={fmt(r.holding.holdUtilities)} />
                <div className="mt-1 border-t border-slate-200" />
                <Row label="Total Holding" value={fmt(r.holding.total)} bold />
              </div>
            )}
            {r.transaction && (
              <div className="rounded border border-slate-200 p-3">
                <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">Transaction</div>
                <Row label="Acquisition Title" value={fmt(r.transaction.acquisitionTitle)} />
                <Row label="Disposition Title" value={fmt(r.transaction.dispositionTitle)} />
                <Row label="Commission — Buyer" value={fmt(r.transaction.dispositionCommissionBuyer)} />
                <Row label="Commission — Seller" value={fmt(r.transaction.dispositionCommissionSeller)} />
                <div className="mt-1 border-t border-slate-200" />
                <Row label="Total Transaction" value={fmt(r.transaction.total)} bold />
              </div>
            )}
          </div>
        </div>
      )}

      {/* ---- Comparable Sales ---- */}
      {r.selectedComps.length > 0 && (
        <div className="report-section mb-5">
          <SectionTitle>Comparable Sales ({r.compSummary.selectedCount} Selected)</SectionTitle>

          {/* Summary stats */}
          <div className="mb-2 flex gap-4 text-xs text-slate-500">
            {r.compSummary.avgSelectedPrice != null && (
              <span>Avg Price: <span className="font-medium text-slate-800">{fmt(r.compSummary.avgSelectedPrice)}</span></span>
            )}
            {r.compSummary.avgSelectedPsf != null && (
              <span>Avg $/SqFt: <span className="font-medium text-slate-800">${fmtNum(r.compSummary.avgSelectedPsf)}</span></span>
            )}
            {r.compSummary.avgSelectedDist != null && (
              <span>Avg Distance: <span className="font-medium text-slate-800">{fmtNum(r.compSummary.avgSelectedDist, 2)} mi</span></span>
            )}
          </div>

          {/* Comps table */}
          <div className="overflow-x-auto rounded border border-slate-200">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-[10px] uppercase tracking-wider text-slate-500">
                  <th className="w-6 px-1.5 py-1.5 text-center">#</th>
                  <th className="px-2 py-1.5">Address</th>
                  <th className="px-2 py-1.5 text-right">Close Price</th>
                  <th className="px-2 py-1.5 text-right">$/SqFt</th>
                  <th className="px-2 py-1.5 text-right">SqFt</th>
                  <th className="px-2 py-1.5 text-right">Distance</th>
                  <th className="px-2 py-1.5 text-right">Close Date</th>
                </tr>
              </thead>
              <tbody>
                {r.selectedComps.map((comp, i) => (
                  <tr key={i} className="border-b border-slate-100 last:border-0">
                    <td className="px-1.5 py-1.5 text-center">
                      <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-emerald-600 text-[8px] font-bold text-white">
                        {i + 1}
                      </span>
                    </td>
                    <td className="px-2 py-1.5 text-slate-800">{comp.address}</td>
                    <td className="px-2 py-1.5 text-right font-mono">{fmt(comp.netSalePrice)}</td>
                    <td className="px-2 py-1.5 text-right font-mono">{comp.ppsf != null ? `$${fmtNum(comp.ppsf)}` : "\u2014"}</td>
                    <td className="px-2 py-1.5 text-right font-mono">{comp.sqft != null ? fmtNum(comp.sqft) : "\u2014"}</td>
                    <td className="px-2 py-1.5 text-right font-mono">{comp.distance != null ? `${fmtNum(comp.distance, 2)} mi` : "\u2014"}</td>
                    <td className="px-2 py-1.5 text-right text-slate-500">{comp.closeDate ?? "\u2014"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Map */}
          {mapSlot && (
            <div className="report-section mt-3 rounded border border-slate-200 overflow-hidden">
              {mapSlot}
            </div>
          )}

          {/* ARV per-comp detail if available */}
          {r.arv.selectedDetail && r.arv.selectedDetail.perCompDetails.length > 0 && (
            <div className="mt-2 rounded border border-slate-200 bg-slate-50 p-3">
              <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                ARV: {fmt(r.arv.selectedDetail.arvAggregate)} ({r.arv.selectedDetail.compCount} comps, ${fmtNum(r.arv.selectedDetail.arvPerSqft)}/sqft)
              </div>
            </div>
          )}
        </div>
      )}

      {/* ---- Notes ---- */}
      {r.notes.length > 0 && (
        <div className="report-section mb-5">
          <SectionTitle>Analysis Notes</SectionTitle>
          <div className="space-y-2">
            {r.notes.map((note, i) => (
              <div key={i} className="rounded border border-slate-200 p-2">
                <span className="mr-2 inline-block rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-slate-500">
                  {note.noteType}
                </span>
                <span className="text-xs text-slate-700">{note.noteBody}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ---- Footer ---- */}
      <div className="report-section mt-8 border-t border-slate-300 pt-3 text-center text-[10px] text-slate-400">
        <p>Generated by DataWiseRE.com &middot; {generatedDate}</p>
        <p className="mt-0.5">This report is a snapshot of analysis data at the time of generation.</p>
      </div>
    </div>
  );
}

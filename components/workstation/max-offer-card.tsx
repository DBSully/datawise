// Max Offer Card — the result row at the bottom of the partner-facing
// deal spreadsheet at /portal/deals/[shareToken].
//
// Two variants:
//
//   - analyst:  static headline (the analyst's computed Max Offer) +
//               offer % + $/sqft gap context. No delta.
//   - partner:  live-recomputed headline from the partner's overrides
//               + a colored delta badge ("+$12K" / "-$8K") vs. the
//               analyst's number + sub-metrics (offer %, neg gap).
//
// This card is intentionally LOUDER than the cards above it so the
// partner feels the payoff of entering values — bigger font, thicker
// border, emerald/red accent driven by whether their adjustments push
// the offer above or below the analyst's.

"use client";

import { fmt, fmtNum } from "@/lib/reports/format";

type MaxOfferCardProps =
  | {
      variant: "analyst";
      maxOffer: number | null;
      offerPct: number | null;
      gapOfferPerSqft: number | null;
      negotiationGap: number | null;
    }
  | {
      variant: "partner";
      maxOffer: number | null;
      offerPct: number | null;
      gapOfferPerSqft: number | null;
      negotiationGap: number | null;
      /** Analyst's max offer — drives the delta badge. */
      analystMaxOffer: number | null;
      /** Whether the partner has any override saved — if false, the
       *  card shows "matches analyst" rather than a delta. */
      hasAnyOverride: boolean;
    };

export function MaxOfferCard(props: MaxOfferCardProps) {
  const { variant, maxOffer, offerPct, gapOfferPerSqft, negotiationGap } =
    props;

  const isPartner = variant === "partner";
  const delta =
    isPartner && props.maxOffer != null && props.analystMaxOffer != null
      ? props.maxOffer - props.analystMaxOffer
      : null;
  const deltaDirection =
    delta == null ? null : delta > 0 ? "up" : delta < 0 ? "down" : "flat";

  const borderClass = isPartner
    ? "border-indigo-400 bg-gradient-to-br from-indigo-50 to-white"
    : "border-slate-300 bg-slate-50";

  return (
    <div
      className={`rounded-lg border-2 px-3 py-2.5 shadow-sm ${borderClass}`}
    >
      {/* Title row */}
      <div className="flex items-center justify-between gap-2">
        <span
          className={`text-[9px] font-bold uppercase tracking-[0.12em] ${
            isPartner ? "text-indigo-700" : "text-slate-600"
          }`}
        >
          {isPartner ? "Your Max Offer" : "Max Offer"}
        </span>
        {isPartner && delta != null && props.hasAnyOverride && (
          <DeltaBadge delta={delta} direction={deltaDirection!} />
        )}
      </div>

      {/* Headline — right-aligned accounting style */}
      <div
        className={`mt-1 text-right font-mono text-[20px] font-bold leading-tight ${
          isPartner ? "text-indigo-900" : "text-slate-800"
        }`}
      >
        {fmt(maxOffer)}
      </div>

      {/* Sub-metrics: offer %, $/sqft gap, neg gap */}
      <div className="mt-1.5 grid grid-cols-3 gap-2 text-[9px] leading-tight">
        <Metric
          label="Offer %"
          value={
            offerPct != null ? `${(offerPct * 100).toFixed(1)}%` : "—"
          }
        />
        <Metric
          label="$/sf Gap"
          value={
            gapOfferPerSqft != null ? `$${fmtNum(gapOfferPerSqft)}` : "—"
          }
        />
        <Metric
          label="vs. List"
          value={negotiationGap != null ? fmt(negotiationGap) : "—"}
        />
      </div>

      {/* "Matches analyst" hint for the partner card when no override set */}
      {isPartner && !props.hasAnyOverride && (
        <p className="mt-1.5 text-[9px] italic text-slate-400">
          Enter any value above to make this your deal.
        </p>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-center text-center">
      <span className="text-[8px] font-semibold uppercase tracking-wider text-slate-400">
        {label}
      </span>
      <span className="font-mono text-[11px] font-semibold text-slate-700">
        {value}
      </span>
    </div>
  );
}

function DeltaBadge({
  delta,
  direction,
}: {
  delta: number;
  direction: "up" | "down" | "flat";
}) {
  const sign = delta > 0 ? "+" : delta < 0 ? "−" : "";
  const abs = Math.abs(delta);
  const formatted =
    abs >= 1000 ? `${sign}$${fmtNum(Math.round(abs / 1000))}K` : `${sign}${fmt(abs)}`;
  const colorClass =
    direction === "up"
      ? "bg-emerald-100 text-emerald-700"
      : direction === "down"
        ? "bg-red-100 text-red-700"
        : "bg-slate-100 text-slate-600";
  const arrow = direction === "up" ? "▲" : direction === "down" ? "▼" : "";
  return (
    <span
      className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${colorClass}`}
      title="Difference vs. analyst's Max Offer"
    >
      {arrow} {formatted}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Deal Math — max offer, spread, gap, and negotiation gap calculations
//
// Gap metrics:
//   gapListPerSqft  = (ARV - listPrice) / buildingSqft   "How much room at list?"
//   gapOfferPerSqft = (ARV - maxOffer) / buildingSqft    "How much margin at offer?"
//
// gapListPerSqft is null when no list price (off-market).
// gapOfferPerSqft is always computable when ARV > 0 and sqft > 0.
//
// Other metrics:
//   spread          = ARV - listPrice                     (opportunity signal)
//   negotiationGap  = maxOffer - listPrice                (negotiation room)
// ---------------------------------------------------------------------------

import type { DealMathResult } from "./types";

type CalculateDealMathInput = {
  arv: number;
  listPrice: number | null;
  buildingSqft: number;
  rehabTotal: number;
  holdTotal: number;
  transactionTotal: number;
  financingTotal: number;
  targetProfit: number;
};

export function calculateDealMath(input: CalculateDealMathInput): DealMathResult {
  const {
    arv,
    listPrice,
    buildingSqft,
    rehabTotal,
    holdTotal,
    transactionTotal,
    financingTotal,
    targetProfit,
  } = input;

  const totalCosts = rehabTotal + holdTotal + transactionTotal + financingTotal;
  const maxOffer = Math.round(arv - totalCosts - targetProfit);

  // All spread-based metrics require a list price
  const hasListPrice = listPrice !== null && listPrice > 0;
  const spread = hasListPrice ? Math.round(arv - listPrice) : null;
  const offerPct = hasListPrice ? roundTo(maxOffer / listPrice, 4) : null;
  const gapListPerSqft =
    hasListPrice && buildingSqft > 0
      ? Math.round((arv - listPrice) / buildingSqft)
      : null;
  const gapOfferPerSqft =
    buildingSqft > 0
      ? Math.round((arv - maxOffer) / buildingSqft)
      : null;
  const negotiationGap = hasListPrice ? Math.round(maxOffer - listPrice) : null;

  return {
    arv,
    listPrice,
    rehabTotal,
    holdTotal,
    transactionTotal,
    financingTotal,
    targetProfit,
    totalCosts,
    maxOffer,
    offerPct,
    spread,
    gapListPerSqft,
    gapOfferPerSqft,
    estGapPerSqft: gapListPerSqft,
    negotiationGap,
  };
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

// ---------------------------------------------------------------------------
// Deal Math — max offer, spread, and gap calculations
//
// When list price is null (off-market), maxOffer is still computed from
// ARV minus costs. Spread, offerPct, and estGapPerSqft are null.
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

  // Spread-based metrics require a list price
  const hasListPrice = listPrice !== null && listPrice > 0;
  const spread = hasListPrice ? Math.round(arv - listPrice) : null;
  const offerPct = hasListPrice ? roundTo(maxOffer / listPrice, 4) : null;
  const estGapPerSqft =
    hasListPrice && buildingSqft > 0
      ? Math.round((arv - listPrice) / buildingSqft)
      : null;

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
    estGapPerSqft,
  };
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

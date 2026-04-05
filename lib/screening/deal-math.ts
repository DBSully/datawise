// ---------------------------------------------------------------------------
// Deal Math — max offer, spread, and gap calculations
// ---------------------------------------------------------------------------

import type { DealMathResult } from "./types";

type CalculateDealMathInput = {
  arv: number;
  listPrice: number;
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
  const spread = Math.round(arv - listPrice);
  const offerPct = listPrice > 0 ? roundTo(maxOffer / listPrice, 4) : 0;
  const estGapPerSqft =
    buildingSqft > 0 ? Math.round(spread / buildingSqft) : 0;

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

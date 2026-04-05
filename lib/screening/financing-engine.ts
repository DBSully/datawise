// ---------------------------------------------------------------------------
// Financing Cost Engine
//
// Calculates hard money loan costs for fix-and-flip deals.
// Loan amount is based on ARV × LTV, which breaks the circular dependency
// between financing costs and offer price — ARV is already computed upstream.
// All assumptions come from the strategy profile (overridable by analyst).
// ---------------------------------------------------------------------------

import type { FinancingConfig } from "./strategy-profiles";
import type { FinancingResult } from "./types";

type CalculateFinancingInput = {
  /** After-repair value — loan basis. */
  arv: number;
  /** Days the loan will be held (from holding engine or manual override). */
  daysHeld: number;
  /** Strategy profile financing defaults. */
  config: FinancingConfig;
  /** Optional analyst overrides (null = use profile default). */
  overrides?: {
    annualRate?: number | null;
    pointsRate?: number | null;
    ltvPct?: number | null;
  };
};

export function calculateFinancing(
  input: CalculateFinancingInput,
): FinancingResult {
  const { arv, daysHeld, config, overrides } = input;

  // Resolve effective parameters (override ?? profile default)
  const annualRate = overrides?.annualRate ?? config.annualRate;
  const pointsRate = overrides?.pointsRate ?? config.originationPointsRate;
  const ltvPct = overrides?.ltvPct ?? config.ltvPct;

  // Loan amount = ARV × LTV
  const loanAmount = Math.round(arv * ltvPct);

  // Interest = loan × annual rate × (days / 365)
  const interestCost = Math.round(loanAmount * annualRate * (daysHeld / 365));

  // Origination points = loan × points rate (paid at closing, one-time)
  const originationCost = Math.round(loanAmount * pointsRate);

  // Total financing cost
  const total = interestCost + originationCost;

  // Monthly payment (interest-only, for reference)
  const monthlyPayment = roundTo(loanAmount * annualRate / 12, 2);

  // Daily interest (for reference)
  const dailyInterest = roundTo(loanAmount * annualRate / 365, 2);

  return {
    loanAmount,
    ltvPct,
    annualRate,
    pointsRate,
    daysHeld,
    interestCost,
    originationCost,
    monthlyPayment,
    dailyInterest,
    total,
  };
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

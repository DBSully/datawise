// ---------------------------------------------------------------------------
// Holding Cost Engine
//
// Calculates estimated holding period and daily carrying costs.
// All assumptions come from the strategy profile.
// ---------------------------------------------------------------------------

import type { HoldingConfig } from "./strategy-profiles";
import type { HoldingResult } from "./types";

type CalculateHoldingInput = {
  buildingSqft: number;
  /** List price or price anchor (ARV) when off-market. */
  priceAnchor: number;
  annualTax: number | null;
  annualHoa: number | null;
  config: HoldingConfig;
};

export function calculateHolding(input: CalculateHoldingInput): HoldingResult {
  const { buildingSqft, priceAnchor, annualTax, annualHoa, config } = input;

  // Days held: base + sqft adjustment, floored at minimum
  const rawDays =
    config.baseDays +
    (buildingSqft - config.sqftBaseline) * config.sqftAdjustmentRate;
  const daysHeld = Math.max(config.minimumDays, Math.round(rawDays));

  // Daily costs
  const dailyTax = (annualTax ?? 0) / 365;
  const dailyInsurance = (priceAnchor * config.insuranceAnnualRate) / 365;
  const dailyHoa = (annualHoa ?? 0) / 365;
  const dailyUtilities = (buildingSqft * config.utilityPerSqftMonthly) / 30;
  const dailyTotal = dailyTax + dailyInsurance + dailyHoa + dailyUtilities;

  // Totals
  const holdTax = round(dailyTax * daysHeld);
  const holdInsurance = round(dailyInsurance * daysHeld);
  const holdHoa = round(dailyHoa * daysHeld);
  const holdUtilities = round(dailyUtilities * daysHeld);
  const total = holdTax + holdInsurance + holdHoa + holdUtilities;

  return {
    daysHeld,
    dailyTax: roundTo(dailyTax, 2),
    dailyInsurance: roundTo(dailyInsurance, 2),
    dailyHoa: roundTo(dailyHoa, 2),
    dailyUtilities: roundTo(dailyUtilities, 2),
    dailyTotal: roundTo(dailyTotal, 2),
    holdTax,
    holdInsurance,
    holdHoa,
    holdUtilities,
    total,
  };
}

function round(value: number): number {
  return Math.round(value);
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

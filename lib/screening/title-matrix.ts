// ---------------------------------------------------------------------------
// FITCO Chicago Title rate matrix — Colorado Residential Resale (CT Zone 1)
//
// Source: FITCO-Resale-Rate-Sheet_CT_Zone-1_Updated-01.02.26.pdf
// Applicable counties: Adams, Arapahoe, Broomfield, Clear Creek, Denver,
//   Douglas, Elbert, Gilpin, Jefferson.
//
// Two rate tables plus extrapolation rules above the published ceiling:
//
//   1. Owner's Title Premium (Basic Rate) — keyed by ARV / policy amount,
//      $50k tiers from $100k to $1M. Extends above $1M at +$100 per $50k
//      tier (matches the published slope from $550k to $1M).
//
//   2. Bundled Concurrent Loan Rate — keyed by loan amount, $50k tiers
//      from $50k to $1M. Flat $900 for loans above $1M (analyst decision
//      2026-04-22: rare outlier, one flat number is enough).
//
// Lookup convention: round UP to the next $50k tier (industry standard
// for title rate sheets). A $423k loan uses the $450k rate; a $1.04M
// ARV uses the $1.05M rate.
// ---------------------------------------------------------------------------

const TIER_STEP = 50_000;

/** Published Owner's Title Premium Basic Rates by policy amount tier. */
const OWNER_TITLE_PREMIUM_BY_TIER: Readonly<Record<number, number>> = {
  100_000: 1_258,
  150_000: 1_351,
  200_000: 1_443,
  250_000: 1_536,
  300_000: 1_628,
  350_000: 1_721,
  400_000: 1_813,
  450_000: 1_906,
  500_000: 1_998,
  550_000: 2_093,
  600_000: 2_193,
  650_000: 2_293,
  700_000: 2_393,
  750_000: 2_493,
  800_000: 2_593,
  850_000: 2_693,
  900_000: 2_793,
  950_000: 2_893,
  1_000_000: 2_993,
};

/** Published Bundled Concurrent Loan Rates by loan amount tier. */
const BUNDLED_LOAN_RATE_BY_TIER: Readonly<Record<number, number>> = {
  50_000: 400,
  100_000: 400,
  150_000: 475,
  200_000: 475,
  250_000: 475,
  300_000: 475,
  350_000: 575,
  400_000: 575,
  450_000: 575,
  500_000: 575,
  550_000: 625,
  600_000: 625,
  650_000: 625,
  700_000: 625,
  750_000: 625,
  800_000: 625,
  850_000: 625,
  900_000: 625,
  950_000: 625,
  1_000_000: 625,
};

// ---------------------------------------------------------------------------
// Extrapolation rules above $1M
// ---------------------------------------------------------------------------

const OWNER_PREMIUM_AT_1M = 2_993;
const OWNER_PREMIUM_ABOVE_1M_STEP = 100; // +$100 per $50k tier above $1M
const BUNDLED_LOAN_ABOVE_1M_FLAT = 900;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Round an amount UP to the next $50k tier. Amounts at $0 or below are
 *  clamped to the lowest tier — callers should skip the lookup entirely
 *  when ARV or loan amount is non-positive. */
function roundUpToTier(amount: number): number {
  if (amount <= 0) return TIER_STEP;
  return Math.ceil(amount / TIER_STEP) * TIER_STEP;
}

/** Look up the Owner's Title Premium Basic Rate for a policy amount (ARV).
 *  Rounds up to the next $50k tier. Above $1M extends at +$100 per $50k. */
export function lookupOwnerTitlePremium(policyAmount: number): number {
  const tier = Math.max(100_000, roundUpToTier(policyAmount));
  if (tier <= 1_000_000) {
    return OWNER_TITLE_PREMIUM_BY_TIER[tier] ?? OWNER_PREMIUM_AT_1M;
  }
  const tiersAbove = (tier - 1_000_000) / TIER_STEP;
  return OWNER_PREMIUM_AT_1M + OWNER_PREMIUM_ABOVE_1M_STEP * tiersAbove;
}

/** Look up the Bundled Concurrent Loan Rate for a loan amount. Rounds up
 *  to the next $50k tier. Above $1M flat $900. */
export function lookupBundledLoanRate(loanAmount: number): number {
  const tier = Math.max(50_000, roundUpToTier(loanAmount));
  if (tier <= 1_000_000) {
    return BUNDLED_LOAN_RATE_BY_TIER[tier] ?? 625;
  }
  return BUNDLED_LOAN_ABOVE_1M_FLAT;
}

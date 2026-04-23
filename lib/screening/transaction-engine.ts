// ---------------------------------------------------------------------------
// Transaction Cost Engine
//
// Computes acquisition + disposition title/closing costs and commissions
// using the FITCO/Chicago Title rate sheet (Colorado CT Zone 1 counties).
// Matrix lookups live in title-matrix.ts — this module just assembles
// the line items according to the strategy profile.
//
//   Acquisition side (paid OOP at closing):
//     - Bundled Concurrent Loan Rate    (matrix lookup by loan amount)
//     - Bundled Resale Closing Fee      (buyer's share, default $180)
//     - Loan Disbursement Fee           (default $150)
//     - Estimated Recording Costs       (default $43)
//     - Closing Protection Letter Fee   (default $25)
//     - E-recording fee                 (default $5.25)
//     - (Optional) Acquisition commission and flat fee
//
//   Disposition side (deducted from sale proceeds):
//     - Owner's Title Premium (seller's share of Basic Rate — 65% × matrix
//       lookup by ARV). Above $1M, Basic Rate extends at +$100 per $50k tier.
//     - Bundled Resale Closing Fee      (seller's share, default $180)
//     - Owner's Extended Coverage       (default $95)
//     - Tax Certificate                 (default $25)
//     - Commissions (buyer-agent + seller-agent as % of sale)
// ---------------------------------------------------------------------------

import type { TransactionConfig } from "./strategy-profiles";
import { lookupBundledLoanRate, lookupOwnerTitlePremium } from "./title-matrix";
import type { TransactionResult } from "./types";

type CalculateTransactionInput = {
  /** Acquisition price basis (list price during screening, max offer
   *  in analysis). Drives the signed acquisition commission. */
  acquisitionPrice: number;
  /** Expected sale price (ARV). Drives the Owner's Title Premium
   *  matrix lookup and the disposition commissions. */
  arvPrice: number;
  /** Loan amount from the financing engine (ARV × LTV). Drives the
   *  Bundled Concurrent Loan Rate matrix lookup. Per analyst decision
   *  2026-04-22: use ARV-based loan even though it tends higher than
   *  the actual closing loan — default to the higher quote. */
  loanAmount: number;
  config: TransactionConfig;
  /** Optional per-analysis overrides (null = use profile default).
   *  Mirrors calculateFinancing's override pattern. Screening runs
   *  pass nothing; the analyst workstation passes manual_analysis
   *  values so the Transaction Costs modal's Buyer / Seller commission
   *  sliders can override the 2% defaults. */
  overrides?: {
    dispositionCommissionBuyerRate?: number | null;
    dispositionCommissionSellerRate?: number | null;
  };
};

export function calculateTransaction(
  input: CalculateTransactionInput,
): TransactionResult {
  const { acquisitionPrice, arvPrice, loanAmount, config, overrides } = input;

  // Resolve effective commission rates — per-analysis override wins
  // over the strategy-profile default. Nullish fallback preserves 0%
  // as a legitimate override value (would be zeroed by `||`).
  const effectiveBuyerCommissionRate =
    overrides?.dispositionCommissionBuyerRate ??
    config.dispositionCommissionBuyerRate;
  const effectiveSellerCommissionRate =
    overrides?.dispositionCommissionSellerRate ??
    config.dispositionCommissionSellerRate;

  // ─── Acquisition side ───
  const acqBundledLoanRate = lookupBundledLoanRate(loanAmount);
  const acqBundledClosingFee = round(config.acquisitionBundledClosingFee);
  const acqLoanDisbursementFee = round(config.acquisitionLoanDisbursementFee);
  const acqRecordingCosts = round(config.acquisitionRecordingCosts);
  const acqCpl = round(config.acquisitionClosingProtectionLetter);
  // E-recording is the one fee that carries cents ($5.25) — preserve
  // precision here and let the total-level Math.round reconcile it.
  const acqErecording = config.acquisitionERecordingFee;

  const acquisitionTitle = Math.round(
    acqBundledLoanRate +
      acqBundledClosingFee +
      acqLoanDisbursementFee +
      acqRecordingCosts +
      acqCpl +
      acqErecording,
  );

  // Note: signed. Negative values represent a credit at closing.
  const acquisitionCommission = Math.round(
    acquisitionPrice * config.acquisitionCommissionRate,
  );
  const acquisitionFee = Math.round(config.acquisitionFeeFlat);
  const acquisitionSubtotal =
    acquisitionTitle + acquisitionCommission + acquisitionFee;

  // ─── Disposition side ───
  const dispOwnerTitlePremiumBasic = lookupOwnerTitlePremium(arvPrice);
  const dispOwnerTitlePremium = Math.round(
    dispOwnerTitlePremiumBasic * config.dispositionOwnerTitlePremiumShare,
  );
  const dispBundledClosingFee = round(config.dispositionBundledClosingFee);
  const dispOwnerExtendedCoverage = round(config.dispositionOwnerExtendedCoverage);
  const dispTaxCertificate = round(config.dispositionTaxCertificate);

  const dispositionTitle =
    dispOwnerTitlePremium +
    dispBundledClosingFee +
    dispOwnerExtendedCoverage +
    dispTaxCertificate;

  const dispositionCommissionBuyer = Math.round(
    arvPrice * effectiveBuyerCommissionRate,
  );
  const dispositionCommissionSeller = Math.round(
    arvPrice * effectiveSellerCommissionRate,
  );
  const dispositionSubtotal =
    dispositionTitle + dispositionCommissionBuyer + dispositionCommissionSeller;

  return {
    acquisitionTitle,
    acquisitionTitleBreakdown: {
      bundledLoanRate: acqBundledLoanRate,
      bundledClosingFee: acqBundledClosingFee,
      loanDisbursementFee: acqLoanDisbursementFee,
      recordingCosts: acqRecordingCosts,
      closingProtectionLetter: acqCpl,
      eRecordingFee: acqErecording,
    },
    acquisitionCommission,
    acquisitionFee,
    acquisitionSubtotal,
    dispositionTitle,
    dispositionTitleBreakdown: {
      ownerTitlePremiumBasic: dispOwnerTitlePremiumBasic,
      premiumShare: config.dispositionOwnerTitlePremiumShare,
      ownerTitlePremium: dispOwnerTitlePremium,
      bundledClosingFee: dispBundledClosingFee,
      ownerExtendedCoverage: dispOwnerExtendedCoverage,
      taxCertificate: dispTaxCertificate,
    },
    dispositionCommissionBuyer,
    dispositionCommissionBuyerRate: effectiveBuyerCommissionRate,
    dispositionCommissionSeller,
    dispositionCommissionSellerRate: effectiveSellerCommissionRate,
    dispositionSubtotal,
    total: acquisitionSubtotal + dispositionSubtotal,
  };
}

function round(value: number): number {
  return Math.round(value);
}

// ---------------------------------------------------------------------------
// Transaction Cost Engine
//
// Phase 1 Step 3A — restructured to support the 6-line breakdown from
// WORKSTATION_CARD_SPEC.md Decision 5:
//
//   Acquisition side (paid out-of-pocket at closing):
//     - Acquisition Title       (0.3% of purchase by default)
//     - Acquisition Commission  (signed, default 0)
//     - Acquisition Fee         (flat dollars, default 0)
//
//   Disposition side (deducted from sale proceeds):
//     - Disposition Title              (0.47% of sale by default)
//     - Disposition Commission Buyer  (2% of sale by default)
//     - Disposition Commission Seller (2% of sale by default)
//
// Defaults preserve the prior ~4.77% combined rate:
//   0.003 + 0 + 0 + 0.0047 + 0.02 + 0.02 = 0.0477
//   (was: 0.003 + 0.0047 + 0.04         = 0.0477)
//
// So when this engine recomputes any existing screening, the `total`
// output is unchanged. Existing screening_results.transaction_total
// values remain valid — no recompute or backfill needed.
//
// The deprecated `dispositionCommissions` field is kept on the result
// type as a backwards-compat shim (computed as buyer + seller) so any
// existing consumer that hasn't migrated yet continues to work. The
// shim is removed in 3F when the existing Workstation is fully retired.
// ---------------------------------------------------------------------------

import type { TransactionConfig } from "./strategy-profiles";
import type { TransactionResult } from "./types";

type CalculateTransactionInput = {
  /** Acquisition price basis (list price used as proxy during screening). */
  acquisitionPrice: number;
  /** Expected sale price (ARV). */
  arvPrice: number;
  config: TransactionConfig;
};

export function calculateTransaction(
  input: CalculateTransactionInput,
): TransactionResult {
  const { acquisitionPrice, arvPrice, config } = input;

  // ─── Acquisition side ───
  const acquisitionTitle = Math.round(
    acquisitionPrice * config.acquisitionTitleRate,
  );
  // Note: signed. Negative values represent a credit at closing.
  const acquisitionCommission = Math.round(
    acquisitionPrice * config.acquisitionCommissionRate,
  );
  const acquisitionFee = Math.round(config.acquisitionFeeFlat);
  const acquisitionSubtotal =
    acquisitionTitle + acquisitionCommission + acquisitionFee;

  // ─── Disposition side ───
  const dispositionTitle = Math.round(
    arvPrice * config.dispositionTitleRate,
  );
  const dispositionCommissionBuyer = Math.round(
    arvPrice * config.dispositionCommissionBuyerRate,
  );
  const dispositionCommissionSeller = Math.round(
    arvPrice * config.dispositionCommissionSellerRate,
  );
  const dispositionSubtotal =
    dispositionTitle + dispositionCommissionBuyer + dispositionCommissionSeller;

  // ─── Backwards-compat shim (deprecated) ───
  const dispositionCommissions =
    dispositionCommissionBuyer + dispositionCommissionSeller;

  return {
    acquisitionTitle,
    acquisitionCommission,
    acquisitionFee,
    acquisitionSubtotal,
    dispositionTitle,
    dispositionCommissionBuyer,
    dispositionCommissionSeller,
    dispositionSubtotal,
    dispositionCommissions, // deprecated, kept for backwards compat
    total: acquisitionSubtotal + dispositionSubtotal,
  };
}

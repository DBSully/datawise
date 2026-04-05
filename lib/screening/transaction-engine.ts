// ---------------------------------------------------------------------------
// Transaction Cost Engine
//
// Calculates acquisition and disposition costs (title, commissions).
// Financing is reserved for future implementation.
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

  const acquisitionTitle = Math.round(
    acquisitionPrice * config.acquisitionTitleRate,
  );
  const dispositionTitle = Math.round(
    acquisitionPrice * config.dispositionTitleRate,
  );
  const dispositionCommissions = Math.round(
    arvPrice * config.dispositionCommissionRate,
  );

  return {
    acquisitionTitle,
    dispositionTitle,
    dispositionCommissions,
    total: acquisitionTitle + dispositionTitle + dispositionCommissions,
  };
}

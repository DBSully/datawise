// Phase 1 Step 3D Task 1 — auto-persist field types.
//
// Discriminated union covering every field the new Workstation in 3E
// will persist via the auto-save pattern (Decision 2 in
// WORKSTATION_CARD_SPEC.md). Each variant pairs a field name with the
// exact value type that field accepts. Type-safe at every call site:
// passing the wrong value shape for a given field is a compile-time
// error.
//
// Per Decision 5.3 (3D plan) the allow-list is tight — exactly the 11
// fields the new Quick Analysis tile (4) + Quick Status tile (4) +
// Financing card modal (3) need. Adding a new persistable field is
// one entry to the union below + one entry to the FIELD_TABLE map in
// save-manual-analysis-field-action.ts. Both edits are required by
// the compiler so it's impossible to add a field to one without the
// other (the FIELD_TABLE_TYPECHECK constant in the action file
// enforces this — see that file for the trick).
//
// Per Decision 5.2 (3D plan) the union mixes fields from two
// different underlying tables (manual_analysis and analysis_pipeline).
// The caller never thinks about which table — internal routing in the
// action handles dispatch.

// ─────────────────────────────────────────────────────────────────────────────
// manual_analysis fields (10 of 11)
// ─────────────────────────────────────────────────────────────────────────────

/** Quick Analysis tile (Tile 3, spec §3.2) — 4 numeric overrides */
export type QuickAnalysisFieldUpdate =
  | { field: "arv_manual"; value: number | null }
  | { field: "rehab_manual"; value: number | null }
  | { field: "target_profit_manual"; value: number | null }
  | { field: "days_held_manual"; value: number | null };

/** Quick Status tile (Tile 4, spec §3.2) — 3 dropdowns that live on
 *  manual_analysis. The 4th dropdown (Interest Level) lives on
 *  analysis_pipeline; see PipelineFieldUpdate below. */
export type QuickStatusManualFieldUpdate =
  | { field: "analyst_condition"; value: string | null }
  | { field: "location_rating"; value: string | null }
  | { field: "next_step"; value: string | null };

/** Financing card modal (spec §5.4) — 3 percentage overrides stored
 *  as decimals (0.11 = 11%). */
export type FinancingFieldUpdate =
  | { field: "financing_rate_manual"; value: number | null }
  | { field: "financing_points_manual"; value: number | null }
  | { field: "financing_ltv_manual"; value: number | null };

/** Transaction Costs modal — 2 commission-rate overrides (Buyer /
 *  Seller), decimals (0.02 = 2%). Profile default is 2%/2% on
 *  DENVER_FLIP_V1. */
export type TransactionFieldUpdate =
  | { field: "disposition_commission_buyer_manual"; value: number | null }
  | { field: "disposition_commission_seller_manual"; value: number | null };

export type ManualAnalysisFieldUpdate =
  | QuickAnalysisFieldUpdate
  | QuickStatusManualFieldUpdate
  | FinancingFieldUpdate
  | TransactionFieldUpdate;

// ─────────────────────────────────────────────────────────────────────────────
// analysis_pipeline fields (1 of 11)
// ─────────────────────────────────────────────────────────────────────────────

/** Analyst Interest lives on the pipeline row, not on manual_analysis.
 *  Per the three-gate model (2026-04-25), this is the analyst's own
 *  classification (hot/warm/watch/pass) — the screener_decision on
 *  screening_results is a separate field. */
export type PipelineFieldUpdate =
  | { field: "analyst_interest"; value: string | null };

// ─────────────────────────────────────────────────────────────────────────────
// Combined union — what the action accepts
// ─────────────────────────────────────────────────────────────────────────────

export type AnalysisFieldUpdate =
  | ManualAnalysisFieldUpdate
  | PipelineFieldUpdate;

/** Convenience: every field name in the union, as a string literal type.
 *  Used by the action's FIELD_TABLE map to enforce exhaustive coverage
 *  at compile time — the map's key type must be exactly this union. */
export type AnalysisFieldName = AnalysisFieldUpdate["field"];

/** The full input shape for saveManualAnalysisFieldAction. */
export type SaveAnalysisFieldInput = {
  analysisId: string;
} & AnalysisFieldUpdate;

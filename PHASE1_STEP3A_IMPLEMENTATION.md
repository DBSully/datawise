# Phase 1 — Step 3A — Schema Preparation

> **Goal:** Apply all schema and data-model changes the new Workstation card layout will need, in isolation, before any UI work begins. Includes the SECURITY DEFINER function audit deferred from Step 2.
> **Status:** DRAFT — awaiting Dan's review before execution
> **Authority:** Implementation against `WORKSTATION_CARD_SPEC.md` (locked) + `PHASE1_STEP3_MASTER_PLAN.md` §3 (3A scope) + completion of Phase 1 Steps 1 and 2
> **Date:** 2026-04-11
> **Risk level:** Low to Medium — additive schema changes plus a code rewrite of `transaction-engine.ts` whose new defaults preserve existing math
> **Estimated scope:** 2 schema migrations (possibly 1 more for SECURITY DEFINER fixes), 1 TypeScript types file, 1 strategy profile update, 1 transaction engine rewrite, 1 cashRequired calculation update, 1 load-workstation-data extension

---

## 1. What 3A Accomplishes

3A is the foundation sub-step of Step 3. It does five things:

1. **Notes visibility model migration** — replaces the binary `is_public` boolean with a three-tier `visibility` enum (`internal` / `specific_partners` / `all_partners`) per Decision 8 in `WORKSTATION_CARD_SPEC.md`. Adds the `visible_to_partner_ids` array column. Renames the `internal` note category to `workflow` per Decision 8a.
2. **`manual_analysis.next_step` column** — adds the new free-form text column the Quick Status tile (Tile 4) needs.
3. **Transaction engine restructure** — rewrites the transaction calculation to use the 6-line breakdown from Decision 5 (Acquisition Title / Commission / Fee + Disposition Title / Commission Buyer / Commission Seller) while preserving the existing combined total via default rates.
4. **`WorkstationData.physical` extension** — exposes the level-specific bed/bath fields (`bedroomsMain/Upper/Lower`, `bathroomsMain/Upper/Lower`) that the Property Physical tile's mini-grid will read.
5. **`cashRequired` schema extension** — adds the two new acquisition-side line items (Acquisition Commission and Fee) plus the two derived subtotals (`acquisitionSubtotal`, `carrySubtotal`) per the Cash Required card spec.

Plus the deferred work:

6. **SECURITY DEFINER function audit** — runs the audit query, surfaces any non-whitelisted SECURITY DEFINER functions, and applies fixes.

**3A explicitly does NOT do these things — they belong to later sub-steps:**

| Out of scope | Belongs to |
|---|---|
| Any UI changes | 3E |
| Any route changes | 3B |
| Component extraction | 3C |
| Auto-persist infrastructure | 3D |
| Reading the new fields from any UI component | 3E (when the new Workstation cards are built) |
| Dropping `analysis_notes.is_public` | 3F (after the new visibility model has been verified for a while) |

---

## 2. The #1 Constraint

**Every existing analyst workflow must keep working unchanged.** This is the same constraint as Steps 1 and 2 — the application code that exists today (current Workstation, screening pipeline, comp loaders, etc.) must continue to function without any user-visible difference. 3A is purely additive at the database layer and purely refactoring at the application layer; nothing the analyst sees today should change.

The two areas with the highest risk of accidentally breaking something:

- **Transaction engine rewrite.** The current `transaction-engine.ts` is called by every screening run. The new 6-line implementation must produce the same total under default settings — a typo in any of the 6 rates would cause every future screening to compute different transaction totals.
- **Notes visibility migration backfill.** Every existing note must end up with the correct `visibility` value. A wrong backfill would silently expose internal notes as `all_partners`, or hide previously-public notes as `internal`.

Both are mitigated with explicit verification queries in §8.

---

## 3. Risk & Rollback

| Workstream | Risk | Why | Mitigation |
|---|---|---|---|
| Notes visibility migration | Low-Medium | Touches a table the app actively writes to; backfill could mis-classify notes | Idempotent migration with explicit backfill rule + verification query that compares old `is_public` column to new `visibility` column |
| `next_step` column add | Very Low | Pure additive nullable column; no existing code references it | Migration is single ALTER TABLE; trivially reversible |
| Transaction engine rewrite | Medium | Touches core deal math used by screening pipeline; bug could shift every future screening's totals | New defaults preserve current ~4.77% combined rate (0.3 + 0 + 0 + 0.47 + 2 + 2). Spot-check a known screening run before/after the rewrite to confirm totals match. |
| `cashRequired` extension | Low | Pure additive fields; existing total math unchanged | The two new line items default to 0 unless the strategy profile sets them, so existing computed values are preserved |
| Bed/bath level extension | Very Low | Pure additive type fields; the underlying columns already exist; the load query just gains a few more SELECTs | Verification: the existing Workstation continues to load and render correctly |
| SECURITY DEFINER audit | Unknown until run | Could find 0 functions, or could find some that need real refactoring | The audit itself is read-only and zero-risk. The risk is in whatever fixes the audit demands. If complex, individual fixes can be deferred to 3F or beyond. |

**Rollback procedure:**

- **After notes migration:** revert with a follow-up migration that drops the new columns + recreates `is_public` (still in place during 3A — only dropped in 3F). The note category rename is reversible via `UPDATE analysis_notes SET note_type = 'internal' WHERE note_type = 'workflow'`.
- **After `next_step` column:** `ALTER TABLE manual_analysis DROP COLUMN next_step` — trivial.
- **After transaction engine rewrite:** revert the TypeScript files via Git. No DB changes; this is purely application code.
- **After cashRequired extension:** same — Git revert of TypeScript.
- **After bed/bath extension:** same.
- **After SECURITY DEFINER fixes:** depends on the specific fix; each will have its own rollback path documented in the fix migration.

**Catastrophic rollback:** if all of 3A needs to be reverted, the tag `phase1-step2-complete` is the recovery point. All 3A schema migrations are independently reversible.

---

## 4. Schema Changes

Two SQL migrations, plus possibly a third if the SECURITY DEFINER audit finds anything that needs fixing.

### 4.1 Migration 1 — Notes visibility model + category rename

**File:** `supabase/migrations/<ts>_step3a_notes_visibility_model.sql`

```sql
-- Phase 1 Step 3A — Migration 1
-- Replace the binary is_public boolean with a three-tier visibility enum,
-- add the partner-id array, and rename the 'internal' note category to
-- 'workflow' per WORKSTATION_CARD_SPEC.md Decisions 8 and 8a.
--
-- The old is_public column is NOT dropped here. It stays in place for
-- the duration of Step 3 as a safety net so any code that still reads
-- it doesn't break. It will be dropped in 3F after the new visibility
-- model is verified working and no code references the old column.

-- ────────────────────────────────────────────────────────────────────
-- Add the new visibility enum column
-- ────────────────────────────────────────────────────────────────────

ALTER TABLE public.analysis_notes
  ADD COLUMN IF NOT EXISTS visibility text
    CHECK (visibility IN ('internal', 'specific_partners', 'all_partners'))
    DEFAULT 'internal';

-- ────────────────────────────────────────────────────────────────────
-- Add the partner-id array (used when visibility = 'specific_partners')
-- ────────────────────────────────────────────────────────────────────

ALTER TABLE public.analysis_notes
  ADD COLUMN IF NOT EXISTS visible_to_partner_ids uuid[] DEFAULT NULL;

-- ────────────────────────────────────────────────────────────────────
-- Backfill: convert is_public boolean to visibility enum
-- is_public = true   → visibility = 'all_partners'
-- is_public = false  → visibility = 'internal'
-- ────────────────────────────────────────────────────────────────────

UPDATE public.analysis_notes
SET visibility = CASE
  WHEN is_public = true  THEN 'all_partners'
  WHEN is_public = false THEN 'internal'
  ELSE 'internal'
END
WHERE visibility IS NULL OR visibility = 'internal';

-- Mark the old column as deprecated (will be dropped in 3F)
COMMENT ON COLUMN public.analysis_notes.is_public IS
  'DEPRECATED — use visibility column. Will be dropped in Phase 1 Step 3F.';

-- ────────────────────────────────────────────────────────────────────
-- Rename the 'internal' note category to 'workflow' per Decision 8a
-- ────────────────────────────────────────────────────────────────────
--
-- The old 'internal' category was a topic label that conflated with
-- the new Internal visibility tier. Renaming to 'workflow' captures
-- the topic intent (notes about how the analysis is being conducted)
-- without the audience-flag conflation.
--
-- This is a small UPDATE on the note_type column. The application
-- code change to update the NOTE_CATEGORIES constant ships in 3E
-- when the Notes card is rebuilt.

UPDATE public.analysis_notes
SET note_type = 'workflow'
WHERE note_type = 'internal';
```

**Verification after Migration 1:**

```sql
-- Confirm new columns exist
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'analysis_notes'
  AND column_name IN ('visibility', 'visible_to_partner_ids');
-- Expect 2 rows

-- Confirm backfill: counts of visibility values should match counts of is_public
SELECT
  visibility,
  count(*) AS row_count
FROM public.analysis_notes
GROUP BY visibility
ORDER BY visibility;

-- Cross-check against old is_public:
SELECT
  is_public,
  visibility,
  count(*) AS row_count
FROM public.analysis_notes
GROUP BY is_public, visibility
ORDER BY is_public, visibility;
-- Expect:
--   is_public = true,  visibility = 'all_partners' → all old public notes
--   is_public = false, visibility = 'internal'     → all old private notes
--   is_public = null,  visibility = 'internal'     → defaulted

-- Confirm category rename
SELECT note_type, count(*)
FROM public.analysis_notes
GROUP BY note_type
ORDER BY note_type;
-- Should NOT include 'internal'; should include 'workflow' (with the count of
-- previously-internal-categorized notes, which was 0 in our schema discovery
-- but might be non-zero now)
```

### 4.2 Migration 2 — `manual_analysis.next_step` column

**File:** `supabase/migrations/<ts>_step3a_next_step_column.sql`

```sql
-- Phase 1 Step 3A — Migration 2
-- Add the next_step column to manual_analysis for the Quick Status tile
-- (Tile 4 in WORKSTATION_CARD_SPEC.md §3.2).
--
-- The column is intentionally free-form (no CHECK constraint) so the
-- option set can evolve without migrations as the app gets used.
-- The starter set lives in application code:
--   none
--   analyze_deeper
--   schedule_showing
--   request_partner_input
--   make_offer
--   wait_price_drop
--   pass

ALTER TABLE public.manual_analysis
  ADD COLUMN IF NOT EXISTS next_step text;

COMMENT ON COLUMN public.manual_analysis.next_step IS
  'Analyst''s prospective next step for this property. Free-form text. '
  'Starter options: none, analyze_deeper, schedule_showing, '
  'request_partner_input, make_offer, wait_price_drop, pass. '
  'Set via the Quick Status tile in the new Workstation (3E).';
```

**Verification after Migration 2:**

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'manual_analysis'
  AND column_name = 'next_step';
-- Expect 1 row, data_type = 'text', is_nullable = 'YES'
```

### 4.3 Possible Migration 3 — SECURITY DEFINER fixes (depends on audit)

**File:** `supabase/migrations/<ts>_step3a_security_definer_fixes.sql` *(only if needed)*

This migration only exists if the audit in §6 finds non-whitelisted SECURITY DEFINER functions that need fixing. The exact contents depend on what's there. Likely shapes:

- For functions safely converted to SECURITY INVOKER:
  ```sql
  ALTER FUNCTION public.<function_name>() SECURITY INVOKER;
  ```
- For functions that genuinely need to stay SECURITY DEFINER but need explicit org filtering:
  ```sql
  CREATE OR REPLACE FUNCTION public.<function_name>(...)
  RETURNS ...
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
  AS $$
  BEGIN
    -- Add: filter results by current_user_organization_id()
    RETURN QUERY ... WHERE organization_id = public.current_user_organization_id();
  END;
  $$;
  ```

The plan for whichever fixes are needed will be drafted ad-hoc once the audit results are known.

---

## 5. Application Code Changes

Three workstreams, all TypeScript-only (no schema migrations):

### 5.1 Transaction engine restructure

**Files:**
- `lib/screening/types.ts` — update `TransactionResult` type
- `lib/screening/strategy-profiles.ts` — update `TransactionConfig` type and `DENVER_FLIP_V1` defaults
- `lib/screening/transaction-engine.ts` — rewrite the calculation
- `lib/reports/types.ts` — update `TransactionDetail` type (the workstation-side view of transaction data)
- `lib/analysis/load-workstation-data.ts` — pass through the new fields if it currently shapes a `TransactionDetail`

**`TransactionConfig` (in `lib/screening/strategy-profiles.ts`) — new shape:**

```typescript
export type TransactionConfig = {
  /** Acquisition title/closing as fraction of purchase price. */
  acquisitionTitleRate: number;

  /** NEW — Signed acquisition commission as fraction of purchase price.
   *  Positive = OOP at closing; negative = credit at closing. Default 0. */
  acquisitionCommissionRate: number;

  /** NEW — Flat acquisition fee in dollars (e.g. assignment fee, service fee).
   *  Always positive. Default 0. */
  acquisitionFeeFlat: number;

  /** Disposition title/closing as fraction of sale price. */
  dispositionTitleRate: number;

  /** NEW — Disposition buyer-agent commission as fraction of sale price.
   *  Replaces the old combined dispositionCommissionRate. Default 0.02. */
  dispositionCommissionBuyerRate: number;

  /** NEW — Disposition seller-agent commission as fraction of sale price.
   *  Replaces the old combined dispositionCommissionRate. Default 0.02. */
  dispositionCommissionSellerRate: number;
};
```

**`DENVER_FLIP_V1.transaction` defaults:**

```typescript
transaction: {
  acquisitionTitleRate:           0.003,   // unchanged
  acquisitionCommissionRate:      0,       // NEW — default 0 (no fee at acquisition)
  acquisitionFeeFlat:             0,       // NEW — default $0 flat
  dispositionTitleRate:           0.0047,  // unchanged
  dispositionCommissionBuyerRate: 0.02,    // NEW — split from old 0.04
  dispositionCommissionSellerRate: 0.02,   // NEW — split from old 0.04
},
```

Total combined rate: 0.003 + 0 + 0 + 0.0047 + 0.02 + 0.02 = 0.0477 = **4.77%**, identical to the current 0.003 + 0.0047 + 0.04 = 0.0477. **Existing screening_results.transaction_total values remain valid** because the engine produces the same total under default config.

**`TransactionResult` (in `lib/screening/types.ts`) — new shape:**

```typescript
export type TransactionResult = {
  acquisitionTitle: number;
  acquisitionCommission: number;     // NEW — signed (can be negative)
  acquisitionFee: number;             // NEW
  dispositionTitle: number;
  dispositionCommissionBuyer: number; // NEW (split from old)
  dispositionCommissionSeller: number; // NEW (split from old)
  acquisitionSubtotal: number;        // NEW (derived)
  dispositionSubtotal: number;        // NEW (derived)
  total: number;
};
```

**`transaction-engine.ts` — full rewrite:**

```typescript
// ---------------------------------------------------------------------------
// Transaction Cost Engine
//
// Calculates acquisition and disposition costs across 6 line items:
//   - Acquisition Title (0.3% of purchase by default)
//   - Acquisition Commission (signed, default 0)
//   - Acquisition Fee (flat dollars, default 0)
//   - Disposition Title (0.47% of sale by default)
//   - Disposition Commission — Buyer Agent (2% of sale by default)
//   - Disposition Commission — Seller Agent (2% of sale by default)
//
// Defaults preserve the prior ~4.77% combined rate.
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

  // Acquisition side — paid out-of-pocket at closing
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

  // Disposition side — deducted from sale proceeds (not OOP)
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

  return {
    acquisitionTitle,
    acquisitionCommission,
    acquisitionFee,
    dispositionTitle,
    dispositionCommissionBuyer,
    dispositionCommissionSeller,
    acquisitionSubtotal,
    dispositionSubtotal,
    total: acquisitionSubtotal + dispositionSubtotal,
  };
}
```

**Verification:** the engine's `total` output for any given input must match the previous engine's `total` output (because the default rates produce the same combined rate). I'll write a small recompute script that takes a sample of recent screening_results rows, recomputes their transaction with the new engine using the same inputs, and confirms the totals are within ±$2 (allowing for rounding).

### 5.2 `cashRequired` schema extension

**Files:**
- `lib/reports/types.ts` — update `cashRequired` type with new fields
- `lib/analysis/load-workstation-data.ts` — update the calculation to include the new line items and emit the two derived subtotals

**Updated `cashRequired` type:**

```typescript
cashRequired: {
  // Existing fields
  purchasePrice: number;
  downPaymentRate: number;
  downPayment: number;
  loanForPurchase: number;
  originationCost: number;
  loanAvailableForRehab: number;
  rehabTotal: number;
  rehabFromLoan: number;
  rehabOutOfPocket: number;
  acquisitionTitle: number;
  holdingTotal: number;
  interestCost: number;

  // NEW: cascade from Decision 5 transaction restructure
  acquisitionCommission: number;  // signed
  acquisitionFee: number;

  // NEW: derived subtotals (per WORKSTATION_CARD_SPEC.md §5.5)
  acquisitionSubtotal: number;     // down payment + acq title + acq commission + acq fee + origination
  carrySubtotal: number;            // rehab OOP + holding total + interest cost

  // The headline number — sum of both subtotals
  totalCashRequired: number;
} | null;
```

**`load-workstation-data.ts` calculation update:**

The current calculation builds `cashRequired` from `transaction.acquisitionTitle` plus the other line items. The update is to ALSO read `transaction.acquisitionCommission` (signed) and `transaction.acquisitionFee` from the now-restructured transaction result, and to compute the two derived subtotals. The `totalCashRequired` value stays defined as the sum of all acquisition-side and carry-side line items.

**Cash flow note:** because `acquisitionCommission` defaults to 0 and `acquisitionFee` defaults to $0, **existing computed `totalCashRequired` values are unchanged for any analysis using the default profile**. They only change if/when an analyst configures non-zero values via the strategy profile.

### 5.3 Bed/bath level fields in `WorkstationData.physical`

**Files:**
- `lib/reports/types.ts` — extend `physical` type
- `lib/analysis/load-workstation-data.ts` — extend the SELECT to fetch the level-specific columns

**Updated `physical` type:**

```typescript
physical: {
  propertyType: string | null;
  propertySubType: string | null;
  structureType: string | null;
  levelClass: string | null;
  buildingSqft: number;
  aboveGradeSqft: number;
  belowGradeTotalSqft: number;
  belowGradeFinishedSqft: number;
  yearBuilt: number | null;
  bedroomsTotal: number | null;
  bathroomsTotal: number | null;
  garageSpaces: number | null;
  lotSizeSqft: number;

  // NEW: per-level breakdown for the Property Physical tile mini-grid
  // Underlying columns already exist in property_physical (main_level_*,
  // upper_level_*, lower_level_*, basement_level_*). The Property
  // Physical tile in the new Workstation (3E.3) reads these to render
  // a small bed/bath grid.
  bedroomsMain: number | null;
  bedroomsUpper: number | null;
  bedroomsLower: number | null;     // Note: collapses lower_level + basement_level
  bathroomsMain: number | null;
  bathroomsUpper: number | null;
  bathroomsLower: number | null;
} | null;
```

**Note on lower vs basement:** the `property_physical` table has BOTH `lower_level_bedrooms` and `basement_level_bedrooms` (two separate fields). For the workstation grid, I'll collapse them into a single `bedroomsLower` value (`COALESCE(lower_level_bedrooms, 0) + COALESCE(basement_level_bedrooms, 0)`, with NULL → NULL if both are NULL). Same for bathrooms. This matches Dan's spec (`Tot | Main | Up | Lo` — only 4 columns).

**`load-workstation-data.ts` SELECT update** — add 6 new column references:

```typescript
.select(
  "property_type, property_sub_type, structure_type, level_class_standardized, " +
  "levels_raw, building_form_standardized, building_area_total_sqft, " +
  "above_grade_finished_area_sqft, below_grade_total_sqft, " +
  "below_grade_finished_area_sqft, below_grade_unfinished_area_sqft, " +
  "year_built, bedrooms_total, bathrooms_total, garage_spaces, " +
  // NEW for Step 3A
  "main_level_bedrooms, main_level_bathrooms, " +
  "upper_level_bedrooms, upper_level_bathrooms, " +
  "lower_level_bedrooms, lower_level_bathrooms, " +
  "basement_level_bedrooms, basement_level_bathrooms"
)
```

Then in the data shaping code, compute `bedroomsLower` and `bathroomsLower` as the sum of `lower_level_*` and `basement_level_*` (NULL-safe).

---

## 6. SECURITY DEFINER Audit

This was deferred from Step 2 per Decision 12.2 in the Step 2 plan. 3A is the right home for it because it's a database-layer concern that should be settled before any 3B-3E work touches RLS-adjacent code.

### Audit query

Run this in the Supabase dashboard SQL editor:

```sql
SELECT
  proname AS function_name,
  prosecdef AS is_security_definer,
  proconfig AS config_settings,
  pg_get_function_identity_arguments(p.oid) AS arguments,
  obj_description(p.oid, 'pg_proc') AS description
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND prosecdef = true
  AND proname NOT IN (
    -- Whitelist: known SECURITY DEFINER functions we built and verified safe
    'handle_new_auth_user',           -- Step 1: profile auto-create
    'current_user_organization_id',   -- Step 2: RLS helper
    'set_updated_at'                  -- Pre-existing trigger function
  )
ORDER BY proname;
```

### Outcomes and treatments

**(i) Zero non-whitelisted functions found** — best case. No fix migration needed. Just document in the CHANGELOG entry that the audit was run with zero findings.

**(ii) A few functions that can safely become SECURITY INVOKER** — apply `ALTER FUNCTION ... SECURITY INVOKER` in Migration 3. Verify nothing that calls them breaks.

**(iii) Functions that genuinely need SECURITY DEFINER** — these are functions that legitimately need elevated privileges (e.g., to write to a table the calling user doesn't have direct access to). For each, the fix is to add explicit `WHERE organization_id = public.current_user_organization_id()` filtering inside the function body so it can't return cross-org results. Apply via Migration 3.

**(iv) Functions whose fix is complex or unclear** — document and defer to a follow-up commit. Don't block 3A on a deep refactor of one specific function.

### What I'll do in the implementation

The audit query is the **first task** in the ordered list (§7) — before any migrations or code changes. The result determines what Migration 3 looks like (or whether it's needed at all). I'll bring the findings to Dan before applying any fixes so he can review what's there.

---

## 7. Ordered Task List

Each task is independently committable. Per Decision 6.7 (one document per sub-step) and the per-task commit cadence we agreed on for Steps 1 and 2.

### Phase A — Audit (1 commit, no DB changes)

**Task 1:** Run the SECURITY DEFINER audit query in the Supabase dashboard. Document findings in this implementation plan as a new §6.5 (or in a follow-up commit). No code or schema changes yet.
- Verification: query returns a clear list of any non-whitelisted functions
- Output: a short report on findings, plus a recommendation for each (convert to SECURITY INVOKER / add org filter / defer)

### Phase B — Schema migrations (2-3 commits)

**Task 2:** Create `supabase/migrations/<ts>_step3a_notes_visibility_model.sql` per §4.1. Dry-run, push, verify backfill matches the cross-check query.

**Task 3:** Create `supabase/migrations/<ts>_step3a_next_step_column.sql` per §4.2. Dry-run, push, verify column exists.

**Task 4:** *(conditional on Task 1 findings)* Create `supabase/migrations/<ts>_step3a_security_definer_fixes.sql` per §4.3. Dry-run, push, verify each function is now in the desired state.

### Phase C — Application code (3 commits)

**Task 5:** Transaction engine restructure per §5.1.
- Update `lib/screening/types.ts` (TransactionResult type)
- Update `lib/screening/strategy-profiles.ts` (TransactionConfig type + DENVER_FLIP_V1 defaults)
- Update `lib/screening/transaction-engine.ts` (rewrite calculateTransaction)
- Update `lib/reports/types.ts` (TransactionDetail type — workstation-side view)
- Update `lib/analysis/load-workstation-data.ts` if it shapes TransactionDetail
- Verification: typecheck + build pass; small recompute script confirms a sample of existing screening_results.transaction_total values match the new engine's output ±$2

**Task 6:** Cash Required schema extension per §5.2.
- Update `lib/reports/types.ts` (cashRequired type with new fields and subtotals)
- Update `lib/analysis/load-workstation-data.ts` (calculation now includes new line items and emits subtotals)
- Verification: typecheck + build pass; existing workstation continues to render Cash Required correctly

**Task 7:** Bed/bath level fields per §5.3.
- Update `lib/reports/types.ts` (physical type with 6 new fields)
- Update `lib/analysis/load-workstation-data.ts` (SELECT extends to fetch the level columns; shaping computes the lower-collapse)
- Verification: typecheck + build pass; existing workstation continues to render

### Phase D — Verification + cleanup (1 commit)

**Task 8:** Manual smoke test of all existing analyst flows. Make sure 3A's changes haven't broken anything that was working at the end of Step 2 + interim queue fix.

**Task 9:** CHANGELOG entry for 3A. Push everything to origin.

---

## 8. Files Touched

| File | Type | Why |
|---|---|---|
| `supabase/migrations/<ts>_step3a_notes_visibility_model.sql` | NEW | Notes visibility migration |
| `supabase/migrations/<ts>_step3a_next_step_column.sql` | NEW | next_step column add |
| `supabase/migrations/<ts>_step3a_security_definer_fixes.sql` | NEW (conditional) | SECURITY DEFINER fixes if audit finds anything |
| `lib/screening/types.ts` | EDIT | Update TransactionResult type |
| `lib/screening/strategy-profiles.ts` | EDIT | Update TransactionConfig type + DENVER_FLIP_V1 defaults |
| `lib/screening/transaction-engine.ts` | EDIT | Rewrite calculateTransaction |
| `lib/reports/types.ts` | EDIT | Update TransactionDetail + cashRequired + physical types |
| `lib/analysis/load-workstation-data.ts` | EDIT | Extend SELECT, update shaping for new fields |
| `CHANGELOG.md` | EDIT | Phase 1 Step 3A entry |

**NOT modified in 3A** (these come in 3B-3F):
- Any UI component
- Any route or page file
- The current Workstation
- The ScreeningCompModal
- `app/(workspace)/layout.tsx` (auth check stays until 3F)
- The existing `analysis_notes.is_public` column (deprecated, dropped in 3F)
- `app-chrome.tsx` navigation (changes in 3B)

---

## 9. Verification Checklist

Run through this manually after each task. Every box must be checked before declaring 3A done.

### After Migration 1 (notes visibility model)

- [ ] `analysis_notes.visibility` column exists with the CHECK constraint
- [ ] `analysis_notes.visible_to_partner_ids` column exists
- [ ] Backfill cross-check query shows: `is_public = true → visibility = 'all_partners'` for ALL such rows; `is_public = false → visibility = 'internal'` for ALL such rows
- [ ] No notes have `note_type = 'internal'` after the rename
- [ ] Number of notes with `note_type = 'workflow'` equals the previous number with `note_type = 'internal'` (zero in our schema discovery, but verify)
- [ ] The existing application continues to read notes correctly (the workstation Notes panel still shows everything — the app code still references `is_public` until 3E rebuilds the Notes card)

### After Migration 2 (next_step column)

- [ ] `manual_analysis.next_step` column exists, nullable, no CHECK
- [ ] Existing rows have `next_step IS NULL` (no backfill needed; defaults to NULL)
- [ ] `manual_analysis` writes from existing application code continue to work (no `next_step` value passed → stays NULL)

### After Migration 3 (SECURITY DEFINER fixes — conditional)

- [ ] Each function flagged by the audit is in the agreed-upon state (INVOKER, or DEFINER with explicit org filter)
- [ ] Application code that calls those functions continues to work
- [ ] No regression in workflows that depend on the fixed functions

### After Task 5 (transaction engine rewrite)

- [ ] `npm run build` passes
- [ ] `npm run dev` starts cleanly
- [ ] **Recompute spot-check:** pick 3-5 recent screening_results rows. For each, recompute the transaction using the new engine with the same input (acquisitionPrice, arvPrice, DENVER_FLIP_V1 config). The output `total` should match the persisted `transaction_total` ±$2 (allowing rounding).
- [ ] The screening pipeline can be triggered on a small batch (e.g. one property) and the new transaction breakdown is visible in the engine output
- [ ] No console errors loading any workstation
- [ ] Deal Math waterfall on the existing Workstation still shows the correct `Trans` value (because the total is unchanged)

### After Task 6 (cashRequired extension)

- [ ] `npm run build` passes
- [ ] Existing Workstation continues to render Cash Required card with the same total value as before
- [ ] The two new fields (`acquisitionCommission`, `acquisitionFee`) default to 0 in `cashRequired` for any analysis using DENVER_FLIP_V1 (because the strategy profile defaults are 0)
- [ ] The two derived subtotals (`acquisitionSubtotal`, `carrySubtotal`) sum correctly to `totalCashRequired`

### After Task 7 (bed/bath level fields)

- [ ] `npm run build` passes
- [ ] Existing Workstation continues to render the existing bed/bath totals correctly
- [ ] Querying a known property's `WorkstationData.physical` returns the expected level breakdown (manually inspect with a test property if possible)
- [ ] `bedroomsLower` correctly collapses `lower_level_bedrooms + basement_level_bedrooms` (e.g. for a property where one is null and one is set, the result is the set value; for a property with both, it's the sum)

### Existing analyst workflow regression check (the critical part)

These all must work exactly as they did at the end of Step 2 + interim queue fix.

- [ ] Sign in works
- [ ] `/home` dashboard loads
- [ ] `/screening` queue loads with the same number of properties as before (and the 127 stale entries from the interim fix are still hidden)
- [ ] `/intake/imports` loads
- [ ] `/deals/watchlist` loads with all promoted properties
- [ ] `/deals/watchlist/[some-id]` opens the existing Workstation and renders correctly:
  - Comp map renders
  - Deal Math waterfall shows correct values
  - Notes section displays existing notes (with any pre-existing `note_type = 'internal'` now showing as the new `workflow` label — but this won't display until 3E rebuilds the Notes card)
  - Pipeline status persists
  - Manual analysis save (via the Overrides form) still works
- [ ] `/screening/[batchId]/[resultId]` opens screening result detail
- [ ] Generate Report still works
- [ ] No console errors anywhere
- [ ] Transaction totals on existing screening_results are unchanged (the new engine produces the same totals under defaults)

---

## 10. Definition of Done

Step 3A is complete when:

1. All migrations (Notes visibility, next_step, optionally SECURITY DEFINER fixes) are applied and recorded
2. All TypeScript code changes (transaction engine, cashRequired, bed/bath levels) are committed
3. Every box in §9 is checked
4. CHANGELOG.md has a Phase 1 Step 3A entry
5. All commits pushed to origin
6. Existing analyst workflow has been smoke-tested and confirms zero regressions

---

## 11. What 3B Builds On Top

3B (Route Restructure) is the next sub-step. It's mechanical file moves with legacy redirects. 3A doesn't have any direct dependencies that 3B needs — the route work is independent of the schema work. But 3B will benefit from 3A being done first because:

- The new transaction engine is in place, so when 3E (the new Workstation) needs to render the 6-line breakdown, the data layer is ready
- The notes visibility model is in place, so when 3E builds the Notes card with the three-tier visibility selector, the schema is ready
- The bed/bath level fields are in `WorkstationData`, so when 3E builds the Property Physical tile mini-grid, the data is ready
- The `next_step` column is in place, so when 3E builds the Quick Status tile (Tile 4), the storage target is ready

In other words, 3A is the foundation that lets 3B-3E focus on UI and routing without needing to weave in schema changes mid-stream.

---

## 12. Open Questions

None blocking. All seven open questions from `PHASE1_STEP3_MASTER_PLAN.md` §6 are resolved. The only outstanding unknown is what the SECURITY DEFINER audit will find — and that's discoverable only by running the audit (Task 1).

---

*Drafted by Claude Opus | 2026-04-11 | Awaiting Dan's review before execution*

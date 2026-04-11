-- Phase 1 Step 3A — Migration 2
-- Add the next_step column to manual_analysis for the Quick Status tile
-- (Tile 4 in WORKSTATION_CARD_SPEC.md §3.2).
--
-- The column is intentionally free-form (no CHECK constraint) so the
-- option set can evolve without migrations as the app gets used.
--
-- Starter option set (lives in application code, not enforced here):
--   none
--   analyze_deeper
--   schedule_showing
--   request_partner_input
--   make_offer
--   wait_price_drop
--   pass
--
-- Risk: Very Low. Pure additive nullable column with no constraints
-- and no existing code that references it. Trivially reversible.
--
-- Application code: NO CHANGES in this commit. The column is unused
-- until 3E ships the Quick Status tile.

ALTER TABLE public.manual_analysis
  ADD COLUMN IF NOT EXISTS next_step text;

COMMENT ON COLUMN public.manual_analysis.next_step IS
  'Analyst''s prospective next step for this property — what they '
  'plan to do NEXT (distinct from analysis_pipeline status, which '
  'tracks what is happening with the deal in the world). Free-form '
  'text. Starter options: none, analyze_deeper, schedule_showing, '
  'request_partner_input, make_offer, wait_price_drop, pass. Set via '
  'the Quick Status tile (Tile 4) in the new Workstation (Step 3E).';

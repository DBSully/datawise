-- Add per-comp analyst adjustments column.
--
-- Stores manual dollar adjustments the analyst applies to individual comps
-- during deep analysis. Categories: view/location, layout, lot size,
-- garage/parking, condition/updates, other (with optional note).
--
-- JSON shape:
-- {
--   "view_location": 8000,
--   "layout": 0,
--   "lot_size": -3000,
--   "garage": 0,
--   "condition": 5000,
--   "other": 0,
--   "other_note": "Solar panels"
-- }
--
-- NULL means no analyst adjustments have been entered (screening default).
-- Empty object {} means the analyst opened the form but left everything at 0.

ALTER TABLE public.comparable_search_candidates
  ADD COLUMN IF NOT EXISTS analyst_adjustments_json jsonb;

COMMENT ON COLUMN public.comparable_search_candidates.analyst_adjustments_json
  IS 'Per-comp manual dollar adjustments by the analyst (view, layout, lot, garage, condition, other).';

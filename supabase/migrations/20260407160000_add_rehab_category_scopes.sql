-- Add per-category rehab scope overrides (JSONB)
-- Stores per-category tier or custom multiplier, e.g.:
-- {
--   "aboveGrade": "heavy",
--   "belowGradeFinished": "none",
--   "exterior": "gut",
--   "systems": { "custom": 1.35 }
-- }
-- String value = preset tier (none/light/moderate/heavy/gut)
-- Object { "custom": <number> } = manual multiplier override
-- Missing key = defaults to "moderate" (1.0x)

ALTER TABLE manual_analysis
  ADD COLUMN IF NOT EXISTS rehab_category_scopes jsonb;

COMMENT ON COLUMN manual_analysis.rehab_category_scopes IS
  'Per-category rehab scope tiers or custom multipliers. Keys: aboveGrade, belowGradeFinished, belowGradeUnfinished, exterior, landscaping, systems.';

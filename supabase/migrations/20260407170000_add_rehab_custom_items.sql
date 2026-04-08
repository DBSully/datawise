-- Add custom rehab line items (JSONB array)
-- Stores user-defined rehab items beyond the 6 automated categories, e.g.:
-- [
--   { "label": "Roof", "cost": 12000 },
--   { "label": "Sewer line", "cost": 8500 }
-- ]

ALTER TABLE manual_analysis
  ADD COLUMN IF NOT EXISTS rehab_custom_items jsonb;

COMMENT ON COLUMN manual_analysis.rehab_custom_items IS
  'Array of custom rehab line items: [{ label: string, cost: number }]. Added to the automated category totals.';

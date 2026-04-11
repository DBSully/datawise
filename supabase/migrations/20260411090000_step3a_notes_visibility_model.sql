-- Phase 1 Step 3A — Migration 1
-- Notes visibility model + category rename
--
-- Replaces the binary is_public boolean with a three-tier visibility enum,
-- adds the partner-id array for the 'specific_partners' tier, and renames
-- the 'internal' note category to 'workflow' per WORKSTATION_CARD_SPEC.md
-- Decisions 8 and 8a.
--
-- ─── Why is_public is NOT dropped here ───
-- The old is_public column stays in place for the duration of Step 3 as a
-- safety net so any code that still reads it doesn't break. The existing
-- addAnalysisNoteAction and the existing Notes panel both reference
-- is_public — they continue to work unchanged after this migration.
-- The column is dropped in 3F after the new Notes card (3E) has been
-- ship-verified for a while.
--
-- ─── Why DEFAULT 'all_partners' (not 'internal') ───
-- The eventual target per WORKSTATION_CARD_SPEC.md Decision 8 is for new
-- notes to default to 'internal'. But during the transition window
-- (3A → 3E), the existing addAnalysisNoteAction code only writes the OLD
-- is_public column (which has DEFAULT true = public). If we set the new
-- visibility column's DEFAULT to 'internal', any note created via the
-- existing code path during the transition would have inconsistent
-- values: is_public = true but visibility = 'internal'.
--
-- To minimize drift, we set the new column's DEFAULT to 'all_partners'
-- so it matches the current is_public = true default. This means
-- existing-code inserts during the transition produce consistent values.
--
-- 3E will:
--   1. Re-sync visibility from is_public for any drifted rows that were
--      created via the existing form's "uncheck public" path
--   2. Change the DEFAULT to 'internal' to match the spec
--   3. Ship the new Notes card that writes visibility directly
--
-- ─── Current data scale ───
-- 15 total notes:
--   3 location, 1 offer, 2 scope, 9 valuation
--   0 with note_type = 'internal' → the rename UPDATE is a no-op for
--   current data but runs anyway to handle any future drift.

-- ────────────────────────────────────────────────────────────────────
-- 1. Add the new visibility enum column
-- ────────────────────────────────────────────────────────────────────

ALTER TABLE public.analysis_notes
  ADD COLUMN IF NOT EXISTS visibility text
    CHECK (visibility IN ('internal', 'specific_partners', 'all_partners'))
    DEFAULT 'all_partners';

COMMENT ON COLUMN public.analysis_notes.visibility IS
  'Three-tier visibility for Phase 1 partner sharing. '
  '''internal'' = analyst only; '
  '''specific_partners'' = partners listed in visible_to_partner_ids; '
  '''all_partners'' = all partners with active shares of this analysis. '
  'DEFAULT changes to ''internal'' in Phase 1 Step 3E.';

-- ────────────────────────────────────────────────────────────────────
-- 2. Add the partner-id array (used when visibility = 'specific_partners')
-- ────────────────────────────────────────────────────────────────────

ALTER TABLE public.analysis_notes
  ADD COLUMN IF NOT EXISTS visible_to_partner_ids uuid[] DEFAULT NULL;

COMMENT ON COLUMN public.analysis_notes.visible_to_partner_ids IS
  'Array of profile.id values for the curated partner subset when '
  'visibility = ''specific_partners''. NULL otherwise. Picker source '
  'is analysis_shares for the analysis (Phase 1 Step 4 partner portal).';

-- ────────────────────────────────────────────────────────────────────
-- 3. Backfill: convert is_public boolean to visibility enum on existing
--    rows. is_public is NOT NULL with default true, so the third branch
--    below is unreachable for existing data — kept as defensive.
-- ────────────────────────────────────────────────────────────────────

UPDATE public.analysis_notes
SET visibility = CASE
  WHEN is_public = true  THEN 'all_partners'
  WHEN is_public = false THEN 'internal'
  ELSE 'internal'
END;

-- ────────────────────────────────────────────────────────────────────
-- 4. Mark the old column as deprecated. Will be dropped in 3F.
-- ────────────────────────────────────────────────────────────────────

COMMENT ON COLUMN public.analysis_notes.is_public IS
  'DEPRECATED in Phase 1 Step 3A — use visibility column. '
  'Kept as a safety net during the Step 3 transition. '
  'Will be dropped in Phase 1 Step 3F.';

-- ────────────────────────────────────────────────────────────────────
-- 5. Rename the 'internal' note category to 'workflow' per Decision 8a.
--    No-op for current data (0 rows with note_type = 'internal'),
--    but runs anyway to handle any future drift.
-- ────────────────────────────────────────────────────────────────────

UPDATE public.analysis_notes
SET note_type = 'workflow'
WHERE note_type = 'internal';

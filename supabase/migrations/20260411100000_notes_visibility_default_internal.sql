-- Phase 1 Step 3E.7.h — Change analysis_notes.visibility DEFAULT to 'internal'.
--
-- Per Decision 5.5 (3E plan): the 3A migration set DEFAULT 'all_partners'
-- as a transition-period choice to keep is_public and visibility in sync
-- for notes created via the existing form. Now that the new NotesCardModal
-- writes visibility directly, the DEFAULT can be changed to 'internal'
-- (the eventual target per the spec). New notes that don't explicitly set
-- visibility will default to internal-only, which is the safe default.
--
-- This does NOT modify any existing data — just changes the column DEFAULT
-- for future INSERTs.

ALTER TABLE public.analysis_notes
  ALTER COLUMN visibility SET DEFAULT 'internal';

-- Phase 1 Step 3F — Drop the deprecated analysis_notes.is_public column.
--
-- The is_public boolean was replaced by the visibility enum column in
-- Step 3A (migration 20260411090000). The 3E.7.h Notes card modal
-- writes visibility directly. The 3F type/loader changes remove all
-- application reads of is_public. This migration drops the column.

ALTER TABLE public.analysis_notes DROP COLUMN IF EXISTS is_public;

-- 2026-04-23 — Partner financing override.
--
-- Adds `financing_override` to partner_analysis_versions so the
-- partner-facing deal spreadsheet (/portal/deals/[shareToken]) can
-- capture a custom total financing cost alongside the existing
-- arv_override, rehab_override, target_profit_override, and
-- days_held_override fields.
--
-- The column holds a total dollar amount (loan interest + origination
-- costs + anything else the partner rolls in) rather than a structured
-- loan record. Partners typically just want "my financing would cost X"
-- without re-modelling points/rate/LTV.
--
-- Existing rows: NULL means no override, same pattern as the other
-- override columns.

ALTER TABLE public.partner_analysis_versions
  ADD COLUMN financing_override numeric;

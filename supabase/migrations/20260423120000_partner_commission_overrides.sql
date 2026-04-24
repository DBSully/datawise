-- 2026-04-23 — Partner commission overrides.
--
-- Adds buyer/seller commission rate overrides to partner_analysis_versions
-- so partners can plug in their own RE commission assumptions on the
-- shared deal spreadsheet (/portal/deals/[shareToken]).
--
-- Stored as decimals (0.025 = 2.5%), matching the shape of
-- manual_analysis.disposition_commission_buyer_manual /
-- disposition_commission_seller_manual on the analyst side.
--
-- Title and other fixed closing costs are NOT partner-overridable —
-- those come straight from the FITCO matrix and aren't under negotiation.

ALTER TABLE public.partner_analysis_versions
  ADD COLUMN buyer_commission_pct_override numeric,
  ADD COLUMN seller_commission_pct_override numeric;

-- Per-analysis commission-rate overrides.
--
-- The Transaction Costs modal lets the analyst override the two
-- disposition commission rates (Buyer and Seller) on a per-deal basis.
-- Profile default is 2% / 2% (DENVER_FLIP_V1.transaction); override
-- wins when set. Stored as decimal fractions (0.02 = 2%) to match the
-- existing financing_*_manual columns.

alter table public.manual_analysis
  add column if not exists disposition_commission_buyer_manual numeric(6,4),
  add column if not exists disposition_commission_seller_manual numeric(6,4);

alter table public.manual_analysis
  add constraint chk_manual_analysis_disp_comm_buyer
    check (disposition_commission_buyer_manual is null
           or (disposition_commission_buyer_manual >= 0
               and disposition_commission_buyer_manual <= 1));

alter table public.manual_analysis
  add constraint chk_manual_analysis_disp_comm_seller
    check (disposition_commission_seller_manual is null
           or (disposition_commission_seller_manual >= 0
               and disposition_commission_seller_manual <= 1));

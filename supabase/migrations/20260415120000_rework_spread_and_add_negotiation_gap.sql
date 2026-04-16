-- Rework Spread semantics + add Negotiation Gap.
--
-- Old:  spread = list_price - max_offer  (negotiation distance)
-- New:  spread          = arv_aggregate - subject_list_price  (opportunity signal)
--       negotiation_gap = max_offer - subject_list_price      (negotiation room;
--                                                              positive = OK to offer above list)
--
-- est_gap_per_sqft already matches methodology (arv - list) / sqft — no change.

alter table public.screening_results
  add column if not exists negotiation_gap numeric(14,2);

-- Backfill existing rows. Only rows with a list price had a non-null spread;
-- those rows also have arv_aggregate and max_offer populated when screening
-- completed successfully. Rows lacking any input stay null.
update public.screening_results
   set spread          = arv_aggregate - subject_list_price,
       negotiation_gap = max_offer     - subject_list_price
 where subject_list_price is not null
   and arv_aggregate     is not null
   and max_offer         is not null;

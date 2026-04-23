-- FITCO/Chicago Title rate matrix — backfill screening_results.
--
-- The transaction engine was replaced on 2026-04-22 (per the FITCO
-- Resale Rate Sheet for CT Zone 1 — Adams, Arapahoe, Broomfield,
-- Clear Creek, Denver, Douglas, Elbert, Gilpin, Jefferson counties).
--
-- Old formula (0.003×list + 0.0047×arv + 0.04×arv):
--   acquisition title = 0.3% × list_price
--   disposition title = 0.47% × arv
--   commissions       = 2% + 2% × arv
--
-- New formula:
--   acquisition title = Bundled Concurrent Loan Rate(loan_amount matrix)
--                       + $180 + $150 + $43 + $25 + $5.25
--   disposition title = 65% × Owner's Title Premium Basic Rate(arv matrix)
--                       + $180 + $95 + $25
--   commissions       = 2% + 2% × arv   (unchanged)
--
-- Acquisition commission rate and flat fee are still 0 in DENVER_FLIP_V1
-- so they drop out of the formula. See lib/screening/title-matrix.ts
-- for the canonical TS implementation — the SQL functions below mirror
-- that logic exactly.

-- ---------------------------------------------------------------------------
-- Matrix lookup functions (immutable, usable in expressions/indexes).
-- ---------------------------------------------------------------------------

create or replace function public.fitco_bundled_loan_rate(loan_amount numeric)
returns numeric
language sql
immutable
as $$
  -- Round UP to next $50k tier (industry convention). Tier boundaries are
  -- consolidated into range checks since every $50k step within a range
  -- returns the same rate.
  select case
    when loan_amount is null or loan_amount <= 0 then 400
    when loan_amount <= 100000 then 400
    when loan_amount <= 300000 then 475
    when loan_amount <= 500000 then 575
    when loan_amount <= 1000000 then 625
    else 900  -- flat above $1M per analyst decision 2026-04-22
  end::numeric;
$$;

create or replace function public.fitco_owner_title_premium_basic(policy_amount numeric)
returns numeric
language plpgsql
immutable
as $$
declare
  tier integer;
begin
  if policy_amount is null or policy_amount <= 0 then
    return 1258;
  end if;
  -- Round UP to next $50k tier, floor at $100k.
  tier := greatest(100000, ceiling(policy_amount / 50000) * 50000)::integer;
  if tier > 1000000 then
    -- Extend +$100 per $50k tier above $1M (matches published slope
    -- from $550k to $1M).
    return 2993 + 100 * ((tier - 1000000) / 50000);
  end if;
  return case tier
    when 100000  then 1258
    when 150000  then 1351
    when 200000  then 1443
    when 250000  then 1536
    when 300000  then 1628
    when 350000  then 1721
    when 400000  then 1813
    when 450000  then 1906
    when 500000  then 1998
    when 550000  then 2093
    when 600000  then 2193
    when 650000  then 2293
    when 700000  then 2393
    when 750000  then 2493
    when 800000  then 2593
    when 850000  then 2693
    when 900000  then 2793
    when 950000  then 2893
    when 1000000 then 2993
    else 2993
  end::numeric;
end;
$$;

-- ---------------------------------------------------------------------------
-- Backfill — one pass over screening_results.
--
-- Initial attempt split the work into three separate UPDATEs and hit
-- Supabase's default 2-minute statement timeout on the second scan. The
-- single-pass form below computes the new transaction_total inline and
-- derives max_offer / offer_pct / negotiation_gap from it in the same
-- statement, so the planner only scans the table once. Statement
-- timeout is bumped transaction-scope to be safe on large tables.
--
-- Pricing breakdown:
--   acquisition title     = bundled_loan_rate + 403     (rounded from 403.25)
--   disposition title     = round(basic × 0.65) + 300
--   commissions           = 2 × round(arv × 0.02)
-- acquisitionCommission and acquisitionFee are 0 in DENVER_FLIP_V1.
-- ---------------------------------------------------------------------------

set local statement_timeout = '15min';

with recomputed as (
  select
    id,
    round(public.fitco_bundled_loan_rate(financing_loan_amount) + 403.25)
      + round(public.fitco_owner_title_premium_basic(arv_aggregate) * 0.65)
      + 300
      + 2 * round(arv_aggregate * 0.02) as new_transaction_total
  from public.screening_results
  where arv_aggregate is not null
    and screening_status = 'screened'
)
update public.screening_results sr
set transaction_total = r.new_transaction_total,
    max_offer = round(
          coalesce(sr.arv_aggregate, 0)
        - coalesce(sr.rehab_total, 0)
        - coalesce(sr.hold_total, 0)
        - r.new_transaction_total
        - coalesce(sr.financing_total, 0)
        - coalesce(sr.target_profit, 0)
      ),
    offer_pct = case
                  when sr.subject_list_price is null
                    or sr.subject_list_price = 0 then null
                  else round(
                    (coalesce(sr.arv_aggregate, 0)
                      - coalesce(sr.rehab_total, 0)
                      - coalesce(sr.hold_total, 0)
                      - r.new_transaction_total
                      - coalesce(sr.financing_total, 0)
                      - coalesce(sr.target_profit, 0))
                    / sr.subject_list_price, 4)
                end,
    negotiation_gap = case
                        when sr.subject_list_price is null then null
                        else round(
                          (coalesce(sr.arv_aggregate, 0)
                            - coalesce(sr.rehab_total, 0)
                            - coalesce(sr.hold_total, 0)
                            - r.new_transaction_total
                            - coalesce(sr.financing_total, 0)
                            - coalesce(sr.target_profit, 0))
                          - sr.subject_list_price)
                      end
from recomputed r
where sr.id = r.id;

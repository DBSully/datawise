-- Add financing cost columns to screening_results
alter table public.screening_results
  add column if not exists financing_total numeric(14,2),
  add column if not exists financing_interest numeric(14,2),
  add column if not exists financing_origination numeric(14,2),
  add column if not exists financing_loan_amount numeric(14,2),
  add column if not exists financing_detail_json jsonb;

-- Add financing override columns to manual_analysis
alter table public.manual_analysis
  add column if not exists financing_rate_manual numeric(6,4),
  add column if not exists financing_points_manual numeric(6,4),
  add column if not exists financing_ltv_manual numeric(6,4);

-- Constraints: rates must be between 0 and 1 (percentages as decimals)
alter table public.manual_analysis
  add constraint chk_manual_analysis_financing_rate
    check (financing_rate_manual is null or (financing_rate_manual >= 0 and financing_rate_manual <= 1));

alter table public.manual_analysis
  add constraint chk_manual_analysis_financing_points
    check (financing_points_manual is null or (financing_points_manual >= 0 and financing_points_manual <= 0.2));

alter table public.manual_analysis
  add constraint chk_manual_analysis_financing_ltv
    check (financing_ltv_manual is null or (financing_ltv_manual >= 0 and financing_ltv_manual <= 1));

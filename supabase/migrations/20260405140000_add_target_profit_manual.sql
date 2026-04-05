-- Add target_profit_manual override to manual_analysis
alter table public.manual_analysis
  add column if not exists target_profit_manual numeric(14,2);

alter table public.manual_analysis
  add constraint chk_manual_analysis_target_profit_manual
    check (target_profit_manual is null or target_profit_manual >= 0);

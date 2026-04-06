-- Add rehab_scope column to manual_analysis for scope tier selection
-- Valid values: cosmetic, moderate, heavy, gut (null = moderate default)
alter table public.manual_analysis
  add column if not exists rehab_scope text;

alter table public.manual_analysis
  add constraint chk_manual_analysis_rehab_scope
    check (rehab_scope is null or rehab_scope in ('cosmetic', 'moderate', 'heavy', 'gut'));

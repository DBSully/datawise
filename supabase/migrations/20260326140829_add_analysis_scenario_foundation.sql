-- Safe whether or not earlier draft foundations were partially applied
drop index if exists public.ux_analyses_one_active_per_user_property;

alter table public.analyses
  add column if not exists created_by_user_id uuid references auth.users(id) on delete set null,
  add column if not exists scenario_name text,
  add column if not exists strategy_type text,
  add column if not exists status text,
  add column if not exists is_archived boolean not null default false;

create index if not exists ix_analyses_real_property_id
  on public.analyses (real_property_id);

create index if not exists ix_analyses_created_by_user_id
  on public.analyses (created_by_user_id);

create index if not exists ix_analyses_property_user
  on public.analyses (real_property_id, created_by_user_id);

create index if not exists ix_analyses_strategy_type
  on public.analyses (strategy_type);

create index if not exists ix_analyses_status
  on public.analyses (status);

alter table public.valuation_runs
  add column if not exists analysis_id uuid references public.analyses(id) on delete cascade;

create index if not exists ix_valuation_runs_analysis_id
  on public.valuation_runs (analysis_id);

create index if not exists ix_valuation_runs_subject_analysis_created
  on public.valuation_runs (subject_real_property_id, analysis_id, created_at desc);
-- Screening pipeline tables: batch runs and per-property screening results
-- These are lightweight screening records, NOT full analyses.

begin;

-- ---------------------------------------------------------------------------
-- screening_batches: one row per screening run
-- ---------------------------------------------------------------------------

create table if not exists public.screening_batches (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  trigger_type text not null default 'manual',
  source_import_batch_id uuid references public.import_batches(id) on delete set null,
  strategy_profile_slug text not null,
  status text not null default 'pending',
  subject_filter_json jsonb not null default '{}'::jsonb,
  total_subjects integer not null default 0,
  screened_count integer not null default 0,
  qualified_count integer not null default 0,
  prime_candidate_count integer not null default 0,
  summary_json jsonb,
  created_by_user_id uuid,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.screening_batches is
  'Tracks batch screening runs. Each batch screens a set of properties through the full deal pipeline.';

create index if not exists ix_screening_batches_status
  on public.screening_batches (status);

create index if not exists ix_screening_batches_trigger_type
  on public.screening_batches (trigger_type);

create index if not exists ix_screening_batches_source_import
  on public.screening_batches (source_import_batch_id);

create index if not exists ix_screening_batches_created_at
  on public.screening_batches (created_at desc);

-- ---------------------------------------------------------------------------
-- screening_results: one row per screened property per batch
-- ---------------------------------------------------------------------------

create table if not exists public.screening_results (
  id uuid primary key default gen_random_uuid(),
  screening_batch_id uuid not null references public.screening_batches(id) on delete cascade,
  real_property_id uuid not null references public.real_properties(id) on delete cascade,
  listing_row_id uuid references public.mls_listings(id) on delete set null,
  comp_search_run_id uuid references public.comparable_search_runs(id) on delete set null,

  -- Subject snapshot (denormalized for fast dashboard reads)
  subject_address text,
  subject_city text,
  subject_property_type text,
  subject_list_price numeric(14,2),
  subject_building_sqft numeric(10,2),
  subject_above_grade_sqft numeric(10,2),
  subject_below_grade_total_sqft numeric(10,2),
  subject_below_grade_finished_sqft numeric(10,2),
  subject_year_built integer,

  -- ARV outputs
  arv_aggregate numeric(14,2),
  arv_per_sqft numeric(10,2),
  arv_comp_count integer,
  arv_detail_json jsonb,

  -- Rehab outputs
  rehab_total numeric(14,2),
  rehab_above_grade numeric(14,2),
  rehab_below_finished numeric(14,2),
  rehab_below_unfinished numeric(14,2),
  rehab_exterior numeric(14,2),
  rehab_landscaping numeric(14,2),
  rehab_systems numeric(14,2),
  rehab_composite_multiplier numeric(8,4),
  rehab_detail_json jsonb,

  -- Holding cost outputs
  hold_total numeric(14,2),
  hold_days integer,

  -- Transaction cost outputs
  transaction_total numeric(14,2),

  -- Deal math
  target_profit numeric(14,2),
  max_offer numeric(14,2),
  est_gap_per_sqft numeric(10,2),
  spread numeric(14,2),
  offer_pct numeric(8,4),

  -- Qualification
  is_prime_candidate boolean not null default false,
  qualification_json jsonb,

  -- Status
  screening_status text not null default 'screened',
  error_message text,

  -- Promotion to full analysis
  promoted_analysis_id uuid references public.analyses(id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint ux_screening_results_batch_property
    unique (screening_batch_id, real_property_id)
);

comment on table public.screening_results is
  'Per-property screening results with full deal math. Lightweight records that can be promoted to full analyses.';

-- Dashboard / ranking indexes
create index if not exists ix_screening_results_batch_id
  on public.screening_results (screening_batch_id);

create index if not exists ix_screening_results_property_id
  on public.screening_results (real_property_id);

create index if not exists ix_screening_results_prime
  on public.screening_results (screening_batch_id, is_prime_candidate)
  where is_prime_candidate = true;

create index if not exists ix_screening_results_gap_desc
  on public.screening_results (screening_batch_id, est_gap_per_sqft desc nulls last);

create index if not exists ix_screening_results_offer_desc
  on public.screening_results (screening_batch_id, max_offer desc nulls last);

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

drop trigger if exists trg_screening_batches_updated_at
on public.screening_batches;

create trigger trg_screening_batches_updated_at
before update on public.screening_batches
for each row
execute function public.set_row_updated_at();

drop trigger if exists trg_screening_results_updated_at
on public.screening_results;

create trigger trg_screening_results_updated_at
before update on public.screening_results
for each row
execute function public.set_row_updated_at();

-- ---------------------------------------------------------------------------
-- RLS (dev authenticated full access, matching existing pattern)
-- ---------------------------------------------------------------------------

alter table public.screening_batches enable row level security;
alter table public.screening_results enable row level security;

drop policy if exists "dev authenticated full access screening_batches"
on public.screening_batches;

create policy "dev authenticated full access screening_batches"
on public.screening_batches
for all
to authenticated
using (true)
with check (true);

drop policy if exists "dev authenticated full access screening_results"
on public.screening_results;

create policy "dev authenticated full access screening_results"
on public.screening_results
for all
to authenticated
using (true)
with check (true);

commit;

-- 20260324_create_mls_and_import_tables.sql

create table if not exists public.import_batches (
  id uuid primary key default gen_random_uuid(),
  source_system text not null,
  import_profile text not null,
  file_name text not null,
  uploaded_by_user_id uuid,
  row_count integer,
  status text not null default 'pending',
  summary jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists ix_import_batches_source_system_created_at
  on public.import_batches (source_system, created_at desc);

alter table public.import_batches enable row level security;

create table if not exists public.import_batch_rows (
  id uuid primary key default gen_random_uuid(),
  import_batch_id uuid not null
    references public.import_batches(id)
    on delete cascade,
  row_number integer not null,
  source_system text not null,
  source_record_key text,
  raw_row jsonb not null,
  processing_status text not null default 'pending',
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists ix_import_batch_rows_import_batch_id
  on public.import_batch_rows (import_batch_id);

create index if not exists ix_import_batch_rows_source_record_key
  on public.import_batch_rows (source_record_key);

alter table public.import_batch_rows enable row level security;

create table if not exists public.mls_listings (
  id uuid primary key default gen_random_uuid(),

  source_system text not null,
  listing_id text not null,
  real_property_id uuid
    references public.real_properties(id)
    on delete set null,

  mls_status text,
  mls_major_change_type text,
  property_condition_source text,

  original_list_price numeric(12,2),
  list_price numeric(12,2),
  close_price numeric(12,2),
  concessions_amount numeric(12,2),

  listing_contract_date date,
  purchase_contract_date date,
  close_date date,

  subdivision_name text,
  ownership_raw text,
  occupant_type text,
  elementary_school text,

  list_agent_mls_id text,
  buyer_agent_mls_id text,

  last_import_batch_id uuid
    references public.import_batches(id)
    on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint ux_mls_listings_source_system_listing_id
    unique (source_system, listing_id),

  constraint chk_mls_listings_original_list_price
    check (original_list_price is null or original_list_price >= 0),

  constraint chk_mls_listings_list_price
    check (list_price is null or list_price >= 0),

  constraint chk_mls_listings_close_price
    check (close_price is null or close_price >= 0),

  constraint chk_mls_listings_concessions_amount
    check (concessions_amount is null or concessions_amount >= 0)
);

create index if not exists ix_mls_listings_real_property_id
  on public.mls_listings (real_property_id);

create index if not exists ix_mls_listings_mls_status
  on public.mls_listings (mls_status);

create index if not exists ix_mls_listings_listing_contract_date
  on public.mls_listings (listing_contract_date);

create index if not exists ix_mls_listings_close_date
  on public.mls_listings (close_date);

alter table public.mls_listings enable row level security;

drop trigger if exists trg_mls_listings_updated_at
on public.mls_listings;

create trigger trg_mls_listings_updated_at
before update on public.mls_listings
for each row
execute function public.set_row_updated_at();

-- TEMPORARY DEVELOPMENT POLICIES

create policy "dev authenticated full access property_financials"
on public.property_financials
for all
to authenticated
using (true)
with check (true);

create policy "dev authenticated full access import_batches"
on public.import_batches
for all
to authenticated
using (true)
with check (true);

create policy "dev authenticated full access import_batch_rows"
on public.import_batch_rows
for all
to authenticated
using (true)
with check (true);

create policy "dev authenticated full access mls_listings"
on public.mls_listings
for all
to authenticated
using (true)
with check (true);
